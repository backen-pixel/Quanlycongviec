import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { Bell, Check, CheckCheck, Clock, MessageSquare, CheckSquare, FolderKanban, AlertTriangle, X } from 'lucide-react';
import { formatDateTime, getInitials, avatarColor } from '../lib/utils';

const ICON_MAP = {
  task_assigned: CheckSquare,
  task_updated: CheckSquare,
  task_overdue: AlertTriangle,
  comment_added: MessageSquare,
  project_stage_changed: FolderKanban,
  deadline_reminder: Clock,
  system: Bell,
};

const COLOR_MAP = {
  task_assigned: 'bg-blue-100 text-blue-600',
  task_updated: 'bg-emerald-100 text-emerald-600',
  task_overdue: 'bg-red-100 text-red-600',
  comment_added: 'bg-purple-100 text-purple-600',
  project_stage_changed: 'bg-amber-100 text-amber-600',
  deadline_reminder: 'bg-orange-100 text-orange-600',
  system: 'bg-gray-100 text-gray-600',
};

export default function NotificationCenter({ socket }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('all'); // 'all' | 'unread'
  const panelRef = useRef(null);

  // Load notifications
  const load = async () => {
    setLoading(true);
    try {
      const params = tab === 'unread' ? { unread: 'true' } : {};
      const { data } = await api.get('/dashboard/notifications', { params });
      setNotifications(data.notifications || []);
    } catch { }
    setLoading(false);
  };

  // Load unread count
  const loadCount = async () => {
    try {
      const { data } = await api.get('/dashboard');
      setUnreadCount(data.stats?.unread || 0);
    } catch { }
  };

  useEffect(() => {
    loadCount();
    // Poll mỗi 30s
    const interval = setInterval(loadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Socket.IO realtime
  useEffect(() => {
    if (!socket) return;
    const handler = (notif) => {
      setUnreadCount(c => c + 1);
      setNotifications(prev => [notif, ...prev]);
    };
    socket.on('notification', handler);
    return () => socket.off('notification', handler);
  }, [socket]);

  useEffect(() => {
    if (open) load();
  }, [open, tab]);

  // Click outside to close
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markAllRead = async () => {
    try {
      await api.put('/dashboard/notifications/read-all');
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch { }
  };

  const markRead = async (id) => {
    try {
      await api.put(`/dashboard/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch { }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative w-9 h-9 rounded-lg hover:bg-[var(--color-sidebar-hover)] flex items-center justify-center text-[var(--color-sidebar-text)] hover:text-white transition-colors cursor-pointer"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse-dot">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute left-full ml-2 top-0 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 animate-fade-in overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Thông báo</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer flex items-center gap-1">
                  <CheckCheck className="h-3.5 w-3.5" /> Đọc tất cả
                </button>
              )}
              <button onClick={() => setOpen(false)} className="w-6 h-6 rounded hover:bg-gray-100 flex items-center justify-center text-gray-400 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button onClick={() => setTab('all')}
              className={`flex-1 py-2 text-xs font-medium text-center cursor-pointer ${tab === 'all' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>
              Tất cả
            </button>
            <button onClick={() => setTab('unread')}
              className={`flex-1 py-2 text-xs font-medium text-center cursor-pointer ${tab === 'unread' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>
              Chưa đọc {unreadCount > 0 && `(${unreadCount})`}
            </button>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <svg className="animate-spin h-5 w-5 text-gray-400" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-10">
                <Bell className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">{tab === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo'}</p>
              </div>
            ) : (
              notifications.map(n => {
                const Icon = ICON_MAP[n.type] || Bell;
                const color = COLOR_MAP[n.type] || 'bg-gray-100 text-gray-600';
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.is_read && markRead(n.id)}
                    className={`flex gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 transition-colors ${!n.is_read ? 'bg-blue-50/40' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center shrink-0`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm ${!n.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                          {n.title}
                        </p>
                        {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{formatDateTime(n.created_at)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
