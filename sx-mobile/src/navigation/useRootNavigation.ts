import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import type { RootStackParamList } from './RootNavigator';

export function useRootNavigation() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const openProjectDetail = useCallback(
    (projectId: string, opts?: { focusTaskId?: string | null }) => {
      const params = {
        projectId,
        ...(opts?.focusTaskId ? { focusTaskId: String(opts.focusTaskId) } : {}),
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
    // Đồng nhất bộ lọc với tab Dự án (quickFilter=overdue) — không màn hình riêng.
    let nav: typeof navigation | undefined = navigation;
    while (nav) {
      const names = nav.getState?.()?.routeNames || [];
      if (names.includes('Kanban') && names.includes('Overview')) {
        (nav as { navigate: (name: string, params?: object) => void }).navigate('Kanban', {
          quickFilter: 'overdue',
          viewMode: 'list',
        });
        return;
      }
      if (names.includes('Main')) {
        nav.navigate('Main', {
          screen: 'Kanban',
          params: { quickFilter: 'overdue', viewMode: 'list' },
        });
        return;
      }
      nav = nav.getParent() as typeof navigation | undefined;
    }
  }, [navigation]);

  /** Mở thẻ trên List/Kanban (không vào chi tiết). */
  const openProjectOnBoard = useCallback(
    (
      projectId: string,
      opts?: { quickFilter?: 'all' | 'mine' | 'overdue' | 'today'; viewMode?: 'list' | 'kanban' },
    ) => {
      const params = {
        focusProjectId: String(projectId),
        quickFilter: opts?.quickFilter || 'overdue',
        viewMode: opts?.viewMode || 'list',
      };
      let nav: typeof navigation | undefined = navigation;
      while (nav) {
        const names = nav.getState?.()?.routeNames || [];
        if (names.includes('Kanban') && names.includes('Overview')) {
          (nav as { navigate: (name: string, params?: object) => void }).navigate('Kanban', params);
          return;
        }
        if (names.includes('Main')) {
          nav.navigate('Main', { screen: 'Kanban', params });
          return;
        }
        nav = nav.getParent() as typeof navigation | undefined;
      }
    },
    [navigation],
  );

  const openMessages = useCallback(
    (_tab: 'chats' | 'calls' = 'chats') => {
      let nav: typeof navigation | undefined = navigation;
      while (nav) {
        const names = nav.getState?.()?.routeNames || [];
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

  return { openProjectDetail, openOverdueProjects, openProjectOnBoard, openMessages, navigation };
}
