import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

/** Người dùng kéo bong bóng vào vùng «ẩn» ở đáy màn hình. */
export const FLOATING_BUBBLE_HIDDEN_KEY = 'crm_floating_chat_bubble_drop_hidden_v1';

/** Vị trí đã kéo (giống Zalo — dính mép trái/phải). */
export const FLOATING_BUBBLE_POS_KEY = 'crm_floating_chat_bubble_xy_v1';

export const FLOATING_BUBBLE_CLEAR_HIDDEN_EVENT = 'crm-floating-bubble-clear-hidden';

export async function loadFloatingBubblePosition(): Promise<{ x: number; y: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(FLOATING_BUBBLE_POS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof j.x !== 'number' || typeof j.y !== 'number') return null;
    return { x: j.x, y: j.y };
  } catch {
    return null;
  }
}

export async function saveFloatingBubblePosition(x: number, y: number): Promise<void> {
  await AsyncStorage.setItem(FLOATING_BUBBLE_POS_KEY, JSON.stringify({ x, y }));
}

export async function setFloatingBubbleHiddenByDrop(): Promise<void> {
  await AsyncStorage.setItem(FLOATING_BUBBLE_HIDDEN_KEY, '1');
  await AsyncStorage.removeItem(FLOATING_BUBBLE_POS_KEY);
}

export async function clearFloatingBubbleHidden(): Promise<void> {
  await AsyncStorage.removeItem(FLOATING_BUBBLE_HIDDEN_KEY);
  DeviceEventEmitter.emit(FLOATING_BUBBLE_CLEAR_HIDDEN_EVENT);
}
