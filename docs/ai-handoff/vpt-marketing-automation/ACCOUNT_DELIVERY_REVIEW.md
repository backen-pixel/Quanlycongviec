# Kiểm chứng đối soát quảng cáo đã phân phối

Ngày 03/10/2026. Runtime `02f164b4f9ac53f9926c5cc37c5b36b216e86111`, tree `f470008f6614163be5dac5427d72c3b612e593d9`, PR22 draft. [Phạm vi, hợp đồng acceptance tiếp theo và hoàn tác](ACCOUNT_DELIVERY.md).

## Bằng chứng đúng phiên bản

- [Automation37117547354](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37117547354): cả10job SUCCESS.
- [Census PostgreSQL111187166387](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37117547354/job/111187166387):78PASS/0FAIL/0SKIP, gồm7ca delivery mới; HTTP1/0/0.
- [Node22 111187166378](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37117547354/job/111187166378):784PASS/0FAIL/0SKIP; Node18 SUCCESS.
- [Full frontend build111187166477](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37117547354/job/111187166477):10.321modules,24.31s,SUCCESS.
- [Report37117547347](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37117547347) và [Messenger37117547345](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37117547345) SUCCESS.
- CI checkout `f80ed5a573c25429a207806a9c1f42ad2e8c5615`; Git API xác nhận parents là runtime02f164b và basee16c885ae7c2305645be02a1227bf378cb59137f, tree giống runtime.

## Kiểm thử và review

Local24ca mới/103ca liên quan PASS. Reviewer độc lập tự chạy90ca trên candidate đầu, phát hiện paging sai kiểu có thể bị hiểu nhầm là hết trang. Đã sửa và thêm6ca sai kiểu paging/cursors. Reviewer kiểm lại24/24 ca mới, đối chiếu3blob remote với local, xác nhận lỗi đã đóng. Reviewer cũng chỉ ra biến động ngày hiện tại có thể làm hỏng đối soát; collector mới đã dùng kỳ kết thúc hôm qua theo giờ Việt Nam cho cả run và request, có kiểm lúc qua nửa đêm. Reviewer độc lập /root/architecture_v11_review đã đọc CI đúng runtime và kết luận PASS trong phạm vi increment; không còn finding chặn. Không có kiểm thử trình duyệt độc lập.

SQL676 áp dụng hai lần trên PostgreSQL16 cô lập. Bảy ca mới kiểm:

1. Table/helper private và broad browser grant vẫn không cho đọc/ghi sai quyền.
2. Collector thật với phản hồi Meta giả → spend RPC → witness và dashboard, giữ account zero-Lead, ad zero-spend có tín hiệu và source-only ad exception;1triệu/4khách vẫn chỉ là số trên tập đã đối soát.
3. Hai yêu cầu hoàn tất đồng thời chỉ lưu một witness; thay hoặc bỏ witness khi retry bị từ chối.
4. Thiếu/trùng/mâu thuẫn số hoặc chèn thuộc tính lạ không công bố tiền hay witness.
5. Thu hồi account chặn hoàn tất và replay; lần chạy mới lỗi không hiện lại ad inventory cũ.
6. Lỗi lúc append witness rollback cả việc hoàn tất spend.
7. Khi run mới commit trong lúc đọc báo cáo, tiền và witness cùng giữ snapshot cũ; lần đọc sau cùng chuyển sang run mới.

## Giới hạn

Các phản hồi Meta dùng dữ liệu giả; chưa gọi tài khoản thật. UI mới chỉ đọc và đã qua full build, chưa browser/UAT trên trang vận hành thật. Không chứng minh lịch sử đích, nguồn/bộ lọc/retention của tệp Lead, đủ mọi điểm nhận hoặc CPQL toàn đợt. Cần triển khai acceptance nối các bằng chứng này theo hợp đồng đã lưu, rồi hoàn tất AI/lịch/ngoại lệ và nghiệm thu toàn tuyến. Full goal ACTIVE.

Không merge, migration thật, cấp quyền AI, gửi khách, đổi quảng cáo/ngân sách hoặc bật đợt thử. Hạn mức100triệu/30ngày và mục tiêu250.000đ/khách giữ nguyên.
