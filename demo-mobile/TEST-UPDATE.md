# Test cập nhật TuBep Demo

## Bước 1 — Cài APK v1 (chỉ màn "Tủ bếp")

```powershell
cd demo-mobile
npm install
npm run build:apk
```

Upload APK (từ backend):

```powershell
cd ..\backend
node scripts/upload-apk-release.js --app tubep-demo --file ../demo-mobile/dist/TuBepDemo-1.0.0-release.apk --version 1.0.0 --version-code 1 --notes "v1 chỉ Tủ bếp"
```

Cài APK trên máy Android → mở app → chỉ thấy chữ **Tủ bếp**.

## Bước 2 — Phát hành OTA v2 (thêm tab Kính)

1. Sao nội dung `App.v2.tsx` vào `App.tsx` (hoặc copy file).
2. Phát hành OTA (runtime = version trong app.json = `1.0.0`):

```powershell
cd backend
node scripts/publish-ota.js --app tubep-demo --dir ../demo-mobile --runtime 1.0.0 --notes "Thêm trang Kính"
```

3. **Đóng app hoàn toàn** trên máy, mở lại → app tự tải OTA → thấy 2 tab **Tủ bếp** và **Kính**.

## Hoặc test full APK v2

Tăng `versionCode` trong `app.json` (vd. 2), build APK mới, upload qua web `/settings/app-updates` → app hiện modal cập nhật APK.
