# Gửi chuyển đổi offline về Google Ads (VPT)

## Trạng thái ngày 13/10/2026

Phạm vi: **VPT — Vanphuthanh.net, tài khoản 975-957-2942**. Nhánh
`codex/vpt-qualified-google-ads-20261013` đang chuẩn bị luồng **lead hợp lệ đã xác minh**.
Chưa triển khai production, chưa lưu cấu hình mới trong Google Ads và chưa có bằng chứng Google nhận dữ liệu.
Phiên đăng nhập Google Ads chưa hoàn tất. Kiểm thử hay số dòng xem trước không chứng minh đã vận hành.

Dữ liệu đọc từ kết nối Google Ads ngày 13/10 cho biết auto-tagging đang bật; hành động cũ
`VPT CRM - Khach hop le` đang **Primary**, **Many per click**, cửa sổ 90 ngày.
Chưa xác nhận trực tiếp trong UI hay rà mục tiêu từng chiến dịch; không dùng cấu hình này để kết luận tối ưu đúng khách đã xác minh.

## Phân biệt các luồng

| Hành động / tệp | Nội dung CRM | Bằng chứng khách mới đã xác minh? |
|---|---|---|
| `VPT CRM - Lead hop le da xac minh` — `qualified-google.csv` | Trạng thái xác minh hiện hành, bằng chứng liên hệ, nguồn form Google và kiểm danh tính/lịch sử CRM | Danh sách đủ điều kiện xuất; còn cần kiểm Google nhận và đối soát lịch sử khách |
| `VPT CRM - Khach hop le` — `google.csv` | Cold/Warm/Hot hoặc chuyển Deal; có thể ghép GCLID qua cuộc gọi | **Không** — mốc bán hàng đại diện, chưa qua luồng xác minh mới |
| `VPT CRM - Cuoc goi that` — `google.csv` | Ghi âm ghép lượt bấm gọi có GCLID theo thời gian | **Không** — ghép thời gian chưa chứng minh danh tính/nhu cầu |

Tệp cũ giữ nguyên để tương thích. Không nối tệp cũ vào hành động mới hoặc cộng hai luồng thành số khách hợp lệ.
Chuyển đổi form sau lưu CRM thành công chỉ chứng minh tiếp nhận form.

## Điều kiện tệp xác minh mới

Mỗi dòng phải đồng thời đáp ứng:

1. Sự kiện có **revision mới nhất** của lead là `QUALIFIED`, có actor, mã bằng chứng, và
   `contact_usable`, `need_in_scope`, `area_in_service` đều đúng. Xét revision trước khi lọc trạng thái:
   `REJECTED` hay thu hồi về `PENDING` phải loại bản hợp lệ cũ.
2. Lead/Deal thật thuộc VPT, `is_test=false`, còn tồn tại. `context_hash` phiên bản 2 khớp định danh,
   company/customer và điện thoại lead/customer hiện tại. Sự kiện phiên bản cũ hoặc định danh/phone đã đổi
   cần review lại; tiến độ Cold/Warm/Hot/chuyển Deal không tự làm mất xác minh.
3. Khử trùng nội bộ theo customer, contact và điện thoại chuẩn hóa trên **toàn bộ lịch sử Lead/Deal VPT**.
   Chỉ bản ghi đầu tiên của danh tính được xét; thiếu danh tính, phone mâu thuẫn hoặc lịch sử không rõ bị loại.
4. Có customer master được tạo từ **mốc gửi form `VPT_V1` hợp lệ đến lúc tạo lead**.
   Customer có trước form hoặc thiếu mốc bị giữ ở `new_customer_unproven`; không nới thời gian để suy khách cũ thành mới.
5. Có GCLID nguồn website: ưu tiên `intake_attribution` bất biến, rồi `lead_attribution` có cấu trúc,
   cuối cùng khối ghi chú form cũ `VPT_V1 | <thời điểm gửi form>`. Không ghép qua ghi âm/lượt bấm gọi.
   Nguồn khác Google, GCLID/nguồn mâu thuẫn, dữ liệu thử, mã sai định dạng và chỉ có `gbraid`/`wbraid` bị loại.
6. Thời điểm xác minh sau mốc nguồn và lúc tạo lead. CSV lấy **lúc ghi nhận xác minh**, múi giờ `+07:00`,
   cửa sổ 60 ngày gần nhất.

Không gộp/sửa hồ sơ khi xuất. Customer/contact/phone chỉ dùng nội bộ; CSV không gửi tên, email, điện thoại
hay bằng chứng. `Order ID` mờ, ổn định, 61 ký tự: `vptq_` + 56 ký tự băm từ company/lead UUID và phiên bản,
không băm từ phone/email.

Đọc đủ trang với count chính xác; lỗi nguồn, thiếu bảng/cột, revision đổi trong lúc đọc hoặc hết giới hạn
trả `503`, không trả tệp một phần hay giả số 0. Mỗi truy vấn tối đa 100 trang × 500 dòng.
Không thêm SQL: cần nguồn hiện có **712** (qualification), **717** (intake) và bảng `customers` sẵn sàng
trên DB chính. Chưa xác nhận đủ nguồn thật trong phiên này.

## Xác minh trong CRM sau triển khai

Admin mở trang quảng cáo CRM → **Đánh dấu khách hợp lệ (đợt thử)**:

1. Dán UUID hoặc liên kết chi tiết `/crm/leads/<uuid>` / `/crm/deals/<uuid>` của chính CRM vào
   **Xác minh Lead/Deal theo ID hoặc liên kết CRM**, bấm **Tải trạng thái khách**.
2. Kiểm mã/tên khách, mở hồ sơ, đối chiếu cuộc trao đổi thực tế rồi chọn **Hợp lệ**.
3. Xác nhận liên hệ dùng được, nhu cầu trong phạm vi, địa bàn phục vụ; nhập mã bằng chứng và lưu.
   Loại/thu hồi cần lý do. Nếu định danh/phone hoặc revision đổi, tải lại, đối chiếu trước khi lưu.
4. Bản hợp lệ cũ cần context phiên bản 2: **Thu hồi** rồi xác minh lại, không tự đánh dấu hàng loạt.

Tuyến này dùng GET/PUT `/api/marketing-p1/qualification/leads/:leadId` và POST `/revoke` hiện có.
GET chỉ trả context và mã/tên khi `include_context=1`; PUT từ tra cứu trực tiếp kèm
`expected_context_hash` để phát hiện hồ sơ đổi trong lúc review. Quyền admin, company/tenant, DB chính
và cờ `VPT_P1_REVIEW_WRITE=1` vẫn áp dụng. Lead Google trực tiếp không thêm vào cohort/chi tiêu Facebook.

Ở **Chuyển đổi website** → **Lead hợp lệ đã xác minh → Google Ads (60 ngày)** xem số đủ điều kiện,
lý do loại và GCLID đã che. Bấm **Tải lại xác minh** sau khi lưu. API admin:
`GET /api/marketing-web/qualified-offline-conversions?from=YYYY-MM-DD&to=YYYY-MM-DD&company_id=<VPT>`.
Preview API cho tối đa 120 ngày; giao diện/tệp theo lịch dùng 60 ngày. Số đủ điều kiện xuất chưa phải số Google nhận/quy quảng cáo.

## Thiết lập Google Ads sau kiểm nguồn thật

| Cài đặt hành động riêng trong 975-957-2942 | Giá trị dự kiến |
|---|---|
| Tên chính xác | `VPT CRM - Lead hop le da xac minh` |
| Nguồn / danh mục | Offline từ lượt nhấp / Qualified lead |
| Số lượt | **One** |
| Tối ưu hóa ban đầu | **Secondary** |
| Cửa sổ sau lượt nhấp | 90 ngày |
| Giá trị | Không sử dụng giá trị; CSV để trống giá trị, tiền tệ VND |

Qualified lead là bước xác minh offline; One đếm theo lượt nhấp, không thay khử trùng giữa nhiều lượt nhấp ở CRM.
[Qualified lead](https://support.google.com/google-ads/answer/11459091?hl=en),
[Counting options](https://support.google.com/google-ads/answer/3438531?hl=en).

Vào **Goals → Conversions → Summary → Create conversion action**, chọn offline/CRM và từ lượt nhấp
theo UI hiện hành. Có thể tạo hành động trước, nối nguồn sau. Qua **Tools → Data manager**, nối **HTTPS**
cho chuyển đổi và gắn hành động trên; nhập URL/user/password ở trường riêng, ánh xạ cột, kiểm lần chạy đầu.
Tên mục có thể thay đổi theo UI.
[Hướng dẫn HTTPS Data Manager](https://support.google.com/google-ads-data-manager/answer/14605515?hl=en).

URL sau triển khai: `https://tubep-backend.onrender.com/api/ads-conversions/qualified-google.csv`.

| Biến backend Render | Yêu cầu |
|---|---|
| `GOOGLE_ADS_EXPORT_USER` | Basic user riêng; dùng lại cấu hình export nếu đã thiết lập |
| `GOOGLE_ADS_EXPORT_PASSWORD` | Mật khẩu ngẫu nhiên tối thiểu 16 ký tự; dùng lại cấu hình export nếu đã thiết lập |
| `VPT_WEB_EVENTS_COMPANY_ID` | UUID VPT; kiểm đúng scope trước nối Google |

Không đưa secret vào chat, mã nguồn, URL/query string hoặc Sheet công khai; nhập trực tiếp vào Render/Google.
Thiếu/sai cấu hình trả `503`; thiếu/sai Basic credential trả `401`. Endpoint `no-store`, chỉ DB chính.
Chưa xác nhận credential production đầy đủ hoặc endpoint mới truy cập được.

CSV có header ngay dòng đầu:

```csv
Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID
```

Ánh xạ GCLID, tên hành động, thời gian và Order ID vào trường tương ứng; không băm GCLID/Order ID.
Thời gian có múi giờ; kiểm transformation lúc preview. Luồng này dùng **GCLID**, không triển khai
enhanced conversions bằng email/phone hay Customer Match.
[Định dạng nhập Data Manager](https://support.google.com/google-ads-data-manager/answer/14184381?hl=en).

Kiểm số dòng nhận/lỗi, tài khoản GCLID, đúng hành động/thời gian, lưu bằng chứng nhập; khi ổn mới chạy mỗi ngày
(ví dụ 06:00 Việt Nam). Giữ **Secondary**, không đưa vào **custom goal** trong giai đoạn xác nhận.
Secondary trong custom goal vẫn có thể tham gia bidding. Trước chuyển Primary phải rà mục tiêu từng chiến dịch
và hành động form/call/proxy để không tối ưu/cộng nhầm nhiều bước.
[Primary/Secondary và custom goals](https://support.google.com/google-ads/answer/11461796?hl=en).

## Giới hạn và nghiệm thu

- Thiếu lịch sử hoặc danh tính đổi có thể bỏ sót khách cũ. Customer tạo cùng lần tiếp nhận chỉ chứng minh
  theo CRM đang có, chưa bảo đảm chưa từng là khách ngoài hệ thống.
- Kiểm mốc customer rất chặt: đồng hồ lệch, thiếu marker form/lịch sử có thể under-count.
  Đối soát dòng bị giữ; không nới điều kiện chỉ để đạt CPL.
- GCLID hợp lệ chưa chứng minh thuộc VPT/còn trong cửa sổ Google nhận. Import diagnostics và quy quảng cáo là bước riêng.
- Thu hồi/loại chỉ bỏ khỏi tệp tương lai, **không rút chuyển đổi Google đã nhập**. Chưa có ledger/tự retraction.
  Cần lưu Order ID và quy trình điều chỉnh/retract bản nhập sai; giữ Secondary trong thời gian thử.
- Chưa có số khách mới thực tế hoặc CPL nghiệm thu. Muốn kết luận `≤250.000đ/khách` cần đối soát khách duy nhất,
  khách cũ, nguồn Google, kết quả nhập, chi đúng kỳ và thuế/phí; chốt kỳ theo lượt nhấp hay ngày xác minh.
  Không dùng tổng Conversions có form/call làm mẫu số. Phạm vi 130 triệu so với trần thử 100 triệu vẫn chờ làm rõ.

## Luồng cũ và giờ ghi âm

`google.csv` giữ hai hành động proxy và cửa sổ 60 ngày. Ghi âm không giới hạn thời lượng; chỉ loại cuộc gọi đi
khi có `direction=outbound`, hiện app chưa gửi direction nên chưa xác định đầy đủ. Ghép lượt bấm trong khoảng
10 phút trước đến 1 phút sau lúc gọi; một click ghép ghi âm sớm nhất. File cùng company/tên/dung lượng được gộp.
Giờ gọi ưu tiên `call_started_at`, rồi tên file `<số hoặc tên>_YYMMDD_HHMMSS.m4a`; không dùng lúc upload.
Thiếu giờ hợp lệ thì bỏ. Helper: `backend/src/helpers/callRecordingMeta.js`.

Preview cũ `/api/marketing-web/offline-conversions` giữ chẩn đoán ghi âm/mốc bán hàng, che GCLID còn 6 ký tự cuối.
Số “Khách hợp lệ có gclid” ở đây **không phải** số qua xác minh mới.

## Rollback và nguồn mã

Dừng/ngắt nguồn `qualified-google.csv` trong Data Manager, rồi revert bản sửa nếu cần.
Không rollback SQL hay xóa dữ liệu xác minh; endpoint cũ không đổi. Dừng nguồn/revert không xóa conversion
Google đã nhập; xử lý retract riêng.

Mã mới: `backend/src/modules/marketingAutomation/googleQualifiedConversions.js`, `qualificationContext.js`,
`backend/src/routes/googleAdsExport.js`, `webConversions.js`, `p1Qualification.js`,
`frontend/src/components/P1QualificationPanel.jsx`, `WebConversionPanel.jsx`, `frontend/src/lib/p1Qualification.js`.
Proxy cũ: `backend/src/modules/marketingAutomation/googleOfflineConversions.js`.
