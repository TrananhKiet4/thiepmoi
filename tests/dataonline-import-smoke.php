<?php

declare(strict_types=1);

function verifyImport(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$password = getenv('MARIADB_TEST_PASSWORD');
verifyImport(is_string($password) && $password !== '', 'Set the disposable local MariaDB test password.');
$fixture = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
$name = 'thiepmoi_import_'.bin2hex(random_bytes(4));
$server = new PDO('mysql:host=127.0.0.1;port=53329;charset=utf8mb4', 'root', $password, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$server->exec('CREATE DATABASE `'.$name.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci');
try {
    $server->exec('USE `'.$name.'`');
    $server->exec(file_get_contents(__DIR__.'/../database/schema.mariadb.sql'));
    $server->exec('SET NAMES utf8mb4 COLLATE utf8mb4_general_ci');
    $server->exec($fixture['sql']);
    $jsonFields = ['contentJson', 'mappingJson', 'normalizedRowsJson', 'summaryJson', 'resultJson', 'metadata', 'responseJson'];
    $verified = 0;
    foreach ($fixture['snapshot'] as $table => $rows) {
        verifyImport((bool) preg_match('/^[A-Za-z]+$/D', $table), 'Invalid fixture table');
        $key = $table === 'InvitationLink' ? 'codeHash' : 'id';
        verifyImport((int) $server->query('SELECT COUNT(*) FROM `'.$table.'`')->fetchColumn() === count($rows), 'Imported row count mismatch');
        $select = $server->prepare('SELECT * FROM `'.$table.'` WHERE `'.$key.'` = ?');
        foreach ($rows as $row) {
            $select->execute([$row[$key]]);
            $actual = $select->fetch(PDO::FETCH_ASSOC);
            verifyImport($actual !== false, 'Imported row missing');
            foreach ($row as $field => $expected) {
                $value = $actual[$field];
                if ($expected === null) {
                    verifyImport($value === null, 'NULL changed during import');
                } elseif (in_array($field, $jsonFields, true)) {
                    verifyImport(json_decode($value, true, flags: JSON_THROW_ON_ERROR) === $expected, 'JSON changed during import');
                } elseif (str_ends_with($field, 'At')) {
                    $date = (new DateTimeImmutable($expected))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.v');
                    verifyImport($value === $date, 'Timestamp changed during import');
                } elseif (is_bool($expected)) {
                    verifyImport((bool) $value === $expected, 'Boolean changed during import');
                } else {
                    verifyImport((string) $value === (string) $expected, 'Field changed during import');
                }
            }
            $verified++;
        }
    }
    echo json_encode(['result' => 'passed', 'rowsVerified' => $verified, 'restoredEventPointers' => true, 'restoredFamilyLinks' => true]).PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, json_encode(['result' => 'failed', 'type' => get_class($error), 'code' => $error->getCode(), 'driverCode' => $error instanceof PDOException ? $error->errorInfo[1] ?? null : null]).PHP_EOL);
    $failed = true;
} finally {
    if ($server->inTransaction()) {
        $server->rollBack();
    }
    $server->exec('DROP DATABASE `'.$name.'`');
}
exit(isset($failed) ? 1 : 0);
