# Hệ thống thiệp mời tốt nghiệp

Laravel 13 và MariaDB phục vụ API quản trị, thiệp theo tên khách, phản hồi tham dự, lời chúc và nhập/xuất Excel. Giao diện React/Vite được build vào `public`. Mã Laravel nằm ngay tại thư mục gốc.

## Data Online

Tên miền triển khai là `https://www.trananhkiet.id.vn`. Database MariaDB trên DirectAdmin là `trananhk_thiepmoi`. Làm theo [hướng dẫn cài qua File Manager và phpMyAdmin](docs/deploy-dataonline.md).

GitHub Actions hỗ trợ tự kiểm thử, build và deploy qua FTPS khi push vào `main`. Xem [hướng dẫn CI/CD](docs/cicd-dataonline.md).

```powershell
composer install --no-dev --prefer-dist --optimize-autoloader
npm ci --include=dev
npm run build
php scripts/package-dataonline.php
```

Yêu cầu PHP 8.3 trở lên và Node.js 24 để build. Gói `.data/dataonline/thiepmoi-dataonline.zip` có cả thư viện PHP, phần ứng dụng `thiepmoi-app` và phần web `public_html`.

Sao chép `.env.dataonline.example` thành `.env` để cấu hình một môi trường Laravel mới. Bảo quản cấu hình Node cũ trước khi thay file. Điền tài khoản MariaDB riêng của môi trường đó, tạo `APP_KEY` bằng `php artisan key:generate`, giữ khóa thiệp khi chuyển dữ liệu từ hệ thống cũ. Chọn `APP_ENV=local`, cùng `APP_URL`, `APP_ORIGIN`, `CORS_ORIGINS` bằng `http://127.0.0.1:8000` khi chạy local.

Import `database/schema.mariadb.sql` vào database rỗng, sau đó import dữ liệu chuyển đổi. Chạy local bằng `php artisan serve --host=127.0.0.1 --port=8000` sau khi cấu hình database. Trang quản trị tại `/admin/login`.

## Cấu trúc chính

```text
app/Http/Controllers/    API Laravel
app/Http/Middleware/     Đăng nhập, CSRF, quyền truy cập thiệp
app/Services/            Cá nhân hóa, Excel, media
app/Support/             Transaction, idempotency, khóa mã hóa
config/                  Cấu hình Laravel và MariaDB
database/                Schema MariaDB
routes/invitation.php    API và React SPA
public/                  Thư mục web sau khi build
frontend/                React/Vite
packages/contracts/      Kiểu dữ liệu và danh mục media
scripts/                 Build, đóng gói, chuyển dữ liệu
```

`backend` chứa mã Node cũ để đối chiếu và chuyển dữ liệu. Các lệnh bắt đầu bằng `legacy:` chạy môi trường cũ. Bản đóng gói Data Online chỉ đưa phần Laravel và giao diện đã build lên hosting.

## Kiểm thử

```powershell
php -d zend.assertions=1 -d assert.exception=1 tests/guest-port-smoke.php
node tests/dataonline-export.test.mjs
npm run build
```

Kiểm thử tích hợp tạo database dùng một lần trên MariaDB local `127.0.0.1:53329`, chạy các request qua HTTP kernel Laravel rồi xóa đúng database thử nghiệm đó. Đặt `MARIADB_TEST_PASSWORD` cho tài khoản root của instance thử nghiệm và `PHP_BINARY` trỏ đến PHP 8.3 trở lên rồi chạy `npm run test:laravel`. Bộ này chỉ sử dụng dữ liệu giả, bao gồm hai người phản hồi qua cùng thiệp gia đình và nhập Excel.

Giữ file SQL chứa khách mời, cấu hình `.env`, khóa thiệp và file media cá nhân ngoài Git. Ảnh/nhạc hiện tại tiếp tục dùng bucket media riêng được khai báo bằng `STORAGE_*`.
