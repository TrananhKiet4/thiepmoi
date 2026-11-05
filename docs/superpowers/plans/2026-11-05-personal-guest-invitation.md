# Thiệp khách mời theo mẫu tham khảo

Yêu cầu: dùng phong cách của https://kimngan-graduation.vercel.app/ cho thiệp khách mời, tiếp tục tạo link riêng gắn với từng tên. Đây là thay đổi giao diện trên luồng đã có; không thêm phương thức nhận diện khách hoặc thay cơ sở dữ liệu.

## Phạm vi đã xác định

- Nền giấy kem, xanh pastel và đỏ rượu vang; phong bì với con dấu mở thiệp, bướm trang trí, tiêu đề lớn và khung ảnh giấy.
- Dùng ảnh, tên người tốt nghiệp, trường, nội dung, thứ tự/ẩn hiện các phần đang cấu hình trong quản trị. Không lấy ảnh, logo, tên hay thông tin liên hệ của chủ website mẫu.
- Tên khách tự lấy từ `/i/:token`, xuất hiện trên phong bì, lời mời và phần xác nhận. Giữ nguyên Bearer token, RSVP hai trạng thái, lời chúc có đồng ý công khai/kiểm duyệt, thu hồi link và chống lẫn dữ liệu khi đổi khách.
- Dùng lại nội dung và lịch sự kiện hiện có, không thêm trường dữ liệu, thư viện, form nhập lại danh tính hoặc tính năng tải ảnh thiệp.
- Giữ thay đổi Maps/sơ đồ trường, bỏ ba khối và sửa font đã có trong main `6805b43`.

## Cách thực hiện

1. Bổ sung kiểm thử hai khách: đúng tên sau khi mở thiệp, tên gắn sẵn trong form, điều hướng đến địa điểm và không giữ phản hồi của khách trước. Chạy thấy lỗi trước khi sửa.
2. Thay trình bày trong `Invitation.tsx` và CSS chỉ dành cho thiệp; giữ nguyên lớp API, xử lý lỗi và các form hiện có. Trang trí bằng CSS/SVG tự tạo. Dùng font hệ thống hỗ trợ tiếng Việt, hỗ trợ giảm chuyển động và bàn phím.
3. Chạy typecheck/build, unit/integration và E2E desktop/mobile; xem ảnh chụp ở nhiều kích thước và bản xem trước quản trị. Kiểm tra độc lập diff rồi xử lý lỗi thực tế.
4. Ghi lại kết quả và tình trạng phát hành. Không sửa dữ liệu thiệp thực của người dùng để thử giao diện.

## Lựa chọn triển khai

Sửa trực tiếp phần trình bày hiện có là cách ít thay đổi nhất: luồng dữ liệu và quản lý khách đã đáp ứng yêu cầu link riêng. Tạo ứng dụng khác hoặc thêm một bộ giao diện có thể lựa chọn sẽ làm phát sinh cấu hình và hai luồng cần bảo trì mà yêu cầu không cần.

## Kết quả kiểm chứng

- Unit/API: 91/91 qua; toàn bộ E2E desktop/mobile: 24/24 qua.
- Sau rà soát: kiểm thử tái hiện tiêu đề tách thành hai dòng ở 320px trước khi sửa, sau sửa một dòng ở 320/375/390px. Sửa ảnh QA phản hồi để dùng đúng viewport mobile.
- Tái hiện trang còn scrollY=148 sau mở phong bì; chuyển về đầu thiệp và đưa focus vào tiêu đề. Sáu kiểm thử liên quan đến mở thiệp, hai khách/link riêng, upload sơ đồ trong modal và preview thiếu ngày đều qua ở desktop/mobile sau sửa cuối.
- Typecheck và build qua. Docker Linux build thành công; kiểm thử runtime dùng database/container riêng xác nhận web/API, phiên đăng nhập, CSRF, codec ảnh/MP3/M4A và chạy non-root; không đọc dữ liệu Supabase thật.
- Rà soát độc lập không có lỗi mức critical/important. Đã xử lý cả lỗi 320px và ảnh QA nêu trong rà soát.
- Ảnh QA lưu local ngoài Git tại `.data/qa/guest-*.png`. Chưa thử âm nhạc trên thiết bị iOS/Android thật.
