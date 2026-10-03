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

