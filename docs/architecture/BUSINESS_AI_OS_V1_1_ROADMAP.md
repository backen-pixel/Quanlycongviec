# Business AI OS V1.1 — lộ trình và cổng triển khai

Ngày: 01/10/2026. [Kiến trúc đích](./BUSINESS_AI_OS_ARCHITECTURE_V1_1.md) · [Quyết định Founder](../ai-handoff/FOUNDER_DECISIONS_ARCHITECTURE_V1_1_20261001.md) · [Hiện trạng/bằng chứng](../ai-handoff/ARCHITECTURE_V1_1_EVIDENCE_20261001.md).

Yêu cầu gốc ngày 01/10 mở chặng 0. **Cập nhật 02/10: Founder ưu tiên hoàn thiện Marketing đa kênh để tạo khách trước**; xem quyết định F-12 và [gói ưu tiên/đề xuất ngân sách](../ai-handoff/MARKETING_MULTICHANNEL_PRIORITY_20261002.md). Các chặng lớn kế tiếp cần yêu cầu cụ thể theo chính kế hoạch đã duyệt. Tài liệu này là backlog/gate, không phải scheduler hay trạng thái công việc production. Trạng thái thực hiện xem CURRENT và hồ sơ nghiệm thu.

## 1. Thứ tự và nguyên tắc

Ưu tiên hiện tại: hoàn thiện hồ sơ chặng 0 → phần kiểm soát chặng 1 cần cho từng tuyến Marketing → Marketing đa kênh và CRM trước bán của chặng 2 → thương mại chặng 3 → Work chặng 4 → thực hiện/tài chính chặng 5 → liên công ty chặng 6 → mở quyền AI chặng 7 → nghiệm thu tổng thể chặng 8.

Marketing bao gồm thu hút khách, nội dung/quảng cáo, website/biểu mẫu/chat, bàn giao tư vấn và đo chất lượng theo kênh. Các kênh Founder nêu: Facebook đã có, website, Google, ChatGPT Ads, TikTok, Zalo. Triển khai nối tiếp các tuyến đủ điều kiện; không yêu cầu mọi kênh chạy quảng cáo trả phí cùng lúc. Phần CRM giữ nhiệm vụ tiếp nhận/chăm sóc; trợ lý AI và dashboard chỉ ưu tiên phần trực tiếp phục vụ tuyến này. Các phát triển chuyên sâu sau bán xếp sau, vận hành hiện hữu vẫn giữ.

Chuẩn bị bằng dữ liệu giả và Factory pilot có thể chạy song song chặng 1 khi được giao. Projection/Cockpit và công cụ AI chỉ đọc bổ sung theo module đã đạt, không đợi xây toàn bộ. Không đợi hoàn thiện Factory mới làm Marketing.

Mỗi gói implementation có owner, phạm vi, base SHA, contract, ma trận test, điều kiện bật, giám sát và hoàn tác. PASS kỹ thuật không thay approval phát hành. Chỉ dùng gate liên quan trực tiếp để chặn một lát; không biến toàn bộ roadmap thành điều kiện phải xây xong trước Marketing.

## 2. Các chặng

| Chặng | Đầu vào / dependency | Đầu ra bắt buộc | PASS / STOP |
|---|---|---|---|
| 0 — Kiến trúc | Chỉ dẫn Founder; baseline repo; tài liệu V1; lựa chọn tách trước/sau bán | V1.1, ownership, sơ đồ, ADR theo quyết định, sổ Founder, bằng chứng, lộ trình và hướng dẫn đọc chung | PASS gói tài liệu khi kiểm nguồn/link/phạm vi và review đạt; STOP nếu còn mâu thuẫn ownership hoặc tự nâng phạm vi approval. Merge giữ gate riêng. |
| 1 — Nền kiểm soát | Gói chặng 0; môi trường cô lập; quyết định mở chặng 1 | Inventory writer/ACL/RLS; baseline migration theo tên + hash; lối ghi có kiểm soát; thử restore và chuyển Primary; kiểm quyền/audit/chống trùng tuyến Marketing | PASS khi test quyền và đa phiên PostgreSQL đạt, restore chứng minh được, không có hai writer nghiệp vụ. STOP phần phụ thuộc khi target/quyền thực tế chưa xác nhận. |
| 2 — Marketing đa kênh → CRM trước bán | Kiểm soát áp dụng cho tuyến đạt; môi trường/tài khoản/company/người nhận xác định; phiên bản tích hợp liên quan được review (PR #19 cho tuyến Facebook tương ứng) | Nội dung/điểm nhận khách và quảng cáo theo phạm vi duyệt → receipt → CRM Lead → người tư vấn → kết quả chăm sóc và báo cáo nguồn/chi phí; mở kênh theo gói MK-01…06 | PASS từng kênh/tuyến thu hút và nhận khách; Messenger/Lead Ads được thử riêng. Các kênh mới có target, phép đo, người xử lý và gói chi được duyệt nếu phát sinh chi phí; không suy một tuyến PASS cho tuyến khác. Thiếu người nhận hợp lệ, dữ liệu sai công ty hoặc nhận lặp tạo trùng là STOP. |
| 3 — Bán hàng → Order → Project | CRM/Work đã có dịch vụ và kiểm soát tối thiểu; kiểm kê quotations/orders/helper hiện có | Quote version, bằng chứng khách đồng ý, Order hợp lệ, bàn giao Project theo đơn vị thực hiện; adapter cho đường cũ | PASS cả retry/concurrency và đổi báo giá; giữ nhiều đợt/nhiều xưởng hợp lệ. STOP nếu tạo lõi Order mới cạnh tranh hoặc mất liên kết dữ liệu cũ. |
| 4 — Work sau bán | Quy tắc trước/sau bán đã chốt; mapping bảng/ID; tuyến Order | WorkItem, Milestone, dependency, evidence; chuyển nhóm việc sau bán; view/API tương thích | PASS đối soát số lượng, ID, quyền, trạng thái, file, lịch sử và người nhận; nhóm chưa phân loại giữ nguyên. STOP khi mất lịch sử hoặc dual-write cùng bản ghi. |
| 5 — SX → giao lắp → tài chính | Work và dịch vụ chuyên môn tương ứng đạt | Bàn giao, QC/WIP, giao/lắp/nghiệm thu; đối soát công nợ và thu tiền; MISA đọc/đối soát | PASS một đơn mẫu xuyên chuỗi, số tiền truy được chứng từ; ngoại lệ thử lại không làm lặp giao dịch. STOP khi gộp giá trị hợp đồng/doanh thu/tiền thu. |
| 6 — Liên công ty | Phân quyền/phạm vi và chuỗi chặng 5 | Hồ sơ giao dịch/bàn giao VPT–Metala hai bên, xác nhận nhận việc và projection riêng | PASS dùng tài khoản nghiệp vụ giới hạn; sai công ty/tenant bị chặn, retry không nhân hồ sơ. Không dùng quyền quản trị toàn hệ để che lỗi. |
| 7 — AI thực thi | Tool contract của module đạt; dịch vụ kiểm quyền/approval/audit đạt; inventory Agent | Workload identity, ủy quyền/thu hồi, công cụ giới hạn và đánh giá Agent | PASS kiểm vượt quyền, tự duyệt, approval hết hiệu lực, chỉ dẫn độc hại và subagent mở quyền. Quyền tự động thường trực ngoài phạm vi duyệt chưa mở. |
| 8 — Nghiệm thu tổng thể | Các tuyến dùng thật đã qua gate và được phát hành đúng phạm vi | Cockpit có nguồn/độ mới, runbook ngoại lệ/restore, diễn tập vận hành, biên bản Founder | PASS người vận hành thực hiện được kịch bản; nguồn lỗi hiện UNKNOWN; quyết định nhạy cảm quay về Founder đúng lúc. |

## 3. Gói giao việc chặng 1 đã chuẩn bị

Đây là yêu cầu để mở chặng tiếp theo, không phải chỉ thị chạy DB ngay.

| Mã | Việc cụ thể | Bằng chứng đầu ra / giới hạn |
|---|---|---|
| C1-01 | Chốt backend/frontend SHA, target DB, công ty/Page và ma trận quyền được phép kiểm tra | Manifest môi trường đã giảm dữ liệu nhạy cảm; không lấy tên DB hoặc số migration làm bằng chứng deployment. |
| C1-02 | Lập bản đồ đường ghi và quyền cho intake Facebook, CRM Lead, assignment/task, attribution, báo cáo | Call path UI/webhook/job → service/helper → table/RPC; đánh dấu đặc quyền, ghi trực tiếp và tác động khi startup/GET. |
| C1-03 | Đối chiếu ACL/RLS, RPC SECURITY DEFINER và ngữ cảnh tenant trên môi trường được phép | Kết quả actual vs intended; test anon/user/sai company/sai tenant/thiếu tenant; sửa bằng migration mới sau review, không sửa file đã áp dụng. |
| C1-04 | Lập baseline migration và quy trình áp dụng/restore cô lập | Inventory tên đầy đủ + checksum, trạng thái applied xác minh riêng; phát hiện số trùng, thứ tự/dependency, thiếu drift; không chạy cả thư mục dựa trên số tăng dần. |
| C1-05 | Kiểm một Primary ghi, replication và cơ chế chuyển vai trò | Xác minh config không lộ secret; test mất Primary, chặn writer cũ, chống replay ghi trùng và phục hồi; backup nhận bản sao khác với xử lý lệnh nghiệp vụ. |
| C1-06 | Chuẩn hóa command tối thiểu và transaction cho tuyến Marketing | Auth/scope, quyền/luật/approval, audit/outbox và idempotency; giữ adapter API hiện tại, không xây policy engine tổng quát ngoài nhu cầu tuyến. |
| C1-07 | Chạy test PostgreSQL đa phiên và phục hồi tiến trình | Rollback transaction, duplicate/concurrent intake, commit thành công nhưng mất phản hồi, crash trước/sau ACK, worker khởi động lại, notification/task thất bại sau Lead commit. |
| C1-08 | Đóng gói đề nghị mở nghiệm thu Marketing | Đúng phiên bản, kết quả, rủi ro còn lại, giới hạn dữ liệu, phương án tắt/hoàn tác và người nghiệm thu. |

Đầu vào phải có trước kiểm vận hành: URL môi trường được phép, mã phiên bản đang chạy, ID công ty/Page, một mẫu hợp lệ và Sales Admin được chỉ định. Các định danh này chưa đủ trong hồ sơ hiện tại; không tự chọn người nhận hoặc đổi cấu hình để làm bài kiểm tra đạt.

## 4. Factory pilot giới hạn

Ba việc được chọn:
1. Bản đồ nhiệm vụ trước/sau bán từ mã và schema: chỉ đọc, đánh dấu nhóm chưa rõ.
2. Rà hồ sơ PR #19 đúng head và bằng chứng đã có: không mở lại phạm vi mã hoặc tự nghiệm thu live.
3. Thiết kế và chạy tình huống quyền DB trong PostgreSQL cô lập khi môi trường được xác nhận: không dùng production credential.

Mỗi việc có một owner, brief nguồn/SHA, xác minh của Builder, review phiên riêng và cập nhật hồ sơ. Phần chuẩn bị bản đồ của chặng 0 có thể tái sử dụng; không gọi đó là kết quả pilot Claude–Codex khi Claude chưa tham gia.

Đo thời gian đến kết quả được review, số lần Founder phải chuyển ngữ cảnh, chi phí quan sát được, phát hiện sai yêu cầu/lỗi lọt. Chỉ so với việc đối chứng cùng phạm vi/rủi ro; thiếu baseline/chi phí thì ghi INCONCLUSIVE, không tự điền 0 hoặc dùng mốc AI-FAC chưa truy hồi.

Điều kiện chất lượng tối thiểu: nguồn truy được, mọi tiêu chí nghiệm thu của việc đạt, không còn lỗi nghiêm trọng hoặc vi phạm phạm vi/quyền. Founder quyết định có bắt buộc quy trình cho việc phức tạp sau báo cáo pilot; không đặt điều kiện mọi chỉ số đều phải tốt hơn trên ba mẫu khác nhau. Không mua thêm gói, cài CLI, bật hook chung hoặc sửa CI chỉ để hoàn thành pilot nếu chưa có phạm vi tương ứng.

## 5. Ma trận nghiệm thu bắt buộc theo rủi ro

| Tình huống | Kết quả yêu cầu | Nơi chứng minh |
|---|---|---|
| User/Agent sai company, tenant, thiếu context | Từ chối trước ghi; không trả dữ liệu ngoài quyền | API + PostgreSQL policy/RPC có vai trò thật trong môi trường cô lập |
| Delegation hết hạn/thu hồi; subagent xin quyền lớn hơn | Từ chối, audit truy được actor | Tool Gateway + dịch vụ |
| Nội dung/phiên bản/policy thay sau duyệt | Duyệt cũ không dùng được; yêu cầu quyết định mới khi cần | Test service + concurrency |
| Event trùng và nhiều worker nhận đồng thời | Một hiệu ứng nghiệp vụ cho cùng khóa; kết quả retry nhất quán | PostgreSQL đa phiên + worker |
| Crash trước/sau commit hoặc sau ACK | Không mất receipt đã nhận; không nhân giao dịch; có cách tiếp tục | Fault/restart trên staging cô lập |
| Workflow UNKNOWN / thiếu approval | Lệnh nhạy cảm không chạy | Domain/Application Service và workflow integration |
| Nguồn báo cáo lỗi/cũ/rỗng | Lỗi/cũ là UNKNOWN; số 0 chỉ từ dữ liệu đọc thành công đúng phạm vi | Adapter + UI + đối soát |
| Chuyển task cũ | Mapping, số lượng, lịch sử, file và quyền khớp; task trước bán giữ CRM | Dry-run + rehearsal migration + rollback |
| Nhiều đợt/nhiều xưởng trong một Order | Tạo đúng số đơn vị thực hiện được yêu cầu; retry không tạo thêm | Commercial handoff integration |
| Primary mất kết nối / chuyển vai trò | Không ghi hai DB; khôi phục được theo runbook | Diễn tập cô lập trước rollout |
| VPT ↔ Metala | Đúng người nhận, đúng phần dữ liệu, có xác nhận hai bên | E2E với tài khoản nghiệp vụ được phép |
| Khách → đơn → thực hiện → thu tiền | Truy vết một chuỗi nhất quán, ngoại lệ không mất dấu | Nghiệm thu vận hành riêng theo phiên bản |

Không chạy application startup hoặc gọi GET với giả định chỉ đọc: đã có route thương mại sửa trạng thái trong GET. Phải kiểm call path và tác động trước khi thử trên môi trường thật.

## 6. Rollout, giám sát và hoàn tác

Mỗi lát chuyển theo công ty/nhóm chức năng, có cờ bật/tắt, một writer và adapter tương thích. Chạy đối soát trước chuyển; chỉ ngừng đường cũ khi tiêu chí đạt. Không dùng dual-write không có cơ chế đối soát để rút ngắn migration.

Theo dõi tối thiểu: receipt pending/failed và tuổi hàng đợi; lỗi/độ trễ nhận việc; tỷ lệ lỗi API; số lệnh bị từ chối; thiếu/già hóa nguồn báo cáo; chênh lệch đối soát; tình trạng Primary/replication. Ngưỡng cụ thể được ghi trong gói phát hành theo baseline của tuyến, không tự thêm lịch/notification ngoài phạm vi giao.

Hoàn tác phần mềm theo commit/cờ; giữ dữ liệu nghiệp vụ đã thành công, audit, receipt, mapping và migration bổ sung cần tương thích. Bước nghiệp vụ bù phải được phép riêng. Không rollback bằng xóa khách/giao dịch hoặc mở lại quyền không an toàn.

## 7. Khối lượng, lịch và chi phí

Chặng 0 đóng gói tài liệu và khảo sát tĩnh; chưa xác nhận môi trường staging, quyền DB, drift migration, nguồn baseline Factory hoặc chi phí sử dụng Claude. Vì vậy không đủ cơ sở cam kết số ngày/chi phí toàn hệ.

Ưu tiên dự toán hiện tại: MK-01…MK-06 theo gói Marketing đa kênh, kèm phần C1-01…C1-08 liên quan trực tiếp đến tuyến sẽ mở. Ngân sách media đề xuất A/B và chi phí triển khai là hai khoản riêng; yêu cầu lập phương án chưa phê duyệt chi thêm. Đối với phần sửa mã/DB, sau C1-01…C1-04 liên quan, owner lập dự toán theo số đường ghi, bảng/RPC cần sửa, migration thực tế và kịch bản nghiệm thu; ghi giả định, phụ thuộc và mức tin cậy để Founder chốt gói thực hiện. Không tự chuyển sự chưa chắc chắn thành số ngày hoặc ngân sách giả.
