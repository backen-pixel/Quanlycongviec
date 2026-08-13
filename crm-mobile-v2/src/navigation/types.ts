import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Overview: undefined;
  Lead: undefined;
  Deal: undefined;
  Deadline: undefined;
  Messages: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /** Trang trống — danh sách Deal đang phụ trách (Menu → Công việc → Planner). */
  Planner: undefined;
  CrmHub: {
    initialMode?: 'leads' | 'deals' | 'orders';
    initialAssignee?: 'mine';
    /** Nhúng trong tab Lead/Deal — không hiện nút Back. */
    embedded?: boolean;
    /** Khóa 1 mode (ẩn segment Leads|Deals|ĐH). */
    lockMode?: boolean;
  } | undefined;
  LeadDealDetail: {
    leadId: string;
    kind?: 'lead' | 'deal';
    code?: string;
    title?: string;
    initialTab?: string;
    /** Mở đúng phân công Giao việc (Không gian chung). */
    focusAssignmentId?: string;
    /** Mở đúng nhiệm vụ crm_tasks (tab Nhiệm vụ). */
    focusTaskId?: string;
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
  /** Menu app — mở từ nút cạnh chuông thông báo (không còn tab). */
  Menu: undefined;
  Notifications: undefined;
  Events: { openCreate?: boolean } | undefined;
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
