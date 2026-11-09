<?php

use App\Http\Middleware\InvitationAccess;
use App\Http\Middleware\InvitationHeaders;
use App\Support\ApiException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(using: static fn () => require __DIR__.'/../routes/invitation.php')
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(InvitationHeaders::class);
        $middleware->alias(['invitation.access' => InvitationAccess::class]);
        $middleware->trimStrings(except: [fn (Request $request) => $request->is('api/*')]);
        $middleware->convertEmptyStringsToNull(except: [fn (Request $request) => $request->is('api/*')]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
        $exceptions->dontReport([ApiException::class]);
        $exceptions->report(function (QueryException $error) {
            logger()->error('Database request failed', ['requestId' => request()->attributes->get('requestId'), 'sqlState' => $error->getCode()]);
            return false;
        });
        $exceptions->render(function (ValidationException $error, Request $request) {
            if ($request->is('api/*')) {
                return (new ApiException(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', array_map(fn ($messages) => $messages[0], $error->errors())))->render($request);
            }
        });
        $exceptions->render(function (QueryException $error, Request $request) {
            if (!$request->is('api/*')) {
                return null;
            }
            $code = (int) ($error->errorInfo[1] ?? 0);
            if (in_array($code, [1205, 1213, 1040, 1969], true)) {
                return (new ApiException(503, 'DATABASE_BUSY', 'Hệ thống đang bận, vui lòng thử lại sau ít giây', headers: ['Retry-After' => '2']))->render($request);
            }
            if ($error->getCode() === '23000') {
                return (new ApiException(409, 'CONFLICT', 'Dữ liệu đã thay đổi hoặc bị trùng, vui lòng tải lại'))->render($request);
            }
            return (new ApiException(500, 'INTERNAL_ERROR', 'Có lỗi xảy ra, vui lòng thử lại'))->render($request);
        });
        $exceptions->render(function (HttpExceptionInterface $error, Request $request) {
            if ($request->is('api/*') && $error->getStatusCode() === 404) {
                return (new ApiException(404, 'NOT_FOUND', 'API không tồn tại'))->render($request);
            }
        });
    })->create();
