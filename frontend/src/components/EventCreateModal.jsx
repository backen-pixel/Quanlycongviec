import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../lib/api';
import { isoToDatetimeLocalValue, datetimeLocalValueToIso } from '../lib/datetimeLocal';
import { Search, X, Check, ChevronLeft, Users } from 'lucide-react';

/** Module/Khối — phân loại sự kiện theo khối. */
export const EVENT_MODULE_OPTIONS = [
  { value: '', label: 'Tất cả khối', emoji: '🌐', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'crm', label: 'Kinh doanh', emoji: '💼', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  { value: 'production', label: 'Sản xuất', emoji: '🏭', color: 'bg-violet-100 text-violet-700 border-violet-200' },
  { value: 'logistics', label: 'Vận chuyển', emoji: '🚚', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'general', label: 'Chung công ty', emoji: '🏢', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
];

// ═══════════════════════════════════════════════════════════════
// SEARCH SELECT — Generic dropdown search (Deal, KH, etc.)
// ═══════════════════════════════════════════════════════════════
function SearchSelect({ items, value, onChange, placeholder = 'Tìm...', icon = '🔍' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState({});
  const btnRef = useRef(null);
  const ddRef = useRef(null);

  const selected = items.find(i => i.id === value);

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
    const h = (e) => { if (ddRef.current && ddRef.current.contains(e.target)) return; setOpen(false); };
    window.addEventListener('scroll', h, true);
    window.addEventListener('resize', () => setOpen(false));
    return () => { window.removeEventListener('scroll', h, true); window.removeEventListener('resize', () => setOpen(false)); };
  }, [open]);

  const filtered = items.filter(i => {
    if (!search) return true;
    const s = search.toLowerCase();
    return i.label?.toLowerCase().includes(s) || i.sub?.toLowerCase().includes(s);
  });

  const dropdown = open ? createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: 99998 }} onClick={() => setOpen(false)} />
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
          {filtered.length === 0 && <div className="py-6 text-center text-sm text-gray-400">Không tìm thấy</div>}
        </div>
        <div className="px-3 py-1.5 border-t text-xs text-gray-400">{filtered.length}/{items.length} kết quả</div>
      </div>
    </>, document.body) : null;

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
    const h = (e) => { if (ddRef.current && ddRef.current.contains(e.target)) return; setOpen(false); };
    window.addEventListener('scroll', h, true);
    window.addEventListener('resize', () => setOpen(false));
    return () => { window.removeEventListener('scroll', h, true); window.removeEventListener('resize', () => setOpen(false)); };
  }, [open]);

  const filtered = users.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return u.full_name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s);
  });

  const dropdown = open ? createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: 99998 }} onClick={() => setOpen(false)} />
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
    </>, document.body) : null;

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
    const h = (e) => { if (ddRef.current && ddRef.current.contains(e.target)) return; setOpen(false); };
    window.addEventListener('scroll', h, true);
    window.addEventListener('resize', () => setOpen(false));
    return () => { window.removeEventListener('scroll', h, true); window.removeEventListener('resize', () => setOpen(false)); };
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
    <>
      <div className="fixed inset-0" style={{ zIndex: 99998 }} onClick={() => setOpen(false)} />
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
    </>, document.body) : null;

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
  defaultLeadId = '',
  defaultLead = null,
  lockLead = false,
  defaultCustomerId = '',
  defaultAssigneeId = '',
  defaultTitle = '',
  defaultLocation = '',
  defaultDescription = '',
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
  const [form, setForm] = useState({
    title: event?.title || defaultTitle || '',
    event_type: event?.event_type || 'site_visit',
    description: event?.description || defaultDescription || '',
    location: event?.location || defaultLocation || '',
    start_time: toLocalDateTimeInput(event?.start_time) || startFromPreset(),
    end_time: toLocalDateTimeInput(event?.end_time),
    all_day: event?.all_day || false,
    lead_id: event?.lead_id || defaultLeadId || defaultLead?.id || '',
    customer_id: event?.customer_id || defaultCustomerId || defaultLead?.customer_id || '',
    assignee_id: event?.assignee_id || defaultAssigneeId || defaultLead?.assigned_to || defaultLead?.lead_owner_id || JSON.parse(localStorage.getItem('user') || '{}').id || '',
    result: event?.result || '',
    status: event?.status || 'planned',
    module: event?.module || defaultModule || 'crm',
  });
  const [participantIds, setParticipantIds] = useState(
    event?.participants?.map(p => p.user_id) || []
  );
  const [leads, setLeads] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [saving, setSaving] = useState(false);

  /** Tạo mới: tự mời tất cả nhân viên có trong danh sách (một lần khi load users) */
  useEffect(() => {
    if (isEdit || participantsAutoFilled.current || !users?.length) return;
    participantsAutoFilled.current = true;
    setParticipantIds(users.map((u) => u.id));
  }, [isEdit, users]);

  useEffect(() => {
    if (!lockLead) {
      api.get('/crm/leads', { params: { type: 'deal', limit: 200 } }).then(r => {
        const d = r.data;
        let list = Array.isArray(d) ? d : (d?.leads ?? d?.data ?? []);
        list = Array.isArray(list) ? list : [];
        if (defaultLead?.id && !list.some((l) => l.id === defaultLead.id)) {
          list = [defaultLead, ...list];
        }
        setLeads(list);
      }).catch(() => {
        if (defaultLead?.id) setLeads([defaultLead]);
      });
    } else if (defaultLead?.id) {
      setLeads([defaultLead]);
    }
    api.get('/customers', { params: { limit: 500 } }).then(r => {
      const d = r.data;
      const list = Array.isArray(d) ? d : (d?.customers ?? d?.data ?? []);
      setCustomers(Array.isArray(list) ? list : []);
    }).catch(() => {});
  }, [lockLead, defaultLead?.id]);

  const selectLead = (leadId) => {
    setForm(f => ({ ...f, lead_id: leadId }));
    const lead = leads.find(l => l.id === leadId);
    if (lead?.customer_id) setForm(f => ({ ...f, customer_id: lead.customer_id }));
  };

  const toggleParticipant = (uid) => {
    setParticipantIds(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const save = async () => {
    if (!form.title.trim()) return alert('Nhập tiêu đề sự kiện');
    if (!form.start_time) return alert('Chọn ngày giờ bắt đầu');
    if (form.end_time && new Date(form.end_time) < new Date(form.start_time)) {
      return alert('Giờ kết thúc phải lớn hơn hoặc bằng giờ bắt đầu');
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        lead_id: form.lead_id || defaultLeadId || defaultLead?.id || '',
        participant_ids: participantIds,
        start_time: datetimeLocalValueToIso(form.start_time),
        end_time: form.end_time ? datetimeLocalValueToIso(form.end_time) : null,
      };
      if (isEdit) {
        await api.put(`/events/${event.id}`, payload);
      } else {
        await api.post('/events', payload);
      }
      onSaved();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  const selectedType = eventTypes.find(t => t.slug === form.event_type) || {};

  const applyEventTypeAndTitle = (slug) => {
    const t = eventTypes.find((x) => x.slug === slug);
    if (!t) {
      setForm((f) => ({ ...f, event_type: slug }));
      return;
    }
    const rest = stripEventTypeTitlePrefix(form.title, eventTypes);
    const nextTitle = rest ? `${t.name} - ${rest}` : `${t.name} - `;
    setForm((f) => ({ ...f, event_type: slug, title: nextTitle }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            {selectedType.icon || '📋'} {isEdit ? 'Sửa sự kiện' : 'Tạo sự kiện mới'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><X className="h-5 w-5 text-gray-500" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Khối / Module — chỉ hiện chọn nếu user thuộc nhiều khối, hoặc là admin */}
          {(() => {
            const visibleModules = EVENT_MODULE_OPTIONS.filter((m) => {
              if (!m.value) return false;
              if (m.value === 'general' && !allowGeneralModule) return false;
              if (!allowedModules) return true;
              return allowedModules.includes(m.value);
            });
            if (visibleModules.length <= 1) return null;
            return (
              <div>
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
          <div>
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
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Tiêu đề sự kiện *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="VD: Khảo sát chị Quỳnh Hóc Môn - KS Tủ bếp Q3"
              className="w-full h-10 px-3 border rounded-lg text-sm" />
          </div>

          {/* Ngày + giờ 24h (dropdown giờ 00–23, phút bước 5) — không AM/PM */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/90 p-4 space-y-4">
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
          </div>

          {/* Location */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Địa điểm</label>
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="VD: 123 Nguyễn Văn A, Q.3, TP.HCM"
              className="w-full h-10 px-3 border rounded-lg text-sm" />
          </div>

          {/* Link Lead/Deal + Khách hàng */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Liên kết {defaultLead?.type === 'lead' ? 'Lead' : 'Deal'}
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
                  items={leads.map(l => ({ id: l.id, label: `${l.code || ''} — ${l.title || ''}`, sub: l.customer?.full_name || '' }))}
                  value={form.lead_id}
                  onChange={v => selectLead(v)}
                  placeholder="🔗 Tìm lead/deal..."
                  icon="🎯"
                />
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Khách hàng</label>
              <SearchSelect
                items={customers.map(c => ({ id: c.id, label: c.full_name, sub: c.phone || c.email || '' }))}
                value={form.customer_id}
                onChange={v => setForm(f => ({ ...f, customer_id: v }))}
                placeholder="👤 Tìm khách hàng..."
                icon="👤"
              />
            </div>
          </div>

          {/* Assignee */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Người phụ trách</label>
            <UserSearchSelect users={users} value={form.assignee_id} onChange={v => setForm(f => ({ ...f, assignee_id: v }))} placeholder="👤 Chọn người phụ trách..." />
          </div>

          {/* Participants */}
          <div>
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
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium cursor-pointer">Hủy</button>
          <button onClick={save} disabled={saving}
            className="h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold cursor-pointer disabled:opacity-50">
            {saving ? 'Đang lưu...' : isEdit ? '💾 Cập nhật' : '✅ Tạo sự kiện'}
          </button>
        </div>
      </div>
    </div>
  );
}
