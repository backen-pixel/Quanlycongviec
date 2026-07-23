import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import api from '../lib/api';
import { Save, ArrowLeft, ShoppingCart, Loader2, Download } from 'lucide-react';
import ProductSearchPicker from '../components/ProductSearchPicker';
import CustomerSearchPicker from '../components/CustomerSearchPicker';
import SaveToast from '../components/SaveToast';
import CommercialItemsTable, { SimpleTotalsSummary } from '../components/CommercialItemsTable';
import {
  computeItemRows, computeGroupBreakdown, computeSimpleDocTotals,
  restoreServerItems, mapExcelDraftItems, buildItemFromProduct, makeEmptyItem,
} from '../lib/commercialItems';
import { ORDER_EXCEL_DRAFT_KEY } from '../components/ExcelQuotationImport';

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
  const [items, setItems] = useState([{ ...makeEmptyItem(), product_code: '', height: '', width: '', length: '', weight: '', promo_code: '', is_promo: false }]);
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
        if (d.items?.length) setItems(restoreServerItems(d.items));
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
          if (parsed.items?.length) setItems(mapExcelDraftItems(parsed.items));
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

  const addProductToItems = (p) => setItems(prev => [...prev, buildItemFromProduct(p)]);

  // Tính toán dòng hàng + tổng — logic chung với QuotationForm/InvoiceForm (lib/commercialItems)
  const calcs = useMemo(() => {
    const rows = computeItemRows(items);
    const totals = computeSimpleDocTotals(rows, form.discount_type, form.discount_value);
    const groups = computeGroupBreakdown(rows, items);
    return { rows, ...totals, ...groups };
  }, [items, form.discount_type, form.discount_value]);

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

      {/* Items Table + Totals */}
      <CommercialItemsTable
        theme="order"
        items={items}
        setItems={setItems}
        rows={calcs.rows}
        groupDetails={calcs.groupDetails}
        products={products}
        onOpenProductPicker={() => setShowProductPicker(true)}
      >
        <SimpleTotalsSummary
          calcs={calcs}
          discountType={form.discount_type}
          discountValue={form.discount_value}
          onDiscountTypeChange={(v) => setForm(f => ({ ...f, discount_type: v }))}
          onDiscountValueChange={(v) => setForm(f => ({ ...f, discount_value: v }))}
          totalClass="text-emerald-600"
        />
      </CommercialItemsTable>

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
