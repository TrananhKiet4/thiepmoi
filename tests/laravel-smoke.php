<?php

declare(strict_types=1);

$appRoot = $argv[1] ?? dirname(__DIR__);
require $appRoot.'/vendor/autoload.php';

use App\Support\Api;
use App\Support\InvitationTokens;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$password = getenv('MARIADB_TEST_PASSWORD');
check(is_string($password) && $password !== '', 'Set MARIADB_TEST_PASSWORD for the disposable local server.');
$input = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
$fixture = $input['content'];
$dbName = 'thiepmoi_smoke_'.bin2hex(random_bytes(4));
$server = new PDO('mysql:host=127.0.0.1;port=53329;charset=utf8mb4', 'root', $password, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$server->exec('CREATE DATABASE `'.$dbName.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
$requests = 0;
$createdUser = false;
try {
    $server->exec('USE `'.$dbName.'`');
    $server->exec(file_get_contents($appRoot.'/database/schema.mariadb.sql'));
    $databaseUser = 'smoke_'.bin2hex(random_bytes(4));
    $databasePassword = bin2hex(random_bytes(16));
    $account = $server->quote($databaseUser)."@'%'";
    $server->exec('CREATE USER '.$account.' IDENTIFIED BY '.$server->quote($databasePassword));
    $createdUser = true;
    $server->exec('GRANT ALL PRIVILEGES ON `'.$dbName.'`.* TO '.$account);
    $app = require $appRoot.'/bootstrap/app.php';
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    $app['config']->set('app.env', 'testing');
    $app['config']->set('app.key', 'base64:'.base64_encode(str_repeat('s', 32)));
    $app['config']->set('database.default', 'mariadb');
    $app['config']->set('database.connections.mariadb', array_replace($app['config']->get('database.connections.mariadb'), [
        'url' => null,
        'driver' => 'mariadb', 'host' => '127.0.0.1', 'port' => 53329, 'database' => $dbName,
        'username' => $databaseUser, 'password' => $databasePassword, 'charset' => 'utf8mb4', 'collation' => 'utf8mb4_unicode_ci', 'timezone' => '+00:00',
    ]));
    $app['config']->set('invitation.origin', 'http://localhost:4319');
    $app['config']->set('invitation.cors_origins', ['http://localhost:4319']);
    $app['config']->set('invitation.session_secret', str_repeat('test-session-', 4));
    $app['config']->set('invitation.key', base64_encode(str_repeat('k', 32)));
    $app['config']->set('invitation.key_version', '1');
    $app['config']->set('invitation.old_keys', []);
    $app['config']->set('invitation.admin_email', 'smoke@example.test');
    $app['config']->set('invitation.storage.driver', 'local');
    $kernel = $app->make(Kernel::class);
    $limits = DB::selectOne('SELECT @@session.innodb_lock_wait_timeout AS lock_timeout, @@session.max_statement_time AS statement_timeout');
    check((int) $limits->lock_timeout === 5 && (int) $limits->statement_timeout === 10, 'Database query time limits');
    $adminId = (string) Str::uuid();
    $eventId = (string) Str::uuid();
    $revisionId = (string) Str::uuid();
    DB::table('AdminUser')->insert(['id' => $adminId, 'email' => 'smoke@example.test', 'passwordHash' => password_hash('Synthetic-test-123!', PASSWORD_ARGON2ID)]);
    DB::table('Event')->insert(['id' => $eventId, 'ownerId' => $adminId, 'slug' => 'smoke', 'updatedAt' => Api::now()]);
    DB::table('EventRevision')->insert(['id' => $revisionId, 'eventId' => $eventId, 'revisionNo' => 1, 'contentJson' => json_encode($fixture, JSON_THROW_ON_ERROR)]);
    DB::table('Event')->where('id', $eventId)->update(['draftRevisionId' => $revisionId, 'publishedRevisionId' => $revisionId]);

    $cookie = [];
    $csrf = '';
    $call = function (string $method, string $path, ?array $body = null, ?string $token = null, array $extra = [], int $expected = 200, array $files = []) use ($kernel, &$cookie, &$csrf, &$requests) {
        $headers = ['HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json', 'HTTP_ORIGIN' => 'http://localhost:4319'];
        if ($token !== null) {
            $headers['HTTP_AUTHORIZATION'] = 'Bearer '.$token;
        } elseif ($csrf !== '') {
            $headers['HTTP_X_CSRF_TOKEN'] = $csrf;
        }
        if ($files) {
            $headers['CONTENT_TYPE'] = 'multipart/form-data';
        }
        $request = Request::create('http://localhost:4319'.$path, $method, $files ? ($body ?? []) : [], $cookie, $files, $extra + $headers, !$files && $body !== null ? json_encode($body === [] ? (object) [] : $body, JSON_THROW_ON_ERROR) : null);
        $response = $kernel->handle($request);
        $requests++;
        $payload = json_decode($response->getContent() ?: '', true);
        check($response->getStatusCode() === $expected, $method.' '.$path.' got '.$response->getStatusCode().' '.($payload['error']['code'] ?? ''));
        foreach ($response->headers->getCookies() as $saved) {
            $cookie[$saved->getName()] = $saved->getValue();
        }
        $kernel->terminate($request, $response);
        if (str_contains($response->headers->get('Content-Type', ''), 'spreadsheetml')) {
            return $response->getContent();
        }
        return $payload['data'] ?? $payload;
    };

    check($call('GET', '/health/ready') === ['ok' => true], 'Database readiness success');
    $dbSettings = $app['config']->get('database.connections.mariadb');
    foreach ([
        [['password' => 'incorrect-fixture-password'], 'DB_AUTH_FAILED'],
        [['database' => $dbName.'_missing'], 'DB_ACCESS_DENIED'],
        [['username' => 'root', 'password' => $password, 'database' => $dbName.'_missing'], 'DB_NOT_FOUND'],
    ] as [$settings, $reason]) {
        DB::purge('mariadb');
        $app['config']->set('database.connections.mariadb', array_replace($dbSettings, $settings));
        $readiness = $call('GET', '/health/ready', expected: 503);
        check($readiness['ok'] === false && $readiness['reason'] === $reason, 'Database readiness expected '.$reason.', received '.json_encode($readiness));
        check($readiness['configuration']['envFileReadable'] === is_readable($appRoot.'/.env') && $readiness['configuration']['passwordConfigured'] === true, 'Readiness configuration status');
        check(!str_contains(json_encode($readiness), $databasePassword) && !str_contains(json_encode($readiness), $databaseUser), 'Readiness keeps credentials private');
    }
    DB::purge('mariadb');
    $app['config']->set('database.connections.mariadb', $dbSettings);
    $call('GET', '/api/v1/admin/events/current', expected: 401);
    $call('POST', '/api/v1/admin/auth/login', ['email' => 'admin', 'password' => 'wrong'], expected: 401);
    $login = $call('POST', '/api/v1/admin/auth/login', ['email' => 'admin', 'password' => 'Synthetic-test-123!']);
    $csrf = $login['csrfToken'];
    check($call('GET', '/api/v1/admin/auth/me')['id'] === $adminId, 'Session authentication');
    $current = $call('GET', '/api/v1/admin/events/current');
    check($current['id'] === $eventId, 'Current event');
    $call('PATCH', '/api/v1/admin/events/'.$eventId.'/controls', ['expectedVersion' => 1, 'wallEnabled' => false], extra: ['HTTP_X_CSRF_TOKEN' => 'wrong'], expected: 403);
    $call('POST', '/api/v1/admin/auth/login', ['email' => 'admin', 'password' => 'Synthetic-test-123!'], extra: ['HTTP_ORIGIN' => 'https://untrusted.example'], expected: 403);
    $create = fn (string $code, string $name) => $call('POST', '/api/v1/admin/events/'.$eventId.'/guests', ['guestCode' => $code, 'fullName' => $name], expected: 201);
    $legacy = $input['legacy'];
    $legacyGuestId = (string) Str::uuid();
    DB::table('Guest')->insert(['id' => $legacyGuestId, 'eventId' => $eventId, 'guestCode' => 'OLD1', 'fullName' => 'Khách cũ', 'updatedAt' => Api::now()]);
    DB::table('Invitation')->insert(['id' => $legacy['invitationId'], 'eventId' => $eventId, 'guestId' => $legacyGuestId, 'tokenHash' => InvitationTokens::hash($legacy['token']), 'tokenCiphertext' => $legacy['ciphertext'], 'keyVersion' => '1', 'updatedAt' => Api::now()]);
    DB::table('InvitationLink')->insert(['invitationId' => $legacy['invitationId'], 'tokenHash' => InvitationTokens::hash($legacy['token']), 'codeHash' => $legacy['codeHash'], 'codeCiphertext' => $legacy['codeCiphertext'], 'slug' => 'khach-cu', 'keyVersion' => '1']);
    check($call('GET', '/api/v1/guest/invitation', token: $legacy['token'])['guest']['fullName'] === 'Khách cũ', 'Node token works in Laravel');
    $call('GET', '/api/v1/guest/invitation', token: 'Ab123.khach-cu');
    check(str_ends_with($call('GET', '/api/v1/admin/invitations/'.$legacy['invitationId'].'/link')['url'], '/i/Ab123/khach-cu'), 'Existing encrypted short code is reused');
    $guest = $call('POST', '/api/v1/admin/events/'.$eventId.'/guests', ['fullName' => 'Khách thử'], expected: 201);
    check(preg_match('/^G-[0-9A-F-]{36}$/D', $guest['guestCode']) === 1, 'Manual creation assigns an internal guest code');
    $invitation = DB::table('Invitation')->where('guestId', $guest['id'])->first();
    $link = $call('GET', '/api/v1/admin/invitations/'.$invitation->id.'/link');
    $url = $link['url'] ?? $link['link'] ?? null;
    check(is_string($url), 'Invitation URL response');
    check($link['message'] === "Sắp tới là một ngày quan trọng của mình, mình mong bạn sắp xếp tới tham dự và chụp với mình 1 tấm ảnh kỷ niệm nha.\nThiệp mời: $url", 'Share message uses guest address and speaker');
    $parts = explode('/', trim(parse_url($url, PHP_URL_PATH), '/'));
    $token = $parts[1].'.'.$parts[2];
    check(strlen($parts[1]) === 5, 'Five-character invitation code');
    $view = $call('GET', '/api/v1/guest/invitation', token: $token);
    check($view['guest']['fullName'] === 'Khách thử', 'Personalized guest');
    $call('POST', '/api/v1/guest/opened', token: $token);
    $rsvpBody = ['status' => 'ATTENDING', 'expectedVersion' => 0];
    $rsvp = $call('PUT', '/api/v1/guest/rsvp', $rsvpBody, $token, ['HTTP_IDEMPOTENCY_KEY' => 'rsvp-one']);
    check($rsvp['version'] === 1, 'Initial RSVP');
    check($call('PUT', '/api/v1/guest/rsvp', $rsvpBody, $token, ['HTTP_IDEMPOTENCY_KEY' => 'rsvp-one']) === $rsvp, 'Idempotent replay');
    $call('PUT', '/api/v1/guest/rsvp', ['status' => 'DECLINED', 'expectedVersion' => 0], $token, ['HTTP_IDEMPOTENCY_KEY' => 'rsvp-conflict'], 409);
    $wish = $call('PUT', '/api/v1/guest/wish', ['body' => 'Chúc mừng tốt nghiệp 🎓', 'consentPublic' => true, 'expectedVersion' => 0], $token, ['HTTP_IDEMPOTENCY_KEY' => 'wish-one']);
    check($wish['moderationStatus'] === 'APPROVED', 'Wish publishes immediately');
    $family = $create('FAMILY', 'Đại gia đình thương yêu');
    check($family['guestCode'] === 'FAMILY', 'Explicit codes still work for existing callers');
    $familyInvitation = DB::table('Invitation')->where('guestId', $family['id'])->first();
    check((bool) $familyInvitation->allowMultipleResponses, 'Family invitation is shared on creation');
    $familyToken = InvitationTokens::decrypt($familyInvitation->id, $familyInvitation->tokenCiphertext, $familyInvitation->keyVersion);
    DB::table('Guest')->where('id', $family['id'])->update(['groupKey' => 'gia_dinh']);
    $familyLink = $call('GET', '/api/v1/admin/invitations/'.$familyInvitation->id.'/link');
    check($familyLink['message'] === 'Sắp tới là một ngày quan trọng của con, con mong cả nhà sắp xếp tới tham dự và chụp với con 1 tấm ảnh kỷ niệm nha.'."\nThiệp mời: ".$familyLink['url'], 'Family share message uses the same addressing rules as the invitation');
    $call('PUT', '/api/v1/guest/rsvp', $rsvpBody, $familyToken, ['HTTP_IDEMPOTENCY_KEY' => 'family-missing-name'], 422);
    foreach (['Người A', 'Người B'] as $index => $name) {
        $responder = $call('POST', '/api/v1/guest/family-responders', ['name' => $name], $familyToken, ['HTTP_IDEMPOTENCY_KEY' => 'family-'.$index], 201);
        $saved = $call('PUT', '/api/v1/guest/rsvp', ['status' => $index ? 'DECLINED' : 'ATTENDING', 'expectedVersion' => 0], $responder['token'], ['HTTP_IDEMPOTENCY_KEY' => 'family-rsvp-'.$index]);
        check($saved['version'] === 1, 'Independent family RSVP');
        $wall = $call('GET', '/api/v1/guest/wishes', token: $responder['token']);
        check(count($wall['items']) === 1 && $wall['items'][0]['body'] === 'Chúc mừng tốt nghiệp 🎓', 'Public wish visible to another guest');
    }
    foreach (['Animal Solutions', 'Weset iu dấu'] as $groupIndex => $groupName) {
        $team = $create('TEAM'.$groupIndex, $groupName);
        $teamInvitation = DB::table('Invitation')->where('guestId', $team['id'])->first();
        check((bool) $teamInvitation->allowMultipleResponses, 'Group invitation is shared on creation');
        $teamToken = InvitationTokens::decrypt($teamInvitation->id, $teamInvitation->tokenCiphertext, $teamInvitation->keyVersion);
        $teamView = $call('GET', '/api/v1/guest/invitation', token: $teamToken);
        check($teamView['familyReply']['kind'] === 'group' && $teamView['guest']['recipientAddress'] === 'mọi người', 'Shared group form and addressing');
        check(!$teamView['canRsvp'] && !$teamView['canCreateOrEditWish'], 'Shared link requires each responder to register');
        $call('PUT', '/api/v1/guest/rsvp', $rsvpBody, $teamToken, ['HTTP_IDEMPOTENCY_KEY' => 'team-no-name-'.$groupIndex], 422);
        $members = [];
        foreach (['Thành viên A', 'Thành viên B'] as $index => $name) {
            $member = $call('POST', '/api/v1/guest/family-responders', ['name' => $name], $teamToken, ['HTTP_IDEMPOTENCY_KEY' => 'team-'.$groupIndex.'-'.$index], 201);
            $members[] = $member['token'];
            $call('PUT', '/api/v1/guest/rsvp', ['status' => $index ? 'DECLINED' : 'ATTENDING', 'expectedVersion' => 0], $member['token'], ['HTTP_IDEMPOTENCY_KEY' => 'team-rsvp-'.$groupIndex.'-'.$index]);
            $call('PUT', '/api/v1/guest/wish', ['body' => 'Lời chúc riêng '.$name, 'consentPublic' => false, 'expectedVersion' => 0], $member['token'], ['HTTP_IDEMPOTENCY_KEY' => 'team-wish-'.$groupIndex.'-'.$index]);
        }
        foreach ($members as $index => $memberToken) {
            $memberView = $call('GET', '/api/v1/guest/invitation', token: $memberToken);
            check($memberView['rsvp']['status'] === ($index ? 'DECLINED' : 'ATTENDING'), 'Group RSVPs remain independent');
            check($memberView['wish']['body'] === 'Lời chúc riêng Thành viên '.($index ? 'B' : 'A'), 'Group wishes remain independent');
            check($memberView['guest']['displayName'] === $groupName && !isset($memberView['familyReply']), 'Responder keeps group invitation with individual form');
        }
        DB::table('Invitation')->where('id', $teamInvitation->id)->update(['allowMultipleResponses' => false]);
        $patched = $call('PATCH', '/api/v1/admin/guests/'.$team['id'], ['guestCode' => $team['guestCode'], 'fullName' => $groupName, 'expectedVersion' => $team['version'], 'expectedInvitationVersion' => $teamInvitation->version]);
        check((bool) DB::table('Invitation')->where('id', $teamInvitation->id)->value('allowMultipleResponses'), 'Editing a legacy group enables its shared mode');
        check(DB::table('Invitation')->where('familyParentId', $teamInvitation->id)->count() === 2, 'Enabling a group keeps existing responders');
    }
    $call('GET', '/api/v1/admin/events/'.$eventId.'/dashboard');
    $call('GET', '/api/v1/admin/events/'.$eventId.'/guests');
    $call('GET', '/api/v1/admin/events/'.$eventId.'/wishes');
    $call('GET', '/api/v1/admin/events/'.$eventId.'/preview');
    $book = $call('GET', '/api/v1/admin/imports/template');
    check(is_string($book) && str_starts_with($book, 'PK'), 'XLSX template download');
    $uploadFile = tempnam(sys_get_temp_dir(), 'laravel-test-import-');
    try {
        file_put_contents($uploadFile, $book);
        $sharedBook = PhpOffice\PhpSpreadsheet\IOFactory::load($uploadFile);
        $sharedBook->getSheet(0)->fromArray(['SHARED_XLSX', 'Animal Solutions', 'Animal Solutions', 'animal_solutions', '', '', '', ''], null, 'A3');
        (new PhpOffice\PhpSpreadsheet\Writer\Xlsx($sharedBook))->save($uploadFile);
        $sharedBook->disconnectWorksheets();
        $upload = fn () => ['file' => new Illuminate\Http\UploadedFile($uploadFile, 'guests.xlsx', test: true)];
        $inspection = $call('POST', '/api/v1/admin/events/'.$eventId.'/imports/inspect', files: $upload());
        $sheet = $inspection['sheets'][0]['name'];
        $mapping = array_combine(array_keys(App\Services\ExcelTransfers::COLUMNS), array_keys(App\Services\ExcelTransfers::COLUMNS));
        $preview = $call('POST', '/api/v1/admin/events/'.$eventId.'/imports/preview', ['sheet' => $sheet, 'mapping' => json_encode($mapping)], expected: 201, files: $upload());
        check($preview['summary']['created'] === 2 && $preview['summary']['errors'] === 0, 'XLSX import preview');
        $committed = $call('POST', '/api/v1/admin/imports/'.$preview['id'].'/commit', [], extra: ['HTTP_IDEMPOTENCY_KEY' => 'import-one']);
        check($committed['created'] === 2, 'XLSX import commit');
        $importedTeam = DB::table('Guest')->where('eventId', $eventId)->where('guestCode', 'SHARED_XLSX')->first();
        check((bool) DB::table('Invitation')->where('guestId', $importedTeam->id)->value('allowMultipleResponses'), 'Imported group invitations are shared');
        check($call('POST', '/api/v1/admin/imports/'.$preview['id'].'/commit', [], extra: ['HTTP_IDEMPOTENCY_KEY' => 'import-one']) === $committed, 'Import replay does not duplicate guests');
        DB::table('Invitation')->where('guestId', $importedTeam->id)->update(['allowMultipleResponses' => false]);
        $sharedPreview = $call('POST', '/api/v1/admin/events/'.$eventId.'/imports/preview', ['sheet' => $sheet, 'mapping' => json_encode($mapping)], expected: 201, files: $upload());
        check($sharedPreview['summary']['updated'] === 1, 'Import detects a legacy group requiring shared responses');
        $sharedCommit = $call('POST', '/api/v1/admin/imports/'.$sharedPreview['id'].'/commit', [], extra: ['HTTP_IDEMPOTENCY_KEY' => 'import-shared-update']);
        check($sharedCommit['updated'] === 1 && (bool) DB::table('Invitation')->where('guestId', $importedTeam->id)->value('allowMultipleResponses'), 'Import updates preserve shared group behavior');
        $call('GET', '/api/v1/admin/events/'.$eventId.'/exports/links');
        $call('GET', '/api/v1/admin/events/'.$eventId.'/exports/responses');
    } finally {
        unlink($uploadFile);
    }
    $sourceImage = tempnam(sys_get_temp_dir(), 'story-image-test-');
    $wishImageFiles = [];
    try {
        file_put_contents($sourceImage, 'This is not an image');
        $uploadImage = fn () => ['file' => new Illuminate\Http\UploadedFile($sourceImage, 'source.php', test: true)];
        $call('POST', '/api/v1/admin/events/'.$eventId.'/story-images', extra: ['HTTP_X_CSRF_TOKEN' => 'wrong'], expected: 403, files: $uploadImage());
        $call('POST', '/api/v1/admin/events/'.$eventId.'/story-images', expected: 422, files: $uploadImage());
        $call('POST', '/api/v1/guest/wish-image', token: 'invalid', expected: 401, files: $uploadImage());
        $call('POST', '/api/v1/guest/wish-image', token: $token, expected: 422, files: $uploadImage());
        $limited = $call('POST', '/api/v1/admin/events/'.$eventId.'/story-images', expected: 413, files: [
            'file' => new Illuminate\Http\UploadedFile($sourceImage, 'too-large.png', 'image/png', UPLOAD_ERR_INI_SIZE, true),
        ]);
        check($limited['error']['code'] === 'IMAGE_TOO_LARGE', 'PHP size error is reported as a size limit');
        $pixels = imagecreatetruecolor(2048, 1024);
        imagepng($pixels, $sourceImage);
        imagedestroy($pixels);
        $storyImage = $call('POST', '/api/v1/admin/events/'.$eventId.'/story-images', expected: 201, files: $uploadImage());
        $storyImagePath = public_path(ltrim($storyImage['url'], '/'));
        check($storyImage['width'] === 1600 && $storyImage['height'] === 800, 'Image resized with original proportions');
        check(getimagesize($storyImagePath)[2] === IMAGETYPE_WEBP, 'Upload is re-encoded as WebP');
        $attachment = $call('POST', '/api/v1/guest/wish-image', token: $token, expected: 201, files: $uploadImage());
        $wishImageFiles[] = App\Services\WishImages::path($invitation->id, $attachment['id']);
        check(getimagesize(end($wishImageFiles))[2] === IMAGETYPE_WEBP, 'Guest photo is re-encoded in private storage');
        $call('GET', $attachment['url']);
        $call('GET', str_replace('scope=pending', 'scope=public', $attachment['url']), expected: 404);
        $call('GET', strtok($attachment['url'], '?'), expected: 404);
        $call('PUT', '/api/v1/guest/wish', ['body' => 'Foreign image', 'imageId' => $attachment['id'], 'consentPublic' => true, 'expectedVersion' => 0], $responder['token'], ['HTTP_IDEMPOTENCY_KEY' => 'foreign-image'], 422);
        $wish = $call('PUT', '/api/v1/guest/wish', ['body' => 'Chúc mừng tốt nghiệp 🎓', 'imageId' => $attachment['id'], 'consentPublic' => true, 'expectedVersion' => 1], $token, ['HTTP_IDEMPOTENCY_KEY' => 'wish-photo']);
        $reloaded = $call('GET', '/api/v1/guest/invitation', token: $token);
        check($reloaded['wish']['image']['id'] === $attachment['id'], 'Photo survives reload');
        $call('GET', $reloaded['wish']['image']['url']);
        $wall = $call('GET', '/api/v1/guest/wishes', token: $responder['token']);
        $publicImageUrl = $wall['items'][0]['image']['url'];
        $call('GET', $publicImageUrl);
        $adminWishes = $call('GET', '/api/v1/admin/events/'.$eventId.'/wishes');
        check($adminWishes['items'][0]['image']['id'] === $attachment['id'], 'Admin can view attachment');
        $call('PATCH', '/api/v1/guest/wish/visibility', ['consentPublic' => false, 'expectedVersion' => $wish['version']], $token);
        $call('GET', $publicImageUrl, expected: 404);
        $call('GET', $reloaded['wish']['image']['url']);
        $wish = $call('GET', '/api/v1/guest/invitation', token: $token)['wish'];
        $wish = $call('PUT', '/api/v1/guest/wish', ['body' => 'Chúc mừng tốt nghiệp 🎓', 'consentPublic' => true, 'expectedVersion' => $wish['version']], $token, ['HTTP_IDEMPOTENCY_KEY' => 'wish-old-client']);
        check($wish['image']['id'] === $attachment['id'], 'Old clients preserve current photo when imageId is omitted');
        $call('PUT', '/api/v1/guest/wish', ['body' => 'Chúc mừng tốt nghiệp 🎓', 'imageId' => null, 'consentPublic' => true, 'expectedVersion' => $wish['version']], $token, ['HTTP_IDEMPOTENCY_KEY' => 'wish-remove-image']);
        $call('GET', $attachment['url'], expected: 404);
        check(!is_file(end($wishImageFiles)), 'Removing a photo deletes the old file after commit');
        for ($i = 0; $i < 6; $i++) {
            $wishImageFiles[] = App\Services\WishImages::path($invitation->id, (string) Str::uuid());
            copy($storyImagePath, end($wishImageFiles));
        }
        $call('POST', '/api/v1/guest/wish-image', token: $token, expected: 429, files: $uploadImage());
        touch(end($wishImageFiles), time() - 7200);
        $pending = $call('POST', '/api/v1/guest/wish-image', token: $token, expected: 201, files: $uploadImage());
        check(!is_file(end($wishImageFiles)), 'Expired pending upload is removed before accepting another');
        $wishImageFiles[] = App\Services\WishImages::path($invitation->id, $pending['id']);
        touch(end($wishImageFiles), time() - 90000);
        App\Services\WishImages::cleanup();
        check(!is_file(end($wishImageFiles)), 'Maintenance removes stale unattached photos');
        $attachment = $call('POST', '/api/v1/guest/wish-image', token: $responder['token'], expected: 201, files: $uploadImage());
        $familyResponder = DB::table('Invitation')->where('tokenHash', InvitationTokens::hash($responder['token']))->first();
        $wishImageFiles[] = App\Services\WishImages::path($familyResponder->id, $attachment['id']);
        $familyWish = $call('PUT', '/api/v1/guest/wish', ['body' => 'Gia đình chúc mừng', 'imageId' => $attachment['id'], 'consentPublic' => false, 'expectedVersion' => 0], $responder['token'], ['HTTP_IDEMPOTENCY_KEY' => 'family-photo']);
        $call('GET', $familyWish['image']['url']);
        check(count($call('GET', '/api/v1/guest/wishes', token: $token)['items']) === 0, 'Private family photo stays off public wall');
        $call('DELETE', '/api/v1/guest/wish', ['expectedVersion' => $familyWish['version']], $responder['token'], expected: 204);
        $call('GET', $familyWish['image']['url'], expected: 404);
        $call('POST', '/api/v1/guest/wish-image', token: $familyToken, expected: 422, files: $uploadImage());
        DB::table('Event')->where('id', $eventId)->update(['wishesEnabled' => false]);
        $call('POST', '/api/v1/guest/wish-image', token: $token, expected: 422, files: $uploadImage());
        DB::table('Event')->where('id', $eventId)->update(['wishesEnabled' => true]);
    } finally {
        unlink($sourceImage);
    }
    foreach ($fixture['sections'] as &$section) {
        if ($section['type'] === 'opening') {
            $section['data']['coverImage'] = $storyImage;
            $section['data']['coverAssetId'] = null;
        }
        if ($section['type'] === 'hero') {
            $section['data']['heroImage'] = $storyImage;
            $section['data']['heroAssetId'] = null;
        }
        if ($section['type'] === 'story') {
            $section['data'] = [
                'title' => 'THANH XUÂN ẤY, CHÚNG TA ĐÃ CÓ NHAU',
                'intro' => 'Những người đã cùng ta đi qua.',
                'items' => array_map(fn ($i) => ['id' => 'story-'.$i, 'label' => (string) $i, 'title' => 'Chặng '.$i, 'body' => 'Kỷ niệm '.$i, 'imageAssetId' => null, 'image' => $storyImage], range(1, 11)),
            ];
        }
    }
    unset($section);
    $fixture['ceremony']['mapImage'] = $storyImage;
    $fixture['ceremony']['mapImageAssetId'] = null;
    $foreign = $fixture;
    foreach ($foreign['sections'] as &$section) {
        if ($section['type'] === 'story') {
            $section['data']['items'][0]['image']['url'] = str_replace($eventId, (string) Str::uuid(), $storyImage['url']);
        }
    }
    unset($section);
    $call('PATCH', '/api/v1/admin/events/'.$eventId.'/draft', ['content' => $foreign], extra: ['HTTP_IF_MATCH' => '1'], expected: 422);
    $draft = $call('PATCH', '/api/v1/admin/events/'.$eventId.'/draft', ['content' => $fixture], extra: ['HTTP_IF_MATCH' => '1']);
    $savedStory = array_column($draft['draft']['contentJson']['sections'], 'data', 'type')['story'];
    check(count($savedStory['items']) === 11 && $savedStory['title'] === $fixture['sections'][2]['data']['title'], 'Story header and all chapters survive save');
    check($savedStory['items'][0]['image'] === $storyImage, 'Uploaded image survives content validation');
    $sections = array_column($draft['draft']['contentJson']['sections'], 'data', 'type');
    check($sections['opening']['coverImage'] === $storyImage && $sections['hero']['heroImage'] === $storyImage, 'Cover and hero uploads survive save');
    check($draft['draft']['contentJson']['ceremony']['mapImage'] === $storyImage, 'Map upload survives save');
    $call('POST', '/api/v1/admin/events/'.$eventId.'/publish', ['expectedVersion' => 2]);
    $call('DELETE', '/api/v1/admin/guests/'.$guest['id'], ['expectedVersion' => 1], expected: 204);
    $call('GET', '/api/v1/guest/invitation', token: $token, expected: 401);
    $call('POST', '/api/v1/admin/auth/logout', expected: 204);
    $call('GET', '/api/v1/admin/auth/me', expected: 401);
    echo json_encode(['laravel' => $app->version(), 'database' => 'isolated MariaDB', 'httpChecks' => $requests, 'result' => 'passed'], JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage().PHP_EOL);
    $failed = true;
} finally {
    foreach ($wishImageFiles ?? [] as $file) {
        if (is_file($file)) unlink($file);
    }
    foreach (array_unique(array_map('dirname', $wishImageFiles ?? [])) as $directory) {
        if (is_dir($directory)) rmdir($directory);
    }
    if (isset($storyImagePath) && is_file($storyImagePath)) {
        unlink($storyImagePath);
        rmdir(dirname($storyImagePath));
    }
    if (isset($app)) {
        $app['db']->disconnect();
    }
    $server->exec('DROP DATABASE `'.$dbName.'`');
    if ($createdUser) {
        $server->exec('DROP USER '.$account);
    }
}
exit(isset($failed) ? 1 : 0);
