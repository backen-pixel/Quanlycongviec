import { useState, useEffect } from 'react';
import api from '../lib/api';
import { formatVND } from '../lib/utils';
import { Package, Search, Plus, Edit3, X, Save, Boxes } from 'lucide-react';

const GROUPS = ['Tủ bếp', 'Phụ kiện', 'Bàn đá', 'Thiết bị', 'Vật liệu', 'Khác'];
const UNITS = ['bộ', 'cái', 'mét', 'm²', 'tấm', 'kg', 'chiếc', 'hộp'];

export default function CRMProductsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { load(); }, []);
  const load = async () => { setLoading(true); const { data } = await api.get('/crm/products-list'); setProducts(data || []); setLoading(false); };

  const filtered = products.filter(p => {
    if (groupFilter && p.group !== groupFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (p.name || '').toLowerCase().includes(s) || (p.code || '').toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s);
  });

  const groups = [...new Set(products.map(p => p.group).filter(Boolean))];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Package className="h-6 w-6 text-blue-600" /> Sản phẩm CRM</h1><p className="text-sm text-gray-500 mt-1">{products.length} sản phẩm</p></div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer"><Plus className="h-4 w-4" /> Thêm SP</button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên, mã SP..." className="w-full h-10 pl-10 pr-4 border rounded-lg text-sm" />
        </div>
        <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="h-10 px-3 border rounded-lg text-sm">
          <option value="">Tất cả nhóm</option>
          {[...new Set([...GROUPS, ...groups])].map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {/* Summary by group */}
      <div className="flex gap-3 overflow-x-auto">
        {[...new Set([...groups, ...GROUPS])].filter(g => products.some(p => p.group === g)).map(g => {
          const count = products.filter(p => p.group === g).length;
          return (
            <button key={g} onClick={() => setGroupFilter(groupFilter === g ? '' : g)}
              className={`px-4 py-2 rounded-full text-xs font-medium border whitespace-nowrap cursor-pointer transition-all ${groupFilter === g ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}>
              <Boxes className="h-3 w-3 inline mr-1" />{g} ({count})
            </button>
          );
        })}
      </div>

      {/* Product Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
            <th className="py-3 px-4 text-left">Mã SP</th>
            <th className="py-3 px-4 text-left">Tên sản phẩm</th>
            <th className="py-3 px-4 text-left">Nhóm</th>
            <th className="py-3 px-4 text-left">ĐVT</th>
            <th className="py-3 px-4 text-right">Giá bán</th>
            <th className="py-3 px-4 text-right">Giá vốn</th>
            <th className="py-3 px-4 text-center">Sửa</th>
          </tr></thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 font-mono text-xs text-blue-600 font-bold">{p.code || p.sku || '—'}</td>
                <td className="py-3 px-4">
                  <p className="font-medium text-gray-900">{p.name}</p>
                  {p.description && <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{p.description}</p>}
                </td>
                <td className="py-3 px-4"><span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{p.group || 'Khác'}</span></td>
                <td className="py-3 px-4 text-gray-500">{p.unit || '—'}</td>
                <td className="py-3 px-4 text-right font-bold text-gray-900">{p.sell_price ? formatVND(p.sell_price) : '—'}</td>
                <td className="py-3 px-4 text-right text-gray-500">{p.cost_price ? formatVND(p.cost_price) : '—'}</td>
                <td className="py-3 px-4 text-center">
                  <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer"><Edit3 className="h-4 w-4 text-gray-400" /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">Không có sản phẩm</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && <ProductForm product={editing} onClose={() => setShowForm(false)} onSave={() => { setShowForm(false); load(); }} />}
    </div>
  );
}

function ProductForm({ product, onClose, onSave }) {
  const [form, setForm] = useState({
    name: product?.name || '', code: product?.code || product?.sku || '',
    group: product?.group || '', unit: product?.unit || 'bộ',
    sell_price: product?.sell_price || '', cost_price: product?.cost_price || '',
    description: product?.description || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name) return alert('Nhập tên sản phẩm');
    setSaving(true);
    try {
      const payload = { ...form, sell_price: parseFloat(form.sell_price) || 0, cost_price: parseFloat(form.cost_price) || 0 };
      if (product) await api.put(`/crm/products/${product.id}`, payload);
      else await api.post('/crm/products', payload);
      onSave();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{product ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="text-xs font-medium text-gray-700">Tên SP *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-gray-700">Mã SP</label><input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" /></div>
            <div><label className="text-xs font-medium text-gray-700">Nhóm</label>
              <select value={form.group} onChange={e => setForm(f => ({ ...f, group: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1">
                <option value="">— Chọn —</option>
                {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs font-medium text-gray-700">ĐVT</label>
              <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div><label className="text-xs font-medium text-gray-700">Giá bán</label><input type="number" value={form.sell_price} onChange={e => setForm(f => ({ ...f, sell_price: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" /></div>
            <div><label className="text-xs font-medium text-gray-700">Giá vốn</label><input type="number" value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" /></div>
          </div>
          <div><label className="text-xs font-medium text-gray-700">Mô tả</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm mt-1" /></div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="h-9 px-4 border rounded-lg text-sm cursor-pointer">Hủy</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  );
}
