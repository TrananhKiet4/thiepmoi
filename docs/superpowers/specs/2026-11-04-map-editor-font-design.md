# Link Google Maps, ảnh sơ đồ trường và font tiếng Việt

Yêu cầu đã chốt: thay vĩ độ/kinh độ bằng link Google Maps; tải/chọn ảnh sơ đồ trường; bỏ cả ba khối Hẹn gặp & chụp ảnh, Hạn tiếp nhận và Lời mở theo nhóm khách; sửa font. Thay đổi nhỏ trên hệ thống hiện có, không thêm dịch vụ hoặc dependency, không migration database.

## Cách thực hiện

- Giữ JSON revision cũ đọc được: location nhận googleMapsUrl/ mapImageAssetId mặc định rỗng/null, tọa độ cũ được bỏ khi parse. Link Google Maps HTTPS được kiểm tra host/path; link rút gọn maps.app.goo.gl được chấp nhận, không gọi server để mở rộng URL. Nếu chưa dán link, nút Maps tìm theo địa chỉ đã nhập.
- Editor chuẩn bị bản nháp mới với meetup=null, rsvpDeadline=null, wishDeadline=null, groupMessages={} và map source CEREMONY. Chỉ ghi revision mới khi chủ thiệp bấm Lưu; không tự sửa dữ liệu production hoặc published revision. Backend vẫn đọc/honour deadline và nội dung legacy đến khi chủ thiệp lưu/publish bản mới. Bỏ meetup/deadline khỏi trình bày thiệp; vẫn giữ công tắc nhận RSVP/lời chúc.
- Ảnh sơ đồ là MediaAsset IMAGE hiện có; dùng chung uploader để hoạt động ở local và Supabase/Vercel. Thêm ảnh vào assetIds để kiểm tra sở hữu, copy khi publish, và chặn xóa nếu revision giữ tham chiếu. Hiển thị ảnh đầy đủ, không crop bản đồ; có thể chọn lại ảnh trong thư viện.
- Font: thử nghiệm Chromium trên Windows cho thấy Georgia trộn glyph từ Times New Roman, còn Times New Roman hiển thị toàn bộ văn bản mẫu bằng một font. Dùng Times New Roman thống nhất cho serif, giữ sans hiện có; không tải font bên ngoài hoặc thêm asset/dependency.

Đã cân nhắc self-host Noto Serif nhưng font hệ thống hiện có giải quyết được lỗi đã tái hiện với ít thay đổi hơn. Đã cân nhắc sửa toàn bộ JSON đang lưu nhưng chọn parser tương thích/revision mới để bảo vệ lịch sử và phần nhập liệu của chủ thiệp.

## Kiểm tra và phát hành

Test contract/Google URL/ảnh tham chiếu/deadline null và tương thích legacy; E2E desktop/mobile cho form đơn giản, upload sơ đồ và preview/Maps link; kiểm tra font regular/italic trong Chromium và ảnh chụp. Full backend, typecheck/build, review độc lập rồi cập nhật project Vercel hiện tại. Không chỉnh nội dung draft của người dùng để thử nghiệm production.
