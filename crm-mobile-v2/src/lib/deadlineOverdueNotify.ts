import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { DeadlineOverdueBreakdown } from './deadlineOverdueStore';

/** Khớp channel hệ thống trong pushNotifications.ts / backend pushSender. */
const CHANNEL_SYSTEM = 'crm_system_tray_v3';
const LAST_SHOWN_KEY = 'crmv2_deadline_overdue_notif_at_v1';
const NOTIF_ID = 'crmv2-deadline-overdue-reminder';

/** Mỗi 3 tiếng nhắc một lần khi còn Lead/Deal quá hạn. */
export const DEADLINE_OVERDUE_NOTIF_INTERVAL_MS = 3 * 60 * 60 * 1000;

export function buildDeadlineOverdueMessage(b: Pick<DeadlineOverdueBreakdown, 'lead' | 'deal'>): string {
  const { lead, deal } = b;
  if (lead > 0 && deal > 0) {
    return `Bạn đang có ${lead} Lead và ${deal} Deal quá hạn cần xử lý ngay.`;
  }
  if (lead > 0) {
    return `Bạn đang có ${lead} Lead quá hạn cần xử lý ngay.`;
  }
  if (deal > 0) {
    return `Bạn đang có ${deal} Deal quá hạn cần xử lý ngay.`;
  }
  return '';
}

async function getLastShownAt(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SHOWN_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

async function setLastShownAt(at: number): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SHOWN_KEY, String(at));
  } catch {
    /* bỏ qua */
  }
}

/** Hủy nhắc đã lên lịch (nếu có). */
export async function cancelDeadlineOverdueNotifications(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIF_ID);
  } catch {
    /* bỏ qua */
  }
}

/**
 * Hiện tray hệ thống nếu còn quá hạn và đã đủ 3 tiếng từ lần nhắc trước.
 * Không quá hạn → không thông báo.
 */
export async function maybeNotifyDeadlineOverdue(
  breakdown: Pick<DeadlineOverdueBreakdown, 'lead' | 'deal' | 'total'> | null,
): Promise<boolean> {
  if (!breakdown || breakdown.total <= 0) {
    await cancelDeadlineOverdueNotifications();
    return false;
  }

  const body = buildDeadlineOverdueMessage(breakdown);
  if (!body) return false;

  const last = await getLastShownAt();
  if (last > 0 && Date.now() - last < DEADLINE_OVERDUE_NOTIF_INTERVAL_MS) {
    return false;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: {
        title: 'Deadline quá hạn',
        body,
        sound: 'default',
        data: {
          type: 'deadline_overdue_local',
          entity_type: 'deadline_tab',
          lead_overdue: breakdown.lead,
          deal_overdue: breakdown.deal,
          total_overdue: breakdown.total,
        },
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_SYSTEM } : {}),
      },
      trigger: null,
    });
    await setLastShownAt(Date.now());
    return true;
  } catch {
    return false;
  }
}

export async function resetDeadlineOverdueNotifyState(): Promise<void> {
  await cancelDeadlineOverdueNotifications();
  try {
    await AsyncStorage.removeItem(LAST_SHOWN_KEY);
  } catch {
    /* bỏ qua */
  }
}
