# Vận chuyển lắp đặt (vc-mobile)

App mobile độc lập cho **module Vận chuyển / Lắp đặt (VC)**, dùng chung backend với hệ thống. Dữ liệu lấy từ `/api/logistics/*`.

## API chính

- `GET /api/logistics/dashboard` → `{ kpis, pipeline, projects }`
- `GET /api/logistics/pipeline-stages`
- `GET /api/logistics/projects/:id`
- `PATCH /api/logistics/projects/:id/stage` → `{ vc_stage_id }` hoặc `{ move_to_intake: true }`

## Cấu hình

```
EXPO_PUBLIC_API_URL=https://tubep-backend.onrender.com
```

## Build APK

```bash
npm install
npm run build:apk
```

APK output: `dist/vc-mobile-{version}-code{versionCode}-release.apk`
