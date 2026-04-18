import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { formatDate } from '../lib/utils';
import {
  Calendar, List, Plus, Search, Filter, MapPin, Clock, Users, MessageSquare,
  Check, X, ChevronLeft, ChevronRight, Settings, Trash2, Edit3, Send, CheckCircle2,
  XCircle, AlertCircle, Loader2,
} from 'lucide-react';

const STATUS_MAP = {
  planned: { label: 'Đã lên kế hoạch', color: 'bg-blue-100 text-blue-700', icon: Clock },
  in_progress: { label: 'Đang thực hiện', color: 'bg-amber-100 text-amber-700', icon: AlertCircle },
  completed: { label: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  cancelled: { label: 'Đã hủy', color: 'bg-red-100 text-red-700', icon: XCircle },
};

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
function formatDateVN(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}
function getDayOfWeek(isoStr) {
  return new Date(isoStr).toLocaleDateString('vi-VN', { weekday: 'short' }).toUpperCase();
}
function getDayNum(isoStr) {
  return new Date(isoStr).getDate();
}
function getMonthYear(isoStr) {
  return new Date(isoStr).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
}
function isSameDay(d1, d2) {
  const a = new Date(d1), b = new Date(d2);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isToday(isoStr) { return isSameDay(isoStr, new Date()); }

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function EventsFeedPage() {
  const [view, setView] = useState('feed'); // feed | calendar | types
  const [events, setEvents] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calEvents, setCalEvents] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [createPresetDay, setCreatePresetDay] = useState(null);
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    loadEventTypes();
    api.get('/users').then(r => setUsers(r.data.users || r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (view === 'feed') loadFeed();
    if (view === 'calendar') loadCalendar();
  }, [view, filterType, filterStatus, filterUser, calMonth, calYear]);

  const loadEventTypes = () => api.get('/events/event-types').then(r => setEventTypes(r.data || [])).catch(() => {});

  const loadFeed = async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      if (filterUser) params.user_id = filterUser;
      if (search) params.search = search;
      const { data } = await api.get('/events', { params });
      setEvents(data.events || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadCalendar = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/events/calendar', { params: { month: calMonth, year: calYear } });
      setCalEvents(data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleRespond = async (eventId, status) => {
    try {
      await api.put(`/events/${eventId}/respond`, { status });
      if (view === 'feed') loadFeed(); else loadCalendar();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa sự kiện này?')) return;
    try {
      await api.delete(`/events/${id}`);
      if (view === 'feed') loadFeed(); else loadCalendar();
    } catch (e) { alert('Lỗi xóa'); }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.put(`/events/${id}`, { status });
      if (view === 'feed') loadFeed(); else loadCalendar();
    } catch (e) { alert('Lỗi'); }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-blue-600" /> Sự kiện
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{events.length} sự kiện</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setView('feed')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 cursor-pointer transition ${view === 'feed' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
              <List className="h-4 w-4" /> Feed
            </button>
            <button onClick={() => setView('calendar')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 cursor-pointer transition ${view === 'calendar' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
              <Calendar className="h-4 w-4" /> Lịch
            </button>
            <button onClick={() => setView('types')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 cursor-pointer transition ${view === 'types' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
              <Settings className="h-4 w-4" /> Loại
            </button>
          </div>
          <button onClick={() => { setEditEvent(null); setCreatePresetDay(null); setShowCreate(true); }}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
            <Plus className="h-4 w-4" /> Tạo sự kiện
          </button>
        </div>
      </div>

      {/* Filters (Feed view) */}
      {view === 'feed' && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadFeed()}
              placeholder="Tìm sự kiện..." className="w-full h-9 pl-10 pr-3 border rounded-lg text-sm" />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="h-9 px-3 border rounded-lg text-sm">
            <option value="">Tất cả loại</option>
            {eventTypes.map(t => <option key={t.slug} value={t.slug}>{t.icon} {t.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 px-3 border rounded-lg text-sm">
            <option value="">Tất cả trạng thái</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className="h-9 px-3 border rounded-lg text-sm">
            <option value="">Tất cả người</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          {(search || filterType || filterStatus || filterUser) && (
            <button onClick={() => { setSearch(''); setFilterType(''); setFilterStatus(''); setFilterUser(''); }}
              className="text-xs text-red-500 hover:underline cursor-pointer">Xóa lọc</button>
          )}
        </div>
      )}

      {/* Feed View */}
      {view === 'feed' && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
          ) : events.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Chưa có sự kiện nào</p>
            </div>
          ) : events.map(ev => (
            <EventCard key={ev.id} event={ev} eventTypes={eventTypes} currentUser={currentUser}
              onRespond={handleRespond} onDelete={handleDelete} onStatusChange={handleStatusChange}
              onEdit={() => { setEditEvent(ev); setShowCreate(true); }} />
          ))}
        </div>
      )}

      {/* Calendar View */}
      {view === 'calendar' && (
        <CalendarView
          month={calMonth} year={calYear} events={calEvents} eventTypes={eventTypes}
          loading={loading} selectedDay={selectedDay}
          onPrevMonth={() => { if (calMonth === 1) { setCalMonth(12); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
          onNextMonth={() => { if (calMonth === 12) { setCalMonth(1); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}
          onSelectDay={setSelectedDay}
          onOpenCreateForDay={(day) => {
            setEditEvent(null);
            setCreatePresetDay({ year: calYear, month: calMonth, day });
            setSelectedDay(day);
            setShowCreate(true);
          }}
          onEdit={(ev) => { setEditEvent(ev); setCreatePresetDay(null); setShowCreate(true); }}
        />
      )}

      {/* Event Types Manager */}
      {view === 'types' && (
        <EventTypesManager types={eventTypes} onReload={loadEventTypes} />
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <EventCreateModal
          event={editEvent}
          presetDay={editEvent ? null : createPresetDay}
          eventTypes={eventTypes}
          users={users}
          onClose={() => { setShowCreate(false); setEditEvent(null); setCreatePresetDay(null); }}
          onSaved={() => { setShowCreate(false); setEditEvent(null); setCreatePresetDay(null); if (view === 'feed') loadFeed(); else loadCalendar(); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EVENT CARD — Bitrix24-style Feed Card
// ═══════════════════════════════════════════════════════════════
function EventCard({ event: ev, eventTypes, currentUser, onRespond, onDelete, onStatusChange, onEdit }) {
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState([]);
  const [showComments, setShowComments] = useState(false);
  const [sending, setSending] = useState(false);

  const typeInfo = eventTypes.find(t => t.slug === ev.event_type) || ev.event_type_ref || { icon: '📋', name: ev.event_type, color: '#6B7280' };
  const statusInfo = STATUS_MAP[ev.status] || STATUS_MAP.planned;
  const confirmed = (ev.participants || []).filter(p => p.status === 'confirmed');
  const declined = (ev.participants || []).filter(p => p.status === 'declined');
  const pending = (ev.participants || []).filter(p => p.status === 'pending');
  const myParticipation = (ev.participants || []).find(p => p.user_id === currentUser.id);

  const loadComments = async () => {
    try {
      const { data } = await api.get(`/events/${ev.id}/comments`);
      setComments(data || []);
    } catch (e) {}
  };

  const submitComment = async () => {
    if (!comment.trim()) return;
    setSending(true);
    try {
      const { data } = await api.post(`/events/${ev.id}/comments`, { content: comment });
      setComments(prev => [...prev, data]);
      setComment('');
    } catch (e) { alert('Lỗi'); }
    setSending(false);
  };

  return (
    <div className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow">
      {/* Header — Creator info */}
      <div className="flex items-start justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">
            {ev.creator?.avatar ? <img src={ev.creator.avatar} className="w-10 h-10 rounded-full object-cover" /> :
              (ev.creator?.full_name || '?').charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="font-semibold text-gray-900">{ev.creator?.full_name || 'Người dùng'}</span>
              <span className="text-gray-400">›</span>
              <span className="text-gray-500">Tất cả nhân viên</span>
            </div>
            <p className="text-xs text-gray-400">{formatDateVN(ev.created_at)}, {formatTime(ev.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
          <button onClick={onEdit} className="p-1 text-gray-400 hover:text-blue-600 rounded cursor-pointer"><Edit3 className="h-3.5 w-3.5" /></button>
          <button onClick={() => onDelete(ev.id)} className="p-1 text-gray-400 hover:text-red-500 rounded cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {/* Event label */}
      <div className="px-5 pb-1">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sự kiện</span>
      </div>

      {/* Event body — Bitrix style with date block */}
      <div className="px-5 pb-4 flex gap-4">
        {/* Date block */}
        <div className="flex-shrink-0 w-16 text-center">
          <div className="bg-blue-600 text-white text-[10px] font-bold py-0.5 rounded-t-lg uppercase">
            {getDayOfWeek(ev.start_time)}
          </div>
          <div className="border border-t-0 rounded-b-lg py-1.5">
            <span className="text-2xl font-bold text-gray-900">{getDayNum(ev.start_time)}</span>
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Tên sự kiện:</span>
            <span className="text-sm font-bold text-gray-900">{typeInfo.icon} {ev.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Ngày giờ:</span>
            <span className="text-sm text-gray-700">
              {(() => {
                const startLabel = isToday(ev.start_time) ? 'Hôm nay' : formatDateVN(ev.start_time);
                const startTime = formatTime(ev.start_time);
                if (!ev.end_time) return `${startLabel}, ${startTime}`;
                const sameDay = isSameDay(ev.start_time, ev.end_time);
                const endTime = formatTime(ev.end_time);
                if (sameDay) {
                  return `${startLabel}, ${startTime} — ${endTime}`;
                }
                // Khác ngày: hiển thị đầy đủ
                const endLabel = isToday(ev.end_time) ? 'Hôm nay' : formatDateVN(ev.end_time);
                return `${startLabel}, ${startTime} → ${endLabel}, ${endTime}`;
              })()}
            </span>
          </div>
          {ev.location && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Địa điểm:</span>
              <span className="text-sm text-gray-700 flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-gray-400" /> {ev.location}</span>
            </div>
          )}
          {ev.lead && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Deal:</span>
              <Link to={`/crm/leads/${ev.lead.id}`} className="text-sm text-blue-600 hover:underline font-medium">
                {ev.lead.code} — {ev.lead.title}
              </Link>
            </div>
          )}
          {ev.customer && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Khách hàng:</span>
              <span className="text-sm text-gray-700">{ev.customer.full_name} {ev.customer.phone ? `(${ev.customer.phone})` : ''}</span>
            </div>
          )}
          {ev.description && <p className="text-sm text-gray-600 mt-1">{ev.description}</p>}
          {ev.result && <p className="text-sm text-emerald-700 bg-emerald-50 px-2 py-1 rounded mt-1">📝 {ev.result}</p>}

          {/* Participants */}
          {confirmed.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-500">Xác nhận:</span>
              <div className="flex -space-x-1.5">
                {confirmed.map(p => (
                  <div key={p.id} title={p.user?.full_name} className="w-7 h-7 rounded-full bg-emerald-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-emerald-700">
                    {p.user?.avatar ? <img src={p.user.avatar} className="w-7 h-7 rounded-full object-cover" /> : (p.user?.full_name || '?').charAt(0)}
                  </div>
                ))}
              </div>
            </div>
          )}
          {declined.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Từ chối:</span>
              <div className="flex -space-x-1.5">
                {declined.map(p => (
                  <div key={p.id} title={p.user?.full_name} className="w-7 h-7 rounded-full bg-red-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-red-700">
                    {p.user?.avatar ? <img src={p.user.avatar} className="w-7 h-7 rounded-full object-cover" /> : (p.user?.full_name || '?').charAt(0)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-5 pb-3 flex items-center gap-3 flex-wrap">
        {/* Confirm/Decline for current user */}
        {(!myParticipation || myParticipation.status === 'pending') && (
          <>
            <button onClick={() => onRespond(ev.id, 'confirmed')}
              className="h-8 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs font-bold uppercase tracking-wide cursor-pointer">
              Xác nhận tham dự
            </button>
            <button onClick={() => onRespond(ev.id, 'declined')}
              className="h-8 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs font-bold uppercase tracking-wide cursor-pointer">
              Từ chối
            </button>
          </>
        )}
        {myParticipation?.status === 'confirmed' && (
          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Đã xác nhận</span>
        )}
        {myParticipation?.status === 'declined' && (
          <span className="text-xs text-red-500 font-medium flex items-center gap-1"><X className="h-3.5 w-3.5" /> Đã từ chối</span>
        )}

        {/* Status quick actions */}
        {ev.status === 'planned' && ev.created_by === currentUser.id && (
          <button onClick={() => onStatusChange(ev.id, 'in_progress')}
            className="text-xs text-amber-600 hover:underline cursor-pointer font-medium">▶ Bắt đầu</button>
        )}
        {ev.status === 'in_progress' && (
          <button onClick={() => onStatusChange(ev.id, 'completed')}
            className="text-xs text-emerald-600 hover:underline cursor-pointer font-medium">✅ Hoàn thành</button>
        )}
      </div>

      {/* Comments section */}
      <div className="border-t px-5 py-2.5">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <button onClick={() => { setShowComments(!showComments); if (!showComments) loadComments(); }}
            className="hover:text-blue-600 cursor-pointer flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" /> Bình luận
          </button>
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {(ev.participants || []).length}</span>
        </div>

        {showComments && (
          <div className="mt-3 space-y-2">
            {comments.map(c => (
              <div key={c.id} className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500 flex-shrink-0">
                  {(c.user?.full_name || '?').charAt(0)}
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-700">{c.user?.full_name}</span>
                  <p className="text-sm text-gray-600">{c.content}</p>
                </div>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600 flex-shrink-0">
                {(currentUser.full_name || '?').charAt(0)}
              </div>
              <div className="flex-1 flex gap-1">
                <input value={comment} onChange={e => setComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitComment()}
                  placeholder="Thêm bình luận..." className="flex-1 h-8 px-3 border rounded-lg text-sm" />
                <button onClick={submitComment} disabled={sending}
                  className="h-8 px-3 bg-blue-600 text-white rounded-lg cursor-pointer disabled:opacity-50">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CALENDAR VIEW — Monthly grid
// ═══════════════════════════════════════════════════════════════
function CalendarView({ month, year, events, eventTypes, loading, selectedDay, onPrevMonth, onNextMonth, onSelectDay, onOpenCreateForDay, onEdit }) {
  const monthNames = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  const cells = [];
  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad end
  while (cells.length % 7 !== 0) cells.push(null);

  // Group events by day
  const eventsByDay = {};
  events.forEach(ev => {
    const d = new Date(ev.start_time).getDate();
    if (!eventsByDay[d]) eventsByDay[d] = [];
    eventsByDay[d].push(ev);
  });

  const selectedDayEvents = selectedDay ? (eventsByDay[selectedDay] || []) : [];

  return (
    <div className="bg-white rounded-xl border p-4">
      {/* Calendar header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onPrevMonth} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ChevronLeft className="h-5 w-5" /></button>
        <h2 className="text-lg font-bold text-gray-900">{monthNames[month]} {year}</h2>
        <button onClick={onNextMonth} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ChevronRight className="h-5 w-5" /></button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
      ) : (
        <>
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {dayNames.map(d => (
              <div key={d} className="text-center text-xs font-bold text-gray-500 py-2">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 border-t border-l">
            {cells.map((day, i) => {
              const dayEvents = day ? (eventsByDay[day] || []) : [];
              const isTodayCell = isCurrentMonth && day === today.getDate();
              const isSelected = day === selectedDay;
              return (
                <div
                  key={i}
                  role="presentation"
                  onClick={(e) => {
                    if (!day) return;
                    if (e.target.closest?.('[data-cal-event-chip]')) return;
                    onSelectDay(day);
                    onOpenCreateForDay(day);
                  }}
                  className={`min-h-[90px] border-r border-b p-1 cursor-pointer transition
                    ${day ? 'hover:bg-blue-50/50' : 'bg-gray-50'}
                    ${isSelected ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset' : ''}
                  `}
                >
                  {day && (
                    <>
                      <div className={`text-sm font-medium mb-0.5 w-7 h-7 flex items-center justify-center rounded-full
                        ${isTodayCell ? 'bg-blue-600 text-white' : 'text-gray-700'}
                      `}>{day}</div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map(ev => {
                          const typeInfo = eventTypes.find(t => t.slug === ev.event_type) || ev.event_type_ref || {};
                          return (
                            <div
                              key={ev.id}
                              data-cal-event-chip
                              className="text-[10px] leading-tight px-1 py-0.5 rounded truncate font-medium"
                              style={{ backgroundColor: (typeInfo.color || '#3B82F6') + '20', color: typeInfo.color || '#3B82F6' }}
                              title={`${ev.title} — ${formatTime(ev.start_time)} — Nhấn để sửa`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectDay(day);
                                onEdit(ev);
                              }}
                            >
                              {typeInfo.icon} {ev.title}
                            </div>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] text-gray-400 px-1">+{dayEvents.length - 3} khác</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected day detail */}
          {selectedDay && (
            <div className="mt-4 border-t pt-4">
              <h3 className="text-sm font-bold text-gray-800 mb-2">
                📅 Ngày {selectedDay}/{month}/{year} — {selectedDayEvents.length} sự kiện
              </h3>
              {selectedDayEvents.length === 0 ? (
                <p className="text-sm text-gray-400">Không có sự kiện</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayEvents.map(ev => {
                    const typeInfo = eventTypes.find(t => t.slug === ev.event_type) || ev.event_type_ref || {};
                    const statusInfo = STATUS_MAP[ev.status] || STATUS_MAP.planned;
                    return (
                      <div key={ev.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer" onClick={() => onEdit(ev)}>
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                          style={{ backgroundColor: (typeInfo.color || '#3B82F6') + '20' }}>
                          {typeInfo.icon || '📋'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{ev.title}</p>
                          <p className="text-xs text-gray-500">
                            {formatTime(ev.start_time)}{ev.end_time ? ` — ${formatTime(ev.end_time)}` : ''}
                            {ev.location ? ` · 📍 ${ev.location}` : ''}
                          </p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                        <div className="text-xs text-gray-400">{ev.creator?.full_name}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EVENT TYPES MANAGER — CRUD loại sự kiện
// ═══════════════════════════════════════════════════════════════
function EventTypesManager({ types, onReload }) {
  const [form, setForm] = useState({ name: '', icon: '📋', color: '#6B7280', stage_slug: '', description: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const STAGE_OPTIONS = [
    { value: '', label: '— Không liên kết —' },
    { value: 'consulting', label: 'Tư vấn' },
    { value: 'design', label: 'Thiết kế' },
    { value: 'quotation', label: 'Báo giá' },
    { value: 'contract', label: 'Hợp đồng' },
    { value: 'production', label: 'Sản xuất' },
    { value: 'shipping', label: 'Giao hàng' },
    { value: 'installation', label: 'Lắp đặt' },
    { value: 'customer-care', label: 'Chăm sóc KH' },
  ];

  const save = async () => {
    if (!form.name.trim()) return alert('Nhập tên loại sự kiện');
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/events/event-types/${editId}`, form);
      } else {
        await api.post('/events/event-types', form);
      }
      setForm({ name: '', icon: '📋', color: '#6B7280', stage_slug: '', description: '' });
      setEditId(null);
      onReload();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  const startEdit = (t) => {
    setEditId(t.id);
    setForm({ name: t.name, icon: t.icon || '📋', color: t.color || '#6B7280', stage_slug: t.stage_slug || '', description: t.description || '' });
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa loại sự kiện này?')) return;
    try { await api.delete(`/events/event-types/${id}`); onReload(); }
    catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  return (
    <div className="bg-white rounded-xl border p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4">⚙️ Quản lý loại sự kiện</h2>

      {/* Add/Edit form */}
      <div className="flex flex-wrap items-end gap-3 mb-6 p-4 bg-gray-50 rounded-lg">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Icon</label>
          <input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
            className="w-16 h-9 px-2 border rounded-lg text-center text-lg" />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs font-medium text-gray-600 block mb-1">Tên loại *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="VD: Khảo sát" className="w-full h-9 px-3 border rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Màu</label>
          <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
            className="w-9 h-9 rounded-lg border cursor-pointer" />
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-gray-600 block mb-1">Giai đoạn liên kết</label>
          <select value={form.stage_slug} onChange={e => setForm(f => ({ ...f, stage_slug: e.target.value }))}
            className="w-full h-9 px-2 border rounded-lg text-sm">
            {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <button onClick={save} disabled={saving}
          className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">
          {editId ? '💾 Cập nhật' : '➕ Thêm'}
        </button>
        {editId && (
          <button onClick={() => { setEditId(null); setForm({ name: '', icon: '📋', color: '#6B7280', stage_slug: '', description: '' }); }}
            className="h-9 px-3 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm cursor-pointer">Hủy</button>
        )}
      </div>

      {/* Types list */}
      <div className="space-y-2">
        {types.map(t => (
          <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
              style={{ backgroundColor: (t.color || '#6B7280') + '20' }}>{t.icon}</div>
            <div className="flex-1">
              <span className="text-sm font-semibold text-gray-900">{t.name}</span>
              {t.stage_slug && <span className="text-xs text-gray-400 ml-2">→ {t.stage_slug}</span>}
              {t.is_system && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded ml-2">Mặc định</span>}
            </div>
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color || '#6B7280' }} />
            <button onClick={() => startEdit(t)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded cursor-pointer"><Edit3 className="h-4 w-4" /></button>
            {!t.is_system && (
              <button onClick={() => handleDelete(t.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded cursor-pointer"><Trash2 className="h-4 w-4" /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

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

// ═══════════════════════════════════════════════════════════════
// EVENT CREATE/EDIT MODAL
// ═══════════════════════════════════════════════════════════════
function EventCreateModal({ event, presetDay, eventTypes, users, onClose, onSaved }) {
  const isEdit = !!event;
  const toLocalDateTimeInput = (value) => {
    if (!value) return '';
    const d = new Date(value);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  };
  const startFromPreset = () => {
    if (!presetDay || event) return '';
    const d = new Date(presetDay.year, presetDay.month - 1, presetDay.day, 9, 0, 0, 0);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  };
  const [form, setForm] = useState({
    title: event?.title || '',
    event_type: event?.event_type || 'site_visit',
    description: event?.description || '',
    location: event?.location || '',
    start_time: toLocalDateTimeInput(event?.start_time) || startFromPreset(),
    end_time: toLocalDateTimeInput(event?.end_time),
    all_day: event?.all_day || false,
    lead_id: event?.lead_id || '',
    customer_id: event?.customer_id || '',
    assignee_id: event?.assignee_id || JSON.parse(localStorage.getItem('user') || '{}').id || '',
    result: event?.result || '',
    status: event?.status || 'planned',
  });
  const [participantIds, setParticipantIds] = useState(
    event?.participants?.map(p => p.user_id) || []
  );
  const [leads, setLeads] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/crm/leads', { params: { type: 'deal', limit: 200 } }).then(r => {
      const d = r.data;
      const list = Array.isArray(d) ? d : (d?.leads ?? d?.data ?? []);
      setLeads(Array.isArray(list) ? list : []);
    }).catch(() => {});
    api.get('/customers', { params: { limit: 500 } }).then(r => {
      const d = r.data;
      const list = Array.isArray(d) ? d : (d?.customers ?? d?.data ?? []);
      setCustomers(Array.isArray(list) ? list : []);
    }).catch(() => {});
  }, []);

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
      const payload = { ...form, participant_ids: participantIds };
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
          {/* Event type selector */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Loại sự kiện</label>
            <div className="flex flex-wrap gap-2">
              {eventTypes.map(t => (
                <button key={t.slug} onClick={() => setForm(f => ({ ...f, event_type: t.slug }))}
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

          {/* Date/Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Bắt đầu *</label>
              <input type="datetime-local" value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                className="w-full h-10 px-3 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Kết thúc</label>
              <input type="datetime-local" value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                className="w-full h-10 px-3 border rounded-lg text-sm" />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Địa điểm</label>
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="VD: 123 Nguyễn Văn A, Q.3, TP.HCM"
              className="w-full h-10 px-3 border rounded-lg text-sm" />
          </div>

          {/* Link Deal + Khách hàng */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Liên kết Deal</label>
              <SearchSelect
                items={leads.map(l => ({ id: l.id, label: `${l.code} — ${l.title}`, sub: l.customer?.full_name || '' }))}
                value={form.lead_id}
                onChange={v => selectLead(v)}
                placeholder="🔗 Tìm deal..."
                icon="🎯"
              />
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