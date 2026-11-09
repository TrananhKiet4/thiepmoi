<?php

namespace App\Services;

use App\Support\Api;
use Aws\S3\S3Client;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

final class TransferStorage
{
    public const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    public const FONT = 'invitation-assets/fonts/fz-alpha-brights-b89b193c.otf';

    private const TEMPORARY_KEY = '~\A[a-f0-9-]{36}/[a-f0-9-]{36}/(?:source\.bin|export\.xlsx)\z~';

    private ?S3Client $client = null;

    public function direct(): bool
    {
        return config('invitation.storage.driver') === 's3';
    }

    private function s3(): S3Client
    {
        $storage = config('invitation.storage');
        return $this->client ??= new S3Client(array_filter([
            'version' => 'latest',
            'region' => $storage['region'] ?: 'auto',
            'endpoint' => $storage['endpoint'] ?: null,
            'credentials' => ['key' => $storage['access_key'], 'secret' => $storage['secret_key']],
            'use_path_style_endpoint' => true,
            'request_checksum_calculation' => 'when_required',
            'response_checksum_validation' => 'when_required',
            'retries' => 1,
            'http' => ['connect_timeout' => 5, 'timeout' => 15, 'allow_redirects' => false],
        ], static fn ($value) => $value !== null));
    }

    private function parameters(string $key): array
    {
        return ['Bucket' => config('invitation.storage.bucket'), 'Key' => $key];
    }

    private function presign(string $method, string $key, string $lifetime, array $options = []): string
    {
        $client = $this->s3();
        $command = $client->getCommand($method, $this->parameters($key) + $options);

        return (string) $client->createPresignedRequest($command, $lifetime)->getUri();
    }

    public function createUpload(string $adminId, string $eventId, string $name, int $bytes): array
    {
        if (!$this->direct()) {
            return ['mode' => 'multipart'];
        }
        $id = (string) Str::uuid();
        $key = "$eventId/$id/source.bin";
        $type = 'application/octet-stream';
        $url = DB::transaction(function () use ($adminId, $eventId, $id, $key, $name, $bytes, $type) {
            DB::table('AdminUser')->where('id', $adminId)->lockForUpdate()->first();
            $now = Api::now();
            $count = DB::table('TemporaryObject')->where('adminId', $adminId)
                ->whereIn('purpose', ['MEDIA', 'IMPORT'])
                ->where(fn ($query) => $query->where('uploadExpiresAt', '>', $now)
                    ->orWhere(fn ($query) => $query->whereNull('claimedAt')->where('expiresAt', '>', $now)))
                ->count();
            if ($count >= 20) {
                Api::fail(429, 'UPLOAD_LIMIT', 'Đã đạt giới hạn 20 lượt tải còn hiệu lực; vui lòng thử lại sau');
            }
            $url = $this->presign('PutObject', $key, '+5 minutes', ['ContentLength' => $bytes, 'ContentType' => $type]);
            DB::table('TemporaryObject')->insert([
                'id' => $id, 'adminId' => $adminId, 'eventId' => $eventId, 'purpose' => 'IMPORT',
                'storageKey' => $key, 'originalName' => preg_replace('~[\x00-\x1f\x7f\\\\/]~', '_', $name), 'bytes' => $bytes,
                'uploadExpiresAt' => now('UTC')->addMinutes(5)->format('Y-m-d H:i:s.v'),
                'expiresAt' => now('UTC')->addMinutes(30)->format('Y-m-d H:i:s.v'),
            ]);

            return $url;
        });

        return ['mode' => 'direct', 'uploadId' => $id, 'url' => $url, 'headers' => ['Content-Type' => $type]];
    }

    public function readUpload(string $adminId, string $eventId, string $id, bool $claim): string
    {
        $object = DB::table('TemporaryObject')->where([
            'id' => $id, 'adminId' => $adminId, 'eventId' => $eventId, 'purpose' => 'IMPORT',
        ])->first();
        if (!$object) {
            Api::fail(404, 'UPLOAD_NOT_FOUND', 'Không tìm thấy file tải lên');
        }
        $now = Api::now();
        if ($object->claimedAt !== null || $object->expiresAt <= $now) {
            $this->expired();
        }
        $size = (int) $object->bytes;
        if ($size <= 0 || $size > ExcelTransfers::MAX_BYTES) {
            Api::fail(413, 'UPLOAD_LIMIT', 'File vượt giới hạn');
        }
        if ($claim && !DB::table('TemporaryObject')->where('id', $object->id)->whereNull('claimedAt')
            ->where('expiresAt', '>', $now)->update(['claimedAt' => $now])) {
            $this->expired();
        }
        $key = $object->storageKey;
        try {
            self::assertTemporaryKey($key);
            $storedSize = $this->direct()
                ? (int) $this->s3()->headObject($this->parameters($key))['ContentLength']
                : @filesize($this->localPath($key));
            $bytes = $storedSize === $size ? $this->read($key, $size) : null;
        } catch (Throwable $e) {
            if ($claim) {
                $this->discardUpload($object->id);
            }
            Api::fail(409, 'UPLOAD_NOT_READY', 'Chưa đọc được file tải lên; vui lòng tải lại');
        }
        if ($bytes === null || strlen($bytes) !== $size) {
            if ($claim) {
                $this->discardUpload($object->id);
            }
            Api::fail(413, 'UPLOAD_SIZE', 'Kích thước file không khớp; vui lòng tải lại');
        }

        return $bytes;
    }

    private function expired(): never
    {
        Api::fail(409, 'UPLOAD_EXPIRED', 'File đã xử lý hoặc hết hạn; vui lòng tải lại');
    }

    public function discardUpload(string $id): void
    {
        try {
            $key = DB::table('TemporaryObject')->where('id', $id)->where('purpose', 'IMPORT')->value('storageKey');
            if ($key !== null) {
                $this->delete($key);
            }
        } catch (Throwable $e) {
            Log::warning('Temporary import source will be removed by maintenance.');
        }
    }

    public function createExport(string $adminId, string $eventId, string $bytes, string $name): string
    {
        $id = (string) Str::uuid();
        $key = "$eventId/$id/export.xlsx";
        $now = Api::now();
        DB::table('TemporaryObject')->insert([
            'id' => $id, 'adminId' => $adminId, 'eventId' => $eventId, 'purpose' => 'EXPORT',
            'storageKey' => $key, 'originalName' => $name, 'bytes' => strlen($bytes),
            'claimedAt' => $now, 'uploadExpiresAt' => $now, 'expiresAt' => now('UTC')->addMinutes(10)->format('Y-m-d H:i:s.v'),
        ]);
        $this->s3()->putObject($this->parameters($key) + [
            'Body' => $bytes, 'ContentType' => self::XLSX, 'CacheControl' => 'private, no-store',
        ]);

        return $this->presign('GetObject', $key, '+1 minute', [
            'ResponseCacheControl' => 'private, no-store', 'ResponseContentDisposition' => 'attachment; filename="'.$name.'"',
        ]);
    }

    public function assetUrl(string $key): string
    {
        return $this->presign('GetObject', $key, '+1 hour');
    }

    public function font(): string
    {
        return $this->read(self::FONT, 100_000);
    }

    private function read(string $key, int $limit): string
    {
        if (!$this->direct()) {
            $bytes = file_get_contents($this->localPath($key), false, null, 0, $limit + 1);
            if ($bytes === false || strlen($bytes) > $limit) {
                throw new RuntimeException('File vượt giới hạn');
            }

            return $bytes;
        }
        $object = $this->s3()->getObject($this->parameters($key) + [
            'Range' => 'bytes=0-'.$limit,
            '@http' => ['stream' => true],
        ]);
        $stream = $object['Body'];
        try {
            $bytes = '';
            while (!$stream->eof()) {
                $chunk = $stream->read(min(8192, $limit + 1 - strlen($bytes)));
                if ($chunk === '' && !$stream->eof()) {
                    throw new RuntimeException('Không đọc được file lưu trữ');
                }
                $bytes .= $chunk;
                if (strlen($bytes) > $limit) {
                    throw new RuntimeException('File vượt giới hạn');
                }
            }

            return $bytes;
        } finally {
            $stream->close();
        }
    }

    private static function assertTemporaryKey(string $key): void
    {
        if (!preg_match(self::TEMPORARY_KEY, $key)) {
            throw new InvalidArgumentException('Storage key không hợp lệ');
        }
    }

    private function localPath(string $key): string
    {
        self::assertTemporaryKey($key);
        return rtrim((string) config('invitation.storage.local_path', base_path('.data/media')), '/\\').'/private/'.$key;
    }

    private function delete(string $key): void
    {
        self::assertTemporaryKey($key);
        if ($this->direct()) {
            $this->s3()->deleteObject($this->parameters($key));
            return;
        }
        $path = $this->localPath($key);
        if (file_exists($path) && !@unlink($path) && file_exists($path)) {
            throw new RuntimeException('Không xóa được file tạm');
        }
    }

    public function cleanup(): array
    {
        $objects = DB::table('TemporaryObject')->where('expiresAt', '<', Api::now())
            ->where('uploadExpiresAt', '<', now('UTC')->subMinute()->format('Y-m-d H:i:s.v'))
            ->orderBy('expiresAt')->limit(100)->get();
        $deleted = $failed = 0;
        $deadline = microtime(true) + 20;
        foreach ($objects as $object) {
            if (microtime(true) > $deadline) {
                break;
            }
            try {
                $this->delete($object->storageKey);
                $deleted += DB::table('TemporaryObject')->where('id', $object->id)->delete();
            } catch (Throwable $e) {
                $failed++;
            }
        }

        return compact('deleted', 'failed');
    }
}
