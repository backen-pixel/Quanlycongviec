# Push / thanh thông báo hệ thống (CRM Mobile v2)

## Hiện trạng kiểm tra (LDPlayer Android 9)

| Loại | Hoạt động? | Ghi chú |
|------|------------|---------|
| Tin nhắn khi app **còn sống** (nền) | Có thể | Local notification qua socket → kênh `crm_chat` |
| CRM / chat khi app **tắt hẳn** | **Chưa** | Thiếu FCM: chưa có `google-services.json` cho `vn.tubeppro.crmobilev2` |
| Kênh trên máy | Đã có | `crm_system_tray_v3`, `crm_chat`, `crm_call`, `sx_bubble_overlay` |

## Bật FCM (1 lần)

1. [Firebase Console](https://console.firebase.google.com) → project **tubep-crm** (hoặc project đang dùng).
2. **Add app → Android**
   - Package: `vn.tubeppro.crmobilev2` (khớp `app.json`)
3. Tải `google-services.json` → đặt tại:
   ```
   crm-mobile-v2/google-services.json
   ```
   File phải chứa client có `package_name": "vn.tubeppro.crmobilev2"`.
4. Rebuild APK (`scripts/build-apk.ps1`). Plugin `withGoogleServices` sẽ copy vào `android/app/` và bật Google Services Gradle plugin.
5. Đăng nhập app → logcat lọc `[crmv2 push]` phải thấy `FCM registered`.

## Kiểm thử nhanh

1. App mở, đưa về nền (Home) — gửi tin Messenger từ tài khoản khác → phải thấy trên shade (kênh Tin nhắn).
2. Force-stop app → gửi lại / tạo thông báo CRM từ web → chỉ hiện nếu bước FCM ở trên đã xong.

Lưu ý: Firebase hiện có sẵn app `vn.tubeppro.crmobile` và `vn.tubeppro.sxmobile` — **không** dùng chung cho v2; phải thêm app mới đúng package `crmobilev2`.
