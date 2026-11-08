# Deploy một container web + API lên Vercel

Repo `TrananhKiet4/thiepmoi` dùng Root Directory **`.`** và Framework Preset **Container**. Vercel đọc `Dockerfile.vercel` và phục vụ React, Express và các tệp thiệp cùng tên miền.

Project [thiepmoi](https://vercel.com/trananhkiet4s-projects/thiepmoi) dùng Container preset và Node 24. Production chạy tại [tak-thiepmoi.vercel.app](https://tak-thiepmoi.vercel.app/). Vercel đã kết nối repo GitHub và theo dõi nhánh `main` tại **Settings → Environments → Production → Branch Tracking**. File `.data/vercel-production.env` nằm ngoài Git và chứa cấu hình dùng khi import biến Production.

Container Runtime đang Beta. Cấu hình đã chuẩn bị; chỉ phát hành sau khi kiểm tra image Linux và duyệt kết quả. Không chạy database migration hoặc bootstrap admin trong Docker build.

## 1. Kiểm tra trước khi đẩy code

Chạy từ `D:\ThiepMoiTotNghiep`:

```powershell
npm ci --include=dev
npm run db:generate
npm run typecheck
npm test
npm run build
npm run test:e2e:prepare
npm run test:e2e
docker build -f Dockerfile.vercel -t thiepmoi:verify .
```

E2E dùng database `invitations_e2e`, web port 4174 và API port 4401; không dùng lại server khác trên máy. Dừng dev server của chính repo trước `npm ci` để tránh Windows khóa file native. Không dừng toàn bộ process Node trên máy.

Review thay đổi trước khi đưa vào `main`. Không commit `.env.production.local`, `.env.e2e` hoặc `.data`.

## 2. Tạo/link project trước, chưa phát hành

Tạo một project Vercel gắn đúng repo, root `.` và Container preset. Có thể tạo/link bằng Vercel CLI (`vercel link`) trước khi gọi deploy; CLI link không phải lệnh phát hành. Nếu dùng dashboard import Git, hoàn tất cấu hình môi trường bên dưới trước khi chạy deployment.

Xác minh domain thật trong Project → Domains. Dùng chính origin HTTPS đó cho `APP_ORIGIN` và `CORS_ORIGINS`, không có dấu `/` ở cuối. Không dùng giá trị mẫu `https://your-project.vercel.app` và không suy ra origin từ Host header.

## 3. Environment Variables: chỉ Production

Các biến cần lấy từ profile local hiện có:

- `DATABASE_URL`: Supabase Transaction pooler 6543, bật SSL theo URL Supabase cung cấp. Với Prisma 6 trên server tự scale, đặt `pgbouncer=true`, `connection_limit=1`, `pool_timeout=10` nếu URL chưa có các tham số này.
- `SESSION_SECRET`, `INVITATION_KEY`, `INVITATION_KEY_VERSION`; giữ nguyên giá trị đã dùng để tạo dữ liệu. Nếu đã xoay khóa, giữ cả `INVITATION_OLD_KEYS`.
- `APP_STORAGE_DRIVER=s3`, `STORAGE_ENDPOINT`, `STORAGE_REGION`. Dùng tên `APP_STORAGE_DRIVER` trên Vercel vì `STORAGE_DRIVER` là biến riêng của Buildah; tên cũ vẫn được hỗ trợ cho môi trường local.
- `STORAGE_BUCKET_PRIVATE=invitation-private`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` cho nhập và xuất Excel.
- `CRON_SECRET`: ít nhất 32 ký tự ngẫu nhiên, dùng để Vercel gọi cron có xác thực.

Các giá trị vận hành:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=8080
APP_ORIGIN=https://DOMAIN_DA_XAC_MINH
CORS_ORIGINS=https://DOMAIN_DA_XAC_MINH
TRUST_PROXY=true
STORAGE_LOCAL_PATH=/tmp/invitation-media
```

Không đưa `ADMIN_BOOTSTRAP_PASSWORD` lên Vercel. Admin đã được tạo trước đó. `DIRECT_URL` giữ ở máy dùng migration/backup; container runtime không cần thông tin bootstrap hoặc kết nối migration. Không thêm prefix `VITE_` vào database/S3/session secrets.

Giữ Data API Supabase đã tắt. Backend dùng Prisma và cấp URL S3 có chữ ký cho file Excel cùng ảnh và nhạc của thiệp. Xem [hướng dẫn quản lý file cố định](static-media.md).

Preview deployment không dùng credentials/database production. Chưa có môi trường preview riêng thì chưa cấp các biến production cho Preview; một preview không có đủ cấu hình sẽ từ chối startup.

## 4. Backup và migration trước traffic

Xác nhận bản sao lưu database và khóa mã hóa. Khi chuyển hệ thống cũ sang file cố định, phát hành mã nguồn có đầy đủ ảnh và nhạc trước. Xác minh thiệp trên tên miền chính rồi mới áp dụng migration gỡ bảng `MediaAsset`.

Sau khi đã duyệt phát hành, chạy đúng một lần tại root:

```powershell
node --env-file=.env.production.local node_modules/prisma/build/index.js migrate status --schema backend/prisma/schema.prisma
node --env-file=.env.production.local node_modules/prisma/build/index.js migrate deploy --schema backend/prisma/schema.prisma
```

`DIRECT_URL` trong profile dùng Session pooler 5432/direct endpoint cho CLI. Runtime tiếp tục dùng Transaction pooler. Không chạy seed trên production. Không reset/drop database để xử lý lỗi migration.

## 5. Deploy và kiểm tra

Sau khi kiểm tra thay đổi, chạy `git push origin main` hoặc merge pull request vào `main`. Vercel dùng tích hợp Git để build container và tạo deployment Production. Kiểm tra commit mới trong **Deployments** và đợi trạng thái **Ready** trước khi thử lại thiệp.

Kiểm tra trên domain đã xác minh:

1. `/health/live` và `/health/ready` trả 200; `/api/khong-ton-tai` trả JSON 404, không trả HTML SPA.
2. Mở trực tiếp `/admin` và link `/i/...`; đăng nhập, refresh, đăng xuất. Cookie có Secure/HttpOnly và Origin khớp domain.
3. Mở thiệp và kiểm tra ảnh chính, sơ đồ, nhạc nền và chặng Người đồng hành dùng đường dẫn `/invitation-assets/`.
4. Nhập Excel, đổi trang preview, kiểm tra có lỗi ở trang khác vẫn chặn commit; tải report/export hoàn chỉnh.
5. Mở bản xem trước trong quản trị và kiểm tra danh sách ảnh, nhạc cố định trong mục Nội dung.
6. `/api/maintenance` không có Bearer phải trả 401 khi đã cấu hình. Vercel Cron chạy `0 0 * * *` UTC, tương đương 07:00 giờ Việt Nam/Thái Lan; Vercel gửi `CRON_SECRET` trong Authorization.

File tạm hết hạn không còn được xử lý/tải bằng URL đã cấp, nhưng object vật lý có thể tồn tại đến lượt cron kế tiếp. Mỗi lượt cron dọn tối đa 100 object, có giới hạn thời gian; lỗi xóa giữ metadata để retry. Mỗi nhóm database dọn tối đa 1.000 dòng, bỏ qua dòng đang khóa, với lock timeout 250 ms và statement timeout 2 giây; `failedTasks` ghi nhóm cần thử lại. Dọn object chạy trước các nhóm này. Theo dõi số dọn lỗi và lượng tồn đọng; với lượng file lớn hơn khả năng một lượt/ngày, tăng lịch tần suất phù hợp plan trước khi mở rộng sử dụng.

## 6. Rollback

Giữ deployment và khóa invitation/session để rollback. Nếu đã gỡ `MediaAsset`, phục hồi bảng đó từ bản sao lưu trước khi chuyển về bản ứng dụng còn dùng Thư viện.

Nguồn: [Vercel Container Runtime](https://vercel.com/docs/functions/runtimes/container), [Functions limits](https://vercel.com/docs/functions/limitations), [Supabase S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility).
