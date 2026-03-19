import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Save, ArrowLeft, Building2, Phone, Globe, CreditCard, FileText } from 'lucide-react';

export default function PDFSettingsPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', addresses: ['', ''], website: '', hotline: '', contacts: [''],
    taxCode: '', bankAccount: '', bankName: '',
    greeting: '', quotationTitle: '', orderTitle: '', invoiceTitle: '',
    warrantyText: '', signatureLeft: '', signatureRight: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/settings/company').then(r => {
      setForm(f => ({ ...f, ...r.data }));
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/settings/company', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  const updateAddr = (idx, val) => {
    const arr = [...(form.addresses || [])];
    arr[idx] = val;
    setForm(f => ({ ...f, addresses: arr }));
  };
  const addAddr = () => setForm(f => ({ ...f, addresses: [...(f.addresses || []), ''] }));
  const removeAddr = (idx) => setForm(f => ({ ...f, addresses: (f.addresses || []).filter((_, i) => i !== idx) }));

  const updateContact = (idx, val) => {
    const arr = [...(form.contacts || [])];
    arr[idx] = val;
    setForm(f => ({ ...f, contacts: arr }));
  };
  const addContact = () => setForm(f => ({ ...f, contacts: [...(f.contacts || []), ''] }));
  const removeContact = (idx) => setForm(f => ({ ...f, contacts: (f.contacts || []).filter((_, i) => i !== idx) }));

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cài đặt thông tin PDF</h1>
            <p className="text-xs text-gray-500">Thông tin hiển thị trên báo giá, đơn hàng, hóa đơn</p>
          </div>
        </div>
        <button onClick={save} disabled={saving} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? 'Đang lưu...' : saved ? '✅ Đã lưu!' : 'Lưu'}
        </button>
      </div>

      {/* Company Info */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2"><Building2 className="h-5 w-5 text-blue-600" /> Thông tin công ty</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600">Tên công ty</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Công Ty TNHH..." className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Địa chỉ (nhiều dòng)</label>
            {(form.addresses || []).map((addr, i) => (
              <div key={i} className="flex items-center gap-2 mt-1">
                <input value={addr} onChange={e => updateAddr(i, e.target.value)} placeholder={`Địa chỉ ${i + 1}`} className="flex-1 h-10 px-3 border rounded-lg text-sm" />
                {(form.addresses || []).length > 1 && (
                  <button onClick={() => removeAddr(i)} className="text-xs text-red-500 cursor-pointer">Xóa</button>
                )}
              </div>
            ))}
            <button onClick={addAddr} className="text-xs text-blue-600 mt-1 cursor-pointer">+ Thêm địa chỉ</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Website</label>
              <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="http://..." className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Hotline</label>
              <input value={form.hotline} onChange={e => setForm(f => ({ ...f, hotline: e.target.value }))} placeholder="0901..." className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Liên hệ (tên: SĐT)</label>
            {(form.contacts || []).map((c, i) => (
              <div key={i} className="flex items-center gap-2 mt-1">
                <input value={c} onChange={e => updateContact(i, e.target.value)} placeholder="Nguyễn Văn A: 0901234567" className="flex-1 h-10 px-3 border rounded-lg text-sm" />
                {(form.contacts || []).length > 1 && (
                  <button onClick={() => removeContact(i)} className="text-xs text-red-500 cursor-pointer">Xóa</button>
                )}
              </div>
            ))}
            <button onClick={addContact} className="text-xs text-blue-600 mt-1 cursor-pointer">+ Thêm liên hệ</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Mã số thuế</label>
              <input value={form.taxCode} onChange={e => setForm(f => ({ ...f, taxCode: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Ngân hàng</label>
              <input value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} placeholder="Vietcombank..." className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Số tài khoản ngân hàng</label>
            <input value={form.bankAccount} onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
        </div>
      </div>

      {/* PDF Content */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2"><FileText className="h-5 w-5 text-purple-600" /> Nội dung PDF</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600">Lời chào (sau tên công ty)</label>
            <textarea value={form.greeting} onChange={e => setForm(f => ({ ...f, greeting: e.target.value }))} rows={2} placeholder="xin chân thành cảm ơn quý khách..." className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Tiêu đề Báo giá</label>
              <input value={form.quotationTitle} onChange={e => setForm(f => ({ ...f, quotationTitle: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Tiêu đề Đơn hàng</label>
              <input value={form.orderTitle} onChange={e => setForm(f => ({ ...f, orderTitle: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Tiêu đề Hóa đơn</label>
              <input value={form.invoiceTitle} onChange={e => setForm(f => ({ ...f, invoiceTitle: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Bảo hành</label>
            <input value={form.warrantyText} onChange={e => setForm(f => ({ ...f, warrantyText: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Chữ ký bên trái</label>
              <input value={form.signatureLeft} onChange={e => setForm(f => ({ ...f, signatureLeft: e.target.value }))} placeholder="Đại diện khách hàng" className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Chữ ký bên phải</label>
              <input value={form.signatureRight} onChange={e => setForm(f => ({ ...f, signatureRight: e.target.value }))} placeholder="Đại diện công ty" className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
