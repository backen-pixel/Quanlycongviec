import { useState, useEffect } from 'react';
import api from '../lib/api';
import { FolderTree, Plus, Edit3, Trash2, X, Save, ChevronRight, ChevronDown, GripVertical, Eye, EyeOff, ArrowUp, ArrowDown, Package } from 'lucide-react';

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [productCounts, setProductCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingInline, setEditingInline] = useState(null);
  const [inlineValue, setInlineValue] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [catRes, prodRes] = await Promise.allSettled([
        api.get('/products/categories'),
        api.get('/products', { params: { limit: 1000 } }),
      ]);
      const cats = catRes.status === 'fulfilled' ? (catRes.value.data.categories || catRes.value.data || []) : [];
      setCategories(cats);
      // Count products per category
      const prods = prodRes.status === 'fulfilled' ? (prodRes.value.data.products || []) : [];
      const counts = {};
      prods.forEach(p => { if (p.category_id) counts[p.category_id] = (counts[p.category_id] || 0) + 1; });
      counts['_none'] = prods.filter(p => !p.category_id).length;
      counts['_total'] = prods.length;
      setProductCounts(counts);
    } catch {}
    setLoading(false);
  };

  // Build tree from flat list
  const buildTree = (items, parentId = null) => {
    return items
      .filter(c => (c.parent_id || null) === parentId)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .map(c => ({ ...c, children: buildTree(items, c.id) }));
  };
  const tree = buildTree(categories);

  const toggleActive = async (cat) => {
    try {
      await api.put(`/products/categories/${cat.id}`, { is_active: !cat.is_active });
      load();
    } catch (e) { alert(e.response?.data?.error || 'Loi'); }
  };

  const deleteCat = async (cat) => {
    const count = productCounts[cat.id] || 0;
    if (count > 0) return alert(`Khong the xoa — nhom nganh "${cat.name}" co ${count} san pham. Chuyen san pham sang nhom khac truoc.`);
    if (!confirm(`Xoa nhom nganh "${cat.name}"?`)) return;
    try { await api.delete(`/products/categories/${cat.id}`); load(); }
    catch (e) { alert(e.response?.data?.error || 'Loi'); }
  };

  const moveOrder = async (cat, direction) => {
    const siblings = categories
      .filter(c => (c.parent_id || null) === (cat.parent_id || null))
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const idx = siblings.findIndex(c => c.id === cat.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const other = siblings[swapIdx];
    try {
      await Promise.all([
        api.put(`/products/categories/${cat.id}`, { order_index: other.order_index || swapIdx }),
        api.put(`/products/categories/${other.id}`, { order_index: cat.order_index || idx }),
      ]);
      load();
    } catch {}
  };

  const saveInline = async (cat, field) => {
    if (!inlineValue.trim()) { setEditingInline(null); return; }
    try {
      await api.put(`/products/categories/${cat.id}`, { [field]: inlineValue.trim() });
      setEditingInline(null);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Loi'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-purple-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FolderTree className="h-6 w-6 text-purple-600" /> Quản lý Nhóm ngành
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {categories.length} nhóm ngành · {productCounts._total || 0} sản phẩm · {productCounts._none || 0} chưa phân loại
          </p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="h-9 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
          <Plus className="h-4 w-4" /> Thêm nhóm ngành
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-purple-700">{categories.filter(c => c.is_active !== false).length}</p>
          <p className="text-xs text-purple-600 mt-1">Đang hoạt động</p>
        </div>
        <div className="bg-gray-50 border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-700">{categories.filter(c => c.is_active === false).length}</p>
          <p className="text-xs text-gray-500 mt-1">Đã ẩn</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{(productCounts._total || 0) - (productCounts._none || 0)}</p>
          <p className="text-xs text-blue-600 mt-1">SP đã phân loại</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-700">{productCounts._none || 0}</p>
          <p className="text-xs text-amber-600 mt-1">SP chưa phân loại</p>
        </div>
      </div>

      {/* Category Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
              <th className="py-3 px-4 text-left w-10">TT</th>
              <th className="py-3 px-4 text-left">Tên nhóm ngành</th>
              <th className="py-3 px-4 text-left">Mô tả</th>
              <th className="py-3 px-4 text-center w-20">Số SP</th>
              <th className="py-3 px-4 text-center w-24">Trạng thái</th>
              <th className="py-3 px-4 text-center w-24">Thứ tự</th>
              <th className="py-3 px-4 text-center w-28">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {tree.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">
                <FolderTree className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Chưa có nhóm ngành nào</p>
                <p className="text-xs mt-1">Bấm "Thêm nhóm ngành" để tạo mới</p>
              </td></tr>
            ) : (
              tree.map((cat, i) => (
                <CategoryRow
                  key={cat.id} cat={cat} depth={0} index={i}
                  productCounts={productCounts}
                  editingInline={editingInline} inlineValue={inlineValue}
                  onStartInline={(id, field, val) => { setEditingInline(`${id}_${field}`); setInlineValue(val || ''); }}
                  onChangeInline={setInlineValue}
                  onSaveInline={saveInline}
                  onCancelInline={() => setEditingInline(null)}
                  onToggleActive={toggleActive}
                  onDelete={deleteCat}
                  onMove={moveOrder}
                  onEdit={(c) => { setEditing(c); setShowForm(true); }}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Form Modal */}
      {showForm && (
        <CategoryFormModal
          category={editing}
          categories={categories}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={() => { setShowForm(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function CategoryRow({ cat, depth, index, productCounts, editingInline, inlineValue, onStartInline, onChangeInline, onSaveInline, onCancelInline, onToggleActive, onDelete, onMove, onEdit }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = cat.children && cat.children.length > 0;
  const count = productCounts[cat.id] || 0;
  const isInactive = cat.is_active === false;

  return (
    <>
      <tr className={`border-b hover:bg-gray-50 ${isInactive ? 'opacity-50' : ''}`}>
        {/* Order */}
        <td className="py-3 px-4 text-gray-400 text-xs">{index + 1}</td>

        {/* Name — inline editable */}
        <td className="py-3 px-4" style={{ paddingLeft: `${16 + depth * 24}px` }}>
          <div className="flex items-center gap-2">
            {hasChildren && (
              <button onClick={() => setExpanded(!expanded)} className="p-0.5 hover:bg-gray-100 rounded cursor-pointer">
                {expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
              </button>
            )}
            {!hasChildren && depth > 0 && <span className="w-4" />}

            {editingInline === `${cat.id}_name` ? (
              <div className="flex items-center gap-1 flex-1">
                <input
                  value={inlineValue} onChange={e => onChangeInline(e.target.value)}
                  className="flex-1 h-8 px-2 border-2 border-purple-400 rounded-lg text-sm outline-none"
                  autoFocus onKeyDown={e => { if (e.key === 'Enter') onSaveInline(cat, 'name'); if (e.key === 'Escape') onCancelInline(); }}
                />
                <button onClick={() => onSaveInline(cat, 'name')} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"><Save className="h-3.5 w-3.5" /></button>
                <button onClick={onCancelInline} className="p-1 text-gray-400 hover:bg-gray-100 rounded cursor-pointer"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <span
                className="font-medium text-gray-900 hover:text-purple-600 cursor-pointer group flex items-center gap-1"
                onClick={() => onStartInline(cat.id, 'name', cat.name)}
              >
                {cat.name}
                <Edit3 className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100" />
              </span>
            )}
          </div>
        </td>

        {/* Description — inline editable */}
        <td className="py-3 px-4">
          {editingInline === `${cat.id}_description` ? (
            <div className="flex items-center gap-1">
              <input
                value={inlineValue} onChange={e => onChangeInline(e.target.value)}
                className="flex-1 h-8 px-2 border-2 border-purple-400 rounded-lg text-xs outline-none"
                autoFocus placeholder="Mô tả..."
                onKeyDown={e => { if (e.key === 'Enter') onSaveInline(cat, 'description'); if (e.key === 'Escape') onCancelInline(); }}
              />
              <button onClick={() => onSaveInline(cat, 'description')} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"><Save className="h-3.5 w-3.5" /></button>
              <button onClick={onCancelInline} className="p-1 text-gray-400 hover:bg-gray-100 rounded cursor-pointer"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <span
              className="text-xs text-gray-500 hover:text-purple-600 cursor-pointer group flex items-center gap-1"
              onClick={() => onStartInline(cat.id, 'description', cat.description || '')}
            >
              {cat.description || <span className="text-gray-300 italic">Thêm mô tả...</span>}
              <Edit3 className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100" />
            </span>
          )}
        </td>

        {/* Product count */}
        <td className="py-3 px-4 text-center">
          {count > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
              <Package className="h-3 w-3" /> {count}
            </span>
          ) : (
            <span className="text-xs text-gray-300">0</span>
          )}
        </td>

        {/* Active toggle */}
        <td className="py-3 px-4 text-center">
          <button onClick={() => onToggleActive(cat)} className="cursor-pointer" title={isInactive ? 'Bật hiển thị' : 'Ẩn nhóm ngành'}>
            {isInactive ? (
              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full"><EyeOff className="h-3 w-3" /> Ẩn</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full"><Eye className="h-3 w-3" /> Hiện</span>
            )}
          </button>
        </td>

        {/* Reorder */}
        <td className="py-3 px-4 text-center">
          <div className="flex items-center justify-center gap-0.5">
            <button onClick={() => onMove(cat, 'up')} className="p-1 hover:bg-gray-100 rounded cursor-pointer" title="Lên"><ArrowUp className="h-3.5 w-3.5 text-gray-400" /></button>
            <span className="text-xs text-gray-400 w-5 text-center">{cat.order_index || 0}</span>
            <button onClick={() => onMove(cat, 'down')} className="p-1 hover:bg-gray-100 rounded cursor-pointer" title="Xuống"><ArrowDown className="h-3.5 w-3.5 text-gray-400" /></button>
          </div>
        </td>

        {/* Actions */}
        <td className="py-3 px-4 text-center">
          <div className="flex items-center justify-center gap-1">
            <button onClick={() => onEdit(cat)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 cursor-pointer" title="Sửa đầy đủ"><Edit3 className="h-3.5 w-3.5" /></button>
            <button onClick={() => onDelete(cat)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 cursor-pointer" title="Xóa"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </td>
      </tr>

      {/* Children */}
      {expanded && hasChildren && cat.children.map((child, ci) => (
        <CategoryRow
          key={child.id} cat={child} depth={depth + 1} index={ci}
          productCounts={productCounts}
          editingInline={editingInline} inlineValue={inlineValue}
          onStartInline={onStartInline} onChangeInline={onChangeInline}
          onSaveInline={onSaveInline} onCancelInline={onCancelInline}
          onToggleActive={onToggleActive} onDelete={onDelete} onMove={onMove} onEdit={onEdit}
        />
      ))}
    </>
  );
}

function CategoryFormModal({ category, categories, onClose, onSave }) {
  const [form, setForm] = useState({
    name: category?.name || '',
    description: category?.description || '',
    parent_id: category?.parent_id || '',
    order_index: category?.order_index ?? 0,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) return alert('Nhập tên nhóm ngành');
    setSaving(true);
    try {
      const payload = { ...form, parent_id: form.parent_id || null, order_index: parseInt(form.order_index) || 0 };
      if (category) await api.put(`/products/categories/${category.id}`, payload);
      else await api.post('/products/categories', payload);
      onSave();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  // Exclude self and children from parent options
  const parentOptions = categories.filter(c => c.id !== category?.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-purple-600" />
            {category ? 'Sửa nhóm ngành' : 'Thêm nhóm ngành mới'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700">Tên nhóm ngành *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="VD: Tủ bếp, Phụ kiện, Thiết bị..."
              className="w-full h-10 px-3 border rounded-lg text-sm mt-1" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Mô tả</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Mô tả ngắn về nhóm ngành này..."
              rows={2} className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Nhóm cha (phân cấp)</label>
              <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
                className="w-full h-10 px-3 border rounded-lg text-sm mt-1">
                <option value="">— Không (gốc) —</option>
                {parentOptions.filter(c => c.is_active !== false).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Thứ tự hiển thị</label>
              <input type="number" value={form.order_index} onChange={e => setForm(f => ({ ...f, order_index: e.target.value }))}
                className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="h-9 px-4 border rounded-lg text-sm cursor-pointer">Hủy</button>
          <button onClick={save} disabled={saving}
            className="h-9 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">
            {saving ? 'Đang lưu...' : category ? 'Cập nhật' : 'Tạo mới'}
          </button>
        </div>
      </div>
    </div>
  );
}
