/**
 * Task nền: kiểm tra bản APK mới và hiện tray — kể cả khi chưa mở app.
 * OS thường chạy tối đa ~ mỗi 15 phút khi thiết bị rảnh.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { probeAndNotifyAppUpdateTray } from './appUpdateNotify';

export const APP_UPDATE_TASK = 'crmv2-app-update-check-task';

if (!TaskManager.isTaskDefined(APP_UPDATE_TASK)) {
  TaskManager.defineTask(APP_UPDATE_TASK, async () => {
    try {
      await probeAndNotifyAppUpdateTray();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerAppUpdateBackgroundTask(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;
    if (await TaskManager.isTaskRegisteredAsync(APP_UPDATE_TASK)) return;
    await BackgroundTask.registerTaskAsync(APP_UPDATE_TASK, { minimumInterval: 15 });
  } catch {
    /* bỏ qua */
  }
}

export async function unregisterAppUpdateBackgroundTask(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(APP_UPDATE_TASK)) {
      await BackgroundTask.unregisterTaskAsync(APP_UPDATE_TASK);
    }
  } catch {
    /* bỏ qua */
  }
}
