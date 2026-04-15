# TuBep Voice Sync (Android)

App Android tối giản: **đăng nhập** vào API TuBep Pro, **cấp quyền** (micro, trạng thái điện thoại, đọc file âm thanh), **chọn file ghi âm** hoặc **ghi micro** rồi **POST** lên `/api/voice-recordings` (giống trang web «Ghi âm → Web (thử)»).

## Quyền trong app

| Quyền | Mục đích |
|--------|----------|
| `RECORD_AUDIO` | Ghi thử bằng micro trong app |
| `READ_PHONE_STATE` | Chuẩn bị tích hợp nhận biết cuộc gọi (hạn chế trên Android mới) |
| `READ_MEDIA_AUDIO` / `READ_EXTERNAL_STORAGE` | Đọc file âm thanh khi bạn chọn file ghi cuộc gọi đã lưu trên máy |

**Lưu ý:** Ghi trực tiếp âm thanh **đầu dây điện thoại** phụ thuộc hãng và phiên bản Android; thường dùng **file ghi sẵn** (app máy / máy ghi) rồi **Chọn file** để đồng bộ.

## Tạo file APK

Cần **Android Studio** (khuyến nghị) hoặc **JDK 17 + Android SDK + Gradle**.

### Cách 1 — Android Studio

1. Cài [Android Studio](https://developer.android.com/studio).
2. **File → Open** → chọn thư mục `mobile/voice-sync-android`.
3. Đợi **Gradle Sync** xong (lần đầu tải SDK có thể lâu).
4. **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
5. APK debug:  
   `app/build/outputs/apk/debug/app-debug.apk`  
   Studio có thể bật thông báo **Locate** để mở thư mục.

Cài lên điện thoại: copy APK → mở file trên máy → cho phép «Nguồn không xác định» nếu được hỏi.

### Cách 2 — Dòng lệnh (đã có Gradle Wrapper)

Nếu đã có `gradlew.bat` / `gradlew` (Android Studio sinh ra khi mở project):

```powershell
cd mobile\voice-sync-android
.\gradlew.bat assembleDebug
```

APK: `app\build\outputs\apk\debug\app-debug.apk`.

## Cấu hình trên điện thoại

1. Backend phải chạy và **điện thoại truy cập được** (cùng Wi‑Fi, tường lửa mở cổng API).
2. Trong app, **API base** (không có `/api`):
   - Máy ảo Android Studio → máy dev: `http://10.0.2.2:4000`
   - Điện thoại thật → máy tính LAN: `http://IP_MÁY_TÍNH:4000` (vd `http://192.168.1.10:4000`)
3. Email / mật khẩu giống đăng nhập web.
4. Bấm **Cấp quyền** → chấp nhận các quyền.
5. **Chọn file ghi âm** hoặc **Ghi micro** → kiểm tra trên web **CRM → Ghi âm** (`/tools/voice-recordings`).

## API (tóm tắt cho mobile)

Base `{BASE}` = URL app (không có `/api`). Header: `Authorization: Bearer <token>`.

| Phương thức | Đường dẫn | Ghi chú |
|-------------|-----------|---------|
| POST | `/api/auth/login` | JSON `email`, `password` → `token` |
| POST | `/api/voice-recordings` | `multipart/form-data`, field bắt buộc `audio`; tuỳ chọn: `source`, `device_label`, `notes`, `phone_number`, `direction` (inbound\|outbound\|unknown), `call_started_at`, `call_ended_at` (ISO 8601), `external_call_id` |
| GET | `/api/voice-recordings` | Danh sách; query `phone`, `unassigned=1`, `linked_only=1`; có `customer`, `lead` khi đã ghép |
| PATCH | `/api/voice-recordings/:id` | JSON `{ customer_id, lead_id }` hoặc `{ action: "relink_from_phone" }` |
| POST | `/api/voice-recordings/relink-unassigned` | Quét lại ghép CRM theo SĐT |
| POST | `/api/voice-recordings/:id/bootstrap-crm` | Tạo KH + Lead/Deal rồi liên kết (`full_name`, `title`, `type`, `company_id` nếu deal) |

## File APK có sẵn sau khi build

- Trong repo (bản copy tiện tải về điện thoại): `TuBep-VoiceSync-debug.apk` ở **thư mục gốc** `Quanlycongviec` (nếu đã chạy `gradlew assembleDebug` trên máy bạn).
- Trong project Android: `app/build/outputs/apk/debug/app-debug.apk`

## Cơ sở dữ liệu

Chạy SQL `database/61_voice_recordings.sql` trên Supabase (nếu chưa có bảng `voice_recordings`).
