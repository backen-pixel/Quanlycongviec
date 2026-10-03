# OBSERVED_CPQL — kết quả kiểm chứng 03/10/2026

## Phiên bản và kết luận

Runtime candidate `a8b2f9f23e3b9b8ab2fcde359c7308af91ebf342`, tree `49ee2f42a9148c20424ff9e8c10a7533389631d7`; parent `c12314ca9455e21e60d459efaf8bcd6075352855`. CI dùng merge `43d2835d6826ef48d8930ab0bc23ca2870ae31ff`, chứa candidate và base `e16c885ae7c2305645be02a1227bf378cb59137f`, tree giống hệt candidate. Không có migration mới.

Reviewer độc lập `/root/architecture_v11_review`: **PASS trong phạm vi OBSERVED_CPQL**, không còn finding chặn. Reviewer đọc mã, chạy105 tests, đối chiếu5 blob trọng yếu và CI. Góp ý P3 thuật ngữ đã sửa: kỳ đo theo thời điểm phát sinh khách ở provider (`acquiredAt`), không theo webhook tới. Sửa P3 chỉ ở tài liệu đóng hồ sơ, không đổi runtime được thử.

Full goal ACTIVE; kết quả này chưa chứng nhận CPQL đầy đủ, dữ liệu Meta thật, nghiệm thu vận hành hoặc phát hành.

## Kiểm thử tự động

- Local và reviewer độc lập:105/105 PASS; gồm30 case mới về tử/mẫu số, nguồn/nhận diện/chất lượng, zero/missing và giao diện xác minh payload.
- [Automation37102519124](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37102519124):10/10 jobs SUCCESS.
- Census PostgreSQL job111144690092:30 PASS,0 FAIL,0 SKIP. Bốn ca mới dùng company/tài khoản giả riêng và dịch vụ census→intake→quality→spend thật với provider giả:1m/4=250k; snapshot không trộn khi từ chối song song; receipt muộn vô hiệu số cho đến khi quét lại chứng minh ngoài kỳ; Page/reader bị thu quyền.
- Node22 job111144690116:673 PASS,0 FAIL,0 SKIP. Node18 regression cũng SUCCESS.
- Frontend job111144690060:10.312 modules,26,82 giây, SUCCESS.
- [Report37102519117](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37102519117) và [Messenger37102519138](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37102519138):SUCCESS.
- `git diff --check` sạch; tree xuất bản khớp staged tree. Không có vòng kiểm thử thất bại trong increment này.

## Giao diện bằng dữ liệu giả

Root kiểm qua công cụ trình duyệt được hỗ trợ, IAB tab19, localhost4189. Fixture `work/vpt-survey-execution/observed-cpql-browser/` dựng chính `MarketingLeadTrial`, `ObservedLeadCost` và `FacebookSourceRecovery` của candidate với React StrictMode; API giả, CSP `connect-src 'none'`, CSS giản lược. Không đăng nhập/đọc CRM thật/gọi Meta, không ghi từ UI.

Các trạng thái đã nhìn thấy trực tiếp:

1. Bình thường:1.000.000đ/4khách=250.000đ, một khách chờ xác minh; nhãn tạm tính, phạm vi chi toàn tài khoản và cảnh báo chưa đạt mục tiêu toàn đợt.
2. Không khách đạt:giữ1.000.000đ và6khách chờ; “Chưa có khách hợp lệ để chia chi phí”, không hiển thị0đ/khách.
3. Đổi phạm vi/quyền:ẩn số CPQL, giữ cảnh báo kiểm kê lại.
4. Chưa biết retention:giữ số tạm tính trên hồ sơ khớp và cảnh báo thiếu bao phủ; không biến thành kết luận đầy đủ.
5. Payload sai phép tính:ẩn toàn bộ số liệu kỳ đo, báo chưa xác minh được.
6. Lỗi nguồn:chỉ hiển thị lỗi, không có số cũ.

Các nút fixture remount component; đây không phải bằng chứng race/reload hoặc full production layout/UAT. Tab19 đã đóng và server session84693 đã kết thúc. Reviewer không tự chạy browser; root cung cấp bằng chứng được mô tả đúng phạm vi.

## Hợp đồng, hoàn tác và công việc còn lại

Xem [OBSERVED_CPQL.md](OBSERVED_CPQL.md). Main CPQL vẫnnull, `targetMetToDate=false`, `allowBudgetExecution=false`; chuẩn250k và hạn mức100m/30ngày/80:20 không đổi.

Tiếp theo:registry có nguồn/phạm vi/phiên bản; adapter witness hoặc bản xuất nguồn cóID để chứng minh bao phủ; snapshot chốt có thể nhận diện dữ liệu mới; lịch/chờ xử lý trên dashboard; nội dung/nhân sự/quyền runtime thực; nghiệm thu và quyết định Founder. Giữ đề xuất/ngoại lệ khảo sát, hủy/đổi lịch, chuyển writer lịch cũ, hiệu năng/khôi phục và các kênh còn lại trong full goal. Không lấy PASS increment để đóng toàn mục tiêu.
