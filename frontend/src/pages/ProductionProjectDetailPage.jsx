import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useMessengerDock } from '../context/MessengerDockContext';
import { Section, EmptyNote, TasksTab, DocumentsTab, HistoryTab } from './WorkUnifiedProjectDetailPage';
import UnifiedTaskRow from '../components/UnifiedTaskRow';
import WorkTaskExtrasPanel from '../components/WorkTaskExtrasPanel';
import { FileUploadButton, FilePreview } from '../components/FileUpload';
import { formatDate } from '../lib/utils';
import {
  ArrowLeft, ChevronRight, ExternalLink, Shield, MessageCircle, Loader2, CheckCircle2, Package, AlertTriangle,
  Pencil, Plus, XCircle, X as XIcon,
} from 'lucide-react';

const DONE_TASK_STATUSES_SX = ['done', 'completed', 'cancelled'];

/** Khác với TasksTab (tab Tổng quan, gộp mọi việc CRM/SX/VC/giao việc của dự án),
 *  tab này chỉ hiển thị việc thuộc riêng công đoạn sản xuất (task_kind SX/Dự án). */
function ProductionTasksTab({ projectId, companyId }) {
  const [state, setState] = useState({ loading: true, error: '', tasks: [] });
  const [savingId, setSavingId] = useState(null);
  const [extrasTask, setExtrasTask] = useState(null);

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    return api.get(`/work-tasks/by-project/${projectId}`, { params: companyId ? { company_id: companyId } : {} })
      .then((res) => setState({ loading: false, error: '', tasks: res.data?.groups?.production || [] }))
      .catch((e) => setState({ loading: false, error: e?.response?.data?.error || 'Không tải được công việc', tasks: [] }));
  }, [companyId, projectId]);

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
  done: 'Đã qua sản xuất',
};

const HEALTH_BADGE_CLS = {
  on_track: 'bg-emerald-50 text-emerald-700',
  at_risk: 'bg-amber-50 text-amber-700',
  blocked: 'bg-red-50 text-red-700',
  completed: 'bg-blue-50 text-blue-700',
};
const HEALTH_LABEL = {
  on_track: 'Đúng tiến độ',
  at_risk: 'Có rủi ro',
  blocked: 'Đang bị chặn',
  completed: 'Đã hoàn thành',
};
const PHASE_STATE_STYLE = {
  completed: { card: 'border-emerald-200 bg-emerald-50/40', dot: 'bg-emerald-500', text: 'Hoàn thành' },
  current: { card: 'border-blue-200 bg-blue-50/50', dot: 'bg-blue-500', text: 'Đang thực hiện' },
  blocked: { card: 'border-red-200 bg-red-50/50', dot: 'bg-red-500', text: 'Đang bị chặn' },
  at_risk: { card: 'border-amber-200 bg-amber-50/50', dot: 'bg-amber-500', text: 'Có rủi ro' },
  unknown: { card: 'border-slate-200 bg-slate-50', dot: 'bg-slate-400', text: 'Chưa đủ dữ liệu' },
  pending: { card: 'border-slate-200 bg-white', dot: 'bg-slate-300', text: 'Chưa bắt đầu' },
};

function ProjectMacroHealth({ contract }) {
  const phases = contract?.phases || [];
  if (!phases.length) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Vòng đời Project</p>
          <h2 className="mt-1 text-sm font-bold text-slate-900">Tình trạng 8 chặng vận hành</h2>
        </div>
        <p className="text-[11px] text-slate-500">Chặng hiện tại: <span className="font-bold text-slate-800">{contract.current_phase_label || 'Chưa xác định'}</span></p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {phases.map((phase, index) => {
          const style = PHASE_STATE_STYLE[phase.state] || PHASE_STATE_STYLE.pending;
          const issue = phase.blockers?.[0] || phase.missing_requirements?.[0] || '';
          const issueCount = (phase.blockers?.length || 0) + (phase.missing_requirements?.length || 0);
          return (
            <article key={phase.key} className={`rounded-xl border p-3 ${style.card}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
                  <p className="truncate text-xs font-extrabold text-slate-900">{index + 1}. {phase.label}</p>
                </div>
                <span className="shrink-0 text-[9px] font-bold text-slate-500">{style.text}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${phase.progress_pct ?? 0}%` }} />
                </div>
                <span className="w-9 text-right text-[10px] font-black text-slate-700">{phase.progress_pct == null ? '—' : `${phase.progress_pct}%`}</span>
              </div>
              <div className="mt-3 space-y-1 text-[10px] text-slate-500">
                <p className="truncate">Phụ trách: <span className="font-semibold text-slate-700">{phase.owner?.full_name || 'Chưa phân công'}</span></p>
                <p>Deadline: <span className="font-semibold text-slate-700">{phase.deadline ? formatDate(phase.deadline) : 'Chưa đặt'}</span></p>
              </div>
              {issue && (
                <div className={`mt-3 flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-[9px] font-semibold ${phase.blockers?.length ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="line-clamp-2">{issue}{issueCount > 1 ? ` · +${issueCount - 1}` : ''}</span>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

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
  { key: 'changes', label: 'Phát sinh & thay đổi' },
  { key: 'documents', label: 'Hồ sơ - bản vẽ' },
  { key: 'history', label: 'Hoạt động' },
];

const CHANGE_STATUS_LABEL = {
  open: 'Đang mở',
  in_progress: 'Đang xử lý',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  auto_approved: 'Tự động duyệt',
  rejected: 'Từ chối',
  resolved: 'Đã xử lý',
  closed: 'Đã đóng',
};
const CHANGE_STATUS_CLASS = {
  open: 'bg-red-50 text-red-700',
  in_progress: 'bg-amber-50 text-amber-700',
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  auto_approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-slate-100 text-slate-600',
  resolved: 'bg-blue-50 text-blue-700',
  closed: 'bg-slate-100 text-slate-600',
};

function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
}

const PROJECT_PHASE_OPTIONS = [
  ['design', 'Thiết kế'], ['procurement', 'Thu mua'], ['production', 'Sản xuất'], ['quality', 'KCS'],
  ['packing', 'Kho/Đóng gói'], ['delivery', 'Giao nhận'], ['installation', 'Lắp đặt'], ['acceptance', 'Nghiệm thu'],
];
const PROJECT_PHASE_LABEL = Object.fromEntries(PROJECT_PHASE_OPTIONS);
const CHANGE_TYPE_OPTIONS = [
  ['operational_incident', 'Sự cố vận hành'], ['customer_request', 'Yêu cầu khách hàng'],
  ['design_change', 'Thay đổi thiết kế'], ['material_change', 'Thay đổi vật tư'],
  ['quantity_change', 'Thay đổi khối lượng'], ['site_condition', 'Điều kiện công trường'],
  ['rework', 'Thi công lại'], ['commercial_change', 'Phát sinh thương mại'], ['other', 'Khác'],
];
const COST_BEARER_OPTIONS = [
  ['', 'Chưa xác định'], ['company', 'Doanh nghiệp'], ['customer', 'Khách hàng'],
  ['supplier', 'Nhà cung cấp'], ['employee', 'Nhân sự'], ['shared', 'Chia sẻ nhiều bên'],
];
const COST_BEARER_LABEL = Object.fromEntries(COST_BEARER_OPTIONS);

function changeFormInitial(item) {
  return {
    change_type: item?.change_type || 'operational_incident',
    title: item?.title || '',
    cause: item?.cause || '',
    description: item?.description || '',
    phase_key: item?.phase_key || '',
    owner_user_id: item?.owner?.id || '',
    severity: item?.severity || 'medium',
    cost_impact: item?.impact?.cost_amount ?? '',
    schedule_impact_days: item?.impact?.schedule_days ?? '',
    cost_bearer: item?.impact?.cost_bearer || '',
    requires_approval: item?.approval?.required === true,
    attachments: item?.attachments || [],
  };
}

function ProjectChangeForm({ projectId, item, users, onSaved, onCancel }) {
  const [form, setForm] = useState(() => changeFormInitial(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    if (!form.title.trim()) return setError('Nhập tiêu đề phát sinh');
    if (!form.cause.trim()) return setError('Nhập nguyên nhân phát sinh');
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        cause: form.cause.trim(),
        description: form.description.trim() || null,
        phase_key: form.phase_key || null,
        owner_user_id: form.owner_user_id || null,
        cost_impact: form.cost_impact === '' ? null : Number(form.cost_impact),
        schedule_impact_days: form.schedule_impact_days === '' ? null : Number(form.schedule_impact_days),
        cost_bearer: form.cost_bearer || null,
      };
      if (item?.id) await api.patch(`/production/projects/${projectId}/incidents/${item.id}`, payload);
      else await api.post(`/production/projects/${projectId}/incidents`, payload);
      await onSaved?.();
    } catch (e) {
      setError(e?.response?.data?.error || 'Không lưu được hồ sơ phát sinh');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600">{item?.id ? 'Cập nhật hồ sơ' : 'Hồ sơ mới'}</p>
          <h3 className="mt-1 text-sm font-bold text-slate-900">{item?.id ? item.title : 'Ghi nhận phát sinh Project'}</h3>
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><XIcon className="h-4 w-4" /></button>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</div>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-xs font-semibold text-slate-700">
          Loại phát sinh <span className="text-red-500">*</span>
          <select value={form.change_type} onChange={(e) => setField('change_type', e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal">
            {CHANGE_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Tiêu đề <span className="text-red-500">*</span>
          <input value={form.title} onChange={(e) => setField('title', e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" placeholder="Ví dụ: Khách đổi vật liệu mặt bếp" />
        </label>
        <label className="text-xs font-semibold text-slate-700 md:col-span-2">
          Nguyên nhân <span className="text-red-500">*</span>
          <input value={form.cause} onChange={(e) => setField('cause', e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" placeholder="Vì sao phát sinh thay đổi này?" />
        </label>
        <label className="text-xs font-semibold text-slate-700 md:col-span-2">
          Nội dung chi tiết <span className="font-normal text-slate-400">(không bắt buộc)</span>
          <textarea value={form.description} onChange={(e) => setField('description', e.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" placeholder="Mô tả phạm vi, yêu cầu hoặc phương án xử lý..." />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Chặng bị ảnh hưởng
          <select value={form.phase_key} onChange={(e) => setField('phase_key', e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal">
            <option value="">Chưa xác định</option>
            {PROJECT_PHASE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Người chịu trách nhiệm
          <select value={form.owner_user_id} onChange={(e) => setField('owner_user_id', e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal">
            <option value="">Chưa phân công</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Mức độ
          <select value={form.severity} onChange={(e) => setField('severity', e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal">
            <option value="low">Thấp — không ảnh hưởng tiến độ</option>
            <option value="medium">Trung bình — cần theo dõi</option>
            <option value="high">Cao — ảnh hưởng Project</option>
            <option value="critical">Khẩn cấp — dừng vận hành</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Bên chịu chi phí
          <select value={form.cost_bearer} onChange={(e) => setField('cost_bearer', e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal">
            {COST_BEARER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Ảnh hưởng chi phí <span className="font-normal text-slate-400">(VNĐ)</span>
          <input type="number" min="0" value={form.cost_impact} onChange={(e) => setField('cost_impact', e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" placeholder="0" />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Ảnh hưởng tiến độ <span className="font-normal text-slate-400">(ngày)</span>
          <input type="number" min="0" step="1" value={form.schedule_impact_days} onChange={(e) => setField('schedule_impact_days', e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" placeholder="0" />
        </label>
        <div className="md:col-span-2">
          <p className="text-xs font-semibold text-slate-700">Bằng chứng / tài liệu</p>
          <div className="mt-1"><FileUploadButton compact onFilesUploaded={(files) => setField('attachments', [...form.attachments, ...files])} /></div>
          <FilePreview files={form.attachments} onRemove={(index) => setField('attachments', form.attachments.filter((_, i) => i !== index))} small />
        </div>
        <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 md:col-span-2">
          <input type="checkbox" checked={form.requires_approval} onChange={(e) => setField('requires_approval', e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span><strong>Yêu cầu quản lý phê duyệt</strong><br /><span className="text-amber-700">Bật khi thay đổi ảnh hưởng chi phí, tiến độ hoặc cam kết với khách hàng.</span></span>
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Hủy</button>
        <button type="button" onClick={submit} disabled={saving} className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50">
          {saving ? 'Đang lưu...' : item?.id ? 'Lưu thay đổi' : 'Tạo hồ sơ phát sinh'}
        </button>
      </div>
    </section>
  );
}

function ProjectChangesTab({ contract, projectId, companyId, crmLead, currentUser, onChanged }) {
  const stats = contract?.stats || {};
  const items = contract?.items || [];
  const incidentUrl = `/sx/projects/${projectId}?tab=incidents`;
  const approvalUrl = `/projects/${projectId}?tab=approvals`;
  const [formItem, setFormItem] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [users, setUsers] = useState([]);
  const [mutatingId, setMutatingId] = useState(null);
  const canApprove = ['admin', 'sales_admin', 'platform_admin', 'manager', 'production_admin', 'crm_production_admin']
    .includes(String(currentUser?.role || '').toLowerCase());

  useEffect(() => {
    let cancelled = false;
    api.get('/crm/employees-by-company', { params: { ...(companyId ? { company_id: companyId } : {}), for_module: 'production' } })
      .then((response) => {
        const rows = response.data?.users || response.data || [];
        if (!cancelled) setUsers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [companyId]);

  const refreshAfterForm = async () => {
    setFormItem(null);
    setShowCreateForm(false);
    await onChanged?.();
  };

  const mutateChange = async (item, payload) => {
    setMutatingId(item.id);
    try {
      await api.patch(`/production/projects/${projectId}/incidents/${item.id}`, payload);
      await onChanged?.();
    } catch (e) {
      alert(e?.response?.data?.error || 'Không cập nhật được hồ sơ phát sinh');
    } finally {
      setMutatingId(null);
    }
  };

  const rejectChange = async (item) => {
    const reason = window.prompt('Nhập lý do từ chối phát sinh:');
    if (!reason?.trim()) return;
    await mutateChange(item, { approval_action: 'reject', rejected_reason: reason.trim() });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-600">project_changes_v1</p>
            <h2 className="mt-1 text-sm font-bold text-slate-900">Hồ sơ Phát sinh & Thay đổi</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              Tổng hợp từ sự cố Project, phê duyệt và Deal phát sinh. Mỗi bản ghi vẫn được cập nhật tại module nguồn để giữ đúng audit.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setFormItem(null); setShowCreateForm(true); }} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50">
              <Plus className="h-3.5 w-3.5" /> Tạo phát sinh
            </button>
            <Link to={approvalUrl} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700">
              Mở phê duyệt
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl bg-red-50 p-3">
            <p className="text-[10px] font-semibold text-red-600">Sự cố đang mở</p>
            <p className="mt-1 text-xl font-black text-red-700">{stats.open_incidents || 0}</p>
            <p className="mt-0.5 text-[10px] text-red-500">{stats.blocking_incidents || 0} blocker nghiêm trọng</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-3">
            <p className="text-[10px] font-semibold text-amber-600">Chờ phê duyệt</p>
            <p className="mt-1 text-xl font-black text-amber-700">{stats.pending_approvals || 0}</p>
            <p className="mt-0.5 text-[10px] text-amber-500">{stats.pending_change_approvals || 0} phát sinh cần quyết định</p>
          </div>
          <div className="rounded-xl bg-blue-50 p-3">
            <p className="text-[10px] font-semibold text-blue-600">Đơn hàng phát sinh</p>
            <p className="mt-1 text-xl font-black text-blue-700">{stats.commercial_additions || 0}</p>
            <p className="mt-0.5 text-[10px] text-blue-500">{stats.approved_commercial_additions || 0} đã được chốt</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="text-[10px] font-semibold text-emerald-600">Doanh thu phát sinh duyệt</p>
            <p className="mt-1 text-lg font-black text-emerald-700">{formatCurrency(stats.approved_commercial_value)}</p>
            <p className="mt-0.5 text-[10px] text-emerald-500">Chỉ tính Deal phát sinh đã thắng</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Nguồn dữ liệu thật</span>
          {(contract?.coverage || []).map((source) => (
            <span key={source.source} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
              {source.label}: {source.count}
            </span>
          ))}
          {(stats.records_missing_contract_fields || 0) > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
              <AlertTriangle className="h-3 w-3" /> {stats.records_missing_contract_fields} hồ sơ cần bổ sung dữ liệu
            </span>
          )}
        </div>
      </section>

      {(showCreateForm || formItem) && (
        <ProjectChangeForm
          key={formItem?.id || 'create'}
          projectId={projectId}
          item={formItem}
          users={users}
          onSaved={refreshAfterForm}
          onCancel={() => { setFormItem(null); setShowCreateForm(false); }}
        />
      )}

      {items.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
          <p className="mt-3 text-sm font-bold text-slate-800">Chưa có phát sinh hoặc yêu cầu duyệt</p>
          <p className="mt-1 text-xs text-slate-500">Khi có sự cố, phê duyệt hoặc đơn hàng phát sinh, hồ sơ sẽ xuất hiện tại đây.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => setShowCreateForm(true)} className="text-xs font-semibold text-violet-600 hover:underline">Tạo hồ sơ đầu tiên</button>
            {crmLead?.id && <Link to={`/crm/leads/${crmLead.id}`} className="text-xs font-semibold text-blue-600 hover:underline">Mở Deal nguồn để tạo đơn hàng phát sinh</Link>}
          </div>
        </section>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={`${item.source}:${item.id}`} className={`rounded-2xl border bg-white p-4 shadow-sm ${item.blocks_project ? 'border-red-200' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-violet-600">{item.record_type_label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CHANGE_STATUS_CLASS[item.status] || 'bg-slate-100 text-slate-600'}`}>
                      {CHANGE_STATUS_LABEL[item.status] || item.status}
                    </span>
                    {item.approval?.required && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CHANGE_STATUS_CLASS[item.approval.status] || 'bg-slate-100 text-slate-600'}`}>
                        Duyệt: {CHANGE_STATUS_LABEL[item.approval.status] || item.approval.status}
                      </span>
                    )}
                    {item.blocks_project && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">Blocker Project</span>}
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-slate-900">{item.title}</h3>
                  {item.cause && <p className="mt-1 text-xs font-medium text-slate-700">Nguyên nhân: {item.cause}</p>}
                  {item.description && <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {item.record_type === 'operational_incident' && (
                    <button type="button" onClick={() => { setShowCreateForm(false); setFormItem(item); }} className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:underline"><Pencil className="h-3 w-3" /> Sửa</button>
                  )}
                  <Link to={item.source_url || incidentUrl} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
                    Mở nguồn <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
                <p>Tạo ngày: <span className="font-semibold text-slate-700">{item.created_at ? formatDate(item.created_at) : 'Chưa rõ'}</span></p>
                <p>Phụ trách: <span className="font-semibold text-slate-700">{item.owner?.full_name || 'Chưa phân công'}</span></p>
                <p>Giai đoạn: <span className="font-semibold text-slate-700">{PROJECT_PHASE_LABEL[item.phase_key] || item.stage?.name || 'Theo Project'}</span></p>
                <p>Chứng cứ: <span className="font-semibold text-slate-700">{item.attachments?.length || 0} tệp</span></p>
              </div>

              {(item.impact?.commercial_value > 0 || item.impact?.cost_amount != null || item.impact?.schedule_days != null) && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 text-[10px]">
                  {item.impact.commercial_value > 0 && <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">Giá trị: {formatCurrency(item.impact.commercial_value)}</span>}
                  {item.impact.cost_amount != null && <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700">Ảnh hưởng chi phí: {formatCurrency(item.impact.cost_amount)}</span>}
                  {item.impact.schedule_days != null && <span className="rounded-full bg-violet-50 px-2 py-1 font-semibold text-violet-700">Ảnh hưởng: {item.impact.schedule_days} ngày</span>}
                  {item.impact.cost_bearer && <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">Bên chịu: {COST_BEARER_LABEL[item.impact.cost_bearer] || item.impact.cost_bearer}</span>}
                </div>
              )}

              {item.attachments?.length > 0 && <FilePreview files={item.attachments} small />}

              {item.record_type === 'operational_incident' && (
                <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                  {['open', 'in_progress'].includes(item.status) && item.status !== 'in_progress' && (
                    <button type="button" disabled={mutatingId === item.id} onClick={() => mutateChange(item, { status: 'in_progress' })} className="rounded-lg border border-amber-200 px-3 py-1.5 text-[11px] font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50">Bắt đầu xử lý</button>
                  )}
                  {['open', 'in_progress'].includes(item.status) && (
                    <button type="button" disabled={mutatingId === item.id} onClick={() => mutateChange(item, { status: 'resolved' })} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">Đã xử lý</button>
                  )}
                  {canApprove && item.approval?.status === 'pending' && (
                    <>
                      <button type="button" disabled={mutatingId === item.id} onClick={() => rejectChange(item)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"><XCircle className="h-3 w-3" /> Từ chối</button>
                      <button type="button" disabled={mutatingId === item.id} onClick={() => mutateChange(item, { approval_action: 'approve' })} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 className="h-3 w-3" /> Phê duyệt</button>
                    </>
                  )}
                </div>
              )}

              {item.missing_fields?.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p><span className="font-bold">Hồ sơ chưa đủ chuẩn:</span> {item.missing_fields.join(' · ')}</p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

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

export default function ProductionProjectDetailPage({
  projectId,
  companyId: companyIdProp,
  workspaceCompany,
  embedded = false,
} = {}) {
  const { id: routeProjectId } = useParams();
  const id = projectId || routeProjectId;
  const [searchParams] = useSearchParams();
  const companyId = companyIdProp || searchParams.get('company_id') || '';
  const companyQuery = companyId ? `?company_id=${encodeURIComponent(companyId)}` : '';
  const overviewUrl = `/business-os/operations${companyQuery}`;
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
    return api.get(`/management/production-overview/${id}`, { params: companyId ? { company_id: companyId } : {} })
      .then((res) => setBundle(res.data))
      .catch((e) => setError(e?.response?.data?.error || 'Không tải được dữ liệu dự án'))
      .finally(() => setLoading(false));
  }, [companyId, id]);

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
    total_stages: totalStages, progress_pct: progressPct, materials, tasks, logistics,
    health_contract: healthContract,
    changes_contract: changesContract,
  } = bundle;
  const macroPhases = healthContract?.phases || [];
  const currentPhase = macroPhases.find((phase) => phase.key === healthContract?.current_phase_key) || null;
  const assignee = currentPhase?.owner || project.production_person;
  const now = new Date();
  const currentDeadline = currentPhase?.deadline || project.deadline;
  const daysLeft = currentDeadline ? Math.ceil((new Date(currentDeadline) - now) / 86400000) : null;
  const displayedProgress = healthContract?.overall_progress_pct ?? progressPct;
  const displayedHealth = healthContract?.health_status || bucket;

  return (
    <div className={`${embedded ? 'max-w-[1540px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7' : 'max-w-5xl p-4 md:p-6'} mx-auto space-y-5`}>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <button
          type="button"
          onClick={() => navigate(overviewUrl)}
          title="Thoát khỏi chi tiết dự án"
          className="inline-flex items-center justify-center h-6 w-6 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 cursor-pointer shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Link to={overviewUrl} className="hover:text-gray-600">Vận hành</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-gray-600 font-medium">{project.code}</span>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold" style={{ color: '#111827' }}>{project.name}</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${HEALTH_BADGE_CLS[displayedHealth] || BUCKET_BADGE_CLS[bucket]}`}>
              {HEALTH_LABEL[displayedHealth] || BUCKET_LABEL[bucket]}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2 flex items-center gap-3 flex-wrap">
            <span>{project.code}</span>
            {embedded && workspaceCompany?.id && String(workspaceCompany.id) !== String(project.company_id) && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                Project liên công ty · đang xem từ {workspaceCompany.short_name || workspaceCompany.name}
              </span>
            )}
            {project.company?.name && (
              <span>Đơn vị thực hiện: <span className="text-gray-700 font-medium">{project.company.name}</span></span>
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
              <span>Phụ trách {currentPhase?.label || 'hiện tại'}: <span className="text-gray-700 font-medium">{assignee.full_name}</span></span>
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
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/projects/${id}?tab=approvals`}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
          >
            <Shield className="h-4 w-4" /> Yêu cầu phê duyệt
          </Link>
          <Link
            to={`/projects/${id}`}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <ExternalLink className="h-4 w-4" /> Mở hồ sơ nguồn
          </Link>
        </div>
      </div>

      {healthContract ? <ProjectMacroHealth contract={healthContract} /> : (
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <StageStepper stages={stages} />
          <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-50">
            Công đoạn hiện tại: <span className="font-medium text-gray-700">{currentStageLabel}</span>
          </p>
        </div>
      )}

      {logistics?.stage && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 shadow-sm"><Package className="h-4 w-4" /></span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">{logistics.phase === 'installation' ? 'Đang lắp đặt' : 'Đang vận chuyển'}</p>
                <p className="mt-1 text-sm font-bold text-gray-900">{logistics.stage.name}</p>
                <p className="mt-1 text-xs text-gray-500">{logistics.company?.name || 'Chưa chọn đơn vị VC/LĐ'} · {(logistics.phase === 'installation' ? logistics.installation_person : logistics.logistics_person)?.full_name || 'Chưa phân công'}</p>
              </div>
            </div>
            <div className="text-xs text-gray-500 sm:text-right">
              <p>Ngày giao: <span className="font-medium text-gray-700">{logistics.delivery_date ? formatDate(logistics.delivery_date) : 'Chưa đặt'}</span></p>
              <p className="mt-1">Ngày lắp: <span className="font-medium text-gray-700">{logistics.install_date ? formatDate(logistics.install_date) : 'Chưa đặt'}</span></p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Hạn chặng hiện tại</p>
          <p className="text-lg font-bold mt-1.5 text-gray-900">{currentDeadline ? formatDate(currentDeadline) : '—'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {healthContract
              ? (daysLeft == null ? 'Chưa đặt hạn' : daysLeft < 0 ? `Trễ ${Math.abs(daysLeft)} ngày` : `Còn ${daysLeft} ngày`)
              : (bucket === 'done' ? 'Đã chuyển sang chặng sau' : daysLeft == null ? 'Chưa đặt hạn' : daysLeft < 0 ? `Trễ ${Math.abs(daysLeft)} ngày` : `Còn ${daysLeft} ngày`)}
            {project.sx_schedule_slip_days > 0 ? ` · trễ tiến độ ${project.sx_schedule_slip_days} ngày` : ''}
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Tiến độ toàn Project</p>
          <p className="text-lg font-bold mt-1.5 text-blue-600">{displayedProgress != null ? `${displayedProgress}%` : '—'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {healthContract ? `${macroPhases.filter((phase) => phase.progress_pct === 100).length}/8 chặng hoàn thành` : (currentStageIdx != null ? `${currentStageIdx + 1}/${totalStages} công đoạn` : `${totalStages} công đoạn`)}
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
          <p className="text-xs text-gray-500">Blocker Project</p>
          <p className="text-lg font-bold mt-1.5 text-red-600">{healthContract?.blocker_count ?? tasks.open}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {healthContract
              ? `${healthContract.at_risk_phase_count || 0} chặng có rủi ro${changesContract?.stats?.blocking_incidents ? ` · ${changesContract.stats.blocking_incidents} phát sinh nghiêm trọng` : ''}`
              : (tasks.overdue > 0 ? `${tasks.overdue} việc quá hạn` : 'Không có việc quá hạn')}
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
          <TasksTab projectId={id} companyId={companyId} />
          <MaterialsTab projectId={id} />
        </div>
      )}
      {activeTab === 'tasks' && <ProductionTasksTab projectId={id} companyId={companyId} />}
      {activeTab === 'materials' && <MaterialsTab projectId={id} />}
      {activeTab === 'changes' && (
        <ProjectChangesTab
          contract={changesContract}
          projectId={id}
          companyId={project.company_id || companyId}
          crmLead={crmLead}
          currentUser={currentUser}
          onChanged={load}
        />
      )}
      {activeTab === 'documents' && <DocumentsTab projectId={id} leadId={crmLead?.id} />}
      {activeTab === 'history' && <HistoryTab projectId={id} />}

      <p className="text-xs text-gray-400 text-right pt-1">
        <Link to={`/projects/${id}?tab=aggregate${companyId ? `&company_id=${encodeURIComponent(companyId)}` : ''}`} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800">
          Mở trang dự án đầy đủ (CRM · Sản xuất · Vận chuyển)
          <ExternalLink className="h-3 w-3" />
        </Link>
      </p>
    </div>
  );
}
