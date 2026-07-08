import FloatingNotificationCard from './FloatingNotificationCard';
import { publicFileUrl } from '../lib/publicFileUrl';

const COMMENT_TOAST_TYPES = new Set(['comment_added', 'crm_assignment_comment']);

function isCommentWebToast(notification) {
  return COMMENT_TOAST_TYPES.has(String(notification?.type || ''));
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
};

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
        const actor = notification.metadata?.actor || notification.metadata?.sender || null;
        const avatarRaw = actor?.avatar || notification.metadata?.avatar || null;
        const avatarSrc = avatarRaw ? publicFileUrl(String(avatarRaw).trim()) : null;
        const userName = actor?.full_name || notification.title || 'Thông báo';
        const contextLabel = actor?.full_name && notification.title && notification.title !== actor.full_name
          ? notification.title
          : notification.entity_type === 'crm_lead' || notification.entity_type === 'lead'
            ? 'CRM'
            : notification.entity_type === 'project'
              ? 'Dự án'
              : null;

        return (
          <FloatingNotificationCard
            key={key}
            className="pointer-events-auto shrink-0"
            userName={userName}
            contextLabel={contextLabel}
            message={notification.message}
            avatarSrc={avatarSrc}
            avatarFallback={userName}
            iconEmoji={TYPE_ICONS[notification.type] || '🔔'}
            online={null}
            unreadCount={notification.metadata?.unread_count || 0}
            autoDismissMs={isCommentWebToast(notification) ? 0 : undefined}
            showClose
            onDismiss={() => onDismiss?.(key)}
            onClick={() => onNavigate?.(notification)}
          />
        );
      })}
    </div>
  );
}
