<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\GuestController;
use App\Http\Controllers\TransferController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::get('/health/live', fn () => response()->json(['ok' => true]));
Route::get('/health/ready', function () {
    if (!extension_loaded('pdo_mysql')) {
        return response()->json(['ok' => false, 'reason' => 'PDO_MYSQL_MISSING'], 503);
    }
    try {
        DB::select('SELECT 1');
        return response()->json(['ok' => true]);
    } catch (Throwable $error) {
        $driverCode = $error instanceof PDOException ? (int) ($error->errorInfo[1] ?? 0) : 0;
        $reason = match ($driverCode) {
            1045, 1698 => 'DB_AUTH_FAILED',
            1044 => 'DB_ACCESS_DENIED',
            1049 => 'DB_NOT_FOUND',
            2002, 2003 => 'DB_CONNECTION_FAILED',
            2054 => 'DB_AUTH_PLUGIN_UNSUPPORTED',
            1040, 1203, 1226 => 'DB_CONNECTION_LIMIT',
            default => 'DB_CHECK_FAILED',
        };
        return response()->json([
            'ok' => false,
            'reason' => $reason,
            'configuration' => [
                'envFileExists' => is_file(base_path('.env')),
                'envFileReadable' => is_readable(base_path('.env')),
                'configCached' => app()->configurationIsCached(),
                'passwordConfigured' => (string) config('database.connections.'.config('database.default').'.password') !== '',
            ],
        ], 503);
    }
});

Route::prefix('api/v1')->middleware('api')->group(function () {
    Route::prefix('admin')->middleware('invitation.access:origin')->group(function () {
        Route::post('/auth/login', [AdminController::class, 'login']);
        Route::middleware('invitation.access:admin')->group(function () {
            Route::get('/auth/me', [AdminController::class, 'me']);
            Route::post('/auth/logout', [AdminController::class, 'logout']);
            Route::get('/events/current', [AdminController::class, 'current']);
            Route::patch('/events/{id}/draft', [AdminController::class, 'draft']);
            Route::post('/events/{id}/publish', [AdminController::class, 'publish']);
            Route::post('/events/{id}/unpublish', [AdminController::class, 'unpublish']);
            Route::patch('/events/{id}/controls', [AdminController::class, 'controls']);
            Route::get('/events/{id}/preview', [AdminController::class, 'preview']);
            Route::get('/events/{id}/dashboard', [AdminController::class, 'dashboard']);
            Route::get('/events/{id}/guests', [AdminController::class, 'guests']);
            Route::post('/events/{id}/guests', [AdminController::class, 'createGuest']);
            Route::patch('/guests/{id}', [AdminController::class, 'updateGuest']);
            Route::delete('/guests/{id}', [AdminController::class, 'deleteGuest']);
            Route::post('/guests/{id}/archive', [AdminController::class, 'archiveGuest']);
            Route::post('/guests/{id}/restore', [AdminController::class, 'restoreGuest']);
            Route::get('/invitations/{id}/link', [AdminController::class, 'invitationLink']);
            Route::patch('/invitations/{id}/content', [AdminController::class, 'invitationContent']);
            Route::post('/invitations/{id}/revoke', [AdminController::class, 'revokeInvitation']);
            Route::post('/invitations/{id}/rotate', [AdminController::class, 'rotateInvitation']);
            Route::put('/invitations/{id}/rsvp', [AdminController::class, 'invitationRsvp']);
            Route::get('/events/{id}/wishes', [GuestController::class, 'adminWishes']);
            Route::patch('/wishes/{id}/moderation', [GuestController::class, 'moderateWish']);
            Route::patch('/wishes/{id}/pin', [GuestController::class, 'pinWish']);
            Route::get('/imports/template', [TransferController::class, 'template']);
            Route::post('/events/{id}/imports/inspect', [TransferController::class, 'inspect']);
            Route::post('/events/{id}/imports/preview', [TransferController::class, 'preview']);
            Route::get('/imports/{id}', [TransferController::class, 'batch']);
            Route::get('/imports/{id}/report', [TransferController::class, 'report']);
            Route::post('/imports/{id}/commit', [TransferController::class, 'commit']);
            Route::get('/events/{id}/exports/{kind}', [TransferController::class, 'export']);
            Route::post('/events/{id}/uploads', [TransferController::class, 'upload']);
        });
    });
    Route::prefix('guest')->middleware('invitation.access:guest')->group(function () {
        Route::get('/invitation', [GuestController::class, 'invitation']);
        Route::post('/opened', [GuestController::class, 'opened']);
        Route::post('/family-responders', [GuestController::class, 'register']);
        Route::put('/rsvp', [GuestController::class, 'rsvp']);
        Route::put('/wish', [GuestController::class, 'wish']);
        Route::patch('/wish/visibility', [GuestController::class, 'visibility']);
        Route::delete('/wish', [GuestController::class, 'deleteWish']);
        Route::get('/wishes', [GuestController::class, 'wishes']);
        Route::get('/calendar.ics', [GuestController::class, 'calendar']);
    });
});

Route::get('/api/maintenance', [TransferController::class, 'maintenance']);
Route::get('/invitation-assets/fonts/fz-alpha-brights-b89b193c.otf', [TransferController::class, 'font']);
Route::get('/invitation-assets/{key}', [TransferController::class, 'asset'])->where('key', '.*');

$spa = static function () {
    $index = public_path('index.html');
    abort_unless(is_file($index), 503, 'Chưa build giao diện thiệp');
    return response()->file($index, ['Cache-Control' => 'no-cache']);
};
Route::get('/', $spa);
Route::get('/admin/{path?}', $spa)->where('path', '.*');
Route::get('/i/{token}/{guestName?}', $spa);
