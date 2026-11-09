<?php

namespace App\Http\Controllers;

use App\Services\AdminInvitations;
use App\Services\ExcelTransfers;
use App\Services\TransferStorage;
use App\Support\Api;
use App\Support\ApiException;
use App\Support\InvitationTokens;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use InvalidArgumentException;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

final class TransferController
{
    public function __construct(private readonly TransferStorage $storage) {}

    public function upload(Request $request, string $id): JsonResponse
    {
        $event = Api::event($request, AdminInvitations::uuid($id, 'id'));
        $body = $this->json($request, ['purpose', 'name', 'bytes']);
        AdminInvitations::choice($body['purpose'] ?? null, ['IMPORT'], 'purpose');
        $name = AdminInvitations::text($body['name'] ?? null, 255, 'name', 1, trim: false);
        if (!str_ends_with(strtolower($name), '.xlsx')) {
            AdminInvitations::invalid('name', 'Định dạng file không hợp lệ');
        }
        $size = AdminInvitations::integer($body['bytes'] ?? null, 'bytes', 1, ExcelTransfers::MAX_BYTES);

        return Api::ok($this->storage->createUpload($request->attributes->get('admin')->id, $event->id, $name, $size));
    }

    public function storyImage(Request $request, string $id): JsonResponse
    {
        $event = Api::event($request, AdminInvitations::uuid($id));
        $file = $request->file('file');
        if (!$file instanceof UploadedFile || !$file->isValid()) {
            Api::fail(422, 'INVALID_IMAGE', 'Vui lòng chọn ảnh JPG, PNG hoặc WebP');
        }
        if ($file->getSize() > 5 * 1024 * 1024) {
            Api::fail(413, 'IMAGE_TOO_LARGE', 'Ảnh tối đa 5 MB');
        }
        $info = @getimagesize($file->getPathname());
        if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)
            || $info[0] * $info[1] > 16_000_000 || max($info[0], $info[1]) > 8192) {
            Api::fail(422, 'INVALID_IMAGE', 'Ảnh phải là JPG, PNG hoặc WebP, tối đa 16 megapixel');
        }
        if (!function_exists('imagewebp')) {
            Api::fail(503, 'IMAGE_UNAVAILABLE', 'Hosting chưa bật xử lý ảnh WebP');
        }
        $image = @imagecreatefromstring(file_get_contents($file->getPathname()));
        if (!$image) {
            Api::fail(422, 'INVALID_IMAGE', 'Không đọc được ảnh đã chọn');
        }
        $orientation = $info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')
            ? (int) ((@exif_read_data($file->getPathname()))['Orientation'] ?? 1) : 1;
        $angle = match ($orientation) { 3, 4 => 180, 5, 6 => 270, 7, 8 => 90, default => 0 };
        if ($angle) {
            $rotated = imagerotate($image, $angle, 0);
            imagedestroy($image);
            $image = $rotated;
        }
        if (in_array($orientation, [2, 4, 5, 7], true)) {
            imageflip($image, IMG_FLIP_HORIZONTAL);
        }
        $scale = min(1, 1600 / max(imagesx($image), imagesy($image)));
        $width = max(1, (int) round(imagesx($image) * $scale));
        $height = max(1, (int) round(imagesy($image) * $scale));
        $output = imagecreatetruecolor($width, $height);
        imagealphablending($output, false);
        imagesavealpha($output, true);
        imagecopyresampled($output, $image, 0, 0, 0, 0, $width, $height, imagesx($image), imagesy($image));
        imagedestroy($image);
        $url = '/invitation-assets/story/'.$event->id.'/'.Str::uuid().'.webp';
        $target = public_path(ltrim($url, '/'));
        $temporary = $target.'.tmp';
        try {
            if (!is_dir(dirname($target)) && !mkdir(dirname($target), 0755, true) && !is_dir(dirname($target))) {
                throw new RuntimeException('Cannot create story image directory');
            }
            if (!imagewebp($output, $temporary, 82) || !rename($temporary, $target)) {
                throw new RuntimeException('Cannot store story image');
            }
        } finally {
            imagedestroy($output);
            if (is_file($temporary)) {
                unlink($temporary);
            }
        }

        return Api::ok(compact('url', 'width', 'height'), 201);
    }

    public function template(Request $request): Response
    {
        $book = $this->workbook();
        ExcelTransfers::textSheet($book, 'Khách mời', array_keys(ExcelTransfers::COLUMNS), [
            ['DEMO001', 'Khách mẫu', 'Bạn mẫu', 'ban_be', 'Bạn', 'Hẹn gặp bạn trong ngày tốt nghiệp!', 'demo@example.com', '0123456789'],
        ]);

        return $this->download($request, $book, 'mau-khach-moi.xlsx');
    }

    public function inspect(Request $request, string $id): JsonResponse
    {
        $event = Api::event($request, AdminInvitations::uuid($id, 'id'));
        [$bytes] = $this->uploadBytes($request, $event->id, false);
        try {
            return Api::ok(ExcelTransfers::inspect($bytes));
        } catch (InvalidArgumentException $e) {
            Api::fail(422, 'INVALID_XLSX', $e->getMessage());
        } catch (Throwable) {
            Api::fail(422, 'INVALID_XLSX', 'Không đọc được XLSX');
        }
    }

    public function preview(Request $request, string $id): JsonResponse
    {
        $event = Api::event($request, AdminInvitations::uuid($id, 'id'));
        [$bytes, $body, $uploadId] = $this->uploadBytes($request, $event->id, true);
        try {
            try {
                $payload = ExcelTransfers::preview($bytes, $body['sheet'] ?? null, $body['mapping'] ?? null);
            } catch (InvalidArgumentException $e) {
                Api::fail(422, 'INVALID_XLSX', $e->getMessage());
            } catch (Throwable) {
                Api::fail(422, 'INVALID_XLSX', 'Không đọc được XLSX');
            }
            $payload['sheet'] = $body['sheet'];
            $guests = DB::table('Guest')->where('eventId', $event->id)
                ->whereIn('guestCode', array_column(array_column($payload['rows'], 'values'), 'guestCode'))->get()->keyBy('guestCode');
            $invitations = DB::table('Invitation')->whereIn('guestId', $guests->pluck('id'))->get()->keyBy('guestId');
            $summary = [
                'created' => 0, 'updated' => 0, 'unchanged' => 0,
                'errors' => count($payload['errors']), 'warnings' => count($payload['warnings']),
            ];
            foreach ($payload['rows'] as &$row) {
                $guest = $guests->get($row['values']['guestCode']);
                if (!$guest) {
                    $row['action'] = 'CREATE';
                    $summary['created']++;
                    continue;
                }
                $invitation = $invitations->get($guest->id);
                if (!$invitation) {
                    Api::fail(409, 'INVALID_GUEST', 'Khách hiện có chưa có thiệp');
                }
                $row += [
                    'guestId' => $guest->id, 'invitationId' => $invitation->id,
                    'expectedGuestVersion' => (int) $guest->version, 'expectedInvitationVersion' => (int) $invitation->version,
                ];
                [$guestChanges, $invitationChanges] = $this->changes($row['values'], $guest, $invitation);
                $changed = $guestChanges || $invitationChanges;
                $row['action'] = $changed ? 'UPDATE' : 'UNCHANGED';
                $summary[$changed ? 'updated' : 'unchanged']++;
            }
            unset($row);
            $batch = [
                'id' => (string) Str::uuid(), 'eventId' => $event->id, 'createdBy' => $request->attributes->get('admin')->id,
                'fileHash' => hash('sha256', $bytes), 'mappingJson' => is_string($body['mapping']) ? $body['mapping'] : json_encode($body['mapping'], JSON_THROW_ON_ERROR),
                'normalizedRowsJson' => json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                'summaryJson' => json_encode($summary, JSON_THROW_ON_ERROR), 'status' => 'PREVIEWED',
                'expiresAt' => now('UTC')->addDay()->format('Y-m-d H:i:s.v'),
            ];
            DB::table('ImportBatch')->insert($batch);

            return Api::ok($this->viewBatch((object) $batch, 1), 201);
        } finally {
            if ($uploadId !== null) {
                $this->storage->discardUpload($uploadId);
            }
        }
    }

    public function batch(Request $request, string $id): JsonResponse
    {
        $batch = $this->ownedBatch($request, AdminInvitations::uuid($id, 'id'));
        $page = $request->query('page', 1);
        if (!is_numeric($page)) {
            AdminInvitations::invalid('page');
        }

        return Api::ok($this->viewBatch($batch, AdminInvitations::integer((float) $page, 'page', 1, 100000)));
    }

    public function report(Request $request, string $id): Response
    {
        $batch = $this->ownedBatch($request, AdminInvitations::uuid($id, 'id'));
        $payload = json_decode($batch->normalizedRowsJson, true, flags: JSON_THROW_ON_ERROR);
        $book = $this->workbook();
        $headers = ['sheet', 'row', 'column', 'message'];
        foreach (['errors' => 'Lỗi', 'warnings' => 'Cảnh báo'] as $key => $title) {
            ExcelTransfers::textSheet($book, $title, $headers, array_map(
                fn ($row) => [$payload['sheet'], $row['row'], $row['column'], $row['message']],
                $payload[$key],
            ));
        }

        return $this->download($request, $book, 'bao-cao-nhap.xlsx', $batch->eventId);
    }

    public function commit(Request $request, string $id): JsonResponse
    {
        $id = AdminInvitations::uuid($id, 'id');
        $this->json($request, []);
        $batch = $this->ownedBatch($request, $id);
        $actorHash = InvitationTokens::hash($request->attributes->get('admin')->id);
        $result = Api::idempotent($request, 'import:commit', $actorHash, ['batchId' => $id], function () use ($request, $id, $batch) {
            Api::lockEvent($batch->eventId);
            $batch = $this->ownedBatch($request, $id, true);
            if ($batch->status === 'COMMITTED') {
                return json_decode($batch->resultJson, true, flags: JSON_THROW_ON_ERROR);
            }
            if ($batch->expiresAt <= Api::now()) {
                Api::fail(409, 'IMPORT_EXPIRED', 'Bản xem trước đã hết hạn; vui lòng nhập lại');
            }
            $payload = json_decode($batch->normalizedRowsJson, true, flags: JSON_THROW_ON_ERROR);
            if ($payload['errors']) {
                Api::fail(422, 'IMPORT_HAS_ERRORS', 'Phải sửa toàn bộ dòng lỗi trước khi nhập');
            }
            $counts = ['created' => 0, 'updated' => 0, 'unchanged' => 0];
            foreach ($payload['rows'] as $row) {
                $values = $row['values'];
                $guest = DB::table('Guest')->where('eventId', $batch->eventId)->where('guestCode', $values['guestCode'])->lockForUpdate()->first();
                if (!isset($row['guestId'])) {
                    if ($guest) {
                        Api::fail(409, 'IMPORT_STALE', 'Danh sách khách đã thay đổi; vui lòng xem trước lại');
                    }
                    $this->insertGuest($batch->eventId, $values);
                    $counts['created']++;
                    continue;
                }
                $invitation = $guest ? DB::table('Invitation')->where('guestId', $guest->id)->lockForUpdate()->first() : null;
                if (!$guest || $guest->id !== $row['guestId'] || (int) $guest->version !== $row['expectedGuestVersion']
                    || !$invitation || $invitation->id !== $row['invitationId'] || (int) $invitation->version !== $row['expectedInvitationVersion']) {
                    Api::fail(409, 'IMPORT_STALE', 'Khách hoặc thiệp đã thay đổi; vui lòng xem trước lại');
                }
                [$guestChanges, $invitationChanges] = $this->changes($values, $guest, $invitation);
                $now = Api::now();
                if ($guestChanges) {
                    DB::table('Guest')->where('id', $guest->id)->increment('version', 1, $guestChanges + ['updatedAt' => $now]);
                }
                if ($invitationChanges) {
                    DB::table('Invitation')->where('id', $invitation->id)->increment('version', 1, $invitationChanges + ['updatedAt' => $now]);
                }
                $counts[$guestChanges || $invitationChanges ? 'updated' : 'unchanged']++;
            }
            DB::table('ImportBatch')->where('id', $id)->update([
                'status' => 'COMMITTED', 'committedAt' => Api::now(), 'resultJson' => json_encode($counts, JSON_THROW_ON_ERROR),
            ]);
            Api::audit($request, 'IMPORT_COMMIT', $batch->eventId, 'ImportBatch', $id, $counts);

            return $counts;
        });

        return Api::ok($result);
    }

    public function export(Request $request, string $id, string $kind): Response
    {
        $event = Api::event($request, AdminInvitations::uuid($id, 'id'));
        $links = AdminInvitations::choice($kind, ['links', 'responses'], 'kind') === 'links';
        $query = $request->query();
        $filters = [
            'archived' => AdminInvitations::choice($query['archived'] ?? 'false', ['true', 'false', 'all'], 'archived'),
            'history' => AdminInvitations::choice($query['history'] ?? 'false', ['true', 'false'], 'history'),
            'sort' => AdminInvitations::choice($query['sort'] ?? 'guestCode', ['guestCode', 'fullName', 'createdAt', '-guestCode', '-fullName', '-createdAt'], 'sort'),
        ];
        $guests = AdminInvitations::guests($request, $event->id, $filters['history'] === 'true' ? 'all' : $filters['archived']);
        foreach (['q', 'group', 'status'] as $field) {
            if (isset($query[$field]) && ($field !== 'status' || $query[$field] !== '')) {
                $filters[$field] = $field === 'q' ? AdminInvitations::text($query[$field], 120, 'q') : $query[$field];
            }
        }
        $book = $this->workbook();
        ExcelTransfers::textSheet($book, 'Thông tin', ['exported_at', 'filters'], [[Api::iso(Api::now()), json_encode($filters, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)]]);
        $headers = ['guest_code', 'full_name', 'display_name', 'group', 'salutation', 'personal_message', 'email', 'phone', 'archived_at', 'revoked_at'];
        $headers = array_merge($headers, $links ? ['invitation_url'] : [
            'rsvp_status', 'rsvp_note', 'rsvp_updated_at', 'wish', 'consent_public', 'moderation_status', 'wish_deleted_at',
        ]);
        $desc = str_starts_with($filters['sort'], '-');
        $guestViews = AdminInvitations::guestViews($guests->orderBy('Guest.'.ltrim($filters['sort'], '-'), $desc ? 'desc' : 'asc')->orderBy('Guest.id')->get());
        $rows = function () use ($guestViews, $links) {
            foreach ($guestViews as $guest) {
                $invitation = $guest['invitation'];
                $row = [
                    $guest['guestCode'], $guest['fullName'], $guest['displayName'], $guest['groupKey'], $guest['salutation'],
                    $guest['personalMessage'], $guest['email'], $guest['phone'], $guest['archivedAt'], $invitation['revokedAt'] ?? null,
                ];
                if ($links) {
                    try {
                        $row[] = $invitation
                            ? DB::transaction(fn () => AdminInvitations::link((object) $invitation, $guest['fullName']), 3)
                            : '';
                    } catch (ApiException $e) {
                        if ($e->errorCode === 'NOT_FOUND') {
                            continue;
                        }
                        throw $e;
                    }
                } else {
                    $rsvp = $invitation['rsvp'] ?? null;
                    $wish = $invitation['wish'] ?? null;
                    $row = array_merge($row, [
                        $rsvp['status'] ?? 'UNANSWERED', $rsvp['note'] ?? '', $rsvp['updatedAt'] ?? null,
                        $wish['body'] ?? '', $wish['consentPublic'] ?? false, $wish['moderationStatus'] ?? 'NONE', $wish['deletedAt'] ?? null,
                    ]);
                }
                yield $row;
            }
        };
        ExcelTransfers::textSheet($book, $links ? 'Link thiệp' : 'Phản hồi', $headers, $rows());

        return $this->download($request, $book, $links ? 'link-thiep.xlsx' : 'phan-hoi.xlsx', $event->id);
    }

    public function maintenance(Request $request): JsonResponse
    {
        $secret = (string) config('invitation.cron_secret');
        if (mb_strlen($secret) < 32) {
            Api::fail(503, 'CRON_UNAVAILABLE', 'Bảo trì chưa được cấu hình');
        }
        if (!hash_equals('Bearer '.$secret, (string) $request->header('Authorization', ''))) {
            Api::fail(401, 'AUTH_REQUIRED', 'Không được phép');
        }
        $now = Api::now();
        $temporaryObjects = $this->storage->cleanup();
        $jobs = [
            'sessions' => ['AdminSession', 'id', fn ($query) => $query->where('expiresAt', '<', $now)->orWhereNotNull('revokedAt')],
            'idempotency' => ['IdempotencyRecord', 'id', fn ($query) => $query->where('expiresAt', '<', $now)],
            'imports' => ['ImportBatch', 'id', fn ($query) => $query->where('createdAt', '<', now('UTC')->subDays(7)->format('Y-m-d H:i:s.v'))],
            'rateLimits' => ['RateLimitBucket', 'key', fn ($query) => $query->where('expiresAt', '<', $now)],
        ];
        $counts = array_fill_keys(array_keys($jobs), 0);
        $failedTasks = [];
        foreach ($jobs as $name => [$table, $key, $filter]) {
            try {
                $counts[$name] = DB::transaction(function () use ($table, $key, $filter) {
                    $ids = $filter(DB::table($table))->limit(1000)->lock('FOR UPDATE SKIP LOCKED')->pluck($key);

                    return DB::table($table)->whereIn($key, $ids)->delete();
                });
            } catch (Throwable) {
                $failedTasks[] = $name;
                Log::warning('MAINTENANCE_DB_FAILED', ['task' => $name]);
            }
        }

        return Api::ok($counts + compact('temporaryObjects', 'failedTasks'))->header('Cache-Control', 'private, no-store');
    }

    public function asset(Request $request, string $key): Response
    {
        if (preg_match('~^story/[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$~D', $key)) {
            if ($file = $this->assetFile('invitation-assets/'.$key)) {
                return response()->file($file, ['Cache-Control' => 'public, max-age=31536000, immutable', 'Content-Type' => 'image/webp']);
            }
            Api::fail(404, 'NOT_FOUND', 'Không tìm thấy ảnh');
        }
        $path = '/invitation-assets/'.$key;
        $paths = config('invitation.companion_paths', []);
        foreach (config('invitation.media', []) as $asset) {
            $paths[] = $asset['url'];
            foreach (explode(', ', $asset['srcSet'] ?? '') as $source) {
                $paths[] = explode(' ', $source)[0];
            }
        }
        if (!in_array($path, $paths, true)) {
            Api::fail(404, 'NOT_FOUND', 'Không tìm thấy trang');
        }
        if ($local = $this->assetFile(ltrim($path, '/'))) {
            return response()->file($local);
        }
        if (!$this->storage->direct()) {
            Api::fail(404, 'NOT_FOUND', 'Không tìm thấy trang');
        }

        return redirect()->away($this->storage->assetUrl(ltrim($path, '/')), 302, ['Cache-Control' => 'private, no-store']);
    }

    public function font(): Response
    {
        $headers = ['Cache-Control' => 'private, max-age=86400, immutable', 'Content-Type' => 'font/otf'];
        if ($local = $this->assetFile(TransferStorage::FONT)) {
            return response()->file($local, $headers);
        }
        if (!$this->storage->direct()) {
            Api::fail(404, 'NOT_FOUND', 'Không tìm thấy trang');
        }

        return response($this->storage->font(), 200, $headers);
    }

    private function assetFile(string $key): ?string
    {
        foreach ([public_path($key), base_path('frontend/dist/'.$key), base_path('frontend/public/'.$key)] as $file) {
            if (is_file($file)) {
                return $file;
            }
        }

        return null;
    }

    private function json(Request $request, array $allowed): array
    {
        $body = json_decode($request->getContent());
        if (!$body instanceof \stdClass) {
            AdminInvitations::invalid();
        }
        $body = (array) $body;
        AdminInvitations::strict($body, $allowed);

        return $body;
    }

    private function uploadBytes(Request $request, string $eventId, bool $claim): array
    {
        if ($request->isJson()) {
            $body = $this->json($request, ['uploadId', 'sheet', 'mapping']);
            if (array_key_exists('sheet', $body) && !is_string($body['sheet'])) {
                AdminInvitations::invalid('sheet');
            }
            if (($body['mapping'] ?? null) instanceof \stdClass) {
                $body['mapping'] = (array) $body['mapping'];
            }
            $id = AdminInvitations::uuid($body['uploadId'] ?? null, 'uploadId');
            $bytes = $this->storage->readUpload($request->attributes->get('admin')->id, $eventId, $id, $claim);

            return [$bytes, $body, $id];
        }
        $files = $request->allFiles();
        $file = $files['file'] ?? null;
        $body = $request->request->all();
        if (count($files) > 1 || ($files && !$file instanceof UploadedFile) || count($body) > 2
            || array_filter($body, fn ($value) => !is_string($value) || strlen($value) > 16000)
            || ($file && (!$file->isValid() || $file->getSize() > ExcelTransfers::MAX_BYTES))) {
            Api::fail(413, 'UPLOAD_LIMIT', 'XLSX tối đa 5 MB, một file mỗi lần');
        }
        if (!$file || !str_ends_with(strtolower($file->getClientOriginalName()), '.xlsx')) {
            Api::fail(422, 'INVALID_XLSX', 'Chỉ nhận file .xlsx');
        }

        return [$file->get(), $body, null];
    }

    private function ownedBatch(Request $request, string $id, bool $lock = false): object
    {
        $query = DB::table('ImportBatch')->where('id', $id)->where('createdBy', $request->attributes->get('admin')->id);
        $batch = ($lock ? $query->lockForUpdate() : $query)->first();
        if (!$batch) {
            Api::fail(404, 'NOT_FOUND', 'Không tìm thấy lần nhập');
        }
        Api::event($request, $batch->eventId);

        return $batch;
    }

    private function viewBatch(object $batch, int $page): array
    {
        $payload = json_decode($batch->normalizedRowsJson, true, flags: JSON_THROW_ON_ERROR);
        $pageSize = 100;
        $totalRows = count($payload['rows']);
        $totalErrors = count($payload['errors']);
        $totalWarnings = count($payload['warnings']);
        $pages = max(1, (int) ceil(max($totalRows, $totalErrors, $totalWarnings) / $pageSize));
        $page = min($page, $pages);
        $start = ($page - 1) * $pageSize;

        return [
            'id' => $batch->id, 'status' => $batch->status, 'summary' => json_decode($batch->summaryJson, true, flags: JSON_THROW_ON_ERROR),
            'rows' => array_slice($payload['rows'], $start, $pageSize),
            'errors' => array_map(fn ($row) => ['sheet' => $payload['sheet']] + $row, array_slice($payload['errors'], $start, $pageSize)),
            'warnings' => array_slice($payload['warnings'], $start, $pageSize), 'expiresAt' => Api::iso($batch->expiresAt),
            'pagination' => compact('page', 'pageSize', 'pages', 'totalRows', 'totalErrors', 'totalWarnings'),
        ];
    }

    private function changes(array $values, object $guest, object $invitation): array
    {
        $guestChanges = $invitationChanges = [];
        foreach ($values as $key => $value) {
            if ($key === 'personalMessage') {
                if ($invitation->personalMessage !== $value) {
                    $invitationChanges[$key] = $value;
                }
            } elseif ($guest->{$key} !== $value) {
                $guestChanges[$key] = $value;
            }
        }

        return [$guestChanges, $invitationChanges];
    }

    private function insertGuest(string $eventId, array $values): void
    {
        $guestId = (string) Str::uuid();
        $invitationId = (string) Str::uuid();
        $personalMessage = $values['personalMessage'] ?? '';
        unset($values['personalMessage']);
        $encrypted = InvitationTokens::create($invitationId);
        unset($encrypted['token']);
        $now = Api::now();
        DB::table('Guest')->insert($values + ['id' => $guestId, 'eventId' => $eventId, 'updatedAt' => $now]);
        DB::table('Invitation')->insert($encrypted + [
            'id' => $invitationId, 'eventId' => $eventId, 'guestId' => $guestId, 'personalMessage' => $personalMessage, 'updatedAt' => $now,
        ]);
    }

    private function workbook(): Spreadsheet
    {
        $book = new Spreadsheet;
        $book->removeSheetByIndex(0);

        return $book;
    }

    private function download(Request $request, Spreadsheet $book, string $name, ?string $eventId = null): Response
    {
        $file = tempnam(sys_get_temp_dir(), 'invitation-export-');
        if ($file === false) {
            throw new RuntimeException('Không tạo được file Excel');
        }
        try {
            (new Xlsx($book))->setPreCalculateFormulas(false)->save($file);
            $bytes = file_get_contents($file);
            if ($bytes === false) {
                throw new RuntimeException('Không đọc được file Excel');
            }
            if ($this->storage->direct()) {
                $adminId = $request->attributes->get('admin')->id;
                $eventId ??= DB::table('Event')->where('ownerId', $adminId)->orderBy('createdAt')->value('id');
                if ($eventId === null) {
                    Api::fail(404, 'NOT_FOUND', 'Không tìm thấy sự kiện');
                }

                return Api::ok(['downloadUrl' => $this->storage->createExport($adminId, $eventId, $bytes, $name)]);
            }

            return response($bytes, 200, [
                'Content-Type' => TransferStorage::XLSX, 'Content-Disposition' => 'attachment; filename="'.$name.'"',
                'Cache-Control' => 'private, no-store',
            ]);
        } finally {
            $book->disconnectWorksheets();
            unlink($file);
        }
    }
}
