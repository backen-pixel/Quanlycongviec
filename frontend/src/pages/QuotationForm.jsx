import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { formatVND } from '../lib/utils';
import { Plus, Trash2, Save, ArrowLeft, ShoppingCart, Printer, Download } from 'lucide-react';

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

  const todayISO = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    title: '', customer_id: '', customer_name: '', customer_phone: '', customer_address: '',
    valid_until: todayISO, payment_terms: 'Thanh toán 50% khi ký HĐ, 50% khi bàn giao',
    delivery_terms: '', notes: '', lead_id: '',
    discount_type: 'percent', discount_value: 0,
  });
  const [customPaymentTerms, setCustomPaymentTerms] = useState('');
  const [isCustomPayment, setIsCustomPayment] = useState(false);
  const [items, setItems] = useState([{
    name: '', description: '', product_code: '', unit: 'bộ', quantity: 1, unit_price: 0,
    discount_percent: 0, vat_rate: 0, height: '', width: '', length: '', weight: '',
    dimensions: '', material: '', color: '', promo_code: '', is_promo: false,
  }]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/customers', { params: { limit: 500 } }).then(r => setCustomers(r.data.customers || r.data || []));
    api.get('/products', { params: { limit: 500 } }).then(r => setProducts(r.data.products || r.data || []));
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
          lead_id: d.lead_id, project_id: d.project_id,
        });
        if (!isPreset && pt) { setIsCustomPayment(true); setCustomPaymentTerms(pt); }
        if (d.items?.length) setItems(d.items.map(i => ({
          name: i.name, description: i.description || '', product_code: i.product_code || '',
          unit: i.unit || 'bộ', quantity: i.quantity || 1,
          unit_price: i.unit_price || 0, discount_percent: i.discount_percent || 0,
          vat_rate: i.vat_rate || 0,
          height: i.height || '', width: i.width || '', length: i.length || '', weight: i.weight || '',
          dimensions: i.dimensions || '', material: i.material || '', color: i.color || '',
          product_id: i.product_id, promo_code: i.promo_code || '', is_promo: i.is_promo || false,
        })));
      });
    } else {
      // Auto-fill from lead/deal if lead_id in URL
      const leadId = searchParams.get('lead_id');
      if (leadId) {
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
          }));
        }).catch(() => { /* lead not found, ignore */ });
      }
    }
  }, [id]);

  // Auto-fill customer info
  const selectCustomer = (cid) => {
    const c = customers.find(x => x.id === cid);
    if (c) setForm(f => ({ ...f, customer_id: cid, customer_name: c.full_name, customer_phone: c.phone || '', customer_address: c.address || '' }));
    else setForm(f => ({ ...f, customer_id: cid }));
  };

  // Add product to items — auto-fill vat_rate from product
  const addProduct = (pid) => {
    const p = products.find(x => x.id === pid);
    if (p) setItems(prev => [...prev, {
      product_id: p.id, name: p.name, description: p.description || '',
      product_code: p.code || '', unit: p.unit || 'bộ',
      quantity: 1, unit_price: p.base_price || 0, discount_percent: 0,
      vat_rate: p.vat_rate || 0,
      height: '', width: '', length: '', weight: '',
      dimensions: p.dimensions || '', material: p.material || '', color: p.color || '',
      promo_code: '', is_promo: false,
    }]);
  };

  // Calculations with per-item VAT
  const calcs = useMemo(() => {
    const rows = items.map(i => {
      const grossAmount = (i.quantity || 0) * (i.unit_price || 0);
      const discountAmount = grossAmount * (i.discount_percent || 0) / 100;
      const amount = grossAmount - discountAmount;
      const vatRate = i.vat_rate || 0;
      const vatAmount = amount * vatRate / 100;
      const total = amount + vatAmount;
      return { ...i, amount, discount_amount: discountAmount, vat_rate: vatRate, vat_amount: vatAmount, tax_amount: vatAmount, total };
    });
    const subtotal = rows.reduce((s, r) => s + r.amount, 0);
    const discountAmt = form.discount_type === 'percent' ? subtotal * (form.discount_value || 0) / 100 : (form.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const totalVat = rows.reduce((s, r) => s + r.vat_amount, 0);
    return { rows, subtotal, discountAmt, afterDiscount, totalVat, total: afterDiscount + totalVat };
  }, [items, form.discount_type, form.discount_value]);

  const save = async () => {
    if (!form.title && !form.customer_name) return alert('Nhập tiêu đề hoặc khách hàng');
    setSaving(true);
    try {
      const effectivePayment = isCustomPayment ? customPaymentTerms : form.payment_terms;
      const payload = { ...form, payment_terms: effectivePayment, items: calcs.rows };
      if (isEdit) await api.put(`/crm/quotations/${id}`, payload);
      else { const { data } = await api.post('/crm/quotations', payload); navigate(`/crm/quotations/${data.id}`, { replace: true }); return; }
      navigate('/crm/quotations');
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  const updateStatus = async (newStatus) => {
    try {
      const { data } = await api.put(`/crm/quotations/${id}`, { status: newStatus });
      setForm(f => ({ ...f, status: newStatus }));
      // Auto-flow: BG chấp nhận → tự tạo ĐH + Project
      if (data.auto?.order) {
        const msg = data.auto.autoProject
          ? `🚀 Tự động:\n• Tạo đơn hàng ${data.auto.order.code}\n• Tạo dự án ${data.auto.autoProject.code}\n• Gen tasks tự động`
          : `🚀 Tự động tạo đơn hàng ${data.auto.order.code}`;
        alert(msg);
      }
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const downloadPdf = async () => {
    try {
      const response = await api.get(`/crm/quotations/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.code || 'bao-gia'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) { alert('Lỗi tải PDF'); }
  };

  const updateItem = (idx, field, val) => setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const addRow = () => setItems(prev => [...prev, { name: '', description: '', unit: 'bộ', quantity: 1, unit_price: 0, discount_percent: 0, vat_rate: 0, dimensions: '', material: '', color: '' }]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/crm/quotations')} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Sửa báo giá' : 'Tạo báo giá mới'}</h1>
            {isEdit && form.code && <p className="text-xs text-blue-600 font-bold">{form.code}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2" data-print-hide>
          {isEdit && (
            <select value={form.status || 'draft'} onChange={e => updateStatus(e.target.value)}
              className={`h-9 px-3 rounded-lg text-sm font-medium border-2 cursor-pointer ${
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
          )}
          {isEdit && <button onClick={downloadPdf} className="h-9 px-4 border rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer hover:bg-gray-50"><Download className="h-4 w-4" /> Xuất PDF</button>}
          <button onClick={save} disabled={saving} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50">
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

      {/* Items Table - MISA style with per-item VAT */}
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
            <thead><tr className="bg-gray-50 text-[10px] text-gray-500 uppercase">
              <th className="py-2 px-1 text-left w-8">STT</th>
              <th className="py-2 px-1 text-left w-20">Mã HH</th>
              <th className="py-2 px-1 text-left min-w-[160px]">Tên hàng hóa</th>
              <th className="py-2 px-1 text-left min-w-[120px]">Diễn giải</th>
              <th className="py-2 px-1 text-center w-12">ĐVT</th>
              <th className="py-2 px-1 text-right w-14">Cao</th>
              <th className="py-2 px-1 text-right w-14">Rộng</th>
              <th className="py-2 px-1 text-right w-14">Dài</th>
              <th className="py-2 px-1 text-right w-14">TL(kg)</th>
              <th className="py-2 px-1 text-right w-12">SL</th>
              <th className="py-2 px-1 text-right w-24">Đơn giá</th>
              <th className="py-2 px-1 text-right w-24">Thành tiền</th>
              <th className="py-2 px-1 text-right w-12">CK%</th>
              <th className="py-2 px-1 text-right w-20">Tiền CK</th>
              <th className="py-2 px-1 text-right w-12">%VAT</th>
              <th className="py-2 px-1 text-right w-20">Tiền thuế</th>
              <th className="py-2 px-1 text-right w-24">Tổng tiền</th>
              <th className="py-2 px-1 text-left w-16">CTKM</th>
              <th className="py-2 px-1 text-center w-10">KM</th>
              <th className="py-2 px-1 w-8"></th>
            </tr></thead>
            <tbody>
              {items.map((item, idx) => {
                const row = calcs.rows[idx] || {};
                return (
                  <tr key={idx} className="border-b hover:bg-blue-50/30">
                    <td className="py-1.5 px-1 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="py-1.5 px-1"><input value={item.product_code || ''} onChange={e => updateItem(idx, 'product_code', e.target.value)} placeholder="Mã" className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-xs outline-none bg-transparent" /></td>
                    <td className="py-1.5 px-1"><input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} placeholder="Tên sản phẩm" className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-xs outline-none bg-transparent" /></td>
                    <td className="py-1.5 px-1"><input value={item.description || ''} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Mô tả" className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-xs outline-none bg-transparent" /></td>
                    <td className="py-1.5 px-1"><input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-xs outline-none bg-transparent text-center" /></td>
                    <td className="py-1.5 px-1"><input type="number" value={item.height || ''} onChange={e => updateItem(idx, 'height', e.target.value)} placeholder="0" className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1.5 px-1"><input type="number" value={item.width || ''} onChange={e => updateItem(idx, 'width', e.target.value)} placeholder="0" className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1.5 px-1"><input type="number" value={item.length || ''} onChange={e => updateItem(idx, 'length', e.target.value)} placeholder="0" className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1.5 px-1"><input type="number" value={item.weight || ''} onChange={e => updateItem(idx, 'weight', e.target.value)} placeholder="0" className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1.5 px-1"><input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1.5 px-1"><input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1.5 px-1 text-right text-xs font-medium text-gray-900">{formatVND(row.amount || 0)}</td>
                    <td className="py-1.5 px-1"><input type="number" value={item.discount_percent || 0} onChange={e => updateItem(idx, 'discount_percent', parseFloat(e.target.value) || 0)} className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1.5 px-1 text-right text-xs text-orange-600">{formatVND(row.discount_amount || 0)}</td>
                    <td className="py-1.5 px-1"><input type="number" value={item.vat_rate || 0} onChange={e => updateItem(idx, 'vat_rate', parseFloat(e.target.value) || 0)} className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-xs outline-none bg-transparent text-right" /></td>
                    <td className="py-1.5 px-1 text-right text-xs text-gray-600">{formatVND(row.tax_amount || 0)}</td>
                    <td className="py-1.5 px-1 text-right text-xs font-bold text-blue-700">{formatVND(row.total || 0)}</td>
                    <td className="py-1.5 px-1"><input value={item.promo_code || ''} onChange={e => updateItem(idx, 'promo_code', e.target.value)} placeholder="" className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-xs outline-none bg-transparent" /></td>
                    <td className="py-1.5 px-1 text-center"><input type="checkbox" checked={item.is_promo || false} onChange={e => updateItem(idx, 'is_promo', e.target.checked)} className="h-3.5 w-3.5 rounded cursor-pointer" /></td>
                    <td className="py-1.5 px-1"><button onClick={() => removeItem(idx)} className="p-0.5 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals - per-item VAT style */}
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
            <div className="flex justify-between text-sm"><span className="text-gray-500">Cộng tiền hàng sau CK:</span><span className="font-medium">{formatVND(calcs.afterDiscount)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Thuế GTGT:</span><span className="font-medium">{formatVND(calcs.totalVat)}</span></div>
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
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">Ghi chú</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
          </div>
        </div>
      </div>
    </div>
  );
}
