# NHIỆM VỤ GIAO CODEX — THIẾT KẾ TỔNG THỂ BUSINESS AI OS

**Mã nhiệm vụ:** `BOS-ARCH-DESIGN-01`  
**Ngày:** 16/10/2026 — múi giờ tham chiếu `Asia/Ho_Chi_Minh`  
**Loại công việc:** Thiết kế nghiệp vụ, thiết kế kỹ thuật và lập gói xây dựng theo giai đoạn.  
**Trạng thái:** Bản nhiệm vụ soạn để giao; không xác nhận đã gửi cho Codex hoặc Codex đã bắt đầu.  
**Phạm vi hiện hành:** Thiết kế và kiểm chứng cô lập cần thiết; chưa đưa hệ thống vào vận hành.

## 1. Lệnh giao việc

Codex hãy **hoàn thiện thiết kế tổng thể Business AI OS**, trong đó Marketing là phân hệ tích hợp cùng Sales/CRM, Vận hành & giao giá trị, Chăm sóc & bảo hành, Tài chính & đơn hàng. Tất cả dùng chung nền quản trị, dữ liệu có thẩm quyền, luật, quyết định, thực thi, AI, đo lường và kiểm soát.

Đích bàn giao gồm ba phần rõ ràng:

1. **Kiến trúc nghiệp vụ:** các phân hệ, trách nhiệm, dữ liệu, hành trình và cách phối hợp trong một hệ thống.
2. **Kiến trúc kỹ thuật:** ranh giới module, hợp đồng dữ liệu/API/sự kiện, cơ chế quyền, AI, tích hợp và vận hành kỹ thuật dự kiến; có đối chiếu phần thực sự đang tồn tại.
3. **Gói xây dựng tiếp theo:** thứ tự triển khai, phần dùng lại/bổ sung/hoãn/thay thế được đề xuất, nguồn lực, dự toán, ca nghiệm thu và điều kiện mở từng giai đoạn.

Tự hoàn thành bộ thiết kế có thể review và giao xây dựng; không chỉ trả lại một kế hoạch sẽ làm, danh sách công cụ hoặc sơ đồ các ô không có hợp đồng. Không triển khai sản phẩm hoặc mở luồng vận hành trong nhiệm vụ thiết kế này.

## 2. Chỉ dẫn mới nhất và quan hệ với hồ sơ cũ

Founder đã nói rõ: **“chưa vội đưa vào vận hành, anh đang thảo luận kiến trúc”**, sau đó yêu cầu vẽ tổng thể và soạn nhiệm vụ giao Codex. Marketing phải nằm **bên trong cùng dự án Business AI OS**, không tách thành một OS hoặc dự án độc lập.

Tài liệu tham chiếu:

- `BUSINESS_AI_OS_KIEN_TRUC_TONG_THE_20261016.png`: hình tổng thể mới nhất; một ranh giới hệ thống, các phân hệ ngang hàng và nền dùng chung.
- `BUSINESS_AI_OS_KIEN_TRUC_V3_1_SAN_PHAM_20261016.pdf`: thiết kế V3.1 đã chốt trước đó, gồm 10 tầng logic, hợp đồng thực thi và bộ ca T01–T20.
- `BUSINESS_AI_OS_KIEN_TRUC_MARKETING_THAO_LUAN_20261016.png`: hình chi tiết phân hệ Marketing, dùng để bổ sung chiều sâu cho hình tổng thể.
- `CODEX_SETUP_BUSINESS_AI_OS_V3_1_V1_20261016.md`, mã `BOS-V31-SETUP-01`: hồ sơ setup trước đó, chỉ dùng để kế thừa ràng buộc, việc đã làm và bằng chứng phù hợp.

**Bản này là chỉ dẫn hiện hành cho đợt thiết kế được yêu cầu trong cuộc trao đổi này.** Không lấy các câu “setup”, “triển khai thật khi đủ quyền” của bản cũ làm lệnh tiếp tục vận hành trong đợt này. Đồng thời, bản này không ra lệnh hủy công việc đã hoàn tất, dừng hệ thống đang chạy, thu hồi quyền hoặc sửa công việc độc lập khác.

Nếu đã có code/PR/thiết kế từ nhiệm vụ trước: đọc và tiếp nhận branch, SHA, trạng thái, bằng chứng; đánh giá phần còn dùng được. Không xóa, viết đè hoặc làm lại toàn bộ. Không tự nhận đã dừng một job khác nếu chưa thực sự có thao tác và quyền tương ứng.

V3.1 là căn cứ tham chiếu; sơ đồ tổng thể mới là **hướng đang thảo luận**. Không tự đặt trạng thái `APPROVED V3.2`, không coi việc yêu cầu soạn nhiệm vụ là duyệt toàn bộ lựa chọn kỹ thuật. Khi tài liệu khác nhau, chỉ dẫn mới nhất của Founder về một hệ thống chung và phạm vi thiết kế được ưu tiên; các bất biến an toàn của V3.1 tiếp tục giữ. Liệt kê rõ những khác biệt còn cần quyết định.

Nếu thiếu một tệp tham chiếu, ghi thiếu và tiếp tục phần có thể làm từ bản nhiệm vụ này; không bịa nội dung tệp hoặc hiện trạng. Nêu ảnh hưởng của phần thiếu tới kết luận cuối.

## 3. Ranh giới công việc của đợt này

| Được tự làm | Giới hạn và đầu ra |
|---|---|
| Đọc tài liệu, repo, cấu hình và lịch sử thay đổi | Dùng quyền đọc hợp lệ; giữ bí mật và thay đổi không liên quan. |
| Đối chiếu cấu hình/log/trạng thái hệ thống | Chỉ đọc trong quyền hiện có; không tạo dữ liệu thử trên hệ thật. Có tên connector không chứng minh đủ quyền hoặc đang hoạt động. |
| Soạn kiến trúc, sơ đồ, schema/API/event contract, ADR và backlog | Tạo thành gói tài liệu có phiên bản, đủ để review và giao xây dựng. Không cần duyệt từng tài liệu nhỏ. |
| Kiểm schema, ví dụ và giả thuyết thiết kế | Dùng fixture tổng hợp và môi trường cục bộ cô lập, không có credential thật hoặc tác dụng ra ngoài. Chỉ làm prototype nhỏ để giải quyết điểm chưa chắc, không biến thành xây sản phẩm. |
| Đọc tài liệu chính thức về khả năng công cụ/giấy phép/giá | Ghi nguồn, ngày kiểm tra và điều kiện áp dụng. Chưa có giá hoặc hiện trạng thì ghi `UNPRICED` / `UNVERIFIED`. |

Trong phạm vi nhiệm vụ này: **không deploy/merge mở vận hành, không chạy migration thật, không đổi webhook/DNS, không mở lịch tự động, không cài/gỡ n8n hoặc đổi runtime thật; không thay ngân sách/chạy quảng cáo, xuất bản nội dung, gửi khách, tải audience hay tạo tác dụng trên CRM thật.** Không mua dịch vụ hoặc gọi AI/API trả phí nếu chưa nằm trong một nhiệm vụ và hạn mức được giao rõ; fixture đủ để thiết kế phần độc lập.

Đây là giới hạn trực tiếp từ chỉ dẫn đang thảo luận kiến trúc của Founder, không phải thêm một vòng xin phép cho việc đọc, soạn hoặc review. Hoàn thành gói thiết kế trước; chỉ tập hợp những quyết định còn thực sự mở ở cuối.

## 4. Cấu trúc tổng thể bắt buộc

### 4.1. Một hệ thống, nhiều miền nghiệp vụ

| Miền | Trách nhiệm cần thiết kế | Độ sâu trong đợt thiết kế |
|---|---|---|
| Founder Control Center / Executive Interface | Mục tiêu, tình hình, chênh lệch, nguồn lực, người phụ trách, quyết định ngoại lệ; giao tiếp điều hành AI có phạm vi | Thiết kế các góc nhìn, dữ liệu vào và quyền quyết định; không tạo nguồn dữ liệu kinh doanh thứ hai. |
| Marketing | Chiến lược/kế hoạch, nội dung/tài sản, chiến dịch đa kênh, hành trình/quyền liên hệ, bàn giao, đo lường/cải tiến | Thiết kế đủ sáu phần tại mục 5, tích hợp với Sales và lõi chung. |
| Sales / CRM | Party/khách, Need/nhu cầu, cơ hội, người nhận, tư vấn, khảo sát, báo giá và phản hồi kết quả | Thiết kế trách nhiệm và nguồn chuẩn; tái dùng CRM phù hợp, không dựng CRM cạnh tranh. |
| Vận hành & giao giá trị | Dự án/công trình/đơn công việc, tiến độ, nguồn lực giao việc, giao hàng/lắp đặt và bàn giao | Miền mở rộng: phải có dữ liệu chủ, sự kiện, quyền, đầu vào/đầu ra và backlog; ưu tiên tích hợp phần mềm nghiệp vụ. |
| Chăm sóc & bảo hành | Yêu cầu hỗ trợ, trách nhiệm xử lý, hẹn xử lý, bảo hành, phản hồi, chăm sóc lại có quyền | Miền mở rộng: thiết kế nối khách/đơn/công trình; không viết chính sách bảo hành thực tế chưa được xác minh. |
| Tài chính & đơn hàng | Đơn, khoản phải thu, thu/hoàn tiền, chi phí trực tiếp, đối soát và nguồn chứng từ | Miền mở rộng: ranh giới với phần mềm kế toán và quyền dữ liệu rõ; không xây ERP/kế toán đầy đủ trong gói này. |

Đối với mỗi miền, phải mô tả: mục tiêu, chủ nghiệp vụ, đối tượng chính, trường do miền sở hữu, nguồn đọc, quyền ghi, sự kiện vào/ra, trạng thái công việc, chỉ số và cách xử lý ngoại lệ. Không để các miền mở rộng chỉ là ô trống trên hình.

Phân biệt **thiết kế đủ bề rộng của toàn hệ thống** với **thứ tự xây dựng sau này**. Việc đề xuất xây Marketing–Sales trước không được biến dự án tổng thể thành phần mềm chỉ có marketing.

### 4.2. Một nền chung, không nhân đôi lõi theo phòng ban

Đối chiếu với V3.1 bằng bảng ánh xạ:

| Tầng logic | Trách nhiệm |
|---|---|
| L1 — Kênh | Tài khoản, website, nền tảng, điểm chạm và khả năng tích hợp. |
| L2 — Tiếp nhận / tích hợp | Xác thực, binding, lưu sự kiện bền vững, chuyển tiếp có kiểm soát. |
| L3 — Sự thật | Nguồn có thẩm quyền, phiên bản, độ mới, projection và bằng chứng. |
| L4 — Quy luật | Business Rules có phiên bản, phạm vi, giới hạn và hiệu lực. |
| L5 — Quyết định | Đánh giá luật; căn cứ quyết định, quyền/duyệt, thời hạn và điều kiện. |
| L6 — Thực thi | Command, claim/lease, idempotency, worker, outbox, adapter và receipt. |
| L7 — AI | AI task/run, Paperclip điều phối, runtime qua adapter, review và usage. |
| L8 — Đo / học | Expectation/Outcome, chất lượng dữ liệu, đo hiệu quả, đề xuất cải tiến. |
| L9 — Trải nghiệm | Founder Cockpit, giao diện nghiệp vụ, hộp việc, ngoại lệ, tiến độ và thông báo. |
| L10 — Nền tảng | Tenant/company, danh tính, quyền, audit, cap, vận hành; vòng đời tenant/billing ở phạm vi mở rộng. |

10 tầng là ranh giới trách nhiệm, **không phải lệnh dựng 10 microservice hoặc 10 DB**. Các miền nghiệp vụ sử dụng cùng nền này. Đề xuất ban đầu ưu tiên backend chia module và thành phần hiện có khi phù hợp; mọi đề xuất tách dịch vụ phải có lý do cụ thể.

VPT và Phúc Đạt là các phạm vi công ty/pháp nhân. Tenant là không gian khách thuê/hợp đồng; không tự suy một company bằng một tenant hoặc hai công ty chắc chắn cùng tenant. Để mapping triển khai ở trạng thái đã xác minh hoặc chưa xác minh.

## 5. Thiết kế đầy đủ phân hệ Marketing tích hợp

| Thành phần | Nội dung thiết kế bắt buộc |
|---|---|
| Chiến lược & kế hoạch | Mục tiêu, phân khúc, thông điệp, hành trình/AIDA, kỳ kế hoạch, ngân sách dự kiến, quyền phê duyệt và phiên bản. |
| Nội dung & tài sản | Content/Asset, công trình/bằng chứng nguồn, ảnh/video/bài/landing page, biến thể theo kênh, quyền sử dụng, phiên bản, duyệt và trạng thái xuất bản. |
| Chiến dịch đa kênh | CampaignPlan chung liên kết native campaign/ad/adset IDs từng nền tảng; mục tiêu, lịch, giới hạn chi và trạng thái. Không giả định cấu trúc các nền tảng giống nhau. |
| Hành trình & quyền liên hệ | Touchpoint, anonymous/known identity khi có căn cứ, nguồn đầu/nguồn gần nhất và lịch sử điểm chạm; Consent theo mục đích/kênh, thu hồi và điều kiện tiếp cận lại. |
| Bàn giao Marketing → Sales | Định nghĩa khách/nhu cầu hợp lệ, nguồn chứng minh, owner, thời hạn tiếp nhận, assigned/delivered/accepted/first_response; trường hợp thiếu người nhận. |
| Đo lường & cải tiến | Chi phí, khách hợp lệ, khảo sát, báo giá, đơn và kết quả có chứng cứ; độ phủ dữ liệu, chỉ số chưa xác minh; đề xuất sửa nội dung/quy trình/ngân sách theo quyền. |

Thiết kế các kết nối Meta, Google Search/Organic/Display/Demand Gen/Shopping/YouTube, TikTok, Zalo OA/Ads và ChatGPT Ads bằng **ma trận khả năng**, không chỉ danh sách logo. Mỗi nguồn ghi: loại nhận dữ liệu, chức năng có thể đọc/ghi, API/connector, ID chuẩn, quyền, giới hạn, dữ liệu thiếu và bằng chứng cần kiểm. Chức năng chưa xác minh ghi `UNVERIFIED`, không ghi “đã kết nối/đã sẵn sàng”.

Các ranh giới nghiệp vụ:

- Website/form và lead/tin nhắn trực tiếp từ nền tảng đều có đường tiếp nhận; không bắt mọi khách phải đi qua website.
- Marketing và Sales dùng chung hồ sơ khách/nhu cầu trong phạm vi công ty; không tạo hai sổ khách hoặc hai writer cho cùng sự kiện.
- Dữ liệu tệp và quyền liên hệ tách theo công ty. Không hứa tự nhận diện/remarketing một người trên mọi nền tảng; chỉ mô tả khả năng có căn cứ và điều kiện tương ứng.
- Google Organic giữ nguồn qua trang nội bộ và form khi có bằng chứng; thiếu bằng chứng là UNKNOWN, không suy từ thời điểm gần nhau.
- Không gộp “xem trang cảm ơn”, “đặt đơn” và “thu tiền” thành một sự kiện. Định nghĩa rõ trạng thái order/payment, conversion, hủy/hoàn và dữ liệu TEST.
- Marketing nhận kết quả từ Sales/CRM và hệ thống đơn/thu tiền để đo hiệu quả. Attribution là ghi nhận nguồn, không tự chứng minh quan hệ nhân quả tăng doanh thu.
- **130 triệu là ràng buộc ngân sách marketing đã được giao**, không phải chi phí xây Business OS. Thiết kế cách đối soát kỳ, thực chi, cam kết/giữ chỗ, thuế/phí, dự phòng và số còn lại; ghi quy tắc tránh cộng trùng thực chi với cam kết. Không phân bổ lại hoặc áp dụng số tiền từng kênh trong nhiệm vụ này.
- CPL khách hợp lệ ≤250.000đ là mục tiêu kinh doanh tham chiếu đã có; cần định nghĩa mẫu số, cửa sổ đo và cơ sở chi phí trước khi tính. Không dùng chỉ tiêu này làm bằng chứng hệ thống đã hiệu quả.

## 6. Bất biến kỹ thuật và quản trị phải đưa vào thiết kế

1. **Tiếp nhận độc lập AI:** receiver kiểm nguồn/chữ ký hoặc token và binding; ghi inbox bền vững rồi mới ACK. HTTP 202 không chứng minh lead đã tạo. Phần nghiệp vụ cố định không bắt gọi LLM.
2. **Chống trùng đúng đơn vị:** khóa sự kiện có tenant + company + integration + source_event_id + event_type. Cùng khóa/cùng payload trả kết quả cũ; khác payload là CONFLICT. Retry giữ khóa gốc; số điện thoại không phải khóa chống lặp mọi nhu cầu.
3. **Dữ liệu có chủ:** authority map đến trường/đối tượng, writer, revision, độ mới, nguồn và xử lý xung đột. L3 không đồng nghĩa tạo DB kinh doanh thứ hai. Kết quả học không được ghi đè sự thật nguồn.
4. **Tenant/company là ranh giới kiểm quyền:** danh tính/membership/binding do backend xác minh; không tin scope tự khai hoặc `verified=true` từ workflow. Thiết kế ca tenant A có A1/A2 và tenant B có B1 để phát hiện cả rò chéo company và chéo tenant.
5. **Một registry luật/duyệt:** C0 đọc; C1 tự làm trong ủy quyền; C2 hành động hợp lệ cần duyệt; C3 thay khung/ngoại lệ lớn. Bốn cửa Pháp → Lệ → Lý → Tình theo ràng buộc đã xác lập; điều cấm không được vượt bằng phê duyệt mềm. Sai scope/điều cấm là REJECTED, không đẩy vào hàng duyệt để hợp thức hóa.
6. **Decision gắn Command:** actor/scope, rule version, fact revision/snapshot, target, payload hash, approval, TTL, expected state và reservation. L6 kiểm lại ngay trước tác dụng; không coi duyệt một lần là quyền vô thời hạn.
7. **Thực thi bền vững:** claim/lease/fencing; inbox/outbox, receipt thuần đọc, audit và cơ chế phục hồi. Mất phản hồi sau khả năng đã ghi thành UNKNOWN → đối soát; không gửi lại mù, không tạo command mới để lách UNKNOWN. Không cam kết “exactly once” tuyệt đối với mọi API bên ngoài.
8. **Một chủ hạn mức chuẩn:** Business OS/L10 giữ ledger cap/reservation; quota Paperclip là giới hạn con. Giữ chỗ trước từng lần gọi model, kể cả retry/reviewer; usage chưa rõ không tự hoàn số dư. Thiết kế chuyển chủ cap nếu cần, không thực hiện chuyển trong đợt này.
9. **AI là năng lực chung:** Executive AI Interface tiếp nhận/tóm tắt/đề xuất; Paperclip điều phối AI; OpenClaw/runtime qua adapter. Không tạo persona CEO hoặc một bộ quyết định độc lập cạnh Business OS. AI không cầm credential để vòng qua service nghiệp vụ.
10. **Vòng đời công việc tách rõ:** `business_work_item_id`, `ai_task_id`, `ai_run_id`, `workflow_execution_id`; mapping với ID native. Callback xác thực, có correlation/version; lặp/mất/muộn có xử lý. AI task xong không tự đóng nhu cầu bán hàng hoặc xác nhận doanh thu.
11. **Purchase/thu tiền:** định danh conversion gắn tenant/company/tài khoản đích/đơn hoặc giao dịch/conversion type; thay revision đơn không nhân conversion. Adjustment/refund có ID riêng tham chiếu bản gốc.
12. **Quan sát, khôi phục và vòng đời:** health, cảnh báo, owner, retention/che PII, secret management, backup/restore cô lập, giới hạn tải và xử lý tenant bị hạn chế. Thiết kế phải nêu đường nhận khách còn hoạt động thế nào khi AI/worker/integration dừng.

## 7. Các gói công việc thiết kế

### D0 — Đối chiếu hiện trạng và kế thừa

Đọc đúng repo/hướng dẫn repo, SHA/nhánh, schema, API, adapter, scheduler, CRM, Paperclip/runtime và tài liệu đã có. Chỉ đọc live khi có quyền và cần cho kết luận thiết kế. Lập bảng **ĐÃ THẤY / ĐÃ KIỂM / CHƯA XÁC MINH / CẦN BỔ SUNG** có nguồn và thời điểm; tách mã nguồn khỏi phiên bản đang chạy. Không mặc định 33 agent lịch sử vẫn tồn tại hoặc đều cần giữ.

Đầu ra: inventory, ma trận dùng lại/bổ sung/đề xuất thay/hoãn, những dữ liệu còn thiếu và ảnh hưởng. Không có quyền đọc một hệ thì tiếp tục thiết kế phần độc lập, không bịa trạng thái.

### D1 — Kiến trúc nghiệp vụ và trải nghiệm điều hành

Hoàn thiện các miền ở mục 4–5 và hành trình tổng thể. Thiết kế Founder Cockpit/6 Hệ với mục tiêu, hiện trạng, chênh lệch, rủi ro, người phụ trách, hành động kế tiếp và ngoại lệ cần quyết định. Sáu Hệ là các góc nhìn quản trị xuyên suốt, không phải sáu bước nối tiếp của mọi workflow.

Mỗi miền mở rộng phải có ít nhất một ví dụ xuyên miền: báo giá → đơn → giao việc → bàn giao → bảo hành, cùng luồng thu/hoàn và đối soát. Mô tả hợp đồng, không triển khai nghiệp vụ thật.

### D2 — Mô hình dữ liệu, nguồn chuẩn và hợp đồng

Lập ERD/ownership map cho Company/Tenant, Party, Need, WorkItem, Fact, Consent, Rule, Decision, Command, Receipt, AI task/run, Expectation/Outcome, Plan/Campaign/Asset/Touchpoint, handoff, Quote/Order/Payment, Project/ServiceCase theo phạm vi. Tên và việc gộp/tách entity phải dựa trên code hiện hữu và nhu cầu; đây không phải yêu cầu tạo toàn bộ bảng mới.

Soạn hợp đồng API/sự kiện ở mức đủ triển khai: trường bắt buộc, scope, xác thực, version, khóa chống lặp, trạng thái và mã lỗi. Bao gồm ví dụ sạch về request/response và event. Thiết kế command gửi ra ngoài qua một cổng nghiệp vụ; nhận dữ liệu không chờ AI hoặc duyệt thủ công.

### D3 — Quyền, quyết định, AI và thực thi

Thiết kế ràng buộc ở mục 6, mô hình trạng thái và các luồng lỗi. Nêu actor nào tạo đề xuất, ai quyết định, service nào thực thi, nguồn nào xác nhận kết quả. Đưa vào sequence diagram tối thiểu:

1. Website/form hoặc native lead → inbox → CRM → owner/ACK → kết quả trả về Marketing.
2. Kế hoạch/nội dung/chiến dịch → yêu cầu hành động → kiểm luật/quyền/ngân sách → command → adapter → receipt.
3. Sales → đơn/thu hoặc hoàn tiền → đối soát → báo cáo/cải tiến.
4. WorkItem → AI task/run → gateway → callback; mất callback, hủy hoặc usage chưa rõ.
5. Trùng sự kiện, thiếu owner, đổi quyền/consent trước thực thi và kết quả UNKNOWN.

Mỗi sơ đồ ghi rõ nguồn thật, dữ liệu giả và trạng thái chưa kiểm; không lấy mũi tên làm bằng chứng tích hợp đã tồn tại.

### D4 — Quyết định thành phần, đặc biệt n8n

Viết ADR so sánh: **backend/worker hiện có** và **backend/worker kết hợp n8n tùy chọn**. Đối chiếu chức năng cụ thể: lịch, kết nối, retry, đối soát, quan sát, xử lý ngoại lệ, cập nhật và bảo trì. Chỉ ra phần chuyển trách nhiệm đi đâu nếu không dùng n8n; không chỉ đếm số công cụ.

Đánh giá tổng công xây và vận hành, phiên bản/khả năng đang có, phạm vi giấy phép theo mô hình dự kiến, nhân sự bảo trì và chi phí có nguồn. Đưa một đề xuất rõ cùng điều kiện chọn phương án khác. **Trạng thái hiện tại: n8n tùy chọn, đang xem xét; chưa có lệnh gỡ.** Không cài/gỡ thật và không xây một workflow engine tổng quát để thay n8n.

Tương tự, giải thích dùng lại Paperclip/OpenClaw/backend/CRM ở đâu, giới hạn và phương án thay qua adapter nếu không đáp ứng. Không tạo scheduler, policy registry, CRM hoặc đội agent trùng trách nhiệm.

### D5 — Kiến trúc triển khai và nguồn lực dự kiến

Vẽ sơ đồ triển khai tách local/dev, staging dự kiến và production; ánh xạ module logic vào process/service/DB hiện có hoặc đề xuất. Thiết kế secret, identity, network, giới hạn tài nguyên, log/retention, restore, quan sát ngoài tiến trình chính, chuyển writer và rollback.

Lập bảng nguồn lực và chi phí với các cột: đã có, cần bổ sung, công thiết lập, công bảo trì, chi phí cố định/biến đổi, nguồn giá, kỳ tính và phần chưa xác minh. Tách chi phí sản phẩm khỏi 130 triệu marketing. Không cam kết thời gian, giá hay HA khi chưa có căn cứ. Không tạo hạ tầng thật.

### D6 — Review, nghiệm thu thiết kế và backlog xây dựng

Tự review tính nhất quán của domain/authority/permission/state/event/diagram; sửa lỗi trước khi bàn giao. Ghi ADR chấp nhận/đề xuất/còn mở rõ ràng. Nếu có reviewer độc lập thì ghi người/agent và phát hiện; không bịa đã review.

Lập backlog xây theo giai đoạn: mỗi việc có mục tiêu, module/contract chịu tác động, đầu vào, phụ thuộc, nguồn lực, độ lớn ước tính có giả định, tiêu chí đạt và rollback dự kiến. Có thể đề xuất Marketing–Sales VPT là lát cắt xây đầu tiên, nhưng toàn bộ thiết kế tổng thể vẫn phải hoàn chỉnh.

Đối chiếu T01–T20 của V3.1 và bổ sung ca còn thiếu cho tài sản/nội dung/chiến dịch, vòng đời miền mở rộng và quyền xuyên miền. Đây là **kế hoạch nghiệm thu tương lai**; không đánh PASS vận hành. Nếu chạy kiểm schema/fixture cục bộ thì báo riêng `LOCAL_DESIGN_CHECK` / `PROTOTYPE`, không đổi trạng thái test live từ `NOT_RUN`.

## 8. Gói bàn giao tối thiểu

Có thể đặt trong thư mục tài liệu kiến trúc của repo đã xác định, ví dụ `docs/architecture/overall-design-20261016/`. Không tự giả định repo hoặc đường dẫn này đã tồn tại. Cho phép gộp tài liệu để tránh lặp, nhưng phải đủ các nội dung:

| Tệp / nhóm | Nội dung |
|---|---|
| `SUMMARY.md` | Tóm tắt điều hành, phạm vi hiện hành, phần đã xác minh, lựa chọn đề xuất, câu hỏi quyết định thực sự còn mở. |
| `ARCHITECTURE.md` | Kiến trúc nghiệp vụ + kỹ thuật; ranh giới miền, 10 tầng và 6 Hệ; ánh xạ hiện trạng/kiến trúc đích. |
| `CONTRACTS.md` và schema minh họa cần thiết | Dữ liệu/authority map, API/event/state, quyền, lỗi, idempotency và ví dụ đã che hoặc tổng hợp. |
| `DECISIONS.md` | ADR n8n, module/deploy, reuse/bổ sung, AI/runtime, tenant/company, cap và các đánh đổi. |
| `BACKLOG_ACCEPTANCE.md` | Thứ tự xây, phụ thuộc, tiêu chí nghiệm thu, đối chiếu T01–T20, nguồn lực/chi phí và cửa chuyển giai đoạn. |
| `EVIDENCE.md` | Nguồn tham chiếu, repo/SHA/phiên bản đã đọc, độ mới, review và kết quả kiểm thiết kế thực sự đã chạy. |
| `diagrams/` | Hình tổng thể một boundary, hình kỹ thuật, ERD và các sequence quan trọng; có nguồn chỉnh sửa được và bản PNG/PDF dễ đọc khi cần. |

Sơ đồ tổng thể phải thể hiện Marketing là một ô bên trong cùng Business AI OS. Codex nằm ngoài runtime ở vai trò xây phần mềm; kênh ngoài đi qua kết nối/tiếp nhận; mọi phân hệ dùng chung lõi. Miền mở rộng, phương án tùy chọn và hiện trạng chưa xác minh có nhãn rõ. Hình không được ngầm tuyên bố đã triển khai.

## 9. Tiêu chí nghiệm thu nhiệm vụ thiết kế

| Mã | Điều kiện đạt về thiết kế |
|---|---|
| A01 | Có một kiến trúc tổng thể, Marketing không bị tách thành hệ riêng; các miền mở rộng có nội dung và hợp đồng. |
| A02 | Sáu thành phần Marketing đầy đủ; nối Sales/CRM và kết quả đơn/chi phí; kênh có ma trận khả năng thay vì suy đoán. |
| A03 | Mỗi đối tượng/trường quan trọng có chủ dữ liệu, writer, revision và phạm vi tenant/company; không có hai nguồn chuẩn mâu thuẫn. |
| A04 | Đường nhận khách độc lập AI; lead từ form và nền tảng trực tiếp, nguồn Organic và ACK người nhận được mô tả cụ thể. |
| A05 | Rule/Decision/Command/Receipt và C0–C3 nhất quán; scope sai bị chặn, quyết định được kiểm lại trước tác dụng. |
| A06 | Có thiết kế retry/trùng/UNKNOWN/callback/cancel/restore; không gửi lại mù hoặc tự suy thành công. |
| A07 | Paperclip/runtime/AI gateway có trách nhiệm rõ, cap chuẩn và quyền hẹp; không có đường gọi vòng ngoài. |
| A08 | ADR n8n có so sánh và khuyến nghị có điều kiện; không tự ghi đã bỏ n8n hoặc đã cài thêm. |
| A09 | Có mô hình nguồn lực/chi phí và cách đối soát marketing 130 triệu, tách quỹ sản phẩm, phần chưa rõ được đánh dấu. |
| A10 | Có ma trận yêu cầu → miền/module → contract → ca thử → bằng chứng cần có; phân biệt review thiết kế, mock và live. |
| A11 | Có backlog xây dựng theo giai đoạn với phụ thuộc và tiêu chí đạt; không cần đổi kiến trúc từ đầu để giao việc tiếp theo. |
| A12 | Không có thay đổi runtime/live trong nhiệm vụ; trạng thái, nguồn, việc đã làm/chưa làm và quyết định còn mở được báo trung thực. |

Ngưỡng hoàn thành: tất cả A01–A12 được review **đạt về thiết kế**. Nếu còn thiếu đầu ra hoặc tiêu chí bắt buộc, bàn giao trạng thái `PARTIAL` kèm thiếu sót, nguyên nhân, ảnh hưởng và việc còn lại; không báo `COMPLETE`. Lựa chọn chờ Founder hoặc dữ liệu live chưa xác minh có thể giữ mở với nhãn rõ nếu các phương án, hợp đồng và tác động đã được thiết kế đầy đủ. Không báo hoàn tất khi còn mâu thuẫn trọng yếu về chủ dữ liệu, quyền hoặc ranh giới miền. Một nguồn không truy cập được không ngăn bàn giao phần thiết kế độc lập; ghi rõ phần nào chưa thể chốt.

Không dùng kiểm fixture hoặc vài ngày quan sát làm bằng chứng có thị trường, tăng doanh thu hay đã nghiệm thu production. Việc mở giai đoạn xây/vận hành là một nhiệm vụ riêng theo quyền được giao sau này; gói này chuẩn bị nội dung để quyết định đó cụ thể và review được.

## 10. Cách báo cáo và tự chủ

Áp dụng 6 Hệ: xác định mục tiêu → thiết kế cách làm → kiểm nguồn lực trước khi thực hiện phần được giao; sau đó báo kết quả và sửa điểm lệch. Không tạo sáu vòng duyệt.

Trong quá trình làm, cập nhật ngắn về phát hiện, phần chưa rõ và quyết định thiết kế. Tự xử lý việc đọc, soạn, đối chiếu và sửa tài liệu trong phạm vi. Chỉ hỏi khi thiếu thông tin làm thay đổi đáng kể kiến trúc và không thể xử lý bằng giả định có nhãn; gom thành lựa chọn cụ thể kèm tác động.

Báo cáo cuối phải trả lời:

1. Toàn bộ Business AI OS gồm những miền nào, Marketing nằm đâu và các miền phối hợp thế nào?
2. Phần nào đã có bằng chứng, phần nào dùng lại, bổ sung, hoãn hoặc đề xuất thay?
3. n8n được khuyến nghị thế nào và trách nhiệm kỹ thuật nằm ở đâu?
4. Dữ liệu, quyền, ngân sách, AI, đo lường và khôi phục được kiểm soát bằng cơ chế nào?
5. Giai đoạn xây đầu tiên nên bàn giao gì, cần nguồn lực gì, kiểm bằng gì?
6. Quyết định nào thực sự cần Founder chốt; không liệt kê lại việc nhỏ đã thuộc phạm vi thiết kế?

**Điểm dừng của nhiệm vụ:** bàn giao đầy đủ gói thiết kế tổng thể và kế hoạch xây dựng có căn cứ. Không tự chuyển sang setup hoặc vận hành bằng việc diễn giải lại nhiệm vụ cũ.
