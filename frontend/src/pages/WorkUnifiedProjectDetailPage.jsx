import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { getSocket, connectSocket } from '../lib/socket';
import { isAdminLike, isCompanyScopedAdmin, isWorkProductionModuleAdmin } from '../lib/adminRole';
import SearchInlineFilterChips, { SearchClearButton, AdvFilterButton, searchGroupClass } from '../components/SearchInlineFilterChips';
import WorkUnifiedFilterPanel, {
  WORK_UNIFIED_TIME_PRESETS,
  WORK_UNIFIED_REGION_NONE,
  getWorkUnifiedPresetDateRange,
  loadWorkUnifiedEmployees,
  filterWorkUnifiedStaff,
} from '../components/WorkUnifiedFilterFields';
import { WorkUnifiedOpenTabProvider, workUnifiedPath } from '../components/WorkUnifiedOpenTabMenu';
import ProjectOverviewPanel from '../components/ProjectOverviewPanel';
import { PipelineChip, withPipelineProgress, displayPipelineStageName } from '../components/ProjectDealSyncPanel';
import PipelineStepper from '../components/PipelineStepper';
import { resolveSxDisplayColumnId, TEMP_SX_FREE_DRAG } from '../lib/sxPipelineRevenue';
import { isProjectAlreadyInLogistics, VC_TEMP_LOCK_MSG } from '../lib/projectLogistics';
import {
  crmDealRevertFromPostWonBlockedMessage,
  crmDealStageMoveBlockedMessage,
} from '../lib/crmDealStageGate';
import { resolveDealWonAnchorOrderIndex } from '../lib/crmPipelineTabs';
import UnifiedTaskRow from '../components/UnifiedTaskRow';
import UnifiedTaskHistoryTimeline from '../components/UnifiedTaskHistoryTimeline';
import WorkTaskExtrasPanel from '../components/WorkTaskExtrasPanel';
import ProjectSharedWorkspaceTab from '../components/ProjectSharedWorkspaceTab';
import { LeadMembersTab } from '../components/LeadChatTabs';
import { CrmLeadCommentsPanel, ProjectCommentsPanel } from '../components/CommentsPanels';
import { useMessengerDock } from '../context/MessengerDockContext';
import { useAuth } from '../lib/auth';
import { FilePreviewOpenLink, useFilePreview } from '../context/FilePreviewContext';
import { getFileDownloadAnchorProps, getFileOpenAnchorProps, publicFileUrl } from '../lib/publicFileUrl';
import { resolveFilePreviewMode } from '../lib/filePreview';
import { formatVND, formatDate, getFileEmoji } from '../lib/utils';
import ProjectDocumentsTab from '../components/ProjectDocumentsTab';
import DriveAttachments from '../components/drive/DriveAttachments';
import CrmTaskDocumentsPanel from '../components/CrmTaskDocumentsPanel';
import UploadFileLightbox, {
  collectUploadLightboxItems,
  findUploadLightboxIndex,
} from '../components/UploadFileLightbox';
import {
  ChevronRight, ChevronDown, AlertTriangle, Plus, ExternalLink, Download, FileText as FileIcon, ArrowLeft,
  CheckCircle2, X as XIcon, MessageCircle, Loader2, Package, Truck, RefreshCw, Search, FolderOpen, Image as ImageIcon,
  Bell, Eye,
} from 'lucide-react';

const SECONDARY_TABS = [
  { key: 'tasks', label: 'Công việc' },
  { key: 'shared', label: 'Không gian chung' },
  { key: 'progress', label: 'Tiến độ' },
  { key: 'documents', label: 'Tài liệu' },
  { key: 'finance', label: 'Chi phí' },
  { key: 'acceptance', label: 'Nghiệm thu' },
  { key: 'chat', label: 'Bình luận' },
  { key: 'history', label: 'Lịch sử' },
];
/** Chỉ hiện khi dự án có deal CRM gắn kèm (cần leadId để tải thành viên). */
const TEAM_TAB = { key: 'team', label: 'Thành viên' };

export function Section({ title, action, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function EmptyNote({ children }) {
  return <p className="text-sm text-gray-400 text-center py-8">{children}</p>;
}

const DONE_TASK_STATUSES = ['done', 'completed'];

const WORK_UNIFIED_LITE_MEM = new Map();
function readWorkUnifiedLiteCache(projectId) {
  if (!projectId) return null;
  const key = String(projectId);
  const mem = WORK_UNIFIED_LITE_MEM.get(key);
  if (mem?.project?.id && String(mem.project.id) === key) return mem;
  try {
    const raw = sessionStorage.getItem(`wu-lite:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.project?.id && String(parsed.project.id) === key) {
      WORK_UNIFIED_LITE_MEM.set(key, parsed);
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}
function writeWorkUnifiedLiteCache(projectId, data) {
  if (!projectId || !data?.project) return;
  const key = String(projectId);
  WORK_UNIFIED_LITE_MEM.set(key, data);
  try {
    sessionStorage.setItem(`wu-lite:${key}`, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

/** Nhóm công việc theo khối — khớp task.task_kind trả về từ /work-tasks/by-project. */
const TASK_GROUPS = [
  {
    key: 'deal',
    label: 'Deal',
    icon: FileIcon,
    match: (k) => k === 'CRM-Deal' || k === 'CRM-Lead' || k === 'Giao việc',
    accent: 'text-emerald-700',
    header: 'bg-emerald-50 hover:bg-emerald-100',
  },
  {
    key: 'sx',
    label: 'Sản xuất',
    icon: Package,
    match: (k) => k === 'SX',
    accent: 'text-orange-700',
    header: 'bg-orange-50 hover:bg-orange-100',
  },
  {
    key: 'vc',
    label: 'VC-LĐ',
    icon: Truck,
    match: (k) => k === 'VC',
    accent: 'text-violet-700',
    header: 'bg-violet-50 hover:bg-violet-100',
  },
];
const OTHER_TASK_GROUP = {
  key: 'other',
  label: 'Khác',
  icon: FileIcon,
  accent: 'text-gray-700',
  header: 'bg-gray-50 hover:bg-gray-100',
};

const GROUP_REMIND = {
  deal: { label: 'Nhắc Sales', title: 'Gửi thông báo hoàn thành phần Sales (bản vẽ, render, bảng mô tả)' },
  sx: { label: 'Nhắc xưởng', title: 'Gửi thông báo hoàn thành phần sản xuất về xưởng' },
  vc: { label: 'Nhắc VC', title: 'Gửi thông báo hoàn thành phần vận chuyển / lắp đặt' },
};

export function TasksTab({ projectId, initialGroup = '' }) {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [savingId, setSavingId] = useState(null);
  const [extrasTask, setExtrasTask] = useState(null);
  const [remindingGroup, setRemindingGroup] = useState('');
  const [remindedGroup, setRemindedGroup] = useState('');
  const [openGroups, setOpenGroups] = useState(() => new Set(initialGroup ? [initialGroup] : []));
  const canRemindGroup = isWorkProductionModuleAdmin(user);
  const toggleGroup = (key) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  useEffect(() => {
    if (initialGroup) setOpenGroups((prev) => {
      if (prev.has(initialGroup)) return prev;
      const next = new Set(prev);
      next.add(initialGroup);
      return next;
    });
  }, [initialGroup]);

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    return api.get(`/work-tasks/by-project/${projectId}`)
      .then((res) => setState({ loading: false, error: '', data: res.data }))
      .catch((e) => setState({ loading: false, error: e?.response?.data?.error || 'Không tải được công việc', data: null }));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (task, actionKey) => {
    setSavingId(task.unified_id);
    try {
      await api.patch(`/work-tasks/${task.source}/${task.source_id}`, {
        status: actionKey,
        ...(task.lead_id ? { lead_id: task.lead_id } : {}),
      });
      await load();
    } catch (e) {
      alert(e?.response?.data?.error || 'Không cập nhật được trạng thái công việc');
    } finally {
      setSavingId(null);
    }
  };

  const handleGroupRemind = async (e, groupKey) => {
    e.preventDefault();
    e.stopPropagation();
    if (remindingGroup || remindedGroup === groupKey) return;
    setRemindingGroup(groupKey);
    try {
      const res = await api.post(`/work-tasks/by-project/${projectId}/remind-complete`, { group: groupKey });
      const sent = res.data?.sent ?? 0;
      if (!sent) {
        alert('Không gửi được thông báo. Người nhận có thể đã tắt nhắc công việc.');
        return;
      }
      setRemindedGroup(groupKey);
      window.setTimeout(() => setRemindedGroup((cur) => (cur === groupKey ? '' : cur)), 4000);
    } catch (err) {
      alert(err?.response?.data?.error || 'Không gửi được nhắc hoàn thành');
    } finally {
      setRemindingGroup('');
    }
  };

  if (state.loading) return <Section title="Công việc"><EmptyNote>Đang tải...</EmptyNote></Section>;
  if (state.error) return <Section title="Công việc"><EmptyNote>{state.error}</EmptyNote></Section>;
  const tasks = state.data?.tasks || [];
  const progress = state.data?.progress || { completed: 0, total: 0 };

  const buckets = TASK_GROUPS.map((g) => ({ ...g, tasks: [] }));
  const other = { ...OTHER_TASK_GROUP, tasks: [] };
  for (const t of tasks) {
    const bucket = buckets.find((b) => b.match(t.task_kind));
    (bucket || other).tasks.push(t);
  }
  const groups = (other.tasks.length ? [...buckets, other] : buckets).filter((g) => g.tasks.length > 0);

  const renderTaskRow = (t) => {
    const isDone = DONE_TASK_STATUSES.includes(String(t.status));
    return (
      <div key={t.unified_id} className={`relative rounded-xl ${isDone ? 'ring-1 ring-emerald-200' : ''}`}>
        {isDone && (
          <span
            title="Đã hoàn thành"
            className="absolute -left-1.5 -top-1.5 z-10 h-5 w-5 rounded-full bg-white flex items-center justify-center"
          >
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </span>
        )}
        <div className={savingId === t.unified_id ? 'opacity-50 pointer-events-none' : ''}>
          <UnifiedTaskRow
            task={t}
            compact
            onStatusChange={handleStatusChange}
            onOpenExtras={setExtrasTask}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <Section
        title="Công việc"
        action={<span className="text-[11px] text-gray-500">{progress.completed}/{progress.total} hoàn thành</span>}
      >
        <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
          Bản vẽ, render, bảng mô tả nộp tại <span className="font-semibold text-slate-700">Ghi chú &amp; file</span> của từng việc.
          Không đẩy vào Bình luận — file ở đó không giữ tiến trình Sales và dễ bị xóa.
        </p>
        {tasks.length === 0 ? (
          <EmptyNote>Chưa có công việc nào gắn với dự án này.</EmptyNote>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => {
              const isOpen = openGroups.has(g.key);
              const doneCount = g.tasks.filter((t) => DONE_TASK_STATUSES.includes(String(t.status))).length;
              const openCount = g.tasks.length - doneCount;
              const Icon = g.icon;
              const remindCfg = GROUP_REMIND[g.key];
              const showGroupRemind = canRemindGroup && remindCfg && openCount > 0;
              return (
                <div key={g.key} className="rounded-xl border border-gray-100 overflow-hidden">
                  <div className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 ${g.header}`}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.key)}
                      className={`flex-1 min-w-0 flex items-center gap-2 text-sm font-bold text-left cursor-pointer ${g.accent}`}
                  >
                      <Icon className="h-4 w-4" />
                      {g.label}
                      <span className="text-[11px] font-medium text-gray-500">({g.tasks.length})</span>
                    </button>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-gray-500 whitespace-nowrap">{doneCount}/{g.tasks.length} hoàn thành</span>
                      {showGroupRemind && (
                        <button
                          type="button"
                          onClick={(e) => handleGroupRemind(e, g.key)}
                          disabled={!!remindingGroup || remindedGroup === g.key}
                          title={remindCfg.title}
                          className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border font-medium cursor-pointer disabled:cursor-default ${
                            remindedGroup === g.key
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'
                          }`}
                        >
                          <Bell className={`h-3 w-3 ${remindingGroup === g.key ? 'animate-pulse' : ''}`} />
                          {remindedGroup === g.key ? 'Đã nhắc' : remindingGroup === g.key ? 'Đang gửi…' : remindCfg.label}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.key)}
                        className="p-0.5 cursor-pointer"
                        aria-label={isOpen ? 'Thu gọn' : 'Mở'}
                      >
                      <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                    </span>
                  </div>
                  {isOpen && (
                    <div className="p-2 space-y-2 bg-white border-t border-gray-100">
                      {g.tasks
                        .slice()
                        .sort((a, b) => {
                          const ad = DONE_TASK_STATUSES.includes(String(a.status)) ? 1 : 0;
                          const bd = DONE_TASK_STATUSES.includes(String(b.status)) ? 1 : 0;
                          return ad - bd;
                        })
                        .map(renderTaskRow)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {extrasTask && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40"
          onClick={() => setExtrasTask(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
              <h2 className="text-sm font-bold text-gray-900 truncate">{extrasTask.title}</h2>
              <button
                type="button"
                onClick={() => setExtrasTask(null)}
                className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer shrink-0"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <WorkTaskExtrasPanel task={extrasTask} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Dùng chung cho tab Tiến độ + Lịch sử — work-tasks/history + hoạt động CRM (không gọi GET /projects/:id nặng). */
function useProjectOperationHistory(projectId, leadId, enabled = true) {
  const [taskHistory, setTaskHistory] = useState([]);
  const [taskLoading, setTaskLoading] = useState(!!enabled);
  const [crmActs, setCrmActs] = useState([]);
  const [crmLoading, setCrmLoading] = useState(!!(enabled && leadId));

  useEffect(() => {
    if (!enabled || !projectId) {
      if (!enabled) setTaskLoading(false);
      return undefined;
    }
    let cancelled = false;
    setTaskLoading(true);
    api.get('/work-tasks/history', { params: { project_id: projectId, page_size: 50 } })
      .then((r) => { if (!cancelled) setTaskHistory(r.data?.history || []); })
      .catch(() => { if (!cancelled) setTaskHistory([]); })
      .finally(() => { if (!cancelled) setTaskLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, enabled]);

  useEffect(() => {
    if (!enabled || !leadId) {
      setCrmActs([]);
      setCrmLoading(false);
      return undefined;
    }
    let cancelled = false;
    setCrmLoading(true);
    api.get(`/crm/leads/${leadId}/activities`)
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : (r.data?.activities || []);
        if (!cancelled) setCrmActs(list);
      })
      .catch(() => { if (!cancelled) setCrmActs([]); })
      .finally(() => { if (!cancelled) setCrmLoading(false); });
    return () => { cancelled = true; };
  }, [leadId, enabled]);

  const items = useMemo(() => {
    const mapped = [];
    for (const a of crmActs) {
      mapped.push({
        id: `crm-${a.id}`,
        event_type: a.type || 'comment_added',
        description: crmActivityText(a),
        created_at: a.created_at,
        actor: a.user || a.creator || a.author || null,
        source: 'crm_task',
      });
    }
    const byId = new Map();
    for (const it of [...(taskHistory || []), ...mapped]) {
      if (!it?.id) continue;
      byId.set(String(it.id), it);
    }
    return [...byId.values()].sort((x, y) => new Date(y.created_at || 0) - new Date(x.created_at || 0));
  }, [taskHistory, crmActs]);

  return { loading: taskLoading || crmLoading, error: '', items };
}

function crmActivityText(a) {
  if (!a) return 'Thao tác CRM';
  const raw = a.title || a.description || a.content || a.notes || '';
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parsed.title || parsed.description || parsed.outcome || raw;
    } catch {
      return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
    }
  }
  return a.type || 'Thao tác CRM';
}

function ProjectOperationHistory({ loading, error, items }) {
  if (error) return <EmptyNote>{error}</EmptyNote>;
  return (
    <div className="max-h-[420px] overflow-y-auto pr-1">
      <UnifiedTaskHistoryTimeline items={items} loading={loading} />
        </div>
  );
}

function pipelineCurrentId(stages, preferredId, fallbackStage) {
  const list = Array.isArray(stages) ? stages : [];
  const raw = preferredId != null && preferredId !== '' ? String(preferredId) : '';
  if (raw && list.some((s) => String(s.id) === raw)) return raw;
  const fbId = fallbackStage?.id != null ? String(fallbackStage.id) : '';
  if (fbId && list.some((s) => String(s.id) === fbId)) return fbId;
  const slug = fallbackStage?.bucket_slug || null;
  if (slug) {
    const hit = list.find((s) => String(s.bucket_slug || '') === String(slug));
    if (hit?.id) return String(hit.id);
  }
  return raw || fbId || null;
}

function ModuleStepperBlock({ label, href, loading, empty, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">{label}</h3>
        {href ? (
          <Link to={href} className="text-xs font-medium text-blue-700 hover:underline shrink-0">
            Mở chi tiết →
          </Link>
        ) : null}
                      </div>
      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
          Đang tải pipeline…
                    </div>
      ) : empty ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
          {empty}
                </div>
      ) : children}
    </div>
  );
}

function asStageList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.stages)) return data.stages;
  return [];
}

function labeledWorkshopStages(stages) {
  return (Array.isArray(stages) ? stages : []).map((s) => {
    const name = displayPipelineStageName(s);
    if (!s || name === s.name) return s;
    return { ...s, name };
  });
}

function notifyProjectBadges(projectId) {
  if (!projectId || typeof window === 'undefined') return;
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('crm-project-badges-refresh', {
      detail: { projectId: String(projectId) },
    }));
  }, 200);
}

function ProgressTab({ projectId, leadId, project, lead, pipelines, onReload, syncKey }) {
  const [pipesReady, setPipesReady] = useState(false);
  const { loading, error, items } = useProjectOperationHistory(projectId, leadId, pipesReady);
  const [crmStages, setCrmStages] = useState([]);
  const [sxStages, setSxStages] = useState([]);
  const [vcStages, setVcStages] = useState([]);
  const [visitedStageIds, setVisitedStageIds] = useState(() => new Set());
  const [pipesLoading, setPipesLoading] = useState(true);
  const [crmLead, setCrmLead] = useState(null);
  const [sxProject, setSxProject] = useState(null);
  const [vcProject, setVcProject] = useState(null);
  const [liveCrmStageId, setLiveCrmStageId] = useState(null);
  const [liveSxColId, setLiveSxColId] = useState(null);
  const [liveVcColId, setLiveVcColId] = useState(null);
  const [moving, setMoving] = useState(false);

  const loadPipes = useCallback(async ({ silent } = {}) => {
    if (!silent) setPipesLoading(true);
    const liveLead = lead
      ? {
        ...lead,
        sx_pipeline_stage: lead.sx_pipeline_stage || pipelines?.sx || null,
        vc_pipeline_stage: lead.vc_pipeline_stage || pipelines?.vc || null,
        project_id: lead.project_id || projectId,
      }
      : null;
    setCrmLead(liveLead);
    setSxProject(project || null);
    setVcProject(project || null);
    if (lead?.stage_id) setLiveCrmStageId(String(lead.stage_id));
    if (project?.sx_kanban_column_id) setLiveSxColId(String(project.sx_kanban_column_id));
    else if (project?.sx_intake) {
      /* cột intake — id sẽ gán sau khi có danh sách stage */
    }
    if (project?.vc_kanban_column_id) setLiveVcColId(String(project.vc_kanban_column_id));

    const leadType = lead?.type === 'lead' ? 'lead' : 'deal';
    const crmParams = lead?.pipeline_id
      ? { type: leadType, pipeline_id: lead.pipeline_id }
      : { type: leadType, ...(lead?.company_id ? { company_id: lead.company_id } : {}) };
    if (lead?.stage_id) crmParams.ensure_stage_id = lead.stage_id;

    const sxCompanyId = project?.company_id || project?.company?.id || null;
    const vcCompanyId = project?.logistics_company_id
      || project?.logistics_company?.id
      || sxCompanyId;
    const wtId = project?.workshop_type_id || project?.workshop_type?.id || null;
    const sxParams = { company_id: sxCompanyId };
    if (wtId) sxParams.workshop_type_id = wtId;

    const histBody = { lead_ids: leadId ? [leadId] : [] };
    const pipeId = liveLead?.pipeline_id || lead?.pipeline_id;
    const coId = liveLead?.company_id || lead?.company_id;
    if (pipeId) histBody.pipeline_id = pipeId;
    else if (coId) histBody.company_id = coId;

    const [crmRes, sxRes, vcRes, histRes] = await Promise.all([
      leadId
        ? api.get('/crm/pipeline-stages', { params: crmParams }).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
      sxCompanyId
        ? api.get('/production/pipeline-stages', { params: sxParams }).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
      vcCompanyId
        ? api.get('/logistics/pipeline-stages', { params: { company_id: vcCompanyId } }).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
      leadId
        ? api.post('/crm/leads/stage-history-summary', histBody).catch(() => ({ data: null }))
        : Promise.resolve({ data: null }),
    ]);

    const nextCrm = asStageList(crmRes.data);
    const nextSx = labeledWorkshopStages(asStageList(sxRes.data));
    const nextVc = labeledWorkshopStages(asStageList(vcRes.data));

    setCrmStages(nextCrm);
    setSxStages(nextSx);
    setVcStages(nextVc);
    if (!project?.sx_kanban_column_id && project?.sx_intake && nextSx.length) {
      const intake = nextSx.find((s) => s.bucket_slug === 'won_pending');
      if (intake?.id) setLiveSxColId(String(intake.id));
    }

    if (leadId) {
      const rows = histRes?.data?.by_lead?.[leadId]
        || histRes?.data?.by_lead?.[String(leadId)]
        || [];
      const visited = new Set();
      for (const h of rows) {
        if (h?.to_stage_id) visited.add(String(h.to_stage_id));
      }
      const sid = liveLead?.stage_id || lead?.stage_id;
      if (sid) visited.add(String(sid));
      setVisitedStageIds(visited);
    } else {
      setVisitedStageIds(new Set());
    }
    setPipesLoading(false);
    setPipesReady(true);
  }, [
    leadId,
    projectId,
    lead?.pipeline_id,
    lead?.company_id,
    lead?.stage_id,
    lead?.type,
    project?.company_id,
    project?.sx_kanban_column_id,
    project?.vc_kanban_column_id,
    project?.sx_intake,
    project?.logistics_company_id,
    project?.workshop_type_id,
    pipelines?.sx?.id,
    pipelines?.vc?.id,
    pipelines?.crm?.id,
  ]);

  useEffect(() => { loadPipes(); }, [loadPipes, syncKey]);

  useEffect(() => {
    if (lead?.stage_id) setLiveCrmStageId(String(lead.stage_id));
  }, [lead?.stage_id]);
  useEffect(() => {
    if (project?.sx_kanban_column_id) setLiveSxColId(String(project.sx_kanban_column_id));
  }, [project?.sx_kanban_column_id]);
  useEffect(() => {
    if (project?.vc_kanban_column_id) setLiveVcColId(String(project.vc_kanban_column_id));
  }, [project?.vc_kanban_column_id]);

  useEffect(() => {
    const onBadge = (e) => {
      const pid = e?.detail?.projectId;
      if (pid && projectId && String(pid) !== String(projectId)) return;
      loadPipes({ silent: true });
    };
    window.addEventListener('crm-project-badges-refresh', onBadge);
    return () => window.removeEventListener('crm-project-badges-refresh', onBadge);
  }, [loadPipes, projectId]);

  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const onProject = (payload) => {
      const pid = payload?.project_id || payload?.id || payload?.project?.id;
      if (pid && projectId && String(pid) !== String(projectId)) return;
      if (payload?.sx_kanban_column_id) setLiveSxColId(String(payload.sx_kanban_column_id));
      if (payload?.vc_kanban_column_id) setLiveVcColId(String(payload.vc_kanban_column_id));
      loadPipes({ silent: true });
    };
    const onCrmLead = (payload) => {
      const lid = payload?.lead_id;
      if (lid && leadId && String(lid) === String(leadId)) {
        if (payload?.stage_id) setLiveCrmStageId(String(payload.stage_id));
        loadPipes({ silent: true });
        return;
      }
      const pid = payload?.project_id;
      if (pid && projectId && String(pid) === String(projectId)) loadPipes({ silent: true });
    };
    const join = () => {
      if (projectId) socket.emit('join:project', projectId);
      if (leadId) socket.emit('join:lead', leadId);
    };
    join();
    socket.on('connect', join);
    socket.on('project:updated', onProject);
    socket.on('project:stage_changed', onProject);
    socket.on('crm:dashboard_changed', onCrmLead);
    socket.on('crm:badge_updated', onCrmLead);
    socket.on('crm:task_changed', onProject);
    socket.on('lead:activity', onCrmLead);
    return () => {
      socket.off('connect', join);
      socket.off('project:updated', onProject);
      socket.off('project:stage_changed', onProject);
      socket.off('crm:dashboard_changed', onCrmLead);
      socket.off('crm:badge_updated', onCrmLead);
      socket.off('crm:task_changed', onProject);
      socket.off('lead:activity', onCrmLead);
    };
  }, [loadPipes, projectId, leadId]);

  const afterMove = () => {
    notifyProjectBadges(projectId);
    onReload?.();
    window.setTimeout(() => loadPipes({ silent: true }), 160);
  };

  const moveCrm = async (stageId) => {
    if (!leadId || moving) return;
    if (String(liveCrmStageId || crmLead?.stage_id || lead?.stage_id || '') === String(stageId)) return;
    const targetStage = crmStages.find((s) => String(s.id) === String(stageId));
    const live = {
      ...(lead || {}),
      ...(crmLead || {}),
      stage_id: liveCrmStageId || crmLead?.stage_id || lead?.stage_id,
      project_id: crmLead?.project_id || lead?.project_id || projectId,
      sx_pipeline_stage: crmLead?.sx_pipeline_stage || pipelines?.sx || lead?.sx_pipeline_stage || null,
      vc_pipeline_stage: crmLead?.vc_pipeline_stage || pipelines?.vc || lead?.vc_pipeline_stage || null,
    };
    if (live?.type === 'deal' && targetStage) {
      const currentStage = crmStages.find((s) => String(s.id) === String(live.stage_id)) || live.stage;
      const revertBlocked = crmDealRevertFromPostWonBlockedMessage(live, currentStage, targetStage);
      if (revertBlocked) {
        alert(revertBlocked);
        return;
      }
      const validStageIds = new Set(crmStages.map((s) => String(s.id)));
      const sid = live?.stage_id ? String(live.stage_id) : '';
      const isOrphanSource =
        !sid
        || !validStageIds.has(sid)
        || (!!live?.project_id && !live?.sx_pipeline_stage?.id && !live?.vc_pipeline_stage?.id);
      if (!isOrphanSource) {
        const blocked = crmDealStageMoveBlockedMessage(live, targetStage, 'deal', {
          wonAnchorOrder: resolveDealWonAnchorOrderIndex(crmStages),
        });
        if (blocked) {
          alert(blocked);
          return;
        }
      }
    }
    if (targetStage?.is_lost) {
      alert('Đánh dấu Thua cần nhập lý do — mở chi tiết CRM để chuyển.');
      return;
    }
    if (targetStage?.is_won && live?.type !== 'deal') {
      alert('Chuyển sang Thắng cần convert Lead → Deal — mở chi tiết CRM.');
      return;
    }
    if (live?.type === 'deal' && targetStage?.is_won && !live?.project_id) {
      alert('Chuyển sang Thắng sẽ tạo dự án SX — mở chi tiết CRM để chọn xưởng.');
      return;
    }
    if (targetStage && !targetStage.is_won && !targetStage.is_lost) {
      try {
        const { data: chk } = await api.get(`/crm/leads/${leadId}/stage-advance-check`, {
          params: { target_stage_id: stageId },
        });
        if (chk && chk.ok === false && chk.code === 'CRM_BLOCKING_TASKS_INCOMPLETE') {
          const names = (chk.remaining_tasks || []).map((t) => t.title || t.name).filter(Boolean);
          alert(`Còn nhiệm vụ chặn chuyển giai đoạn${chk.current_stage_name ? ` tại «${chk.current_stage_name}»` : ''}${names.length ? `:\n• ${names.slice(0, 8).join('\n• ')}` : ''}`);
          return;
        }
      } catch { /* pre-check lỗi → backend vẫn chặn */ }
    }
    setMoving(true);
    setLiveCrmStageId(String(stageId));
    try {
      const { data } = await api.patch(`/crm/leads/${leadId}/stage`, { stage_id: stageId });
      const nextId = data?.stage_id || stageId;
      setLiveCrmStageId(String(nextId));
      setVisitedStageIds((prev) => {
        const next = new Set(prev);
        next.add(String(nextId));
        return next;
      });
      if (data?.id) setCrmLead((prev) => (prev ? { ...prev, ...data, stage_id: nextId } : data));
      afterMove();
    } catch (e) {
      const body = e?.response?.data || {};
      if (body.code === 'requires_deadline') {
        alert(body.error || 'Cột CRM này bắt buộc deadline — mở chi tiết CRM để nhập hạn.');
      } else if (body.code === 'CRM_BLOCKING_TASKS_INCOMPLETE') {
        const names = (body.remaining_tasks || []).map((t) => t.title || t.name).filter(Boolean);
        alert(`Còn nhiệm vụ chặn chuyển giai đoạn${body.current_stage_name ? ` tại «${body.current_stage_name}»` : ''}${names.length ? `:\n• ${names.slice(0, 8).join('\n• ')}` : ''}`);
      } else {
        alert(body.error || e.message || 'Không chuyển được giai đoạn CRM');
      }
      loadPipes({ silent: true });
    } finally {
      setMoving(false);
    }
  };

  const moveSx = async (stageId) => {
    if (!projectId || moving) return;
    const sxStage = sxStages.find((s) => String(s.id) === String(stageId));
    const proj = sxProject || project;
    if (!TEMP_SX_FREE_DRAG && sxStage?.is_handover_to_logistics === true && !isProjectAlreadyInLogistics(proj)) {
      setMoving(true);
      try {
        setLiveSxColId(String(sxStage?.id || stageId));
        await api.post(`/vc-handover/projects/${projectId}/request`, { sx_stage_id: String(sxStage?.id || stageId) });
        alert('Đã gửi thông báo cho Sale CRM — chọn công ty VC/LĐ và ngày lấy/lắp trong bình luận deal. VC xác nhận xong mới tạo lịch.');
        afterMove();
      } catch (e) {
        alert(e.response?.data?.error || 'Không gửi được yêu cầu bàn giao VC/LĐ');
        loadPipes({ silent: true });
      } finally {
        setMoving(false);
      }
      return;
    }
    if (sxStage?.is_switch_workshop_type === true && sxStage?.target_workshop_type_id) {
      alert('Cột này đổi phân loại xưởng — mở chi tiết Sản xuất để chuyển.');
      return;
    }
    let body;
    if (sxStage?.bucket_slug === 'won_pending' || String(sxStage?.id || '').startsWith('__fb_')) {
      body = { move_to_intake: true };
    } else {
      body = {
        sx_pipeline_stage_id: sxStage?.id || stageId,
        current_sx_pipeline_stage_id: liveSxColId || proj?.sx_kanban_column_id || null,
      };
    }
    setMoving(true);
    setLiveSxColId(String(sxStage?.id || stageId));
    try {
      await api.patch(`/production/projects/${projectId}/stage`, body);
      afterMove();
    } catch (e) {
      const bodyErr = e?.response?.data || {};
      if (bodyErr.code === 'SX_BLOCKING_TASKS_INCOMPLETE') {
        const names = (bodyErr.remaining_tasks || []).map((t) => t.title || t.name).filter(Boolean);
        alert(`Còn nhiệm vụ SX chặn chuyển cột${bodyErr.current_stage_name ? ` tại «${bodyErr.current_stage_name}»` : ''}${names.length ? `:\n• ${names.slice(0, 8).join('\n• ')}` : ''}`);
      } else if (bodyErr.code === 'requires_deadline') {
        alert(bodyErr.error || 'Cột này bắt buộc deadline — mở chi tiết Sản xuất để nhập hạn.');
      } else {
        alert(bodyErr.error || e.message || 'Không chuyển được cột Sản xuất');
      }
      loadPipes({ silent: true });
    } finally {
      setMoving(false);
    }
  };

  const moveVc = async (stageId) => {
    if (!projectId || moving) return;
    const proj = vcProject || project;
    if (proj?.vc_temp_staged && String(stageId) !== String(proj?.vc_kanban_column_id || liveVcColId || '')) {
      alert(VC_TEMP_LOCK_MSG);
      return;
    }
    const vcStage = vcStages.find((s) => String(s.id) === String(stageId));
    let body = { vc_stage_id: stageId };
    if (vcStage?.workflow_stage_id) body.stage_id = vcStage.workflow_stage_id;
    if (vcStage?.bucket_slug === 'delivery_pending') body = { move_to_intake: true };
    setMoving(true);
    setLiveVcColId(String(stageId));
    try {
      await api.patch(`/logistics/projects/${projectId}/stage`, body);
      afterMove();
    } catch (e) {
      const bodyErr = e?.response?.data || {};
      if (bodyErr.code === 'SX_BLOCKING_TASKS_INCOMPLETE' || bodyErr.code === 'VC_BLOCKING_TASKS_INCOMPLETE') {
        const names = (bodyErr.remaining_tasks || []).map((t) => t.title || t.name).filter(Boolean);
        alert(`Còn nhiệm vụ VC chặn chuyển cột${names.length ? `:\n• ${names.slice(0, 8).join('\n• ')}` : ''}`);
      } else {
        alert(bodyErr.error || e.message || 'Không chuyển được cột VC/LĐ');
      }
      loadPipes({ silent: true });
    } finally {
      setMoving(false);
    }
  };

  const crmCurrentId = pipelineCurrentId(
    crmStages,
    liveCrmStageId || crmLead?.stage_id || lead?.stage_id,
    pipelines?.crm,
  );
  const sxResolved = resolveSxDisplayColumnId(
    {
      ...(sxProject || {}),
      ...(project || {}),
      sx_kanban_column_id: liveSxColId || sxProject?.sx_kanban_column_id || project?.sx_kanban_column_id,
      crmDeals: sxProject?.crmDeals || (crmLead ? [crmLead] : []),
    },
    sxStages,
    {
      leadColId: crmLead?.sx_pipeline_stage?.id || crmLead?.sx_pipeline_stage_id || pipelines?.sx?.id || null,
    },
  );
  const sxCurrentId = pipelineCurrentId(
    sxStages,
    sxResolved || liveSxColId || project?.sx_kanban_column_id,
    pipelines?.sx,
  );
  const vcList = vcStages;
  const vcColRaw = liveVcColId || vcProject?.vc_kanban_column_id || project?.vc_kanban_column_id;
  let vcCurrentId = pipelineCurrentId(vcList, vcColRaw, pipelines?.vc);
  if ((!vcCurrentId || !vcList.some((s) => String(s.id) === String(vcCurrentId))) && (vcProject?.vc_intake || pipelines?.vc?.bucket_slug === 'delivery_pending')) {
    const intake = vcList.find((s) => String(s.bucket_slug || '') === 'delivery_pending');
    if (intake?.id) vcCurrentId = String(intake.id);
  }

  const crmHref = leadId ? `/crm/leads/${leadId}` : null;

  return (
    <div className="space-y-4">
      <ModuleStepperBlock
        label="CRM"
        href={crmHref}
        loading={pipesLoading}
        empty={!leadId ? 'Chưa gắn Deal CRM' : (!crmStages.length ? 'Chưa có pipeline CRM' : null)}
      >
        <PipelineStepper
          stages={crmStages}
          currentStageId={crmCurrentId}
          currentStageName={crmLead?.stage?.name || lead?.stage?.name || pipelines?.crm?.name}
          visitedStageIds={visitedStageIds}
          onMoveToStage={moving ? undefined : moveCrm}
        />
      </ModuleStepperBlock>
      <ModuleStepperBlock
        label="Sản xuất"
        href={projectId ? `/sx/projects/${projectId}` : null}
        loading={pipesLoading}
        empty={!sxStages.length ? 'Chưa có pipeline sản xuất' : null}
      >
        <PipelineStepper
          stages={sxStages}
          currentStageId={sxCurrentId}
          currentStageName={pipelines?.sx?.name}
          linearProgress
          onMoveToStage={moving ? undefined : moveSx}
        />
      </ModuleStepperBlock>
      <ModuleStepperBlock
        label="VC / LĐ"
        href={projectId ? `/vc/projects/${projectId}` : null}
        loading={pipesLoading}
        empty={!vcStages.length ? 'Chưa có pipeline VC/LĐ' : null}
      >
        <PipelineStepper
          stages={vcStages}
          currentStageId={vcCurrentId}
          currentStageName={pipelines?.vc?.name}
          linearProgress
          onMoveToStage={moving ? undefined : moveVc}
        />
      </ModuleStepperBlock>
      <Section
        title="Lịch sử thao tác"
        action={<span className="text-[11px] text-gray-500">{items.length} sự kiện</span>}
      >
        <ProjectOperationHistory loading={loading} error={error} items={items} />
      </Section>
    </div>
  );
}

/** Một số "tài liệu" trong lead_documents chỉ là bản ghi tham chiếu (báo giá/đơn hàng...) không có file thật —
 *  nội dung ghi "Link: /crm/quotations/..." trong notes. Trích ra để hiển thị thành liên kết mở đúng trang. */
function extractInternalLink(notes) {
  const m = String(notes || '').match(/Link:\s*(\/[^\s]+)/);
  return m ? m[1] : null;
}

const DOC_TYPE_BADGE = {
  requirement: { label: 'Yêu cầu KH', emoji: '📝', cls: 'text-blue-700 bg-blue-50' },
  drawing: { label: 'Bản vẽ', emoji: '📐', cls: 'text-purple-700 bg-purple-50' },
  image: { label: 'Hình ảnh', emoji: '🖼️', cls: 'text-pink-700 bg-pink-50' },
  contract: { label: 'Hợp đồng', emoji: '📄', cls: 'text-emerald-700 bg-emerald-50' },
  measurement: { label: 'Số đo', emoji: '📏', cls: 'text-orange-700 bg-orange-50' },
  note: { label: 'Ghi chú', emoji: '📝', cls: 'text-amber-700 bg-amber-50' },
  pdf: { label: 'PDF', emoji: '📕', cls: 'text-red-700 bg-red-50' },
  spreadsheet: { label: 'Bảng tính', emoji: '📗', cls: 'text-emerald-700 bg-emerald-50' },
  other: { label: 'Tệp', emoji: '📎', cls: 'text-gray-600 bg-gray-50' },
};

function asDocArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.documents)) return data.documents;
  if (Array.isArray(data?.taskFiles)) return data.taskFiles;
  return [];
}

function isImageDoc(d) {
  return d?.doc_type === 'image'
    || String(d?.mime_type || '').startsWith('image/')
    || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(d?.file_url || d?.file_path || d?.file_name || d?.name || '');
}

function isVideoDoc(d) {
  return d?.doc_type === 'video'
    || String(d?.mime_type || '').startsWith('video/')
    || /\.(mp4|mov|webm|avi)$/i.test(d?.file_url || d?.file_name || d?.name || '');
}

function fileRefOf(d) {
  return String(d?.file_url || d?.file_path || '').trim();
}

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '';
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function mapUnifiedDoc(d, sourceLabel, idPrefix) {
  const fileUrl = fileRefOf(d);
  return {
    id: `${idPrefix}-${d.id || fileUrl || d.file_name || Math.random()}`,
    sourceId: d.id ? String(d.id) : '',
    name: d.name || d.file_name || 'Tệp không tên',
    file_name: d.file_name || d.name || '',
    file_url: fileUrl,
    mime_type: d.mime_type || '',
    doc_type: d.doc_type || '',
    file_size: d.file_size || 0,
    notes: d.notes || '',
    created_at: d.created_at,
    uploader_name: d.creator?.full_name || d.uploader?.full_name || null,
    source_label: sourceLabel,
    internal_link: !fileUrl ? extractInternalLink(d.notes) : null,
  };
}

function UnifiedDocCard({ doc, onOpenImage }) {
  const preview = useFilePreview();
  const typeInfo = DOC_TYPE_BADGE[doc.doc_type] || DOC_TYPE_BADGE.other;
  const img = isImageDoc(doc);
  const video = isVideoDoc(doc);
  const href = doc.file_url ? publicFileUrl(doc.file_url) : '';
  const previewName = doc.file_name || doc.name;
  const previewMode = resolveFilePreviewMode({
    mimeType: doc.mime_type,
    fileName: previewName,
    fileUrl: doc.file_url,
  });
  const canPreviewInApp = !!(doc.file_url && (img || previewMode));
  const openTabProps = doc.file_url ? getFileOpenAnchorProps(doc.file_url, { fileName: previewName }) : null;

  const openOnWeb = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (img) {
      onOpenImage?.(doc.file_url);
      return;
    }
    if (previewMode && preview?.openFilePreview) {
      preview.openFilePreview({
        url: doc.file_url,
        fileName: previewName,
        mimeType: doc.mime_type,
        title: doc.name,
      });
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden hover:shadow-sm transition-shadow">
      {img && href ? (
        <button
          type="button"
          onClick={openOnWeb}
          className="block w-full bg-slate-100 cursor-zoom-in"
          title="Xem ảnh"
        >
          <img src={href} alt={doc.name} className="h-36 w-full object-cover" loading="lazy" />
        </button>
      ) : video && href ? (
        <video src={href} controls preload="metadata" className="h-36 w-full bg-black object-contain" />
      ) : canPreviewInApp ? (
        <button
          type="button"
          onClick={openOnWeb}
          className="h-16 w-full flex items-center gap-2 px-3 bg-slate-50 border-b border-slate-100 text-left hover:bg-slate-100 cursor-pointer"
          title="Xem trên web"
        >
          <span className="text-2xl leading-none">{getFileEmoji(previewName)}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${typeInfo.cls}`}>
            {typeInfo.emoji} {typeInfo.label}
          </span>
          <span className="ml-auto text-[10px] font-semibold text-emerald-700">Xem trên web</span>
        </button>
      ) : openTabProps ? (
        <a
          {...openTabProps}
          className="h-16 w-full flex items-center gap-2 px-3 bg-slate-50 border-b border-slate-100 hover:bg-slate-100"
          title="Mở file"
        >
          <span className="text-2xl leading-none">{getFileEmoji(previewName)}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${typeInfo.cls}`}>
            {typeInfo.emoji} {typeInfo.label}
          </span>
          <span className="ml-auto text-[10px] font-semibold text-blue-700">Mở</span>
        </a>
      ) : (
        <div className="h-16 flex items-center gap-2 px-3 bg-slate-50 border-b border-slate-100">
          <span className="text-2xl leading-none">{getFileEmoji(previewName)}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${typeInfo.cls}`}>
            {typeInfo.emoji} {typeInfo.label}
          </span>
        </div>
      )}
      <div className="p-3 space-y-1.5">
        {doc.file_url ? (
          <FilePreviewOpenLink
            fileUrl={doc.file_url}
            fileName={previewName}
            mimeType={doc.mime_type}
            className="text-sm font-semibold text-slate-900 hover:text-blue-700 truncate block text-left cursor-pointer w-full"
          >
            {doc.name}
          </FilePreviewOpenLink>
        ) : doc.internal_link ? (
          <Link to={doc.internal_link} className="text-sm font-semibold text-slate-900 hover:text-blue-700 truncate block">
            {doc.name}
          </Link>
        ) : (
          <p className="text-sm font-semibold text-slate-900 truncate">{doc.name}</p>
        )}
        {doc.notes?.trim() && !doc.internal_link && (
          <p className="text-xs text-slate-500 line-clamp-2 whitespace-pre-wrap">{doc.notes}</p>
        )}
        <p className="text-[11px] text-slate-400">
          <span className="text-violet-600 font-medium">{doc.source_label}</span>
          {doc.uploader_name ? ` · ${doc.uploader_name}` : ''}
          {doc.created_at ? ` · ${formatDate(doc.created_at)}` : ''}
          {doc.file_size ? ` · ${formatFileSize(doc.file_size)}` : ''}
        </p>
        {doc.file_url && (
          <div className="flex items-center gap-3 pt-0.5">
            {canPreviewInApp ? (
              <button
                type="button"
                onClick={openOnWeb}
                className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-semibold"
              >
                <Eye className="h-3.5 w-3.5" /> Xem
              </button>
            ) : openTabProps ? (
              <a
                {...openTabProps}
                className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-semibold"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Mở
              </a>
            ) : null}
            <a
              {...getFileDownloadAnchorProps(doc.file_url, { fileName: previewName })}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              <Download className="h-3.5 w-3.5" /> Tải xuống
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function DocumentsTab({ projectId, leadId, projectHint = null }) {
  const [state, setState] = useState({ loading: true, error: '', docs: [], project: null, crmTaskDocs: [] });
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    Promise.all([
      leadId ? api.get(`/crm/leads/${leadId}/documents`).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      api.get(`/crm/project/${projectId}/lead-documents`).catch(() => ({ data: [] })),
      api.get(`/projects/${projectId}/documents`).catch(() => ({ data: { documents: [] } })),
      api.get(`/projects/${projectId}/task-files`).catch(() => ({ data: { taskFiles: [] } })),
      leadId ? api.get(`/crm/leads/${leadId}/task-documents`).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      projectHint
        ? Promise.resolve({ data: { project: projectHint } })
        : api.get(`/projects/${projectId}`).catch(() => ({ data: {} })),
    ]).then(([leadRes, byProjectRes, projectDocsRes, taskFilesRes, crmTaskDocsRes, projectRes]) => {
      if (cancelled) return;
      const seen = new Set();
      const docs = [];
      const push = (row, source, prefix) => {
        const mapped = mapUnifiedDoc(row, source, prefix);
        const dedupe = mapped.sourceId
          ? `id:${mapped.sourceId}`
          : mapped.file_url
            ? `url:${mapped.file_url}`
            : mapped.id;
        if (seen.has(dedupe)) return;
        seen.add(dedupe);
        docs.push(mapped);
      };
      asDocArray(leadRes.data).forEach((d) => push(d, 'Deal', 'deal'));
      asDocArray(byProjectRes.data).forEach((d) => push(d, 'Deal', 'deal'));
      asDocArray(projectDocsRes.data).forEach((d) => push(d, 'Dự án', 'project'));
      asDocArray(taskFilesRes.data).forEach((d) => {
        const label = d.task?.title ? `NV: ${d.task.title}` : 'Nhiệm vụ dự án';
        push(d, label, 'taskfile');
      });
      docs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      const seenUrls = new Set(docs.map((d) => d.file_url).filter(Boolean));
      const crmTaskDocs = asDocArray(crmTaskDocsRes.data).filter((d) => {
        const url = fileRefOf(d);
        return !url || !seenUrls.has(url);
      });
      setState({
        loading: false,
        error: '',
        docs,
        project: projectRes.data?.project || null,
        crmTaskDocs,
      });
    }).catch((e) => {
      if (!cancelled) {
        setState({
          loading: false,
          error: e?.response?.data?.error || 'Không tải được tài liệu',
          docs: [],
          project: null,
          crmTaskDocs: [],
        });
      }
    });
    return () => { cancelled = true; };
  }, [projectId, leadId, projectHint?.id]);

  const images = useMemo(() => state.docs.filter((d) => d.file_url && isImageDoc(d)), [state.docs]);
  const otherDocs = useMemo(() => state.docs.filter((d) => !isImageDoc(d)), [state.docs]);
  const galleryItems = useMemo(() => collectUploadLightboxItems(images), [images]);

  const openImage = (rawPath) => {
    const idx = findUploadLightboxIndex(galleryItems, rawPath);
    if (idx >= 0) setLightbox({ items: galleryItems, index: idx });
    else if (rawPath) setLightbox({ items: collectUploadLightboxItems([{ file_url: rawPath }]), index: 0 });
  };

  if (state.loading) {
    return (
      <Section title="Tài liệu">
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      </Section>
    );
  }
  if (state.error) return <Section title="Tài liệu"><EmptyNote>{state.error}</EmptyNote></Section>;

  const docs = state.docs;
  const hasFiles = docs.length > 0;

  return (
    <div className="space-y-4">
      <Section
        title="Tài liệu"
        action={(
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">{docs.length} tệp</span>
            {leadId && (
              <Link
                to={`/crm/leads/${leadId}`}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-900"
              >
                <Plus className="h-3 w-3" /> Upload CRM
                  </Link>
            )}
              </div>
        )}
      >
        {!hasFiles ? (
          <div className="text-center py-8">
            <FolderOpen className="h-10 w-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-500">Chưa có tài liệu nào được tải lên (Deal, dự án hoặc nhiệm vụ).</p>
            <p className="text-xs text-gray-400 mt-1">Upload trên CRM hoặc trang dự án đầy đủ — file sẽ hiện ở đây.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {images.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ImageIcon className="h-4 w-4 text-pink-600" />
                  <p className="text-xs font-bold text-slate-600 uppercase">Hình ảnh ({images.length})</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                  {images.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => openImage(d.file_url)}
                      className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100 cursor-zoom-in"
                      title={d.name}
                    >
                      <img src={publicFileUrl(d.file_url)} alt={d.name} className="h-full w-full object-cover group-hover:opacity-90" loading="lazy" />
                      <span className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[10px] truncate px-1.5 py-1">
                        {d.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {otherDocs.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileIcon className="h-4 w-4 text-blue-600" />
                  <p className="text-xs font-bold text-slate-600 uppercase">Tệp & văn bản ({otherDocs.length})</p>
            </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
                  {otherDocs.map((d) => (
                    <UnifiedDocCard key={d.id} doc={d} onOpenImage={openImage} />
          ))}
                </div>
              </div>
            )}
        </div>
      )}
    </Section>

      {state.crmTaskDocs.length > 0 && (
        <Section title="File nhiệm vụ CRM">
          <CrmTaskDocumentsPanel
            tasks={[]}
            artifacts={state.crmTaskDocs}
            leadType="deal"
            onOpenImage={openImage}
          />
        </Section>
      )}

      <ProjectDocumentsTab
        projectId={projectId}
        project={state.project}
        leadId={leadId}
        forModule={null}
        showLeadDocuments={false}
      />

      <Section title="Drive dự án">
        <DriveAttachments entityType="project" entityId={projectId} />
      </Section>
      {leadId && (
        <Section title="Drive Deal">
          <DriveAttachments entityType="deal" entityId={leadId} />
        </Section>
      )}

      {lightbox?.items?.length > 0 && (
        <UploadFileLightbox
          items={lightbox.items}
          index={lightbox.index}
          onIndexChange={(index) => setLightbox((prev) => (prev ? { ...prev, index } : prev))}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

const FINANCE_FLOW_CLS = {
  in: 'text-emerald-700',
  out: 'text-red-700',
  payable: 'text-amber-700',
  reference: 'text-gray-500',
};

function FinanceTab({ projectId }) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  useEffect(() => {
    let cancelled = false;
    api.get(`/projects/${projectId}/cashflow`)
      .then((res) => { if (!cancelled) setState({ loading: false, error: '', data: res.data }); })
      .catch((e) => { if (!cancelled) setState({ loading: false, error: e?.response?.data?.error || 'Không có quyền xem chi phí của dự án này', data: null }); });
    return () => { cancelled = true; };
  }, [projectId]);

  if (state.loading) return <Section title="Chi phí"><EmptyNote>Đang tải...</EmptyNote></Section>;
  if (state.error) return <Section title="Chi phí"><EmptyNote>{state.error}</EmptyNote></Section>;
  const { summary, timeline } = state.data || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Section title="Đã thu"><p className="text-lg font-bold text-emerald-700">{formatVND(summary?.payments_recorded_sum || 0)}</p></Section>
        <Section title="Chi phí"><p className="text-lg font-bold text-red-700">{formatVND(summary?.expenses_sum || 0)}</p></Section>
        <Section title="Còn phải thu"><p className="text-lg font-bold text-amber-700">{formatVND(summary?.remaining_to_collect || 0)}</p></Section>
        <Section title="Chênh lệch thu/chi"><p className="text-lg font-bold text-gray-800">{formatVND(summary?.net_cash_vs_expenses || 0)}</p></Section>
      </div>
      <Section title="Dòng tiền dự án">
        {(timeline || []).length === 0 ? (
          <EmptyNote>Chưa có giao dịch nào ghi nhận cho dự án này.</EmptyNote>
        ) : (
          <div className="divide-y divide-gray-50">
            {timeline.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 truncate">{t.title}</p>
                  {t.subtitle && <p className="text-xs text-gray-400 truncate mt-0.5">{t.subtitle}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold tabular-nums ${FINANCE_FLOW_CLS[t.flow] || 'text-gray-700'}`}>
                    {t.flow === 'out' ? '-' : t.flow === 'in' ? '+' : ''}{formatVND(t.amount)}
                  </p>
                  <p className="text-[11px] text-gray-400">{t.sort_at ? formatDate(new Date(t.sort_at)) : ''}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function AcceptanceTab({ flow, projectId }) {
  const step = (flow || []).find((s) => s.key === 'acceptance');
  return (
    <Section title="Nghiệm thu">
      {!step ? (
        <EmptyNote>Quy trình dự án này chưa có công đoạn Nghiệm thu.</EmptyNote>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              step.status === 'done' ? 'bg-emerald-50 text-emerald-700'
                : step.status === 'current' ? 'bg-blue-50 text-blue-700'
                  : 'bg-gray-100 text-gray-500'
            }`}
            >
              {step.status === 'done' ? 'Đã nghiệm thu' : step.status === 'current' ? 'Đang nghiệm thu' : 'Chưa tới công đoạn này'}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            Chưa có checklist nghiệm thu chi tiết cho dự án này.
          </p>
        </div>
      )}
    </Section>
  );
}

export function HistoryTab({ projectId, leadId }) {
  const { loading, error, items } = useProjectOperationHistory(projectId, leadId);
  return (
    <Section
      title="Lịch sử thao tác"
      action={<span className="text-[11px] text-gray-500">{items.length} sự kiện</span>}
    >
      <ProjectOperationHistory loading={loading} error={error} items={items} />
    </Section>
  );
}

function isRetryableNetworkError(e) {
  if (!e) return false;
  if (e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED') return true;
  if (!e.response) return true;
  const status = e.response.status;
  return status === 502 || status === 503 || status === 504;
}

function projectLoadErrorMessage(e) {
  if (e?.response?.data?.error) return e.response.data.error;
  if (isRetryableNetworkError(e)) return 'Không kết nối được máy chủ. Bấm Thử lại.';
  return 'Không tải được dữ liệu dự án';
}

function ProjectJumpSearch({ currentId }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canPickCompany = isAdminLike(user) && !isCompanyScopedAdmin(user);
  const boxRef = useRef(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [users, setUsers] = useState([]);
  const [regions, setRegions] = useState([]);
  const [filterUserId, setFilterUserId] = useState('');
  const [filterRegionId, setFilterRegionId] = useState('');
  const [timePreset, setTimePreset] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  const catalogsNeeded = searchFocused || filterPanelOpen || q.trim().length >= 2;

  useEffect(() => {
    if (!catalogsNeeded) return undefined;
    api.get('/companies', { params: { for_module: 'crm' } }).then((res) => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.companies || []);
      setCompanies(list);
    }).catch(() => setCompanies([]));
    return undefined;
  }, [catalogsNeeded]);

  const effectiveCompanyIdForUsers = useMemo(() => {
    if (canPickCompany) return companyId || '';
    const cid = user?.company_id != null ? String(user.company_id).trim() : '';
    return cid || '';
  }, [canPickCompany, companyId, user?.company_id]);

  const lockedCompanyLabel = useMemo(() => {
    const cid = user?.company_id != null ? String(user.company_id).trim() : '';
    const c = companies.find((x) => String(x.id) === cid);
    return c?.short_name || c?.name || 'Công ty của bạn';
  }, [user?.company_id, companies]);

  useEffect(() => {
    if (!catalogsNeeded) return undefined;
    let cancelled = false;
    const cid = effectiveCompanyIdForUsers;
    if (!cid && !canPickCompany) {
      setUsers([]);
      return undefined;
    }
    if (!cid && canPickCompany && companies.length === 0) {
      setUsers([]);
      return undefined;
    }
    loadWorkUnifiedEmployees({
      companyId: cid,
      companies,
      canPickCompany,
    }).then((list) => {
      if (!cancelled) setUsers(list);
    }).catch(() => {
      if (!cancelled) setUsers([]);
    });
    return () => { cancelled = true; };
  }, [catalogsNeeded, effectiveCompanyIdForUsers, canPickCompany, companies]);

  useEffect(() => {
    if (!catalogsNeeded) return undefined;
    const params = {};
    if (effectiveCompanyIdForUsers) {
      params.company_id = effectiveCompanyIdForUsers;
    } else if (canPickCompany && companies.length > 0) {
      params.company_ids = companies.map((c) => c.id).join(',');
    } else {
      setRegions([]);
      return undefined;
    }
    api.get('/crm/company-regions', { params })
      .then((r) => setRegions((Array.isArray(r.data) ? r.data : []).filter((rg) => rg.is_active !== false)))
      .catch(() => setRegions([]));
    return undefined;
  }, [catalogsNeeded, effectiveCompanyIdForUsers, canPickCompany, companies]);

  useEffect(() => {
    setFilterUserId('');
    setFilterRegionId('');
  }, [effectiveCompanyIdForUsers]);

  useEffect(() => {
    if (!filterUserId) return;
    const ok = filterWorkUnifiedStaff(users, { companyId, regionId: filterRegionId })
      .some((u) => String(u.id) === String(filterUserId));
    if (!ok) setFilterUserId('');
  }, [users, companyId, filterRegionId, filterUserId]);

  const handleTimePresetChange = (preset) => {
    setTimePreset(preset);
    const range = getWorkUnifiedPresetDateRange(preset);
    setRangeFrom(range.from);
    setRangeTo(range.to);
  };

  const clearAdvancedFilters = () => {
    setFilterUserId('');
    setFilterRegionId('');
    setTimePreset('');
    setRangeFrom('');
    setRangeTo('');
    if (canPickCompany) setCompanyId('');
  };

  const activeFilterCount = [
    !!filterUserId, !!filterRegionId, !!timePreset, canPickCompany && !!companyId,
  ].filter(Boolean).length;

  useEffect(() => {
    const t = setTimeout(() => {
      const term = q.trim();
      if (term.length < 2) {
        setItems([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const params = { q: term };
      if (canPickCompany && companyId) params.company_id = companyId;
      if (filterUserId) params.user_id = filterUserId;
      if (filterRegionId) params.region_id = filterRegionId;
      if (rangeFrom) params.date_from = rangeFrom;
      if (rangeTo) params.date_to = rangeTo;
      api.get('/management/work-unified/search', { params })
        .then((res) => setItems(res.data?.items || []))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, companyId, canPickCompany, filterUserId, filterRegionId, rangeFrom, rangeTo]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const go = (id) => {
    if (!id || String(id) === String(currentId)) {
      setOpen(false);
      return;
    }
    setOpen(false);
    setFilterPanelOpen(false);
    setQ('');
    setItems([]);
    navigate(workUnifiedPath(id));
  };

  const closeJump = () => {
    setOpen(false);
    setFilterPanelOpen(false);
    setQ('');
    setItems([]);
  };

  const jumpChips = useMemo(() => {
    const chips = [];
    if (canPickCompany && companyId) {
      const c = companies.find((x) => String(x.id) === String(companyId));
      chips.push({
        key: 'company',
        label: c?.short_name || c?.name || 'Công ty',
        onClear: () => setCompanyId(''),
      });
    }
    if (filterUserId) {
      const u = users.find((x) => String(x.id) === String(filterUserId));
      chips.push({
        key: 'user',
        label: u?.full_name || 'Nhân viên',
        onClear: () => setFilterUserId(''),
      });
    }
    if (filterRegionId === WORK_UNIFIED_REGION_NONE) {
      chips.push({
        key: 'region',
        label: 'Chưa gán khu vực',
        onClear: () => setFilterRegionId(''),
      });
    } else if (filterRegionId) {
      const rg = regions.find((x) => String(x.id) === String(filterRegionId));
      chips.push({
        key: 'region',
        label: rg?.name || 'Khu vực',
        onClear: () => setFilterRegionId(''),
      });
    }
    if (timePreset) {
      const t = WORK_UNIFIED_TIME_PRESETS.find((x) => x.key === timePreset);
      chips.push({
        key: 'time',
        label: t?.label || 'Thời gian',
        onClear: () => handleTimePresetChange(''),
      });
    }
    return chips;
  }, [canPickCompany, companyId, companies, filterUserId, users, filterRegionId, regions, timePreset]);

  return (
    <div ref={boxRef} className="relative ml-auto w-52 sm:w-80 shrink-0">
      <div
        className={`group/search flex items-center w-full rounded-md border transition-colors ${
          searchGroupClass({
            focused: searchFocused,
            hasQuery: !!q.trim(),
            hasChips: jumpChips.length > 0,
            panelOpen: filterPanelOpen,
          })
        }`}
      >
        <div className="relative flex-1 min-w-0 flex items-center gap-1 pl-7 pr-1">
          <Search
            className={`absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-colors ${
              searchFocused || q.trim() ? 'text-violet-600' : 'text-slate-400'
            }`}
          />
          {!filterPanelOpen && jumpChips.length > 0 && (
            <SearchInlineFilterChips
              chips={jumpChips}
              opacityClass={searchFocused ? 'opacity-40' : q.trim() ? 'opacity-35' : 'opacity-45 group-hover/search:opacity-100'}
              onClearChip={(chip) => { chip.onClear(); }}
              onClearAll={clearAdvancedFilters}
              showClearAll={jumpChips.length > 1}
            />
          )}
          <input
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); setSearchFocused(true); }}
            onFocus={() => { setOpen(true); setSearchFocused(true); }}
            onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && items[0]) {
                e.preventDefault();
                go(items[0].id);
              }
              if (e.key === 'Escape') {
                setOpen(false);
                setFilterPanelOpen(false);
              }
            }}
            placeholder="Tìm mã, tên dự án..."
            className={`flex-1 min-w-[3.5rem] h-8 bg-transparent border-0 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 ${q ? 'pr-7' : ''}`}
          />
          {q && (
            <SearchClearButton onClick={() => { setQ(''); setItems([]); setSearchFocused(false); }} />
          )}
        </div>
        <div className="shrink-0 pr-1">
          <AdvFilterButton
            open={filterPanelOpen}
            active={activeFilterCount > 0}
            onClick={() => {
              setFilterPanelOpen((v) => !v);
              setOpen(false);
            }}
          />
        </div>
      </div>
      {filterPanelOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setFilterPanelOpen(false)} />
          <WorkUnifiedFilterPanel
            align="right"
            onClose={() => setFilterPanelOpen(false)}
            canPickCompany={canPickCompany}
            lockedCompanyLabel={lockedCompanyLabel}
            companies={companies}
            companyId={companyId}
            onCompanyChange={setCompanyId}
            users={users}
            filterUserId={filterUserId}
            onUserChange={setFilterUserId}
            regions={regions}
            filterRegionId={filterRegionId}
            onRegionChange={setFilterRegionId}
            timePreset={timePreset}
            onTimePresetChange={handleTimePresetChange}
            activeFilterCount={activeFilterCount}
            onClear={clearAdvancedFilters}
          />
        </>
      )}
      {open && !filterPanelOpen && q.trim().length >= 2 && (
        <div className="absolute right-0 top-full mt-1 z-40 w-full min-w-[18rem] rounded-xl border-2 border-violet-200 bg-white shadow-xl shadow-violet-500/15 overflow-hidden">
          {loading ? (
            <p className="px-3 py-2 text-xs text-gray-400">Đang tìm...</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">Không có dự án khớp</p>
          ) : (
            items.map((it) => {
              const active = String(it.id) === String(currentId);
              return (
                <Link
                  key={it.id}
                  to={workUnifiedPath(it.id)}
                  data-wu-open-tab={it.id}
                  title="Chuột phải để mở tab mới"
                  onClick={closeJump}
                  className={`block w-full text-left px-3 py-2 ${active ? 'bg-violet-50' : 'hover:bg-gray-50'}`}
                >
                  <p className="text-xs font-medium text-violet-700 truncate">{it.code}</p>
                  <p className="text-[11px] text-gray-600 truncate">{it.name}</p>
                  {it.customer_name && (
                    <p className="text-[10px] text-gray-400 truncate">{it.customer_name}</p>
                  )}
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function ProjectSelfLink({ id, className, children }) {
  return (
    <Link
      to={workUnifiedPath(id)}
      data-wu-open-tab={id}
      title="Chuột phải để mở tab mới"
      className={className}
    >
      {children}
    </Link>
  );
}

export default function WorkUnifiedProjectDetailPage() {
  return (
    <WorkUnifiedOpenTabProvider>
      <WorkUnifiedProjectDetailInner />
    </WorkUnifiedOpenTabProvider>
  );
}

function WorkUnifiedProjectDetailInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user: currentUser } = useAuth();
  const { openMessengerGroupChat, markGroupRead } = useMessengerDock();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const tabFromUrl = searchParams.get('tab') || 'overview';
  const groupFromUrl = searchParams.get('group') || '';
  const [activeTab, setActiveTab] = useState(() => tabFromUrl);
  const [messagingId, setMessagingId] = useState(null);
  const [companyUsers, setCompanyUsers] = useState([]);
  const [commentCount, setCommentCount] = useState(0);
  const bundleLeadIdRef = useRef(null);

  const startDirectChat = async (peerUser) => {
    const peerId = peerUser?.id;
    if (!peerId || String(peerId) === String(currentUser?.id ?? currentUser?.userId)) return;
    setMessagingId(peerId);
    try {
      const { data } = await api.post('/messenger/direct', { peer_user_id: peerId });
      if (data?.id) {
        markGroupRead(data.id);
        openMessengerGroupChat({
          id: data.id,
          name: data.display_name || peerUser.full_name,
          display_name: data.display_name || peerUser.full_name,
          is_direct: true,
          peer_id: data.peer_id || peerId,
          peer_avatar: data.peer_avatar || null,
        });
      }
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Không mở được cuộc trò chuyện');
    } finally {
      setMessagingId(null);
    }
  };

  const load = useCallback(async (opts = {}) => {
    if (!id) {
      setError('Thiếu mã dự án');
      setLoading(false);
      return;
    }
    const silent = !!opts.silent;
    const noCache = !!opts.noCache;
    if (!silent) {
      const cached = readWorkUnifiedLiteCache(id);
      if (cached) {
        setBundle(cached);
        setCommentCount(Number(cached.comment_count) || 0);
        setLoading(false);
      } else {
        setBundle(null);
        setLoading(true);
      }
    }
    setError('');
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await api.get(`/management/by-project/${id}`, {
          params: { lite: 1 },
          headers: noCache ? { 'X-No-Cache': '1' } : undefined,
        });
        setBundle(res.data);
        setCommentCount(Number(res.data?.comment_count) || 0);
        writeWorkUnifiedLiteCache(id, res.data);
        setLoading(false);
        return;
      } catch (e) {
        lastErr = e;
        if (!isRetryableNetworkError(e) || attempt === 2) break;
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    setError(projectLoadErrorMessage(lastErr));
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket || !id) return undefined;
    const join = () => {
      socket.emit('join:project', id);
      const lid = bundleLeadIdRef.current;
      if (lid) socket.emit('join:lead', lid);
    };
    join();
    socket.on('connect', join);
    let timer = null;
    const reload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => load({ silent: true, noCache: true }), 350);
    };
    const onProject = (payload) => {
      const pid = payload?.project_id || payload?.id || payload?.project?.id;
      if (pid && String(pid) !== String(id)) return;
      reload();
    };
    const onCrmTask = (payload) => {
      const pid = payload?.project_id;
      if (pid && String(pid) !== String(id)) return;
      reload();
    };
    const onCrmLead = (payload) => {
      const lid = payload?.lead_id;
      const currentLead = bundleLeadIdRef.current;
      if (lid && currentLead && String(lid) === String(currentLead)) {
        reload();
        return;
      }
      const pid = payload?.project_id;
      if (pid && String(pid) === String(id)) reload();
    };
    const onBadge = (payload) => {
      const pid = payload?.project_id;
      if (pid && String(pid) === String(id)) {
        reload();
        return;
      }
      const lid = payload?.lead_id;
      const currentLead = bundleLeadIdRef.current;
      if (lid && currentLead && String(lid) === String(currentLead)) reload();
    };
    socket.on('project:updated', onProject);
    socket.on('project:stage_changed', onProject);
    socket.on('task:updated', onProject);
    socket.on('crm:task_changed', onCrmTask);
    socket.on('crm:badge_updated', onBadge);
    socket.on('crm:dashboard_changed', onCrmLead);
    socket.on('lead:activity', onCrmLead);
    return () => {
      if (timer) clearTimeout(timer);
      socket.off('connect', join);
      socket.off('project:updated', onProject);
      socket.off('project:stage_changed', onProject);
      socket.off('task:updated', onProject);
      socket.off('crm:task_changed', onCrmTask);
      socket.off('crm:badge_updated', onBadge);
      socket.off('crm:dashboard_changed', onCrmLead);
      socket.off('lead:activity', onCrmLead);
    };
  }, [id, load]);

  useEffect(() => {
    const lid = bundle?.primary_lead?.id || bundle?.lead_id || null;
    bundleLeadIdRef.current = lid;
    const socket = getSocket() || connectSocket();
    if (!socket || !lid) return undefined;
    const joinLead = () => socket.emit('join:lead', lid);
    joinLead();
    socket.on('connect', joinLead);
    return () => {
      socket.off('connect', joinLead);
      socket.emit('leave:lead', lid);
    };
  }, [bundle?.primary_lead?.id, bundle?.lead_id]);

  useEffect(() => {
    const onBadgeEvt = (e) => {
      const pid = e?.detail?.projectId;
      if (pid && String(pid) !== String(id)) return;
      load({ silent: true, noCache: true });
    };
    window.addEventListener('crm-project-badges-refresh', onBadgeEvt);
    return () => window.removeEventListener('crm-project-badges-refresh', onBadgeEvt);
  }, [id, load]);

  useEffect(() => {
    const allowed = new Set(['overview', ...SECONDARY_TABS.map((t) => t.key), 'team']);
    setActiveTab(allowed.has(tabFromUrl) ? tabFromUrl : 'overview');
  }, [id, tabFromUrl]);

  const selectTab = (key) => {
    setActiveTab(key);
    const next = new URLSearchParams(searchParams);
    if (!key || key === 'overview') next.delete('tab');
    else next.set('tab', key);
    if (key !== 'tasks') next.delete('group');
    const qs = next.toString();
    navigate({ search: qs ? `?${qs}` : '' }, { replace: true });
  };

  const bundleCompanyId = bundle?.project?.company_id || null;
  useEffect(() => {
    if (!bundleCompanyId || (activeTab !== 'shared' && activeTab !== 'team')) return;
    api.get('/users', { params: { company_id: bundleCompanyId } })
      .then((r) => setCompanyUsers(r.data.users || r.data || []))
      .catch(() => setCompanyUsers([]));
  }, [bundleCompanyId, activeTab]);

  if (loading && !bundle) {
    return <div className="h-full min-h-0 flex items-center justify-center text-gray-400 text-sm">Đang tải...</div>;
  }
  if (error && !bundle?.project) {
    return (
      <div className="h-full min-h-0 overflow-y-auto px-4 md:px-6 py-3 space-y-3">
        <button
          type="button"
          onClick={() => navigate('/management/work-unified')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại Work Unified
        </button>
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={load}
            className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 hover:bg-red-100 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Thử lại
          </button>
        </div>
      </div>
    );
  }
  if (!bundle?.project) return null;

  const { project, primary_lead: primaryLead, lead_id: leadId } = bundle;
  const overview = bundle.overview || {};
  const effectiveLeadId = primaryLead?.id || leadId || null;
  const currentPp = (overview.production_projects || []).find((p) => String(p.project_id) === String(id))
    || (overview.production_projects || [])[0]
    || null;
  const projectForPipes = {
    ...project,
    logistics_company_id: project.logistics_company_id
      || currentPp?.logistics_company_id
      || null,
    workshop_type_id: project.workshop_type_id || currentPp?.workshop_type_id || null,
    sx_intake: project.sx_intake ?? currentPp?.sx_intake ?? null,
    vc_temp_staged: project.vc_temp_staged ?? currentPp?.vc_temp_staged ?? null,
    vc_handover_status: project.vc_handover_status || currentPp?.vc_handover_status || null,
  };
  const currentFlow = (overview.flow || []).find((s) => s.status === 'current');
  const ownerKey = currentFlow?.module === 'production' ? 'sx' : currentFlow?.module === 'logistics' ? 'vc' : 'crm';
  const ownerUser = overview.owners?.[ownerKey]
    || overview.owners?.sx
    || overview.owners?.crm
    || overview.owners?.vc
    || null;
  const ownerName = ownerUser?.full_name || null;
  bundleLeadIdRef.current = effectiveLeadId;
  const pipeSyncKey = [
    primaryLead?.stage_id,
    project?.sx_kanban_column_id,
    project?.vc_kanban_column_id,
    bundle.pipelines?.crm?.id,
    bundle.pipelines?.sx?.id,
    bundle.pipelines?.vc?.id,
  ].filter(Boolean).join('|');

  const withOwner = (pipe, owner) => {
    if (!pipe) return pipe;
    if (pipe.person?.full_name || !owner?.full_name) return pipe;
    return { ...pipe, person: owner };
  };
  const pipelineSections = bundle.sections || {};
  const crmPipe = withOwner(
    withPipelineProgress(bundle.pipelines?.crm, pipelineSections, 'crm'),
    overview.owners?.crm,
  );
  const sxPipe = withOwner(
    withPipelineProgress(bundle.pipelines?.sx, pipelineSections, 'sx'),
    overview.owners?.sx,
  );
  const vcPipe = withOwner(
    withPipelineProgress(bundle.pipelines?.vc, pipelineSections, 'vc'),
    overview.owners?.vc,
  );

  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 md:px-6 py-3 space-y-5">
      <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
        <Link
          to="/management/work-unified"
          title="Thoát khỏi chi tiết dự án"
          className="inline-flex items-center justify-center h-6 w-6 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Link to="/management/work-unified" className="hover:text-gray-600">Work Unified</Link>
        <ChevronRight className="h-3 w-3" />
        <span>Dự án</span>
        <ChevronRight className="h-3 w-3" />
        <ProjectSelfLink id={id} className="text-gray-600 font-medium hover:text-violet-700 hover:underline">
          {project.code}
        </ProjectSelfLink>
        <ProjectJumpSearch currentId={id} />
      </div>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold" style={{ color: '#111827' }}>
              <ProjectSelfLink id={id} className="hover:text-violet-800">
                {project.name}
              </ProjectSelfLink>
            </h1>
            {overview.status_label && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 whitespace-nowrap">
                Đang {overview.status_label.toLowerCase()}
              </span>
            )}
          </div>
          {overview.forecast === 'late' && (
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg mt-2">
              <AlertTriangle className="h-3.5 w-3.5" /> Trễ hạn {overview.delay_days} ngày
            </p>
          )}
          {overview.forecast === 'at_risk' && (
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg mt-2">
              <AlertTriangle className="h-3.5 w-3.5" /> Nguy cơ trễ — còn {overview.days_remaining} ngày
            </p>
          )}
          <p className="text-xs text-gray-500 mt-2 flex items-center gap-2 flex-wrap">
            <span>{project.code}{ownerName ? ` · Phụ trách: ${ownerName}` : ''}</span>
            {ownerUser?.id && (
              <button
                type="button"
                onClick={() => startDirectChat(ownerUser)}
                disabled={messagingId === ownerUser.id}
                title={`Nhắn tin với ${ownerName}`}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 px-2 py-0.5 rounded-md cursor-pointer"
              >
                {messagingId === ownerUser.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <MessageCircle className="h-3 w-3" />
                )}
                Nhắn tin
              </button>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Tạo công việc
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <PipelineChip
          label="CRM"
          moduleKey="crm"
          stage={crmPipe}
          href={effectiveLeadId ? `/crm/leads/${effectiveLeadId}` : null}
          title="Mở chi tiết CRM — cùng giai đoạn và tiến độ NV"
        />
        <PipelineChip
          label="Sản xuất"
          moduleKey="sx"
          stage={sxPipe}
          href={`/sx/projects/${id}`}
          title="Mở chi tiết Sản xuất — cùng cột kanban SX"
        />
        <PipelineChip
          label="VC / LĐ"
          moduleKey="vc"
          stage={vcPipe}
          href={`/vc/projects/${id}`}
          title="Mở chi tiết VC/LĐ — cùng cột kanban vận chuyển"
        />
      </div>

      <div className="border-b border-gray-100 flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => selectTab('overview')}
          className={`shrink-0 text-sm font-medium px-3 py-2 -mb-px cursor-pointer ${
            activeTab === 'overview' ? 'font-semibold text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Tổng quan
        </button>
        {SECONDARY_TABS.flatMap((t) => (
          t.key === 'shared' && effectiveLeadId ? [t, TEAM_TAB] : [t]
        )).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => selectTab(t.key)}
            className={`shrink-0 inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 -mb-px cursor-pointer ${
              activeTab === t.key ? 'font-semibold text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.key === 'chat' && commentCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-none shadow-sm ring-1 ring-white">
                {commentCount > 99 ? '99+' : commentCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <ProjectOverviewPanel
          overview={overview}
          lead={primaryLead}
          leadId={effectiveLeadId}
          onReload={() => load({ silent: true, noCache: true })}
          onOpenTasks={() => selectTab('tasks')}
          fullPageHref={`/projects/${id}?tab=overview`}
        />
      )}
      {activeTab === 'tasks' && <TasksTab projectId={id} initialGroup={groupFromUrl} />}
      {activeTab === 'shared' && (
        <ProjectSharedWorkspaceTab
          projectId={id}
          project={project}
          dealBundle={bundle}
          users={companyUsers}
          onReload={load}
        />
      )}
      {activeTab === 'team' && effectiveLeadId && (
        <LeadMembersTab
          leadId={effectiveLeadId}
          onOpenSharedWorkspace={() => selectTab('shared')}
        />
      )}
      {activeTab === 'progress' && (
        <ProgressTab
          projectId={id}
          leadId={effectiveLeadId}
          project={projectForPipes}
          lead={primaryLead}
          pipelines={bundle.pipelines}
          onReload={() => load({ silent: true, noCache: true })}
          syncKey={pipeSyncKey}
        />
      )}
      {activeTab === 'documents' && <DocumentsTab projectId={id} leadId={effectiveLeadId} projectHint={project} />}
      {activeTab === 'finance' && <FinanceTab projectId={id} />}
      {activeTab === 'acceptance' && <AcceptanceTab projectId={id} flow={overview.flow} />}
      {activeTab === 'chat' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="mx-4 mt-4 mb-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 leading-relaxed">
            Bình luận chỉ để trao đổi nhanh. Bản vẽ, render, bảng mô tả phải nộp trong tab{' '}
            <button type="button" onClick={() => selectTab('tasks')} className="font-semibold underline cursor-pointer">
              Công việc
            </button>
            {' '}(Ghi chú &amp; file) — nếu đẩy hết vào đây, tiến trình Sales trên công việc sẽ mất.
          </div>
          {effectiveLeadId ? (
            <CrmLeadCommentsPanel leadId={effectiveLeadId} forModule="projects" onCountChange={setCommentCount} />
          ) : (
            <ProjectCommentsPanel projectId={id} onCountChange={setCommentCount} />
          )}
        </div>
      )}
      {activeTab === 'history' && <HistoryTab projectId={id} leadId={effectiveLeadId} />}

    </div>
  );
}
