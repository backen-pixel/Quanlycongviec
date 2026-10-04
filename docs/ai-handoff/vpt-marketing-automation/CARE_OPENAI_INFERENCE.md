# Nối mô hình vào trợ lý chăm khách

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

## Kiểm chứng đang thực hiện

Local1.356 PASS/5skip, focused advisor+provider31/31 (12 provider mới). Kiểm các cờ/key riêng, credential đổi, permit replay/giả/quá hạn, failover, AbortSignal, URL/body, usage sai/thiếu, HTTP429, refusal/toolcall/incomplete, response lớn và mất persistence. Toàn bộ fetch giả, không model/network call.

13 ca PostgreSQL16 trong suite intake: cài SQL691 hai lần, không auto-enrollment, quyền private, API→SQL→HTTPgiả→usage→DRAFT, replay, concurrent quota, limit/UNKNOWN, receipt sau revoke, NULL/cặp state-reason sai, policy bất biến, rollback và chờ khóa policy revocation có observer. Chưa có kết quả CI ở bản ghi này. Reviewer độc lập đã khép P2 cặp state/reason và PASS về mã, chờ log đúng commit trước PASS checkpoint.

## Hoàn tác và phần còn thiếu

Tắt VPT_CARE_ADVISOR_OPENAI để ngừng admission; chờ HTTP đang chạy và giữ policy/receipts/advisor history. Thu hồi active theo gói vận hành; không xóa reservation, tái cấp claim, tự replay hoặc dùng key bot cũ. Không rollback public hàm về phiên bản bỏ kiểm quota. Chưa áp DB thật hoặc phát hành.

Full goal ACTIVE. Còn quyết định key/model/dữ liệu/hạn mức thực tế, cấp quyền runtime riêng, kiểm chất lượng tư vấn thật, worker tự tiếp nhận và gửi có kiểm soát, xử lý hội thoại dài, ghép lịch/người khảo sát, chi phí thực tế/dashboard, đối soát UNKNOWN, UAT và Founder duyệt mở thử. Những kiểm thử này không chứng minh hoàn tất AI Sales hoặc đạt250k/khách thật.
