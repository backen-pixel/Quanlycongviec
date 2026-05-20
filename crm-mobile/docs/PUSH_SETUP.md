# Cấu hình Push Notification (khi app tắt)

Muốn nhận push notification (tin nhắn / deal mới) **khi app đã đóng / khoá máy**, APK phải có FCM credentials và Expo Push Service được cấu hình. Đây là việc làm **1 lần**, sau đó push tự chạy.

## 1. Tạo Firebase project + FCM

1. Vào https://console.firebase.google.com → tạo project mới (hoặc dùng project sẵn có).
2. Trong project → **Add app → Android**.
   - Package name: `vn.tubeppro.crmobile` (khớp `crm-mobile/app.json → android.package`).
   - Bỏ qua các bước SHA và "Add SDK".
3. Tải file **`google-services.json`**.
4. Copy file đó vào thư mục **`crm-mobile/google-services.json`** (cùng cấp với `app.json`).

## 2. Tạo EAS project + projectId

1. Cài Expo CLI nếu chưa có:
   ```powershell
   npm i -g eas-cli
   ```
2. Trong thư mục `crm-mobile`:
   ```powershell
   eas login
   eas init
   ```
   Lệnh `eas init` sẽ in ra `projectId` (UUID).
3. Mở `crm-mobile/app.json` và sửa:
   ```json
   "extra": {
     "eas": {
       "projectId": "REPLACE_WITH_EAS_PROJECT_ID"   // ← dán projectId vừa lấy được
     }
   },
   "owner": "tubeppro"   // ← tên owner của EAS project
   ```

## 3. Upload FCM credentials lên Expo Push Service

Expo dùng FCM v1. Trên Firebase Console:

1. Mở **Project settings → Service accounts** → **Generate new private key** → tải file JSON.
2. Trong terminal `crm-mobile`:
   ```powershell
   eas credentials
   ```
   - Chọn `Android` → `production` → `Push Notifications: Manage your Google Service Account Key` → upload file JSON vừa tải.

(Có thể làm trên web: https://expo.dev → project → Credentials → Android → FCM V1 Service Account Key.)

## 4. Build lại APK

```powershell
cd crm-mobile
npm run prebuild:android          # nhúng google-services.json
npm run build:apk                 # tạo APK release
```

APK ra ở `crm-mobile/dist/crm-mobile-release.apk` (theo script `build-apk.ps1`). Cài lên máy thật.

## 5. Kiểm thử

1. Mở app → đăng nhập.
2. Vào **More → Tài khoản → Thiết bị đang đăng nhập**. Banner phía trên cần hiện:
   ```
   ✓ Push đã sẵn sàng (khi tắt app vẫn nhận thông báo)
   Quyền: granted · projectId: có · token: có
   ```
3. Bấm **"Gửi push thử (Chat)"** → bật chế độ khóa máy → push hiện ra.

Nếu vẫn không hoạt động:
- Kiểm tra logcat trên Android Studio: lọc keyword `pushRegistration` để xem lỗi cụ thể.
- Kiểm tra trên dashboard EAS xem `Expo Push Token` có được tạo không.
- Đảm bảo `google-services.json` đúng package `vn.tubeppro.crmobile`.

## Tóm tắt yêu cầu

| Yêu cầu | Đã có? |
|--------|--------|
| `crm-mobile/google-services.json` | ❌ Cần thêm |
| `app.json → extra.eas.projectId` | ❌ Cần đặt UUID thật |
| `app.json → owner` | ❌ Cần đặt EAS owner |
| FCM V1 Service Account JSON trên EAS | ❌ Cần upload |
| `android.permission.SYSTEM_ALERT_WINDOW` (cho bubble) | ✓ Đã có |
| Backend migration `204_push_device_tokens.sql` | ✓ Đã có |
| Backend migration `205_user_devices.sql` | ✓ Đã có (chạy trên Supabase) |

> ⚠️ Trước khi cấu hình xong, push CHỈ hoạt động khi app đang mở (qua Socket.IO). Sau khi cấu hình xong + build lại APK, push sẽ tới cả khi app tắt / khóa máy.
