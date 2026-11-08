# Ảnh và nhạc cố định của thiệp

Ảnh nằm trong `frontend/public/invitation-assets/photos/`. Nhạc nền nằm trong `frontend/public/invitation-assets/music/`. Khi chạy local, web đọc trực tiếp các thư mục này.

Trên Production, các file riêng được lưu trong bucket private của Supabase và phục vụ qua đường dẫn cố định `/invitation-assets/` của thiệp. GitHub chỉ lưu mã nguồn và ảnh minh họa demo.

Chặng **04 Người đồng hành** có 60 ô. Hàng 1 chứa ảnh 1–15, hàng 2 chứa ảnh 16–30, hàng 3 chứa ảnh 31–45 và hàng 4 chứa ảnh 46–60. Thiệp lấy vị trí từ số trong tên file. Ô nào thiếu ảnh sẽ để trống.

### Thêm ảnh lên thiệp

1. Đặt ảnh gốc JPEG, PNG hoặc WebP vào thư mục `đồng hành/`. Dùng tên số từ 1 đến 60, chẳng hạn `31.jpg`.
2. Chạy `node scripts/publish-static-media.mjs` ở thư mục dự án. Lệnh tạo ảnh WebP, đồng bộ lên **Supabase Storage** và cập nhật `packages/contracts/src/companion-photos.ts`. Không có bước ghi ảnh vào bảng PostgreSQL.
3. Commit danh sách và push lên `codex/wish-card-wall`. Để Vercel tự phát hành bản Production khi push, chọn nhánh này tại **Settings → Environments → Production → Branch Tracking**.

   ```powershell
   git add packages/contracts/src/companion-photos.ts
   git commit -m "Cap nhat anh nguoi dong hanh"
   git push origin codex/wish-card-wall
   ```

4. Khi deployment trên Vercel báo **Ready**, tải lại link thiệp. Ảnh gốc và bản WebP nằm ngoài GitHub.

Lệnh mặc định thêm các số mới. Để thay ảnh cùng số hoặc dùng đúng bộ ảnh trong thư mục, chạy `node scripts/publish-static-media.mjs --replace-companions` ở bước 2. Ảnh thay nội dung được cấp đường dẫn mới.

Ảnh bìa, ảnh chính, ảnh câu chuyện, sơ đồ và nhạc có danh sách lựa chọn trong `packages/contracts/src/static-media.ts`. Để thêm file, đặt file vào thư mục tương ứng rồi thêm mục có UUID riêng, loại `IMAGE` hoặc `AUDIO`, tên hiển thị và đường dẫn. Chạy `node scripts/publish-static-media.mjs` để đồng bộ file lên bucket từ profile Production local, rồi triển khai mã nguồn trước khi chọn file trong **Nội dung**. Script dùng tên file mới cho nội dung thay thế.

Các phiên bản thiệp đã lưu giữ nguyên UUID ảnh và nhạc. Danh sách cố định dùng cùng UUID để phục vụ các file đã chuyển. Trước khi gỡ bảng `MediaAsset` trên Production, phát hành bản dùng file cố định, kiểm tra thiệp và xác minh bản sao lưu PostgreSQL. Muốn quay lại bản ứng dụng dùng thư viện sau khi gỡ bảng, cần phục hồi bảng từ bản sao lưu tương ứng trước.
