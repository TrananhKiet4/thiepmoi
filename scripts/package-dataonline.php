<?php

declare(strict_types=1);

ini_set('memory_limit', '256M');

$root = dirname(__DIR__);
$destination = $root.'/.data/dataonline';
if (!is_file($root.'/public/index.html') || !is_file($root.'/vendor/autoload.php') || !is_file($root.'/bootstrap/cache/invitation-media.json')) {
    throw new RuntimeException('Run composer install --no-dev and npm run build before packaging.');
}
if (!is_dir($destination)) {
    mkdir($destination, 0700, true);
}
$zip = new ZipArchive;
$path = $destination.'/thiepmoi-dataonline.zip';
if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    throw new RuntimeException('Cannot create Data Online package.');
}
$count = 0;
foreach (['app', 'bootstrap', 'config', 'database', 'routes', 'storage', 'vendor', 'public'] as $directory) {
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root.'/'.$directory, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        if (!$file->isFile() || $file->isLink()) {
            continue;
        }
        $relative = str_replace('\\', '/', substr($file->getPathname(), strlen($root) + 1));
        if (str_starts_with($relative, 'storage/') && $file->getFilename() !== '.gitignore') {
            continue;
        }
        if (str_starts_with($relative, 'bootstrap/cache/') && !in_array($file->getFilename(), ['.gitignore', 'invitation-media.json'], true)) {
            continue;
        }
        $entry = $directory === 'public' ? 'public_html/'.substr($relative, 7) : 'thiepmoi-app/'.$relative;
        if ($relative === 'public/index.php') {
            $index = str_replace("__DIR__.'/../", "__DIR__.'/../thiepmoi-app/", file_get_contents($file->getPathname()));
            $index = str_replace('$app->handleRequest', '$app->usePublicPath(__DIR__);'.PHP_EOL.PHP_EOL.'$app->handleRequest', $index);
            $zip->addFromString($entry, $index);
        } else {
            $zip->addFromString($entry, file_get_contents($file->getPathname()));
        }
        $count++;
        if ($count % 2000 === 0) {
            echo 'Packing '.$count.' files...'.PHP_EOL;
        }
    }
}
foreach (['artisan', 'composer.json', 'composer.lock', '.env.dataonline.example'] as $file) {
    $zip->addFromString('thiepmoi-app/'.$file, file_get_contents($root.'/'.$file));
}
echo 'Compressing deployment package...'.PHP_EOL;
$zip->close();
$check = new ZipArchive;
if ($check->open($path) !== true || $check->locateName('public_html/.htaccess') === false || $check->locateName('thiepmoi-app/vendor/autoload.php') === false || $check->locateName('thiepmoi-app/.env') !== false) {
    throw new RuntimeException('Invalid deployment package.');
}
$check->close();
echo 'Data Online package built with '.$count.' files, '.round(filesize($path) / 1048576, 1).' MB.'.PHP_EOL;
echo $path.PHP_EOL;
