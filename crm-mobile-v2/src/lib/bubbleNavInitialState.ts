import type { NavigationState, PartialState } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { peekPendingBubbleChatSync } from './bubbleChatPending';

type StackState = PartialState<NavigationState<RootStackParamList>>;

/** Mở thẳng BubbleChat — tránh flash tab Home khi bấm bong bóng. */
export function getBubbleChatInitialNavState(): StackState | undefined {
  const pending = peekPendingBubbleChatSync();
  if (!pending) return undefined;
  return {
    index: 1,
    routes: [
      { name: 'Tabs', params: undefined },
      { name: 'BubbleChat', params: { threadId: pending.threadId, title: pending.title } },
    ],
  };
}

export function isBubbleChatNavState(state: StackState | undefined): boolean {
  if (!state?.routes?.length) return false;
  const top = state.routes[state.index ?? state.routes.length - 1];
  return top?.name === 'BubbleChat';
}
