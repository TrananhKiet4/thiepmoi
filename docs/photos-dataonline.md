# Ảnh trên Data Online

Các ô ảnh dùng đường dẫn cố định `/invitation-assets/photos/...`. File tương ứng trên hosting nằm trong `domains/trananhkiet.id.vn/public_html/invitation-assets/photos/`. Máy chủ web trả ảnh trực tiếp khi file đã có tại đây.

Ảnh thật được quản lý ngoài Git. Danh mục trong `packages/contracts/src/static-media.ts` và `packages/contracts/src/companion-photos.ts` chứa tên file, kích thước và đường dẫn dùng trên giao diện.

## Thêm hoặc thay ảnh Người đồng hành

Đặt ảnh gốc trong thư mục `đồng hành` tại thư mục gốc dự án. Tên file là số từ 1 đến 60 và phần mở rộng `.jpg`, `.jpeg`, `.png` hoặc `.webp`. Mỗi số có một ảnh.

Hàng 1 dùng số 1–15, hàng 2 dùng 16–30, hàng 3 dùng 31–45 và hàng 4 dùng 46–60. Những số thiếu ảnh hiển thị ô trống.

Sau khi lưu ảnh, mở terminal tại thư mục gốc và chạy lệnh sau.

```powershell
rtk proxy npm run dataonline:photos
```

Lệnh đọc cấu hình FTPS trong `.env.cicd.local`, chuyển ảnh gốc bằng bộ xử lý hiện có thành WebP bản lớn và bản nhỏ, rồi upload cùng các ảnh bìa, câu chuyện và bản đồ đã đăng ký trong `static-media.ts`.

Mỗi ảnh được upload qua tên tạm rồi đổi sang tên cuối cùng khi truyền xong. Những đường dẫn đã có trên hosting được kiểm tra nội dung trước khi tái sử dụng. File có tên đã tồn tại với nội dung khác sẽ báo lỗi để người vận hành tạo tên phiên bản mới.

Khi tất cả ảnh đã được kiểm tra HTTP 200 trực tiếp, script cập nhật danh mục ảnh đồng hành nếu có thay đổi. Commit danh mục này rồi push `main` để CI/CD cập nhật giao diện.

```powershell
rtk proxy git add packages/contracts/src/companion-photos.ts
rtk proxy git commit -m "Cap nhat anh nguoi dong hanh"
rtk proxy git push origin main
```

Các ảnh bìa, câu chuyện và bản đồ dùng các đường dẫn đã đăng ký trong `static-media.ts`. Khi thay các ảnh này, đặt file WebP có tên phiên bản mới trong `frontend/public/invitation-assets/photos`, cập nhật danh mục và chạy lệnh upload trước khi push mã nguồn.

## Cache và CI/CD

Các tên ảnh có mã phiên bản sử dụng `Cache-Control: public, max-age=31536000, immutable`. Khi nội dung ảnh đồng hành thay đổi, tên file cũng thay đổi để trình duyệt nhận ảnh mới. Thư mục ảnh chặn liệt kê danh sách file và gửi `X-Robots-Tag: noindex, nofollow` như đường phục vụ ảnh trước đó.

CI/CD loại trừ file WebP trong thư mục ảnh khỏi thao tác đồng bộ mã nguồn. File cấu hình `.htaccess` của thư mục này được quản lý trong Git. Thông tin vị trí ảnh và các nội dung thiệp được cập nhật qua quy trình push `main`.

Lần upload hiện tại sử dụng 51 ảnh gốc đồng hành, có 102 file WebP cho hai kích thước, cùng 18 file cho ảnh bìa/câu chuyện/bản đồ. Các vị trí 27–35 chưa có ảnh gốc.
