# Phản hồi khách và nội dung trên link đang gửi

Trên Production, bản nháp là phiên bản 16 và thiệp công bố là phiên bản 8. RSVP và lời chúc đều tắt. Alias cũ gắn với token trước lần cấp lại. Người dùng đã xác nhận khôi phục link 5 ký tự cũ.

- Kiểm tra bản nháp mới đầy đủ và media trước khi công bố; bật lại RSVP/lời chúc theo yêu cầu, giữ nguyên lựa chọn ẩn tường lời chúc. Không sửa/ghi phản hồi thử vào thiệp thật.
- Thêm nullable restoredTokenHash trên alias: chỉ alias được người dùng cho phép mới trỏ lại token hiện tại. Giữ snapshot tokenHash ban đầu để lịch sử rõ ràng; token rotate sau này vẫn vô hiệu alias đã phục hồi. Không khôi phục token43 đã thu hồi.
- Nút quản trị Lưu & cập nhật thiệp làm save-draft khi có thay đổi rồi publish đúng version trả về. Giữ nút lưu bản nháp riêng; nhãn rõ bản nháp chưa áp dụng cho khách. Khóa nội dung khi lưu để không mất sửa đang gõ. Tách trạng thái bật/tắt nhận phản hồi khỏi nhãn hành động.
- Link hợp lệ đọc publishedRevision hiện tại. Guest tự làm mới nội dung/quyền khi quay lại tab hoặc30giây. Refresh nền giữ nguyên RSVP/wish đã biết và version. Save/conflict chỉ làm mới phản hồi của biểu mẫu liên quan. Dừng tự thử credential401 để link bị thu hồi không tạo vòng dò mã.
- Tách sao chép ảnh khỏi giao dịch công bố. Giao dịch cuối kiểm tra lại version và revision, đánh dấu media sẵn sàng cùng lúc đổi con trỏ công bố. Sao chép local thay tệp theo kiểu nguyên tử để đọc song song luôn gặp tệp hoàn chỉnh.
- Kiểm thử restore có canonical alias trùng tên, rotate sau restore, metadata refresh không mất text/không tự tiến version, cập nhật publish tác động cả link cũ/mới. Backup trước migration và sửa dữ liệu Production, kiểm tra mã/thuộc tính dài và RSVP/wish giữ nguyên.

## Kiểm chứng

- Tái hiện việc khóa sự kiện trong khi sao chép, alias đã đánh dấu khôi phục vẫn trả 401 trên mã cũ, và thiếu nút cập nhật thiệp. Các kiểm thử qua sau khi sửa.
- Kiểm thử trình duyệt tái hiện lần lưu RSVP làm tiến phiên bản lời chúc. Sau khi tách phạm vi làm mới, cả hai biểu mẫu báo xung đột riêng và giữ nội dung đang soạn.
- 104 kiểm thử unit/API, 4 kiểm thử E2E liên quan trên desktop/mobile và build đã qua. Backup được kiểm tra trước migration thêm một cột nullable.
