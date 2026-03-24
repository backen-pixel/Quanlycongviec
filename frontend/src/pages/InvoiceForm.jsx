import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND } from '../lib/utils';
import { Plus, Trash2, Save, ArrowLeft, Search, Receipt } from 'lucide-react';
import ProductSearchPicker from '../components/ProductSearchPicker';
import ProductAutocompleteCell from '../components/ProductAutocompleteCell';

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
    discount_percent: 0, vat_rate: 0,
  }]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);

  useEffect(() => {
    api.get('/customers', { params: { limit: 500 } }).then(r => setCustomers(r.data.customers || r.data || []));
    api.get('/products', { params: { limit: 500 } }).then(r => setProducts(r.data.products || r.data || []));
  }, []);

  const selectCustomer = (cid) => {
    const c = customers.find(x => x.id === cid);
    if (c) setForm(f => ({ ...f, customer_id: cid, customer_name: c.full_name, customer_phone: c.phone || '', customer_address: c.address || '', customer_tax_code: c.tax_code || '' }));
    else setForm(f => ({ ...f, customer_id: cid }));
  };

  const addProductToItems = (p) => {
    setItems(prev => [...prev, {
      product_id: p.id, name: p.name, description: p.description || '',
      product_code: p.code || '', unit: p.unit || 'bộ',
      quantity: 1, unit_price: p.base_price || 0, discount_percent: 0,
      vat_rate: p.vat_rate || 0,
    }]);
  };

  const calcs = useMemo(() => {
    const rows = items.map(i => {
      const grossAmount = (i.quantity || 0) * (i.unit_price || 0);
      const discountAmount = grossAmount * (i.discount_percent || 0) / 100;
      const amount = grossAmount - discountAmount;
      const vatRate = i.vat_rate || 0;
      const vatAmount = amount * vatRate / 100;
      const total = amount + vatAmount;
      return { ...i, amount, discount_amount: discountAmount, vat_rate: vatRate, vat_amount: vatAmount, total };
    });
    const subtotal = rows.reduce((s, r) => s + r.amount, 0);
    const discountAmt = form.discount_type === 'percent' ? subtotal * (form.discount_value || 0) / 100 : (form.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const totalVat = rows.reduce((s, r) => s + r.vat_amount, 0);
    return { rows, subtotal, discountAmt, afterDiscount, totalVat, total: afterDiscount + totalVat };
  }, [items, form.discount_type, form.discount_value]);

  const save = async () => {
    if (!form.title && !form.customer_name) return alert('Nhập tiêu đề hoặc khách hàng');
    if (items.every(i => !i.name)) return alert('Thêm ít nhất 1 sản phẩm');
    setSaving(true);
    try {
      // Build invoice payload
      const payload = {
        ...form,
        subtotal: calcs.subtotal,
        discount_amount: calcs.discountAmt,
        tax_amount: calcs.totalVat,
        total: calcs.total,
      };
      // Create invoice via backend
      const { data } = await api.post('/crm/invoices', payload);
      // Insert items
      if (calcs.rows.length) {
        await api.post(`/crm/invoices/${data.id}/items`, { items: calcs.rows });
      }
      navigate(`/crm/invoices/${data.id}`);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  const updateItem = (idx, field, val) => setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const addRow = () => setItems(prev => [...prev, { name: '', description: '', unit: 'bộ', quantity: 1, unit_price: 0, discount_percent: 0, vat_rate: 0 }]);

  return (
    <div className="space-y-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/crm/invoices')} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-purple-600" />
              Tạo hóa đơn mới
            </h1>
          </div>
        </div>
        <button onClick={save} disabled={saving} className="h-9 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? 'Đang lưu...' : 'Lưu hóa đơn'}
        </button>
      </div>

      {/* Customer Info */}
      <div className="bg-white rounded-xl border p-4">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Thông tin khách hàng</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600">Khách hàng</label>
            <select value={form.customer_id} onChange={e => selectCustomer(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm mt-1">
              <option value="">Chọn hoặc nhập mới</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.full_name} {c.phone ? `- ${c.phone}` : ''}</option>)}
            </select>
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

      {/* Items Table with Product Search */}
      <div className="bg-white rounded-xl border p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-900">Chi tiết hàng hóa / dịch vụ</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowProductPicker(true)} className="h-9 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
              <Search className="h-3.5 w-3.5" /> Tìm & thêm sản phẩm
            </button>
            <button onClick={addRow} className="h-9 px-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer">
              <Plus className="h-3.5 w-3.5" /> Thêm dòng trống
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-[900px] w-full text-xs">
            <thead><tr className="bg-gray-50 text-[9px] text-gray-500 uppercase tracking-wider">
              <th className="py-1.5 px-1 text-left w-9">STT</th>
              <th className="py-1.5 px-1 text-left w-24">Mã HH</th>
              <th className="py-1.5 px-1 text-left min-w-[200px]">Tên hàng hóa</th>
              <th className="py-1.5 px-1 text-center w-14">ĐVT</th>
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
              {items.map((item, idx) => {
                const row = calcs.rows[idx] || {};
                return (
                  <tr key={idx} className="border-b hover:bg-purple-50/30">
                    <td className="py-1 px-1 text-gray-400">{idx + 1}</td>
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
                    <td className="py-1 px-1"><input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-purple-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1"><input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-purple-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1 text-right text-xs font-medium text-gray-900">{formatVND(row.amount || 0)}</td>
                    <td className="py-1 px-1"><input type="number" value={item.discount_percent || 0} onChange={e => updateItem(idx, 'discount_percent', parseFloat(e.target.value) || 0)} className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-purple-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1"><input type="number" value={item.vat_rate || 0} onChange={e => updateItem(idx, 'vat_rate', parseFloat(e.target.value) || 0)} className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-purple-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1 px-1 text-right text-xs text-gray-600">{formatVND(row.vat_amount || 0)}</td>
                    <td className="py-1 px-1 text-right text-xs font-bold text-purple-700">{formatVND(row.total || 0)}</td>
                    <td className="py-1 px-1"><button onClick={() => removeItem(idx)} className="p-0.5 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                );
              })}
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
