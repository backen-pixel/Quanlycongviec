04/10/2026: [Mức sử dụng và hàng chờ chi phí AI](CARE_INFERENCE_COST_CONSOLE.md) bản f7237b6 đạt Node18/22 mỗi bản 1.406/0/0, PostgreSQL 498/0/0 gồm 9 ca mới; cả 10 job/build/report/Messenger SUCCESS. Reviewer độc lập đối chiếu published blobs/log/tree và PASS checkpoint. Chi phí thực chưa xác định; không hoàn tiền dự phòng hoặc mở UNKNOWN. Còn đối soát provider/hóa đơn, cấu hình, chuyển luồng/khôi phục, UAT và Founder release; chưa chạy thật, full goal ACTIVE. [Bước tiếp hiện hành](../CURRENT.md).

04/10/2026: [Giao diện theo dõi AI](CARE_RUNTIME_CONSOLE.md) bản411e895 đạt Node18/22 mỗi1.398/0/0, PostgreSQL489/0/0, cả10job/build/report/Messenger SUCCESS; reviewer độc lập PASS đúng publishedblobs/log/tree. Browser synthetic kiểm lostACK/reload, stale/scope và SURVEY/BOOKED. Còn chi phíAI/UNKNOWN, cấu hình/chuyểnluồng/UAT/Founderrelease; chưa chạy thật, fullgoalACTIVE.

04/10/2026: [Gửi câu tư vấn](CARE_ANSWER_DELIVERY.md), bản kiểma388433: Node18/22=1.385/0/0, PostgreSQL469/0/0 gồm21ca mới; cả10job/build/report/Messenger SUCCESS, đúng CI tree/parents; reviewer độc lập PASS checkpoint đúng published blobs/log/tree. Quyền gửi riêng/phiên bản nguồn, claim một lần, ACK/echo, chặn transcript chưa đủ và cạnh tranh với survey/outcome. Chưa Meta thật/quyền chạy/phát hành, full goal ACTIVE.

04/10/2026: [Runtime tư vấn/handoff](CARE_RUNTIME.md), bản kiểm65b8c7b: Node18/22=1.374/0/0, PostgreSQL448/0/0 gồm26ca mới; cả10job/build/report/Messenger SUCCESS, đúng CI tree/parents; reviewer độc lập PASS checkpoint sau đối chiếu published blobs/log/tree. Danh tính Agent/ủy quyền riêng, core nghiệp vụ giữ quyền human cũ, worker mặc định tắt, lịch sử/đóng run không retry/refund. Chưa gửi khách/UI runtime/đặt lịch tự động/UAT; full goal ACTIVE.

04/10/2026: [Nối mô hình và hạn mức](CARE_OPENAI_INFERENCE.md), runtime cc5e6a9: Node18/22=1.361/0/0, PostgreSQL422/0/0 gồm13ca SQL691; cả10job/build/report/Messenger SUCCESS, đúng CI tree/parents. Reviewer độc lập đã xác minh published blobs/log và PASS checkpoint. Private permit/receipt, dedicated key, model/policy explicit; không auto-enrollment hoặc provider retry. Reservation không invoice; chưa modelcall thật/gửi/UAT/phát hành, full goal ACTIVE.

04/10/2026: [Giao diện đối soát tư vấn](CARE_ADVISOR_CONSOLE.md), runtime4b4cdc5 đã PASS review độc lập đúng published blobs/log/tree. Node18/22=1349/0/0; PostgreSQL409/0/0 gồm16ca SQL690; cả10job/build/report/Messenger SUCCESS. Browser Workspace/API giả đã kiểm thu hồi nguồn, pending/reload/cancel và đổi phạm vi. Chưa provider/gửi khách/UAT/phát hành; full goal ACTIVE.

04/10/2026: [Bản nháp tư vấn có nguồn](CARE_ADVISOR_DRAFTS.md), bản kiểm73a7824/runtime56d424f đã PASS review độc lập. Node18/22=1.336/0/0; PostgreSQL393/0/0 gồm22ca mới; cả10job/build/report/Messenger SUCCESS. Router chưa có provider, send=false; còn quyền runtime, UI/worker/gửi, chất lượng AI và UAT/Founder release. Full goal ACTIVE.

04/10/2026: [Đối soát liên kết lượt Facebook bị ngắt](BATCH_LINK_RECONCILIATION.md), SQL688 tại bản kiểm `d2d6e1c` đã PASS review độc lập. PostgreSQL 371/0/0 (23 mới), Node22 1.320/0/0, cả 10 job/build/report/Messenger SUCCESS. RECONCILED_LINKED giữ claim và run REVIEW; không replay hoặc xác nhận mọi tác động đã xong. Mục tiêu đầy đủ còn ACTIVE; chưa chạy thật.

04/10/2026: [Dừng vòng cũ và tác vụ Facebook](LEGACY_RUNTIME_DRAIN.md), runtime `4c97626`: Node 18/22 mỗi bản 1.309 PASS/0 fail/0 skip, intake PostgreSQL 348/0/0; cả 10 job/build/report/Messenger SUCCESS. Reviewer độc lập đã đối chiếu blob công bố và log CI, kết luận PASS trong phạm vi này. Cờ vẫn tắt; còn khôi phục queue/UNKNOWN, kiểm đủ tác vụ/instance, cấu hình AI/lịch/người nhận và UAT/Founder release.

04/10/2026: [Dừng/chờ năm worker](WORKER_DRAIN.md) runtimef3ea85e đã PASS review độc lập đúng published blobs/log CI. Node18/22=1.278/0/0 gồm2ca native signal, intakePG348/0/0,10job/build/report/Messenger SUCCESS. Cờ shutdown vẫn tắt, processesDrained=false; chưa legacy/post-ACK/push/other-process/UNKNOWN/cutover hoặc UAT/phát hành.

04/10/2026: [Bảo trì đường ghi cũ](LEGACY_WRITE_HOLD.md), SQL687 mặc định tắt, 18 bảng gốc và FK descendants, operator-only/audit/revision/hash. Bản kiểm9ecbec4: PG348/0/0 (13 mới), Node22=1228/0/0, cả10 job/build/report/Messenger SUCCESS; reviewer độc lập PASS checkpoint maintenance sau đối chiếu published blobs/log CI. Không thay UNKNOWN/claim hoặc chứng minh process đã dừng. Chưa áp DB thật hoặc phát hành.

04/10/2026: [Dừng batch có bằng chứng](LEGACY_BATCH_STOP.md), runtimee7d35d1đã kiểm: Local/Node22=1228/0/0, PG335/0/0 gồm12mới,10job/build/report/MessengerSUCCESS; review độc lậpPASS checkpoint, browsergiả đã kiểm. ChặnBEGINmuộn, hủyPENDING/giữUNKNOWN. Chưa khépUNKNOWN/cutover/UAT/phát hành.

04/10/2026: [Rà khách trùng giữ hồ sơ](LEGACY_DUPLICATE_REVIEW.md) runtime4df166 đã kiểm. Local/Node22=1198/0/0, identityPG35/0/0 (8mới), intake323/0/0,10job/build/report/MessengerSUCCESS; review độc lậpPASS checkpoint, browser thật/API giả đã kiểm. Còn đối soát writer/cấu hình/UAT/phát hành.

04/10/2026: [Nhật ký batch qua reload](LEGACY_BATCH_JOURNAL.md), runtime7b455b9: Local294, PostgreSQL323/0/0 gồm16ca mới,10job/build/report/MessengerSUCCESS; review độc lập PASS sau đối chiếu CI, browser thật/API giả đã kiểm. Không chạy lại UNKNOWN; chuyển writer/đối soát/UAT/phát hành vẫn mở.

04/10/2026: [Khôi phục nhãn nguồn có bằng chứng đã kiểm chứng](LEGACY_SOURCE_REPAIR.md), runtime8f61a18. Local267, PostgreSQL307/0/0 gồm17ca mới, cả10job/build/report/MessengerSUCCESS; review độc lậpPASS đúng SQL683/API. Giữ nguồn có sẵn; thiếu/mâu thuẫnREVIEW; chưa UAT/chuyển luồng/phát hành. Các mục dưới giữ lịch sử.

04/10/2026: [Khôi phục nguồn CRM có bằng chứng](LEGACY_SOURCE_REPAIR.md) đang nghiệm thu. Local267 PASS;17PG ca mới và review cuối đang chờ. Không sửa nguồn có sẵn; không đổi attribution/paid proof. Chưa phát hành.

04/10/2026: [Batch tạo khách theo danh sách đã xác nhận](LEGACY_BATCH_CREATION.md), runtimec7d2a43. Local237; PostgreSQL290/0/0 gồm9 ca mới;10job/build/report/Messenger SUCCESS; review độc lập PASS phạm vi batch. Browser mới xác nhận lỗi một phần và nút đối soát, chưa hoàn tất thao tác retry. Source-backfill, retry bền vững, HTTP/cutover/UAT/phát hành còn OPEN.

04/10/2026: [Phạm vi tạo khách Facebook đã kiểm chứng](LEGACY_CREATOR_SCOPE.md), runtime925cae0. Local183, PostgreSQL281/0/0 gồm10 ca mới; cả10job/build/report/Messenger SUCCESS; review độc lập PASS checkpoint creator. Chuỗi HTTP/caller cũ/merge/cutover/UAT/phát hành còn OPEN.

## Hiện hành 03/10/2026 — Preflight đường ghi cũ đã kiểm PostgreSQL

04/10/2026: [Gói sửa quét điện thoại](LEGACY_PHONE_REPAIR.md) tại bản kiểm5a3acc6: phạm vi công ty/Page hiện hành, final round theo nhóm chọn, checked reads/writes, MID chưa lưu và lịch sử bị cắt không cho cleanup. Review độc lập PASS sau đối chiếu runtime/CI; local77, PostgreSQL264/0/0 gồm6ca mới, census88+HTTP1, Node22 843+26+67 và cả10job/build/report/Messenger SUCCESS. CRM merge/creator company và cutover vẫn OPEN; full goal ACTIVE, chưa vận hành thật hoặc đạt250k.

Runtime9cdfe7d trước đó: SQL682/helper kiểm target trước ghi và giữ lịch sử message/Lead Ads/comment. PostgreSQL258/0/0 (14mới), census88+HTTP1, Node22 843+26+33 và cả10job/build/report/Messenger SUCCESS. [Bằng chứng](LEGACY_WRITE_PREFLIGHT_REVIEW.md), [hợp đồng và phần còn thiếu](LEGACY_WRITE_PREFLIGHT.md). Reviewer độc lập PASS phạm vi preflight/SQL682. Cutover vẫn HOLD: còn caller/batch, dừng/chờ, khôi phục, AI/cấu hình, đủ điểm nhận/phạm vi đo và UAT/Founder release. Chưa dữ liệu thật đạt250k; full goal ACTIVE. Các mục dưới giữ lịch sử.

---

## Hiện hành 03/10/2026 — Giao diện đối chiếu đã kiểm chứng

Runtime8f42595: SQL681/API/UI tìm hồ sơ, bằng chứng, LINK/CLOSE qua reload và phân biệt mapping đầy đủ. Local26; intakePG244/0/0 (11mới), census88+HTTP1, Node22 843+26,10job/build/report/Messenger SUCCESS. Review độc lập PASS; browser component thật/API giả đã kiểm. [Bằng chứng](CARE_CONNECTION_CONSOLE_REVIEW.md), [hợp đồng/chuyển đường cũ/hoàn tác](CARE_CONNECTION_CONSOLE.md). Còn cutover, cấu hình, khôi phục, phạm vi đo và các điểm nhận/kênh khác, UAT/Founder release. Chưa dữ liệu thật đạt250k; full goal ACTIVE.

---

## Hiện hành 03/10/2026 — Điểm nối khách và ca khảo sát giả đã PASS

Runtime b4e2def nối Lead intake với hội thoại có bằng chứng; ca xuyên API→xác nhận lịch→bàn giao→cohort giữ cùng Lead và tính cả chi không có khách. Lỗi timestamp SQL→API đã sửa, pending retry giữ nguyên. Review độc lập PASS; local42, intakePG233/0/0, census88+HTTP1, Node22 843+11 PASS, cả10job/build/report/Messenger SUCCESS.

[Bằng chứng đúng phiên bản](CARE_CONNECTION_REVIEW.md) và [hợp đồng, giới hạn, bước tiếp](CARE_CONNECTION_ACCEPTANCE.md). Còn UI liên kết, chuyển đường gọi cũ, AI/cấu hình, khôi phục, các điểm nhận/kênh khác và UAT/Founder release. Full goal ACTIVE; chưa đạt250k bằng dữ liệu thật hoặc phát hành. Các mục dưới là lịch sử.

---

## 03/10/2026 — Nghiệm thu điểm nối khách đang HOLD

Lead Ads tạo Lead nhưng chưa tự nối với người nhắn Messenger. SQL680/API đang triển khai cục bộ trên HEAD14e11d5; 11 ca adapter PASS, chưa kiểm PostgreSQL hoặc toàn tuyến. Review còn yêu cầu khép thứ tự khóa đường cũ và liên kết phục hồi. Xem [hiện trạng và bước tiếp](CARE_CONNECTION_ACCEPTANCE.md). Full goal ACTIVE; chưa phát hành hoặc dữ liệu thật đạt250k. Các bằng chứng đã đạt bên dưới thuộc phần đề xuất lịch trước đó.

---

## 03/10/2026 — Đề xuất lịch đã kiểm chứng

Bản46c680b hoàn thiện màn hình chọn giờ trống, tạo đề xuất và đối chiếu yêu cầu cũ qua tải lại; lịch sử tách đề xuất/gửi/đặt/thông báo. Tin chưa rõ kết quả chặn tạo mới; quyền và liên kết khách được kiểm lại, STOP không tự mở chăm sóc.

Review độc lập PASS; local30, intake PostgreSQL222/0/0, census88/0/0 +HTTP1/0/0, Node22 842/0/0, cả10job/build/report/Messenger SUCCESS. Browser StrictMode/API giả đã kiểm mất phản hồi, reload, STOP, phạm vi, TTL và phản hồi muộn. [Bằng chứng](SURVEY_PROPOSAL_CONSOLE_REVIEW.md), [hợp đồng/hoàn tác](SURVEY_PROPOSAL_CONSOLE.md).

Full goal ACTIVE. Tiếp theo nghiệm thu xuyên tuyến Facebook→CRM→khảo sát→dashboard, hoàn thiện ngoại lệ gửi/lịch và chuyển đường lịch cũ; cấu hình AI/lịch/người nhận, điểm nhận khác, khôi phục và Founder release còn chờ. Chưa dữ liệu thật đạt250k hoặc phát hành. Các mục dưới là lịch sử.

---

## 03/10/2026 — Màn hình đề xuất lịch đang nghiệm thu

SQL679/API/UI bổ sung tìm giờ trống, tạo đề xuất, lưu yêu cầu để đối chiếu khi mất phản hồi và lịch sử tách gửi/đặt/thông báo kết quả. Chặn đề xuất mới nếu còn tin đang gửi hoặc chưa rõ kết quả; replay phải giữ nguyên yêu cầu và kiểm quyền/phạm vi hiện hành. Giờ lịch sử không thay thế lịch hiện hành ở hồ sơ bàn giao.

Local30 ca liên quan PASS (14 mới). Đã sửa P2 StrictMode từ review và tách fixture QUEUED khỏi lượt drain của ca booking. PostgreSQL/browser/review cuối đang chờ. [Hợp đồng và hoàn tác](SURVEY_PROPOSAL_CONSOLE.md). Full goal ACTIVE; còn cấu hình AI/lịch/người nhận, điểm nhận và kênh khác, UAT và Founder release. Chưa phát hành hoặc dữ liệu thật đạt250k.

---

## Hiện hành 03/10/2026 — Đã nối khảo sát và việc chờ theo nhóm quảng cáo

Bản3f8a565 nối nhóm khách trả phí với chăm sóc/lịch hiện hành trong cùng snapshot. Lịch sau kỳ vẫn giữ; tổng khách cần xử lý loại trùng cả việc chờ xác minh, chưa nối chăm sóc và bàn giao khảo sát. STOP không tự mở lại; hồ sơ chưa quy thuộc hiển thị riêng.

Local20 ca mới/44 ca liên quan, PostgreSQL214/0/0 (6 ca mới), Node22 828/0/0 và cả10 job/build/report/Messenger SUCCESS. Reviewer mã PASS; browser component thật/API giả đã kiểm lỗi nguồn, STOP, phản hồi cũ và lỗi report cha. [Bằng chứng đúng phiên bản](COHORT_OPERATIONS_REVIEW.md), [hợp đồng/hoàn tác](COHORT_OPERATIONS.md).

Full goal ACTIVE. Còn UI xử lý đề xuất/gửi lịch và ngoại lệ, điểm nhận/kênh khác, cấu hình AI/lịch/người nhận, UAT và Founder release. Chưa dữ liệu thật đạt250k hoặc phát hành. Các mục dưới giữ lịch sử.

---

## Hiện hành 03/10/2026 — Xác nhận phạm vi CPQL đã kiểm chứng

Runtime960086c nối bằng chứng đích quảng cáo lịch sử, đúng tệp nguồn, toàn bộ chi tiêu và khách hợp lệ vào kết quả có phạm vi. Phép thử 1 triệu/4 khách =250.000đ giữ cả tài khoản không tạo khách. Có thu hồi, retry lịch sử, kiểm quyền sau chờ khóa và rollback khi nguồn đổi; không mở quyền chi.

Review độc lập PASS. Local24 ca mới/63 ca liên quan; PostgreSQL88/0/0 (10 ca mới), HTTP1/0/0, Node22 808/0/0, cả10job/build/report/Messenger SUCCESS. Browser dữ liệu giả kiểm mất phản hồi→reload→đúng/sai tệp→retry, stale/current, đổi người và thu hồi trong màn hình report lỗi. [Bằng chứng đúng phiên bản](SCOPE_ACCEPTANCE_REVIEW.md), [hợp đồng/hoàn tác](SCOPE_ACCEPTANCE.md).

Full goal ACTIVE. Còn các điểm nhận chưa nối, quy thuộc khảo sát/chờ xử lý theo nhóm quảng cáo, thiết lập AI/lịch/ngoại lệ và UAT/Founder release. Chưa dữ liệu thật đạt250k, chưa chứng minh toàn bộ Meta/đa kênh, chưa phát hành. Các mục dưới giữ lịch sử.

---

## 03/10/2026 — Xác nhận phạm vi CPQL đang kiểm chứng

SQL677/API/UI nối bằng chứng đích quảng cáo lịch sử, tệp nguồn đã đối soát và toàn bộ chi tiêu với khách hợp lệ; kết quả 250k chỉ áp dụng phạm vi đã xác nhận. Có thu hồi, retry bất biến, kiểm quyền sau chờ khóa và rollback khi nguồn đổi. Không mở quyền chi hoặc kết luận toàn bộ kênh.

Local24 ca mới /63 ca liên quan PASS. Hai P2 từ review (metadata chiến dịch và quyền sau chờ khóa) đã sửa; đang kiểm PostgreSQL/build/browser và review cuối. [Hợp đồng/hoàn tác](SCOPE_ACCEPTANCE.md). Full goal ACTIVE; chưa dữ liệu thật/UAT/phát hành. Các mục dưới giữ lịch sử.

---

## Hiện hành 03/10/2026 — Đối soát quảng cáo đã phân phối được kiểm chứng

Runtime02f164b nối collector ad/day và account daily/all_days trước/sau vào cùng giao dịch lưu chi tiêu. Dashboard giữ quảng cáo chi bằng0 có tín hiệu và mã ad có trong nguồn khách nhưng chưa thấy trong delivery. Kỳ collector mới kết thúc hết hôm qua theo giờ Việt Nam; lỗi phân trang hoặc số liệu thay đổi không được công bố thành công.

Review độc lập PASS; local24ca mới/103ca liên quan, PostgreSQL78/0/0 (7ca mới), HTTP1/0/0, Node22 784/0/0 và cả10job/build/report/Messenger SUCCESS. [Bằng chứng đúng phiên bản](ACCOUNT_DELIVERY_REVIEW.md), [hợp đồng và hoàn tác](ACCOUNT_DELIVERY.md).

Full goal ACTIVE. Bước tiếp: dùng delivery witness + registry + source exports để chấp nhận bằng chứng đích lịch sử/nguồn xuất và trả CPQL có phạm vi ngay trong cùng luồng; không thêm một lớp snapshot. Còn các điểm nhận khác, AI/lịch/ngoại lệ và UAT/Founder release. Chưa full CPQL/đạt250k, chưa tác động Meta/DB thật hoặc phát hành. Các mục dưới giữ lịch sử.

---
## Hiện hành03/10/2026 — Đã kiểm chứng nhật ký trang Facebook

Runtime d89e34ba thêm SQL672 ghi witness từng trang nguyên giao dịch với receipt/observation/cursor, chuỗi hash/ordinal, giờ lease DB, một Graph version yêu cầu và phát hiện lịch sử thiếu. Summary trong API trạng thái cùng snapshot; không thay UI, không chứng minh Meta đủ/CPQL/quyền chi.

Review độc lập PASS; local29, censusPG50/0/0 (9ca mới), Node22 697/0/0, cả10job/build và report/Messenger SUCCESS. [Bằng chứng đúng phiên bản](CENSUS_WITNESS_REVIEW.md), [hợp đồng/hoàn tác](CENSUS_WITNESS.md).

Full goal ACTIVE. Tiếp tục đối soát phạm vi/tập ID thực và chốt kỳ có bằng chứng, lịch/chờ xử lý, các nghĩa vụ AI/vận hành/UAT/Founderrelease. Chưa dữ liệu Meta thật hoặc đạt250k, chưa phát hành. Các mục dưới giữ lịch sử từng phiên bản.

---

## 03/10/2026 — Source registry validated

Runtime9363535a adds declared business scope with revision/current authority/audit/exact retry, all accounts and known-form exceptions, and an operator editor. Independent review PASS; local129, censusPG41/0/0, Node22 697/0/0, all10 jobs/build and report/Messenger SUCCESS. Synthetic browser includes lost-response/reload/actor switch and heldPOST/editor close. [Evidence](SOURCE_REGISTRY_REVIEW.md), [contract](SOURCE_REGISTRY.md), [browser](SOURCE_REGISTRY_BROWSER.md). Full goal ACTIVE: provider witness/actual export reconciliation/measurement close, survey and pending dashboard, real configuration/UAT/Founder release still required. No actual Meta access or operational changes.

---

## 03/10/2026 — Observed CPQL validated

Runtimea8b2f9f adds provisional whole-account spend per reconciled qualified Lead. Independent review/local105/Node22 673/censusPG30/fullbuild allPASS. No migration; no full-target attainment or release. [Evidence](OBSERVED_CPQL_REVIEW.md), [contract and remaining work](OBSERVED_CPQL.md). Full goal ACTIVE.

---

## Hiện hành 03/10/2026 — Đã kiểm thử mốc đo tiền và khách

Candidate5076b2a dùng cùng kỳ ngày Việt Nam hoàn tất cho chi tiêu và khách; khôi phục khách bị sót vẫn đến lúc bắt đầu quét, kể cả ngày đầu. Giữ metadata ngoài kỳ để đối soát webhook tới muộn, không bỏ mâu thuẫn nguồn. Dashboard tách mốc khôi phục/mốc đo và không hiển thị số0 khi chưa có ngày hoàn tất.

Review độc lập PASS trong phạm vi này. Census PostgreSQL26, trial PostgreSQL13, Node22 643, cả10 job/build và report/Messenger regressions PASS; local143 PASS. Browser bằng API giả đã kiểm kỳ đo, ngày đầu, mâu thuẫn và lỗi nguồn. [Bằng chứng đúng phiên bản](MEASUREMENT_PERIOD_REVIEW.md), [hợp đồng](MEASUREMENT_PERIOD.md).

Tiếp theo phải hoàn thiện registry phạm vi + provider coverage và close có bằng chứng để tính CPQL, nối lịch/chờ xử lý vào dashboard, rồi UAT và gói phát hành. Chưa chứng minh250.000đ/khách, chưa Meta/CRM thật; full goal ACTIVE. Các mục dưới đây là lịch sử theo phiên bản.

---

## Hiện hành 03/10/2026 — Thông báo kết quả khảo sát đã kiểm thử

Candidate44d80b1 bổ sung outbox nguyên giao dịch với booking/từ chối nghiệp vụ, thông báo kết quả đúng lịch và hàng rào gửi chung với đề xuất. Không lấy receipt BLOCKED làm kết quả “chưa đặt lịch”; không gửi lại sau mất phản hồi. STOP/tiếp quản giữ nguyên, bằng chứng booking/handoff không bị xóa khi lỗi gửi.

Review độc lập PASS; PostgreSQL199 (20 case outcome mới), Node22 618, cả10 job/full build và regression PASS. [Bằng chứng đúng phiên bản](SURVEY_OUTCOMES_REVIEW.md), [contract và giới hạn](SURVEY_OUTCOMES.md).

Mặc định tắt, chưa Meta/CRM thật/UAT/phát hành. Còn UI đề xuất/ngoại lệ, hủy/đổi và writer lịch cũ, nội dung/nhân sự/lịch thật, nguồn–chi tiêu và CPQL đầy đủ, hiệu năng/khôi phục. Tiếp theo ưu tiên đối soát khách–chi phí và chuẩn bị nghiệm thu Facebook→CRM→dashboard. Chưa chứng minh250.000đ/khách; full goal ACTIVE, không mở đợt chi.

Các mục sau giữ lịch sử theo phiên bản.

---

## Hiện hành 03/10/2026 — Bàn giao khảo sát đã kiểm thử

Runtimea35deef4 thêm màn hình CRM cho nhân viên nhận hồ sơ, queue/chỉ số chờ nhận, hội thoại đầy đủ và ACK đúng người nhận hiện hành. Sales owner/admin theo dõi, không ký thay. Receipt/audit nguyên giao dịch; replay sau mất phản hồi kiểm quyền mới; lịch khách xác nhận, staff ACK và trạng thái chăm khách được giữ riêng.

Review độc lập PASS; PostgreSQL179 (21 case handoff mới), Node22 604, cả10 job/full build và regression PASS. Browser với API giả kiểm đủ55 tin, mất phản hồi/reload, đổi scope, manager, STOP và lỗi quyền/nguồn. [Bằng chứng đúng phiên bản](SURVEY_HANDOFFS_REVIEW.md), [contract và giới hạn](SURVEY_HANDOFFS.md).

Mặc định tắt, chưa Meta/CRM thật hoặc UAT/phát hành. Còn UI đề xuất/ngoại lệ gửi, thông báo khách, hủy/đổi và writer lịch cũ, dữ liệu thật, nguồn/chi tiêu và CPQL đầy đủ, hiệu năng/khôi phục. Chưa chứng minh250.000đ/khách. Full goal ACTIVE; không mở đợt chi.

Các mục sau giữ lịch sử theo phiên bản.

---

## Hiện hành 03/10/2026 — Gửi đề xuất khảo sát đã kiểm thử

Runtimef82380f nối worker gửi payload bất biến → raw webhook có chữ ký → xác nhận → lịch/handoff. Có claim một lần, cửa sổ inbound24h, deadline ngắn/clock skew, binding credential hiện hành, ACK/echo khớp đúng attempt và hồi phục không gửi lại khi chưa rõ kết quả. STOP và trạng thái người tiếp quản giữ nguyên.

Review độc lập PASS; PostgreSQL158 (21 case dispatch mới), Node22 593, cả10 job/full build và regression PASS. [Bằng chứng đúng phiên bản](SURVEY_DISPATCH_REVIEW.md), [phạm vi và cổng còn lại](SURVEY_DISPATCH.md).

Provider/HMAC thử được giả lập; positive path dùng worker/receiver thật, không còn owner gán SENT. Enrollment rỗng, cờ tắt, chưa Meta thật/UAT/phát hành. Còn UI khảo sát/ngoại lệ, ACK người nhận, thông báo khách, hủy/đổi và writer cũ, dữ liệu thật và đo CPQL đầy đủ. Chưa chứng minh250.000đ/khách. Full goal ACTIVE; không mở đợt chi.

Các mục sau giữ lịch sử theo phiên bản.

---

## 2026-10-03 — Controlled survey dispatch (in validation)

Base a07760f. SQL667 adds private, empty dispatch enrollment; one-time immutable send authorization; credential binding; exact ACK/echo correlation; no blind resend after unknown delivery. Default-off worker now sends only prepared survey proposals and reconciles confirmation after ACK in a separate transaction. STOP and human takeover remain sticky.

Local47 worker/care/webhook tests PASS. PostgreSQL and independent review pending; first review found and fixed SQL generation escaping, a shortened deadline/clock-skew fence and stale credential binding. See [contract and remaining gates](SURVEY_DISPATCH.md). No live send/enrollment/migration, model call, ad change or release. Full goal ACTIVE.

---

## Hiện hành 03/10/2026 — Nhận xác nhận khảo sát đã kiểm thử

Runtime0a97a85 nối raw webhook có kiểm chữ ký → mã quick reply → receipt riêng → giao dịch đặt lịch; toàn bộ STOP/yêu cầu người/echo chưa rõ trong batch được xử lý trước. Có hồi phục khi ACK đến muộn, giữ kết quả cuối khi worker cũ tiếp tục và tránh hồ sơ chưa ACK làm kẹt hàng chờ. Token khảo sát được bỏ trước đường log/hàng chờ cũ.

Review độc lập PASS; PostgreSQL137 (14 case mới), Node22 580, cả10 job/full build và regression PASS. [Bằng chứng đúng phiên bản](SURVEY_CONFIRMATION_INGRESS_REVIEW.md), [phạm vi và phần chưa tích hợp](SURVEY_CONFIRMATION_INGRESS.md).

Proof gửi tin còn được DB owner mô phỏng; chưa có dispatcher, nhận diện echo của chính ứng dụng hoặc worker chạy reconcile. Enrollment rỗng, cờ mặc định tắt; chưa gửi/nhận Meta thật, UAT hoặc phát hành. Chưa có CPQL thực tế chứng minh250.000 đồng/khách. Full goal ACTIVE.

Các mục sau giữ lịch sử theo phiên bản.

---

## Hiện hành 03/10/2026 — Lõi đề xuất và đặt khảo sát đã kiểm thử

Runtime243440d bổ sung đề xuất bất biến, kiểm xác nhận gắn đúng khách/lịch và giao dịch chung cho event, participant, audit, xác nhận và hàng bàn giao. Review độc lập PASS; PostgreSQL123 (12 case mới), Node22 574, cả10 job/full build và các regression PASS. [Bằng chứng đúng phiên bản](SURVEY_PROPOSALS_REVIEW.md), [phạm vi và phần còn thiếu](SURVEY_PROPOSALS.md).

Đây là kiểm thử lõi nghiệp vụ với proof do DB owner mô phỏng, chưa phải xác nhận khách thực tế. Chưa có dispatcher/ingress xác nhận, UI khảo sát hoặc ACK bàn giao; không cấp quyền ứng dụng gọi book. Các đường lịch cũ, nguồn dữ liệu thật, sao lưu/khôi phục và UAT vẫn phải hoàn thiện. Mặc định tắt, chưa phát hành/mở đợt chi; chưa có CPQL thực tế chứng minh250.000 đồng/khách. Full goal ACTIVE.

Các mục sau giữ lịch sử theo phiên bản.

---

## Hiện hành 03/10/2026 — Bảo vệ lịch khi chuyển quyền ghi đã kiểm thử

Runtime7576ecf7 và regressiond242e114 bổ sung vùng điều khiển riêng, enrollment rỗng, permit theo giao dịch và trigger bảo vệ lịch khỏi đường ghi cũ. Đã kiểm cả quyền được công cụ backup cấp lại, participant thay đổi trong lúc UPDATE chờ và snapshot cũ. Review độc lập PASS; PostgreSQL111 (11 guard mới), Node22 567, cả10 job/full build và các regression PASS. [Bằng chứng đúng phiên bản](SURVEY_CALENDAR_GUARD_REVIEW.md), [phạm vi và cổng phát hành](SURVEY_CALENDAR_GUARD.md).

Chưa có lệnh đặt lịch/xác nhận khách/bàn giao nguyên giao dịch; chưa đăng ký nhân sự thật. Trước cutover cần xử lý báo thành công sai của đường cũ, đo tác động tuần tự hóa lịch và kiểm sao lưu/khôi phục vì REST replication bỏ qua RPC. Không phát hành hoặc mở đợt chi. Chưa có CPQL thực tế chứng minh250.000 đồng/khách. Full goal ACTIVE.

---

## Hiện hành 03/10/2026 — Nguồn giờ khảo sát đã kiểm thử

Runtimec0d07e6 bổ sung nguồn lịch theo nhân sự/khu vực, phạm vi lịch được người có quyền xác nhận và phép kiểm tra bận từ toàn bộ lịch CRM/người tham gia. Các giờ đề xuất có phiên bản và hạn ngắn, không phải lịch đã giữ hoặc đặt. Kiểm thử local9, PostgreSQL100 (13 survey mới), Node22 567, cả10 job/full build và các regression PASS. [Bằng chứng đúng phiên bản](SURVEY_AVAILABILITY_REVIEW.md), [phạm vi và giới hạn](SURVEY_AVAILABILITY.md).

Mặc định tắt, chưa phát hành. Còn phải xác nhận lịch thực tế, giữ chỗ/giao dịch chung với lịch CRM, xác nhận đúng đề xuất từ khách, chặn tranh chấp với đường ghi cũ và bàn giao có bằng chứng. AI tư vấn/gửi tin, đối soát nguồn/chi tiêu đủ phạm vi và UAT còn việc. Chưa có CPQL thực tế chứng minh250.000 đồng/khách. Full goal ACTIVE; không mở đợt chi hoặc quyền AI.

Các mục sau giữ lịch sử theo phiên bản.

---

## Hiện hành 03/10/2026 — Màn hình nội dung tư vấn đã kiểm thử

Runtime979d62d bổ sung biên tập nội dung, duyệt/thu hồi đúng phiên bản, chọn sản phẩm/khu vực, xem trước nguyên văn và lịch sử đầy đủ. Bản nháp được giữ khi đổi tab hoặc phân trang lỗi; yêu cầu mất phản hồi được gửi lại đúng mã qua tải lại trình duyệt. SQL662 thêm bộ chọn và lịch sử theo quyền hiện hành. Review độc lập code/CI PASS; local20, PostgreSQL87 (4 console mới), Node22 558 và cả10 job/full build PASS. [Bằng chứng](CARE_LIBRARY_CONSOLE_REVIEW.md), [kiểm tra trình duyệt và giới hạn](CARE_LIBRARY_CONSOLE_BROWSER.md). Riêng accept/dismiss của hộp xác nhận gốc chưa kết luận bằng browser automation, giữ lại cho UAT.

Mặc định tắt, chưa phát hành. Nội dung VPT thật, AI sử dụng/gửi tin, lịch khảo sát, đối soát đủ nguồn/chi tiêu và UAT còn phải hoàn thiện. Chưa có CPQL thực tế chứng minh đạt250.000 đồng/khách; trần100 triệu một đợt30 ngày và80/20 giữ nguyên. Không gọi model, đổi DB thật, cấp quyền duyệt hoặc mở đợt chi. Full goal ACTIVE.

Các mục sau giữ lịch sử theo phiên bản.

---

## Hiện hành 02/10/2026 — Thư viện nội dung tư vấn đã kiểm thử

Runtime880f495 thêm lưu nháp, duyệt/thu hồi nội dung, lịch sử và xem trước nguyên văn theo công ty/sản phẩm/khu vực/kênh. Sửa nội dung, đổi quyền người duyệt, thay đổi nguồn hoặc hết hạn làm mất hiệu lực sử dụng. Không cấp sẵn quyền duyệt hoặc nạp dữ liệu sản phẩm thật. Review độc lập PASS; local9, PostgreSQL83 (14 library), Node22 547 và cả10 job/full build PASS. [Bằng chứng đúng phiên bản](CARE_LIBRARY_REVIEW.md).

Mặc định tắt; chưa có UI biên tập, AI sử dụng/gửi tin hoặc lịch khảo sát. Phần kết nối OpenAI chờ lựa chọn khóa riêng; không gọi API trả phí. Nguồn/chi tiêu thực tế và UAT vẫn chưa hoàn tất, chưa xác nhận CPQL250.000 đồng/khách. Full goal ACTIVE; không phát hành hoặc mở đợt chi.

Các mục sau giữ lịch sử theo phiên bản.

---

## Hiện hành — màn hình chăm khách (02/10/2026)

Runtime52741b81 đã qua review, kiểm thử cơ sở dữ liệu và trình duyệt dữ liệu giả. [Phạm vi](FACEBOOK_CARE_CONSOLE.md) · [Bằng chứng](FACEBOOK_CARE_CONSOLE_REVIEW.md). Màn hình có hàng chờ, lịch sử và tiếp quản/ngừng liên hệ; AI tư vấn/gửi tin và lịch khảo sát vẫn chưa hoàn tất. Mặc định tắt, chưa phát hành. Các mục phía dưới giữ lịch sử.

---

## Hiện hành — nền chăm khách (02/10/2026)

Runtime73fa7c68 và review/kiểm thử đã PASS trong phạm vi tiếp nhận, dừng liên hệ và tiếp quản. [Phạm vi](FACEBOOK_CUSTOMER_CARE.md) · [Bằng chứng](FACEBOOK_CUSTOMER_CARE_REVIEW.md). Mặc định tắt; chưa có AI gửi tin, UI care, lịch khảo sát hoặc nghiệm thu vận hành. Các bản bên dưới là lịch sử theo phiên bản.

---

**Hiện hành02/10/2026:** nối nguồn Facebook vào hồ sơ CRM cũ đã có luồng review và kiểm thử. Runtime0d41d343, fixture2d90f5c; không tạo khách mới hoặc sửa lịch sử. [Hợp đồng](FACEBOOK_LEGACY_RECONCILIATION.md) · [Review và bằng chứng](FACEBOOK_LEGACY_RECONCILIATION_REVIEW.md). Chưa đủ toàn bộ nguồn/chi tiêu/AI care/lịch khảo sát/UAT để hoàn thành mục tiêu hoặc phát hành.

## Hiện hành 02/10/2026 — Đối soát Facebook–CRM trên dashboard

[Phần đối soát mới](FACEBOOK_CRM_RECONCILIATION.md) đã nối lượt gửi Facebook với tiếp nhận và hồ sơ CRM, chỉ ra chỗ thiếu/mâu thuẫn, đồng thời cho phép yêu cầu khôi phục qua tuyến đã kiểm quyền. Lượt gửi được tách rõ khỏi khách duy nhất. Runtime5ff846 qua review độc lập, PostgreSQL, toàn bộ kiểm tra tự động và trình duyệt dữ liệu giả; [bằng chứng](FACEBOOK_CRM_RECONCILIATION_REVIEW.md).

PR22 vẫn nháp/chưa phát hành. Chưa chứng minh đầy đủ phạm vi nguồn và hồ sơ legacy nên chưa có CPQL đủ căn cứ; AI tư vấn/lịch khảo sát và vận hành thật còn việc. Mục tiêu250.000 đồng/khách, trần100 triệu một đợt30 ngày và80/20 giữ nguyên; không mở chi từ kiểm thử này. Các mục sau giữ lịch sử.

---

## Hiện hành 02/10/2026 — Đã kiểm thử khôi phục khách Facebook bị sót

Bản1625f66 bổ sung [kiểm kê nguồn và khôi phục tiếp nhận](FACEBOOK_SOURCE_RECONCILIATION.md): tìm khách bị sót, lưu tiến độ, chạy lại sau lỗi và chống tạo trùng trong CRM. Review độc lập, PostgreSQL và toàn bộ kiểm tra tự động PASS. Xem [bằng chứng đúng phiên bản](FACEBOOK_SOURCE_RECONCILIATION_REVIEW.md).

PR22 vẫn là bản nháp, chưa phát hành. Chưa có bằng chứng đầy đủ về phạm vi nguồn Facebook nên chưa kết luận đạt250.000 đồng/khách. Tiếp theo: chốt phạm vi đối soát và các hồ sơ thiếu; sau đó AI tư vấn, bàn giao và lịch khảo sát.100 triệu là trần một đợt30 ngày, chưa mở đợt thử. Các mục phía dưới giữ lịch sử.

---

## Hiện hành 02/10/2026 — Dashboard kỳ đo đã kiểm thử, chưa mở chạy thật

PR22 đã nối [tiền chi](SPEND_INTEGRATION.md), [nhu cầu có bằng chứng](CRM_QUALIFICATION.md), [tiếp nhận Facebook](FACEBOOK_LEAD_INTAKE.md), [hàng chờ/khôi phục](FACEBOOK_INTAKE_CONSOLE.md), [rà khách trùng](CRM_IDENTITY_OPERATIONS.md) vào [cấu hình kỳ đo và dashboard](MEASURED_COHORT.md). Bản af14635 qua review độc lập, kiểm thử PostgreSQL, full build và trình duyệt dữ liệu giả. Xem [bằng chứng và giới hạn](MEASURED_COHORT_REVIEW.md), [CURRENT](../CURRENT.md). Mọi phần còn trong PR nháp, chưa phát hành.

Dashboard tách tiền chi, khách đã xác minh, khách chờ và ngoại lệ. **Chưa đối soát đủ với nguồn Facebook nên chưa có CPQL thực tế hoặc kết luận đạt250.000 đồng/khách.** Bước tiếp theo là đối soát đầy đủ nguồn và xử lý các hồ sơ thiếu; sau đó AI tư vấn, bàn giao, lịch khảo sát và các kênh tiếp theo.100triệu vẫn là trần một đợt30ngày; chưa bắt đầu đợt thử. Các mục phía dưới giữ snapshot lịch sử, không thay trạng thái hiện hành này.

---

CRM increment: [qualification evidence](CRM_QUALIFICATION.md), default-off; see exact-head review/validation gates.

## Continuation: Facebook source integration, 02/10/2026

See [SPEND_INTEGRATION.md](SPEND_INTEGRATION.md) for the current integration and remaining gates. Local221 tests PASS. Implementation94528fa: isolated PostgreSQL16 spend10PASS/0SKIP, original command PostgreSQL PASS, Node18/22 PASS, whole frontend Vite build PASS; supported synthetic browser PASS and independent code review PASS (218 independently rerun). See [SPEND_REVIEW.md](SPEND_REVIEW.md) and [CI36983657392](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36983657392). Closing UI date guard/evidence commit must be checked on its own head. Earlier results below remain historical. Full objective is IN PROGRESS; no release or actual CPQL claim.

---

# Triển khai VPT Marketing–Sales — 02/10/2026

**IN PROGRESS.** [Kế hoạch Founder đã giao](../../architecture/VPT_MARKETING_SALES_AUTOMATION_V1.md). Code baseline PR #19 `e16c885ae7c2305645be02a1227bf378cb59137f`; main `0db11ce1adb0fb89fc87529036e495a62d58fce7`. PR19/20/21 đều open/unmerged khi đối chiếu. Không merge, deploy, đổi DB thật, lịch, ads, ngân sách hoặc gửi khách trong phiên này.

## Mục tiêu hiện tại

Founder cập nhật: đo trước theo **250.000 đồng/khách hợp lệ**; 300 khách tương ứng 75 triệu. Trần 100 triệu/30 ngày và 80/20 giữ nguyên, không bắt buộc chi hết. 7% doanh thu là mục tiêu đánh giá sau; thiếu kế toán không chặn giai đoạn Lead. Policy version VPT-MS-20261002-v2; không dùng grant/policy V1 như phê duyệt V2.

## Đã triển khai trong candidate

- Report/insights/MCP: estimated_value thành closed_estimated_value; revenue/ROAS UNKNOWN/null. Các nhận xét dựa doanh thu giả bị bỏ; MCP DealClosed không xuất Purchase revenue. UI nêu rõ số ước tính và spend có thể thiếu ads zero-Lead.
- Projection Lead: toàn bộ chi kể cả quảng cáo zero-Lead / khách canonical đã xác minh, loại trùng, tách pending/rejected, thiếu coverage trả UNKNOWN. Xem [hợp đồng nguồn](LEAD_MEASUREMENT_CONTRACT.md).
- Domain policy100m/30days,80/20,7-day hold,10%/48h,10qualified/group, same-product comparisons, source gates, decrease-first; không tự renew.
- Projection calculator nhận trusted posted net exVAT và coverage từng nguồn; khử trùng, giữ doanh thu đến muộn, cộng full spend, credits signed, unknown/zero/negative rõ.
- Care authority advise/qualify/remind/book_survey; opt-out/human takeover/channel/facts guards; human SLA08–20. Booking chỉ trả yêu cầu reserve atomically, chưa là booking đã ghi CRM.
- Renderer nội dung theo approved template+facts+expiry+company; freeform/model output không tự được xuất bản.
- Disabled command service+Supabase repository và migration648: durable idempotency/queue/audit, primary-only writes, no blind retry after uncertain send, reconciliation queue. Không seed grants/credentials/campaigns.
- Unit/regression tests và PostgreSQL CI cho ACL/RLS,12 concurrent duplicates, worker claim, terminal idempotency và crash recovery.

## Chưa được coi là hoàn tất

| Phần | Trạng thái / dependency |
|---|---|
| Gói1 tài khoản | [Inventory có nguồn](INVENTORY.md); quyền kết nối không đồng nghĩa quyền runtime/capability/write |
| Nguồn khách/chi tiêu | Chưa bind projection đầy đủ từ CRM và toàn bộ tài khoản chi; raw Lead ID/nhãn AI không chứng minh khách hợp lệ duy nhất |
| Nguồn doanh thu — hoãn | Chưa xác nhận nguồn recognized net/adjustments. Không chặn giai đoạn Lead; vẫn khóa phép đo/tối ưu doanh thu |
| Công cụ chạy thật | Chưa bind adapter publisher/ads/messaging/calendar vào command service; mặc định disabled, chưa mount vào server hoặc chạy worker |
| Kiểm ngân sách đồng thời | Domain có guard; atomic spend/exposure reservation và two-leg budget transfer chưa triển khai. Queue idempotency không thay bảo đảm ngân sách đồng thời |
| Lịch khảo sát | Chưa có calendar/roster được xác nhận; atomic slot booking và chống gửi sau takeover giữa lúc thực thi còn phải nối với canonical CRM |
| Nội dung | Chưa có asset/catalog policy được xác nhận để sinh/public các bộ ảnh/video; renderer không tự chứng nhận quyền tài sản |
| AI/API | Chưa gọi model API, chưa có trần chi công cụ; chưa đo chất lượng/chi phí thực |
| PostgreSQL | CI phải được đọc trên đúng commit; máy cục bộ không có PostgreSQL binary |
| UAT/release/trial | HOLD; chưa bắt đầu30 ngày, chưa đổi Facebook hiện hữu |

Runtime chỉ được nối khi có trusted server context loader, auth/company scope, released policy, fresh complete spend/qualified-Lead source (accounting chỉ cần cho phép đo doanh thu), provider idempotency/reconciliation và các cổng tương ứng. Các boolean trong pure domain tests là dữ liệu giả do fixture cấp, không được nhận từ HTTP/model làm bằng chứng quyền.

Không mở ads.budget_move hoặc survey.reserve chỉ vì queue test PASS. Lead projections là bản đọc từ CRM, không tạo kho khách cạnh tranh. Financial projections là bản đọc từ Finance, không là sổ kế toán thứ hai; source confirmations không nhận từ model/body.

## Thứ tự tiếp

1. Xác nhận người nhận ngoại lệ, môi trường và dataset nghiệp vụ được phép; kế toán để giai đoạn doanh thu. Câu hỏi đã gửi Founder trong task; không tự đặt tên người.
2. Nối coverage/account/campaign registry, toàn bộ spend và canonical CRM qualification vào Lead projection; kiểm khách gửi lại qua Facebook/Google, pending/rejected và sai công ty. Source Finance là gói nối tiếp.
3. Xây atomic budget reservation + decrease/reconcile/increase; slot transaction+takeover barrier trước bất kỳ provider write.
4. Bind adapters có capability/quyền thật theo từng kênh; hoàn thiện tài sản và landing. Kiểm tra full app/build/auth và UAT.
5. Reviewer độc lập + gói phát hành để Founder quyết định. Hoàn tác bằng ngừng đường mới, giữ outbox/audit/khách; không xóa giao dịch.

Compatibility: revenue/ROAS không còn là estimate; consumers phải xử lý null/status. MCP event_name chuyển Purchase→DealClosed và value→null, có closed_estimated_value. Không migration dữ liệu lịch sử để đổi số; historical insight financial comments được lọc lúc đọc.



04/10/2026: [CRM merge — quyền và findings bảo toàn](LEGACY_CRM_MERGE_REPAIR.md). Local checkpoint117/0/0; PostgreSQL/review cuối chờ. Cleanup không tự coi chung Customer là trùng. CRM merge/cutover chưa READY; full goal ACTIVE.


Runtime 2cac0949: checkpoint quyền CRM đạt PostgreSQL 271/0/0, Node22 843+26+117, cả 10 job/build/report/Messenger SUCCESS; CI tree đã đối chiếu. [Bằng chứng và giới hạn](LEGACY_CRM_MERGE_REPAIR.md). CRM merge bảo toàn/transaction và cutover vẫn OPEN/HOLD.
Checkpoint [AI đề xuất lịch khảo sát theo quyền riêng](CARE_SURVEY_RUNTIME.md) đã đạt tại e91381a: PostgreSQL489/0/0, Node18/22 mỗi bản1.388/0/0, cả10job/build/report/Messenger và review độc lập PASS. Chưa provider thật/enrollment/UAT/phát hành; full goal ACTIVE.

- [Theo dõi hoạt động AI và đóng lượt chờ](CARE_RUNTIME_CONSOLE.md): giao diện API runtime, bằng chứng gửi và lịch; trạng thái nghiệm thu xem tài liệu.

- [Mức sử dụng và hàng chờ chi phí AI](CARE_INFERENCE_COST_CONSOLE.md): tổng policy/receipt, token đã biết và actualcost chưa xác định; không tự mở UNKNOWN.
