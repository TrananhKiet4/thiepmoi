<?php

namespace App\Services;

use App\Support\Api;
use App\Support\InvitationTokens;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Normalizer;

final class AdminInvitations
{
    public static function invalid(string $field = '', string $message = 'Giá trị không hợp lệ'): never
    {
        Api::fail(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [$field => $message]);
    }

    public static function object(mixed $value, string $field = ''): array
    {
        if (is_object($value) || (is_array($value) && ($value === [] || !array_is_list($value)))) {
            return (array) $value;
        }

        self::invalid($field);
    }

    public static function strict(array $data, array $keys, string $field = ''): void
    {
        if (array_diff(array_keys($data), $keys)) {
            self::invalid($field, 'Có trường không được hỗ trợ');
        }
    }

    public static function text(mixed $value, int $max, string $field, int $min = 0, bool $trim = true): string
    {
        if (!is_string($value)) {
            self::invalid($field);
        }
        if ($trim) {
            $value = self::trim($value);
        }
        $length = strlen(mb_convert_encoding($value, 'UTF-16LE', 'UTF-8')) / 2;
        if ($length < $min || $length > $max) {
            self::invalid($field);
        }

        return $value;
    }

    public static function trim(string $value): string
    {
        return preg_replace('/^[\s\x{FEFF}]+|[\s\x{FEFF}]+$/u', '', $value);
    }

    public static function uuid(mixed $value, string $field = ''): string
    {
        if (!is_string($value) || !preg_match('/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iD', $value)) {
            self::invalid($field);
        }

        return $value;
    }

    public static function integer(mixed $value, string $field, int $min = 1, int $max = 9007199254740991): int
    {
        if ((!is_int($value) && !is_float($value)) || floor($value) != $value || $value < $min || $value > $max) {
            self::invalid($field);
        }

        return (int) $value;
    }

    public static function choice(mixed $value, array $choices, string $field): string
    {
        if (!in_array($value, $choices, true)) {
            self::invalid($field);
        }

        return $value;
    }

    public static function normalizeGroupKey(string $value): string
    {
        $value = Normalizer::normalize($value, Normalizer::FORM_D);
        $value = preg_replace('/\p{M}/u', '', $value);
        $value = strtolower(str_replace(['đ', 'Đ'], 'd', $value));

        return trim(preg_replace('/[^a-z0-9_-]+/', '_', $value), '_');
    }

    public static function content(mixed $value): array
    {
        $content = self::object($value, 'content');
        self::strict($content, ['schemaVersion', 'host', 'contact', 'ceremony', 'meetup', 'rsvpDeadline', 'wishDeadline', 'timezone', 'theme', 'music', 'groupMessages', 'sections'], 'content');
        self::integer($content['schemaVersion'] ?? null, 'content.schemaVersion', 1, 1);
        $theme = self::object($content['theme'] ?? null, 'content.theme');
        $music = self::object($content['music'] ?? null, 'content.music');
        $volume = array_key_exists('volume', $music) ? $music['volume'] : .25;
        if ((!is_int($volume) && !is_float($volume)) || $volume < 0 || $volume > 1) {
            self::invalid('content.music.volume');
        }
        $messages = self::object(array_key_exists('groupMessages', $content) ? $content['groupMessages'] : [], 'content.groupMessages');
        if (count($messages) > 100) {
            self::invalid('content.groupMessages', 'Tối đa 100 mẫu nhóm');
        }
        foreach ($messages as $key => $message) {
            self::text((string) $key, 60, 'content.groupMessages', trim: false);
            $messages[$key] = self::text($message, 1000, 'content.groupMessages.'.$key);
        }
        $sections = self::items($content['sections'] ?? null, 16, 'content.sections');
        if ($sections === []) {
            self::invalid('content.sections');
        }
        $seenIds = $seenTypes = [];
        foreach ($sections as $i => $section) {
            $section = self::section($section, "content.sections.$i");
            if (isset($seenIds[$section['id']]) || array_key_exists($section['type'], $seenTypes)) {
                self::invalid('content.sections', 'Mỗi chặng và ID chỉ được xuất hiện một lần');
            }
            $seenIds[$section['id']] = true;
            $seenTypes[$section['type']] = $section['enabled'];
            $sections[$i] = $section;
        }
        foreach (['opening', 'hero', 'invitation', 'map', 'response'] as $type) {
            if (!($seenTypes[$type] ?? false)) {
                self::invalid('content.sections', "Không thể bỏ chặng $type");
            }
        }

        $result = [
            'schemaVersion' => 1,
            'host' => self::texts(self::object($content['host'] ?? null, 'content.host'), ['fullName' => 120, 'university' => 200, 'major' => 200], ['cohort' => 80], 'content.host'),
            'ceremony' => self::location($content['ceremony'] ?? null, 'content.ceremony'),
            'meetup' => isset($content['meetup']) ? self::location($content['meetup'], 'content.meetup') : null,
            'rsvpDeadline' => isset($content['rsvpDeadline']) ? self::date($content['rsvpDeadline'], 'content.rsvpDeadline', true) : null,
            'wishDeadline' => isset($content['wishDeadline']) ? self::date($content['wishDeadline'], 'content.wishDeadline') : null,
            'timezone' => self::choice(array_key_exists('timezone', $content) ? $content['timezone'] : 'Asia/Ho_Chi_Minh', ['Asia/Ho_Chi_Minh'], 'content.timezone'),
            'theme' => [
                'palette' => self::choice(array_key_exists('palette', $theme) ? $theme['palette'] : 'cream', ['cream', 'sage', 'rose', 'blue'], 'content.theme.palette'),
                'font' => self::choice(array_key_exists('font', $theme) ? $theme['font'] : 'serif', ['serif', 'sans', 'lora', 'be-vietnam-pro'], 'content.theme.font'),
            ],
            'music' => [
                'enabled' => self::boolean($music['enabled'] ?? null, 'content.music.enabled'),
                'volume' => $volume,
                'loop' => self::boolean(array_key_exists('loop', $music) ? $music['loop'] : true, 'content.music.loop'),
            ],
            'groupMessages' => (object) $messages,
            'sections' => $sections,
        ];
        if (array_key_exists('assetId', $music)) {
            $result['music']['assetId'] = isset($music['assetId']) ? self::uuid($music['assetId'], 'content.music.assetId') : null;
        }
        if (array_key_exists('contact', $content)) {
            $contact = self::texts(self::object($content['contact'], 'content.contact'), [], ['phone' => 30, 'facebookUrl' => 2048], 'content.contact');
            if ($contact['phone'] !== '' && !preg_match('/^\+?\d{7,15}$/D', str_replace(['(', ')', ' ', '.', '-'], '', $contact['phone']))) {
                self::invalid('content.contact.phone', 'Nhập số điện thoại hợp lệ');
            }
            if ($contact['facebookUrl'] !== '') {
                $url = self::https($contact['facebookUrl']);
                if (!$url || !in_array($url['host'], ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'www.fb.com'], true) || $url['path'] === '/') {
                    self::invalid('content.contact.facebookUrl', 'Nhập link Facebook HTTPS hợp lệ');
                }
            }
            $result['contact'] = $contact;
        }

        return $result;
    }

    public static function texts(array $data, array $required, array $defaults = [], string $prefix = ''): array
    {
        $result = [];
        foreach ($required + $defaults as $key => $max) {
            $value = array_key_exists($key, $data) ? $data[$key] : (isset($defaults[$key]) ? '' : null);
            $result[$key] = self::text($value, $max, $prefix === '' ? $key : "$prefix.$key");
        }

        return $result;
    }

    public static function boolean(mixed $value, string $field): bool
    {
        if (!is_bool($value)) {
            self::invalid($field);
        }

        return $value;
    }

    private static function items(mixed $value, int $max, string $field): array
    {
        if (!is_array($value) || !array_is_list($value) || count($value) > $max) {
            self::invalid($field);
        }

        return $value;
    }

    private static function date(mixed $value, string $field, bool $blank = false): string
    {
        if ($blank && $value === '') {
            return '';
        }
        if (!is_string($value) || !preg_match('/^(\d{4})-(\d\d)-(\d\d)T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d\d(?::?\d\d))$/D', $value, $date)) {
            self::invalid($field);
        }
        if (!checkdate((int) $date[2], (int) $date[3], (int) $date[1])) {
            self::invalid($field);
        }

        return $value;
    }

    private static function https(string $value): ?array
    {
        $url = parse_url(str_replace('\\', '/', $value));
        if (!$url || strtolower($url['scheme'] ?? '') !== 'https' || !isset($url['host']) || isset($url['user']) || isset($url['pass']) || (isset($url['port']) && $url['port'] !== 443)) {
            return null;
        }
        $url['host'] = strtolower($url['host']);
        $url['path'] ??= '/';

        return $url;
    }

    private static function location(mixed $value, string $field): array
    {
        $data = self::object($value, $field);
        $fields = self::texts($data, ['venueName' => 200, 'address' => 500], ['googleMapsUrl' => 2048, 'entranceNote' => 1000], $field);
        if ($fields['googleMapsUrl'] !== '') {
            $url = self::https($fields['googleMapsUrl']);
            $path = $url['path'] ?? '';
            $valid = match ($url['host'] ?? null) {
                'maps.app.goo.gl' => $path !== '/',
                'maps.google.com' => $path === '/' || preg_match('#^/maps(?:/|$)#', $path),
                'goo.gl' => str_starts_with($path, '/maps/'),
                'google.com', 'www.google.com', 'google.com.vn', 'www.google.com.vn' => preg_match('#^/maps(?:/|$)#', $path),
                default => false,
            };
            if (!$valid) {
                self::invalid("$field.googleMapsUrl", 'Nhập link Google Maps HTTPS hợp lệ');
            }
        }

        return $fields + [
            'startAt' => self::date($data['startAt'] ?? null, "$field.startAt", true),
            'endAt' => self::date($data['endAt'] ?? null, "$field.endAt", true),
            'mapImageAssetId' => isset($data['mapImageAssetId']) ? self::uuid($data['mapImageAssetId'], "$field.mapImageAssetId") : null,
        ];
    }

    private static function section(mixed $value, string $field): array
    {
        $section = self::object($value, $field);
        $type = self::choice($section['type'] ?? null, ['opening', 'hero', 'story', 'gallery', 'invitation', 'map', 'response', 'closing'], "$field.type");
        $data = self::object($section['data'] ?? null, "$field.data");
        $prefix = "$field.data";
        $fields = match ($type) {
            'opening' => self::texts($data, ['title' => 200, 'messageTemplate' => 1000], [], $prefix),
            'hero' => self::texts($data, ['title' => 200], ['subtitle' => 500], $prefix),
            'invitation' => self::texts($data, ['title' => 200, 'message' => 2000], [], $prefix),
            'map' => self::texts($data, ['title' => 200, 'instructions' => 1000], [], $prefix),
            'response' => self::texts($data, ['title' => 200, 'rsvpIntro' => 1000, 'wishIntro' => 1000], [], $prefix),
            'closing' => self::texts($data, ['message' => 2000], ['attendingMessage' => 1000, 'declinedMessage' => 1000], $prefix),
            default => [],
        };
        $asset = match ($type) {
            'opening' => 'coverAssetId',
            'hero' => 'heroAssetId',
            default => null,
        };
        if ($asset && array_key_exists($asset, $data)) {
            $fields[$asset] = isset($data[$asset]) ? self::uuid($data[$asset], "$prefix.$asset") : null;
        }
        if ($type === 'map') {
            $fields['locationSource'] = self::choice($data['locationSource'] ?? null, ['CEREMONY', 'MEETUP'], "$prefix.locationSource");
            if (array_key_exists('notes', $data)) {
                $fields['notes'] = self::text($data['notes'], 2400, "$prefix.notes");
            }
        }
        if ($type === 'response' && array_key_exists('wishTitle', $data)) {
            $fields['wishTitle'] = self::text($data['wishTitle'], 200, "$prefix.wishTitle");
        }
        if ($type === 'story' || $type === 'gallery') {
            if ($type === 'gallery' && array_key_exists('title', $data)) {
                $fields['title'] = self::text($data['title'], 200, "$prefix.title");
            }
            if ($type === 'story') {
                foreach (['title' => 200, 'intro' => 1000] as $key => $max) {
                    if (array_key_exists($key, $data)) {
                        $fields[$key] = self::text($data[$key], $max, "$prefix.$key");
                    }
                }
            }
            $items = self::items($data['items'] ?? null, $type === 'story' ? 12 : 40, "$prefix.items");
            foreach ($items as $i => $item) {
                $path = "$prefix.items.$i";
                $item = self::object($item, $path);
                if ($type === 'gallery') {
                    $items[$i] = self::texts($item, ['caption' => 500], [], $path) + ['assetId' => self::uuid($item['assetId'] ?? null, "$path.assetId")];
                } else {
                    $items[$i] = self::texts($item, ['id' => 80, 'label' => 100, 'title' => 200, 'body' => 3000], [], $path);
                    if (array_key_exists('imageAssetId', $item)) {
                        $items[$i]['imageAssetId'] = isset($item['imageAssetId']) ? self::uuid($item['imageAssetId'], "$path.imageAssetId") : null;
                    }
                    if (isset($item['image'])) {
                        $image = self::object($item['image'], "$path.image");
                        self::strict($image, ['url', 'width', 'height']);
                        $url = self::text($image['url'] ?? null, 200, "$path.image.url", 1);
                        if (!preg_match('~^/invitation-assets/story/[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$~D', $url)) {
                            self::invalid("$path.image.url", 'Đường dẫn ảnh không hợp lệ');
                        }
                        $items[$i]['image'] = [
                            'url' => $url,
                            'width' => self::integer($image['width'] ?? null, "$path.image.width", 1, 1600),
                            'height' => self::integer($image['height'] ?? null, "$path.image.height", 1, 1600),
                        ];
                    }
                }
            }
            $fields['items'] = $items;
        }

        return [
            'id' => self::text($section['id'] ?? null, 80, "$field.id", 1, false),
            'type' => $type,
            'enabled' => self::boolean($section['enabled'] ?? null, "$field.enabled"),
            'order' => self::integer($section['order'] ?? null, "$field.order", 0, 100),
            'data' => $fields,
        ];
    }

    public static function guests(Request $request, string $eventId, ?string $archived = null): Builder
    {
        $query = $request->query();
        $archived = self::choice($archived ?? ($query['archived'] ?? 'false'), ['true', 'false', 'all'], 'archived');
        $search = self::text($query['q'] ?? '', 120, 'q');
        $group = self::text($query['group'] ?? '', 60, 'group', trim: false);
        $status = self::choice($query['status'] ?? '', ['', 'ATTENDING', 'DECLINED', 'UNANSWERED'], 'status');
        $guests = DB::table('Guest')->where('Guest.eventId', $eventId);
        if ($archived !== 'all') {
            $guests->whereNull('Guest.archivedAt', not: $archived === 'true');
        }
        if ($group !== '') {
            $guests->where('Guest.groupKey', $group);
        }
        if ($search !== '') {
            $pattern = '%'.strtr($search, ['=' => '==', '%' => '=%', '_' => '=_']).'%';
            $guests->where(function (Builder $query) use ($pattern) {
                foreach (['fullName', 'displayName', 'guestCode'] as $column) {
                    $query->orWhereRaw("BINARY LOWER(Guest.$column) LIKE BINARY LOWER(?) ESCAPE '='", [$pattern]);
                }
            });
        }
        if ($status !== '') {
            $guests->whereExists(function (Builder $query) use ($status) {
                $query->selectRaw('1')->from('Invitation as filtered_invitation')
                    ->leftJoin('RSVP as filtered_rsvp', 'filtered_rsvp.invitationId', '=', 'filtered_invitation.id')
                    ->whereColumn('filtered_invitation.guestId', 'Guest.id');
                if ($status === 'UNANSWERED') {
                    $query->whereNull('filtered_rsvp.id');
                } else {
                    $query->where('filtered_rsvp.status', $status);
                }
            });
        }

        return $guests;
    }

    public static function guest(object $guest, ?object $invitation = null): array
    {
        return self::guestViews([$guest], $invitation ? [$invitation] : null)[0];
    }

    public static function guestViews(iterable $guests, ?iterable $invitations = null): array
    {
        $guests = collect($guests);
        if ($guests->isEmpty()) {
            return [];
        }
        $invitations = collect($invitations ?? DB::table('Invitation')->whereIn('guestId', $guests->pluck('id'))->get())->keyBy('guestId');
        $ids = $invitations->pluck('id');
        $rsvps = DB::table('RSVP')->whereIn('invitationId', $ids)->get()->keyBy('invitationId');
        $wishes = DB::table('Wish')->whereIn('invitationId', $ids)->get()->keyBy('invitationId');

        return $guests->map(function ($guest) use ($invitations, $rsvps, $wishes) {
            $invitation = $invitations->get($guest->id);
            $fields = self::dates($guest, ['archivedAt', 'createdAt', 'updatedAt']);
            $fields['personalMessage'] = $invitation->personalMessage ?? '';
            $fields['invitation'] = null;
            if ($invitation) {
                $wish = $wishes->get($invitation->id);
                $wish = self::dates($wish, ['approvedAt', 'deletedAt', 'createdAt', 'updatedAt']);
                if ($wish) {
                    foreach (['consentPublic', 'consentAttendancePublic', 'isPinned'] as $field) {
                        $wish[$field] = (bool) $wish[$field];
                    }
                }
                $fields['invitation'] = [
                    'id' => $invitation->id,
                    'version' => $invitation->version,
                    'personalMessage' => $invitation->personalMessage,
                    'letterTitle' => $invitation->letterTitle,
                    'letterMessage' => $invitation->letterMessage,
                    'revokedAt' => Api::iso($invitation->revokedAt),
                    'openedAt' => Api::iso($invitation->openedAt),
                    'lastOpenedAt' => Api::iso($invitation->lastOpenedAt),
                    'rsvp' => self::dates($rsvps->get($invitation->id), ['respondedAt', 'updatedAt']),
                    'wish' => $wish,
                    'familyResponder' => (bool) $invitation->familyParentId,
                ];
            }

            return $fields;
        })->values()->all();
    }

    public static function dates(?object $row, array $fields): ?array
    {
        if (!$row) {
            return null;
        }
        $data = (array) $row;
        foreach ($fields as $field) {
            $data[$field] = Api::iso($data[$field]);
        }

        return $data;
    }

    public static function link(object $invitation, string $fullName): string
    {
        $slug = trim(preg_replace('/[_-]+/', '-', self::normalizeGroupKey($fullName)), '-');
        $slug = $slug === '' ? 'khach-moi' : $slug;
        $invitation = DB::table('Invitation')->where('id', $invitation->id)->lockForUpdate()->first();
        if (!$invitation) {
            Api::fail(404, 'NOT_FOUND', 'Không tìm thấy thiệp');
        }
        $link = DB::table('InvitationLink')->where('invitationId', $invitation->id)->where('slug', $slug)
            ->where(fn (Builder $query) => $query->where('tokenHash', $invitation->tokenHash)->orWhere('restoredTokenHash', $invitation->tokenHash))
            ->orderBy('createdAt')->orderBy('codeHash')->lockForUpdate()->first();
        if ($link) {
            $code = InvitationTokens::decrypt($invitation->id, $link->codeCiphertext, $link->keyVersion);

            return config('invitation.origin')."/i/$code/$slug";
        }
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $code = InvitationTokens::shortCode();
            $hashes = InvitationTokens::shortHashes($code, $slug);
            $used = DB::table('InvitationLink')->whereIn('codeHash', [...$hashes, InvitationTokens::retiredHash($code, $slug)])
                ->sharedLock()->first(['codeHash']);
            if ($used) {
                continue;
            }
            $encrypted = InvitationTokens::encrypt($invitation->id, $code);
            try {
                DB::table('InvitationLink')->insert([
                    'invitationId' => $invitation->id,
                    'tokenHash' => $invitation->tokenHash,
                    'slug' => $slug,
                    'codeHash' => $hashes[0],
                    'codeCiphertext' => $encrypted['tokenCiphertext'],
                    'keyVersion' => $encrypted['keyVersion'],
                ]);

                return config('invitation.origin')."/i/$code/$slug";
            } catch (UniqueConstraintViolationException) {
                // A competing allocation reserved this code after the lookup.
            }
        }

        Api::fail(503, 'LINK_UNAVAILABLE', 'Chưa tạo được link ngắn, hãy thử lại');
    }
}
