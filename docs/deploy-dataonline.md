# Cài Laravel trên Data Online bằng File Manager

Dự án dùng Laravel 13, PHP 8.3 trở lên và MariaDB. Giao diện React được build thành file tĩnh để Laravel phục vụ cùng tên miền `https://www.trananhkiet.id.vn`. Database đích là `trananhk_thiepmoi` trong DirectAdmin. phpMyAdmin dùng để quản lý database MariaDB.

## 1. Kiểm tra hosting

Trong DirectAdmin, chọn PHP 8.3 và bật `pdo_mysql`, `mbstring`, `openssl`, `curl`, `fileinfo`, `dom`, `xml`, `xmlreader`, `xmlwriter`, `simplexml`, `zip`, `gd`, `ctype`, `tokenizer` và `session`. Kiểm tra `password_algos()` có `argon2id` để đọc hash mật khẩu admin hiện có. Nếu hosting chặn Argon2, cần đặt lại mật khẩu admin bằng hash PHP được hosting hỗ trợ trước khi chuyển người dùng sang hệ thống mới.

Đặt `memory_limit` ít nhất 128M, `upload_max_filesize` ít nhất 5M và `post_max_size` ít nhất 8M cho nhập Excel.

Tại nơi quản lý DNS của Mắt Bão, lấy đúng IP hosting ở Data Online và trỏ bản ghi A của `trananhkiet.id.vn` về IP đó. Trỏ `www` về cùng website bằng CNAME đến `trananhkiet.id.vn` hoặc bản ghi A đến cùng IP. Tại DirectAdmin, cấp chứng chỉ SSL bao gồm cả `trananhkiet.id.vn` và `www.trananhkiet.id.vn`. Tên miền chính của ứng dụng là `https://www.trananhkiet.id.vn`. Kiểm tra HTTPS hoạt động trước khi đăng nhập và gửi phản hồi.

## 2. Build gói trên máy tính

Mở PowerShell tại thư mục gốc. `php` trong PATH phải là phiên bản 8.3 trở lên.

```powershell
php -v
composer install --no-dev --prefer-dist --optimize-autoloader
npm ci --include=dev
npm run build
php scripts/package-dataonline.php
```

Máy hiện tại có thể dùng PHP 8.3 bằng đường dẫn sau.

```powershell
& 'C:\wamp64\bin\php\php8.3.28\php.exe' scripts/package-dataonline.php
```

Gói xuất ra `.data/dataonline/thiepmoi-dataonline.zip`, gồm `thiepmoi-app` và `public_html`. Thư viện Composer đã nằm trong gói. Gói chứa mã ứng dụng và giao diện đã build. Tệp cấu hình chứa mật khẩu được chuẩn bị riêng ở bước 4.

Composer tự thu gọn AWS SDK theo chức năng S3 mà ứng dụng sử dụng. SDK giữ các dịch vụ lõi cần thiết theo cơ chế chính thức của AWS. [Hướng dẫn AWS SDK](https://github.com/aws/aws-sdk-php/blob/master/src/Script/Composer/README.md)

## 3. Upload đúng vị trí

Trong File Manager mở thư mục tên miền, thường là `/domains/trananhkiet.id.vn/`. Upload gói ZIP và giải nén ngay tại đây để nhận cấu trúc sau.

```text
domains/trananhkiet.id.vn/
├── thiepmoi-app/
│   ├── app/
│   ├── bootstrap/
│   ├── config/
│   ├── database/
│   ├── routes/
│   ├── storage/
│   ├── vendor/
│   ├── artisan
│   └── .env
└── public_html/
    ├── .htaccess
    ├── index.php
    ├── index.html
    ├── assets/
    └── fonts/
```

Nếu `public_html` đang có website khác, sao lưu trước khi thay file. Gỡ trang chào mặc định `index.htm` hoặc `index.html` cũ nếu nó che giao diện mới. Giữ `.htaccess` và `index.php` từ gói vì chúng chuyển `/api/v1`, `/admin` và link `/i/...` vào Laravel.

`thiepmoi-app` phải nằm cạnh `public_html` như trên. Cho PHP quyền ghi `thiepmoi-app/storage` và `thiepmoi-app/bootstrap/cache`, thường thư mục 755 hoặc 775 tùy chủ sở hữu. Phần ứng dụng và `.env` phải nằm ngoài thư mục được web phục vụ. [Hướng dẫn triển khai Laravel](https://laravel.com/docs/13.x/deployment)

Nếu lần giải nén trước báo `disk quota exceeded`, xem cả Disk Space và Inodes trong DirectAdmin. Ảnh ngày 09/11/2026 cho thấy tài khoản đã dùng 16.500 trên hạn mức 15.000 inodes dù dung lượng mới dùng 182,2 MB trên 1.024 MB. Mỗi file và thư mục đều sử dụng inode.

Để thử lại bằng gói đã thu gọn, trong `domains/trananhkiet.id.vn/thiepmoi-app/` chọn riêng thư mục `vendor` của lần giải nén dở và xóa. Đây là thư viện sẽ được cài lại từ ZIP mới. Nếu dùng Move to Trash, số file vẫn chiếm quota cho tới khi các mục này được xóa khỏi thùng rác. Khi đã xác nhận đúng `vendor` của bản cài dở, có thể bỏ chọn Move to Trash khi xóa để giải phóng ngay. Bảo quản `.env`, nội dung trong `storage` và database.

Xóa file ZIP cũ đã upload, upload lại gói mới được tạo từ máy tính, rồi giải nén vào đúng thư mục tên miền. Xác nhận quota đã giảm trước khi giải nén. Nếu inodes vẫn cao, kiểm tra Trash và các bản giải nén tạm của lần lỗi, nhờ Data Online xác định đường dẫn đang chiếm inode trước khi dọn thêm.

## 4. Cấu hình riêng trên hosting

Upload tệp `.env.dataonline.local` đã chuẩn bị trong thư mục dự án vào `thiepmoi-app`, đổi tên thành `.env`. Nếu tự cấu hình, sao chép `.env.dataonline.example`, tạo `APP_KEY` với `php artisan key:generate --show` trên máy tính và điền vào file.

Điền đúng `DB_USERNAME` và `DB_PASSWORD` của database `trananhk_thiepmoi` trong DirectAdmin. `DB_HOST=localhost` phù hợp khi database ở cùng hosting. Nếu Data Online cung cấp host khác, dùng host được cấp. Giữ `DB_CONNECTION=mariadb`.

Giữ các thiết lập sau.

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://www.trananhkiet.id.vn
APP_ORIGIN=https://www.trananhkiet.id.vn
CORS_ORIGINS=https://www.trananhkiet.id.vn
DB_CONNECTION=mariadb
DB_DATABASE=trananhk_thiepmoi
CACHE_STORE=file
SESSION_DRIVER=file
QUEUE_CONNECTION=sync
```

Để mở lại các mã thiệp đã gửi, sao chép nguyên giá trị `INVITATION_KEY`, `INVITATION_KEY_VERSION`, `INVITATION_OLD_KEYS` từ cấu hình hệ thống cũ. `SESSION_SECRET` cũng được giữ nguyên. `APP_KEY` là khóa riêng của Laravel.

Ảnh, nhạc và font đang dùng bucket riêng hiện có. Các biến `STORAGE_*` kết nối bucket này. Việc chuyển database sang MariaDB không di chuyển các file media. Chỉ xóa dịch vụ lưu trữ cũ sau khi đã có phương án chuyển media riêng.

## 5. Chuyển dữ liệu qua phpMyAdmin

Database trong ảnh đã có 14 bảng rỗng. Kiểm tra tổng số dòng của tất cả bảng vẫn bằng 0. Nếu cần database mới hoàn toàn, import `database/schema.mariadb.sql` một lần trước khi nhập dữ liệu.

Khi sẵn sàng chuyển hệ thống, tạm tắt nhận RSVP và lời chúc trong quản trị của hệ thống cũ, ngừng sửa nội dung và khách mời, rồi tạo bản xuất cuối cùng trên máy tính.

```powershell
node --env-file=.env.production.local scripts/export-dataonline.mjs .data/backups/dataonline-data-final.sql
```

Lệnh chỉ đọc PostgreSQL, chụp dữ liệu nhất quán trong một transaction và lưu SQL MariaDB cùng file đếm dòng vào thư mục backup đã cho phép. Tên file phải mới. SQL chứa dữ liệu khách, phản hồi, hash mật khẩu và token mã hóa. Lưu riêng ngoài Git và ngoài `public_html`.

Trong phpMyAdmin chọn `trananhk_thiepmoi` → **Import** → chọn SQL vừa xuất → **Go**. Bản SQL nhập dữ liệu vào các bảng rỗng, giữ ID, mã thiệp, liên kết gia đình, hash mật khẩu và timestamp UTC. Đối chiếu kết quả đếm dòng của từng bảng với file `.counts.json`. Nếu import báo lỗi, dừng và kiểm tra transaction trước khi thử lại. Giữ bản xuất cuối cùng để xử lý lại.

Sau khi đăng nhập được ở tên miền mới, bật lại nhận RSVP và lời chúc trên bản Laravel rồi kiểm tra gửi phản hồi. Bản snapshot được tạo trước lúc chuyển chỉ dùng để chuẩn bị, cần xuất lại lần cuối nếu hệ thống cũ phát sinh thay đổi.

Nếu bản SQL cũ báo lỗi `#1267 Illegal mix of collations` khi cập nhật `Event`, kiểm tra số dòng trước khi nhập lại bằng câu SQL sau.

```sql
SELECT
    (SELECT COUNT(1) FROM AdminUser) AS admin_count,
    (SELECT COUNT(1) FROM Event) AS event_count,
    (SELECT COUNT(1) FROM EventRevision) AS revision_count,
    (SELECT COUNT(1) FROM Guest) AS guest_count,
    (SELECT COUNT(1) FROM Invitation) AS invitation_count;
```

Trong lần lỗi đã kiểm tra, cả năm số đếm đều bằng 0. Dùng bản sửa `.data/backups/dataonline-data-final-collation-fixed.sql` để import lại. Bộ xuất hiện chỉ định `utf8mb4_unicode_ci` cho kết nối và từng giá trị `CONVERT`, tránh xung đột với mặc định `utf8mb4_general_ci`. Nếu số đếm có dữ liệu, kiểm tra trạng thái lần nhập trước và sao lưu database đích trước khi thử lại.

## 6. Kiểm tra trước khi gửi link mới

Mở `/health/live` và `/health/ready`. Cả hai phải trả HTTP 200. Đăng nhập tại `/admin/login`, kiểm tra nội dung đã xuất bản, danh sách khách và lời chúc.

Khi `/health/ready` trả `ok=false`, trường `reason` cho biết loại lỗi kết nối. `PDO_MYSQL_MISSING` yêu cầu bật extension PDO MySQL của PHP website. `DB_AUTH_FAILED` yêu cầu đối chiếu user và mật khẩu trong `.env` với tài khoản database. `DB_ACCESS_DENIED` liên quan quyền truy cập database, `DB_NOT_FOUND` liên quan tên database và `DB_CONNECTION_FAILED` liên quan host, socket hoặc dịch vụ MariaDB. Phản hồi chẩn đoán chỉ chứa mã phân loại lỗi.

Lấy một link cá nhân và một link Đại gia đình từ quản trị. Kiểm tra ảnh, nhạc, font, gửi RSVP, tải lại trang để xem phản hồi và gửi lời chúc. Với Đại gia đình, thử hai tên người phản hồi riêng biệt. Kiểm tra nhập Excel và tải file danh sách.

Các mã thiệp vẫn được giữ nhưng tên miền mới đổi thành `www.trananhkiet.id.vn`. Link cũ trên tên miền Vercel cần được gửi lại bằng tên miền mới hoặc có chuyển hướng ở hệ thống cũ. File `.htaccess` trong gói chuyển tên miền gốc sang `www`, giữ đường dẫn và query string. Thư mục hosting vẫn là `domains/trananhkiet.id.vn/` vì `www` phục vụ cùng website.

## 7. Những lần cập nhật sau

Sau khi sửa mã, chạy `npm run build` và `php scripts/package-dataonline.php`, rồi upload gói mới. Giữ file `.env` trên hosting và dữ liệu trong `storage`. Database chỉ thay đổi khi có migration được kiểm tra riêng.

Workflow GitHub Actions đã được chuẩn bị để kiểm thử, build và đồng bộ qua FTPS khi push vào `main`. Xem [cách sử dụng CI/CD](cicd-dataonline.md) để cấu hình tài khoản FTP, theo dõi deployment và xử lý lỗi trong lúc đồng bộ.

`vercel.json` đã đặt `git.deploymentEnabled=false`. Cấu hình này ngừng tự deploy lên Vercel từ những lần push chứa thay đổi này. [Cấu hình Git của Vercel](https://vercel.com/docs/project-configuration/git-configuration)

Nếu hosting hỗ trợ Cron Jobs, gọi `/api/maintenance` hàng ngày bằng HTTPS với header `Authorization: Bearer <CRON_SECRET>` để dọn file tạm, phiên hết hạn và bản ghi giới hạn lượt gửi. Đặt secret trong file riêng ngoài `public_html` nếu dùng lệnh cron.
