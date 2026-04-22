import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, User, Phone, Building2, ChevronDown } from 'lucide-react';

/**
 * CustomerSearchPicker
 * Props:
 *   customers    — mảng { id, full_name, phone, address, tax_code, company }
 *   value        — customer_id đang chọn
 *   onChange(customer) — gọi với object { id, full_name, phone, address, tax_code, company }
 *                        hoặc null khi xóa
 *   placeholder  — text placeholder (optional)
 *   disabled     — boolean (optional)
 */
export default function CustomerSearchPicker({
  customers = [],
  value,
  onChange,
  placeholder = 'Tìm khách hàng theo tên, SĐT, MST...',
  disabled = false,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const wrapperRef = useRef(null);

  // Khách hàng đang được chọn
  const selected = useMemo(
    () => customers.find(c => c.id === value) || null,
    [customers, value]
  );

  // Lọc danh sách theo query
  const filtered = useMemo(() => {
    if (!query.trim()) return customers.slice(0, 50);
    const q = query.toLowerCase();
    return customers
      .filter(c =>
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.tax_code || '').includes(q) ||
        (c.company || '').toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [customers, query]);

  // Đóng dropdown khi click bên ngoài
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset highlighted khi query đổi
  useEffect(() => { setHighlighted(0); }, [query]);

  const pick = (customer) => {
    onChange(customer);
    setOpen(false);
    setQuery('');
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange(null);
    setQuery('');
    setOpen(false);
  };

  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    if (e.key === 'Enter' && filtered[highlighted]) { e.preventDefault(); pick(filtered[highlighted]); }
    if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  // Cuộn item được highlight vào view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[highlighted];
    if (item) item.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  return (
    <div ref={wrapperRef} className="relative">
      {/* Trigger button — hiện khi chưa mở */}
      {!open ? (
        <button
          type="button"
          onClick={openDropdown}
          disabled={disabled}
          className={`w-full h-10 px-3 border rounded-lg text-sm text-left flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-300 transition-colors
            ${disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-white hover:border-blue-400 cursor-pointer'}
            ${selected ? 'text-gray-900' : 'text-gray-400'}`}
        >
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <span className="flex-1 truncate">
            {selected
              ? <><span className="font-medium">{selected.full_name}</span>{selected.phone ? <span className="text-gray-400 ml-1.5">· {selected.phone}</span> : null}</>
              : placeholder
            }
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {selected && (
              <span onClick={clear} className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500 cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </div>
        </button>
      ) : (
        /* Input tìm kiếm — hiện khi mở */
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full h-10 pl-9 pr-8 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
          />
          <button type="button" onClick={() => { setOpen(false); setQuery(''); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Dropdown danh sách kết quả */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-xl overflow-hidden">
          {/* Option "Nhập mới / Không chọn" */}
          <div
            onClick={() => pick(null)}
            className="px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 cursor-pointer border-b flex items-center gap-2"
          >
            <X className="h-3.5 w-3.5" /> Không chọn / nhập tên mới bên dưới
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-5 text-xs text-gray-400 text-center">
              Không tìm thấy khách hàng nào
            </div>
          ) : (
            <ul ref={listRef} className="max-h-56 overflow-y-auto">
              {filtered.map((c, idx) => (
                <li
                  key={c.id}
                  onMouseEnter={() => setHighlighted(idx)}
                  onClick={() => pick(c)}
                  className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${idx === highlighted ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.full_name}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      {c.phone && (
                        <span className="text-[11px] text-gray-500 flex items-center gap-0.5">
                          <Phone className="h-3 w-3" />{c.phone}
                        </span>
                      )}
                      {c.tax_code && (
                        <span className="text-[11px] text-gray-500 flex items-center gap-0.5">
                          <Building2 className="h-3 w-3" />MST: {c.tax_code}
                        </span>
                      )}
                      {c.company && (
                        <span className="text-[11px] text-gray-400 truncate">{c.company}</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="px-3 py-1.5 bg-gray-50 border-t text-[10px] text-gray-400">
            {filtered.length < customers.length
              ? `Hiển thị ${filtered.length} / ${customers.length} khách hàng`
              : `${customers.length} khách hàng`}
            {' · '}↑↓ chọn, Enter xác nhận, Esc đóng
          </div>
        </div>
      )}
    </div>
  );
}
