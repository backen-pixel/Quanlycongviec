import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

/**
 * Cấu hình module / công ty / khu vực / pipeline / phân loại / người phụ trách
 * cho tích hợp inbox (Facebook Page, Zalo OA, ...).
 */
export default function IntegrationLeadRoutingFields({
  form,
  setForm,
  channelName = 'Facebook',
  ownerFallbackLabel = 'Người tạo (mặc định)',
}) {
  const [companies, setCompanies] = useState([]);
  const [stages, setStages] = useState([]);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [leadTypes, setLeadTypes] = useState([]);
  const [leadTypesLoading, setLeadTypesLoading] = useState(false);
  const [formCompanyRegions, setFormCompanyRegions] = useState([]);

  const moduleKey = String(form.default_module_key || '').trim().toLowerCase();
  const targetType = moduleKey === 'production' || moduleKey === 'logistics'
    ? 'deal'
    : moduleKey === 'crm'
      ? 'lead'
      : '';

  useEffect(() => {
    if (!moduleKey) {
      setCompanies([]);
      return;
    }
    api.get('/companies', { params: { for_module: moduleKey } })
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, [moduleKey]);

  useEffect(() => {
    const cid = form.default_company_id;
    if (!cid || !moduleKey) {
      setUsers([]);
      return;
    }
    api.get('/crm/employees-by-company', { params: { company_id: cid, for_module: moduleKey } })
      .then((r) => setUsers(Array.isArray(r.data?.users) ? r.data.users : []))
      .catch(() => setUsers([]));
  }, [form.default_company_id, moduleKey]);

  useEffect(() => {
    const cid = form.default_company_id;
    if (!cid || !moduleKey) {
      setFormCompanyRegions([]);
      return;
    }
    let cancelled = false;
    api.get('/crm/company-regions', { params: { company_id: cid, for_module: moduleKey } })
      .then((r) => {
        if (!cancelled) setFormCompanyRegions(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => {
        if (!cancelled) setFormCompanyRegions([]);
      });
    return () => { cancelled = true; };
  }, [form.default_company_id, moduleKey]);

  useEffect(() => {
    if (!form.default_region_id || !form.default_company_id) return;
    if (formCompanyRegions.length === 0) return;
    const ok = formCompanyRegions.some((reg) => String(reg.id) === String(form.default_region_id));
    if (!ok) setForm((prev) => ({ ...prev, default_region_id: '' }));
  }, [formCompanyRegions, form.default_region_id, form.default_company_id, setForm]);

  useEffect(() => {
    const cid = form.default_company_id;
    if (!cid || !targetType) {
      setStages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setStagesLoading(true);
      try {
        let arr = [];
        if (moduleKey === 'production') {
          const { data: st } = await api.get('/production/pipeline-stages', {
            params: {
              company_id: cid,
              strict_company: 'true',
              workshop_type_id: form.default_lead_type_id || 'global',
              all: 'true',
            },
          });
          arr = Array.isArray(st) ? st : [];
        } else if (moduleKey === 'logistics') {
          const { data: pls } = await api.get('/crm/pipelines');
          const list = Array.isArray(pls) ? pls : [];
          const forCo = list.filter((p) => String(p.company_id || '') === String(cid));
          const pl = forCo.find((p) => p.is_default) || forCo[0];
          if (pl?.id) {
            const { data: st } = await api.get('/crm/pipeline-stages', {
              params: { type: 'deal', pipeline_id: pl.id, all: 'true' },
            });
            arr = Array.isArray(st) ? st : [];
          }
        } else {
          const { data: pls } = await api.get('/crm/pipelines');
          const list = Array.isArray(pls) ? pls : [];
          const forCo = list.filter((p) => String(p.company_id || '') === String(cid));
          const pl = forCo.find((p) => p.is_default) || forCo[0];
          if (pl?.id) {
            const { data: st } = await api.get('/crm/pipeline-stages', {
              params: { type: targetType, pipeline_id: pl.id, all: 'true' },
            });
            arr = Array.isArray(st) ? st : [];
          }
        }
        if (!cancelled) {
          setStages(arr);
          setForm((prev) => {
            if (!prev.default_stage_id) return prev;
            if (arr.some((s) => String(s.id) === String(prev.default_stage_id))) return prev;
            return { ...prev, default_stage_id: '' };
          });
        }
      } catch {
        if (!cancelled) {
          setStages([]);
          setForm((prev) => (prev.default_stage_id ? { ...prev, default_stage_id: '' } : prev));
        }
      } finally {
        if (!cancelled) setStagesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [form.default_company_id, form.default_lead_type_id, targetType, moduleKey, setForm]);

  useEffect(() => {
    const cid = form.default_company_id;
    if (!cid || !moduleKey) {
      setLeadTypes([]);
      if (form.default_lead_type_id) setForm((prev) => ({ ...prev, default_lead_type_id: '' }));
      return;
    }
    let cancelled = false;
    setLeadTypesLoading(true);
    const req = moduleKey === 'production' || moduleKey === 'logistics'
      ? api.get('/workshop/project-types', { params: { company_id: cid, module: moduleKey, all: 'true' } })
      : api.get('/crm/lead-types', { params: { company_id: cid, all: 'true' } });
    req
      .then((r) => {
        if (!cancelled) setLeadTypes(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => { if (!cancelled) setLeadTypes([]); })
      .finally(() => { if (!cancelled) setLeadTypesLoading(false); });
    return () => { cancelled = true; };
  }, [form.default_company_id, moduleKey, form.default_lead_type_id, setForm]);

  return (
    <div className="space-y-3 border-t border-slate-200 pt-4 mt-2">
      <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2">
        <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Module tạo mới & phạm vi CRM</p>
        <p className="text-[10px] text-gray-500 mt-0.5">
          Bản ghi từ <strong>{channelName}</strong> sẽ gán đúng <strong>công ty</strong>, <strong>khu vực</strong>, <strong>phân loại</strong>, <strong>pipeline</strong> và <strong>người phụ trách</strong>.
        </p>
      </div>

      <div>
        <label className="text-xs text-gray-600 mb-1 block font-medium">Module tạo mới *</label>
        <select
          value={form.default_module_key || ''}
          onChange={(e) => setForm({
            ...form,
            default_module_key: e.target.value,
            default_company_id: '',
            default_region_id: '',
            default_lead_type_id: '',
            default_stage_id: '',
            default_lead_owner_id: '',
          })}
          className="w-full px-3 py-2 text-sm border rounded cursor-pointer"
        >
          <option value="">-- Chọn module --</option>
          <option value="crm">CRM</option>
          <option value="production">Sản xuất</option>
          <option value="logistics">Lắp đặt</option>
        </select>
        <p className="text-[10px] text-gray-500 mt-1">
          Module <strong>Sản xuất</strong> hoặc <strong>Lắp đặt</strong> sẽ tự tạo bản ghi dạng <strong>Deal</strong>.
        </p>
      </div>

      <div>
        <label className="text-xs text-gray-600 mb-1 block font-medium">Công ty mặc định *</label>
        <select
          value={form.default_company_id || ''}
          onChange={(e) => setForm({
            ...form,
            default_company_id: e.target.value,
            default_lead_type_id: '',
            default_stage_id: '',
            default_region_id: '',
          })}
          disabled={!targetType}
          className="w-full px-3 py-2 text-sm border rounded cursor-pointer disabled:opacity-60"
        >
          <option value="">-- Chọn công ty --</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
          ))}
        </select>
        {!targetType && <p className="text-[10px] text-gray-400 mt-1">Chọn module trước</p>}
      </div>

      <div className="rounded-xl border-2 border-teal-500 bg-teal-50 px-3 py-3 shadow-sm">
        <p className="text-sm font-bold text-teal-900 mb-2 flex items-center gap-2">
          <span aria-hidden>📍</span>
          Khu vực CRM
        </p>
        <select
          value={form.default_region_id || ''}
          onChange={(e) => setForm({ ...form, default_region_id: e.target.value })}
          disabled={!targetType || !form.default_company_id}
          className="w-full px-3 py-2.5 text-sm border-2 border-teal-300 rounded-lg bg-white cursor-pointer disabled:opacity-50"
        >
          <option value="">— Chưa chọn khu vực —</option>
          {formCompanyRegions
            .filter((reg) => reg.is_active !== false)
            .map((reg) => (
              <option key={reg.id} value={reg.id}>
                {reg.name}{reg.code ? ` (${reg.code})` : ''}
              </option>
            ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-gray-600 mb-1 block">
          {moduleKey === 'production' || moduleKey === 'logistics'
            ? 'Phân loại mặc định (Đầu vào / Đầu ra)'
            : `Phân loại mặc định (${targetType === 'deal' ? 'Deal' : 'Lead'})`}
        </label>
        <select
          value={form.default_lead_type_id || ''}
          onChange={(e) => setForm({ ...form, default_lead_type_id: e.target.value })}
          disabled={!targetType || !form.default_company_id || leadTypesLoading}
          className="w-full px-3 py-2 text-sm border rounded cursor-pointer disabled:opacity-60"
        >
          <option value="">-- Không chọn --</option>
          {leadTypes
            .filter((t) => t.is_active !== false)
            .filter((t) => {
              if (moduleKey === 'production' || moduleKey === 'logistics') {
                return t.applies_to === 'both' || t.applies_to === moduleKey;
              }
              return t.applies_to === 'both' || t.applies_to === targetType;
            })
            .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs text-gray-600 mb-1 block">
          {moduleKey === 'production'
            ? 'Cột pipeline sản xuất mặc định'
            : moduleKey === 'logistics'
              ? 'Giai đoạn deal (vận chuyển) mặc định'
              : `Giai đoạn pipeline ${targetType === 'deal' ? 'deal' : 'lead'} mặc định`}
        </label>
        <select
          value={form.default_stage_id || ''}
          onChange={(e) => setForm({ ...form, default_stage_id: e.target.value })}
          disabled={!targetType || !form.default_company_id || stagesLoading}
          className="w-full px-3 py-2 text-sm border rounded cursor-pointer disabled:opacity-60"
        >
          <option value="">{stagesLoading ? 'Đang tải…' : '-- Tự động (cột đầu) --'}</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.icon ? `${s.icon} ` : ''}{s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-gray-600 mb-1 block">
          👤 Người chịu trách nhiệm {targetType === 'deal' ? 'Deal' : 'Lead'} mặc định
        </label>
        <select
          value={form.default_lead_owner_id || ''}
          onChange={(e) => setForm({ ...form, default_lead_owner_id: e.target.value })}
          disabled={!form.default_company_id}
          className="w-full px-3 py-2 text-sm border rounded cursor-pointer disabled:opacity-60"
        >
          <option value="">-- {ownerFallbackLabel} --</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name || u.email}{(u.role === 'admin' || u.role === 'sales_admin' || u.role === 'crm_production_admin') ? ' (Admin)' : ''}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-gray-400 mt-1">
          {targetType === 'deal' ? 'Deal' : 'Lead'} mới từ {channelName} sẽ gán người này làm chủ + phụ trách
        </p>
        {String(channelName || '').toLowerCase().includes('zalo') && (
          <p className="text-[10px] text-amber-700 mt-2 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
            Chỉ lead Zalo: chưa có SĐT vẫn hiện Kanban (tab <strong>Lead</strong>, đúng công ty). Lead Facebook vẫn cần SĐT. Khi tạo lead mới, nhiệm vụ CRM được gen tự động từ bộ mẫu pipeline (nếu đã cấu hình). Lead tạo trước khi lưu cấu hình: tab Công cụ Lead → «Áp dụng routing OA → Kanban».
          </p>
        )}
      </div>
    </div>
  );
}
