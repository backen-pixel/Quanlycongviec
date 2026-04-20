import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_GROUP = 'crm_messenger_bubble_target_group_v1';
const KEY_TITLE = 'crm_messenger_bubble_target_title_v1';

/** Ghi nhóm ưu tiên khi mở chat hoặc nhận tin Messenger — bubble chạm sẽ vào đúng cuộc này nếu còn. */
export async function setMessengerBubbleTarget(groupId: string, title?: string | null): Promise<void> {
  await AsyncStorage.setItem(KEY_GROUP, groupId);
  if (title != null && String(title).trim() !== '') await AsyncStorage.setItem(KEY_TITLE, String(title).trim());
  else await AsyncStorage.removeItem(KEY_TITLE);
}

export async function getMessengerBubbleTarget(): Promise<{ groupId: string; title?: string } | null> {
  const gid = await AsyncStorage.getItem(KEY_GROUP);
  if (!gid) return null;
  const title = await AsyncStorage.getItem(KEY_TITLE);
  return { groupId: gid, title: title || undefined };
}

/** Gọi từ socket thông báo `messenger_chat` để bubble mở đúng nhóm. */
export function rememberMessengerTargetFromNotification(n: {
  type?: string;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
}): void {
  if (n.type !== 'messenger_chat') return;
  const gid = n.entity_id;
  if (!gid) return;
  const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  const gn = typeof meta.group_name === 'string' ? meta.group_name : null;
  void setMessengerBubbleTarget(gid, gn);
}
