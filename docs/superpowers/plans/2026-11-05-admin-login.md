# Đăng nhập bằng admin

Người dùng yêu cầu tên `admin`, sau đó thay mật khẩu ban đầu bằng mật khẩu mới, áp dụng cả local và Vercel. Mật khẩu thật chỉ lưu trong các profile local ngoài Git và dưới dạng Argon2 trong database.

1. Cho phép `admin` hoặc email trong ô đăng nhập và API. Alias `admin` trỏ tới tài khoản có email cấu hình trong `ADMIN_BOOTSTRAP_EMAIL`; giữ nguyên ID, chủ sở hữu sự kiện, phiên/CSRF, trạng thái khóa tài khoản và kiểm tra hash. Alias và email dùng chung giới hạn đăng nhập.
2. Bootstrap chỉ kiểm tra độ dài mật khẩu khi tạo mới; chạy lại với tài khoản hiện có không ghi đè hash. Cập nhật hợp đồng API và tài liệu.
3. Đã tái hiện API local chấp nhận Origin localhost:5173 nhưng từ chối127.0.0.1:5173. Thêm đúng hai địa chỉ local vào profile CORS; Production giữ origin canonical https://tak-thiepmoi.vercel.app.
4. Kiểm thử API/CLI và desktop/mobile trước khi cập nhật tài khoản. Sao lưu hash cũ local ngoài Git, đổi hash đúng tài khoản cấu hình ở hai database, thu hồi phiên cũ; kiểm tra ID và số dữ liệu sự kiện/khách không đổi. Không tạo tài khoản/event thay thế.
5. Cấu hình email của alias cho Vercel Production, triển khai nhánh có cả giao diện thiệp mới và đăng nhập. Kiểm tra đăng nhập, CSRF/đăng xuất, xem trước trên đúng domain. Không ghi mật khẩu thật vào source, test, README hay log.

## Kiểm chứng trước phát hành

- API/CLI và UI đã có kiểm thử RED trước khi sửa. Bộ đếm alias/email cũng tái hiện lượt thứ6 còn trả401 rồi sửa để trả429.
- Toàn bộ unit/API94/94, E2E desktop/mobile26/26, typecheck và build qua.
- Image Linux build và runtime smoke qua: đăng nhập bằng `admin`, Secure/HttpOnly cookie, CSRF, đăng xuất, cron, codec ảnh/MP3/M4A, non-root và loại trừ file riêng.
- Rà soát độc lập không tìm lỗi ứng dụng. Helper đổi mật khẩu đã bổ sung kiểm tra round-trip dotenv cho cả hai profile trước lần ghi database đầu tiên.

## Kiểm tra thực tế và bản sửa tiếp theo

- Đã đổi hash mật khẩu theo yêu cầu trên đúng tài khoản local và Supabase, thu hồi phiên cũ, giữ ID và số dữ liệu sự kiện/khách. Đăng nhập, CSRF và đăng xuất thực tế qua cả localhost:5173 và127.0.0.1:5173.
- Production đăng nhập đúng chủ sở hữu. Khi kiểm tra preview, phát hiện `invitationView → mediaUrls` dùng Prisma toàn cục bên trong transaction; cloud cấu hình `connection_limit=1` khiến truy vấn media chờ kết nối thứ hai. Thiệp khách cũng đi qua cùng nhánh này.
- Truyền transaction hiện có từ cả hai controller qua `invitationView` tới `mediaUrls`, theo mẫu tham số client đã dùng trong `preparePublishedMedia`. Không đổi pool, quyền truy cập, dữ liệu hoặc schema.
- Kiểm thử tích hợp mới chạy hai route thật với media và pool một kết nối: RED lỗi preview500, GREEN cả preview và guest. Toàn bộ95 unit/API,26 E2E và build qua sau sửa. Rà soát độc lập phần sửa tiếp theo không có phát hiện cần xử lý.
