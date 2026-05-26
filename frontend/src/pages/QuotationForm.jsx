import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import api from '../lib/api';
import { Plus, Trash2, Save, ArrowLeft, ShoppingCart, Printer, Download, Search, X, AlignLeft, Loader2, Check, History } from 'lucide-react';
import SaveToast from '../components/SaveToast';
import CustomerSearchPicker from '../components/CustomerSearchPicker';
import LeadDealPicker from '../components/LeadDealPicker';
import { QUOTATION_EXCEL_DRAFT_KEY } from '../components/ExcelQuotationImport';
import QuotationSourceExcelLink from '../components/QuotationSourceExcelLink';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/utils';
import { getDepositRemainingDisplay } from '../lib/quotationTermsDisplay';
import ProductSearchPicker from '../components/ProductSearchPicker';
import ProductAutocompleteCell from '../components/ProductAutocompleteCell';
import { computeQuotationDocumentDiscounts } from '../lib/quotationTotals';

// Override formatVND: 0 → "0đ" thay vì "—"
const formatVND = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  if (n === 0) return '0đ';
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ';
};

// Helper: cho phép nhập dấu "," thay "." cho số thập phân
const parseNumber = (val) => {
  if (val === '' || val === null || val === undefined) return 0;
  // Thay dấu phẩy → dấu chấm
  const cleaned = String(val).replace(/,/g, '.');
  return parseFloat(cleaned) || 0;
};

// Format number with thousand separators (no currency symbol)
const formatNum = (n) => {
  if (n === '' || n === null || n === undefined) return '';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '';
  if (num === 0) return '0';
  return new Intl.NumberFormat('vi-VN').format(num);
};

// Component input số — hiển thị formatted khi blur, raw khi focus
function NumericInput({ value, onChange, placeholder, title, className, step, allowEmpty }) {
  const [localVal, setLocalVal] = useState('');
  const [focused, setFocused] = useState(false);

  // Giá trị hiển thị khi không focus
  const displayValue = (() => {
    if (allowEmpty && (value === '' || value === null || value === undefined)) return '';
    if (value === 0 || value === '0') return '0';
    if (!value) return '';
    return formatNum(value);
  })();

  return (
    <input
      type="text"
      inputMode="decimal"
      value={focused ? localVal : displayValue}
      placeholder={placeholder || '0'}
      title={title}
      className={className}
      onFocus={(e) => {
        setFocused(true);
        // Khi focus: hiển thị giá trị raw (số thuần) để dễ sửa
        const raw = (value === 0 || value === '0') ? '' : String(value ?? '');
        setLocalVal(raw);
        // Select all text for easy overwrite
        setTimeout(() => e.target.select(), 0);
      }}
      onChange={(e) => {
        // Cho phép nhập: số, dấu chấm, dấu phẩy, dấu trừ
        const raw = e.target.value.replace(/[^0-9.,-]/g, '');
        setLocalVal(raw);
        const num = parseNumber(raw);
        onChange(allowEmpty && raw === '' ? '' : num);
      }}
      onBlur={() => {
        setFocused(false);
        const num = parseNumber(localVal);
        onChange(allowEmpty && localVal === '' ? '' : num);
      }}
    />
  );
}

const PAYMENT_OPTIONS = [
  'Thanh toán 50% khi ký HĐ, 50% khi bàn giao',
  'Thanh toán 100% khi ký HĐ',
  'Thanh toán 30% đặt cọc, 40% giao hàng, 30% hoàn thiện',
  'Thanh toán khi bàn giao',
  'Thanh toán trong vòng 30 ngày',
  'Khác',
];

export default function QuotationForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { user } = useAuth();
  const [descPopup, setDescPopup] = useState(null); // { idx, name, description }

  const todayISO = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    title: '', customer_id: '', customer_name: '', customer_phone: '', customer_address: '',
    valid_until: todayISO, payment_terms: 'Thanh toán 50% khi ký HĐ, 50% khi bàn giao',
    delivery_terms: '', notes: '', lead_id: '',
    company_id: '', region_id: '',
    discount_type: 'percent', discount_value: 0,
    sale_discount_type: 'amount', sale_discount_value: 0,
    approved_by: '',
    deposit_amount: null,
    deposit_received: null,
    deposit_label: '',
    remaining_amount: null,
    remaining_note: '',
  });
  /** Object deal đã chọn (đầy đủ company/region/sales) — để hiển thị badge và đồng bộ scope */
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [customPaymentTerms, setCustomPaymentTerms] = useState('');
  const [isCustomPayment, setIsCustomPayment] = useState(false);
  const [items, setItems] = useState([{
    name: '', description: '', product_code: '', unit: 'bộ', quantity: 1, unit_price: 0,
    discount_percent: 0, vat_rate: 0, height: '', width: '', length: '', weight: '',
    dimensions: '', material: '', color: '', promo_code: '', is_promo: false,
    spec_factor: 0, group_name: '', standard_area: 0,
  }]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveMsg, setSaveMsg] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [excelDraftHint, setExcelDraftHint] = useState('');
  /** Xác nhận đã kiểm tra số liệu — chuyển từ modal Excel sang đây */
  const [excelReviewConfirmed, setExcelReviewConfirmed] = useState(false);
  const [excelImportMeta, setExcelImportMeta] = useState(null);
  /** File Excel gốc (sau khi đã lưu báo giá) */
  const [quoteSourceExcel, setQuoteSourceExcel] = useState(null);
  const [quotationHistory, setQuotationHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  /** Sau khi đổ dữ liệu từ Excel, không ghi đè bằng GET lead/detail (cùng effect chạy lại khi bỏ from_excel). */
  const skipLeadDetailPrefillRef = useRef(false);

  useEffect(() => {
    api.get('/customers', { params: { limit: 5000 } }).then(r => setCustomers(r.data.customers || r.data || []));
    api.get('/products', { params: { limit: 5000 } }).then(r => setProducts(r.data.products || r.data || []));
    if (isEdit) {
      api.get(`/crm/quotations/${id}`).then(r => {
        const d = r.data;
        const pt = d.payment_terms || '';
        const isPreset = PAYMENT_OPTIONS.includes(pt);
        setForm({
          title: d.title || '', customer_id: d.customer_id || '', customer_name: d.customer_name || '',
          customer_phone: d.customer_phone || '', customer_address: d.customer_address || '',
          valid_until: d.valid_until || '', payment_terms: isPreset ? pt : 'Khác', delivery_terms: d.delivery_terms || '',
          notes: d.notes || '', discount_type: d.discount_type || 'percent', discount_value: d.discount_value || 0,
          sale_discount_type: d.sale_discount_type || 'amount', sale_discount_value: d.sale_discount_value || 0,
          lead_id: d.lead_id, project_id: d.project_id, approved_by: d.approved_by || '',
          company_id: d.company_id || '', region_id: d.region_id || '',
          deposit_amount: d.deposit_amount != null && d.deposit_amount !== '' ? Number(d.deposit_amount) : null,
          deposit_received: d.deposit_received === true || d.deposit_received === false ? d.deposit_received : null,
          deposit_label: d.deposit_label || '',
          remaining_amount: d.remaining_amount != null && d.remaining_amount !== '' ? Number(d.remaining_amount) : null,
          remaining_note: d.remaining_note || '',
        });
        if (d.source_excel_file_url) {
          setQuoteSourceExcel({
            file_url: d.source_excel_file_url,
            file_name: d.source_excel_file_name || 'File Excel',
          });
        } else {
          setQuoteSourceExcel(null);
        }
        // Snapshot deal info từ payload mới (backend trả về lead, company, region embedded)
        if (d.lead) {
          setSelectedDeal({
            id: d.lead.id,
            code: d.lead.code,
            title: d.lead.title,
            type: d.lead.type,
            company_id: d.company_id,
            company_name: d.company?.short_name || d.company?.name || null,
            region_id: d.region_id,
            region_name: d.region?.name || null,
            assignee_name: d.lead.lead_assignee?.full_name || null,
          });
        }
        if (!isPreset && pt) { setIsCustomPayment(true); setCustomPaymentTerms(pt); }
        if (d.items?.length) setItems(d.items.map(i => {
          if (i.notes === '__SECTION__') return { row_type: 'section', name: i.name, notes: '__SECTION__' };
          // ── Khôi phục lock_amount khi reload: nếu stored amount lệch với recompute (qty*price*spec_factor*(1-pct))
          // → coi như đã khoá theo Excel, giữ nguyên amount.
          const qty = i.quantity || 1;
          const price = i.unit_price || 0;
          const sf = parseFloat(i.spec_factor) || 0;
          const gross = sf > 0 ? sf * qty * price : qty * price;
          const recomputed = gross - gross * (i.discount_percent || 0) / 100;
          const stored = i.amount || 0;
          const drift = Math.abs(stored - recomputed);
          const isLocked = stored > 0 && drift > 1;
          return {
            name: i.name, description: i.description || '', product_code: i.product_code || '',
            unit: i.unit || 'bộ', quantity: qty,
            unit_price: price, discount_percent: i.discount_percent || 0,
            vat_rate: i.vat_rate || 0,
            height: i.height || '', width: i.width || '', length: i.length || '', weight: i.weight || '',
            dimensions: i.dimensions || '', material: i.material || '', color: i.color || '',
            product_id: i.product_id, promo_code: i.promo_code || '', is_promo: i.is_promo || false,
            spec_factor: i.spec_factor || 0, group_name: i.group_name || '',
            standard_area: i.standard_area || 0,
            lock_amount: isLocked,
            imported_amount: isLocked ? stored : undefined,
          };
        }));
      });
    } else {
      const fromExcel = searchParams.get('from_excel') === '1';
      if (fromExcel) {
        try {
          // Ưu tiên history state (in-memory, không đụng quota Storage), fallback sessionStorage cho F5.
          let parsed = location.state?.excelDraft || null;
          if (!parsed) {
            const raw = sessionStorage.getItem(QUOTATION_EXCEL_DRAFT_KEY);
            if (raw) parsed = JSON.parse(raw);
          }
          try { sessionStorage.removeItem(QUOTATION_EXCEL_DRAFT_KEY); } catch (_) { /* ignore */ }
          if (parsed) {
            const dform = parsed.form || {};
            const urlLead = searchParams.get('lead_id') || '';
            const pt = dform.payment_terms || '';
            const presetPt = pt && PAYMENT_OPTIONS.includes(pt);
            if (presetPt) {
              setIsCustomPayment(false);
              setCustomPaymentTerms('');
            } else if (pt) {
              setIsCustomPayment(true);
              setCustomPaymentTerms(pt);
            }
            setForm((f) => ({
              ...f,
              ...dform,
              lead_id: dform.lead_id || urlLead || '',
              discount_type: dform.discount_type || 'amount',
              discount_value: dform.discount_value ?? 0,
              sale_discount_type: dform.sale_discount_type || 'amount',
              sale_discount_value: dform.sale_discount_value ?? 0,
              payment_terms: presetPt ? pt : (pt ? 'Khác' : f.payment_terms),
              approved_by: dform.approved_by || f.approved_by || '',
            }));
            if (parsed.items?.length) {
              setItems(
                parsed.items.map((i) => ({
                  name: i.name || '',
                  description: i.description || '',
                  product_code: '',
                  unit: i.unit || 'bộ',
                  quantity: i.quantity ?? 1,
                  unit_price: i.unit_price ?? 0,
                  discount_percent: i.discount_percent ?? 0,
                  vat_rate: i.vat_rate ?? 0,
                  height: i.height ?? '',
                  width: i.width ?? '',
                  length: i.length ?? '',
                  dimensions: i.dimensions || '',
                  material: '',
                  color: '',
                  promo_code: '',
                  is_promo: false,
                  spec_factor: i.spec_factor ?? 0,
                  group_name: i.group_name || '',
                  standard_area: 0,
                  notes: i.notes || '',
                  is_freebie: !!i.is_freebie,
                  lock_amount: !!i.lock_amount,
                  imported_amount: typeof i.imported_amount === 'number' ? i.imported_amount : undefined,
                })),
              );
            }
            setExcelDraftHint(parsed.meta?.fileName ? `Đã nhập từ Excel: ${parsed.meta.fileName}` : 'Đã nhập từ Excel');
            const srcUrl = parsed.meta?.sourceFile?.file_url || dform.source_excel_file_url || '';
            const srcName = parsed.meta?.sourceFile?.file_name || dform.source_excel_file_name || parsed.meta?.fileName || '';
            if (parsed.meta?.requireReviewConfirm) {
              setExcelImportMeta({
                fileName: parsed.meta?.fileName || srcName || '',
                fileUrl: srcUrl,
                requireReviewConfirm: true,
              });
              setExcelReviewConfirmed(false);
            } else {
              setExcelImportMeta(srcUrl ? { fileName: srcName, fileUrl: srcUrl, requireReviewConfirm: false } : null);
              setExcelReviewConfirmed(true);
            }
            if (srcUrl) setQuoteSourceExcel({ file_url: srcUrl, file_name: srcName });
            skipLeadDetailPrefillRef.current = true;
            const cleanLead = dform.lead_id || urlLead || '';
            navigate(`/crm/quotations/new${cleanLead ? `?lead_id=${encodeURIComponent(cleanLead)}` : ''}`, { replace: true });
            return;
          }
        } catch (e) {
          console.warn('[quotation] excel draft:', e);
        }
        navigate('/crm/quotations/new', { replace: true });
        return;
      }

      const leadId = searchParams.get('lead_id');
      if (leadId && !skipLeadDetailPrefillRef.current) {
        api.get(`/crm/leads/${leadId}/detail`).then(r => {
          const lead = r.data;
          setForm(f => ({
            ...f,
            lead_id: leadId,
            title: lead.title || f.title,
            customer_id: lead.customer_id || f.customer_id,
            customer_name: lead.customer?.full_name || lead.contact_name || f.customer_name,
            customer_phone: lead.customer?.phone || lead.phone || f.customer_phone,
            customer_address: lead.customer?.address || lead.address || f.customer_address,
            company_id: lead.company_id || f.company_id,
            region_id: lead.region_id || f.region_id,
          }));
          setSelectedDeal({
            id: lead.id,
            code: lead.code,
            title: lead.title,
            type: lead.type,
            company_id: lead.company_id,
            company_name: lead.company?.short_name || lead.company?.name || null,
            region_id: lead.region_id,
            region_name: lead.crm_region?.name || lead.region?.name || null,
            assignee_name: lead.assignee?.full_name || null,
          });
        }).catch(() => { /* lead not found, ignore */ });
      }
    }
  }, [id, isEdit, navigate, searchParams]);

  /** Đảm bảo selectedDeal luôn đồng bộ với form.lead_id (kể cả khi đến từ Excel import,
   *  edit báo giá đã có lead_id, hay chuyển trang). Fetch lead detail nếu chưa có. */
  useEffect(() => {
    if (!form.lead_id) {
      setSelectedDeal(null);
      return;
    }
    if (selectedDeal && selectedDeal.id === form.lead_id) return; // đã đồng bộ
    let cancelled = false;
    api.get(`/crm/leads/${form.lead_id}/detail`)
      .then((r) => {
        if (cancelled) return;
        const lead = r.data || {};
        setSelectedDeal({
          id: lead.id,
          code: lead.code,
          title: lead.title,
          type: lead.type,
          customer_id: lead.customer_id,
          customer_name: lead.customer?.full_name || lead.contact_name || '',
          customer_phone: lead.customer?.phone || lead.phone || '',
          company_id: lead.company_id,
          company_name: lead.company?.short_name || lead.company?.name || null,
          region_id: lead.region_id,
          region_name: lead.crm_region?.name || lead.region?.name || null,
          assignee_name: lead.assignee?.full_name || null,
        });
        // Nếu form chưa có company_id/region_id (vd. từ Excel chỉ truyền lead_id) → kế thừa
        setForm((f) => ({
          ...f,
          company_id: f.company_id || lead.company_id || '',
          region_id: f.region_id || lead.region_id || '',
        }));
      })
      .catch(() => { /* lead deleted/inaccessible — vẫn cho lưu, picker hiển thị lead_id thuần */
        if (cancelled) return;
        setSelectedDeal({ id: form.lead_id, code: form.lead_id.slice(0, 8), title: '(Không tải được thông tin deal)' });
      });
    return () => { cancelled = true; };
  }, [form.lead_id, selectedDeal]);

  /** Khi user chọn deal từ picker: copy company/region/customer/title nếu form đang trống. */
  const pickDeal = (deal) => {
    if (!deal) {
      setSelectedDeal(null);
      setForm(f => ({ ...f, lead_id: '' }));
      return;
    }
    setSelectedDeal(deal);
    setForm(f => ({
      ...f,
      lead_id: deal.id,
      // Đồng bộ scope từ deal (giữ nguyên nếu user đã sửa)
      company_id: f.company_id || deal.company_id || '',
      region_id: f.region_id || deal.region_id || '',
      // Auto-fill customer nếu form đang trống
      customer_id: f.customer_id || deal.customer_id || '',
      customer_name: f.customer_name || deal.customer_name || '',
      customer_phone: f.customer_phone || deal.customer_phone || '',
      title: f.title || deal.title || '',
    }));
  };

  /** Cảnh báo khi region/company của báo giá khác với deal đã chọn (do user chỉnh tay). */
  const scopeMismatch = useMemo(() => {
    if (!selectedDeal) return null;
    const issues = [];
    if (form.company_id && selectedDeal.company_id && String(form.company_id) !== String(selectedDeal.company_id)) {
      issues.push('Công ty');
    }
    if (form.region_id && selectedDeal.region_id && String(form.region_id) !== String(selectedDeal.region_id)) {
      issues.push('Khu vực');
    }
    return issues.length ? issues : null;
  }, [form.company_id, form.region_id, selectedDeal]);

  useEffect(() => {
    if (!isEdit || !id) return;
    setHistoryLoading(true);
    api.get(`/crm/quotations/${id}/history`)
      .then((r) => setQuotationHistory(r.data.history || []))
      .catch(() => setQuotationHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [isEdit, id]);

  // Auto-fill customer info
  const selectCustomer = (c) => {
    if (c) setForm(f => ({ ...f, customer_id: c.id, customer_name: c.full_name, customer_phone: c.phone || '', customer_address: c.address || '' }));
    else setForm(f => ({ ...f, customer_id: '' }));
  };

      // Add product to items — auto-fill vat_rate, dimensions, standard_area from product
  const addProduct = (pid) => {
    const p = products.find(x => x.id === pid);
    if (p) {
      const dim = p.dimensions || {};
      const dimNgang = dim.ngang || dim.width || '';
      const dimCao = dim.cao || dim.height || '';
      const dimSau = dim.sau || dim.depth || '';
      
      // Mặc định diện tích chuẩn = Ngang * Cao (hoặc theo công thức của bạn)
      const stdArea = (parseFloat(dimNgang) || 0) * (parseFloat(dimCao) || 0);

      setItems(prev => [...prev, {
        product_id: p.id, 
        name: p.name, 
        description: p.description || '',
        product_code: p.code || '', 
        unit: p.unit || 'bộ',
        quantity: 1, 
        unit_price: p.base_price || 0, 
        discount_percent: 0,
        vat_rate: p.vat_rate || 0,
        length: dimNgang, // Ngang
        width: dimSau,    // Sâu
        height: dimCao,   // Cao
        dimensions: JSON.stringify(dim), 
        material: p.material || '', 
        color: p.color || '',
        standard_area: stdArea > 0 ? stdArea : 0,
        spec_factor: 1, // Mặc định hệ số 1
        group_name: p.category_name || '', // Lấy tên nhóm ngành nếu có
      }]);
    }
  };

  // Calculations with per-item VAT + spec_factor (hệ số quy cách) + area formula
  const calcs = useMemo(() => {
    const rows = items.map(i => {
      if (i.row_type === 'section') return { ...i, amount: 0, gross_amount: 0, discount_amount: 0, vat_amount: 0, tax_amount: 0, total: 0, actual_area: 0, area_ratio: 0, notes: '__SECTION__' };
      const factor = parseFloat(i.spec_factor) || 0;
      const qty = i.quantity || 0;
      const price = i.unit_price || 0;
      
      // ── Tính diện tích thực tế từ kích thước ──
      const lengthVal = parseFloat(i.length) || 0; // Ngang (mm)
      const widthVal = parseFloat(i.width) || 0;   // Sâu (mm)
      const heightVal = parseFloat(i.height) || 0;  // Cao (mm)
      
      // Diện tích thực tế = Ngang × Cao (mm²)
      // Đây là diện tích mặt tủ — dùng để so với DT chuẩn
      const actualArea = (lengthVal > 0 && heightVal > 0) ? lengthVal * heightVal : 0;
      
      // ── Diện tích chuẩn (standard_area) — nếu có ──
      const standardArea = parseFloat(i.standard_area) || 0;
      
      // ── Công thức thành tiền ──
      // 1. Nếu có diện tích chuẩn > 0 AND diện tích thực > 0:
      //    Thành tiền = (Diện tích thực / Diện tích chuẩn) × SL × Đơn giá
      //    → Giá quy đổi dựa trên tỷ lệ diện tích mới so với chuẩn
      // 2. Nếu hệ số QC > 0: Thành tiền = Hệ số × SL × Đơn giá
      // 3. Mặc định: Thành tiền = SL × Đơn giá
      let grossAmount;
      let areaRatio = 0;
      
      if (standardArea > 0 && actualArea > 0) {
        areaRatio = actualArea / standardArea;
        grossAmount = areaRatio * qty * price;
      } else if (factor > 0) {
        grossAmount = factor * qty * price;
      } else {
        grossAmount = qty * price;
      }
      
      // ── Excel fidelity: nếu lock_amount → giữ NGUYÊN imported_amount, tính ngược discount_amount.
      let amount, discountAmount;
      if (i.lock_amount && typeof i.imported_amount === 'number' && !i.is_freebie) {
        amount = i.imported_amount;
        discountAmount = Math.max(0, grossAmount - amount);
      } else {
        discountAmount = grossAmount * (i.discount_percent || 0) / 100;
        amount = grossAmount - discountAmount;
      }
      const vatRate = i.vat_rate || 0;
      const vatAmount = amount * vatRate / 100;
      const total = amount + vatAmount;
      return { ...i, amount, gross_amount: grossAmount, discount_amount: discountAmount, vat_rate: vatRate, vat_amount: vatAmount, tax_amount: vatAmount, total, actual_area: actualArea, area_ratio: areaRatio };
    });
    const subtotal = rows.reduce((s, r) => s + r.amount, 0);
    const {
      discountAmt,
      afterRebate,
      saleDiscountAmt,
      afterAllDiscounts,
    } = computeQuotationDocumentDiscounts(
      subtotal,
      form.discount_type,
      form.discount_value,
      form.sale_discount_type,
      form.sale_discount_value,
    );
    const totalVat = rows.reduce((s, r) => s + r.vat_amount, 0);
    // Group details: subtotal, discount, after-discount per group
    // Freebie items (unit_price=0, notes=HỖ TRỢ) excluded from discount calc
    const groupDetails = {};
    const groupOrder = [];
    rows.forEach((r, i) => {
      const g = r.group_name || '';
      if (g) {
        if (!groupDetails[g]) {
          groupDetails[g] = { subtotal: 0, discountTotal: 0, afterDiscount: 0, vatTotal: 0, freebieCount: 0 };
          groupOrder.push(g);
        }
        const isFreebie = items[i]?.is_freebie || (items[i]?.notes === 'HỖ TRỢ' && (r.gross_amount || 0) === 0);
        if (!isFreebie) {
          groupDetails[g].subtotal += (r.gross_amount || 0);
          groupDetails[g].discountTotal += (r.discount_amount || 0);
          groupDetails[g].afterDiscount += (r.amount || 0);
          groupDetails[g].vatTotal += (r.vat_amount || 0);
        } else {
          groupDetails[g].freebieCount++;
        }
      }
    });
    // Also keep simple groupSubtotals for backward compat
    const groupSubtotals = {};
    Object.entries(groupDetails).forEach(([g, d]) => { groupSubtotals[g] = d.afterDiscount; });
    return {
      rows,
      subtotal,
      discountAmt,
      afterRebate,
      saleDiscountAmt,
      afterAllDiscounts,
      afterDiscount: afterAllDiscounts,
      totalVat,
      total: afterAllDiscounts + totalVat,
      groupSubtotals,
      groupDetails,
      groupOrder,
    };
  }, [items, form.discount_type, form.discount_value, form.sale_discount_type, form.sale_discount_value]);

  const { depositShow, remainingShow } = useMemo(() => getDepositRemainingDisplay(form), [
    form.deposit_amount, form.deposit_received, form.deposit_label,
    form.remaining_amount, form.remaining_note, form.notes,
  ]);

  const _isSaving = useRef(false);
  const excelSaveBlocked = !isEdit && excelImportMeta?.requireReviewConfirm && !excelReviewConfirmed;

  const save = async () => {
    if (_isSaving.current) return;
    if (!form.title && !form.customer_name) return alert('Nhập tiêu đề hoặc khách hàng');
    if (excelSaveBlocked) {
      alert('Vui lòng tick xác nhận đã kiểm tra lại số liệu báo giá trước khi lưu.');
      return;
    }
    _isSaving.current = true;
    setSaveStatus('loading');
    setSaveMsg(isEdit ? 'Đang cập nhật báo giá...' : 'Đang tạo báo giá...');
    try {
      const effectivePayment = isCustomPayment ? customPaymentTerms : form.payment_terms;
      const payload = { ...form, payment_terms: effectivePayment, items: calcs.rows };
      const excelSrc = excelImportMeta?.fileUrl
        ? {
            source_excel_file_url: excelImportMeta.fileUrl,
            source_excel_file_name: excelImportMeta.fileName || excelImportMeta.fileUrl,
          }
        : quoteSourceExcel?.file_url
          ? {
              source_excel_file_url: quoteSourceExcel.file_url,
              source_excel_file_name: quoteSourceExcel.file_name || '',
            }
          : {};
      Object.assign(payload, excelSrc);
      if (!isEdit && excelImportMeta) {
        payload.quotation_source = {
          from_excel: true,
          excel_file_name: excelImportMeta.fileName || null,
          excel_review_confirmed: !!excelReviewConfirmed,
        };
      }
      if (isEdit) {
        await api.put(`/crm/quotations/${id}`, payload);
        setSaveMsg('Cập nhật báo giá thành công!');
        setSaveStatus('success');
        try {
          const r = await api.get(`/crm/quotations/${id}/history`);
          setQuotationHistory(r.data.history || []);
        } catch (_) {}
        setTimeout(() => navigate('/crm/quotations'), 1200);
      } else {
        const { data } = await api.post('/crm/quotations', payload);
        setExcelImportMeta(null);
        setSaveMsg('Tạo báo giá thành công!');
        setSaveStatus('success');
        setTimeout(() => navigate(`/crm/quotations/${data.id}`, { replace: true }), 1200);
      }
    } catch (e) {
      setSaveMsg(e.response?.data?.error || 'Có lỗi xảy ra khi lưu');
      setSaveStatus('error');
      _isSaving.current = false;
    }
  };

  const updateStatus = async (newStatus) => {
    if (statusLoading) return;
    setStatusLoading(true);
    try {
      const { data } = await api.put(`/crm/quotations/${id}`, { status: newStatus });
      setForm(f => ({ ...f, status: newStatus }));
      try {
        const r = await api.get(`/crm/quotations/${id}/history`);
        setQuotationHistory(r.data.history || []);
      } catch (_) {}
      // Auto-flow: BG chấp nhận → có thể tạo dự án (không tạo đơn hàng)
      if (data.auto?.autoProject && !data.auto.autoProject.existing) {
        alert(`🚀 Đã tạo dự án ${data.auto.autoProject.code} và gen tác vụ ban đầu.`);
      }
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setStatusLoading(false);
  };

  const downloadPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const response = await api.get(`/crm/quotations/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.code || 'bao-gia'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) { alert('Lỗi tải PDF'); }
    setPdfLoading(false);
  };

  /** Field khi sửa sẽ tự GỠ lock_amount (vì user chủ động đổi → muốn recompute theo công thức). */
  const FIELDS_BREAK_LOCK = new Set(['quantity', 'unit_price', 'discount_percent', 'spec_factor', 'standard_area', 'length', 'width', 'height']);
  const updateItem = (idx, field, val) => setItems(prev => prev.map((item, i) => {
    if (i !== idx) return item;
    const next = { ...item, [field]: val };
    if (FIELDS_BREAK_LOCK.has(field) && item.lock_amount) {
      next.lock_amount = false;
      next.imported_amount = undefined;
    }
    return next;
  }));
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const addRow = () => setItems(prev => [...prev, { name: '', description: '', unit: 'bộ', quantity: 1, unit_price: 0, discount_percent: 0, vat_rate: 0, dimensions: '', material: '', color: '', spec_factor: 0, group_name: '', standard_area: 0 }]);

  /** Áp CK% cho tất cả items trong cùng nhóm (override per-item discount_percent).
   *  Bỏ qua dòng freebie / HỖ TRỢ vì các dòng đó luôn = 0. */
  const updateGroupDiscount = (groupName, percent) => {
    if (!groupName) return;
    const pct = Math.max(0, Math.min(100, parseFloat(percent) || 0));
    setItems(prev => prev.map(it => {
      if (it.row_type === 'section') return it;
      if ((it.group_name || '') !== groupName) return it;
      if (it.is_freebie || it.notes === 'HỖ TRỢ') return it;
      // Áp CK nhóm → gỡ lock_amount để công thức mới có hiệu lực
      return { ...it, discount_percent: pct, lock_amount: false, imported_amount: undefined };
    }));
  };

  /** Lấy CK% "đại diện" của nhóm: nếu mọi item cùng % → trả về %; nếu lệch → trả về null (mixed). */
  const getGroupDiscountPercent = (groupName) => {
    if (!groupName) return 0;
    const groupItems = items.filter(
      it => it.row_type !== 'section'
        && (it.group_name || '') === groupName
        && !it.is_freebie
        && it.notes !== 'HỖ TRỢ',
    );
    if (!groupItems.length) return 0;
    const pcts = groupItems.map(it => parseFloat(it.discount_percent) || 0);
    const first = pcts[0];
    return pcts.every(p => Math.abs(p - first) < 0.01) ? first : null;
  };
  const addSection = () => setItems(prev => [...prev, { row_type: 'section', name: 'Phần mới', notes: '__SECTION__' }]);

  return (
    <div className="space-y-4 w-full">
      <SaveToast status={saveStatus} message={saveMsg} onDone={() => setSaveStatus('idle')} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/crm/quotations')} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Sửa báo giá' : 'Tạo báo giá mới'}</h1>
            {isEdit && form.code && <p className="text-xs text-blue-600 font-bold">{form.code}</p>}
            {excelDraftHint && (
              <p className="text-xs text-emerald-700 font-medium mt-1 rounded-lg bg-emerald-50 border border-emerald-100 px-2 py-1 inline-block">
                {excelDraftHint} — chỉnh sửa bên dưới rồi bấm <strong>Lưu</strong> để tạo báo giá chính thức.
              </p>
            )}
            {(excelImportMeta?.fileUrl || quoteSourceExcel?.file_url) && (
              <div className="mt-2">
                <QuotationSourceExcelLink
                  fileUrl={excelImportMeta?.fileUrl || quoteSourceExcel?.file_url}
                  fileName={excelImportMeta?.fileName || quoteSourceExcel?.file_name}
                  compact
                />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2" data-print-hide>
          {isEdit && (
            <div className="relative flex items-center">
              <select value={form.status || 'draft'} onChange={e => updateStatus(e.target.value)} disabled={statusLoading}
                className={`h-9 px-3 rounded-lg text-sm font-medium border-2 cursor-pointer disabled:opacity-60 ${
                  form.status === 'accepted' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
                  form.status === 'sent' ? 'border-blue-300 bg-blue-50 text-blue-700' :
                  form.status === 'rejected' ? 'border-red-300 bg-red-50 text-red-700' :
                  form.status === 'converted' ? 'border-purple-300 bg-purple-50 text-purple-700' :
                  'border-gray-200'}`}>
                <option value="draft">📝 Nháp</option>
                <option value="sent">📤 Đã gửi KH</option>
                <option value="accepted">✅ KH chấp nhận</option>
                <option value="rejected">❌ Từ chối</option>
              </select>
              {statusLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500 absolute right-7 pointer-events-none" />}
            </div>
          )}
          {isEdit && (
            <button onClick={downloadPdf} disabled={pdfLoading} className="h-9 px-4 border rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer hover:bg-gray-50 disabled:opacity-50">
              {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {pdfLoading ? 'Đang tải...' : 'Xuất PDF'}
            </button>
          )}
          <button onClick={save} disabled={saveStatus === 'loading' || excelSaveBlocked} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50">
            {saveStatus === 'loading'
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang lưu...</>
              : <><Save className="h-4 w-4" /> Lưu</>}
          </button>
        </div>
      </div>

      {!isEdit && excelImportMeta?.requireReviewConfirm && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 space-y-2">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={excelReviewConfirmed}
              onChange={(e) => setExcelReviewConfirmed(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-gray-300 text-emerald-600 cursor-pointer flex-shrink-0"
            />
            <span className={`text-sm font-medium leading-snug ${excelReviewConfirmed ? 'text-emerald-800' : 'text-gray-700'}`}>
              {user?.full_name ? (
                <>
                  <span className="font-bold text-blue-800">{user.full_name}</span> đã kiểm tra lại báo giá (từ Excel) và xác nhận số liệu chính xác trước khi lưu
                </>
              ) : (
                'Tôi đã kiểm tra lại báo giá từ Excel và xác nhận số liệu chính xác trước khi lưu'
              )}
            </span>
            {excelReviewConfirmed && <Check className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />}
          </label>
          <p className="text-xs text-emerald-900/80 pl-7">
            Bắt buộc tick mới bấm được <strong>Lưu</strong> — xác nhận được ghi trong lịch sử báo giá.
          </p>
        </div>
      )}

      {/* Customer Info - MISA style */}
      <div className="bg-white rounded-xl border p-4">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Liên kết deal & khách hàng</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
              Deal / Cơ hội liên kết
              <span className="text-[10px] text-gray-400">(báo giá sẽ kế thừa công ty + khu vực từ đây)</span>
            </label>
            <div className="mt-1">
              <LeadDealPicker
                value={selectedDeal}
                onChange={pickDeal}
                type="deal"
                customerId={form.customer_id || null}
                placeholder="Tìm deal theo mã / tên / SĐT khách..."
              />
            </div>
            {scopeMismatch && (
              <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-center gap-2">
                <span>⚠️</span>
                <span>
                  {scopeMismatch.join(' & ')} của báo giá khác với deal đã chọn. Backend sẽ ưu tiên giá trị bạn đang đặt — kiểm tra kỹ trước khi lưu.
                </span>
              </div>
            )}
            {!selectedDeal && (
              <p className="mt-1 text-[11px] text-amber-700">
                ⚠️ Chưa gắn deal — báo giá sẽ là <strong>"mồ côi"</strong> và bị đánh dấu trong danh sách. Có thể bỏ qua nếu thật sự không gắn deal nào.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Khách hàng</label>
            <div className="mt-1">
              <CustomerSearchPicker
                customers={customers}
                value={form.customer_id}
                onChange={selectCustomer}
                placeholder="Tìm theo tên, SĐT, MST..."
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Tiêu đề báo giá</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Báo giá tủ bếp chữ L" className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Tên KH</label>
            <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">SĐT</label>
            <input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">Địa chỉ</label>
            <input value={form.customer_address} onChange={e => setForm(f => ({ ...f, customer_address: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
        </div>
      </div>

      {/* Items Table - MISA style with per-item VAT */}
      <div className="bg-white rounded-xl border p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-900">Chi tiết hàng hóa / dịch vụ</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowProductPicker(true)} className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
              <Search className="h-3.5 w-3.5" /> Tìm & thêm sản phẩm
            </button>
            <button onClick={addSection} className="h-9 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer border border-indigo-200">
              <AlignLeft className="h-3.5 w-3.5" /> Thêm tiêu đề phần
            </button>
            <button onClick={addRow} className="h-9 px-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer">
              <Plus className="h-3.5 w-3.5" /> Thêm dòng trống
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border rounded-lg" style={{ maxHeight: '65vh' }}>
          <table className="min-w-[2200px] w-full text-xs">
            <thead className="sticky top-0 z-10"><tr className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wider">
              <th className="py-2.5 px-1.5 text-left" style={{width:36}}>STT</th>
              <th className="py-2.5 px-1.5 text-left" style={{width:100}}>Mã HH</th>
              <th className="py-2.5 px-1.5 text-left" style={{minWidth:180}}>Tên hàng hóa</th>
              <th className="py-2.5 px-1.5 text-left" style={{width:140}}>Diễn giải</th>
              <th className="py-2.5 px-1.5 text-center" style={{width:50}}>ĐVT</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap" style={{width:65}} title="Ngang (mm)">Ngang</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap" style={{width:60}} title="Sâu (mm)">Sâu</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap" style={{width:60}} title="Cao (mm)">Cao</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap" style={{width:85}} title="Diện tích chuẩn (mm²)">DT Chuẩn</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap" style={{width:85}} title="Diện tích thực tế = Ngang × Cao">DT Thực</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap" style={{width:60}} title="Hệ số quy cách">HS QC</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap" style={{width:50}}>SL</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap" style={{width:120}}>Đơn giá</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap" style={{width:120}}>Thành tiền</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap" style={{width:50}}>CK%</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap" style={{width:100}}>Tiền CK</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap" style={{width:50}}>%VAT</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap" style={{width:100}}>Tiền thuế</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap" style={{width:130}}>Tổng tiền</th>
              <th className="py-2.5 px-1.5 text-left" style={{width:80}}>CTKM</th>
              <th className="py-2.5 px-1.5 text-center" style={{width:36}}>KM</th>
              <th className="py-2.5 px-1.5" style={{width:36}}></th>
            </tr></thead>
            <tbody>
              {(() => { let itemNo = 0; return items.map((item, idx) => {
                if (item.row_type === 'section') return (
                  <React.Fragment key={idx}>
                    <tr className="bg-indigo-50 border-b border-indigo-200">
                      <td colSpan={21} className="py-1.5 px-2">
                        <input
                          value={item.name}
                          onChange={e => updateItem(idx, 'name', e.target.value)}
                          className="w-full bg-transparent text-xs font-bold text-indigo-800 outline-none placeholder-indigo-300"
                          placeholder="Tên tiêu đề phần..."
                        />
                      </td>
                      <td className="py-1 px-1 text-center">
                        <button onClick={() => removeItem(idx)} className="p-0.5 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  </React.Fragment>
                );
                const row = calcs.rows[idx] || {};
                itemNo++;
                const prevGroupName = idx > 0 ? (items[idx - 1].row_type !== 'section' ? items[idx - 1].group_name || '' : '') : '';
                const currentGroupName = item.group_name || '';
                const showGroupHeader = currentGroupName && currentGroupName !== prevGroupName;
                // Check if this is the last item in its group
                const nextGroupName = idx < items.length - 1 ? (items[idx + 1].group_name || '') : '';
                const isLastInGroup = currentGroupName && currentGroupName !== nextGroupName;
                const gd = currentGroupName ? calcs.groupDetails[currentGroupName] : null;
                return (
                  <React.Fragment key={idx}>
                  {showGroupHeader && (() => {
                    const curGroupCK = getGroupDiscountPercent(currentGroupName);
                    const isMixed = curGroupCK === null;
                    return (
                      <tr className="bg-indigo-50">
                        <td colSpan={22} className="py-2 px-3">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <span className="font-bold text-indigo-800 text-sm">{currentGroupName}</span>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-indigo-700 font-medium">CK nhóm:</span>
                              <NumericInput
                                value={isMixed ? '' : (curGroupCK || '')}
                                onChange={(v) => updateGroupDiscount(currentGroupName, v)}
                                placeholder={isMixed ? 'Lệch' : '0'}
                                title={isMixed
                                  ? 'Các dòng trong nhóm đang có CK% khác nhau — nhập 1 giá trị mới sẽ áp đồng loạt'
                                  : 'Nhập CK% áp cho TẤT CẢ dòng trong nhóm (HỖ TRỢ được bỏ qua)'}
                                allowEmpty
                                className={`w-16 h-7 px-2 border rounded text-xs text-right outline-none ${
                                  isMixed
                                    ? 'border-amber-300 bg-amber-50 text-amber-700 placeholder-amber-500'
                                    : (curGroupCK > 0)
                                      ? 'border-orange-300 bg-orange-50 text-orange-700 font-semibold'
                                      : 'border-indigo-200 bg-white'
                                }`}
                              />
                              <span className="text-indigo-700">%</span>
                              {isMixed && (
                                <span className="text-[10px] text-amber-600 italic">(các dòng đang lệch CK)</span>
                              )}
                              {!isMixed && curGroupCK > 0 && (
                                <button
                                  type="button"
                                  onClick={() => updateGroupDiscount(currentGroupName, 0)}
                                  className="text-[10px] text-red-500 hover:text-red-700 underline cursor-pointer"
                                  title="Xoá CK nhóm"
                                >
                                  Xoá CK
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })()}
                  <tr className="border-b hover:bg-blue-50/30">
                    <td className="py-1 px-1 text-gray-400 text-xs">{itemNo}</td>
                    <td className="py-1 px-1"><input value={item.product_code || ''} onChange={e => updateItem(idx, 'product_code', e.target.value)} placeholder="Mã" className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent" /></td>
                    <td className="py-1 px-1">
                      <ProductAutocompleteCell
                        value={item.name}
                        products={products}
                        onChange={(val) => updateItem(idx, 'name', val)}
                        onSelectProduct={(p) => {
                          // Parse dimensions from product (jsonb: {ngang, cao, sau})
                          const dim = p.dimensions || {};
                          const dimNgang = dim.ngang || dim.width || '';
                          const dimCao = dim.cao || dim.height || '';
                          const dimSau = dim.sau || dim.depth || '';
                          // Standard area = ngang × cao (in mm, convert to m²)
                          const stdAreaMM = (parseFloat(dimNgang) || 0) * (parseFloat(dimCao) || 0);
                          const stdArea = stdAreaMM > 0 ? stdAreaMM : 0;
                          setItems(prev => prev.map((it, i) => i === idx ? {
                            ...it,
                            product_id: p.id, name: p.name, description: p.description || it.description,
                            product_code: p.code || it.product_code, unit: p.unit || it.unit,
                            unit_price: p.base_price || it.unit_price,
                            vat_rate: p.vat_rate || it.vat_rate,
                            dimensions: p.dimensions || it.dimensions,
                            material: p.material || it.material,
                            color: p.color || it.color,
                            // Fill dimensions into size fields
                            length: dimNgang || it.length,   // Ngang
                            height: dimCao || it.height,      // Cao  
                            width: dimSau || it.width,        // Sâu
                            standard_area: stdArea || it.standard_area,
                          } : it));
                        }}
                        placeholder="Gõ tên SP..."
                      />
                    </td>
                    <td className="py-1 px-1">
                      <div className="flex items-center gap-1">
                        <input value={item.description || ''} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Mô tả" className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent truncate" title={item.description || ''} />
                        {item.description && item.description.length > 20 && (
                          <button onClick={() => setDescPopup({ idx, name: item.name, description: item.description })} className="flex-shrink-0 p-1 text-blue-400 hover:text-blue-600 cursor-pointer" title="Xem chi tiết"><Search className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    </td>
                    <td className="py-1 px-1"><input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-center" /></td>
                    <td className="py-1 px-1"><NumericInput value={item.length || ''} onChange={v => updateItem(idx, 'length', v)} placeholder="mm" title="Ngang (mm)" allowEmpty className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1"><NumericInput value={item.width || ''} onChange={v => updateItem(idx, 'width', v)} placeholder="mm" title="Sâu (mm)" allowEmpty className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1"><NumericInput value={item.height || ''} onChange={v => updateItem(idx, 'height', v)} placeholder="mm" title="Cao (mm)" allowEmpty className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right" /></td>
                    {/* DT Chuẩn — diện tích chuẩn: Ngang × Cao (mm²) — tự tính từ dimensions SP */}
                    <td className="py-1 px-1">
                      <NumericInput value={item.standard_area || ''} onChange={v => updateItem(idx, 'standard_area', v)} placeholder="0" title={item.standard_area ? `DT Chuẩn: ${formatNum(item.standard_area)} mm²` : 'Diện tích chuẩn (mm²)'} allowEmpty className={`w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right ${parseFloat(item.standard_area) > 0 ? 'text-teal-700 font-semibold' : ''}`} />
                    </td>
                    {/* DT Thực — = Ngang × Cao (mm²), readonly */}
                    <td className="py-1 px-1 text-right text-xs whitespace-nowrap">
                      {row.actual_area > 0 ? (
                        <span className={`font-medium ${row.area_ratio > 0 ? (row.area_ratio > 1 ? 'text-orange-600' : 'text-teal-700') : 'text-gray-600'}`} title={`${formatNum(row.actual_area)} mm²${row.area_ratio > 0 ? ` | Tỷ lệ: ×${row.area_ratio.toFixed(3)}` : ''}`}>
                          {formatNum(row.actual_area)}
                          {row.area_ratio > 0 && <span className={`text-[10px] block ${row.area_ratio > 1 ? 'text-orange-500' : 'text-teal-500'}`}>×{row.area_ratio.toFixed(2)}</span>}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-1 px-1"><NumericInput value={item.spec_factor || ''} onChange={v => updateItem(idx, 'spec_factor', v)} placeholder="0" title="Hệ số quy cách" allowEmpty className={`w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right ${parseFloat(item.spec_factor) > 0 ? 'text-indigo-700 font-semibold' : ''}`} /></td>
                    <td className="py-1 px-1"><NumericInput value={item.quantity} onChange={v => updateItem(idx, 'quantity', v)} placeholder="1" className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1"><NumericInput value={item.unit_price} onChange={v => updateItem(idx, 'unit_price', v)} placeholder="0" className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1 text-right text-xs font-medium whitespace-nowrap text-gray-900">
                      {item.is_freebie || item.notes === 'HỖ TRỢ' ? (
                        <span className="text-green-600 font-bold">HỖ TRỢ</span>
                      ) : (
                        <NumericInput
                          value={Math.round((item.lock_amount && typeof item.imported_amount === 'number' ? item.imported_amount : row.gross_amount) || 0) || ''}
                          onChange={(v) => {
                            const amt = v === '' || v === null ? null : (parseFloat(v) || 0);
                            if (amt === null) {
                              setItems(prev => prev.map((it, i) => i === idx ? { ...it, lock_amount: false, imported_amount: undefined } : it));
                              return;
                            }
                            // Khoá thành tiền sản phẩm: calcs sẽ dùng imported_amount thay cho công thức,
                            // tự tính ngược discount_amount = max(0, gross - amount).
                            setItems(prev => prev.map((it, i) => i === idx ? {
                              ...it,
                              lock_amount: true,
                              imported_amount: amt,
                            } : it));
                          }}
                          placeholder="0"
                          allowEmpty
                          title={item.lock_amount ? 'Thành tiền đã khoá (sửa qty/đơn giá/CK sẽ tự gỡ khoá)' : 'Sửa số để khoá Thành tiền theo giá trị mong muốn'}
                          className={`w-full px-1.5 py-1 border ${item.lock_amount ? 'border-emerald-400 text-emerald-700 font-semibold' : 'border-gray-200 hover:border-gray-400'} focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right`}
                        />
                      )}
                    </td>
                    <td className="py-1 px-1"><NumericInput value={item.discount_percent || 0} onChange={v => updateItem(idx, 'discount_percent', v)} className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1">
                      {item.is_freebie || item.notes === 'HỖ TRỢ' ? (
                        <span className="block text-right text-xs text-green-600 font-bold">—</span>
                      ) : (
                        <NumericInput
                          value={Math.round(row.discount_amount || 0) || ''}
                          onChange={(v) => {
                            const gross = row.gross_amount || 0;
                            const amt = parseFloat(v) || 0;
                            if (gross > 0) {
                              // Tính ngược % CK từ số tiền CK; cap ở [0, 100]
                              const pct = Math.max(0, Math.min(100, Math.round((amt / gross) * 10000) / 100));
                              updateItem(idx, 'discount_percent', pct);
                            } else if (amt === 0) {
                              updateItem(idx, 'discount_percent', 0);
                            }
                          }}
                          placeholder="0"
                          allowEmpty
                          title="Số tiền CK (đ) — gõ vào sẽ tự tính lại % CK theo Thành tiền gốc"
                          className="w-full px-1.5 py-1 border border-gray-200 hover:border-orange-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-300 rounded text-xs outline-none bg-transparent text-right text-orange-700 font-medium"
                        />
                      )}
                    </td>
                    <td className="py-1 px-1"><NumericInput value={item.vat_rate || 0} onChange={v => updateItem(idx, 'vat_rate', v)} className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1 text-right text-xs text-gray-600 whitespace-nowrap">{formatVND(row.tax_amount || 0)}</td>
                    <td className="py-1 px-1 text-right text-xs font-bold whitespace-nowrap text-blue-700">{formatVND(row.total || 0)}</td>
                    <td className="py-1 px-1"><input value={item.promo_code || ''} onChange={e => updateItem(idx, 'promo_code', e.target.value)} placeholder="" className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent" /></td>
                    <td className="py-1 px-1 text-center"><input type="checkbox" checked={item.is_promo || false} onChange={e => updateItem(idx, 'is_promo', e.target.checked)} className="h-4 w-4 rounded cursor-pointer" /></td>
                    <td className="py-1 px-1"><button onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                  {/* Group summary rows after last item in group */}
                  {isLastInGroup && gd && (
                    <>
                      <tr className="bg-indigo-50/70">
                        <td colSpan={13} className="py-2 px-3 text-right text-sm font-bold text-indigo-800">
                          Tổng {currentGroupName.replace(/^[IVXLCDM]+\.\s*/, '').split(/\s*[-–]\s*/)[0]}:
                        </td>
                        <td className="py-2 px-2 text-right text-sm font-bold text-indigo-800">{formatVND(gd.subtotal)}</td>
                        <td colSpan={8}></td>
                      </tr>
                      {gd.discountTotal > 0 && (
                        <tr className="bg-indigo-50/70">
                          <td colSpan={13} className="py-2 px-3 text-right text-sm font-bold text-red-600">
                            Chiết khấu nhóm:
                          </td>
                          <td className="py-2 px-2 text-right text-sm font-bold text-red-600">-{formatVND(gd.discountTotal)}</td>
                          <td colSpan={8}></td>
                        </tr>
                      )}
                      {gd.discountTotal > 0 && (
                        <tr className="bg-indigo-100/60">
                          <td colSpan={13} className="py-2 px-3 text-right text-sm font-bold text-indigo-900">
                            Tổng sau CK:
                          </td>
                          <td className="py-2 px-2 text-right text-sm font-bold text-indigo-900">{formatVND(gd.afterDiscount)}</td>
                          <td colSpan={8}></td>
                        </tr>
                      )}
                    </>
                  )}
                  </React.Fragment>
                );
              }); })()}
            </tbody>
          </table>
        </div>

        {/* Totals - per-group breakdown + overall */}
        <div className="flex justify-end mt-4">
          <div className="w-[420px] space-y-2">
            {/* Per-group after-CK totals */}
            {calcs.groupOrder.length > 0 && calcs.groupOrder.map(group => {
              const gd = calcs.groupDetails[group];
              return (
                <div key={group} className="flex justify-between text-xs text-indigo-700">
                  <span className="truncate max-w-[260px]" title={group}>📂 {group.length > 40 ? group.slice(0, 40) + '...' : group}:</span>
                  <span className="font-medium">{formatVND(gd.afterDiscount)}</span>
                </div>
              );
            })}
            {calcs.groupOrder.length > 0 && <div className="border-t border-gray-200" />}
            <div className="flex justify-between text-sm"><span className="text-gray-500">Tổng tiền hàng:</span><span className="font-medium">{formatVND(calcs.subtotal)}</span></div>
            <div className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2.5 space-y-2">
              <p className="text-xs font-bold text-gray-800 uppercase tracking-wide">Tổng chiết khấu</p>
              <p className="text-[10px] text-gray-500 leading-snug">Áp trên tổng tiền hàng (sau chiết khấu theo dòng / nhóm)</p>
              <div className="flex items-stretch gap-2">
                <select
                  value={form.discount_type}
                  onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value }))}
                  className="h-10 w-[4.25rem] shrink-0 px-2 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer"
                  title="Loại chiết khấu tổng"
                >
                  <option value="percent">%</option>
                  <option value="amount">VNĐ</option>
                </select>
                <NumericInput
                  value={form.discount_value === 0 ? '' : form.discount_value}
                  onChange={(v) => setForm((f) => ({ ...f, discount_value: v === '' ? 0 : parseFloat(v) || 0 }))}
                  placeholder={form.discount_type === 'percent' ? 'VD: 5' : '0'}
                  allowEmpty
                  title="Nhập tổng chiết khấu"
                  className={`flex-1 min-w-0 h-10 px-3 border rounded-lg text-sm text-right font-medium outline-none focus:ring-2 focus:ring-red-300 ${
                    (form.discount_value || 0) > 0
                      ? 'border-red-400 bg-white text-red-800'
                      : 'border-gray-200 bg-white text-gray-900'
                  }`}
                />
              </div>
              <div className="flex justify-between items-center text-sm pt-1 border-t border-red-100">
                <span className="text-gray-600">Số tiền giảm</span>
                <span className="font-bold text-red-600 tabular-nums">
                  {(calcs.discountAmt || 0) > 0 ? `-${formatVND(calcs.discountAmt)}` : formatVND(0)}
                </span>
              </div>
            </div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Cộng sau CK:</span><span className="font-medium">{formatVND(calcs.afterRebate)}</span></div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5 space-y-2">
              <p className="text-xs font-bold text-gray-800 uppercase tracking-wide">Giảm giá</p>
              <p className="text-[10px] text-gray-500 leading-snug">Áp trên số tiền sau chiết khấu tổng (khác chiết khấu)</p>
              <div className="flex items-stretch gap-2">
                <select
                  value={form.sale_discount_type}
                  onChange={(e) => setForm((f) => ({ ...f, sale_discount_type: e.target.value }))}
                  className="h-10 w-[4.25rem] shrink-0 px-2 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer"
                  title="Loại giảm giá tổng"
                >
                  <option value="percent">%</option>
                  <option value="amount">VNĐ</option>
                </select>
                <NumericInput
                  value={form.sale_discount_value === 0 ? '' : form.sale_discount_value}
                  onChange={(v) => setForm((f) => ({ ...f, sale_discount_value: v === '' ? 0 : parseFloat(v) || 0 }))}
                  placeholder={form.sale_discount_type === 'percent' ? 'VD: 3' : '0'}
                  allowEmpty
                  title="Nhập giảm giá"
                  className={`flex-1 min-w-0 h-10 px-3 border rounded-lg text-sm text-right font-medium outline-none focus:ring-2 focus:ring-amber-300 ${
                    (form.sale_discount_value || 0) > 0
                      ? 'border-amber-400 bg-white text-amber-900'
                      : 'border-gray-200 bg-white text-gray-900'
                  }`}
                />
              </div>
              <div className="flex justify-between items-center text-sm pt-1 border-t border-amber-100">
                <span className="text-gray-600">Số tiền giảm</span>
                <span className="font-bold text-amber-700 tabular-nums">
                  {(calcs.saleDiscountAmt || 0) > 0 ? `-${formatVND(calcs.saleDiscountAmt)}` : formatVND(0)}
                </span>
              </div>
            </div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Cộng trước thuế:</span><span className="font-medium">{formatVND(calcs.afterAllDiscounts)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Thuế GTGT:</span><span className="font-medium">{formatVND(calcs.totalVat)}</span></div>
            <div className="flex justify-between text-base font-bold border-t pt-2 mt-2">
              <span>TỔNG CỘNG:</span>
              <span className="text-blue-600">{formatVND(calcs.total)}</span>
            </div>
            {(depositShow || remainingShow) && (
              <div className="mt-3 pt-3 border-t border-rose-200/80 space-y-2 text-xs rounded-lg bg-rose-50/80 px-3 py-2 -mx-1">
                <div className="font-semibold text-rose-900 text-[11px] uppercase tracking-wide">Tiền cọc & khoản còn lại</div>
                {depositShow && (
                  <div className="space-y-0.5">
                    <div className="flex justify-between gap-2">
                      <span className="text-rose-900">Tiền cọc (theo báo giá)</span>
                      <span className="font-bold text-rose-950 tabular-nums">
                        {depositShow.amount > 0 ? formatVND(depositShow.amount) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 text-rose-800">
                      <span>Trạng thái nhận cọc</span>
                      <span className="font-medium">
                        {depositShow.received === true ? 'Đã nhận' : depositShow.received === false ? 'Chưa nhận' : '—'}
                      </span>
                    </div>
                    {depositShow.label && (
                      <p className="text-[11px] text-rose-800/90 whitespace-pre-wrap leading-snug border-t border-rose-100 pt-1 mt-1">{depositShow.label}</p>
                    )}
                    {depositShow.fromNotesOnly && (
                      <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">
                        Đang hiển thị từ ghi chú. Điền ô bên dưới phần Điều khoản và <strong>Lưu</strong> để lưu vào hệ thống.
                      </p>
                    )}
                  </div>
                )}
                {remainingShow && (remainingShow.amount > 0 || remainingShow.note) && (
                  <div className={`space-y-0.5 ${depositShow ? 'border-t border-rose-100 pt-2' : ''}`}>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-700">Còn lại (khi bàn giao / nghiệm thu)</span>
                      <span className="font-bold text-slate-900 tabular-nums">
                        {remainingShow.amount > 0 ? formatVND(remainingShow.amount) : '—'}
                      </span>
                    </div>
                    {remainingShow.note && (
                      <p className="text-[11px] text-slate-600 whitespace-pre-wrap leading-snug">{remainingShow.note}</p>
                    )}
                    {remainingShow.fromNotesOnly && (
                      <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">
                        Đang hiển thị từ ghi chú — nhập trường tương ứng và Lưu để cố định.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product Search Picker Modal */}
      {showProductPicker && (
        <ProductSearchPicker
          multiSelect
          onSelect={(p) => { addProduct(p.id); setShowProductPicker(false); }}
          onSelectMulti={(prods) => {
            prods.forEach(p => {
              const dim = p.dimensions || {};
              const dimNgang = dim.ngang || dim.width || '';
              const dimCao = dim.cao || dim.height || '';
              const dimSau = dim.sau || dim.depth || '';
              const stdArea = (parseFloat(dimNgang) || 0) * (parseFloat(dimCao) || 0);
              setItems(prev => [...prev, {
                product_id: p.id, name: p.name, description: p.description || '',
                product_code: p.code || '', unit: p.unit || 'bộ',
                quantity: 1, unit_price: p.base_price || 0, discount_percent: 0,
                vat_rate: p.vat_rate || 0,
                length: dimNgang, width: dimSau, height: dimCao, weight: '',
                dimensions: JSON.stringify(dim), material: p.material || '', color: p.color || '',
                promo_code: '', is_promo: false,
                standard_area: stdArea > 0 ? stdArea : 0,
                spec_factor: 0, group_name: p.category_name || '',
              }]);
            });
            setShowProductPicker(false);
          }}
          onClose={() => setShowProductPicker(false)}
        />
      )}

      {/* Terms */}
      <div className="bg-white rounded-xl border p-4">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Điều khoản</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600">Hiệu lực đến</label>
            <input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Điều khoản thanh toán</label>
            <select value={isCustomPayment ? 'Khác' : form.payment_terms} onChange={e => {
              const val = e.target.value;
              if (val === 'Khác') { setIsCustomPayment(true); setForm(f => ({ ...f, payment_terms: 'Khác' })); }
              else { setIsCustomPayment(false); setCustomPaymentTerms(''); setForm(f => ({ ...f, payment_terms: val })); }
            }} className="w-full h-10 px-3 border rounded-lg text-sm mt-1">
              {PAYMENT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            {isCustomPayment && (
              <input value={customPaymentTerms} onChange={e => setCustomPaymentTerms(e.target.value)} placeholder="Nhập điều khoản thanh toán..." className="w-full h-10 px-3 border rounded-lg text-sm mt-2" />
            )}
          </div>
          <div className="md:col-span-2 rounded-lg border border-rose-100 bg-rose-50/50 p-3 space-y-3">
            <h3 className="text-xs font-bold text-rose-950">Cọc & thanh toán còn lại</h3>
            <p className="text-[11px] text-rose-900/80">Số liệu khớp block cuối file Excel (hoặc nhập tay). Hiển thị tóm tắt cạnh <strong>TỔNG CỘNG</strong>.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Tiền cọc (VNĐ)</label>
                <NumericInput
                  value={form.deposit_amount === null || form.deposit_amount === undefined ? '' : form.deposit_amount}
                  onChange={(v) => setForm((f) => ({ ...f, deposit_amount: v === '' ? null : v }))}
                  allowEmpty
                  className="w-full h-10 px-3 border rounded-lg text-sm mt-1 text-right"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Đã nhận cọc?</label>
                <select
                  value={form.deposit_received === true ? 'yes' : form.deposit_received === false ? 'no' : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({
                      ...f,
                      deposit_received: v === 'yes' ? true : v === 'no' ? false : null,
                    }));
                  }}
                  className="w-full h-10 px-3 border rounded-lg text-sm mt-1"
                >
                  <option value="">Chưa xác định</option>
                  <option value="yes">Đã nhận</option>
                  <option value="no">Chưa nhận</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-600">Mô tả dòng cọc (VD: ký HĐ, lệnh SX)</label>
                <input
                  value={form.deposit_label}
                  onChange={(e) => setForm((f) => ({ ...f, deposit_label: e.target.value }))}
                  className="w-full h-10 px-3 border rounded-lg text-sm mt-1"
                  placeholder="Tùy chọn"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Số tiền còn lại (VNĐ)</label>
                <NumericInput
                  value={form.remaining_amount === null || form.remaining_amount === undefined ? '' : form.remaining_amount}
                  onChange={(v) => setForm((f) => ({ ...f, remaining_amount: v === '' ? null : v }))}
                  allowEmpty
                  className="w-full h-10 px-3 border rounded-lg text-sm mt-1 text-right"
                  placeholder="0"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-600">Diễn giải khoản còn lại</label>
                <input
                  value={form.remaining_note}
                  onChange={(e) => setForm((f) => ({ ...f, remaining_note: e.target.value }))}
                  className="w-full h-10 px-3 border rounded-lg text-sm mt-1"
                  placeholder="VD: khi bàn giao và nghiệm thu công trình"
                />
              </div>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">Ghi chú / Điều khoản</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={5} className="w-full px-3 py-2 border rounded-lg text-sm mt-1 whitespace-pre-wrap" placeholder="Ghi chú, điều khoản thanh toán, bảo hành..." />
          </div>
        </div>
      </div>

      {isEdit && (
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-slate-600" /> Lịch sử chỉnh sửa báo giá
          </h2>
          {historyLoading ? (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
            </p>
          ) : quotationHistory.length === 0 ? (
            <p className="text-sm text-gray-500">
              Chưa có bản ghi. Sau khi chạy migration hệ thống và lưu báo giá, các lần tạo/cập nhật sẽ hiển thị tại đây.
            </p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {quotationHistory.map((h) => (
                <li key={h.id} className="text-sm border border-gray-100 rounded-lg px-3 py-2 bg-gray-50/90">
                  <div className="flex justify-between gap-2 flex-wrap items-start">
                    <span className={`font-semibold ${h.action === 'created' ? 'text-emerald-700' : 'text-blue-700'}`}>
                      {h.action === 'created' ? 'Tạo mới' : 'Cập nhật'}
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(h.created_at)}</span>
                  </div>
                  <p className="text-gray-800 mt-1 leading-snug">{h.summary}</p>
                  {h.editor_name ? (
                    <p className="text-xs text-gray-500 mt-1">Người thực hiện: {h.editor_name}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Description Detail Popup */}
      {descPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDescPopup(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="text-sm font-bold text-gray-900">📝 Chi tiết mô tả — {descPopup.name}</h3>
              <button onClick={() => setDescPopup(null)} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer"><X className="h-4 w-4 text-gray-500" /></button>
            </div>
            <div className="p-5">
              <textarea
                value={items[descPopup.idx]?.description || ''}
                onChange={e => updateItem(descPopup.idx, 'description', e.target.value)}
                rows={8}
                className="w-full px-3 py-2 border rounded-lg text-sm whitespace-pre-wrap leading-relaxed"
                placeholder="Nhập mô tả chi tiết..."
              />
            </div>
            <div className="px-5 py-3 border-t bg-gray-50 rounded-b-xl flex justify-end">
              <button onClick={() => setDescPopup(null)} className="h-8 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
