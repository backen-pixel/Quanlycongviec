import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../lib/api';
import { isoToDatetimeLocalValue, datetimeLocalValueToIso, defaultDealEventStartLocalValue } from '../lib/datetimeLocal';
import { Search, X, Check, ChevronLeft, Users } from 'lucide-react';
import MultiDayDatePicker from './MultiDayDatePicker';

/** Module/Khối — phân loại sự kiện theo khối. */
export const EVENT_MODULE_OPTIONS = [
  { value: '', label: 'Tất cả khối', emoji: '🌐', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'crm', label: 'Kinh doanh', emoji: '💼', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  { value: 'production', label: 'Sản xuất', emoji: '🏭', color: 'bg-violet-100 text-violet-700 border-violet-200' },
  { value: 'logistics', label: 'Lắp đặt', emoji: '🔧', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'general', label: 'Chung công ty', emoji: '🏢', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
];

// ═══════════════════════════════════════════════════════════════
// SEARCH SELECT — Generic dropdown search (Deal, KH, etc.)
// ═══════════════════════════════════════════════════════════════
function SearchSelect({ items, value, onChange, placeholder = 'Tìm...', icon = '🔍', onQueryChange = null, emptyText = 'Không tìm thấy' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState({});
  const btnRef = useRef(null);
  const ddRef = useRef(null);

  const selected = items.find(i => String(i.id) === String(value));

  useLayoutEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const s = { position: 'fixed', left: Math.max(8, Math.min(r.left, window.innerWidth - 340)), width: Math.max(r.width, 320), zIndex: 99999 };
      if (vh - r.bottom < 320 && r.top > vh - r.bottom) s.bottom = vh - r.top + 4;
      else s.top = r.bottom + 4;
      setStyle(s);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      const t = e?.target;
      if (ddRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('pointerdown', close, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !onQueryChange) return undefined;
    const t = setTimeout(() => onQueryChange(search), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, open, onQueryChange]);

  const filtered = onQueryChange ? items : items.filter(i => {
    if (!search) return true;
    const s = search.toLowerCase();
    return i.label?.toLowerCase().includes(s) || i.sub?.toLowerCase().includes(s);
  });

  const dropdown = open ? createPortal(
      <div ref={ddRef} style={style} className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input autoFocus placeholder={placeholder} value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto">
          <button onClick={() => { onChange(''); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 border-b">
            <X className="w-3.5 h-3.5" /> Không chọn
          </button>
          {filtered.map(i => (
            <button key={i.id} onClick={() => { onChange(i.id); setOpen(false); setSearch(''); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 text-left ${value === i.id ? 'bg-blue-50' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${value === i.id ? 'text-blue-700' : 'text-gray-900'}`}>{i.label}</div>
                {i.sub && <div className="text-xs text-gray-400 truncate">{i.sub}</div>}
              </div>
              {value === i.id && <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />}
            </button>
          ))}
          {filtered.length === 0 && <div className="py-6 text-center text-sm text-gray-400">{emptyText}</div>}
        </div>
        <div className="px-3 py-1.5 border-t text-xs text-gray-400">{filtered.length}/{items.length} kết quả</div>
      </div>
    , document.body) : null;

  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 border rounded-lg bg-white text-sm px-3 py-2 min-h-[40px] cursor-pointer ${open ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-300 hover:border-blue-400'}`}>
        {selected ? (
          <>
            <span className="shrink-0">{icon}</span>
            <span className="flex-1 text-left font-medium text-gray-900 truncate">{selected.label}</span>
            <button type="button" onClick={e => { e.stopPropagation(); onChange(''); }} className="shrink-0 p-0.5 hover:bg-gray-200 rounded text-gray-400"><X className="w-3 h-3" /></button>
          </>
        ) : (
          <>
            <span className="shrink-0 text-gray-400">{icon}</span>
            <span className="flex-1 text-left text-gray-400">{placeholder}</span>
            <ChevronLeft className="w-3.5 h-3.5 text-gray-400 shrink-0 -rotate-90" />
          </>
        )}
      </button>
      {dropdown}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// USER SEARCH SELECT — Chọn 1 nhân viên (dropdown search giống EmployeePicker)
// ═══════════════════════════════════════════════════════════════
function UserSearchSelect({ users, value, onChange, placeholder = '👤 Chọn nhân viên...' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState({});
  const btnRef = useRef(null);
  const ddRef = useRef(null);

  const selected = users.find(u => u.id === value);

  useLayoutEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const s = { position: 'fixed', left: Math.max(8, Math.min(r.left, window.innerWidth - 320)), width: Math.max(r.width, 300), zIndex: 99999 };
      if (vh - r.bottom < 320 && r.top > vh - r.bottom) s.bottom = vh - r.top + 4;
      else s.top = r.bottom + 4;
      setStyle(s);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      const t = e?.target;
      if (ddRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('pointerdown', close, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const filtered = users.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return u.full_name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s);
  });

  const dropdown = open ? createPortal(
      <div ref={ddRef} style={style} className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input autoFocus placeholder="Tìm tên, email..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto">
          <button onClick={() => { onChange(''); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 border-b">
            <X className="w-3.5 h-3.5" /> Không chọn
          </button>
          {filtered.map(u => (
            <button key={u.id} onClick={() => { onChange(u.id); setOpen(false); setSearch(''); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 text-left ${value === u.id ? 'bg-blue-50' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${value === u.id ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {u.avatar ? <img src={u.avatar} className="w-7 h-7 rounded-full object-cover" /> : (u.full_name || '?').charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${value === u.id ? 'text-blue-700' : 'text-gray-900'}`}>{u.full_name}</div>
                {u.email && <div className="text-xs text-gray-400 truncate">{u.email}</div>}
              </div>
              {value === u.id && <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />}
            </button>
          ))}
          {filtered.length === 0 && <div className="py-6 text-center text-sm text-gray-400">Không tìm thấy</div>}
        </div>
        <div className="px-3 py-1.5 border-t text-xs text-gray-400">{filtered.length}/{users.length} nhân viên</div>
      </div>
    , document.body) : null;

  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 border rounded-lg bg-white text-sm px-3 py-2 min-h-[40px] ${open ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-300 hover:border-blue-400'}`}>
        {selected ? (
          <>
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              {selected.avatar ? <img src={selected.avatar} className="w-6 h-6 rounded-full object-cover" /> :
                <span className="text-xs font-bold text-blue-600">{(selected.full_name || '?').charAt(0)}</span>}
            </div>
            <span className="flex-1 text-left font-medium text-gray-900 truncate">{selected.full_name}</span>
            <button type="button" onClick={e => { e.stopPropagation(); onChange(''); }} className="shrink-0 p-0.5 hover:bg-gray-200 rounded text-gray-400"><X className="w-3 h-3" /></button>
          </>
        ) : (
          <>
            <Users className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="flex-1 text-left text-gray-400">{placeholder}</span>
            <ChevronLeft className="w-3.5 h-3.5 text-gray-400 shrink-0 -rotate-90" />
          </>
        )}
      </button>
      {dropdown}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// USER MULTI SELECT — Chọn nhiều nhân viên (dropdown search + chips)
// ═══════════════════════════════════════════════════════════════
function UserMultiSelect({ users, value = [], onChange, placeholder = '👥 Chọn người tham gia...' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState({});
  const btnRef = useRef(null);
  const ddRef = useRef(null);

  const selectedUsers = users.filter(u => value.includes(u.id));

  useLayoutEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const s = { position: 'fixed', left: Math.max(8, Math.min(r.left, window.innerWidth - 320)), width: Math.max(r.width, 300), zIndex: 99999 };
      if (vh - r.bottom < 360 && r.top > vh - r.bottom) s.bottom = vh - r.top + 4;
      else s.top = r.bottom + 4;
      setStyle(s);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      const t = e?.target;
      if (ddRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('pointerdown', close, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const toggle = (uid) => {
    onChange(value.includes(uid) ? value.filter(id => id !== uid) : [...value, uid]);
  };

  const filtered = users.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return u.full_name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s);
  });

  const dropdown = open ? createPortal(
      <div ref={ddRef} style={style} className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input autoFocus placeholder="Tìm tên, email..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>
        {/* Selected chips */}
        {selectedUsers.length > 0 && (
          <div className="px-2 py-1.5 border-b flex flex-wrap gap-1">
            {selectedUsers.map(u => (
              <span key={u.id} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                {u.full_name}
                <button onClick={(e) => { e.stopPropagation(); toggle(u.id); }} className="hover:text-red-500 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="max-h-56 overflow-y-auto">
          {filtered.map(u => {
            const isSelected = value.includes(u.id);
            return (
              <button key={u.id} onClick={() => toggle(u.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 text-left ${isSelected ? 'bg-blue-50/50' : ''}`}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  {u.avatar ? <img src={u.avatar} className="w-7 h-7 rounded-full object-cover" /> : (u.full_name || '?').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>{u.full_name}</div>
                  {u.email && <div className="text-xs text-gray-400 truncate">{u.email}</div>}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="py-6 text-center text-sm text-gray-400">Không tìm thấy</div>}
        </div>
        <div className="px-3 py-1.5 border-t text-xs text-gray-400 flex justify-between">
          <span>{value.length} đã chọn / {users.length} nhân viên</span>
          {value.length > 0 && <button onClick={() => onChange([])} className="text-red-500 hover:underline cursor-pointer">Bỏ chọn tất cả</button>}
        </div>
      </div>
    , document.body) : null;

  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 border rounded-lg bg-white text-sm px-3 py-2 min-h-[40px] ${open ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-300 hover:border-blue-400'}`}>
        {selectedUsers.length > 0 ? (
          <>
            <div className="flex -space-x-1.5 shrink-0">
              {selectedUsers.slice(0, 5).map(u => (
                <div key={u.id} className="w-6 h-6 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-blue-700" title={u.full_name}>
                  {u.avatar ? <img src={u.avatar} className="w-6 h-6 rounded-full object-cover" /> : (u.full_name || '?').charAt(0)}
                </div>
              ))}
              {selectedUsers.length > 5 && <div className="w-6 h-6 rounded-full bg-gray-300 border-2 border-white flex items-center justify-center text-[9px] font-bold text-gray-600">+{selectedUsers.length - 5}</div>}
            </div>
            <span className="flex-1 text-left text-sm text-gray-700 truncate">{selectedUsers.length} người tham gia</span>
            <button type="button" onClick={e => { e.stopPropagation(); onChange([]); }} className="shrink-0 p-0.5 hover:bg-gray-200 rounded text-gray-400"><X className="w-3 h-3" /></button>
          </>
        ) : (
          <>
            <Users className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="flex-1 text-left text-gray-400">{placeholder}</span>
            <ChevronLeft className="w-3.5 h-3.5 text-gray-400 shrink-0 -rotate-90" />
          </>
        )}
      </button>
      {dropdown}
    </div>
  );
}

/** Bỏ tiền tố «Tên loại - » nếu khớp một loại trong danh sách */
function stripEventTypeTitlePrefix(title, types) {
  let rest = (title || '').trim();
  for (const opt of types || []) {
    const prefix = `${opt.name} - `;
    if (rest.startsWith(prefix)) {
      rest = rest.slice(prefix.length).trim();
      break;
    }
  }
  return rest;
}

const EVENT_HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const EVENT_MINUTES_5 = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

function snapMinuteToStep5(m) {
  const n = parseInt(String(m || '0'), 10);
  if (Number.isNaN(n)) return '00';
  const s = Math.min(55, Math.round(n / 5) * 5);
  return String(s).padStart(2, '0');
}

/** Chuỗi datetime-local → tách để chọn 24h rõ ràng */
function splitLocalDateTime24h(localStr) {
  if (!localStr || typeof localStr !== 'string' || !localStr.trim()) {
    return { date: '', hour: '09', minute: '00' };
  }
  const s = localStr.trim();
  if (!s.includes('T')) {
    return { date: s.slice(0, 10) || '', hour: '09', minute: '00' };
  }
  const [date, timePart] = s.split('T');
  const hm = (timePart || '09:00').slice(0, 5).split(':');
  let h = parseInt(hm[0], 10);
  let mi = parseInt(hm[1], 10);
  if (Number.isNaN(h)) h = 9;
  if (Number.isNaN(mi)) mi = 0;
  h = Math.min(23, Math.max(0, h));
  return {
    date: date || '',
    hour: String(h).padStart(2, '0'),
    minute: snapMinuteToStep5(mi),
  };
}

function joinLocalDateTime24h(date, hour, minute) {
  if (!date || String(date).trim() === '') return '';
  const h = hour != null && hour !== '' ? String(hour).padStart(2, '0') : '09';
  const m = minute != null && minute !== '' ? snapMinuteToStep5(minute) : '00';
  return `${date}T${h}:${m}`;
}

/** Loại sự kiện cho phép chọn nhiều ngày (lắp đặt / vận chuyển / lấy hàng). */
export const MULTI_DAY_EVENT_TYPE_SLUGS = new Set(['installation', 'delivery', 'pickup']);

/** Ngày (lịch) + giờ/phút chọn list — luôn dạng 24 giờ */
function EventDateTime24hPickers({ label, required, value, onChange, hint }) {
  const p = splitLocalDateTime24h(value || '');
  const hasDate = !!p.date;

  const update = (patch) => {
    const next = { ...p, ...patch };
    if (!next.date || String(next.date).trim() === '') {
      onChange('');
      return;
    }
    onChange(joinLocalDateTime24h(next.date, next.hour, next.minute));
  };

  return (
    <div>
      <label className="text-xs font-semibold text-gray-800 block mb-1.5">
        {label} {required ? '*' : ''}
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <input
          type="date"
          value={p.date}
          onChange={(e) => update({ date: e.target.value })}
          className="flex-1 min-w-[158px] h-11 px-3 border border-gray-300 rounded-xl text-sm bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <div className={`flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-1 shadow-sm ${!hasDate ? 'opacity-45' : ''}`}>
          <select
            value={p.hour}
            disabled={!hasDate}
            onChange={(e) => update({ hour: e.target.value })}
            aria-label="Giờ (0–23)"
            className="h-11 min-w-[4.25rem] pl-2 pr-6 py-1 border-0 rounded-lg text-sm font-mono font-semibold text-gray-900 bg-transparent cursor-pointer disabled:cursor-not-allowed"
          >
            {EVENT_HOURS_24.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <span className="text-gray-400 font-bold select-none">:</span>
          <select
            value={EVENT_MINUTES_5.includes(p.minute) ? p.minute : snapMinuteToStep5(p.minute)}
            disabled={!hasDate}
            onChange={(e) => update({ minute: e.target.value })}
            aria-label="Phút (bước 5)"
            className="h-11 min-w-[4.25rem] pl-2 pr-6 py-1 border-0 rounded-lg text-sm font-mono font-semibold text-gray-900 bg-transparent cursor-pointer disabled:cursor-not-allowed"
          >
            {EVENT_MINUTES_5.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md mb-0.5">
          24h
        </span>
      </div>
      {hint ? <p className="text-[10px] text-gray-500 mt-1">{hint}</p> : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EVENT CREATE/EDIT MODAL
// ═══════════════════════════════════════════════════════════════
export default function EventCreateModal({
  event, presetDay, eventTypes = [], users = [], onClose, onSaved,
  defaultModule = 'crm', allowedModules = null, allowGeneralModule = false,
  /** Nhãn hiển thị khi defaultModule là module tùy chỉnh */
  defaultModuleLabel = '',
  /** Công ty gắn sự kiện — bắt buộc khi không có lead (để lịch lọc theo công ty vẫn thấy). */
  defaultCompanyId = '',
  defaultLeadId = '',
  defaultLead = null,
  lockLead = false,
  defaultCustomerId = '',
  defaultAssigneeId = '',
  defaultTitle = '',
  defaultLocation = '',
  defaultDescription = '',
  defaultEventType = '',
  defaultProjectId = '',
}) {
  const isEdit = !!event;
  const participantsAutoFilled = useRef(false);
  const toLocalDateTimeInput = (value) => isoToDatetimeLocalValue(value);
  const startFromPreset = () => {
    if (!presetDay || event) return '';
    const d = new Date(presetDay.year, presetDay.month - 1, presetDay.day, 9, 0, 0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const defaultStartLocal = toLocalDateTimeInput(event?.start_time) || startFromPreset() || (event ? '' : defaultDealEventStartLocalValue());
  const [form, setForm] = useState({
    title: event?.title || defaultTitle || '',
    event_type: event?.event_type || defaultEventType || 'site_visit',
    description: event?.description || defaultDescription || '',
    location: event?.location || defaultLocation || '',
    start_time: defaultStartLocal,
    end_time: toLocalDateTimeInput(event?.end_time),
    all_day: event?.all_day || false,
    lead_id: event?.lead_id || defaultLeadId || defaultLead?.id || '',
    customer_id: event?.customer_id || defaultCustomerId || defaultLead?.customer_id || '',
    assignee_id: event?.assignee_id || defaultAssigneeId || defaultLead?.assigned_to || defaultLead?.lead_owner_id || (() => {
      try { return JSON.parse(localStorage.getItem('user') || '{}')?.id || ''; } catch { return ''; }
    })(),
    result: event?.result || '',
    status: event?.status || 'planned',
    module: event?.module || defaultModule || 'crm',
  });
  const initialOcc = (() => {
    const raw = event?.occurrence_dates;
    if (Array.isArray(raw) && raw.length) {
      return raw.map((d) => String(d).slice(0, 10)).filter(Boolean).sort();
    }
    const st = defaultStartLocal;
    const ymd = st?.slice(0, 10);
    return ymd ? [ymd] : [];
  })();
  const [occurrenceDates, setOccurrenceDates] = useState(initialOcc);
  const [participantIds, setParticipantIds] = useState(
    event?.participants?.map(p => p.user_id) || []
  );
  const [leads, setLeads] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const defaultLeadRef = useRef(defaultLead);
  defaultLeadRef.current = defaultLead;

  const linkForModule = ['logistics', 'production', 'crm'].includes(String(form.module || ''))
    ? String(form.module)
    : '';
  const scopeCustomersToDeals = linkForModule === 'logistics' || linkForModule === 'production';

  /** Tạo mới: mặc định mời người đang đăng nhập (không spam cả công ty). */
  useEffect(() => {
    if (isEdit || participantsAutoFilled.current) return;
    participantsAutoFilled.current = true;
    try {
      const me = JSON.parse(localStorage.getItem('user') || '{}')?.id;
      if (me) setParticipantIds([me]);
    } catch { /* ignore */ }
  }, [isEdit]);

  const customersFromDeals = (list) => {
    const map = new Map();
    for (const l of list || []) {
      const cid = l.customer_id || l.customer?.id;
      if (!cid) continue;
      map.set(String(cid), {
        id: cid,
        full_name: l.customer_name || l.customer?.full_name || 'Khách hàng',
        phone: l.customer_phone || l.customer?.phone || '',
        email: l.customer?.email || '',
      });
    }
    const extra = defaultLeadRef.current;
    if (extra?.customer_id && !map.has(String(extra.customer_id))) {
      map.set(String(extra.customer_id), {
        id: extra.customer_id,
        full_name: extra.customer?.full_name || extra.customer_name || 'Khách hàng',
        phone: extra.customer?.phone || '',
        email: extra.customer?.email || '',
      });
    }
    return [...map.values()];
  };

  const applyPickerRows = (rows) => {
    const extra = defaultLeadRef.current;
    let list = Array.isArray(rows) ? rows : [];
    if (extra?.id && !list.some((l) => String(l.id) === String(extra.id))) {
      list = [extra, ...list];
    }
    setLeads(list);
    if (scopeCustomersToDeals) setCustomers(customersFromDeals(list));
  };

  const fetchLinkDeals = useCallback(async (q = '') => {
    if (lockLead) return;
    try {
      const params = { type: 'deal', limit: 40 };
      if (String(q || '').trim()) params.q = String(q).trim();
      if (defaultCompanyId) params.company_id = defaultCompanyId;
      if (linkForModule) params.for_module = linkForModule;
      const { data } = await api.get('/crm/leads/picker', { params });
      applyPickerRows(data?.results || []);
    } catch {
      applyPickerRows([]);
    }
  }, [lockLead, defaultCompanyId, linkForModule, scopeCustomersToDeals]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lockLead) {
      if (defaultLead?.id) {
        setLeads([defaultLead]);
        if (scopeCustomersToDeals) setCustomers(customersFromDeals([defaultLead]));
      }
      return undefined;
    }
    void fetchLinkDeals('');
    if (!scopeCustomersToDeals) {
      const params = { limit: 500 };
      if (defaultCompanyId) params.company_id = defaultCompanyId;
      api.get('/customers', { params }).then((r) => {
        const d = r.data;
        const list = Array.isArray(d) ? d : (d?.customers ?? d?.data ?? []);
        setCustomers(Array.isArray(list) ? list : []);
      }).catch(() => {});
    }
    return undefined;
  }, [lockLead, defaultLead?.id, fetchLinkDeals, scopeCustomersToDeals, defaultCompanyId]);

  const selectLead = (leadId) => {
    const lead = leads.find((l) => String(l.id) === String(leadId));
    const cid = lead?.customer_id || lead?.customer?.id || '';
    setForm((f) => ({ ...f, lead_id: leadId, ...(cid ? { customer_id: cid } : {}) }));
  };

  const toggleParticipant = (uid) => {
    setParticipantIds(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const save = async () => {
    setSaveError('');
    try {
      let title = String(form.title || '').trim().replace(/\s*-\s*$/, '').trim();
      if (!title) {
        const t = eventTypes.find((x) => x.slug === form.event_type);
        title = String(t?.name || '').trim();
      }
      if (!title) {
        setSaveError('Nhập tiêu đề sự kiện.');
        return;
      }

      const multiDay = MULTI_DAY_EVENT_TYPE_SLUGS.has(String(form.event_type || ''));
      let dates = [...occurrenceDates].filter(Boolean).sort();
      const fallbackStart = form.start_time || startFromPreset() || defaultDealEventStartLocalValue();
      if (multiDay && !dates.length) {
        const ymd = String(fallbackStart).slice(0, 10);
        if (ymd) dates = [ymd];
      }
      if (multiDay && !dates.length) {
        setSaveError('Chọn ít nhất một ngày cho sự kiện lắp đặt / vận chuyển.');
        return;
      }

      let startLocal = form.start_time || fallbackStart;
      let endLocal = form.end_time || '';
      if (!multiDay && !startLocal) {
        setSaveError('Chọn ngày giờ bắt đầu.');
        return;
      }
      if (endLocal && startLocal && new Date(endLocal) < new Date(startLocal) && !multiDay) {
        setSaveError('Giờ kết thúc phải lớn hơn hoặc bằng giờ bắt đầu.');
        return;
      }

      const leadId = form.lead_id || defaultLeadId || defaultLead?.id || '';
      const selectedLead = leads.find((l) => String(l.id) === String(leadId));
      let localCompanyId = '';
      try { localCompanyId = JSON.parse(localStorage.getItem('user') || '{}')?.company_id || ''; } catch { localCompanyId = ''; }
      const companyId = String(
        defaultCompanyId
        || defaultLead?.company_id
        || event?.company_id
        || selectedLead?.company_id
        || localCompanyId
        || '',
      ).trim();
      if (!isEdit && !leadId && !companyId) {
        setSaveError('Chọn deal/lead hoặc chọn công ty trên bộ lọc trang Sự kiện trước khi tạo.');
        return;
      }

      setSaving(true);
      if (multiDay && dates.length) {
        const startParts = splitLocalDateTime24h(startLocal || `${dates[0]}T09:00`);
        const endParts = splitLocalDateTime24h(endLocal || startLocal || `${dates[0]}T17:00`);
        startLocal = joinLocalDateTime24h(dates[0], startParts.hour, startParts.minute);
        endLocal = joinLocalDateTime24h(dates[dates.length - 1], endParts.hour || startParts.hour, endParts.minute || startParts.minute);
      }
      const startIso = datetimeLocalValueToIso(startLocal);
      if (!startIso) {
        setSaveError('Ngày giờ bắt đầu không hợp lệ.');
        setSaving(false);
        return;
      }

      const payload = {
        title,
        event_type: form.event_type,
        description: form.description,
        location: form.location,
        all_day: form.all_day,
        lead_id: leadId || null,
        customer_id: form.customer_id || null,
        assignee_id: form.assignee_id || null,
        result: form.result,
        status: form.status,
        module: form.module,
        participant_ids: participantIds,
        start_time: startIso,
        end_time: endLocal ? datetimeLocalValueToIso(endLocal) : null,
      };
      if (multiDay) payload.occurrence_dates = dates;
      else if (isEdit) payload.occurrence_dates = null;
      if (companyId) payload.company_id = companyId;
      const projectId = event?.project_id || defaultProjectId || null;
      if (projectId) payload.project_id = projectId;

      if (isEdit) {
        await api.put(`/events/${event.id}`, payload);
      } else {
        await api.post('/events', payload);
      }
      onSaved?.();
    } catch (e) {
      setSaveError(e.response?.data?.error || e.response?.data?.message || e.message || 'Không tạo được sự kiện.');
    } finally {
      setSaving(false);
    }
  };

  const selectedType = eventTypes.find(t => t.slug === form.event_type) || {};
  const isMultiDayType = MULTI_DAY_EVENT_TYPE_SLUGS.has(String(form.event_type || ''));

  const syncOccurrenceToFormTimes = (dates) => {
    const sorted = [...dates].filter(Boolean).sort();
    setOccurrenceDates(sorted);
    if (!sorted.length) return;
    setForm((f) => {
      const sp = splitLocalDateTime24h(f.start_time || `${sorted[0]}T09:00`);
      const ep = splitLocalDateTime24h(f.end_time || f.start_time || `${sorted[0]}T17:00`);
      return {
        ...f,
        start_time: joinLocalDateTime24h(sorted[0], sp.hour, sp.minute),
        end_time: joinLocalDateTime24h(sorted[sorted.length - 1], ep.hour || sp.hour, ep.minute || sp.minute),
      };
    });
  };

  const applyEventTypeAndTitle = (slug) => {
    const t = eventTypes.find((x) => x.slug === slug);
    const nextModule = slug === 'installation'
      ? (allowedModules?.includes('logistics') || !allowedModules ? 'logistics' : form.module)
      : form.module;
    if (!t) {
      setForm((f) => ({ ...f, event_type: slug, module: nextModule }));
      return;
    }
    const rest = stripEventTypeTitlePrefix(form.title, eventTypes);
    const nextTitle = rest ? `${t.name} - ${rest}` : `${t.name} - `;
    setForm((f) => ({ ...f, event_type: slug, title: nextTitle, module: nextModule }));
    if (MULTI_DAY_EVENT_TYPE_SLUGS.has(slug) && !occurrenceDates.length) {
      const ymd = (form.start_time || startFromPreset() || defaultDealEventStartLocalValue() || '').slice(0, 10);
      if (ymd) syncOccurrenceToFormTimes([ymd]);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10040] p-4" data-tour="event-create-modal">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            {selectedType.icon || '📋'} {isEdit ? 'Sửa sự kiện' : 'Tạo sự kiện mới'}
          </h2>
          <button
            type="button"
            data-tour="event-create-modal-close"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          {saveError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 font-medium">
              {saveError}
            </div>
          ) : null}
          {/* Khối / Module — chỉ hiện chọn nếu user thuộc nhiều khối, hoặc là admin */}
          {(() => {
            const builtinVisible = EVENT_MODULE_OPTIONS.filter((m) => {
              if (!m.value) return false;
              if (m.value === 'general' && !allowGeneralModule) return false;
              if (!allowedModules) return true;
              return allowedModules.includes(m.value);
            });
            const defMod = String(defaultModule || '').trim().toLowerCase();
            const isCustomDef = defMod
              && !EVENT_MODULE_OPTIONS.some((o) => o.value === defMod)
              && /^[a-z][a-z0-9_-]{0,63}$/.test(defMod);
            const visibleModules = [...builtinVisible];
            if (isCustomDef && !visibleModules.some((m) => m.value === defMod)) {
              visibleModules.push({
                value: defMod,
                label: defaultModuleLabel || defMod,
                emoji: '📦',
                color: 'bg-teal-100 text-teal-700 border-teal-200',
              });
            }
            // Khóa 1 khối (SX/VC/custom): không hiện picker
            if (allowedModules && allowedModules.length === 1 && !allowedModules.includes('general')) {
              return null;
            }
            if (visibleModules.length <= 1) return null;
            return (
              <div data-tour="event-create-module">
                <label className="text-xs font-medium text-gray-600 block mb-2">Khối / Module</label>
                <div className="flex flex-wrap gap-2">
                  {visibleModules.map((m) => {
                    const active = String(form.module || 'crm') === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, module: m.value }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 cursor-pointer transition ${
                          active ? `${m.color}` : 'border-gray-200 hover:border-gray-300 text-gray-600'
                        }`}
                        title={m.label}
                      >
                        {m.emoji} {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Event type selector */}
          <div data-tour="event-create-type">
            <label className="text-xs font-medium text-gray-600 block mb-2">Loại sự kiện</label>
            <div className="flex flex-wrap gap-2">
              {eventTypes.map(t => (
                <button key={t.slug} type="button" onClick={() => applyEventTypeAndTitle(t.slug)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 cursor-pointer transition ${
                    form.event_type === t.slug ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  {t.icon} {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div data-tour="event-create-title">
            <label className="text-xs font-medium text-gray-600 block mb-1">Tiêu đề sự kiện *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="VD: Khảo sát chị Quỳnh Hóc Môn - KS Tủ bếp Q3"
              className="w-full h-10 px-3 border rounded-lg text-sm" />
          </div>

          {/* Ngày + giờ 24h (dropdown giờ 00–23, phút bước 5) — không AM/PM */}
          <div data-tour="event-create-datetime" className="rounded-xl border border-gray-200 bg-gray-50/90 p-4 space-y-4">
            {isMultiDayType ? (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1.5">
                    Ngày làm việc (nhiều ngày) *
                  </label>
                  <p className="text-[11px] text-gray-600 mb-2">
                    Bấm chọn từng ngày — có thể <strong>3 ngày liên tiếp</strong> hoặc <strong>cách ngày</strong> (vd. 1, 3, 5).
                    Trên lịch, hover một ngày sẽ làm sáng các ngày cùng sự kiện.
                  </p>
                  <MultiDayDatePicker
                    selectedYmds={occurrenceDates}
                    onChange={syncOccurrenceToFormTimes}
                    anchorYmd={occurrenceDates[0] || form.start_time?.slice(0, 10) || ''}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <EventDateTime24hPickers
                    label="Giờ bắt đầu (mỗi ngày)"
                    required
                    value={form.start_time}
                    onChange={(v) => {
                      const sp = splitLocalDateTime24h(v);
                      const first = occurrenceDates[0] || sp.date;
                      setForm((f) => ({
                        ...f,
                        start_time: joinLocalDateTime24h(first || sp.date, sp.hour, sp.minute),
                      }));
                    }}
                    hint="Chỉ dùng phần giờ·phút; ngày lấy từ danh sách đã chọn."
                  />
                  <EventDateTime24hPickers
                    label="Giờ kết thúc (mỗi ngày)"
                    value={form.end_time || ''}
                    onChange={(v) => {
                      if (!v) {
                        setForm((f) => ({ ...f, end_time: '' }));
                        return;
                      }
                      const ep = splitLocalDateTime24h(v);
                      const last = occurrenceDates[occurrenceDates.length - 1] || occurrenceDates[0] || ep.date;
                      setForm((f) => ({
                        ...f,
                        end_time: joinLocalDateTime24h(last || ep.date, ep.hour, ep.minute),
                      }));
                    }}
                    hint="Giờ kết thúc trong ngày (áp dụng khung giờ)."
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-[11px] text-gray-600">
                  Chọn <strong className="text-gray-800">ngày</strong> trên lịch, sau đó chọn <strong className="text-gray-800">giờ · phút</strong> theo đồng hồ{' '}
                  <strong className="text-emerald-800">24 giờ</strong> (vd. 14 = 2 giờ chiều).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <EventDateTime24hPickers
                    label="Bắt đầu"
                    required
                    value={form.start_time}
                    onChange={(v) => setForm((f) => ({ ...f, start_time: v }))}
                  />
                  <EventDateTime24hPickers
                    label="Kết thúc"
                    value={form.end_time || ''}
                    onChange={(v) => setForm((f) => ({ ...f, end_time: v }))}
                    hint="Xóa ngày (để trống ô lịch) nếu chưa có giờ kết thúc."
                  />
                </div>
              </>
            )}
          </div>

          {/* Location */}
          <div data-tour="event-create-location">
            <label className="text-xs font-medium text-gray-600 block mb-1">Địa điểm</label>
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="VD: 123 Nguyễn Văn A, Q.3, TP.HCM"
              className="w-full h-10 px-3 border rounded-lg text-sm" />
          </div>

          {/* Link Lead/Deal + Khách hàng */}
          <div className="grid grid-cols-2 gap-4" data-tour="event-create-links">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                {form.module === 'logistics'
                  ? 'Deal Lắp đặt'
                  : form.module === 'production'
                    ? 'Deal Sản xuất'
                    : `Liên kết ${defaultLead?.type === 'lead' ? 'Lead' : 'Deal'}`}
              </label>
              {lockLead && (defaultLead || form.lead_id) ? (
                <div className="w-full min-h-[40px] px-3 py-2 border border-blue-200 bg-blue-50 rounded-lg text-sm">
                  <div className="font-medium text-blue-900 truncate">
                    🎯 {[defaultLead?.code, defaultLead?.title || '—'].filter(Boolean).join(' — ')}
                  </div>
                  {(defaultLead?.customer?.full_name || defaultLead?.customer_name) && (
                    <div className="text-xs text-blue-700 truncate mt-0.5">
                      {defaultLead.customer?.full_name || defaultLead.customer_name}
                    </div>
                  )}
                </div>
              ) : (
                <SearchSelect
                  items={leads.map(l => ({
                    id: l.id,
                    label: `${l.code || ''} — ${l.title || ''}`,
                    sub: [l.customer_name || l.customer?.full_name, l.project_code].filter(Boolean).join(' · '),
                  }))}
                  value={form.lead_id}
                  onChange={v => selectLead(v)}
                  placeholder={form.module === 'logistics' ? 'Tìm deal trên bảng Lắp đặt…' : 'Tìm lead/deal…'}
                  icon="🎯"
                  onQueryChange={lockLead ? null : fetchLinkDeals}
                  emptyText={form.module === 'logistics'
                    ? 'Không có deal trên bảng Lắp đặt'
                    : form.module === 'production'
                      ? 'Không có deal trên bảng Sản xuất'
                      : 'Không tìm thấy'}
                />
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                {form.module === 'logistics'
                  ? 'Khách hàng (Lắp đặt)'
                  : form.module === 'production'
                    ? 'Khách hàng (Sản xuất)'
                    : 'Khách hàng'}
              </label>
              <SearchSelect
                items={customers.map(c => ({ id: c.id, label: c.full_name, sub: c.phone || c.email || '' }))}
                value={form.customer_id}
                onChange={v => setForm(f => ({ ...f, customer_id: v }))}
                placeholder="Tìm khách hàng..."
                icon="👤"
                onQueryChange={scopeCustomersToDeals ? fetchLinkDeals : null}
                emptyText={form.module === 'logistics'
                  ? 'Chỉ hiện KH của deal đang trên bảng Lắp đặt'
                  : 'Không tìm thấy'}
              />
            </div>
          </div>
          {scopeCustomersToDeals ? (
            <p className="-mt-2 text-[11px] text-orange-700">
              Chỉ deal / khách hàng đang trên bảng {form.module === 'production' ? 'Sản xuất' : 'Lắp đặt'} — không lấy lead CRM thuần.
            </p>
          ) : null}

          {/* Assignee */}
          <div data-tour="event-create-assignee">
            <label className="text-xs font-medium text-gray-600 block mb-1">Người phụ trách</label>
            <UserSearchSelect users={users} value={form.assignee_id} onChange={v => setForm(f => ({ ...f, assignee_id: v }))} placeholder="👤 Chọn người phụ trách..." />
          </div>

          {/* Participants */}
          <div data-tour="event-create-participants">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Người tham gia ({participantIds.length})</label>
              <button type="button" onClick={() => {
                if (participantIds.length === users.length) {
                  setParticipantIds([]);
                } else {
                  setParticipantIds(users.map(u => u.id));
                }
              }} className="text-[10px] text-blue-600 hover:underline cursor-pointer">
                {participantIds.length === users.length ? '❌ Bỏ chọn tất cả' : '✅ Chọn tất cả NV'}
              </button>
            </div>
            <UserMultiSelect users={users} value={participantIds} onChange={setParticipantIds} placeholder="👥 Chọn người tham gia..." />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Mô tả / Ghi chú</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3} placeholder="Chi tiết sự kiện..." className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>

          {/* Result (edit only) */}
          {isEdit && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Kết quả</label>
              <textarea value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))}
                rows={2} placeholder="Kết quả sau sự kiện..." className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex items-center justify-end gap-2 shrink-0">
          {saveError ? (
            <span className="mr-auto text-xs text-red-600 font-medium truncate max-w-[55%]" title={saveError}>{saveError}</span>
          ) : null}
          <button type="button" onClick={onClose} className="h-9 px-4 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium cursor-pointer">Hủy</button>
          <button
            type="button"
            data-tour="event-create-save"
            onClick={() => { void save(); }}
            disabled={saving}
            className="h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : isEdit ? '💾 Cập nhật' : '✅ Tạo sự kiện'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
