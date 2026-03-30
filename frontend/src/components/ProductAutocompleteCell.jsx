import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { formatVND } from '../lib/utils';

/**
 * ProductAutocompleteCell — Ô nhập tên SP có gợi ý tự động
 * Gõ tên/mã SP → hiện dropdown gợi ý → click chọn → tự điền đầy đủ thông tin dòng
 *
 * Props:
 *  - value: string (tên SP hiện tại)
 *  - onChange(name): cập nhật tên SP thủ công
 *  - onSelectProduct(product): callback khi chọn SP từ gợi ý → parent tự fill row
 *  - products?: product[] (truyền sẵn danh sách SP, nếu không sẽ tự fetch)
 *  - placeholder?: string
 *  - className?: string
 */
export default function ProductAutocompleteCell({
  value, onChange, onSelectProduct, products: propProducts, placeholder = 'Gõ tên SP để tìm...', className = '',
}) {
  const [localProducts, setLocalProducts] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [search, setSearch] = useState(value || '');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const products = propProducts || localProducts;

  // Fetch products if not provided
  useEffect(() => {
    if (!propProducts) {
      api.get('/products', { params: { limit: 5000 } })
        .then(r => setLocalProducts(r.data.products || r.data || []))
        .catch(() => {});
    }
  }, [propProducts]);

  // Sync value from parent
  useEffect(() => { setSearch(value || ''); }, [value]);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filter products matching search — hỗ trợ tìm nhiều từ: "tủ trên" → match "tủ bếp trên"
  const filtered = search.length >= 1
    ? products.filter(p => {
        const words = search.toLowerCase().split(/\s+/).filter(Boolean);
        const target = `${p.name || ''} ${p.code || ''} ${p.sku || ''}`.toLowerCase();
        return words.every(w => target.includes(w));
      }).slice(0, 12)
    : [];

  const handleInputChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    onChange(val);
    setShowDropdown(val.length >= 1);
    setHighlightIdx(-1);
  };

  const handleSelect = (product) => {
    setSearch(product.name);
    setShowDropdown(false);
    setHighlightIdx(-1);
    onSelectProduct(product);
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault();
      handleSelect(filtered[highlightIdx]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        value={search}
        onChange={handleInputChange}
        onFocus={() => { if (search.length >= 1) setShowDropdown(true); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-1 py-0.5 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 text-xs outline-none bg-transparent"
      />

      {/* Dropdown gợi ý */}
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-[100] top-full left-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-xl max-h-52 overflow-y-auto w-[340px]">
          {filtered.map((p, i) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              onMouseEnter={() => setHighlightIdx(i)}
              className={`w-full flex items-start gap-2 px-2.5 py-2 text-left cursor-pointer border-b last:border-0 transition-colors ${
                i === highlightIdx ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {p.code && (
                    <span className="shrink-0 font-mono text-[10px] bg-blue-50 text-blue-700 px-1 py-0.5 rounded font-bold">
                      {p.code}
                    </span>
                  )}
                  <span className="text-xs font-medium text-gray-900 truncate">{p.name}</span>
                </div>
                {p.description && (
                  <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{p.description}</p>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  {(p.code_group) && (
                    <span className="text-[9px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded">{p.code_group}</span>
                  )}
                  {p.unit && <span className="text-[9px] text-gray-400">{p.unit}</span>}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-bold text-emerald-600">
                  {p.base_price ? formatVND(p.base_price) : p.selling_price ? formatVND(p.selling_price) : ''}
                </p>
              </div>
            </button>
          ))}
          <div className="px-2.5 py-1.5 bg-gray-50 text-[10px] text-gray-400 border-t">
            {filtered.length} kết quả · ↑↓ chọn · Enter xác nhận
          </div>
        </div>
      )}

      {/* Hint: no results */}
      {showDropdown && search.length >= 2 && filtered.length === 0 && (
        <div className="absolute z-[100] top-full left-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg w-[240px] p-3 text-center">
          <p className="text-xs text-gray-400">Không tìm thấy SP "{search}"</p>
          <p className="text-[10px] text-gray-300 mt-0.5">Nhập tay hoặc dùng nút Tìm SP</p>
        </div>
      )}
    </div>
  );
}
