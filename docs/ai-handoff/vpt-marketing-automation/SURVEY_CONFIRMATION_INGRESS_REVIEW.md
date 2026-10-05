# Review nhận xác nhận khảo sát — 03/10/2026

**PASS cho increment SQL666 tại runtime0a97a85; phát hành/UAT vẫn HOLD.** Reviewer độc lập: phiên `/root/architecture_v11_review`, tách với người triển khai. Không còn finding chặn trong phạm vi kiểm tra.

## Phiên bản

- Runtime: `0a97a85721aa40ab1e743b3d72609fc82afeba8c`, parent `2acd82fc4d617f67daf082bcf69fa3349319135c`.
- SQL666 blob: `d33f9bc8c115fb33f8eb4a647796299a50b3dce7`.
- PostgreSQL cases: `befcdb97a810ab3eb1be2200299d7834b03a71f6`.
- Receiver: `5611d7ebd84c07484c9f31d1e60abf75ed1c8aca`.
- Route: `1cc4bbe1d6afdd9ceb488da7a3088b4dc2b1b7b4`; chỉ3 dòng thêm/1 dòng bỏ, giữ nguyên kiểu xuống dòng lịch sử.
- CI merge checkout: `0866f9be9012a672005292f4a2c0eec7caa090fe`, chứa runtime0a97a85 và base PR19 `e16c885ae7c2305645be02a1227bf378cb59137f`.

## Bằng chứng

| Kiểm tra | Kết quả | Nguồn |
|---|---|---|
| PostgreSQL16 cô lập | 137 PASS / 0 FAIL / 0 SKIP, gồm14 case mới | [Job111109533785](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37090472463/job/111109533785) |
| Domain/regression Node22 | 580 PASS / 0 FAIL / 0 SKIP | [Job111109533774](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37090472463/job/111109533774) |
| Frontend đầy đủ | 10.307 modules, thành công35,32 giây | [Job111109533768](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37090472463/job/111109533768) |
| Automation | Cả10 job SUCCESS, gồm Node18 và các bộ DB liên quan | [Run37090472463](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37090472463) |
| Report/Messenger regression | SUCCESS | [Report](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37090472469), [Messenger](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37090472481) |

Root và reviewer đọc log thực tế. Root local31 care/proposal PASS; reviewer tự chạy41 care/webhook/proposal PASS, có route thật với dependency giả. Không thay UI hoặc tuyên bố browser/UAT mới. PostgreSQL chỉ chạy trong CI cô lập.

Đã kiểm raw body ký bằng secret thử đi qua receiver thật vào DB và tạo một booking/handoff; sai chữ ký, token trong prose, sai khách/token, payload đổi trên cùng MID; STOP/human/unknown echo cùng batch; ACK đến muộn, dừng liên hệ trong lúc chờ, thu hồi quyền/enrollment; quyền public sau broad grants; redelivery đồng thời; rollback rồi nhận lại.

Hai finding P2 của reviewer đã sửa và có regression thực thi:
- Worker đọc WAITING trước đó không ghi đè BOOKED khi một worker khác đã đặt thành công và enrollment bị thu hồi trong lúc chờ.
- Reconcile giới hạn1 vẫn xử lý receipt đã ACK ở phía sau receipt chưa ACK, tránh hết hạn do hàng chờ không tiến.

Mã xác nhận được bỏ khỏi bản đưa vào legacy logs/queue sau cả hai signed receiver; raw bytes và hash message cũ được giữ để xác thực/retry.

## Phạm vi chưa được chứng minh

Delivery proof do DB owner mô phỏng; không có lệnh gửi Meta ngoài thực tế. HMAC dùng secret giả trong phép thử. SQL nhận normalized event từ server tin cậy, không tự kiểm chữ ký Meta trong DB; service_role credential không được cấp cho AI/Tool Gateway.

Dispatcher, own-send echo correlation, worker reconcile sau ACK/định kỳ, quyền và cửa sổ gửi Meta vẫn chưa tích hợp. Mọi echo hiện tiếp tục yêu cầu người; chưa mở gửi đề xuất vì chưa phân biệt echo của chính ứng dụng. UI khảo sát, người nhận ACK, thông báo khách, hủy/đổi lịch, chuyển/chặn writer cũ, nguồn/lịch thật, đối soát CPQL, sao lưu/khôi phục và UAT còn bắt buộc.

Enrollment rỗng, cờ mặc định tắt; không merge/deploy, sửa DB thật, gửi tin, gọi model, đổi quảng cáo hoặc mở trial. Hoàn tác dừng tiếp nhận confirmation/reconcile, giữ care nhận STOP và mọi receipt/booking/handoff/audit; không xóa giao dịch hoặc mở writer cũ không kiểm soát. [Hợp đồng và rollback](SURVEY_CONFIRMATION_INGRESS.md). Toàn bộ mục tiêu vẫn ACTIVE.
