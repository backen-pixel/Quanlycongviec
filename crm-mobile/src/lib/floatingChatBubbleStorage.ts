import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

/** Người dùng kéo bong bóng vào vùng «ẩn» ở đáy màn hình. */
export const FLOATING_BUBBLE_HIDDEN_KEY = 'crm_floating_chat_bubble_drop_hidden_v1';

export const FLOATING_BUBBLE_CLEAR_HIDDEN_EVENT = 'crm-floating-bubble-clear-hidden';

export async function setFloatingBubbleHiddenByDrop(): Promise<void> {
  await AsyncStorage.setItem(FLOATING_BUBBLE_HIDDEN_KEY, '1');
}

export async function clearFloatingBubbleHidden(): Promise<void> {
  await AsyncStorage.removeItem(FLOATING_BUBBLE_HIDDEN_KEY);
  DeviceEventEmitter.emit(FLOATING_BUBBLE_CLEAR_HIDDEN_EVENT);
}
