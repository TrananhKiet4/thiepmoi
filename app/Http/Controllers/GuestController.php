<?php

namespace App\Http\Controllers;

use App\Services\AdminInvitations;
use App\Services\InvitationViews;
use App\Support\Api;
use App\Support\InvitationTokens;
use DateTimeImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use JsonException;

final class GuestController
{
    public function invitation(Request $request)
    {
        return Api::ok(DB::transaction(function () use ($request) {
            $invitation = Api::active($request);
            $event = $this->event($invitation);
            $guest = DB::table('Guest')->where('id', $invitation->guestId)->first();

            return InvitationViews::build($event, $this->publishedContent($event), $guest, $invitation);
        }));
    }

    public function opened(Request $request)
    {
        return Api::ok(DB::transaction(function () use ($request) {
            $invitation = Api::active($request, true);
            $now = Api::now();
            $openedAt = $invitation->openedAt ?? $now;
            DB::table('Invitation')->where('id', $invitation->id)->update([
                'openedAt' => $openedAt, 'lastOpenedAt' => $now, 'updatedAt' => $now,
            ]);

            return ['openedAt' => Api::iso($openedAt), 'lastOpenedAt' => Api::iso($now)];
        }, 3));
    }

    public function register(Request $request)
    {
        $body = $this->body($request, ['name'], $errors);
        $name = $this->text($body, 'name', 1, 120, $errors);
        if (preg_match('/[\p{Cc}\p{Cf}]/u', $name)) {
            $errors['name'] = 'Tên có ký tự không hợp lệ';
        }
        $this->validate($errors);

        $parentId = $request->attributes->get('invitation')->id;
        $result = Api::idempotent($request, 'guest.family-responder', InvitationTokens::hash($parentId), ['name' => $name], function () use ($request, $name, $parentId) {
            $parent = Api::active($request);
            if (!$parent->allowMultipleResponses || $parent->familyParentId) {
                Api::fail(404, 'NOT_FOUND', 'Thiệp này chỉ dành cho một khách');
            }
            $event = $this->event($parent);
            $content = $this->publishedContent($event);
            if (!InvitationViews::canWrite((bool) $event->rsvpEnabled, $content['rsvpDeadline']) && !InvitationViews::canWrite((bool) $event->wishesEnabled, $content['wishDeadline'])) {
                Api::fail(422, 'RESPONSES_CLOSED', 'Đã đóng nhận phản hồi');
            }
            if (DB::table('Invitation')->where('familyParentId', $parentId)->count() >= 200) {
                Api::fail(422, 'FAMILY_RESPONSE_LIMIT', 'Thiệp đã đạt giới hạn người phản hồi');
            }

            $groupKey = DB::table('Guest')->where('id', $parent->guestId)->value('groupKey');
            $id = (string) Str::uuid();
            $guestId = (string) Str::uuid();
            $token = InvitationTokens::create($id);
            $now = Api::now();
            DB::table('Guest')->insert([
                'id' => $guestId, 'eventId' => $event->id, 'guestCode' => 'F-'.strtoupper($id),
                'fullName' => $name, 'groupKey' => $groupKey, 'createdAt' => $now, 'updatedAt' => $now,
            ]);
            DB::table('Invitation')->insert([
                'id' => $id, 'eventId' => $event->id, 'guestId' => $guestId, 'familyParentId' => $parentId,
                'tokenHash' => $token['tokenHash'], 'tokenCiphertext' => $token['tokenCiphertext'], 'keyVersion' => $token['keyVersion'],
                'openedAt' => $now, 'lastOpenedAt' => $now, 'createdAt' => $now, 'updatedAt' => $now,
            ]);

            return ['id' => $id];
        });

        $responder = DB::table('Invitation')->where('id', $result['id'])->where('familyParentId', $parentId)->first();
        if (!$responder) {
            Api::fail(404, 'NOT_FOUND', 'Không tìm thấy người phản hồi');
        }

        return Api::ok(['token' => InvitationTokens::decrypt($responder->id, $responder->tokenCiphertext, $responder->keyVersion)], 201);
    }

    public function rsvp(Request $request)
    {
        $body = $this->body($request, ['status', 'note', 'expectedVersion'], $errors);
        if (!in_array($body['status'] ?? null, ['ATTENDING', 'DECLINED'], true)) {
            $errors['status'] = 'Invalid option: expected one of "ATTENDING"|"DECLINED"';
        }
        if (!array_key_exists('note', $body)) {
            $body['note'] = '';
        }
        $body['note'] = $this->text($body, 'note', 0, 500, $errors);
        $body['expectedVersion'] = $this->integer($body, 'expectedVersion', 0, $errors);
        $this->validate($errors);

        return Api::ok(Api::idempotent($request, 'guest.rsvp', $this->actor($request), $body, function () use ($request, $body) {
            $invitation = Api::active($request);
            $event = $this->event($invitation);
            if (!InvitationViews::canWrite((bool) $event->rsvpEnabled, $this->publishedContent($event)['rsvpDeadline'])) {
                Api::fail(422, 'RSVP_CLOSED', 'Đã đóng xác nhận tham gia');
            }
            $rsvp = DB::table('RSVP')->where('invitationId', $invitation->id)->first();
            $this->assertVersion($rsvp, $body['expectedVersion']);
            $now = Api::now();

            return InvitationViews::rsvpView($this->save('RSVP', $invitation->id, $rsvp, [
                'status' => $body['status'], 'note' => $body['note'], 'respondedAt' => $now, 'updatedAt' => $now,
            ]));
        }));
    }

    public function wish(Request $request)
    {
        $body = $this->body($request, ['body', 'consentPublic', 'consentAttendancePublic', 'expectedVersion'], $errors);
        $body['body'] = $this->text($body, 'body', 1, 1000, $errors);
        foreach (['consentPublic', 'consentAttendancePublic'] as $key) {
            if (($key === 'consentPublic' || array_key_exists($key, $body)) && !is_bool($body[$key] ?? null)) {
                $errors[$key] = 'Invalid input: expected boolean, received '.$this->type($body, $key);
            }
        }
        $body['expectedVersion'] = $this->integer($body, 'expectedVersion', 0, $errors);
        $this->validate($errors);

        return Api::ok(Api::idempotent($request, 'guest.wish', $this->actor($request), $body, function () use ($request, $body) {
            $invitation = Api::active($request);
            $event = $this->event($invitation);
            if (!InvitationViews::canWrite((bool) $event->wishesEnabled, $this->publishedContent($event)['wishDeadline'])) {
                Api::fail(422, 'WISHES_CLOSED', 'Đã đóng nhận lời chúc');
            }
            $wish = DB::table('Wish')->where('invitationId', $invitation->id)->first();
            $this->assertVersion($wish, $body['expectedVersion']);
            $status = ($wish->moderationStatus ?? null) === 'HIDDEN' ? 'HIDDEN' : ($body['consentPublic'] ? 'APPROVED' : 'NONE');
            $now = Api::now();
            $fields = [
                'body' => $body['body'], 'consentPublic' => $body['consentPublic'],
                'consentAttendancePublic' => $body['consentPublic'] && ($body['consentAttendancePublic'] ?? false),
                'moderationStatus' => $status, 'isPinned' => false, 'approvedAt' => $status === 'APPROVED' ? $now : null,
                'approvedBy' => null, 'deletedAt' => null, 'updatedAt' => $now,
            ];
            if (!$wish) {
                $fields['createdAt'] = $now;
            }

            return InvitationViews::wishView($this->save('Wish', $invitation->id, $wish, $fields));
        }));
    }

    public function visibility(Request $request)
    {
        return Api::ok($this->withdrawWish($request, false));
    }

    public function deleteWish(Request $request)
    {
        $this->withdrawWish($request, true);

        return response()->noContent();
    }

    public function wishes(Request $request)
    {
        $query = $request->query();
        $errors = [];
        $cursor = $query['cursor'] ?? '';
        if (!is_string($cursor)) {
            $errors['cursor'] = 'Invalid input: expected string, received '.$this->type($query, 'cursor');
        } elseif ($this->stringLength($cursor) > 512) {
            $errors['cursor'] = 'Too big: expected string to have <=512 characters';
        }
        $limit = $this->queryInteger($query, 'limit', 6, 20, $errors);
        $this->validate($errors);
        $after = $cursor !== '' ? $this->decodeCursor($cursor) : null;

        return Api::ok(DB::transaction(function () use ($request, $limit, $after) {
            $invitation = Api::active($request);
            if (!$this->event($invitation)->wallEnabled) {
                return ['items' => [], 'nextCursor' => null];
            }

            return InvitationViews::publicWishes($invitation->eventId, $limit, $after, $invitation->id);
        }));
    }

    public function calendar(Request $request)
    {
        $calendar = DB::transaction(function () use ($request) {
            $invitation = Api::active($request);

            return InvitationViews::calendar($invitation->eventId, $this->publishedContent($this->event($invitation)));
        });

        return response($calendar, 200, [
            'Content-Type' => 'text/calendar; charset=utf-8', 'Content-Disposition' => 'attachment; filename="graduation.ics"',
        ]);
    }

    public function adminWishes(Request $request, string $id)
    {
        $this->assertUuid($id);
        $query = $request->query();
        $errors = [];
        $page = $this->queryInteger($query, 'page', 1, 100000, $errors);
        $pageSize = $this->queryInteger($query, 'pageSize', 25, 100, $errors);
        $status = $query['status'] ?? '';
        if (!in_array($status, ['', 'NONE', 'PENDING', 'APPROVED', 'HIDDEN', 'DELETED'], true)) {
            $errors['status'] = 'Invalid option: expected one of "NONE"|"PENDING"|"APPROVED"|"HIDDEN"|"DELETED"';
        }
        $this->validate($errors);

        return Api::ok(DB::transaction(function () use ($request, $id, $page, $pageSize, $status) {
            Api::event($request, $id);
            $query = DB::table('Wish as w')->join('Invitation as i', 'i.id', '=', 'w.invitationId')->where('i.eventId', $id);
            if ($status === 'DELETED') {
                $query->whereNotNull('w.deletedAt');
            } elseif ($status !== '') {
                $query->whereNull('w.deletedAt')->where('w.moderationStatus', $status);
            }
            $total = $query->count();
            $rows = $query->orderByDesc('w.updatedAt')->orderByDesc('w.id')->forPage($page, $pageSize)
                ->get(['w.*', 'i.guestId', 'i.version as invitationVersion', 'i.revokedAt']);
            $guests = DB::table('Guest')->whereIn('id', $rows->pluck('guestId'))->get()->keyBy('id');
            $items = $rows->map(fn ($wish) => $this->adminWishView($wish) + [
                'invitation' => [
                    'id' => $wish->invitationId, 'version' => (int) $wish->invitationVersion, 'revokedAt' => Api::iso($wish->revokedAt),
                    'guest' => AdminInvitations::dates($guests->get($wish->guestId), ['archivedAt', 'createdAt', 'updatedAt']),
                ],
            ])->all();

            return ['items' => $items, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize];
        }));
    }

    public function moderateWish(Request $request, string $id)
    {
        $this->assertUuid($id);
        $body = $this->body($request, ['expectedVersion', 'action'], $errors);
        $version = $this->integer($body, 'expectedVersion', 1, $errors);
        $action = $body['action'] ?? null;
        if (!in_array($action, ['APPROVE', 'HIDE'], true)) {
            $errors['action'] = 'Invalid option: expected one of "APPROVE"|"HIDE"';
        }
        $this->validate($errors);

        return $this->updateAdminWish($request, $id, $version, 'WISH_'.$action, function ($wish) use ($request, $action) {
            $approve = $action === 'APPROVE';
            $restorable = in_array($wish->moderationStatus, ['HIDDEN', 'PENDING'], true);
            if ($wish->deletedAt || ($approve && (!$restorable || !$wish->consentPublic || $wish->revokedAt || $wish->archivedAt))) {
                Api::fail(422, 'WISH_NOT_PUBLIC', 'Lời chúc không đủ điều kiện công khai');
            }
            $status = $approve ? 'APPROVED' : (($wish->consentPublic || $wish->moderationStatus === 'HIDDEN') ? 'HIDDEN' : 'NONE');

            return [
                'moderationStatus' => $status, 'isPinned' => false, 'approvedAt' => $approve ? Api::now() : null,
                'approvedBy' => $approve ? $request->attributes->get('admin')->id : null,
            ];
        });
    }

    public function pinWish(Request $request, string $id)
    {
        $this->assertUuid($id);
        $body = $this->body($request, ['expectedVersion', 'isPinned'], $errors);
        $version = $this->integer($body, 'expectedVersion', 1, $errors);
        $isPinned = $body['isPinned'] ?? null;
        if (!is_bool($isPinned)) {
            $errors['isPinned'] = 'Invalid input: expected boolean, received '.$this->type($body, 'isPinned');
        }
        $this->validate($errors);

        return $this->updateAdminWish($request, $id, $version, $isPinned ? 'WISH_PINNED' : 'WISH_UNPINNED', function ($wish) use ($isPinned) {
            if ($isPinned && (!$wish->consentPublic || $wish->moderationStatus !== 'APPROVED' || $wish->deletedAt
                || $wish->revokedAt || $wish->archivedAt || $wish->parentRevokedAt || $wish->parentArchivedAt)) {
                Api::fail(422, 'WISH_NOT_PUBLIC', 'Chỉ ghim lời chúc đang công khai');
            }

            return ['isPinned' => $isPinned];
        });
    }

    private function updateAdminWish(Request $request, string $id, int $version, string $action, callable $changes)
    {
        $eventId = $this->ownedWish($request, $id)->eventId;

        return Api::ok(DB::transaction(function () use ($request, $id, $eventId, $version, $action, $changes) {
            Api::lockEvent($eventId);
            $wish = $this->ownedWish($request, $id);
            $this->assertVersion($wish, $version);
            $updated = $this->save('Wish', $wish->invitationId, $wish, $changes($wish) + ['updatedAt' => Api::now()]);
            Api::audit($request, $action, $eventId, 'Wish', $id);

            return $this->adminWishView($updated);
        }, 3));
    }

    private function ownedWish(Request $request, string $id): object
    {
        $wish = DB::table('Wish as w')
            ->join('Invitation as i', 'i.id', '=', 'w.invitationId')
            ->join('Guest as g', 'g.id', '=', 'i.guestId')
            ->leftJoin('Invitation as parent', 'parent.id', '=', 'i.familyParentId')
            ->leftJoin('Guest as parentGuest', 'parentGuest.id', '=', 'parent.guestId')
            ->where('w.id', $id)
            ->first(['w.*', 'i.eventId', 'i.revokedAt', 'g.archivedAt', 'parent.revokedAt as parentRevokedAt', 'parentGuest.archivedAt as parentArchivedAt']);
        if (!$wish) {
            Api::fail(404, 'NOT_FOUND', 'Không tìm thấy lời chúc');
        }
        Api::event($request, $wish->eventId);

        return $wish;
    }

    private function adminWishView(object $wish): array
    {
        return InvitationViews::wishView($wish) + ['invitationId' => $wish->invitationId, 'approvedBy' => $wish->approvedBy];
    }

    private function withdrawWish(Request $request, bool $delete): array
    {
        $body = $this->body($request, $delete ? ['expectedVersion'] : ['expectedVersion', 'consentPublic'], $errors);
        $version = $this->integer($body, 'expectedVersion', 1, $errors);
        if (!$delete && ($body['consentPublic'] ?? null) !== false) {
            $errors['consentPublic'] = 'Invalid input: expected false';
        }
        $this->validate($errors);

        return DB::transaction(function () use ($request, $delete, $version) {
            $invitation = Api::active($request, true);
            $wish = DB::table('Wish')->where('invitationId', $invitation->id)->first();
            if ($invitation->allowMultipleResponses || !$wish) {
                Api::fail(404, 'NOT_FOUND', 'Chưa có lời chúc');
            }
            $this->assertVersion($wish, $version);
            $now = Api::now();
            $fields = $delete ? ['deletedAt' => $now] : [
                'consentPublic' => false, 'consentAttendancePublic' => false,
                'moderationStatus' => $wish->moderationStatus === 'HIDDEN' ? 'HIDDEN' : 'NONE', 'approvedAt' => null, 'approvedBy' => null,
            ];

            return InvitationViews::wishView($this->save('Wish', $invitation->id, $wish, $fields + ['isPinned' => false, 'updatedAt' => $now]));
        }, 3);
    }

    private function save(string $table, string $invitationId, ?object $row, array $fields): object
    {
        $id = $row->id ?? (string) Str::uuid();
        if ($row) {
            DB::table($table)->where('id', $id)->update($fields + ['version' => $row->version + 1]);
        } else {
            DB::table($table)->insert($fields + ['id' => $id, 'invitationId' => $invitationId]);
        }

        return DB::table($table)->where('id', $id)->first();
    }

    private function assertVersion(?object $row, int $expected): void
    {
        if ((int) ($row->version ?? 0) !== $expected) {
            Api::fail(409, 'VERSION_CONFLICT', 'Dữ liệu đã thay đổi, vui lòng tải lại');
        }
    }

    private function actor(Request $request): string
    {
        return InvitationTokens::hash($request->attributes->get('invitation')->id);
    }

    private function event(object $invitation): object
    {
        return DB::table('Event')->where('id', $invitation->eventId)->first();
    }

    private function publishedContent(object $event): array
    {
        $content = DB::table('EventRevision')->where('id', $event->publishedRevisionId)->where('eventId', $event->id)->value('contentJson');
        if ($content === null) {
            Api::fail(404, 'EVENT_NOT_AVAILABLE', 'Thiệp chưa sẵn sàng');
        }

        return AdminInvitations::content(json_decode($content, flags: JSON_THROW_ON_ERROR));
    }

    private function decodeCursor(string $cursor): array
    {
        $decoded = base64_decode(strtr($cursor, '-_', '+/'), true);
        $after = $decoded === false ? null : json_decode($decoded, true);
        if (!is_array($after) || count($after) !== 3 || !is_bool($after['p'] ?? null)
            || !is_string($after['a'] ?? null) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z$/D', $after['a'])
            || !is_string($after['id'] ?? null) || !Str::isUuid($after['id'])) {
            Api::fail(400, 'CURSOR_INVALID', 'Phân trang không hợp lệ');
        }
        try {
            new DateTimeImmutable($after['a']);
        } catch (\Exception) {
            Api::fail(400, 'CURSOR_INVALID', 'Phân trang không hợp lệ');
        }
        if (DateTimeImmutable::getLastErrors() !== false) {
            Api::fail(400, 'CURSOR_INVALID', 'Phân trang không hợp lệ');
        }

        return $after;
    }

    private function body(Request $request, array $allowed, ?array &$errors): array
    {
        $errors = [];
        try {
            $raw = $request->getContent();
            $body = $raw === '' ? new \stdClass() : json_decode($raw, flags: JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            Api::fail(400, 'JSON_INVALID', 'JSON không hợp lệ');
        }
        if (!is_object($body)) {
            $this->validate(['' => 'Invalid input: expected object, received '.$this->type(['body' => $body], 'body')]);
        }
        $body = (array) $body;
        $extra = array_values(array_diff(array_keys($body), $allowed));
        if ($extra) {
            $errors[''] = (count($extra) === 1 ? 'Unrecognized key: ' : 'Unrecognized keys: ').implode(', ', array_map(fn ($key) => '"'.$key.'"', $extra));
        }

        return $body;
    }

    private function text(array $body, string $key, int $min, int $max, array &$errors): string
    {
        $value = $body[$key] ?? null;
        if (!is_string($value)) {
            $errors[$key] = 'Invalid input: expected string, received '.$this->type($body, $key);

            return '';
        }
        $value = preg_replace('/^[\p{Z}\x09-\x0d\x{FEFF}]+|[\p{Z}\x09-\x0d\x{FEFF}]+$/u', '', $value);
        $length = $this->stringLength($value);
        if ($length < $min) {
            $errors[$key] = "Too small: expected string to have >=$min characters";
        } elseif ($length > $max) {
            $errors[$key] = "Too big: expected string to have <=$max characters";
        }

        return $value;
    }

    private function stringLength(string $value): int
    {
        return intdiv(strlen(mb_convert_encoding($value, 'UTF-16LE', 'UTF-8')), 2);
    }

    private function queryInteger(array $query, string $key, int $default, int $max, array &$errors): int
    {
        if (!array_key_exists($key, $query)) {
            return $default;
        }
        $raw = $query[$key];
        $query[$key] = is_numeric($raw) ? (float) $raw : ((is_string($raw) && trim($raw) === '') ? 0 : NAN);
        $value = $this->integer($query, $key, 1, $errors);
        if (!isset($errors[$key]) && $value > $max) {
            $errors[$key] = "Too big: expected number to be <=$max";
        }

        return $value;
    }

    private function integer(array $body, string $key, int $min, array &$errors): int
    {
        $value = $body[$key] ?? null;
        if (!is_int($value) && (!is_float($value) || is_nan($value))) {
            $errors[$key] = 'Invalid input: expected number, received '.$this->type($body, $key);

            return 0;
        }
        if (!is_finite($value) || floor($value) != $value) {
            $errors[$key] = 'Invalid input: expected int, received number';
        } elseif ($value > 9007199254740991 || $value < -9007199254740991) {
            $errors[$key] = 'Invalid input: expected a safe integer';
        } elseif ($value < $min) {
            $errors[$key] = "Too small: expected number to be >=$min";
        }

        return (int) $value;
    }

    private function type(array $body, string $key): string
    {
        return match (gettype($body[$key] ?? null)) {
            'integer', 'double' => is_nan((float) $body[$key]) ? 'NaN' : 'number',
            'NULL' => array_key_exists($key, $body) ? 'null' : 'undefined',
            default => gettype($body[$key]),
        };
    }

    private function assertUuid(string $value): void
    {
        if (!Str::isUuid($value)) {
            $this->validate(['' => 'Invalid UUID']);
        }
    }

    private function validate(array $errors): void
    {
        if ($errors) {
            Api::fail(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', $errors);
        }
    }
}
