# Ảnh và nhạc cố định của thiệp

Ảnh nằm trong `frontend/public/invitation-assets/photos/`. Nhạc nền nằm trong `frontend/public/invitation-assets/music/`. Khi chạy local, web đọc trực tiếp các thư mục này.

Trên Production, các file riêng được lưu trong bucket private của Supabase và phục vụ qua đường dẫn cố định `/invitation-assets/` của thiệp. GitHub chỉ lưu mã nguồn và ảnh minh họa demo.

Chặng **04 Người đồng hành** lấy ảnh từ `photos/companions/` theo danh sách trong `frontend/src/features/Guest/invitation/companion-photos.ts`. Tên ảnh chạy từ `01.webp` đến `30.webp`. File có hậu tố `-small.webp` dành cho màn hình nhỏ. Cập nhật kích thước trong danh sách khi thay ảnh bằng file có tỷ lệ khác.

Ảnh bìa, ảnh chính, ảnh câu chuyện, sơ đồ và nhạc có danh sách lựa chọn trong `packages/contracts/src/static-media.ts`. Để thêm file, đặt file vào thư mục tương ứng rồi thêm mục có UUID riêng, loại `IMAGE` hoặc `AUDIO`, tên hiển thị và đường dẫn. Chạy `node scripts/publish-static-media.mjs` để đồng bộ file lên bucket từ profile Production local, rồi triển khai mã nguồn trước khi chọn file trong **Nội dung**. Script dùng tên file mới cho nội dung thay thế.

Các phiên bản thiệp đã lưu giữ nguyên UUID ảnh và nhạc. Danh sách cố định dùng cùng UUID để phục vụ các file đã chuyển. Trước khi gỡ bảng `MediaAsset` trên Production, phát hành bản dùng file cố định, kiểm tra thiệp và xác minh bản sao lưu PostgreSQL. Muốn quay lại bản ứng dụng dùng thư viện sau khi gỡ bảng, cần phục hồi bảng từ bản sao lưu tương ứng trước.
