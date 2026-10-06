# Review độc lập H1 — 2026-10-06

PR: [#29](https://github.com/backen-pixel/Quanlycongviec/pull/29). Base main: `1f879ea85dfff23629fef79c8d15f2eaf540328e`. Runtime được rà: `c97c2f3d15f0f05c028e488be3116c99e1eadf80`, cây backend/src `52859b9a9c8b3ae76d114efa99567cbc9c11d7e1`, SQL701 blob `6aa36356c12904f7f72ca85392805b4108f877eb`.

Reviewer: Agent phiên riêng `marketing_release_review`, không viết mã gói H1. Hai agent từng có tên review ở các công việc cũ đã tham gia viết SQL/handler cho gói này, vì vậy **không** được tính là reviewer độc lập của H1. Báo cáo này tổng hợp phản hồi phiên reviewer, không thay phê duyệt Founder/GitHub maintainer.

## Kết luận của reviewer

**PASS phạm vi code H1 mặc định tắt/paused; vận hành HOLD.** Reviewer đọc nguồn/SQL/workflow/docs và chạy riêng các nhóm Node, tổng104 kiểm thử đạt. PostgreSQL CI tại thời điểm kết luận chưa được reviewer xác nhận; kết quả hoàn tất phải có nguồn riêng trong hồ sơ chính.

Các finding đã sửa và kiểm lại:

- Unknown/postback/delivery trước đây có thể bị coi như xử lý xong: new mode giữ pending với lý do rõ.
- Message đã insert nhưng chưa sửa preview/unread có thể retry rồi bỏ qua bước lỗi: new mode giữ pending trước projection chưa có hợp đồng nguyên tử. Read watermark cũ không được reset counter mới.
- Primary request đang gửi rồi chuyển active target sang Backup: response vẫn gắn hook Primary; không ghi nhật ký failback nhầm. Client Backup lưu từ trước cũng không thực thi trong Primary-only context.
- Reaction thiếu sender có thể có unique key sai; now bắt buộc actor và đủ identity. Reaction không kéo theo backfill Lead/attribution.
- Retry message ghi lặp payload vào webhook log: new mode bỏ log legacy và không log tên/nội dung/URL tệp khách.
- CI theo dõi thêm dependency mapping form và SQL700. Lead Ads mới yêu cầu phiên bản Graph cấu hình rõ, không tự dùng phiên bản legacy.

Giới hạn review: VM/synthetic không chứng minh schema unique keys đang áp dụng thật, quyền Page/Graph, người nhận CRM hoặc khả năng restore production. Lease chỉ quản lý queue; không bảo đảm mọi tác dụng nghiệp vụ đúng một lần. Các nhánh chưa có hợp đồng idempotency/scoping được giữ pending.

**Không bật receiver trên Page thật ở trạng thái này:** nó thay toàn endpoint; một event cố ý pending sẽ giữ các event phía sau cùng Page. Cần hoàn thiện hợp đồng Lead Ads/projection được chọn và bằng chứng môi trường đích. H2/C/ngân sách ngoài gói; không phát sinh quyền mở các phần đó.
