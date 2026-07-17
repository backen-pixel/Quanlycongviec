import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { formatVND } from '../lib/utils';
import { ArrowLeft, Plus, Trash2, Save, Send, Search, Package } from 'lucide-react';

export default function PurchaseOrderForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [productQ, setProductQ] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [form, setForm] = useState({
    lead_id: searchParams.get('lead_id') || '',
    title: '',
    notes: '',
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    supplier_id: '',
    order_date: new Date().toISOString().slice(0, 10),
    expected_date: '',
    tax_rate: 10,
    items: [],
  });

  useEffect(() => {
    api.get('/purchasing/suppliers').then((r) => setSuppliers(r.data || [])).catch(() => {});
    api.get('/purchasing/products').then((r) => setProducts(r.data || [])).catch(() => {});

    if (isEdit) {
      api.get(`/purchasing/orders/${id}`)
        .then((r) => {
          const o = r.data;
          setForm({
            lead_id: o.lead_id || '',
            title: o.title || '',
            notes: o.notes || '',
            customer_name: o.customer_name || '',
            customer_phone: o.customer_phone || '',
            customer_address: o.customer_address || '',
            supplier_id: o.supplier_id || '',
            order_date: o.order_date || '',
            expected_date: o.expected_date || '',
            tax_rate: o.tax_rate ?? 10,
            items: (o.items || []).map((it) => ({
              product_id: it.product_id,
              name: it.name,
              description: it.description,
              unit: it.unit,
              quantity: it.quantity,
              unit_price: it.unit_price,
              amount: it.amount,
              brand_name: it.brand_name,
              sku: it.sku,
              image_url: it.image_url,
              notes: it.notes,
            })),
          });
        })
        .catch(() => alert('Không tải được lệnh'))
        .finally(() => setLoading(false));
    } else if (searchParams.get('lead_id')) {
      api.get(`/crm/leads/${searchParams.get('lead_id')}/detail`)
        .then((r) => {
          const lead = r.data?.lead || r.data;
          if (!lead) return;
          setForm((f) => ({
            ...f,
            customer_name: lead.name || lead.customer?.full_name || lead.customer_name || f.customer_name,
            customer_phone: lead.phone || lead.customer?.phone || f.customer_phone,
            customer_address: lead.address || lead.customer?.address || f.customer_address,
            title: `LDH — ${lead.name || lead.title || lead.code || ''}`.trim(),
          }));
        })
        .catch(() => {});
    }
  }, [id, isEdit, searchParams]);

  const subtotal = form.items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  const taxAmount = Math.round(subtotal * (Number(form.tax_rate) || 0)) / 100;
  const total = subtotal + taxAmount;

  const addProduct = (p) => {
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        {
          product_id: p.id,
          name: p.name,
          description: p.description || '',
          unit: p.unit || 'cái',
          quantity: 1,
          unit_price: Number(p.cost_price) || Number(p.selling_price) || 0,
          amount: Number(p.cost_price) || Number(p.selling_price) || 0,
          brand_name: p.brand?.name || null,
          sku: p.sku || p.code || null,
          image_url: p.image_url || null,
          notes: '',
        },
      ],
    }));
    setShowPicker(false);
    setProductQ('');
  };

  const updateItem = (idx, patch) => {
    setForm((f) => {
      const items = [...f.items];
      const next = { ...items[idx], ...patch };
      next.amount = Math.round((Number(next.quantity) || 0) * (Number(next.unit_price) || 0) * 100) / 100;
      items[idx] = next;
      return { ...f, items };
    });
  };

  const removeItem = (idx) => {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const save = async (andSubmit = false) => {
    if (!form.items.length) return alert('Thêm ít nhất 1 dòng hàng');
    setSaving(true);
    try {
      const payload = {
        ...form,
        lead_id: form.lead_id || null,
        supplier_id: form.supplier_id || null,
        expected_date: form.expected_date || null,
        items: form.items.map((it, i) => ({ ...it, item_order: i })),
      };
      let orderId = id;
      if (isEdit) {
        await api.put(`/purchasing/orders/${id}`, payload);
      } else {
        const { data } = await api.post('/purchasing/orders', payload);
        orderId = data.id;
      }
      if (andSubmit) {
        await api.post(`/purchasing/orders/${orderId}/submit`);
      }
      navigate(`/mua-hang/orders/${orderId}`);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu');
    }
    setSaving(false);
  };

  const filteredProducts = products.filter((p) => {
    if (!productQ.trim()) return true;
    const s = productQ.toLowerCase();
    return (p.name || '').toLowerCase().includes(s)
      || (p.code || '').toLowerCase().includes(s)
      || (p.sku || '').toLowerCase().includes(s);
  }).slice(0, 30);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-orange-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Sửa lệnh đặt hàng' : 'Tạo lệnh đặt hàng'}</h1>
          <p className="text-xs text-gray-500">Gắn deal CRM · chọn SP từ catalog mua hàng</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">Tiêu đề</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Khách hàng</label>
            <input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Điện thoại</label>
            <input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">Địa chỉ</label>
            <input value={form.customer_address} onChange={(e) => setForm({ ...form, customer_address: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Nhà cung cấp</label>
            <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1">
              <option value="">— Chọn NCC —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Ngày đặt</label>
              <input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Dự kiến nhận</label>
              <input type="date" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Dòng hàng</h2>
          <button type="button" onClick={() => setShowPicker(true)} className="h-8 px-3 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg text-sm flex items-center gap-1.5 cursor-pointer">
            <Plus className="h-4 w-4" /> Thêm từ catalog
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500 uppercase">
              <th className="py-2 pr-2">SP</th>
              <th className="py-2 w-20">SL</th>
              <th className="py-2 w-28">Đơn giá</th>
              <th className="py-2 w-28 text-right">Thành tiền</th>
              <th className="py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {form.items.map((it, idx) => (
              <tr key={idx} className="border-b">
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    {it.image_url
                      ? <img src={it.image_url} alt="" className="h-9 w-9 rounded object-contain bg-gray-50 border" />
                      : <div className="h-9 w-9 rounded bg-gray-100 flex items-center justify-center"><Package className="h-4 w-4 text-gray-400" /></div>}
                    <div className="min-w-0">
                      <input value={it.name} onChange={(e) => updateItem(idx, { name: e.target.value })} className="w-full font-medium text-sm border-0 border-b border-transparent focus:border-orange-300 outline-none" />
                      <div className="text-[10px] text-gray-400">{[it.brand_name, it.sku].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2">
                  <input type="number" min="0" step="0.01" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} className="w-full h-8 px-2 border rounded text-sm" />
                </td>
                <td className="py-2">
                  <input type="number" min="0" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: e.target.value })} className="w-full h-8 px-2 border rounded text-sm" />
                </td>
                <td className="py-2 text-right font-medium">{formatVND(it.amount || 0)}</td>
                <td className="py-2">
                  <button type="button" onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {form.items.length === 0 && <p className="text-center text-sm text-gray-400 py-6">Chưa có dòng hàng</p>}
        <div className="mt-4 flex flex-col items-end gap-1 text-sm">
          <div className="flex gap-6"><span className="text-gray-500">Tạm tính</span><span className="font-medium w-32 text-right">{formatVND(subtotal)}</span></div>
          <div className="flex gap-6 items-center">
            <span className="text-gray-500">VAT</span>
            <input type="number" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} className="w-14 h-7 px-1 border rounded text-xs text-right" />
            <span className="text-xs text-gray-400">%</span>
            <span className="font-medium w-32 text-right">{formatVND(taxAmount)}</span>
          </div>
          <div className="flex gap-6 text-base font-bold"><span>Tổng</span><span className="w-32 text-right text-orange-600">{formatVND(total)}</span></div>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600">Ghi chú</label>
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" rows={2} />
      </div>

      <div className="flex justify-end gap-2 pb-8">
        <button type="button" onClick={() => navigate(-1)} className="h-10 px-4 border rounded-lg text-sm cursor-pointer">Hủy</button>
        <button type="button" disabled={saving} onClick={() => save(false)} className="h-10 px-4 border border-orange-300 text-orange-700 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50">
          <Save className="h-4 w-4" /> Lưu nháp
        </button>
        <button type="button" disabled={saving} onClick={() => save(true)} className="h-10 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50">
          <Send className="h-4 w-4" /> Lưu & gửi Mua hàng
        </button>
      </div>

      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                autoFocus
                value={productQ}
                onChange={(e) => setProductQ(e.target.value)}
                placeholder="Tìm sản phẩm..."
                className="flex-1 outline-none text-sm"
              />
              <button type="button" onClick={() => setShowPicker(false)} className="text-sm text-gray-500 cursor-pointer">Đóng</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-orange-50 text-left cursor-pointer border-b"
                >
                  {p.image_url
                    ? <img src={p.image_url} alt="" className="h-10 w-10 rounded object-contain bg-gray-50" />
                    : <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center"><Package className="h-4 w-4 text-gray-400" /></div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-gray-400">{p.brand?.name} · {p.code}</div>
                  </div>
                  <div className="text-sm font-semibold">{formatVND(p.cost_price || p.selling_price || 0)}</div>
                </button>
              ))}
              {filteredProducts.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Không tìm thấy SP</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
