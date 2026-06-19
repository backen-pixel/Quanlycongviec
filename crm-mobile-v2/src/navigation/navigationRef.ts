import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<Name extends keyof RootStackParamList>(
  name: Name,
  params?: RootStackParamList[Name],
) {
  if (navigationRef.isReady()) {
    // @ts-expect-error params typing across union is safe here
    navigationRef.navigate(name, params);
  }
}

/** Mở thẳng BubbleChat — không flash tab Home. */
export function resetToBubbleChat(threadId: string, title: string) {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.reset({
      index: 1,
      routes: [
        { name: 'Tabs' },
        { name: 'BubbleChat', params: { threadId, title: title || 'Chat' } },
      ],
    }),
  );
}

export function isOnBubbleChatRoute(threadId?: string): boolean {
  if (!navigationRef.isReady()) return false;
  const route = navigationRef.getCurrentRoute();
  if (route?.name !== 'BubbleChat') return false;
  if (!threadId) return true;
  const params = route.params as { threadId?: string } | undefined;
  return String(params?.threadId || '') === String(threadId);
}
