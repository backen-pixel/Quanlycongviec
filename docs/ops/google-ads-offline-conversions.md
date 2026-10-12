# Gửi chuyển đổi offline về Google Ads (VPT)

Mục tiêu: cho Google Ads biết lượt bấm quảng cáo nào thật sự thành **cuộc gọi thật** và **khách hợp lệ**,
để chiến dịch tối ưu theo khách thật thay vì lượt bấm. CRM tạo một tệp CSV đúng mẫu «nhập lượt chuyển đổi
từ lượt nhấp» của Google; Google tự tải tệp đó mỗi ngày qua HTTPS.

## Hai hành động chuyển đổi (đặt tên CHÍNH XÁC như dưới, kể cả dấu cách và gạch ngang)

| Tên trong Google Ads | Ý nghĩa |
|---|---|
| `VPT CRM - Cuoc goi that` | Ghi âm cuộc gọi từ app Android, dài từ 30 giây, không phải cuộc gọi đi, ghép được với lượt bấm nút gọi trên website có `gclid` (bấm trong khoảng 10 phút trước đến 1 phút sau khi cuộc gọi bắt đầu). Mỗi lượt bấm chỉ ghép một cuộc gọi (cuộc gọi sớm nhất). |
| `VPT CRM - Khach hop le` | Lead đã được sale kéo sang lạnh/ấm/nóng hoặc chuyển Deal (cùng mốc «hợp lệ» của thử nghiệm P1). `gclid` lấy từ form website của lead; nếu không có thì lấy `gclid` của lượt bấm gọi đã ghép với ghi âm của lead đó. Mỗi lead một lần, thời điểm = lúc đạt mốc. |

Không gửi: dữ liệu thử (`utm_source=vpt_test`, `gclid` bắt đầu `VPT_TEST_`, lead `is_test`), lượt bấm chỉ có
`gbraid`/`wbraid` (chỉ đếm trong phần chẩn đoán). Tệp luôn chứa 60 ngày gần nhất; Google bỏ qua dòng trùng
(cùng gclid + tên + thời điểm) nên tải lại mỗi ngày không bị đếm đôi.

## Bước 1 — Founder đặt biến môi trường trên Render (dịch vụ `tubep-backend`)

| Biến | Giá trị |
|---|---|
| `GOOGLE_ADS_EXPORT_USER` | Tên đăng nhập tự đặt, ví dụ `google-ads-vpt` |
| `GOOGLE_ADS_EXPORT_PASSWORD` | Mật khẩu ngẫu nhiên **tối thiểu 16 ký tự** (ngắn hơn thì tệp trả 503) |
| `VPT_WEB_EVENTS_COMPANY_ID` | Đã có sẵn (công ty VPT) — không cần đổi |

Thiếu một trong các biến trên → địa chỉ tệp trả `503`. Không gửi mật khẩu qua chat; chỉ nhập vào Render và Google Ads.

## Bước 2 — Tạo hai hành động chuyển đổi trong Google Ads

Làm hai lần, mỗi lần một tên ở bảng trên:

1. **Mục tiêu (Goals) → Lượt chuyển đổi (Conversions) → Tóm tắt → + Hành động chuyển đổi mới (New conversion action)**.
2. Chọn **Nhập (Import)** → **CRM, tệp hoặc nguồn dữ liệu khác (CRM, files, or other data sources)** →
   **Theo dõi lượt chuyển đổi từ lượt nhấp (Track conversions from clicks)** → Tiếp tục.
3. Tên hành động: đúng tên ở bảng trên. Danh mục: «Gọi điện» / «Khách hàng tiềm năng đủ điều kiện» tuỳ ý.
4. Giá trị: tệp để trống cột giá trị, nên giá trị mặc định đặt ở đây sẽ được dùng (có thể để «Không sử dụng giá trị»).
5. Số lượt: **Một (One)** cho «Khach hop le»; «Cuoc goi that» chọn Một hoặc Mọi lượt tuỳ chiến lược.
6. Khoảng thời gian chuyển đổi sau lượt nhấp: 90 ngày.
7. Có thể đặt «Cuoc goi that» làm chuyển đổi chính, «Khach hop le» là phụ cho đến khi đủ dữ liệu.

Lưu ý: tài khoản phải bật **tự động gắn thẻ (auto-tagging)** để website nhận `gclid`.

## Bước 3 — Lên lịch tải tệp mỗi ngày

1. **Mục tiêu → Lượt chuyển đổi → Tải lên (Uploads) → + → Lịch biểu (Schedules) → + Lịch mới**.
2. Nguồn: **HTTPS**. URL: `https://tubep-backend.onrender.com/api/ads-conversions/google.csv`
3. Tên người dùng / mật khẩu: đúng `GOOGLE_ADS_EXPORT_USER` / `GOOGLE_ADS_EXPORT_PASSWORD` trên Render.
4. Tần suất: **Hằng ngày**, giờ nên chọn sáng sớm (ví dụ 06:00).
5. Bấm **Xem trước / Tải lên ngay** lần đầu để kiểm tra; Google báo số dòng thành công / lỗi.

Lỗi thường gặp: `401` sai tên/mật khẩu; `503` thiếu biến môi trường hoặc CSDL chính chưa sẵn sàng;
Google báo «gclid không thuộc tài khoản» khi lượt nhấp đến từ tài khoản quảng cáo khác.

## Định dạng tệp

```
Parameters:TimeZone=Asia/Ho_Chi_Minh
Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency
Cj0KCQ...,VPT CRM - Cuoc goi that,2026-10-10 10:00:00,,VND
```

Thời gian theo giờ Việt Nam, dạng `yyyy-MM-dd HH:mm:ss`. Thời điểm chuyển đổi luôn sau lượt nhấp
(cuộc gọi: max(lúc gọi, lúc bấm + 1 giây); khách hợp lệ: bỏ qua nếu mốc không sau lượt nhấp).

## Xem trước trong CRM

Admin xem tại bảng «Chuyển đổi website» → mục «Gửi chuyển đổi về Google Ads (60 ngày gần nhất)»
(`GET /api/marketing-web/offline-conversions?from=&to=`): số «Cuộc gọi thật ghép được quảng cáo»,
«Khách hợp lệ có gclid», chẩn đoán (ghi âm không ghép được lượt bấm, lượt bấm chỉ có gbraid/wbraid,
khách hợp lệ từ form không có gclid, dữ liệu thử bị loại) và danh sách dòng với gclid che còn 6 ký tự cuối.

## Giới hạn hiện tại

- App Android chưa gửi `direction`/`call_started_at`: thời điểm gọi ước tính = lúc tải lên − thời lượng;
  ghi âm tải lên trễ có thể không ghép được lượt bấm. Cuộc gọi đi chưa phân biệt được (trừ khi app gửi `outbound`).
- Không có bảng lưu lịch sử đã gửi: tính lại mỗi lần gọi; dựa vào khử trùng của Google.

Mã nguồn: `backend/src/modules/marketingAutomation/googleOfflineConversions.js`,
`backend/src/routes/googleAdsExport.js`, `backend/src/routes/webConversions.js`.
