import { registerRootComponent } from 'expo';

// Định nghĩa task nền ở phạm vi module trước khi app khởi chạy, để hệ thống
// có thể đánh thức quét + đẩy ghi âm ngay cả khi app không mở.
import './src/lib/voiceBackgroundTask';

import App from './App';

registerRootComponent(App);
