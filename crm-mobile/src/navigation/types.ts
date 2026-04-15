import type { NavigatorScreenParams } from '@react-navigation/native';

export type CrmStackParamList = {
  LeadList: undefined;
  LeadDetail: { id: string };
};

export type MainTabParamList = {
  CrmTab: NavigatorScreenParams<CrmStackParamList> | undefined;
  NotificationsTab: undefined;
  AccountTab: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
};
