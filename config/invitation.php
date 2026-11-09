<?php

$catalog = base_path('bootstrap/cache/invitation-media.json');
$media = is_file($catalog) ? json_decode(file_get_contents($catalog), true, flags: JSON_THROW_ON_ERROR) : [];

return [
    'origin' => env('APP_ORIGIN', 'https://www.trananhkiet.id.vn'),
    'cors_origins' => array_map('trim', explode(',', env('CORS_ORIGINS', env('APP_ORIGIN', 'https://www.trananhkiet.id.vn')))),
    'admin_email' => strtolower(trim((string) env('ADMIN_BOOTSTRAP_EMAIL', ''))),
    'session_secret' => env('SESSION_SECRET'),
    'key' => env('INVITATION_KEY'),
    'key_version' => env('INVITATION_KEY_VERSION', '1'),
    'old_keys' => json_decode((string) env('INVITATION_OLD_KEYS', '{}'), true, flags: JSON_THROW_ON_ERROR),
    'cron_secret' => env('CRON_SECRET'),
    'storage' => [
        'driver' => env('STORAGE_DRIVER', 'local'),
        'local_path' => storage_path('app/private/media'),
        'endpoint' => env('STORAGE_ENDPOINT'),
        'region' => env('STORAGE_REGION', 'auto'),
        'bucket' => env('STORAGE_BUCKET_PRIVATE'),
        'access_key' => env('STORAGE_ACCESS_KEY'),
        'secret_key' => env('STORAGE_SECRET_KEY'),
    ],
    'media' => $media['media'] ?? [],
    'companion_paths' => $media['companion_paths'] ?? [],
];
