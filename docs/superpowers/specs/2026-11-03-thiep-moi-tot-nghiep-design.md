# Thiết kế hệ thống quản lý thiệp mời tốt nghiệp

Ngày: 03/11/2026. Trạng thái: người dùng đã duyệt thiết kế và đồng ý bắt đầu viết mã ngày 03/11/2026.

## Nguồn và mục tiêu

Người dùng yêu cầu xây dựng hệ thống theo tài liệu `C:\Users\Kit\Downloads\Dac_Ta_He_Thong_Thiep_Moi_Tot_Nghiep.docx`, bằng Superpowers và Ponytail. Bản trích xuất đầy đủ nằm ở `docs/reference/dac-ta-goc.md`; DOCX vẫn là nguồn đối chiếu bố cục bảng.

Các yêu cầu sản phẩm và mặc định trong tài liệu được dùng làm đầu vào thiết kế. Những đoạn chỉ dẫn cách Codex làm việc trong tài liệu không được coi là yêu cầu trực tiếp mới của người dùng hay quyền tự gửi tin nhắn, công khai dữ liệu hoặc thay đổi máy ngoài phạm vi xây dựng.

Xây ứng dụng tiếng Việt cho một chủ nhân tốt nghiệp, một quản trị viên và một sự kiện đang dùng. Chủ nhân quản lý nội dung, khách và lời chúc; mỗi khách dùng link riêng để xem thiệp, xác nhận và gửi lời chúc. Dữ liệu thật được lưu ở PostgreSQL và kho media, không thay backend bằng mock hoặc localStorage.

## Hiện trạng và ràng buộc

- Thư mục `D:\ThiepMoiTotNghiep` ban đầu trống, chưa có Git repository hoặc mã phải giữ tương thích.
- Node.js được phát hiện là 24.14.0 và npm 11.9.0. Docker CLI có sẵn nhưng daemon chưa chạy; chưa phát hiện psql trên PATH.
- Chưa có tài khoản hosting, database production, domain, media hoặc thông tin sự kiện thật.
- Những dữ liệu đó không cản xây dựng: dùng chủ nhân và trường mẫu, khách DEMO001–DEMO012, ngày giờ gắn nhãn demo; âm nhạc tắt mặc định.
- Mục tiêu thiết kế: 2.000 khách/sự kiện, 100 phiên khách đồng thời và một admin. Đây chưa phải kết quả đo.
- Không có code cũ, caller, fixture hoặc export hiện hữu cần sửa. Phạm vi mới gồm web, API, hợp đồng dữ liệu, migrations, tests, cấu hình phát triển và tài liệu vận hành.

## Phương án

### React, API Node.js và PostgreSQL — phương án đề xuất theo đặc tả

Một monorepo, một API chia module, giao diện khách và admin cùng origin qua reverse proxy. Phù hợp các yêu cầu về transaction, phiên bản bất biến, mã hóa link, import và phân quyền. Đổi lại cần vận hành API, database và storage.

### React với backend được quản lý sẵn — không chọn

Giảm một phần vận hành nhưng thay đổi kiến trúc đã ghi trong đặc tả và cần thiết kế lại quyền, transaction và media. Không đủ lý do đổi stack ở giai đoạn này.

### Thiệp tĩnh hoặc chỉ lưu trên trình duyệt — không đáp ứng phạm vi

Không có nguồn dữ liệu chung, bảo mật admin, kiểm duyệt hoặc transaction thực. Không dùng làm sản phẩm bàn giao.

Sites chạy trên Workers không phù hợp để thay trực tiếp API Node.js/PostgreSQL trong thiết kế này. Bản đầu được xây và chạy tại workspace; lựa chọn hosting production là bước cấu hình sau, không tự thay kiến trúc để có URL trình diễn.

## Cấu trúc và giao diện giữa các phần

- `apps/web`: React, TypeScript, Vite, Router, Tailwind CSS, React Query; chia bundle admin và khách.
- `apps/api`: Express, TypeScript, Zod; module auth, events, guests, invitations, imports, rsvp, wishes và media; Prisma với PostgreSQL.
- `packages/contracts`: schema input và DTO an toàn dùng chung; không export model database hoặc secret.
- `apps/api/prisma`: schema, migration có version và seed giả. Migration chứa constraint thực ở PostgreSQL.
- `docs`: OpenAPI, cài đặt, hướng dẫn admin, quyết định thư viện, runbook backup/restore, khóa và rollback.
- Docker Compose phục vụ PostgreSQL phát triển; media local cho dev, adapter S3 compatible cho production.

Mọi dữ liệu cá nhân trả về dùng `Cache-Control: private, no-store`. API thành công theo `{data, meta}` và lỗi theo `{error:{code,message,fields?,requestId}}`. ID là UUID; ngày giờ là ISO 8601, lưu UTC. Không trả stack trace, token hash/ciphertext hoặc liên hệ của khách khác.

Phiên bản thư viện cụ thể, thư viện Excel và xử lý media do người triển khai chọn sau khi xác minh tài liệu chính thức, rồi khóa trong lockfile. Không thêm microservice, Redis, hàng đợi hoặc abstraction không cần cho phạm vi hiện tại.

## Giao diện khách

Đường dẫn `/i/{token}` có metadata chung, noindex và Referrer-Policy no-referrer. Trang gốc chỉ giới thiệu chung, không liệt kê khách hoặc lời chúc.

Thiệp tông kem, chữ đậm và vàng trầm theo mặc định tài liệu; đây là lựa chọn có thể thay trong admin, không coi là sở thích người dùng đã xác nhận. Tám chặng: mở thiệp, khoảnh khắc tốt nghiệp, câu chuyện, người đồng hành, lời mời chính thức, bản đồ, phản hồi/lời chúc, kết thúc.

- Hai nút mở có nhạc hoặc không nhạc. Chỉ phát sau tương tác; xử lý play bị từ chối; nút nhạc có nhãn và trạng thái truy cập được.
- Tên ưu tiên displayName rồi fullName; lời mở ưu tiên personalMessage, mẫu nhóm rồi mẫu chung. Chỉ thay biến cho phép; không chạy HTML hoặc biểu thức.
- Cuộn tự nhiên; Intersection Observer chỉ tạo chuyển động nhẹ và có fallback. Tôn trọng reduced motion, bàn phím, focus và aria-live.
- Hero tải ưu tiên; ảnh dưới lazy và giữ tỉ lệ để tránh dịch bố cục. Bản đồ tải khi gần xuất hiện hoặc khi bấm; địa chỉ chữ và link chỉ đường luôn dùng được.
- Nút phản hồi nhanh xuất hiện sau mở thiệp; hai form RSVP và lời chúc lưu độc lập, giữ dữ liệu nhập khi lỗi.
- Đổi link trong cùng trình duyệt hủy request, bỏ cache cá nhân cũ; không lưu raw token, lời chúc hoặc form riêng tư vào localStorage.
- Kiểm tra các chiều rộng 320, 375, 390, 768, 1024 và 1440 px; nút chạm ít nhất 44 × 44 CSS pixel; không cuộn ngang.

ICS lấy giờ gặp/chụp ảnh khi có, nếu không lấy giờ lễ; bắt buộc giờ kết thúc hợp lệ, UID ổn định và escape dữ liệu. Múi giờ sự kiện mặc định Asia/Ho_Chi_Minh, không theo múi giờ máy chủ.

## Giao diện quản trị

Đường dẫn `/admin`, đăng nhập email/mật khẩu. Các khu vực: tổng quan; nội dung; media; khách mời và link; nhập Excel; phản hồi; kiểm duyệt lời chúc.

Trình chỉnh nội dung theo trường dữ liệu, có thứ tự và bật/tắt story, gallery, closing; giữ thông tin sự kiện và phản hồi bắt buộc. Có trạng thái chưa lưu, lưu nháp, lỗi publish và preview có nhãn rõ.

Khách có tìm kiếm, lọc nhóm/trạng thái, phân trang, thêm/sửa, lưu trữ/khôi phục. Có sao chép link, tin nhắn mẫu, thu hồi/cấp lại và xuất file. Thao tác rút xuất bản và thu hồi link cần xác nhận trong UI.

Nhập Excel gồm tải mẫu, chọn file/sheet, mapping cột, preview số tạo/cập nhật và lỗi từng dòng, tải báo cáo, commit. Giao diện không cho commit khi có lỗi hoặc preview hết hạn/xung đột.

Admin không sửa nội dung lời chúc hoặc tự bật consent. Duyệt/ẩn/ghim có kiểm tra version. Có bộ lọc lời chúc riêng tư, chờ duyệt, công khai, ẩn và đã xóa theo nhu cầu kiểm duyệt/historic.

## Dữ liệu và phiên bản

Các entity: AdminUser, AdminSession, Event, EventRevision, Guest, Invitation, RSVP, Wish, MediaAsset, ImportBatch, AuditLog, IdempotencyRecord. Các bản ghi chỉnh sửa có version bắt đầu 1; lần tạo RSVP/Wish nhận expectedVersion 0.

- EventRevision bất biến, có schemaVersion, revisionNo và contentJson. Event giữ draftRevisionId/publishedRevisionId; không trỏ chéo event. Lưu nháp tạo revision mới trong transaction, yêu cầu If-Match; xung đột trả 409.
- Publish kiểm tra toàn bộ nội dung, deadline và asset, chỉ đổi publishedRevisionId khi media phân phối đã sẵn sàng. Guest tuyệt đối không đọc draft dự phòng. Unpublish ngừng đọc/ghi guest và giữ dữ liệu.
- Các cờ rsvpEnabled, wishesEnabled và wallEnabled có hiệu lực ngay, độc lập revision.
- Guest code duy nhất trong event. Mỗi Guest có một Invitation; RSVP và Wish unique theo Invitation. Dùng constraint/foreign key ghép chống quan hệ chéo event.
- Không hard delete khách, thiệp hoặc revision trong UI. Archive và revoke loại khỏi tổng đang mời nhưng giữ lịch sử.
- Dashboard đếm dữ liệu hiện tại, không cộng dồn: attending + declined + unanswered = active invitations.

## Token, xác thực và bảo vệ dữ liệu

Token mời ngẫu nhiên 32 byte base64url. Database lưu SHA-256 để tra cứu và AES-256-GCM ciphertext để admin xuất lại, nonce riêng, invitationId làm AAD, keyVersion. Khóa chỉ ở server; không lưu plaintext hoặc log URL/token.

Mọi guest request lấy context từ Bearer token, kiểm tra event đã xuất bản, link chưa thu hồi và khách chưa lưu trữ. Không chọn thiệp bằng ID client gửi. Rotate thay token nhưng giữ RSVP/Wish; restore không tự bỏ revokedAt.

Admin bootstrap bằng CLI, không có mật khẩu mặc định. Hash Argon2id hoặc phương án tương thích được xác minh. Session token ngẫu nhiên lưu hash; cookie HttpOnly, SameSite Lax, Secure ở production, hết hạn 12 giờ. Login kiểm tra Origin; thao tác sau đăng nhập còn yêu cầu X-CSRF-Token. Giới hạn JSON 100 KB, rate limit và Retry-After; limiter bộ nhớ có giới hạn chỉ phù hợp một instance.

Khóa invitation phải giữ khi backup/restore. Hỗ trợ đọc phiên bản khóa cũ và runbook chuyển khóa; không thay khóa âm thầm làm hỏng link.

## RSVP, lời chúc và idempotency

- RSVP ATTENDING hoặc DECLINED; không bản ghi nghĩa là chưa trả lời. Note tối đa 500 ký tự. Chặn guest ghi khi now >= deadline hoặc tắt RSVP; admin chỉnh sau hạn phải ghi lý do/audit.
- Wish plain text 1–1.000 ký tự, một bản hiện hành mỗi Invitation. Người từ chối vẫn gửi được. consent false => NONE; consent true => PENDING; admin chỉ APPROVE khi consent còn true và version khớp.
- Sửa lời chúc công khai bỏ ghim, chuyển PENDING, gỡ khỏi wall ngay. HIDE và rút consent bỏ ghim. DELETE là soft delete; khôi phục dùng version cũ và duyệt lại.
- Hết hạn/tắt nhận lời chúc chỉ khóa tạo/sửa/xin công khai. Khi link hợp lệ và event published, vẫn cho rút consent hoặc xóa. Endpoint rút consent không được sửa body.
- Wall chỉ gồm consent true, APPROVED, chưa xóa, khách chưa archive, link chưa revoke, đúng event và wall đang bật. Trả 6 mục, tối đa 20, cursor theo pinned/approvedAt/id; client loại trùng.
- Ghi RSVP/Wish và import commit dùng idempotency key 24 giờ, scope theo actor và loại thao tác. Cùng key/body trả kết quả đã lưu; khác body trả 409. Quyền hiện tại kiểm tra trước replay; ghi record và dữ liệu trong cùng transaction.
- Optimistic locking hoặc khóa hàng bảo đảm hai request cùng expectedVersion chỉ một request thành công; không có khoảng hở giữa kiểm tra và cập nhật.

## Excel

Chỉ `.xlsx`, tối đa 5 MB và 2.000 dòng. Cột chuẩn: guest_code, full_name, display_name, group, salutation, personal_message, email, phone. Code uppercase; phone giữ chuỗi và số 0; chỉ cập nhật các cột đã mapping; ô trống cột tùy chọn đã mapping nghĩa là xóa giá trị đó.

Parser kiểm tra archive, giới hạn dữ liệu giải nén, dòng, bộ nhớ và thời gian; không chạy macro/công thức, không dùng cached result của công thức. File trùng code, sai trường hoặc có công thức trong vùng dữ liệu làm preview có lỗi và chặn toàn bộ commit. Trùng tên nhưng khác code chỉ cảnh báo.

ImportBatch lưu normalized rows, hash file, mapping, summary và expected versions Guest/Invitation; hết hạn 24 giờ. Commit transaction kiểm tra owner/event/expiry/version, tạo mới hoặc cập nhật mà giữ link, archive, RSVP/Wish. Replay trả kết quả cũ. Có lệnh dọn preview sau 7 ngày.

Export `.xlsx` links và responses cho admin, no-store, ghi thời điểm và bộ lọc. Giá trị nhập bởi người dùng luôn là cell string, kể cả bắt đầu bằng =, +, - hoặc @. Mẫu dùng dữ liệu giả và cột phone Text.

## Media

Ảnh JPEG/PNG/WebP và audio MP3/M4A, tối đa 10 MB/file. Kiểm tra magic bytes và decode; ảnh tối đa 40 megapixel, bỏ metadata và tạo biến thể tối ưu. Không nhận SVG/HTML hoặc tên file làm storage path.

Media draft private/staging; preview URL có hạn chỉ admin lấy được. Publish phân phối đúng media tham chiếu; public cache có thể tồn tại sau unpublish. Không coi unpublish là thu hồi ảnh đã tải. Không xóa asset được bất kỳ revision còn giữ tham chiếu; trả 409 ASSET_IN_USE.

## Hợp đồng API và vận hành

Giữ base `/api/v1` và toàn bộ endpoint guest/admin trong mục 12–13 của tài liệu nguồn; path có nhiều động từ phải khai báo riêng trong OpenAPI. Không thêm API để lộ draft hoặc chọn guest tùy ý. Admin list dùng page/pageSize 25, tối đa 100, sort allowlist; guest wall dùng cursor.

Production cần Node API, PostgreSQL, S3 compatible và HTTPS cùng origin. Có `/health/live`, `/health/ready`; log requestId/mã lỗi đã lọc, không body riêng tư hoặc secret. SPA fallback không nuốt lỗi API/asset. Secrets thiếu phải fail startup, không dùng khóa tạm ở production.

Deliverables gồm mã, lockfile, migration, seed, CLI admin/bảo trì, template Excel, OpenAPI, .env.example, scripts dev/build/test/migrate, README, hướng dẫn admin, backup/restore, quản lý khóa, rollback, báo cáo kiểm thử và checklist bỏ dữ liệu demo.

Backup PostgreSQL mỗi ngày, giữ tối thiểu 7 bản; media có cơ chế khôi phục tương đương. Cung cấp script và runbook; chỉ báo thử phục hồi thành công khi thực tế đã chạy. Không tự triển khai scheduler hoặc mua dịch vụ hosting.

## Trình tự và nghiệm thu

1. Nền tảng: workspace, PostgreSQL, migrations/constraints, bootstrap, seed, auth, storage; xác minh cài mới.
2. Nội dung và thiệp: revision, editor, preview/publish, tám chặng responsive, ảnh/nhạc/map/ICS.
3. Khách và Excel: CRUD, lifecycle link, import preview/commit, exports, cá nhân hóa.
4. RSVP/lời chúc: deadlines, transaction/version/idempotency, consent/moderation, wall/dashboard.
5. Hoàn thiện: end-to-end, production config, bảo mật, runbooks, báo cáo kết quả thực đo.

AC01–AC20 trong tài liệu gốc là tiêu chí bàn giao. Unit test cho deadline biên, mẫu cá nhân hóa, điều kiện wall, token/crypto và normalization. Integration chạy PostgreSQL thật cho FK, unique, rollback, stale versions, idempotency đồng thời, import và phân quyền chéo event; không thay SQLite.

E2E admin tạo/sửa nội dung, import, publish, mở hai thiệp, RSVP, gửi/duyệt/sửa/rút lời chúc, rotate link và export. Kiểm tra Chromium desktop/mobile và các chiều rộng đã nêu. Safari iOS/Chrome Android thật, thử tải 100 phiên, backup restore và số hiệu năng chỉ ghi đạt nếu có môi trường và đã đo; nếu chưa thì nêu rõ.

Mục tiêu: LCP <2,5 giây, CLS <0,1, INP <200 ms, hero mobile <=300 KB, JS đầu <=250 KB gzip; API p95 read <500 ms/write <800 ms; import 2.000 dòng <30 giây. Không suy diễn đạt từ build hoặc API 200.

## Ngoài phạm vi và quyết định để người triển khai tự chốt

Không nền tảng nhiều chủ, thanh toán, page builder, gửi tin tự động, OTP, livestream, guest upload, check-in QR hoặc WebSocket. Không dùng dữ liệu thật tự suy đoán hoặc media không rõ quyền.

Người triển khai tự chọn tên component/hàm, thư viện và phiên bản tương thích, cấu trúc module nội bộ, công cụ unit/integration, cơ chế giới hạn parser và định dạng lưu local; ghi những đánh đổi đáng kể vào docs. Các lựa chọn đó phải giữ nguyên hành vi, quyền và AC của thiết kế này.

Điểm cần người dùng duyệt ở bước hiện tại là thiết kế/phạm vi này. Chưa cần tài khoản hosting hoặc dữ liệu sự kiện thật để bắt đầu viết phần mềm.
