# Deploy một container web + API lên Vercel

Repo: `TrananhKiet4/thiepmoi`. Root Directory: **`.`**. Framework Preset: **Container**. Không chọn `frontend` hoặc `backend` làm root. Vercel đọc `Dockerfile.vercel`, chạy Node 24 + FFmpeg và phục vụ React/Express cùng domain.

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

Review thay đổi trên nhánh `codex/vercel-container` và đưa vào nhánh production đã chọn trước khi kết nối Git deployment. Không commit `.env.production.local`, `.env.e2e` hoặc `.data`.

## 2. Tạo/link project trước, chưa phát hành

Tạo một project Vercel gắn đúng repo, root `.` và Container preset. Có thể tạo/link bằng Vercel CLI (`vercel link`) trước khi gọi deploy; CLI link không phải lệnh phát hành. Nếu dùng dashboard import Git, hoàn tất cấu hình môi trường bên dưới trước khi chạy deployment.

Xác minh domain thật trong Project → Domains. Dùng chính origin HTTPS đó cho `APP_ORIGIN` và `CORS_ORIGINS`, không có dấu `/` ở cuối. Không dùng giá trị mẫu `https://your-project.vercel.app` và không suy ra origin từ Host header.

## 3. Environment Variables: chỉ Production

Các biến cần lấy từ profile local hiện có:

- `DATABASE_URL`: Supabase Transaction pooler 6543, bật SSL theo URL Supabase cung cấp. Với Prisma 6 trên server tự scale, đặt `pgbouncer=true`, `connection_limit=1`, `pool_timeout=10` nếu URL chưa có các tham số này.
- `SESSION_SECRET`, `INVITATION_KEY`, `INVITATION_KEY_VERSION`; giữ nguyên giá trị đã dùng để tạo dữ liệu. Nếu đã xoay khóa, giữ cả `INVITATION_OLD_KEYS`.
- `STORAGE_DRIVER=s3`, `STORAGE_ENDPOINT`, `STORAGE_REGION`.
- `STORAGE_BUCKET_PRIVATE=invitation-private`, `STORAGE_BUCKET_PUBLIC=invitation-public`.
- `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `PUBLIC_MEDIA_BASE_URL`.
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
FFMPEG_PATH=ffmpeg
```

Không đưa `ADMIN_BOOTSTRAP_PASSWORD` lên Vercel. Admin đã được tạo trước đó. `DIRECT_URL` giữ ở máy dùng migration/backup; container runtime không cần thông tin bootstrap hoặc kết nối migration. Không thêm prefix `VITE_` vào database/S3/session secrets.

Giữ Data API Supabase đã tắt. Backend dùng Prisma; trình duyệt chỉ nhận URL S3 có chữ ký ngắn hạn. Không tạo policy public cho bucket private hoặc các bảng tạm.

Preview deployment không dùng credentials/database production. Chưa có môi trường preview riêng thì chưa cấp các biến production cho Preview; một preview không có đủ cấu hình sẽ từ chối startup.

## 4. Backup và migration trước traffic

Xác nhận có bản backup phù hợp của database và giữ bản sao khóa mã hóa. Migration mới chỉ thêm `TemporaryObject`, `RateLimitBucket`, index/FK và bật RLS trên hai bảng; không xóa hoặc chuyển dữ liệu hiện có.

Sau khi đã duyệt phát hành, chạy đúng một lần tại root:

```powershell
node --env-file=.env.production.local node_modules/prisma/build/index.js migrate status --schema backend/prisma/schema.prisma
node --env-file=.env.production.local node_modules/prisma/build/index.js migrate deploy --schema backend/prisma/schema.prisma
```

`DIRECT_URL` trong profile dùng Session pooler 5432/direct endpoint cho CLI. Runtime tiếp tục dùng Transaction pooler. Không chạy seed trên production. Không reset/drop database để xử lý lỗi migration.

## 5. Deploy và kiểm tra

Sau khi image, biến môi trường và migration đã qua kiểm tra, chạy Git deployment hoặc Vercel deploy theo project đã link. Không cần đặt lại Build Command/Output Directory như một project Vite tĩnh.

Kiểm tra trên domain đã xác minh:

1. `/health/live` và `/health/ready` trả 200; `/api/khong-ton-tai` trả JSON 404, không trả HTML SPA.
2. Mở trực tiếp `/admin` và link `/i/...`; đăng nhập, refresh, đăng xuất. Cookie có Secure/HttpOnly và Origin khớp domain.
3. Upload một ảnh hợp lệ lớn hơn 4,5 MB qua giao diện. Request chứa file phải đi thẳng tới Storage; API chỉ nhận metadata/uploadId. Thử cả MP3/M4A để xác minh FFmpeg trong image.
4. Nhập Excel, đổi trang preview, kiểm tra có lỗi ở trang khác vẫn chặn commit; tải report/export hoàn chỉnh.
5. Xem media ở bản nháp qua URL private có chữ ký; URL không có chữ ký phải bị chặn. Chỉ media đã publish mới có URL public.
6. `/api/maintenance` không có Bearer phải trả 401 khi đã cấu hình. Vercel Cron chạy `0 0 * * *` UTC, tương đương 07:00 giờ Việt Nam/Thái Lan; Vercel gửi `CRON_SECRET` trong Authorization.

File tạm hết hạn không còn được xử lý/tải bằng URL đã cấp, nhưng object vật lý có thể tồn tại đến lượt cron kế tiếp. Mỗi lượt cron dọn tối đa 100 object, có giới hạn thời gian; lỗi xóa giữ metadata để retry. Theo dõi số dọn lỗi và lượng tồn đọng; với lượng file lớn hơn khả năng một lượt/ngày, tăng lịch tần suất phù hợp plan trước khi mở rộng sử dụng.

## 6. Rollback

Giữ deployment/code trước để rollback. Không xóa hai bảng mới trong lúc rollback; dữ liệu cũ vẫn tương thích. Bản code cũ dùng multipart nên không đáp ứng đầy đủ file 10 MB trên Vercel; cần ngừng upload lớn trong thời gian xử lý hoặc trở về hạ tầng trước đó. Không đổi khóa invitation/session khi rollback.

Nguồn: [Vercel Container Runtime](https://vercel.com/docs/functions/runtimes/container), [Functions limits](https://vercel.com/docs/functions/limitations), [Supabase S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility).
