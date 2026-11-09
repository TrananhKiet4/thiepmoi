<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class ApiException extends RuntimeException
{
    public function __construct(public readonly int $status, public readonly string $errorCode, string $message, private readonly array $fields = [], private readonly array $headers = [])
    {
        parent::__construct($message);
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json(['error' => [
            'code' => $this->errorCode,
            'message' => $this->getMessage(),
            ...($this->fields ? ['fields' => $this->fields] : []),
            'requestId' => $request->attributes->get('requestId'),
        ]], $this->status, $this->headers);
    }
}
