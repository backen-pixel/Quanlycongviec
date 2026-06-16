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
  CrmHub: { initialMode?: 'leads' | 'deals'; initialAssignee?: 'mine' } | undefined;
  ChatDetail: { threadId: string; title: string; peerId?: string | null; openSearch?: boolean };
  MessengerForward: {
    excludeGroupId: string;
    sourceTitle: string;
    messagesJson: string;
  };
  ChatDetailInfo: {
    threadId: string;
    title: string;
    avatarColor?: string;
    avatarUrl?: string | null;
    isDirect?: boolean;
    peerId?: string | null;
    messagesJson: string;
  };
  CreateGroupChat: {
    preselectedUserIds?: string[];
    suggestedName?: string;
  };
  CreateEntity: { kind: 'lead' | 'deal' };
  VoiceLocalRecordings: undefined;
  Drive: undefined;
  Settings: undefined;
  Notifications: undefined;
  Events: undefined;
  Quotations: undefined;
  Orders: undefined;
  Products: undefined;
  Customers: undefined;
  Tasks: undefined;
  Account: undefined;
  Devices: undefined;
};
