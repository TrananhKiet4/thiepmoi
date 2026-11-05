# Thư viện: tải nhiều file và đổi tên

- Một lần chọn nhiều file, một lần bấm tải. Dùng lại `uploadMedia` và đường truyền multipart/S3 hiện có, xử lý lần lượt để giới hạn bộ nhớ/server; giữ giới hạn10MB mỗi file và xác thực nội dung phía server.
- Hiện tiến độ, báo lỗi theo từng file. Giữ các file thất bại để thử lại; các file đã xác nhận thành công không bị gửi lại. Khóa chọn file/mô tả trong lúc tải để giữ đúng nội dung lô.
- Thêm ô Tên hiển thị trong từng thẻ media, dùng metadata `originalName` sẵn có, không đổi storageKey/variants hay tham chiếu trong thiệp. Giữ riêng mô tả thay thế. Chọn ảnh trong nội dung/sơ đồ ưu tiên tên hiển thị đã sửa.
- PATCH chấp nhận tên hoặc mô tả hoặc cả hai, giữ tương thích alt-only, xác minh chủ sở hữu, chặn tên rỗng/quá dài/ký tự điều khiển/phân cách thư mục. Trả metadata admin đã lưu để form đồng bộ chuẩn hóa; khóa ô nhập khi lưu.
- Kiểm thử API đổi tên/giữ file/ảnh đang dùng và quyền sở hữu; E2E lô3 file có một lỗi giữa lô, thử lại đúng một file và đổi tên bền vững sau reload/hiện trong các bộ chọn. Sau đó build, kiểm tra desktop/mobile, rà soát độc lập và phát hành cùng project hiện có, không sửa ảnh thật để thử.

## Kết quả kiểm chứng

- Đã thấy RED: API đổi tên trả400 và input.multiplefalse. Sau sửa:14 kiểm thử media và luồng batch/rename trên desktop/mobile đều qua.
- Toàn bộ97 unit/API,28 E2E, typecheck và build qua. OpenAPI3.1 kiểm tra43paths/436refs thành công.
- QA bổ sung xác nhận không tràn ngang, xem ảnh chụp form lỗi theo file và thẻ ảnh đã đổi tên trên mobile. Ảnh QA ở `.data/qa/media-*.png`, dữ liệu thử nghiệm ngoài Git.
- Rà soát độc lập không có phát hiện cần xử lý. Hàng đợi bền vững sau khi rời trang, chống trùng sau mất phản hồi thành công và phân trang thư viện nằm ngoài yêu cầu; file đã xác nhận tải thành công không được gửi lại khi thử lại lỗi.
