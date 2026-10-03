# Bằng chứng nối nhóm quảng cáo với chăm sóc và khảo sát

Phiên bản kiểm chứng: `3f8a56566f7010035385ff3b4a5e8b691a71fb88`; tree `1ae3307f28f4ff3fb6fa2370f661dd119e4b2861`. Runtime giữ nguyên từ `3486c59ca41642d6deeaa796aa5b4ad8f43f8cb2`; bản sau chỉ sửa observer kiểm thử và tài liệu.

## Kiểm tự động đúng phiên bản

- [Automation 37125131493](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37125131493): cả 10 job SUCCESS.
- [PostgreSQL intake 111208772997](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37125131493/job/111208772997): **214 PASS / 0 FAIL / 0 SKIP**, gồm 6 ca cohort mới và các ca vận hành hiện có chạy qua helper chung SQL678.
- [Node22 111208773013](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37125131493/job/111208773013): **828/0/0**; Node18 cũng SUCCESS.
- [Frontend 111208773005](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37125131493/job/111208773005): 10.325 modules, 24,73 giây, SUCCESS.
- [Report 37125131484](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37125131484) và [Messenger 37125131488](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37125131488): SUCCESS.
- CI checkout merge `a93b9373e5ec94b2329500b5c3fea2f6cfaf8b52`, hai parent là base `e16c885ae7c2305645be02a1227bf378cb59137f` và bản kiểm chứng `3f8a565…`. Git API xác nhận tree bằng đúng tree của bản kiểm chứng, không suy luận PASS từ head khác.

Local 20 ca mới, 44 ca mới và vận hành liên quan PASS. Reviewer độc lập đã tự chạy cùng 44 ca, rà SQL/API/UI và đưa PASS cho mã. Lượt cuối tại3f8a565 đã đọc trực tiếp log PostgreSQL/Node22/build, kiểm sửa observer giữ đúng mục đích kiểm quyền, và kết luận PASS trong phạm vi increment; không còn finding chặn.

## Nội dung bằng chứng

Các ca PostgreSQL dùng luồng dispatch/confirmation/booking hiện có với Meta giả; nguồn quảng cáo được seed rõ là dữ liệu giả trong DB cô lập. Không gọi Meta hoặc CRM thật.

1. RPC từ chối browser role, sales không có quyền, sai công ty, trial không tồn tại và helper riêng; grant nhầm public RPC cho authenticated không bỏ được kiểm service_role.
2. Hai Lead có nguồn trong kỳ đã kết thúc được nối với hai lịch sau kỳ; asOf và inventory nhận diện trùng khớp; không lộ địa chỉ/số điện thoại.
3. Mất ánh xạ contact không làm việc biến thành 0: lịch chưa quy thuộc giữ riêng và khách được đánh dấu cần rà kết nối chăm sóc.
4. Lead chuyển công ty không còn được gán vào nhóm, tên ngoài công ty không xuất hiện.
5. Qualification đổi và STOP đến trong lúc báo cáo đang đọc không trộn dữ liệu trước/sau. Lần đọc kế tiếp thấy REJECTED/STOP nhưng giữ lịch đã xác nhận.
6. Quyền công ty mất hiệu lực trong lúc RPC chờ khóa thì sau khi khóa được giải phóng vẫn bị từ chối.

Candidate `3486c59…` đã đạt 5/6 ca mới nhưng observer ca 6 dùng service_role không xem được wait_event của phiên khác. Bản `3f8a565…` dùng kết nối owner của DB thử, xóa cache pg_stat trong vòng quan sát; không đổi SQL/runtime, không nới quyền ứng dụng. Chỉ bản sau có kết quả PostgreSQL PASS đầy đủ.

## Kiểm trình duyệt

Thực hiện qua công cụ trình duyệt được hỗ trợ, tại localhost với `CohortOperations` và `MarketingLeadTrial` thật, API giả và CSP `connect-src 'none'`:

- Đúng 6 nhóm trả phí, 4 hợp lệ, 5 nhóm cần xử lý, 4 hồ sơ lịch; việc trùng trên cùng khách không cộng thêm khách.
- Lịch tháng 01/2027 vẫn hiện cho khách phát sinh trong kỳ tháng 10/2026.
- Lỗi nguồn xóa toàn bộ số và bảng cũ; tải lại không dùng dữ liệu lỗi thành số 0.
- STOP bỏ việc CARE, giữ bàn giao/lịch; ACK không thành hoàn tất khảo sát.
- Không còn hội thoại/lịch nối được: hiện 5 khách cần rà kết nối, không tự liên hệ và không phát sinh việc vì thiếu hội thoại cho khách REJECTED.
- Phản hồi chậm của actor trước không khôi phục lịch sau khi đổi người xem.
- Report cha lỗi vẫn hiện bảng cohort nếu danh sách kỳ và API cohort đọc thành công.

Đây là kiểm chức năng bằng dữ liệu giả; CSS fixture không thay nghiệm thu toàn giao diện production. Reviewer không nhận là người trực tiếp thực hiện kiểm trình duyệt.

## Giới hạn và bước tiếp

Không chứng minh dữ liệu thật đạt250k, đủ mọi nguồn Meta/đa kênh, hoàn tất khảo sát hay quyền chi. Không merge, migration thật, mở AI, gửi khách hoặc kích hoạt thử nghiệm.

Full goal ACTIVE. Phần tiếp là UI xử lý đề xuất/gửi lịch và ngoại lệ vận hành còn thiếu, cấu hình AI/lịch/người nhận đã có câu hỏi chờ, UAT tuyến đầu và gói Founder release; tiếp tục các điểm nhận và kênh còn lại theo quyền thực tế. [Hợp đồng và hoàn tác](COHORT_OPERATIONS.md).
