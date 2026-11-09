<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

final class Api
{
    public static function ok(mixed $data, int $status = 200): JsonResponse
    {
        return response()->json(['data' => $data], $status);
    }

    public static function fail(int $status, string $code, string $message, array $fields = []): never
    {
        throw new ApiException($status, $code, $message, $fields);
    }

    public static function now(): string
    {
        return CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.v');
    }

    public static function iso(mixed $date): ?string
    {
        return $date === null ? null : CarbonImmutable::parse($date, 'UTC')->utc()->format('Y-m-d\TH:i:s.v\Z');
    }

    public static function event(Request $request, string $eventId): object
    {
        $event = Str::isUuid($eventId) ? DB::table('Event')->where('id', $eventId)->where('ownerId', $request->attributes->get('admin')->id)->first() : null;
        if (!$event) {
            self::fail(404, 'NOT_FOUND', 'Không tìm thấy sự kiện');
        }
        return $event;
    }

    public static function lockEvent(string $eventId): void
    {
        DB::table('Event')->where('id', $eventId)->lockForUpdate()->first(['id']);
    }

    public static function audit(Request $request, string $action, string $eventId, string $type, string $id, array $details = []): void
    {
        DB::table('AuditLog')->insert(['id' => (string) Str::uuid(), 'actorAdminId' => $request->attributes->get('admin')->id ?? null, 'action' => $action, 'eventId' => $eventId, 'entityType' => $type, 'entityId' => $id, 'metadata' => json_encode((object) $details, JSON_THROW_ON_ERROR)]);
    }

    public static function active(Request $request, bool $lock = false): object
    {
        $credential = $request->attributes->get('invitation');
        if ($lock) {
            self::lockEvent($credential->eventId);
        }
        $query = DB::table('Invitation')->where('id', $credential->id);
        $invitation = ($lock ? $query->lockForUpdate() : $query)->first();
        if (!$invitation || $invitation->revokedAt || !hash_equals($invitation->tokenHash, $credential->tokenHash) || DB::table('Guest')->where('id', $invitation->guestId)->whereNotNull('archivedAt')->exists()) {
            self::fail(404, 'INVITATION_NOT_AVAILABLE', 'Thiệp không khả dụng');
        }
        if ($invitation->familyParentId && !DB::table('Invitation as parent')->join('Guest as recipient', 'recipient.id', '=', 'parent.guestId')->where('parent.id', $invitation->familyParentId)->whereNull('parent.revokedAt')->whereNull('recipient.archivedAt')->exists()) {
            self::fail(404, 'INVITATION_NOT_AVAILABLE', 'Thiệp không khả dụng');
        }
        if (!DB::table('Event')->where('id', $invitation->eventId)->whereNotNull('publishedRevisionId')->exists()) {
            self::fail(404, 'EVENT_NOT_AVAILABLE', 'Thiệp chưa sẵn sàng');
        }
        return $invitation;
    }

    public static function signedSession(string $token): string
    {
        $secret = (string) config('invitation.session_secret');
        if (strlen($secret) < 32) {
            throw new RuntimeException('SESSION_SECRET must contain at least 32 characters');
        }
        return 's:'.$token.'.'.rtrim(base64_encode(hash_hmac('sha256', $token, $secret, true)), '=');
    }

    public static function checkRate(string $bucket, int $limit, string $code = 'RATE_LIMITED'): void
    {
        $record = DB::table('RateLimitBucket')->where('key', $bucket)->where('expiresAt', '>', self::now())->first();
        if ($record && $record->hits >= $limit) {
            $message = $code === 'LOGIN_LIMIT' ? 'Quá nhiều lần đăng nhập, hãy thử lại sau 15 phút' : 'Bạn gửi quá nhanh, vui lòng chờ';
            throw new ApiException(429, $code, $message, [], ['Retry-After' => (string) max(1, strtotime($record->expiresAt.' UTC') - time())]);
        }
    }

    public static function recordRate(string $bucket, int $windowSeconds): int
    {
        return DB::transaction(function () use ($bucket, $windowSeconds) {
            $table = DB::table('RateLimitBucket');
            $now = self::now();
            $expiresAt = CarbonImmutable::now('UTC')->addSeconds($windowSeconds)->format('Y-m-d H:i:s.v');
            $table->insertOrIgnore(['key' => $bucket, 'hits' => 0, 'expiresAt' => $expiresAt]);
            $row = DB::table('RateLimitBucket')->where('key', $bucket)->lockForUpdate()->first();
            $hits = $row->expiresAt <= $now ? 1 : $row->hits + 1;
            $table->where('key', $bucket)->update(['hits' => $hits, 'expiresAt' => $row->expiresAt <= $now ? $expiresAt : $row->expiresAt]);
            return $hits;
        }, 3);
    }

    public static function rate(string $bucket, int $limit, int $windowSeconds): void
    {
        if (self::recordRate($bucket, $windowSeconds) > $limit) {
            self::checkRate($bucket, $limit);
        }
    }

    private static function ordered(mixed $value): mixed
    {
        if (!is_array($value)) {
            return $value;
        }
        if (!array_is_list($value)) {
            ksort($value, SORT_STRING);
        }
        return array_map(self::ordered(...), $value);
    }

    public static function idempotent(Request $request, string $scope, string $actorKeyHash, array $body, callable $work): mixed
    {
        $key = $request->header('Idempotency-Key', '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,128}$/D', $key)) {
            self::fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Thiếu Idempotency-Key hợp lệ');
        }
        $requestHash = InvitationTokens::hash(json_encode(self::ordered($body), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS));
        return DB::transaction(function () use ($request, $scope, $actorKeyHash, $key, $requestHash, $work) {
            if ($request->attributes->has('invitation')) {
                $invitation = self::active($request, true);
                if ($invitation->allowMultipleResponses && in_array($scope, ['guest.rsvp', 'guest.wish'], true)) {
                    self::fail(422, 'RESPONDER_REQUIRED', 'Vui lòng nhập tên người phản hồi');
                }
            }
            $where = ['scope' => $scope, 'actorKeyHash' => $actorKeyHash, 'key' => $key];
            $expiresAt = CarbonImmutable::now('UTC')->addDay()->format('Y-m-d H:i:s.v');
            $id = (string) Str::uuid();
            DB::table('IdempotencyRecord')->insertOrIgnore([...$where, 'id' => $id, 'requestHash' => $requestHash, 'responseStatus' => 200, 'responseJson' => 'null', 'expiresAt' => $expiresAt]);
            $row = DB::table('IdempotencyRecord')->where($where)->lockForUpdate()->first();
            if ($row->id !== $id && $row->expiresAt > self::now()) {
                if (!hash_equals($row->requestHash, $requestHash)) {
                    self::fail(409, 'IDEMPOTENCY_CONFLICT', 'Khóa gửi lại đã được dùng với nội dung khác');
                }
                return json_decode($row->responseJson, true, flags: JSON_THROW_ON_ERROR);
            }
            $result = $work();
            DB::table('IdempotencyRecord')->where('id', $row->id)->update(['requestHash' => $requestHash, 'responseJson' => json_encode($result, JSON_THROW_ON_ERROR), 'expiresAt' => $expiresAt]);
            return $result;
        }, 3);
    }
}
