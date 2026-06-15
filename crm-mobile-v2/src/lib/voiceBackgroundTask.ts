import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { runVoiceBackgroundSyncOnce } from './voiceBackgroundSync';

/** Tên task nền quét + đẩy ghi âm cuộc gọi lên hệ thống. */
export const VOICE_SYNC_TASK = 'crmv2-voice-sync-task';

/**
 * Định nghĩa task ở phạm vi module (được import sớm trong index.ts) để
 * hệ điều hành (WorkManager trên Android) có thể đánh thức app chạy nền
 * ngay cả khi app đã bị thu nhỏ hoặc đóng.
 */
if (!TaskManager.isTaskDefined(VOICE_SYNC_TASK)) {
  TaskManager.defineTask(VOICE_SYNC_TASK, async () => {
    try {
      await runVoiceBackgroundSyncOnce();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** Đăng ký quét nền định kỳ (Android). Không lỗi nếu môi trường không hỗ trợ. */
export async function registerVoiceBackgroundTask(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;
    if (await TaskManager.isTaskRegisteredAsync(VOICE_SYNC_TASK)) return;
    // minimumInterval tính bằng phút; 15 là mức tối thiểu hệ thống cho phép.
    await BackgroundTask.registerTaskAsync(VOICE_SYNC_TASK, { minimumInterval: 15 });
  } catch {
    /* bỏ qua: không chặn luồng chính */
  }
}

/** Hủy đăng ký quét nền. */
export async function unregisterVoiceBackgroundTask(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(VOICE_SYNC_TASK)) {
      await BackgroundTask.unregisterTaskAsync(VOICE_SYNC_TASK);
    }
  } catch {
    /* bỏ qua */
  }
}
