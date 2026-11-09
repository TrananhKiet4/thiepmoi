<?php

use App\Services\InvitationViews;
use Illuminate\Config\Repository;
use Illuminate\Database\Capsule\Manager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Facade;

require_once __DIR__.'/../vendor/autoload.php';
$container = new Illuminate\Container\Container;
$container->instance('config', new Repository);
$capsule = new Manager($container);
$capsule->addConnection(['driver' => 'sqlite', 'database' => ':memory:']);
$container = $capsule->getContainer();
$container->instance('db', $capsule->getDatabaseManager());
Illuminate\Container\Container::setInstance($container);
Facade::setFacadeApplication($container);

$event = (object) ['id' => 'fixture', 'wallEnabled' => false, 'rsvpEnabled' => true, 'wishesEnabled' => true];
$guest = (object) ['displayName' => 'Chị hai Khách', 'fullName' => 'Khách', 'salutation' => 'Chị hai', 'groupKey' => 'club'];
$content = [
    'host' => ['fullName' => 'Người mời'],
    'ceremony' => ['startAt' => '2026-11-10T08:00:00+07:00', 'endAt' => '2026-11-10T09:00:00+07:00', 'venueName' => str_repeat('Nguyễn ', 15), 'address' => 'A, B'],
    'music' => [],
    'sections' => [
        ['type' => 'invitation', 'data' => ['title' => 'Hẹn bạn trong ngày đặc biệt', 'message' => 'Mình trân trọng mời bạn, nếu bạn có thời gian.']],
        ['type' => 'response', 'data' => ['title' => 'Bạn sẽ đến chứ?', 'wishIntro' => 'Mình mong được gặp bạn cùng bạn bè.']],
    ],
];

$preview = InvitationViews::build($event, $content, $guest, preview: true);
assert($preview['guest']['recipientName'] === 'Khách');
assert($preview['content']['sections'][0]['data'] === ['title' => 'Hẹn chị trong ngày đặc biệt', 'message' => 'Trân trọng mời chị hai đến chụp hình và lưu giữ những kỷ niệm trong ngày tốt nghiệp của em.']);
assert($preview['content']['sections'][1]['data']['wishIntro'] === 'Em mong được gặp chị hai cùng bạn bè.');
assert($preview['canRsvp'] === false && $preview['canCreateOrEditWish'] === false && !isset($preview['previewWishes']));
assert(json_encode($preview['media']) === '{}');
$templates = $content;
$templates['sections'] = [
    ['type' => 'opening', 'data' => ['title' => 'MỘT LỜI MỜI DÀNH RIÊNG CHO', 'messageTemplate' => '{{invitationGreeting}} {{guestName}}. {{Speaker}} mong gặp {{recipientAddress}}.']],
    ['type' => 'invitation', 'data' => ['title' => 'Hẹn {{headingAddress}} trong ngày đặc biệt', 'message' => 'Mời {{recipientAddress}} chụp ảnh cùng {{speaker}}.']],
    ['type' => 'response', 'data' => ['title' => '{{HeadingAddress}} sẽ đến chứ?', 'wishIntro' => '{{Speaker}} mong đọc lời chúc của {{recipientAddress}}.', 'wishTitle' => 'Gửi lời chúc tới {{hostName}}']],
    ['type' => 'closing', 'data' => ['message' => 'Cảm ơn {{recipientAddress}}. {{Speaker}} rất trân trọng.']],
];
$templated = InvitationViews::build($event, $templates, $guest, preview: true);
assert($templated['personalMessage'] === 'Kính mời Khách. Em mong gặp chị hai.');
assert($templated['content']['sections'][1]['data'] === ['title' => 'Hẹn chị trong ngày đặc biệt', 'message' => 'Mời chị hai chụp ảnh cùng em.']);
assert($templated['content']['sections'][2]['data']['title'] === 'Chị sẽ đến chứ?');
assert($templated['content']['sections'][2]['data']['wishTitle'] === 'Gửi lời chúc tới Người mời');
assert($templated['content']['sections'][3]['data']['message'] === 'Cảm ơn chị hai. Em rất trân trọng.');
$calendar = InvitationViews::calendar('fixture', $content);
assert(str_contains($calendar, "DTSTART:20261110T010000Z\r\n"));
assert(str_contains(str_replace("\r\n ", '', $calendar), 'A\\, B'));
foreach (explode("\r\n", $calendar) as $line) {
    assert(strlen($line) <= 73 && mb_check_encoding($line, 'UTF-8'));
}

DB::unprepared(<<<'SQL'
CREATE TABLE Guest (id TEXT PRIMARY KEY, displayName TEXT, fullName TEXT, archivedAt TEXT);
CREATE TABLE Invitation (id TEXT PRIMARY KEY, eventId TEXT, guestId TEXT, revokedAt TEXT, familyParentId TEXT);
CREATE TABLE RSVP (invitationId TEXT, status TEXT);
CREATE TABLE Wish (id TEXT PRIMARY KEY, invitationId TEXT, body TEXT, approvedAt TEXT, deletedAt TEXT, isPinned INTEGER, consentPublic INTEGER, moderationStatus TEXT, consentAttendancePublic INTEGER);
INSERT INTO Guest (id, displayName, fullName) VALUES ('guest1', '', 'Khách A'), ('guest2', 'Khách B', 'B'), ('guest3', '', 'Khách C');
INSERT INTO Invitation (id, eventId, guestId) VALUES ('i1', 'fixture', 'guest1'), ('i2', 'fixture', 'guest2'), ('i3', 'fixture', 'guest3');
INSERT INTO RSVP VALUES ('i1', 'DECLINED'), ('i2', 'ATTENDING');
INSERT INTO Wish VALUES
 ('00000000-0000-4000-8000-000000000003', 'i1', 'First', '2026-11-10 01:00:00.000', NULL, 1, 1, 'APPROVED', 0),
 ('00000000-0000-4000-8000-000000000002', 'i2', 'Second', '2026-11-10 01:00:00.000', NULL, 1, 1, 'APPROVED', 1),
 ('00000000-0000-4000-8000-000000000001', 'i3', 'Third', '2026-11-10 01:00:00.000', NULL, 0, 1, 'APPROVED', 0);
SQL);
$first = InvitationViews::publicWishes('fixture', 1);
assert($first['items'][0]['body'] === 'First' && $first['items'][0]['attendanceStatus'] === null);
$cursor = json_decode(base64_decode(strtr($first['nextCursor'], '-_', '+/')), true);
$second = InvitationViews::publicWishes('fixture', 1, $cursor);
assert($second['items'][0]['body'] === 'Second' && $second['items'][0]['attendanceStatus'] === 'ATTENDING');
$cursor = json_decode(base64_decode(strtr($second['nextCursor'], '-_', '+/')), true);
$third = InvitationViews::publicWishes('fixture', 1, $cursor);
assert($third['items'][0]['body'] === 'Third' && $third['nextCursor'] === null);
