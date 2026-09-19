import { Link, useNavigate } from 'react-router-dom';
import { CheckSquare } from 'lucide-react';

const BASE = {
  sx: '/sx/project-tasks',
  vc: '/vc/project-tasks',
  crm: '/crm/project-tasks',
  management: '/management/project-tasks',
};

export function projectTasksPath(moduleKey, { id, code } = {}) {
  const params = new URLSearchParams();
  if (id) params.set('project', String(id));
  if (code) params.set('code', String(code));
  const q = params.toString();
  const base = BASE[moduleKey] || BASE.sx;
  return q ? `${base}?${q}` : base;
}

/**
 * Nút nổi trên thẻ Kanban: chữ «Nhiệm vụ» để biết là sang trang Quản lý nhiệm vụ.
 */
export default function KanbanGotoProjectTasksBtn({
  to,
  moduleKey = 'sx',
  projectId,
  code,
  asLink = false,
  className = '',
}) {
  const navigate = useNavigate();
  const href = to || projectTasksPath(moduleKey, { id: projectId, code });
  const cls = `inline-flex items-center gap-1 h-7 px-1.5 rounded-md border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 hover:border-violet-300 shadow-sm cursor-pointer shrink-0 ${className}`;
  const inner = (
    <>
      <CheckSquare className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
      <span className="text-[10px] font-bold leading-none">Nhiệm vụ</span>
    </>
  );
  if (asLink) {
    return (
      <Link
        to={href}
        data-sx-quick-btn="true"
        title="Mở trang Quản lý nhiệm vụ của dự án này"
        onClick={(e) => e.stopPropagation()}
        className={cls}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      data-sx-quick-btn="true"
      data-vc-quick-btn="true"
      title="Mở trang Quản lý nhiệm vụ của dự án này"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigate(href);
      }}
      className={cls}
    >
      {inner}
    </button>
  );
}
