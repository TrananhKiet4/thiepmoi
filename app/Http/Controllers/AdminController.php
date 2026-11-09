<?php

namespace App\Http\Controllers;

use App\Services\AdminInvitations;
use App\Services\InvitationViews;
use App\Support\Api;
use App\Support\InvitationTokens;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Response;

final class AdminController
{
    private const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$sEXAowVOLyzKQ4r2DbfKmQ$WoU74hNUiPki4ynJ/ZcWf1Xs20coznSfMY/JWBchkVM';

    public function login(Request $request): JsonResponse
    {
        $input = $this->body($request);
        $alias = (string) config('invitation.admin_email');
        $login = is_string($input['email'] ?? null) ? mb_strtolower(AdminInvitations::trim($input['email'])) : '';
        $buckets = [
            'login-ip:'.InvitationTokens::hash($this->loginIp($request)),
            'login-account:'.InvitationTokens::hash($login === 'admin' && $alias !== '' ? $alias : $login),
        ];
        $reservations = [];
        if (!app()->environment('testing')) {
            foreach ($buckets as $bucket) {
                if (Api::recordRate($bucket, 900) > 5) {
                    Api::checkRate($bucket, 5, 'LOGIN_LIMIT');
                }
                $reservations[$bucket] = DB::table('RateLimitBucket')->where('key', $bucket)->value('expiresAt');
            }
        }
        AdminInvitations::strict($input, ['email', 'password']);
        $email = $this->email(AdminInvitations::text($input['email'] ?? null, 254, 'email'), adminAlias: true);
        $password = AdminInvitations::text($input['password'] ?? null, 200, 'password', 1, false);
        $email = $email === 'admin' ? $alias : $email;
        $admin = $email !== '' ? DB::table('AdminUser')->where('email', $email)->first() : null;
        $matches = password_verify($password, $admin->passwordHash ?? self::DUMMY_HASH);
        if (!$admin || $admin->disabledAt || !$matches) {
            Api::fail(401, 'LOGIN_INVALID', 'Tài khoản hoặc mật khẩu không đúng');
        }
        $token = InvitationTokens::secret();
        $csrf = InvitationTokens::secret();
        $expires = new DateTimeImmutable('+12 hours', new DateTimeZone('UTC'));
        $cookie = $this->sessionCookie(Api::signedSession($token), $expires->getTimestamp());
        DB::table('AdminSession')->insert([
            'id' => (string) Str::uuid(),
            'adminId' => $admin->id,
            'sessionHash' => InvitationTokens::hash($token),
            'csrfToken' => $csrf,
            'expiresAt' => $expires->format('Y-m-d H:i:s.v'),
        ]);
        $response = Api::ok(['id' => $admin->id, 'email' => $admin->email, 'csrfToken' => $csrf, 'expiresAt' => $expires->format('Y-m-d\TH:i:s.v\Z')]);
        $response->headers->setCookie($cookie);
        foreach ($reservations as $bucket => $expiresAt) {
            DB::table('RateLimitBucket')->where(['key' => $bucket, 'expiresAt' => $expiresAt])->where('hits', '>', 0)->decrement('hits');
        }

        return $response;
    }

    public function me(Request $request): JsonResponse
    {
        $admin = $request->attributes->get('admin');

        return Api::ok(['id' => $admin->id, 'email' => $admin->email, 'csrfToken' => $admin->csrfToken]);
    }

    public function logout(Request $request): Response
    {
        DB::table('AdminSession')->where('id', $request->attributes->get('admin')->sessionId)->update(['revokedAt' => Api::now()]);
        $response = response()->noContent();
        $response->headers->setCookie($this->sessionCookie('', 1));

        return $response;
    }

    public function current(Request $request): JsonResponse
    {
        return Api::ok(DB::transaction(function () use ($request) {
            $event = DB::table('Event')->where('ownerId', $request->attributes->get('admin')->id)->orderByDesc('createdAt')->first();
            if (!$event) {
                Api::fail(404, 'NOT_FOUND', 'Chưa có sự kiện');
            }

            return $this->eventView($event);
        }));
    }

    public function draft(Request $request, string $id): JsonResponse
    {
        AdminInvitations::uuid($id);
        $input = $this->body($request);
        AdminInvitations::strict($input, ['content']);
        $content = AdminInvitations::content($input['content'] ?? null);
        $ifMatch = (string) $request->header('If-Match');
        if (!preg_match('/^(?:[1-9]\d*|"[1-9]\d*")$/D', $ifMatch)) {
            AdminInvitations::invalid();
        }
        $expected = AdminInvitations::integer((float) trim($ifMatch, '"'), '');

        return Api::ok(DB::transaction(function () use ($request, $id, $content, $expected) {
            Api::lockEvent($id);
            $event = Api::event($request, $id);
            $this->checkVersion($event->version, $expected);
            $this->validateMedia($content, false);
            $revisionId = (string) Str::uuid();
            $revisionNo = DB::table('EventRevision')->where('eventId', $id)->max('revisionNo');
            DB::table('EventRevision')->insert([
                'id' => $revisionId,
                'eventId' => $id,
                'revisionNo' => $revisionNo + 1,
                'contentJson' => json_encode($content, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            ]);
            $this->update('Event', $id, $expected, ['draftRevisionId' => $revisionId]);
            Api::audit($request, 'DRAFT_SAVED', $id, 'EventRevision', $revisionId);

            return $this->eventView(Api::event($request, $id));
        }, 3));
    }

    public function publish(Request $request, string $id): JsonResponse
    {
        return $this->publication($request, $id, true);
    }

    public function unpublish(Request $request, string $id): JsonResponse
    {
        return $this->publication($request, $id, false);
    }

    public function controls(Request $request, string $id): JsonResponse
    {
        AdminInvitations::uuid($id);
        $input = $this->body($request);
        AdminInvitations::strict($input, ['expectedVersion', 'rsvpEnabled', 'wishesEnabled', 'wallEnabled']);
        $expected = AdminInvitations::integer($input['expectedVersion'] ?? null, 'expectedVersion');
        unset($input['expectedVersion']);
        if (!$input) {
            AdminInvitations::invalid();
        }
        foreach ($input as $field => $value) {
            AdminInvitations::boolean($value, $field);
        }

        return Api::ok(DB::transaction(function () use ($request, $id, $input, $expected) {
            Api::lockEvent($id);
            $this->checkVersion(Api::event($request, $id)->version, $expected);
            $this->update('Event', $id, $expected, $input);
            Api::audit($request, 'CONTROLS_UPDATED', $id, 'Event', $id, $input);

            return $this->eventView(Api::event($request, $id));
        }, 3));
    }

    public function preview(Request $request, string $id): JsonResponse
    {
        return Api::ok(DB::transaction(function () use ($request, $id) {
            $event = Api::event($request, $id);
            $query = $request->query();
            $source = AdminInvitations::choice($query['source'] ?? 'draft', ['draft', 'published'], 'source');
            $revisionId = $source === 'published' ? ($event->publishedRevisionId ?? $event->draftRevisionId) : $event->draftRevisionId;
            $revision = $this->revision($id, $revisionId);
            if (!$revision) {
                Api::fail(404, 'DRAFT_REQUIRED', 'Chưa có bản nháp');
            }
            $guest = $invitation = null;
            if (array_key_exists('guestId', $query)) {
                $guestId = AdminInvitations::uuid($query['guestId'], 'guestId');
                $guest = DB::table('Guest')->where(['id' => $guestId, 'eventId' => $id])->first();
                if (!$guest) {
                    Api::fail(404, 'NOT_FOUND', 'Không tìm thấy khách');
                }
                $invitation = DB::table('Invitation')->where('guestId', $guest->id)->first();
            }

            return InvitationViews::build($event, AdminInvitations::content(json_decode($revision->contentJson)), $guest, $invitation, true);
        }));
    }

    public function dashboard(Request $request, string $id): JsonResponse
    {
        return Api::ok(DB::transaction(function () use ($request, $id) {
            Api::event($request, $id);
            $stats = DB::table('Invitation as i')
                ->join('Guest as g', 'g.id', '=', 'i.guestId')
                ->leftJoin('Invitation as p', 'p.id', '=', 'i.familyParentId')
                ->leftJoin('Guest as pg', 'pg.id', '=', 'p.guestId')
                ->leftJoin('RSVP as r', 'r.invitationId', '=', 'i.id')
                ->leftJoin('Wish as w', 'w.invitationId', '=', 'i.id')
                ->where('i.eventId', $id)
                ->whereNull(['i.revokedAt', 'g.archivedAt', 'p.revokedAt', 'pg.archivedAt'])
                ->selectRaw("COUNT(*) AS total, SUM(r.status = 'ATTENDING') AS attending, SUM(r.status = 'DECLINED') AS declined")
                ->selectRaw("SUM(w.deletedAt IS NULL AND w.consentPublic AND w.moderationStatus = 'APPROVED' AND w.approvedAt IS NOT NULL) AS publicWishes")
                ->selectRaw('SUM(i.openedAt IS NOT NULL) AS opened')->first();
            $counts = array_map('intval', (array) $stats);
            $counts['unanswered'] = $counts['total'] - $counts['attending'] - $counts['declined'];

            return $counts;
        }));
    }

    public function guests(Request $request, string $id): JsonResponse
    {
        AdminInvitations::uuid($id);
        $query = $request->query();
        $page = $this->pageNumber($query['page'] ?? '1', 'page', 100000);
        $pageSize = $this->pageNumber($query['pageSize'] ?? '25', 'pageSize', 100);
        $sort = AdminInvitations::choice($query['sort'] ?? 'guestCode', ['guestCode', 'fullName', 'createdAt', '-guestCode', '-fullName', '-createdAt'], 'sort');

        return Api::ok(DB::transaction(function () use ($request, $id, $page, $pageSize, $sort) {
            Api::event($request, $id);
            $guests = AdminInvitations::guests($request, $id);
            $total = $guests->count();
            $rows = $guests->orderBy(ltrim($sort, '-'), str_starts_with($sort, '-') ? 'desc' : 'asc')->orderBy('id')
                ->forPage($page, $pageSize)->get();

            return ['items' => AdminInvitations::guestViews($rows), 'total' => $total, 'page' => $page, 'pageSize' => $pageSize];
        }));
    }

    public function createGuest(Request $request, string $id): JsonResponse
    {
        AdminInvitations::uuid($id);
        $data = $this->guestInput($this->body($request));
        $personalMessage = $data['personalMessage'];
        unset($data['personalMessage']);

        return Api::ok(DB::transaction(function () use ($request, $id, $data, $personalMessage) {
            Api::lockEvent($id);
            Api::event($request, $id);
            $guestId = (string) Str::uuid();
            $invitationId = (string) Str::uuid();
            $now = Api::now();
            DB::table('Guest')->insert($data + ['id' => $guestId, 'eventId' => $id, 'updatedAt' => $now]);
            DB::table('Invitation')->insert($this->tokenFields($invitationId) + [
                'id' => $invitationId, 'eventId' => $id, 'guestId' => $guestId, 'personalMessage' => $personalMessage, 'updatedAt' => $now,
            ]);
            Api::audit($request, 'GUEST_CREATED', $id, 'Guest', $guestId);

            return AdminInvitations::guest(DB::table('Guest')->where('id', $guestId)->first());
        }, 3), 201);
    }

    public function updateGuest(Request $request, string $id): JsonResponse
    {
        AdminInvitations::uuid($id);
        $input = $this->body($request);
        $guestVersion = AdminInvitations::integer($input['expectedVersion'] ?? null, 'expectedVersion');
        $invitationVersion = AdminInvitations::integer($input['expectedInvitationVersion'] ?? null, 'expectedInvitationVersion');
        unset($input['expectedVersion'], $input['expectedInvitationVersion']);
        $data = $this->guestInput($input);
        $personalMessage = $data['personalMessage'];
        unset($data['personalMessage']);
        $eventId = $this->owned($request, 'Guest', $id)->eventId;

        return Api::ok(DB::transaction(function () use ($request, $id, $eventId, $data, $personalMessage, $guestVersion, $invitationVersion) {
            Api::lockEvent($eventId);
            $guest = $this->owned($request, 'Guest', $id);
            $invitation = DB::table('Invitation')->where('guestId', $id)->first();
            $this->checkVersion($guest->version, $guestVersion);
            $this->checkVersion($invitation->version ?? null, $invitationVersion);
            if ($data !== array_replace($data, array_intersect_key((array) $guest, $data))) {
                $this->update('Guest', $id, $guestVersion, $data);
            }
            if ($invitation->personalMessage !== $personalMessage) {
                $this->update('Invitation', $invitation->id, $invitationVersion, ['personalMessage' => $personalMessage]);
            }
            Api::audit($request, 'GUEST_UPDATED', $eventId, 'Guest', $id);

            return AdminInvitations::guest(DB::table('Guest')->where('id', $id)->first());
        }, 3));
    }

    public function archiveGuest(Request $request, string $id): JsonResponse
    {
        return $this->archive($request, $id, true);
    }

    public function restoreGuest(Request $request, string $id): JsonResponse
    {
        return $this->archive($request, $id, false);
    }

    public function deleteGuest(Request $request, string $id): Response
    {
        AdminInvitations::uuid($id);
        $expected = $this->version($request);
        $eventId = $this->owned($request, 'Guest', $id)->eventId;
        DB::transaction(function () use ($request, $id, $expected, $eventId) {
            Api::lockEvent($eventId);
            $guest = $this->owned($request, 'Guest', $id);
            $this->checkVersion($guest->version, $expected);
            $invitation = DB::table('Invitation')->where('guestId', $id)->lockForUpdate()->first();
            if ($invitation) {
                $responders = DB::table('Invitation')->where('familyParentId', $invitation->id)->orderBy('id')->lockForUpdate()->get();
                foreach ($responders as $responder) {
                    $this->deleteInvitation($responder);
                    DB::table('Guest')->where('id', $responder->guestId)->delete();
                }
                $this->deleteInvitation($invitation);
            }
            if (!DB::table('Guest')->where(['id' => $id, 'version' => $expected])->delete()) {
                Api::fail(409, 'VERSION_CONFLICT', 'Dữ liệu đã thay đổi, vui lòng tải lại');
            }
            Api::audit($request, 'GUEST_DELETED', $eventId, 'Guest', $id);
        }, 3);

        return response()->noContent();
    }

    public function invitationLink(Request $request, string $id): JsonResponse
    {
        AdminInvitations::uuid($id);

        return Api::ok(DB::transaction(function () use ($request, $id) {
            $invitation = $this->owned($request, 'Invitation', $id);
            $guest = DB::table('Guest')->where('id', $invitation->guestId)->first();
            $url = AdminInvitations::link($invitation, $guest->fullName);
            $name = $guest->displayName !== '' ? $guest->displayName : $guest->fullName;

            return ['url' => $url, 'message' => "Thân mời $name xem thiệp mời tốt nghiệp: $url"];
        }, 3));
    }

    public function invitationContent(Request $request, string $id): JsonResponse
    {
        AdminInvitations::uuid($id);
        $input = $this->body($request);
        $fields = ['personalMessage' => 1000, 'letterTitle' => 200, 'letterMessage' => 2000];
        AdminInvitations::strict($input, ['expectedVersion', ...array_keys($fields)]);
        $expected = AdminInvitations::integer($input['expectedVersion'] ?? null, 'expectedVersion');
        $data = AdminInvitations::texts($input, $fields);
        $eventId = $this->owned($request, 'Invitation', $id)->eventId;

        return Api::ok(DB::transaction(function () use ($request, $id, $eventId, $expected, $data) {
            Api::lockEvent($eventId);
            $invitation = $this->owned($request, 'Invitation', $id);
            if ($invitation->familyParentId) {
                Api::fail(422, 'FAMILY_RESPONDER', 'Sửa nội dung tại thiệp gia đình');
            }
            $this->checkVersion($invitation->version, $expected);
            if ($data === array_replace($data, array_intersect_key((array) $invitation, $data))) {
                return ['version' => $expected];
            }
            $this->update('Invitation', $id, $expected, $data);
            Api::audit($request, 'INVITATION_CONTENT_UPDATED', $eventId, 'Invitation', $id);

            return ['version' => $expected + 1];
        }, 3));
    }

    public function revokeInvitation(Request $request, string $id): JsonResponse
    {
        return $this->changeInvitation($request, $id, false);
    }

    public function rotateInvitation(Request $request, string $id): JsonResponse
    {
        return $this->changeInvitation($request, $id, true);
    }

    public function invitationRsvp(Request $request, string $id): JsonResponse
    {
        AdminInvitations::uuid($id);
        $input = $this->body($request);
        AdminInvitations::strict($input, ['expectedVersion', 'status', 'note', 'reason']);
        $expected = AdminInvitations::integer($input['expectedVersion'] ?? null, 'expectedVersion', 0);
        $reason = AdminInvitations::text($input['reason'] ?? null, 500, 'reason', 1);
        $data = [
            'status' => AdminInvitations::choice($input['status'] ?? null, ['ATTENDING', 'DECLINED'], 'status'),
            'note' => AdminInvitations::texts($input, [], ['note' => 500])['note'],
        ];
        $eventId = $this->owned($request, 'Invitation', $id)->eventId;

        return Api::ok(DB::transaction(function () use ($request, $id, $eventId, $expected, $reason, $data) {
            Api::lockEvent($eventId);
            $this->owned($request, 'Invitation', $id);
            $rsvp = DB::table('RSVP')->where('invitationId', $id)->first();
            $this->checkVersion($rsvp->version ?? 0, $expected);
            $data['respondedAt'] = Api::now();
            if ($rsvp) {
                $this->update('RSVP', $rsvp->id, $expected, $data);
            } else {
                DB::table('RSVP')->insert($data + ['id' => (string) Str::uuid(), 'invitationId' => $id, 'updatedAt' => $data['respondedAt']]);
            }
            Api::audit($request, 'ADMIN_RSVP_UPDATED', $eventId, 'Invitation', $id, ['reason' => $reason]);

            return AdminInvitations::dates(DB::table('RSVP')->where('invitationId', $id)->first(), ['respondedAt', 'updatedAt']);
        }, 3));
    }

    private function body(Request $request): array
    {
        return AdminInvitations::object($request->isJson() ? json_decode($request->getContent()) : $request->all());
    }

    private function loginIp(Request $request): string
    {
        $ip = (string) $request->ip();
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            // Use the same IPv6 /56 budget as the existing login rate limiter.
            return bin2hex(substr(inet_pton($ip), 0, 7));
        }
        return $ip;
    }

    private function sessionCookie(string $value, int $expires): Cookie
    {
        return Cookie::create('sid', $value, $expires, '/', null, app()->environment('production'), true, false, 'lax');
    }

    private function email(string $value, bool $adminAlias = false): string
    {
        if ($adminAlias) {
            $value = mb_strtolower($value);
        }
        if (!(($adminAlias && $value === 'admin') || (!$adminAlias && $value === '') ||
            preg_match("/^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+\-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/D", $value))) {
            AdminInvitations::invalid('email');
        }

        return $value;
    }

    private function pageNumber(mixed $value, string $field, int $max): int
    {
        return AdminInvitations::integer(is_string($value) && is_numeric($value) ? (float) $value : null, $field, 1, $max);
    }

    private function version(Request $request): int
    {
        $input = $this->body($request);
        AdminInvitations::strict($input, ['expectedVersion']);

        return AdminInvitations::integer($input['expectedVersion'] ?? null, 'expectedVersion');
    }

    private function checkVersion(?int $actual, int $expected): void
    {
        if ($actual !== $expected) {
            Api::fail(409, 'VERSION_CONFLICT', 'Dữ liệu đã thay đổi, vui lòng tải lại');
        }
    }

    private function update(string $table, string $id, int $expected, array $data): void
    {
        $updated = DB::table($table)->where(['id' => $id, 'version' => $expected])
            ->update($data + ['version' => $expected + 1, 'updatedAt' => Api::now()]);
        if (!$updated) {
            Api::fail(409, 'VERSION_CONFLICT', 'Dữ liệu đã thay đổi, vui lòng tải lại');
        }
    }

    private function revision(string $id, ?string $revisionId): ?object
    {
        return $revisionId ? DB::table('EventRevision')->where(['eventId' => $id, 'id' => $revisionId])->first() : null;
    }

    private function eventView(object $event): array
    {
        $revisions = DB::table('EventRevision')->where('eventId', $event->id)
            ->whereIn('id', array_filter([$event->draftRevisionId, $event->publishedRevisionId]))->get()
            ->map(function (object $revision) {
                $data = AdminInvitations::dates($revision, ['createdAt']);
                $data['contentJson'] = json_decode($revision->contentJson);

                return $data;
            })->keyBy('id');

        return [
            'id' => $event->id,
            'version' => $event->version,
            'draftRevisionId' => $event->draftRevisionId,
            'publishedRevisionId' => $event->publishedRevisionId,
            'publishedAt' => Api::iso($event->publishedAt),
            'rsvpEnabled' => (bool) $event->rsvpEnabled,
            'wishesEnabled' => (bool) $event->wishesEnabled,
            'wallEnabled' => (bool) $event->wallEnabled,
            'draft' => $revisions->get($event->draftRevisionId),
            'published' => $revisions->get($event->publishedRevisionId),
        ];
    }

    private function publication(Request $request, string $id, bool $publish): JsonResponse
    {
        AdminInvitations::uuid($id);
        $expected = $this->version($request);

        return Api::ok(DB::transaction(function () use ($request, $id, $publish, $expected) {
            Api::lockEvent($id);
            $event = Api::event($request, $id);
            $this->checkVersion($event->version, $expected);
            $publishedRevisionId = null;
            if ($publish) {
                $revision = $this->revision($id, $event->draftRevisionId);
                if (!$revision) {
                    Api::fail(422, 'DRAFT_REQUIRED', 'Vui lòng lưu bản nháp');
                }
                $content = AdminInvitations::content(json_decode($revision->contentJson));
                $this->validatePublication($content);
                $this->validateMedia($content, true);
                $publishedRevisionId = $revision->id;
            }
            $this->update('Event', $id, $expected, ['publishedRevisionId' => $publishedRevisionId, 'publishedAt' => $publish ? Api::now() : null]);
            Api::audit($request, $publish ? 'PUBLISH' : 'UNPUBLISH', $id, 'Event', $id);

            return $this->eventView(Api::event($request, $id));
        }, 3));
    }

    private function validatePublication(array $content): void
    {
        $errors = [];
        foreach (['ceremony', 'meetup'] as $name) {
            $location = $content[$name];
            if (!$location) {
                continue;
            }
            foreach (['startAt', 'endAt'] as $key) {
                if ($location[$key] === '') {
                    $errors["$name.$key"] = 'Vui lòng điền ngày giờ hợp lệ';
                }
            }
            if ($location['venueName'] === '' || $location['address'] === '') {
                $errors[$name] = 'Thiếu tên hoặc địa chỉ địa điểm';
            }
            if ($location['startAt'] !== '' && $location['endAt'] !== '' &&
                new DateTimeImmutable($location['endAt']) <= new DateTimeImmutable($location['startAt'])) {
                $errors["$name.endAt"] = 'Giờ kết thúc phải sau giờ bắt đầu';
            }
        }
        $deadline = $content['rsvpDeadline'];
        $start = ($content['meetup'] ?? $content['ceremony'])['startAt'];
        if ($deadline === '') {
            $errors['rsvpDeadline'] = 'Vui lòng điền hạn phản hồi hợp lệ';
        } elseif ($deadline !== null && $start !== '' && new DateTimeImmutable($deadline) > new DateTimeImmutable($start)) {
            $errors['rsvpDeadline'] = 'Hạn phản hồi không được sau giờ gặp/lễ';
        }
        foreach (['fullName', 'university', 'major'] as $field) {
            if ($content['host'][$field] === '') {
                $errors["host.$field"] = 'Vui lòng điền thông tin';
            }
        }
        $sections = array_column($content['sections'], 'data', 'type');
        if (empty($sections['hero']['heroAssetId'])) {
            $errors['sections.hero.heroAssetId'] = 'Vui lòng chọn ảnh chính';
        }
        if ($content['music']['enabled'] && empty($content['music']['assetId'])) {
            $errors['music.assetId'] = 'Vui lòng chọn file nhạc';
        }
        if ($sections['map']['locationSource'] === 'MEETUP' && !$content['meetup']) {
            $errors['meetup'] = 'Bản đồ giờ gặp cần thông tin giờ gặp';
        }
        if ($errors) {
            Api::fail(422, 'PUBLICATION_INVALID', 'Vui lòng hoàn thiện nội dung', $errors);
        }
    }

    private function validateMedia(array $content, bool $publish): void
    {
        $media = InvitationViews::media($content);
        if (array_diff(InvitationViews::mediaIds($content), array_keys($media))) {
            Api::fail(422, 'INVALID_MEDIA', 'Media không có sẵn trong bộ tệp của thiệp');
        }
        if (!$publish) {
            return;
        }
        $music = $content['music']['assetId'] ?? null;
        if ($music && $media[$music]['type'] !== 'AUDIO') {
            Api::fail(422, 'INVALID_MEDIA', 'Nhạc phải là file âm thanh');
        }
        $content['music']['assetId'] = null;
        foreach (InvitationViews::mediaIds($content) as $image) {
            if ($media[$image]['type'] !== 'IMAGE') {
                Api::fail(422, 'INVALID_MEDIA', 'Vị trí ảnh phải dùng ảnh');
            }
        }
    }

    private function guestInput(array $input): array
    {
        $optional = ['displayName' => 80, 'groupKey' => 60, 'salutation' => 40, 'email' => 254, 'phone' => 30, 'personalMessage' => 1000];
        AdminInvitations::strict($input, ['guestCode', 'fullName', ...array_keys($optional)]);
        $code = AdminInvitations::text($input['guestCode'] ?? null, 40, 'guestCode', 1);
        if (!preg_match('/^[A-Za-z0-9_-]+$/D', $code)) {
            AdminInvitations::invalid('guestCode');
        }
        $data = ['guestCode' => strtoupper($code), 'fullName' => AdminInvitations::text($input['fullName'] ?? null, 120, 'fullName', 1)]
            + AdminInvitations::texts($input, [], $optional);
        $data['groupKey'] = AdminInvitations::normalizeGroupKey($data['groupKey']);
        $data['email'] = $this->email($data['email']);

        return $data;
    }

    private function owned(Request $request, string $table, string $id): object
    {
        $row = DB::table($table)->where('id', $id)->first();
        if (!$row) {
            Api::fail(404, 'NOT_FOUND', $table === 'Guest' ? 'Không tìm thấy khách' : 'Không tìm thấy thiệp');
        }
        Api::event($request, $row->eventId);

        return $row;
    }

    private function tokenFields(string $id): array
    {
        $data = InvitationTokens::create($id);
        unset($data['token']);

        return $data;
    }

    private function archive(Request $request, string $id, bool $archive): JsonResponse
    {
        AdminInvitations::uuid($id);
        $expected = $this->version($request);
        $eventId = $this->owned($request, 'Guest', $id)->eventId;

        return Api::ok(DB::transaction(function () use ($request, $id, $eventId, $expected, $archive) {
            Api::lockEvent($eventId);
            $this->checkVersion($this->owned($request, 'Guest', $id)->version, $expected);
            $this->update('Guest', $id, $expected, ['archivedAt' => $archive ? Api::now() : null]);
            Api::audit($request, $archive ? 'GUEST_ARCHIVE' : 'GUEST_RESTORE', $eventId, 'Guest', $id);

            return AdminInvitations::guest(DB::table('Guest')->where('id', $id)->first());
        }, 3));
    }

    private function deleteInvitation(object $invitation): void
    {
        $id = $invitation->id;
        $links = DB::table('InvitationLink')->where('invitationId', $id)->lockForUpdate()->get();
        foreach ($links as $link) {
            if ($link->keyVersion !== config('invitation.key_version') && !array_key_exists($link->keyVersion, config('invitation.old_keys', []))) {
                Api::fail(409, 'LINK_KEY_REQUIRED', 'Cần khóa mã hóa cũ để xóa các link đã cấp cho khách này');
            }
            $code = InvitationTokens::decrypt($id, $link->codeCiphertext, $link->keyVersion);
            // Keep reservations for issued codes after removing their credentials.
            DB::table('InvitationLink')->upsert([[
                'codeHash' => InvitationTokens::retiredHash($code, $link->slug),
                'tokenHash' => '',
                'slug' => '',
                'codeCiphertext' => '',
                'keyVersion' => '',
            ]], ['codeHash'], ['codeHash']);
        }
        DB::table('InvitationLink')->where('invitationId', $id)->delete();
        DB::table('RSVP')->where('invitationId', $id)->delete();
        DB::table('Wish')->where('invitationId', $id)->delete();
        DB::table('IdempotencyRecord')->where('actorKeyHash', InvitationTokens::hash($id))
            ->whereIn('scope', ['guest.rsvp', 'guest.wish', 'guest.family-responder'])->delete();
        DB::table('Invitation')->where('id', $id)->delete();
    }

    private function changeInvitation(Request $request, string $id, bool $rotate): JsonResponse
    {
        AdminInvitations::uuid($id);
        $expected = $this->version($request);
        $eventId = $this->owned($request, 'Invitation', $id)->eventId;

        return Api::ok(DB::transaction(function () use ($request, $id, $eventId, $expected, $rotate) {
            Api::lockEvent($eventId);
            $this->checkVersion($this->owned($request, 'Invitation', $id)->version, $expected);
            $revokedAt = $rotate ? null : Api::now();
            $data = $rotate ? $this->tokenFields($id) : [];
            $this->update('Invitation', $id, $expected, $data + ['revokedAt' => $revokedAt]);
            Api::audit($request, $rotate ? 'INVITATION_ROTATE' : 'INVITATION_REVOKE', $eventId, 'Invitation', $id);

            return ['id' => $id, 'version' => $expected + 1, 'revokedAt' => Api::iso($revokedAt)];
        }, 3));
    }
}
