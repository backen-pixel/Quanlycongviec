import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Award, Plus, Pencil, Trash2, X, Save } from 'lucide-react';

export default function PurchasingBrandsPage() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', notes: '', logo_url: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/purchasing/brands');
      setBrands(data || []);
    } catch {
      setBrands([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', code: '', notes: '', logo_url: '' });
    setShowForm(true);
  };

  const openEdit = (b) => {
    setEditing(b);
    setForm({
      name: b.name || '',
      code: b.code || '',
      notes: b.notes || '',
      logo_url: b.logo_url || '',
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) return alert('Nhập tên thương hiệu');
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/purchasing/brands/${editing.id}`, form);
      } else {
        await api.post('/purchasing/brands', form);
      }
      setShowForm(false);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu');
    }
    setSaving(false);
  };

  const remove = async (b) => {
    if (!confirm(`Ẩn thương hiệu «${b.name}»?`)) return;
    try {
      await api.delete(`/purchasing/brands/${b.id}`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-orange-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Award className="h-6 w-6 text-orange-600" /> Thương hiệu
          </h1>
          <p className="text-sm text-gray-500 mt-1">{brands.length} thương hiệu · catalog Häfele FF Storage Solutions</p>
        </div>
        <button type="button" onClick={openCreate} className="h-9 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
          <Plus className="h-4 w-4" /> Thêm thương hiệu
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-600 uppercase bg-gray-50">
              <th className="py-3 px-4">Logo</th>
              <th className="py-3 px-4">Tên</th>
              <th className="py-3 px-4">Mã</th>
              <th className="py-3 px-4">Ghi chú</th>
              <th className="py-3 px-4 w-24" />
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.id} className="border-b hover:bg-orange-50/40">
                <td className="py-3 px-4">
                  {b.logo_url
                    ? <img src={b.logo_url} alt="" className="h-8 w-8 object-contain rounded" />
                    : <div className="h-8 w-8 rounded bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold">{(b.name || '?')[0]}</div>}
                </td>
                <td className="py-3 px-4 font-medium">{b.name}</td>
                <td className="py-3 px-4 text-gray-500 font-mono text-xs">{b.code || '—'}</td>
                <td className="py-3 px-4 text-gray-500 text-xs max-w-xs truncate">{b.notes || '—'}</td>
                <td className="py-3 px-4">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => openEdit(b)} className="p-1.5 text-gray-400 hover:text-orange-600 rounded cursor-pointer"><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => remove(b)} className="p-1.5 text-gray-400 hover:text-red-600 rounded cursor-pointer"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {brands.length === 0 && <p className="text-center text-sm text-gray-400 py-10">Chưa có thương hiệu</p>}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">{editing ? 'Sửa thương hiệu' : 'Thêm thương hiệu'}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tên *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm" placeholder="Häfele" />
            <label className="block text-xs font-medium text-gray-600 mb-1">Mã</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm" placeholder="HAFELE" />
            <label className="block text-xs font-medium text-gray-600 mb-1">Logo URL</label>
            <input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm" placeholder="https://..." />
            <label className="block text-xs font-medium text-gray-600 mb-1">Ghi chú</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="h-9 px-4 border rounded-lg text-sm cursor-pointer">Hủy</button>
              <button type="button" onClick={save} disabled={saving} className="h-9 px-4 bg-orange-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50">
                <Save className="h-4 w-4" /> {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
