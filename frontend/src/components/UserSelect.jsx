import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { getInitials, avatarColor } from '../lib/utils';

// ═══ Searchable User Select ═══
// Usage: <UserSelect value={userId} onChange={setUserId} users={[{id,full_name,role}]} />
export default function UserSelect({ value, onChange, users, placeholder, className, size }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 240 });

  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const dropH = 240; // max dropdown height
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const showAbove = spaceBelow < dropH && r.top > dropH;
      setPos({
        top: showAbove ? r.top - dropH - 4 : r.bottom + 4,
        left: Math.max(8, Math.min(r.left, window.innerWidth - 252)),
        width: Math.max(240, r.width),
      });
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u => u.full_name?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  }, [users, search]);
  const selected = users.find(u => u.id === value);
  const sm = size === 'sm';

  return (
    <div className={`relative ${className || ''}`}>
      <button ref={btnRef} type="button" onClick={() => setOpen(!open)}
        className={`w-full ${sm ? 'h-7' : 'h-8'} px-2 text-xs border rounded-md bg-white flex items-center gap-1.5 text-left cursor-pointer hover:border-blue-300`}>
        {selected ? (
          <>
            <div className={`${sm ? 'h-4 w-4 text-[6px]' : 'h-5 w-5 text-[7px]'} rounded-full flex items-center justify-center text-white font-bold shrink-0`}
              style={{ backgroundColor: avatarColor(selected.full_name) }}>{getInitials(selected.full_name)}</div>
            <span className="truncate flex-1">{selected.full_name}</span>
          </>
        ) : <span className="text-gray-400 flex-1 truncate">{placeholder || '— Chọn NV —'}</span>}
        <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => { setOpen(false); setSearch(''); }} />
          <div className="fixed z-[9999] bg-white rounded-lg shadow-xl border max-h-60 overflow-hidden flex flex-col"
            style={{ top: pos.top, left: pos.left, width: pos.width }}>
            <div className="p-1.5 border-b shrink-0">
              <div className="flex items-center gap-1.5 px-2 bg-gray-50 rounded-md">
                <Search className="h-3 w-3 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm nhân viên..."
                  className="flex-1 h-7 text-xs bg-transparent outline-none" autoFocus />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              <button type="button" onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer ${!value ? 'bg-blue-50 text-blue-600' : 'text-gray-500'}`}>
                — Chưa chỉ định —
              </button>
              {filtered.map(u => (
                <button type="button" key={u.id} onClick={() => { onChange(u.id); setOpen(false); setSearch(''); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer flex items-center gap-2 ${value === u.id ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'}`}>
                  <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[7px] font-bold shrink-0"
                    style={{ backgroundColor: avatarColor(u.full_name) }}>{getInitials(u.full_name)}</div>
                  <span className="flex-1 truncate">{u.full_name}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{u.role}</span>
                </button>
              ))}
              {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-3">Không tìm thấy</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
