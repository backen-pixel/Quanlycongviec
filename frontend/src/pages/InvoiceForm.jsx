import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND } from '../lib/utils';
import { Plus, Trash2, Save, ArrowLeft, Search, Receipt, AlignLeft, Loader2, Download } from 'lucide-react';
import ProductSearchPicker from '../components/ProductSearchPicker';
import ProductAutocompleteCell from '../components/ProductAutocompleteCell';
import CustomerSearchPicker from '../components/CustomerSearchPicker';
import SaveToast from '../components/SaveToast';

export default function InvoiceForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '', customer_id: '', customer_name: '', customer_phone: '', customer_address: '',
    customer_tax_code: '', payment_terms: '', due_date: '', notes: '',
    discount_type: 'percent', discount_value: 0,
  });
  const [items, setItems] = useState([{
    name: '', description: '', product_code: '', unit: 'bộ', quantity: 1, unit_price: 0,
    discount_percent: 0, vat_rate: 0, height: '', width: '', length: '',
    spec_factor: 0,
  }]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveMsg, setSaveMsg] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    api.get('/customers', { params: { limit: 5000 } }).then(r => setCustomers(r.data.customers || r.data || []));
    api.get('/products', { params: { limit: 5000 } }).then(r => setProducts(r.data.products || r.data || []));
    if (isEdit) {
      api.get(`/crm/invoices/${id}`).then(r => {
        const d = r.data;
        setForm({
          title: d.title || '', customer_id: d.customer_id || '', customer_name: d.customer_name || '',
          customer_phone: d.customer_phone || '', customer_address: d.customer_address || '',
          customer_tax_code: d.customer_tax_code || '', payment_terms: d.payment_terms || '',
          due_date: d.due_date || '', notes: d.notes || '',
          discount_type: d.discount_type || 'percent', discount_value: d.discount_value || 0,
          code: d.code || '', payment_status: d.payment_status || 'unpaid',
        });
        if (d.items?.length) setItems(d.items.map(i => {
          if (i.notes === '__SECTION__') return { row_type: 'section', name: i.name, notes: '__SECTION__' };
          return {
            name: i.name, description: i.description || '', product_code: i.product_code || '',
            unit: i.unit || 'bộ', quantity: i.quantity || 1,
            unit_price: i.unit_price || 0, discount_percent: i.discount_percent || 0,
            vat_rate: i.vat_rate || 0,
            height: i.height || '', width: i.width || '', length: i.length || '',
            product_id: i.product_id, spec_factor: i.spec_factor || 0,
          };
        }));
      });
    }
  }, [id]);

  const selectCustomer = (c) => {
    if (c) setForm(f => ({ ...f, customer_id: c.id, customer_name: c.full_name, customer_phone: c.phone || '', customer_address: c.address || '', customer_tax_code: c.tax_code || '' }));
    else setForm(f => ({ ...f, customer_id: '' }));
  };

  const addProductToItems = (p) => {
    setItems(prev => [...prev, {
      product_id: p.id, name: p.name, description: p.description || '',
      product_code: p.code || '', unit: p.unit || 'bộ',
      quantity: 1, unit_price: p.base_price || 0, discount_percent: 0,
      vat_rate: p.vat_rate || 0,
      height: '', width: '', length: '', spec_factor: 0,
    }]);
  };

  // Calculations with spec_factor (hệ số quy cách)
  const calcs = useMemo(() => {
    const rows = items.map(i => {
      if (i.row_type === 'section') return { ...i, amount: 0, gross_amount: 0, discount_amount: 0, vat_amount: 0, total: 0, notes: '__SECTION__' };
      const factor = parseFloat(i.spec_factor) || 0;
      const grossAmount = factor > 0
        ? factor * (i.quantity || 0) * (i.unit_price || 0)
        : (i.quantity || 0) * (i.unit_price || 0);
      const discountAmount = grossAmount * (i.discount_percent || 0) / 100;
      const amount = grossAmount - discountAmount;
      const vatRate = i.vat_rate || 0;
      const vatAmount = amount * vatRate / 100;
      const total = amount + vatAmount;
      return { ...i, amount, gross_amount: grossAmount, discount_amount: discountAmount, vat_rate: vatRate, vat_amount: vatAmount, total };
    });
    const subtotal = rows.reduce((s, r) => s + r.amount, 0);
    const discountAmt = form.discount_type === 'percent' ? subtotal * (form.discount_value || 0) / 100 : (form.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const totalVat = rows.reduce((s, r) => s + r.vat_amount, 0);
    return { rows, subtotal, discountAmt, afterDiscount, totalVat, total: afterDiscount + totalVat };
  }, [items, form.discount_type, form.discount_value]);

  const updatePaymentStatus = async (newStatus) => {
    if (statusLoading) return;
    setStatusLoading(true);
    try {
      await api.put(`/crm/invoices/${id}`, { payment_status: newStatus });
      setForm(f => ({ ...f, payment_status: newStatus }));
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setStatusLoading(false);
  };

  const downloadPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const response = await api.get(`/crm/invoices/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.code || 'hoa-don'}.pdf`;
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
    setSaveMsg(isEdit ? 'Đang cập nhật hóa đơn...' : 'Đang tạo hóa đơn...');
    try {
      const payload = {
        ...form,
        subtotal: calcs.subtotal,
        discount_amount: calcs.discountAmt,
        tax_amount: calcs.totalVat,
        total: calcs.total,
      };
      if (isEdit) {
        await api.put(`/crm/invoices/${id}`, payload);
        await api.post(`/crm/invoices/${id}/items`, { items: calcs.rows });
        setSaveMsg('Cập nhật hóa đơn thành công!');
        setSaveStatus('success');
        setTimeout(() => navigate(`/crm/invoices/${id}`), 1200);
      } else {
        const { data } = await api.post('/crm/invoices', payload);
        if (calcs.rows.length) {
          await api.post(`/crm/invoices/${data.id}/items`, { items: calcs.rows });
        }
        setSaveMsg('Tạo hóa đơn thành công!');
        setSaveStatus('success');
        setTimeout(() => navigate(`/crm/invoices/${data.id}`), 1200);
      }
    } catch (e) {
      setSaveMsg(e.response?.data?.error || 'Có lỗi xảy ra khi lưu');
      setSaveStatus('error');
      _isSaving.current = false;
    }
  };

  const updateItem = (idx, field, val) => setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const addRow = () => setItems(prev => [...prev, { name: '', description: '', unit: 'bộ', quantity: 1, unit_price: 0, discount_percent: 0, vat_rate: 0, spec_factor: 0 }]);
  const addSection = () => setItems(prev => [...prev, { row_type: 'section', name: 'Phần mới', notes: '__SECTION__' }]);

  return (
    <div className="space-y-4 w-full">
      <SaveToast status={saveStatus} message={saveMsg} onDone={() => setSaveStatus('idle')} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(isEdit ? `/crm/invoices/${id}` : '/crm/invoices')} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-purple-600" />
              {isEdit ? 'Sửa hóa đơn' : 'Tạo hóa đơn mới'}
            </h1>
            {isEdit && form.code && <p className="text-xs text-purple-600 font-bold">{form.code}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEdit && (
            <div className="relative flex items-center">
              <select
                value={form.payment_status || 'unpaid'}
                onChange={e => updatePaymentStatus(e.target.value)}
                disabled={statusLoading}
                className={`h-9 px-3 rounded-lg text-sm font-medium border-2 cursor-pointer disabled:opacity-60 ${
                  form.payment_status === 'paid' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
                  form.payment_status === 'partial' ? 'border-amber-300 bg-amber-50 text-amber-700' :
                  'border-red-200 bg-red-50 text-red-700'}`}
              >
                <option value="unpaid">💰 Chưa thanh toán</option>
                <option value="partial">⏳ Thanh toán 1 phần</option>
                <option value="paid">✅ Đã thanh toán đủ</option>
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
          <button onClick={save} disabled={saveStatus === 'loading'} className="h-9 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50">
            {saveStatus === 'loading'
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang lưu...</>
              : <><Save className="h-4 w-4" /> {isEdit ? 'Lưu thay đổi' : 'Lưu hóa đơn'}</>}
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
            <label className="text-xs font-medium text-gray-600">Tiêu đề hóa đơn</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="VD: Hóa đơn tủ bếp" className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
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
            <label className="text-xs font-medium text-gray-600">Mã số thuế</label>
            <input value={form.customer_tax_code} onChange={e => setForm(f => ({ ...f, customer_tax_code: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-xl border p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-900">Chi tiết hàng hóa / dịch vụ</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowProductPicker(true)} className="h-9 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
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

        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-[1400px] w-full text-xs">
            <thead><tr className="bg-gray-50 text-[9px] text-gray-500 uppercase tracking-wider">
              <th className="py-1.5 px-1 text-left w-9">STT</th>
              <th className="py-1.5 px-1 text-left w-24">Mã HH</th>
              <th className="py-1.5 px-1 text-left min-w-[200px]">Tên hàng hóa</th>
              <th className="py-1.5 px-1 text-center w-14">ĐVT</th>
              <th className="py-1.5 px-1 text-right w-16" title="Ngang (m)">Ngang</th>
              <th className="py-1.5 px-1 text-right w-16" title="Sâu (m)">Sâu</th>
              <th className="py-1.5 px-1 text-right w-16" title="Cao (m)">Cao</th>
              <th className="py-1.5 px-1 text-right w-16" title="Hệ số quy cách">HS QC</th>
              <th className="py-1.5 px-1 text-right w-14">SL</th>
              <th className="py-1.5 px-1 text-right w-28">Đơn giá</th>
              <th className="py-1.5 px-1 text-right w-28">Thành tiền</th>
              <th className="py-1.5 px-1 text-right w-14">CK%</th>
              <th className="py-1.5 px-1 text-right w-14">%VAT</th>
              <th className="py-1.5 px-1 text-right w-24">Tiền thuế</th>
              <th className="py-1.5 px-1 text-right w-28">Tổng tiền</th>
              <th className="py-1.5 px-1 w-8"></th>
            </tr></thead>
            <tbody>
              {(() => { let itemNo = 0; return items.map((item, idx) => {
                if (item.row_type === 'section') return (
                  <tr key={idx} className="bg-indigo-50 border-b border-indigo-200">
                    <td colSpan={15} className="py-1.5 px-2">
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
                );
                const row = calcs.rows[idx] || {};
                itemNo++;
                return (
                  <tr key={idx} className="border-b hover:bg-purple-50/30">
                    <td className="py-1 px-1 text-gray-400">{itemNo}</td>
                    <td className="py-1 px-1"><input value={item.product_code || ''} onChange={e => updateItem(idx, 'product_code', e.target.value)} placeholder="Mã" className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-purple-500 text-xs outline-none bg-transparent" /></td>
                    <td className="py-1 px-1">
                      <ProductAutocompleteCell
                        value={item.name}
                        products={products}
                        onChange={(val) => updateItem(idx, 'name', val)}
                        onSelectProduct={(p) => {
                          setItems(prev => prev.map((it, i) => i === idx ? {
                            ...it,
                            product_id: p.id, name: p.name, description: p.description || it.description,
                            product_code: p.code || it.product_code, unit: p.unit || it.unit,
                            unit_price: p.base_price || it.unit_price,
                            vat_rate: p.vat_rate || it.vat_rate,
                          } : it));
                        }}
                        placeholder="Gõ tên SP..."
                      />
                    </td>
                    <td className="py-1 px-1"><input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-purple-500 text-xs outline-none bg-transparent text-center" /></td>
                    <td className="py-1 px-1"><input type="number" step="any" value={item.length || ''} onChange={e => updateItem(idx, 'length', e.target.value)} placeholder="0" title="Ngang (m)" className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-purple-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1"><input type="number" step="any" value={item.width || ''} onChange={e => updateItem(idx, 'width', e.target.value)} placeholder="0" title="Sâu (m)" className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-purple-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1"><input type="number" step="any" value={item.height || ''} onChange={e => updateItem(idx, 'height', e.target.value)} placeholder="0" title="Cao (m)" className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-purple-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1"><input type="number" step="any" value={item.spec_factor || ''} onChange={e => updateItem(idx, 'spec_factor', e.target.value)} placeholder="0" title="Hệ số quy cách" className={`w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-purple-500 text-xs outline-none bg-transparent text-right ${parseFloat(item.spec_factor) > 0 ? 'text-indigo-700 font-semibold' : ''}`} /></td>
                    <td className="py-1 px-1"><input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-purple-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1"><input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-purple-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1 text-right text-xs font-medium text-gray-900">{formatVND(row.gross_amount || 0)}</td>
                    <td className="py-1 px-1"><input type="number" value={item.discount_percent || 0} onChange={e => updateItem(idx, 'discount_percent', parseFloat(e.target.value) || 0)} className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-purple-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1"><input type="number" value={item.vat_rate || 0} onChange={e => updateItem(idx, 'vat_rate', parseFloat(e.target.value) || 0)} className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-purple-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1 text-right text-xs text-gray-600">{formatVND(row.vat_amount || 0)}</td>
                    <td className="py-1 px-1 text-right text-xs font-bold text-purple-700">{formatVND(row.total || 0)}</td>
                    <td className="py-1 px-1"><button onClick={() => removeItem(idx)} className="p-0.5 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                );
              }); })()}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end mt-4">
          <div className="w-80 space-y-2">
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
              <span className="text-purple-600">{formatVND(calcs.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600">Hạn thanh toán</label>
            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
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
