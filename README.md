# Hệ thống thiệp mời tốt nghiệp

Ứng dụng tiếng Việt gồm thiệp cá nhân và trang quản trị. React/Vite, Express/Node.js, Prisma/PostgreSQL; dữ liệu lưu trên server. Có nội dung theo phiên bản, Excel hai bước, link mã hóa, RSVP, lời chúc đồng ý công khai và kiểm duyệt, media local/S3.

## Chạy nhanh trên máy này

Yêu cầu Node.js 24, npm, PostgreSQL 17 trở lên, FFmpeg để kiểm tra file nhạc. Chạy các lệnh từ thư mục gốc dự án.

```powershell
npm ci
npm run db:generate
npm run setup:local
npm run db:migrate
npm run test:e2e:prepare
npm run dev
```

`setup:local` dùng PostgreSQL có sẵn tại `C:/Program Files/PostgreSQL/18/bin` trên Windows. Đặt `PGBIN` nếu đường dẫn khác. Script tạo cluster riêng trong `.data/postgres`, bind `127.0.0.1:54329`, chỉ tạo database `invitations` và `invitations_test`, không sửa dịch vụ PostgreSQL đang có. `.env` và `.env.test` được tạo với secret ngẫu nhiên và bỏ qua bởi Git. Chạy lại không ghi đè secret hoặc dữ liệu hiện có.

`test:e2e:prepare` tạo admin bằng email/mật khẩu ngẫu nhiên lưu trong `.env`, seed dữ liệu minh họa ở database phát triển và database `invitations_e2e` riêng. Không in mật khẩu hoặc link mời vào log. Mở `.env` tại máy để lấy `ADMIN_BOOTSTRAP_EMAIL` và `ADMIN_BOOTSTRAP_PASSWORD` đăng nhập. Đây là công cụ phát triển, từ chối database ngoài cluster local.

Web: `http://localhost:5173`, quản trị: `http://localhost:5173/admin`. API ở cổng 4000, Vite proxy `/api` sang API. Nếu cổng đang dùng, dừng đúng tiến trình của dự án hoặc đổi cả port, APP_ORIGIN, CORS_ORIGINS và cấu hình kiểm thử; không tự tắt ứng dụng khác.

Đã có dữ liệu demo với chủ nhân “Người tốt nghiệp”, trường mẫu, 12 khách DEMO001–DEMO012, ngày trong năm 2099 và ảnh minh họa tạo riêng. Nhạc tắt mặc định. Thay toàn bộ thông tin này qua quản trị trước khi gửi thật.

## Cài mới bằng Docker cho PostgreSQL

Nếu không dùng helper local, sao chép `.env.example` thành `.env`, tạo SESSION_SECRET và INVITATION_KEY ngẫu nhiên, điền mật khẩu PostgreSQL phù hợp `compose.yaml` rồi chạy:

```powershell
docker compose up -d
npm ci
npm run db:generate
npm run db:migrate
```

Tạo secret bằng `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`; tạo riêng từng secret. Không dùng ví dụ placeholder hoặc commit `.env`. Database test phải tách riêng với tên kết thúc `_test` và thông tin trong `.env.test`; helper reset test sẽ từ chối database phát triển.

Khởi tạo admin từ biến môi trường `ADMIN_BOOTSTRAP_EMAIL` và `ADMIN_BOOTSTRAP_PASSWORD` tối thiểu 12 ký tự:

```powershell
npm run admin:create
npm run seed
```

Chạy lại admin:create không đổi mật khẩu tài khoản đã có. Seed không chạy ở production và không ghi đè sự kiện demo đã tồn tại. Không có đăng ký công khai hay mật khẩu mặc định trong mã nguồn.

## Kiểm tra và build

```powershell
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e:prepare
npm run test:e2e
```

Unit/integration dùng PostgreSQL thật ở `invitations_test`; chạy một lệnh test tại một thời điểm vì test có reset dữ liệu của database này. E2E dùng database `invitations_e2e`; credentials được đọc từ `.env.e2e`. Playwright chạy desktop và mobile Chromium, giữ trace/screenshot khi lỗi. Các `.env*`, media runtime, dump và kết quả kiểm thử không được commit.

Build API và web bằng `npm run build`. Để chạy production, cấu hình đầy đủ server environment, `NODE_ENV=production`, HTTPS APP_ORIGIN và S3, chạy migrations rồi `npm start` từ root. API phục vụ luôn web build cùng origin. Không dùng Vite dev server cho production. Không dùng `prisma db push` trên production.

## Tài liệu

- `docs/project-structure.md`: cấu trúc backend/frontend theo mẫu KLTN và vị trí mã nguồn hiện hành.
- `docs/admin.md`: nội dung, khách, Excel, lời chúc và checklist gửi thiệp.
- `docs/openapi.yaml`: hợp đồng API, bảo mật và input/output.
- `docs/operations.md`: triển khai, storage, backup/restore, key rotation, rollback.
- `docs/verification.md`: kết quả đã chạy và giới hạn chưa xác minh.
- `docs/superpowers/specs/2026-11-03-thiep-moi-tot-nghiep-design.md`: thiết kế đã duyệt.

Ứng dụng không gửi tin nhắn hoặc email tự động; quản trị viên sao chép link/tin mẫu và tự gửi.
