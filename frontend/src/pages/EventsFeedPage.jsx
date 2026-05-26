import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike, isSystemAdmin as checkSystemAdmin } from '../lib/adminRole';
import { formatDate } from '../lib/utils';
import { isoToDatetimeLocalValue, datetimeLocalValueToIso } from '../lib/datetimeLocal';
import {
  Calendar, List, Plus, Search, Filter, MapPin, Clock, Users, MessageSquare,
  Check, X, ChevronLeft, ChevronRight, Settings, Trash2, Edit3, Send, CheckCircle2,
  XCircle, AlertCircle, Loader2, Building2, Ban, BarChart3,
} from 'lucide-react';

import ScopeFilterBar from '../shared/components/ScopeFilterBar';
import { useScopeFilter } from '../shared/hooks/useScopeFilter';

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
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  /** Admin hệ thống (không gắn company) — mới được lọc «tất cả công ty» / chọn công ty khác */
  const isSystemAdmin = checkSystemAdmin(user);
  const scope = useScopeFilter({
    storageKey: 'crm_events',
    showCompany: true,
    showDepartment: false,
    showSearch: false,
    autoDefaultCompany: false,
    persist: true,
  });
  const filterCompanyId = scope.companyId;
  const companies = scope.companies;

  const listParams = useMemo(
    () => (isSystemAdmin && filterCompanyId ? { company_id: filterCompanyId } : {}),
    [isSystemAdmin, filterCompanyId],
  );

  /** Danh sách nhân viên cho filter / form sự kiện — chỉ trong một công ty (không «tất cả» xuyên hệ thống). */
  const effectiveCompanyIdForUsers = useMemo(() => {
    if (isSystemAdmin && filterCompanyId) return filterCompanyId;
    const cid = user?.company_id != null ? String(user.company_id).trim() : '';
    return cid || '';
  }, [isSystemAdmin, filterCompanyId, user?.company_id]);

  const [view, setView] = useState('calendar'); // feed | calendar | types — mặc định Lịch khi vào trang
  const [events, setEvents] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calLoading, setCalLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterRegionId, setFilterRegionId] = useState('');
  const [regions, setRegions] = useState([]);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [totalEvents, setTotalEvents] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calEvents, setCalEvents] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [createPresetDay, setCreatePresetDay] = useState(null);
  const currentUser = user || {};

  useEffect(() => {
    setFilterUser('');
    setFilterRegionId('');
  }, [effectiveCompanyIdForUsers]);

  useEffect(() => {
    loadEventTypes();
  }, []);

  useEffect(() => {
    if (!effectiveCompanyIdForUsers) {
      setUsers([]);
      setRegions([]);
      return;
    }
    api
      .get('/users', { params: { company_id: effectiveCompanyIdForUsers } })
      .then((r) => setUsers(r.data.users || r.data || []))
      .catch(() => setUsers([]));
    api
      .get('/crm/company-regions', { params: { company_id: effectiveCompanyIdForUsers } })
      .then((r) => setRegions(Array.isArray(r.data) ? r.data : []))
      .catch(() => setRegions([]));
  }, [effectiveCompanyIdForUsers]);

  const monthRangeBounds = useMemo(() => {
    const y = calYear;
    const m = calMonth;
    const pad = (n) => String(n).padStart(2, '0');
    const last = new Date(y, m, 0).getDate();
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
  }, [calMonth, calYear]);

  /** Tab Lịch: feed lọc đúng theo tháng đang xem trên lịch */
  useEffect(() => {
    if (view !== 'calendar') return;
    setRangeFrom(monthRangeBounds.from);
    setRangeTo(monthRangeBounds.to);
  }, [view, monthRangeBounds.from, monthRangeBounds.to]);

  useEffect(() => {
    if (view !== 'feed' && view !== 'calendar') return;
    loadFeed();
    if (view === 'calendar') loadCalendar();
  }, [view, filterType, filterStatus, filterUser, filterRegionId, calMonth, calYear, listParams, rangeFrom, rangeTo]);

  const loadEventTypes = () => api.get('/events/event-types').then(r => setEventTypes(r.data || [])).catch(() => {});

  const loadFeed = async () => {
    setLoading(true);
    try {
      const params = { limit: 500, ...listParams };
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      if (filterUser) params.user_id = filterUser;
      if (filterRegionId) params.region_id = filterRegionId;
      if (rangeFrom) params.date_from = rangeFrom;
      if (rangeTo) params.date_to = rangeTo;
      if (search) params.search = search;
      const { data } = await api.get('/events', { params });
      setEvents(data.events || []);
      setTotalEvents(typeof data.total === 'number' ? data.total : (data.events || []).length);
    } catch (e) {
      console.error(e);
      setEvents([]);
      setTotalEvents(0);
    }
    setLoading(false);
  };

  const loadCalendar = async () => {
    setCalLoading(true);
    try {
      const params = { month: calMonth, year: calYear, ...listParams };
      if (filterRegionId) params.region_id = filterRegionId;
      const { data } = await api.get('/events/calendar', { params });
      setCalEvents(data || []);
    } catch (e) { console.error(e); }
    setCalLoading(false);
  };

  const refreshEventsData = () => {
    if (view === 'feed' || view === 'calendar') {
      loadFeed();
      if (view === 'calendar') loadCalendar();
    }
  };

  const handleRespond = async (eventId, status) => {
    try {
      await api.put(`/events/${eventId}/respond`, { status });
      refreshEventsData();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa sự kiện này? (Hành động không thể hoàn tác)')) return;
    try {
      await api.delete(`/events/${id}`);
      refreshEventsData();
    } catch (e) { alert('Lỗi xóa'); }
  };

  /** Hủy sự kiện (mềm) — đổi status='cancelled' + lưu lý do (không xóa khỏi DB). */
  const handleCancel = async (id, reason) => {
    const r = String(reason || '').trim();
    if (!r) { alert('Vui lòng nhập lý do hủy'); return; }
    try {
      await api.put(`/events/${id}`, { status: 'cancelled', cancel_reason: r });
      refreshEventsData();
    } catch (e) { alert(e?.response?.data?.error || 'Lỗi hủy sự kiện'); }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.put(`/events/${id}`, { status });
      refreshEventsData();
    } catch (e) { alert('Lỗi'); }
  };

  const clearFilters = () => {
    setSearch('');
    setFilterType('');
    setFilterStatus('');
    setFilterUser('');
    setFilterRegionId('');
    if (view === 'calendar') {
      setRangeFrom(monthRangeBounds.from);
      setRangeTo(monthRangeBounds.to);
    } else {
      setRangeFrom('');
      setRangeTo('');
    }
  };

  const hasActiveFilters = !!(search || filterType || filterStatus || filterUser || filterRegionId
    || (view === 'feed' && (rangeFrom || rangeTo)));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-blue-600" /> Sự kiện
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalEvents > (events || []).length && (events || []).length >= 500
              ? `Hiển thị ${(events || []).length} / ${totalEvents} sự kiện (giới hạn 500)` 
              : `${totalEvents || (events || []).length} sự kiện`}
            {view === 'calendar' && (
              <span className="text-gray-400"> — khoảng {monthRangeBounds.from} → {monthRangeBounds.to}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isSystemAdmin && (
            <div className="flex items-center gap-2 mr-1 min-w-[200px]">
              <Building2 className="h-4 w-4 text-gray-500 shrink-0" />
              <ScopeFilterBar
                scope={{ ...scope, showDepartment: false, showSearch: false, showDateRange: false }}
                companyLabel=""
                companyAllowAll
              />
            </div>
          )}
          <Link
            to="/crm/events/overview"
            className="h-9 px-3 border rounded-lg text-sm font-medium flex items-center gap-1.5 text-gray-700 hover:bg-gray-50"
          >
            <BarChart3 className="h-4 w-4 text-blue-600" /> Tổng quan
          </Link>
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => setView('calendar')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 cursor-pointer transition ${view === 'calendar' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
              <Calendar className="h-4 w-4" /> Lịch
            </button>
            <button onClick={() => setView('feed')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 cursor-pointer transition ${view === 'feed' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
              <List className="h-4 w-4" /> Feed
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

      {/* Feed: chỉ bộ lọc + danh sách; Lịch: thêm khối lịch tháng phía trên */}
      {(view === 'feed' || view === 'calendar') && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/90 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
              <Filter className="h-3.5 w-3.5" /> Bộ lọc
              {view === 'calendar' && (
                <span className="font-normal normal-case text-gray-500">(tab Lịch: thời gian theo tháng đang chọn)</span>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <label className="block text-[10px] text-gray-500 mb-0.5">Tìm kiếm</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadFeed()}
                    placeholder="Enter để tìm..." className="w-full h-9 pl-10 pr-3 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Từ ngày</label>
                <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
                  disabled={view === 'calendar'}
                  className={`h-9 px-2 border rounded-lg text-sm ${view === 'calendar' ? 'bg-gray-100 text-gray-600' : ''}`}
                  title={view === 'calendar' ? 'Đổi tháng trên lịch để đổi khoảng ngày' : ''} />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Đến ngày</label>
                <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
                  disabled={view === 'calendar'}
                  className={`h-9 px-2 border rounded-lg text-sm ${view === 'calendar' ? 'bg-gray-100 text-gray-600' : ''}`} />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Loại</label>
                <select value={filterType} onChange={e => setFilterType(e.target.value)} className="h-9 px-3 border rounded-lg text-sm min-w-[120px]">
                  <option value="">Tất cả loại</option>
                  {eventTypes.map(t => <option key={t.slug} value={t.slug}>{t.icon} {t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Trạng thái</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 px-3 border rounded-lg text-sm min-w-[130px]">
                  <option value="">Tất cả</option>
                  {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Nhân viên</label>
                <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className="h-9 px-3 border rounded-lg text-sm min-w-[140px]">
                  <option value="">Tất cả</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Khu vực
                </label>
                <select
                  value={filterRegionId}
                  onChange={e => setFilterRegionId(e.target.value)}
                  disabled={!effectiveCompanyIdForUsers}
                  className="h-9 px-3 border rounded-lg text-sm min-w-[150px] disabled:bg-gray-100"
                  title={!effectiveCompanyIdForUsers ? 'Chọn công ty (admin) để lọc khu vực' : ''}
                >
                  <option value="">Tất cả khu vực</option>
                  {regions.map((rg) => (
                    <option key={rg.id} value={rg.id}>{rg.name}{rg.code ? ` (${rg.code})` : ''}</option>
                  ))}
                </select>
              </div>
              {hasActiveFilters && (
                <button type="button" onClick={clearFilters}
                  className="h-9 px-3 text-xs text-red-600 hover:underline cursor-pointer self-end">Xóa lọc</button>
              )}
            </div>
          </div>

          <div className={`p-4 ${view === 'calendar' ? 'space-y-6' : ''}`}>
            {view === 'calendar' && (
              <CalendarView
                month={calMonth} year={calYear} events={calEvents} eventTypes={eventTypes}
                loading={calLoading} selectedDay={selectedDay}
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
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <List className="h-4 w-4 text-gray-500" /> Feed sự kiện
                <span className="text-xs font-normal text-gray-400">(cùng bộ lọc phía trên)</span>
              </h2>
              <div className="space-y-4">
                {loading ? (
                  <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
                ) : events.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Không có sự kiện phù hợp bộ lọc</p>
                  </div>
                ) : events.map(ev => (
                  <EventCard key={ev.id} event={ev} eventTypes={eventTypes} currentUser={currentUser}
                    onRespond={handleRespond} onDelete={handleDelete} onCancel={handleCancel}
                    onStatusChange={handleStatusChange}
                    onEdit={() => { setEditEvent(ev); setShowCreate(true); }} />
                ))}
              </div>
            </div>
          </div>
        </div>
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
          onSaved={() => { setShowCreate(false); setEditEvent(null); setCreatePresetDay(null); refreshEventsData(); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EVENT CARD — Bitrix24-style Feed Card
// ═══════════════════════════════════════════════════════════════
function EventCard({ event: ev, eventTypes, currentUser, onRespond, onDelete, onCancel, onStatusChange, onEdit }) {
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState([]);
  const [showComments, setShowComments] = useState(false);
  const [sending, setSending] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  /** Quyền hủy/xóa: chỉ người tạo (`created_by`) hoặc admin. */
  const canManage = isAdminLike(currentUser)
    || String(ev.created_by || '') === String(currentUser?.id || '');

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
          <button onClick={onEdit} title="Sửa" className="p-1 text-gray-400 hover:text-blue-600 rounded cursor-pointer"><Edit3 className="h-3.5 w-3.5" /></button>
          {canManage && ev.status !== 'cancelled' && ev.status !== 'completed' && typeof onCancel === 'function' && (
            <button
              onClick={() => { setCancelReason(ev.cancel_reason || ''); setShowCancelModal(true); }}
              title="Hủy sự kiện (kèm lý do)"
              className="p-1 text-gray-400 hover:text-amber-600 rounded cursor-pointer"
            >
              <Ban className="h-3.5 w-3.5" />
            </button>
          )}
          {canManage && (
            <button onClick={() => onDelete(ev.id)} title="Xóa sự kiện" className="p-1 text-gray-400 hover:text-red-500 rounded cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
          )}
        </div>
      </div>
      {/* Lý do hủy — hiển thị khi đã cancel */}
      {ev.status === 'cancelled' && ev.cancel_reason && (
        <div className="mx-5 mb-2 -mt-1 rounded-lg border border-red-200 bg-red-50/70 px-3 py-1.5 text-xs text-red-700">
          <span className="font-semibold">Lý do hủy:</span> {ev.cancel_reason}
        </div>
      )}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowCancelModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Ban className="h-4 w-4 text-amber-600" /> Hủy sự kiện
            </h3>
            <p className="text-xs text-gray-500">Sự kiện sẽ chuyển sang trạng thái «Đã hủy» và lưu lý do — không bị xóa khỏi hệ thống.</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Nhập lý do hủy (bắt buộc)…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-400 outline-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={!cancelReason.trim()}
                onClick={async () => {
                  await onCancel(ev.id, cancelReason);
                  setShowCancelModal(false);
                }}
                className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Xác nhận hủy
              </button>
            </div>
          </div>
        </div>
      )}

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
// Chi tiết một sự kiện trong khung « ngày đã chọn » (lịch) — đủ trường như feed
// ═══════════════════════════════════════════════════════════════
function SelectedDayEventDetail({ ev, eventTypes, onEdit }) {
  const typeInfo = eventTypes.find((t) => t.slug === ev.event_type) || ev.event_type_ref || { icon: '📋', name: ev.event_type, color: '#6B7280' };
  const statusInfo = STATUS_MAP[ev.status] || STATUS_MAP.planned;
  const confirmed = (ev.participants || []).filter((p) => p.status === 'confirmed');
  const declined = (ev.participants || []).filter((p) => p.status === 'declined');
  const pending = (ev.participants || []).filter((p) => p.status === 'pending');

  const timeRange = (() => {
    const startLabel = isToday(ev.start_time) ? 'Hôm nay' : formatDateVN(ev.start_time);
    const startTime = formatTime(ev.start_time);
    if (!ev.end_time) return `${startLabel}, ${startTime}`;
    const sameDay = isSameDay(ev.start_time, ev.end_time);
    const endTime = formatTime(ev.end_time);
    if (sameDay) return `${startLabel}, ${startTime} — ${endTime}`;
    const endLabel = isToday(ev.end_time) ? 'Hôm nay' : formatDateVN(ev.end_time);
    return `${startLabel}, ${startTime} → ${endLabel}, ${endTime}`;
  })();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit(ev)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit(ev);
        }
      }}
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-200 hover:shadow-md transition text-left cursor-pointer"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
            style={{ backgroundColor: `${typeInfo.color || '#3B82F6'}22`, color: typeInfo.color || '#3B82F6' }}
          >
            {typeInfo.icon || '📋'}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{typeInfo.name || 'Sự kiện'}</p>
            <p className="text-base font-bold text-gray-900 break-words">{ev.title}</p>
          </div>
        </div>
        <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold shrink-0 ${statusInfo.color}`}>{statusInfo.label}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4">
        <div className="flex sm:flex-col items-center sm:items-center gap-2 sm:w-16 shrink-0">
          <div className="bg-blue-600 text-white text-[10px] font-bold py-0.5 px-2 rounded-t-lg uppercase text-center w-full">
            {getDayOfWeek(ev.start_time)}
          </div>
          <div className="border border-t-0 rounded-b-lg py-2 text-center w-full">
            <span className="text-2xl font-bold text-gray-900">{getDayNum(ev.start_time)}</span>
          </div>
        </div>
        <div className="space-y-2 text-sm min-w-0">
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            <span className="text-xs text-gray-500 shrink-0">Thời gian:</span>
            <span className="text-gray-800 font-medium">{timeRange}</span>
          </div>
          {ev.assignee && (
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              <span className="text-xs text-gray-500 shrink-0">Người phụ trách:</span>
              <span className="text-gray-800">{ev.assignee.full_name}</span>
            </div>
          )}
          {ev.location && (
            <div className="flex flex-wrap gap-x-2 gap-y-1 items-start">
              <span className="text-xs text-gray-500 shrink-0">Địa điểm:</span>
              <span className="text-gray-800 flex items-start gap-1">
                <MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" /> {ev.location}
              </span>
            </div>
          )}
          {ev.lead && (
            <div className="flex flex-wrap gap-x-2 gap-y-1 items-start">
              <span className="text-xs text-gray-500 shrink-0">Deal / Lead:</span>
              <Link
                to={`/crm/leads/${ev.lead.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-blue-600 hover:underline font-medium"
              >
                {ev.lead.code} — {ev.lead.title}
              </Link>
            </div>
          )}
          {ev.customer && (
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              <span className="text-xs text-gray-500 shrink-0">Khách hàng:</span>
              <span className="text-gray-800">
                {ev.customer.full_name}
                {ev.customer.phone ? ` (${ev.customer.phone})` : ''}
              </span>
            </div>
          )}
          {ev.project && (
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              <span className="text-xs text-gray-500 shrink-0">Dự án:</span>
              <span className="text-gray-800">{ev.project.code ? `${ev.project.code} — ` : ''}{ev.project.name}</span>
            </div>
          )}
          {ev.description && <p className="text-gray-600 text-sm whitespace-pre-wrap">{ev.description}</p>}
          {ev.result && (
            <p className="text-sm text-emerald-800 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100">📝 Kết quả: {ev.result}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 pt-1 border-t border-gray-100">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> Tạo: {ev.creator?.full_name || '—'}
            </span>
            {(confirmed.length > 0 || declined.length > 0 || pending.length > 0) && (
              <span>
                Tham dự:{' '}
                {confirmed.length > 0 && <span className="text-emerald-600 font-medium">{confirmed.length} xác nhận</span>}
                {pending.length > 0 && <span className="text-amber-600 font-medium ml-1">{pending.length} chờ</span>}
                {declined.length > 0 && <span className="text-red-600 font-medium ml-1">{declined.length} từ chối</span>}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-blue-600 font-medium mt-3">Nhấn để sửa sự kiện</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CALENDAR VIEW — Monthly grid
// ═══════════════════════════════════════════════════════════════
function CalendarView({ month, year, events, eventTypes, loading, selectedDay, onPrevMonth, onNextMonth, onSelectDay, onOpenCreateForDay, onEdit }) {
  const selectedDayDetailRef = useRef(null);
  const [scrollToDetailNonce, setScrollToDetailNonce] = useState(0);

  useLayoutEffect(() => {
    if (scrollToDetailNonce === 0) return;
    const el = selectedDayDetailRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [scrollToDetailNonce, selectedDay]);

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

  const selectedDayEvents = selectedDay
    ? [...(eventsByDay[selectedDay] || [])].sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    : [];

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

          {/* Calendar grid — mỗi ô: vùng xanh nhạt (Tạo mới) + vùng vàng nhạt (Xem lịch) */}
          <div className="grid grid-cols-7 border-t border-l">
            {cells.map((day, i) => {
              const dayEvents = day ? (eventsByDay[day] || []) : [];
              const isTodayCell = isCurrentMonth && day === today.getDate();
              const isSelected = day === selectedDay;
              return (
                <div
                  key={i}
                  role="presentation"
                  className={`min-h-[100px] border-r border-b flex flex-col overflow-hidden transition
                    ${!day ? 'bg-gray-50' : ''}
                    ${isSelected ? 'ring-2 ring-blue-400 ring-inset z-[1]' : ''}
                  `}
                >
                  {day && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDay(day);
                          onOpenCreateForDay(day);
                        }}
                        className="flex-shrink-0 w-full text-left bg-sky-100 hover:bg-sky-200/90 border-b border-sky-200/60 px-1 py-1 flex items-center justify-between gap-0.5 cursor-pointer"
                        aria-label={`Tạo sự kiện ngày ${day}`}
                      >
                        <span
                          className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full shrink-0
                            ${isTodayCell ? 'bg-blue-600 text-white' : 'text-gray-800'}
                          `}
                        >
                          {day}
                        </span>
                        <span className="text-[9px] font-semibold text-sky-900/80 leading-tight text-right">Tạo mới</span>
                      </button>
                      <div
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectDay(day);
                            setScrollToDetailNonce((n) => n + 1);
                          }
                        }}
                        onClick={(e) => {
                          if (!day) return;
                          if (e.target.closest?.('[data-cal-event-chip]')) return;
                          onSelectDay(day);
                          setScrollToDetailNonce((n) => n + 1);
                        }}
                        className="flex-1 min-h-[56px] bg-amber-50 hover:bg-amber-100/90 p-0.5 flex flex-col cursor-pointer border-t border-amber-100"
                        aria-label={`Xem lịch ngày ${day}`}
                      >
                        <div className="text-[9px] font-semibold text-amber-900/70 px-0.5 mb-0.5 shrink-0">Xem lịch</div>
                        <div className="space-y-0.5 flex-1 min-h-0 overflow-hidden">
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
                                  setScrollToDetailNonce((n) => n + 1);
                                  onEdit(ev);
                                }}
                              >
                                {typeInfo.icon} {ev.title}
                              </div>
                            );
                          })}
                          {dayEvents.length > 3 && (
                            <div className="text-[10px] text-amber-800/60 px-1">+{dayEvents.length - 3} khác</div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected day detail — cuộn tới đây khi bấm « Xem lịch » */}
          {selectedDay && (
            <div
              ref={selectedDayDetailRef}
              id="events-calendar-day-detail"
              className="mt-4 border-t pt-4 scroll-mt-24"
            >
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex flex-wrap items-center gap-2">
                <span>📅 Ngày {selectedDay}/{month}/{year}</span>
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                  {selectedDayEvents.length} sự kiện
                </span>
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Khảo sát / lịch trong ngày — đủ thông tin; nhấn thẻ để chỉnh sửa.
              </p>
              {selectedDayEvents.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50">
                  Không có sự kiện trong ngày này
                </p>
              ) : (
                <div className="space-y-4">
                  {selectedDayEvents.map((ev) => (
                    <SelectedDayEventDetail key={ev.id} ev={ev} eventTypes={eventTypes} onEdit={onEdit} />
                  ))}
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
function EventCreateModal({ event, presetDay, eventTypes, users, onClose, onSaved }) {
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

  /** Tạo mới: tự mời tất cả nhân viên có trong danh sách (một lần khi load users) */
  useEffect(() => {
    if (isEdit || participantsAutoFilled.current || !users?.length) return;
    participantsAutoFilled.current = true;
    setParticipantIds(users.map((u) => u.id));
  }, [isEdit, users]);

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
      const payload = {
        ...form,
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