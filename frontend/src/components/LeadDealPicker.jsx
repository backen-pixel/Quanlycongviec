import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Briefcase, Building2, MapPin, User, ChevronDown, Loader2, AlertTriangle } from 'lucide-react';
import api from '../lib/api';

/**
 * LeadDealPicker — picker chọn deal/lead cho báo giá / đơn hàng.
 * Props:
 *   value        — { id, code, title, company_id, company_name, region_id, region_name, ... } đã chọn (object) hoặc null
 *   onChange(deal | null) — emit object đầy đủ (để form đồng bộ company/region) hoặc null khi xoá
 *   type         — 'deal' (default) | 'lead'
 *   customerId   — filter theo customer (gợi ý ngay deal của KH đang chọn)
 *   placeholder
 *   disabled
 *   warnOrphan   — boolean: hiện badge cảnh báo khi chưa chọn (mặc định true)
 */
export default function LeadDealPicker({
  value,
  onChange,
  type = 'deal',
  customerId = null,
  placeholder = 'Tìm deal theo mã / tên / SĐT khách...',
  disabled = false,
  warnOrphan = true,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef(null);
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  const fetchResults = useCallback(async (q) => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams();
      params.set('type', type);
      params.set('limit', '20');
      if (q) params.set('q', q);
      if (customerId) params.set('customer_id', customerId);
      const { data } = await api.get(`/crm/leads/picker?${params.toString()}`);
      setResults(data.results || []);
    } catch (e) {
      setResults([]);
      setLoadError(e.response?.data?.error || 'Không tải được danh sách deal');
    }
    setLoading(false);
  }, [type, customerId]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, fetchResults]);

  // Open / close
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

  useEffect(() => { setHighlighted(0); }, [query, results.length]);

  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const pick = (deal) => {
    onChange(deal);
    setOpen(false);
    setQuery('');
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange(null);
    setQuery('');
    setOpen(false);
  };

  const handleKey = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[highlighted]) pick(results[highlighted]); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  const labelText = type === 'lead' ? 'lead' : 'deal';

  return (
    <div ref={wrapperRef} className="relative w-full">
      {!open && (
        <button
          type="button"
          onClick={openDropdown}
          disabled={disabled}
          className={`w-full h-10 px-3 rounded-lg border flex items-center gap-2 text-left transition ${
            value
              ? 'border-emerald-300 bg-emerald-50/60 hover:bg-emerald-50'
              : warnOrphan
                ? 'border-amber-300 bg-amber-50/60 hover:bg-amber-50'
                : 'border-gray-300 bg-white hover:bg-gray-50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <Briefcase className={`h-4 w-4 flex-shrink-0 ${value ? 'text-emerald-600' : warnOrphan ? 'text-amber-600' : 'text-gray-400'}`} />
          {value ? (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold text-emerald-800">{value.code || value.id?.slice(0, 8)}</span>
                <span className="text-sm font-medium text-gray-900 truncate">{value.title || '—'}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-600">
                {value.company_name && (
                  <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{value.company_name}</span>
                )}
                {value.region_name && (
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{value.region_name}</span>
                )}
                {value.assignee_name && (
                  <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{value.assignee_name}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-2">
              {warnOrphan && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
              <span className={`text-sm ${warnOrphan ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                {warnOrphan ? `Chưa gắn ${labelText} — báo giá sẽ "mồ côi"` : `Chọn ${labelText}…`}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            {value && (
              <span onClick={clear} role="button" tabIndex={-1}
                className="p-1 hover:bg-red-100 rounded cursor-pointer">
                <X className="h-3.5 w-3.5 text-red-500" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </div>
        </button>
      )}

      {open && (
        <div className="w-full">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder={placeholder}
              className="w-full h-10 pl-9 pr-9 rounded-lg border-2 border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 text-sm"
            />
            {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 animate-spin" />}
          </div>

          <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
            {!loading && loadError && (
              <div className="px-4 py-6 text-center text-sm text-red-600">
                {loadError}
              </div>
            )}
            {!loading && !loadError && results.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-500">
                Không tìm thấy {labelText} nào{customerId ? ' của khách hàng này' : ''}.
              </div>
            )}
            {results.map((d, idx) => (
              <button
                key={d.id}
                type="button"
                onClick={() => pick(d)}
                onMouseEnter={() => setHighlighted(idx)}
                className={`w-full text-left px-3 py-2 border-b last:border-b-0 transition ${
                  idx === highlighted ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-blue-700">{d.code || d.id.slice(0, 8)}</span>
                  <span className="text-sm font-medium text-gray-900 flex-1 truncate">{d.title || '—'}</span>
                  {d.estimated_value > 0 && (
                    <span className="text-[10px] font-mono text-emerald-700">
                      {new Intl.NumberFormat('vi-VN').format(d.estimated_value)}đ
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-600">
                  {d.customer_name && (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />{d.customer_name}
                      {d.customer_phone && <span className="text-gray-400">· {d.customer_phone}</span>}
                    </span>
                  )}
                  {d.company_name && (
                    <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{d.company_name}</span>
                  )}
                  {d.region_name && (
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{d.region_name}</span>
                  )}
                  {d.assignee_name && (
                    <span className="inline-flex items-center gap-1 text-purple-700"><User className="h-3 w-3" />{d.assignee_name}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
