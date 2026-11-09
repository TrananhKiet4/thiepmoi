<?php

namespace App\Support;

use RuntimeException;

final class InvitationTokens
{
    public static function hash(string $value): string
    {
        return hash('sha256', $value);
    }

    public static function secret(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }

    private static function key(string $version): string
    {
        $encoded = $version === (string) config('invitation.key_version') ? config('invitation.key') : (config('invitation.old_keys')[$version] ?? null);
        $key = is_string($encoded) ? base64_decode($encoded, true) : false;
        if ($key === false || strlen($key) !== 32) {
            throw new RuntimeException('Invitation key version unavailable');
        }
        return $key;
    }

    public static function encrypt(string $id, string $token): array
    {
        $version = (string) config('invitation.key_version');
        $nonce = random_bytes(12);
        $data = openssl_encrypt($token, 'aes-256-gcm', self::key($version), OPENSSL_RAW_DATA, $nonce, $tag, $id, 16);
        if ($data === false) {
            throw new RuntimeException('Cannot encrypt invitation');
        }
        return ['tokenCiphertext' => base64_encode($nonce.$tag.$data), 'keyVersion' => $version];
    }

    public static function create(string $id): array
    {
        $token = self::secret();
        return ['token' => $token, 'tokenHash' => self::hash($token), ...self::encrypt($id, $token)];
    }

    public static function decrypt(string $id, string $ciphertext, string $version): string
    {
        $data = base64_decode($ciphertext, true);
        if ($data === false || strlen($data) <= 28) {
            throw new RuntimeException('Invalid invitation ciphertext');
        }
        $token = openssl_decrypt(substr($data, 28), 'aes-256-gcm', self::key($version), OPENSSL_RAW_DATA, substr($data, 0, 12), substr($data, 12, 16), $id);
        if ($token === false) {
            throw new RuntimeException('Cannot decrypt invitation');
        }
        return $token;
    }

    public static function shortCode(): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        $code = '';
        for ($i = 0; $i < 5; $i++) {
            $code .= $alphabet[random_int(0, 61)];
        }
        return $code;
    }

    public static function shortHashes(string $code, string $slug): array
    {
        $versions = array_unique([(string) config('invitation.key_version'), ...array_keys(config('invitation.old_keys'))]);
        return array_values(array_map(fn ($version) => hash_hmac('sha256', "invitation-link:v1\0$slug\0$code", self::key((string) $version)), $versions));
    }

    public static function retiredHash(string $code, string $slug): string
    {
        return self::hash("retired-invitation-link:v1\0$slug\0$code");
    }
}
