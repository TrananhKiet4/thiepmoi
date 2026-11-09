<?php

namespace App\Services;

use App\Support\Api;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Support\Facades\DB;
use Normalizer;

final class InvitationViews
{
    private const STANDARD_OPENING = 'Thân mời {{guestName}} đến chung vui trong lễ tốt nghiệp của mình. Mình rất mong được gặp bạn và chụp cùng nhau một tấm ảnh để nhớ ngày này.';

    public static function canWrite(bool $enabled, ?string $deadline): bool
    {
        return $enabled && (!$deadline || new DateTimeImmutable() < new DateTimeImmutable($deadline));
    }

    public static function rsvpView(?object $rsvp): ?array
    {
        return $rsvp ? [
            'id' => $rsvp->id, 'status' => $rsvp->status, 'note' => $rsvp->note,
            'version' => (int) $rsvp->version, 'respondedAt' => Api::iso($rsvp->respondedAt),
            'updatedAt' => Api::iso($rsvp->updatedAt),
        ] : null;
    }

    public static function wishView(?object $wish): ?array
    {
        return $wish ? [
            'id' => $wish->id, 'body' => $wish->body, 'consentPublic' => (bool) $wish->consentPublic,
            'consentAttendancePublic' => (bool) $wish->consentAttendancePublic,
            'moderationStatus' => $wish->moderationStatus, 'isPinned' => (bool) $wish->isPinned,
            'approvedAt' => Api::iso($wish->approvedAt), 'deletedAt' => Api::iso($wish->deletedAt),
            'version' => (int) $wish->version, 'createdAt' => Api::iso($wish->createdAt),
            'updatedAt' => Api::iso($wish->updatedAt),
        ] : null;
    }

    public static function mediaIds(array $content): array
    {
        $ids = [$content['music']['assetId'] ?? null, $content['ceremony']['mapImageAssetId'] ?? null, $content['meetup']['mapImageAssetId'] ?? null];
        foreach ($content['sections'] as $section) {
            if ($section['type'] === 'gallery') {
                continue;
            }
            $data = $section['data'];
            $ids[] = $data['coverAssetId'] ?? null;
            $ids[] = $data['heroAssetId'] ?? null;
            foreach ($data['items'] ?? [] as $item) {
                $ids[] = $item['assetId'] ?? $item['imageAssetId'] ?? null;
            }
        }

        return array_values(array_unique(array_filter($ids)));
    }

    public static function media(array $content): array
    {
        $media = array_intersect_key(config('invitation.media', []), array_flip(self::mediaIds($content)));
        foreach ($media as &$asset) {
            unset($asset['originalName']);
        }

        return $media;
    }

    public static function publicWishes(string $eventId, int $limit, ?array $after = null, ?string $exclude = null): array
    {
        $query = DB::table('Wish as w')
            ->join('Invitation as i', 'i.id', '=', 'w.invitationId')
            ->join('Guest as g', 'g.id', '=', 'i.guestId')
            ->leftJoin('RSVP as r', 'r.invitationId', '=', 'i.id')
            ->leftJoin('Invitation as parent', 'parent.id', '=', 'i.familyParentId')
            ->leftJoin('Guest as parentGuest', 'parentGuest.id', '=', 'parent.guestId')
            ->where('i.eventId', $eventId)->whereNull(['i.revokedAt', 'g.archivedAt', 'parent.revokedAt', 'parentGuest.archivedAt'])
            ->where('w.consentPublic', true)->where('w.moderationStatus', 'APPROVED')
            ->whereNull('w.deletedAt')->whereNotNull('w.approvedAt');

        if ($exclude !== null) {
            $query->where('i.id', '<>', $exclude);
        }

        if ($after !== null) {
            $approvedAt = (new DateTimeImmutable($after['a']))->format('Y-m-d H:i:s.v');
            $query->where(function ($query) use ($after, $approvedAt) {
                $query->where(function ($query) use ($after, $approvedAt) {
                    $query->where('w.isPinned', $after['p'])->where(function ($query) use ($after, $approvedAt) {
                        $query->where('w.approvedAt', '<', $approvedAt)
                            ->orWhere(fn ($query) => $query->where('w.approvedAt', $approvedAt)->where('w.id', '<', $after['id']));
                    });
                });
                if ($after['p']) {
                    $query->orWhere('w.isPinned', false);
                }
            });
        }

        $rows = $query->orderByDesc('w.isPinned')->orderByDesc('w.approvedAt')->orderByDesc('w.id')->limit($limit + 1)
            ->get(['w.id', 'w.body', 'w.approvedAt', 'w.isPinned', 'w.consentAttendancePublic', 'g.displayName', 'g.fullName', 'r.status']);
        $items = $rows->take($limit)->map(fn ($row) => [
            'id' => $row->id, 'displayName' => self::displayName($row), 'body' => $row->body,
            'approvedAt' => Api::iso($row->approvedAt), 'isPinned' => (bool) $row->isPinned,
            'attendanceStatus' => $row->consentAttendancePublic && in_array($row->status, ['ATTENDING', 'DECLINED'], true) ? $row->status : null,
        ]);
        $last = $items->last();
        $cursor = $rows->count() > $limit ? rtrim(strtr(base64_encode(json_encode([
            'p' => $last['isPinned'], 'a' => $last['approvedAt'], 'id' => $last['id'],
        ], JSON_THROW_ON_ERROR)), '+/', '-_'), '=') : null;

        return ['items' => $items->all(), 'nextCursor' => $cursor];
    }

    public static function build(object $event, array $content, ?object $guest = null, ?object $invitation = null, bool $preview = false): array
    {
        $card = $invitation;
        $responderName = null;
        if ($invitation?->familyParentId ?? null) {
            $card = DB::table('Invitation')->where('id', $invitation->familyParentId)->first();
            $responderName = self::displayName($guest);
            $guest = DB::table('Guest')->where('id', $card->guestId)->first();
        }

        $displayName = self::displayName($guest) ?? 'Khách xem trước';
        $family = ($guest->groupKey ?? '') === 'gia_dinh';
        $salutation = mb_strtolower(self::normalizeSpace($guest->salutation ?? ''));
        $normalizedName = self::normalizeSpace($displayName);
        $recipientName = $salutation !== '' && str_starts_with(mb_strtolower($normalizedName), $salutation.' ')
            ? mb_substr($normalizedName, mb_strlen($salutation) + 1) : $displayName;
        $aunt = preg_match('/^thím(?:\s|$)/iu', $salutation !== '' ? $salutation : $displayName);
        $senior = preg_match('/^(anh|chị)(?:\s|$)/u', $salutation);
        $junior = preg_match('/^em(?:\s|$)/u', $salutation);
        $address = $salutation !== '' ? $salutation : ($family ? 'đại gia đình' : ($aunt ? $displayName : 'bạn'));
        $recipientAddress = $address === 'đại gia đình' ? 'cả nhà' : $address;
        $headingAddress = preg_replace('/^(anh|chị) hai$/u', '$1', $recipientAddress);
        $greeting = $family ? 'Thương gửi' : (preg_match('/^(bạn|em)(?:\s|$)/u', $salutation) ? 'Thân gửi' : 'Kính gửi');
        $invite = $family ? 'Thương mời' : ($senior || $aunt ? 'Kính mời' : 'Thân mời');
        $speaker = $salutation === 'em yêu' ? 'anh' : ($family || $aunt ? 'con' : ($senior ? 'em' : ($junior ? 'anh' : 'mình')));
        $vars = ['{{guestName}}' => $recipientName, '{{hostName}}' => $content['host']['fullName'], '{{salutation}}' => $guest->salutation ?? 'bạn'];
        $sharedOpening = '';

        foreach ($content['sections'] as &$section) {
            $data = &$section['data'];
            switch ($section['type']) {
                case 'opening':
                    $sharedOpening = $data['messageTemplate'];
                    if ($data['title'] === 'Một lời mời dành riêng cho bạn') {
                        $data['title'] = 'MỘT LỜI MỜI DÀNH RIÊNG CHO';
                    }
                    break;
                case 'response':
                    $data['title'] = self::pronouns($data['title'], $speaker, $recipientAddress);
                    $data['wishIntro'] = self::pronouns($data['wishIntro'], $speaker, $address);
                    break;
                case 'closing':
                    foreach (['message', 'attendingMessage', 'declinedMessage'] as $key) {
                        $data[$key] = self::pronouns($data[$key] ?? '', $speaker, $address);
                    }
                    break;
                case 'invitation':
                    $letterVars = array_replace($vars, ['{{salutation}}' => $address]);
                    $message = $card->letterMessage ?? '';
                    if ($message === '') {
                        $lead = '/^\s*(?:mình\s+)?trân trọng mời bạn(?=\s|[.,!]|$)/iu';
                        $message = $data['message'];
                        if (preg_match($lead, $message)) {
                            $message = "Trân trọng mời $address đến chụp hình và lưu giữ những kỷ niệm trong ngày tốt nghiệp của $speaker.";
                        }
                    }
                    $title = $card->letterTitle ?? '';
                    $data['title'] = $title !== '' ? strtr($title, $letterVars)
                        : (mb_strtolower($data['title']) === 'hẹn bạn trong ngày đặc biệt' ? "Hẹn $headingAddress trong ngày đặc biệt" : $data['title']);
                    $data['message'] = strtr($message, $letterVars);
                    break;
            }
        }
        unset($section, $data);

        $customOpening = $card->personalMessage ?? '';
        if ($customOpening === '') {
            $customOpening = ((array) ($content['groupMessages'] ?? []))[$guest->groupKey ?? ''] ?? '';
        }
        $opening = $customOpening === '' && $sharedOpening === self::STANDARD_OPENING
            ? "$invite $recipientName đến chung vui trong lễ tốt nghiệp của $speaker. ".self::sentenceCase($speaker)." rất mong được gặp $address và chụp cùng nhau một tấm ảnh để nhớ ngày này."
            : strtr($customOpening !== '' ? $customOpening : $sharedOpening, $vars);

        $shared = (bool) ($invitation->allowMultipleResponses ?? false);
        $rsvp = $invitation && !$shared ? DB::table('RSVP')->where('invitationId', $invitation->id)->first() : null;
        $wish = $invitation && !$shared ? DB::table('Wish')->where('invitationId', $invitation->id)->first() : null;
        $canRsvp = !$preview && self::canWrite((bool) $event->rsvpEnabled, $content['rsvpDeadline'] ?? null);
        $canWish = !$preview && self::canWrite((bool) $event->wishesEnabled, $content['wishDeadline'] ?? null);
        $content['groupMessages'] = (object) ($content['groupMessages'] ?? []);

        return [
            'content' => $content, 'media' => (object) self::media($content),
            'guest' => [
                'displayName' => $displayName, 'recipientName' => $recipientName, 'fullName' => $guest->fullName ?? $displayName,
                'salutation' => $guest->salutation ?? '', 'recipientGreeting' => $greeting, 'recipientAddress' => $recipientAddress,
            ],
            'personalMessage' => $opening, 'rsvp' => self::rsvpView($rsvp), 'wish' => self::wishView($wish),
            'canRsvp' => !$shared && $canRsvp, 'canCreateOrEditWish' => !$shared && $canWish,
            'canWithdrawWish' => !$preview && $wish !== null && $wish->deletedAt === null,
            'eventId' => $event->id, 'wallEnabled' => (bool) $event->wallEnabled,
            ...($shared ? ['familyReply' => ['canRegister' => $canRsvp || $canWish]] : []),
            ...($responderName !== null && $responderName !== '' ? ['responderName' => $responderName] : []),
            ...($preview ? ['preview' => true] : []),
            ...($preview && $event->wallEnabled ? ['previewWishes' => self::publicWishes($event->id, 6, exclude: $invitation?->id)['items']] : []),
        ];
    }

    public static function calendar(string $eventId, array $content): string
    {
        $location = $content['meetup'] ?? $content['ceremony'];
        $utc = new DateTimeZone('UTC');
        $date = fn (string $value) => (new DateTimeImmutable($value, $utc))->setTimezone($utc)->format('Ymd\THis\Z');
        $escape = fn (string $value) => str_replace(['\\', "\r\n", "\n", ';', ','], ['\\\\', '\\n', '\\n', '\\;', '\\,'], $value);
        $lines = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Graduation Invitation//VI', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
            "UID:$eventId@graduation-invitation", 'DTSTAMP:'.$date('now'), 'DTSTART:'.$date($location['startAt']), 'DTEND:'.$date($location['endAt']),
            'SUMMARY:'.$escape('Tốt nghiệp — '.$content['host']['fullName']), 'LOCATION:'.$escape($location['venueName'].' — '.$location['address']),
            'END:VEVENT', 'END:VCALENDAR',
        ];
        $calendar = '';
        foreach ($lines as $line) {
            $current = '';
            foreach (mb_str_split($line) as $char) {
                if (strlen($current.$char) > 73) {
                    $calendar .= $current."\r\n";
                    $current = ' ';
                }
                $current .= $char;
            }
            $calendar .= $current."\r\n";
        }

        return $calendar;
    }

    private static function displayName(?object $guest): ?string
    {
        return ($guest->displayName ?? '') !== '' ? $guest->displayName : ($guest->fullName ?? null);
    }

    private static function normalizeSpace(string $value): string
    {
        return trim(preg_replace('/[\s\x{FEFF}]+/u', ' ', Normalizer::normalize($value)));
    }

    private static function sentenceCase(string $value): string
    {
        return mb_strtoupper(mb_substr($value, 0, 1)).mb_substr($value, 1);
    }

    private static function pronouns(string $value, string $speaker, string $recipient): string
    {
        return preg_replace_callback('/(?<![\p{L}\p{M}])(?:bạn(?!\s+bè(?![\p{L}\p{M}]))|mình)(?![\p{L}\p{M}])/iu', function ($match) use ($speaker, $recipient) {
            $lower = mb_strtolower($match[0]);
            $replacement = $lower === 'bạn' ? $recipient : $speaker;

            return $match[0] === $lower ? $replacement : self::sentenceCase($replacement);
        }, $value);
    }
}
