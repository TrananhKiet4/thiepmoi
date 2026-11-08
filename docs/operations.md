# Vận hành và bảo vệ dữ liệu

## Production

Một instance API Node24 với PostgreSQL và S3 compatible; HTTPS reverse proxy cùng origin với web. Đặt NODE_ENV=production; APP_ORIGIN là origin công khai đã xác minh, không có path, không lấy từ Host header. CORS_ORIGINS chỉ gồm origin tin cậy. TRUST_PROXY=true chỉ khi có đúng một proxy do mình kiểm soát; giữ false khi không có proxy. Cookie Secure luôn bật ở production, HttpOnly, SameSite Lax, hạn tuyệt đối 12 giờ.

SESSION_SECRET ít nhất 32 ký tự ngẫu nhiên. INVITATION_KEY là base64 32 byte; INVITATION_KEY_VERSION là nhãn phiên bản. DATABASE_URL, storage credentials và mọi secret chỉ đặt ở server, không có VITE prefix. Config thiếu secret hoặc production HTTP/local storage sẽ từ chối startup. VITE_API_BASE_URL mặc định `/api/v1`, không chứa credential.

Với Supabase/Prisma6, `DATABASE_URL` dùng Transaction pooler6543 cho runtime, `DIRECT_URL` dùng Session pooler5432 hoặc direct endpoint cho CLI. `backend/prisma/schema.prisma` cấu hình `directUrl`, nên migrate/status dùng DIRECT_URL và không cần đổi DATABASE_URL qua lại. Cấu hình cả hai ở môi trường build/CLI; không gửi URL có mật khẩu vào log hoặc frontend. Backup pg_dump dùng kết nối session/direct: cấp DATABASE_URL phù hợp riêng cho lệnh backup, không dùng Transaction pooler.

Chạy `npm ci`, `npm run db:generate`, `npm run build`; deploy migration đúng một lần trước chuyển traffic bằng `npm run db:migrate`. Bootstrap admin qua CLI với mật khẩu môi trường, sau đó bỏ mật khẩu bootstrap khỏi cấu hình production. Chạy `npm start` từ root, reverse proxy vào `127.0.0.1:4000`. Không dùng static hosting thay API. `/api` trả lỗi JSON, không bị SPA fallback nuốt.

Tắt log query/body tại proxy và API, đặc biệt path `/i/*`, Authorization, cookies, link export, email/phone và lời chúc. Log ứng dụng chỉ ghi requestId và mã lỗi server. Proxy cần che token trong đường dẫn; không dùng analytics gửi URL đầy đủ. HTML chung không nhúng tên khách hoặc token trong metadata. Bật TLS/HSTS sau khi domain và HTTPS sẵn sàng.

Limiter bộ nhớ có trần số client, phù hợp một instance; không có bảo đảm rate limit chung giữa nhiều instance. Khi scale, dùng limiter kho chung/edge trước tăng số instance. Login giới hạn riêng IP và tài khoản; guest viết theo token+IP, đọc theo IP. Mạng NAT nhiều khách có thể cần nới giới hạn read sau đo thực tế, vẫn giữ giới hạn ghi và xác thực.

## Ảnh, nhạc và file Excel

Ảnh và nhạc thiệp dùng đường dẫn cố định trên website và lưu trong bucket private. Chỉ đồng bộ file đã được chọn để hiển thị trên thiệp. Giữ các tệp mà phiên bản thiệp đã lưu đang tham chiếu. Xem [hướng dẫn quản lý file cố định](static-media.md).

Object Storage dùng bucket private cho các lượt nhập và xuất Excel. Backend cấp đường dẫn có chữ ký ngắn hạn và dọn file tạm theo lịch.

## Backup và phục hồi

```powershell
npm run backup
npm run restore -- D:/path/to/backup.dump invitations_restore_new
```

Backup dùng pg_dump custom format, không in mật khẩu vào lệnh/log, mặc định lưu trong `.data/backups`. Restore chỉ tạo database MỚI khác database nguồn, không dùng --clean và không ghi đè database đang có. Nếu database đích đã có, lệnh dừng. PGBIN chỉ thư mục chứa pg_dump/pg_restore/createdb; dùng phiên bản client không thấp hơn server.

Lập lịch hằng ngày bằng scheduler của môi trường triển khai, giữ ít nhất 7 bản thành công, sao chép sang kho khác máy và giới hạn quyền truy cập. Không xóa bản mới nhất chỉ vì một lần backup thất bại. Dump chứa dữ liệu liên hệ và lời chúc riêng tư: mã hóa/lưu trữ an toàn, không commit hoặc gửi công khai.

Giữ bản phát hành mã nguồn và bản sao thư mục file cố định. Lưu khóa INVITATION_KEY cùng các keyVersion cũ và SESSION_SECRET trong kho secret có backup. Các khóa cũ cần thiết để xuất lại link hiện có sau khi phục hồi.

Diễn tập: restore vào database mới, dùng cùng key ring, so sánh số Event/Guest/Invitation/RSVP/Wish, kiểm tra link giải mã được và chỉ đến APP_ORIGIN đúng, mở ảnh, thử RSVP bằng khách thử, kiểm tra wall/consent và admin. Chỉ đổi DATABASE_URL sau khi xác minh; giữ database cũ để rollback. Mục tiêu đề xuất RPO24h/RTO4h cần đo trên hạ tầng thật, chưa được bảo đảm từ lần thử local.

## Quản lý khóa invitation

Giữ nguyên INVITATION_KEY/KEY_VERSION khi restart, deploy hoặc restore. Khi xoay, key mới ở INVITATION_KEY và version mới; INVITATION_OLD_KEYS là JSON map version cũ => base64 key. Ứng dụng đọc ciphertext cũ theo keyVersion; link cũ vẫn hợp lệ vì token hash không thay.

V1 hỗ trợ key ring đọc cũ và cấp lại từng link có chủ đích qua quản trị. Để bỏ hẳn khóa cũ, xuất backup và danh sách các invitation đang dùng version cũ; cấp lại link theo quy trình chủ website chọn, phân phối link mới rồi kiểm tra không còn bản ghi cần khóa cũ. Rotate link làm token cũ vô hiệu và giữ RSVP/Wish. Không xóa old key trong khi còn bản ghi phụ thuộc. Không in token/plaintext/khóa ra log. Chuyển mã hóa hàng loạt giữ nguyên token cần script bảo trì được review và chạy trong cửa sổ vận hành riêng; không tự sửa ciphertext bằng SQL.

## Bảo trì và rollback

`npm run maintenance` xóa session hết hạn/thu hồi, idempotency hết24h và ImportBatch cũ hơn7ngày. Chạy theo scheduler hạ tầng; ứng dụng vẫn kiểm tra expiresAt trước mỗi request khi chưa dọn. Không giữ file Excel gốc. Cấp lại link/thu hồi/lưu trữ/chỉnh RSVP/moderation có audit không chứa nội dung riêng tư.

Theo dõi `/health/live` và `/health/ready`, 5xx, disk/storage, lỗi backup và latency. Không công bố connection string hoặc stack trace trên health endpoints.

Rollback code: giữ artifact build/lockfile trước, khôi phục source/build trước nếu schema còn tương thích. Migration V1 không có down tự động; backup trước migration, khi cần rollback database dùng restore vào database mới và xác minh trước đổi traffic. Không DROP bảng production để chữa lỗi. Rút xuất bản bằng UI nếu cần ngừng khách truy cập trong lúc xử lý, vẫn giữ lịch sử.

Yêu cầu xóa dữ liệu cá nhân: xác nhận phạm vi/chủ sở hữu, backup hạn chế truy cập, xác định khách/thiệp/RSVP/Wish/import/audit liên quan, cân nhắc bản backup theo chính sách lưu giữ. Thực hiện thủ công có ghi nhận, không hard delete tùy tiện qua UI.
