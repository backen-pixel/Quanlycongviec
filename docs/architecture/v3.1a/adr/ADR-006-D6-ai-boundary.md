# ADR-006 / D6 — AI đọc có taint, một company và review hữu hạn

- Ngày: **16/10/2026**. Trạng thái **ASSUMPTION — PENDING_FOUNDER**, không tự nhận D6 đã được duyệt hoặc nghiệm thu.
- Phạm vi: thiết kế L7 V3.1a trên V3.1 trang6–13/18–19. [Chi tiết AI boundary](../ai-boundary.md), [contracts](../contracts/) và [hợp đồng tổng thể](../../overall-design-20261016/CONTRACTS.md).
- Audit gốc9 phát hiện **chưa tìm thấy**; nine local risk checks chỉ là review mới có bằng chứng code, không đóng/thay nguyên bản chưa đọc.

## Ngữ cảnh

Nguồn ngoài và memory có thể chứa yêu cầu đổi luật/quyền hoặc dữ liệu sai; prompt chống injection không tự cưỡng chế. Repo có draft validation/anonymization, model/prompt_version và step guard hữu ích, đồng thời còn nhiều provider paths và query memory theo user_id. M1 cần deterministic intake ngay cả khi AI tắt, giữ CRM/cap/policy authority.

Bằng chứng baseline `fe3f4398ebf2186596c108a7570f83e3bbef104a`: `aiUserMemory.js:203–226,311–325` và `aiConversation.js:601–604` user-only memory→system prompt; `aiConversation.js:633,647–651` auto tool và no-tool answer; `aiReplyDraft/provider.js:50–53` usage thiếu→0; `aiReplyDraft/service.js:74–75` model/prompt version là phần đã có. Đây là gap static, không kết luận có rò dữ liệu/sự cố production đã tái hiện.

## Phương án

1. **Prompt-only**: yêu cầu agent không đọc chéo company/không bỏ tool, reviewer sửa luôn nội dung. Ít công đầu nhưng không enforcement, không finite review hay nguồn chuẩn; không chọn.
2. **Company-bound typed AI gateway + reviewer read-only**: taint/scope/provenance có schema; backend policy/egress/cap cưỡng chế; reuse runtime qua adapter. **Chọn làm giả định D6.**
3. **Tắt mọi AI lâu dài**: có thể dùng deterministic M1/manual ở giai đoạn chưa đủ gate; bỏ AI vĩnh viễn không đáp ứng mục tiêu năng lực chung. Dùng làm fallback vận hành theo quyền, không tự disable runtime hiện tại.

## Quyết định thiết kế giả định

- External form/Zalo/nativelead/message/file/log/memory là **tainted data**, L7 chỉ đọc ở C0; signature nguồn không biến nội dung thành instruction/VERIFIED. Derived summary/embedding giữ taint và evidence.
- Mỗi phiên/bộ nhớ/cache/recall/checkpoint thuộc **đúng một tenant/company**; server resolve scope, không fallback null/`chung` hoặc đổi last_company_id để dùng lại lịch sử. Global founder query dùng scoped deterministic aggregation, không trộn memory hai công ty.
- L7 tạo proposal/artifact; L4/L5 ra quyết định theo authority thật, L6 recheck và thực thi. AI/reviewer không có credential/SQL/HTTPproxy/shell/browser đường vòng. L10 giữ canonical cap; từng retry/reviewer/subagent đều reserve, unknownusage giữexposure.
- Reviewer khác danh tính/phiên, chỉ `PASS|FAIL` + artifact hash/spec/eval refs theo schema; check observations nằm ở evidence liên kết, không viết lại nội dung hoặc thay quyền. Producer tạo revision mới khi sửa; max_rounds/call/cost/deadline cưỡng chế trong code. Đề xuất2 vòng review artifact M1 là giả định mới có nhãn, khác phép thử hai vòng sửa runtime ở V3.1 trang13; không cấp paid cap.
- Mọi artifact AI gắn **AI_GENERATED** và lineage, cả sau human review/edit; review không tự đổi finance/consent thành VERIFIED. Số liệu/cap/KPI do code tính theo source/definition/version; AI chỉ giải thích typed results.
- AgentSpec/CycleRecord có exact D6 fields: **taint, company_scope, max_rounds, agent_spec_version, prompt_hash, model_id**; lưu requested/actual model, prompt/tool/adapter/eval versions và sourcefactrefs để tái dựng.
- Behavioral eval corpus đi cùng model/prompt/spec/tool versions; promptinjection, companymemory, reviewer mutation, loopreset, usageunknown và egressbypass đều có ca gate. Không coi schema/mockPASS là liveAI/networkPASS.

## Hệ quả và đường chuyển

Phải kiểm kê toàn bộ provider/memory/tool/render paths và thêm wrapper/cutover theo từng luồng. Không gỡ roster33 agent vì số lượng; phân loại active owner/schedule/tool/memory trước giữ/merge/retire ở nhiệm vụ riêng. Paperclip điều phối task/run; OpenClaw/runtime thay qua adapter nếu không đạt capability, không tự mở quyền model.

Legacy memory không có scope không được auto promote vào M1; cần sourceclassification/map/admission và không rò khi backfill. Customer inbound vẫn được lưu khi AI bị block; nhân sự tiếp tục nhận và chăm theo quyền. Featureflag/rollback AI không bỏ scope/taint/consent/receipt/cap guards.

Original audit9 missing là thiếu input chặn đối chiếu nguyên bản; không chặn thiết kế taint/scope/review đủ hợp đồng độc lập. Khi có nguồn gốc cần map mỗi finding vào evidence/code và giữ/hạ/nâng/đóng có lý do; không tái đánh số local thành original.

## Kiểm chứng / chi phí / trạng thái

Ca D6-E01–E12 ở ai-boundary, cộng T01/T06/T11–T16/T18/T19 vẫn **NOT_RUN**. Test fixture/schema local báo riêng; không dùng provider credentials/paidcall để hoàn thiện thiết kế. Chi model/egress/retention/công xây **UNPRICED/UNSET** tới khi có quyền/đơn giá/nguồn lực; không lấy130 triệu marketing làm capAI.

Chỉ mở AI M1 sau enforceable gateway/identity/scope/memory/cap/provenance/reviewer/eval evidence. Nếu không chặn được directegress, giữ nhánh AI tự động HOLD và deterministic intake chạy; đây là gate thiết kế, không lệnh thay cấu hình hệ đang chạy.
