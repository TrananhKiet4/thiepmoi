<?php

namespace App\Services;

use InvalidArgumentException;
use PhpOffice\PhpSpreadsheet\Cell\Cell;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Reader\IReadFilter;
use PhpOffice\PhpSpreadsheet\Reader\Xlsx;
use PhpOffice\PhpSpreadsheet\RichText\RichText;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use RuntimeException;
use ZipArchive;

final class ExcelTransfers
{
    public const MAX_BYTES = 5 * 1024 * 1024;

    public const COLUMNS = [
        'guest_code' => 'guestCode', 'full_name' => 'fullName', 'display_name' => 'displayName',
        'group' => 'groupKey', 'salutation' => 'salutation', 'personal_message' => 'personalMessage',
        'email' => 'email', 'phone' => 'phone',
    ];

    private const MAX_ROWS = 2001;

    public static function inspect(string $bytes): array
    {
        return self::read($bytes, null, []);
    }

    public static function preview(string $bytes, mixed $sheet, mixed $mapping): array
    {
        if (is_string($mapping)) {
            $mapping = json_decode($mapping, true);
        }
        if (!is_array($mapping) || array_is_list($mapping)) {
            throw new InvalidArgumentException('Mapping không hợp lệ');
        }
        $used = [];
        foreach ($mapping as $key => $header) {
            if (!isset(self::COLUMNS[$key]) || !is_string($header) || $header === '' || in_array($header, $used, true)) {
                throw new InvalidArgumentException('Mapping cần guest_code và full_name, mỗi cột chỉ dùng một lần');
            }
            $used[] = $header;
        }
        if (!isset($mapping['guest_code'], $mapping['full_name'])) {
            throw new InvalidArgumentException('Mapping cần guest_code và full_name, mỗi cột chỉ dùng một lần');
        }
        if (!is_string($sheet) || $sheet === '' || self::length($sheet) > 100) {
            throw new InvalidArgumentException('Tên sheet không hợp lệ');
        }

        return self::read($bytes, $sheet, $mapping);
    }

    private static function read(string $bytes, ?string $selected, array $mapping): array
    {
        if ($bytes === '' || strlen($bytes) > self::MAX_BYTES) {
            throw new InvalidArgumentException('File XLSX tối đa 5 MB');
        }
        $deadline = microtime(true) + 15;
        $file = tempnam(sys_get_temp_dir(), 'invitation-xlsx-');
        if ($file === false) {
            throw new RuntimeException('Không đọc được XLSX');
        }
        $book = null;
        try {
            if (file_put_contents($file, $bytes) !== strlen($bytes)) {
                throw new RuntimeException('Không đọc được XLSX');
            }
            self::validateArchive($file, $deadline);
            $reader = (new Xlsx)->setReadDataOnly(true)->setReadEmptyCells(false);
            $info = $reader->listWorksheetInfo($file);
            if (count($info) > 50) {
                throw new InvalidArgumentException('Tối đa 50 sheet');
            }
            $dimensions = [];
            foreach ($info as $sheet) {
                if ($sheet['totalColumns'] > 100) {
                    throw new InvalidArgumentException('Tối đa 100 cột');
                }
                $dimensions[$sheet['worksheetName']] = $sheet;
            }
            if ($selected !== null && !isset($dimensions[$selected])) {
                throw new InvalidArgumentException('Không tìm thấy sheet');
            }
            if ($selected !== null && $dimensions[$selected]['totalRows'] > self::MAX_ROWS) {
                throw new InvalidArgumentException('Tối đa 2.000 dòng dữ liệu');
            }
            $reader->setReadFilter(new class($selected, $deadline) implements IReadFilter
            {
                public function __construct(private ?string $selected, private float $deadline) {}

                public function readCell(string $columnAddress, int $row, string $worksheetName = ''): bool
                {
                    if (microtime(true) > $this->deadline) {
                        throw new InvalidArgumentException('Đọc XLSX quá thời gian 15 giây');
                    }

                    return Coordinate::columnIndexFromString($columnAddress) <= 100
                        && ($row === 1 || ($worksheetName === $this->selected && $row <= 2001));
                }
            });
            $book = $reader->load($file);
            $sheets = [];
            foreach ($book->getWorksheetIterator() as $sheet) {
                $headers = [];
                $name = $sheet->getTitle();
                for ($col = 1; $col <= $dimensions[$name]['totalColumns']; $col++) {
                    $address = [$col, 1];
                    $header = $sheet->cellExists($address) ? self::cellText($sheet->getCell($address)) : '';
                    if (self::length($header) > 200) {
                        throw new InvalidArgumentException('Tiêu đề cột tối đa 200 ký tự');
                    }
                    $headers[] = $header;
                }
                $sheets[] = ['name' => $name, 'headers' => $headers];
                if ($name === $selected) {
                    $selectedHeaders = $headers;
                }
            }
            if (strlen(json_encode(['sheets' => $sheets], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) > 1024 * 1024) {
                throw new InvalidArgumentException('Tổng thông tin sheet và tiêu đề vượt 1 MB');
            }
            self::checkDeadline($deadline);
            if ($selected === null) {
                return ['sheets' => $sheets];
            }
            $columns = [];
            foreach ($mapping as $key => $header) {
                $matches = array_keys($selectedHeaders ?? [], $header, true);
                if (count($matches) !== 1) {
                    throw new InvalidArgumentException('Tiêu đề mapping thiếu hoặc bị trùng');
                }
                $columns[$key] = $matches[0] + 1;
            }

            return self::normalize($book->getSheetByName($selected), $selectedHeaders, $columns, $deadline);
        } finally {
            $book?->disconnectWorksheets();
            unlink($file);
        }
    }

    private static function validateArchive(string $file, float $deadline): void
    {
        $zip = new ZipArchive;
        if ($zip->open($file, ZipArchive::RDONLY | ZipArchive::CHECKCONS) !== true) {
            throw new InvalidArgumentException('File XLSX không hợp lệ');
        }
        $limit = 20 * 1024 * 1024;
        try {
            if ($zip->numFiles > 2000) {
                throw new InvalidArgumentException('Archive vượt giới hạn');
            }
            $seen = [];
            $total = 0;
            for ($i = 0; $i < $zip->numFiles; $i++) {
                self::checkDeadline($deadline);
                $entry = $zip->statIndex($i);
                if ($entry === false || $entry['encryption_method'] !== ZipArchive::EM_NONE
                    || preg_match('~vbaProject|externalLinks|(^|/)\.\.(/|$)|^/|[\\\\:]~i', $entry['name'])
                    || isset($seen[strtolower($entry['name'])])) {
                    throw new InvalidArgumentException('Archive chứa nội dung không được phép');
                }
                $seen[strtolower($entry['name'])] = true;
                $total += $entry['size'];
                if ($total > $limit) {
                    throw new InvalidArgumentException('Dữ liệu giải nén vượt 20 MB');
                }
                if (str_ends_with($entry['name'], '/') && $entry['size'] === 0) {
                    continue;
                }
                $stream = $zip->getStreamIndex($i);
                if ($stream === false) {
                    throw new InvalidArgumentException('File XLSX không hợp lệ');
                }
                $length = 0;
                try {
                    while (!feof($stream)) {
                        $chunk = fread($stream, 8192);
                        if ($chunk === false || ($chunk === '' && !feof($stream))) {
                            throw new InvalidArgumentException('File XLSX không hợp lệ');
                        }
                        $length += strlen($chunk);
                        if ($length > $entry['size']) {
                            throw new InvalidArgumentException('File XLSX không hợp lệ');
                        }
                    }
                } finally {
                    fclose($stream);
                }
                if ($length !== $entry['size']) {
                    throw new InvalidArgumentException('File XLSX không hợp lệ');
                }
            }
        } finally {
            $zip->close();
        }
    }

    private static function normalize(
        \PhpOffice\PhpSpreadsheet\Worksheet\Worksheet $sheet, array $headers, array $columns, float $deadline
    ): array {
        $rows = $errors = $warnings = $codes = $names = [];
        $limits = ['guest_code' => 40, 'full_name' => 120, 'display_name' => 80, 'group' => 60,
            'salutation' => 40, 'personal_message' => 1000, 'email' => 254, 'phone' => 30];
        for ($row = 2, $last = $sheet->getHighestDataRow(); $row <= $last; $row++) {
            self::checkDeadline($deadline);
            $nonempty = false;
            $cellErrors = [];
            foreach ($headers as $index => $header) {
                $address = [$index + 1, $row];
                if (!$sheet->cellExists($address)) {
                    continue;
                }
                $cell = $sheet->getCell($address);
                $nonempty = $nonempty || $cell->getValue() !== null;
                if ($cell->getDataType() === DataType::TYPE_FORMULA) {
                    $cellErrors[] = ['row' => $row, 'column' => $header !== '' ? $header : (string) ($index + 1), 'message' => 'Không cho phép công thức trong vùng dữ liệu'];
                }
            }
            if (!$nonempty) {
                continue;
            }
            $invalid = false;
            $values = [];
            foreach ($columns as $key => $col) {
                $address = [$col, $row];
                $cell = $sheet->cellExists($address) ? $sheet->getCell($address) : null;
                if ($key === 'phone' && $cell?->getDataType() === DataType::TYPE_NUMERIC) {
                    $cellErrors[] = ['row' => $row, 'column' => $key, 'message' => 'Số điện thoại phải là ô Text để giữ số 0 đầu'];
                }
                try {
                    $value = self::cellText($cell);
                } catch (InvalidArgumentException $e) {
                    $value = '';
                    if (!$cellErrors) {
                        $cellErrors[] = ['row' => $row, 'column' => $key, 'message' => $e->getMessage()];
                    }
                }
                $message = match (true) {
                    self::length($value) > $limits[$key] => 'Tối đa '.$limits[$key].' ký tự',
                    $key === 'guest_code' && !preg_match('/\A[A-Za-z0-9_-]+\z/', $value) => 'Mã khách không hợp lệ',
                    $key === 'full_name' && $value === '' => 'Vui lòng nhập họ tên',
                    $key === 'email' && $value !== '' && !preg_match("~\A(?!\\.)(?!.*\\.\\.)[A-Za-z0-9_'+.-]+(?<!\\.)@(?:[A-Za-z0-9][A-Za-z0-9-]*\\.)+[A-Za-z]{2,}\\z~", $value) => 'Email không hợp lệ',
                    default => null,
                };
                if ($message !== null) {
                    $invalid = true;
                    $errors[] = ['row' => $row, 'column' => $key, 'message' => $message];
                }
                $values[self::COLUMNS[$key]] = match ($key) {
                    'guest_code' => strtoupper($value),
                    'group' => AdminInvitations::normalizeGroupKey($value),
                    default => $value,
                };
            }
            $errors = array_merge($errors, $cellErrors);
            $code = $values['guestCode'];
            if ($code !== '') {
                if (isset($codes[$code])) {
                    $errors[] = ['row' => $row, 'column' => 'guest_code', 'message' => 'Mã khách bị trùng trong file'];
                }
                $codes[$code] = true;
            }
            if ($invalid) {
                continue;
            }
            $name = mb_strtolower($values['fullName']);
            if (isset($names[$name]) && $names[$name] !== $code) {
                $warnings[] = ['row' => $row, 'column' => 'full_name', 'message' => 'Trùng tên nhưng khác mã khách'];
            }
            $names[$name] = $code;
            $rows[] = ['row' => $row, 'values' => $values];
        }

        return compact('rows', 'errors', 'warnings');
    }

    private static function cellText(?Cell $cell): string
    {
        $value = $cell?->getValue();
        if ($value === null) {
            return '';
        }
        if (in_array($cell->getDataType(), [DataType::TYPE_FORMULA, DataType::TYPE_ERROR, DataType::TYPE_ISO_DATE], true)) {
            throw new InvalidArgumentException('Kiểu ô không được hỗ trợ');
        }
        if ($value instanceof RichText) {
            $value = $value->getPlainText();
        }
        if (!is_scalar($value)) {
            throw new InvalidArgumentException('Kiểu ô không được hỗ trợ');
        }

        return preg_replace('/\A[\s\x{FEFF}]+|[\s\x{FEFF}]+\z/u', '', is_bool($value) ? ($value ? 'true' : 'false') : (string) $value);
    }

    private static function length(string $value): int
    {
        return strlen(mb_convert_encoding($value, 'UTF-16LE', 'UTF-8')) / 2;
    }

    private static function checkDeadline(float $deadline): void
    {
        if (microtime(true) > $deadline) {
            throw new InvalidArgumentException('Đọc XLSX quá thời gian 15 giây');
        }
    }

    public static function textSheet(Spreadsheet $book, string $name, array $headers, iterable $rows): void
    {
        $sheet = $book->createSheet();
        $sheet->setTitle($name)->freezePane('A2');
        $sheet->getStyle('A1:'.Coordinate::stringFromColumnIndex(count($headers)).'1')->getFont()->setBold(true);
        foreach (array_values($headers) as $index => $header) {
            $sheet->getColumnDimension(Coordinate::stringFromColumnIndex($index + 1))->setWidth(24);
            $sheet->setCellValueExplicit([$index + 1, 1], $header, DataType::TYPE_STRING);
        }
        $row = 2;
        foreach ($rows as $values) {
            foreach ($values as $index => $value) {
                $text = is_bool($value) ? ($value ? 'true' : 'false') : (string) $value;
                $sheet->setCellValueExplicit([$index + 1, $row], $text, DataType::TYPE_STRING);
            }
            $row++;
        }
        $sheet->getStyle('A1:'.Coordinate::stringFromColumnIndex(count($headers)).($row - 1))->getNumberFormat()->setFormatCode('@');
    }
}
