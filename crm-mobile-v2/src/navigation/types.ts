import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Planner: undefined;
  Recordings: undefined;
  CreatePlaceholder: undefined;
  Messages: undefined;
  Menu: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  CrmHub: { initialMode?: 'leads' | 'deals' } | undefined;
  ChatDetail: { threadId: string; title: string; color: string };
  CreateEntity: { kind: 'lead' | 'deal' };
};
