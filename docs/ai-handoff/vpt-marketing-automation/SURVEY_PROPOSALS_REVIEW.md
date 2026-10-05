# Review lõi đề xuất và đặt khảo sát — 03/10/2026

**PASS cho phạm vi SQL665/API đề xuất; phát hành và UAT vẫn HOLD.** Reviewer độc lập: phiên `/root/architecture_v11_review`, tách với người triển khai, đã đọc mã công bố và log thực thi. Không còn finding chặn trong phạm vi này.

## Phiên bản và phạm vi

- Runtime cuối: `243440d352718dc2eafab96c5c81d12ca6fffa46`, trên bản khởi tạo `c1dd92687cbca4b59a191098d5f812a0e87b6c1f`.
- SQL665 blob: `db13ae0651c49c8b0c37472293800ccc080d98ec`.
- PostgreSQL cases blob: `3272acf7ac512294f5f862bf709287676ef04d5c`.
- Service blob: `ca87d93167df333250a0c079b3a15504b8d01f10`; unit tests: `aa7a2fb389e93950d87f58e7ec5fb07ccf943f76`.
- CI merge checkout: `388c15e18414e6ee760267023d4df72792dfc585`, chứa runtime243440d và base PR19 `e16c885ae7c2305645be02a1227bf378cb59137f`.

Lõi tạo đề xuất giữ nguyên người/khách/lịch/địa chỉ; xác nhận riêng kiểm lại quyền, trạng thái chăm khách, nguồn, enrollment và thời hạn. Đặt lịch lưu event, attendee, bằng chứng xác nhận, audit và hàng bàn giao trong cùng giao dịch. API công khai chỉ tạo/đọc đề xuất; mặc định tắt, không cho ứng dụng lấy token hoặc gọi book.

## Bằng chứng thực thi

| Kiểm tra | Kết quả | Nguồn |
|---|---|---|
| PostgreSQL16 cô lập | 123 PASS / 0 FAIL / 0 SKIP, gồm 12 tình huống mới | [Job111104487731](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37088794073/job/111104487731) |
| Domain/regression Node22 | 574 PASS / 0 FAIL / 0 SKIP | [Job111104487697](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37088794073/job/111104487697) |
| Frontend đầy đủ | 10.307 modules, thành công39,62 giây | [Job111104487649](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37088794073/job/111104487649) |
| Automation | Cả10 job SUCCESS, gồm Node18 và các bộ PostgreSQL liên quan | [Run37088794073](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37088794073) |
| Report/Messenger regression | SUCCESS | [Report](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37088794071), [Messenger](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37088794086) |

Root và reviewer đã đọc log thực tế. Local adapter7/7 PASS; cú pháp JS và diff sạch. Không chạy PostgreSQL cục bộ, không có thay đổi UI hoặc tuyên bố nghiệm thu browser mới.

12 case mới bao gồm: quyền/private proof; tạo đủ booking và replay; click trước ACK; sai token/Page/PSID/tin cũ; supersession và replay nguyên lý do; STOP/takeover/đổi người nhận/nguồn/enrollment; mapping Customer mâu thuẫn hoặc thu hồi quyền; cạnh tranh cùng giờ/cùng confirmation; rollback sau event/participant/audit/handoff; hết hạn sau trigger chậm; giữ buffer cũ; timestamp cùng mili giây và trước một mili giây.

Review đã sửa fingerprint quá rộng theo metadata hộp thư, mất lý do khi replay, thứ tự ACK–click và độ chính xác mili giây. Run c1dd926 [37088378492](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37088378492) thất bại thật ở qualifier biến PL/pgSQL và fixture sai khóa ngoại; không dùng làm PASS. Nhãn block rõ ràng và Customer fixture có thật đã được run mới kiểm chứng.

## Giới hạn và hoàn tác

Private delivery/inbound proof được **PostgreSQL owner mô phỏng**, không phải bằng chứng từ Meta, signed webhook hay khách thực tế. Chưa có dispatcher, adapter nhận token xác nhận, xử lý echo/batch STOP hoặc quyền ứng dụng gọi book. Handoff còn PENDING, chưa chứng minh người khảo sát nhận/ACK hoặc khách được thông báo.

UI đề xuất, thông báo, hủy/đổi lịch, chuyển/chặn writer cũ, dữ liệu/nhân sự thực tế, đối soát đầy đủ nguồn/chi tiêu, hiệu năng và sao lưu/khôi phục/failover còn bắt buộc trước phát hành. SQL664 tiếp tục tuần tự hóa calendar writes và yêu cầu READ COMMITTED ngay cả khi enrollment rỗng; backup REST hiện bỏ qua RPC. Xem [hợp đồng](SURVEY_PROPOSALS.md) và [guard](SURVEY_CALENDAR_GUARD.md).

Hoàn tác: dừng lệnh mới, giữ proposal/receipt/booking/handoff/audit và đối soát trước chuyển lại quyền ghi. Không xóa giao dịch hoặc mở lại đường không kiểm soát. Không merge/deploy, gọi model, thay DB thật, gửi tin, đặt lịch thật, đổi quảng cáo hoặc mở đợt chi. Toàn bộ mục tiêu vẫn ACTIVE; chưa có CPQL thực tế chứng minh250.000 đồng/khách.
