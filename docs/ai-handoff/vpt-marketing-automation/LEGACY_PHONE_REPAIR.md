# Quét và đối soát số điện thoại cũ — 04/10/2026

## Phạm vi thay đổi

Baseline `a972c030e5065d3d8d8135d4ee22e59a87c9d160`. Tiếp nối [SQL682/preflight](LEGACY_WRITE_PREFLIGHT.md), sửa các đường quét điện thoại trước khi chuyển Page sang luồng chăm khách mới.

- Batch extract, quét theo ngày, rescan và quality scan/apply lấy phạm vi công ty từ người dùng đã xác thực. Nhân viên/admin công ty không được mở rộng phạm vi chỉ vì cùng tenant. Page owner được đọc hiện hành, không lấy cache 60 giây. Admin hệ sinh thái thiếu tenant bị từ chối; quyền toàn hệ thống chỉ giữ cho platform admin. Service auto-pipeline vẫn phải có công ty cụ thể.
- Quality apply kiểm toàn bộ ID yêu cầu trước xử lý. `page_id` do client gửi chỉ thu hẹp phạm vi server, không ghi đè nó.
- Shared Graph/extract/reconcile kiểm preflight trước ghi, kiểm lại Lead/Customer vừa tìm được. Vòng đồng bộ mô tả chỉ nhận danh sách Lead cụ thể của nhóm contact đã chọn; bỏ vòng quét toàn bộ Lead.
- Lỗi đọc/ghi DB dừng bước tiếp theo. Không coi lỗi đọc là không có tin nhắn, không tiếp tục xóa contact sau lỗi xóa tin nhắn hoặc báo cập nhật thành công sau lỗi Customer.
- Graph lỗi HTTP/payload/phân trang không được trả lịch sử một phần như thành công. Chạm giới hạn trang còn `next` trả trạng thái partial; không ghi thời điểm đồng bộ thành công hoặc cho phép cleanup.
- MID đang khóa chỉ được coi đã đồng bộ nếu tin thực sự tồn tại và thuộc đúng contact. Nếu chưa lưu hoặc gắn contact khác thì dừng. Số tin đã ghi trước lỗi vẫn được báo đúng.
- Khi chưa thấy số điện thoại, kết quả đọc 501/801 dòng báo cửa sổ chưa đầy đủ và chặn suy luận âm dẫn tới xóa/clear. Không dùng một cửa sổ giới hạn để chứng minh khách không có số.

## Kiểm chứng

Runtime `119491ed2e25256a441ddfd400e68ab9a39816aa`, tree `00a28ab5a7ea36b5377fa8d957da9cb328bd0b99`. CImerge `bd4dee9f3546641b866396dfcf376eaa8023c591` có cùng tree và đúng parents base/runtime. [Run37139607314](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37139607314): 9/10job đạt; [intake111251124860](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37139607314/job/111251124860) đạt6ca mới257–262 nhưng fail ca báo cáo cũ211 (unlinkedProofs toàn kỳ bằng3, test kỳ vọng1). Không báo toàn CI PASS. Sửa test đọc baseline trước khi đổi công ty của Lead và kiểm đúng tăng1; vẫn giữ yêu cầu booked/paid giảm2→1, ẩn tiêu đề ngoài công ty. Runtime giữ nguyên; đang kiểm lại.

- `facebookLegacyPhoneRepair.test.js`: **34 ca mới PASS local**; chạy actual helper/function/route với adapter giả, không gọi Meta/model. Bao gồm actual company resolver, Page đổi chủ, thiếu tenant, actor sai công ty, lỗi đọc/ghi, MID lock, phân trang và cửa sổ không đầy đủ.
- Cùng scope/webhook recovery/intake integration: **77 PASS/0 FAIL/0 SKIP local**.
- `careLegacyWrite.cases.js` thêm **6 ca PostgreSQL cô lập PASS** trong job trên: managed Page không ghi; lỗi đọc không clear; lỗi Customer dừng trước Lead; positive cleanup; cửa sổ801 không xóa; mixed Page selection bị từ chối. Toàn bộ intake chưa PASS do ca211.
- Review độc lập **PASS mã delta** sau sửa tenant actor, cache Page, MID pending và history cap. Reviewer tự chạy34/34 ca mới và43/43 regression; đã đọc6ca PostgreSQL. Kết luận runtime còn chờ CI.

## Giới hạn và việc còn lại

Nhiều lời gọi DB qua HTTP vẫn không phải một giao dịch nguyên tử. Ví dụ contact đã clear nhưng Customer update thất bại: tác vụ phải báo lỗi và giữ Lead, không tự báo hoàn tất hay xóa tiếp. PG kiểm rõ trạng thái một phần này. SQL682 không giữ khóa giữa các HTTP request; vẫn phải dừng/chờ writer cũ và đối soát trước enrollment.

CRM merge/cleanup còn finding kiểm quyền actor và lỗi chuyển liên kết trước khi xóa nguồn. Manual/automatic Lead creation còn phải kiểm công ty của đích Customer/Lead. Quản lý timer, toàn bộ writer khác, luồng AI/model/lịch/người nhận, phạm vi đo thực, sao lưu/khôi phục và UAT vẫn còn việc. Không dùng PASS của gói phone để chứng nhận tất cả các phần trên.

**Cutover/UAT/phát hành HOLD.** Không có thay đổi DB thật, enrollment Page, quyền AI, gửi tin hay ngân sách. Mục tiêu 250.000 đồng/khách hợp lệ chưa được chứng minh bằng vận hành thật.

## Hoàn tác

Trước phát hành: bỏ delta ứng dụng trên nhánh thử nếu cần; không có migration mới trong gói này. Không đưa phiên bản bỏ kiểm quyền vào vận hành như một phương án rollback. Sau phát hành phải theo gói Founder duyệt: dừng worker mới, giữ bằng chứng và đối soát từng thao tác một phần; không xóa giao dịch hoặc mở lại writer thiếu kiểm soát.
