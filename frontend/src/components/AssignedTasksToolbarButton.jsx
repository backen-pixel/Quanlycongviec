import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { useCrmAssignmentsUnread } from '../hooks/useCrmAssignmentsUnread';

/**
 * Nút «Giao việc» + badge nhấp nháy — đặt cạnh toolbar Kanban (CRM / SX pipeline).
 */
export default function AssignedTasksToolbarButton({
  to = '/crm/assignments',
  compact = false,
  variant = 'filled',
  className = '',
}) {
  const { unread, overdue, dueSoon, pending } = useCrmAssignmentsUnread();

  const parts = [];
  if (overdue > 0) parts.push(`${overdue} quá hạn`);
  if (dueSoon > 0) parts.push(`${dueSoon} sắp hạn`);
  if (pending > 0) parts.push(`${pending} mới`);
  const hint = parts.length ? parts.join(' · ') : 'Không có việc cần xử lý';

  const sizeCls = compact ? 'h-8 px-2.5 text-xs' : 'h-8 px-3 text-xs';
  const variantCls = variant === 'outlined'
    ? 'border border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-500/20';

  return (
    <Link
      to={to}
      title={hint}
      className={`relative inline-flex items-center gap-1.5 rounded-lg font-medium cursor-pointer transition-colors shrink-0 ${sizeCls} ${variantCls} ${className}`}
    >
      <ClipboardList className="h-3.5 w-3.5 shrink-0" />
      <span>Giao việc</span>
      {unread > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse-dot">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
