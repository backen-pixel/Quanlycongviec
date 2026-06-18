# Share Intent (Android) — dùng chung

Module chuẩn để app TuBep **hiện trong Share sheet** và nhận file từ app khác.

## Tích hợp Expo

1. Cài dependency:

```bash
npx expo install expo-share-intent expo-linking
```

2. `app.json`:

```json
{
  "scheme": "your-app-scheme",
  "plugins": [
    ["expo-share-intent", { "disableIOS": true, "disableAndroid": true }],
    [
      "../mobile-shared/share-intent/plugins/withAndroidShareIntentFilters",
      {
        "mimeTypes": ["audio/*", "application/octet-stream", "video/mp4", "*/*"]
      }
    ]
  ]
}
```

**Quan trọng:** Không dùng `androidIntentFilters` nhiều MIME của expo-share-intent (Android hiểu AND → app không hiện).

3. App root:

```tsx
import { ShareIntentProvider } from 'expo-share-intent';

<ShareIntentProvider options={{ resetOnBackground: false, disabled: Platform.OS !== 'android' }}>
  ...
</ShareIntentProvider>
```

4. Import lib:

```ts
import { ensureShareReadableFile } from '../../../mobile-shared/share-intent/lib/shareFileToCache';
import { isSharedAudioFile } from '../../../mobile-shared/share-intent/lib/shareMime';
```

## MIME gợi ý theo app

| App | mimeTypes |
|-----|-----------|
| CRM Mobile v2 | `audio/*`, `application/octet-stream`, `video/mp4`, `*/*` |
| SX Mobile | `image/*`, `application/pdf`, `application/*` |

## Publish APK

Sau `publish-*.js`, chạy:

```bash
node scripts/upload-apk-to-production.js --release <id> --file uploads/...apk
```
