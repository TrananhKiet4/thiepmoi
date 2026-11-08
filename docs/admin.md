# Hướng dẫn quản trị thiệp mời tốt nghiệp

Ứng dụng phục vụ một chủ nhân tốt nghiệp và một sự kiện đang dùng. Mở `/admin` trên địa chỉ ứng dụng do người vận hành cung cấp. Hướng dẫn cài đặt và tạo tài khoản nằm trong [README](../README.md); hợp đồng tích hợp nằm trong [OpenAPI](openapi.yaml).

## Bắt đầu và đăng nhập

Đăng nhập bằng email và mật khẩu đã được tạo cho bạn. Hệ thống không có mật khẩu mặc định, nút đăng ký công khai hoặc luồng quên mật khẩu. Nếu chưa có tài khoản hoặc không đăng nhập được, nhờ người vận hành kiểm tra tài khoản theo README; không nhập khóa máy chủ vào giao diện.

Phiên quản trị hết hạn sau 12 giờ. Khi hết phiên, đăng nhập lại rồi tải lại dữ liệu trước khi tiếp tục. Nút đăng xuất nằm ở cuối thanh điều hướng. Trên điện thoại, mở biểu tượng menu để chuyển trang hoặc đăng xuất.

Các khu vực quản trị gồm **Tổng quan**, **Nội dung**, **Khách mời**, **Thư viện**, **Nhập Excel**, **Phản hồi** và **Lời chúc**.

## Trình tự chuẩn bị một thiệp thật

1. Thay thông tin mẫu, ngày giờ và địa điểm tại **Nội dung**.
2. Upload ảnh, nhạc được phép dùng tại **Thư viện**, rồi chọn chúng trong nội dung thiệp.
3. Lưu bản nháp và xem trước; kiểm tra lại lời mời, bản đồ và các hạn tiếp nhận.
4. Thêm khách hoặc nhập Excel; rà soát mã khách, tên hiển thị và lời nhắn riêng.
5. Công bố bản nháp đã lưu. Mở một link khách để thử thiệp và phản hồi.
6. Sao chép link hoặc xuất Excel để tự gửi từng lời mời.

Ứng dụng không tự gửi email, Zalo hoặc tin nhắn. Người có link riêng có quyền xem và phản hồi cho thiệp đó; chỉ chia sẻ link với đúng người nhận.

## Nội dung: lưu nháp, xem trước và công bố

Trong **Nội dung**, bốn tab tách thông tin sự kiện, các chặng thiệp, giao diện/nhạc và trạng thái công bố/tiếp nhận.

### Thông tin sự kiện

Điền họ tên người tốt nghiệp, trường, ngành và khóa học. Thay toàn bộ tên, địa chỉ, tọa độ và hướng dẫn cổng vào của buổi lễ. Bật **Có giờ gặp riêng** nếu thời gian/địa điểm gặp và chụp ảnh khác buổi lễ.

Các ô ngày giờ dùng **giờ Việt Nam (GMT+7, Asia/Ho_Chi_Minh)**, kể cả khi máy của bạn đang ở múi giờ khác. Giờ kết thúc phải sau giờ bắt đầu. Hạn xác nhận tham dự không được sau giờ bắt đầu gặp riêng, hoặc giờ bắt đầu lễ nếu không có giờ gặp riêng. Hạn lời chúc có thể để trống để không giới hạn bằng ngày giờ; cờ nhận lời chúc vẫn có thể đóng ngay.

Bản đồ dùng địa điểm lễ hoặc điểm gặp theo lựa chọn trong chặng **Bản đồ**. Nếu chọn điểm gặp, phải có thông tin gặp riêng. Mở bản đồ và link chỉ đường trên thiệp để xác nhận tọa độ khớp địa chỉ chữ.

**Lời mở theo nhóm khách** dùng mã nhóm giống hệt trường nhóm của khách. Các biến hỗ trợ là `{{guestName}}`, `{{hostName}}` và `{{salutation}}`. Tên khách ưu tiên tên hiển thị rồi họ tên. Lời mở ưu tiên lời nhắn riêng của khách, tiếp đến mẫu đúng nhóm, sau cùng mẫu chung trong chặng mở thiệp. Đây là văn bản thuần; không dùng HTML, script hoặc biểu thức.

### Các chặng thiệp

Thiệp có tám chặng: mở thiệp, khoảnh khắc tốt nghiệp, câu chuyện, người đồng hành, lời mời chính thức, bản đồ, phản hồi/lời chúc và lời kết. Dùng nút mũi tên để sắp xếp. Câu chuyện, album người đồng hành và lời kết có thể tắt; các chặng bắt buộc vẫn phải hiển thị.

Chọn ảnh từ thư viện cho ảnh bìa, ảnh chính và các mục nội dung. Câu chuyện tối đa 12 mục; album tối đa 40 ảnh. Ảnh chính là trường bắt buộc khi công bố. Các ảnh dùng mô tả thay thế từ thư viện; chú thích album là trường riêng trong nội dung.

### Giao diện và nhạc

Chọn một trong ba bảng màu và kiểu chữ có sẵn. Nếu bật nhạc nền, phải chọn một file audio hợp lệ; có thể chỉnh âm lượng từ 0 đến 1 và bật phát lặp lại. Chỉ dùng nhạc bạn được phép sử dụng. Khách chọn mở có nhạc hoặc không nhạc; trình duyệt có thể từ chối phát và khách vẫn xem thiệp bình thường.

### Lưu và công bố

**Lưu bản nháp** ghi một phiên bản mới. Nội dung khách đang thấy chưa thay đổi. Nhãn trạng thái cho biết còn thay đổi chưa lưu; lưu trước khi xem trước hoặc công bố. Đừng coi cảnh báo khi đóng tab là bản sao lưu các thay đổi chưa lưu.

**Xem trước** mở bản nháp đã lưu, có nhãn xem trước. Giao diện hiện dùng khách mẫu. Xem trước không ghi lượt mở, RSVP hoặc lời chúc thật. API cũng hỗ trợ xem trước theo một khách thuộc sự kiện, nhưng giao diện hiện chưa có ô chọn khách.

Tại **Công bố & tiếp nhận**, chọn **Công bố thiệp** để đưa bản nháp đã lưu tới khách. Nếu thiếu tên, trường, ngành, thời gian/địa điểm, ảnh chính hoặc media hợp lệ, sửa các lỗi được báo rồi lưu và công bố lại. Khách luôn đọc phiên bản đã công bố; lỗi công bố không làm lộ bản nháp.

**Rút công bố** cần xác nhận và tạm dừng đọc/ghi của tất cả khách. Danh sách khách, phản hồi và lịch sử vẫn được giữ. Ảnh/nhạc đã tải hoặc được cache có thể còn tồn tại; rút công bố không thu hồi các bản đã tải.

Ba thiết lập **Nhận xác nhận tham dự**, **Nhận lời chúc**, **Hiển thị tường lời chúc** có hiệu lực ngay, độc lập với việc lưu/công bố nội dung. Tắt lời chúc khóa tạo/sửa/khôi phục lời chúc, nhưng khách có link còn hợp lệ vẫn được rút đồng ý công khai hoặc xóa lời chúc khi sự kiện còn công bố.

## Thư viện ảnh và nhạc

Trong **Thư viện**, chọn file, nhập mô tả thay thế dễ hiểu rồi upload. Mỗi file tối đa 10 MB; ảnh nhận JPEG, PNG, WebP, nhạc nhận MP3 hoặc M4A. Ảnh quá 40 megapixel, SVG, HTML và file không giải mã được sẽ bị từ chối. File âm thanh cần bộ giải mã trên máy chủ; nếu hệ thống báo bộ giải mã chưa sẵn sàng, nhờ người vận hành kiểm tra.

Upload thành công chỉ thêm file vào thư viện; chọn file trong **Nội dung**, lưu nháp rồi công bố để dùng cho khách. Bạn có thể sửa và lưu mô tả thay thế ngay trong thẻ media. Nếu ảnh preview hết hạn, tải lại thư viện để nhận URL mới.

Nút xóa chỉ xóa được media chưa được **bất kỳ phiên bản nội dung đang lưu giữ** nào tham chiếu. Việc bỏ ảnh khỏi bản nháp mới không gỡ tham chiếu trong phiên bản cũ, nên có thể vẫn nhận lỗi `ASSET_IN_USE`. Không xóa trực tiếp file trong kho lưu trữ để vượt qua kiểm tra này; nhờ người vận hành xử lý việc lưu giữ dữ liệu theo quy trình.

## Khách mời và vòng đời link

Trong **Khách mời**, dùng ô tìm kiếm để tìm theo mã hoặc tên; lọc theo nhóm, phản hồi và trạng thái lưu trữ. Danh sách phân trang 25 khách mỗi trang. Bộ lọc **Đang mời** của danh sách chọn khách chưa lưu trữ; một khách đã thu hồi link vẫn có thể xuất hiện kèm trạng thái **Đã thu hồi**. Tổng quan chỉ đếm link hoạt động của khách chưa lưu trữ.

Chọn **Thêm khách mời** và điền mã cùng họ tên. Mã gồm chữ, số, gạch ngang hoặc gạch dưới, tối đa 40 ký tự; hệ thống chuyển thành chữ hoa và không cho trùng trong sự kiện. Có thể dùng tên hiển thị, nhóm, xưng hô, email, số điện thoại và lời nhắn riêng. Số điện thoại là chuỗi để giữ số 0 đầu. Email/số điện thoại không hiển thị trên thiệp khách.

Sửa tên hoặc lời nhắn giữ nguyên link, RSVP và lời chúc. Nếu đang mở dữ liệu cũ và hệ thống báo xung đột phiên bản, tải lại danh sách, kiểm tra bản mới rồi thực hiện lại thay đổi cần thiết.

Trong thao tác lấy link của mỗi khách:

- **Sao chép đường dẫn** hoặc **Sao chép tin nhắn** để tự gửi. **Mở thiệp** mở link thật; khi chủ động mở phong bì, lượt mở có thể được ghi như một lượt khách thông thường.
- **Thu hồi link** chặn truy cập ngay và giữ lịch sử. Lời chúc của khách tạm không xuất hiện trên bức tường.
- **Cấp lại link** tạo đường dẫn mới, làm link cũ mất hiệu lực và giữ nguyên RSVP/lời chúc. Sau khi cấp lại, lấy lại link mới để gửi; đừng gửi bản đã sao chép trước đó.
- **Lưu trữ** ở danh sách khách chặn truy cập và loại khỏi thống kê đang mời, không xóa dữ liệu. Chọn bộ lọc **Đã lưu trữ** hoặc **Tất cả lịch sử** để tìm và khôi phục.
- **Khôi phục** chỉ bỏ lưu trữ; không tự bỏ thu hồi link. Nếu khách vẫn không vào được vì link đã thu hồi, cấp lại link riêng.

File xuất link chứa quyền truy cập thiệp của từng người. Giữ file trong nơi riêng tư, chỉ gửi đúng dòng cho đúng người; không đưa file lên trang công khai.

## Nhập Excel: kiểm tra trước, lưu sau

1. Mở **Nhập Excel** và **Tải file mẫu**. Thay các dòng DEMO bằng khách thật. Chỉ dùng `.xlsx`, tối đa 5 MB và 2.000 dòng dữ liệu. Đặt cột số điện thoại là **Text** trước khi nhập để giữ số 0 đầu.
2. Chọn file và bấm **Đọc file**. Chọn đúng trang tính.
3. Ghép cột trong file với trường chuẩn. `guest_code` và `full_name` bắt buộc; các cột tùy chọn gồm `display_name`, `group`, `salutation`, `personal_message`, `email`, `phone`. Mỗi header chỉ được ghép một lần.
4. Bấm **Kiểm tra dữ liệu**. Đọc số tạo mới, cập nhật, không đổi, lỗi và cảnh báo. Xem các dòng preview; có thể tải báo cáo XLSX lỗi/cảnh báo.
5. Nếu có lỗi, sửa file rồi đọc/kiểm tra lại. Chỉ bấm **Xác nhận nhập** khi preview hợp lệ, chưa hết hạn và bạn đã kiểm tra đúng danh sách.

Preview **chưa lưu khách** và hết hạn sau 24 giờ. Có bất kỳ dòng lỗi nào thì toàn bộ lần nhập bị chặn, không nhập một phần. Trùng mã trong file là lỗi; trùng tên nhưng khác mã là cảnh báo để bạn kiểm tra, không tự gộp người. Công thức trong vùng dữ liệu được kiểm tra là lỗi; chuyển về giá trị văn bản trước khi nhập. Hệ thống không chạy macro hoặc lấy kết quả công thức thay dữ liệu.

Mã đã có trong database được coi là cập nhật. **Chỉ cột đã ghép được cập nhật**; ô trống ở cột tùy chọn đã ghép sẽ xóa giá trị cũ. Cột không ghép được giữ nguyên. Không được để trống mã hoặc họ tên. Nhập lại không đổi link, trạng thái lưu trữ, RSVP hoặc lời chúc; khôi phục khách lưu trữ là thao tác riêng.

Nếu khách hoặc thiệp thay đổi sau preview, xác nhận nhập trả xung đột và không lưu một phần. Tạo preview mới để kiểm tra lại. Gửi lại một lần nhập đã hoàn thành trả kết quả đã lưu, không tạo thêm khách. Nếu mất mạng sau xác nhận, kiểm tra trạng thái lần nhập hoặc danh sách trước khi tạo lần nhập khác.

## Phản hồi tham dự

Trong **Phản hồi**, tìm/lọc khách rồi bấm nút chỉnh phản hồi. Chọn **Sẽ tham dự** hoặc **Không tham dự**, thêm ghi chú nếu cần và điền **Lý do chỉnh sửa** bắt buộc. Ghi chú và lý do tối đa 500 ký tự. Admin có thể sửa sau hạn; lý do được ghi vào nhật ký.

Không có RSVP nghĩa là **Chưa phản hồi**. Khách được tự đổi lựa chọn trước hạn theo giờ máy chủ; đến đúng hạn thì form khóa. RSVP và lời chúc lưu độc lập: từ chối tham dự vẫn được gửi lời chúc khi cổng lời chúc còn mở.

Tổng quan tính từ dữ liệu hiện tại: đồng ý + từ chối + chưa phản hồi = tổng thiệp đang hoạt động. Lưu trữ khách hoặc thu hồi link làm mẫu số giảm. Lượt mở chỉ cho biết một thiệp đã được chủ động mở; không chứng minh đúng người nhận đã đọc và không được tính là xác nhận tham dự.

## Quản lý lời chúc

Trong **Lời chúc**, lọc **Công khai**, **Riêng tư**, **Đã ẩn**, **Đã xóa** hoặc **Tất cả**. Khách tự quyết định nội dung và có chia sẻ lời chúc hay không.

- **Công khai** xuất hiện ngay khi khách lưu lời chúc và đồng ý chia sẻ.
- **Riêng tư** chỉ hiển thị cho khách gửi và người quản lý sự kiện.
- **Ẩn** gỡ lời chúc khỏi tường và bỏ ghim.
- **Hiện lại** đưa lời chúc đã ẩn trở lại tường nếu khách vẫn đồng ý chia sẻ và link còn hoạt động.
- **Ghim lời chúc** đưa lời chúc công khai lên đầu tường. Bấm lại để bỏ ghim.

Bức tường hiển thị 6 lời chúc mỗi lần, ưu tiên lời chúc đã ghim rồi đến lời chúc công khai gần nhất. Khi khách lưu chỉnh sửa và đồng ý chia sẻ, bản mới xuất hiện ngay và ghim cũ được bỏ. Rút đồng ý công khai hoặc xóa lời chúc gỡ hiển thị ngay.

Khách vẫn được rút đồng ý hoặc xóa sau hạn khi link còn hợp lệ và thiệp còn công bố. Khi form còn mở, khách có thể gửi lại để khôi phục lời chúc đã xóa với nội dung và lựa chọn chia sẻ mới.

Thu hồi link hoặc lưu trữ khách tạm ẩn lời chúc khỏi bức tường. Khi link hoạt động trở lại, lời chúc đủ điều kiện công khai xuất hiện lại.

## Xuất dữ liệu

**Xuất Excel** trong **Khách mời** tải danh sách và link; trong **Phản hồi** tải RSVP cùng lời chúc, đồng ý và trạng thái kiểm duyệt. File có thời điểm xuất và bộ lọc. Chọn bộ lọc trước khi xuất; để gồm khách lưu trữ, chọn **Tất cả lịch sử** trong bộ lọc lưu trữ. Tích hợp API còn có tùy chọn `history=true` với quy tắc riêng được mô tả trong OpenAPI.

Dữ liệu người dùng được ghi thành ô văn bản, kể cả nội dung bắt đầu bằng `=`, `+`, `-`, `@`. File phản hồi có thể chứa lời chúc riêng, email và điện thoại; chỉ chia sẻ cho người được phép xử lý dữ liệu này.

## Khi gặp lỗi

- **Dữ liệu đã thay đổi / xung đột phiên bản**: tải lại bản hiện tại, đối chiếu rồi thực hiện lại. Không bấm gửi liên tục trên dữ liệu cũ.
- **Chưa công bố / thiệp chưa sẵn sàng**: kiểm tra tab công bố; lưu nháp chưa làm link khách hoạt động.
- **Link không khả dụng**: kiểm tra link đã cấp lại chưa, có bị thu hồi hoặc khách bị lưu trữ không. Khôi phục và cấp lại là hai thao tác khác nhau.
- **Form đã đóng**: kiểm tra hạn đã công bố và cờ tiếp nhận. Đổi hạn trong nháp cần công bố lại; bật/tắt cờ tiếp nhận có hiệu lực ngay.
- **Media đang được dùng**: mọi revision giữ tham chiếu đều ngăn xóa, kể cả revision cũ.
- **Preview Excel hết hạn / danh sách đã thay đổi**: kiểm tra dữ liệu và tạo preview mới.
- **Gửi quá nhanh**: đợi khoảng thời gian hệ thống yêu cầu rồi thử lại.
- **Lỗi mạng hoặc lỗi máy chủ**: giữ nội dung đang nhập, thử tải lại dữ liệu/trạng thái trước khi gửi lại. Khi cần hỗ trợ, cung cấp thời điểm, thao tác và mã yêu cầu nếu có; không gửi mật khẩu, link thật hoặc lời chúc riêng vào kênh công khai.

## Checklist bỏ dữ liệu demo trước khi gửi thật

- [ ] Tên chủ nhân, trường, ngành, khóa học và mọi câu chuyện/lời kết đã là nội dung thật.
- [ ] Ngày giờ demo năm 2099, địa điểm mẫu, tọa độ và cổng vào đã được thay; giờ lễ, giờ gặp và giờ kết thúc đã đúng.
- [ ] Hạn RSVP và hạn lời chúc đúng; đã kiểm tra ba cờ tiếp nhận/bức tường.
- [ ] Ảnh minh họa được thay bằng ảnh được phép dùng; mô tả thay thế và chú thích ảnh đúng. Nhạc được phép sử dụng hoặc để tắt.
- [ ] Các mẫu nhóm, xưng hô, tên hiển thị và lời nhắn riêng không còn placeholder sai người.
- [ ] Khách DEMO001–DEMO012 và mọi khách/thử nghiệm đã được lưu trữ hoặc loại khỏi danh sách gửi thật; không gửi các link demo.
- [ ] Đã xem trước, lưu và công bố đúng revision; không còn thay đổi chưa lưu.
- [ ] Đã mở ít nhất hai link khách thử riêng để kiểm tra tên/lời nhắn không lẫn, nhạc có/không nhạc, bản đồ và tải lịch.
- [ ] Đã thử RSVP, lời chúc riêng và công khai, ẩn, hiện lại, sửa, rút đồng ý và cấp lại link. Dữ liệu thử đã được xử lý trước khi gửi.
- [ ] Đã xem thiệp trên điện thoại và máy tính, kiểm tra nút chạm, ảnh, chữ và khả năng mở link từ ứng dụng nhắn tin.
- [ ] Địa chỉ ứng dụng và link xuất ra dùng domain thật/HTTPS; người vận hành đã xác nhận backup, media và khóa mời theo tài liệu vận hành.
- [ ] File link/phản hồi được giữ riêng tư; mỗi người nhận đúng link của mình.
