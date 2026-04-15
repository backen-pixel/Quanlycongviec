import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CrmColors } from '../theme/crmTheme';

export type IonName = ComponentProps<typeof Ionicons>['name'];

const TYPE_ICON: Record<string, IonName> = {
  task_assigned: 'checkbox-outline',
  task_updated: 'checkbox-outline',
  task_overdue: 'warning-outline',
  task_completed: 'checkbox-outline',
  comment_added: 'chatbubbles-outline',
  project_stage_changed: 'folder-outline',
  project_assigned: 'folder-outline',
  stage_changed: 'layers-outline',
  approval_request: 'shield-outline',
  approval_approved: 'shield-checkmark-outline',
  approval_rejected: 'close-circle-outline',
  approval_auto: 'shield-checkmark-outline',
  deadline_reminder: 'time-outline',
  deadline_warning: 'time-outline',
  deadline_overdue: 'warning-outline',
  checklist_completed: 'checkbox-outline',
  lead_assigned: 'person-outline',
  lead_created: 'folder-outline',
  lead_converted: 'folder-outline',
  lead_stage_changed: 'folder-outline',
  lead_member_added: 'people-outline',
  lead_chat: 'chatbubbles-outline',
  lead_member: 'person-outline',
  deal_assigned: 'person-outline',
  deal_created: 'folder-outline',
  deal_won: 'trophy-outline',
  quotation_created: 'document-text-outline',
  quotation_updated: 'document-text-outline',
  order_created: 'document-text-outline',
  order_confirmed: 'document-text-outline',
  order_updated: 'document-text-outline',
  invoice_created: 'document-text-outline',
  invoice_overdue: 'warning-outline',
  payment_received: 'cash-outline',
  crm_task_assigned: 'checkbox-outline',
  crm_task_completed: 'checkbox-outline',
  document_uploaded: 'attach-outline',
  project_created: 'folder-outline',
  item_deleted: 'warning-outline',
  system: 'notifications-outline',
};

export type NotifTint = { bg: string; fg: string };

const TYPE_TINT: Record<string, NotifTint> = {
  task_assigned: { bg: CrmColors.blue100, fg: CrmColors.blue600 },
  task_updated: { bg: CrmColors.emerald100, fg: CrmColors.emerald600 },
  task_overdue: { bg: CrmColors.red50, fg: CrmColors.red500 },
  task_completed: { bg: CrmColors.emerald100, fg: CrmColors.emerald600 },
  comment_added: { bg: CrmColors.purple100, fg: CrmColors.purple700 },
  project_stage_changed: { bg: CrmColors.amber100, fg: CrmColors.amber600 },
  project_assigned: { bg: CrmColors.blue100, fg: CrmColors.blue600 },
  stage_changed: { bg: CrmColors.amber100, fg: CrmColors.amber600 },
  approval_request: { bg: '#FFEDD5', fg: '#EA580C' },
  approval_approved: { bg: CrmColors.emerald100, fg: CrmColors.emerald600 },
  approval_rejected: { bg: CrmColors.red50, fg: CrmColors.red500 },
  deadline_reminder: { bg: '#FFEDD5', fg: '#EA580C' },
  deadline_warning: { bg: CrmColors.amber100, fg: CrmColors.amber600 },
  deadline_overdue: { bg: CrmColors.red50, fg: CrmColors.red500 },
  checklist_completed: { bg: '#ECFCCB', fg: '#4D7C0F' },
  lead_assigned: { bg: '#CFFAFE', fg: '#0891B2' },
  lead_member_added: { bg: '#E0E7FF', fg: CrmColors.indigo600 },
  lead_chat: { bg: CrmColors.purple100, fg: CrmColors.purple700 },
  deal_won: { bg: CrmColors.emerald100, fg: CrmColors.emerald600 },
  order_confirmed: { bg: '#FFEDD5', fg: '#EA580C' },
  invoice_overdue: { bg: CrmColors.red50, fg: CrmColors.red500 },
  system: { bg: CrmColors.gray100, fg: CrmColors.gray600 },
};

const DEFAULT_TINT: NotifTint = { bg: CrmColors.gray100, fg: CrmColors.gray600 };

export function notifIconFor(type: string | undefined, isApproval: boolean): IonName {
  if (isApproval) return 'folder-outline';
  if (!type) return 'notifications-outline';
  return TYPE_ICON[type] || 'notifications-outline';
}

export function notifTintFor(type: string | undefined, isApproval: boolean): NotifTint {
  if (isApproval) return { bg: '#FFEDD5', fg: '#EA580C' };
  if (!type) return DEFAULT_TINT;
  return TYPE_TINT[type] || DEFAULT_TINT;
}
