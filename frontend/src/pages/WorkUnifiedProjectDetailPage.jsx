import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import SearchInlineFilterChips, { SearchClearButton, AdvFilterButton, searchGroupClass } from '../components/SearchInlineFilterChips';
import WorkUnifiedFilterPanel, {
  WORK_UNIFIED_TIME_PRESETS,
  WORK_UNIFIED_REGION_NONE,
  getWorkUnifiedPresetDateRange,
} from '../components/WorkUnifiedFilterFields';
import ProjectOverviewPanel from '../components/ProjectOverviewPanel';
import UnifiedTaskRow from '../components/UnifiedTaskRow';
import WorkTaskExtrasPanel from '../components/WorkTaskExtrasPanel';
import ProjectSharedWorkspaceTab from '../components/ProjectSharedWorkspaceTab';
import { LeadMembersTab } from '../components/LeadChatTabs';
import { CrmLeadCommentsPanel, ProjectCommentsPanel } from '../components/CommentsPanels';
import { useMessengerDock } from '../context/MessengerDockContext';
import { useAuth } from '../lib/auth';
import { FilePreviewOpenLink } from '../context/FilePreviewContext';
import { getFileDownloadAnchorProps } from '../lib/publicFileUrl';
import { formatVND, formatDate, formatDateTime } from '../lib/utils';
import {
  ChevronRight, ChevronDown, AlertTriangle, Shield, Plus, ExternalLink, Download, FileText as FileIcon, ArrowLeft,
  CheckCircle2, X as XIcon, MessageCircle, Loader2, Package, Truck, RefreshCw, Search,
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

/** Trang đầy đủ /projects/:id có tab tương ứng — dùng khi cần vào sâu (sửa, upload, tạo mới). */
const FULL_PAGE_TAB = {
  tasks: 'aggregate', shared: 'shared', team: 'team', progress: 'flow', documents: 'documents',
  finance: 'finance', acceptance: 'approvals', chat: 'chat', history: 'history',
};

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

export function TasksTab({ projectId }) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [savingId, setSavingId] = useState(null);
  const [extrasTask, setExtrasTask] = useState(null);
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const toggleGroup = (key) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

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
        {tasks.length === 0 ? (
          <EmptyNote>Chưa có công việc nào gắn với dự án này.</EmptyNote>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => {
              const isOpen = openGroups.has(g.key);
              const doneCount = g.tasks.filter((t) => DONE_TASK_STATUSES.includes(String(t.status))).length;
              const Icon = g.icon;
              return (
                <div key={g.key} className="rounded-xl border border-gray-100 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.key)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 transition-colors cursor-pointer ${g.header}`}
                  >
                    <span className={`flex items-center gap-2 text-sm font-bold ${g.accent}`}>
                      <Icon className="h-4 w-4" />
                      {g.label}
                      <span className="text-[11px] font-medium text-gray-500">({g.tasks.length})</span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-gray-500 whitespace-nowrap">{doneCount}/{g.tasks.length} hoàn thành</span>
                      <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="p-2 space-y-2 bg-white border-t border-gray-100">
                      {g.tasks.map(renderTaskRow)}
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

/** Dùng chung cho tab Tiến độ + Lịch sử — cả 2 đọc từ GET /api/projects/:id (transitions + activities). */
function useProjectDetailBundle(projectId, enabled) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState({ loading: true, error: '', data: null });
    api.get(`/projects/${projectId}`)
      .then((res) => { if (!cancelled) setState({ loading: false, error: '', data: res.data?.project || null }); })
      .catch((e) => { if (!cancelled) setState({ loading: false, error: e?.response?.data?.error || 'Không tải được dữ liệu', data: null }); });
    return () => { cancelled = true; };
  }, [projectId, enabled]);
  return state;
}

function ProgressTab({ projectId, flow }) {
  const { loading, error, data } = useProjectDetailBundle(projectId, true);
  const transitions = data?.transitions || [];
  return (
    <div className="space-y-4">
      <Section title="Luồng công đoạn hiện tại">
        <div className="flex flex-wrap gap-2">
          {(flow || []).map((s, idx) => (
            <span
              key={s.key}
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                s.status === 'done' ? 'bg-emerald-50 text-emerald-700'
                  : s.status === 'current' ? 'bg-blue-50 text-blue-700'
                    : 'bg-gray-100 text-gray-500'
              }`}
            >
              {idx + 1}. {s.label}
            </span>
          ))}
        </div>
      </Section>
      <Section title="Lịch sử chuyển công đoạn">
        {loading ? <EmptyNote>Đang tải...</EmptyNote>
          : error ? <EmptyNote>{error}</EmptyNote>
            : transitions.length === 0 ? <EmptyNote>Chưa có lần chuyển công đoạn nào được ghi nhận.</EmptyNote>
              : (
                <div className="space-y-3">
                  {transitions.map((t) => (
                    <div key={t.id} className="flex items-start gap-3 text-sm">
                      <div className="h-2 w-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-gray-800">
                          {t.from_stage?.name ? `${t.from_stage.name} → ` : ''}
                          <span className="font-medium">{t.to_stage?.name || '—'}</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {t.user?.full_name ? `${t.user.full_name} · ` : ''}{formatDateTime(t.created_at)}
                        </p>
                        {t.notes && <p className="text-xs text-gray-500 mt-0.5">{t.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

export function DocumentsTab({ projectId, leadId }) {
  const [state, setState] = useState({ loading: true, error: '', docs: [] });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: '', docs: [] });
    Promise.all([
      leadId ? api.get(`/crm/leads/${leadId}/documents`).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      api.get(`/projects/${projectId}/documents`).catch(() => ({ data: { documents: [] } })),
    ]).then(([leadRes, projectRes]) => {
      if (cancelled) return;
      const fromDeal = (Array.isArray(leadRes.data) ? leadRes.data : []).map((d) => ({
        id: `deal-${d.id}`,
        name: d.name || d.file_name || 'Tệp không tên',
        file_url: d.file_url,
        mime_type: d.mime_type,
        created_at: d.created_at,
        uploader_name: d.creator?.full_name || null,
        source_label: 'Deal',
        internal_link: !d.file_url ? extractInternalLink(d.notes) : null,
      }));
      const fromProject = (projectRes.data?.documents || []).map((d) => ({
        id: `project-${d.id}`,
        name: d.file_name || 'Tệp không tên',
        file_url: d.file_url,
        mime_type: d.mime_type,
        created_at: d.created_at,
        uploader_name: d.uploader?.full_name || null,
        source_label: 'Dự án',
      }));
      const merged = [...fromDeal, ...fromProject].sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
      );
      setState({ loading: false, error: '', docs: merged });
    }).catch((e) => {
      if (!cancelled) setState({ loading: false, error: e?.response?.data?.error || 'Không tải được tài liệu', docs: [] });
    });
    return () => { cancelled = true; };
  }, [projectId, leadId]);

  if (state.loading) return <Section title="Tài liệu"><EmptyNote>Đang tải...</EmptyNote></Section>;
  if (state.error) return <Section title="Tài liệu"><EmptyNote>{state.error}</EmptyNote></Section>;
  const docs = state.docs;

  return (
    <Section title="Tài liệu" action={<span className="text-[11px] text-gray-500">{docs.length} tệp</span>}>
      {docs.length === 0 ? (
        <EmptyNote>Chưa có tài liệu nào được tải lên (từ Deal hoặc Dự án).</EmptyNote>
      ) : (
        <div className="divide-y divide-gray-50">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 py-2.5">
              <FileIcon className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="min-w-0 flex-1">
                {d.file_url ? (
                  <FilePreviewOpenLink
                    fileUrl={d.file_url}
                    fileName={d.name}
                    mimeType={d.mime_type}
                    className="text-sm text-gray-800 hover:text-blue-700 hover:underline truncate block text-left cursor-pointer"
                  >
                    {d.name}
                  </FilePreviewOpenLink>
                ) : d.internal_link ? (
                  <Link to={d.internal_link} className="text-sm text-gray-800 hover:text-blue-700 hover:underline truncate block">
                    {d.name}
                  </Link>
                ) : (
                  <p className="text-sm text-gray-800 truncate">{d.name}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  <span className="text-violet-600 font-medium">{d.source_label}</span>
                  {d.uploader_name ? ` · ${d.uploader_name}` : ''} · {formatDate(d.created_at)}
                </p>
              </div>
              {d.file_url && (
                <a
                  {...getFileDownloadAnchorProps(d.file_url, { fileName: d.name })}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
                >
                  <Download className="h-3.5 w-3.5" /> Tải
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
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
            Chưa có checklist nghiệm thu chi tiết cho dự án — dùng tab{' '}
            <Link to={`/projects/${projectId}?tab=approvals`} className="text-blue-600 hover:underline">Duyệt</Link> ở trang dự án đầy đủ để ghi nhận kết quả nghiệm thu.
          </p>
        </div>
      )}
    </Section>
  );
}

export function HistoryTab({ projectId }) {
  const { loading, error, data } = useProjectDetailBundle(projectId, true);
  const activities = data?.activities || [];
  return (
    <Section title="Lịch sử hoạt động" action={<span className="text-[11px] text-gray-500">{activities.length} sự kiện</span>}>
      {loading ? <EmptyNote>Đang tải...</EmptyNote>
        : error ? <EmptyNote>{error}</EmptyNote>
          : activities.length === 0 ? <EmptyNote>Chưa có hoạt động nào được ghi nhận.</EmptyNote>
            : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {activities.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 text-sm">
                    <div className="h-2 w-2 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-gray-800">{a.description || a.action}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {a.user?.full_name ? `${a.user.full_name} · ` : ''}{formatDateTime(a.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
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

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'crm' } }).then((res) => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.companies || []);
      setCompanies(list);
    }).catch(() => setCompanies([]));
  }, []);

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
    if (effectiveCompanyIdForUsers) {
      api.get('/users', { params: { company_id: effectiveCompanyIdForUsers } })
        .then((r) => setUsers(r.data.users || r.data || []))
        .catch(() => setUsers([]));
      return undefined;
    }
    if (canPickCompany) {
      api.get('/users')
        .then((r) => setUsers(r.data.users || r.data || []))
        .catch(() => setUsers([]));
      return undefined;
    }
    setUsers([]);
    return undefined;
  }, [effectiveCompanyIdForUsers, canPickCompany]);

  useEffect(() => {
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
  }, [effectiveCompanyIdForUsers, canPickCompany, companies]);

  useEffect(() => {
    setFilterUserId('');
    setFilterRegionId('');
  }, [effectiveCompanyIdForUsers]);

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
    navigate(`/management/work-unified/${id}`);
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
                <button
                  key={it.id}
                  type="button"
                  onClick={() => go(it.id)}
                  className={`w-full text-left px-3 py-2 cursor-pointer ${active ? 'bg-violet-50' : 'hover:bg-gray-50'}`}
                >
                  <p className="text-xs font-medium text-violet-700 truncate">{it.code}</p>
                  <p className="text-[11px] text-gray-600 truncate">{it.name}</p>
                  {it.customer_name && (
                    <p className="text-[10px] text-gray-400 truncate">{it.customer_name}</p>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function WorkUnifiedProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { openMessengerGroupChat, markGroupRead } = useMessengerDock();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [messagingId, setMessagingId] = useState(null);
  const [companyUsers, setCompanyUsers] = useState([]);
  const [commentCount, setCommentCount] = useState(0);

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

  const load = useCallback(async () => {
    if (!id) {
      setError('Thiếu mã dự án');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await api.get(`/management/by-project/${id}`);
        setBundle(res.data);
        setCommentCount(Number(res.data?.comment_count) || 0);
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
  useEffect(() => { setActiveTab('overview'); }, [id]);

  const bundleCompanyId = bundle?.project?.company_id || null;
  useEffect(() => {
    if (!bundleCompanyId || (activeTab !== 'shared' && activeTab !== 'team')) return;
    api.get('/users', { params: { company_id: bundleCompanyId } })
      .then((r) => setCompanyUsers(r.data.users || r.data || []))
      .catch(() => setCompanyUsers([]));
  }, [bundleCompanyId, activeTab]);

  if (loading) {
    return <div className="p-6 text-center text-gray-400 text-sm">Đang tải...</div>;
  }
  if (error) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-3">
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
  const currentFlow = (overview.flow || []).find((s) => s.status === 'current');
  const ownerKey = currentFlow?.module === 'production' ? 'sx' : currentFlow?.module === 'logistics' ? 'vc' : 'crm';
  const ownerUser = overview.owners?.[ownerKey]
    || overview.owners?.sx
    || overview.owners?.crm
    || overview.owners?.vc
    || null;
  const ownerName = ownerUser?.full_name || null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
        <button
          type="button"
          onClick={() => navigate('/management/work-unified')}
          title="Thoát khỏi chi tiết dự án"
          className="inline-flex items-center justify-center h-6 w-6 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 cursor-pointer shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Link to="/management/work-unified" className="hover:text-gray-600">Work Unified</Link>
        <ChevronRight className="h-3 w-3" />
        <span>Dự án</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-gray-600 font-medium">{project.code}</span>
        <ProjectJumpSearch currentId={id} />
      </div>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold" style={{ color: '#111827' }}>{project.name}</h1>
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
          <Link
            to={`/projects/${id}?tab=approvals`}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
          >
            <Shield className="h-4 w-4" />
            Yêu cầu phê duyệt
          </Link>
          <Link
            to={`/projects/${id}?tab=aggregate`}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Tạo công việc
          </Link>
        </div>
      </div>

      <div className="border-b border-gray-100 flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
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
            onClick={() => setActiveTab(t.key)}
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
          onOpenTasks={() => setActiveTab('tasks')}
          fullPageHref={`/projects/${id}?tab=overview`}
        />
      )}
      {activeTab === 'tasks' && <TasksTab projectId={id} />}
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
          onOpenSharedWorkspace={() => setActiveTab('shared')}
        />
      )}
      {activeTab === 'progress' && <ProgressTab projectId={id} flow={overview.flow} />}
      {activeTab === 'documents' && <DocumentsTab projectId={id} leadId={effectiveLeadId} />}
      {activeTab === 'finance' && <FinanceTab projectId={id} />}
      {activeTab === 'acceptance' && <AcceptanceTab projectId={id} flow={overview.flow} />}
      {activeTab === 'chat' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {effectiveLeadId ? (
            <CrmLeadCommentsPanel leadId={effectiveLeadId} forModule="projects" onCountChange={setCommentCount} />
          ) : (
            <ProjectCommentsPanel projectId={id} onCountChange={setCommentCount} />
          )}
        </div>
      )}
      {activeTab === 'history' && <HistoryTab projectId={id} />}

      {activeTab !== 'overview' && (
        <p className="text-xs text-gray-400 text-right pt-1">
          <Link to={`/projects/${id}?tab=${FULL_PAGE_TAB[activeTab] || 'overview'}`} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800">
            Mở trang dự án đầy đủ (CRM · Sản xuất · Vận chuyển)
            <ExternalLink className="h-3 w-3" />
          </Link>
        </p>
      )}
    </div>
  );
}
