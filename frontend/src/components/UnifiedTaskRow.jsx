import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Calendar, User, MessageSquare, Bell } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isWorkProductionModuleAdmin, isLogisticsAdmin } from '../lib/adminRole';
import { formatDate, PRIORITY_LABELS, PRIORITY_COLORS } from '../lib/utils';
import { normalizeKanbanStatus } from '../lib/workTasksDashboardUtils';

const DONE_STATUSES = new Set(['done', 'completed', 'cancelled']);

const SOURCE_LABELS = {
  task: 'Công việc',
  crm_task: 'CRM Lead/Deal',
  crm_assignment: 'Giao việc CRM',
};

const KIND_COLORS = {
  'CRM-Deal': 'bg-emerald-100 text-emerald-800',
  'CRM-Lead': 'bg-teal-100 text-teal-800',
  SX: 'bg-orange-100 text-orange-800',
  VC: 'bg-violet-100 text-violet-800',
  'Giao việc': 'bg-blue-100 text-blue-800',
  'Cá nhân': 'bg-gray-100 text-gray-700',
  'Dự án': 'bg-sky-100 text-sky-800',
};

const STATUS_ACTIONS = [
  { key: 'pending', label: 'Chờ' },
  { key: 'in_progress', label: 'Đang làm' },
  { key: 'done', label: 'Hoàn thành' },
  { key: 'cancelled', label: 'Hủy' },
];

/** Khối người chịu trách nhiệm — khớp backend taskOwnerLane. */
function taskRemindLane(task) {
  const kind = String(task?.task_kind || '');
  if (kind === 'SX' || kind === 'Dự án') return 'production';
  if (kind === 'VC') return 'logistics';
  if (kind === 'CRM-Deal' || kind === 'CRM-Lead' || kind === 'Giao việc') return 'sales';
  if (task?.source === 'crm_task' || task?.source === 'crm_assignment') return 'sales';
  return 'production';
}

function remindButtonCopy(task) {
  const lane = taskRemindLane(task);
  if (lane === 'sales') {
    return {
      label: 'Nhắc Sales',
      title: 'Nhắc người phụ trách khối CRM/Sales thực hiện việc này (bản vẽ, render, bảng mô tả nộp tại Ghi chú & file)',
    };
  }
  if (lane === 'logistics') {
    return {
      label: 'Nhắc VC',
      title: 'Nhắc người phụ trách vận chuyển / lắp đặt thực hiện việc này',
    };
  }
  return {
    label: 'Nhắc xưởng',
    title: 'Nhắc người phụ trách sản xuất thực hiện việc này',
  };
}

function canSendTaskRemind(user) {
  return isWorkProductionModuleAdmin(user) || isLogisticsAdmin(user);
}

function getDeepLink(task) {
  if (!task) return null;
  if (task.source === 'crm_task' && task.lead_id) {
    return `/crm/leads/${task.lead_id}`;
  }
  if (task.source === 'task' && task.project_id) {
    if (task.task_kind === 'SX') return `/sx/projects/${task.project_id}`;
    if (task.task_kind === 'VC') return `/vc/projects/${task.project_id}`;
    return `/projects/${task.project_id}`;
  }
  if (task.source === 'crm_assignment') {
    return `/crm/assignments?focus=${task.source_id}`;
  }
  if (task.source === 'task') return `/tasks`;
  return null;
}

export default function UnifiedTaskRow({ task, onStatusChange, onOpenExtras, compact = false }) {
  const { user } = useAuth();
  const [reminding, setReminding] = useState(false);
  const [reminded, setReminded] = useState(false);
  if (!task) return null;
  const deepLink = getDeepLink(task);
  const priorityCls = PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-600';
  const kindCls = KIND_COLORS[task.task_kind] || 'bg-gray-100 text-gray-600';
  const kanbanStatus = normalizeKanbanStatus(task.status);
  const isOpenTask = !DONE_STATUSES.has(String(task.status || '').toLowerCase());
  const remindCopy = remindButtonCopy(task);
  const canShowRemind = !!(task.source && task.source_id
    && (canSendTaskRemind(user) || typeof onStatusChange === 'function'));
  const remindTitle = isOpenTask
    ? remindCopy.title
    : 'Việc đã kết thúc — không cần nhắc người phụ trách';

  const handleRemind = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOpenTask || reminding || reminded) return;
    setReminding(true);
    try {
      const res = await api.post(`/work-tasks/${task.source}/${task.source_id}/remind-complete`);
      const sent = res.data?.sent ?? 0;
      if (!sent) {
        alert('Không gửi được thông báo. Người nhận có thể đã tắt nhắc công việc.');
        return;
      }
      setReminded(true);
      window.setTimeout(() => setReminded(false), 4000);
    } catch (err) {
      alert(err?.response?.data?.error || 'Không gửi được nhắc hoàn thành');
    } finally {
      setReminding(false);
    }
  };

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-white hover:border-blue-200 transition-colors ${compact ? 'p-2' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${kindCls}`}>
            {task.task_kind || SOURCE_LABELS[task.source]}
          </span>
          <span className="text-[10px] text-gray-400 uppercase tracking-wide">
            {SOURCE_LABELS[task.source]}
          </span>
          {task.priority && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${priorityCls}`}>
              {PRIORITY_LABELS[task.priority] || task.priority}
            </span>
          )}
        </div>
        <p className={`font-medium text-gray-900 truncate ${compact ? 'text-sm' : ''}`}>{task.title}</p>
        {!compact && (
          <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
            {task.project_code && <span>DA {task.project_code}</span>}
            {task.lead_title && <span>Deal: {task.lead_title}</span>}
            {task.deadline && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(task.deadline)}
              </span>
            )}
            {task.assignee_id && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" />
                NV giao
              </span>
            )}
          </div>
        )}
        {(onStatusChange || canShowRemind) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {onStatusChange && STATUS_ACTIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => onStatusChange(task, a.key)}
                disabled={kanbanStatus === a.key}
                className={`text-[11px] px-2 py-0.5 rounded-md border font-medium transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default ${
                  kanbanStatus === a.key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700'
                }`}
              >
                {a.label}
              </button>
            ))}
            {canShowRemind && (
              <button
                type="button"
                onClick={handleRemind}
                disabled={!isOpenTask || reminding || reminded}
                title={remindTitle}
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border font-semibold ${
                  !isOpenTask
                    ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                    : reminded
                      ? 'bg-amber-50 text-amber-800 border-amber-200 cursor-pointer disabled:cursor-default'
                      : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 cursor-pointer disabled:cursor-default'
                }`}
              >
                <Bell className={`h-3 w-3 ${reminding ? 'animate-pulse' : ''}`} />
                {reminded ? 'Đã nhắc' : reminding ? 'Đang gửi…' : remindCopy.label}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        {onOpenExtras && (
          <button
            type="button"
            onClick={() => onOpenExtras(task)}
            className="inline-flex items-center gap-1 text-[11px] text-blue-700 font-semibold px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 cursor-pointer"
            title="Ghi chú & file đính kèm"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {!compact && 'Ghi chú & file'}
          </button>
        )}
        {deepLink && (
          <Link
            to={deepLink}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-50"
            title="Mở trong module gốc"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {!compact && 'Mở gốc'}
          </Link>
        )}
      </div>
    </div>
  );
}

export { getDeepLink, SOURCE_LABELS };
