import { navigationRef } from '../navigation/navigationRef';
import { openWebPath } from './openWeb';
import type { AppNotification } from '../types/notifications';

function meta(n: AppNotification): Record<string, unknown> {
  const m = n.metadata;
  return m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
}

/** Điều hướng từ một thông báo (giố logic NotificationsScreen). */
export function navigateFromAppNotification(n: AppNotification): void {
  if (!navigationRef.isReady()) return;
  const m = meta(n);

  if (n.type === 'messenger_chat' && n.entity_id) {
    const groupName = typeof m.group_name === 'string' ? m.group_name : n.title;
    navigationRef.navigate('Main', {
      screen: 'MoreTab',
      params: {
        screen: 'MessengerGroupChat',
        params: {
          groupId: n.entity_id,
          title: groupName,
          isDirect: m.is_direct === true,
        },
      } as never,
    });
    return;
  }
  if (n.type === 'lead_chat' && n.entity_id) {
    navigationRef.navigate('Main', {
      screen: 'CrmTab',
      params: {
        screen: 'LeadDetail',
        params: { id: n.entity_id, openLeadChat: true },
      },
    });
    return;
  }
  if (n.type === 'comment_added' && (n.entity_type === 'lead' || n.entity_type === 'crm_lead' || n.entity_type === 'crm_deal') && n.entity_id) {
    openWebPath(`/crm/leads/${n.entity_id}?tab=comments`);
    return;
  }
  if (n.type === 'department_chat' && n.entity_id) {
    // Mobile chưa có native DepartmentChat → mở web theo route đã có.
    openWebPath(`/departments/${n.entity_id}/chat`);
    return;
  }
  const pid =
    (typeof m.project_id === 'string' && m.project_id) ||
    (n.entity_type === 'project' && n.entity_id ? n.entity_id : null);
  const navTab = typeof m.nav_tab === 'string' ? m.nav_tab : undefined;
  if (pid) {
    const q = navTab ? `?tab=${encodeURIComponent(navTab)}` : '';
    openWebPath(`/projects/${pid}${q}`);
    return;
  }
  if (n.entity_type === 'task' && n.entity_id) {
    // Mở native WorkTaskDetail (giao việc) thay vì mở web /tasks.
    navigationRef.navigate('Main', {
      screen: 'MoreTab',
      params: {
        screen: 'WorkTaskDetail',
        params: { id: n.entity_id },
      } as never,
    });
    return;
  }
  if (n.entity_type === 'messenger_group' && n.entity_id) {
    const groupName = typeof m.group_name === 'string' ? m.group_name : undefined;
    navigationRef.navigate('Main', {
      screen: 'MoreTab',
      params: {
        screen: 'MessengerGroupChat',
        params: { groupId: n.entity_id, title: groupName, isDirect: m.is_direct === true },
      } as never,
    });
    return;
  }
  if (n.entity_type === 'crm_lead' || n.entity_type === 'crm_deal' || n.entity_type === 'lead') {
    const id = n.entity_id;
    if (id) {
      navigationRef.navigate('Main', {
        screen: 'CrmTab',
        params: { screen: 'LeadDetail', params: { id } },
      });
    }
    return;
  }
  if (n.entity_type === 'quotation' && n.entity_id) {
    openWebPath(`/crm/quotations/${n.entity_id}`);
    return;
  }
  if (n.entity_type === 'order' && n.entity_id) {
    openWebPath(`/crm/orders/${n.entity_id}`);
    return;
  }
  if (n.entity_type === 'invoice' && n.entity_id) {
    openWebPath(`/crm/invoices/${n.entity_id}`);
    return;
  }
  if (n.entity_type === 'crm_task') {
    openWebPath('/crm/tasks');
    return;
  }
  if (n.entity_type === 'crm_assignment' && n.entity_id) {
    openWebPath(`/crm/assignments?assignment=${encodeURIComponent(n.entity_id)}`);
    return;
  }
  if (n.entity_type === 'event') {
    openWebPath('/crm/events');
    return;
  }
  if (n.entity_type === 'release_note') {
    openWebPath('/updates');
    return;
  }
  // Không có route phù hợp → bỏ qua im lặng để tránh dialog gây nhiễu UX
  // (đặc biệt khi notification từ Android Bubbles không có deep-link app).
}

export function navigateToNotificationsTab(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen: 'NotificationsTab' });
}
