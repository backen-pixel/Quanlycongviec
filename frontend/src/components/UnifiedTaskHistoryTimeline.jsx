import { Clock, User, ArrowRight } from 'lucide-react';
import { formatDateTime } from '../lib/utils';
import { SOURCE_LABELS } from './UnifiedTaskRow';

const EVENT_LABELS = {
  created: 'Tạo mới',
  deleted: 'Đã xóa',
  status_changed: 'Đổi trạng thái',
  assignee_changed: 'Đổi người phụ trách',
  deadline_changed: 'Đổi deadline',
  completed: 'Hoàn thành',
  blocked: 'Bị chặn',
  comment_added: 'Bình luận',
  file_added: 'Đính kèm file',
};

const EVENT_COLORS = {
  created: 'bg-emerald-500',
  deleted: 'bg-red-500',
  completed: 'bg-emerald-500',
  status_changed: 'bg-blue-500',
  deadline_changed: 'bg-rose-500',
  comment_added: 'bg-violet-500',
  default: 'bg-gray-400',
};

function formatEventDescription(item) {
  if (item.description) return item.description;
  if (item.event_type === 'status_changed' && item.old_value && item.new_value) {
    return `${JSON.stringify(item.old_value)} → ${JSON.stringify(item.new_value)}`;
  }
  return EVENT_LABELS[item.event_type] || item.event_type;
}

export default function UnifiedTaskHistoryTimeline({ items = [], loading = false, compact = false }) {
  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!items.length) {
    return (
      <p className="text-sm text-gray-500 text-center py-6">Chưa có lịch sử ghi nhận.</p>
    );
  }

  return (
    <div className={`space-y-0 ${compact ? 'max-h-64 overflow-y-auto' : ''}`}>
      {items.map((item, idx) => {
        const dotColor = EVENT_COLORS[item.event_type] || EVENT_COLORS.default;
        const isLast = idx === items.length - 1;
        return (
          <div key={item.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${dotColor}`} />
              {!isLast && <div className="w-px flex-1 bg-gray-200 my-1 min-h-[24px]" />}
            </div>
            <div className={`pb-4 flex-1 min-w-0 ${isLast ? 'pb-0' : ''}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-0.5">
                <Clock className="h-3 w-3" />
                <span>{formatDateTime(item.created_at)}</span>
                <span className="text-gray-300">·</span>
                <span className="font-medium text-gray-700">
                  {EVENT_LABELS[item.event_type] || item.event_type}
                </span>
                {item.source && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span>{SOURCE_LABELS[item.source] || item.source}</span>
                  </>
                )}
              </div>
              <p className={`text-sm text-gray-800 ${compact ? 'line-clamp-2' : ''}`}>
                {formatEventDescription(item)}
              </p>
              {item.actor?.full_name && (
                <p className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {item.actor.full_name}
                </p>
              )}
              {item.field_name && item.old_value != null && item.new_value != null && !compact && (
                <p className="text-xs text-gray-400 mt-1 inline-flex items-center gap-1">
                  {item.field_name}
                  <ArrowRight className="h-3 w-3" />
                  thay đổi
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
