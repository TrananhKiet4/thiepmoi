<?php

namespace App\Http\Middleware;

use App\Support\Api;
use App\Support\ApiException;
use App\Support\InvitationTokens;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class InvitationAccess
{
    public function handle(Request $request, Closure $next, string $mode)
    {
        if ($mode === 'origin' && !$request->isMethodSafe() && !in_array($request->header('Origin'), config('invitation.cors_origins'), true)) {
            Api::fail(403, 'ORIGIN_FORBIDDEN', 'Nguồn yêu cầu không hợp lệ');
        } elseif ($mode === 'admin') {
            $this->admin($request);
        } elseif ($mode === 'guest') {
            $this->guest($request);
        }
        return $next($request);
    }

    private function admin(Request $request): void
    {
        $signed = $request->cookie('sid', '');
        if (!is_string($signed) || !preg_match('/^s:([A-Za-z0-9_-]{43})\.[A-Za-z0-9+\/]{43}$/D', $signed, $parts) || !hash_equals(Api::signedSession($parts[1]), $signed)) {
            Api::fail(401, 'AUTH_REQUIRED', 'Vui lòng đăng nhập');
        }
        $session = DB::table('AdminSession as session')->join('AdminUser as admin', 'admin.id', '=', 'session.adminId')
            ->where('session.sessionHash', InvitationTokens::hash($parts[1]))->whereNull('session.revokedAt')->where('session.expiresAt', '>', Api::now())
            ->whereNull('admin.disabledAt')->first(['admin.id', 'admin.email', 'session.csrfToken', 'session.id as sessionId']);
        if (!$session) {
            Api::fail(401, 'AUTH_REQUIRED', 'Phiên đăng nhập đã hết hạn');
        }
        if (!$request->isMethodSafe() && !hash_equals($session->csrfToken, $request->header('X-CSRF-Token', ''))) {
            Api::fail(403, 'CSRF_INVALID', 'Phiên xác nhận không hợp lệ, hãy tải lại trang');
        }
        $request->attributes->set('admin', $session);
    }

    private function guest(Request $request): void
    {
        $header = $request->header('Authorization', '');
        $address = (string) $request->ip();
        if (!app()->environment('testing')) {
            Api::rate('guest-read:'.InvitationTokens::hash($address), 120, 60);
            if (!$request->isMethodSafe()) {
                Api::rate('guest-write:'.InvitationTokens::hash($header.'|'.$address), 20, 60);
            }
        }
        if (preg_match('/^Bearer ([A-Za-z0-9]{5})\.([a-z0-9-]{1,200})$/D', $header, $parts)) {
            $invitation = $this->resolveShort($parts[1], $parts[2]);
        } elseif (preg_match('/^Bearer ([A-Za-z0-9_-]{43})$/D', $header, $parts)) {
            $invitation = DB::table('Invitation')->where('tokenHash', InvitationTokens::hash($parts[1]))->first(['id', 'eventId', 'tokenHash']);
        } else {
            Api::fail(401, 'TOKEN_INVALID', 'Link mời không hợp lệ');
        }
        if (!$invitation) {
            Api::fail(401, 'TOKEN_INVALID', 'Thiệp không khả dụng');
        }
        $request->attributes->set('invitation', $invitation);
    }

    private function resolveShort(string $code, string $slug): ?object
    {
        $find = static function () use ($code, $slug) {
            $matches = DB::table('InvitationLink as link')->join('Invitation as invitation', 'invitation.id', '=', 'link.invitationId')
                ->whereIn('link.codeHash', InvitationTokens::shortHashes($code, $slug))->limit(2)
                ->get(['invitation.id', 'invitation.eventId', 'invitation.tokenHash', 'link.tokenHash as linkTokenHash', 'link.restoredTokenHash']);
            $candidate = $matches->count() === 1 ? $matches->first() : null;
            return $candidate && in_array($candidate->tokenHash, [$candidate->linkTokenHash, $candidate->restoredTokenHash], true) ? $candidate : null;
        };
        if (app()->environment('testing')) {
            return $find();
        }
        $bucket = 'short-link-failures:'.InvitationTokens::hash($slug);
        [$invitation, $retryAfter] = DB::transaction(function () use ($bucket, $find) {
            $now = Api::now();
            $expires = CarbonImmutable::now('UTC')->addMinutes(15)->format('Y-m-d H:i:s.v');
            $table = DB::table('RateLimitBucket');
            $table->insertOrIgnore(['key' => $bucket, 'hits' => 0, 'expiresAt' => $expires]);
            $counter = DB::table('RateLimitBucket')->where('key', $bucket)->lockForUpdate()->first();
            $unexpired = $counter->expiresAt > $now;
            if ($unexpired && $counter->hits >= 5) {
                return [null, max(1, strtotime($counter->expiresAt.' UTC') - time())];
            }
            $candidate = $find();
            if (!$candidate) {
                $table->where('key', $bucket)->update(['hits' => $unexpired ? $counter->hits + 1 : 1, 'expiresAt' => $unexpired ? $counter->expiresAt : $expires]);
            }
            return [$candidate, 0];
        }, 3);
        if ($retryAfter) {
            throw new ApiException(429, 'SHORT_LINK_LIMIT', 'Quá nhiều lần thử mã cho tên này, hãy thử lại sau 15 phút', [], ['Retry-After' => (string) $retryAfter]);
        }
        return $invitation;
    }
}
