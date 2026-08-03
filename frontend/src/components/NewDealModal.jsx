import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { User, X, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { isAdminLike } from '../lib/adminRole';
import { isMetallaOrHucabiCompanyId } from '../lib/crossWorkshopProduction';

const INTAKE_PHASE_LABELS = {
  prep: 'Chuẩn bị',
  partner: 'Công ty đối tác',
  insert_deal: 'Tạo deal',
  participants: 'Thành viên',
  insert_project: 'Tạo dự án',
  link_staff: 'Gán nhân sự',
  sync_kanban: 'Sync Kanban',
  docs: 'Tài liệu',
  notify: 'Thông báo',
};

function formatIntakeMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

function buildWorkshopIntakeTimingAlert({ code, timing, reloadMs, clientTotalMs }) {
  const phases = timing?.phases_ms || {};
  const phaseLines = Object.entries(phases)
    .filter(([, ms]) => Number(ms) >= 50)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 6)
    .map(([key, ms]) => `• ${INTAKE_PHASE_LABELS[key] || key}: ${formatIntakeMs(ms)}`)
    .join('\n');

  const apiMs = timing?.api_total_ms ?? timing?.total_ms;
  const lines = [
    `Đã tạo đơn xưởng${code ? ` ${code}` : ''} — tổng ${formatIntakeMs(clientTotalMs)}`,
    `• API tạo đơn: ${formatIntakeMs(apiMs)}`,
  ];
  if (reloadMs != null) lines.push(`• Tải lại board: ${formatIntakeMs(reloadMs)}`);
  if (phaseLines) {
    lines.push('', 'Chi tiết API (chậm nhất trước):', phaseLines);
  }
  return lines.join('\n');
}

/**
 * Modal tạo deal — dùng chung CRM và Sản xuất.
 * variant="production": sau khi tạo deal gọi auto-create-project → cột «Chờ vào xưởng».
 */
export default function NewDealModal({
  onClose,
  onSuccess,
  leadTypes,
  companies,
  defaultCompanyId,
  currentUser,
  variant = 'crm',
  workTypes = [],
  defaultWorkshopTypeId = '',
  defaultRegionId = '',
  allowProductionCompanyPick = false,
  productionCompanyOptions = [],
  defaultExternalCompanyName = '',
}) {
  const isProduction = variant === 'production';
  const ringClass = isProduction ? 'focus:ring-blue-400' : 'focus:ring-purple-400';
  const isAdmin = isAdminLike(currentUser);
  const canPickCompany = isAdmin || (isProduction && allowProductionCompanyPick);
  const companySelectOptions = useMemo(() => {
    if (isProduction && allowProductionCompanyPick && productionCompanyOptions?.length) {
      return productionCompanyOptions;
    }
    return companies || [];
  }, [isProduction, allowProductionCompanyPick, productionCompanyOptions, companies]);
  const [formData, setFormData] = useState({
    title: '',
    customer_name: '',
    customer_phone: '',
    customer_company: '',
    customer_email: '',
    source_id: '',
    company_id: defaultCompanyId || '',
    region_id: defaultRegionId ? String(defaultRegionId) : '',
    lead_type_id: '',
    workshop_type_id: defaultWorkshopTypeId || '',
    estimated_value: 0,
    production_value: '',
    probability: 50,
    install_address: '',
    description: '',
    external_company_name: '',
    referrer_name: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [modalSources, setModalSources] = useState([]);
  const [modalRegions, setModalRegions] = useState([]);
  const [referrers, setReferrers] = useState([]);
  const [referrerPick, setReferrerPick] = useState('');
  const [modalWorkTypes, setModalWorkTypes] = useState([]);
  const [clientCompanies, setClientCompanies] = useState([]);
  const [clientCompanyPick, setClientCompanyPick] = useState('');

  const requiresClientCompany = useMemo(() => {
    if (!isProduction || !formData.company_id) return false;
    return isMetallaOrHucabiCompanyId(formData.company_id, companies);
  }, [isProduction, formData.company_id, companies]);

  const clientCompanyIdForWorkshopTypes = useMemo(() => {
    if (!clientCompanyPick || clientCompanyPick === '__new__') return null;
    const hit = clientCompanies.find((c) => String(c.id) === String(clientCompanyPick));
    if (!hit?.client_company_id) return null;
    return String(hit.client_company_id);
  }, [clientCompanyPick, clientCompanies]);

  const visibleLeadTypes = useMemo(() => {
    const cid = String(formData.company_id || '');
    return (Array.isArray(leadTypes) ? leadTypes : [])
      .filter((t) => String(t.company_id || '') === cid)
      .filter((t) => t.applies_to === 'both' || t.applies_to === 'deal');
  }, [leadTypes, formData.company_id]);

  const visibleWorkTypes = useMemo(() => {
    if (isProduction && modalWorkTypes.length) return modalWorkTypes;
    const cid = String(formData.company_id || '');
    return (Array.isArray(workTypes) ? workTypes : [])
      .filter((t) => !cid || String(t.company_id || '') === cid);
  }, [isProduction, modalWorkTypes, workTypes, formData.company_id]);

  useEffect(() => {
    if (!isProduction) return undefined;
    const cid = String(formData.company_id || '').trim();
    if (!cid) {
      setModalWorkTypes([]);
      return undefined;
    }
    // Metalla/Hucabi: bắt chọn công ty đặt hàng trước. «Công ty khác» / danh mục ngoài
    // không có client_company_id CRM — vẫn tải phân loại xưởng (không lọc theo CRM).
    if (requiresClientCompany && !clientCompanyPick) {
      setModalWorkTypes([]);
      return undefined;
    }
    let cancelled = false;
    const params = { company_id: cid, module: 'production' };
    if (clientCompanyIdForWorkshopTypes) params.client_company_id = clientCompanyIdForWorkshopTypes;
    api.get('/workshop/project-types', { params })
      .then((r) => {
        if (cancelled) return;
        setModalWorkTypes(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => { if (!cancelled) setModalWorkTypes([]); });
    return () => { cancelled = true; };
  }, [isProduction, formData.company_id, clientCompanyPick, clientCompanyIdForWorkshopTypes, requiresClientCompany]);

  useEffect(() => {
    if (!isProduction) return undefined;
    const cid = String(formData.company_id || '').trim();
    if (!cid) {
      setClientCompanies([]);
      setClientCompanyPick('');
      return undefined;
    }
    let cancelled = false;
    api.get('/production/client-companies', { params: { company_id: cid } })
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data?.items) ? r.data.items : [];
        setClientCompanies(list);
      })
      .catch(() => { if (!cancelled) setClientCompanies([]); });
    return () => { cancelled = true; };
  }, [isProduction, formData.company_id]);

  useEffect(() => {
    if (!isProduction || !requiresClientCompany) return;
    if (clientCompanyPick) return;
    const needle = String(defaultExternalCompanyName || '').trim().toLowerCase();
    if (!needle || !clientCompanies.length) return;
    const hit = clientCompanies.find((c) => {
      if (c.client_company_id) {
        const sn = String(c.short_name || '').toLowerCase();
        const name = String(c.name || '').toLowerCase();
        return sn === needle || name.includes('vạn phú') || name.includes('vpt') || sn.includes('vpt');
      }
      const name = String(c.name || '').toLowerCase();
      return name === needle || name.includes('vạn phú') || name.includes('vpt');
    });
    if (hit) setClientCompanyPick(String(hit.id));
  }, [isProduction, requiresClientCompany, defaultExternalCompanyName, clientCompanies, clientCompanyPick]);

  useEffect(() => {
    if (!isProduction || requiresClientCompany) return;
    if (clientCompanyPick) return;
    const needle = String(defaultExternalCompanyName || '').trim().toLowerCase();
    if (!needle || !clientCompanies.length) return;
    const hit = clientCompanies.find((c) => {
      const name = String(c.name || '').toLowerCase();
      const sn = String(c.short_name || '').toLowerCase();
      return name === needle || sn === needle || name.includes('vạn phú') || name.includes('vpt');
    });
    if (hit) setClientCompanyPick(String(hit.id));
  }, [isProduction, requiresClientCompany, defaultExternalCompanyName, clientCompanies, clientCompanyPick]);

  useEffect(() => {
    if (isProduction) return undefined;
    const cid = String(formData.company_id || '').trim();
    if (!cid) {
      setModalSources([]);
      return undefined;
    }
    let cancelled = false;
    api.get('/crm/sources', { params: { company_id: cid } })
      .then((r) => {
        if (cancelled) return;
        const list = r.data?.sources || (Array.isArray(r.data) ? r.data : []);
        setModalSources(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (!cancelled) setModalSources([]); });
    return () => { cancelled = true; };
  }, [isProduction, formData.company_id]);

  useEffect(() => {
    if (isProduction) return undefined;
    const cid = String(formData.company_id || '').trim();
    if (!cid) {
      setReferrers([]);
      setReferrerPick('');
      return undefined;
    }
    let cancelled = false;
    api.get('/crm/referrers', { params: { company_id: cid } })
      .then((r) => {
        if (cancelled) return;
        setReferrers(Array.isArray(r.data?.items) ? r.data.items : []);
      })
      .catch(() => { if (!cancelled) setReferrers([]); });
    return () => { cancelled = true; };
  }, [isProduction, formData.company_id]);

  useEffect(() => {
    const cid = String(formData.company_id || '').trim();
    if (!cid) {
      setModalRegions([]);
      return undefined;
    }
    const selectedCo = (companies || []).find((c) => String(c.id) === cid);
    const divId = selectedCo?.division_unit_id || null;
    let cancelled = false;
    const params = { company_id: cid, for_module: isProduction ? 'production' : 'crm' };
    if (divId) params.division_unit_id = divId;
    api.get('/crm/company-regions', { params })
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setModalRegions(list.filter((x) => x.is_active !== false));
      })
      .catch(() => { if (!cancelled) setModalRegions([]); });
    return () => { cancelled = true; };
  }, [formData.company_id, companies, isProduction]);

  useEffect(() => {
    const uidRegions = currentUser?.crm_region_ids;
    if (!Array.isArray(uidRegions) || uidRegions.length !== 1) return;
    const only = String(uidRegions[0]);
    const ok = modalRegions.some((r) => String(r.id) === only);
    if (ok && String(formData.region_id || '') !== only) {
      setFormData((prev) => ({ ...prev, region_id: only }));
    }
  }, [modalRegions, currentUser?.crm_region_ids, formData.region_id]);

  useEffect(() => {
    if (isAdmin || allowProductionCompanyPick) return;
    const cid = (currentUser?.company_id ? String(currentUser.company_id) : '') || (defaultCompanyId ? String(defaultCompanyId) : '');
    if (cid && String(formData.company_id || '') !== String(cid)) {
      setFormData((prev) => ({ ...prev, company_id: cid }));
    }
  }, [isAdmin, allowProductionCompanyPick, defaultCompanyId, currentUser?.company_id, formData.company_id]);

  useEffect(() => {
    if (!defaultCompanyId) return;
    if (allowProductionCompanyPick && !formData.company_id) {
      setFormData((prev) => ({ ...prev, company_id: String(defaultCompanyId) }));
    }
  }, [defaultCompanyId, allowProductionCompanyPick, formData.company_id]);

  useEffect(() => {
    if (!formData.lead_type_id) return;
    const ok = visibleLeadTypes.some((t) => String(t.id) === String(formData.lead_type_id));
    if (!ok) setFormData((prev) => ({ ...prev, lead_type_id: '' }));
  }, [formData.company_id, visibleLeadTypes, formData.lead_type_id]);

  useEffect(() => {
    if (!formData.workshop_type_id) return;
    const ok = visibleWorkTypes.some((t) => String(t.id) === String(formData.workshop_type_id));
    if (!ok) setFormData((prev) => ({ ...prev, workshop_type_id: '' }));
  }, [formData.company_id, visibleWorkTypes, formData.workshop_type_id, clientCompanyIdForWorkshopTypes]);

  useEffect(() => {
    if (!formData.source_id) return;
    const ok = modalSources.some((s) => String(s.id) === String(formData.source_id));
    if (!ok) setFormData((prev) => ({ ...prev, source_id: '' }));
  }, [modalSources, formData.source_id]);

  useEffect(() => {
    if (!formData.region_id) return;
    const ok = modalRegions.some((r) => String(r.id) === String(formData.region_id));
    if (!ok) setFormData((prev) => ({ ...prev, region_id: '' }));
  }, [modalRegions, formData.region_id]);

  const resolvedClientCompany = useMemo(() => {
    if (!clientCompanyPick || clientCompanyPick === '__new__') return null;
    return clientCompanies.find((c) => String(c.id) === String(clientCompanyPick)) || null;
  }, [clientCompanyPick, clientCompanies]);

  const clientCrmCompanyOptions = useMemo(
    () => clientCompanies.filter((c) => c.client_company_id),
    [clientCompanies],
  );

  const clientExternalCatalogOptions = useMemo(
    () => clientCompanies.filter((c) => !c.client_company_id),
    [clientCompanies],
  );

  const resolvedExternalCompanyName = useMemo(() => {
    if (!isProduction) return '';
    if (resolvedClientCompany) {
      return resolvedClientCompany.short_name || resolvedClientCompany.name || '';
    }
    if (clientCompanyPick === '__new__') {
      return String(formData.external_company_name || '').trim();
    }
    return '';
  }, [isProduction, resolvedClientCompany, clientCompanyPick, formData.external_company_name]);

  const clientCompanySubmit = useMemo(() => {
    if (!resolvedClientCompany) return null;
    return {
      external_company_id: resolvedClientCompany.client_company_id || null,
      external_catalog_id: resolvedClientCompany.external_catalog_id || null,
      external_company_name: resolvedClientCompany.short_name || resolvedClientCompany.name || null,
    };
  }, [resolvedClientCompany]);

  const resolvedReferrerName = useMemo(() => {
    if (isProduction || !referrerPick) return '';
    if (referrerPick === '__new__') return String(formData.referrer_name || '').trim();
    const hit = referrers.find((x) => String(x.id) === String(referrerPick));
    return hit?.name?.trim() || '';
  }, [isProduction, referrerPick, referrers, formData.referrer_name]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title) return alert('Nhập tên Deal');
    if (!formData.company_id) return alert('Vui lòng chọn công ty');
    if (!isProduction) {
      if (!formData.customer_name) return alert('Nhập tên khách hàng');
      if (!formData.customer_phone) return alert('Nhập số điện thoại khách hàng');
    }
    if (modalRegions.length > 0 && !formData.region_id) return alert('Chọn khu vực');
    if (isProduction) {
      if (!visibleWorkTypes.length) return alert('Công ty chưa cấu hình phân loại xưởng');
      if (!formData.workshop_type_id) return alert('Chọn phân loại xưởng');
      if (requiresClientCompany && !clientCompanyPick) {
        return alert('Chọn công ty chủ deal (công ty đặt hàng từ CRM)');
      }
      if (clientCompanyPick === '__new__' && !formData.external_company_name?.trim()) {
        return alert('Nhập tên công ty đặt hàng');
      }
    }

    setSaving(true);
    setSaveMessage(isProduction ? 'Đang tạo đơn xưởng...' : 'Đang tạo deal...');
    try {
      if (isProduction) {
        const clientT0 = Date.now();
        setSaveMessage('Đang tạo đơn xưởng (API)...');
        const { data } = await api.post('/production/workshop-intake', {
          title: formData.title,
          company_id: formData.company_id || null,
          workshop_type_id: formData.workshop_type_id || null,
          region_id: formData.region_id || null,
          customer_name: formData.customer_name,
          customer_phone: formData.customer_phone,
          customer_email: formData.customer_email || null,
          install_address: formData.install_address || null,
          production_value: formData.production_value === '' || formData.production_value == null
            ? null
            : (parseFloat(formData.production_value) || null),
          description: formData.description || null,
          external_company_name: clientCompanyPick === '__new__'
            ? String(formData.external_company_name || '').trim()
            : (clientCompanySubmit?.external_company_name || resolvedExternalCompanyName || null),
          external_company_id: clientCompanyPick === '__new__'
            ? null
            : (clientCompanySubmit?.external_company_id || null),
          external_catalog_id: clientCompanyPick === '__new__'
            ? null
            : (clientCompanySubmit?.external_catalog_id || null),
        });
        const apiElapsed = Date.now() - clientT0;
        const apiMs = data?.timing?.api_total_ms ?? data?.timing?.total_ms ?? apiElapsed;
        setSaveMessage(`API xong ${formatIntakeMs(apiMs)} — đang tải lại board...`);
        const payload = {
          ...data,
          workshop_type_id: formData.workshop_type_id || null,
          customer_name: formData.customer_name,
          customer_phone: formData.customer_phone,
          company_id: formData.company_id || null,
        };
        const reloadT0 = Date.now();
        if (onSuccess) await onSuccess(payload);
        const reloadMs = Date.now() - reloadT0;
        const clientTotalMs = Date.now() - clientT0;
        console.info('[workshop-intake] client timing', {
          api_ms: apiMs,
          reload_ms: reloadMs,
          client_total_ms: clientTotalMs,
          server: data?.timing,
        });
        alert(buildWorkshopIntakeTimingAlert({
          code: data?.project_code || data?.deal_code,
          timing: data?.timing,
          reloadMs,
          clientTotalMs,
        }));
        onClose();
        return;
      }

      const { data: customer } = await api.post('/customers', {
        full_name: formData.customer_name,
        phone: formData.customer_phone,
        company: formData.customer_company?.trim() || null,
        email: formData.customer_email || null,
        address: formData.install_address || null,
        ...(formData.company_id ? { company_id: formData.company_id } : {}),
      });
      const customerId = customer?.id || customer?.customer?.id;

      const { data: deal } = await api.post('/crm/deals', {
        title: formData.title,
        customer_id: customerId || null,
        source_id: formData.source_id || null,
        company_id: formData.company_id || null,
        region_id: formData.region_id || null,
        lead_type_id: formData.lead_type_id || null,
        estimated_value: parseFloat(formData.estimated_value) || 0,
        probability: parseInt(formData.probability, 10) || 50,
        install_address: formData.install_address || null,
        description: formData.description || null,
        referrer_name: resolvedReferrerName || null,
      });

      onSuccess?.(deal);
      onClose();
    } catch (err) {
      alert(err.response?.data?.error || (isProduction ? 'Lỗi tạo đơn xưởng' : 'Lỗi tạo Deal'));
    }
    setSaving(false);
    setSaveMessage('');
  };

  const set = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  const companyName = companies.find((c) => String(c.id) === String(formData.company_id))?.short_name
    || companies.find((c) => String(c.id) === String(formData.company_id))?.name || '';
  const regionName = modalRegions.find((r) => String(r.id) === String(formData.region_id))?.name || '';
  const sourceName = modalSources.find((s) => String(s.id) === String(formData.source_id))?.name || '';
  const leadTypeName = visibleLeadTypes.find((t) => String(t.id) === String(formData.lead_type_id))?.name || '';
  const referrerDisplayName = resolvedReferrerName || '';
  const workTypeName = visibleWorkTypes.find((t) => String(t.id) === String(formData.workshop_type_id))?.name || '';

  const cardBorder = isProduction ? 'border-blue-200' : 'border-purple-200';
  const cardLabelClass = isProduction ? 'text-blue-500' : 'text-purple-500';
  const probBadgeClass = isProduction ? 'text-blue-700 bg-blue-50' : 'text-purple-700 bg-purple-50';
  const submitBtnClass = isProduction ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700';

  // Portal ra body — tránh bị Sidebar (z-30) đè vì modal nằm trong cột main (z-10)
  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10050] p-4">
      <div
        data-tour="new-deal-modal"
        className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex overflow-hidden max-h-[92vh]"
      >

        <div className="flex-1 flex flex-col min-w-0 border-r border-gray-100">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {isProduction ? '🏭 Tạo đơn xưởng' : '🎯 Tạo Deal mới'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {isProduction
                  ? 'Tạo trực tiếp trên Kanban SX — không qua pipeline CRM'
                  : 'Tạo deal trực tiếp — không cần qua Lead'}
              </p>
            </div>
            <button
              type="button"
              data-tour="new-deal-modal-close"
              onClick={onClose}
              disabled={saving}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>

          {saving && saveMessage && (
            <div className="mx-6 mt-3 flex items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 shrink-0">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
              <span className="text-sm font-medium text-blue-800">{saveMessage}</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <form id="deal-form" onSubmit={handleSubmit} className="space-y-3.5">
              <div data-tour="new-deal-title">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tên Deal <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => set('title', e.target.value)}
                  className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 ${ringClass} focus:border-transparent text-sm`}
                  placeholder="VD: Tủ bếp gỗ sồi nhà anh Minh"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    🏢 {isProduction ? 'Công ty SX' : 'Công ty'} <span className="text-red-500">*</span>
                  </label>
                  {canPickCompany ? (
                    <select
                      value={formData.company_id}
                      onChange={(e) => {
                        setClientCompanyPick('');
                        setFormData((prev) => ({
                          ...prev,
                          company_id: e.target.value,
                          region_id: '',
                          workshop_type_id: '',
                          external_company_name: '',
                          referrer_name: '',
                        }));
                        setReferrerPick('');
                      }}
                      required
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${ringClass} text-sm ${!formData.company_id ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                    >
                      <option value="">-- Chọn --</option>
                      {companySelectOptions.map((c) => (
                        <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-800">
                      {companyName || 'Công ty của bạn'}
                    </div>
                  )}
                </div>
                {modalRegions.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">📍 Khu vực <span className="text-red-500">*</span></label>
                    <select
                      required
                      value={formData.region_id}
                      onChange={(e) => set('region_id', e.target.value)}
                      className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 ${ringClass} text-sm`}
                    >
                      <option value="">-- Chọn --</option>
                      {modalRegions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}{r.division?.short_name ? ` — ${r.division.short_name}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 rounded-xl p-3.5 space-y-2.5">
                <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">👤 Thông tin khách hàng</p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Tên khách hàng {isProduction ? <span className="text-gray-400 font-normal">(tùy chọn)</span> : <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    required={!isProduction}
                    value={formData.customer_name}
                    onChange={(e) => set('customer_name', e.target.value)}
                    className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 ${ringClass} text-sm bg-white`}
                    placeholder={isProduction ? 'Để trống nếu chưa có' : 'Nguyễn Văn A'}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Số điện thoại {isProduction ? <span className="text-gray-400 font-normal">(tùy chọn)</span> : <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      required={!isProduction}
                      value={formData.customer_phone}
                      onChange={(e) => set('customer_phone', e.target.value)}
                      className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 ${ringClass} text-sm bg-white`}
                      placeholder={isProduction ? 'Để trống nếu chưa có' : '0901234567'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.customer_email}
                      onChange={(e) => set('customer_email', e.target.value)}
                      className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 ${ringClass} text-sm bg-white`}
                      placeholder="email@example.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Công ty KH</label>
                  <input
                    type="text"
                    value={formData.customer_company}
                    onChange={(e) => set('customer_company', e.target.value)}
                    className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 ${ringClass} text-sm bg-white`}
                    placeholder="Tên công ty khách hàng (nếu có)"
                  />
                </div>
              </div>

              {isProduction && formData.company_id && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    🏢 Công ty đặt hàng
                    {requiresClientCompany ? (
                      <span className="text-red-500"> *</span>
                    ) : (
                      <span className="font-normal text-gray-500"> (tùy chọn)</span>
                    )}
                    {allowProductionCompanyPick && defaultExternalCompanyName ? (
                      <span className="ml-1 font-normal text-indigo-600">(gợi ý: {defaultExternalCompanyName})</span>
                    ) : null}
                  </label>
                  <select
                    required={requiresClientCompany}
                    value={clientCompanyPick}
                    onChange={(e) => {
                      const v = e.target.value;
                      setClientCompanyPick(v);
                      if (v !== '__new__') set('external_company_name', '');
                      set('workshop_type_id', '');
                    }}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${ringClass} text-sm ${
                      requiresClientCompany && !clientCompanyPick ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  >
                    {!requiresClientCompany && <option value="">— Không chọn —</option>}
                    {requiresClientCompany && <option value="">-- Chọn công ty đặt hàng --</option>}
                    {clientCrmCompanyOptions.length > 0 && (
                      <optgroup label="Công ty CRM">
                        {clientCrmCompanyOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.short_name || c.name}
                            {c.source === 'workshop' ? ' · đã liên kết' : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {clientExternalCatalogOptions.length > 0 && (
                      <optgroup label="Danh mục công ty ngoài">
                        {clientExternalCatalogOptions.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </optgroup>
                    )}
                    <option value="__new__">➕ Công ty khác (nhập tên mới)</option>
                  </select>
                  {clientCompanyPick === '__new__' && (
                    <input
                      type="text"
                      value={formData.external_company_name}
                      onChange={(e) => set('external_company_name', e.target.value)}
                      className={`mt-2 w-full px-3 py-2 border rounded-lg focus:ring-2 ${ringClass} text-sm ${
                        !formData.external_company_name?.trim() ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
                      }`}
                      placeholder="VD: Công ty ABC, Phúc Đạt Door…"
                      autoFocus
                    />
                  )}
                  <p className="mt-1 text-[10px] text-gray-400">
                    Danh sách gồm công ty CRM trong hệ thống và công ty đã lưu trước đó.
                    Chọn công ty CRM thì phân loại lọc theo công ty đó; chọn «Công ty khác» thì hiện toàn bộ phân loại xưởng.
                  </p>
                </div>
              )}

              {isProduction && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    📦 Phân loại xưởng <span className="text-red-500">*</span>
                  </label>
                  {visibleWorkTypes.length > 0 ? (
                    <select
                      required
                      value={formData.workshop_type_id}
                      onChange={(e) => set('workshop_type_id', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 ${ringClass} text-sm ${
                        !formData.workshop_type_id ? 'border-red-300 bg-red-50' : 'border-gray-200'
                      }`}
                    >
                      <option value="">-- Chọn phân loại --</option>
                      {visibleWorkTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  ) : (
                    <p className="px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
                      {requiresClientCompany && !clientCompanyPick
                        ? 'Chọn công ty đặt hàng trước — phân loại hiện theo công ty CRM đó.'
                        : 'Chưa có phân loại cho công ty đặt hàng này — kiểm tra cài đặt pipeline SX hoặc đơn đã tạo trước đó.'}
                    </p>
                  )}
                  {visibleWorkTypes.some((t) => t.description?.trim()) && (
                    <div className="mt-1.5 space-y-1">
                      {visibleWorkTypes.filter((t) => t.description?.trim()).map((t) => (
                        <p
                          key={t.id}
                          className={`text-[11px] rounded-lg px-2 py-1.5 border ${String(t.id) === String(formData.workshop_type_id)
                            ? 'bg-teal-50 border-teal-200 text-teal-800'
                            : 'bg-gray-50 border-gray-100 text-gray-500'}`}
                        >
                          💡 <strong>{t.name}</strong>: {t.description}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">📍 Địa chỉ lắp đặt</label>
                <input
                  type="text"
                  value={formData.install_address}
                  onChange={(e) => set('install_address', e.target.value)}
                  className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 ${ringClass} text-sm`}
                  placeholder="Số nhà, đường, quận/huyện, TP..."
                />
              </div>

              {!isProduction && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Nguồn</label>
                      <select
                        value={formData.source_id}
                        onChange={(e) => set('source_id', e.target.value)}
                        className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 ${ringClass} text-sm`}
                      >
                        <option value="">-- Nguồn --</option>
                        {modalSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    {visibleLeadTypes.length > 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">🏷️ Loại Deal</label>
                        <select
                          value={formData.lead_type_id}
                          onChange={(e) => set('lead_type_id', e.target.value)}
                          className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 ${ringClass} text-sm`}
                        >
                          <option value="">-- Không bắt buộc --</option>
                          {visibleLeadTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  {formData.company_id && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">🤝 Người giới thiệu</label>
                      <select
                        value={referrerPick}
                        onChange={(e) => {
                          const v = e.target.value;
                          setReferrerPick(v);
                          if (v !== '__new__') set('referrer_name', '');
                        }}
                        className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 ${ringClass} text-sm`}
                      >
                        <option value="">— Không chọn —</option>
                        {referrers.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                        <option value="__new__">➕ Nhập người giới thiệu mới…</option>
                      </select>
                      {referrerPick === '__new__' && (
                        <input
                          type="text"
                          value={formData.referrer_name}
                          onChange={(e) => set('referrer_name', e.target.value)}
                          className={`mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 ${ringClass} text-sm`}
                          placeholder="VD: Anh Tuấn — đại lý Q1"
                          autoFocus
                        />
                      )}
                      <p className="mt-1 text-[10px] text-gray-400">
                        Tùy chọn — tên mới sẽ được lưu để chọn lại lần sau
                      </p>
                    </div>
                  )}
                </>
              )}

              {isProduction ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Chi phí xưởng (VND)</label>
                  <input
                    type="number"
                    value={formData.production_value}
                    onChange={(e) => set('production_value', e.target.value)}
                    className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 ${ringClass} text-sm`}
                    placeholder="0"
                  />
                  <p className="mt-1 text-[10px] text-gray-400">Xưởng không nhập doanh thu. Công nợ = chi phí − tiền cọc</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Giá trị (VND)</label>
                    <input
                      type="number"
                      value={formData.estimated_value}
                      onChange={(e) => set('estimated_value', e.target.value)}
                      className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 ${ringClass} text-sm`}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Xác suất (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.probability}
                      onChange={(e) => set('probability', e.target.value)}
                      className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 ${ringClass} text-sm`}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Ghi chú</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => set('description', e.target.value)}
                  rows={2}
                  className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 ${ringClass} text-sm resize-none`}
                  placeholder="Ghi chú thêm về deal..."
                />
              </div>
            </form>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 shrink-0 bg-gray-50">
            {currentUser && (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <User className="h-3.5 w-3.5 text-green-600 shrink-0" />
                <span className="text-xs text-gray-500 truncate">
                  Phụ trách: <span className="font-semibold text-gray-700">{currentUser.full_name || currentUser.email}</span>
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Hủy
            </button>
            <button
              type="submit"
              form="deal-form"
              data-tour="new-deal-save"
              disabled={saving || (isProduction && !visibleWorkTypes.length)}
              className={`px-5 py-2 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50 cursor-pointer shrink-0 ${submitBtnClass}`}
            >
              {saving
                ? (isProduction ? 'Đang xử lý...' : 'Đang tạo...')
                : (isProduction ? '🏭 Tạo & vào xưởng' : '🎯 Tạo Deal')}
            </button>
          </div>
        </div>

        <div className="w-72 shrink-0 bg-gray-50 flex flex-col hidden sm:flex">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              {isProduction ? 'Xem trước thẻ xưởng' : 'Xem trước thẻ Deal'}
            </p>
          </div>
          <div className="flex-1 px-4 py-5 overflow-y-auto">
            <div className={`bg-white rounded-xl border ${cardBorder} shadow-sm p-4 space-y-3`}>
              <div>
                <p className={`text-[10px] font-bold ${cardLabelClass} uppercase tracking-wide mb-1`}>
                  {isProduction ? '🏭 SX' : '🎯 Deal'}
                </p>
                <p className="text-sm font-bold text-gray-900 leading-snug min-h-[1.5rem]">
                  {formData.title || <span className="text-gray-300 italic font-normal">Chưa có tên...</span>}
                </p>
              </div>

              <div className="flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2.5">
                <User className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">
                    {formData.customer_name || <span className="text-gray-300 italic font-normal">Tên khách hàng</span>}
                  </p>
                  {formData.customer_phone && <p className="text-[11px] text-gray-500">{formData.customer_phone}</p>}
                  {formData.customer_email && <p className="text-[11px] text-gray-400 truncate">{formData.customer_email}</p>}
                </div>
              </div>

              <div className="space-y-1.5 text-[11px] text-gray-500">
                {companyName && (
                  <div className="flex items-center gap-1.5"><span className="text-gray-400">🏢</span><span className="truncate">{companyName}</span></div>
                )}
                {regionName && (
                  <div className="flex items-center gap-1.5"><span className="text-gray-400">📍</span><span className="truncate">{regionName}</span></div>
                )}
                {formData.install_address && (
                  <div className="flex items-center gap-1.5"><span className="text-gray-400">🏠</span><span className="truncate">{formData.install_address}</span></div>
                )}
                {sourceName && (
                  <div className="flex items-center gap-1.5"><span className="text-gray-400">📣</span><span>{sourceName}</span></div>
                )}
                {leadTypeName && (
                  <div className="flex items-center gap-1.5"><span className="text-gray-400">🏷️</span><span>{leadTypeName}</span></div>
                )}
                {referrerDisplayName && (
                  <div className="flex items-center gap-1.5"><span className="text-gray-400">🤝</span><span className="truncate">{referrerDisplayName}</span></div>
                )}
                {workTypeName && (
                  <div className="flex items-center gap-1.5"><span className="text-gray-400">📦</span><span>{workTypeName}</span></div>
                )}
                {resolvedExternalCompanyName && (
                  <div className="flex items-center gap-1.5"><span className="text-gray-400">🤝</span><span className="truncate">{resolvedExternalCompanyName}</span></div>
                )}
              </div>

              {((isProduction && Number(formData.production_value) > 0)
                || (!isProduction && (Number(formData.estimated_value) > 0 || formData.probability))) && (
                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  {isProduction && Number(formData.production_value) > 0 && (
                    <span className="text-xs font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                      Chi phí {Number(formData.production_value).toLocaleString('vi-VN')}đ
                    </span>
                  )}
                  {!isProduction && Number(formData.estimated_value) > 0 && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      {Number(formData.estimated_value).toLocaleString('vi-VN')}đ
                    </span>
                  )}
                  {!isProduction && formData.probability > 0 && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${probBadgeClass}`}>{formData.probability}%</span>
                  )}
                </div>
              )}

              {currentUser && (
                <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
                  <div className="h-5 w-5 rounded-full bg-green-200 flex items-center justify-center text-[9px] font-bold text-green-800 shrink-0">
                    {(currentUser.full_name || currentUser.email || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-[11px] text-gray-500 truncate">{currentUser.full_name || currentUser.email}</span>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-center">
              <p className="text-[10px] text-gray-400">{isProduction ? '🏭 Kanban SX' : '📋 Pipeline mặc định'}</p>
              <p className="text-xs font-medium text-gray-600 mt-0.5">
                {isProduction ? 'Cột «Chờ vào xưởng»' : 'Giai đoạn đầu tiên'}
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>,
    document.body,
  );
}
