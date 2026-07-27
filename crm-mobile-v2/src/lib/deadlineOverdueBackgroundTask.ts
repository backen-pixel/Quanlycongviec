import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { runDeadlineOverdueCheckOnce } from './deadlineOverdueBackgroundSync';

/** Task nền: đếm Deadline quá hạn + nhắc tray (tối đa ~ mỗi 15 phút OS). */
export const DEADLINE_OVERDUE_TASK = 'crmv2-deadline-overdue-task';

if (!TaskManager.isTaskDefined(DEADLINE_OVERDUE_TASK)) {
  TaskManager.defineTask(DEADLINE_OVERDUE_TASK, async () => {
    try {
      await runDeadlineOverdueCheckOnce({ forceFetch: true });
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerDeadlineOverdueBackgroundTask(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;
    if (await TaskManager.isTaskRegisteredAsync(DEADLINE_OVERDUE_TASK)) return;
    await BackgroundTask.registerTaskAsync(DEADLINE_OVERDUE_TASK, { minimumInterval: 15 });
  } catch {
    /* bỏ qua */
  }
}

export async function unregisterDeadlineOverdueBackgroundTask(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(DEADLINE_OVERDUE_TASK)) {
      await BackgroundTask.unregisterTaskAsync(DEADLINE_OVERDUE_TASK);
    }
  } catch {
    /* bỏ qua */
  }
}
