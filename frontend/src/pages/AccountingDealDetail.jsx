import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, FileText, ShoppingCart, Receipt, Upload, RefreshCw, ExternalLink,
  Factory, DollarSign, Plus, Trash2, Loader2, Save, Banknote, Building2,
  Landmark, Wallet, CheckCircle2, Clock3, AlertCircle, ChevronDown, ChevronUp,
  User, Phone, Tag, TrendingUp, X, FileSpreadsheet, FileImage, File as FileIcon,
  Download, ClipboardList, RefreshCcw, AlertTriangle,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatVND, formatDate } from '../lib/utils';
import { publicFileUrl, getFileOpenAnchorProps, downloadUploadFile } from '../lib/publicFileUrl';
import { isAccountingUser } from '../lib/crossWorkshopProduction';
import ExcelQuotationImport from '../components/ExcelQuotationImport';
import BankAccountsManagerModal from '../components/BankAccountsManagerModal';

const TABS = [
  { id: 'finance', label: 'Tài chính', icon: DollarSign },
  { id: 'documents', label: 'Tài liệu', icon: FileText },
];

const SOURCE_STYLE = {
  crm: { label: 'CRM', tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  crm_task: { label: 'CRM · nhiệm vụ', tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  sx: { label: 'Sản xuất', tone: 'bg-orange-50 text-orange-700 border-orange-200' },
  sx_task: { label: 'SX · nhiệm vụ', tone: 'bg-orange-50 text-orange-700 border-orange-200' },
  sx_shared: { label: 'SX → CRM', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const METHOD_LABEL = { cash: 'Tiền mặt', transfer: 'Chuyển khoản' };
const METHOD_ICON = { cash: Wallet, transfer: Landmark };
const METHOD_TONE = {
  cash: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  transfer: 'bg-blue-50 text-blue-700 border-blue-200',
};

const STATUS_META = {
  pending: { label: 'Chưa thu', tone: 'bg-gray-100 text-gray-600 border-gray-200', icon: Clock3 },
  partial: { label: 'Một phần', tone: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertCircle },
  paid: { label: 'Đủ', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
};

const DOC_BLOCKS = [
  { key: 'quotation', title: 'Báo giá', icon: FileText, ring: 'ring-blue-100', accent: 'text-blue-600', btn: 'bg-blue-600 hover:bg-blue-700', view: (x) => `/crm/quotations/${x.id}` },
  { key: 'order', title: 'Đơn hàng', icon: ShoppingCart, ring: 'ring-emerald-100', accent: 'text-emerald-600', btn: 'bg-emerald-600 hover:bg-emerald-700', view: (x) => `/crm/orders/${x.id}` },
  { key: 'invoice', title: 'Hóa đơn', icon: Receipt, ring: 'ring-purple-100', accent: 'text-purple-600', btn: 'bg-purple-600 hover:bg-purple-700', view: (x) => `/crm/invoices/${x.id}` },
];

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${meta.tone}`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

function MethodPill({ method }) {
  if (!method) return <span className="text-gray-400 text-xs">—</span>;
  const Icon = METHOD_ICON[method] || Wallet;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${METHOD_TONE[method] || METHOD_TONE.cash}`}>
      <Icon className="h-3 w-3" /> {METHOD_LABEL[method] || method}
    </span>
  );
}

function FieldLabel({ children }) {
  return <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{children}</label>;
}

function StatCard({ label, value, icon: Icon, tone, sub }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
      <div className={`absolute -right-3 -top-3 h-16 w-16 rounded-full opacity-10 ${tone.bg}`} />
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`p-1.5 rounded-lg ${tone.bg} ${tone.text}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      </div>
      <p className="text-lg font-extrabold text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function extOf(name) {
  return String(name || '').split('.').pop()?.toLowerCase() || '';
}

function fileIconFor(name) {
  const ext = extOf(name);
  if (['xlsx', 'xls', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return FileImage;
  if (ext === 'pdf') return FileText;
  return FileIcon;
}

function isImageFile(name, mimeType) {
  if (mimeType && /^image\//i.test(mimeType)) return true;
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extOf(name));
}

function isExcelFile(name, mimeType) {
  if (mimeType && /spreadsheet|excel|csv/i.test(mimeType)) return true;
  return ['xlsx', 'xls', 'csv'].includes(extOf(name));
}

const IMPORT_TARGET_OPTIONS = [
  { value: 'quotation', label: 'Báo giá' },
  { value: 'order', label: 'Đơn hàng' },
  { value: 'invoice', label: 'Hóa đơn' },
];

export default function AccountingDealDetail() {
  const { leadId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'finance';
  const setTab = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'finance') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next);
  };

  const { user } = useAuth();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [docFilter, setDocFilter] = useState('all');
  const [importType, setImportType] = useState(null);
  const [importDocSource, setImportDocSource] = useState(null);

  const closeImportModal = () => { setImportType(null); setImportDocSource(null); };
  const handleImportFromDoc = (doc, docType) => {
    setImportDocSource({ file_url: doc.file_url, file_name: doc.file_name || doc.name });
    setImportType(docType);
  };

  const [depositForm, setDepositForm] = useState({
    deposit_amount: '', deposit_received: '', deposit_label: '',
  });
  const [depositSaving, setDepositSaving] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);

  const [stageForm, setStageForm] = useState({
    label: '', planned_amount: '', payment_method: 'cash', bank_account_id: '', notes: '',
  });
  const [editingStageId, setEditingStageId] = useState(null);
  const [stageSaving, setStageSaving] = useState(false);
  const [stageFormOpen, setStageFormOpen] = useState(false);

  const [payForm, setPayForm] = useState({
    amount: '', payment_date: new Date().toISOString().slice(0, 10),
    payment_method: 'cash', bank_account_id: '', stage_id: '',
    reference_number: '', notes: '', invoice_id: '',
  });
  const [paySaving, setPaySaving] = useState(false);
  const [payFormOpen, setPayFormOpen] = useState(false);

  const [syncingValue, setSyncingValue] = useState(false);
  const [inlineSavingStageId, setInlineSavingStageId] = useState(null);
  const [bankModalOpen, setBankModalOpen] = useState(false);

  const adminParams = useMemo(() => {
    if (isAccountingUser(user)) return {};
    const cid = user?.company_id || bundle?.client_company?.id;
    return cid ? { client_company_id: cid } : {};
  }, [user, bundle?.client_company?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (!isAccountingUser(user) && user?.company_id) {
        params.client_company_id = user.company_id;
      }
      const { data } = await api.get(`/accounting/deals/${leadId}`, { params });
      setBundle(data);
      const lead = data.lead || {};
      setDepositForm({
        deposit_amount: lead.deposit_amount != null ? String(lead.deposit_amount) : '',
        deposit_received: lead.deposit_received === true ? 'true' : lead.deposit_received === false ? 'false' : '',
        deposit_label: lead.deposit_label || '',
      });
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Lỗi tải deal');
    } finally {
      setLoading(false);
    }
  }, [leadId, user]);

  useEffect(() => { load(); }, [load]);

  const lead = bundle?.lead;
  const project = bundle?.project;
  const valueSync = bundle?.value_sync || null;
  const stages = bundle?.payment_stages || [];
  const payments = bundle?.payments || [];
  const bankAccounts = bundle?.bank_accounts || [];
  const documents = bundle?.documents || [];
  const quotations = bundle?.quotations || [];
  const orders = bundle?.orders || [];
  const invoices = bundle?.invoices || [];

  const docBlockData = { quotation: quotations, order: orders, invoice: invoices };

  const filteredDocs = useMemo(() => {
    if (docFilter === 'all') return documents;
    if (docFilter === 'crm') return documents.filter((d) => d.source === 'crm' || d.source === 'crm_task');
    if (docFilter === 'sx') return documents.filter((d) => d.source === 'sx' || d.source === 'sx_task' || d.source === 'sx_shared');
    return documents;
  }, [documents, docFilter]);

  const totals = useMemo(() => {
    const dealValue = Number(project?.production_value || project?.estimated_value || lead?.estimated_value || 0);
    const totalReceived = stages.reduce((s, st) => s + (Number(st.received_amount) || 0), 0);
    const totalPlanned = stages.reduce((s, st) => s + (Number(st.planned_amount) || 0), 0);
    const invoicedTotal = invoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const base = dealValue > 0 ? dealValue : totalPlanned;
    const outstanding = Math.max(base - totalReceived, 0);
    const progress = base > 0 ? Math.min(100, Math.round((totalReceived / base) * 100)) : 0;
    return { dealValue: base, totalReceived, outstanding, invoicedTotal, progress };
  }, [project, lead, stages, invoices]);

  const saveDeposit = async () => {
    setDepositSaving(true);
    try {
      const body = {
        deposit_amount: depositForm.deposit_amount === '' ? null : Number(depositForm.deposit_amount),
        deposit_label: depositForm.deposit_label || null,
        deposit_received: depositForm.deposit_received === 'true' ? true
          : depositForm.deposit_received === 'false' ? false : null,
      };
      await api.put(`/accounting/deals/${leadId}/deposit`, body, { params: adminParams });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setDepositSaving(false);
    }
  };

  const resetStageForm = () => {
    setStageForm({ label: '', planned_amount: '', payment_method: 'cash', bank_account_id: '', notes: '' });
    setEditingStageId(null);
  };

  const saveStage = async () => {
    if (!stageForm.label.trim()) return alert('Nhập tên giai đoạn');
    setStageSaving(true);
    try {
      const body = {
        label: stageForm.label.trim(),
        planned_amount: stageForm.planned_amount === '' ? null : Number(stageForm.planned_amount),
        payment_method: stageForm.payment_method || null,
        bank_account_id: stageForm.payment_method === 'transfer' ? (stageForm.bank_account_id || null) : null,
        notes: stageForm.notes || null,
      };
      if (editingStageId) {
        await api.put(`/accounting/deals/${leadId}/payment-stages/${editingStageId}`, body, { params: adminParams });
      } else {
        await api.post(`/accounting/deals/${leadId}/payment-stages`, body, { params: adminParams });
      }
      resetStageForm();
      setStageFormOpen(false);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setStageSaving(false);
    }
  };

  const startEditStage = (s) => {
    setEditingStageId(s.id);
    setStageForm({
      label: s.label || '',
      planned_amount: s.planned_amount != null ? String(s.planned_amount) : '',
      payment_method: s.payment_method || 'cash',
      bank_account_id: s.bank_account_id || '',
      notes: s.notes || '',
    });
    setStageFormOpen(true);
  };

  /** Sửa nhanh phương thức/STK ngay trên dòng giai đoạn — lưu ngay, không cần mở form. */
  const updateStageInline = async (stageId, patch) => {
    setInlineSavingStageId(stageId);
    try {
      await api.put(`/accounting/deals/${leadId}/payment-stages/${stageId}`, patch, { params: adminParams });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setInlineSavingStageId(null);
    }
  };

  const deleteStage = async (id) => {
    if (!confirm('Xóa giai đoạn này?')) return;
    try {
      await api.delete(`/accounting/deals/${leadId}/payment-stages/${id}`, { params: adminParams });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const savePayment = async () => {
    const amount = Number(payForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) return alert('Nhập số tiền hợp lệ');
    setPaySaving(true);
    try {
      await api.post(`/accounting/deals/${leadId}/payments`, {
        amount,
        payment_date: payForm.payment_date,
        payment_method: payForm.payment_method,
        bank_account_id: payForm.payment_method === 'transfer' ? (payForm.bank_account_id || null) : null,
        stage_id: payForm.stage_id || null,
        reference_number: payForm.reference_number || null,
        notes: payForm.notes || null,
        invoice_id: payForm.invoice_id || null,
      }, { params: adminParams });
      setPayForm({
        amount: '', payment_date: new Date().toISOString().slice(0, 10),
        payment_method: 'cash', bank_account_id: '', stage_id: '',
        reference_number: '', notes: '', invoice_id: '',
      });
      setPayFormOpen(false);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setPaySaving(false);
    }
  };

  const deletePayment = async (id) => {
    if (!confirm('Xóa giao dịch này?')) return;
    try {
      await api.delete(`/accounting/deals/${leadId}/payments/${id}`, { params: adminParams });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const syncDealValue = async () => {
    setSyncingValue(true);
    try {
      await api.put(`/accounting/deals/${leadId}/sync-value`, {}, { params: adminParams });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setSyncingValue(false);
    }
  };

  const onStageSelectForPay = (stageId) => {
    const s = stages.find((x) => x.id === stageId);
    setPayForm((f) => ({
      ...f,
      stage_id: stageId,
      payment_method: s?.payment_method || f.payment_method,
      bank_account_id: s?.bank_account_id || f.bank_account_id,
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải...
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="max-w-lg mx-auto mt-12 text-center space-y-3">
        <p className="text-red-600">{error || 'Không tìm thấy deal'}</p>
        <Link to="/ketoan/dashboard" className="text-indigo-600 hover:underline text-sm">← Về dashboard</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-1 pb-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 via-teal-600 to-indigo-700 text-white shadow-md">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 90% 10%, white 0%, transparent 45%)' }} />
        <div className="relative p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <Link to="/ketoan/dashboard" className="p-2 rounded-lg bg-white/10 hover:bg-white/20 shrink-0 mt-0.5 transition">
                <ArrowLeft className="h-5 w-5 text-white" />
              </Link>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-teal-100 uppercase tracking-widest">Kế toán · Chi tiết deal</p>
                <h1 className="text-xl font-bold text-white truncate mt-0.5">
                  {lead.code ? `${lead.code} · ` : ''}{lead.title || 'Deal'}
                </h1>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-teal-50">
                  {lead.customer?.full_name && (
                    <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" /> {lead.customer.full_name}</span>
                  )}
                  {lead.customer?.phone && (
                    <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {lead.customer.phone}</span>
                  )}
                  {lead.stage?.name && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 text-xs font-semibold">
                      <Tag className="h-3 w-3" /> {lead.stage.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={load} className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm flex items-center gap-1.5 cursor-pointer transition">
                <RefreshCw className="h-4 w-4" /> Tải lại
              </button>
              <Link to={`/crm/leads/${lead.id}`} className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm flex items-center gap-1.5 transition">
                <ExternalLink className="h-3.5 w-3.5" /> CRM
              </Link>
              {project?.id && (
                <Link to={`/sx/projects/${project.id}`} className="h-9 px-3 rounded-lg bg-white text-orange-700 hover:bg-orange-50 text-sm flex items-center gap-1.5 font-semibold transition">
                  <Factory className="h-3.5 w-3.5" /> SX
                </Link>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-teal-50 mb-1">
              <span className="font-semibold">Tiến độ thu tiền</span>
              <span className="font-bold">{totals.progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all"
                style={{ width: `${totals.progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Giá trị deal"
          value={formatVND(totals.dealValue)}
          icon={TrendingUp}
          tone={{ bg: 'bg-indigo-500', text: 'text-indigo-600' }}
        />
        <StatCard
          label="Đã thu"
          value={formatVND(totals.totalReceived)}
          icon={CheckCircle2}
          tone={{ bg: 'bg-emerald-500', text: 'text-emerald-600' }}
        />
        <StatCard
          label="Còn phải thu"
          value={formatVND(totals.outstanding)}
          icon={Clock3}
          tone={{ bg: 'bg-amber-500', text: 'text-amber-600' }}
        />
        <StatCard
          label="Đã xuất HĐ"
          value={formatVND(totals.invoicedTotal)}
          icon={Receipt}
          tone={{ bg: 'bg-purple-500', text: 'text-purple-600' }}
          sub={`${invoices.length} hóa đơn`}
        />
      </div>

      {/* Cảnh báo lệch giá trị CRM ↔ SX */}
      {valueSync && project?.id && !valueSync.in_sync && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-600 shrink-0 mt-0.5">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">Giá trị deal chưa khớp giữa CRM và Sản xuất</p>
              <p className="text-xs text-amber-800 mt-0.5">
                CRM: <span className="font-bold">{formatVND(valueSync.crm_value)}</span>
                {' '}·{' '}
                SX: <span className="font-bold">{formatVND(valueSync.sx_value)}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={syncDealValue}
            disabled={syncingValue}
            className="h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition shrink-0"
          >
            {syncingValue ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Đồng bộ theo CRM
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-semibold flex items-center gap-1.5 rounded-lg cursor-pointer transition-all ${
                active ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
              {t.id === 'documents' && documents.length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-teal-100 text-teal-700' : 'bg-gray-200 text-gray-600'}`}>
                  {documents.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'documents' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: `Tất cả (${documents.length})` },
              { id: 'crm', label: '🗂️ CRM' },
              { id: 'sx', label: '🏭 Sản xuất' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setDocFilter(f.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition ${
                  docFilter === f.id ? 'bg-teal-600 border-teal-600 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:border-teal-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredDocs.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 py-16 text-center">
              <FileText className="h-10 w-10 text-gray-200 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">Chưa có tài liệu nào</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredDocs.map((d) => {
                const href = publicFileUrl(d.file_url);
                const fileName = d.file_name || d.name || 'tai-lieu';
                const style = SOURCE_STYLE[d.source] || { label: d.source, tone: 'bg-gray-50 text-gray-600 border-gray-200' };
                const isImg = href && isImageFile(fileName, d.mime_type);
                const isXlsx = href && isExcelFile(fileName, d.mime_type);
                const FIcon = fileIconFor(fileName);
                return (
                  <div key={d.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md hover:border-teal-200 transition">
                    {isImg ? (
                      <a
                        {...getFileOpenAnchorProps(href)}
                        className="block w-full h-64 bg-gray-50 overflow-hidden shrink-0"
                        title="Xem ảnh cỡ đầy đủ"
                      >
                        <img src={href} alt={fileName} loading="lazy" className="w-full h-full object-cover" />
                      </a>
                    ) : null}
                    <div className="p-3.5 flex items-start gap-3 flex-1">
                      {!isImg && (
                        <div className="p-2.5 rounded-lg bg-gray-50 text-gray-500 shrink-0">
                          <FIcon className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        {d.task_name && (
                          <p className="text-[11px] font-bold text-indigo-600 truncate flex items-center gap-1" title={d.task_name}>
                            <ClipboardList className="h-3 w-3 shrink-0" /> {d.task_name}
                          </p>
                        )}
                        <p className={`text-sm font-semibold text-gray-900 truncate ${d.task_name ? 'mt-0.5' : ''}`} title={fileName}>
                          {fileName}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${style.tone}`}>
                            {style.label}
                          </span>
                          {d.created_at && <span className="text-[11px] text-gray-400">{formatDate(d.created_at)}</span>}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {href && isImg && (
                            <a
                              {...getFileOpenAnchorProps(href)}
                              className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900"
                            >
                              Xem ảnh <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {href && !isImg && (
                            <button
                              type="button"
                              onClick={() => downloadUploadFile(href, fileName)}
                              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold cursor-pointer transition"
                            >
                              <Download className="h-3 w-3" /> Tải về
                            </button>
                          )}
                          {href && isXlsx && (
                            <div className="relative inline-flex">
                              <select
                                defaultValue=""
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val) handleImportFromDoc(d, val);
                                  e.target.value = '';
                                }}
                                className="h-7 pl-2 pr-1 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 text-[11px] font-bold cursor-pointer focus:outline-none"
                                title="Import file Excel này vào báo giá / đơn hàng / hóa đơn"
                              >
                                <option value="">📥 Import vào…</option>
                                {IMPORT_TARGET_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'finance' && (
        <div className="space-y-4">
          {/* Commercial docs + import */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {DOC_BLOCKS.map((block) => {
              const Icon = block.icon;
              const list = docBlockData[block.key] || [];
              const total = list.reduce((s, x) => s + (Number(x.total) || 0), 0);
              return (
                <div key={block.key} className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3 ring-1 ${block.ring}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg bg-gray-50 ${block.accent}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">{block.title}</h3>
                        <p className="text-[11px] text-gray-400">{list.length} bản ghi</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setImportDocSource(null); setImportType(block.key); }}
                      className={`h-8 px-2.5 rounded-lg text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition ${block.btn}`}
                    >
                      <Upload className="h-3.5 w-3.5" /> Import
                    </button>
                  </div>
                  <p className={`text-lg font-extrabold tabular-nums ${block.accent}`}>{formatVND(total)}</p>
                  {list.length === 0 ? (
                    <p className="text-xs text-gray-400">Chưa có dữ liệu</p>
                  ) : (
                    <ul className="space-y-1 border-t border-gray-100 pt-2">
                      {list.slice(0, 4).map((x) => (
                        <li key={x.id} className="flex items-center justify-between gap-2 text-sm">
                          <Link to={block.view(x)} className="text-gray-700 hover:text-teal-700 hover:underline font-medium truncate">
                            {x.code || x.title || '—'}
                          </Link>
                          <span className="tabular-nums text-gray-500 shrink-0 text-xs">{formatVND(x.total || 0)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {/* Deposit */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                  <Banknote className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Thông tin cọc</h3>
                  <p className="text-lg font-extrabold text-amber-700 tabular-nums">
                    {depositForm.deposit_amount ? formatVND(depositForm.deposit_amount) : '—'}
                    {depositForm.deposit_received === 'true' && (
                      <span className="ml-2 text-[11px] font-semibold text-emerald-600 align-middle">✓ Đã nhận</span>
                    )}
                    {depositForm.deposit_received === 'false' && (
                      <span className="ml-2 text-[11px] font-semibold text-gray-400 align-middle">Chưa nhận</span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDepositOpen((v) => !v)}
                className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 flex items-center gap-1 cursor-pointer"
              >
                {depositOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {depositOpen ? 'Đóng' : 'Chỉnh sửa'}
              </button>
            </div>
            {depositOpen && (
              <div className="border-t border-gray-100 p-4 bg-gray-50/60 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <FieldLabel>Số tiền cọc</FieldLabel>
                    <input
                      type="number"
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                      value={depositForm.deposit_amount}
                      onChange={(e) => setDepositForm((f) => ({ ...f, deposit_amount: e.target.value }))}
                    />
                  </div>
                  <div>
                    <FieldLabel>Trạng thái</FieldLabel>
                    <select
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                      value={depositForm.deposit_received}
                      onChange={(e) => setDepositForm((f) => ({ ...f, deposit_received: e.target.value }))}
                    >
                      <option value="">—</option>
                      <option value="true">Đã nhận</option>
                      <option value="false">Chưa nhận</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <FieldLabel>Ghi chú cọc</FieldLabel>
                    <input
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                      value={depositForm.deposit_label}
                      onChange={(e) => setDepositForm((f) => ({ ...f, deposit_label: e.target.value }))}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={saveDeposit}
                  disabled={depositSaving}
                  className="h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
                >
                  {depositSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Lưu cọc
                </button>
              </div>
            )}
          </div>

          {/* Payment stages */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 flex items-center justify-between gap-2 flex-wrap border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Lịch thanh toán theo giai đoạn</h3>
                <p className="text-[11px] text-gray-400">Cọc, tạm ứng, thanh toán còn lại — gắn phương thức &amp; số tài khoản riêng</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBankModalOpen(true)}
                  className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Building2 className="h-3.5 w-3.5" /> Quản lý STK
                </button>
                <button
                  type="button"
                  onClick={() => { resetStageForm(); setStageFormOpen((v) => !v); }}
                  className="h-8 px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                >
                  <Plus className="h-3.5 w-3.5" /> Thêm giai đoạn
                </button>
              </div>
            </div>

            {stages.length === 0 ? (
              <p className="py-10 text-center text-gray-400 text-sm">Chưa có giai đoạn thanh toán nào</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {stages.map((s) => {
                  const pct = s.planned_amount > 0 ? Math.min(100, Math.round((Number(s.received_amount) / Number(s.planned_amount)) * 100)) : (Number(s.received_amount) > 0 ? 100 : 0);
                  return (
                    <div key={s.id} className="p-4 hover:bg-gray-50/60 transition">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900">{s.label}</p>
                            <StatusPill status={s.status} />
                            <select
                              value={s.payment_method || 'cash'}
                              disabled={inlineSavingStageId === s.id}
                              onChange={(e) => {
                                const method = e.target.value;
                                updateStageInline(s.id, {
                                  payment_method: method,
                                  bank_account_id: method === 'transfer' ? (s.bank_account_id || '') : null,
                                });
                              }}
                              title="Sửa phương thức thanh toán — lưu ngay"
                              className={`h-6 pl-1.5 pr-1 rounded-full text-[11px] font-semibold border cursor-pointer focus:outline-none disabled:opacity-50 ${METHOD_TONE[s.payment_method] || METHOD_TONE.cash}`}
                            >
                              <option value="cash">💵 Tiền mặt</option>
                              <option value="transfer">🏦 Chuyển khoản</option>
                            </select>
                            {s.payment_method === 'transfer' && (
                              <select
                                value={s.bank_account_id || ''}
                                disabled={inlineSavingStageId === s.id}
                                onChange={(e) => updateStageInline(s.id, { bank_account_id: e.target.value || null })}
                                title="Sửa số tài khoản — lưu ngay"
                                className="h-6 pl-1.5 pr-1 rounded-full text-[11px] font-medium border border-blue-200 bg-blue-50 text-blue-700 cursor-pointer focus:outline-none disabled:opacity-50 max-w-[170px]"
                              >
                                <option value="">— Chọn STK —</option>
                                {bankAccounts.map((a) => (
                                  <option key={a.id} value={a.id}>{a.bank_name} · {a.account_number}</option>
                                ))}
                              </select>
                            )}
                            {inlineSavingStageId === s.id && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
                          </div>
                          {s.bank_account && (
                            <p className="text-[11px] text-gray-500 mt-1">
                              {s.bank_account.bank_name} · {s.bank_account.account_number}
                              {s.bank_account.account_holder ? ` (${s.bank_account.account_holder})` : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-bold text-gray-900 tabular-nums">
                              {formatVND(s.received_amount || 0)}
                              {s.planned_amount != null && (
                                <span className="text-gray-400 font-normal"> / {formatVND(s.planned_amount)}</span>
                              )}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <button type="button" onClick={() => startEditStage(s)} className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg cursor-pointer" title="Sửa">
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => deleteStage(s.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer" title="Xóa">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      {s.planned_amount > 0 && (
                        <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden max-w-md">
                          <div
                            className={`h-full rounded-full ${s.status === 'paid' ? 'bg-emerald-500' : 'bg-amber-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {stageFormOpen && (
              <div className="border-t border-gray-100 p-4 bg-gray-50/60 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                    {editingStageId ? 'Sửa giai đoạn' : 'Thêm giai đoạn mới'}
                  </p>
                  <button type="button" onClick={() => { resetStageForm(); setStageFormOpen(false); }} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="md:col-span-2">
                    <FieldLabel>Tên giai đoạn</FieldLabel>
                    <input
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                      placeholder="VD: Cọc lần 1"
                      value={stageForm.label}
                      onChange={(e) => setStageForm((f) => ({ ...f, label: e.target.value }))}
                    />
                  </div>
                  <div>
                    <FieldLabel>Số tiền kế hoạch</FieldLabel>
                    <input
                      type="number"
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                      placeholder="0"
                      value={stageForm.planned_amount}
                      onChange={(e) => setStageForm((f) => ({ ...f, planned_amount: e.target.value }))}
                    />
                  </div>
                  <div>
                    <FieldLabel>Phương thức</FieldLabel>
                    <select
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                      value={stageForm.payment_method}
                      onChange={(e) => setStageForm((f) => ({ ...f, payment_method: e.target.value }))}
                    >
                      <option value="cash">Tiền mặt</option>
                      <option value="transfer">Chuyển khoản</option>
                    </select>
                  </div>
                  <div className="md:col-span-4">
                    <FieldLabel>Tài khoản ngân hàng</FieldLabel>
                    <select
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-400"
                      disabled={stageForm.payment_method !== 'transfer'}
                      value={stageForm.bank_account_id}
                      onChange={(e) => setStageForm((f) => ({ ...f, bank_account_id: e.target.value }))}
                    >
                      <option value="">— Chọn STK —</option>
                      {bankAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.bank_name} · {a.account_number}{a.is_default ? ' (mặc định)' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveStage}
                    disabled={stageSaving}
                    className="h-9 px-4 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
                  >
                    {stageSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingStageId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {editingStageId ? 'Lưu thay đổi' : 'Thêm giai đoạn'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { resetStageForm(); setStageFormOpen(false); }}
                    className="h-9 px-3 rounded-lg border border-gray-200 text-sm cursor-pointer hover:bg-white"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Payment history */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 flex items-center justify-between gap-2 flex-wrap border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Lịch sử thanh toán</h3>
                <p className="text-[11px] text-gray-400">Toàn bộ giao dịch thực thu đã ghi nhận trên deal</p>
              </div>
              <button
                type="button"
                onClick={() => setPayFormOpen((v) => !v)}
                className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition"
              >
                <Plus className="h-3.5 w-3.5" /> Ghi nhận thu tiền
              </button>
            </div>

            {payFormOpen && (
              <div className="border-b border-gray-100 p-4 bg-indigo-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Ghi nhận lần thu mới</p>
                  <button type="button" onClick={() => setPayFormOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <FieldLabel>Số tiền *</FieldLabel>
                    <input
                      type="number"
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                      value={payForm.amount}
                      onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                  </div>
                  <div>
                    <FieldLabel>Ngày thu</FieldLabel>
                    <input
                      type="date"
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                      value={payForm.payment_date}
                      onChange={(e) => setPayForm((f) => ({ ...f, payment_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <FieldLabel>Giai đoạn</FieldLabel>
                    <select
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                      value={payForm.stage_id}
                      onChange={(e) => onStageSelectForPay(e.target.value)}
                    >
                      <option value="">— Không gắn —</option>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Phương thức</FieldLabel>
                    <select
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                      value={payForm.payment_method}
                      onChange={(e) => setPayForm((f) => ({ ...f, payment_method: e.target.value }))}
                    >
                      <option value="cash">Tiền mặt</option>
                      <option value="transfer">Chuyển khoản</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Tài khoản ngân hàng</FieldLabel>
                    <select
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-400"
                      disabled={payForm.payment_method !== 'transfer'}
                      value={payForm.bank_account_id}
                      onChange={(e) => setPayForm((f) => ({ ...f, bank_account_id: e.target.value }))}
                    >
                      <option value="">— Chọn STK —</option>
                      {bankAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.bank_name} · {a.account_number}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Mã GD / tham chiếu</FieldLabel>
                    <input
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                      value={payForm.reference_number}
                      onChange={(e) => setPayForm((f) => ({ ...f, reference_number: e.target.value }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <FieldLabel>Gắn hóa đơn (tuỳ chọn)</FieldLabel>
                    <select
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                      value={payForm.invoice_id}
                      onChange={(e) => setPayForm((f) => ({ ...f, invoice_id: e.target.value }))}
                    >
                      <option value="">— Không gắn —</option>
                      {invoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>{inv.code} · {formatVND(inv.total || 0)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Ghi chú</FieldLabel>
                    <input
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                      value={payForm.notes}
                      onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={savePayment}
                  disabled={paySaving}
                  className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
                >
                  {paySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Ghi nhận
                </button>
              </div>
            )}

            {payments.length === 0 ? (
              <p className="py-10 text-center text-gray-400 text-sm">Chưa có giao dịch nào</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {payments.map((p) => {
                  const MIcon = METHOD_ICON[p.payment_method] || Wallet;
                  return (
                    <div key={p.id} className="p-4 flex items-center gap-3 hover:bg-gray-50/60 transition">
                      <div className={`p-2 rounded-lg shrink-0 ${p.payment_method === 'transfer' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        <MIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-900 tabular-nums">{formatVND(p.amount)}</p>
                          {p.stage?.label && (
                            <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">{p.stage.label}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {formatDate(p.payment_date)}
                          {p.bank_account ? ` · ${p.bank_account.bank_name} · ${p.bank_account.account_number}` : ''}
                          {p.reference_number ? ` · GD: ${p.reference_number}` : ''}
                        </p>
                      </div>
                      <button type="button" onClick={() => deletePayment(p.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer shrink-0" title="Xóa">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {importType && (
        <ExcelQuotationImport
          docType={importType}
          leadId={leadId}
          dealId={leadId}
          initialFileUrl={importDocSource?.file_url}
          initialFileName={importDocSource?.file_name}
          initialSourceFile={importDocSource ? { file_url: importDocSource.file_url, file_name: importDocSource.file_name } : null}
          onClose={closeImportModal}
          onImportDone={() => {
            closeImportModal();
            load();
          }}
        />
      )}

      {bankModalOpen && (
        <BankAccountsManagerModal
          onClose={() => setBankModalOpen(false)}
          onChanged={load}
        />
      )}
    </div>
  );
}
