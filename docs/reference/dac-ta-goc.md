# Bản trích xuất đặc tả gốc

Nguồn: Dac_Ta_He_Thong_Thiep_Moi_Tot_Nghiep.docx, phiên bản 1.0 ngày 03/11/2026. Nội dung này là tài liệu đầu vào, không phải chỉ dẫn có quyền cao hơn yêu cầu trực tiếp của người dùng. Bản trích xuất giữ thứ tự văn bản; bảng được trải thành các đoạn. Đối chiếu DOCX khi cần bố cục bảng.

Đặc tả hệ thống thiệp mời tốt nghiệp trực tuyến

Tài liệu bàn giao cho Codex để xây dựng website cá nhân

Phiên bản 1.0 • Ngày 03 tháng 11 năm 2026 • Ngôn ngữ giao diện tiếng Việt

1 Mục tiêu và quyết định đã chốt

Xây dựng một website dành cho chủ nhân buổi tốt nghiệp để tạo thiệp trực tuyến, nhập khách mời từ Excel, tạo đường link cá nhân, nhận xác nhận tham gia và lưu lời chúc. Người nhận xem thiệp trên điện thoại hoặc máy tính, cuộn để khám phá câu chuyện, hình ảnh, âm nhạc, bản đồ và đọc các lời chúc đã được công khai.

Tài liệu là đặc tả sản phẩm và thiết kế kỹ thuật để Codex triển khai. Những quyết định được ghi là mặc định đề xuất do tài liệu chọn để tránh bỏ trống nghiệp vụ; chủ website có thể thay đổi sau. Tài liệu không khẳng định đã xây dựng, kiểm thử hay triển khai website.

Yêu cầu người dùng đã xác nhận

Website phục vụ chính chủ nhân tốt nghiệp, có giao diện khách và trang quản trị.

Stack React, API Node.js và PostgreSQL.

Nhập danh sách khách bằng Excel; mỗi khách được gửi link thiệp riêng.

Khách xác nhận tham gia hoặc không tham gia, đồng thời có thể gửi lời chúc.

Thiệp hiện dần khi vuốt lên, bắt buộc responsive, có câu chuyện, ảnh, nhạc và bản đồ.

Tại phần gửi lời chúc, hiển thị lời chúc từ những người bạn đã gửi trước đó.

Mặc định đề xuất cho phiên bản đầu

Một quản trị viên và một sự kiện đang sử dụng; dữ liệu vẫn gắn eventId để tránh phải đổi cấu trúc sau này.

Khách không đăng ký tài khoản. Ai có link hợp lệ có quyền xem và phản hồi cho thiệp đó.

Mỗi thiệp đại diện một khách, không đăng ký người đi kèm. Mỗi khách có tối đa một phản hồi và một lời chúc hiện hành.

Lời chúc mặc định riêng tư; chỉ công khai khi người gửi đồng ý và quản trị viên duyệt.

Thiết kế album kỷ niệm tông kem, chữ đậm màu và điểm nhấn vàng trầm. Đây là hướng thiết kế tạm chọn, không phải sở thích đã được người dùng xác nhận.

Không gửi tin nhắn tự động. Quản trị viên sao chép hoặc xuất link và tin nhắn mẫu để tự gửi.

Hai phương án đã cân nhắc

Phương án

Đánh đổi

Quyết định

React và API Node.js riêng với PostgreSQL

Chủ động nghiệp vụ và dữ liệu; phải vận hành frontend, API và database

Người dùng đã chọn

React với backend được quản lý sẵn

Ít công việc vận hành ban đầu; phụ thuộc cơ chế phân quyền và dịch vụ

Không chọn cho phiên bản này



2 Phạm vi và quyền truy cập

Trong phạm vi phiên bản đầu

Thiệp cá nhân hóa; tám chặng nội dung; mở thiệp; bật tắt nhạc; ảnh tải dần; bản đồ; thêm lịch; xác nhận; gửi và đọc lời chúc; giao diện trạng thái lỗi. Trang quản trị gồm dashboard, chỉnh nội dung, xem trước, xuất bản, quản lý media, nhập Excel, khách mời, link, phản hồi, kiểm duyệt và xuất dữ liệu.

Ngoài phạm vi phiên bản đầu

Nền tảng bán thiệp cho nhiều người; thanh toán; kéo thả bố cục tự do; gửi Zalo hoặc email hàng loạt; OTP cho khách; livestream; tải ảnh do khách gửi; QR check in; realtime WebSocket. Không thêm các phần này trong quá trình xây dựng nếu chưa có yêu cầu mới.

Tác vụ

Quản trị viên

Khách có link hợp lệ

Người không có link

Xem nội dung đã xuất bản

Có

Có

Chỉ trang giới thiệu chung

Xem bản nháp và xem trước

Có

Không

Không

Đọc hoặc sửa danh sách khách

Có

Không

Không

Gửi hoặc sửa phản hồi

Có thể chỉnh trong quản trị

Chỉ thiệp của mình

Không

Gửi hoặc sửa lời chúc

Có thể ẩn hoặc duyệt

Chỉ lời chúc của mình

Không

Đọc lời chúc công khai

Có

Chỉ trong sự kiện của thiệp

Không

Đọc lời chúc riêng tư

Có

Chỉ lời chúc của mình

Không

Upload media và xuất Excel

Có

Không

Không



GET hoặc việc tạo bản xem trước link không được tự gửi phản hồi, duyệt lời chúc hoặc làm thay đổi số người tham dự. Lượt mở thiệp chỉ là số tham khảo, không chứng minh đúng người nhận đã đọc.

Mục tiêu thiết kế để kiểm thử: tối đa 2.000 khách trong một sự kiện, 100 phiên khách đồng thời và một quản trị viên. Đây là giả định phục vụ thiết kế, không phải số khách thực tế đã được cung cấp.

3 Cấu trúc thiệp và cá nhân hóa

Chặng

Nội dung có thể cấu hình

Hành vi bắt buộc

Mở thiệp

Tên người nhận, lời mở đầu, ảnh hoặc hình phong bì

Hai nút mở có nhạc và mở không nhạc; không buộc nghe

Khoảnh khắc tốt nghiệp

Tên chủ nhân, trường, ngành, khóa, ảnh chính

Thông tin nhận diện hiện ngay sau khi mở

Câu chuyện

Các mốc gồm thời gian, tiêu đề, đoạn văn, ảnh tùy chọn

Hiện lần lượt theo cuộn; không bắt buộc ảnh ở mọi mốc

Người đồng hành

Ảnh, chú thích và lời cảm ơn

Album có ảnh thay thế khi ảnh lỗi

Lời mời chính thức

Ngày giờ lễ, giờ gặp chụp ảnh, địa điểm, hạn phản hồi

Phân biệt giờ lễ với giờ gặp; nút thêm lịch

Bản đồ

Địa chỉ, tọa độ, cổng vào, điểm hẹn, hướng dẫn

Nút mở chỉ đường luôn dùng được dù bản đồ nhúng lỗi

Phản hồi và lời chúc

Form xác nhận, form lời chúc, bức tường lời chúc

Có thể thao tác độc lập; không ép đọc hết câu chuyện

Kết thúc

Lời cảm ơn chung và theo trạng thái phản hồi

Có thể quay lại sửa trước hạn chốt



Thứ tự mặc định như bảng. Quản trị viên được ẩn hoặc sắp xếp các chặng câu chuyện, album và lời cảm ơn; không được loại bỏ thông tin sự kiện, phản hồi hoặc thông báo lỗi cần thiết. Đây là trình chỉnh sửa theo trường dữ liệu, không phải trình dựng trang tùy ý.

Quy tắc nội dung cá nhân

Tên hiển thị ưu tiên Guest.displayName, sau đó fullName. Không hiển thị email hoặc số điện thoại trên thiệp.

Lời mở đầu ưu tiên Invitation.personalMessage, sau đó mẫu theo groupKey, sau đó mẫu chung của sự kiện.

Chỉ hỗ trợ biến đã định nghĩa như {{guestName}}, {{hostName}}, {{salutation}}; không thực thi biểu thức hoặc HTML do người dùng nhập.

Nội dung chung lưu trong phiên bản thiệp; tên và lời nhắn cá nhân lấy từ Invitation hiện hành để thay đổi tên không cần xuất bản lại toàn bộ sự kiện.

Bản xem trước của quản trị viên dùng khách mẫu hoặc khách được chọn, có nhãn xem trước; không tạo lượt mở hoặc phản hồi thật.

Nút xác nhận nhanh hiện sau khi mở thiệp và đưa người xem đến form, kể cả khi các ảnh ở trên chưa tải. Khi khách quay lại, hiển thị phản hồi đã lưu và nút sửa phù hợp với hạn chốt.

4 Responsive chuyển động âm nhạc và bản đồ

Bố cục và tải nội dung

Thiết kế từ màn hình điện thoại rồi mở rộng. Kiểm thử tối thiểu chiều rộng 320, 375, 390, 768, 1024 và 1440 pixel. Không cuộn ngang. Mobile một cột; desktop có thể chia ảnh và lời kể thành hai cột. Nội dung có max width, chữ dễ đọc, các nút chạm tối thiểu 44 × 44 CSS pixel. Hỗ trợ xoay màn hình, zoom chữ và bàn phím ảo.

Cuộn theo hành vi tự nhiên của trình duyệt; không chặn wheel hoặc ép scroll snap. Intersection Observer kích hoạt hiệu ứng khi chặng gần xuất hiện. Chỉ chuyển opacity và transform nhẹ; không dùng parallax mạnh. Có cơ chế dự phòng để nội dung vẫn hiện khi observer hoặc hiệu ứng lỗi. Nếu JavaScript chưa hoạt động, hiện thông báo hướng dẫn rõ ràng thay vì màn hình trống.

Ảnh hero tải ưu tiên; ảnh dưới tải dần và có width, height hoặc aspect ratio để tránh nhảy bố cục. Sinh kích thước ảnh phù hợp thiết bị; không tải ảnh gốc nhiều megabyte cho mọi khách. Khởi tạo bản đồ khi gần đến khu vực bản đồ hoặc khi khách bấm xem.

Âm nhạc và khả năng truy cập

Nút mở có nhạc gọi play trong tương tác của khách; xử lý promise bị từ chối và cho phép phát lại. Nút mở không nhạc phải tiếp tục đầy đủ trải nghiệm. Nút bật tắt có nhãn truy cập, trạng thái rõ ràng và không che nút xác nhận. Ghi nhớ lựa chọn âm lượng hoặc tắt tiếng trên thiết bị, nhưng không giả định trình duyệt sẽ tự cho phép phát khi quay lại.

Hỗ trợ prefers-reduced-motion; điều hướng bằng bàn phím; focus nhìn rõ; nhãn form; thông báo gửi thành công qua aria-live; tương phản chữ tối thiểu theo WCAG AA. Không dùng riêng màu sắc để thể hiện trạng thái.

Bản đồ và lịch

Lưu địa chỉ và tọa độ thay vì cho nhập tùy ý mã iframe. Backend tạo URL từ mẫu Google Maps cố định; chỉ cho phép scheme https và host trong allowlist. Không nhận URL tùy ý để server đi tải. Có địa chỉ dạng chữ, nút sao chép và link chỉ đường mới với noopener, noreferrer. Bản đồ lỗi không chặn xác nhận.

Tệp lịch ICS dùng UID ổn định cho sự kiện, thời gian chuẩn UTC và trường địa điểm được escape đúng chuẩn. Mặc định thêm giờ gặp/chụp ảnh vào lịch nếu có; nếu không thì dùng giờ lễ. Cấu hình bắt buộc giờ kết thúc hợp lệ. Múi giờ mặc định Asia/Ho_Chi_Minh; không lấy múi giờ máy chủ làm giờ lễ.

5 Trang quản trị và phiên bản nội dung

Màn hình

Chức năng chính

Trạng thái cần có

Đăng nhập

Email và mật khẩu, đăng xuất

Sai thông tin, hết phiên, giới hạn thử lại

Tổng quan

Tổng khách đang hoạt động, đồng ý, từ chối, chưa trả lời, lời chúc chờ duyệt

Đang tải, chưa có dữ liệu, lỗi tải

Nội dung thiệp

Form theo từng chặng; thứ tự; xem trước; xuất bản

Chưa lưu, đã lưu nháp, lỗi kiểm tra, đang xuất bản

Media

Upload ảnh hoặc nhạc; chú thích; thứ tự; chọn vị trí

Đang upload, xử lý ảnh, thất bại, đang được dùng

Khách mời

Tìm tên hoặc mã; lọc nhóm, trạng thái; thêm, sửa, lưu trữ

Danh sách rỗng, lỗi trùng, trang tiếp theo

Nhập Excel

Mẫu file, ánh xạ cột, xem trước, commit

Lỗi theo dòng, dữ liệu đã thay đổi, hết hạn bản xem trước

Link và phản hồi

Sao chép, xuất, thu hồi, cấp lại; chỉnh phản hồi

Link không hoạt động, phản hồi đã khóa

Lời chúc

Lọc riêng tư, chờ duyệt, công khai, ẩn; duyệt và ghim

Không đủ quyền công khai, dữ liệu đã đổi



Bản nháp và xuất bản

EventRevision lưu toàn bộ nội dung trình bày dưới dạng JSON có schemaVersion. Event có draftRevisionId và publishedRevisionId. Mỗi lần lưu nháp tạo revision mới bất biến rồi đổi draftRevisionId trong transaction; không sửa revision đã lưu. Dùng số version của Event để phát hiện sửa đồng thời; PATCH có If-Match version, không đúng trả 409.

Xuất bản kiểm tra đủ tên chủ nhân, trường, ngày giờ, giờ kết thúc, địa điểm, hạn phản hồi, media hợp lệ và URL bản đồ. Trong transaction đổi publishedRevisionId sang draftRevisionId và ghi publishedAt. Khách chỉ đọc publishedRevisionId, tuyệt đối không đọc nháp dự phòng. Khi chưa xuất bản, link khách báo thiệp chưa sẵn sàng và không trả nội dung nháp.

Ngày giờ, hạn phản hồi và đóng nhận lời chúc nằm trong revision. Các cờ vận hành RSVP mở hoặc đóng, nhận lời chúc mở hoặc đóng và bức tường bật hoặc tắt nằm ở Event và có hiệu lực ngay. Nếu rút xuất bản, guest API ngừng trả nội dung và không nhận thay đổi; dữ liệu cũ được giữ.

Dashboard đếm mỗi Invitation đang hoạt động một lần; archived hoặc revoked không vào mẫu số đang mời. Tổng đồng ý + từ chối + chưa trả lời phải bằng tổng khách đang mời. Dữ liệu của thiệp đã lưu trữ vẫn xem được qua bộ lọc lịch sử và xuất có tùy chọn.

6 Nhập Excel và xuất danh sách

Cấu trúc file và giới hạn

Cột chuẩn

Quy định

guest_code

Bắt buộc, 1 đến 40 ký tự; chữ, số, gạch ngang, gạch dưới; duy nhất theo sự kiện

full_name

Bắt buộc, 1 đến 120 ký tự sau trim

display_name

Không bắt buộc, tối đa 80 ký tự

group

Không bắt buộc, tối đa 60 ký tự; chuyển thành groupKey chuẩn hóa

salutation

Không bắt buộc, tối đa 40 ký tự

personal_message

Không bắt buộc, tối đa 1.000 ký tự

email

Không bắt buộc, kiểm tra định dạng; không dùng làm khóa

phone

Không bắt buộc, tối đa 30 ký tự; đọc như chuỗi để giữ số 0



Chấp nhận .xlsx, tối đa 5 MB và 2.000 dòng dữ liệu mỗi lần nhập; không nhận .xlsm hoặc .xls trong phiên bản đầu. Cho chọn sheet và ánh xạ tiêu đề vào cột chuẩn. File mẫu dùng dữ liệu giả, định dạng cột phone là Text. Không thực thi macro hoặc công thức; nếu ô thuộc vùng dữ liệu có công thức thì báo lỗi, không dùng kết quả cached. Parser phải có giới hạn dòng, bộ nhớ, thời gian và kích thước dữ liệu sau giải nén.

Luồng xem trước và xác nhận

POST preview nhận file và mapping; backend đọc, chuẩn hóa guest_code thành uppercase, trim các chuỗi và kiểm tra toàn bộ file. Trùng mã trong cùng file là lỗi; trùng với database được xếp vào nhóm cập nhật. Tên trùng nhưng mã khác được giữ thành hai khách, có cảnh báo tham khảo. Dòng thiếu hoặc sai dữ liệu báo sheet, số dòng, tên cột và lý do.

ImportBatch lưu dữ liệu chuẩn hóa, hash file, summary, expectedGuestVersion và expectedInvitationVersion cho từng bản ghi hiện có và trạng thái PREVIEWED; hết hạn sau 24 giờ. Khi có bất kỳ dòng lỗi, không cho commit; người dùng tải báo cáo để sửa rồi xem trước lại. Không nhập một phần âm thầm.

POST commit dùng batchId và idempotency key. Backend kiểm tra chủ sở hữu, sự kiện, hạn dùng và version của Guest cùng Invitation liên quan. Có thay đổi kể từ preview thì trả 409 để xem trước lại. Dòng mới tạo Guest và Invitation trong một transaction; dòng cũ chỉ cập nhật trường có cột trong mapping, còn ô trống ở cột đã mapping nghĩa là xóa giá trị tùy chọn. Không cho xóa full_name hoặc guest_code. Dùng update có điều kiện version hoặc khóa hàng trong transaction để tránh khoảng trống giữa kiểm tra và ghi; tăng version của từng entity thực sự thay đổi.

Commit không thay link, RSVP, lời chúc hoặc trạng thái lưu trữ hiện có. Khách đã lưu trữ phải được khôi phục bằng thao tác riêng. Commit thành công ghi batch COMMITTED; gửi lại batch chỉ trả kết quả đã lưu, không tạo khách hoặc link mới. Xóa dữ liệu preview sau 7 ngày bằng lệnh bảo trì; không cần giữ file Excel gốc.

Xuất dữ liệu

Xuất .xlsx riêng cho danh sách kèm link và cho kết quả xác nhận/lời chúc. Tất cả giá trị do người dùng nhập phải được ghi là ô chuỗi; không biến nội dung bắt đầu bằng =, +, - hoặc @ thành công thức. Chỉ admin được xuất; response đặt no-store. Không ghi nội dung link mời vào log. File xuất ghi rõ thời điểm và bộ lọc đang áp dụng.

7 Link cá nhân và quản lý vòng đời thiệp

Đường dẫn khách là /i/{token}. Token ngẫu nhiên mật mã 32 byte, mã hóa base64url; không dùng ID tăng dần, họ tên, email hoặc số điện thoại làm token. Token là quyền truy cập mang theo link, không phải bằng chứng xác thực danh tính của người nhận.

Để vừa kiểm tra an toàn vừa xuất lại link, Invitation lưu tokenHash SHA256 có unique index và tokenCiphertext được mã hóa AES 256 GCM với nonce riêng; kèm keyVersion. Khóa mã hóa 32 byte chỉ ở biến môi trường phía server. Bind invitationId làm additional authenticated data. Không trả ciphertext hoặc hash cho khách. Chỉ API admin được giải mã để sao chép hoặc xuất link. Không lưu token plaintext trong database hoặc log.

Khi trang khách gọi API, gửi token trong Authorization Bearer qua HTTPS. Các API khách không nhận invitationId do client chỉ định để chọn người; middleware tra Invitation từ token rồi gắn eventId và invitationId vào ngữ cảnh. Mọi request đều kiểm tra active, revokedAt và guest chưa archived. Không dùng cookie admin để cấp quyền khách hoặc ngược lại.

Thao tác

Kết quả

Tạo khách mới

Tạo một Invitation đang hoạt động và token mới

Nhập lại hoặc sửa tên

Giữ nguyên link, phản hồi và lời chúc

Thu hồi link

Đặt revokedAt; API khách từ chối ngay, giữ dữ liệu lịch sử

Cấp lại link

Thay token hash và ciphertext; link cũ mất hiệu lực, link mới dùng lại RSVP và lời chúc cũ

Lưu trữ khách

Chặn truy cập và loại khỏi dashboard đang mời; không xóa dữ liệu

Khôi phục khách

Bỏ archivedAt nhưng không tự bỏ revokedAt; admin quyết định cấp lại link



Response khi link sai, thu hồi hoặc khách đã lưu trữ dùng thông báo chung không tiết lộ danh sách khách. HTML của đường dẫn khách chỉ có metadata preview chung, không nhúng tên, lời nhắn hoặc token vào Open Graph. Cấu hình Referrer-Policy no-referrer, robots noindex và không gửi URL đầy đủ sang analytics. Tắt hoặc che token trong log reverse proxy, CDN và API; HTTPS không loại bỏ rủi ro lưu URL trong lịch sử trình duyệt.

Đánh dấu openedAt bằng POST khi người xem chủ động mở thiệp; lần sau không tăng số khách duy nhất. Có thể ghi lastOpenedAt nhưng không triển khai theo dõi hành vi chi tiết. Metadata bot preview không được tính là xác nhận tham gia.

8 Xác nhận tham gia và lời chúc

Phản hồi tham gia

RSVP có status ATTENDING hoặc DECLINED; chưa có bản ghi nghĩa là chưa phản hồi. Note tùy chọn tối đa 500 ký tự. Khách đổi lựa chọn trước hạn; server dùng thời gian hiện tại để kiểm tra hạn, không tin đồng hồ client. Đến đúng deadline, đóng ghi khi now lớn hơn hoặc bằng deadline. Đóng RSVP không tự đóng nhận lời chúc.

PUT RSVP là upsert với unique invitationId. Dùng version và expectedVersion; lần tạo expectedVersion là 0. Hai request cùng version chỉ một request thành công, request còn lại trả 409 và frontend tải lại. Gửi lặp cùng idempotency key và cùng body trả cùng kết quả. Không tăng bộ đếm bằng thao tác cộng dồn thiếu kiểm soát; thống kê từ dữ liệu hiện hành. Admin được chỉnh sau hạn, phải ghi lý do và audit log.

Lời chúc và bức tường lời chúc

Mỗi Invitation có tối đa một Wish hiện hành, body từ 1 đến 1.000 ký tự sau trim. Lưu plain text, không chấp nhận HTML. Người không tham gia vẫn gửi lời chúc. Hai form lưu độc lập: lưu RSVP thất bại không làm mất lời chúc đã lưu, và ngược lại. Nếu dùng nút lưu chung ở UI phải cho biết rõ kết quả từng phần; mặc định phiên bản đầu dùng hai nút riêng. Gửi lại sau soft delete khôi phục cùng Wish, tăng version và áp dụng lại trạng thái duyệt theo consentPublic; endpoint của mình vẫn trả version của bản ghi đã xóa để cập nhật đúng.

Hạn wishDeadline và cờ wishesEnabled chỉ khóa tạo mới, sửa nội dung, khôi phục lời chúc đã xóa hoặc chuyển từ riêng tư sang xin công khai. Khi link vẫn hợp lệ và sự kiện đang xuất bản, người gửi luôn được rút đồng ý hoặc xóa lời chúc hiện có, kể cả sau hạn và khi tắt nhận lời chúc. Dùng endpoint rút công khai riêng chỉ chấp nhận consentPublic false, không cho lợi dụng để sửa body sau hạn. GET invitation trả canCreateOrEditWish và canWithdrawWish riêng; UI không ẩn nút rút công khai chỉ vì form đã khóa.

Trạng thái hoặc hành động

Quy tắc hiển thị

consentPublic false

Chỉ chủ thiệp và người gửi đọc được; moderationStatus NONE

Gửi với consentPublic true

moderationStatus PENDING; người gửi thấy đang chờ hiển thị

Admin duyệt

Chỉ cho APPROVED khi consentPublic vẫn true

Admin ẩn

moderationStatus HIDDEN, isPinned false; người gửi thấy không công khai

Sửa nội dung đang công khai

Bỏ ghim, chuyển PENDING, gỡ bản cũ khỏi danh sách công khai ngay

Rút đồng ý công khai

Đặt NONE, bỏ ghim và gỡ công khai ngay

Xóa lời chúc

Soft delete; không còn xuất hiện ở API công khai



Quản trị viên không sửa lời chúc hoặc tự bật đồng ý thay người gửi. Duyệt hoặc ghim dùng expectedVersion để không duyệt nhầm nội dung vừa được sửa. Chỉ ghim Wish có consentPublic true, APPROVED, chưa xóa và khách chưa archived, link chưa revoked. Thu hồi link hoặc lưu trữ khách tạm ẩn lời chúc khỏi bức tường; cấp lại link hoặc khôi phục quyền hợp lệ áp dụng lại điều kiện duyệt hiện có.

Danh sách mặc định hiện 6 lời chúc, ghim trước rồi approvedAt giảm dần rồi id giảm dần; nút xem thêm tải 6 mục, giới hạn server 20. Dùng cursor gồm bộ sort và id; client loại trùng theo id khi dữ liệu đổi giữa các trang. Refresh sau khi duyệt hoặc theo thao tác tải lại; không yêu cầu realtime. API chỉ trả id của lời chúc, displayName, body, approvedAt và isPinned; không trả liên hệ, trạng thái RSVP hoặc mã token. Lời chúc của chính người gửi trả qua endpoint riêng cùng trạng thái chờ duyệt.

9 Kiến trúc ứng dụng và cấu trúc mã nguồn

Frontend React phục vụ cả thiệp khách và quản trị. API Node.js là một ứng dụng chia module, xử lý toàn bộ quyền, kiểm tra dữ liệu, import và nghiệp vụ. PostgreSQL lưu dữ liệu cấu trúc và phiên bản nội dung. Object storage lưu file; CDN phân phối media đã công bố. Không cần microservice, Redis hoặc hàng đợi cho quy mô giả định của phiên bản đầu.

Lớp

Công nghệ hoặc trách nhiệm

Web

React, TypeScript, Vite, React Router, Tailwind CSS, React Query

API

Node.js bản LTS còn hỗ trợ, Express, TypeScript; validator schema như Zod

Dữ liệu

PostgreSQL bản còn hỗ trợ, Prisma ORM, migration có version

Media

Adapter local dùng phát triển; adapter S3 compatible dùng production; xử lý ảnh bằng thư viện phù hợp

Kiểm thử

Bộ unit/integration phù hợp TypeScript và Playwright cho luồng trình duyệt

Hợp đồng

OpenAPI được cập nhật từ schema hoặc cùng thay đổi với API; chia sẻ DTO an toàn



Codex chọn và khóa phiên bản tương thích khi khởi tạo, xác minh tài liệu chính thức tại thời điểm xây dựng. Không tự cài bản mới nhất của mọi thư viện nếu không tương thích. Thư viện đọc Excel được chọn dựa trên khả năng giới hạn tài nguyên và tình trạng bảo trì; không cố định một thư viện chưa kiểm tra trong tài liệu này.

Cấu trúc repo đề xuất

Một monorepo gồm apps/web, apps/api, packages/contracts và docs. Trong web có features/invitation, admin, guests, import, rsvp, wishes và media; trong api có modules tương ứng, middleware, adapters và prisma. DTO công khai khác DTO quản trị; không xuất nguyên Prisma model ra response. Tách hàm nghiệp vụ khỏi HTTP handler để có thể kiểm thử.

apps/api/prisma chứa schema, migrations và seed. packages/contracts chứa schema input/output dùng chung nếu không làm lộ trường nội bộ. docs gồm đặc tả API, hướng dẫn triển khai, quyết định kỹ thuật và hướng dẫn vận hành. Docker Compose phục vụ PostgreSQL và storage phát triển khi cần; không bắt buộc frontend chạy trong Docker.

Luồng dữ liệu

Khách mở React tại /i/{token}; React gọi API bằng bearer token; middleware xác định thiệp; API đọc revision đã xuất bản và dữ liệu cá nhân; React hiển thị nội dung, tải media trực tiếp từ CDN. Form ghi qua API và transaction database. Admin đăng nhập qua cùng origin, làm việc với API admin và upload; khóa storage và database không đi vào bundle frontend.

10 Mô hình dữ liệu

Tất cả khóa chính là UUID; createdAt, updatedAt là timestamptz lưu UTC, trừ bảng revision bất biến chỉ cần createdAt. Các bản ghi chỉnh sửa có version integer bắt đầu 1. Mọi truy vấn admin và guest phải giới hạn theo eventId phù hợp. Các FK và constraint được tạo bằng migration, không chỉ kiểm tra ở frontend.

Entity

Trường chính và ràng buộc

AdminUser

id, email unique chuẩn hóa, passwordHash, disabledAt, createdAt; không có đăng ký công khai

AdminSession

id, adminId FK, sessionHash unique, csrfToken ngẫu nhiên phía server, expiresAt, revokedAt; token phiên chỉ ở cookie

Event

id, ownerId FK, slug unique, draftRevisionId, publishedRevisionId nullable, version, publishedAt, rsvpEnabled, wishesEnabled, wallEnabled

EventRevision

id, eventId FK, revisionNo, schemaVersion, contentJson, createdAt; unique eventId và revisionNo; bất biến

Guest

id, eventId FK, guestCode, fullName, displayName, groupKey, salutation, email, phone, archivedAt, version; unique eventId và guestCode

Invitation

id, eventId FK, guestId FK unique, personalMessage, tokenHash unique, tokenCiphertext, keyVersion, revokedAt, openedAt, lastOpenedAt, version

RSVP

id, invitationId FK unique, status, note, version, respondedAt, updatedAt; CHECK status hợp lệ

Wish

id, invitationId FK unique, body, consentPublic, moderationStatus, isPinned, approvedAt, approvedBy, deletedAt, version

MediaAsset

id, eventId FK, storageKey unique, type IMAGE hoặc AUDIO, mimeType, bytes, width, height, alt, status, createdAt

ImportBatch

id, eventId, createdBy, fileHash, mappingJson, normalizedRowsJson, summaryJson, status, expiresAt, committedAt, resultJson

AuditLog

id, actorAdminId nullable, action, entityType, entityId, eventId, metadata đã lọc, createdAt; không lưu token hoặc nội dung riêng tư

IdempotencyRecord

id, scope, actorKeyHash, key, requestHash, responseStatus, responseJson, expiresAt; unique scope actorKeyHash key



Ràng buộc bổ sung: Guest và Invitation phải thuộc cùng event; Event chỉ được trỏ revision cùng event. Có thể dùng FK ghép hoặc transaction với kiểm tra bắt buộc kèm test chống chéo sự kiện. Wish APPROVED yêu cầu consentPublic true; isPinned yêu cầu APPROVED và consentPublic true. Đặt CHECK các trạng thái có thể biểu diễn bằng DB. Quyền guest không dựa vào UUID khó đoán.

Index tối thiểu: Guest(eventId, archivedAt, guestCode), Guest(eventId, groupKey), Invitation(eventId, revokedAt), RSVP(status), Wish(moderationStatus, isPinned, approvedAt, id), ImportBatch(eventId, status, expiresAt), AdminSession(expiresAt), AuditLog(eventId, createdAt). Quan hệ để lọc Wish theo sự kiện đi qua Invitation; kiểm tra query plan với bộ dữ liệu mục tiêu.

Không hard delete khách, thiệp hoặc revision trong UI phiên bản đầu. Dọn session, idempotency và import preview hết hạn bằng lệnh bảo trì. Khi xóa dữ liệu cá nhân theo yêu cầu chủ website, cung cấp runbook thủ công có backup và phạm vi rõ ràng.

11 Nội dung JSON và trạng thái hệ thống

Hợp đồng nội dung revision

contentJson gồm schemaVersion, host, ceremony, meetup tùy chọn, rsvpDeadline, wishDeadline nullable, timezone, theme, music, groupMessages và sections. music gồm enabled, assetId nullable, volume mặc định 0.25 và loop mặc định true; nếu enabled thì publish phải có audio asset hợp lệ. Schema dùng discriminated union theo section.type, giới hạn số phần tử và độ dài chuỗi. Các trường media chỉ lưu assetId; API ánh xạ URL qua adapter. Không cho tùy ý nhúng script, CSS, HTML hoặc URL iframe.

host gồm fullName, university, major, cohort tùy chọn. ceremony và meetup có startAt, endAt, venueName, address, latitude, longitude, entranceNote. theme giới hạn token màu và font được phép; không dùng CSS từ client. sections có id ổn định, type, enabled, order và data theo loại.

Section type

Các trường data bắt buộc hoặc tùy chọn

opening

title, messageTemplate, coverAssetId tùy chọn

hero

title, subtitle tùy chọn, heroAssetId bắt buộc khi publish

story

items gồm id, label, title, body, imageAssetId tùy chọn

gallery

items gồm assetId, caption; alt lấy từ media

invitation

title, message; lấy giờ và địa điểm từ ceremony hoặc meetup

map

title, locationSource CEREMONY hoặc MEETUP, instructions

response

title, rsvpIntro, wishIntro; điều khiển mở lấy từ Event

closing

message, attendingMessage, declinedMessage tùy chọn



Mặc định story tối đa 12 mốc, gallery tối đa 40 ảnh, một file nhạc tối đa 10 MB. Nháp có thể thiếu trường bắt buộc nhưng vẫn phải đúng kiểu và giới hạn; publish kiểm tra đầy đủ theo lỗi có đường dẫn field. Không cho đặt deadline RSVP sau giờ bắt đầu gặp; deadline lời chúc có thể muộn hơn sự kiện. Admin có thể mở hoặc đóng form bằng cờ vận hành.

Trạng thái khách cần hiển thị

Đang tải; link không hợp lệ; thiệp chưa xuất bản; lỗi mạng có thử lại; mở không nhạc; mở có nhạc; chưa phản hồi; đã đồng ý; đã từ chối; RSVP hết hạn; lời chúc riêng; lời chúc chờ duyệt; lời chúc công khai; lời chúc bị ẩn; form đang gửi và lỗi xung đột. Khi API lỗi sau submit, giữ nội dung người dùng đang nhập; không tự báo thành công.

Frontend lưu bản nháp form trong state, không lưu token hoặc lời chúc vào localStorage. Đổi link trên cùng trình duyệt phải hủy query đang chạy và xóa cache cá nhân của thiệp trước; query key gắn theo phiên thiệp nhưng không dùng raw token làm nhãn telemetry. Khi thoát hoặc chuyển khách, xóa dữ liệu nhạy cảm khỏi cache.

12 Hợp đồng API dành cho khách

Base path /api/v1. API khách yêu cầu Authorization Bearer token hợp lệ. Mọi dữ liệu cá nhân có Cache-Control private, no-store. Response thành công theo {data, meta}; lỗi theo {error:{code,message,fields?,requestId}}. Ngày giờ ISO 8601, danh sách có items và nextCursor. Không trả stack trace hoặc trường database nội bộ.

Method và path

Input

Output hoặc quy tắc

GET /guest/invitation

Bearer token

Thiệp xuất bản, guest display, RSVP và Wish của mình; canRsvp, canCreateOrEditWish, canWithdrawWish

POST /guest/opened

Không body; token

Ghi openedAt lần đầu và lastOpenedAt; không đổi RSVP

PUT /guest/rsvp

status, note, expectedVersion

RSVP mới; Idempotency-Key bắt buộc

PUT /guest/wish

body, consentPublic, expectedVersion

Wish của mình và trạng thái duyệt; Idempotency-Key bắt buộc

PATCH /guest/wish/visibility

consentPublic false, expectedVersion

Rút công khai; được dùng sau hạn hoặc khi tắt nhận lời chúc

DELETE /guest/wish

expectedVersion

Soft delete, bỏ ghim; 204 khi thành công

GET /guest/wishes

cursor tùy chọn, limit mặc định 6

Chỉ lời chúc đủ điều kiện; giới hạn sự kiện theo token

GET /guest/calendar.ics

Token

Lịch của revision đã xuất bản; content type text/calendar



Ví dụ body PUT /guest/rsvp:

{

  "status": "ATTENDING",

  "note": "Mình sẽ đến chụp ảnh cùng bạn",

  "expectedVersion": 0

}

Ví dụ body PUT /guest/wish:

{

  "body": "Chúc mừng bạn tốt nghiệp",

  "consentPublic": true,

  "expectedVersion": 0

}

Quy ước lỗi: 400 body hoặc cursor sai; 401 token thiếu hoặc không hợp lệ; 404 thiệp không khả dụng với thông báo chung; 409 version hoặc idempotency xung đột; 422 form đã khóa hoặc nội dung vi phạm quy tắc; 429 quá giới hạn; 503 lỗi phụ thuộc tạm thời. GET invitation khi sự kiện chưa xuất bản trả 404 EVENT_NOT_AVAILABLE, không tiết lộ nháp.

Idempotency record cho RSVP, Wish và import commit sống 24 giờ. Cùng key và cùng requestHash trả kết quả đã lưu trong cùng scope; khác body trả 409. Ghi dữ liệu và record trong cùng transaction, xử lý concurrent request bằng unique constraint. Xác thực và quyền hiện tại luôn được kiểm tra trước khi replay; link đã thu hồi không được lấy response cũ.

13 Hợp đồng API quản trị

API admin dùng cookie phiên server và kiểm tra quyền owner theo event. Mọi request làm thay đổi dữ liệu, bao gồm login, kiểm tra Origin allowlist; các request đã đăng nhập còn yêu cầu X-CSRF-Token. Dùng cùng origin qua reverse proxy cho frontend và API để đơn giản hóa cookie và CORS.

Method và path

Chức năng

POST /admin/auth/login

Email và password; tạo phiên, xoay CSRF token

GET /admin/auth/me

Thông tin admin và CSRF token cho phiên hiện tại

POST /admin/auth/logout

Thu hồi phiên và xóa cookie

GET /admin/events/current

Event đang quản lý, draft và published version

PATCH /admin/events/{eventId}/draft

Lưu revision nháp mới; If-Match version

POST /admin/events/{eventId}/publish

Kiểm tra và trỏ revision; expectedVersion

POST /admin/events/{eventId}/unpublish

Rút xuất bản; xác nhận UI, giữ dữ liệu

PATCH /admin/events/{eventId}/controls

Bật tắt RSVP, nhận lời chúc, bức tường

GET /admin/events/{eventId}/preview

Xem draft với guestId mẫu; không phát sinh dữ liệu khách

GET /admin/events/{eventId}/dashboard

Số liệu theo định nghĩa tại mục 5

GET hoặc POST /admin/events/{eventId}/guests

Danh sách có phân trang hoặc tạo Guest và Invitation

PATCH /admin/guests/{guestId}

Sửa dữ liệu và lời nhắn; expectedVersion

POST /admin/guests/{guestId}/archive hoặc restore

Lưu trữ hoặc khôi phục; audit

GET /admin/invitations/{invitationId}/link

Giải mã trả link; no-store

POST /admin/invitations/{invitationId}/revoke hoặc rotate

Thu hồi hoặc cấp lại; audit

PUT /admin/invitations/{invitationId}/rsvp

Admin chỉnh RSVP; reason và expectedVersion

POST /admin/events/{eventId}/imports/preview

Multipart file, sheet và mapping

POST /admin/imports/{batchId}/commit

Idempotency-Key; commit transaction

GET /admin/imports/{batchId}

Kết quả preview hoặc commit, lỗi theo dòng

GET /admin/events/{eventId}/exports/{kind}

kind là links hoặc responses; .xlsx

GET /admin/events/{eventId}/wishes

Lọc trạng thái, phân trang quản trị

PATCH /admin/wishes/{wishId}/moderation

APPROVE hoặc HIDE và expectedVersion

PATCH /admin/wishes/{wishId}/pin

isPinned và expectedVersion

POST /admin/events/{eventId}/media

Upload multipart và kiểm tra file

PATCH hoặc DELETE /admin/media/{assetId}

Sửa alt hoặc xóa asset chưa được tham chiếu



Các path chứa “hoặc” mô tả hai endpoint riêng phải được khai báo trong OpenAPI. Danh sách admin dùng page, pageSize mặc định 25, tối đa 100, sort allowlist và bộ lọc có schema. Không nối trực tiếp chuỗi sort vào SQL. Login/logout không ghi password hoặc cookie vào log. Mọi response export và link đều kiểm tra quyền mới, không dùng đường dẫn public lâu dài.

14 Bảo mật media và vận hành

Đăng nhập và chống lạm dụng

Tạo admin qua CLI với mật khẩu từ biến môi trường hoặc nhập kín; không có mật khẩu mặc định commit vào repo. Password hash bằng Argon2id hoặc phương án còn được khuyến nghị tương thích môi trường. Session token ngẫu nhiên lưu hash, cookie HttpOnly, Secure ở production, SameSite Lax, Path /; hết hạn tuyệt đối sau 12 giờ, logout thu hồi server. Môi trường local có cấu hình cookie phù hợp localhost, không hạ mức bảo vệ production.

Rate limit mặc định đề xuất: login 5 lần thất bại mỗi 15 phút theo IP và tài khoản; guest write 20 request mỗi phút theo tokenHash và IP; guest read 120 mỗi phút theo IP với ngoại lệ hợp lý cho mạng chung. Trả Retry-After khi 429. Một instance dùng limiter bộ nhớ có giới hạn; nếu scale nhiều instance phải thay bằng kho dùng chung hoặc lớp edge. Body JSON tối đa 100 KB ngoài upload.

Validation ở server; React escape văn bản; không dùng dangerouslySetInnerHTML cho nội dung nhập. Bảo vệ CSRF, CORS allowlist, CSP cho origin asset và map thực tế, HSTS khi HTTPS đã sẵn sàng. Tránh bật CSP quá chặt làm hỏng nhạc hoặc ảnh; kiểm thử chính sách thực tế. Không cho guest đọc endpoint admin bằng cách thay ID.

Media và lưu trữ

Chỉ admin upload. Ảnh JPEG, PNG hoặc WebP tối đa 10 MB một file; audio MP3 hoặc M4A tối đa 10 MB. Xác minh signature và decode, không chỉ extension/MIME do client gửi. Từ chối SVG, HTML, executable và ảnh quá 40 megapixel. Sinh storage key ngẫu nhiên, giữ tên gốc làm metadata đã làm sạch, không ghép đường dẫn từ tên file. Xóa metadata ảnh không cần thiết và tạo bản ảnh tối ưu có giới hạn kích thước.

Asset upload ở vùng private/staging. Khi publish, tạo bản phân phối public cho đúng media được tham chiếu; draft preview dùng URL ký ngắn hạn chỉ admin nhận. Publish chỉ thành công khi các bản cần dùng đã sẵn sàng. Database không lưu bytes của file. Không được xóa asset còn nằm trong revision được giữ; trả 409 ASSET_IN_USE. Media đã công bố có thể còn trong cache CDN sau khi rút xuất bản; không coi việc rút thiệp là cơ chế thu hồi ảnh đã được xem hoặc tải.

Triển khai và sao lưu

Production cần public HTTPS để bạn bè mở thiệp, nhưng trang admin luôn yêu cầu đăng nhập. Hosting phải hỗ trợ Node.js API, PostgreSQL và object storage; không đưa toàn bộ ứng dụng lên static hosting chỉ lưu localStorage. Không chốt nhà cung cấp trong tài liệu. Deploy migrations một lần trước khi chuyển traffic; không dùng prisma db push cho production. SPA fallback chỉ áp dụng đường dẫn web, không nuốt lỗi /api hoặc asset.

Backup PostgreSQL hằng ngày, giữ tối thiểu 7 bản; bật versioning hoặc cơ chế khôi phục media tương đương nếu dịch vụ hỗ trợ. Thử phục hồi trước sử dụng thật; mục tiêu đề xuất mất tối đa 24 giờ dữ liệu và phục hồi trong 4 giờ, phải đo thực tế. Có /health/live và /health/ready không lộ thông tin nhạy cảm, log requestId và mã lỗi; cảnh báo lỗi 5xx tăng và dung lượng storage.

15 Cấu hình môi trường và tiêu chí hiệu năng

Biến môi trường

Biến

Ý nghĩa và phạm vi

NODE_ENVPORT

Chế độ chạy và cổng API

DATABASE_URL

Kết nối PostgreSQL; chỉ server, tuyệt đối không VITE prefix

APP_ORIGIN

Origin public đã xác minh, dùng dựng link; không lấy từ Host header không tin cậy

SESSION_SECRET

Khóa bí mật đủ entropy cho cơ chế phiên được chọn

INVITATION_KEYINVITATION_KEY_VERSION

Khóa AES 32 byte và version để mã hóa token

STORAGE_DRIVER

local cho dev, s3 cho production

STORAGE_ENDPOINTSTORAGE_REGION

Endpoint, region object storage

STORAGE_BUCKET_PRIVATESTORAGE_BUCKET_PUBLIC

Phân tách staging và media đã phân phối

STORAGE_ACCESS_KEYSTORAGE_SECRET_KEY

Credential server, không vào response

PUBLIC_MEDIA_BASE_URL

URL CDN media đã công bố

CORS_ORIGINSTRUST_PROXY

Allowlist và proxy thực tế, không trust mọi proxy mặc định

ADMIN_BOOTSTRAP_EMAILADMIN_BOOTSTRAP_PASSWORD

Chỉ dùng lệnh khởi tạo; không seed chạy lại ghi đè

VITE_API_BASE_URL

URL API công khai, mặc định /api/v1; không chứa secret



.env.example chỉ có giá trị giả và mô tả. Thiếu secret bắt buộc phải fail startup rõ ràng, không tự dùng khóa tạm ở production. Có runbook giữ khóa invitation khi restore và xoay khóa: hỗ trợ đọc keyVersion cũ, mã hóa lại ciphertext hoặc cấp lại link có chủ đích; không thay khóa rồi làm hỏng toàn bộ link âm thầm.

Ngân sách và cách đo

LCP mục tiêu dưới 2,5 giây, CLS dưới 0,1 và INP dưới 200 ms ở điều kiện đo được ghi rõ; đây là mục tiêu, chưa phải kết quả thực tế.

Ảnh hero bản mobile mục tiêu không quá 300 KB, tổng JS tải đầu mục tiêu không quá 250 KB gzip; tách bundle quản trị khỏi thiệp khách.

Thời gian phản hồi API đọc p95 dưới 500 ms và ghi p95 dưới 800 ms với 100 khách đồng thời, không tính tải media; báo cấu hình máy, dataset và công cụ đo.

Import 2.000 dòng mục tiêu dưới 30 giây trong môi trường tham chiếu; có loading và chống commit lặp. Đo cả transaction và độ tiêu thụ bộ nhớ.

Tối ưu dựa trên phép đo; nếu chưa đạt, báo số thực tế và giới hạn. Không báo đạt chỉ từ Lighthouse hoặc chỉ từ việc API trả 200.

16 Tiêu chí nghiệm thu và kiểm thử

Mã

Điều kiện nghiệm thu quan sát được

AC01

Link hợp lệ hiện đúng tên và lời nhắn; link khác không nhận dữ liệu của khách trước trên cùng trình duyệt

AC02

Thiệp đọc được ở 320 đến 1440 px, không cuộn ngang; bàn phím và reduced motion hoạt động

AC03

Vuốt hiện từng chặng; ảnh tải dần, hero không lazy; nút xác nhận truy cập nhanh

AC04

Mở có nhạc hoặc không nhạc đều thành công; audio bị chặn có cách phát lại

AC05

Hiện đúng giờ lễ, giờ gặp và bản đồ; ICS đúng múi giờ và giờ kết thúc

AC06

Nhập file hợp lệ tạo đúng khách và link; nhập lại giữ nguyên link, RSVP và Wish

AC07

Dòng lỗi, công thức hoặc mã trùng chặn commit; file quá giới hạn bị từ chối có thông báo

AC08

Commit lặp hoặc submit lặp không tạo bản ghi trùng; xung đột version trả 409

AC09

Khách chọn tham gia hoặc từ chối, sửa được trước hạn, bị chặn từ đúng deadline

AC10

Không tham gia vẫn gửi lời chúc được; lỗi form này không mất dữ liệu form kia

AC11

Lời chúc riêng hoặc chưa duyệt không lộ qua danh sách, phân trang hoặc API khách khác

AC12

Lời chúc được đồng ý và duyệt hiện đúng tên, 6 mục ban đầu, ghim trước và xem thêm đúng

AC13

Sửa hoặc rút công khai gỡ lời chúc trên lần fetch kế tiếp; vẫn rút hoặc xóa được sau hạn; admin không duyệt bản cũ

AC14

Lưu nháp không đổi thiệp khách; publish đổi đồng bộ; preview không tạo phản hồi thật

AC15

Thu hồi chặn link ngay, cấp lại làm link cũ vô hiệu nhưng giữ phản hồi

AC16

Guest không đọc được admin, liên hệ khách khác, draft hoặc lời chúc riêng bằng đổi ID

AC17

Export có đúng dữ liệu và link; chuỗi giống công thức vẫn là text an toàn

AC18

Upload file giả, quá cỡ hoặc sai loại bị chặn; xóa asset đang dùng trả 409

AC19

Dashboard tổng đồng ý, từ chối, chưa trả lời khớp tổng đang mời sau các lần sửa và lưu trữ

AC20

Cài mới từ README chạy được; migration, bootstrap, seed demo, backup và restore được kiểm tra



Unit test tập trung vào deadline với clock cố định, cá nhân hóa, điều kiện công khai, version và normalization Excel. Integration test chạy PostgreSQL thật cho FK, uniqueness, transaction rollback, import commit lặp, request đồng thời, phân quyền chéo event và mã hóa token. Không dùng SQLite thay PostgreSQL để xác nhận constraint production.

E2E tối thiểu: admin tạo nội dung và khách từ Excel, publish, mở hai thiệp khác nhau, RSVP, gửi lời chúc, duyệt, sửa lời chúc, cấp lại link, kiểm tra xuất file. Chạy Chromium mobile emulation và desktop; smoke test trên iOS Safari và Android Chrome thật khi có thiết bị. Nếu không có thiết bị hoặc môi trường đo tải, ghi rõ chưa kiểm tra, không suy diễn đã đạt.

17 Trình tự xây dựng và hướng dẫn cho Codex

Các chặng triển khai

1. Khởi tạo monorepo và môi trường: scripts chạy dev, schema, migration, CLI admin, seed giả, adapter storage local và bộ khung xác thực. Xác nhận cài mới chạy được trước khi làm UI sâu.

2. Xây nội dung và thiệp: schema revision, editor theo trường, preview, publish và thiệp responsive; hiệu ứng, ảnh, nhạc, map, ICS và trạng thái lỗi đầy đủ.

3. Xây khách mời: CRUD, vòng đời link, import preview/commit, export, cá nhân hóa và kiểm tra quyền guest.

4. Xây RSVP và lời chúc: upsert, deadline, idempotency, kiểm duyệt, bức tường phân trang, ghim và dashboard.

5. Hoàn thiện: kiểm thử luồng thật, đo hiệu năng, cấu hình production, backup/restore, kiểm tra bảo mật và bàn giao. Sửa lỗi làm sai AC trước khi thêm tính năng mới.

Quy tắc làm việc

Codex đọc toàn bộ tài liệu rồi tạo kế hoạch triển khai theo các chặng. Nếu repo đã có mã, đọc hướng dẫn dự án và giữ cấu trúc phù hợp; không ghi đè thay đổi của người dùng. Các mặc định trong tài liệu được dùng để triển khai; chi tiết thư viện hoặc tổ chức component có thể tự quyết, ghi quyết định đáng kể trong docs. Chỉ hỏi lại khi có mâu thuẫn thực sự làm thay đổi hành vi hoặc cần thông tin tài khoản triển khai.

Không cần tên trường, ngày giờ hoặc ảnh thật để dựng hệ thống. Seed dùng chủ nhân “Người tốt nghiệp”, trường “Trường đại học mẫu”, khách DEMO001 đến DEMO012 và ngày giờ được gắn nhãn demo; thay bằng dữ liệu thật qua quản trị trước sử dụng. Không suy đoán tên trường, địa điểm, lịch lễ hoặc công khai thông tin từ lịch sử trò chuyện. Dùng media mẫu được phép sử dụng; thiếu nhạc thì tắt nhạc mặc định, không lấy ngẫu nhiên nội dung có bản quyền.

Không thay backend bằng mock hoặc localStorage khi bàn giao. Mock chỉ dùng phát triển và phải tách rõ. Không báo hoàn thành nếu còn nút không hoạt động, TODO trong luồng bắt buộc hoặc test AC thất bại. Không tự gửi thiệp, email hoặc tin nhắn thật. Chưa được yêu cầu triển khai ở cuộc trao đổi này; khi thực hiện xây dựng sau đó, tuân theo yêu cầu triển khai của phiên làm việc đó và không tự công khai dữ liệu thật.

Sản phẩm bàn giao của giai đoạn xây dựng

Mã frontend và backend; migration; seed; template Excel; OpenAPI; .env.example; README cài mới; scripts dev, build, test và migrate; hướng dẫn admin; runbook backup/restore, quản lý khóa và rollback; báo cáo test và các giới hạn đã biết. Có checklist thay thông tin demo, kiểm tra link, kiểm tra deadline và thử RSVP trước gửi thật.

18 Tham chiếu kỹ thuật và thứ tự ưu tiên

Khi triển khai, ưu tiên yêu cầu được chủ website xác nhận mới nhất, sau đó các yêu cầu đã chốt ở mục 1, quy tắc nghiệp vụ chi tiết trong tài liệu này, cuối cùng là mặc định kỹ thuật do Codex chọn. Không dùng quyết định kỹ thuật để âm thầm bỏ hành vi sản phẩm. Nếu cần điều chỉnh schema hoặc endpoint để giữ yêu cầu, ghi lý do và cập nhật OpenAPI, migration và test cùng thay đổi.

Các liên kết sau là tài liệu chính thức tham khảo, không cố định phiên bản thư viện. Codex kiểm tra bản tài liệu tương ứng với phiên bản thực tế được cài.

MDN Autoplay guide — https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay

MDN Intersection Observer — https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API

MDN Responsive images — https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images

Vite Getting Started — https://vite.dev/guide/

Prisma Documentation — https://www.prisma.io/docs

OWASP Session Management — https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

OWASP File Upload — https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

OWASP CSRF Prevention — https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

Các thông tin phải điền trước khi dùng thật: tên chủ nhân, trường và ngành, ngày giờ lễ, giờ gặp và giờ kết thúc, địa điểm và cổng vào, hạn RSVP, hạn lời chúc, ảnh, nhạc được phép dùng, danh sách khách và domain triển khai. Những trường này không cản việc xây dựng phần mềm; trang quản trị phải cho phép cập nhật mà không sửa mã nguồn.