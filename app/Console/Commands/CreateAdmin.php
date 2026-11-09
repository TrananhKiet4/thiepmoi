<?php

namespace App\Console\Commands;

use App\Support\Api;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class CreateAdmin extends Command
{
    protected $signature = 'invitations:admin';

    protected $description = 'Create an administrator. Existing accounts and passwords are preserved.';

    public function handle(): int
    {
        $email = strtolower(trim((string) $this->ask('Admin email', config('invitation.admin_email'))));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
            $this->error('Invalid email.');
            return self::FAILURE;
        }
        if (DB::table('AdminUser')->where('email', $email)->exists()) {
            $this->info('Administrator already exists.');
            return self::SUCCESS;
        }
        $password = $this->secret('Password (12–200 characters)');
        if (!is_string($password) || mb_strlen($password) < 12 || mb_strlen($password) > 200) {
            $this->error('Password must contain 12–200 characters.');
            return self::FAILURE;
        }
        DB::table('AdminUser')->insert(['id' => (string) Str::uuid(), 'email' => $email, 'passwordHash' => password_hash($password, PASSWORD_DEFAULT), 'createdAt' => Api::now()]);
        $this->info('Administrator created. Import existing event data before signing in.');
        return self::SUCCESS;
    }
}
