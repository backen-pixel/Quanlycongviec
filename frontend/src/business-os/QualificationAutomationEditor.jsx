import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  Clock3,
  History,
  ListChecks,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import api from '../lib/api';

const PRIORITIES = [
  ['low', 'Thấp'],
  ['medium', 'Trung bình'],
  ['high', 'Cao'],
  ['urgent', 'Khẩn cấp'],
];

const ASSIGNMENT_OPTIONS = [
  ['record_owner', 'Owner hồ sơ'],
  ['actor', 'Người bắt đầu bước'],
  ['unassigned', 'Chưa phân công'],
];

const CHANGE_LABELS = {
  seed: 'Cấu hình ban đầu',
  update: 'Cập nhật automation',
  rollback: 'Khôi phục phiên bản',
};

function hoursFromMinutes(value) {
  return Math.round((Number(value || 0) / 60) * 10) / 10;
}

function minutesFromHours(value) {
  return Math.max(0, Math.round(Number(value || 0) * 60));
}

function newTaskItem() {
  return {
    item_key: `task_${Date.now()}`,
    title: '',
    description: '',
    priority: 'medium',
    deadline_minutes: 120,
    assignment_strategy: 'record_owner',
    blocks_stage_advance: false,
    completion_requires_file_or_note: false,
    required_evidence_file_types: [],
    requires_quick_verdict: false,
  };
}

export default function QualificationAutomationEditor({
  companyId,
  canConfigure = false,
  stageKey = 'qualification',
  stageLabel = 'Qualification',
}) {
  const [automation, setAutomation] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const endpoint = stageKey === 'qualification'
    ? '/business-os/qualification-automation'
    : `/business-os/stage-automations/${stageKey}`;

  const load = useCallback(async ({ showLoading = true } = {}) => {
    if (!companyId) return;
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [automationResponse, versionsResponse] = await Promise.all([
        api.get(endpoint, { params: { company_id: companyId } }),
        api.get(`${endpoint}/versions`, { params: { company_id: companyId } }),
      ]);
      setAutomation(automationResponse.data?.automation || null);
      setVersions(versionsResponse.data?.versions || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || `Không tải được task template và SLA ${stageLabel}.`);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [companyId, endpoint, stageLabel]);

  useEffect(() => {
    void load();
  }, [load]);

  const blockingCount = useMemo(
    () => (automation?.task_items || []).filter((item) => item.blocks_stage_advance).length,
    [automation?.task_items],
  );

  const patchPolicy = (key, value) => {
    setAutomation((current) => ({
      ...current,
      sla_policy: { ...current.sla_policy, [key]: value },
    }));
    setSuccess('');
  };

  const patchTask = (index, patch) => {
    setAutomation((current) => ({
      ...current,
      task_items: current.task_items.map((item, taskIndex) => (
        taskIndex === index ? { ...item, ...patch } : item
      )),
    }));
    setSuccess('');
  };

  const addTask = () => {
    setAutomation((current) => ({ ...current, task_items: [...(current.task_items || []), newTaskItem()] }));
    setSuccess('');
  };

  const removeTask = (index) => {
    setAutomation((current) => ({
      ...current,
      task_items: current.task_items.filter((_, taskIndex) => taskIndex !== index),
    }));
    setSuccess('');
  };

  const save = async () => {
    if (!companyId || !canConfigure || !automation) return;
    const emptyTask = automation.task_items.find((item) => !item.title?.trim());
    if (emptyTask) {
      setError('Mỗi nhiệm vụ mẫu cần có tên.');
      return;
    }
    setBusy('save');
    setError('');
    setSuccess('');
    try {
      const { data } = await api.put(endpoint, {
        company_id: companyId,
        automation: {
          name: automation.name,
          sla_policy: automation.sla_policy,
          task_items: automation.task_items,
        },
      });
      setAutomation(data?.automation || automation);
      setSuccess(`Đã áp dụng task template và chính sách SLA cho ${stageLabel}.`);
      await load({ showLoading: false });
    } catch (requestError) {
      setError(requestError.response?.data?.error || `Không lưu được automation ${stageLabel}.`);
    } finally {
      setBusy('');
    }
  };

  const rollback = async (version) => {
    if (!window.confirm(`Khôi phục task template và SLA từ phiên bản ${version}? Hệ thống sẽ tạo phiên bản mới.`)) return;
    setBusy(`rollback:${version}`);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post(`${endpoint}/rollback`, {
        company_id: companyId,
        version,
      });
      setAutomation(data?.automation || automation);
      setSuccess(`Đã khôi phục automation từ phiên bản ${version}.`);
      await load({ showLoading: false });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không khôi phục được automation.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-violet-600" />
            <h3 className="text-sm font-extrabold text-slate-950">Task template & SLA · {stageLabel}</h3>
            {automation?.version && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">v{automation.version}</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">Tự sinh công việc thật khi bắt đầu bước, cảnh báo theo lịch làm việc và chống tạo trùng.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-extrabold">
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">{automation?.task_items?.length || 0} nhiệm vụ mẫu</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{blockingCount} chặn chuyển bước</span>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">SLA {hoursFromMinutes(automation?.sla_policy?.duration_minutes)} giờ làm việc</span>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-xs font-semibold text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tải automation…
        </div>
      ) : error && !automation ? (
        <div className="m-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      ) : automation ? (
        <>
          <div className="grid gap-4 border-b border-slate-200 bg-slate-50/60 p-5 lg:grid-cols-[1fr_1fr_1.4fr]">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><Clock3 className="h-3.5 w-3.5" /> SLA {stageLabel}</span>
              <div className="relative">
                <input type="number" min="0.25" max="720" step="0.25" disabled={!canConfigure} value={hoursFromMinutes(automation.sla_policy.duration_minutes)} onChange={(event) => patchPolicy('duration_minutes', minutesFromHours(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 pr-24 text-xs font-bold outline-none focus:border-blue-400 disabled:bg-slate-100" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">giờ làm việc</span>
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><BellRing className="h-3.5 w-3.5" /> Cảnh báo trước hạn</span>
              <div className="relative">
                <input type="number" min="0" max={hoursFromMinutes(automation.sla_policy.duration_minutes)} step="0.25" disabled={!canConfigure} value={hoursFromMinutes(automation.sla_policy.warning_minutes)} onChange={(event) => patchPolicy('warning_minutes', minutesFromHours(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 pr-24 text-xs font-bold outline-none focus:border-blue-400 disabled:bg-slate-100" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">giờ làm việc</span>
              </div>
            </label>
            <div>
              <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Người nhận escalation nội bộ</span>
              <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                {[
                  ['escalate_at_risk_to_owner', 'Owner khi sắp hạn'],
                  ['escalate_overdue_to_owner', 'Owner khi quá hạn'],
                  ['escalate_overdue_to_company_admins', 'Admin công ty khi quá hạn'],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-700">
                    <input type="checkbox" disabled={!canConfigure} checked={automation.sla_policy[key] === true} onChange={(event) => patchPolicy(key, event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" /> {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {(automation.task_items || []).map((item, index) => (
              <div key={item.item_key || item.id || index} className="grid gap-3 p-5 xl:grid-cols-[36px_minmax(220px,1.5fr)_140px_145px_150px_240px_36px] xl:items-center">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black text-slate-500">{index + 1}</span>
                <div>
                  <input disabled={!canConfigure} value={item.title} onChange={(event) => patchTask(index, { title: event.target.value })} className="h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-900 outline-none focus:border-violet-400 disabled:bg-slate-50" placeholder="Tên nhiệm vụ" />
                  <input disabled={!canConfigure} value={item.description || ''} onChange={(event) => patchTask(index, { description: event.target.value })} className="mt-1.5 h-8 w-full rounded-lg border border-slate-100 px-3 text-[10px] text-slate-500 outline-none focus:border-violet-300 disabled:bg-slate-50" placeholder="Mô tả hoặc Definition of Done" />
                </div>
                <label>
                  <span className="mb-1 block text-[9px] font-bold uppercase text-slate-400">Ưu tiên</span>
                  <select disabled={!canConfigure} value={item.priority} onChange={(event) => patchTask(index, { priority: event.target.value })} className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-[10px] font-semibold disabled:bg-slate-50">{PRIORITIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
                </label>
                <label>
                  <span className="mb-1 block text-[9px] font-bold uppercase text-slate-400">Hạn sau</span>
                  <div className="relative"><input type="number" min="0" step="0.25" disabled={!canConfigure} value={hoursFromMinutes(item.deadline_minutes)} onChange={(event) => patchTask(index, { deadline_minutes: minutesFromHours(event.target.value) })} className="h-9 w-full rounded-xl border border-slate-200 px-2 pr-9 text-[10px] font-semibold disabled:bg-slate-50" /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400">giờ</span></div>
                </label>
                <label>
                  <span className="mb-1 block text-[9px] font-bold uppercase text-slate-400">Phân công</span>
                  <select disabled={!canConfigure} value={item.assignment_strategy} onChange={(event) => patchTask(index, { assignment_strategy: event.target.value })} className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-[10px] font-semibold disabled:bg-slate-50">{ASSIGNMENT_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
                </label>
                <div className="grid grid-cols-3 gap-2 text-[9px] font-semibold text-slate-600">
                  <label className="flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-50 px-2"><input type="checkbox" disabled={!canConfigure} checked={item.blocks_stage_advance === true} onChange={(event) => patchTask(index, { blocks_stage_advance: event.target.checked })} /> Chặn bước</label>
                  <label className="flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-50 px-2"><input type="checkbox" disabled={!canConfigure} checked={item.completion_requires_file_or_note === true} onChange={(event) => patchTask(index, { completion_requires_file_or_note: event.target.checked })} /> Cần minh chứng</label>
                  <label className="flex min-h-9 items-center gap-1.5 rounded-lg bg-violet-50 px-2"><input type="checkbox" disabled={!canConfigure} checked={item.requires_quick_verdict === true} onChange={(event) => patchTask(index, { requires_quick_verdict: event.target.checked })} /> Cần kết luận</label>
                </div>
                {canConfigure ? <button type="button" onClick={() => removeTask(index)} disabled={!!busy} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Xóa ${item.title}`}><Trash2 className="h-4 w-4" /></button> : <span />}
              </div>
            ))}
          </div>

          <div className="grid border-t border-slate-200 lg:grid-cols-[1fr_420px]">
            <div className="flex flex-col gap-3 bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {canConfigure && <button type="button" onClick={addTask} disabled={!!busy || automation.task_items.length >= 20} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-extrabold text-slate-700 hover:border-violet-200 hover:text-violet-700 disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Thêm nhiệm vụ mẫu</button>}
                <p className={`mt-2 text-[10px] ${error ? 'text-red-600' : success ? 'text-emerald-700' : 'text-slate-500'}`}>{error || success || `Task mới chỉ sinh khi hồ sơ bắt đầu ${stageLabel}; cấu hình không sửa task lịch sử.`}</p>
              </div>
              {canConfigure && <button type="button" onClick={save} disabled={!!busy} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-extrabold text-white hover:bg-violet-700 disabled:opacity-50">{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Áp dụng automation</button>}
            </div>
            <div className="border-t border-slate-200 bg-white px-5 py-4 lg:border-l lg:border-t-0">
              <div className="flex items-center gap-2"><History className="h-4 w-4 text-slate-500" /><h4 className="text-xs font-extrabold text-slate-900">Phiên bản automation</h4></div>
              <div className="mt-3 max-h-36 space-y-2 overflow-y-auto pr-1">
                {versions.length ? versions.slice(0, 10).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                    <div><p className="text-[10px] font-extrabold text-slate-700">v{item.version} · {CHANGE_LABELS[item.change_type] || item.change_type}</p><p className="mt-0.5 text-[9px] text-slate-400">{item.task_items?.length || 0} task · {new Date(item.created_at).toLocaleString('vi-VN')}</p></div>
                    {canConfigure && item.version !== automation.version && <button type="button" onClick={() => rollback(item.version)} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-600 hover:text-violet-700 disabled:opacity-50">{busy === `rollback:${item.version}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Khôi phục</button>}
                  </div>
                )) : <p className="text-[10px] text-slate-400">Cấu hình mặc định sẽ được tạo khi áp dụng hoặc bắt đầu {stageLabel} đầu tiên.</p>}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
