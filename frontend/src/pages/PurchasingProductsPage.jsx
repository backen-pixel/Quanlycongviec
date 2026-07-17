import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { formatVND } from '../lib/utils';
import { Package, Plus, Pencil, X, Save, Search, Upload, Image as ImageIcon } from 'lucide-react';

export default function PurchasingProductsPage() {
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '', code: '', sku: '', brand_id: '', category_id: '',
    unit: 'cái', cost_price: '', selling_price: '', image_url: '', description: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (brandFilter) params.brand_id = brandFilter;
      if (categoryFilter) params.category_id = categoryFilter;
      if (search.trim()) params.q = search.trim();
      const [pRes, bRes, cRes] = await Promise.all([
        api.get('/purchasing/products', { params }),
        api.get('/purchasing/brands'),
        api.get('/purchasing/categories'),
      ]);
      setProducts(pRes.data || []);
      setBrands(bRes.data || []);
      setCategories(cRes.data || []);
    } catch {
      setProducts([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [brandFilter, categoryFilter]);

  const openCreate = () => {
    setEditing(null);
    const hafele = brands.find((b) => String(b.code || '').toUpperCase() === 'HAFELE');
    setForm({
      name: '', code: '', sku: '', brand_id: hafele?.id || '', category_id: '',
      unit: 'cái', cost_price: '', selling_price: '', image_url: '', description: '',
    });
    setShowForm(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name || '',
      code: p.code || '',
      sku: p.sku || '',
      brand_id: p.brand_id || p.brand?.id || '',
      category_id: p.category_id || p.category?.id || '',
      unit: p.unit || 'cái',
      cost_price: p.cost_price ?? '',
      selling_price: p.selling_price ?? '',
      image_url: p.image_url || '',
      description: p.description || '',
    });
    setShowForm(true);
  };

  const uploadImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entity_type', 'product');
      const { data } = await api.post('/upload', fd);
      const file = data?.files?.[0] || data;
      const url = file?.file_url || file?.url || file?.public_url;
      if (url) setForm((f) => ({ ...f, image_url: url }));
      else alert('Upload thành công nhưng không nhận được URL');
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi upload ảnh');
    }
    setUploading(false);
  };

  const save = async () => {
    if (!form.name.trim()) return alert('Nhập tên sản phẩm');
    setSaving(true);
    try {
      const payload = {
        ...form,
        brand_id: form.brand_id || null,
        category_id: form.category_id || null,
        cost_price: form.cost_price === '' ? 0 : Number(form.cost_price),
        selling_price: form.selling_price === '' ? Number(form.cost_price) || 0 : Number(form.selling_price),
      };
      if (editing) await api.put(`/purchasing/products/${editing.id}`, payload);
      else await api.post('/purchasing/products', payload);
      setShowForm(false);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-orange-600" /> Sản phẩm mua hàng
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {products.length} SP · nhập tay từ catalog Häfele (ảnh + thương hiệu + danh mục)
          </p>
        </div>
        <button type="button" onClick={openCreate} className="h-9 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
          <Plus className="h-4 w-4" /> Thêm sản phẩm
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Tìm tên, mã, SKU..."
            className="w-full h-10 pl-10 pr-3 border rounded-lg text-sm"
          />
        </div>
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="h-10 px-3 border rounded-lg text-sm">
          <option value="">Tất cả thương hiệu</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-10 px-3 border rounded-lg text-sm">
          <option value="">Tất cả danh mục</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="button" onClick={load} className="h-10 px-4 border rounded-lg text-sm cursor-pointer hover:bg-gray-50">Tìm</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-10 w-10 border-4 border-orange-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border overflow-hidden hover:shadow-md transition-shadow group">
              <div className="aspect-[4/3] bg-gray-50 relative flex items-center justify-center">
                {p.image_url
                  ? <img src={p.image_url} alt={p.name} className="w-full h-full object-contain" />
                  : <ImageIcon className="h-10 w-10 text-gray-300" />}
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-lg shadow opacity-0 group-hover:opacity-100 cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5 text-orange-600" />
                </button>
              </div>
              <div className="p-3">
                <div className="text-[10px] text-orange-600 font-medium uppercase tracking-wide">
                  {p.brand?.name || '—'} · {p.category?.name || 'Chưa phân loại'}
                </div>
                <div className="font-semibold text-sm mt-0.5 line-clamp-2">{p.name}</div>
                <div className="text-xs text-gray-400 font-mono mt-0.5">{p.code}{p.sku ? ` · ${p.sku}` : ''}</div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-sm font-bold text-gray-900">{formatVND(p.cost_price || p.selling_price || 0)}</span>
                  <span className="text-xs text-gray-400">/{p.unit || 'cái'}</span>
                </div>
              </div>
            </div>
          ))}
          {products.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-400 text-sm">
              Chưa có sản phẩm — thêm từ brochure Häfele
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-3 my-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">{editing ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="p-1 cursor-pointer"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <div className="flex gap-3 items-start">
              <div className="w-24 h-24 rounded-lg border bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                {form.image_url
                  ? <img src={form.image_url} alt="" className="w-full h-full object-contain" />
                  : <ImageIcon className="h-8 w-8 text-gray-300" />}
              </div>
              <div className="flex-1 space-y-2">
                <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={(e) => uploadImage(e.target.files?.[0])} />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="h-9 px-3 border rounded-lg text-sm flex items-center gap-2 cursor-pointer hover:bg-gray-50 disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" /> {uploading ? 'Đang tải...' : 'Upload ảnh'}
                </button>
                <input
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                  className="w-full h-9 px-2 border rounded-lg text-xs"
                  placeholder="Hoặc dán URL ảnh"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Tên *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Mã SP</label>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" placeholder="Tự sinh nếu trống" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">SKU / Mã Häfele</label>
                <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Thương hiệu</label>
                <select value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1">
                  <option value="">—</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Danh mục</label>
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1">
                  <option value="">—</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Đơn vị</label>
                <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Giá mua</label>
                <input type="number" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Giá bán</label>
                <input type="number" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} className="w-full h-10 px-3 border rounded-lg text-sm mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Mô tả</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm mt-1" rows={2} />
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
