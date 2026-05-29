import { Link } from 'react-router-dom';
import { ExternalLink, Flag, Calendar, User } from 'lucide-react';
import { formatDate, PRIORITY_LABELS, PRIORITY_COLORS } from '../lib/utils';

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

function getDeepLink(task) {
  if (!task) return null;
  if (task.source === 'crm_task' && task.lead_id) {
    return `/lead/${task.lead_id}`;
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

export default function UnifiedTaskRow({ task, onStatusChange, compact = false }) {
  if (!task) return null;
  const deepLink = getDeepLink(task);
  const priorityCls = PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-600';
  const kindCls = KIND_COLORS[task.task_kind] || 'bg-gray-100 text-gray-600';

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
            {task.lead_title && <span>Lead: {task.lead_title}</span>}
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
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200">
            {task.status}
          </span>
          {onStatusChange && task.source === 'task' && task.status !== 'done' && (
            <button
              type="button"
              onClick={() => onStatusChange(task, 'done')}
              className="text-xs text-blue-600 hover:underline cursor-pointer"
            >
              Đánh dấu xong
            </button>
          )}
        </div>
      </div>
      {deepLink && (
        <Link
          to={deepLink}
          className="shrink-0 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-50"
          title="Mở trong module gốc"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {!compact && 'Mở gốc'}
        </Link>
      )}
    </div>
  );
}

export { getDeepLink, SOURCE_LABELS };
