import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown, Users } from 'lucide-react';
import { staffNameMatchesQuery } from '../lib/utils';

/** Dropdown tìm NV cho form đơn nghỉ (hỗ trợ tên rút gọn / viết tắt). */
export default function LeaveStaffSearchSelect({
  users = [],
  value,
  onChange,
  disabled = false,
  placeholder = '— Chọn NV —',
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState({});
  const btnRef = useRef(null);
  const ddRef = useRef(null);

  const selected = useMemo(
    () => (users || []).find((u) => String(u.id) === String(value || '')),
    [users, value],
  );

  const filtered = useMemo(() => {
    const list = Array.isArray(users) ? users : [];
    if (!search.trim()) return list;
    return list.filter((u) =>
      staffNameMatchesQuery(u.full_name, search)
      || String(u.email || '').toLowerCase().includes(search.trim().toLowerCase()),
    );
  }, [users, search]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const s = {
      position: 'fixed',
      left: Math.max(8, Math.min(r.left, window.innerWidth - 320)),
      width: Math.max(r.width, 280),
      zIndex: 99999,
    };
    if (vh - r.bottom < 320 && r.top > vh - r.bottom) s.bottom = vh - r.top + 4;
    else s.top = r.bottom + 4;
    setStyle(s);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      const t = e?.target;
      if (ddRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', close, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', () => setOpen(false));
    return () => {
      document.removeEventListener('pointerdown', close, true);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const dropdown = open
    ? createPortal(
      <div ref={ddRef} style={style} className="bg-white border border-violet-200 rounded-xl shadow-2xl overflow-hidden">
        <div className="p-2 border-b border-violet-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-violet-400" />
            <input
              autoFocus
              placeholder="Tìm tên, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-violet-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 border-b"
          >
            <X className="w-3.5 h-3.5" /> Không chọn
          </button>
          {filtered.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onChange(u.id); setOpen(false); setSearch(''); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-violet-50 text-left ${
                String(value) === String(u.id) ? 'bg-violet-50' : ''
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                String(value) === String(u.id) ? 'bg-violet-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}
              >
                {(u.full_name || u.email || '?').charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${String(value) === String(u.id) ? 'text-violet-800' : 'text-slate-900'}`}>
                  {u.full_name || u.email || u.id}
                </div>
                {u.email && <div className="text-xs text-slate-400 truncate">{u.email}</div>}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="py-6 text-center text-sm text-slate-400">Không tìm thấy nhân viên</div>
          )}
        </div>
        <div className="px-3 py-1.5 border-t text-[10px] text-slate-400">
          {filtered.length}/{users.length} nhân viên
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 border rounded-lg bg-white text-sm px-2 py-1.5 min-h-[34px] disabled:bg-gray-100 disabled:opacity-60 ${
          open ? 'border-violet-400 ring-2 ring-violet-200' : 'border-gray-300 hover:border-violet-300'
        }`}
      >
        {selected ? (
          <>
            <Users className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <span className="flex-1 text-left font-medium text-slate-900 truncate">{selected.full_name || selected.email}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange(''); } }}
              className="shrink-0 p-0.5 hover:bg-gray-200 rounded text-gray-400 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </span>
          </>
        ) : (
          <>
            <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="flex-1 text-left text-gray-400">{placeholder}</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          </>
        )}
      </button>
      {dropdown}
    </div>
  );
}
