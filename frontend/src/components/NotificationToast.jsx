import FloatingNotificationCard from './FloatingNotificationCard';
import { publicFileUrl } from '../lib/publicFileUrl';

/** Toast không tự ẩn — chỉ đóng khi bấm X; xếp chồng khi có nhiều thông báo. */
const STICKY_TOAST_TYPES = new Set([
  'comment_added',
  'crm_assignment_comment',
  'workshop_new_deal',
]);

function isStickyWebToast(notification) {
  return STICKY_TOAST_TYPES.has(String(notification?.type || ''));
}

const TYPE_ICONS = {
  task_assigned: '📌', task_updated: '📝', task_completed: '✅',
  deadline_warning: '⏰', deadline_overdue: '🚨',
  production_task_deadline_warning: '⏰', production_task_deadline_overdue: '🚨',
  logistics_task_deadline_warning: '⏰', logistics_task_deadline_overdue: '🚨',
  project_pipeline_deadline_warning: '⏰', project_pipeline_deadline_overdue: '🚨',
  comment_added: '💬', stage_changed: '🎯',
  deal_won: '🏆', approval_request: '📋',
  checklist_completed: '📋', lead_assigned: '👤',
  order_confirmed: '📦', invoice_overdue: '💰',
  project_stage_changed: '🎉', project_assigned: '📁',
  workshop_new_deal: '🏭',
};

function resolveToastDisplay(notification) {
  const meta = notification?.metadata && typeof notification.metadata === 'object' ? notification.metadata : {};
  const actor = meta.actor || meta.sender || null;
  const senderName = String(meta.sender_name || actor?.full_name || '').trim();
  const title = String(notification?.title || '').trim();
  const rawMessage = String(notification?.message || '').trim();

  let userName = senderName || title || 'Thông báo';
  let contextLabel = null;
  let message = rawMessage;

  if (senderName && title && title !== senderName) {
    contextLabel = title;
  } else if (!senderName && title) {
    userName = title;
  } else if (!title && !senderName && notification?.entity_type === 'crm_lead') {
    contextLabel = 'CRM';
  } else if (!title && !senderName && notification?.entity_type === 'lead') {
    contextLabel = 'CRM';
  } else if (!title && !senderName && notification?.entity_type === 'project') {
    contextLabel = 'Dự án';
  }

  if (!message) {
    if (contextLabel && contextLabel !== userName) message = contextLabel;
    else if (title && title !== userName) message = title;
    else message = 'Bạn có thông báo mới';
  }

  const avatarRaw = actor?.avatar || meta.sender_avatar || meta.avatar || null;

  return { userName, contextLabel, message, avatarRaw };
}

/**
 * Toast thông báo hệ thống — xếp chồng dọc khi có nhiều thông báo.
 * @param {{ key: string, notification: object }[]} toasts
 */
export default function NotificationToast({ toasts, onDismiss, onNavigate }) {
  if (!toasts?.length) return null;

  return (
    <div
      className="fixed z-[9999] flex flex-col gap-2 pointer-events-none max-h-[min(85vh,calc(100vh-2rem))] overflow-y-auto overscroll-contain"
      style={{ top: 'max(1rem, env(safe-area-inset-top))', right: 'max(1rem, env(safe-area-inset-right))' }}
    >
      {toasts.map(({ key, notification }) => {
        if (!notification) return null;
        const { userName, contextLabel, message, avatarRaw } = resolveToastDisplay(notification);
        const avatarSrc = avatarRaw ? publicFileUrl(String(avatarRaw).trim()) : null;

        return (
          <FloatingNotificationCard
            key={key}
            className="pointer-events-auto shrink-0"
            userName={userName}
            contextLabel={contextLabel}
            message={message}
            avatarSrc={avatarSrc}
            avatarFallback={userName}
            iconEmoji={TYPE_ICONS[notification.type] || '🔔'}
            online={null}
            unreadCount={notification.metadata?.unread_count || 0}
            autoDismissMs={isStickyWebToast(notification) ? 0 : undefined}
            showClose
            onDismiss={() => onDismiss?.(key)}
            onClick={() => onNavigate?.(notification)}
          />
        );
      })}
    </div>
  );
}
