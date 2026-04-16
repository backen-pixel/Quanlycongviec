import type { NavigationProp, ParamListBase } from '@react-navigation/native';

type ParentNav = { getParent: () => NavigationProp<ParamListBase> | undefined | null };

export function openMoreTab(
  navigation: ParentNav,
  screen: 'CrmEvents' | 'FacebookInbox' | 'FacebookChat' | 'AutoPipelineStatus' | 'AccountSettings',
  params?: Record<string, unknown>,
) {
  const payload =
    params !== undefined ? { screen, params } : { screen };
  navigation.getParent()?.navigate('MoreTab', payload as never);
}
