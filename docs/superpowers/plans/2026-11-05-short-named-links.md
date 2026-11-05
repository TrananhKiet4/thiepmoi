# Link có tên khách, mã5 ký tự

Yêu cầu cuối: mã riêng5 ký tự, tên khách ở cuối URL. Dạng `/i/A7k9P/tran-van-an`; tên lấy từ fullName, bỏ dấu/ký tự phân cách thành dấu gạch nối. Link dài43 ký tự đã gửi vẫn hoạt động.

- Giữ nguyên token dài, hash, ciphertext và cách thu hồi/rotate hiện tại. Thêm bảng alias riêng lưu mã5 ký tự được mã hóa, HMAC của mã+tên, keyVersion, invitationId và snapshot tokenHash. Không lưu mã ngắn dạng rõ. Alias ràng buộc đúng tên trong link và đúng token hiện tại, nên rotate/revoke/archive vẫn có hiệu lực.
- Một alias ổn định cho mỗi invitation/tokenHash/tên. Đổi tên tạo alias mới nhưng alias cũ vẫn hợp lệ; các tên trùng có mã riêng. Dự phòng collision bằng kiểm tra mã, constraint và retry transaction có giới hạn. Giữ alias cũ để không cấp lại mã/tên đã bị thu hồi.
- Vì5 ký tự dễ dò hơn, thêm giới hạn5 lần xác thực sai/15phút theo tên bằng transaction PostgreSQL ReadCommitted và advisory lock theo tên. Kiểm tra ngân sách sau khi khóa và chỉ tăng khi mã/tên sai, nên các request đúng đồng thời không chiếm hạn mức; lỗi nội dung không tính là sai xác thực. Giữ limiter IP và token hiện tại.
- Trình duyệt gửi credential nội bộ dạng `code.slug`; API vẫn nhận token dài43. React và Express phục vụ cả đường dẫn cũ và mới; query cache phân biệt cả credential. Copy link, lời nhắn và Excel dùng cùng helper.
- Migration Prisma chỉ thêm bảng/index/FK, bật RLS và thu hồi quyền anon/authenticated cho bảng mới. Backup schema public vào thư mục local đã được cho phép trước migration Production. Không đổi dữ liệu thiệp, mã dài hoặc mật khẩu.
- Kiểm thử tên tiếng Việt, duplicate/collision/concurrent, ổn định link, legacy, sai tên, rotate/revoke, limiter qua nhiều IP, export, desktop/mobile; build/runtime route Linux; rà soát độc lập, migration và deploy hiện có.

## Kiểm chứng

- RED URL cũ thiếu tên/mã ngắn, sau sửa core39 kiểm thử API và4 E2E guest desktop/mobile qua. Full102 unit/API và28 E2E qua trước rà soát.
- Rà soát tìm trường hợp6 request đúng đồng thời bị express-rate-limit chặn nhầm request thứ6. Đã tái hiện RED và thay bằng transaction ReadCommitted + advisory lock + tăng counter chỉ khi sai. Sau sửa:6 request đúng200,6 lỗi nội dung không tính,5mã sai qua nhiều IP401 rồi429. Kiểm tra pool một kết nối gồm cả credential ngắn có giới hạn thực.
- Full102 unit/API, focused4 E2E guest, typecheck qua sau sửa cuối. Image Linux build thành công với route cũ/mới. Rà soát tiếp không còn phát hiện cần xử lý.
- Backup public schema được xác minh inventory trước migration; tokenHash/ciphertext dài được kiểm tra không đổi. Migration chỉ thêm bảng alias, không áp dụng các DROP custom foreign keys do diff mặc định đề xuất.
