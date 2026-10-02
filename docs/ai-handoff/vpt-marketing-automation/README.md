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
