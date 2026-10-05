# Nối mô hình vào trợ lý chăm khách

## Cập nhật 04/10/2026 — Phục hồi ACK của biên nhận

`careOpenAiInference.record` cho phép tối đa hai lần gọi cùng RPC `crm_care_inference_record` khi lỗi kết nối không có mã, mất dữ liệu phản hồi hoặc lỗi SQL tạm thời trong danh sách rõ ràng. Request, capability và receipt được giữ bất biến. Lỗi có mã không được phân loại là tạm thời, từ chối quyền, receipt mâu thuẫn, dữ liệu sai hoặc ACK không khớp đều dừng ngay. Kiểm Primary trước từng lần; không ghi Backup. Không lặp claim, HTTP Responses, BEGIN hoặc FINISH.

Đây là thử lại việc ghi bằng chứng đã có, không gọi lại AI. Nếu lần đầu đã commit và mất ACK, SQL691 trả replay cùng receipt; nếu giao dịch rollback thì lần sau ghi lần đầu. Cả hai vẫn có một reservation. Ghi usage sau abort/thu hồi quyền giữ chi phí lịch sử; không cho phép phát hành câu trả lời vì Application Service/Domain vẫn kiểm quyền và trạng thái khách. UNKNOWN/NOT_SENT giữ nguyên loại bằng chứng và không hoàn reservation.

Phạm vi chỉ khi tiến trình còn giữ biên nhận đã nhận. Hai lần không xác nhận được thì tiếp tục đường lỗi/bàn giao; tiến trình chết trước khi lưu vẫn cần đối soát. Không giải phóng UNKNOWN do provider, không chứng nhận miễn phí, chi phí thực hay hóa đơn. Không tạo journal chứa capability trên ổ đĩa hoặc cấp công cụ sửa receipt thủ công.

Local toàn workflow 1.407 PASS/0 fail/5 skip; 6 unit mới kiểm ACK mất, retry giới hạn, conflict/quyền/ACK sai, Primary mất, abort và giữ UNKNOWN/NOT_SENT. 4 ca PostgreSQL qua runtime worker thật kiểm commit mất ACK/rollback, DB mất kết nối, conflict và thu hồi grant; HTTP provider giả. Không đổi SQL/schema/UI; hoàn tác bằng trả adapter về một lần ghi, giữ toàn bộ receipt/reservation hiện có.

Checkpoint `31aa29f70f2548fa7abc2efa25643e3a1ba611a2`, tree `cdf97594f2fdf29c863bc1e165c807bb35a2af8e`:

- [Automation37199346559](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37199346559): cả 10 job SUCCESS. Node18/22 jobs111427627876/111427627878 mỗi bản **1.412 PASS/0 fail/0 skip**.
- PostgreSQL job111427627810 đạt **502/0/0**, đủ bốn ca mới448–451; xác nhận một receipt/reservation, replay sau commit, lần ghi đầu sau rollback, bàn giao khi mất kết nối kéo dài, giữ UNKNOWN mâu thuẫn và thu hồi grant vẫn chặn FINISH.
- Build job111427627845 thành công với10.339modules/36,09s. Report37199346557 và Messenger37199346554 SUCCESS.
- CI merge `9310e17f3f15a6287a7ac1dbe7bb36f7b5bc8a51` có cùng tree, parents `e16c885ae7c2305645be02a1227bf378cb59137f` + checkpoint. Reviewer độc lập đối chiếu published adapter/unit/PG blobs, log và tree/parents; **PASS checkpoint**, không còn finding chặn. Bản đóng hồ sơ chỉ sửa tài liệu.

Không có browser mới vì không đổi UI. Không suy kiểm thử provider giả thành kiểm tài khoản/model/chi phí thật, phục hồi sau mất tiến trình, UAT hoặc quyền phát hành.

Các phần dưới lưu hợp đồng và bằng chứng của checkpoint SQL691 gốc; cập nhật này thay hành vi một lần ghi receipt, không thay quy tắc một lần gọi provider.

Ngày 04/10/2026. Phạm vi: SQL691 và OpenAI Responses adapter qua Application Service hiện có. Chuẩn bị cho mục tiêu AI tiếp nhận/tư vấn; chưa tự gửi khách, chưa đăng ký quyền runtime, chưa gọi mô hình thật. Kế thừa [SQL689](CARE_ADVISOR_DRAFTS.md) và [màn hình SQL690](CARE_ADVISOR_CONSOLE.md).

## Luồng thực thi

Advisor BEGIN giữ ngữ cảnh và quyền hiện hành → chuẩn bị bí danh/văn bản → SQL691 kiểm lại quyền, công ty, trạng thái khách, nguồn và phiên bản → giữ chỗ một lượt trong hạn mức đã duyệt → một POST Responses → lưu biên nhận sử dụng → SQL689 kiểm lại nguồn/quyền rồi lưu DRAFT/REVIEW/FAILED.

Router nay gắn adapter nhưng mặc định không hoạt động. Bắt buộc đủ VPT_CARE_ADVISOR_ADMIN=1, VPT_CARE_ADVISOR_DRAFTS=1, VPT_CARE_ADVISOR_OPENAI=1, VPT_CARE_ADVISOR_INFERENCE_POLICY UUID và VPT_CARE_ADVISOR_OPENAI_KEY riêng. Không tìm hoặc tái sử dụng OPENAI_API_KEY của bot báo cáo nội bộ. Key chỉ trong môi trường server; DB lưu SHA256 để ghim đúng credential đã duyệt. Thay key/policy khi claim đang chờ chặn POST. Primary mất thì không ghi sang Backup.

Policy private xác định công ty, người thực hiện, model, fingerprint credential, tham chiếu duyệt, kỳ hiệu lực, số lượt tối đa, byte đầu vào, token đầu ra, tiền giữ chỗ mỗi lượt và tổng hạn mức. Migration không tạo policy hoặc quyền thực thi nào. Các vai ứng dụng kể cả service_role không được tự ghi policy. Người triển khai chỉ được cài policy cụ thể trong gói Founder duyệt; không tự chọn các giá trị/model/thời điểm. Ngoài active để thu hồi, nội dung policy bất biến; thay model/caps/window/key cần policy mới có quyết định riêng. Chưa có giao diện cấp policy hoặc tự gia hạn.

Model phải là **ID snapshot chính xác trả về trong response.model**, được xác nhận khi nghiệm thu tài khoản. Alias trả về ID khác bị ghi UNKNOWN và chặn tiếp; không dùng startsWith để nới kiểm tra. Chưa chọn model mặc định, giá hoặc ngưỡng tiền cho VPT.

## Hạn mức và báo cáo chi phí

Hạn mức trong SQL691 là **tiền phân bổ giữ chỗ**, chưa phải hóa đơn của nhà cung cấp. Mỗi lượt đã cấp quyền dùng một suất max_calls và reserve_per_call_vnd; kể cả NOT_SENT cũng giữ nguyên suất để tránh tự hoàn ngân sách khi chưa đối soát. Không tự coi token usage là tiền thực chi hoặc cam kết provider không vượt một mức tiền trên request.

USAGE_RECORDED lưu response ID/model/input/output/total tokens khi khớp hợp đồng; actualCostVnd vẫn NULL. Chi phí tiền thực tế cần giá/model, tỷ giá/phí và hóa đơn đã đối soát. Chưa mở chạy thật nếu gói vận hành chưa xác định các căn cứ này cùng giới hạn ở tài khoản provider. Hạn mức AI riêng với trần quảng cáo 100 triệu; không trừ lẫn hoặc dùng để chứng minh CPQL250k/7% doanh thu.

Một policy chỉ có tối đa một lượt đang gọi. Khóa DB và tổng reservation ngăn nhiều tiến trình vượt số lượt/hạn mức nội bộ. AUTHORIZED chưa rõ kết quả hoặc UNKNOWN khóa các lần tiếp theo trên policy; không tự hết hạn, hoàn tiền, gọi lại hay chuyển policy. Lỗi HTTP, thiếu usage, sai model hoặc số token mâu thuẫn không thành phí0.

RPC crm_care_inference_allowance cho người có quyền hiện hành đọc tổng lượt, reservation, unresolved và số usage receipt đúng công ty/actor; không lộ key hoặc transcript. Chưa nối tổng này vào dashboard AI cost. Đối soát UNKNOWN với nhà cung cấp và công cụ khép biên nhận còn cần bổ sung; không sửa tay thành NOT_SENT để mở khóa.

## Hợp đồng provider và an toàn phục hồi

URL cố định https://api.openai.com/v1/responses, redirect:error; có deadline caller và giới hạn 128KiB response. Permit chỉ dùng trong tối đa5giây, không quá thời hạn policy/advisor. Đây là điểm cấp quyền có thời hạn; hủy sau dispatch không chứng minh provider ngừng hoặc miễn phí. Mỗi request chỉ được claim một lần; replay không cấp lại capability. Không có provider retry.

POST dùng text.format json_schema strict, max_output_tokens theo policy, store:false/background:false; không tools, conversation, previous_response_id, metadata hoặc Agent delegation. Bên ngoài chỉ nhận bí danh và văn bản cần thiết; không nhận định danh CRM/actor, nguồn nội bộ, PSID hoặc URL tệp. Văn bản khách vẫn có thể chứa thông tin cá nhân; gói phát hành phải cho phép đúng dữ liệu gửi provider.

Chỉ đọc một assistant message hoàn tất có một output_text; refusal, incomplete, tool call hoặc nhiều message không trở thành câu trả lời. Usage hợp lệ vẫn được lưu kể cả output không dùng được. Domain giải mã chọn câu trả lời/trích dẫn theo nguồn thật như trước. Ghi usage thất bại không làm gọi lại model; reservation còn chờ đối soát. Receipt có capability private, cho phép ghi chi phí đã phát sinh sau thu hồi actor/policy; quyền này không đọc nội dung, gọi mới hoặc gửi khách. Cặp UNKNOWN chỉ dùng TRANSPORT_UNKNOWN/USAGE_UNAVAILABLE; NOT_SENT chỉ dùng ADMISSION_EXPIRED/DISABLED/ABORTED.

Nguồn API đã đọc 04/10/2026: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Responses](https://developers.openai.com/api/reference/cli/resources/responses/methods/create), [token usage](https://developers.openai.com/api/docs/guides/token-counting). Việc cấu hình store:false không tự xác nhận toàn bộ chính sách lưu dữ liệu hay quyền tài khoản.

## Kiểm chứng và review độc lập

Runtime `cc5e6a97d319b4e5a40a9e4fe1b1e7bf873b8150`, tree `f29b53dcb41c74176cb37082b84a8bc144b9af78`:

- [Automation37189376937](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37189376937): cả 10 job SUCCESS; Node18/22 mỗi bản **1.361 PASS/0 fail/0 skip**. Log Node18 111398181035 và Node22 111398180987 đã đọc.
- [PostgreSQL111398181007](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37189376937/job/111398181007): **422/0/0**, gồm 13 ca SQL691 mới. Cài migration hai lần, quyền private/không auto-enrollment, Application Service→SQL→HTTP giả→usage→DRAFT, replay, concurrent quota, limit/UNKNOWN, receipt sau revoke, NULL/cặp state-reason sai, policy bất biến và rollback. Ca421 quan sát claim thực sự chờ khóa policy trước khi bị từ chối sau revocation commit.
- Frontend 10.335 modules, 26,49 giây. [Report37189376944](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37189376944) và [Messenger37189376946](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37189376946) SUCCESS.
- CI merge `890b9b31538798b8089e6e6dd3298084b957d370` đúng tree trên và hai parents base `e16c885ae7c2305645be02a1227bf378cb59137f` + runtime.
- Reviewer độc lập đã tự đọc published blobs/log PG/Node/build và đối chiếu tree/parents: **PASS checkpoint SQL691/OpenAI adapter**, không còn finding chặn trong phạm vi. P2 receipt state/reason đã khép; invalid receipt không xóa khóa UNKNOWN hoặc reservation.

Local 1.356 PASS/5skip, focused advisor+provider31/31 (12 provider mới). Kiểm cờ/key riêng, credential đổi, permit replay/giả/quá hạn, failover, AbortSignal, URL/body, usage sai/thiếu, HTTP429, refusal/toolcall/incomplete, response lớn và mất persistence. Năm ca local skip đã chạy trên CI. Toàn bộ provider response là giả; không kiểm mô hình, hóa đơn hoặc tài khoản OpenAI thật. Không có thay đổi UI trong checkpoint này; không thay bằng chứng UAT.

## Hoàn tác và phần còn thiếu

Tắt VPT_CARE_ADVISOR_OPENAI để ngừng admission; chờ HTTP đang chạy và giữ policy/receipts/advisor history. Thu hồi active theo gói vận hành; không xóa reservation, tái cấp claim, tự replay hoặc dùng key bot cũ. Không rollback public hàm về phiên bản bỏ kiểm quota. Chưa áp DB thật hoặc phát hành.

Full goal ACTIVE. Còn quyết định key/model/dữ liệu/hạn mức thực tế, cấp quyền runtime riêng, kiểm chất lượng tư vấn thật, worker tự tiếp nhận và gửi có kiểm soát, xử lý hội thoại dài, ghép lịch/người khảo sát, chi phí thực tế/dashboard, đối soát UNKNOWN, UAT và Founder duyệt mở thử. Những kiểm thử này không chứng minh hoàn tất AI Sales hoặc đạt250k/khách thật.
