import { useState, useEffect } from 'react';
import api from '../lib/api';
import { FolderTree, Plus, Pencil, X, Save } from 'lucide-react';

export default function PurchasingCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', parent_id: '', order_index: 0 });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/purchasing/categories');
      setCategories(data || []);
    } catch {
      setCategories([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const buildTree = (items, parentId = null) =>
    items
      .filter((c) => (c.parent_id || null) === parentId)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .map((c) => ({ ...c, children: buildTree(items, c.id) }));

  const tree = buildTree(categories);

  const openCreate = (parentId = '') => {
    setEditing(null);
    setForm({ name: '', description: '', parent_id: parentId || '', order_index: 0 });
    setShowForm(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      name: c.name || '',
      description: c.description || '',
      parent_id: c.parent_id || '',
      order_index: c.order_index || 0,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) return alert('Nhập tên danh mục');
    setSaving(true);
    try {
      const payload = {
        ...form,
        parent_id: form.parent_id || null,
        order_index: Number(form.order_index) || 0,
      };
      if (editing) await api.put(`/purchasing/categories/${editing.id}`, payload);
      else await api.post('/purchasing/categories', payload);
      setShowForm(false);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu');
    }
    setSaving(false);
  };

  const renderNode = (node, depth = 0) => (
    <div key={node.id}>
      <div
        className="flex items-center gap-2 py-2.5 px-3 border-b hover:bg-orange-50/40"
        style={{ paddingLeft: 12 + depth * 20 }}
      >
        <FolderTree className="h-4 w-4 text-orange-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{node.name}</div>
          {node.description && <div className="text-xs text-gray-400 truncate">{node.description}</div>}
        </div>
        <span className="text-[10px] text-gray-400 font-mono">{node.slug}</span>
        <button type="button" onClick={() => openCreate(node.id)} className="p-1.5 text-gray-400 hover:text-orange-600 cursor-pointer" title="Thêm con">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => openEdit(node)} className="p-1.5 text-gray-400 hover:text-orange-600 cursor-pointer">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
      {(node.children || []).map((ch) => renderNode(ch, depth + 1))}
    </div>
  );

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
            <FolderTree className="h-6 w-6 text-orange-600" /> Danh mục
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {categories.length} danh mục · tham chiếu brochure Häfele (Storage / Organisation / Sinks / Disposal)
          </p>
        </div>
        <button type="button" onClick={() => openCreate()} className="h-9 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
          <Plus className="h-4 w-4" /> Thêm danh mục
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {tree.map((n) => renderNode(n))}
        {tree.length === 0 && <p className="text-center text-sm text-gray-400 py-10">Chưa có danh mục</p>}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">{editing ? 'Sửa danh mục' : 'Thêm danh mục'}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="p-1 text-gray-400 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tên *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Danh mục cha</label>
              <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm">
                <option value="">— Gốc —</option>
                {categories.filter((c) => c.id !== editing?.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mô tả</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="h-9 px-4 border rounded-lg text-sm cursor-pointer">Hủy</button>
              <button type="button" onClick={save} disabled={saving} className="h-9 px-4 bg-orange-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50">
                <Save className="h-4 w-4" /> {saving ? '...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
