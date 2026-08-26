import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import api from '../lib/api';
import CustomFieldInput from '../business-os/CustomFieldInput';

const STAGE_ORDER = ['lead', 'qualification', 'qualified', 'deal'];

function commandHeaders(prefix, leadId) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    'Idempotency-Key': `${prefix}-${leadId}-${suffix}`,
    'X-Request-Id': `crm-qualification-${suffix}`,
  };
}

function formatMoney(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return new Intl.NumberFormat('vi-VN').format(amount);
}

function formatSla(dueAt) {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const diff = due.getTime() - Date.now();
  const hours = Math.ceil(Math.abs(diff) / 3_600_000);
  if (diff < 0) return `Quá SLA ${hours} giờ`;
  if (hours < 24) return `Còn ${hours} giờ làm việc`;
  return `Hạn ${due.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}`;
}

function requirementValue(requirement) {
  if (requirement?.value == null || requirement.value === '') return requirement?.hint || 'Chưa có thông tin';
  if (requirement.key === 'estimated_value') return `${formatMoney(requirement.value)} ₫`;
  if (requirement.field_type === 'number') return new Intl.NumberFormat('vi-VN').format(Number(requirement.value));
  return String(requirement.value);
}

export default function SalesQualificationPilot({
  lead,
  onRefresh,
  onConvert,
  onStateChange,
}) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    description: lead?.description || '',
    estimated_value: lead?.estimated_value || '',
    expected_construction_time: lead?.expected_construction_time || '',
    install_address: lead?.install_address || '',
    custom_fields: {},
  });

  useEffect(() => {
    setForm({
      description: lead?.description || '',
      estimated_value: lead?.estimated_value || '',
      expected_construction_time: lead?.expected_construction_time || '',
      install_address: lead?.install_address || '',
      custom_fields: {},
    });
  }, [lead?.id, lead?.updated_at, lead?.type]);

  const loadState = useCallback(async () => {
    if (!lead?.id) return null;
    setLoading(true);
    try {
      const { data } = await api.get(`/crm/leads/${lead.id}/qualification`);
      setState(data);
      setForm((current) => ({
        ...current,
        custom_fields: Object.fromEntries(
          (data?.readiness?.requirements || [])
            .filter((requirement) => requirement.custom)
            .map((requirement) => [requirement.key, requirement.raw_value ?? '']),
        ),
      }));
      onStateChange?.(data);
      setError('');
      return data;
    } catch (requestError) {
      const message = requestError.response?.data?.error || 'Không tải được trạng thái Qualification';
      setError(message);
      const fallback = { enabled: null, error: message };
      setState(fallback);
      onStateChange?.(fallback);
      return fallback;
    } finally {
      setLoading(false);
    }
  }, [lead?.id, onStateChange]);

  useEffect(() => {
    void loadState();
  }, [loadState, lead?.updated_at, lead?.type]);

  const currentStage = state?.instance?.current_stage_key || 'lead';
  const readiness = state?.readiness;
  const slaText = formatSla(state?.instance?.sla_due_at);
  const slaOverdue = !!state?.instance?.sla_due_at && new Date(state.instance.sla_due_at).getTime() < Date.now();
  const currentStageIndex = Math.max(0, STAGE_ORDER.indexOf(currentStage));

  const missingEditable = useMemo(() => new Set(
    (readiness?.missing_requirements || [])
      .map((item) => item.edit_field)
      .filter(Boolean),
  ), [readiness]);
  const requirementMap = useMemo(() => new Map(
    (readiness?.requirements || []).map((item) => [item.key, item]),
  ), [readiness]);
  const fieldVisible = (key) => requirementMap.has(key);
  const fieldRequired = (key) => requirementMap.get(key)?.required === true;
  const customFields = (readiness?.requirements || []).filter((requirement) => requirement.custom);
  const editableVisibleCount = [
    'description',
    'estimated_value',
    'expected_construction_time',
    'install_address',
  ].filter(fieldVisible).length + customFields.length;

  if (loading && state == null) return null;
  if (!loading && state?.enabled === false) return null;
  if (!loading && state?.enabled == null && error) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-800 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-bold">Chưa xác định được trạng thái Qualification</p>
            <p className="mt-1 text-xs text-red-700">{error}. Quyền chuyển Deal tạm khóa để bảo vệ quy trình.</p>
          </div>
        </div>
      </section>
    );
  }

  const runCommand = async (action) => {
    setBusy(action);
    setError('');
    try {
      const { data } = await api.post(
        `/crm/leads/${lead.id}/qualification/${action}`,
        {},
        { headers: commandHeaders(action, lead.id) },
      );
      setState(data);
      onStateChange?.(data);
    } catch (requestError) {
      const payload = requestError.response?.data;
      setError(payload?.error || 'Không thể chuyển bước Qualification');
      if (payload?.qualification?.requirements) {
        setState((prev) => ({
          ...(prev || {}),
          readiness: payload.qualification,
        }));
      }
    } finally {
      setBusy('');
    }
  };

  const saveQualification = async () => {
    setBusy('save');
    setError('');
    try {
      await api.put(`/crm/leads/${lead.id}`, {
        description: form.description.trim() || null,
        estimated_value: Number(form.estimated_value || 0),
        expected_construction_time: form.expected_construction_time || null,
        install_address: form.install_address.trim() || null,
      });
      if (customFields.length) {
        await api.put(`/crm/leads/${lead.id}/qualification/custom-fields`, {
          values: Object.fromEntries(customFields.map((field) => [
            field.key,
            form.custom_fields[field.key] ?? '',
          ])),
        });
      }
      await onRefresh?.();
      await loadState();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không thể lưu thông tin Qualification');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-blue-100 bg-gradient-to-r from-slate-950 via-blue-950 to-blue-900 px-5 py-4 text-white lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
            <Sparkles className="h-4 w-4" /> Business OS Pilot
          </div>
          <h2 className="mt-1 text-lg font-bold">Lead → Qualification → Deal</h2>
          <p className="mt-1 text-xs text-blue-100/75">Stage Contract phân biệt thông tin bắt buộc, tuỳ chọn, nhiệm vụ chặn và SLA.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-100">
            Pilot 1 công ty
          </span>
          {slaText && currentStage !== 'deal' && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${slaOverdue ? 'bg-red-500/20 text-red-100' : 'bg-white/10 text-blue-50'}`}>
              <Clock3 className="h-3.5 w-3.5" /> {slaText}
            </span>
          )}
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-4 gap-2">
          {(state?.process?.stages || []).filter((stage) => STAGE_ORDER.includes(stage.key)).map((stage, index) => {
            const complete = index < currentStageIndex || currentStage === 'deal';
            const active = stage.key === currentStage;
            return (
              <div key={stage.key} className="relative">
                {index > 0 && <div className={`absolute right-1/2 top-4 h-0.5 w-full ${complete || active ? 'bg-blue-500' : 'bg-slate-200'}`} />}
                <div className="relative z-10 flex flex-col items-center text-center">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${
                    complete
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : active
                        ? 'border-blue-600 bg-blue-600 text-white ring-4 ring-blue-100'
                        : 'border-slate-200 bg-white text-slate-400'
                  }`}>
                    {complete ? <Check className="h-4 w-4" /> : index + 1}
                  </div>
                  <span className={`mt-2 text-[11px] font-semibold ${active ? 'text-blue-700' : complete ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {stage.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {loading ? (
          <div className="flex h-28 items-center justify-center text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang kiểm tra điều kiện…
          </div>
        ) : currentStage === 'deal' ? (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            <CheckCircle2 className="h-6 w-6 shrink-0" />
            <div>
              <p className="font-semibold">Đã chuyển thành Deal</p>
              <p className="text-xs text-emerald-700">Toàn bộ lịch sử Qualification đã được lưu trong event ledger.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Thông tin Qualification</h3>
                    <p className="text-xs text-slate-500">Lưu trực tiếp vào hồ sơ Lead hiện tại.</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${readiness?.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                    {readiness?.completed_requirements || 0}/{readiness?.total_requirements || 0} bắt buộc
                  </span>
                </div>

                <div className="space-y-3">
                  {fieldVisible('description') && (
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Nhu cầu khách hàng {fieldRequired('description') ? '*' : <span className="normal-case tracking-normal text-slate-400">· tuỳ chọn</span>}
                      </span>
                      <textarea
                        rows={3}
                        value={form.description}
                        onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                        className={`w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 ${missingEditable.has('description') ? 'border-amber-300' : 'border-slate-200'}`}
                        placeholder="Loại sản phẩm, kích thước, phong cách, yêu cầu chính…"
                      />
                    </label>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    {fieldVisible('estimated_value') && (
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Ngân sách sơ bộ {fieldRequired('estimated_value') ? '*' : <span className="normal-case tracking-normal text-slate-400">· tuỳ chọn</span>}
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={form.estimated_value}
                          onChange={(event) => setForm((prev) => ({ ...prev, estimated_value: event.target.value }))}
                          className={`h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-200 ${missingEditable.has('estimated_value') ? 'border-amber-300' : 'border-slate-200'}`}
                          placeholder="VNĐ"
                        />
                      </label>
                    )}
                    {fieldVisible('expected_construction_time') && (
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Thời điểm dự kiến {fieldRequired('expected_construction_time') ? '*' : <span className="normal-case tracking-normal text-slate-400">· tuỳ chọn</span>}
                        </span>
                        <select
                          value={form.expected_construction_time}
                          onChange={(event) => setForm((prev) => ({ ...prev, expected_construction_time: event.target.value }))}
                          className={`h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-200 ${missingEditable.has('expected_construction_time') ? 'border-amber-300' : 'border-slate-200'}`}
                        >
                          <option value="">Chọn thời điểm</option>
                          <option value="under_1m">Dưới 1 tháng</option>
                          <option value="1_2m">1–2 tháng</option>
                          <option value="over_2m">Trên 2 tháng</option>
                        </select>
                      </label>
                    )}
                  </div>

                  {fieldVisible('install_address') && (
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Địa điểm lắp đặt {fieldRequired('install_address') ? '*' : <span className="normal-case tracking-normal text-slate-400">· tuỳ chọn</span>}
                      </span>
                      <input
                        value={form.install_address}
                        onChange={(event) => setForm((prev) => ({ ...prev, install_address: event.target.value }))}
                        className={`h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-200 ${missingEditable.has('install_address') ? 'border-amber-300' : 'border-slate-200'}`}
                        placeholder="Địa chỉ công trình"
                      />
                    </label>
                  )}

                  {customFields.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {customFields.map((field) => (
                        <CustomFieldInput
                          key={field.key}
                          field={field}
                          value={form.custom_fields[field.key]}
                          onValueChange={(value) => setForm((current) => ({
                            ...current,
                            custom_fields: { ...current.custom_fields, [field.key]: value },
                          }))}
                          required={field.required}
                          missing={missingEditable.has(field.edit_field)}
                        />
                      ))}
                    </div>
                  )}

                  {editableVisibleCount > 0 ? (
                    <button
                      type="button"
                      onClick={saveQualification}
                      disabled={!!busy}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-50 disabled:opacity-50"
                    >
                      {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Lưu thông tin
                    </button>
                  ) : (
                    <p className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">Không có trường nhập thêm ở Stage Contract hiện tại.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-slate-900">Điều kiện chuyển bước</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  {(readiness?.requirements || []).map((requirement) => (
                    <div key={requirement.key} className={`rounded-lg border px-3 py-2 ${requirement.complete ? 'border-emerald-100 bg-emerald-50/70' : requirement.required ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-start gap-2">
                        {requirement.complete
                          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          : <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${requirement.required ? 'text-amber-600' : 'text-slate-400'}`} />}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className={`text-xs font-semibold ${requirement.complete ? 'text-emerald-800' : requirement.required ? 'text-amber-900' : 'text-slate-700'}`}>{requirement.label}</p>
                            <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase ${requirement.required ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>
                              {requirement.required ? 'Bắt buộc' : 'Tuỳ chọn'}
                            </span>
                          </div>
                          <p className="truncate text-[11px] text-slate-500" title={requirementValue(requirement)}>{requirementValue(requirement)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {(readiness?.blocking_tasks || []).length > 0 && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-xs font-bold text-red-800">Nhiệm vụ đang chặn chuyển bước</p>
                    <ul className="mt-1 space-y-1 text-xs text-red-700">
                      {readiness.blocking_tasks.slice(0, 4).map((task) => (
                        <li key={task.id}>• {task.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                Backend kiểm tra lại toàn bộ điều kiện khi chuyển bước.
              </div>
              <div className="flex items-center gap-2">
                {state?.allowed_actions?.start_qualification && (
                  <button
                    type="button"
                    onClick={() => runCommand('start')}
                    disabled={!!busy}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    Bắt đầu Qualification
                  </button>
                )}
                {currentStage === 'qualification' && (
                  <button
                    type="button"
                    onClick={() => runCommand('complete')}
                    disabled={!!busy || !readiness?.ready}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy === 'complete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Xác nhận đủ điều kiện
                  </button>
                )}
                {state?.allowed_actions?.convert_to_deal && (
                  <button
                    type="button"
                    onClick={onConvert}
                    disabled={!!busy}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    <ArrowRight className="h-4 w-4" /> Chuyển sang Deal
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
