import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { formatVND } from '../lib/utils';
import { Search, Package, X, Plus, ChevronDown, ChevronRight, Boxes, Tag } from 'lucide-react';

/**
 * ProductSearchPicker — Component tìm kiếm & chọn sản phẩm dùng chung
 * Dùng cho: Báo giá, Đơn hàng, Hóa đơn
 * 
 * Props:
 *  - onSelect(product): callback khi chọn sản phẩm
 *  - onClose(): đóng picker
 *  - multiSelect?: cho phép chọn nhiều SP cùng lúc
 *  - onSelectMulti?(products[]): callback khi chọn nhiều
 *  - companyId?: string — lọc SP/nhóm ngành theo công ty (admin); nhân viên luôn theo company user
 */
export default function ProductSearchPicker({ onSelect, onClose, multiSelect = false, onSelectMulti, companyId: companyIdProp }) {
  const { user } = useAuth();
  const companyParams = useMemo(() => {
    if (companyIdProp) return { company_id: companyIdProp };
    if (!isAdminLike(user) && user?.company_id) return { company_id: user.company_id };
    return {};
  }, [companyIdProp, user]);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [selected, setSelected] = useState([]); // for multiSelect
  const searchRef = useRef(null);
  const [searchTimer, setSearchTimer] = useState(null);

  useEffect(() => {
    loadCategories();
    loadProducts('');
    setTimeout(() => searchRef.current?.focus(), 100);
  }, [companyParams]);

  // Debounce search → gọi API
  useEffect(() => {
    if (searchTimer) clearTimeout(searchTimer);
    const t = setTimeout(() => loadProducts(search), 300);
    setSearchTimer(t);
    return () => clearTimeout(t);
  }, [search, categoryFilter, companyParams]);

  const loadCategories = async () => {
    try {
      const { data } = await api.get('/products/categories', { params: companyParams });
      setCategories(data.categories || data || []);
    } catch {}
  };

  const loadProducts = async (q) => {
    setLoading(true);
    try {
      const params = { ...companyParams, limit: 5000 };
      if (q) params.search = q;
      if (categoryFilter) params.category_id = categoryFilter;
      const { data } = await api.get('/products', { params });
      setProducts(data.products || data || []);
    } catch {}
    setLoading(false);
  };

  // Nhóm ngành (code_group) lấy từ sản phẩm thực tế
  const codeGroups = useMemo(() => {
    const groups = {};
    products.forEach(p => {
      const g = p.code_group || p.group;
      if (g) groups[g] = (groups[g] || 0) + 1;
    });
    return Object.entries(groups).sort((a, b) => b[1] - a[1]);
  }, [products]);

  // Lọc sản phẩm — backend đã search + category, client chỉ filter group
  const filtered = useMemo(() => {
    return products.filter(p => {
      if (groupFilter) {
        const pg = p.code_group || p.group;
        if (pg !== groupFilter) return false;
      }
      return true;
    });
  }, [products, groupFilter]);

  const handleSelect = (product) => {
    if (multiSelect) {
      setSelected(prev => {
        const exists = prev.find(p => p.id === product.id);
        if (exists) return prev.filter(p => p.id !== product.id);
        return [...prev, product];
      });
    } else {
      onSelect(product);
    }
  };

  const confirmMulti = () => {
    if (onSelectMulti && selected.length > 0) {
      onSelectMulti(selected);
    }
  };

  const isSelected = (id) => selected.some(p => p.id === id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" /> Tìm kiếm sản phẩm
            </h2>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Gõ tên, mã sản phẩm, SKU để tìm..."
              className="w-full h-11 pl-10 pr-4 border-2 border-blue-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded cursor-pointer">
                <X className="h-3.5 w-3.5 text-gray-400" />
              </button>
            )}
          </div>
        </div>

        {/* Filters: Categories + Code Groups */}
        <div className="px-4 py-2 border-b bg-gray-50 space-y-2">
          {/* Nhóm ngành (Categories từ DB) */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Tag className="h-3 w-3" /> Nhóm ngành:
              </span>
              <button
                onClick={() => setCategoryFilter('')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium border cursor-pointer transition-all ${
                  !categoryFilter ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50 border-gray-200'
                }`}
              >
                Tất cả
              </button>
              {categories.filter(c => c.is_active !== false).map(cat => {
                const count = products.filter(p => p.category_id === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryFilter(categoryFilter === cat.id ? '' : cat.id)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium border cursor-pointer transition-all whitespace-nowrap ${
                      categoryFilter === cat.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50 border-gray-200'
                    }`}
                  >
                    {cat.name} {count > 0 && `(${count})`}
                  </button>
                );
              })}
            </div>
          )}

          {/* Nhóm SP (code_group) */}
          {codeGroups.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Boxes className="h-3 w-3" /> Nhóm SP:
              </span>
              <button
                onClick={() => setGroupFilter('')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium border cursor-pointer transition-all ${
                  !groupFilter ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white hover:bg-gray-50 border-gray-200'
                }`}
              >
                Tất cả
              </button>
              {codeGroups.map(([g, count]) => (
                <button
                  key={g}
                  onClick={() => setGroupFilter(groupFilter === g ? '' : g)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium border cursor-pointer transition-all whitespace-nowrap ${
                    groupFilter === g ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white hover:bg-gray-50 border-gray-200'
                  }`}
                >
                  {g} ({count})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Results count */}
        <div className="px-4 py-1.5 text-[10px] text-gray-500 border-b bg-white">
          Tìm thấy <strong>{filtered.length}</strong> sản phẩm
          {(search || categoryFilter || groupFilter) && (
            <button onClick={() => { setSearch(''); setCategoryFilter(''); setGroupFilter(''); }} className="ml-2 text-red-500 hover:underline cursor-pointer">
              Xóa bộ lọc
            </button>
          )}
          {multiSelect && selected.length > 0 && (
            <span className="ml-3 text-blue-600 font-medium">· Đã chọn {selected.length} SP</span>
          )}
        </div>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <Package className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">Không tìm thấy sản phẩm</p>
              {search && <p className="text-xs mt-1">Thử từ khóa khác hoặc xóa bộ lọc</p>}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr className="text-[10px] text-gray-500 uppercase border-b">
                  {multiSelect && <th className="py-2 px-3 w-8"></th>}
                  <th className="py-2 px-3 text-left">Mã SP</th>
                  <th className="py-2 px-3 text-left">Tên sản phẩm</th>
                  <th className="py-2 px-3 text-left">Nhóm</th>
                  <th className="py-2 px-3 text-center">ĐVT</th>
                  <th className="py-2 px-3 text-right">Giá bán</th>
                  <th className="py-2 px-3 text-right">Giá chưa VAT</th>
                  <th className="py-2 px-3 w-16 text-center">Chọn</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr
                    key={p.id}
                    className={`border-b hover:bg-blue-50/50 cursor-pointer transition-colors ${
                      isSelected(p.id) ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                    }`}
                    onClick={() => handleSelect(p)}
                  >
                    {multiSelect && (
                      <td className="py-2 px-3">
                        <input
                          type="checkbox"
                          checked={isSelected(p.id)}
                          onChange={() => {}}
                          className="h-4 w-4 rounded text-blue-600 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="py-2 px-3">
                      <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                        {p.code || p.sku || '—'}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <p className="font-medium text-gray-900">{p.name}</p>
                      {p.description && <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{p.description}</p>}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex flex-col gap-0.5">
                        {p.category?.name && (
                          <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full">{p.category.name}</span>
                        )}
                        {(p.code_group || p.group) && (
                          <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded-full">{p.code_group || p.group}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center text-gray-500">{p.unit || '—'}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-600">
                      {p.selling_price ? formatVND(p.selling_price) : p.sell_price ? formatVND(p.sell_price) : '—'}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-500">
                      {p.base_price ? formatVND(p.base_price) : '—'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={e => { e.stopPropagation(); handleSelect(p); }}
                        className={`p-1.5 rounded-lg cursor-pointer transition-all ${
                          isSelected(p.id)
                            ? 'bg-blue-600 text-white'
                            : 'hover:bg-blue-100 text-blue-600'
                        }`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {multiSelect && (
          <div className="p-3 border-t bg-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {selected.length > 0 ? `Đã chọn ${selected.length} sản phẩm` : 'Chọn sản phẩm để thêm'}
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className="h-9 px-4 border rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                Hủy
              </button>
              <button
                onClick={confirmMulti}
                disabled={selected.length === 0}
                className="h-9 px-5 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700 disabled:opacity-50"
              >
                Thêm {selected.length} sản phẩm
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ProductSearchInline — Phiên bản inline (không modal) để nhúng vào form
 * Props:
 *  - onSelect(product): callback khi chọn
 *  - className?: CSS class cho container
 */
export function ProductSearchInline({ onSelect, className = '', companyId: companyIdProp }) {
  const { user } = useAuth();
  const companyParams = useMemo(() => {
    if (companyIdProp) return { company_id: companyIdProp };
    if (!isAdminLike(user) && user?.company_id) return { company_id: user.company_id };
    return {};
  }, [companyIdProp, user]);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    api.get('/products', { params: { ...companyParams, limit: 5000 } }).then(r => setProducts(r.data.products || r.data || []));
    api.get('/products/categories', { params: companyParams }).then(r => setCategories(r.data.categories || r.data || [])).catch(() => {});
  }, [companyParams]);

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const codeGroups = [...new Set(products.map(p => p.code_group || p.group).filter(Boolean))].sort();

  const filtered = products.filter(p => {
    if (groupFilter && (p.code_group || p.group) !== groupFilter) return false;
    if (!search) return true;
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const target = `${p.name || ''} ${p.code || ''}`.toLowerCase();
    return words.every(w => target.includes(w));
  }).slice(0, 20); // Limit dropdown to 20 items

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="flex items-center gap-1.5">
        {/* Group filter */}
        <select
          value={groupFilter}
          onChange={e => setGroupFilter(e.target.value)}
          className="h-9 px-2 border rounded-lg text-xs bg-white min-w-[90px]"
        >
          <option value="">Tất cả nhóm</option>
          {codeGroups.map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>

        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            placeholder="🔍 Tìm sản phẩm..."
            className="w-full h-9 pl-8 pr-3 border rounded-lg text-xs"
          />
        </div>
      </div>

      {/* Dropdown results */}
      {showDropdown && (search || groupFilter) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-xl max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Không tìm thấy</p>
          ) : (
            filtered.map(p => (
              <button
                key={p.id}
                onClick={() => { onSelect(p); setSearch(''); setShowDropdown(false); }}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50 text-left cursor-pointer border-b last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] bg-blue-50 text-blue-700 px-1 py-0.5 rounded font-bold shrink-0">
                      {p.code || '—'}
                    </span>
                    <span className="text-xs font-medium text-gray-900 truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {(p.code_group || p.group) && (
                      <span className="text-[9px] bg-gray-100 px-1 py-0.5 rounded">{p.code_group || p.group}</span>
                    )}
                    <span className="text-[9px] text-gray-400">{p.unit || ''}</span>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-xs font-bold text-emerald-600">
                    {p.selling_price ? formatVND(p.selling_price) : p.base_price ? formatVND(p.base_price) : '—'}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
