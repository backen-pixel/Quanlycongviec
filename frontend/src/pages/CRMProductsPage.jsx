import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { formatVND } from '../lib/utils';
import { Package, Search, Plus, Edit3, X, Save, Boxes, Tag, FolderTree, Building2 } from 'lucide-react';

const UNITS = ['bộ', 'cái', 'mét', 'm²', 'tấm', 'kg', 'chiếc', 'hộp', 'thanh', 'm dài'];

const LS_CRM_PRODUCTS_COMPANY = 'crm_products_filter_company_id';

export default function CRMProductsPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const [companies, setCompanies] = useState([]);
  const [filterCompanyId, setFilterCompanyId] = useState(() => {
    if (typeof window === 'undefined') return '';
    try { return localStorage.getItem(LS_CRM_PRODUCTS_COMPANY) || ''; } catch { return ''; }
  });

  const listParams = useMemo(
    () => (isAdmin && filterCompanyId ? { company_id: filterCompanyId } : {}),
    [isAdmin, filterCompanyId],
  );

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/companies', { params: { for_module: 'crm' } })
      .then((r) => {
        const list = r.data?.companies || r.data || [];
        setCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => setCompanies([]));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    try {
      if (filterCompanyId) localStorage.setItem(LS_CRM_PRODUCTS_COMPANY, filterCompanyId);
      else localStorage.removeItem(LS_CRM_PRODUCTS_COMPANY);
    } catch { /* ignore */ }
  }, [isAdmin, filterCompanyId]);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showCategoryMgr, setShowCategoryMgr] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, catRes] = await Promise.allSettled([
        api.get('/crm/products-list', { params: listParams }),
        api.get('/products/categories', { params: listParams }),
      ]);
      if (prodRes.status === 'fulfilled') setProducts(prodRes.value.data || []);
      if (catRes.status === 'fulfilled') setCategories(catRes.value.data.categories || catRes.value.data || []);
    } catch {}
    setLoading(false);
  }, [listParams]);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter(p => {
    if (categoryFilter && p.category_id !== categoryFilter) return false;
    if (groupFilter) {
      const pg = p.code_group || p.group;
      if (pg !== groupFilter) return false;
    }
    if (!search) return true;
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const target = `${p.name || ''} ${p.code || ''} ${p.sku || ''}`.toLowerCase();
    return words.every(w => target.includes(w));
  });

  // Nhóm SP (code_group) from actual products
  const codeGroups = {};
  products.forEach(p => {
    const g = p.code_group || p.group;
    if (g) codeGroups[g] = (codeGroups[g] || 0) + 1;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Package className="h-6 w-6 text-blue-600" /> Sản phẩm CRM</h1>
          <p className="text-sm text-gray-500 mt-1">{products.length} sản phẩm · {categories.length} nhóm ngành</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-500 shrink-0" />
              <select
                value={filterCompanyId}
                onChange={(e) => setFilterCompanyId(e.target.value)}
                className="h-9 min-w-[160px] px-3 border rounded-lg text-sm bg-white"
                title="Sản phẩm & nhóm ngành theo công ty"
              >
                <option value="">Tất cả công ty</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                ))}
              </select>
            </div>
          )}
          <button onClick={() => setShowCategoryMgr(!showCategoryMgr)} className="h-9 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
            <FolderTree className="h-4 w-4" /> Nhóm ngành
          </button>
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
            <Plus className="h-4 w-4" /> Thêm SP
          </button>
        </div>
      </div>

      {/* Category Manager (toggle) */}
      {showCategoryMgr && (
        <CategoryManager
          categories={categories}
          companyIdForAdmin={isAdmin && filterCompanyId ? filterCompanyId : null}
          onReload={load}
        />
      )}

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên, mã SP..." className="w-full h-10 pl-10 pr-4 border rounded-lg text-sm" />
        </div>
      </div>

      {/* Nhóm ngành (Categories từ DB) */}
      {categories.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Tag className="h-3 w-3" /> Phân loại theo nhóm ngành
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setCategoryFilter('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap cursor-pointer transition-all ${!categoryFilter ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}>
              Tất cả ({products.length})
            </button>
            {categories.filter(c => c.is_active !== false).map(cat => {
              const count = products.filter(p => p.category_id === cat.id).length;
              return (
                <button key={cat.id} onClick={() => setCategoryFilter(categoryFilter === cat.id ? '' : cat.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap cursor-pointer transition-all ${
                    categoryFilter === cat.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'
                  }`}>
                  {cat.name} ({count})
                </button>
              );
            })}
            {/* Products without category */}
            {products.some(p => !p.category_id) && (
              <button onClick={() => setCategoryFilter('none')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap cursor-pointer transition-all ${
                  categoryFilter === 'none' ? 'bg-gray-600 text-white border-gray-600' : 'bg-white hover:bg-gray-50'
                }`}>
                Chưa phân loại ({products.filter(p => !p.category_id).length})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nhóm SP (code_group) */}
      {Object.keys(codeGroups).length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1 shrink-0 mr-1">
            <Boxes className="h-3 w-3" /> Nhóm SP:
          </span>
          {Object.entries(codeGroups).sort((a, b) => b[1] - a[1]).map(([g, count]) => (
            <button key={g} onClick={() => setGroupFilter(groupFilter === g ? '' : g)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap cursor-pointer transition-all ${
                groupFilter === g ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white hover:bg-gray-50'
              }`}>
              {g} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Product Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
            <th className="py-3 px-4 text-left">Mã SP</th>
            <th className="py-3 px-4 text-left">Tên sản phẩm</th>
            <th className="py-3 px-4 text-left">Nhóm ngành</th>
            <th className="py-3 px-4 text-left">Nhóm SP</th>
            <th className="py-3 px-4 text-left">ĐVT</th>
            <th className="py-3 px-4 text-right">Giá bán</th>
            <th className="py-3 px-4 text-right">Giá vốn</th>
            <th className="py-3 px-4 text-center">Sửa</th>
          </tr></thead>
          <tbody>
            {(categoryFilter === 'none' ? filtered.filter(p => !p.category_id) : filtered).map(p => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 font-mono text-xs text-blue-600 font-bold">{p.code || p.sku || '—'}</td>
                <td className="py-3 px-4">
                  <p className="font-medium text-gray-900">{p.name}</p>
                  {p.description && <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{p.description}</p>}
                </td>
                <td className="py-3 px-4">
                  {p.category?.name ? (
                    <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{p.category.name}</span>
                  ) : categories.find(c => c.id === p.category_id) ? (
                    <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{categories.find(c => c.id === p.category_id).name}</span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{p.code_group || p.group || '—'}</span>
                </td>
                <td className="py-3 px-4 text-gray-500">{p.unit || '—'}</td>
                <td className="py-3 px-4 text-right font-bold text-gray-900">
                  {(p.selling_price || p.sell_price) ? formatVND(p.selling_price || p.sell_price) : '—'}
                </td>
                <td className="py-3 px-4 text-right text-gray-500">
                  {(p.cost_price || p.base_price) ? formatVND(p.cost_price || p.base_price) : '—'}
                </td>
                <td className="py-3 px-4 text-center">
                  <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer">
                    <Edit3 className="h-4 w-4 text-gray-400" />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">Không có sản phẩm</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ProductForm
          product={editing}
          categories={categories}
          companyIdForAdmin={isAdmin && filterCompanyId ? filterCompanyId : null}
          onClose={() => setShowForm(false)}
          onSave={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

function ProductForm({ product, categories, companyIdForAdmin, onClose, onSave }) {
  const [form, setForm] = useState({
    name: product?.name || '', code: product?.code || product?.sku || '',
    group: product?.group || product?.code_group || '', 
    category_id: product?.category_id || '',
    unit: product?.unit || 'bộ',
    sell_price: product?.sell_price || product?.selling_price || '', 
    cost_price: product?.cost_price || product?.base_price || '',
    description: product?.description || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name) return alert('Nhập tên sản phẩm');
    setSaving(true);
    try {
      const payload = { 
        ...form, 
        sell_price: parseFloat(form.sell_price) || 0, 
        cost_price: parseFloat(form.cost_price) || 0,
        category_id: form.category_id || null,
      };
      if (!product && companyIdForAdmin) payload.company_id = companyIdForAdmin;
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
            <div>
              <label className="text-xs font-medium text-gray-700">Nhóm ngành</label>
              <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} className="w-full h-10 px-3 border rounded-lg text-sm mt-1">
                <option value="">— Chọn nhóm ngành —</option>
                {categories.filter(c => c.is_active !== false).map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
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

function CategoryManager({ categories, companyIdForAdmin, onReload }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const addCategory = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.post('/products/categories', {
        name: name.trim(),
        ...(companyIdForAdmin ? { company_id: companyIdForAdmin } : {}),
      });
      setName('');
      onReload();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  const delCategory = async (id) => {
    if (!confirm('Xóa nhóm ngành này?')) return;
    try { await api.delete(`/products/categories/${id}`); onReload(); }
    catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
        <FolderTree className="h-4 w-4 text-purple-600" /> Quản lý nhóm ngành
        <Link to="/crm/categories" className="ml-auto text-xs text-blue-600 hover:underline">Quản lý đầy đủ →</Link>
      </h3>
      <p className="text-xs text-gray-500 mb-3">Phân loại sản phẩm theo nhóm ngành để dễ tìm kiếm và quản lý</p>
      
      <div className="flex items-center gap-2 mb-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Tên nhóm ngành mới..." 
          className="flex-1 h-9 px-3 border rounded-lg text-sm" onKeyDown={e => e.key === 'Enter' && addCategory()} />
        <button onClick={addCategory} disabled={saving || !name.trim()} 
          className="h-9 px-4 bg-purple-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-purple-700 disabled:opacity-50">
          <Plus className="h-4 w-4 inline mr-1" /> Thêm
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map(cat => (
          <div key={cat.id} className="flex items-center gap-1.5 bg-purple-50 px-3 py-1.5 rounded-full">
            <span className="text-xs font-medium text-purple-700">{cat.name}</span>
            <button onClick={() => delCategory(cat.id)} className="text-purple-400 hover:text-red-500 cursor-pointer">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {categories.length === 0 && <p className="text-xs text-gray-400">Chưa có nhóm ngành nào. Thêm: Tủ bếp, Phụ kiện, Thiết bị, Vật liệu...</p>}
      </div>
    </div>
  );
}
