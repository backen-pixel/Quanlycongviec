import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import type { MoreStackParamList } from './types';

type ParentNav = { getParent: () => NavigationProp<ParamListBase> | undefined | null };

export function openMoreTab<S extends keyof MoreStackParamList>(
  navigation: ParentNav,
  screen: S,
  params?: MoreStackParamList[S],
) {
  const go = () => {
    if (params !== undefined) {
      navigationRef.navigate('Main', {
        screen: 'MoreTab',
        params: { screen, params } as never,
      });
    } else {
      navigationRef.navigate('Main', {
        screen: 'MoreTab',
        params: { screen } as never,
      });
    }
  };

  if (navigationRef.isReady()) {
    go();
    return;
  }

  const tabNav = navigation.getParent();
  if (!tabNav) return;
  if (params !== undefined) {
    tabNav.navigate('MoreTab', { screen, params } as never);
  } else {
    tabNav.navigate('MoreTab', { screen } as never);
  }
}
