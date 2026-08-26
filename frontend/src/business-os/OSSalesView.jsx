import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDotDashed,
  Clock3,
  ListFilter,
  Loader2,
  PhoneCall,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  X,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { SALES_LIFECYCLE } from './osConfig';
import CustomFieldInput, { customFieldHasValue } from './CustomFieldInput';

const DEFAULT_CONTRACT_FIELDS = [
  { key: 'customer_id', label: 'Khách hàng liên kết', mode: 'required', system_required: true },
  { key: 'phone', label: 'Số điện thoại', mode: 'optional' },
  { key: 'region_id', label: 'Khu vực phụ trách', mode: 'required', system_required: true },
  { key: 'owner_id', label: 'Người chịu trách nhiệm', mode: 'required', system_required: true },
  { key: 'description', label: 'Nhu cầu khách hàng', mode: 'required' },
  { key: 'estimated_value', label: 'Ngân sách sơ bộ', mode: 'optional' },
  { key: 'expected_construction_time', label: 'Thời điểm dự kiến', mode: 'optional' },
  { key: 'install_address', label: 'Địa điểm lắp đặt', mode: 'optional' },
];

function StageCard({ stageKey, name, index, count, enabled }) {
  return (
    <div className={`relative min-w-[150px] flex-1 rounded-2xl border p-4 ${enabled ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-white'}`}>
      {index < SALES_LIFECYCLE.length - 1 && <ChevronRight className="absolute -right-3 top-1/2 z-10 h-6 w-6 -translate-y-1/2 rounded-full border border-slate-200 bg-white p-1 text-slate-400" />}
      <div className="flex items-center justify-between gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-black ${enabled ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span>
        {enabled ? <span className="h-2 w-2 rounded-full bg-emerald-500" /> : <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-extrabold uppercase tracking-wide text-slate-500">Thiết kế</span>}
      </div>
      <p className="mt-4 text-xs font-extrabold text-slate-900">{name}</p>
      <p className="mt-1 text-[10px] text-slate-500">{enabled ? `${count || 0} hồ sơ` : 'Chưa điều khiển dữ liệu'}</p>
    </div>
  );
}

function RecordRow({ record }) {
  const missing = record.missing_information?.length || Math.max(0, (record.information_total || 0) - (record.information_completed || 0));
  return (
    <Link to={`/crm/leads/${record.id}`} className="grid gap-3 border-b border-slate-100 px-5 py-4 transition last:border-0 hover:bg-blue-50/30 md:grid-cols-[minmax(220px,1.5fr)_150px_170px_160px_32px] md:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold text-slate-900">{record.title}</p>
        <p className="mt-1 truncate text-[11px] text-slate-500">{record.code || 'Chưa có mã'} · {record.customer?.full_name || 'Chưa liên kết khách hàng'}</p>
      </div>
      <div>
        <span className="inline-flex rounded-lg bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold text-blue-700">{record.current_stage_name}</span>
      </div>
      <div>
        <p className="text-[11px] font-bold text-slate-700">{record.owner?.full_name || 'Chưa gán owner'}</p>
        <p className="mt-1 text-[10px] text-slate-500">{record.blocking_task_count || 0} task đang chặn</p>
      </div>
      <div>
        {record.type === 'deal' ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Đã thành Deal</span>
        ) : missing ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Thiếu {missing} thông tin</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-700"><Check className="h-3.5 w-3.5" /> Đủ thông tin</span>
        )}
      </div>
      <ChevronRight className="hidden h-4 w-4 text-slate-400 md:block" />
    </Link>
  );
}

function QuickLeadModal({ companyId, contract, onClose, onCreated }) {
  const { user } = useAuth();
  const [regions, setRegions] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    customer_name: '',
    phone: '',
    region_id: '',
    description: '',
    estimated_value: '',
    expected_construction_time: '',
    install_address: '',
    custom_fields: {},
  });
  const contractFields = contract?.fields?.length ? contract.fields : DEFAULT_CONTRACT_FIELDS;
  const contractFieldMap = new Map(contractFields.map((field) => [field.key, field]));
  const customFields = contractFields.filter((field) => field.custom && field.mode !== 'hidden');
  const fieldVisible = (key) => contractFieldMap.get(key)?.mode !== 'hidden';
  const fieldRequired = (key) => contractFieldMap.get(key)?.mode === 'required';
  const fieldSuffix = (key) => fieldRequired(key) ? '*' : '· tuỳ chọn';

  useEffect(() => {
    let cancelled = false;
    setLoadingRegions(true);
    api.get('/crm/company-regions', { params: { company_id: companyId } })
      .then((response) => {
        if (cancelled) return;
        const active = (Array.isArray(response.data) ? response.data : []).filter((region) => region.is_active !== false);
        setRegions(active);
        setForm((prev) => ({ ...prev, region_id: prev.region_id || active[0]?.id || '' }));
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.response?.data?.error || 'Không tải được khu vực CRM.');
      })
      .finally(() => { if (!cancelled) setLoadingRegions(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  const updateCustomField = (fieldKey, value) => setForm((prev) => ({
    ...prev,
    custom_fields: { ...prev.custom_fields, [fieldKey]: value },
  }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.customer_name.trim() || !form.title.trim()) {
      setError('Vui lòng nhập tên Lead và tên khách hàng.');
      return;
    }
    if (fieldRequired('phone') && !form.phone.trim()) {
      setError('Vui lòng nhập số điện thoại.');
      return;
    }
    if (fieldRequired('description') && form.description.trim().length < 10) {
      setError('Nhu cầu khách hàng bắt buộc và cần tối thiểu 10 ký tự.');
      return;
    }
    if (fieldRequired('estimated_value') && Number(form.estimated_value || 0) <= 0) {
      setError('Vui lòng nhập ngân sách sơ bộ lớn hơn 0.');
      return;
    }
    if (fieldRequired('expected_construction_time') && !form.expected_construction_time) {
      setError('Vui lòng chọn thời điểm dự kiến.');
      return;
    }
    if (fieldRequired('install_address') && !form.install_address.trim()) {
      setError('Vui lòng nhập địa điểm lắp đặt.');
      return;
    }
    if (!form.region_id) {
      setError('Công ty chưa có khu vực CRM khả dụng.');
      return;
    }
    const missingCustomField = customFields.find((field) => (
      field.mode === 'required' && !customFieldHasValue(field, form.custom_fields[field.key])
    ));
    if (missingCustomField) {
      setError(`Vui lòng nhập ${missingCustomField.label}.`);
      return;
    }
    setSaving(true);
    setError('');
    let createdLead = null;
    try {
      const customerResponse = await api.post('/customers', {
        full_name: form.customer_name.trim(),
        phone: form.phone.trim(),
        company_id: companyId,
      });
      const customerId = customerResponse.data?.id || customerResponse.data?.customer?.id;
      const leadResponse = await api.post('/crm/leads', {
        title: form.title.trim(),
        customer_id: customerId || null,
        company_id: companyId,
        region_id: form.region_id,
        assigned_to: user?.id || user?.userId || null,
        type: 'lead',
        description: form.description.trim() || null,
        estimated_value: Number(form.estimated_value || 0),
        expected_construction_time: form.expected_construction_time || null,
        install_address: form.install_address.trim() || null,
      });
      createdLead = leadResponse.data;
      const leadId = leadResponse.data?.id || leadResponse.data?.lead?.id;
      if (leadId && customFields.length) {
        await api.put(`/crm/leads/${leadId}/qualification/custom-fields`, {
          values: Object.fromEntries(customFields.map((field) => [
            field.key,
            form.custom_fields[field.key] ?? '',
          ])),
        });
      }
      await onCreated?.(leadResponse.data);
    } catch (requestError) {
      if (createdLead) {
        // Không cho người dùng bấm tạo lại và sinh Lead trùng khi phần sidecar
        // lỗi sau khi CRM core đã tạo hồ sơ thành công. Lead Detail sẽ hiển thị
        // trường còn thiếu để người dùng lưu lại an toàn.
        await onCreated?.(createdLead);
        return;
      }
      setError(requestError.response?.data?.error || 'Không thể tạo Lead. Vui lòng kiểm tra lại thông tin.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Tạo Lead mới">
      <button type="button" className="absolute inset-0 cursor-default" onClick={saving ? undefined : onClose} aria-label="Đóng" />
      <form onSubmit={submit} className="relative max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-600"><Sparkles className="h-3.5 w-3.5" /> Business OS · Quick create</div>
            <h2 className="mt-2 text-xl font-black text-slate-950">Tạo Lead theo Stage Contract</h2>
            <p className="mt-1 text-xs text-slate-500">Chỉ trường quan trọng mới bắt buộc; trường phụ có thể bổ sung sau.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50" aria-label="Đóng"><X className="h-4 w-4" /></button>
        </div>

        <div className="max-h-[calc(92vh-150px)] overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Tên Lead *</span>
              <input value={form.title} onChange={update('title')} autoFocus className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" placeholder="Ví dụ: Tủ bếp căn hộ anh Minh" />
            </label>
            <label>
              <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Khách hàng *</span>
              <input value={form.customer_name} onChange={update('customer_name')} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" placeholder="Họ tên khách hàng" />
            </label>
            {fieldVisible('phone') && (
              <label>
                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Số điện thoại {fieldSuffix('phone')}</span>
                <input value={form.phone} onChange={update('phone')} inputMode="tel" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" placeholder="09xx xxx xxx" />
              </label>
            )}
            <label>
              <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Khu vực phụ trách *</span>
              <select value={form.region_id} onChange={update('region_id')} disabled={loadingRegions} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="">{loadingRegions ? 'Đang tải khu vực…' : 'Chọn khu vực'}</option>
                {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
              </select>
            </label>
            {fieldVisible('estimated_value') && (
              <label>
                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Ngân sách sơ bộ {fieldSuffix('estimated_value')}</span>
                <input value={form.estimated_value} onChange={update('estimated_value')} inputMode="numeric" type="number" min="0" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" placeholder="VNĐ" />
              </label>
            )}
            {fieldVisible('description') && (
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Nhu cầu khách hàng {fieldSuffix('description')}</span>
                <textarea value={form.description} onChange={update('description')} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" placeholder="Sản phẩm, phong cách, kích thước và yêu cầu chính…" />
              </label>
            )}
            {fieldVisible('expected_construction_time') && (
              <label>
                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Thời điểm dự kiến {fieldSuffix('expected_construction_time')}</span>
                <select value={form.expected_construction_time} onChange={update('expected_construction_time')} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                  <option value="">Chọn thời điểm</option>
                  <option value="under_1m">Dưới 1 tháng</option>
                  <option value="1_2m">1–2 tháng</option>
                  <option value="over_2m">Trên 2 tháng</option>
                </select>
              </label>
            )}
            {fieldVisible('install_address') && (
              <label>
                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Địa điểm lắp đặt {fieldSuffix('install_address')}</span>
                <input value={form.install_address} onChange={update('install_address')} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" placeholder="Địa chỉ công trình" />
              </label>
            )}
            {customFields.map((field) => (
              <CustomFieldInput
                key={field.key}
                field={field}
                value={form.custom_fields[field.key]}
                onValueChange={(value) => updateCustomField(field.key, value)}
                required={field.mode === 'required'}
              />
            ))}
          </div>

          {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] leading-4 text-slate-500">Owner mặc định là người đang đăng nhập. Backend vẫn kiểm tra lại quyền và khu vực.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 disabled:opacity-50">Hủy</button>
            <button type="submit" disabled={saving || loadingRegions} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Tạo Lead & mở hồ sơ</button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function OSSalesView({ data, onRefresh }) {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [focus, setFocus] = useState('all');
  const summary = data?.summary || {};
  const records = data?.records || [];
  const stageCounts = summary.stage_counts || {};
  const funnel = summary.funnel_kpi || {};
  const dealWorkflow = summary.deal_workflow_kpi || {};
  const automation = data?.qualification_automation || null;
  const rolloutEnabled = data?.rollout?.enabled === true;
  const qualificationFields = data?.qualification_contract?.fields?.length
    ? data.qualification_contract.fields
    : DEFAULT_CONTRACT_FIELDS;

  const countForStage = (key) => {
    if (key === 'deal') return stageCounts.deal || 0;
    if (key === 'qualification') return stageCounts.qualification || 0;
    if (key === 'lead') return stageCounts.lead || 0;
    if (key === 'survey') return stageCounts.survey || 0;
    if (key === 'design') return (stageCounts.design || 0) + (stageCounts.design_review || 0) + (stageCounts.design_completed || 0);
    return stageCounts[key] || 0;
  };

  const filteredRecords = records.filter((record) => {
    if (focus === 'attention' && !['sla_overdue', 'sla_at_risk', 'task_blocked', 'missing_information'].includes(record.operational_status)) return false;
    if (focus === 'lead' && record.type === 'deal') return false;
    if (focus === 'deal' && record.type !== 'deal') return false;
    const keyword = searchQuery.trim().toLocaleLowerCase('vi-VN');
    if (!keyword) return true;
    return [record.title, record.code, record.customer?.full_name, record.owner?.full_name]
      .some((value) => String(value || '').toLocaleLowerCase('vi-VN').includes(keyword));
  });

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <section className="flex flex-col gap-5 rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)] lg:flex-row lg:items-end lg:justify-between lg:p-8">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700">Sales Workspace</span>
            <span className={`rounded-full px-3 py-1 text-[10px] font-extrabold ${rolloutEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{rolloutEnabled ? 'Pilot · Có kiểm soát' : 'Dữ liệu thật · Chế độ quan sát'}</span>
          </div>
          <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-4xl">Kinh doanh theo quy trình,<br className="hidden sm:block" /> không theo trí nhớ.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Mỗi cơ hội có current stage, owner, SLA, next action và điều kiện rõ ràng trước khi được phép chuyển bước.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-extrabold text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Tạo Lead</button>
          <Link to="/crm/dashboard" className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">CRM hiện tại <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Process map</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">Lead → Lắp đặt → Bàn giao</h2>
          </div>
          <p className="text-xs text-slate-500">Sau Deal có thể đi quy trình đầy đủ hoặc kiểm tra thiết kế khách cung cấp.</p>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {SALES_LIFECYCLE.map(([key, name], index) => <StageCard key={key} stageKey={key} name={name} index={index} count={countForStage(key)} enabled={rolloutEnabled} />)}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Lead mới', stageCounts.lead || 0, 'Chưa bắt đầu Qualification', Target, 'text-blue-700 bg-blue-50'],
          ['Đang Qualification', stageCounts.qualification || 0, `${summary.blocked_records || 0} hồ sơ đang vướng điều kiện`, CircleDotDashed, 'text-amber-700 bg-amber-50'],
          ['Cảnh báo SLA', (summary.sla_overdue || 0) + (summary.sla_at_risk || 0), `${summary.sla_overdue || 0} quá hạn`, Clock3, 'text-red-700 bg-red-50'],
          ['Deal đang vận hành', funnel.deal_records || 0, `${(stageCounts.survey || 0) + (stageCounts.design || 0) + (stageCounts.design_review || 0)} hồ sơ đang xử lý thiết kế`, CheckCircle2, 'text-emerald-700 bg-emerald-50'],
        ].map(([label, value, hint, Icon, tone]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-slate-400">{label}</p><p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{hint}</p></div>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span>
            </div>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-sm font-extrabold text-slate-950">KPI phễu Qualification</h2><p className="mt-1 text-[10px] text-slate-500">Tính trực tiếp từ Lead, process instance và event ledger; không dùng số demo.</p></div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-500">{funnel.total_records || 0} hồ sơ trong phạm vi</span>
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Bắt đầu Qualification', `${funnel.start_rate_pct || 0}%`, `${funnel.qualification_started || 0} hồ sơ đã bắt đầu`],
            ['Hoàn tất Qualification', `${funnel.qualification_success_rate_pct || 0}%`, `${funnel.qualification_completed || 0} hồ sơ đủ điều kiện`],
            ['Lead → Deal', `${funnel.lead_to_deal_rate_pct || 0}%`, `${funnel.deal_records || 0} Deal thật · ${funnel.converted_to_deal || 0} qua process`],
            ['Đúng hạn SLA', `${funnel.sla_on_time_rate_pct || 0}%`, `${funnel.measured_durations || 0} hồ sơ có đủ mốc thời gian`],
            ['Thời gian trung bình', `${funnel.average_qualification_hours || 0}h`, 'Theo thời gian thực giữa Started và Qualified'],
          ].map(([label, value, hint]) => (
            <div key={label} className="bg-white p-4"><p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-[9px] leading-4 text-slate-500">{hint}</p></div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-violet-100 bg-violet-50/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-sm font-extrabold text-slate-950">KPI lộ trình Deal → Hồ sơ báo giá</h2><p className="mt-1 text-[10px] text-slate-500">Tách rõ quy trình đầy đủ và nhánh khách đã có thiết kế.</p></div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold text-violet-600">{dealWorkflow.deal_records || 0} Deal trong phạm vi</span>
        </div>
        <div className="grid gap-px bg-violet-100 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Đã chọn lộ trình', `${dealWorkflow.workflow_selection_rate_pct || 0}%`, `${dealWorkflow.workflow_started || 0} Deal đã bắt đầu`],
            ['Khách có thiết kế', `${dealWorkflow.customer_design_share_pct || 0}%`, `${dealWorkflow.design_review_started || 0} hồ sơ`],
            ['Kiểm tra thiết kế đạt', `${dealWorkflow.design_review_completion_rate_pct || 0}%`, `${dealWorkflow.design_review_completed || 0} hồ sơ`],
            ['Sẵn sàng báo giá', `${dealWorkflow.quote_ready_rate_pct || 0}%`, `${dealWorkflow.design_completed || 0} hồ sơ`],
            ['Đang xử lý', (dealWorkflow.survey_active || 0) + (dealWorkflow.design_active || 0) + (dealWorkflow.design_review_active || 0), `${dealWorkflow.design_review_active || 0} đang kiểm tra TK có sẵn`],
          ].map(([label, value, hint]) => (
            <div key={label} className="bg-white p-4"><p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-[9px] leading-4 text-slate-500">{hint}</p></div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-teal-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-teal-100 bg-teal-50/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-sm font-extrabold text-slate-950">KPI Đơn hàng → Sản xuất → Lắp đặt → Bàn giao</h2><p className="mt-1 text-[10px] text-slate-500">Đọc từ chứng từ, Project, thẻ bàn giao VC/LĐ và cột Kanban Hoàn thành thật.</p></div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold text-teal-700">{dealWorkflow.installation_completed || 0} hồ sơ đã bàn giao</span>
        </div>
        <div className="grid gap-px bg-teal-100 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ['Tạo dự án', `${dealWorkflow.project_creation_rate_pct || 0}%`, `${dealWorkflow.project_started || 0} dự án từ đơn hàng`],
            ['Bàn giao SX', `${dealWorkflow.production_handover_rate_pct || 0}%`, `${dealWorkflow.production_started || 0} hồ sơ`],
            ['SX sẵn sàng giao', `${dealWorkflow.production_ready_rate_pct || 0}%`, `${dealWorkflow.delivery_ready || 0} hồ sơ`],
            ['Chuyển VC/LĐ', `${dealWorkflow.installation_handover_rate_pct || 0}%`, `${dealWorkflow.installation_started || 0} hồ sơ`],
            ['Hoàn tất bàn giao', `${dealWorkflow.installation_completion_rate_pct || 0}%`, `${dealWorkflow.installation_completed || 0} hồ sơ`],
            ['Đang VC/LĐ', stageCounts.installation || 0, `${stageCounts.delivery_ready || 0} đang chờ Sale chọn lịch`],
          ].map(([label, value, hint]) => (
            <div key={label} className="bg-white p-4"><p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-[9px] leading-4 text-slate-500">{hint}</p></div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.6fr)_380px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-extrabold text-slate-950">Hồ sơ trong quy trình</h2>
              <p className="mt-1 text-xs text-slate-500">Hàng đợi chung theo mức độ cần xử lý.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-400 focus:bg-white" placeholder="Tìm tên, mã, khách hàng…" />
              </label>
              <label className="relative">
                <ListFilter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select value={focus} onChange={(event) => setFocus(event.target.value)} className="h-9 appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-xs font-bold text-slate-700 outline-none focus:border-blue-400">
                  <option value="all">Tất cả hồ sơ</option>
                  <option value="attention">Cần ưu tiên</option>
                  <option value="lead">Chỉ Lead</option>
                  <option value="deal">Chỉ Deal</option>
                </select>
              </label>
            </div>
          </div>

          {filteredRecords.length ? filteredRecords.slice(0, 50).map((record) => <RecordRow key={record.id} record={record} />) : records.length ? (
            <div className="px-6 py-14 text-center"><Search className="mx-auto h-7 w-7 text-slate-300" /><h3 className="mt-3 text-sm font-extrabold text-slate-900">Không có hồ sơ phù hợp</h3><p className="mt-1 text-xs text-slate-500">Thử đổi từ khóa hoặc nhóm ưu tiên.</p></div>
          ) : (
            <div className="px-6 py-16 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Target className="h-7 w-7" /></span>
              <h3 className="mt-4 text-sm font-extrabold text-slate-900">Công ty đang chọn chưa có Lead</h3>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">Tạo một Lead thật để trải nghiệm đầy đủ Qualification, task gate, SLA và chuyển đổi sang Deal.</p>
              <button type="button" onClick={() => setCreateOpen(true)} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Tạo Lead đầu tiên</button>
            </div>
          )}
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white"><ShieldCheck className="h-5 w-5" /></span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wide text-emerald-700">Backend enforced</span>
            </div>
            <h2 className="mt-4 text-sm font-extrabold text-slate-950">Hợp đồng Qualification</h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">Chỉ trường gắn nhãn bắt buộc và task gate mới chặn chuyển Deal.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {qualificationFields.filter((field) => field.mode !== 'hidden').map((field) => (
                <div key={field.key} className="rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] font-semibold text-slate-700">
                  <div className="flex items-center gap-2">
                    <Check className={`h-3.5 w-3.5 shrink-0 ${field.mode === 'required' ? 'text-amber-600' : 'text-blue-500'}`} /> {field.label}
                  </div>
                  <span className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[8px] font-extrabold uppercase ${field.mode === 'required' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-600'}`}>
                    {field.mode === 'required' ? 'Bắt buộc' : 'Tuỳ chọn'}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
              <p className="flex items-center gap-2 text-[11px] font-bold text-slate-700"><Clock3 className="h-3.5 w-3.5 text-amber-600" /> SLA {Math.round(Number(automation?.sla_policy?.duration_minutes || 960) / 60 * 10) / 10} giờ làm việc</p>
              <p className="flex items-center gap-2 text-[11px] font-bold text-slate-700"><CircleDotDashed className="h-3.5 w-3.5 text-violet-600" /> {automation?.task_items?.length || 0} nhiệm vụ sinh khi bắt đầu bước</p>
              <p className="flex items-center gap-2 text-[11px] font-bold text-slate-700"><UserRound className="h-3.5 w-3.5 text-blue-600" /> Owner chịu trách nhiệm rõ ràng</p>
              <p className="flex items-center gap-2 text-[11px] font-bold text-slate-700"><PhoneCall className="h-3.5 w-3.5 text-violet-600" /> Next action gắn với hồ sơ</p>
            </div>
          </section>

          <section className="rounded-2xl border border-violet-200 bg-violet-50/70 p-5">
            <div className="flex items-center gap-2 text-violet-700"><Sparkles className="h-4 w-4" /><p className="text-[10px] font-extrabold uppercase tracking-[0.14em]">Sales Copilot</p></div>
            <h2 className="mt-3 text-sm font-extrabold text-slate-950">AI chỉ ra hồ sơ cần hành động</h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-600">Gợi ý thiếu dữ liệu, follow-up và rủi ro SLA. Chưa tự gửi tin hoặc tự chuyển bước.</p>
            <Link to="/business-os/ai" className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-violet-700">Xem nguyên tắc AI <ArrowRight className="h-3.5 w-3.5" /></Link>
          </section>
        </div>
      </div>
      {createOpen && (
        <QuickLeadModal
          companyId={data?.company?.id}
          contract={data?.qualification_contract}
          onClose={() => setCreateOpen(false)}
          onCreated={async (lead) => {
            setCreateOpen(false);
            await onRefresh?.();
            if (lead?.id) navigate(`/crm/leads/${lead.id}`);
          }}
        />
      )}
    </div>
  );
}
