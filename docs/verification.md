# Báo cáo kiểm tra bản triển khai

## Cập nhật Vercel/container ngày 04/11/2026

- Backend 67/67 và E2E desktop/mobile 18/18 pass; typecheck/build pass sau lượt sửa review. OpenAPI 3.1 đã parse: 43 paths, 436 references hợp lệ.
- Docker Engine Linux 29.9.2 đã chạy. `docker build -f Dockerfile.vercel -t thiepmoi:verify .` exit 0; image `sha256:beab7bb4e99d59188a1fe24c9cb9fd2d00322c7d14f7ba008427c2d05396dd83`, khoảng 1,58 GB uncompressed, runtime user `node`.
- Image chạy Node 24.22.2/Linux, user không phải root; không có `.env`, `.env.production.local`, `.data` hoặc `.git` của workspace trong image.
- Đã tạo PostgreSQL 18 container riêng, áp dụng cả hai migration và bootstrap tài khoản test bằng credentials ngẫu nhiên. Không dùng database hoặc credentials Supabase production trong lượt kiểm tra Linux.
- HTTP checks trong container pass: readiness, root/admin/deep links SPA, JSON API 404, login, Secure/HttpOnly cookie flags, session, event/draft, CSRF 403, logout 204, phiên đã thu hồi 401, cron xác thực. Đây là kiểm tra HTTP nội bộ với Origin/cookie test; HTTPS/browser trên domain Vercel thật chưa kiểm tra.
- Native Argon2, Sharp tạo ba variant ảnh, full decode MP3 và M4A bằng FFmpeg đều pass trong image production sau khi prune dev dependencies.
- Chỉ các container/network test tự tạo đã được dừng và dọn; các tài nguyên Docker khác không bị thay đổi.
- S3 thật đã qua PUT/GET trực tiếp từ browser với file 5 MiB, chặn anonymous private và Content-Length sai chữ ký; object thử đã xóa. S3 private preview/export hiện dùng signed GET, không proxy file lớn qua Vercel.
- Image build dùng working tree, bao gồm thay đổi có sẵn của người dùng là caret `^6.19.3` cho dev Prisma trong package/lockfile; phiên bản resolved vẫn 6.19.3. Hai thay đổi này cùng `.gitignore` được giữ nguyên, chưa đưa vào commit triển khai.

Chủ tài khoản đã cấp quyền cho team `trananhkiet4s-projects`. Đã tạo project `thiepmoi` (`prj_8BdA2pnWHjvoJBQRW8Y6Jz9m1Wft`), Container preset/Node 24, domain `thiepmoi-murex.vercel.app` được Vercel xác minh. Profile local đã cập nhật origin/domain; file import `.data/vercel-production.env` chứa 22 biến, không có bootstrap password/DIRECT_URL và được gitignore. Người dùng đã import; API metadata xác nhận đủ 22 biến chỉ có target Production, không còn Preview và không giải mã giá trị. Bản backup schema public 35.701 byte đã tạo theo ủy quyền riêng, kiểm tra inventory thành công (1 admin, 1 event, 0 guests/invitations); chưa diễn tập restore. Chưa push nhánh, migrate cloud hoặc deploy; chờ duyệt phát hành cuối.

## Cập nhật cấu trúc theo KLTN ngày 03/11/2026

Đã chuyển mã sang `backend/` và `frontend/`, chia các lớp/nhóm chức năng như `docs/project-structure.md`. Không thay phiên bản dependency, schema/migration hoặc dữ liệu runtime.

- TypeScript và build: pass với đường dẫn mới.
- 50/50 unit/integration pass trên PostgreSQL thật, gồm CLI bootstrap/seed tại `backend/scripts/cli.ts`.
- 14/14 E2E desktop/mobile pass; lượt này dùng API đã biên dịch tại `backend/dist/backend/src/server.js` cùng frontend mới.
- Worker Excel đã biên dịch được gọi trực tiếp với workbook thật và đọc đúng sheet/header.
- `npm run db:migrate`: không có migration chờ; `npm ci --dry-run --ignore-scripts`: pass.
- Đối chiếu lockfile: không đổi phiên bản thư viện; workspace links trỏ đúng backend/frontend.

Ngày 03/11/2026, kiểm tra local trên Windows, Node24.14.0, PostgreSQL18.4 thật tại loopback54329. Không dùng SQLite hoặc backend mock để xác nhận nghiệp vụ.

## Đã có bằng chứng chạy

- `npm test`:50/50 unit/integration pass sau sửa export lịch sử;8file kiểm thử, PostgreSQL thật, thời gian43,97giây.
- `npm run typecheck` và `npm run build`: pass; tách bundle khách và admin. Build gần nhất JS entry93,41KB gzip + thiệp10,13KB gzip; ảnh hero minh họa21.634bytes. Đây là dữ liệu demo, không phải kết quả LCP/INP trên mạng di động.
- 22 kiểm tra Excel/media pass, gồm XLSX lỗi/công thức, streaming ZIP inflation thực, limit2000dòng, stale version rollback, replay commit, export text an toàn, media private/public, xóa asset giữ tham chiếu, MP3/M4A decode thật bằng FFmpeg, AAC hỏng bị từ chối.
- 13 flow PostgreSQL pass: nháp/xuất bản, quyền chéo event, version, request đồng thời, idempotency, rút/xóa/sửa lời chúc, moderation, cursorwall, lifecycle token và dashboard.
- Bootstrap admin từ database test sạch tạo được event nháp; chạy lại giữ password hash và không tạo event/guest trùng. Seed dùng ảnh tạo riêng, 12 khách giả và ngày demo2099.
- Migration deploy trên database mới thành công, có FK cùng event, unique/CHECK và trigger revision bất biến. Reset test từ chối database không kết thúc `_test`.
- Backup custom pg_dump và pg_restore vào database mới thành công. Đối chiếu Event1/Guest12/Invitation12/RSVP0/Wish0; mọi token trong bản phục hồi giải mã ra đúng SHA-256 lưu trong database. Database nguồn không bị ghi đè.
- OpenAPI3.1 parse thành công,41paths và420tham chiếu nội bộ được resolve.
- Sửa export lịch sử có regression RED (khách bị bỏ khỏi XLSX) → GREEN (xuất đúng khách revoked/ATTENDING đang hiển thị). Dùng chung bộ lọc với danh sách.

## Rà soát độc lập

Một reviewer độc lập đã đọc toàn bộ thay đổi và các đường gọi liên quan. Không thấy lỗi Critical; hai Important đã sửa: retry sau mất phản hồi mạng và export lịch sử bỏ sót khách. Cả hai có regression; retry giữ idempotency key cho cùng nội dung, refresh phiên bản khi409 và giữ dữ liệu form. Không có Minor được hoãn.

## Trình duyệt và giới hạn

Giao diện đã được kiểm tra trực quan dashboard và thiệp trên desktop/mobile. Lượt cuối E2E14/14 pass trên desktop và mobile Chromium,50,6giây: nhập Excel, publish, hai link khách riêng, RSVP, lời chúc/duyệt/sửa, rotate, export,6độ rộng320–1440px, draft để trống ngày, thao tác modal nhỏ, retry mất mạng và conflict version. Đã sửa và kiểm tra thêm request wall bị hủy trong StrictMode không hiển thị lỗi giả; success banner cũ không xuất hiện sau409. Ảnh QA sau sửa nằm trong `.data/qa`, không đưa vào source repository.

Chưa đo LCP/CLS/INP trong điều kiện mạng chuẩn, API p95 với100phiên hoặc import commit2000dòng đầy đủ. Không báo đạt các mục tiêu hiệu năng chỉ từ build/test chức năng. Chưa thử trên iOS Safari/Android Chrome thiết bị thật; Chromium emulation không thay thế kiểm tra thiết bị.

Trong lượt kiểm tra ban đầu ngày 03/11 chưa có tài khoản S3 nên chưa kiểm tra roundtrip; xem kết quả cập nhật 04/11 phía trên. Publish S3 thất bại có thể để lại object copy không tham chiếu, cần inventory/dọn có đối chiếu database như runbook. Chưa cấu hình domain/HTTPS, scheduler backup hoặc monitoring production.

`npm audit --omit=dev`:0high/critical,8moderate theo chuỗi phụ thuộc ExcelJS/archiver/glob/minimatch. Ứng dụng không nhận glob pattern hoặc đường dẫn filesystem từ người dùng ở đường này; import được chặn trong worker có giới hạn. Đây không phải tuyên bố loại bỏ advisory: giữ lockfile, đánh giá bản vá/thư viện thay thế trước production; không chạy audit fix --force để hạ ExcelJS thiếu kiểm tra tương thích.

## Đối chiếu nghiệm thu

- AC01,AC06–AC19: đã có kiểm tra API/DB và/hoặc E2E pass; vẫn cần chạy checklist với dữ liệu thật trước khi gửi.
- AC02–AC05: UI responsive, reduced motion, nhạc chủ động, bản đồ fallback và ICS đã triển khai; ca desktop/mobile Chromium pass, thiết bị thật và chính sách autoplay phần cứng còn chưa kiểm tra.
- AC20: migration/bootstrap/seed/backup/restore đã chạy; tài liệu và scripts có trong repo, production external services chưa cấu hình.

Mọi thông tin trường, địa điểm, người tốt nghiệp, ảnh và deadline trong demo phải được thay và kiểm tra lại trước khi gửi thiệp thật. Thử một khách riêng, kiểm tra RSVP/consent/rotate và xác nhận backup trước sử dụng.
