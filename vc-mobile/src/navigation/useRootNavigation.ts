import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import type { RootStackParamList } from './RootNavigator';

export function useRootNavigation() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const openProjectDetail = useCallback(
    (
      projectId: string,
      opts?: { focusTaskId?: string | null; initialTab?: RootStackParamList['ProjectDetail']['initialTab'] },
    ) => {
      const params = {
        projectId,
        ...(opts?.focusTaskId ? { focusTaskId: String(opts.focusTaskId) } : {}),
        ...(opts?.initialTab ? { initialTab: opts.initialTab } : {}),
      };
      let nav: typeof navigation | undefined = navigation;
      while (nav) {
        const names = nav.getState?.()?.routeNames || [];
        if (names.includes('ProjectDetail')) {
          nav.navigate('ProjectDetail', params);
          return;
        }
        nav = nav.getParent() as typeof navigation | undefined;
      }
    },
    [navigation],
  );

  const openOverdueProjects = useCallback(() => {
    let nav: typeof navigation | undefined = navigation;
    while (nav) {
      const names = nav.getState?.()?.routeNames || [];
      if (names.includes('OverdueProjects')) {
        nav.navigate('OverdueProjects');
        return;
      }
      nav = nav.getParent() as typeof navigation | undefined;
    }
  }, [navigation]);

  const openMessages = useCallback(
    (_tab: 'chats' | 'calls' = 'chats') => {
      let nav: typeof navigation | undefined = navigation;
      while (nav) {
        const names = (nav.getState?.()?.routeNames || []) as string[];
        if (names.includes('Overview') && names.includes('Messages')) {
          (nav as { navigate: (name: string) => void }).navigate('Messages');
          return;
        }
        if (names.includes('Main')) {
          nav.navigate('Main', { screen: 'Messages' });
          return;
        }
        if (names.includes('Messages')) {
          nav.navigate('Messages', { tab: _tab });
          return;
        }
        nav = nav.getParent() as typeof navigation | undefined;
      }
    },
    [navigation],
  );

  return { openProjectDetail, openOverdueProjects, openMessages, navigation };
}
