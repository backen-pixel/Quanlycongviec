# BẢN THẢO — Quy trình vận hành module sản xuất (văn viết)

**Bản song song của khoá «Hướng dẫn sử dụng module sản xuất».**
Cùng nội dung, cùng khung năm mục, khác văn phong: phi ngôi, trang trọng, không hội thoại,
không ví dụ kể chuyện. Dùng cho mục đích lưu hành nội bộ và đối chiếu quy trình.

**Soạn:** 12/10/2026 · **Số bài:** 4

---

# BÀI 1 — Hệ thống trang quản lý nhiệm vụ và công việc

- **Thứ tự:** 1 · **Thời lượng:** 20 phút · **Bắt buộc:** có
- **Tóm tắt:** Phân định chức năng của bốn trang quản lý nhiệm vụ trong module sản xuất, nguyên tắc lựa chọn trang theo mục đích tra cứu, và quy trình rà soát định kỳ.

## 1. Tư tưởng

Hoạt động quản lý tại xưởng sản xuất không lấy dự án làm đơn vị điều hành, mà lấy **nhiệm vụ** làm đơn vị điều hành. Một dự án nội thất thường kéo dài nhiều tháng và được phân rã thành hàng chục nhiệm vụ nhỏ. Tiến độ tổng thể của dự án là hệ quả cộng dồn của việc hoàn thành đúng hạn từng nhiệm vụ đó.

Với quy mô vận hành thông thường — khoảng bốn mươi dự án đồng thời, mỗi dự án từ mười lăm đến hai mươi nhiệm vụ — tổng khối lượng cần theo dõi vào khoảng sáu trăm đến tám trăm bản ghi. Việc trình bày toàn bộ khối lượng này trên một giao diện duy nhất làm mất khả năng đọc hiểu.

Hệ thống do đó được thiết kế theo nguyên tắc **phân tách theo mục đích tra cứu**. Mỗi trang đảm nhiệm một câu hỏi quản trị xác định:

| Mục đích tra cứu | Trang chức năng | Đường dẫn |
|---|---|---|
| Xác định khối lượng công việc trong ngày và các nhiệm vụ quá hạn | Quản lý nhiệm vụ | `/sx/project-tasks` |
| Xác định công đoạn hiện tại của một đơn hàng | Dashboard xưởng | `/sx/dashboard` |
| Rà soát toàn bộ nhiệm vụ thuộc một dự án cụ thể | Chi tiết dự án, tab **Công việc** | `/sx/projects/:id` |
| Xác định khối lượng công việc được giao cho một nhân sự | Giao việc Sản xuất | `/sx/assignments` |

**Nguyên tắc vận hành:** lựa chọn trang chức năng căn cứ vào mục đích tra cứu, không căn cứ vào thói quen sử dụng.

## 2. Tư duy

### 2.1. Phân biệt nhiệm vụ dự án và giao việc

Hệ thống quản lý hai đối tượng khác nhau, thường bị nhầm lẫn do cùng được gọi là «việc».

| Tiêu chí | Nhiệm vụ dự án | Giao việc |
|---|---|---|
| Đối tượng gắn kết | Dự án và công đoạn sản xuất | Cá nhân người thực hiện |
| Nguồn phát sinh | Hệ thống tự sinh theo bộ mẫu khi thẻ dự án chuyển cột | Người quản lý khởi tạo thủ công, hoặc khởi tạo nhanh trong khung bình luận |
| Câu hỏi quản trị tương ứng | Công đoạn đã hoàn thành hay chưa | Nhân sự đang đảm nhiệm bao nhiêu đầu việc |
| Vị trí tra cứu | Quản lý nhiệm vụ; tab Công việc của dự án | Giao việc Sản xuất; Quản lý phát sinh |

Việc phát sinh là một bản ghi thuộc nhóm **Giao việc**, có bổ sung thuộc tính phân loại phát sinh. Nội dung này được trình bày tại Bài 2.

### 2.2. Cơ chế xác định tiến độ nhiệm vụ

Tiến độ của một nhiệm vụ được hệ thống tính toán tự động theo tỷ lệ việc con đã hoàn thành trên tổng số việc con. Người dùng không có quyền nhập trực tiếp giá trị tiến độ.

| Tỷ lệ việc con hoàn thành | Trạng thái hiển thị |
|---|---|
| 0% | Chưa làm |
| Lớn hơn 0% và nhỏ hơn 100% | Đang làm |
| 100% | Đã làm |

**Hệ quả:** nhiệm vụ chỉ chuyển sang trạng thái «Đã làm» khi toàn bộ việc con đã được đánh dấu hoàn thành. Trường hợp nhiệm vụ không chuyển trạng thái như mong đợi, cần mở chi tiết nhiệm vụ và rà soát danh sách việc con.

### 2.3. Cơ chế phân nhóm theo hạn hoàn thành

Trang Quản lý nhiệm vụ không trình bày dữ liệu dưới dạng lịch. Các nhiệm vụ được phân vào sáu nhóm theo khoảng cách tới hạn hoàn thành:

**Quá hạn · Hôm nay · Ngày mai · Trong tuần · Tuần sau · Chưa có hạn**

Nhóm **Chưa có hạn** cần được ưu tiên rà soát. Do không có mốc thời gian tham chiếu, các nhiệm vụ thuộc nhóm này không bao giờ kích hoạt cảnh báo quá hạn và có nguy cơ bị bỏ sót cho đến khi phát sinh khiếu nại.

**Quy định về thời điểm hết hạn:** hạn hoàn thành trong ngày được tính đến giờ kết thúc làm việc của công ty, không tính đến hết ngày theo lịch. Nhiệm vụ chưa hoàn thành sau giờ kết thúc làm việc được chuyển sang nhóm Quá hạn.

## 3. Nguồn lực

Việc vận hành các trang chức năng nêu trên phụ thuộc vào bốn điều kiện tiền đề. Thiếu một trong các điều kiện này, giao diện sẽ hiển thị không đầy đủ hoặc không chính xác.

| Điều kiện | Bộ phận phụ trách | Biểu hiện khi chưa đáp ứng |
|---|---|---|
| Pipeline xưởng đã khai báo đầy đủ cột công đoạn | Quản trị hệ thống | Dashboard không hiển thị cột nào |
| Bộ mẫu nhiệm vụ đã khai báo theo từng cột | Quản trị hệ thống | Dự án mới không phát sinh nhiệm vụ |
| Mỗi cột công đoạn đã gán nhân sự phụ trách | Quản trị hệ thống | Nhiệm vụ được tạo nhưng không có người nhận |
| Dự án đã được bàn giao từ CRM sang sản xuất | Bộ phận kinh doanh | Đơn hàng không xuất hiện trên Dashboard xưởng |

**Phân quyền truy cập:** nhân viên xưởng được xem các nhiệm vụ do mình phụ trách và các nhiệm vụ thuộc dự án mình tham gia. Cấp quản lý được xem toàn bộ dữ liệu trong phạm vi công ty, kèm quyền lọc theo nhân sự và khu vực.

## 4. Vận hành

### 4.1. Quy trình rà soát đầu ngày

Quy trình gồm sáu bước, thực hiện theo đúng thứ tự:

**Bước 1.** Truy cập `/sx/project-tasks` theo đường dẫn menu *Sản xuất → 1. Tổng quan → Quản lý nhiệm vụ*. Giữ nguyên bộ lọc module ở giá trị **Sản xuất**.

**Bước 2.** Chuyển chế độ hiển thị sang **Hạn**.

**Bước 3.** Rà soát nhóm **Quá hạn**. Đối với từng nhiệm vụ, lựa chọn một trong ba phương án xử lý:
- Giữ nguyên hạn và thông báo nhắc nhở người thực hiện, nếu nhiệm vụ còn khả năng hoàn thành trong ngày;
- Điều chỉnh hạn hoàn thành, kèm ghi nhận lý do tại mục bình luận;
- Huỷ nhiệm vụ, nếu nhiệm vụ không còn cần thiết.

**Bước 4.** Rà soát nhóm **Hôm nay** để xác định khối lượng công việc thực tế trong ngày. Trường hợp khối lượng vượt năng lực, thực hiện điều chỉnh hạn ngay từ đầu ngày.

**Bước 5.** Rà soát nhóm **Chưa có hạn**. Gán hạn hoàn thành cho các nhiệm vụ còn hiệu lực.

**Bước 6.** Sử dụng chức năng **Nhắc** trên thẻ nhiệm vụ để gửi thông báo tới người thực hiện. Sau khi gửi, nút chuyển trạng thái hiển thị thành *Đã nhắc*.

**Lưu ý:** chức năng Nhắc bị vô hiệu hoá đối với nhiệm vụ chưa gán danh mục. Cần bổ sung danh mục trước khi sử dụng chức năng này.

### 4.2. Dải chỉ số đầu trang

Dải chỉ số gồm năm giá trị: **Tổng · Chưa làm · Đang làm · Đã làm · Quá hạn**.

Mỗi ô chỉ số đồng thời là một bộ lọc nhanh. Thao tác chọn ô sẽ lọc danh sách theo chỉ số tương ứng; thao tác chọn lại sẽ huỷ bộ lọc.

**Lưu ý quan trọng:** giá trị trên dải chỉ số được tính theo phạm vi bộ lọc đang áp dụng, không phải theo toàn bộ dữ liệu hệ thống. Trường hợp số liệu không khớp với kết quả đối chiếu thủ công, cần huỷ toàn bộ điều kiện lọc trước khi đối chiếu lại.

### 4.3. Bộ lọc nâng cao

Bộ lọc nâng cao hỗ trợ các tiêu chí: module (CRM, Sản xuất, Vận chuyển – Lắp đặt), dự án, công ty, khu vực, nhân sự, khoảng hạn hoàn thành và từ khoá tìm kiếm.

Các điều kiện đang áp dụng được hiển thị dưới dạng thẻ điều kiện bên dưới thanh công cụ. Mỗi thẻ có thể được gỡ riêng lẻ.

**Khuyến nghị:** huỷ toàn bộ điều kiện lọc sau mỗi phiên tra cứu, nhằm tránh áp dụng nhầm bộ lọc tồn đọng ở phiên làm việc kế tiếp.

### 4.4. Tra cứu tiến độ đơn hàng

Quy trình tra cứu tiến độ phục vụ yêu cầu của khách hàng:

1. Truy cập `/sx/dashboard`;
2. Tìm thẻ dự án theo tên khách hàng hoặc mã đơn hàng;
3. Xác định cột chứa thẻ — cột này tương ứng với công đoạn hiện tại của đơn hàng;
4. Chọn thẻ để truy cập trang chi tiết dự án khi cần thông tin chi tiết hơn.

Các thao tác được hỗ trợ trên Dashboard:
- Kéo thả thẻ sang cột khác để chuyển công đoạn;
- Bật chế độ **Gộp cột** để hợp nhất các cột nhỏ cùng nhóm thành một cột lớn;
- Trường hợp thao tác kéo thả bị từ chối, nguyên nhân là cột hiện tại còn nhiệm vụ mang cờ *chặn chuyển giai đoạn* chưa hoàn thành. Hệ thống liệt kê danh sách nhiệm vụ còn thiếu kèm theo thông báo từ chối.

### 4.5. Trang chi tiết dự án

Phần đầu trang hiển thị **thanh tiến độ** mô phỏng pipeline sản xuất. Các cột lớn được bố trí theo chiều ngang và nối tiếp nhau; các công đoạn song song trong cùng một cột lớn được bố trí theo chiều dọc.

Thao tác trên thanh tiến độ:
- Chọn biểu tượng vòng tròn để đánh dấu hoàn thành;
- Chọn tên cột để chuyển thẻ dự án sang cột tương ứng.

Trang chi tiết gồm các tab: **Công việc**, Không gian chung, Tài liệu, Drive, Ghi chú, Bình luận, Lịch sử, Vật tư – Mua hàng, Đội, Gửi duyệt. Các thao tác nghiệp vụ chính được thực hiện tại tab **Công việc**.

## 5. Báo cáo và sửa chữa

### 5.1. Nguồn số liệu

| Nguồn | Phạm vi | Lưu ý khi sử dụng |
|---|---|---|
| Dải chỉ số trang Quản lý nhiệm vụ | Theo bộ lọc đang áp dụng | Huỷ điều kiện lọc trước khi đọc số liệu tổng |
| Tab Lịch sử trong trang chi tiết dự án | Toàn bộ thay đổi của dự án | Dùng để truy vết người thực hiện và thời điểm |
| Báo cáo phát sinh | Toàn bộ việc phát sinh | Trình bày tại Bài 2 |

### 5.2. Các lỗi thường gặp và biện pháp khắc phục

| Biểu hiện | Nguyên nhân | Biện pháp khắc phục |
|---|---|---|
| Nhiệm vụ không chuyển sang trạng thái «Đã làm» | Còn việc con chưa được đánh dấu hoàn thành | Mở chi tiết nhiệm vụ, rà soát toàn bộ danh sách việc con |
| Nhiệm vụ không hiển thị với người thực hiện | Chưa gán nhân sự phụ trách | Mở chi tiết nhiệm vụ, bổ sung người thực hiện |
| Nhiệm vụ tồn đọng tại nhóm «Chưa có hạn» | Dự án chưa có ngày lắp đặt, hoặc nhiệm vụ chưa gán công đoạn | Cập nhật ngày lắp đặt cho dự án; kiểm tra việc gán cột công đoạn cho nhiệm vụ |
| Thao tác kéo thả thẻ bị từ chối | Cột hiện tại còn nhiệm vụ mang cờ chặn chuyển giai đoạn | Hoàn thành hoặc huỷ các nhiệm vụ theo danh sách hệ thống liệt kê |
| Số liệu chỉ số không khớp kết quả đối chiếu | Đang áp dụng bộ lọc | Huỷ toàn bộ điều kiện lọc và đối chiếu lại |

### 5.3. Quy định duy trì chất lượng dữ liệu

1. Rà soát nhóm **Quá hạn** vào đầu mỗi ngày làm việc, trước các nội dung khác.
2. Huỷ các nhiệm vụ không còn hiệu lực. Nhiệm vụ tồn đọng không được xử lý làm sai lệch toàn bộ số liệu thống kê.
3. Ghi nhận lý do tại mục bình luận đối với mọi trường hợp điều chỉnh hạn hoàn thành, phục vụ công tác đối chiếu về sau.

---

# BÀI 2 — Quản lý và khởi tạo việc phát sinh

- **Thứ tự:** 2 · **Thời lượng:** 25 phút · **Bắt buộc:** có
- **Tóm tắt:** Khái niệm việc phát sinh, hai trục phân loại, cơ chế xác định hạn theo cam kết dịch vụ, quy trình khởi tạo và chế độ báo cáo.

## 1. Tư tưởng

Trong quá trình thực hiện hợp đồng nội thất, các yêu cầu nằm ngoài phạm vi kế hoạch ban đầu phát sinh thường xuyên. Nguồn phát sinh bao gồm thay đổi yêu cầu từ phía khách hàng, sai sót trong quá trình thực hiện của các bộ phận nội bộ, và các yếu tố khách quan từ nhà cung cấp.

Các yêu cầu này nằm ngoài bộ mẫu nhiệm vụ, không được lập kế hoạch trước, nhưng vẫn phải được thực hiện và vẫn phát sinh chi phí. Đối tượng này được hệ thống quản lý dưới tên gọi **việc phát sinh**.

Việc không ghi nhận phát sinh vào hệ thống dẫn tới ba hệ quả đồng thời:

| Hệ quả | Nội dung |
|---|---|
| Về trách nhiệm | Không xác định được cá nhân chịu trách nhiệm khi công việc chậm tiến độ |
| Về tài chính | Không có căn cứ lập hoá đơn bổ sung đối với phát sinh có thu phí |
| Về chất lượng | Không có dữ liệu thống kê để xác định công đoạn phát sinh sai sót lặp lại |

**Quy định:** mọi việc phát sinh đều phải được ghi nhận vào hệ thống, bao gồm cả các phát sinh không thu phí của khách hàng.

**Về thiết kế hệ thống:** việc phát sinh không sử dụng cấu trúc dữ liệu riêng mà kế thừa cấu trúc của Giao việc, bổ sung thuộc tính phân loại phát sinh. Thiết kế này cho phép tái sử dụng toàn bộ chức năng đã có của Giao việc — thẻ công việc, bình luận, tệp đính kèm, thông báo — và không yêu cầu người dùng làm quen với giao diện thứ hai.

## 2. Tư duy

### 2.1. Hai trục phân loại độc lập

Mỗi việc phát sinh được phân loại theo hai trục độc lập, phục vụ hai mục đích quản trị khác nhau.

**Trục thứ nhất — trách nhiệm chi phí**, xác định việc phát sinh thuộc nhóm **Có phí** hay **Không phí**.

Thuộc tính này không do người khởi tạo lựa chọn. Thuộc tính được kế thừa từ **loại phát sinh** đã khai báo trong danh mục. Việc lựa chọn loại phát sinh đồng thời xác định nhóm chi phí tương ứng.

*Căn cứ thiết kế:* thuộc tính chi phí không được lưu trên từng bản ghi nhằm bảo đảm tính nhất quán. Trường hợp cùng một loại công việc được phân loại khác nhau giữa các lần khởi tạo, số liệu tổng hợp cuối kỳ sẽ mất giá trị tham chiếu.

**Trục thứ hai — nguồn gốc phát sinh**, khai báo tại trường **Loại nhiệm vụ**. Trường này bắt buộc nhập, gồm hai giá trị:

- **Phát sinh từ khách hàng** — thay đổi hoặc bổ sung yêu cầu từ phía khách hàng;
- **Lỗi từ nhân viên** — sai sót trong quá trình thực hiện nội bộ. Trường hợp này bắt buộc khai báo thêm **Khối gây lỗi**: CRM, Xưởng, hoặc Lắp đặt.

Bảng đối chiếu hai trường hợp điển hình:

| Nội dung phát sinh | Loại phát sinh | Nhóm chi phí | Loại nhiệm vụ | Khối gây lỗi |
|---|---|---|---|---|
| Khách hàng yêu cầu thay đổi vật liệu cánh tủ | Kính cường lực | Có phí | Phát sinh từ khách hàng | — |
| Gia công sai kích thước, phải thực hiện lại | Làm lại chi tiết sai | Không phí | Lỗi từ nhân viên | Xưởng |

### 2.2. Cơ chế xác định hạn hoàn thành

Hạn hoàn thành của việc phát sinh được hệ thống xác định tự động tại thời điểm khởi tạo, căn cứ vào quy tắc cam kết dịch vụ của loại phát sinh. Phép tính áp dụng lịch làm việc của xưởng và tự động loại trừ ngày nghỉ cuối tuần cùng ngày lễ.

| Quy tắc | Nội dung | Phạm vi áp dụng điển hình |
|---|---|---|
| **Trong ngày** | Hoàn thành trước giờ kết thúc làm việc của ngày khởi tạo. Trường hợp khởi tạo sau giờ kết thúc làm việc, hạn chuyển sang ngày làm việc kế tiếp | Công việc hoàn thiện ngắn |
| **Mốc giờ, chuyển ngày làm việc sau** | Khởi tạo trước mốc giờ quy định (mặc định 12 giờ 00) thì hoàn thành trong ngày; khởi tạo sau mốc giờ thì chuyển sang ngày làm việc kế tiếp | Công việc cần gom theo lô |
| **Cộng N ngày làm việc** | Hạn bằng ngày khởi tạo cộng thêm N ngày làm việc | Đặt gia công bên ngoài |

*Ví dụ áp dụng:* việc phát sinh khởi tạo lúc 14 giờ 30 ngày thứ Năm, loại phát sinh khai báo quy tắc cộng ba ngày làm việc. Hạn hoàn thành được xác định là thứ Ba tuần kế tiếp, do phép tính loại trừ thứ Bảy và Chủ nhật.

### 2.3. Căn cứ tách hai nhóm chi phí

| Tiêu chí | Nhóm Không phí | Nhóm Có phí |
|---|---|---|
| Bản chất | Chi phí do doanh nghiệp tự chịu | Chi phí tính cho khách hàng |
| Chỉ tiêu phản ánh | Chất lượng quy trình nội bộ | Doanh thu bổ sung |
| Ý nghĩa khi số lượng tăng | Quy trình tồn tại lỗ hổng | Khách hàng phát sinh nhu cầu bổ sung |

Việc hợp nhất hai nhóm làm mất ý nghĩa tham chiếu của cả hai chỉ tiêu.

## 3. Nguồn lực

### 3.1. Khai báo danh mục loại phát sinh

Danh mục loại phát sinh phải được khai báo trước khi người dùng khởi tạo việc phát sinh. Thao tác khai báo thuộc thẩm quyền quản trị, thực hiện tại `/management/shared-workspace-settings` theo đường dẫn menu *Setup phát sinh*.

Mỗi loại phát sinh gồm các thuộc tính sau:

| Thuộc tính | Nội dung |
|---|---|
| Tên loại | Tên gọi nghiệp vụ của loại phát sinh |
| Quy tắc hạn | Một trong ba quy tắc nêu tại mục 2.2 |
| Số ngày hoặc mốc giờ | Tham số bổ sung, hiển thị tương ứng với quy tắc đã chọn |
| Phân nhóm chi phí | Có phí hoặc Không phí |
| Nhân sự phụ trách | Người mặc định tiếp nhận loại việc này |

Danh mục được khai báo riêng theo từng công ty. Công ty chưa khai báo loại phát sinh nào sẽ hiển thị danh sách rỗng tại nhóm tương ứng.

### 3.2. Điều kiện đối với người sử dụng

- Có quyền truy cập module Sản xuất;
- Dự án hoặc cơ hội bán hàng đã tồn tại trong hệ thống để gắn việc phát sinh;
- Đã xác định nhân sự chịu trách nhiệm trước khi khởi tạo.

## 4. Vận hành

### 4.1. Quy trình khởi tạo việc phát sinh

Truy cập `/sx/phat-sinh` theo đường dẫn menu *Sản xuất → 1. Tổng quan → Quản lý phát sinh*.

**Bước 1.** Chọn chức năng **Tạo phát sinh**.

**Bước 2.** Chọn dự án hoặc cơ hội bán hàng. Trường này bắt buộc. Việc phát sinh được gắn vào không gian chung của dự án đã chọn và hiển thị với toàn bộ thành viên tham gia dự án.

**Bước 3.** Khai báo các trường thông tin:

| Trường | Tính chất | Nội dung |
|---|---|---|
| Loại phát sinh | Bắt buộc | Lựa chọn từ danh mục đã khai báo. Quyết định hạn hoàn thành và nhóm chi phí |
| Loại nhiệm vụ | Bắt buộc | Phát sinh từ khách hàng, hoặc Lỗi từ nhân viên |
| Khối gây lỗi | Bắt buộc có điều kiện | Chỉ hiển thị khi Loại nhiệm vụ là «Lỗi từ nhân viên» |
| Người chịu trách nhiệm | Bắt buộc | Một cá nhân duy nhất |
| Người thực hiện | Bắt buộc | Tối thiểu một cá nhân, có thể gán vai trò cho từng người |
| Tiêu đề | Bắt buộc | Mô tả ngắn gọn nội dung công việc |
| Mô tả | Không bắt buộc | Nội dung chi tiết, kèm hình ảnh hiện trạng nếu có |

**Bước 4.** Lưu bản ghi. Hạn hoàn thành được hệ thống xác định tự động, không yêu cầu nhập thủ công.

**Phân biệt hai vai trò:** người chịu trách nhiệm là một cá nhân duy nhất, chịu trách nhiệm giải trình khi công việc chậm tiến độ. Người thực hiện có thể gồm nhiều cá nhân. Hệ thống quy định bắt buộc trường người chịu trách nhiệm nhằm bảo đảm tính xác định của trách nhiệm.

### 4.2. Khởi tạo nhanh trong khung bình luận

Hệ thống hỗ trợ khởi tạo việc phát sinh trực tiếp trong khung bình luận của cơ hội bán hàng, phục vụ các trường hợp cần ghi nhận tức thời.

Thao tác: nhập ký tự `/` trong khung bình luận để mở biểu mẫu rút gọn, khai báo tiêu đề, hạn, khối xử lý, nguồn phát sinh và nhân sự, sau đó gửi.

Biểu mẫu rút gọn sử dụng cùng luồng xử lý với biểu mẫu đầy đủ: gửi thông báo tới từng người tiếp nhận, tự động đăng bình luận gắn thẻ nhân sự liên quan, và đồng bộ sang danh sách nhiệm vụ.

### 4.3. Quy trình theo dõi định kỳ

1. Rà soát nhóm **Không phí**, xử lý các việc quá hạn và thông báo nhắc nhở người chịu trách nhiệm;
2. Rà soát nhóm **Có phí**, xác định các việc đã hoàn thành nhưng chưa ghi nhận chi phí;
3. Cập nhật trạng thái hoàn thành đối với các việc đã xử lý xong.

## 5. Báo cáo và sửa chữa

### 5.1. Báo cáo phát sinh

Báo cáo được truy cập tại `/management/shared-workspace-report` theo đường dẫn menu *2. Làm việc → Báo cáo phát sinh*.

Báo cáo tổng hợp dữ liệu của cả hai nhóm chi phí, hỗ trợ lọc theo module, khoảng thời gian, công ty và nhân sự. Các chỉ tiêu bao gồm: tổng số việc, số việc chưa thực hiện, đang thực hiện, đã hoàn thành, đã huỷ, số việc quá hạn, và phân tách theo nguồn gốc phát sinh.

Báo cáo hỗ trợ xuất tệp Excel phục vụ công tác họp và đối chiếu với bộ phận kế toán.

### 5.2. Hướng dẫn phân tích số liệu

| Dấu hiệu trên báo cáo | Nhận định | Hành động đề xuất |
|---|---|---|
| Tỷ lệ lỗi nhân viên tập trung tại một khối | Quy trình của khối đó tồn tại lỗ hổng | Rà soát khâu bàn giao đầu vào của khối |
| Một loại phát sinh lặp lại với tần suất cao | Nội dung công việc đã mang tính thường xuyên | Bổ sung nội dung này vào bộ mẫu nhiệm vụ |
| Nhiều việc nhóm Có phí đã hoàn thành nhưng chưa ghi nhận chi phí | Tồn tại rủi ro thất thoát doanh thu | Ghi nhận chi phí và đối chiếu với bộ phận kế toán |
| Nhiều việc quá hạn cùng thuộc một loại | Cam kết dịch vụ của loại đó không phù hợp thực tế, hoặc thiếu nguồn lực | Rà soát tham số thời gian tại trang khai báo danh mục |

### 5.3. Xử lý sai sót trong quá trình nhập liệu

| Trường hợp | Biện pháp xử lý |
|---|---|
| Chọn sai loại phát sinh, bản ghi thuộc sai nhóm chi phí | Mở bản ghi và điều chỉnh loại phát sinh. Bản ghi tự động chuyển nhóm. **Hạn hoàn thành được tính lại theo quy tắc của loại mới, cần kiểm tra lại hạn sau khi điều chỉnh** |
| Khai báo sai nguồn gốc phát sinh | Mở bản ghi và điều chỉnh trường Loại nhiệm vụ. Việc không điều chỉnh dẫn tới sai lệch số liệu chất lượng của khối liên quan |
| Khởi tạo trùng lặp cho cùng một nội dung | Huỷ bản ghi thừa, ghi nhận lý do tại mục bình luận. Không sử dụng thao tác xoá, nhằm bảo toàn dấu vết dữ liệu |
| Loại phát sinh cần sử dụng chưa có trong danh mục | Đề nghị bộ phận quản trị bổ sung danh mục. **Không lựa chọn loại phát sinh gần tương đương để thay thế**, do thao tác này làm sai lệch số liệu tổng hợp của toàn kỳ |
| Gán sai nhân sự | Mở bản ghi và điều chỉnh người chịu trách nhiệm cùng người thực hiện. Hệ thống tự động gửi thông báo tới nhân sự mới |

### 5.4. Nội dung trọng tâm

1. Mọi việc phát sinh đều phải được ghi nhận, bao gồm cả phát sinh không thu phí.
2. Loại phát sinh quyết định đồng thời nhóm chi phí và hạn hoàn thành. Cần lựa chọn chính xác tại thời điểm khởi tạo.
3. Người chịu trách nhiệm là một cá nhân duy nhất.
