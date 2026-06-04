import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ParsedExcelResponse } from '../types/salesDocs';

export type CrmStackParamList = {
  LeadList: undefined;
  /** openLeadChat: mở thẳng tab Chat lead (tin lead_chat / lối tắt bong bóng) */
  LeadDetail: { id: string; openLeadChat?: boolean };
};

export type VoiceStackParamList = {
  VoiceRecordingsList: undefined;
  VoiceLocalRecordings: undefined;
};

export type MoreStackParamList = {
  MoreHome: undefined;
  CrmEvents: { initialDate?: string };
  FacebookInbox: undefined;
  FacebookChat: { contactId: string };
  AutoPipelineStatus: undefined;
  AccountSettings: undefined;
  MessengerGroupList: undefined;
  MessengerGroupChat: { groupId: string; title?: string; isDirect?: boolean; fromBubble?: boolean };
  MessengerCompose: { mode: 'group' | 'direct' };
  MessengerAddMembers: { groupId: string };
  MessengerForward: {
    excludeGroupId: string;
    sourceTitle: string;
    messagesJson: string;
  };
  SalesHub: undefined;
  QuotationList: undefined;
  QuotationDetail: { id: string };
  QuotationForm: { mode: 'create' | 'edit'; id?: string };
  QuotationExcelReview: { parsed: ParsedExcelResponse };
  OrderList: undefined;
  OrderDetail: { id: string };
  InvoiceList: undefined;
  InvoiceDetail: { id: string };
  CrmDashboard: { initialType?: 'lead' | 'deal' };
  CrmTasksOverview: undefined;
  CustomerList: undefined;
  CustomerDetail: { id: string };
  ProductList: undefined;
  ProductDetail: { id: string };
  CategoryList: undefined;
  CrmPipelineList: undefined;
  CrmPipelineDetail: { id: string };
  CrmEmbeddedWeb: { path: string; title?: string };
  SocialFeed: undefined;
  SocialPost: { id: string };
  /** Trang cá nhân bảng tin nội bộ — tap avatar/tên tác giả để mở */
  SocialProfile: { userId: string };
  /** Hướng dẫn quyền thông báo + overlay + pin nền cho bong bóng Messenger */
  BubblePermissionOnboard: undefined;
  /** Liệt kê / đăng xuất từ xa các thiết bị đang đăng nhập */
  MyDevices: undefined;
  /** Giao việc — danh sách / lọc / tạo nhanh */
  WorkTaskList: undefined;
  /** Chi tiết công việc — đổi trạng thái, bình luận, người hỗ trợ */
  WorkTaskDetail: { id: string };
  /** Tạo / sửa công việc */
  WorkTaskForm: { mode: 'create' | 'edit'; id?: string };
};

/** Stack riêng cho tab "Tin nhắn" trên thanh dưới — có same screens với MoreStack
 *  nhưng được mount trong tab khác để icon active đúng khi user tap tab. */
export type MessengerStackParamList = {
  MessengerGroupList: undefined;
  MessengerGroupChat: { groupId: string; title?: string; isDirect?: boolean; fromBubble?: boolean };
  MessengerCompose: { mode: 'group' | 'direct' };
  MessengerAddMembers: { groupId: string };
  MessengerForward: {
    excludeGroupId: string;
    sourceTitle: string;
    messagesJson: string;
  };
};

export type MainTabParamList = {
  CrmTab: NavigatorScreenParams<CrmStackParamList> | undefined;
  VoiceTab: NavigatorScreenParams<VoiceStackParamList> | undefined;
  MessengerTab: NavigatorScreenParams<MessengerStackParamList> | undefined;
  NotificationsTab: undefined;
  MoreTab: NavigatorScreenParams<MoreStackParamList> | undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  /** Chat screen mở từ bong bóng overlay — không có tab bar, back → minimizeApp */
  BubbleChat: { groupId: string; title?: string };
};
