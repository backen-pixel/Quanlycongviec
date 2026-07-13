import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import api from '../lib/api';
import { Plus, Trash2, Save, ArrowLeft, Search, ShoppingCart, AlignLeft, Loader2, Download } from 'lucide-react';
import ProductSearchPicker from '../components/ProductSearchPicker';
import ProductAutocompleteCell from '../components/ProductAutocompleteCell';
import CustomerSearchPicker from '../components/CustomerSearchPicker';
import SaveToast from '../components/SaveToast';
import { ORDER_EXCEL_DRAFT_KEY } from '../components/ExcelQuotationImport';

// Override formatVND: 0 → "0đ" thay vì "—"
const formatVND = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  if (n === 0) return '0đ';
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ';
};

const parseNumber = (val) => {
  if (val === '' || val === null || val === undefined) return 0;
  const cleaned = String(val).replace(/,/g, '.');
  return parseFloat(cleaned) || 0;
};

const formatNum = (n) => {
  if (n === '' || n === null || n === undefined) return '';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '';
  if (num === 0) return '0';
  return new Intl.NumberFormat('vi-VN').format(num);
};

// Component input số — hiển thị formatted khi blur, raw khi focus (đồng bộ với QuotationForm)
function NumericInput({ value, onChange, placeholder, title, className, allowEmpty }) {
  const [localVal, setLocalVal] = useState('');
  const [focused, setFocused] = useState(false);

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
        const raw = (value === 0 || value === '0') ? '' : String(value ?? '');
        setLocalVal(raw);
        setTimeout(() => e.target.select(), 0);
      }}
      onChange={(e) => {
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

export default function OrderForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const [form, setForm] = useState({
    title: '', customer_id: '', customer_name: '', customer_phone: '', customer_address: '',
    payment_terms: '', delivery_date: '', notes: '',
    discount_type: 'percent', discount_value: 0,
    status: 'draft', code: '', lead_id: '',
  });
  const [items, setItems] = useState([{
    name: '', description: '', product_code: '', unit: 'bộ', quantity: 1, unit_price: 0,
    discount_percent: 0, vat_rate: 0, height: '', width: '', length: '', weight: '',
    dimensions: '', material: '', color: '', promo_code: '', is_promo: false,
    spec_factor: 0, group_name: '', standard_area: 0,
  }]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveMsg, setSaveMsg] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const excelHydratedRef = useRef(false);

  useEffect(() => {
    api.get('/customers', { params: { limit: 5000 } }).then(r => setCustomers(r.data.customers || r.data || []));
    api.get('/products', { params: { limit: 5000 } }).then(r => setProducts(r.data.products || r.data || []));
    if (isEdit) {
      api.get(`/crm/orders/${id}`).then(r => {
        const d = r.data;
        setForm({
          title: d.title || '', customer_id: d.customer_id || '', customer_name: d.customer_name || '',
          customer_phone: d.customer_phone || '', customer_address: d.customer_address || '',
          payment_terms: d.payment_terms || '', delivery_date: d.delivery_date || '',
          notes: d.notes || '', discount_type: d.discount_type || 'percent', discount_value: d.discount_value || 0,
          status: d.status || 'draft', code: d.code || '', lead_id: d.lead_id || '',
        });
        if (d.items?.length) setItems(d.items.map(i => {
          if (i.notes === '__SECTION__') return { row_type: 'section', name: i.name, notes: '__SECTION__' };
          // ── Khôi phục lock_amount khi reload: nếu stored amount lệch với recompute
          // (qty*price*spec_factor*(1-pct)) → coi như đã khoá theo Excel, giữ nguyên amount.
          const qty = i.quantity || 1;
          const price = i.unit_price || 0;
          const sf = parseFloat(i.spec_factor) || 0;
          const gross = sf > 0 ? sf * qty * price : qty * price;
          const recomputed = gross - gross * (i.discount_percent || 0) / 100;
          const stored = i.amount || i.total || 0;
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
    } else if (searchParams.get('from_excel') === '1' && !excelHydratedRef.current) {
      excelHydratedRef.current = true;
      try {
        let parsed = location.state?.excelDraft || null;
        if (!parsed) {
          const raw = sessionStorage.getItem(ORDER_EXCEL_DRAFT_KEY);
          if (raw) parsed = JSON.parse(raw);
        }
        try { sessionStorage.removeItem(ORDER_EXCEL_DRAFT_KEY); } catch (_) { /* ignore */ }
        if (parsed) {
          const dform = parsed.form || {};
          const urlLead = searchParams.get('lead_id') || '';
          setForm((f) => ({
            ...f,
            title: dform.title || f.title,
            customer_name: dform.customer_name || '',
            customer_phone: dform.customer_phone || '',
            customer_address: dform.customer_address || '',
            lead_id: dform.lead_id || urlLead || '',
            notes: dform.notes || '',
            payment_terms: dform.payment_terms || '',
            discount_type: dform.discount_type || 'amount',
            discount_value: dform.discount_value ?? 0,
          }));
          if (parsed.items?.length) {
            setItems(parsed.items.map((i) => ({
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
              imported_discount_amount: typeof i.imported_discount_amount === 'number' ? i.imported_discount_amount : undefined,
            })));
          }
        }
      } catch (_) { /* ignore */ }
    } else if (!isEdit) {
      const urlLead = searchParams.get('lead_id') || '';
      if (urlLead) setForm((f) => ({ ...f, lead_id: urlLead }));
    }
  }, [id, isEdit, searchParams, location.state]);

  const selectCustomer = (c) => {
    if (c) setForm(f => ({ ...f, customer_id: c.id, customer_name: c.full_name, customer_phone: c.phone || '', customer_address: c.address || '' }));
    else setForm(f => ({ ...f, customer_id: '' }));
  };

  const addProductToItems = (p) => {
    const dim = p.dimensions || {};
    const dimNgang = dim.ngang || dim.width || '';
    const dimCao = dim.cao || dim.height || '';
    const dimSau = dim.sau || dim.depth || '';
    const stdAreaMM = (parseFloat(dimNgang) || 0) * (parseFloat(dimCao) || 0);
    setItems(prev => [...prev, {
      product_id: p.id, name: p.name, description: p.description || '',
      product_code: p.code || '', unit: p.unit || 'bộ',
      quantity: 1, unit_price: p.base_price || 0, discount_percent: 0,
      vat_rate: p.vat_rate || 0,
      length: dimNgang, width: dimSau, height: dimCao, weight: '',
      dimensions: JSON.stringify(dim), material: p.material || '', color: p.color || '',
      standard_area: stdAreaMM > 0 ? stdAreaMM : 0,
      promo_code: '', is_promo: false, spec_factor: 1,
      group_name: p.category_name || '',
    }]);
  };

  // Calculations with per-item VAT + spec_factor (hệ số quy cách) + area formula — đồng bộ với QuotationForm
  const calcs = useMemo(() => {
    const rows = items.map(i => {
      if (i.row_type === 'section') return { ...i, amount: 0, gross_amount: 0, discount_amount: 0, vat_amount: 0, tax_amount: 0, total: 0, actual_area: 0, area_ratio: 0, notes: '__SECTION__' };
      const factor = parseFloat(i.spec_factor) || 0;
      const qty = i.quantity || 0;
      const price = i.unit_price || 0;

      const lengthVal = parseFloat(i.length) || 0; // Ngang (mm)
      const heightVal = parseFloat(i.height) || 0; // Cao (mm)
      const actualArea = (lengthVal > 0 && heightVal > 0) ? lengthVal * heightVal : 0;
      const standardArea = parseFloat(i.standard_area) || 0;

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

      // ── Excel fidelity: nếu lock_amount → giữ NGUYÊN imported_amount / imported_discount_amount ──
      const importedDiscountAmount = typeof i.imported_discount_amount === 'number' ? i.imported_discount_amount : null;
      let amount, discountAmount;
      if (i.lock_amount && typeof i.imported_amount === 'number' && !i.is_freebie) {
        amount = i.imported_amount;
        discountAmount = importedDiscountAmount !== null ? importedDiscountAmount : Math.max(0, grossAmount - amount);
      } else {
        discountAmount = importedDiscountAmount !== null ? importedDiscountAmount : (grossAmount * (i.discount_percent || 0) / 100);
        amount = grossAmount - discountAmount;
      }
      const vatRate = i.vat_rate || 0;
      const vatAmount = amount * vatRate / 100;
      const total = amount + vatAmount;
      const unitPriceAfterDiscount = price * (1 - (i.discount_percent || 0) / 100);
      return { ...i, amount, gross_amount: grossAmount, discount_amount: discountAmount, unit_price_after_discount: unitPriceAfterDiscount, vat_rate: vatRate, vat_amount: vatAmount, tax_amount: vatAmount, total, actual_area: actualArea, area_ratio: areaRatio };
    });
    const subtotal = rows.reduce((s, r) => s + r.amount, 0);
    const discountAmt = form.discount_type === 'percent' ? subtotal * (form.discount_value || 0) / 100 : (form.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const totalVat = rows.reduce((s, r) => s + r.vat_amount, 0);
    // Group details: subtotal, discount, after-discount per group (bỏ freebie khỏi tổng CK nhóm)
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
    return { rows, subtotal, discountAmt, afterDiscount, totalVat, total: afterDiscount + totalVat, groupDetails, groupOrder };
  }, [items, form.discount_type, form.discount_value]);

  /** Field khi sửa sẽ tự GỠ lock_amount (vì user chủ động đổi → muốn recompute theo công thức). */
  const FIELDS_BREAK_LOCK = new Set(['quantity', 'unit_price', 'discount_percent', 'spec_factor', 'standard_area', 'length', 'width', 'height']);

  /** Áp CK% cho tất cả items trong cùng nhóm (override per-item discount_percent). */
  const updateGroupDiscount = (groupName, percent) => {
    if (!groupName) return;
    const pct = Math.max(0, Math.min(100, parseFloat(percent) || 0));
    setItems(prev => prev.map(it => {
      if (it.row_type === 'section') return it;
      if ((it.group_name || '') !== groupName) return it;
      if (it.is_freebie || it.notes === 'HỖ TRỢ') return it;
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

  const updateStatus = async (newStatus) => {
    if (statusLoading) return;
    setStatusLoading(true);
    try {
      await api.put(`/crm/orders/${id}`, { status: newStatus });
      setForm(f => ({ ...f, status: newStatus }));
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setStatusLoading(false);
  };

  const downloadPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const response = await api.get(`/crm/orders/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.code || 'don-hang'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) { alert('Lỗi tải PDF'); }
    setPdfLoading(false);
  };

  const _isSaving = useRef(false);
  const save = async () => {
    if (_isSaving.current) return;
    if (!form.title && !form.customer_name) return alert('Nhập tiêu đề hoặc khách hàng');
    if (items.filter(i => i.row_type !== 'section').every(i => !i.name)) return alert('Thêm ít nhất 1 sản phẩm');
    _isSaving.current = true;
    setSaveStatus('loading');
    setSaveMsg(isEdit ? 'Đang cập nhật đơn hàng...' : 'Đang tạo đơn hàng...');
    try {
      const payload = {
        ...form,
        lead_id: form.lead_id || null,
        items: calcs.rows,
      };
      if (isEdit && id) {
        await api.put(`/crm/orders/${id}`, payload);
        setSaveMsg('Cập nhật đơn hàng thành công!');
        setSaveStatus('success');
        setTimeout(() => navigate(`/crm/orders/${id}`), 1200);
      } else {
        const { data } = await api.post('/crm/orders', payload);
        setSaveMsg('Tạo đơn hàng thành công!');
        setSaveStatus('success');
        setTimeout(() => navigate(`/crm/orders/${data.id}`), 1200);
      }
    } catch (e) {
      setSaveMsg(e.response?.data?.error || 'Có lỗi xảy ra khi lưu');
      setSaveStatus('error');
      _isSaving.current = false;
    }
  };

  const updateItem = (idx, field, val) => setItems(prev => prev.map((item, i) => {
    if (i !== idx) return item;
    const next = { ...item, [field]: val };
    if (FIELDS_BREAK_LOCK.has(field) && item.lock_amount) {
      next.lock_amount = false;
      next.imported_amount = undefined;
    }
    if (field === 'discount_percent' && item.imported_discount_amount != null) {
      next.imported_discount_amount = undefined;
    }
    return next;
  }));
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const addRow = () => setItems(prev => [...prev, { name: '', description: '', unit: 'bộ', quantity: 1, unit_price: 0, discount_percent: 0, vat_rate: 0, dimensions: '', material: '', color: '', spec_factor: 0, group_name: '', standard_area: 0 }]);
  const addSection = () => setItems(prev => [...prev, { row_type: 'section', name: 'Phần mới', notes: '__SECTION__' }]);

  return (
    <div className="space-y-4 w-full">
      <SaveToast status={saveStatus} message={saveMsg} onDone={() => setSaveStatus('idle')} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(id ? `/crm/orders/${id}` : '/crm/orders')} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-emerald-600" />
              {isEdit ? 'Sửa đơn hàng' : 'Tạo đơn hàng mới'}
            </h1>
            {isEdit && form.code && <p className="text-xs text-emerald-600 font-bold">{form.code}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEdit && (
            <div className="relative flex items-center">
              <select
                value={form.status || 'draft'}
                onChange={e => updateStatus(e.target.value)}
                disabled={statusLoading}
                className={`h-9 px-3 rounded-lg text-sm font-medium border-2 cursor-pointer disabled:opacity-60 ${
                  form.status === 'delivered' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
                  form.status === 'shipped' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' :
                  form.status === 'processing' ? 'border-amber-300 bg-amber-50 text-amber-700' :
                  form.status === 'confirmed' ? 'border-blue-300 bg-blue-50 text-blue-700' :
                  form.status === 'cancelled' ? 'border-red-300 bg-red-50 text-red-700' :
                  'border-gray-200'}`}
              >
                <option value="draft">📝 Nháp</option>
                <option value="confirmed">✅ Xác nhận</option>
                <option value="processing">🔧 Đang SX</option>
                <option value="shipped">🚚 Đang giao</option>
                <option value="delivered">📦 Đã giao</option>
                <option value="cancelled">❌ Hủy</option>
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
          <button onClick={save} disabled={saveStatus === 'loading'} className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50">
            {saveStatus === 'loading'
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang lưu...</>
              : <><Save className="h-4 w-4" /> {isEdit ? 'Lưu thay đổi' : 'Lưu đơn hàng'}</>}
          </button>
        </div>
      </div>

      {/* Customer Info */}
      <div className="bg-white rounded-xl border p-4">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Thông tin khách hàng</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <label className="text-xs font-medium text-gray-600">Tiêu đề đơn hàng</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="VD: Đơn hàng tủ bếp chữ L" className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Tên KH</label>
            <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">SĐT</label>
            <input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Địa chỉ</label>
            <input value={form.customer_address} onChange={e => setForm(f => ({ ...f, customer_address: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Ngày giao hàng</label>
            <input type="date" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-xl border p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-900">Chi tiết hàng hóa / dịch vụ</h2>
          <div className="flex items-center gap-2">
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
          <table className="min-w-[2320px] w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wider">
                <th rowSpan={2} className="py-2.5 px-1.5 text-left align-bottom" style={{width:36}}>STT</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-left align-bottom" style={{width:100}}>Mã HH</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-left align-bottom" style={{minWidth:180}}>Tên hàng hóa</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-left align-bottom" style={{width:140}}>Diễn giải</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-center align-bottom" style={{width:50}}>ĐVT</th>
                <th colSpan={3} className="py-1.5 px-1.5 text-center border-b border-gray-200" style={{width:185}}>Quy cách</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:85}} title="Diện tích chuẩn (mm²)">DT Chuẩn</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:85}} title="Diện tích thực tế = Ngang × Cao">DT Thực</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:50}}>SL</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:120}}>Đơn giá</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:50}}>% Chiết Khấu</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:120}} title="Đơn giá đã trừ %CK — chỉ để đối chiếu">Đơn Giá Sau CK</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:100}}>Số Tiền CK</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:120}}>Thành Tiền</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:50}}>%VAT</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:100}}>Tiền thuế</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:130}}>Tổng tiền</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-left align-bottom" style={{width:80}}>CTKM</th>
                <th rowSpan={2} className="py-2.5 px-1.5 text-center align-bottom" style={{width:36}}>KM</th>
                <th rowSpan={2} className="py-2.5 px-1.5 align-bottom" style={{width:36}}></th>
              </tr>
              <tr className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wider">
                <th className="py-1.5 px-1.5 text-right whitespace-nowrap" style={{width:60}} title="Cao (mm)">Cao</th>
                <th className="py-1.5 px-1.5 text-right whitespace-nowrap" style={{width:65}} title="Ngang (mm)">Ngang</th>
                <th className="py-1.5 px-1.5 text-right whitespace-nowrap" style={{width:60}} title="Sâu (mm)">Sâu</th>
              </tr>
            </thead>
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
                          const dim = p.dimensions || {};
                          const dimNgang = dim.ngang || dim.width || '';
                          const dimCao = dim.cao || dim.height || '';
                          const dimSau = dim.sau || dim.depth || '';
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
                            length: dimNgang || it.length,
                            height: dimCao || it.height,
                            width: dimSau || it.width,
                            standard_area: stdArea || it.standard_area,
                          } : it));
                        }}
                        placeholder="Gõ tên SP..."
                      />
                    </td>
                    <td className="py-1 px-1"><input value={item.description || ''} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Mô tả" className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent" /></td>
                    <td className="py-1 px-1"><input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-center" /></td>
                    <td className="py-1 px-1"><NumericInput value={item.height || ''} onChange={v => updateItem(idx, 'height', v)} placeholder="mm" title="Cao (mm)" allowEmpty className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1"><NumericInput value={item.length || ''} onChange={v => updateItem(idx, 'length', v)} placeholder="mm" title="Ngang (mm)" allowEmpty className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1"><NumericInput value={item.width || ''} onChange={v => updateItem(idx, 'width', v)} placeholder="mm" title="Sâu (mm)" allowEmpty className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1">
                      <NumericInput value={item.standard_area || ''} onChange={v => updateItem(idx, 'standard_area', v)} placeholder="0" title={item.standard_area ? `DT Chuẩn: ${formatNum(item.standard_area)} mm²` : 'Diện tích chuẩn (mm²)'} allowEmpty className={`w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right ${parseFloat(item.standard_area) > 0 ? 'text-teal-700 font-semibold' : ''}`} />
                    </td>
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
                    <td className="py-1 px-1"><NumericInput value={item.quantity} onChange={v => updateItem(idx, 'quantity', v)} placeholder="1" className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1"><NumericInput value={item.unit_price} onChange={v => updateItem(idx, 'unit_price', v)} placeholder="0" className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1"><NumericInput value={item.discount_percent || 0} onChange={v => updateItem(idx, 'discount_percent', v)} className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1 text-right text-xs text-gray-500 whitespace-nowrap" title="Đơn giá đã trừ %CK — chỉ để đối chiếu, không dùng để tính Thành tiền">
                      {item.is_freebie || item.notes === 'HỖ TRỢ' ? <span className="text-gray-300">—</span> : formatVND(row.unit_price_after_discount || 0)}
                    </td>
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
                    <td className="py-1 px-1"><NumericInput value={item.vat_rate || 0} onChange={v => updateItem(idx, 'vat_rate', v)} className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1 text-right text-xs text-gray-600 whitespace-nowrap">{formatVND(row.tax_amount || 0)}</td>
                    <td className="py-1 px-1 text-right text-xs font-bold whitespace-nowrap text-emerald-700">{formatVND(row.total || 0)}</td>
                    <td className="py-1 px-1"><input value={item.promo_code || ''} onChange={e => updateItem(idx, 'promo_code', e.target.value)} placeholder="" className="w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-xs outline-none bg-transparent" /></td>
                    <td className="py-1 px-1 text-center"><input type="checkbox" checked={item.is_promo || false} onChange={e => updateItem(idx, 'is_promo', e.target.checked)} className="h-4 w-4 rounded cursor-pointer" /></td>
                    <td className="py-1 px-1"><button onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                  {/* Group summary rows after last item in group */}
                  {isLastInGroup && gd && (
                    <>
                      <tr className="bg-indigo-50/70">
                        <td colSpan={15} className="py-2 px-3 text-right text-sm font-bold text-indigo-800">
                          Tổng {currentGroupName.replace(/^[IVXLCDM]+\.\s*/, '').split(/\s*[-–]\s*/)[0]}:
                        </td>
                        <td className="py-2 px-2 text-right text-sm font-bold text-indigo-800">{formatVND(gd.subtotal)}</td>
                        <td colSpan={6}></td>
                      </tr>
                      {gd.discountTotal > 0 && (
                        <tr className="bg-indigo-50/70">
                          <td colSpan={15} className="py-2 px-3 text-right text-sm font-bold text-red-600">
                            Chiết khấu nhóm:
                          </td>
                          <td className="py-2 px-2 text-right text-sm font-bold text-red-600">-{formatVND(gd.discountTotal)}</td>
                          <td colSpan={6}></td>
                        </tr>
                      )}
                      {gd.discountTotal > 0 && (
                        <tr className="bg-indigo-100/60">
                          <td colSpan={15} className="py-2 px-3 text-right text-sm font-bold text-indigo-900">
                            Tổng sau CK:
                          </td>
                          <td className="py-2 px-2 text-right text-sm font-bold text-indigo-900">{formatVND(gd.afterDiscount)}</td>
                          <td colSpan={6}></td>
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

        {/* Totals */}
        <div className="flex justify-end mt-4">
          <div className="w-80 space-y-2">
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
            <div className="flex items-center justify-between text-sm gap-2">
              <span className="text-gray-500">Chiết khấu:</span>
              <div className="flex items-center gap-1">
                <select value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))} className="h-7 px-1 border rounded text-xs">
                  <option value="percent">%</option><option value="amount">VNĐ</option>
                </select>
                <input type="number" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: parseFloat(e.target.value) || 0 }))} className="w-20 h-7 px-2 border rounded text-xs text-right" />
              </div>
              <span className="font-medium text-red-600">-{formatVND(calcs.discountAmt)}</span>
            </div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Thuế GTGT:</span><span className="font-medium">{formatVND(calcs.totalVat)}</span></div>
            <div className="flex justify-between text-base font-bold border-t pt-2 mt-2">
              <span>TỔNG CỘNG:</span>
              <span className="text-emerald-600">{formatVND(calcs.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600">Điều khoản thanh toán</label>
            <input value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} placeholder="VD: TT 50% khi ký HĐ..." className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Ghi chú</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
          </div>
        </div>
      </div>

      {/* Product Search Picker Modal */}
      {showProductPicker && (
        <ProductSearchPicker
          multiSelect
          onSelect={(p) => { addProductToItems(p); setShowProductPicker(false); }}
          onSelectMulti={(prods) => { prods.forEach(p => addProductToItems(p)); setShowProductPicker(false); }}
          onClose={() => setShowProductPicker(false)}
        />
      )}
    </div>
  );
}
