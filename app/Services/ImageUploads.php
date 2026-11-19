<?php

namespace App\Services;

use App\Support\Api;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use RuntimeException;

final class ImageUploads
{
    public static function store(Request $request, string $target): array
    {
        $file = $request->file('file');
        if ($file instanceof UploadedFile && !$file->isValid()) {
            if (in_array($file->getError(), [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
                Api::fail(413, 'IMAGE_TOO_LARGE', 'Ảnh vượt giới hạn nhận file của hosting. Vui lòng tải lại để hệ thống nén ảnh trước khi gửi.');
            }
            Api::fail(422, 'UPLOAD_FAILED', 'Tải file chưa hoàn tất, vui lòng chọn ảnh và thử lại');
        }
        if (!$file instanceof UploadedFile) {
            if ((int) $request->header('Content-Length') > 0 && !$request->all()) {
                Api::fail(413, 'IMAGE_TOO_LARGE', 'Hosting chưa nhận được file ảnh. Vui lòng tải lại bằng nút Tải ảnh lên.');
            }
            Api::fail(422, 'INVALID_IMAGE', 'Vui lòng chọn ảnh JPG, PNG hoặc WebP');
        }
        if ($file->getSize() > 5 * 1024 * 1024) {
            Api::fail(413, 'IMAGE_TOO_LARGE', 'Ảnh tối đa 5 MB');
        }
        $info = @getimagesize($file->getPathname());
        if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)
            || $info[0] * $info[1] > 16_000_000 || max($info[0], $info[1]) > 8192) {
            Api::fail(422, 'INVALID_IMAGE', 'Ảnh phải là JPG, PNG hoặc WebP, tối đa 16 megapixel');
        }
        if (!function_exists('imagewebp')) {
            Api::fail(503, 'IMAGE_UNAVAILABLE', 'Hosting chưa bật xử lý ảnh WebP');
        }
        $image = @imagecreatefromstring(file_get_contents($file->getPathname()));
        if (!$image) {
            Api::fail(422, 'INVALID_IMAGE', 'Không đọc được ảnh đã chọn');
        }
        $orientation = $info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')
            ? (int) ((@exif_read_data($file->getPathname()))['Orientation'] ?? 1) : 1;
        $angle = match ($orientation) { 3, 4 => 180, 5, 6 => 270, 7, 8 => 90, default => 0 };
        if ($angle) {
            $rotated = imagerotate($image, $angle, 0);
            imagedestroy($image);
            $image = $rotated;
        }
        if (in_array($orientation, [2, 4, 5, 7], true)) {
            imageflip($image, IMG_FLIP_HORIZONTAL);
        }
        $scale = min(1, 1600 / max(imagesx($image), imagesy($image)));
        $width = max(1, (int) round(imagesx($image) * $scale));
        $height = max(1, (int) round(imagesy($image) * $scale));
        $output = imagecreatetruecolor($width, $height);
        imagealphablending($output, false);
        imagesavealpha($output, true);
        imagecopyresampled($output, $image, 0, 0, 0, 0, $width, $height, imagesx($image), imagesy($image));
        imagedestroy($image);
        $temporary = $target.'.tmp';
        try {
            if (!is_dir(dirname($target)) && !mkdir(dirname($target), 0755, true) && !is_dir(dirname($target))) {
                throw new RuntimeException('Cannot create story image directory');
            }
            if (!imagewebp($output, $temporary, 82) || !rename($temporary, $target)) {
                throw new RuntimeException('Cannot store story image');
            }
        } finally {
            imagedestroy($output);
            if (is_file($temporary)) {
                unlink($temporary);
            }
        }

        return compact('width', 'height');
    }
}
