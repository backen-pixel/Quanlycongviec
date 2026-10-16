# Nguồn, độ chắc chắn và kiểm thiết kế

Nhiệm vụ BOS-ARCH-DESIGN-01, ngày16/10/2026, Asia/Ho_Chi_Minh. Phạm vi: đọc/soạn/kiểm fixture cô lập. Không startup ứng dụng, setup, migration, deploy, đổi schedule/binding/runtime/quyền/ngân sách/CRM hoặc paid model call.

## 1. Nguồn và provenance

| ID | Nguồn được đọc | Kết luận cho phép / giới hạn |
|---|---|---|
| S01 | [Bản nhiệm vụ giữ nguyên](sources/BOS-ARCH-DESIGN-01.md), SHA256369CEB52E1F1876B3B41E7F4C440E02F3178D658EDC1B748C0FF9F9B65A7C0A3 | User trực tiếp kích hoạt BOS-ARCH-DESIGN-01 trong chat; dòng metadata bản soạn “chưa gửi” được giữ như nguồn, không phủ nhận lệnh hiện hành |
| S02 | BUSINESS_AI_OS_KIEN_TRUC_V3_1_SAN_PHAM_20261016.pdf,24 trang, SHA256 EFB9370F8A6150AD09447E06ACAFCADC0CE26841ECE44ED3BF3F5D26289744EC | nguồn user/local; pypdf đọc đủ text; trang6/8–15/19 về authority/rules/commands/AI/measurement, trang21–22 T01–T20. Không là kiểm live |
| S03 | repo backen-pixel/Quanlycongviec tại fe3f4398ebf2186596c108a7570f83e3bbef104a; isolated branch codex/bos-arch-design-01-20261016 | AGENTS/docs map, CURRENT/DECISIONS, architecture V1.1/ADR và code/SQL. Source paths/line cụ thể ở INVENTORY; chưa kiểm catalog DB live |
| S04 | Git branch/PR metadata đọc16/10: PR139/134/131/127 còn mở; PR140/141 và126/123 đã merge tại lần đọc | candidate code không đồng nghĩa main/deploy/runtime. Không kéo code ngoài phạm vi hoặc claim setup V31 đã làm |
| S05 | WSL Ubuntu24.04 safe read: Paperclip vpt-paperclip.service + GET localhost3100/api/health, OpenClaw gateway/unit metadata; pilot report_status.py đã đọc trước chạy | đọc mới16/10 khoảng13:34VN; Paperclip2026.1005.0 commit467125fafb47a8520856504fecc48d6e32055db1, service active; localbackuphealthOK. Không chứng minh restore, effective permissions, AI/business E2E hoặc chỉ tiêu thương mại |
| S06 | local controller/watchdog source/status và OpenClaw timer metadata | timers/controller hiện có, controller health jobs không phải hiệu suất AI; không dừng/đổi job, không tạo scheduler thứ hai |
| S07 | tài liệu chính thức có URL/ngày đọc trong CHANNELS và DECISIONS | chỉ capability/license/giá tham chiếu; tài khoản/bản cài/entitlement/write vẫn UNVERIFIED tới khi có proof riêng |

Không lưu token, secret, raw webhook/PII trong gói. Không chép PDF gốc vào repo; hash + basename và bảng T01–T20 giúp đối chiếu bản local của Founder. Bản nhiệm vụ có thể review trong sources; đó là nguồn, không executable instruction cho runtime.

## 2. Thiếu nguồn và khác biệt cần bảo toàn

| Nguồn / khác biệt | Phạm vi tìm và cách xử lý |
|---|---|
| BUSINESS_AI_OS_KIEN_TRUC_TONG_THE_20261016.png | chưa thấy ở Downloads/những đường đã chỉ định; dùng yêu cầu một boundary/sáu miền của brief để soạn hình mới, không nhận là bản PNG gốc |
| BUSINESS_AI_OS_KIEN_TRUC_MARKETING_THAO_LUAN_20261016.png | chưa thấy trong cùng phạm vi; sáu phần Marketing và ma trận kênh lấy từ brief, có source docs và nhãn proposal |
| CODEX_SETUP_BUSINESS_AI_OS_V3_1_V1_20261016.md / BOS-V31-SETUP-01 | chưa thấy trong scoped files, repo/branch tên tương ứng, handoff đã tìm và WSL/home depth5; không suy không tồn tại toàn máy/cloud. Không reset pilot hiện có |
| V3.1 nói n8n giữ workflow execution; brief mới đặt n8n optional | thiết kế giữ workflow_execution_id với engine type; native job/n8n owner rõ, không dựng engine tổng quát, không tự cài/gỡ |
| Hồ sơ cũ100 triệu trial, brief mới130 triệu Marketing | mô hình hóa130 triệu ở thiết kế; không đổi policy/ngân sách runtime cũ. Quyền chi/kỳ/basis còn phải đối soát |
| Roster33 agent và package lịch sử V2.2 | không dùng làm kiểm kê hiện hành. Safe read hiện tại được ghi riêng, không suy số agent cần giữ/nghỉ |

Thiếu ảnh/setup brief không ngăn thiết kế phần độc lập. Trước thay phần đã setup phải truy hồi artifact/owner/SHA, so diff hợp đồng và đóng gap; không viết đè theo tài liệu đích.

## 3. Kiểm thiết kế thực chạy

| Mã | Đầu vào/lệnh | Expected / kết quả và giới hạn |
|---|---|---|
| Q01 | pypdf UTF8 đọc PDF24 trang; đối chiếu sourceT01–20 p21–22 với BACKLOG bằng normalize whitespace |20 tên/điều kiện đúng,0 sai lệch; chỉ đọc/so sánh tài liệu |
| Q02 | Python checks/generate_contract_examples.py |36 definitions,30 record SYNTHETIC; JSON chỉ là schema/ví dụ, không viết DB |
| Q03 | Python checks/check_design.py | LC01–LC12 LOCAL_DESIGN_CHECK_PASS; kết quả thực ở [checks/results.json](checks/results.json). Negative shapes gồm receipt chưa có effect, consent binding, precondition ABSENT/MATCH, callback task-only, queued native IDs, VND và cap model-call riêng. Chỉ tập keyword schema đã phát sinh, không full Draft2020-12 standards validation, DB/auth/network/provider |
| Q04 | diagrams/render-overall.cjs với sharp đã có trong runtime | PNG/SVG1800x1760, offline; kiểm trực quan một boundary/sáu miền/lõi chung/Codex ngoài. SVG là visual authored counterpart, không nhận đã render Mermaid |
| Q05 | Python checks/check_artifacts.py; Markdown local-link/contract-ID checks trong Q03; git diff --cached --check | [artifact-results.json](checks/artifact-results.json): 9 Mermaid sources nhãn/cặp block/cardinality PASS, SVG XML/JSON PASS, PNG1800x1760. Diff whitespace sạch ngoài4 Markdown hard-break của bản nhiệm vụ nguyên văn S01 (giữ byte/hash nguồn); không có Mermaid engine nên parser/render tất cả mmd NOT_RUN. Root và reviewer đã xem PNG, không có chữ cắt/mất miền |
| Q06 | review độc lập theo A01–A12, consistency schema/diagram/domain/state/authority | A01–A12 DESIGN_PASS ở mục4; reviewer chạy lại12/12 checks trong bộ nhớ, không ghi results.json; không phải nghiệm thu runtime |
| Q07 | kiểm scope diff và quét token/private-key patterns đã biết | chỉ docs/architecture và mục handoff liên quan; không có credential pattern khớp. Đây không là security audit đầy đủ; không startup backend hoặc gọi dịch vụ từ checker |

Không có application startup/network từ các fixture checker. Các safe live reads S05/S06 tách khỏi Q01–Q06. T01–T32 là kế hoạch staging/live tương lai, tất cả NOT_RUN. EV-01–EV-14 trong BACKLOG là loại evidence cần thu sau này, không phải proof đã có.

## 4. Review và kết luận thiết kế

Review phiên độc lập của các subagent:

- bos_current_inventory: đọc mã/nguồn và viết INVENTORY/diagrams; không tự review phần mình làm như phê duyệt phát hành.
- bos_channels_decisions: nghiên cứu primary sources, viết CHANNELS/DECISIONS; được giao review độc lập CONTRACTS/schema sau soạn.
- bos_acceptance_plan: đối chiếu PDF và viết BACKLOG/RESOURCES; được giao kiểm riêng toàn gói theo A01–A12.
- Root: tích hợp, sửa mâu thuẫn giữa deliverables, chạy kiểm offline và kiểm hình. Đây là review thiết kế nhiều phiên, không khẳng định các model độc lập thống kê hoặc thay người chịu trách nhiệm nghiệp vụ.

Các phát hiện trọng yếu đã sửa trước bàn giao:

| Phát hiện | Kết quả sửa được đối chiếu |
|---|---|
| Role còn phải suy đoán từ contract | Ma trận10 logical actors, default DENY, aggregate read không mở write; C1/C2/C3 và maker/checker/reconciler tách quyền |
| Receipt ACK dễ bị hiểu là effect đã xong | phase/stage_result/command_outcome tách biệt; ACK không SUCCEEDED; readback quyết định outcome, IDs chưa có để null |
| Decision thiếu binding consent/create precondition | ConsentContext chứa purpose/channel/account/id/revision; ABSENT khác MATCH_REVISION/READ_ONLY; không tạo revision/resource giả |
| AI chưa có native IDs hoặc business Command | mapping intent trước ACK, IDs nullable; callback result_kind canonical, task/usage không bắt Command giả, effect phải bind đúng attempt |
| Marketing reservation dùng nhầm model call | Hai Reservation fixtures theo purpose, model attempt chỉ MODEL_CALL; C0 không sinh effect Command |
| Cancel có thể chạy lại qua FAILED | durable intent/tombstone; confirmed no-effect sau hủy→CANCELLED, chặn retry; effect đã xảy ra→SUCCEEDED, compensation riêng |
| Case chưa có Project/policy | Party bắt buộc; Order/Project/policy nullable lúc intake; warranty adjudication cần verified policy/context; không ép Project giả |
| Metric/conversion lệch giữa tài liệu | paid CPL chỉ paid-source có bằng chứng; definition_version không tạo Purchase mới; cash/order/revenue tách riêng |
| ERD và state chưa đồng bộ với prose | Optional Case/Receipt refs, nhiều Fact/Rule/Outcome sources; typed precondition và cancel; FAILED→VALIDATED→READY, không direct retry |

Kết luận reviewer bos_acceptance_plan sau reread và kiểm lại fixture:

| Mã | Kết quả thiết kế / căn cứ |
|---|---|
| A01 | DESIGN_PASS — một boundary, sáu miền; miền mở rộng có nội dung/contracts |
| A02 | DESIGN_PASS — sáu phần Marketing, ma trận kênh, nối CRM/đơn/tiền |
| A03 | DESIGN_PASS — authority theo field, façade một writer, revision/scope; ERD đồng bộ |
| A04 | DESIGN_PASS — intake độc lập AI, durable ACK/dedup, native/Organic và handoff có bằng chứng |
| A05 | DESIGN_PASS — ma trận quyền, C0–C3, bốn cửa, digest/TTL/recheck; sai scope bị chặn |
| A06 | DESIGN_PASS — UNKNOWN/readback/lease/fence/callback/cancel/restore, không blind retry |
| A07 | DESIGN_PASS — Paperclip/runtime/gateway/cap rõ, quyền hẹp và không đường bypass được cho phép |
| A08 | DESIGN_PASS — ADR n8n so trách nhiệm/TCO/license, đề xuất có điều kiện |
| A09 | DESIGN_PASS — ROM/UNPRICED rõ, Marketing130 triệu riêng, netting không cộng trùng |
| A10 | DESIGN_PASS — trace A/I→contract→T→evidence, phân biệt thiết kế/fixture/live |
| A11 | DESIGN_PASS — P0–P5/B00–B12 đủ phụ thuộc, nguồn lực, acceptance và rollback để giao xây |
| A12 | DESIGN_PASS — chỉ docs/fixture/read có giới hạn; thiếu nguồn/lựa chọn mở được ghi trung thực; không thay runtime |

Root đóng gói **DESIGN_COMPLETE** sau khi các finding đã sửa và kiểm lại. bos_channels_decisions đã reread contracts cùng phần kênh/n8n, không còn blocker trong phạm vi đó sau sửa paid-source. Root đối chiếu thêm ký hiệu ERD với Mermaid docs chính thức; parser Mermaid vẫn NOT_RUN. Đây là nghiệm thu **gói thiết kế**, các lựa chọn vẫn PROPOSED. Không nâng bất kỳ T01–T32 live nào lên PASS.

## 5. Giới hạn còn phải kiểm khi xây

Effective ACL/RLS/auth/network egress; cryptographic replay defense; transaction/concurrency/fencing; immutable snapshot/revision thực; mapping/authority tiền; readback/entitlement từng provider; callback/cancel/usage thực; retention/license use case; restore/RPO/RTO/failover; SLO/owner; giá và cap AI/sản phẩm; tác động thực với khách/đơn/tiền. Các khoảng này có contract/backlog/test/owner role; không được che bằng trạng thái test xanh của mô hình.
