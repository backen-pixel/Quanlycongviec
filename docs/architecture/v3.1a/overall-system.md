# Tổng thể Business AI OS — V3.1a

**DESIGN_PROPOSAL / NOT_LIVE**,16/10/2026. Phạm vi là **toàn bộ Business AI OS**, Marketing bên trong; M1 chỉ là lát cắt xây đầu tiên. Kế thừa [kiến trúc tổng thể](../overall-design-20261016/ARCHITECTURE.md) và [authority/contracts](../overall-design-20261016/CONTRACTS.md), đối chiếu [W0](01-inventory-w0.md). D1–D7 V3.1a là giả định có nhãn; phần khác biệt dưới đây ưu tiên, không mở V3.2 hay cấp quyền vận hành.

## 1. Sáu miền ngang hàng, một nguồn cho mỗi sự thật

| Miền | Authority và kết quả phải nối được |
|---|---|
| Founder Control Center | Sở hữu Objective, ưu tiên, ủy quyền và quyết định thuộc thẩm quyền. Đọc tình hình/chênh lệch/ngoại lệ có nguồn; không ghi sổ khách hoặc tiền thứ hai. |
| Marketing | Sở hữu kế hoạch, nội dung/tài sản/quyền dùng, CampaignPlan, điểm chạm và mô hình attribution. Nhận kết quả từ CRM, Order và Finance; không tự sửa Need hay xác nhận thu tiền. |
| Sales/CRM | Party và quan hệ phạm vi công ty; Need, qualification, owner/handoff, tư vấn/khảo sát, Quote revision và bằng chứng khách chấp thuận. Một Party có nhiều Need hợp lệ. |
| Vận hành & giao giá trị | Project/đơn vị thực hiện, WorkItem sau bán, công suất, QC, giao/lắp/nghiệm thu. Một Order có nhiều đợt/xưởng/Project; không suy giao hàng từ AI task hoàn tất. |
| Chăm sóc & bảo hành | ServiceCase, người nhận, lịch hẹn, policy/context và bằng chứng giải quyết. Party bắt buộc; Order/Project có thể chưa biết. Chưa xác minh policy thì WAITING_POLICY, không tạo Project giả. |
| Tài chính & đơn hàng | Order service giữ đơn/giá/điều khoản/trạng thái; Finance giữ Payment/Refund/chi phí/chứng từ và đối soát. Mirror là alias, không cộng tiền hai lần; doanh thu, giá trị đơn và tiền ròng tách biệt. |

Luồng xuyên miền: **Touchpoint → Party/Need → Handoff/ACK → khảo sát → Quote revision → CustomerAcceptance → Order → Project/WorkItem → bàn giao → ServiceCase**. Payment có thể đến trước hoặc sau giao hàng; Refund tham chiếu khoản thu gốc và có ID riêng. Hủy/đổi đơn phát sự kiện đánh giá lại công suất, báo giá, công nợ và kết quả Marketing; không ghi đè lịch sử.

## 2. Marketing đủ chu trình trong cùng OS

- **Chiến lược/kế hoạch:** mục tiêu, phân khúc, thông điệp/AIDA, kỳ, dự kiến ngân sách, owner và revision. Liên kết Objective; phê duyệt kế hoạch không tự bật quảng cáo.
- **Nội dung/tài sản:** bài/ảnh/video/landing page, biến thể kênh, công trình/bằng chứng nguồn, quyền dùng và hạn quyền, bản duyệt và native publication ID. AI_GENERATED có provenance; nội dung ngoài mang taint, không thành chỉ dẫn.
- **Chiến dịch đa kênh:** CampaignPlan liên kết tài khoản/campaign/group/ad native qua binding; lịch/trần chi/trạng thái nội bộ tách nền tảng; không ép cấu trúc các kênh giống nhau.
- **Hành trình/quyền liên hệ:** first touch, nguồn Need và latest touch có bằng chứng; anonymous→known chỉ khi có căn cứ. Consent theo company/purpose/channel/account, grant/revoke và revision; thiếu nguồn Organic giữ UNKNOWN. Không hứa nhận diện một người trên mọi nền tảng.
- **Bàn giao Sales:** khách/nhu cầu hợp lệ, owner/SLA, assigned/delivered/accepted/first_response có bằng chứng riêng. Thiếu owner có hàng chờ và đầu mối; ACK transport không phải human ACK. Website và native lead/tin nhắn đều có đường nhận.
- **Đo/cải tiến:** chi phí, qualified Party/Need, khảo sát, Quote, Order, cash/refund và coverage theo cohort/window. Attribution không chứng minh nhân quả. Đề xuất đổi nội dung/quy trình/ngân sách đi qua Governance; AI không tự sửa luật.

**130 triệu là quỹ Marketing, không phải chi phí xây OS.** Finance đối soát thực chi, cam kết còn lại, thuế/phí và UNKNOWN holds; settlement thay reservation tương ứng để tránh cộng trùng. CPL≤250.000đ cần cost basis, mẫu số qualified/new và cửa sổ có bằng chứng. Ba connector M1 không thu hẹp Marketing thành chỉ nhận form.

## 3. Lõi chung và sáu Hệ

L1–L2 quản lý kênh/binding/xác thực/inbox bền vững; L3 nối nguồn CRM/Work/Finance có chủ; L4–L5 giữ một registry Rule/Decision/Approval; L6 Command/claim/fence/receipt/reconcile; L7 Paperclip/gateway/runtime; L8 Expectation/Outcome; L9 cockpit/giao diện; L10 tenant/company/quyền/audit/cap/khôi phục. Đây là trách nhiệm logic, không phải mười service hoặc DB. **n8n ngoài đường sản phẩm theo giả định D2**; intake, connector, notification và đối soát do backend/worker BOS chịu trách nhiệm. Công cụ nội bộ không giữ authority/cap/CRM riêng.

Sáu Hệ là góc nhìn xuyên miền: **Tư tưởng** giữ đích/guardrail; **Tư duy** giữ phương án/căn cứ; **Nguồn lực** kiểm người/quyền/công suất/ngân sách; **Vận hành** theo WorkItem/Command; **Báo cáo** đo nguồn/coverage/chênh lệch; **Sửa chữa** tạo việc sửa và đánh giá lại. Không bắt mọi workflow qua sáu lượt duyệt/LLM.

Hợp đồng: IntakeEvent/Fact → Rule/Decision → Command/Receipt; Handoff tách human ACK; QuoteAcceptance gắn revision; OrderExecution dùng execution_unit_key; Payment/Refund cần Finance evidence; AI Task/Run/WorkflowExecution liên kết BusinessWorkItem. [Data model](data-model.md) cụ thể hóa M1; miền mở rộng kế thừa contracts tổng thể.

## 4. Quyền và AI theo V3.1a

Mọi action resolve tenant/company/actor/delegation tại backend; aggregate read không thành write. Bốn cửa **Pháp→Lệ→Lý→Tình đều có DENY/UNKNOWN**. C1 trong ủy quyền; C2 báo trước chỉ danh sách đóng D3, có giao thông báo/deadline/block bền vững và recheck; C2 khác cần người duyệt từng việc; C3 thuộc policy authority. Không suy im lặng cho phép chiết khấu, ngân sách hay gửi khách M1.

AI đọc nội dung ngoài ở C0 với taint; phiên/bộ nhớ gắn một company; prompt/model/spec có phiên bản; reviewer chỉ PASS/FAIL, bounded max_rounds; code tính số liệu. Paperclip sở hữu task/run AI, domain sở hữu việc kinh doanh. Mỗi call/retry/reviewer qua gateway và reservation; usage UNKNOWN giữ hold. Codex ngoài runtime ở vai trò xây/kiểm/review. AI không giữ credential vòng qua domain service.

Trước effect recheck scope, rule/fact/consent/rights/revision/TTL/cap. Mất đáp ứng có thể đã ghi → UNKNOWN và đối soát, không gửi lại mù. Hủy lưu tombstone: confirmed no-effect→CANCELLED; effect đã xảy ra→SUCCEEDED, bù bằng command có quyền riêng. Restore ở chế độ đọc/đối soát trước replay.

## 5. Phạm vi xây và các cửa tiếp theo

**G0:** xác minh nguồn/deployed/schema, baseline runner+schema, WorkItem façade/writer registry và luật nguồn. Baseline thử hiện lỗi trước migration đầu; live comparison UNKNOWN, chưa đạt gate. **M1:** ba connector website/Meta Lead Ads/Zalo OA → Need/owner → ACK/theo dõi/đối soát, intake không chờ AI. CRM presales là writer; giữ adapter Work sau bán.

**M2/gate sau:** content/asset/campaign, đa kênh, chuyển đổi bán hàng, Order/Project/Finance/Service và hiệu quả đầu-cuối. Mỗi lát cắt cần authority/chính sách, quyền provider, cap, fixtures, staging/restore và nghiệm thu; không tự mở outbound/payment automation. Nguồn lực/chi phí/lịch thiếu căn cứ giữ UNKNOWN.

Founder cho tiếp tục dù thiếu audit/hình gốc; phần độc lập hoàn thiện, original mapping giữ UNKNOWN. Tài liệu đủ không làm runtime test PASS; không setup/deploy/đổi hệ đang chạy.
