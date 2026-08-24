import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useMessengerDock } from '../context/MessengerDockContext';
import { Section, EmptyNote, TasksTab, DocumentsTab, HistoryTab } from './WorkUnifiedProjectDetailPage';
import UnifiedTaskRow from '../components/UnifiedTaskRow';
import WorkTaskExtrasPanel from '../components/WorkTaskExtrasPanel';
import { formatDate } from '../lib/utils';
import {
  ArrowLeft, ChevronRight, ExternalLink, Shield, MessageCircle, Loader2, CheckCircle2, X as XIcon,
} from 'lucide-react';

const DONE_TASK_STATUSES_SX = ['done', 'completed'];

/** Khác với TasksTab (tab Tổng quan, gộp mọi việc CRM/SX/VC/giao việc của dự án),
 *  tab này chỉ hiển thị việc thuộc riêng công đoạn sản xuất (task_kind SX/Dự án). */
function ProductionTasksTab({ projectId }) {
  const [state, setState] = useState({ loading: true, error: '', tasks: [] });
  const [savingId, setSavingId] = useState(null);
  const [extrasTask, setExtrasTask] = useState(null);

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    return api.get(`/work-tasks/by-project/${projectId}`)
      .then((res) => setState({ loading: false, error: '', tasks: res.data?.groups?.production || [] }))
      .catch((e) => setState({ loading: false, error: e?.response?.data?.error || 'Không tải được công việc', tasks: [] }));
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

  if (state.loading) return <Section title="Công việc sản xuất"><EmptyNote>Đang tải...</EmptyNote></Section>;
  if (state.error) return <Section title="Công việc sản xuất"><EmptyNote>{state.error}</EmptyNote></Section>;
  const tasks = state.tasks;
  const completed = tasks.filter((t) => DONE_TASK_STATUSES_SX.includes(String(t.status))).length;

  return (
    <>
      <Section
        title="Công việc sản xuất"
        action={<span className="text-[11px] text-gray-500">{completed}/{tasks.length} hoàn thành</span>}
      >
        {tasks.length === 0 ? (
          <EmptyNote>Chưa có việc nào thuộc công đoạn sản xuất của dự án này (việc CRM/vận chuyển xem ở tab Tổng quan).</EmptyNote>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => {
              const isDone = DONE_TASK_STATUSES_SX.includes(String(t.status));
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

const BUCKET_BADGE_CLS = {
  on_track: 'bg-emerald-50 text-emerald-700',
  waiting_material: 'bg-amber-50 text-amber-700',
  late: 'bg-red-50 text-red-700',
  done: 'bg-gray-100 text-gray-600',
};
const BUCKET_LABEL = {
  on_track: 'Đúng tiến độ',
  waiting_material: 'Chờ vật tư',
  late: 'Trễ hạn',
  done: 'Hoàn tất',
};

const MATERIAL_STATUS_LABEL = {
  draft: 'Nháp',
  requested: 'Đã đề nghị',
  confirmed: 'Đã duyệt/chọn NCC',
  ordered: 'Đã đặt hàng',
  received: 'Đã nhận',
  qc_pass: 'Đạt KCS',
  qc_fail: 'Không đạt KCS',
  done: 'Hoàn tất',
};
const MATERIAL_READY_STATUSES = ['received', 'qc_pass', 'qc_fail', 'done'];

const DETAIL_TABS = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'tasks', label: 'Công việc' },
  { key: 'materials', label: 'Vật tư' },
  { key: 'documents', label: 'Hồ sơ - bản vẽ' },
  { key: 'history', label: 'Hoạt động' },
];

function MaterialsTab({ projectId }) {
  const [state, setState] = useState({ loading: true, error: '', items: [] });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: '', items: [] });
    api.get('/procurement/requests', { params: { project_id: projectId } })
      .then((res) => { if (!cancelled) setState({ loading: false, error: '', items: res.data || [] }); })
      .catch((e) => { if (!cancelled) setState({ loading: false, error: e?.response?.data?.error || 'Không tải được vật tư', items: [] }); });
    return () => { cancelled = true; };
  }, [projectId]);

  if (state.loading) return <Section title="Vật tư"><EmptyNote>Đang tải...</EmptyNote></Section>;
  if (state.error) return <Section title="Vật tư"><EmptyNote>{state.error}</EmptyNote></Section>;
  const items = state.items;

  return (
    <Section title="Vật tư / Đề nghị mua hàng" action={<span className="text-[11px] text-gray-500">{items.length} dòng</span>}>
      {items.length === 0 ? (
        <EmptyNote>Dự án này chưa có yêu cầu vật tư nào.</EmptyNote>
      ) : (
        <div className="divide-y divide-gray-50">
          {items.map((it) => {
            const ready = MATERIAL_READY_STATUSES.includes(it.status);
            return (
              <div key={it.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 truncate">{it.item_name || it.description || 'Vật tư'}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {it.supplier?.name ? `${it.supplier.name} · ` : ''}
                    {it.supplier_committed_date
                      ? `Hẹn giao ${formatDate(it.supplier_committed_date)}`
                      : (it.requested_date ? `Đề nghị ${formatDate(it.requested_date)}` : '')}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                  ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}
                >
                  {MATERIAL_STATUS_LABEL[it.status] || it.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function StageStepper({ stages }) {
  if (!stages.length) return <EmptyNote>Công ty này chưa cấu hình pipeline công đoạn xưởng.</EmptyNote>;

  if (stages.length <= 10) {
    return (
      <div className="flex items-start">
        {stages.map((s, idx) => (
          <div key={s.id} className={`flex items-center ${idx < stages.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center gap-1.5 shrink-0" style={{ width: 84 }}>
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  s.status === 'done' ? 'bg-emerald-500 text-white'
                    : s.status === 'current' ? 'bg-white border-2 border-blue-500 text-blue-600'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {s.status === 'done' ? '✓' : idx + 1}
              </div>
              <p className={`text-[11px] text-center leading-tight ${
                s.status === 'current' ? 'text-blue-700 font-semibold' : s.status === 'done' ? 'text-gray-600' : 'text-gray-400'
              }`}
              >
                {s.name}
              </p>
            </div>
            {idx < stages.length - 1 && (
              <div className={`h-0.5 flex-1 -mt-5 ${s.status === 'done' ? 'bg-emerald-400' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {stages.map((s, idx) => (
        <span
          key={s.id}
          className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg ${
            s.status === 'done' ? 'bg-emerald-50 text-emerald-700'
              : s.status === 'current' ? 'bg-blue-600 text-white'
                : 'text-gray-500 bg-gray-50'
          }`}
        >
          {idx + 1}. {s.name}
        </span>
      ))}
    </div>
  );
}

export default function ProductionProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { openMessengerGroupChat, markGroupRead } = useMessengerDock();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [messagingId, setMessagingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    return api.get(`/management/production-overview/${id}`)
      .then((res) => setBundle(res.data))
      .catch((e) => setError(e?.response?.data?.error || 'Không tải được dữ liệu dự án'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setActiveTab('overview'); }, [id]);

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

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">Đang tải...</div>;
  if (error) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
      </div>
    );
  }
  if (!bundle?.project) return null;

  const {
    project, crm_lead: crmLead, bucket, stages,
    current_stage_idx: currentStageIdx, current_stage_label: currentStageLabel,
    total_stages: totalStages, progress_pct: progressPct, materials, tasks,
  } = bundle;
  const assignee = project.production_person;
  const now = new Date();
  const daysLeft = project.deadline ? Math.ceil((new Date(project.deadline) - now) / 86400000) : null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <button
          type="button"
          onClick={() => navigate('/management/production-overview')}
          title="Thoát khỏi chi tiết dự án"
          className="inline-flex items-center justify-center h-6 w-6 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 cursor-pointer shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Link to="/management/production-overview" className="hover:text-gray-600">Sản xuất</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-gray-600 font-medium">{project.code}</span>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold" style={{ color: '#111827' }}>{project.name}</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${BUCKET_BADGE_CLS[bucket]}`}>
              {BUCKET_LABEL[bucket]}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2 flex items-center gap-3 flex-wrap">
            <span>{project.code}</span>
            {project.company?.name && (
              <span>Đơn vị: <span className="text-gray-700 font-medium">{project.company.name}</span></span>
            )}
            {project.install_address && (
              <span>Công trình: <span className="text-gray-700 font-medium">{project.install_address}</span></span>
            )}
            {crmLead?.code && (
              <Link to={`/crm/leads/${crmLead.id}`} className="text-blue-600 hover:underline">Liên kết CRM {crmLead.code}</Link>
            )}
          </p>
          {assignee?.full_name && (
            <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-2">
              <span>Phụ trách sản xuất: <span className="text-gray-700 font-medium">{assignee.full_name}</span></span>
              <button
                type="button"
                onClick={() => startDirectChat(assignee)}
                disabled={messagingId === assignee.id}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 px-2 py-0.5 rounded-md cursor-pointer"
              >
                {messagingId === assignee.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
                Nhắn tin
              </button>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/projects/${id}?tab=approvals`}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
          >
            <Shield className="h-4 w-4" /> Yêu cầu phê duyệt
          </Link>
          <Link
            to={`/projects/${id}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <ExternalLink className="h-4 w-4" /> Mở dự án
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <StageStepper stages={stages} />
        <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-50">
          Công đoạn hiện tại: <span className="font-medium text-gray-700">{currentStageLabel}</span>
          {project.sx_pipeline_stage_entered_at && (
            <span> · vào công đoạn này từ {formatDate(project.sx_pipeline_stage_entered_at)}</span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Hạn hoàn thành xưởng</p>
          <p className="text-lg font-bold mt-1.5 text-gray-900">{project.deadline ? formatDate(project.deadline) : '—'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {daysLeft == null ? 'Chưa đặt hạn' : daysLeft < 0 ? `Trễ ${Math.abs(daysLeft)} ngày` : `Còn ${daysLeft} ngày`}
            {project.sx_schedule_slip_days > 0 ? ` · trễ tiến độ ${project.sx_schedule_slip_days} ngày` : ''}
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Tiến độ toàn đơn</p>
          <p className="text-lg font-bold mt-1.5 text-blue-600">{progressPct != null ? `${progressPct}%` : '—'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {currentStageIdx != null ? `${currentStageIdx + 1}/${totalStages} công đoạn` : `${totalStages} công đoạn`}
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Sẵn sàng vật tư</p>
          <p className="text-lg font-bold mt-1.5 text-amber-600">{materials.ready_pct != null ? `${materials.ready_pct}%` : '—'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {materials.total === 0 ? 'Chưa có yêu cầu vật tư' : `${materials.pending} dòng vật tư chưa đủ`}
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Việc cần xử lý</p>
          <p className="text-lg font-bold mt-1.5 text-red-600">{tasks.open}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {tasks.overdue > 0 ? `${tasks.overdue} việc quá hạn` : 'Không có việc quá hạn'}
          </p>
        </div>
      </div>

      <div className="border-b border-gray-100 flex items-center gap-1 overflow-x-auto">
        {DETAIL_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`shrink-0 text-sm font-medium px-3 py-2 -mb-px cursor-pointer ${
              activeTab === t.key ? 'font-semibold text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4">
          <TasksTab projectId={id} />
          <MaterialsTab projectId={id} />
        </div>
      )}
      {activeTab === 'tasks' && <ProductionTasksTab projectId={id} />}
      {activeTab === 'materials' && <MaterialsTab projectId={id} />}
      {activeTab === 'documents' && <DocumentsTab projectId={id} leadId={crmLead?.id} />}
      {activeTab === 'history' && <HistoryTab projectId={id} />}

      <p className="text-xs text-gray-400 text-right pt-1">
        <Link to={`/projects/${id}?tab=aggregate`} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800">
          Mở trang dự án đầy đủ (CRM · Sản xuất · Vận chuyển)
          <ExternalLink className="h-3 w-3" />
        </Link>
      </p>
    </div>
  );
}
