# Trợ lý đọc hội thoại và chọn nội dung tư vấn

Ngày 04/10/2026. Phạm vi: SQL689, Application Service và đường API bản nháp trong PR22. Bản56d424f đã qua CI; đang kiểm lại ca chờ khóa với observer rõ ràng trước kết luận review cuối.

## Hành vi đã triển khai

Một yêu cầu có actor xác thực, công ty, thread, phiên bản và request ID. Business OS đọc hội thoại/đích CRM và thư viện cùng phạm vi; chỉ nhận trạng thái WAITING, người nhận/khu vực còn hợp lệ và nội dung APPROVED còn nguồn/phê duyệt hiệu lực. Mô hình chỉ nhận bí danh tin nhắn/câu trả lời và nội dung cần đọc, không nhận PSID, Page token, tên người phụ trách, chi phí nội bộ sản phẩm hoặc URL tệp đính kèm. Văn bản hội thoại vẫn có thể chứa thông tin cá nhân; việc dùng provider thật cần cấu hình dữ liệu được duyệt.

AI chọn một câu trả lời nguyên văn, hoặc đề nghị chuyển người; trích nhu cầu theo năm trường sản phẩm, địa bàn, ngân sách, thời gian và yêu cầu. Mỗi trích dẫn phải tồn tại nguyên văn trong tin nhắn inbound tương ứng. Đây là nhận định chưa xác minh, không tự sửa Lead hoặc tính khách hợp lệ. Cấu trúc hợp lệ không chứng minh mô hình chọn đúng câu trả lời; đánh giá chất lượng tư vấn bằng mô hình thật còn bắt buộc.

Sau inference, SQL kiểm lại actor, thread, người nhận, nguồn, publisher và phiên bản thư viện. Khách ngừng liên hệ, người tiếp quản, tin nhắn mới hoặc nguồn đổi làm kết quả vào REVIEW, không hiển thị câu trả lời cũ. Page/CRM chuyển phạm vi vẫn lưu terminal REVIEW với envelope tối thiểu cho chính yêu cầu đó; reader lịch sử từ chối phạm vi không còn hợp lệ.

## Nhật ký và phục hồi

BEGIN ghi RUNNING và cấp một capability đúng một lần. Cùng request replay chỉ đọc; UUID khác không thể gọi lại cùng context. Không giữ giao dịch DB trong lúc inference. FINISH ghi kết quả/audit nguyên giao dịch. Mất phản hồi phải đọc lại request, không tự gọi lại mô hình.

RUNNING quá 5 phút có cờ cần đối soát. CLOSE tường minh giữ bằng chứng và chặn kết quả về muộn. CLOSE không chứng minh provider đã hủy hoặc không tính phí. RETRY có request mới, liên kết retry_of duy nhất, lý do và kiểm quyền/context hiện hành; chỉ từ FAILED hoặc REVIEW/OPERATOR_CLOSED, tối đa ba attempt trên cùng context. Không cho phân nhánh hoặc retry RUNNING, HANDOFF hay CONTEXT_CHANGED. Đây là giới hạn kỹ thuật, không thay hạn mức chi AI cần Founder duyệt.

## Phạm vi API và cấu hình

- GET /api/facebook/customer-care/advisor/draft: đọc bằng companyId/requestId.
- POST cùng đường: companyId/requestId/threadId/version để tạo bản nháp.
- POST .../close: companyId/requestId/reason để đối soát.
- POST .../retry: companyId/requestId/previousRequestId/version/reason; không tự thử lại sau lỗi.
- Actor lấy từ xác thực server; SQL chỉ cấp EXECUTE cho service_role, bảng và helper private không cho service/browser đọc trực tiếp.

VPT_CARE_ADVISOR_ADMIN và VPT_CARE_ADVISOR_DRAFTS mặc định tắt. Router chưa gắn inference provider: dù đặt cờ, generation vẫn từ chối khi thiếu port. Service port được kiểm bằng fake inference trong cùng đường Application Service → PostgreSQL. Không tự tìm/dùng khóa OpenAI hiện có. Mất Primary trong lúc inference phải giữ lượt chờ đối soát, không ghi failure sang Backup.

Giới hạn context hiện tại là 50 tin nhắn, 50 bản APPROVED trong audience và 100 KB. Vượt giới hạn thì từ chối rõ ràng; chưa có tóm tắt hội thoại dài/retrieval lớn. Không tải ảnh/video/link từ lời khách.

## Phần chưa hoàn tất của mục tiêu

Chưa có provider/model/key và giới hạn chi được cấu hình; chưa đo chất lượng, latency hay chi phí mô hình thật. Chưa có danh tính/ủy quyền runtime riêng, worker tự nhận tin, giao diện draft/retry, lưu nhu cầu được xác minh và tự gửi câu trả lời. send=false/aiMaySend=false; không đổi trạng thái thread, đặt lịch, thông báo người khảo sát hoặc mở quyền quảng cáo.

Tiếp theo phải nối provider và quyền theo gói đã duyệt, bổ sung giao diện/worker và bước gửi dùng quyền hiện hành; ghép với luồng khảo sát đã có, kiểm chất lượng hội thoại và UAT trọn tuyến. Sau đó mới trình Founder phát hành. Mục tiêu khách/chi phí/dashboard/đa kênh vẫn giữ nguyên; draft này không phải hoàn thành AI Sales.

## Kiểm chứng và hoàn tác

Runtime56d424f54373557f75bd0d808db10b4e4a865461, tree6e699331cbe81228fe07fcd3fed88d3984b74649: local1.331 PASS/5 skip; Node18/22 CI mỗi bản1.336 PASS/0 fail/0 skip; PostgreSQL393/0/0 gồm22 ca mới và API → SQL → inference giả → SQL. Cả10 job/build/report/Messenger SUCCESS. CI merge1fec83c10a5d48b077c06afa9ad8dadf09105d2f được đối chiếu đúng tree và hai parent.

[Automation37185360650](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37185360650), [PostgreSQL111386035796](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37185360650/job/111386035796), [Node22](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37185360650/job/111386035756).

Reviewer độc lập đang khép bằng chứng; finding đã sửa gồm ghi nhầm Backup, retry thiếu đường phục hồi, NULL reason cấp retry và rollback terminal khi Page đổi phạm vi. Ca chờ khóa đang bổ sung pg_stat_activity barrier để chứng minh FINISH thực sự chờ transaction OPT_OUT, thay vì chỉ kiểm trạng thái sau COMMIT. Runtime không đổi trong delta bằng chứng này.

Hoàn tác: giữ cờ tắt hoặc tắt admission, chờ inference đang chạy; giữ nhật ký để đối soát và không gửi lại. Không drop bảng, xóa request hoặc mở lại quyền cũ. SQL689 chưa áp DB thật; không tự chạy migration/phát hành.
