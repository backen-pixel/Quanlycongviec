import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, FileText, ShoppingCart, Receipt, Upload, RefreshCw, ExternalLink,
  Factory, DollarSign, Plus, Trash2, Loader2, Save, Banknote, Building2,
  Landmark, Wallet, CheckCircle2, Clock3, AlertCircle, ChevronDown, ChevronUp,
  User, Phone, Tag, TrendingUp, X, FileSpreadsheet, FileImage, File as FileIcon,
  Download, ClipboardList, ArrowRightLeft, Eye, Truck,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatVND, formatDate } from '../lib/utils';
import { publicFileUrl, getFileOpenAnchorProps, downloadUploadFile } from '../lib/publicFileUrl';
import { isAccountingUser } from '../lib/crossWorkshopProduction';
import ExcelQuotationImport from '../components/ExcelQuotationImport';
import AccountingChecklist, { ChecklistMeter } from '../components/accounting/AccountingChecklist';
import InvoiceFromOrderModal from '../components/accounting/InvoiceFromOrderModal';
import PhatSinhPanel from '../components/accounting/PhatSinhPanel';
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

const QUOTE_STATUS_VI = {
  draft: 'Nháp', sent: 'Đã gửi', accepted: 'Chấp nhận', rejected: 'Từ chối',
  expired: 'Hết hạn', converted: 'Đã chuyển ĐH',
};
const ORDER_STATUS_VI = {
  draft: 'Nháp', confirmed: 'Xác nhận', processing: 'Đang SX',
  shipped: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy',
};
const INVOICE_PAYMENT_VI = {
  unpaid: 'Chưa TT', partial: 'TT một phần', paid: 'Đã TT đủ', overdue: 'Quá hạn',
};

const DOC_STATUS_OPTIONS = {
  quotation: Object.entries(QUOTE_STATUS_VI),
  order: Object.entries(ORDER_STATUS_VI),
  invoice: Object.entries(INVOICE_PAYMENT_VI),
};

function docStatusApiPath(blockKey, id) {
  if (blockKey === 'order') return `/crm/orders/${id}`;
  if (blockKey === 'invoice') return `/crm/invoices/${id}`;
  return `/crm/quotations/${id}`;
}

function docStatusPayload(blockKey, value) {
  if (blockKey === 'invoice') return { payment_status: value };
  return { status: value };
}

function docStatusValue(blockKey, doc) {
  if (blockKey === 'invoice') return doc.payment_status || 'unpaid';
  return doc.status || 'draft';
}

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
  const navigate = useNavigate();
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

  const [inlineSavingStageId, setInlineSavingStageId] = useState(null);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [convertQuoteId, setConvertQuoteId] = useState(null);
  const [docStatusSavingId, setDocStatusSavingId] = useState(null);

  const [costSummary, setCostSummary] = useState(null);
  const [costRefresh, setCostRefresh] = useState(0);
  const [checklist, setChecklist] = useState(null);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [checklistBusy, setChecklistBusy] = useState(false);
  const [vc, setVc] = useState(null);
  const [vcCostDraft, setVcCostDraft] = useState('');
  const [vcCostSaving, setVcCostSaving] = useState(false);

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
      const [{ data }, checklistRes] = await Promise.all([
        api.get(`/accounting/deals/${leadId}`, { params }),
        api.get(`/accounting/deals/${leadId}/checklist`, { params }).catch(() => null),
      ]);
      setBundle(data);
      setChecklist(checklistRes?.data?.checklist || null);
      const vcInfo = checklistRes?.data?.vc || null;
      setVc(vcInfo);
      setVcCostDraft(vcInfo?.logistics_cost != null ? String(vcInfo.logistics_cost) : '');
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

  const refreshChecklist = useCallback(async () => {
    try {
      const { data } = await api.get(`/accounting/deals/${leadId}/checklist`, { params: adminParams });
      setChecklist(data?.checklist || null);
    } catch {
      /* giữ checklist cũ */
    }
  }, [leadId, adminParams]);

  useEffect(() => { load(); }, [load]);

  const lead = bundle?.lead;
  const project = bundle?.project;
  const workshopLabel = project?.company?.short_name || project?.company?.name || '';
  const namesDiffer = (() => {
    const a = String(lead?.title || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const b = String(project?.name || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return Boolean(a && b && a !== b);
  })();
  const vcActive = Boolean(vc?.phase) && vc.phase !== 'none';
  const stages = bundle?.payment_stages || [];
  const payments = bundle?.payments || [];
  const bankAccounts = bundle?.bank_accounts || [];
  const documents = bundle?.documents || [];
  const quotations = bundle?.quotations || [];
  const orders = bundle?.orders || [];
  const invoices = bundle?.invoices || [];

  useEffect(() => {
    if (!project?.id) { setCostSummary(null); return; }
    let cancelled = false;
    api.get(`/cost-hub/projects/${project.id}/summary`, { params: adminParams })
      .then(({ data }) => { if (!cancelled) setCostSummary(data); })
      .catch(() => { if (!cancelled) setCostSummary(null); });
    return () => { cancelled = true; };
  }, [project?.id, adminParams, costRefresh]);

  const docBlockData = { quotation: quotations, order: orders, invoice: invoices };

  const markDepositReceived = async () => {
    if (!confirm('Đánh dấu cọc đã nhận? Báo giá và đơn hàng của deal sẽ cập nhật theo.')) return;
    setChecklistBusy(true);
    try {
      await api.put(`/accounting/deals/${leadId}/deposit`, { deposit_received: true }, { params: adminParams });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không cập nhật được cọc');
    } finally {
      setChecklistBusy(false);
    }
  };

  const saveLogisticsCost = async (value) => {
    setVcCostSaving(true);
    try {
      await api.put(`/accounting/deals/${leadId}/logistics-cost`, { logistics_cost: value }, { params: adminParams });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không lưu được phí VC/LĐ');
    } finally {
      setVcCostSaving(false);
    }
  };

  const checklistAction = (item) => {
    const btn = 'shrink-0 h-7 px-2.5 rounded-md text-[11px] font-bold cursor-pointer transition disabled:opacity-50';
    switch (item.key) {
      case 'quotation':
        return <Link to={`/crm/quotations/new?lead_id=${encodeURIComponent(leadId)}`} className={`${btn} inline-flex items-center bg-blue-50 text-blue-700 hover:bg-blue-100`}>Tạo báo giá</Link>;
      case 'quotation_file':
        return <button type="button" onClick={() => { setImportDocSource(null); setImportType('quotation'); }} className={`${btn} bg-blue-50 text-blue-700 hover:bg-blue-100`}>Nhập Excel</button>;
      case 'order':
        return <Link to="/crm/orders" className={`${btn} inline-flex items-center bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>Tạo đơn hàng</Link>;
      case 'vc_cost':
        return (
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('vc-cost-input');
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el?.focus();
            }}
            className={`${btn} bg-sky-50 text-sky-700 hover:bg-sky-100`}
          >
            Nhập phí
          </button>
        );
      case 'phat_sinh_cost':
        return (
          <button
            type="button"
            onClick={() => {
              setTab('finance');
              setTimeout(() => document.getElementById('phat-sinh')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
            }}
            className={`${btn} bg-rose-50 text-rose-700 hover:bg-rose-100`}
          >
            Ghi phí
          </button>
        );
      case 'deposit':
        return <button type="button" disabled={checklistBusy} onClick={markDepositReceived} className={`${btn} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>Đánh dấu đã nhận</button>;
      case 'payment_proof':
        return (
          <button
            type="button"
            onClick={() => {
              setTab('finance');
              setTimeout(() => document.getElementById('lich-su-thanh-toan')?.scrollIntoView({ behavior: 'smooth' }), 50);
            }}
            className={`${btn} bg-gray-100 text-gray-700 hover:bg-gray-200`}
          >
            Xem khoản thu
          </button>
        );
      case 'invoice':
        return <button type="button" onClick={() => setInvoiceModalOpen(true)} className={`${btn} bg-purple-600 text-white hover:bg-purple-700`}>Xuất hóa đơn</button>;
      case 'collected':
        return <button type="button" onClick={() => { setTab('finance'); setPayFormOpen(true); }} className={`${btn} bg-amber-50 text-amber-800 hover:bg-amber-100`}>Ghi nhận thu</button>;
      default:
        return null;
    }
  };

  const updateDocStatus = async (blockKey, doc, value) => {
    if (!doc?.id || docStatusSavingId) return;
    setDocStatusSavingId(doc.id);
    try {
      await api.put(docStatusApiPath(blockKey, doc.id), docStatusPayload(blockKey, value));
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không đổi được trạng thái');
    } finally {
      setDocStatusSavingId(null);
    }
  };

  const convertQuoteToOrder = async (quote) => {
    if (!quote?.id || convertQuoteId) return;
    if (!confirm(`Chuyển báo giá ${quote.code || ''} sang đơn hàng?`)) return;
    setConvertQuoteId(quote.id);
    try {
      const { data } = await api.post(`/crm/quotations/${quote.id}/convert-to-order`);
      await load();
      if (data?.id) {
        if (confirm(`Đã tạo đơn hàng ${data.code || ''}. Mở chi tiết đơn hàng?`)) {
          navigate(`/crm/orders/${data.id}`);
        }
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi chuyển sang đơn hàng');
    } finally {
      setConvertQuoteId(null);
    }
  };

  const filteredDocs = useMemo(() => {
    if (docFilter === 'all') return documents;
    if (docFilter === 'crm') return documents.filter((d) => d.source === 'crm' || d.source === 'crm_task');
    if (docFilter === 'sx') return documents.filter((d) => d.source === 'sx' || d.source === 'sx_task' || d.source === 'sx_shared');
    return documents;
  }, [documents, docFilter]);

  const totals = useMemo(() => {
    // Deal CRM (doanh thu) ≠ Chi phí xưởng (production_value). Hai số độc lập.
    const dealValueCrm = Number(lead?.estimated_value) || 0;
    const workshopCost = Number(project?.production_value) || 0;
    const totalReceived = stages.reduce((s, st) => s + (Number(st.received_amount) || 0), 0);
    const totalPlanned = stages.reduce((s, st) => s + (Number(st.planned_amount) || 0), 0);
    const invoicedTotal = invoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const base = dealValueCrm > 0 ? dealValueCrm : totalPlanned;
    /** Tiền cọc snapshot (SX/deal) — tránh trừ trùng nếu đã có ở đợt thanh toán «Cọc». */
    const depositSnapshot = Number(project?.deposit_amount || lead?.deposit_amount) || 0;
    const depositFromStages = stages
      .filter((st) => /cọc/i.test(String(st.label || '')))
      .reduce((s, st) => s + (Number(st.received_amount) || 0), 0);
    const depositCredit = Math.max(depositSnapshot, depositFromStages);
    const nonDepositReceived = Math.max(0, totalReceived - depositFromStages);
    const effectiveReceived = depositCredit + nonDepositReceived;
    const outstanding = Math.max(base - effectiveReceived, 0);
    const progress = base > 0 ? Math.min(100, Math.round((effectiveReceived / base) * 100)) : 0;
    const workshopDebt = Math.max(workshopCost - depositSnapshot, 0);
    return {
      dealValueCrm: base,
      workshopCost,
      workshopDebt,
      totalReceived: effectiveReceived,
      outstanding,
      invoicedTotal,
      progress,
    };
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-3.5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">Dự án CRM</p>
          <p className="text-sm font-bold text-gray-900 mt-1">{lead.title || '—'}</p>
          <p className="text-xs text-gray-500 mt-0.5">{lead.code || 'Chưa có mã deal'}</p>
        </div>
        <div className={`rounded-xl border px-3.5 py-3 ${namesDiffer ? 'border-amber-300 bg-amber-50' : 'border-orange-200 bg-orange-50/50'}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-orange-700">Dự án xưởng</p>
            {namesDiffer && (
              <span className="text-[10px] font-bold uppercase text-amber-800">Tên khác CRM</span>
            )}
          </div>
          <p className={`text-sm font-bold mt-1 ${namesDiffer ? 'text-amber-950' : 'text-gray-900'}`}>{project?.name || 'Chưa gắn dự án xưởng'}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {[project?.code, workshopLabel].filter(Boolean).join(' · ') || 'Chưa có mã dự án'}
          </p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700">Vận chuyển / Lắp đặt</p>
            {project?.id && vcActive && (
              <Link to={`/vc/projects/${project.id}`} className="text-[11px] font-semibold text-sky-700 hover:underline inline-flex items-center gap-1">
                <Truck className="h-3 w-3" /> Mở VC
              </Link>
            )}
          </div>
          <p className={`text-sm font-bold mt-1 ${vcActive ? 'text-gray-900' : 'text-gray-400'}`}>
            {vcActive ? (vc.stage_name || vc.phase_label) : 'Chưa bàn giao VC/LĐ'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {[
              vc?.company_name,
              vc?.delivery_date ? `Giao ${formatDate(String(vc.delivery_date).slice(0, 10))}` : null,
              vc?.install_date ? `Lắp ${formatDate(String(vc.install_date).slice(0, 10))}` : null,
            ].filter(Boolean).join(' · ') || (vcActive ? 'Chưa có ngày giao / lắp' : 'Xưởng chưa chuyển sang VC/LĐ')}
          </p>
          <label htmlFor="vc-cost-input" className="block text-[11px] font-semibold text-gray-600 mt-2">Phí VC/LĐ (đ)</label>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <input
              id="vc-cost-input"
              type="number"
              min="0"
              inputMode="numeric"
              value={vcCostDraft}
              onChange={(e) => setVcCostDraft(e.target.value)}
              placeholder="Chưa nhập"
              className="min-w-[8rem] flex-1 h-7 px-2 rounded-md border border-sky-200 bg-white text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
            <button
              type="button"
              disabled={vcCostSaving || vcCostDraft === (vc?.logistics_cost != null ? String(vc.logistics_cost) : '')}
              onClick={() => saveLogisticsCost(vcCostDraft === '' ? null : Number(vcCostDraft))}
              className="h-7 px-2.5 rounded-md bg-sky-600 text-white text-[11px] font-bold hover:bg-sky-700 cursor-pointer disabled:opacity-40"
            >
              Lưu
            </button>
            {vc?.logistics_cost == null && (
              <button
                type="button"
                disabled={vcCostSaving}
                onClick={() => saveLogisticsCost(0)}
                title="Khách tự chở hoặc giá đã gồm VC/LĐ"
                className="h-7 px-2 rounded-md border border-sky-200 bg-white text-sky-700 text-[11px] font-semibold hover:bg-sky-50 cursor-pointer disabled:opacity-40"
              >
                Không phí
              </button>
            )}
          </div>
        </div>
      </div>

      {checklist && (
        <div className={`rounded-xl border bg-white shadow-sm p-4 ${checklist.missing_count ? 'border-red-200' : 'border-emerald-200'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Hồ sơ kế toán</h3>
              <p className="text-[11px] text-gray-500">Các mục kế toán cần có cho deal này. Mục xám là chưa tới lúc làm.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-40"><ChecklistMeter checklist={checklist} /></div>
              <button
                type="button"
                onClick={() => setInvoiceModalOpen(true)}
                className="h-8 px-3 rounded-lg bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 cursor-pointer inline-flex items-center gap-1"
              >
                <Receipt className="h-3.5 w-3.5" /> Xuất hóa đơn
              </button>
            </div>
          </div>
          <AccountingChecklist checklist={checklist} renderAction={checklistAction} />
        </div>
      )}

      {/* Stat cards — deal CRM (doanh thu) · chi phí xưởng — hai số độc lập */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Giá trị deal CRM"
          value={formatVND(totals.dealValueCrm)}
          icon={TrendingUp}
          tone={{ bg: 'bg-indigo-500', text: 'text-indigo-600' }}
          sub="Doanh thu / báo giá"
        />
        <StatCard
          label="Chi phí xưởng"
          value={formatVND(totals.workshopCost)}
          icon={Factory}
          tone={{ bg: 'bg-orange-500', text: 'text-orange-600' }}
          sub={totals.workshopCost > 0 ? `Công nợ xưởng: ${formatVND(totals.workshopDebt)}` : 'Nhập trên dự án SX'}
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
          sub="Theo giá trị deal CRM"
        />
        <StatCard
          label="Đã xuất HĐ"
          value={formatVND(totals.invoicedTotal)}
          icon={Receipt}
          tone={{ bg: 'bg-purple-500', text: 'text-purple-600' }}
          sub={`${invoices.length} hóa đơn`}
        />
      </div>

      {costSummary && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-sm font-bold text-teal-900">Chi phí theo nguồn</p>
            <Link to="/ketoan/chi-phi" className="text-xs font-semibold text-teal-700 hover:underline">Mở sổ chi phí</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <p className="text-[11px] uppercase text-gray-500 font-semibold">Giá vốn</p>
              <p className="text-lg font-extrabold tabular-nums">{formatVND(costSummary.gia_von || 0)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-gray-500 font-semibold">Lợi nhuận gộp</p>
              <p className={`text-lg font-extrabold tabular-nums ${(costSummary.loi_nhuan_gop || 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatVND(costSummary.loi_nhuan_gop || 0)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-gray-500 font-semibold">Xưởng</p>
              <p className="text-lg font-extrabold tabular-nums">{formatVND(costSummary.by_source?.['sx.production_value'] || 0)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-gray-500 font-semibold">Phát sinh</p>
              <p className="text-lg font-extrabold tabular-nums text-rose-700">{formatVND(costSummary.by_source?.['sx.project_expense'] || 0)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-gray-500 font-semibold">Mua hàng + VC + COGS</p>
              <p className="text-lg font-extrabold tabular-nums">{formatVND(
                (costSummary.by_source?.['purchasing.po'] || 0)
                + (costSummary.by_source?.['vc.shipping'] || 0)
                + (costSummary.by_source?.['crm.product_cogs'] || 0)
              )}</p>
            </div>
          </div>
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
                        <p className="text-[10px] text-gray-500 mt-0.5 truncate" title={`${lead.title || ''} / ${project?.name || ''}`}>
                          CRM {lead.code || '—'}
                          {' · '}
                          Xưởng {project?.code || '—'}
                          {namesDiffer ? ' · tên khác' : ''}
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
                    <ul className="space-y-2 border-t border-gray-100 pt-2">
                      {list.slice(0, 6).map((x) => {
                        const canConvert = block.key === 'quotation' && x.status !== 'converted';
                        const converting = convertQuoteId === x.id;
                        return (
                          <li key={x.id} className="rounded-lg border border-gray-100 bg-gray-50/60 px-2.5 py-2 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{x.code || x.title || '—'}</p>
                                <p className="text-[11px] text-gray-500 tabular-nums">{formatVND(x.total || 0)}</p>
                                {block.key === 'invoice' && (
                                  <p className="text-[11px] text-purple-700">
                                    {x.invoice_number ? `Số HĐ ${x.invoice_number}` : 'Chưa có số hóa đơn'}
                                    {x.invoice_date ? ` · ${formatDate(x.invoice_date)}` : ''}
                                  </p>
                                )}
                                {block.key === 'quotation' && x.source_excel_file_name && (
                                  <p className="text-[11px] text-blue-800 truncate" title={x.source_excel_file_name}>
                                    {x.source_excel_file_url && getFileOpenAnchorProps(x.source_excel_file_url) ? (
                                      <a {...getFileOpenAnchorProps(x.source_excel_file_url, { fileName: x.source_excel_file_name })} className="hover:underline">
                                        {x.source_excel_file_name}
                                      </a>
                                    ) : x.source_excel_file_name}
                                  </p>
                                )}
                              </div>
                              <div className="shrink-0 flex flex-col items-end gap-0.5">
                                {(DOC_STATUS_OPTIONS[block.key] || []).length > 0 && (
                                  <select
                                    value={docStatusValue(block.key, x)}
                                    disabled={docStatusSavingId === x.id}
                                    onChange={(e) => updateDocStatus(block.key, x, e.target.value)}
                                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-700 cursor-pointer disabled:opacity-50 max-w-[140px]"
                                    title="Đổi trạng thái"
                                  >
                                    {DOC_STATUS_OPTIONS[block.key].map(([k, v]) => (
                                      <option key={k} value={k}>{v}</option>
                                    ))}
                                  </select>
                                )}
                                {(block.key === 'quotation' || block.key === 'order') && x.deposit_received === true && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700">
                                    Đã nhận cọc
                                  </span>
                                )}
                                {(block.key === 'quotation' || block.key === 'order') && x.deposit_received === false && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700">
                                    Chưa nhận cọc
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Link
                                to={block.view(x)}
                                className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-teal-200 bg-teal-50 text-teal-700 text-[11px] font-bold hover:bg-teal-100 transition"
                                title={`Xem chi tiết ${block.title.toLowerCase()}`}
                              >
                                <Eye className="h-3 w-3" /> Chi tiết
                              </Link>
                              {canConvert && (
                                <button
                                  type="button"
                                  disabled={!!convertQuoteId}
                                  onClick={() => convertQuoteToOrder(x)}
                                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 disabled:opacity-50 cursor-pointer transition"
                                  title="Chuyển báo giá sang đơn hàng"
                                >
                                  {converting
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <ArrowRightLeft className="h-3 w-3" />}
                                  → ĐH
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
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
                                  <option key={a.id} value={a.id}>{a.bank_name} · {a.account_number}{a.region?.name ? ` (${a.region.name})` : ''}</option>
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
                        <option key={a.id} value={a.id}>{a.bank_name} · {a.account_number}{a.region?.name ? ` (${a.region.name})` : ''}{a.is_default ? ' ★' : ''}</option>
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
          <div id="lich-su-thanh-toan" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden scroll-mt-4">
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
                        <option key={a.id} value={a.id}>{a.bank_name} · {a.account_number}{a.region?.name ? ` (${a.region.name})` : ''}</option>
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

          <PhatSinhPanel
            leadId={leadId}
            params={adminParams}
            onChanged={() => { setCostRefresh((n) => n + 1); refreshChecklist(); }}
          />
        </div>
      )}

      {invoiceModalOpen && (
        <InvoiceFromOrderModal
          leadId={leadId}
          orders={orders}
          invoices={invoices}
          customerName={lead?.customer?.full_name || ''}
          params={adminParams}
          onClose={() => setInvoiceModalOpen(false)}
          onCreated={() => { setInvoiceModalOpen(false); load(); }}
        />
      )}

      {importType && (
        <ExcelQuotationImport
          docType={importType}
          leadId={leadId}
          dealId={leadId}
          returnTo={`/ketoan/deals/${leadId}`}
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
          initialRegionId={lead?.region_id || null}
          initialRegionName={lead?.region?.name || null}
        />
      )}
    </div>
  );
}
