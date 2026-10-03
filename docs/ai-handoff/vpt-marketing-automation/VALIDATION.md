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

## Continuation: Facebook source integration, 02/10/2026

See [SPEND_INTEGRATION.md](SPEND_INTEGRATION.md) for the current integration and remaining gates. Local221 tests PASS. Implementation94528fa: isolated PostgreSQL16 spend10PASS/0SKIP, original command PostgreSQL PASS, Node18/22 PASS, whole frontend Vite build PASS; supported synthetic browser PASS and independent code review PASS (218 independently rerun). See [SPEND_REVIEW.md](SPEND_REVIEW.md) and [CI36983657392](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36983657392). Closing UI date guard/evidence commit must be checked on its own head. Earlier results below remain historical. Full objective is IN PROGRESS; no release or actual CPQL claim.

---

# Validation — VPT Marketing–Sales candidate

Ngày02/10/2026. PR22 stacked trên PR19 `e16c885ae7c2305645be02a1227bf378cb59137f`. Không phải production acceptance.

## Kết quả đã có

- **163/163 unit/regression PASS** ở candidate đo Lead V2, Node24 cục bộ; reviewer chạy độc lập cùng163 case. Bao gồm25 case đo Lead mới,53 regression PR19 kế thừa (hai assertion estimate sửa đúng nghĩa), historical financial ranking, MCP/insights và domain/command controls. Không skipped.
- **CI bản Lead V2 `9877a751a762d1f1468652b45cdd321dfecc79e9` PASS:** [run36977749416](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36977749416), Node18/22 và PostgreSQL16; [report regression36977749467](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36977749467) PASS. Đã đối chiếu đủ26 file trên GitHub với Git blob hash của candidate, không sai khác. Commit đóng hồ sơ sau mốc này chỉ đổi tài liệu; nếu thay code tiếp phải kiểm lại delta tương ứng và checks head trước merge.
- **Browser synthetic smoke PASS:** biên dịch component React đã sửa với API giả, CSS fixture; mở loopback4182 bằng công cụ trình duyệt được hỗ trợ. Thấy mục tiêu250.000/khách, số115 triệu gắn nhãn estimate, nhãnấm/nóng tách khỏi hợp lệ; bật lỗi CRM rồi tải lại làm mất số liệu cũ, hiện UNKNOWN thay0. Nhật ký không có lỗiJS. CSP `connect-src 'none'`, không đăng nhập/CRM/khách thật. Đây không phải full app build, mobile UAT hoặc test auth thật.
- Review độc lập code/domain/SQL/report/UI PASS trong phạm vi runtime đang tắt; [chi tiết](INDEPENDENT_REVIEW.md). Fullplan, adapters và release vẫn IN PROGRESS/HOLD.

## PostgreSQL cô lập

Workflow tạo PostgreSQL16 mới trên loopback, database `marketing_automation_test`, không dùng credentials thật. Kiểm reapply migration, anon/authenticated bị từ chối, RLS không lộ hàng, sai company/version/action, grant malformed/NULL,12 concurrent duplicate submits, conflict đổi nội dung, thu hồi/hết hạn grant, claim đồng thời, idempotent terminal và phục hồi RUNNING thành UNKNOWN không replay.

Máy cục bộ chưa có PostgreSQL binary. Kiểm xử lý đồng thời của queue không chứng minh atomic budget reservation, calendar slot hoặc takeover barrier — các phần đó chưa được triển khai. Không áp migration648 lên DB thật.

## Giới hạn còn lại

Nguồn toàn bộ spend/qualification/CRM canonical chưa bind, nên không có CPQL thật hoặc bằng chứng đạt250k. Số lượng ID trong fixture không chứng minh khả năng gộp cùng khách giữa Facebook/Google; xem [hợp đồng adapter](LEAD_MEASUREMENT_CONTRACT.md). Nguồn kế toán hoãn theo Founder; không chặn giai đoạn Lead nhưng chưa được báo7% doanh thu.

Runtime command service chưa mount/khởi chạy, chưa nối API nhà cung cấp hoặc model, chưa có grant thật. Chưa hoàn tất sáu kênh, thư viện tài sản, lịch khảo sát/roster, dừng và đổi ngân sách thật, chi phí API, gói phát hành. Không dùng unit tests để suy quyền sản xuất hoặc hiệu quả kinh doanh.

Local Node child test-runner/esbuild từng gặp spawn EPERM. Unit chạy cùng process với node:test; esbuild chạy qua cơ chế escalation được chấp thuận. Không có auto-review rejection trong đợt này, không truy cập tài khoản thật bằng đường thay thế.
