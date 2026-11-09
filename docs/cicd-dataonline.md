# Deploy Data Online khi push main

Workflow `.github/workflows/deploy-dataonline.yml` chạy khi push vào `main` hoặc khi chọn Run workflow trên nhánh `main` trong GitHub Actions. Website đích là `https://www.trananhkiet.id.vn`.

## Cập nhật website

Sau khi sửa mã và kiểm tra trên máy, commit những file cần phát hành rồi push.

```powershell
rtk proxy git add <cac-file-da-sua>
rtk proxy git commit -m "Cap nhat website"
rtk proxy git push origin main
```

Mở tab Actions của repo `TrananhKiet4/thiepmoi`, chọn **Deploy Data Online** và xem hai job **build** và **deploy**. Cả hai job thành công thì bản cập nhật đã được kiểm tra và gửi lên hosting.

## Luồng triển khai

GitHub cài PHP 8.3, Node.js 24 và các dependency đã khóa phiên bản. Bộ kiểm tra chạy với MariaDB 10.6 dùng dữ liệu giả. Composer thu gọn AWS SDK theo chức năng S3 trước khi đóng gói Laravel cùng giao diện React.

Job deploy kiểm tra thư mục FTP bằng `thiepmoi-app/composer.json`, bật trang bảo trì, đồng bộ mã nguồn qua FTPS rồi mở lại website. Cuối cùng, job kiểm tra `/health/live`, `/health/ready` và `/admin/login`.

Các lần deploy được xếp hàng trong cùng nhóm `dataonline-production`. Một lần push mới sẽ chờ lần đang đồng bộ kết thúc. [Điều khiển deployment trong GitHub Actions](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)

FTPS dùng TLS và xác minh chứng chỉ. Các lần chạy sau sử dụng file trạng thái `.dataonline-sync-state.json` để xác định file thay đổi. Lần đầu thiết lập cần đồng bộ nhiều file hơn. [Tài liệu FTP Deploy Action](https://github.com/SamKirkland/FTP-Deploy-Action/blob/v4.4.0/README.md)

## Cấu hình GitHub

Trong repo, mở **Settings → Secrets and variables → Actions**.

Tạo Repository secrets `FTPS_USERNAME` và `FTPS_PASSWORD` bằng tài khoản FTP của Data Online. Tạo Repository variable `FTPS_SERVER_DIR` bằng đường dẫn thư mục tên miền theo cách tài khoản FTP nhìn thấy.

Tài khoản FTP chính thường dùng `/domains/trananhkiet.id.vn/`. Tài khoản được giới hạn ngay tại thư mục tên miền dùng `/`. Host đã cấu hình là `sv66.dataonline.vn`, cổng 21, chế độ FTPS explicit.

File `.env.cicd.local` trên máy dùng để chuẩn bị thông tin và kiểm tra kết nối. File này được Git bỏ qua. GitHub sử dụng các secrets và variable đã lưu trong repo.

## File và dữ liệu trên hosting

`.env`, các file `.env.*`, toàn bộ `thiepmoi-app/storage` và cache PHP trong `bootstrap/cache` nằm trong danh sách loại trừ đồng bộ. Danh mục `bootstrap/cache/invitation-media.json` được build và cập nhật cùng mã nguồn.

Sau khi đồng bộ thành công, workflow xóa các file cache sinh tự động `config.php`, `packages.php`, `services.php` và `routes-v7.php` trong `bootstrap/cache` trước khi mở lại request. Laravel tạo lại các cache cần thiết từ cấu hình và mã vừa phát hành.

Các thay đổi schema MariaDB cần migration riêng đã kiểm tra trước khi phát hành phần mã phụ thuộc vào chúng. Dữ liệu khách, RSVP và lời chúc được quản lý trong database của hosting.

Mã nguồn được đồng bộ vào vị trí ứng dụng hiện có để sử dụng hạn mức inode của gói hosting. Website hiển thị trang bảo trì trong lúc đồng bộ. Các file media cá nhân dùng bucket đã cấu hình trên hosting.

## Khi deploy bị lỗi hoặc bị hủy

Nếu lỗi xảy ra trước bước đồng bộ, xem thông báo kiểm thử hoặc kết nối FTP trong Actions.

Nếu lỗi hoặc thao tác hủy xảy ra trong lúc đồng bộ mã, trang bảo trì được giữ lại để chặn request chạy vào bản mã chưa hoàn chỉnh. Trong Actions, chạy lại workflow trên `main` để hoàn tất đồng bộ. Khi cần đưa bản mã trước trở lại, revert commit gây lỗi và push commit revert vào `main`.

Trang bảo trì dùng file `thiepmoi-app/storage/framework/maintenance.php`. Sau khi đã khôi phục và kiểm tra đầy đủ các file ứng dụng bằng File Manager, có thể xóa riêng file bảo trì này để mở website thủ công.
