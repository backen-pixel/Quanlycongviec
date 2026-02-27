import { useState, useEffect } from 'react';
import api from '../lib/api';
import Modal from '../components/Modal';
import { Plus, Search, Package, Layers, Wrench, Trash2, Tag } from 'lucide-react';
import { formatVND } from '../lib/utils';

const COMP_CATS = { panel: 'Tấm/Panel', hardware: 'Phụ kiện', accessory: 'Linh kiện', surface: 'Bề mặt', other: 'Khác' };
const COMP_CAT_COLORS = { panel: 'bg-blue-100 text-blue-700', hardware: 'bg-purple-100 text-purple-700', accessory: 'bg-amber-100 text-amber-700', surface: 'bg-emerald-100 text-emerald-700', other: 'bg-gray-100 text-gray-600' };

function Spinner() { return <div className="flex items-center justify-center py-16"><svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div>; }
function Empty({ icon: I, text }) { return <div className="text-center py-16"><I className="h-12 w-12 mx-auto text-gray-300 mb-3" /><p className="text-sm text-gray-400">{text}</p></div>; }

export default function ProductsPage() {
  const [tab, setTab] = useState('products');
  return (
    <div className="space-y-5 max-w-7xl">
      <div><h1 className="text-2xl font-bold text-gray-900">Quản lý sản phẩm</h1><p className="text-sm text-gray-500 mt-0.5">Sản phẩm, danh mục, vật tư & cấu trúc BOM</p></div>
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        {[{ id: 'products', label: 'Sản phẩm', icon: Package }, { id: 'categories', label: 'Danh mục', icon: Layers }, { id: 'components', label: 'Vật tư', icon: Wrench }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`h-9 px-4 rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer ${tab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>
      {tab === 'products' && <ProductsTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'components' && <ComponentsTab />}
    </div>
  );
}

// ═══ PRODUCTS ═══
function ProductsTab() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);

  const load = () => { setLoading(true); api.get('/products', { params: { search: search || undefined, category_id: filterCat || undefined } }).then(r => setProducts(r.data.products || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); api.get('/products/categories').then(r => setCategories(r.data.categories || [])); }, []);
  useEffect(load, [filterCat]);

  const del = async (e, id) => { e.stopPropagation(); if (!confirm('Xóa SP?')) return; await api.delete(`/products/${id}`); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} placeholder="Tìm sản phẩm..." className="w-full h-9 pl-10 pr-3 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" /></div>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="h-9 px-3 border rounded-lg text-sm bg-white">
            <option value="">Tất cả danh mục</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>
        <button onClick={() => setShowCreate(true)} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer"><Plus className="h-4 w-4" /> Thêm SP</button>
      </div>
      {loading ? <Spinner /> : products.length === 0 ? <Empty icon={Package} text="Chưa có sản phẩm" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {products.map(p => (
            <div key={p.id} onClick={() => setShowDetail(p.id)} className="bg-white rounded-xl border p-4 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group">
              <div className="flex items-start justify-between mb-2">
                <div><span className="text-xs font-bold text-blue-600">{p.code}</span>{p.category && <span className="text-[10px] text-gray-400 ml-2">{p.category.name}</span>}</div>
                <button onClick={(e) => del(e, p.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">{p.name}</h3>
              <div className="flex items-center justify-between mt-2">
                <span className="text-lg font-bold text-gray-900">{formatVND(p.base_price)}</span>
                <div className="flex items-center gap-2 text-xs text-gray-500">{p.material && <span className="bg-gray-100 px-2 py-0.5 rounded">{p.material}</span>}<span>Kho: {p.stock_quantity}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
      <ProductFormModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={load} categories={categories} />
      {showDetail && <ProductDetailModal productId={showDetail} open={!!showDetail} onClose={() => setShowDetail(null)} onUpdated={load} />}
    </div>
  );
}

// ═══ CATEGORIES ═══
function CategoriesTab() {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const load = () => { setLoading(true); api.get('/products/categories').then(r => setCats(r.data.categories || [])).finally(() => setLoading(false)); };
  useEffect(load, []);
  const create = async (e) => { e.preventDefault(); if (!form.name.trim()) return; await api.post('/products/categories', form); setForm({ name: '', description: '' }); setShowCreate(false); load(); };
  const del = async (id) => { if (!confirm('Xóa?')) return; try { await api.delete(`/products/categories/${id}`); load(); } catch (err) { alert(err.response?.data?.error || 'Lỗi'); } };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={() => setShowCreate(true)} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer"><Plus className="h-4 w-4" /> Thêm danh mục</button></div>
      {loading ? <Spinner /> : cats.length === 0 ? <Empty icon={Layers} text="Chưa có danh mục" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{cats.map(c => (
          <div key={c.id} className="bg-white rounded-xl border p-4 flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><Tag className="h-5 w-5 text-blue-600" /></div>
            <div className="flex-1"><h3 className="text-sm font-semibold">{c.name}</h3>{c.description && <p className="text-xs text-gray-500">{c.description}</p>}</div>
            <button onClick={() => del(c.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}</div>
      )}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Thêm danh mục" size="sm">
        <form onSubmit={create} className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">Tên *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Mô tả</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input min-h-[60px]" /></div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="h-9 px-4 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button><button type="submit" className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer">Tạo</button></div>
        </form>
      </Modal>
    </div>
  );
}

// ═══ COMPONENTS (Vật tư) ═══
function ComponentsTab() {
  const [comps, setComps] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const load = () => { setLoading(true); api.get('/products/components/list', { params: { search: search || undefined, category: filterCat || undefined } }).then(r => setComps(r.data.components || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(load, [filterCat]);
  const del = async (e, id) => { e.stopPropagation(); if (!confirm('Xóa?')) return; try { await api.delete(`/products/components/${id}`); load(); } catch (err) { alert(err.response?.data?.error || 'Lỗi'); } };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} placeholder="Tìm vật tư..." className="w-full h-9 pl-10 pr-3 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" /></div>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="h-9 px-3 border rounded-lg text-sm bg-white"><option value="">Tất cả loại</option>{Object.entries(COMP_CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
        <button onClick={() => setShowCreate(true)} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer"><Plus className="h-4 w-4" /> Thêm vật tư</button>
      </div>
      {loading ? <Spinner /> : comps.length === 0 ? <Empty icon={Wrench} text="Chưa có vật tư" /> : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Mã</th><th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tên</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Loại</th><th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Đơn giá</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tồn kho</th><th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">NCC</th><th className="w-10"></th>
          </tr></thead><tbody className="divide-y">{comps.map(c => (
            <tr key={c.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-blue-600">{c.code}</td><td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
              <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full ${COMP_CAT_COLORS[c.category] || ''}`}>{COMP_CATS[c.category] || c.category}</span></td>
              <td className="px-4 py-3 font-medium">{formatVND(c.unit_price)}/{c.unit}</td>
              <td className={`px-4 py-3 ${c.stock_quantity <= c.min_stock ? 'text-red-600 font-bold' : ''}`}>{c.stock_quantity}</td>
              <td className="px-4 py-3 text-gray-500 text-xs">{c.supplier || '—'}</td>
              <td className="px-4 py-2"><button onClick={(e) => del(e, c.id)} className="text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-4 w-4" /></button></td>
            </tr>
          ))}</tbody></table>
        </div>
      )}
      <ComponentFormModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={load} />
    </div>
  );
}

// ═══ MODALS ═══
function ProductFormModal({ open, onClose, onSaved, categories }) {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (open) setForm({ name: '', description: '', category_id: '', material: '', base_price: '', cost_price: '', unit: 'cái', stock_quantity: '0' }); }, [open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async (e) => { e.preventDefault(); setLoading(true); try { await api.post('/products', { ...form, base_price: +form.base_price || 0, cost_price: +form.cost_price || 0, stock_quantity: +form.stock_quantity || 0 }); onSaved?.(); onClose(); } catch { } setLoading(false); };
  return (
    <Modal open={open} onClose={onClose} title="Thêm sản phẩm" size="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Tên SP *</label><input value={form.name || ''} onChange={e => set('name', e.target.value)} required className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Danh mục</label><select value={form.category_id || ''} onChange={e => set('category_id', e.target.value || null)} className="input"><option value="">— Chọn —</option>{categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="block text-sm font-medium mb-1">Chất liệu</label><input value={form.material || ''} onChange={e => set('material', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Đơn vị</label><input value={form.unit || ''} onChange={e => set('unit', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Giá bán</label><input type="number" value={form.base_price || ''} onChange={e => set('base_price', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Giá vốn</label><input type="number" value={form.cost_price || ''} onChange={e => set('cost_price', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Tồn kho</label><input type="number" value={form.stock_quantity || ''} onChange={e => set('stock_quantity', e.target.value)} className="input" /></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Mô tả</label><textarea value={form.description || ''} onChange={e => set('description', e.target.value)} className="input min-h-[60px]" /></div>
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="h-10 px-4 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button><button type="submit" disabled={loading} className="h-10 px-6 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer">{loading ? 'Tạo...' : 'Tạo SP'}</button></div>
      </form>
    </Modal>
  );
}

function ComponentFormModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (open) setForm({ name: '', category: 'other', unit: 'cái', unit_price: '', supplier: '', material: '', stock_quantity: '0', min_stock: '5' }); }, [open]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async (e) => { e.preventDefault(); setLoading(true); try { await api.post('/products/components', { ...form, unit_price: +form.unit_price || 0, stock_quantity: +form.stock_quantity || 0, min_stock: +form.min_stock || 5 }); onSaved?.(); onClose(); } catch { } setLoading(false); };
  return (
    <Modal open={open} onClose={onClose} title="Thêm vật tư / thành phần" size="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Tên *</label><input value={form.name || ''} onChange={e => set('name', e.target.value)} required className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Loại</label><select value={form.category || ''} onChange={e => set('category', e.target.value)} className="input">{Object.entries(COMP_CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="block text-sm font-medium mb-1">Đơn giá</label><input type="number" value={form.unit_price || ''} onChange={e => set('unit_price', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Đơn vị</label><input value={form.unit || ''} onChange={e => set('unit', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">NCC</label><input value={form.supplier || ''} onChange={e => set('supplier', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Chất liệu</label><input value={form.material || ''} onChange={e => set('material', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Tồn kho</label><input type="number" value={form.stock_quantity || ''} onChange={e => set('stock_quantity', e.target.value)} className="input" /></div>
          <div><label className="block text-sm font-medium mb-1">Tồn tối thiểu</label><input type="number" value={form.min_stock || ''} onChange={e => set('min_stock', e.target.value)} className="input" /></div>
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="h-10 px-4 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button><button type="submit" disabled={loading} className="h-10 px-6 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer">{loading ? 'Tạo...' : 'Tạo'}</button></div>
      </form>
    </Modal>
  );
}

function ProductDetailModal({ productId, open, onClose, onUpdated }) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [components, setComponents] = useState([]);
  const [addComp, setAddComp] = useState({ component_id: '', quantity: 1 });
  const reload = () => api.get(`/products/${productId}`).then(r => setProduct(r.data.product));

  useEffect(() => { if (!open || !productId) return; setLoading(true); reload().finally(() => setLoading(false)); api.get('/products/components/list', { params: { limit: 200 } }).then(r => setComponents(r.data.components || [])); }, [open, productId]);

  const addBom = async () => { if (!addComp.component_id) return; await api.post(`/products/${productId}/structures`, addComp); setAddComp({ component_id: '', quantity: 1 }); reload(); onUpdated?.(); };
  const delBom = async (sid) => { await api.delete(`/products/${productId}/structures/${sid}`); reload(); };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={product?.name || 'Sản phẩm'} size="lg">
      {loading || !product ? <Spinner /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3"><p className="text-[11px] text-gray-500">Mã SP</p><p className="font-bold text-blue-600">{product.code}</p></div>
            <div className="bg-gray-50 rounded-lg p-3"><p className="text-[11px] text-gray-500">Giá bán</p><p className="font-bold">{formatVND(product.base_price)}</p></div>
            <div className="bg-gray-50 rounded-lg p-3"><p className="text-[11px] text-gray-500">Giá vốn</p><p className="font-bold">{formatVND(product.cost_price)}</p></div>
            <div className="bg-gray-50 rounded-lg p-3"><p className="text-[11px] text-gray-500">Chi phí BOM</p><p className="font-bold text-orange-600">{formatVND(product.bomCost)}</p></div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs text-gray-600">
            {product.material && <p>Chất liệu: <strong>{product.material}</strong></p>}
            {product.category && <p>Danh mục: <strong>{product.category.name}</strong></p>}
            <p>Tồn kho: <strong>{product.stock_quantity}</strong></p>
          </div>

          <div><h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2"><Layers className="h-4 w-4" /> Cấu trúc sản phẩm (BOM)</h3>
            {product.structures?.length > 0 && (
              <div className="bg-white rounded-lg border overflow-hidden mb-3">
                <table className="w-full text-sm"><thead className="bg-gray-50"><tr>
                  <th className="text-left px-3 py-2 text-xs text-gray-500">Mã</th><th className="text-left px-3 py-2 text-xs text-gray-500">Vật tư</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-500">Loại</th><th className="text-right px-3 py-2 text-xs text-gray-500">SL</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">Đơn giá</th><th className="text-right px-3 py-2 text-xs text-gray-500">Thành tiền</th><th className="w-8"></th>
                </tr></thead><tbody className="divide-y">{product.structures.map(s => {
                  const cost = (s.component?.unit_price || 0) * (s.quantity || 0);
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-blue-600 font-medium text-xs">{s.component?.code}</td>
                      <td className="px-3 py-2 font-medium">{s.component?.name}</td>
                      <td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full ${COMP_CAT_COLORS[s.component?.category] || ''}`}>{COMP_CATS[s.component?.category] || ''}</span></td>
                      <td className="px-3 py-2 text-right">{s.quantity} {s.component?.unit}</td>
                      <td className="px-3 py-2 text-right text-xs">{formatVND(s.component?.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatVND(cost)}</td>
                      <td className="px-3 py-2"><button onClick={() => delBom(s.id)} className="text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  );
                })}</tbody>
                <tfoot className="bg-gray-50 font-semibold"><tr><td colSpan="5" className="px-3 py-2 text-right text-xs">Tổng BOM:</td><td className="px-3 py-2 text-right text-orange-600">{formatVND(product.bomCost)}</td><td></td></tr></tfoot>
                </table>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <div className="flex-1"><label className="block text-xs font-medium mb-1">Vật tư</label>
                <select value={addComp.component_id} onChange={e => setAddComp(a => ({ ...a, component_id: e.target.value }))} className="input">
                  <option value="">— Chọn vật tư —</option>
                  {components.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name} ({formatVND(c.unit_price)}/{c.unit})</option>)}
                </select></div>
              <div className="w-24"><label className="block text-xs font-medium mb-1">SL</label>
                <input type="number" step="0.5" min="0.1" value={addComp.quantity} onChange={e => setAddComp(a => ({ ...a, quantity: +e.target.value }))} className="input" /></div>
              <button onClick={addBom} className="h-10 px-4 bg-emerald-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-emerald-700 shrink-0">+ Thêm</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}