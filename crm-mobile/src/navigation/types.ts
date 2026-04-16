import type { NavigatorScreenParams } from '@react-navigation/native';

export type CrmStackParamList = {
  LeadList: undefined;
  LeadDetail: { id: string };
};

export type VoiceStackParamList = {
  VoiceRecordingsList: undefined;
};

export type MoreStackParamList = {
  MoreHome: undefined;
  CrmEvents: { initialDate?: string };
  FacebookInbox: undefined;
  FacebookChat: { contactId: string };
  AutoPipelineStatus: undefined;
  AccountSettings: undefined;
};

export type MainTabParamList = {
  CrmTab: NavigatorScreenParams<CrmStackParamList> | undefined;
  VoiceTab: NavigatorScreenParams<VoiceStackParamList> | undefined;
  NotificationsTab: undefined;
  MoreTab: NavigatorScreenParams<MoreStackParamList> | undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
};
