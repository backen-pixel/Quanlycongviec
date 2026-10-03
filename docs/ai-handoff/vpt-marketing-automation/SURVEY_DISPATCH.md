# Gửi đề xuất lịch khảo sát — SQL667

Baseline a07760f2be49834cc8cea5edda00b1d2968d366b. Phạm vi nối worker gửi đề xuất có sẵn với receiver SQL666 và lõi đặt lịch SQL665. Mục tiêu Marketing–CRM đầy đủ tiếp tục ACTIVE; chưa bật hệ thống thật.

## Gửi và xác nhận

Worker chỉ nhận payload do server dựng từ đề xuất bất biến: người khảo sát, giờ Việt Nam, địa điểm và nút Xác nhận lịch. Nội dung nói rõ chưa giữ chỗ. Không có lệnh gửi nội dung tùy ý hoặc công cụ AI gọi trực tiếp RPC. SQL kiểm người tạo hiện còn quyền, đúng công ty/khách/nguồn, không STOP/tiếp quản, lịch khả dụng, hạn đề xuất và tin inbound còn trong24 giờ. Tin outbound hoặc last_message_at không kéo dài cửa sổ gửi.

Private dispatch_pages khởi tạo rỗng. Khi phát hành phải có Page/công ty/app/version, release reference, dấu SHA256 của credential và bằng chứng xác minh token thuộc đúng Page/app, quyền pages_messaging và MESSAGE task. Worker so token đã đọc với token hiện tại trong DB và fingerprint đã enrolled ngay trong claim. Token xoay trước claim bị chặn. Fingerprint không phải chứng minh provider tự động: người thực hiện release phải xác minh binding và quyền thực; credential_evidence là nguồn dẫn chứng, không chấp nhận mô tả suy đoán. Các quyền/binding này chưa được kiểm thật trong đợt viết mã.

Claim lưu attempt, worker UUID/executor, payload, nguồn inbound, app và phiên bản enrollment trước khi trả payload **một lần**. Hạn bắt đầu gửi tối đa5 giây, thu ngắn theo cửa sổ khách, đề xuất và nguồn. Ngay trước POST, worker kiểm Primary, cờ bật, deadline tuyệt đối và đồng hồ monotonic theo chính khoảng hạn được cấp, để RPC chậm/clock skew không làm nới hạn ngắn. URL cố định graph.facebook.com/version/Page/messages, RESPONSE, bearer header, không redirect, timeout10 giây, không retry POST.

Commit claim là thời điểm xác lập quyền gửi. STOP/thu hồi sau commit không thu hồi được HTTP đã bắt đầu; khoảng trước POST được giới hạn ngắn và kiểm cờ/Primary tại worker. Không hứa loại bỏ race phân tán hoặc rút lại tin Meta đã nhận. STOP đã ghi trước claim bị chặn; mọi booking tiếp tục kiểm trạng thái hiện hành. Đồng bộ giờ máy chủ và kiểm lỗi in-flight là điều kiện UAT.

## Mất phản hồi và echo

ACK phải có recipient/MID phù hợp. Worker chỉ retry lưu cùng ACK, tối đa3 lần; không gửi lại tin. Nếu HTTP timeout, lỗi/malformed ACK, mất phản hồi claim, crash hoặc hết hạn trước POST: attempt vẫn không được cấp lại payload. Recovery chuyển SENDING quá1 phút sang UNCERTAIN bằng kiểm trạng thái; ACK đến sau có thể ghi SENT nhưng uncertainty đến sau không được hạ SENT. Hồ sơ khác trên cùng hội thoại không được gửi để lách một attempt chưa rõ kết quả. Chưa có thao tác vận hành giải quyết UNCERTAIN; việc đó còn phải hoàn thiện trước UAT.

Echo chỉ được nhận diện là của hệ thống khi khớp Page, PSID, công ty/thread, app, metadata attempt, nguyên văn tin, không attachment và đúng thời điểm. Chỉ is_echo/app_id là không đủ. Echo đến trước ACK lưu MID chờ; **echo một mình không trở thành SENT**. ACK và echo khác MID giữ bằng chứng conflict, chặn đề xuất còn OPEN và đưa hội thoại về hàng chờ người xử lý. Nếu đã BOOKED, không xóa hoặc giả vờ hoàn tác lịch: giữ lịch và bằng chứng để giải quyết ngoại lệ. Echo không mở lại trạng thái OPTED_OUT/HUMAN_REQUESTED/HUMAN_ACTIVE.

SQL666 vẫn xử lý toàn batch STOP/tiếp quản/echo không xác định trước khi đặt lịch. Worker reconcile bằng giao dịch riêng sau ghi ACK và định kỳ5 giây; không giữ delivery rồi lấy ngược khóa thread. Mã xác nhận và metadata attempt được bỏ trước log/queue cũ. Raw body vẫn giữ nguyên để kiểm HMAC.

## Quyền, bật/tắt và kiểm thử

Mọi RPC mới kiểm role service_role thực tế kể cả khi backup cấp EXECUTE rộng cho public. Private manifests/tokens/receipts không được đọc trực tiếp bởi anon/authenticated/service_role. Service credential là biên server tin cậy, không cấp cho AI/người dùng. crm_care_receive cũng được bổ sung kiểm role.

VPT_SURVEY_CONFIRMATIONS=1 mở worker recovery; VPT_SURVEY_DISPATCH=1 mới cho gửi trong các VPT_FB_CARE_PAGES đã có enrollment hợp lệ. Mặc định cả hai tắt. Không tạo enrollment, không điền credential thật hoặc đổi cờ trong thay đổi này. Các đường gửi cũ vẫn bị chặn với Page care.

Local47 kiểm thử worker/care/webhook đạt tại thời điểm chuẩn bị PR; PostgreSQL và review độc lập đang chờ. Các case PostgreSQL mới dùng worker và receiver thật với provider giả: payload đi qua POST giả → raw webhook ký secret thử → booking. Positive path không còn được fixture gán SENT. Owner DB chỉ nạp danh mục thử hoặc gây lỗi có chủ đích. Đã thêm case tranh claim/ACK/recovery, mất phản hồi, STOP, metadata sai, token xoay, app/company, nguồn/hạn và quyền sau broad grants. Đây chưa phải nghiệm thu Meta thật. SQL được áp dụng hai lần trong DB cô lập để kiểm idempotence.

Đối chiếu giao thức với [Meta Messenger Postman](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api) và trường echo trong [mẫu chính thức của Meta](https://github.com/fbsamples/messenger-platform-samples/blob/main/node/app.js). Mẫu thứ hai là mã cũ, chỉ tham chiếu ý nghĩa app_id/metadata/is_echo; không dùng version hoặc SHA1 của mẫu. Receiver hiện giữ HMAC SHA256. App/version/provider thực phải được UAT riêng.

## Hoàn tác và việc còn lại

Tắt VPT_SURVEY_DISPATCH để dừng gửi mới; giữ nhận STOP và bằng chứng ACK/echo. Khi dừng cả recovery, tắt VPT_SURVEY_CONFIRMATIONS và worker theo gói release. Không xóa attempt/booking/audit, không đặt lại QUEUED hoặc mở writer cũ không kiểm soát. Trước bật lại đối soát tất cả UNCERTAIN/CONFLICT và trạng thái nguồn/giờ/credential.

Còn UI đề xuất/ngoại lệ, ACK người khảo sát, thông báo khách về kết quả đặt, hủy/đổi lịch và chuyển writer lịch cũ; dữ liệu sản phẩm/lịch thật, phạm vi khách/tiền chi đầy đủ, backup/restore, UAT và phê duyệt phát hành. Chưa gửi Meta thật, gọi model, ghi DB thật, chi quảng cáo hoặc chứng minh CPQL250.000đ. Trần một đợt100 triệu/30 ngày,80:20 và phần tài chính trì hoãn giữ nguyên.
