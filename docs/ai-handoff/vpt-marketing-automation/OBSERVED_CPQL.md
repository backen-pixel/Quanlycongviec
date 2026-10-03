# Chi phí trên khách đã đối soát — số tạm tính

## Phạm vi của thay đổi

`observedMeasurement` là phép chia thực từ cùng snapshot được server đọc: toàn bộ chi Facebook đã biết của tài khoản đăng ký trong kỳ, chia cho số khách Lead Ads đã nhận, khử trùng và xác minh hiện hành. Ví dụ thử nghiệm 1.000.000 đồng / 4 khách = 250.000 đồng. Tài khoản không tạo khách vẫn đóng góp chi phí.

Đây là số tạm tính phục vụ theo dõi. Không gán toàn bộ chi tài khoản cho riêng quảng cáo biểu mẫu. Chưa chứng minh tập khách đầy đủ, chưa gồm đủ website/Messenger/các điểm nhận khác và có thể đổi khi đối soát bổ sung. CPQL đầy đủ vẫn `null`, mục tiêu toàn đợt vẫn chưa đánh giá, `allowBudgetExecution=false`. Không thay mục tiêu gốc bằng phép tính này; full goal ACTIVE.

## Điều kiện và cách tính

- Tiền và thời điểm phát sinh khách theo provider cùng khoảng ngày Việt Nam đã hoàn tất; chất lượng/nhận diện dùng hồ sơ hiện tại tại `asOf`. Không dùng thời điểm webhook tới (`receivedAt`) làm thời điểm phát sinh khách.
- Có lượt census hiện hành `SCANNED`, đúng phạm vi/kỳ; tất cả hồ sơ nguồn đã biết phải khớp hai chiều với CRM. Lượt quét quá 6 giờ cần làm mới, cùng giới hạn tuổi nguồn đang áp dụng cho chi tiêu.
- Không có hồ sơ nhận chưa xử lý, nguồn mâu thuẫn, nguồn không rõ, nhận diện chưa giải quyết hoặc bằng chứng không liên kết. Mâu thuẫn thời gian nguồn làm nhóm khách `UNRESOLVED`, không giữ trong số khách đạt.
- `recordMatchStatus` tách đối soát hồ sơ khỏi vấn đề bao phủ. Biểu mẫu cũ không xuất hiện, dữ liệu đã hết hạn hoặc chưa biết retention vẫn hiển thị cảnh báo và chặn CPQL đầy đủ; chúng không xóa phép chia trên các hồ sơ đã khớp.
- Khách trùng đã xác minh chỉ tính một nhóm. Khách cũ/organic/rejected không nằm trong mẫu số; khách chờ xác minh được báo riêng. Thiếu quyền người nhận hoặc bằng chứng chất lượng đổi làm khách về chờ xác minh.
- Không có khách đạt: giữ tiền đã biết, trả `NO_QUALIFIED_LEADS`, chi phí/khách `null`. Thiếu dữ liệu: `UNAVAILABLE` và ẩn số. Chi thực bằng 0 với mẫu số dương có thể cho kết quả 0 tạm tính; vẫn không đạt mục tiêu toàn đợt.
- Đọc lại tự tính theo snapshot mới: receipt tới muộn không rõ thời điểm làm số tạm tính không khả dụng; chứng minh ngoài kỳ thì không làm thay đổi mẫu số. Không lưu một số cũ rồi coi là còn hiện hành.

## Giao diện và bằng chứng

Dashboard ghi “Chi phí/khách đã đối soát — tạm tính”, hiển thị cả tử số, mẫu số, số chờ xác minh và giải thích phạm vi. Lỗi API/sai kỳ/phép tính hoặc payload tự nhận đã đạt mục tiêu làm ẩn dữ liệu. Không có nút ghi hay tăng ngân sách mới.

Phép chia giữ số thực chưa làm tròn; giao diện hiển thị tối đa hai chữ số lẻ. API giữ mã lượt quét và lượt chi tiêu để truy nguồn, không phát contact/token/raw proof.

Kiểm thử nằm trong `marketingAutomation.observedCpql.test.js` và `facebookLeadCensus.observedCpql.cases.js`. PostgreSQL dùng company/tài khoản giả riêng, census/intake/quality/spend service thật với provider giả; kiểm positive1m/4, cùng snapshot khi từ chối song song, receipt muộn và quyền hiện hành. Không thay kiểm thử cô lập bằng nghiệm thu Meta thật.

## Chuyển đổi và hoàn tác

Không có migration mới, không đổi quyền, không gửi khách, không bật chi. Field mới cộng thêm; server cũ không có field thì UI hiển thị chưa đủ dữ liệu. Hoàn tác bằng bỏ card và phép chiếu mới, giữ các receipt/nguồn/quality/spend hiện có. Không xóa giao dịch hay mở lại quyền.

## Bước còn phải làm để đạt mục tiêu đầy đủ

1. Registry có phiên bản cho company/trial/account/Page/form/entrypoint, người xác nhận phạm vi và tài liệu nguồn.
2. Adapter lưu bằng chứng phân trang, ID, count trước/sau, thời gian và phiên bản quyền; đối soát bản xuất nguồn khi API không chứng minh đủ. Không suy diễn ý nghĩa count từ tên trường SDK.
3. Bản chốt lịch sử bất biến có nguồn/fingerprint; đọc hiện hành kiểm thay đổi nhận diện, chất lượng, receipt muộn và quyền/phạm vi.
4. Nối lịch/chờ xử lý, các nguồn khách còn lại, dữ liệu thật, nghiệm thu và quyết định phát hành Founder. Giữ 100 triệu một đợt/30 ngày, 80:20 và 250.000 đồng/khách; 7% doanh thu đánh giá sau.
