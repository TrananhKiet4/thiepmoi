<?php

declare(strict_types=1);

use Aws\S3\S3Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\Psr7\Response;

$appRoot = $argv[1] ?? dirname(__DIR__);
require $appRoot.'/vendor/autoload.php';

function verifyStorage(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$mock = new MockHandler([
    new Response(200, ['ETag' => '"fixture"']),
    new Response(200, ['Content-Length' => '5'], 'hello'),
    new Response(200, ['Content-Length' => '5']),
    new Response(204),
]);
$client = new S3Client([
    'version' => 'latest', 'region' => 'auto',
    'endpoint' => 'https://storage.example.test/storage/v1/s3',
    'credentials' => ['key' => 'fixture-access-key', 'secret' => 'fixture-secret'],
    'use_path_style_endpoint' => true, 'http_handler' => $mock,
    'request_checksum_calculation' => 'when_required', 'response_checksum_validation' => 'when_required',
]);
$parameters = ['Bucket' => 'fixture-bucket', 'Key' => 'invitation-assets/photos/fixture.webp'];
$client->putObject($parameters + ['Body' => 'hello', 'ContentType' => 'image/webp']);
$object = $client->getObject($parameters + ['Range' => 'bytes=0-5', '@http' => ['stream' => true]]);
verifyStorage((string) $object['Body'] === 'hello', 'S3 read failed');
verifyStorage($client->headObject($parameters)['ContentLength'] === 5, 'S3 size check failed');
$client->deleteObject($parameters);
verifyStorage($mock->count() === 0, 'S3 operation unexpectedly retried');
foreach (['GetObject', 'PutObject'] as $operation) {
    $url = (string) $client->createPresignedRequest($client->getCommand($operation, $parameters), '+1 minute')->getUri();
    verifyStorage(str_contains($url, 'X-Amz-Signature=') && str_starts_with($url, 'https://storage.example.test/'), 'S3 presigned URL failed');
}
foreach (['Kms', 'SSO', 'SSOOIDC', 'Sts', 'Signin'] as $service) {
    verifyStorage(class_exists('Aws\\'.$service.'\\'.$service.'Client'), 'Required SDK core service missing');
}
verifyStorage(!is_dir($appRoot.'/vendor/aws/aws-sdk-php/src/Redshift'), 'Unused AWS services were included');
echo 'S3 upload, read, size check, delete and signed URLs passed with mocked HTTP.'.PHP_EOL;
