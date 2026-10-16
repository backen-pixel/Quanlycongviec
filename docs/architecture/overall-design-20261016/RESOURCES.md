# BOS-ARCH-DESIGN-01 — Nguồn lực và mô hình chi phí

Ngày lập: **16/10/2026, Asia/Ho_Chi_Minh**. Phạm vi: dự toán thiết kế và điều kiện xây dựng tương lai. **Không mua, setup, deploy, thay ngân sách hoặc gọi model trả phí trong nhiệm vụ này.** Các giá/chứng từ chưa xác minh ghi `UNPRICED`; cấu hình/runtime chưa có bằng chứng tương ứng ghi `UNVERIFIED`. Ngân sách 130 triệu thuộc Marketing, tách khỏi chi phí Business AI OS.

## 1. Căn cứ và độ tin cậy

| Nguồn | Dùng cho kết luận nào | Giới hạn |
|---|---|---|
| Brief `CODEX_THIET_KE_TONG_THE_BUSINESS_AI_OS_V1_20261016.md`, mục 5/6/7/9 | 130 triệu Marketing, một cap chuẩn, mô hình nguồn lực/cost, không hạ tầng thật | Không cấp kỳ ngân sách, đơn giá nhân sự, giá nhà cung cấp, RPO/RTO hoặc quyền chi mới |
| V3.1 PDF ngày 16/10, trang 5/17/18/22 | Tái dùng hạ tầng, không HA/giá giả, quota/restore/pilot và đo tiết kiệm ròng | Thiết kế tham chiếu, không xác nhận edition/host/license/giá thực tế |
| Repo baseline `fe3f4398ebf2186596c108a7570f83e3bbef104a`: `backend/package.json`, `render.yaml`, nguồn CRM/Work/website/AI hiện hữu | Có mã nguồn Express/React/Supabase integration, worker/jobs và config Render để đối chiếu dùng lại | File config/package không chứng minh gói tính phí, số instance thực, hóa đơn, load hay phiên bản deploy |
| `docs/ops/website-qualified-feedback.md` và CURRENT | Bằng chứng lịch sử theo thời điểm cho website/CRM/deployment và giới hạn backup | Không thay kiểm hiện tại hoặc qualification restore; không suy backup đã nghiệm thu failover |
| Inventory có bằng chứng trong [EVIDENCE](EVIDENCE.md) | Trạng thái đọc hiện tại của repo/Paperclip khi có phép kiểm chỉ đọc | Paperclip health/version chỉ chứng minh endpoint tại thời điểm đọc; không chứng minh cap/restore/license/pilot |

Tài liệu không đưa giá cloud/model theo trí nhớ, không chuyển giá niêm yết thành hóa đơn của anh. Khi chốt giá sau này phải lưu URL/chứng từ gốc, ngày kiểm, edition/region/currency/tax/commitment, kỳ và giả định tải. ADR [DECISIONS](DECISIONS.md) ghi nguồn chính thức cho khả năng/giấy phép cần đối chiếu; `UNPRICED` dưới đây không phải báo giá bằng 0.

## 2. Đội xây và công sức

Đơn vị dự toán: **1 NC = 8 giờ công**. B00–B11 trong [backlog](BACKLOG_ACCEPTANCE.md) có ROM **66–117 NC**, chưa gồm SaaS B12. Đây là effort tổng theo giả định từng việc, không phải số ngày lịch và không có hạn giao cam kết. Phân bổ thực tế phải tránh cộng đôi cùng người ở nhiều vai; không giả định tuyển thêm hoặc mua giờ dịch vụ.

| Năng lực / owner | Đã có | Cần bổ sung hoặc xác minh | Công thiết lập | Công bảo trì dự kiến | Chi phí/kỳ và phần chưa rõ |
|---|---|---|---|---|---|
| Technical lead / architecture owner | Repo + gói thiết kế có thể dùng lại | Một người chịu trách nhiệm scope, authority, compatibility và writer registry; tên/capacity `UNVERIFIED` | B00/B01/B03; NC đã nằm backlog | Review change/capability/incident; ước theo số change, không gán FTE thật | `UNPRICED`; NC × đơn giá đã duyệt, đơn giá và kỳ `UNSET` |
| Backend/integration engineer | Code Express/services/domain/jobs/CRM | Kỹ năng transaction, RLS, idempotency/lease, adapters; capacity `UNVERIFIED` | B01–B08/B10/B11 theo phạm vi | Vá lỗi, dependency/security update, source/schema drift và reconcile | `UNPRICED`; phần xây là one-off, bảo trì theo giờ/kỳ |
| Frontend / product UX | React/CRM/Work UI | Cockpit/6 Hệ, content/campaign, evidence/coverage/exception UI; capacity `UNVERIFIED` | B05/B07/B08/B09, không làm UI cho mọi kênh trước | Khả dụng màn mobile, thay schema và permission/UI states | `UNPRICED`; NC × rate, bảo trì theo change |
| QA/reviewer độc lập | Một số test mã hiện hữu để kế thừa, không suy đã chạy lại | Kiểm lỗi/đồng thời/scope A1A2B1, fault/restore, review khác người implement | Acceptance T01–T32 liên quan, đã phân bổ ROM từng việc | Regression theo change, review exception/pilot sample | `UNPRICED`; tách giờ review/test khỏi giờ AI tự nhận đạt |
| DevOps/on-call | Có config Render/backup code; health không bằng restore | Owner, host/edition, RPO/RTO, sandbox, secrets, alert sink, lịch bảo trì | B10 + hỗ trợ B03/B04, đã nằm ROM | Backup/restore drill, patches, monitoring, incident; tải/giờ trực `UNVERIFIED` | `UNPRICED`; on-call/support và storage/egress tách riêng |
| Chủ miền/BA: Marketing, CRM, Finance, Project, Service | Có nghiệp vụ và tài liệu lịch sử | Chỉ định người chốt định nghĩa/authority/quyền/SLA/chứng từ, capacity `UNVERIFIED` | Cung cấp mẫu đã che, định nghĩa và acceptance; giờ workshop nằm từng việc | Xử lý hàng chờ/UNKNOWN, policy/consent/data quality và escalation | `UNPRICED`; giờ nhân sự phải tính vào TCO, không coi là miễn phí |
| Founder / người có quyền quyết định | Có vai trò trong brief | Chốt các quyết định thực sự mở ở SUMMARY trong nhiệm vụ sau | Quyết định theo phạm vi; không duyệt mọi tài liệu nhỏ | Xem ngoại lệ và mục tiêu, ủy quyền theo registry | Cơ hội thời gian đo được, `UNPRICED`; không tạo persona CEO cạnh lõi |

Một người có thể kiêm nhiều vai phù hợp năng lực; chức năng phê duyệt/đối soát tài chính, quyền và review phải theo segregation/role matrix. Hai vai trò AI pilot là điều phối và thực hiện, không phải hai nhân sự FTE hoặc một đội agent đã được trả phí.

## 3. Bảng tài nguyên kỹ thuật và giá cần chốt

Các số lượng là cách lập mô hình cho **dev cô lập, staging dự kiến và production hiện hữu**, không là lệnh tạo tài nguyên. Không tự thay receiver đang chạy bằng máy cá nhân; local/WSL chỉ là môi trường đọc/thiết kế/thử sau này trong phạm vi cho phép. Production inbound phải chọn host luôn sẵn sàng với bằng chứng riêng.

| Tài nguyên | Đã có / dùng lại | Cần bổ sung hoặc xác minh | Công thiết lập / công bảo trì | Cố định / biến đổi | Nguồn giá, kỳ và số chưa rõ |
|---|---|---|---|---|---|
| Backend/API + worker | Có Express, jobs/worker và `render.yaml` | Deploy manifest thực, instance/tài nguyên/headroom, một chủ mỗi lịch; staging tách credential | Map module/env/health/cutover; bảo trì theo release/incident (B03/B10) | Fixed instance-hour hoặc gói; variable autoscale/build/egress theo plan | **UNPRICED**. Đối chiếu billing chủ tài khoản, đơn vị tháng/instance-hour; region/plan/replica/load `UNVERIFIED` |
| Frontend và website nguồn | React UI, WordPress bridge/form code được kế thừa | Hosting/site ownership/cache/deploy source/analytics rights, staging không gửi khách | B05/B09; maintain dependency/UI/cache/source integration | Hosting cố định + traffic/storage/build tùy plan | **UNPRICED**, tháng + phát sinh; không coi domain/WordPress hiện hữu miễn phí |
| PostgreSQL/Supabase chính | Schema/source CRM hiện hữu; không chuyển hàng loạt | Edition, capacity, DB role/RLS, point-in-time/window và data authority thực | B01; migration tương thích chỉ trong nhiệm vụ xây; bảo trì backup/query/security | Fixed tier/compute + variable DB/storage/IO/egress | **UNPRICED**, tháng/GB/đơn vị thực theo bill; size/load `UNVERIFIED` |
| Staging/sandbox và synthetic data | Fixture không credential dùng local trong thiết kế | Môi trường riêng theo chính sách, outgoing mặc định tắt; resource cap | B00/B10; reset chỉ fixture, không clone PII vô điều kiện | Fixed dev/staging + variable build/storage | **UNPRICED**, tháng hoặc giờ sử dụng; không mặc định đủ tài nguyên máy |
| Storage/asset rights/CDN | Code/file integration hiện hữu để map | Asset volume/expiry/retention/company ACL/signed URL, bandwidth | B05/B10; scan rights/retention và revoke access | Variable GB-month, request/egress; fixed plan nếu có | **UNPRICED**, GB/tháng/request theo bill; không tải/xử lý asset thật trong đợt này |
| Backup + restore + secrets | Có backup/replication code và hồ sơ lỗi; chưa coi là restore đạt | Retention/RPO/RTO, isolated restore capacity, key backup/rotation, scope restore tenant | B10; drill định kỳ theo policy `UNSET`; người trực | Fixed tool/secondary resource + variable backup GB/restore/egress + giờ công | **UNPRICED**, tháng/lần drill; không đồng nhất replication với backup hoặc HA |
| Paperclip | Inventory tham chiếu EVIDENCE: runtime/health nếu được đọc | Version/edition/adapter/callback/cap/licensing/backup/persistent store, host uptime | B04; pin/upgrade/regression/backup, một chủ AI schedule | Compute/storage cố định; runtime AI variable tính riêng | **UNPRICED**, tháng + công bảo trì; health không xác nhận chi phí/cap/restore |
| OpenClaw hoặc runtime thay qua adapter | Thiết kế V3.1 chọn adapter; hiện trạng theo inventory | Runtime/version/permissions/credential path/lease/cancel/usage; chưa rõ ghi `UNVERIFIED` | B04; adapter compatibility, security updates | Fixed host + variable run resources; tránh tính trùng compute Paperclip | **UNPRICED**, tháng/run; không khẳng định đã cài/đạt chỉ từ PDF |
| LLM gateway và usage ledger | Có AI provider/budget code ứng viên trong repo | Một chủ cap L10, provider price contract, route gateway-only, reserve mỗi attempt, retry/reviewer | B04; price/model version drift, reconcile usage unknown, key rotation | Variable tokens/media/cache/tools/model call + fixed gateway compute nếu riêng | **UNPRICED**, token/call/media unit theo model/provider được duyệt; không gọi thử trả phí để chốt thiết kế |
| n8n tùy chọn | Chưa giả định có edition/runtime đạt; quyết định theo ADR | Chỉ dùng luồng tích hợp có lợi ích đo được; use case/license/edition/capability được xác minh | Nếu chọn: pin/config/DB riêng/backup/retention; thêm upgrade/incident/review workflow | Fixed license/host/DB theo phương án + variable executions/storage + nhân công | **UNPRICED**, tháng hoặc hợp đồng; không ghi license =0 hoặc gỡ/cài thật; nếu không chọn chuyển lịch/retry/quan sát hữu hạn về owner backend |
| Monitoring/log/audit/alert sink | Có health và log code làm điểm đầu | Quan sát ngoài tiến trình chính, owner, alert destination được phép, PII/retention và metrics | B10; triage alert, retention/volume review | Fixed plan + variable ingest/retention/notification + giờ trực | **UNPRICED**, tháng/GB/notification theo nhà cung cấp; test dùng sink giả |
| Native adapters/kết nối kênh | Website/Facebook/Google code ứng viên và hồ sơ theo nguồn | Từng quyền/account/capability/API access/limits; TikTok/Zalo/ChatGPT Ads không suy sẵn sàng | B02/B05 theo nguồn; API drift/token expiry/source reconciliation | API fee nếu có + compute; **media spend hạch toán Marketing riêng** | **UNPRICED**, theo source/kỳ; connector xuất hiện không xác nhận đủ quyền/hoạt động |
| Đơn/tiền/kế toán/project/service adapters | CRM/Work, báo giá/đơn và MISA source ứng viên | Source authority/API/readback/edition/rights, giấy phép từng hệ, tài liệu thật | B06–B08; source schema drift/reconcile/support | License cố định theo hệ + variable transactions/API + nhân công | **UNPRICED**, tháng/giao dịch theo hợp đồng; không xây ERP đầy đủ |
| Hỗ trợ/capacity dự phòng/sự cố | Chưa có số liệu đủ để định mức | Load profile, SLA/coverage/support giờ, pilot incidents và số company/tenant | B10/B11; runbook/đào tạo/triage | Chủ yếu nhân công biến đổi; fixed retainer nếu có | **UNPRICED**, giờ/tháng; không cam kết HA/24×7/SLA khi chưa nguồn lực |

Không có price quote trong bảng. Giá/kế hoạch provider có thể thay đổi, vì vậy số chi phải dựa trên chứng từ/kỳ được kiểm lúc giao xây. Chưa chốt tải thì chỉ mô hình hóa cấu phần; không lấp khoảng trống bằng con số niêm yết không đúng gói.

## 4. Công thức dự toán và đơn vị

Đặt `R_role` là đơn giá NC đã duyệt; `E_item,role` là NC phân bổ theo backlog; `F_env,period` là phí cố định theo môi trường; `U_unit,period × P_unit` là usage × đơn giá đúng đơn vị/currency. Không cộng tiền khác currency khi chưa lưu FX/source/as_of và chính sách làm tròn; tiền lưu dạng minor-unit integer/decimal rõ scale, không float nhị phân.

```text
Build one-off = Σ(E_item,role × R_role) + one_off_setup_or_license_fees
Run(period) = Σ(F_env,period)
            + Σ(U_unit,period × P_unit)
            + maintenance_hours × maintenance_rate
            + support/on_call_hours × support_rate
            + restore_drill_amortization + tax/fees_not_already_included
Product_TCO(period) = build_amortization(period) + Run(period)
LLM(period) = Σ_attempt [input_tokens × input_unit_rate
                     + output_tokens × output_unit_rate
                     + cache/media/tool_units × matching_unit_rate]
```

Các rate/token unit phải lưu mẫu số thực (ví dụ theo 1 hay 1.000.000 đơn vị) trước nhân; không đoán từ tên model. Retry/reviewer/run thủ công/phụ là attempt riêng có reservation. Provider timeout/usage chưa rõ giữ dự phòng đã reserve và đối soát; không hoàn để gọi tiếp rồi vượt cap. Paperclip/runtime compute được phân bổ một lần dù chung host; license/gateway/DB cộng riêng chỉ khi thực có khoản riêng. Capacity reservation vận hành và tiền marketing/AI là ledger khác loại, không dùng chung số dư.

Ba kịch bản ngân sách **chỉ là đầu vào cần lấy số**, không giả tạo tiền/thời hạn:

| Kịch bản | Driver cần đo | Kết quả hiện có |
|---|---|---|
| P2 pilot hẹp | Intake/ngày, inbox backlog, asset GB, hai vai AI × attempts/tokens, một run đồng thời, latency/restore/support baseline | `UNPRICED / LOAD_UNVERIFIED`; host existing không mặc định free/headroom đủ |
| P3/P4 hai company | Driver trên + order/payment/project/service events, scope/retention/export, đối soát, công hỗ trợ mỗi company | `UNPRICED`; unit economics chưa kết luận |
| P5 nhiều tenant | Concurrency/fairness/DB/storage, per-tenant recovery/support/billing/license và tenancy model | `UNPRICED / UNESTIMATED`; chưa bán tự phục vụ hoặc hứa margin |

## 5. Quỹ Marketing 130 triệu và đối soát không cộng trùng

**130.000.000 VND** là ràng buộc đã giao trong brief cho Marketing; không phải báo giá xây Business AI OS. Không phân bổ từng kênh, không tiêu/bật campaign trong đợt này. Period/start/end/timezone, cách gross/net thuế/phí, tài khoản nguồn, contingency và người giữ quỹ đang cần xác minh; khi chưa chốt kỳ/authority không phát hành command chi.

Repo/hồ sơ cũ có giới hạn trial 100 triệu/30 ngày. Lệnh thiết kế hiện hành dùng 130 triệu làm khung cần mô hình hóa, **không tự nâng/xóa giới hạn runtime cũ hoặc diễn giải thành quyền chi mới**. Trong nhiệm vụ vận hành sau, owner xác định từng policy áp dụng/phạm vi/kỳ; tất cả giới hạn còn hiệu lực được kiểm, dùng giới hạn phù hợp chặt hơn tới khi có quyết định hợp lệ. Không lấy mâu thuẫn lịch sử để dừng phần thiết kế độc lập.

Ledger C-BUDGET cần các trường: tenant/company, budget_id/policy_version, purpose (`MARKETING`/`PRODUCT_BUILD`/`PRODUCT_RUN`/`AI_USAGE`), currency/scale, period/tz, obligation_id, reservation_id/command_id/native_account, amount/category/status, tax/fee treatment, source/evidence/revision/as_of, reconciliation state/owner. Cap sản phẩm/AI là ledger chuẩn L10 với budget purpose riêng; quota Paperclip là giới hạn con.

| Khoản Marketing | Định nghĩa và nguồn | Tránh đếm đôi |
|---|---|---|
| `ActualRecognized` | Chi phí media/marketing đã phát sinh theo dữ liệu nền tảng đối soát hóa đơn; lưu coverage/provisional/final và phần paid/unpaid riêng | Cash paid là view thanh toán của khoản này, không cộng thêm vào chi; ingestion bill/spend cùng obligation phải match |
| `CommittedOutstanding` | Nghĩa vụ cam kết chưa được ghi Actual; có source/amount/expiry | Khi nhận Actual, chuyển cùng obligation phần tương ứng khỏi outstanding; không giữ nguyên commitment rồi cộng toàn Actual |
| `ReservedUnconsumed` | Giữ chỗ để command sắp thực thi, chưa nằm trong Actual/Committed | Reserve→commit/actual dùng cùng obligation, trừ phần chuyển; command retry giữ identity. Hai command tranh số dư phải atomic |
| `TaxFeeNotIncluded` | Thuế/phí dự kiến chưa nằm trong ba khoản trên, có rule nguồn và coverage | Bill đã gross hoặc actual đã gồm thuế thì không cộng lại; giá trị unknown phải công bố, không gán 0 |
| `ContingencyUnallocated` | Dự phòng do người có quyền xác định, chưa nằm trong các category trên | Khi phân bổ vào commitment/reservation phải giảm dự phòng cùng transaction |
| `Adjustment` | Hoàn tiền/credit note/correction có ID riêng và link obligation gốc, đã xác minh | Không tăng khả dụng từ lời hứa hoàn hoặc callback unknown; điều chỉnh theo policy/kỳ gốc hoặc kỳ hiện tại được chốt |

```text
Budget limit = 130.000.000 VND  (kỳ/thuế/phạm vi cần xác minh trước chi)
Encumbered = ActualRecognized + CommittedOutstanding + ReservedUnconsumed
           + TaxFeeNotIncluded + ContingencyUnallocated
Available = limit + verified_policy_adjustments - Encumbered
```

Các category loại trừ nhau **theo từng phần tiền của obligation**, không chỉ loại trừ theo một label toàn record. Ví dụ synthetic: reserve 10 → actual 4 + reserved 6; encumbered vẫn 10, không thành 14. Nếu 6 chuyển thành committed thì reserved 0, committed 6. Không dùng ví dụ này làm phân bổ thực. Budget ownership, policy/effective period và FX không rõ → `UNKNOWN`/hold hành động phụ thuộc; vẫn báo số đã biết cùng phần thiếu, không trình Available như tiền đã xác minh.

CPL tham chiếu ≤250.000đ phải có metric definition/version: tập khách hợp lệ canonical theo company, tiêu chí verified/evidence/người xác minh, mới hay quay lại, dedup Party/Need và exclusion TEST/spam; acquisition cohort/cửa sổ outcome/timezone; tổng cost cùng cohort gồm loại thuế/phí đã chốt, missing spend/coverage và adjustment. Hai nhu cầu cùng Party không tự trở thành hai khách mới hợp lệ. Source/event/form views hoặc Lead count không thay mẫu số khách hợp lệ. Thiếu số/nguồn/kỳ thì `NOT_COMPUTABLE` hoặc `PROVISIONAL`, không suy bằng 0 hay tuyên bố đạt KPI. Attribution giữ evidence nguồn, không tự chứng minh doanh thu tăng do quảng cáo.

## 6. Quyết định trước khi mở xây/vận hành sau

Gói thiết kế vẫn review được khi rate/host/period chưa rõ vì đã tách công thức, authority và gate. Trước xây trên tài nguyên thật cần xác minh các đầu vào trong SUMMARY, theo từng lát: đội/capacity và rate; môi trường/edition/headroom/secret ownership; cap AI/product và kỳ/gross-net quỹ Marketing; tenant/company mapping; quyền nguồn/readback; on-call/retention/RPO/RTO; lựa chọn n8n/use-case license và đo lợi ích. Các vấn đề này không cấp quyền tự setup hoặc chi tiền trong nhiệm vụ BOS-ARCH-DESIGN-01.

Trong đợt thiết kế: chi phí product thực chi mới **không phát sinh từ lệnh mua/setup/paid API của gói này**; không suy tổng chi phí tài khoản bằng 0 vì chưa đọc hóa đơn. Trạng thái dự toán còn `UNPRICED` được báo trung thực trong [EVIDENCE](EVIDENCE.md); phần xây sau chia issue theo backlog, kèm đầu vào/giá đã xác minh và rollback trước khi mở việc tương ứng.
