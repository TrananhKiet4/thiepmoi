# Triển khai một container trên Vercel

Ngày: 04/11/2026. Trạng thái: người dùng đã duyệt thiết kế và yêu cầu triển khai; chưa deploy.

## Mục tiêu và lựa chọn

Đưa hệ thống hiện có lên Vercel với một container Node 24 chạy Express, phục vụ cả bản build React và API trên cùng domain. Tiếp tục dùng database và hai bucket Supabase đã cấu hình; giữ tài khoản admin, khóa mã hóa và dữ liệu hiện có.

Hai cách đã cân nhắc:

- Một container web + API: tái sử dụng cách Express đang phục vụ `frontend/dist`; ít cấu hình và giữ cookie cùng origin. Đổi lại, tài nguyên web cũng đi qua container và có cold start.
- Vercel Services tách web tĩnh và API: tận dụng CDN cho web, nhưng thêm cấu hình build và routing. Người dùng đã đổi lựa chọn từ Services sang **một container web + API**.

Không đổi framework, không thêm dịch vụ Redis, không chuyển Supabase Auth, không thêm tính năng thiệp mới. Không giảm giới hạn media 10 MB hoặc Excel 5 MB để né giới hạn hạ tầng. Không seed dữ liệu demo trên production.

## Những ràng buộc đã xác minh

- Vercel Container Runtime hiện là Beta trên mọi plan, vẫn áp dụng giới hạn body request/response 4,5 MB của Functions.
- Express đang nhận multipart trực tiếp; preview media và export Excel đang trả file qua API. Các đường này phải thay đổi để giữ nguyên giới hạn file trong đặc tả.
- FFmpeg cần có trong image. File tạm chỉ dùng trong xử lý một request; database và object storage là nơi lưu bền vững.
- Rate limiter trong bộ nhớ chỉ dùng được cho một instance. Vercel tự scale nên production cần bộ đếm dùng chung.
- Supabase S3 hỗ trợ presigned URL, nhưng không hỗ trợ S3 bucket lifecycle/CORS management API. Không dựa vào các API này để tự tạo quy tắc dọn file hoặc CORS.
- Chưa có project của repo này trong tài khoản Vercel đang kết nối. Docker CLI có sẵn nhưng Docker daemon hiện chưa chạy.
- Preflight S3 thực tế đã trả HTTP 200, cho phép browser PUT và header Content-Type; URL thử có ký Content-Length. Đây là kiểm tra OPTIONS, chưa upload object; vẫn phải kiểm tra PUT thực và nội dung sai kích thước khi triển khai.

## Container và cấu hình chạy

Thêm `Dockerfile.vercel` tại root để Vercel nhận Container preset. Build nhiều stage: cài theo lockfile, generate Prisma, build cả backend và frontend; runtime chỉ giữ dependency production, build output và FFmpeg. Dùng Node 24 trên Debian slim để tương thích Sharp, Argon2 và Prisma.

Build không cần kết nối database, không chạy migration, không tạo admin. `.dockerignore` loại `.env*`, `.data`, `.git`, `node_modules`, build local và thư mục công cụ cá nhân; COPY có phạm vi rõ ràng. Không đưa credentials vào build argument hoặc layer.

Server hỗ trợ bind `0.0.0.0`; local vẫn mặc định `127.0.0.1`. Container chạy user thường, port 8080, đường dẫn tạm dưới `/tmp`. Vercel project đặt `PORT=8080`. Express tiếp tục phục vụ SPA và giữ nguyên đường `/api/v1`, `/admin`, `/i/:token` và health checks. Giữ xử lý SIGTERM.

Không cần Vercel Services hoặc framework mới. Nếu cần file cấu hình Vercel, dùng JSON nhỏ thay vì thêm dependency chỉ để cấu hình.

## Upload trực tiếp vào bucket private

Tái sử dụng AWS SDK và presigner đã cài. Thêm một bảng `TemporaryObject` để quản lý file tạm theo admin, event, mục đích (`MEDIA`, `IMPORT`, `EXPORT`), storage key ngẫu nhiên, tên file, số byte khai báo, thời hạn, thời điểm đã nhận xử lý và thời điểm tạo. Bảng có index theo thời hạn và chủ sở hữu; migration bật RLS, không có policy truy cập từ trình duyệt. Prisma server giữ vai trò truy cập hiện có.

Luồng S3:

1. Admin yêu cầu URL upload bằng session, Origin và CSRF hợp lệ. API kiểm tra quyền event, mục đích, phần mở rộng và số byte: media tối đa 10 MB, Excel tối đa 5 MB. Mỗi admin có tối đa 20 lượt upload còn hiệu lực. API tự tạo key; không nhận key hoặc URL tùy ý từ client.
2. API lưu metadata rồi cấp URL PUT hết hạn sau 5 phút cho đúng một object private. URL ký cả độ dài nội dung khi provider hỗ trợ; chặn file quá giới hạn tại bucket nếu cấu hình bucket cho phép. Cần xác minh bằng test thực tế rằng browser/Supabase nhận đúng chữ ký và preflight.
3. Trình duyệt upload bằng URL, không gửi session cookie hoặc khóa S3. Sau đó gửi `uploadId` cho API. Không log URL đã ký.
4. API kiểm tra metadata, quyền, thời hạn; dùng HEAD và đọc stream có giới hạn cứng. Không tin MIME, phần mở rộng hay kích thước từ client. Xác minh chữ ký file và chạy bộ xử lý hiện có: Sharp cho ảnh, FFmpeg full decode cho nhạc, parser Excel giới hạn hiện có.
5. Media hoàn tất chỉ nhận một lần bằng cập nhật điều kiện nguyên tử; không giữ transaction trong lúc đọc S3/decode. File đã xác minh được lưu thành các variant private và `MediaAsset` READY như trước; publish mới copy sang bucket public. File đầu vào bị xóa sau xử lý; bản ghi tạm được giữ đến sau khi URL PUT hết hạn để dọn cả trường hợp URL bị dùng lại.

Excel dùng cùng uploadId từ bước inspect đến preview, thời hạn tối đa 30 phút. Inspect chỉ đọc; preview nhận xử lý một lần rồi xóa file gốc. Bản preview và commit vẫn giữ hash, version và kiểm tra xung đột như hiện tại. Nếu hết hạn hoặc xử lý thất bại, UI cho tải lại file đang chọn để thử lại. File tạm không bao giờ được publish.

Local giữ multipart hiện có. Frontend dùng helper upload chung để chọn đường phù hợp theo phản hồi từ server; không đặt credential hoặc thông tin triển khai vào màn hình sản phẩm.

## Preview, export và phản hồi nhỏ

Admin xem media S3 bằng URL GET private có chữ ký, hiệu lực ngắn, cấp sau khi xác thực và kiểm tra quyền. Link preview cũ vẫn kiểm tra session/quyền rồi redirect sang URL GET; không proxy file lớn qua Vercel. Với local, giữ đường preview hiện tại.

Export/report Excel trên S3: tạo file private với mục đích EXPORT, lưu metadata để dọn, trả URL tải có chữ ký thay vì body file. Helper download xử lý cả file trực tiếp local và URL S3. File export có thời hạn lưu 10 phút, URL tải tối đa 60 giây. Tên tải xuống an toàn và cache private/no-store. Link có chữ ký là bearer capability: không ghi log, không đưa vào public bucket.

Preview nhập Excel có thể vượt giới hạn JSON dù file đầu vào hợp lệ. Phân trang phần dữ liệu preview, lỗi và cảnh báo với tối đa 100 mục mỗi trang; trả tổng số và summary toàn bộ batch. UI có chuyển trang, trạng thái cho toàn batch và tải report đầy đủ. Commit luôn kiểm tra toàn batch trong database, không chỉ trang đang xem; mọi lỗi trong batch đều chặn commit.

CSP của Express cho phép đúng origin S3 từ cấu hình ở `connect-src`, `img-src` và `media-src`; không dùng wildcard chung. Giữ no-referrer, no-store cho dữ liệu admin, cookie Secure/HttpOnly/SameSite và bảo vệ CSRF hiện có.

## Rate limit và dọn file

Thêm `RateLimitBucket` với khóa băm có namespace, bộ đếm và thời hạn. Production dùng PostgreSQL atomic upsert để mọi instance chia sẻ giới hạn IP, tài khoản và guest; local/test thông thường giữ memory store. Giữ các ngưỡng hiện tại, decrement cho login thành công, reset theo hạn và fail closed khi database lỗi. Không ghi IP, email hoặc token thô vào bảng/log. Test riêng store PostgreSQL bằng hai instance và request đồng thời.

Lệnh maintenance hiện có được mở rộng để dọn bucket đếm hết hạn và TemporaryObject hết hạn. Chỉ xóa key đã ghi trong bảng tạm, không quét/xóa theo suy đoán. Xóa object thành công rồi mới xóa metadata; lỗi giữ lại để retry. Với upload, chỉ dọn metadata sau khi URL PUT đã hết hiệu lực cộng khoảng đệm; không đụng MediaAsset hoặc revision.

Thêm endpoint maintenance xác thực Bearer `CRON_SECRET` cho Vercel Cron chạy mỗi ngày; endpoint nhận quyền riêng, không dùng session admin và không mở CLI ra công khai. Người dùng hết hạn vẫn bị từ chối ngay, không phụ thuộc cron. File tạm có thể còn lưu vật lý đến lượt cron kế tiếp; đây là thời hạn quyền truy cập, không phải cam kết xóa tức thì. Mỗi lượt dọn có giới hạn khối lượng/thời gian và giữ phần chưa dọn cho lượt kế tiếp.

## Phạm vi thay đổi và kiểm thử

Chạm vào cấu hình server/container, storage service, endpoint upload, media/import controllers, helper API frontend, màn hình media/import, rate-limit stores, maintenance, Prisma migration, fixtures/reset test và tài liệu deploy. Không thay nội dung thiệp hoặc luồng khách xác nhận tham dự.

Kiểm thử bắt buộc:

- Test các trust boundary của upload: sai chủ sở hữu, hết hạn, nhận xử lý lặp, file quá giới hạn, nội dung giả định dạng; cleanup sau lỗi. Test PostgreSQL store dùng chung, reset/decrement và lỗi database.
- Test import phân trang nhưng summary/commit dùng toàn batch; giữ đầy đủ report và kiểm tra xung đột. Test private preview/export URL và giữ chế độ local.
- Typecheck, build, backend suite và E2E cho media/import/login/khách sau thay đổi.
- Build image Linux; chạy bằng env local/test để kiểm tra health, SPA deep links, API, cookie và decode audio. Kiểm tra image không chứa file env/secrets.
- Test S3 thật bằng object ngẫu nhiên: preflight browser, PUT >4,5 MB, GET private có chữ ký và chặn truy cập anonymous; xóa toàn bộ object test. Không chạm media thật hoặc seed production.

## Thứ tự triển khai và giới hạn phê duyệt

Sau khi thiết kế được duyệt: viết plan, sửa/test tại workspace, kiểm tra image và chuẩn bị tài liệu/cấu hình Vercel cụ thể. Chỉ khi mọi kiểm tra qua mới tạo/link project đúng repo và cấu hình production; chưa push hoặc công khai deployment trong bước chuẩn bị này.

Biến production lấy từ profile local đã có; không đổi SESSION_SECRET/INVITATION_KEY, không đưa ADMIN_BOOTSTRAP_PASSWORD lên Vercel. Thêm CRON_SECRET và các giá trị vận hành port/host/tmp, đặt APP_ORIGIN/CORS_ORIGINS theo domain đã xác minh. DATABASE_URL dùng transaction pooler, DIRECT_URL chỉ dành cho migration/CLI. Preview không dùng credentials production.

Migration chỉ thêm hai bảng và quyền/RLS của chúng, kiểm thử local trước; không sửa dữ liệu hiện có. Trước khi áp dụng lên cloud phải có phương án backup phù hợp và chỉ chạy migrate deploy một lần trước traffic. Việc phát hành sẽ trình bày URL/config và kết quả kiểm tra để người dùng duyệt ở bước cuối.

Quyết định kỹ thuật còn lại giao cho người triển khai: tên hàm/file cụ thể, hình thức điều hướng trang preview, số mục mỗi lượt cleanup trong giới hạn timeout, và cách xử lý mã lỗi S3 thành thông báo dễ hiểu. Không tự chọn thêm dịch vụ trả phí.

## Rà soát thiết kế

Đã có một lượt builder check độc lập: không còn câu hỏi quan trọng cần đoán trước khi viết plan. Các bước kiểm chứng S3 thực tế, image Linux và deployment thật vẫn là điều kiện nghiệm thu, chưa được xem là đã hoàn tất.

## Nguồn đã đối chiếu

- https://vercel.com/docs/functions/runtimes/container
- https://vercel.com/docs/functions/limitations
- https://supabase.com/docs/guides/storage/s3/compatibility
- https://supabase.com/docs/guides/storage/s3/authentication
- https://supabase.com/docs/guides/database/connecting-to-postgres
