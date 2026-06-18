import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './RootNavigator';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function openChatFromBubble(groupId: string, title: string): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('ChatDetail', { threadId: groupId, title });
}

export function openMessagesFromBubble(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Messages', { tab: 'chats' });
}

export function openProjectCommentFromNotif(projectId: string): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('ProjectDetail', { projectId });
}

export function navigateToShareToChat(): void {
  const go = () => {
    if (!navigationRef.isReady()) return false;
    navigationRef.navigate('ShareToChat');
    return true;
  };
  if (go()) return;
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (go() || tries >= 20) clearInterval(timer);
  }, 150);
}
