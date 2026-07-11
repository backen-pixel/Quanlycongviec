import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import type { RootStackParamList } from './RootNavigator';

export function useRootNavigation() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const openProjectDetail = useCallback(
    (projectId: string) => {
      let nav: typeof navigation | undefined = navigation;
      while (nav) {
        const names = nav.getState?.()?.routeNames || [];
        if (names.includes('ProjectDetail')) {
          nav.navigate('ProjectDetail', { projectId });
          return;
        }
        nav = nav.getParent() as typeof navigation | undefined;
      }
    },
    [navigation],
  );

  const openMessages = useCallback(
    (tab: 'chats' | 'calls' = 'chats') => {
      let nav: typeof navigation | undefined = navigation;
      while (nav) {
        const names = nav.getState?.()?.routeNames || [];
        if (names.includes('Messages')) {
          nav.navigate('Messages', { tab });
          return;
        }
        nav = nav.getParent() as typeof navigation | undefined;
      }
    },
    [navigation],
  );

  return { openProjectDetail, openMessages, navigation };
}
