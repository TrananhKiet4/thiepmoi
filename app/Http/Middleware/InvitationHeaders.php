<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class InvitationHeaders
{
    public function handle(Request $request, Closure $next)
    {
        $id = (string) Str::uuid();
        $request->attributes->set('requestId', $id);
        $response = $next($request);
        $response->headers->set('X-Request-ID', $id);
        $response->headers->set('X-Robots-Tag', 'noindex, nofollow');
        $response->headers->set('Referrer-Policy', 'no-referrer');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $endpoint = config('invitation.storage.endpoint');
        $host = $endpoint ? parse_url($endpoint, PHP_URL_HOST) : null;
        $storage = $host ? ' https://'.$host : '';
        $response->headers->set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:".$storage."; media-src 'self'".$storage."; connect-src 'self'".$storage."; font-src 'self' data:; frame-src https://www.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
        if ($request->isSecure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000');
        }
        if ($request->is('api/*')) {
            $response->headers->set('Cache-Control', 'private, no-store');
        }
        return $response;
    }
}
