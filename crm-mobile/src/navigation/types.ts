import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ParsedExcelResponse } from '../types/salesDocs';

export type CrmStackParamList = {
  LeadList: undefined;
  /** openLeadChat: mở thẳng tab Chat lead (tin lead_chat / lối tắt bong bóng) */
  LeadDetail: { id: string; openLeadChat?: boolean };
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
  MessengerGroupList: undefined;
  MessengerGroupChat: { groupId: string; title?: string; isDirect?: boolean; fromBubble?: boolean };
  MessengerCompose: { mode: 'group' | 'direct' };
  MessengerAddMembers: { groupId: string };
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
