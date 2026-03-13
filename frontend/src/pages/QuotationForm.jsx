import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND } from '../lib/utils';
import { Plus, Trash2, Save, ArrowLeft, ShoppingCart, Printer } from 'lucide-react';

export default function QuotationForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '', customer_id: '', customer_name: '', customer_phone: '', customer_address: '',
    valid_until: '', payment_terms: 'Thanh toán 50% khi ký hợp đồng, 50% khi bàn giao',
    delivery_terms: '', notes: '',
    discount_type: 'percent', discount_value: 0, tax_rate: 10,
  });
  const [items, setItems] = useState([{ name: '', description: '', unit: 'bộ', quantity: 1, unit_price: 0, discount_percent: 0, dimensions: '', material: '', color: '' }]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/customers', { params: { limit: 500 } }).then(r => setCustomers(r.data.customers || r.data || []));
    api.get('/products', { params: { limit: 500 } }).then(r => setProducts(r.data.products || r.data || []));
    if (isEdit) {
      api.get(`/crm/quotations/${id}`).then(r => {
        const d = r.data;
        setForm({
          title: d.title || '', customer_id: d.customer_id || '', customer_name: d.customer_name || '',
          customer_phone: d.customer_phone || '', customer_address: d.customer_address || '',
          valid_until: d.valid_until || '', payment_terms: d.payment_terms || '', delivery_terms: d.delivery_terms || '',
          notes: d.notes || '', discount_type: d.discount_type || 'percent', discount_value: d.discount_value || 0,
          tax_rate: d.tax_rate ?? 10, lead_id: d.lead_id, project_id: d.project_id,
        });
        if (d.items?.length) setItems(d.items.map(i => ({
          name: i.name, description: i.description || '', unit: i.unit || 'bộ', quantity: i.quantity || 1,
          unit_price: i.unit_price || 0, discount_percent: i.discount_percent || 0,
          dimensions: i.dimensions || '', material: i.material || '', color: i.color || '', product_id: i.product_id,
        })));
      });
    }
  }, [id]);

  // Auto-fill customer info
  const selectCustomer = (cid) => {
    const c = customers.find(x => x.id === cid);
    if (c) setForm(f => ({ ...f, customer_id: cid, customer_name: c.full_name, customer_phone: c.phone || '', customer_address: c.address || '' }));
    else setForm(f => ({ ...f, customer_id: cid }));
  };

  // Add product to items
  const addProduct = (pid) => {
    const p = products.find(x => x.id === pid);
    if (p) setItems(prev => [...prev, { product_id: p.id, name: p.name, description: p.description || '', unit: p.unit || 'bộ', quantity: 1, unit_price: p.base_price || 0, discount_percent: 0, dimensions: p.dimensions || '', material: p.material || '', color: p.color || '' }]);
  };

  // Calculations
  const calcs = useMemo(() => {
    const rows = items.map(i => ({
      ...i,
      amount: (i.quantity || 0) * (i.unit_price || 0) * (1 - (i.discount_percent || 0) / 100),
    }));
    const subtotal = rows.reduce((s, r) => s + r.amount, 0);
    const discountAmt = form.discount_type === 'percent' ? subtotal * (form.discount_value || 0) / 100 : (form.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt = afterDiscount * (form.tax_rate || 0) / 100;
    return { rows, subtotal, discountAmt, afterDiscount, taxAmt, total: afterDiscount + taxAmt };
  }, [items, form.discount_type, form.discount_value, form.tax_rate]);

  const save = async () => {
    if (!form.title && !form.customer_name) return alert('Nhập tiêu đề hoặc khách hàng');
    setSaving(true);
    try {
      const payload = { ...form, items: calcs.rows };
      if (isEdit) await api.put(`/crm/quotations/${id}`, payload);
      else { const { data } = await api.post('/crm/quotations', payload); navigate(`/crm/quotations/${data.id}`, { replace: true }); return; }
      navigate('/crm/quotations');
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  const updateItem = (idx, field, val) => setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const addRow = () => setItems(prev => [...prev, { name: '', description: '', unit: 'bộ', quantity: 1, unit_price: 0, discount_percent: 0, dimensions: '', material: '', color: '' }]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/crm/quotations')} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Sửa báo giá' : 'Tạo báo giá mới'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {isEdit && <button onClick={() => window.print()} className="h-9 px-4 border rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer hover:bg-gray-50 print:hidden"><Printer className="h-4 w-4" /> In PDF</button>}
          <button onClick={save} disabled={saving} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50 print:hidden">
            <Save className="h-4 w-4" /> {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>

      {/* Customer Info - MISA style */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">Thông tin khách hàng</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600">Khách hàng</label>
            <select value={form.customer_id} onChange={e => selectCustomer(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm mt-1">
              <option value="">Chọn hoặc nhập mới</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.full_name} {c.phone ? `- ${c.phone}` : ''}</option>)}
            </select>
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

      {/* Items Table - MISA style */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">Chi tiết hàng hóa / dịch vụ</h2>
          <div className="flex items-center gap-2">
            <select onChange={e => { if (e.target.value) { addProduct(e.target.value); e.target.value = ''; } }} className="h-9 px-3 border rounded-lg text-xs">
              <option value="">+ Thêm từ sản phẩm</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.code ? `${p.code} - ` : ''}{p.name}</option>)}
            </select>
            <button onClick={addRow} className="h-9 px-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer">
              <Plus className="h-3.5 w-3.5" /> Thêm dòng
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase">
              <th className="py-2 px-2 text-left w-8">#</th>
              <th className="py-2 px-2 text-left min-w-[200px]">Tên hàng hóa</th>
              <th className="py-2 px-2 text-left w-20">ĐVT</th>
              <th className="py-2 px-2 text-right w-20">SL</th>
              <th className="py-2 px-2 text-right w-32">Đơn giá</th>
              <th className="py-2 px-2 text-right w-16">CK%</th>
              <th className="py-2 px-2 text-right w-32">Thành tiền</th>
              <th className="py-2 px-2 w-10"></th>
            </tr></thead>
            <tbody>
              {items.map((item, idx) => {
                const amount = (item.quantity || 0) * (item.unit_price || 0) * (1 - (item.discount_percent || 0) / 100);
                return (
                  <tr key={idx} className="border-b hover:bg-blue-50/30">
                    <td className="py-2 px-2 text-gray-400">{idx + 1}</td>
                    <td className="py-2 px-2">
                      <input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} placeholder="Tên sản phẩm / dịch vụ" className="w-full px-2 py-1 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-sm outline-none bg-transparent" />
                      {(item.dimensions || item.material) && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{[item.dimensions, item.material, item.color].filter(Boolean).join(' · ')}</p>
                      )}
                    </td>
                    <td className="py-2 px-2"><input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} className="w-full px-2 py-1 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-sm outline-none bg-transparent text-center" /></td>
                    <td className="py-2 px-2"><input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-sm outline-none bg-transparent text-right" /></td>
                    <td className="py-2 px-2"><input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-sm outline-none bg-transparent text-right" /></td>
                    <td className="py-2 px-2"><input type="number" value={item.discount_percent} onChange={e => updateItem(idx, 'discount_percent', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-sm outline-none bg-transparent text-right" /></td>
                    <td className="py-2 px-2 text-right font-medium text-gray-900">{formatVND(amount)}</td>
                    <td className="py-2 px-2"><button onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals - MISA style */}
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
            <div className="flex items-center justify-between text-sm gap-2">
              <span className="text-gray-500">VAT:</span>
              <div className="flex items-center gap-1">
                <input type="number" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: parseFloat(e.target.value) || 0 }))} className="w-14 h-7 px-2 border rounded text-xs text-right" />
                <span className="text-xs">%</span>
              </div>
              <span className="font-medium">{formatVND(calcs.taxAmt)}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t pt-2 mt-2">
              <span>TỔNG CỘNG:</span>
              <span className="text-blue-600">{formatVND(calcs.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Terms */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">Điều khoản</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600">Hiệu lực đến</label>
            <input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Điều khoản thanh toán</label>
            <input value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">Ghi chú</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
          </div>
        </div>
      </div>
    </div>
  );
}
