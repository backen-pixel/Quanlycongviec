# Facebook Lead Ads → CRM: hợp đồng tiếp nhận và giao Admin

Trạng thái: đang kiểm thử và review trên PR29, chưa áp SQL702, chưa bật worker hoặc sửa dữ liệu thật. Tiếp nối H1 theo yêu cầu Founder làm bước tiếp theo. Phạm vi này không mở thêm kênh, ngân sách, AI chăm sóc hoặc gói C.

Phân loại: thay đổi có rủi ro cao khi kích hoạt vì tạo hồ sơ khách và kiểm soát quyền qua transaction; mặc định tắt để hoàn thiện bằng chứng trước chuyển đổi.

## Hành vi được triển khai

- H1 lưu nguyên lô sự kiện có chữ ký trước khi trả ACK. Worker mới chỉ lấy `change/leadgen` của Page được khai báo rõ, giữ lại Messenger và sự kiện khác.
- CRM sở hữu quy tắc tiếp nhận. Application Service xác minh Lead ID, Form ID, Page sở hữu form và ID quảng cáo nếu webhook có; chỉ lấy các trường công khai đã đối chiếu với SDK chính thức của Meta. Phiên bản Graph phải cấu hình rõ, không tự chọn.
- Bảng `facebook_lead_ads_bindings` xác định Page/form, công ty, Admin nhận, pipeline, stage, nguồn và vùng. Bảng trống, binding mặc định tắt; service chỉ được đọc, không tự duyệt hay bật binding. Mọi sửa binding tăng phiên bản.
- Transaction SQL702 kiểm lại lease, cấu hình, công ty/tenant, Admin còn hoạt động và quyền cùng công ty, pipeline/stage/source/region. Không dựa vào tên Admin hoặc lấy người tạo Page làm người nhận dự phòng.
- Một transaction tạo Customer, contact, Lead, liên kết form, bằng chứng nguồn, receipt và một thông báo trong ứng dụng cho Admin. Mất phản hồi sau commit thì retry trả lại đúng hồ sơ cũ. Receipt giữ snapshot để retry không phụ thuộc việc Meta còn trả dữ liệu.
- Không gộp Customer bằng số điện thoại trên toàn hệ thống. Hồ sơ cùng công ty đã có số điện thoại, liên kết cũ chưa có receipt, hoặc receipt bị thay đổi liên kết phải được đối soát. Không ghi đè nguồn đầu tiên của Lead cũ.
- Nhận số Việt Nam chuẩn hóa 10 chữ số cho lane đầu. Thiếu tên/số, sai mapping hoặc dữ liệu không rõ được giữ lại để xử lý; không tạo số điện thoại giả. Mapping tùy chỉnh phải thuộc đúng Page; không đoán câu hỏi tùy chỉnh bằng từ khóa.

## Ranh giới kết quả

Receipt chứng minh **tiếp nhận và thông báo trong ứng dụng**, chưa chứng minh Admin đã đọc, đã gọi, khách đủ điều kiện hoặc được đặt lịch. Không tự sinh bộ task cũ vì helper hiện có chưa bảo đảm hoàn tất nguyên tử. Không gửi email, Zalo, Messenger, push hoặc trả lời khách trong hợp đồng này.

Nguồn được ghi với mã Page/form/leadgen cùng bằng chứng ad/campaign nếu có. Trạng thái trả phí còn `UNVERIFIED`; số form tiếp nhận không tự trở thành số khách hợp lệ cho mục tiêu 250.000 đồng/Lead. Vùng của binding là phạm vi công việc, không chứng minh khách đang ở vùng đó. Lead ngoài địa bàn vẫn cần được phân loại đúng theo dữ liệu khách khai.

## Dependency và điều kiện phát hành

- SQL701 giữ nguyên. SQL702 bổ sung binding, receipt, claim lane và transaction. Các cột/trigger CRM hiện hành phải khớp preflight; CI sử dụng PostgreSQL17 cô lập và dữ liệu giả.
- Transaction giữ các trigger CRM hiện hành ghi lịch sử stage và kiểm tenant/company. Search path đặt `pg_catalog,public,pg_temp` để trigger cũ tìm đúng bảng; các vai ứng dụng/browser không được có quyền CREATE trong `public`. Nếu quyền schema chưa đạt thì từ chối, không tự sửa quyền hoặc vô hiệu trigger.
- Các Lead Ads độc lập được lấy theo thứ tự đến hạn; một hồ sơ đang chờ thử lại không giữ toàn bộ hồ sơ khác phía sau. Vẫn chỉ có một lease hoạt động trên mỗi Page; thứ tự Messenger/generic của SQL701 không đổi.
- Lane mới có contract quyền riêng trong SQL702, không phụ thuộc `crm_care_legacy_write_check` của SQL682. Nếu có `crm_care_control` hoặc bảng `marketing_fb_lead_bindings`, lane này từ chối để rà tích hợp; không tự suy chúng đang tắt. Generic H1 giữ guard cũ. Không cài hoặc đổi gói C trong lúc worker này hoạt động.
- Cờ mặc định tắt: `VPT_FB_LEAD_ADS_INTAKE` chưa bằng `1`; worker vẫn paused nếu `VPT_FB_PAGE_INBOX_WORKER_PAUSED` chưa bằng `0`. Opt-in yêu cầu receiver H1, scope guard và danh sách Page rõ. Primary pin và điều kiện queue cũ đã rỗng vẫn áp dụng.
- **Receiver H1 chuyển toàn endpoint**. Lane Lead Ads không xử lý projection Messenger. Vì vậy hoàn tất hợp đồng Lead Ads không tự cho phép bật toàn webhook hiện tại; cần phương án chuyển phù hợp, không làm gián đoạn luồng nhắn tin.
- Phải nghiệm thu binding thật đúng Page/form VPT, Admin VPT, tenant/company/taxonomy, quyền Graph, single writer và phiên bản triển khai. Kiểm thử fixture không thay nghiệm thu thật hoặc chứng minh khôi phục production.

## Kiểm thử và rollback

Bằng chứng cuối được bổ sung sau khi freeze mã và reviewer độc lập xác nhận. Bộ bắt buộc: sai provider/form/Page, binding/owner bị thay hoặc thu hồi, lease hết hạn, hai lượt xử lý đồng thời, lỗi từng bước, mất response sau commit, retry sau restart, phone trùng cùng/khác công ty, giữ attribution cũ, notification không nhân bản, quyền anon/authenticated và tương thích trigger CRM.

Hoàn tác ưu tiên pause worker và giữ inbox/receipt. Không xóa Lead/Customer/giao dịch đã phát sinh, không xóa bằng chứng, không bật đồng thời writer cũ và mới. Nếu cần hoàn tác receiver thì xử lý hàng chờ và single writer trước; không chỉ tắt cờ trong lúc còn sự kiện đang xử lý.

## Nguồn hợp đồng provider

Đã đối chiếu các trường đọc với [Meta Lead SDK](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/lead.py) và [Meta LeadgenForm SDK](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/leadgenform.py) ngày06/10/2026. Đây là bằng chứng giao tiếp công khai; không chứng minh tài khoản hoặc phiên bản Graph thật đã được nghiệm thu.
