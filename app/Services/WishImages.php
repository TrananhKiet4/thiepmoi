<?php

namespace App\Services;

use App\Support\Api;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

final class WishImages
{
    public static function path(string $invitation, string $image): string
    {
        abort_unless(Str::isUuid($invitation) && Str::isUuid($image), 404);
        return storage_path('app/private/wish-images/'.$invitation.'/'.$image.'.webp');
    }

    public static function view(string $invitation, ?string $image, string $scope = 'private'): ?array
    {
        if (!$image) {
            return null;
        }
        $parameters = compact('invitation', 'image', 'scope');
        $url = $scope === 'pending'
            ? URL::temporarySignedRoute('wish-image', now()->addHour(), $parameters, absolute: false)
            : URL::signedRoute('wish-image', $parameters, absolute: false);
        return ['id' => $image, 'url' => $url];
    }

    public static function upload(Request $request)
    {
        $invitation = Api::active($request);
        if ($invitation->allowMultipleResponses) {
            Api::fail(422, 'RESPONDER_REQUIRED', 'Vui lòng nhập quan hệ với Kiệt trước khi gửi ảnh');
        }
        $event = DB::table('Event')->where('id', $invitation->eventId)->first();
        $content = json_decode(DB::table('EventRevision')->where('id', $event->publishedRevisionId)->value('contentJson'), true, flags: JSON_THROW_ON_ERROR);
        if (!InvitationViews::canWrite((bool) $event->wishesEnabled, $content['wishDeadline'] ?? null)) {
            Api::fail(422, 'WISHES_CLOSED', 'Đã đóng nhận lời chúc');
        }
        Api::rate('wish-image:'.$invitation->id, 12, 3600);
        $attached = DB::table('Wish')->where('invitationId', $invitation->id)->value('imageId');
        $files = glob(storage_path('app/private/wish-images/'.$invitation->id.'/*.webp')) ?: [];
        $pending = 0;
        foreach ($files as $file) {
            if (pathinfo($file, PATHINFO_FILENAME) === $attached) {
                continue;
            }
            if (filemtime($file) < time() - 3600 && unlink($file)) {
                continue;
            }
            $pending++;
        }
        if ($pending >= 6) {
            Api::fail(429, 'IMAGE_LIMIT', 'Đã tải nhiều ảnh chưa gửi. Vui lòng gửi lời chúc hoặc thử lại sau một giờ.');
        }
        $image = (string) Str::uuid();
        ImageUploads::store($request, self::path($invitation->id, $image));
        return Api::ok(self::view($invitation->id, $image, 'pending'), 201);
    }

    public static function show(Request $request, string $invitation, string $image)
    {
        abort_unless($request->hasValidSignature(absolute: false), 404);
        $path = self::path($invitation, $image);
        $scope = $request->query('scope');
        abort_unless(in_array($scope, ['pending', 'private', 'public'], true) && is_file($path), 404);
        $active = DB::table('Invitation as i')->join('Guest as g', 'g.id', '=', 'i.guestId')
            ->join('Event as e', 'e.id', '=', 'i.eventId')
            ->leftJoin('Invitation as p', 'p.id', '=', 'i.familyParentId')
            ->leftJoin('Guest as pg', 'pg.id', '=', 'p.guestId')
            ->where('i.id', $invitation)->whereNull(['i.revokedAt', 'g.archivedAt', 'p.revokedAt', 'pg.archivedAt'])
            ->whereNotNull('e.publishedRevisionId')->first(['e.wallEnabled']);
        abort_unless($active, 404);
        if ($scope !== 'pending') {
            $wish = DB::table('Wish')->where('invitationId', $invitation)->where('imageId', $image)->whereNull('deletedAt');
            if ($scope === 'public') {
                $wish->where('consentPublic', true)->where('moderationStatus', 'APPROVED')->whereNotNull('approvedAt');
                abort_unless($active->wallEnabled, 404);
            }
            abort_unless($wish->exists(), 404);
        }
        return response()->file($path, ['Content-Type' => 'image/webp', 'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff', 'X-Robots-Tag' => 'noindex, nofollow']);
    }

    public static function cleanup(): int
    {
        $removed = 0;
        foreach (glob(storage_path('app/private/wish-images/*/*.webp')) ?: [] as $file) {
            if (filemtime($file) > time() - 86400) {
                continue;
            }
            $attached = DB::table('Wish')->where('invitationId', basename(dirname($file)))
                ->where('imageId', pathinfo($file, PATHINFO_FILENAME))->whereNull('deletedAt')->exists();
            if (!$attached && unlink($file)) {
                $removed++;
            }
        }
        return $removed;
    }

    public static function forget(string $invitation, ?string $image): void
    {
        if ($image && is_file($path = self::path($invitation, $image))) {
            @unlink($path);
        }
    }
}
