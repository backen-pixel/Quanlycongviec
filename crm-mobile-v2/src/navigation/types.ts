import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Kanban: undefined;
  Deadline: undefined;
  CreatePlaceholder: undefined;
  Messages: undefined;
  Menu: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /** Trang trống — danh sách Deal đang phụ trách (Menu → Công việc → Planner). */
  Planner: undefined;
  CrmHub: { initialMode?: 'leads' | 'deals' | 'orders'; initialAssignee?: 'mine' } | undefined;
  LeadDealDetail: {
    leadId: string;
    kind?: 'lead' | 'deal';
    code?: string;
    title?: string;
    initialTab?: string;
  };
  ChatDetail: {
    threadId: string;
    title: string;
    peerId?: string | null;
    openSearch?: boolean;
    fromBubble?: boolean;
  };
  /** Chat mở từ bong bóng overlay — back thu nhỏ app. */
  BubbleChat: { threadId: string; title: string };
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
  Recordings: undefined;
  VoiceLocalRecordings: undefined;
  Drive: undefined;
  Settings: undefined;
  Notifications: undefined;
  Events: undefined;
  Leaves: undefined;
  Quotations: undefined;
  Orders: undefined;
  Products: undefined;
  Customers: undefined;
  Tasks: undefined;
  Account: undefined;
  Devices: undefined;
  QrScan: undefined;
  EmployeeReport: undefined;
  EmployeeReportDetail: {
    userId: string;
    fullName: string;
    avatar?: string | null;
    departmentName?: string | null;
    dateFrom: string;
    dateTo: string;
    typeView?: 'all' | 'lead' | 'deal';
    companyId?: string;
    regionId?: string;
  };
};
