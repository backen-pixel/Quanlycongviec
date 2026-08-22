import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckSquare, Target, Factory, Truck, Layers, ExternalLink, Plus,
  ChevronDown, ChevronRight, FileText,
} from 'lucide-react';
import { getFileOpenAnchorProps } from '../lib/publicFileUrl';
import { FilePreviewOpenLink } from '../context/FilePreviewContext';
import { resolveFilePreviewMode } from '../lib/filePreview';
import {
  TASK_STATUS, TASK_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, formatDate,
  getInitials, avatarColor,
} from '../lib/utils';
import { taskBelongsToWorkshopModule } from '../lib/workshopTaskScope';

export const SECTION_ORDER = ['crm', 'sx', 'vc', 'workflow'];

export const SECTION_UI = {
  crm: {
    label: 'CRM (Bán hàng)',
    short: 'CRM',
    emoji: '💼',
    Icon: Target,
    header: 'from-emerald-50 to-teal-50',
    ring: 'ring-emerald-200',
    badge: 'bg-emerald-100 text-emerald-800',
    bar: 'bg-emerald-500',
    stageBorder: 'border-emerald-200',
  },
  sx: {
    label: 'Sản xuất',
    short: 'Sản xuất',
    emoji: '🏭',
    Icon: Factory,
    header: 'from-orange-50 to-amber-50',
    ring: 'ring-orange-200',
    badge: 'bg-orange-100 text-orange-800',
    bar: 'bg-orange-500',
    stageBorder: 'border-orange-200',
  },
  vc: {
    label: 'Lắp đặt / VC',
    short: 'Lắp đặt',
    emoji: '🔧',
    Icon: Truck,
    header: 'from-amber-50 to-yellow-50',
    ring: 'ring-amber-200',
    badge: 'bg-amber-100 text-amber-800',
    bar: 'bg-amber-500',
    stageBorder: 'border-amber-200',
  },
  workflow: {
    label: 'Quy trình dự án',
    short: 'Quy trình',
    emoji: '📋',
    Icon: Layers,
    header: 'from-blue-50 to-indigo-50',
    ring: 'ring-blue-200',
    badge: 'bg-blue-100 text-blue-800',
    bar: 'bg-blue-500',
    stageBorder: 'border-blue-200',
  },
};

const DONE = new Set(['done', 'completed']);

/** Nhãn giai đoạn xưởng (metadata.guessed_stage_slug / stage_slug). */
const WORKSHOP_STAGE_LABELS = {
  planning: 'Chuẩn bị / kế hoạch',
  production: 'Sản xuất',
  packaging: 'Đóng gói',
  'quality-check': 'Kiểm tra chất lượng',
  delivery: 'Giao hàng',
  delivery_pending: 'Chuẩn bị giao hàng',
  shipping: 'Vận chuyển',
  installation: 'Lắp đặt',
  installing: 'Lắp đặt',
  'customer-care': 'Chăm sóc KH',
};

function resolveWorkshopStage(task, local = null) {
  const meta = (local?.metadata || task?.metadata || {});
  const slug = String(
    task?.stage_slug
    || meta.stage_slug
    || meta.guessed_stage_slug
    || local?.stage?.slug
    || '',
  ).toLowerCase() || null;
  // Ưu tiên nhãn xưởng từ metadata — không lấy stage CRM/DA («Tư vấn»…) đè lên NV SX/VC
  const name = task?.stage_name
    || meta.stage_name
    || (slug && WORKSHOP_STAGE_LABELS[slug])
    || null;
  return { slug, name };
}

function enrichFromProject(task, projectTasksById) {
  if (!task?.id) {
    const { slug, name } = resolveWorkshopStage(task);
    return { ...task, stage_slug: slug || task?.stage_slug, stage_name: name || task?.stage_name };
  }
  const local = projectTasksById?.get?.(String(task.id)) || null;
  const { slug, name } = resolveWorkshopStage(task, local);
  if (!local) {
    return {
      ...task,
      stage_slug: slug || task.stage_slug || null,
      stage_name: name || task.stage_name || null,
    };
  }
  const assignee = task.assignee || local.assignee || null;
  const assigneeName = task.assignee_name
    || assignee?.full_name
    || local.assignee?.full_name
    || null;
  return {
    ...task,
    status: local.status ?? task.status,
    priority: local.priority ?? task.priority,
    deadline: task.deadline || local.due_date || null,
    assignee_id: task.assignee_id || local.assignee_id || local.assignee?.id || null,
    assignee,
    assignee_name: assigneeName,
    checklists: local.checklists || task.checklists || [],
    stage: local.stage || task.stage || null,
    stage_name: name,
    stage_color: task.stage_color || local.stage?.color || null,
    stage_slug: slug,
    metadata: local.metadata || task.metadata,
  };
}

function stageKeyOf(task) {
  return task.stage_slug
    || task.stage?.slug
    || task.metadata?.guessed_stage_slug
    || task.metadata?.stage_slug
    || task.stage_name
    || task.stage?.name
    || '_none';
}

function stageLabelOf(task) {
  const slug = String(
    task.stage_slug
    || task.stage?.slug
    || task.metadata?.guessed_stage_slug
    || task.metadata?.stage_slug
    || '',
  ).toLowerCase();
  if (task.stage_name) return task.stage_name;
  if (task.stage?.name) return task.stage.name;
  if (slug && WORKSHOP_STAGE_LABELS[slug]) return WORKSHOP_STAGE_LABELS[slug];
  return slug || 'Chưa phân giai đoạn';
}

/** Nhóm NV theo giai đoạn (giữ thứ tự xuất hiện). */
export function groupTasksByStage(tasks) {
  const order = [];
  const map = new Map();
  for (const t of tasks || []) {
    const key = stageKeyOf(t);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: stageLabelOf(t),
        color: t.stage_color || t.stage?.color || null,
        tasks: [],
      });
      order.push(key);
    }
    map.get(key).tasks.push(t);
  }
  return order.map((k) => map.get(k));
}

function DocumentRow({ doc }) {
  const href = doc.file_path || doc.file_url;
  const mode = resolveFilePreviewMode({
    mimeType: doc.mime_type,
    fileName: doc.file_name || doc.name,
    fileUrl: href,
  });
  if (mode && href) {
    return (
      <FilePreviewOpenLink
        fileUrl={href}
        fileName={doc.file_name || doc.name || 'Tài liệu'}
        mimeType={doc.mime_type || ''}
        className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/80 text-sm w-full text-left"
      >
        <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <span className="flex-1 truncate text-gray-800">{doc.name || doc.file_name || 'Tài liệu'}</span>
        {doc.doc_type && <span className="text-[10px] text-gray-400 shrink-0">{doc.doc_type}</span>}
      </FilePreviewOpenLink>
    );
  }
  const openProps = href ? getFileOpenAnchorProps(href, { fileName: doc.file_name || doc.name }) : null;
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/80 text-sm">
      <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
      <span className="flex-1 truncate text-gray-800">{doc.name || doc.file_name || 'Tài liệu'}</span>
      {doc.doc_type && <span className="text-[10px] text-gray-400 shrink-0">{doc.doc_type}</span>}
      {openProps && (
        <a {...openProps} className="text-[10px] text-blue-600 hover:underline shrink-0">Mở</a>
      )}
    </div>
  );
}

export function ModuleTaskRow({ task, leadId, projectId, onOpenProjectTask }) {
  const status = String(task.status || '');
  const deadline = task.deadline || task.due_date;
  const overdue = deadline && !DONE.has(status) && new Date(deadline) < new Date();
  const isProjectTask = task.source === 'task' || (!task.source && task.id && !String(task.id).includes('-'));
  const isCrm = task.source === 'crm_task' || task.source === 'crm';
  const assigneeName = task.assignee_name || task.assignee?.full_name || null;
  const checklists = task.checklists || [];
  const checkDone = checklists.filter((c) => c.is_completed).length;

  const open = () => {
    if (isCrm && leadId) return;
    if (isProjectTask && onOpenProjectTask) onOpenProjectTask(task.id);
  };

  const inner = (
    <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3">
      <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0 ${TASK_COLORS[status] || 'bg-gray-400'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs sm:text-sm font-medium text-gray-800 truncate">{task.title}</p>
      </div>
      {assigneeName ? (
        <div className="flex items-center gap-1.5 shrink-0 max-w-[120px]">
          <div
            className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
            style={{ backgroundColor: avatarColor(assigneeName) }}
          >
            {getInitials(assigneeName)}
          </div>
          <span className="text-[10px] text-gray-600 truncate hidden sm:inline">{assigneeName}</span>
        </div>
      ) : (
        <span className="text-[10px] text-gray-300 shrink-0 hidden sm:inline">Chưa gán</span>
      )}
      {checklists.length > 0 && (
        <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded shrink-0">
          {checkDone}/{checklists.length}
        </span>
      )}
      {task.priority && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full hidden md:inline ${PRIORITY_COLORS[task.priority] || ''}`}>
          {PRIORITY_LABELS[task.priority] || task.priority}
        </span>
      )}
      {deadline && (
        <span className={`text-[10px] hidden md:inline ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
          {formatDate(deadline)}
        </span>
      )}
      <span className="text-[10px] text-gray-400 shrink-0">{TASK_STATUS[status] || status || '—'}</span>
      {(isCrm || !isProjectTask) && (
        <ExternalLink className="h-3.5 w-3.5 text-gray-300 shrink-0" />
      )}
    </div>
  );

  if (isCrm && leadId) {
    return (
      <Link
        to={`/crm/leads/${leadId}?tab=tasks`}
        className="block bg-white rounded-lg border hover:shadow-sm hover:border-emerald-200 transition-shadow"
      >
        {inner}
      </Link>
    );
  }

  if (isProjectTask) {
    return (
      <button
        type="button"
        onClick={open}
        className="w-full text-left bg-white rounded-lg border hover:shadow-sm hover:border-gray-300 cursor-pointer transition-shadow"
      >
        {inner}
      </button>
    );
  }

  const fallbackHref = task.href || (projectId ? `/projects/${projectId}` : null);
  if (fallbackHref) {
    return (
      <Link to={fallbackHref} className="block bg-white rounded-lg border hover:shadow-sm">
        {inner}
      </Link>
    );
  }

  return <div className="bg-white rounded-lg border">{inner}</div>;
}

function StageBlock({ stage, ui, leadId, projectId, onOpenProjectTask }) {
  const [open, setOpen] = useState(true);
  const done = stage.tasks.filter((t) => DONE.has(String(t.status))).length;
  const total = stage.tasks.length;

  return (
    <div className={`rounded-lg border bg-white/80 overflow-hidden ${ui.stageBorder}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white cursor-pointer"
        style={stage.color ? { borderLeft: `3px solid ${stage.color}` } : undefined}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
        <span className="text-xs font-semibold text-gray-800 flex-1 truncate">{stage.label}</span>
        <span className="text-[10px] text-gray-500 tabular-nums">{done}/{total}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1 bg-gray-50/80">
          {stage.tasks.map((t) => (
            <ModuleTaskRow
              key={`${t.source || 'task'}-${t.id}`}
              task={t}
              leadId={leadId}
              projectId={projectId}
              onOpenProjectTask={onOpenProjectTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ModuleSection({
  sectionKey,
  section,
  defaultOpen,
  leadId,
  projectId,
  onOpenProjectTask,
  projectTasksById,
  showDocuments = true,
}) {
  const ui = SECTION_UI[sectionKey] || SECTION_UI.workflow;
  const Icon = ui.Icon;
  const tasks = useMemo(() => {
    const raw = (section?.tasks || []).map((t) => enrichFromProject(t, projectTasksById));
    // Khớp tab Công việc ProductionDetail — chỉ NV đúng khu xưởng
    if (sectionKey === 'sx') return raw.filter((t) => taskBelongsToWorkshopModule(t, 'sx'));
    if (sectionKey === 'vc') return raw.filter((t) => taskBelongsToWorkshopModule(t, 'vc'));
    return raw;
  }, [section?.tasks, projectTasksById, sectionKey]);
  const stages = useMemo(() => groupTasksByStage(tasks), [tasks]);
  const docs = section?.documents || [];
  const [open, setOpen] = useState(defaultOpen ?? (tasks.length > 0 || docs.length > 0));
  const [docsOpen, setDocsOpen] = useState(false);

  useEffect(() => {
    if (tasks.length > 0 || docs.length > 0) setOpen(true);
  }, [tasks.length, docs.length]);

  const done = tasks.filter((t) => DONE.has(String(t.status))).length;
  const total = tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  if (!total && !docs.length) return null;

  return (
    <div className={`rounded-xl border bg-gradient-to-r ${ui.header} overflow-hidden ring-1 ${ui.ring}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left cursor-pointer hover:brightness-[0.99]"
      >
        <span className="text-2xl">{section.emoji || ui.emoji}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Icon className="h-4 w-4 opacity-70" />
            {section.label || ui.label}
          </h3>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ui.badge}`}>
              {done}/{total} NV
            </span>
            {stages.length > 0 && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ui.badge}`}>
                {stages.length} giai đoạn
              </span>
            )}
            {docs.length > 0 && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ui.badge}`}>
                {docs.length} tài liệu
              </span>
            )}
            {total > 0 && (
              <div className="flex-1 max-w-[140px] h-1.5 bg-white/70 rounded-full overflow-hidden">
                <div className={`h-full ${ui.bar} rounded-full`} style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-white/60 bg-white/40 pt-3">
          {/* Module → Giai đoạn → NV */}
          {stages.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1 px-0.5">
                <CheckSquare className="h-3 w-3" /> Nhiệm vụ theo giai đoạn
              </p>
              {stages.map((st) => (
                <StageBlock
                  key={st.key}
                  stage={st}
                  ui={ui}
                  leadId={leadId}
                  projectId={projectId}
                  onOpenProjectTask={onOpenProjectTask}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 px-1">Chưa có nhiệm vụ module này</p>
          )}

          {showDocuments && docs.length > 0 && (
            <div className="rounded-lg border border-white/80 bg-white/70 overflow-hidden">
              <button
                type="button"
                onClick={() => setDocsOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-white"
              >
                {docsOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                <FileText className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-700 flex-1">Tài liệu ({docs.length})</span>
              </button>
              {docsOpen && (
                <div className="px-2 pb-2 space-y-0.5 border-t border-gray-100">
                  {docs.map((d) => (
                    <DocumentRow key={d.id || `${d.file_name}-${d.created_at}`} doc={d} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Bộ lọc + danh sách Module → Giai đoạn → Nhiệm vụ (dùng tab CRM/SX/VC).
 */
export default function ProjectModuleTasksTab({
  projectId,
  project,
  bundle,
  filterModule = 'all',
  onFilterChange,
  onOpenProjectTask,
  onCreateTask,
  showDocuments = true,
  showHeader = true,
  title = 'CRM / SX / VC',
  subtitle = 'Lọc theo module · mở module → giai đoạn → nhiệm vụ',
}) {
  const sections = bundle?.sections || {};
  const leadId = bundle?.primary_lead?.id || bundle?.lead_id || null;
  const totals = bundle?.totals || {};

  const projectTasksById = useMemo(() => {
    const map = new Map();
    for (const t of project?.tasks || []) {
      if (t?.id != null) map.set(String(t.id), t);
    }
    return map;
  }, [project?.tasks]);

  const filters = useMemo(() => {
    const countOf = (key) => {
      const sec = sections[key];
      let tasks = (sec?.tasks || []).map((t) => enrichFromProject(t, projectTasksById));
      if (key === 'sx') tasks = tasks.filter((t) => taskBelongsToWorkshopModule(t, 'sx'));
      if (key === 'vc') tasks = tasks.filter((t) => taskBelongsToWorkshopModule(t, 'vc'));
      const total = tasks.length || (key === 'sx' || key === 'vc' ? 0 : (sec?.stats?.tasks?.total || 0));
      const done = tasks.length
        ? tasks.filter((t) => DONE.has(String(t.status))).length
        : (key === 'sx' || key === 'vc' ? 0 : (sec?.stats?.tasks?.done || 0));
      const docs = sec?.stats?.documents?.total ?? sec?.documents?.length ?? 0;
      return { total, done, docs };
    };

    let allTotal = 0;
    let allDone = 0;
    const rows = [];
    for (const key of SECTION_ORDER) {
      const { total, done, docs } = countOf(key);
      allTotal += total;
      allDone += done;
      if (total > 0 || docs > 0 || key !== 'workflow') {
        rows.push({
          key,
          label: SECTION_UI[key]?.short || key,
          count: total,
          done,
          docs,
        });
      }
    }
    return [
      {
        key: 'all',
        label: 'Tất cả',
        count: allTotal || totals.tasks || 0,
        done: allDone,
        docs: 0,
      },
      ...rows,
    ];
  }, [sections, totals.tasks, projectTasksById]);

  const visibleKeys = filterModule === 'all'
    ? SECTION_ORDER
    : SECTION_ORDER.filter((k) => k === filterModule);

  const hasAny = SECTION_ORDER.some((k) => {
    const sec = sections[k];
    return (sec?.tasks || []).length > 0 || (sec?.documents || []).length > 0;
  });

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex flex-wrap justify-between items-center gap-3 bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200 rounded-xl p-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-600" />
              {title}
            </h3>
            <p className="text-xs text-gray-600">
              {subtitle}
              {totals.tasks != null && (
                <span className="ml-1 font-semibold text-blue-700">· {totals.tasks} NV</span>
              )}
            </p>
          </div>
          {onCreateTask && (
            <button
              type="button"
              onClick={onCreateTask}
              className="h-10 px-4 bg-blue-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-blue-700 cursor-pointer shadow-sm"
            >
              <Plus className="h-4 w-4" /> Thêm công việc
            </button>
          )}
        </div>
      )}

      {/* Bộ lọc module */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-1 bg-[var(--color-page-bg)]/90 backdrop-blur-sm">
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onFilterChange?.(f.key)}
              className={`h-9 px-3.5 rounded-full text-xs font-semibold cursor-pointer transition-colors border ${
                filterModule === f.key
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700'
              }`}
            >
              {f.label}
              {f.count > 0 && (
                <span
                  className="ml-1.5 tabular-nums"
                  title={`${f.done || 0} đã làm / ${f.count} nhiệm vụ`}
                >
                  <span className={filterModule === f.key ? 'text-emerald-200' : 'text-emerald-600'}>
                    {f.done || 0}
                  </span>
                  <span className={filterModule === f.key ? 'text-blue-100' : 'text-gray-400'}>
                    /{f.count}
                  </span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {!hasAny ? (
        <p className="text-center text-sm text-gray-400 py-10">
          Chưa có nhiệm vụ / tài liệu từ CRM / SX / VC
        </p>
      ) : (
        <div className="space-y-3">
          {visibleKeys.map((key) => (
            <ModuleSection
              key={key}
              sectionKey={key}
              section={sections[key]}
              defaultOpen={filterModule === 'all' ? key !== 'workflow' || (sections[key]?.tasks || []).length > 0 : true}
              leadId={leadId}
              projectId={projectId}
              onOpenProjectTask={onOpenProjectTask}
              projectTasksById={projectTasksById}
              showDocuments={showDocuments}
            />
          ))}
        </div>
      )}
    </div>
  );
}
