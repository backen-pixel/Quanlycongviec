# Công cụ và ngữ nghĩa báo cáo — đề xuất MCRM-D0 v1
Chưa đăng ký tool, endpoint hoặc schema DB. Tên dưới đây là tên thiết kế, không được ghi là API có sẵn.

## Kiến trúc tích hợp
React gửi yêu cầu → backend xác lập người/công ty/phạm vi → dịch vụ báo cáo của module → adapter chỉ đọc cho Agent. Agents API xử lý nhiệm vụ và gọi công cụ đã đăng ký; handler của ứng dụng thực hiện kiểm soát và trả kết quả. Nguồn chuẩn và phép tính giữ trong Business OS.

Ưu tiên một Agent và môi trường OpenAI-hosted khi bước triển khai được mở. Giữ quy ước Node/CommonJS hiện có; cô lập adapter, không thay toàn bộ bot hiện hữu hoặc chuyển TypeScript. Không cấp SQL, DB credential, shell truy cập DB, arbitrary URL, crm_api_get tổng quát hay toàn bộ executeTool cho pilot.

[Tài liệu Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview) mô tả session/ngữ cảnh và hạ tầng do OpenAI quản lý. [Function tools](https://developers.openai.com/api/docs/guides/agents-api/tools/functions) vẫn cần handler của ứng dụng; handler phải hoạt động độc lập với tab đang mở. Tài liệu được kiểm ngày 02/10/2026; phải xác minh contract/SDK/access lại trước implementation.

## Quyền và vòng đời
- Quyền hiệu lực là giao của danh tính Agent, quyền người ủy quyền và phạm vi nhiệm vụ. Server xác lập tenant/company từ xác thực; đầu vào model không phải căn cứ cấp quyền.
- Kiểm object/field/region và quan hệ Page/account/company ở mỗi call; kiểm lại lúc trả kết quả hoặc tiếp tục phiên nếu quyền thay đổi. Session tách theo người/tenant/company; đổi công ty không tái dùng cache/nguồn của công ty cũ.
- Dữ liệu khách và tài liệu được coi là dữ liệu không tin cậy; chỉ dẫn trong ghi chú không thay quyền/tool/policy.
- Một báo cáo có run_id và snapshot_id; lưu session/turn/call IDs khi tích hợp. Retry một call không tạo báo cáo nghiệp vụ/trạng thái chăm sóc mới.
- Mọi công cụ ở pilot chỉ đọc. Audit/nhật ký kỹ thuật được ghi có kiểm soát, nhưng không sửa Lead, seen_by, owner, task, attribution hoặc gửi thông báo/tin khách.
- Trạng thái hoàn tất turn không chứng minh dữ liệu đúng. Kiểm outcome, coverage, quyền và schema của từng kết quả. Dừng khi hết thời gian/lượt gọi/ngân sách được cấu hình; trả trạng thái chưa hoàn tất.
- Quyền gửi tin, phân công, đổi ngân sách, tạo đơn và chạy lịch không thuộc pilot. Nếu được yêu cầu, trả OUT_OF_SCOPE; không dùng PENDING_APPROVAL như cách mở sẵn công cụ ghi.

## Bốn công cụ đề xuất
Tất cả input dùng schema đóng (additionalProperties=false), thời gian hợp lệ, giới hạn batch. Các định danh ngoài quyền bị từ chối trước đọc dữ liệu chi tiết.

| Tool | Input phía Agent | Output tối thiểu | Trách nhiệm/điều kiện |
|---|---|---|---|
| marketing_get_intake_reconciliation | window_start, window_end, channel=lead_ads, page_ref đã được server cấp, cursor | intake_ref, event_key, event_at, lead_ref/null, link_state, next_cursor, coverage | Marketing đọc nguồn intake; CRM xác nhận liên kết/ownership. Dedup event không suy dedup khách bằng tên/điện thoại. |
| crm_get_care_evidence | lead_refs từ kết quả trước, snapshot_id, cursor | owner_state, acknowledgement_state, care_state, evidence_refs, task_refs, deadline_state | CRM kiểm quyền từng hồ sơ; không gọi alias detail đang ghi seen_by. Không đưa tệp/tin nhắn thô vào model. |
| marketing_get_campaign_summary | campaign_refs được cấp, window_start/end, snapshot_id | chi tiêu, currency, số Lead quy kết, source_status, coverage, as_of | Tái sử dụng phép tính đã kiểm chứng; nguồn lỗi/cắt/trễ thì null+reason. Không dựa riêng adAnalytics để đếm intake chưa nối CRM. |
| knowledge_get_approved_sales_guidance | topic, product_ref, policy_version | đoạn hướng dẫn đã duyệt, document_ref, version, approval_state | Chỉ tài liệu đúng công ty/phiên bản. Chưa có nguồn được duyệt thì không soạn cam kết giá, tiến độ hoặc chính sách. |

Bản nháp tư vấn nằm trong kết quả để Sales xem; không tự lưu như một hoạt động chăm sóc hoặc gửi ra ngoài. Chỉ cấp marketing_get_campaign_summary khi nguồn Ads đạt; lỗi nguồn này không chặn việc xem danh sách chăm sóc đã có nguồn tốt.

## Bao kết quả do backend quản lý
Mỗi response có: contract_version, run_id, snapshot_id, scope_ref, outcome (OK/DENIED/ERROR), reason_code, source_refs, fetched_at, source_as_of, coverage (COMPLETE/PARTIAL/UNKNOWN), next_cursor và data.

DENIED không trả tên/mã hồ sơ ngoài quyền. ERROR không chuyển thành data=[] hoặc số 0. COMPLETE chỉ dùng khi đã hết phân trang, không có nguồn bắt buộc lỗi, khoảng thời gian/độ trễ rõ. Với nguồn phụ lỗi, từng chỉ số có status riêng và toàn báo cáo PARTIAL. Nguồn lỗi thì source_as_of=null hoặc ghi rõ thời điểm thành công cuối; fetched_at không được giả làm thời điểm cập nhật dữ liệu.

## Định nghĩa và phép tính
- Kỳ intake: [window_start, window_end), múi giờ Asia/Ho_Chi_Minh; lọc theo thời điểm sự kiện được xác minh, không dùng updated_at/last_message_at thay thế. Chưa xác minh thời điểm thì tách riêng, không tự đưa vào kỳ.
- unique_intakes: số event_key khác nhau trong phạm vi. linked_intakes + unresolved_intakes = unique_intakes khi dữ liệu đầy đủ.
- unique_linked_leads: số lead_ref CRM khác nhau được liên kết. Nhiều event có thể cùng một Lead. Đây không phải số khách mới hoặc số lượt giao quảng cáo.
- Owner: UNASSIGNED, VALID, INVALID, UNKNOWN. VALID cần người hoạt động, đúng công ty/phạm vi; VALID không có nghĩa người đó đã đọc hoặc chăm sóc.
- Acknowledgement: CONFIRMED chỉ khi có bằng chứng con người đủ điều kiện theo policy; ngoài ra UNKNOWN hoặc NO_EVIDENCE nếu nguồn đầy đủ và policy đã được chốt. Không lấy lượt xem của AI làm bằng chứng.
- Care: EVIDENCED, NO_EVIDENCE, UNKNOWN. NO_EVIDENCE chỉ nói chưa tìm thấy bằng chứng trong cửa sổ đã kiểm đầy đủ, không cáo buộc nhân viên chưa làm việc. Note chung/system transition/task auto-gen không mặc nhiên là chăm sóc.
- Chính sách care/ack và ngưỡng quá hạn phải có phiên bản đã duyệt. Chưa có → UNKNOWN. Fixture có policy minh họa riêng, không dùng làm policy VPT.
- Tasks chỉ lấy việc trước bán và deadline đúng policy. Không tính mọi crm_tasks, không tính task xưởng/giao lắp là chăm sóc.
- Chi tiêu lấy từ nguồn đã đối soát; budget là cấu hình khác. CPL chỉ tính khi tử/mẫu cùng account/phạm vi/kỳ/cohort/currency và đủ dữ liệu. Mẫu số 0 → NOT_APPLICABLE, lỗi nguồn → UNKNOWN.
- Các cờ thiếu owner/chưa có bằng chứng/owner không hợp lệ có thể chồng lên cùng Lead; không cộng thành tổng số Lead cần xử lý.

## Nội dung Agent phải trả
1. Phạm vi và độ mới; phần đầy đủ/thiếu.
2. Chỉ số do backend tính, giữ null/UNKNOWN.
3. Danh sách cần kiểm tra: mã hồ sơ, nhận định, evidence_refs, đề xuất, người chịu trách nhiệm nếu đã xác minh.
4. Điều chưa kết luận và quyết định cần người có thẩm quyền.
5. Bản nháp chăm sóc nếu có đủ nguồn; không tự gắn nhãn đã gửi.

Output kiểm schema và đối chiếu mỗi số liệu/citation với snapshot. URL mở hồ sơ do server sinh theo tuyến đã kiểm, rồi kiểm quyền khi người dùng mở; không để model chế URL hoặc nhận URL tùy ý để truy cập.

