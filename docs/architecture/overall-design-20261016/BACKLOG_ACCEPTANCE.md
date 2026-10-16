# BOS-ARCH-DESIGN-01 — Backlog và kế hoạch nghiệm thu

Ngày thiết kế: **16/10/2026, Asia/Ho_Chi_Minh**. Baseline mã nguồn đọc: `fe3f4398ebf2186596c108a7570f83e3bbef104a`. Tài liệu này là **thiết kế để giao xây dựng**, không phải lệnh setup, phát hành hoặc vận hành. Xem [SUMMARY](SUMMARY.md), [hợp đồng](CONTRACTS.md), [nguồn lực](RESOURCES.md) và [bằng chứng](EVIDENCE.md).

## 1. Ý nghĩa trạng thái và phạm vi kiểm

| Trạng thái | Ý nghĩa và bằng chứng được phép kết luận |
|---|---|
| `DESIGN_REVIEW` | Review sự đầy đủ/nhất quán của tài liệu tại diff/SHA cụ thể. Không chứng minh một endpoint đã tồn tại. Kết quả thực tế ghi trong EVIDENCE. |
| `LOCAL_DESIGN_CHECK` / `PROTOTYPE` | Kiểm schema, ví dụ và giả thuyết bằng dữ liệu tổng hợp, không credential, không mạng có tác dụng. Tên kiểm, lệnh, đầu vào, expected/actual và giới hạn phải có trong EVIDENCE. |
| `NOT_RUN` | Ca xây dựng/staging/live chưa chạy trong đợt này; toàn bộ T01–T32 bên dưới giữ trạng thái này. |
| `BUILT` → `TESTED` → `PILOT_OBSERVING` → `PILOT_ACCEPTED` → `LIVE_READY` → `LIVE_ACCEPTED` | Mốc tương lai theo từng luồng, từng môi trường, từng phiên bản. Không nâng mốc từ việc mở được UI, có HTTP 202 hoặc fixture xanh. |

Review thiết kế A01–A12 là gate bàn giao tài liệu. Các gate xây dựng bên dưới chuẩn bị cho nhiệm vụ sau; việc mô tả gate không tự mở quyền thực hiện. Kết quả kiểm mã lịch sử trong repo vẫn giữ ngày/môi trường/SHA gốc, không đổi thành lần kiểm hiện tại.

## 2. Giai đoạn xây dựng có giới hạn

Ưu tiên đầu là một lát Marketing–Sales VPT, nhưng nền dữ liệu/quyền/thực thi dùng chung phục vụ cả đơn, tiền, dự án và chăm sóc. Chỉ xây các phần lõi cần cho lát được mở, tránh chờ toàn bộ sản phẩm hoặc dựng workflow engine tổng quát.

| Giai đoạn | Đầu ra hữu hạn | Đầu vào / phụ thuộc | Gate trước khi mở tiếp | Dừng và hoàn tác dự kiến |
|---|---|---|---|---|
| P0 — Chốt baseline xây | B00; manifest SHA/schema/API/runtime, mapping tenant/company được người có thẩm quyền xác minh, danh sách writer/lịch, nguồn chuẩn theo trường, tập fixture và baseline đo giờ công | Gói thiết kế này; quyền đọc hợp lệ; đầu mối CRM, tài chính, vận hành | Chỗ chưa biết có owner và ảnh hưởng; không dùng tên connector làm bằng chứng quyền; chốt acceptance fixture, không đổi luồng thật | Chỉ bỏ tài liệu/cấu hình thử chưa kích hoạt; không tác động nguồn hiện hành |
| P1 — Nền dùng chung tối thiểu | B01, phần nền B02/B03, B04 nếu lát có AI, B10; query/fact, scope, inbox, policy/decision/command/receipt, reservation và vận hành tắt tác dụng ngoài | P0; quyền/ngân sách/nguồn tài nguyên cho nhiệm vụ xây riêng; chọn đúng source writer | T01/T03/T05/T06/T10–T18 liên quan đạt trên staging cô lập; AI chưa tham gia thì phần AI giữ tắt. Đường nhận khách hoạt động khi AI dừng | Ngắt dispatcher mới, fence worker, đối soát UNKNOWN, rollback adapter/schema theo kế hoạch forward-compatible; không phát lại mù |
| P2 — Marketing–Sales VPT | B02 hoàn chỉnh, B05 và phần tối thiểu B09: một nguồn form + một native lead đủ quyền; Party/Need, người nhận/ACK, nội dung/campaign ở draft, báo cáo coverage; chỉ mở một loại command có gate riêng | P1; consent/owner/SLA/nguồn có chứng cứ; capability từng nguồn; hợp đồng CRM cũ đã map | T02/T04/T07/T08/T14/T21/T22/T27–T31 liên quan đạt; có một writer, trace nguồn → inbox → CRM → người nhận; budget kỳ còn thiếu thì không chi; bật kênh theo từng nguồn, không suy từ nguồn khác | Giữ receiver/bộ đệm, dừng write/dispatch mới trước đổi chủ; trả writer cũ sau đối soát; lịch/binding chưa bật tiếp tục tắt |
| P3 — Báo giá đến giao giá trị và chăm sóc | B06/B07/B08/B09: quote acceptance → order → giao việc/project → bàn giao → ServiceCase; payment/refund và direct-cost readback | P1; P2 cho nguồn/handoff; nguồn báo giá/đơn/kế toán, owner nghiệm thu/bảo hành được chỉ định; đối soát mẫu nguồn | T09/T16/T17/T19/T23–T29/T32 đạt trong phạm vi; tiền thu có chứng từ, thiếu cost không báo lãi; nghiệm thu giao lắp tách khách chấp thuận báo giá | Ngắt từng adapter mới, giữ nguồn nghiệp vụ chính, giữ ID/bằng chứng và adjustment; chuyển tài chính không dùng xóa chứng từ để rollback |
| P4 — Pilot đo giá trị, công ty thứ hai | B11, hoàn B09/B10; cấu hình gói nghiệp vụ có version, kiểm A1/A2/B1 và thứ tự chuyển writer; pilot quan sát | P2/P3 liên quan đạt; mapping VPT/Phúc Đạt xác minh; baseline công sức; hỗ trợ/khôi phục/giới hạn tài nguyên đủ | Gate pilot V3.1 ở mục 8, cách ly toàn tuyến và restore riêng đạt. Chỉ mở thêm công ty bằng scope/binding đã duyệt; không mở SaaS chung từ một công ty pilot | Dừng phạm vi công ty mới, bảo toàn intake, thu hồi binding/credential phạm vi đó; không hồi phục tenant bằng ghi đè dữ liệu công ty khác |
| P5 — Sản phẩm nhiều khách thuê, hoãn có điều kiện | B12: onboarding, lifecycle/billing, package compatibility, support và unit economics | P4; license use case xác minh; tải/khôi phục/chi phí phục vụ đo được; nhiệm vụ riêng | T01/T18/T20/T27 và bộ support/export/delete đạt; hợp đồng khách và kinh tế gói đủ; chưa có lịch go-live | SUSPENDED/OFFBOARD có chính sách nhận/giữ sự kiện rõ; xuất/lưu/xóa theo chính sách, không tự xóa vì billing lỗi |

P1 không đòi xây đầy đủ AI trước khi nhận khách. P2 không được ghi quảng cáo hoặc gửi khách khi các phần policy, budget, consent và command của chính hành động đó chưa đạt. Mỗi gate có owner duy nhất trong nhiệm vụ xây; mặc định kỹ thuật là lead xây, nghiệp vụ là chủ miền, phát hành là người có quyền tương ứng.

### Gap từ code hiện tại phải đóng trước lát liên quan

Inventory ở baseline đã chỉ ra những đường cần hardening, không được coi mọi chức năng có tên là dùng lại nguyên trạng (nguồn/line và giới hạn kiểm ở EVIDENCE):

- **B01/B02:** `external.js` có đường tìm Customer theo phone/email thiếu company filter; `tenantGate.js` có nhánh bỏ qua thiếu tenant/legacy/platform/system. Cổng BOS mới phải resolve identity/membership/binding và fail closed; service identity chỉ nhận scope hẹp đã xác minh. Case cần chứng minh cùng phone/email A1/A2/B1 không lookup/link chéo và thiếu tenant không trở thành toàn quyền. Không mở sửa quyền toàn bộ legacy trong đợt thiết kế.
- **B02/B10:** route Zalo có ACK 200 trước durable save và đường thiếu chữ ký có thể đi tiếp. Nguồn này giữ `UNVERIFIED/NOT_READY` cho intake BOS tới khi missing/invalid auth bị chặn, binding đúng scope, save bền vững thành công rồi mới ACK và crash-before-persist buộc nguồn retry. T01/T07/T10/T30/T31 phải bao gồm phản ví dụ này; không sửa endpoint thật ở đợt này.
- **B06/B09:** có hai đường ghi tiền `/accounting/deals/:leadId/payments` (`crm_deal_payments` + mirror) và `/crm/invoices/:id/payments` (`payment_records`). Phải đăng ký authority/source theo từng loại giao dịch, đối soát ID/mirror, façade và kế hoạch chuyển writer; không dựng ledger tiền thứ ba hoặc cộng cả mirror vào tổng thu. T09/T24/T32 phải cover giao dịch nguồn trùng, lệch, timeout và cutover cả hai đường.
- **B05/B09:** Google bridge có spend/CPL/ROAS `null`; đây là thiếu dữ liệu provider, không số 0 và không bằng chứng báo cáo hiệu quả hoàn chỉnh. T19/T29/T31 yêu cầu UNKNOWN/coverage và cost model tương ứng; không suy giá trị từ số click hoặc tên connector.

## 3. Backlog đủ để giao việc

Ước lượng dưới đây là **ngày công (NC), 1 NC = 8 giờ**, dùng cho lập ngân sách sau này, chưa phải báo giá hoặc lịch. Giả định người làm biết Express/React/PostgreSQL, có quyền đọc/source sandbox hợp lệ, không migration dữ liệu hàng loạt, không phát triển ERP/kế toán chuyên sâu, 1 nguồn form + 1 native lead ở P2. Khoảng bao gồm code, test và sửa review trong phạm vi từng việc; effort chung QA/DevOps đã có trong hàng liên quan, không cộng đôi nếu một người kiêm vai. Thời gian chờ quyền/provider/nghiệp vụ không có trong NC. Nếu inventory phát hiện khác nguồn/schema, phải ước lượng lại trước mở việc; không dùng con số để cam kết hoàn thành.

| ID / mục tiêu | Miền, module và hợp đồng | Đầu vào, phụ thuộc | Owner / kỹ năng cần có | Độ lớn có giả định | Tiêu chí bàn giao / rollback |
|---|---|---|---|---|---|
| B00 — Baseline và kế thừa | Toàn hệ; inventory, writer/schedule registry | Brief, repo/SHA, hồ sơ vận hành; P0 | Technical lead + BA; đọc code/SQL/runtime, phân biệt code và deployment | 3–6 NC; không kiểm vận hành có tác dụng | Manifest có thời điểm, quyền và phiên bản; dùng lại/bổ sung/hoãn/thay có lý do, gap có owner; rollback tài liệu/config thử |
| B01 — Scope và authority | L3/L10, mọi miền; C-QUERY/C-FACT/C-CONSENT | B00; identity/membership/binding và source map từng trường | Backend lead + PostgreSQL/RLS + BA/QA quyền | 5–9 NC; giữ dữ liệu nguồn, không chuyển toàn DB | A1/A2/B1 read/write/FK/export/job không rò; snapshot quyết định tái dựng, UNKNOWN không thành 0; rollback read adapter/compat layer, giữ source |
| B02 — Nhận khách và bàn giao | Marketing + CRM, receiver/assignment; C-INGEST/C-HANDOFF/C-FACT | B01; nguồn form/native, owner/SLA/lịch ca và event keys | Backend/integration + CRM owner + QA lỗi đồng thời | 5–9 NC; hai đường vào, reuse inbox/receipt hiện hữu có gap test | ACK sau durable commit; retry không tạo đôi; assigned/delivered/accepted/first_response tách; queue thiếu owner; rollback bằng writer fencing và giữ inbox |
| B03 — Chính sách đến tác dụng | L4–L6/L10; C-ACTION/C-COMMAND/C-RECEIPT/C-BUDGET | B01, loại command hữu hạn đầu tiên; rule/approval registry | Backend/domain lead + security/QA fault injection | 7–12 NC; một command ngoài, một command nội bộ; không engine tổng quát | C0–C3/Pháp–Lệ–Lý–Tình, recheck TTL/hash/revision/right/consent; lease/fence, UNKNOWN readback; ý định hủy bền vững chặn retry sau xác minh không có tác dụng; rollback dừng dispatch, đối soát rồi đổi writer |
| B04 — AI có giới hạn | L7/L10, Paperclip/runtime gateway; C-AI/C-BUDGET/C-RECEIPT | B01/B03; manifest runtime/capability, secret proxy, trần chi UNSET thì không gọi | AI integration + backend/DevOps/QA; adapter/callback/cancel/usage | 5–9 NC; hai vai trò, một run đồng thời pilot; fixture trước model thật | Mỗi attempt/reviewer giữ chỗ; callback giả/lặp/muộn/mất và cancel/UNKNOWN không lách cap; AI hoàn thành không đóng business work; rollback tắt adapter/run mới, reconcile usage |
| B05 — Sáu phần Marketing | L3/L8/L9 + module Marketing; C-CONTENT/C-CAMPAIGN/C-CONSENT/C-ACTION/C-FACT/C-HANDOFF | B01/B02; phần ghi phụ thuộc B03; mục tiêu/kỳ/nguồn/rights/ma trận kênh | BA Marketing + backend + frontend + QA | 8–14 NC; form/native pilot; kết nối còn lại khai báo capability và backlog riêng | Plan/version, Content/Asset rights/approval, native mapping campaign, journey/source/consent, handoff, measurement có coverage; rollback dừng publish/action mới, không xóa nội dung đã phát, retract qua command riêng |
| B06 — Đơn/thu/hoàn và chi phí | Sales + tài chính; C-ACTION/C-PAYMENT/C-FACT/C-COMMAND/C-RECEIPT | B01/B03; Quote/Order được chọn nguồn; hệ tiền/chứng từ và canonical conversion ID | BA Sales/finance + integration/backend + QA đối soát | 7–12 NC; một nguồn tiền readback; không kế toán đầy đủ | Tách acceptance/order/payment; conversion không nhân từ sửa revision; partial/full refund có adjustment; đối soát source, TEST không doanh thu; rollback giữ lịch sử/compensation, không xóa khoản thu |
| B07 — Giao giá trị | Project/Work Unified/delivery; C-PROJECT/C-ACTION/C-FACT | B06 order accepted; Work owner/deadline/reservation và phần mềm vận hành hiện có | BA vận hành + backend + frontend/QA | 6–10 NC; một pipeline dự án, reuse Work Unified | Order tạo liên kết project/work idempotent; owner/mốc bàn giao/bằng chứng; capacity xung đột; chỉnh scope bị chặn; rollback connector mới và đối soát việc đã tạo |
| B08 — Chăm sóc/bảo hành | ServiceCase + CRM/project; C-SERVICE/C-CONSENT/C-ACTION/C-FACT | B01/B03; B06/B07 cho ca liên quan đơn/dự án; chính sách thực được người có quyền cung cấp (UNSET thì chưa tự kết luận bảo hành) | BA dịch vụ + backend/frontend + QA quyền | 5–9 NC; một loại case, không xây call-center platform | Case có Party, Order/Project khi có căn cứ; không tạo dự án giả để nhận hỗ trợ. Assign/respond/schedule/resolve/reopen, quyền liên hệ và evidence; WAITING_POLICY chưa kết luận eligibility/cam kết tiền; không tự đóng vì AI xong; rollback giữ case/hẹn, ngắt outbound mới |
| B09 — Cockpit/đo/lọc học | L8/L9 + mọi miền; C-QUERY/C-FACT/C-OUTCOME/C-BUDGET/C-PAYMENT | B02/B05; tài chính B06, giao giá trị B07, dịch vụ B08 mở thêm dần | Analytics/backend/frontend + BA; definition/cohort/window/coverage | 6–10 NC; sáu góc nhìn dùng nguồn chuẩn, không BI warehouse đầy đủ | Trace nguồn→need→quote/order→payment→project/service; unknown cost không lợi nhuận; DRAFT luật học; phạm vi company tổng hợp rõ; rollback projection/view không sửa source |
| B10 — Quan sát/khôi phục/chuyển writer | L2/L6/L10; C-INGEST/C-COMMAND/C-RECEIPT/C-AI/C-BUDGET | B00/B01/B03; backup/credential/RPO/RTO/on-call được chốt | DevOps + backend + QA diễn tập cô lập | 5–9 NC; một đường fail/restore sandbox; không cam kết HA | Test sink cảnh báo, retention/PII, load/degraded mode, restore tắt outgoing, fence worker cũ, reconcile UNKNOWN; rollback bản triển khai sau đối soát |
| B11 — Nhân bản công ty có kiểm | Tất cả miền; scope/binding/package config | B02–B10 phần pilot; mapping pháp nhân/tenant do owner xác nhận | Technical lead + BA + QA độc lập + support | 4–8 NC; một công ty thứ hai, không tenant SaaS tự phục vụ | A1/A2 cùng tenant, B1 khác tenant qua mọi đường; package version/rollback; pilot baseline giá trị; rollback phạm vi công ty mới, giữ công ty cũ |
| B12 — Product lifecycle và self-service (HOÃN) | L10/package/billing/support; C-QUERY/C-ACTION/C-COMMAND/C-FACT | B11; license use case, package economics, SLA/support/load/retention rõ | Product/backend/DevOps/security/finance/support | **UNESTIMATED** tới khi có P4/định giá/lifecycle source. Không gán hạn giả | T20/T18/T27 đạt + điều kiện P5; billing không tự nâng quyền; rollback gói/lifecycle có audit, bảo toàn export và chính sách lưu |

B00–B11 cộng thô **66–117 NC** với các giả định trên, không gồm B12 và không phải phạm vi cần xây hết trước P2. Đây là ROM phục vụ phân rã; mỗi issue thực tế cần cập nhật estimate theo source/hợp đồng đã xác minh. Person-day không đổi thành số ngày lịch khi chưa có năng lực đội và phụ thuộc. Người nghiệm thu độc lập với người tạo tác dụng tài chính/phê duyệt quyền theo role matrix, không tự nhận review đồng nghĩa phê duyệt phát hành.

## 4. Bất biến xuyên backlog

ID giữ nguyên thứ tự mục 6 brief; chi tiết chuẩn ở CONTRACTS/ARCHITECTURE. Bất biến không đạt chặn phần tác dụng liên quan dù chỉ số kinh doanh tốt.

| ID | Yêu cầu không được làm yếu | Contract / backlog / ca bắt buộc |
|---|---|---|
| I01 | Receiver xác thực/binding, durable inbox trước ACK; không cần AI | C-INGEST; B02/B10; T07/T10/T30 |
| I02 | Scope + integration + source_event_id + event_type; same key/hash kết quả cũ, khác hash CONFLICT; retry giữ khóa | C-INGEST/C-COMMAND; B02/B03; T03/T04/T05 |
| I03 | Authority theo trường, một writer, revision/evidence/freshness; học không sửa fact nguồn | C-FACT/C-QUERY; B01/B09; T16/T19/T29/T32 |
| I04 | Backend resolve tenant/company/membership/binding; không tin scope hoặc verified tự khai | Tất cả C-*; B01/B11; T01/T11/T18/T27 |
| I05 | Một registry, C0–C3, bốn cửa; điều cấm/sai scope REJECTED, không phê duyệt mềm để vượt | C-ACTION/C-COMMAND; B03; T06/T11/T15 |
| I06 | Decision gắn payload hash/target/fact/rule/actor/TTL/state/approval/reservation; kiểm lại trước tác dụng | C-ACTION/C-COMMAND/C-CONSENT; B03; T06/T15/T17/T21/T22 |
| I07 | Lease/fence, inbox/outbox/audit; UNKNOWN đối soát, receipt pure read, không exactly-once tuyệt đối | C-COMMAND/C-RECEIPT; B03/B10; T03/T05/T10/T12/T32 |
| I08 | L10 một cap ledger; Paperclip quota con; reserve từng attempt/retry/reviewer; usage unknown chưa hoàn | C-BUDGET/C-AI; B03/B04; T13/T17/T28 |
| I09 | AI là năng lực chung, runtime sau adapter; agent không credential ghi vòng ngoài | C-AI/C-ACTION; B04; T11/T12/T13 |
| I10 | business_work_item_id, ai_task_id, ai_run_id, workflow_execution_id riêng; callback auth/version; task done không kết luận đơn/tiền | C-AI/C-HANDOFF/C-PROJECT/C-SERVICE; B04/B07/B08; T12/T25/T26 |
| I11 | Conversion identity theo scope/account/order-or-transaction/type; sửa revision không tạo conversion; refund có adjustment ID riêng | C-PAYMENT/C-FACT; B06/B09; T09/T23/T24 |
| I12 | Health/owner/retention/secrets/isolated restore; tenant restriction, degraded intake và chuyển writer không mất khách | C-INGEST/C-RECEIPT/C-AI; B10/B11/B12; T10/T14/T18/T20/T30/T32 |

## 5. T01–T20: giữ mapping gốc V3.1

Nguồn: `BUSINESS_AI_OS_KIEN_TRUC_V3_1_SAN_PHAM_20261016.pdf`, trang 21 (T01–T10) và trang 22 (T11–T20), đọc 16/10/2026. Cột điều kiện giữ nội dung nguồn; cột kế hoạch bổ sung chỉ ánh xạ hợp đồng và bằng chứng, không đổi tên/đánh lại số nguồn. **Trạng thái mọi ca tương lai: NOT_RUN**.

| Ca nguồn | Điều kiện PASS nguồn | Contract / bằng chứng cần thu | Trạng thái |
|---|---|---|---|
| T01 — Tenant / quyền | Giả tenant/company/account, dữ liệu chéo VPT/Phúc Đạt bị chặn ở đọc và ghi; membership/scope thu hồi có hiệu lực. | Mọi C-*; EV-02 + EV-03; bổ sung fixture A1/A2/B1 và đủ CRUD | NOT_RUN |
| T02 — Owner | Owner inactive/sai phạm vi không nhận; có hàng chờ người xử lý; ACK không tự suy từ assigned. | C-HANDOFF; EV-04 | NOT_RUN |
| T03 — Trùng đồng thời | Cùng event/command tạo một tác dụng trong thử nghiệm; khác hash cùng khóa thành CONFLICT; retry giữ khóa. | C-INGEST/C-COMMAND; EV-05, khóa gốc + run đồng thời | NOT_RUN |
| T04 — Nhu cầu mới | Cùng Party có Need mới đúng luật; không gộp sai hoặc gộp xuyên company. | C-INGEST/C-FACT; EV-02/EV-05 | NOT_RUN |
| T05 — Mất phản hồi | Đã có thể ghi nhưng mất response: UNKNOWN, readback theo ID; không tạo lead/conversion/lệnh thứ hai. | C-COMMAND/C-RECEIPT/C-PAYMENT; EV-05/EV-06 | NOT_RUN |
| T06 — Decision hết hiệu lực | Đổi payload/rule hard block, thu hồi quyền/consent, hết TTL, vượt cap hoặc version đổi bị chặn/review trước execute. | C-ACTION/C-COMMAND/C-CONSENT/C-BUDGET; EV-03/EV-06 | NOT_RUN |
| T07 — Nguồn | Organic/paid/native giữ đúng qua trang và form; trace từ nguồn tới lead; thiếu evidence thành UNKNOWN. | C-INGEST/C-FACT/C-HANDOFF; EV-04/EV-07 | NOT_RUN |
| T08 — Bàn giao | Assigned/delivered/accepted/first_response phân biệt; quá hạn đúng lịch/ca có ngoại lệ và người nhận. | C-HANDOFF; EV-04; lịch Asia/Ho_Chi_Minh/ca/version | NOT_RUN |
| T09 — Purchase | Unpaid/canceled/TEST không thành tiền thu; sửa order không nhân Purchase; refund/adjust liên kết conversion gốc. | C-PAYMENT/C-FACT; EV-08 | NOT_RUN |
| T10 — Khôi phục | Gián đoạn trước durable ACK không báo thành công; restore không phát ngoài ý muốn; khóa writer cũ, xử lý lease/outbox đúng. | C-INGEST/C-COMMAND/C-RECEIPT; EV-09 | NOT_RUN |
| T11 — Workflow vượt quyền | Sửa workflow gọi DB/Ads trực tiếp, URL tùy ý hoặc nâng scope vẫn bị chặn tại mạng/credential/service. | C-ACTION/C-COMMAND/C-AI; EV-03/EV-10 | NOT_RUN |
| T12 — Callback | Giả/lặp/muộn/mất callback xử lý đúng; 202 chưa hoàn tất; GET receipt không gây write. | C-AI/C-RECEIPT; EV-06/EV-10; task-only callback không cần Command giả, nếu báo effect phải liên kết đúng Command thật | NOT_RUN |
| T13 — Cap và tải | Model retry/reviewer, run thủ công/phụ không lách cap; fairness theo tenant; provider timeout không hoàn reservation tùy tiện. | C-BUDGET/C-AI; EV-10/EV-11 | NOT_RUN |
| T14 — Dữ liệu / cảnh báo | Tiếng Việt, số, ngày đúng; export/log không chứa secret/PII thừa; cảnh báo tới test sink/người trực được phép. | C-QUERY/C-FACT/C-RECEIPT; EV-02/EV-09 | NOT_RUN |
| T15 — Luật xung đột | Luật cứng không bị luật company/LEARNED ghi đè; version/expiry/UNKNOWN và cấp duyệt chạy đúng bảng chính sách. | C-ACTION/C-COMMAND/C-FACT; EV-03/EV-06 | NOT_RUN |
| T16 — Sự thật đổi | Sửa dữ liệu hoặc event đến muộn vẫn tái dựng được input revision lúc quyết định; VERIFIED có chủ và chứng cứ. | C-FACT/C-ACTION; EV-02/EV-06 | NOT_RUN |
| T17 — Giữ công suất | Hai lệnh tranh một suất: tối đa một reservation hợp lệ; hủy/timeout giải phóng đúng khi đã xác minh trạng thái. | C-BUDGET/C-COMMAND/C-PROJECT; EV-05/EV-11 | NOT_RUN |
| T18 — Cách ly toàn tuyến | Queue/cache/file/search nếu có, callback/export/support không rò tenant; restore riêng không mở writer; tenant khóa không tiếp tục ghi. | Mọi C-*; EV-03/EV-09/EV-12 | NOT_RUN |
| T19 — Lãi / học lại | Thiếu cost không báo lãi thật; definition/cohort/window/version được lưu; outcome sửa phải đánh giá lại; agent chỉ tạo DRAFT. | C-FACT/C-OUTCOME/C-PAYMENT/C-QUERY/C-ACTION; EV-07/EV-08 | NOT_RUN |
| T20 — Onboarding / package | Tạo, pause, offboard và nâng/rollback gói ngành không rò/mất dữ liệu hoặc cấp quyền rộng; billing không kích hoạt quyền ngoài gói. | C-ACTION/C-COMMAND/C-FACT/C-QUERY; EV-12 | NOT_RUN |

## 6. Ca bổ sung cho toàn hệ thống

Fixture tổng hợp chung: **tenant A có company A1/A2; tenant B có company B1**. Đây là định danh giả, không khẳng định VPT/Phúc Đạt hiện cùng tenant. Có actor A1, actor A2, actor tổng hợp A1+A2 chỉ đọc, actor B1, integration binding A1, worker A1, support grant A1 có TTL, actor bị thu hồi. Mỗi bước gửi ID tồn tại ở company khác và ID không tồn tại để kiểm cả IDOR/lộ sự tồn tại; không trả dữ liệu nguồn trong lỗi scope.

| Ca bổ sung | Hành vi/phản ví dụ và kết quả kỳ vọng | Contract / bằng chứng | Trạng thái |
|---|---|---|---|
| T21 — Content/Asset và quyền sử dụng | Asset có source/evidence/usage-rights/expiry/company; Content version và channel variant tham chiếu đúng asset. Rights chưa rõ/hết hạn hoặc thu hồi trước publish → chặn; revision mới cần phê duyệt/hash mới; draft không tự published; read/download URL không lộ asset A2/B1 | C-CONTENT/C-CONSENT/C-ACTION/C-COMMAND; EV-13 | NOT_RUN |
| T22 — Campaign đa kênh | Plan chung giữ mục tiêu/kỳ/budget/version, native campaign/adgroup/adset/ad IDs theo source, không ép schema đồng dạng. Source/account sai scope, capability UNVERIFIED hoặc cap/approval stale → REJECTED/WAITING_INPUT đúng loại. Chạy/pause/đổi ngân sách qua command, timeout giữ UNKNOWN, readback theo native ID | C-CAMPAIGN/C-ACTION/C-BUDGET/C-RECEIPT; EV-11/EV-13 | NOT_RUN |
| T23 — Quote acceptance → Order | Quote revision được khách chấp thuận có evidence tạo một order; acceptance revision khác/expired/canceled không thực thi. Sửa quote sau acceptance không sửa bản đã chốt; sửa order không tạo conversion hoặc tự thu tiền; hủy order ghi lý do và xử lý phụ thuộc | C-ACTION/C-FACT/C-PAYMENT/C-PROJECT; EV-08 | NOT_RUN |
| T24 — Payment/Refund/đối soát | Pending/failed/TEST và trang cảm ơn không là tiền thu. Partial/full receipt theo transaction/source evidence; duplicate webhook không cộng đôi; mất response UNKNOWN. Cùng giao dịch qua `crm_deal_payments`/mirror và `payment_records` phải chỉ một authority/canonical transaction, không cộng đôi hoặc có hai writer cạnh tranh. Refund/adjustment ID riêng tham chiếu original, tổng hoàn không vượt phần được phép, ngoại tệ/tax/fee chưa rõ không tự tính; source lệch → đối soát, không sửa để số đẹp | C-PAYMENT/C-INGEST/C-FACT/C-COMMAND/C-RECEIPT; EV-08/EV-11 | NOT_RUN |
| T25 — Project/giao giá trị | Một order đủ điều kiện có thể chia nhiều execution unit (đợt/xưởng/phần giao); mỗi unit_key tạo/link đúng một project + work items của nguồn hiện hữu, duplicate handoff không tạo đôi. Stage/owner/capacity/expected revision đúng scope; bàn giao từng phần có bằng chứng và người có quyền; AI xong không tự đóng việc/hoàn thành lắp hoặc đóng toàn order còn unit mở. Hủy/đổi lịch xử lý reservation và báo phụ thuộc | C-PROJECT/C-HANDOFF/C-ACTION/C-FACT; EV-14 | NOT_RUN |
| T26 — ServiceCase/bảo hành | Case có Party; order/project/policy chỉ gắn khi có nguồn thật. Case OPEN/TRIAGED/WAITING_POLICY nhận được khi chưa có project hoặc policy, không tạo liên kết giả; đủ policy/object evidence trước kết luận warranty eligibility hay cam kết bồi thường. Owner/hẹn phản hồi, resolve/reopen có evidence; hết/thiếu policy không tự công nhận/từ chối quyền bảo hành; escalation có owner. Contact permission theo mục đích/kênh, revoke chặn outbound tiếp theo; case closed không đổi trạng thái payment/project; reopen không nhân case | C-SERVICE/C-CONSENT/C-ACTION/C-FACT; EV-14 | NOT_RUN |
| T27 — Quyền xuyên miền A1/A2/B1 | CRUD và FK Party→Need→Content/Campaign→Quote/Order→Payment→Project→ServiceCase đều cấm link chéo company/tenant. Kiểm query/list/aggregate/search/export/file/queue/cache/callback/job và support grant hết TTL. Quyền tổng hợp A1+A2 không đồng nghĩa dùng chung audience, quyền ghi hay training; tenant suspended chặn command, intake giữ theo mode đã chốt | Mọi C-*; EV-03/EV-12/EV-14 | NOT_RUN |
| T28 — Ledger ngân sách | 130 triệu là marketing, không trả host/LLM/xây sản phẩm; period UNSET thì không phát lệnh chi. Actual/commitment/reservation/tax/fee/contingency có obligation ID và chuyển trạng thái netting; hai command tranh phần cuối chỉ một reserve, không cộng đôi reserve đã thành spend. Usage/cost unknown không tự giải phóng; revision kỳ budget không reset khoản còn nợ | C-BUDGET/C-CAMPAIGN/C-AI/C-PAYMENT; EV-11 | NOT_RUN |
| T29 — Cockpit/6 Hệ và outcome | Mỗi góc nhìn mục tiêu/hiện trạng/chênh lệch/owner/next action liên kết fact revision/coverage/as_of; không có sổ khách/tiền riêng. Quote/order/cash/delivery/service tách số; sửa/refund đến muộn restate cohort có version. CPL chỉ tính mẫu số hợp lệ và cost đủ; attribution không tự kết luận nhân quả; học chỉ DRAFT | C-QUERY/C-FACT/C-OUTCOME/C-PAYMENT/C-BUDGET; EV-02/EV-07/EV-08 | NOT_RUN |
| T30 — Chế độ suy giảm | Tắt AI/Paperclip/runtime/worker/adapter nguồn theo fault fixture: receiver còn bền vững hoặc báo lỗi trước ACK để source retry đã kiểm; ghi rõ latency/backlog/owner. Zalo crash trước persist không ACK thành công; thiếu/sai chữ ký/token không vào inbox nghiệp vụ. AI tắt không mất intake; CRM lỗi sau ACK giữ inbox retry/backoff không tạo tác dụng đôi. Không cho secret/model key fallback đi vòng | C-INGEST/C-AI/C-RECEIPT; EV-05/EV-09/EV-10 | NOT_RUN |
| T31 — Capability/nguồn trực tiếp | Form và native lead chạy độc lập, Organic qua trang trong giữ evidence hoặc UNKNOWN; chưa có consent/click ID không bịa. Connector có tên nhưng chưa quyền/capability không thành READY. Google spend/CPL/ROAS null giữ UNKNOWN/coverage, không thành 0 hoặc báo cáo đủ. Kiểm Meta, Google Search/Organic/Display/Demand Gen/Shopping/YouTube, TikTok, Zalo OA/Ads, ChatGPT Ads bằng từng cell capability/source, không suy source này chứng minh source khác | C-INGEST/C-FACT/C-CAMPAIGN/C-CONSENT; EV-04/EV-07/EV-13 | NOT_RUN |
| T32 — Chuyển writer/rollback xuyên miền | Giữ durable intake; dừng/fence writer cũ, giải quyết run/UNKNOWN, đối soát source rồi mở mới một scope. Sau rollback không hai writer, không replay whole outbox, không nhân order/payment/project/case; restore mặc định outgoing/scheduler tắt; event tới trong gián đoạn giữ ID gốc. Ý định hủy được giữ bền: CANCEL_REQUESTED→RECONCILING→CANCELLED khi xác minh không có tác dụng; không đưa lệnh đã hủy về FAILED rồi tự retry. Nếu đã có effect thì giữ kết quả thật và compensation được duyệt riêng | C-INGEST/C-COMMAND/C-RECEIPT/C-FACT; EV-05/EV-09/EV-14 | NOT_RUN |

## 7. Traceability A01–A12 và hồ sơ chứng minh

Các tên EV-* là **loại bằng chứng phải thu trong đợt xây/test sau**, không phải tệp đã được tạo hoặc ca đã đạt. Bằng chứng đọc/kiểm thiết kế thực tế của nhiệm vụ này xem EVIDENCE. Từng EV phải có: environment, timestamp/timezone, baseline/deploy SHA, schema/API/adapter/workflow/rule version, fixture/input đã che, actor/scope/binding, request/event/need/business-work/AI task/run/workflow/decision/command/receipt/native IDs liên quan, expected/actual, raw assertion/readback, reviewer và giới hạn. Chỗ không áp dụng ghi lý do, không bịa ID.

| Evidence ID | Nội dung cần có |
|---|---|
| EV-01 | Manifest code/live tách rõ, resource inventory, diff files, license/capability nguồn và review thiết kế |
| EV-02 | Authority từng trường, revision/snapshot reconstruction, freshness/coverage và query result che PII |
| EV-03 | Identity/membership/binding, cả SELECT/INSERT/UPDATE/DELETE, cross-link và audit deny/revoke; DB role/RLS nếu dùng |
| EV-04 | Trace nguồn→inbox→CRM→assigned/delivered/accepted/first_response; owner inactive/thiếu owner/SLA |
| EV-05 | Fault/concurrency timeline, event/command key và hash, UNKNOWN/readback, lease/fence, số tác dụng ở nguồn đích |
| EV-06 | Decision exact binding, rule/fact revisions, TTL/approval/recheck, read-only receipt và lifecycle transitions |
| EV-07 | Definition/cohort/window/version, source/coverage/cost missing và outcome/re-evaluation/draft proposal |
| EV-08 | Quote acceptance/order/payment/refund trace, source chứng từ và conversion/adjustment reconciliation |
| EV-09 | Isolated restore/degraded mode/cutover/rollback, outgoing-off/network sink, RPO/RTO đo được và alert owner |
| EV-10 | Runtime adapter task/run/callback auth/replay/cancel/usage; gateway-only route và quota subordinate |
| EV-11 | Cap/reservation ledger theo từng attempt/obligation, actual+commitment netting, concurrency/fairness/load/cost |
| EV-12 | Full-route A1/A2/B1 isolation, support/export/file/cache/queue, tenant lifecycle/package/billing/restore |
| EV-13 | Content/Asset rights/version/approval, campaign native IDs/capability source/account, publish/action receipts |
| EV-14 | Project/work/delivery và ServiceCase/reopen trace, order/payment links, cross-domain permission/cutover |

| Yêu cầu | Miền/module chịu trách nhiệm | Contract thiết kế | Ca / invariant | Bằng chứng cần có / đầu ra review thiết kế |
|---|---|---|---|---|
| A01 — Một hệ thống, đủ miền | Executive + Marketing + CRM + Project + Service + Finance; lõi L1–L10 | C-QUERY/C-FACT/C-PROJECT/C-SERVICE/C-PAYMENT | T23–T27/T29; I03/I04/I10 | ARCHITECTURE + sơ đồ tổng thể; EV-01/EV-14; không miền mở rộng là ô trống |
| A02 — Marketing sáu phần | Marketing trong cùng boundary, CRM + Finance feedback | C-CONTENT/C-CAMPAIGN/C-CONSENT/C-HANDOFF/C-FACT/C-OUTCOME | T07/T08/T09/T21/T22/T28/T31; I01/I11 | Capability matrix, lifecycle/content rights, đo nguồn/kết quả; EV-04/EV-07/EV-08/EV-13 |
| A03 — Chủ dữ liệu/scope | L3/L10 + chủ từng miền, read projections | C-FACT/C-QUERY/C-CONSENT | T01/T04/T16/T18/T27/T29/T32; I02/I03/I04 | Authority/ERD/revision và nguồn đã thấy/gap; EV-02/EV-03/EV-12 |
| A04 — Intake không phụ thuộc AI | L1/L2, CRM/assignment | C-INGEST/C-HANDOFF/C-FACT | T02/T03/T07/T08/T10/T30/T31; I01/I02 | Sequence form/native/source/owner; EV-04/EV-05/EV-09 |
| A05 — Quyền/luật/command nhất quán | L4/L5/L6/L10, mọi tác dụng | C-ACTION/C-COMMAND/C-RECEIPT/C-BUDGET/C-CONSENT | T01/T06/T11/T15/T17/T21/T22/T27; I05/I06 | Role/approval/rule matrices, state/error/recheck; EV-03/EV-06/EV-11 |
| A06 — Durable/lỗi/khôi phục | L2/L6/L7/L10 | C-INGEST/C-COMMAND/C-RECEIPT/C-AI | T03/T05/T10/T12/T18/T24/T30/T32; I07/I10/I12 | Fault/cancel/restore/cutover sequences và runbook thiết kế; EV-05/EV-09/EV-10 |
| A07 — AI chung/cap hẹp | Paperclip/runtime adapter/gateway + L10 cap | C-AI/C-BUDGET/C-ACTION/C-RECEIPT | T11/T12/T13/T17/T28/T30; I08/I09/I10 | Adapter responsibilities, call reservation/cancel/usage ownership; EV-10/EV-11 |
| A08 — ADR n8n có điều kiện | Backend worker/integration/scheduler registry | C-INGEST/C-AI/C-COMMAND/C-RECEIPT | T10/T11/T12/T30/T32; I07/I09/I12 | DECISIONS so backend vs optional n8n, license/cost/capability và owner mỗi lịch; EV-01/EV-09 |
| A09 — Nguồn lực/cost/130 triệu | L10 cap, Marketing + tài chính, đội xây | C-BUDGET/C-CAMPAIGN/C-PAYMENT/C-AI/C-OUTCOME | T13/T17/T19/T28/T29; I08/I11 | RESOURCES công thức/UNPRICED, kỳ/thuế/netting/không trộn quỹ; EV-07/EV-08/EV-11 |
| A10 — Trace đến bằng chứng | Toàn gói; QA/reviewer | Toàn C-* | T01–T32, I01–I12 | Ma trận này + EV schema, EVIDENCE tách DESIGN_REVIEW/LOCAL_DESIGN_CHECK/live NOT_RUN |
| A11 — Backlog/gate xây hữu hạn | B00–B12, P0–P5, chủ miền + đội kỹ thuật | C-* theo từng hàng backlog | T01–T32 | Mục 2/3/8: input/dependency/skill/effort/acceptance/rollback; RESOURCES; không gán lịch giả |
| A12 — Không đổi live, báo đúng | Thiết kế/kiểm fixture, không mở hệ đang chạy | Không thực thi C-* lên nguồn thật | T01–T32 vẫn NOT_RUN | Diff chỉ gói tài liệu; EVIDENCE lệnh đọc/kiểm đã chạy, giới hạn/decision mở; deployment/migration/paid call không có |

## 8. Gate pilot, LIVE_READY và kết luận thiết kế

V3.1 trang 22 yêu cầu **ít nhất 20 job đại diện trong ít nhất 3 ngày làm việc thực; ≥90% đạt chất lượng, ≥80% đúng hạn không sửa/gỡ lỗi, 0 sai tenant/quyền/tác dụng trùng trong tập thử**. Đây là gate pilot tương lai, không cam kết độ tin cậy production. Chọn tập có công việc bình thường và lỗi/ngoại lệ đã thiết kế; không chỉ chọn lượt thành công. Công việc mô phỏng không tính vào ngày làm việc thật.

Mục tiêu kế thừa **tiết kiệm ròng ≥20% giờ công cùng loại việc**, tính cả setup phân bổ, review, sửa, đối soát và hỗ trợ trong kỳ thích hợp. Phải có baseline/mẫu so sánh; thiếu baseline hoặc chưa đủ quan sát thì `INCONCLUSIVE`, không dùng tỷ lệ thành công kỹ thuật để thay thế. Giữ n8n cho luồng có lợi ích đo được theo ADR, không tự gỡ trong đợt này.

LIVE_READY theo từng luồng cần: đúng phiên bản/cấu hình; owner/on-call; source rights/binding; approved rules/consent/cap/period; full-scope tests liên quan; restore/cutover/rollback diễn tập cô lập; giới hạn tải và health ngoài tiến trình chính; đối soát UNKNOWN; tài liệu người nhận và escalation. Khách/đơn thật và kết quả kinh doanh được nghiệm thu riêng theo nhiệm vụ có quyền. Mọi sự cố sai tenant/quyền hoặc tác dụng trùng chặn luồng ghi liên quan, giữ intake an toàn và xử lý nguyên nhân trước mở lại.

Kết luận A01–A12 và reviewer cuối của **nhiệm vụ thiết kế** được ghi trong [EVIDENCE](EVIDENCE.md) và [SUMMARY](SUMMARY.md), sau kiểm tính nhất quán toàn gói. Bảng này không tự đóng nhiệm vụ trước khi review; cũng không biến các dữ liệu live chưa xác minh thành lý do bịa hiện trạng hoặc bỏ thiết kế phần độc lập.
