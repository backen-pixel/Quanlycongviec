import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { alertIncomingNotification, cancelNotificationSpeech } from '../lib/notificationAlert';
import { setNotificationPrefsCache, getNotificationPrefsCache, isNotificationTypeEnabled } from '../lib/notificationPrefsCache';
import { Bell, Check, CheckCheck, Clock, MessageSquare, CheckSquare, FolderKanban, AlertTriangle, X, ThumbsUp, ThumbsDown, Paperclip, FileText, Shield, ShieldCheck, ShieldAlert, XCircle, RotateCcw, Settings, Users } from 'lucide-react';
import { formatDateTime, getInitials, avatarColor } from '../lib/utils';
import NotificationToast from './NotificationToast';
import NotificationSettings from './NotificationSettings';

const ICON_MAP = {
  task_assigned: CheckSquare,
  task_updated: CheckSquare,
  task_overdue: AlertTriangle,
  task_completed: CheckSquare,
  comment_added: MessageSquare,
  project_stage_changed: FolderKanban,
  project_assigned: FolderKanban,
  stage_changed: FolderKanban,
  approval_request: Shield,
  approval_approved: ShieldCheck,
  approval_rejected: XCircle,
  approval_auto: ShieldCheck,
  deadline_reminder: Clock,
  deadline_warning: Clock,
  deadline_overdue: AlertTriangle,
  checklist_completed: CheckSquare,
  lead_assigned: CheckSquare,
  lead_created: FolderKanban,
  lead_converted: FolderKanban,
  lead_stage_changed: FolderKanban,
  lead_member_added: Users,
  lead_chat: MessageSquare,
  lead_member: CheckSquare,
  deal_assigned: CheckSquare,
  deal_created: FolderKanban,
  deal_won: FolderKanban,
  quotation_created: FileText,
  quotation_updated: FileText,
  order_created: FileText,
  order_confirmed: FileText,
  order_updated: FileText,
  invoice_created: FileText,
  invoice_overdue: AlertTriangle,
  payment_received: CheckSquare,
  crm_task_assigned: CheckSquare,
  crm_task_completed: CheckSquare,
  document_uploaded: Paperclip,
  project_created: FolderKanban,
  item_deleted: AlertTriangle,
  system: Bell,
};

const COLOR_MAP = {
  task_assigned: 'bg-blue-100 text-blue-600',
  task_updated: 'bg-emerald-100 text-emerald-600',
  task_overdue: 'bg-red-100 text-red-600',
  task_completed: 'bg-emerald-100 text-emerald-600',
  comment_added: 'bg-purple-100 text-purple-600',
  project_stage_changed: 'bg-amber-100 text-amber-600',
  project_assigned: 'bg-blue-100 text-blue-600',
  stage_changed: 'bg-amber-100 text-amber-600',
  approval_request: 'bg-orange-100 text-orange-600',
  approval_approved: 'bg-emerald-100 text-emerald-600',
  approval_rejected: 'bg-red-100 text-red-600',
  approval_auto: 'bg-emerald-100 text-emerald-600',
  deadline_reminder: 'bg-orange-100 text-orange-600',
  deadline_warning: 'bg-amber-100 text-amber-600',
  deadline_overdue: 'bg-red-100 text-red-600',
  checklist_completed: 'bg-lime-100 text-lime-700',
  lead_assigned: 'bg-cyan-100 text-cyan-600',
  lead_member_added: 'bg-indigo-100 text-indigo-600',
  lead_chat: 'bg-purple-100 text-purple-600',
  lead_member: 'bg-cyan-100 text-cyan-600',
  deal_won: 'bg-emerald-100 text-emerald-600',
  order_confirmed: 'bg-orange-100 text-orange-600',
  invoice_overdue: 'bg-red-100 text-red-600',
  system: 'bg-gray-100 text-gray-600',
};

export default function NotificationCenter({ socket }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('all');
  const [toastNotification, setToastNotification] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const panelRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = tab === 'unread' ? { unread: 'true' } : {};
      const { data } = await api.get('/dashboard/notifications', { params });
      setNotifications(data.notifications || []);
    } catch { }
    setLoading(false);
  };

  const loadCount = async () => {
    try {
      const { data } = await api.get('/dashboard');
      setUnreadCount(data.stats?.unread || 0);
    } catch { }
  };

  useEffect(() => {
    loadCount();
    const interval = setInterval(loadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/push/preferences');
        if (!cancelled && data) setNotificationPrefsCache(data);
      } catch {
        if (!cancelled) {
          setNotificationPrefsCache({
            browser_push: true,
            sound: true,
            task_assigned: true,
            task_completed: true,
            deadline_warning: true,
            comment_added: true,
            stage_changed: true,
            deal_won: true,
            approval_request: true,
            checklist_completed: true,
            lead_assigned: true,
            order_confirmed: true,
            invoice_overdue: true,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = (notif) => {
      if (!isNotificationTypeEnabled(notif?.type)) return;

      cancelNotificationSpeech();

      setUnreadCount(c => c + 1);
      setNotifications(prev => [notif, ...prev]);
      setToastNotification(notif);

      const p = getNotificationPrefsCache();
      if (p.sound !== false) {
        void alertIncomingNotification({ type: notif.type });
      }
    };
    socket.on('notification', handler);
    return () => socket.off('notification', handler);
  }, [socket]);

  useEffect(() => {
    if (open) load();
  }, [open, tab]);

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

  const [approvalForm, setApprovalForm] = useState(null); // { notifId, action, reason }

  // Handle approval action
  const handleApproval = async (notifId, action, reason) => {
    const notif = notifications.find(n => n.id === notifId);
    const meta = notif?.metadata;
    if (!meta?.project_id) return;
    if (!reason?.trim()) { alert('Vui lòng nhập lý do!'); return; }
    try {
      await api.post(`/projects/${meta.project_id}/approve-advance`, {
        notification_id: notifId,
        action,
        reject_reason: reason.trim(),
      });
      setNotifications(prev => prev.map(n =>
        n.id === notifId ? { ...n, is_read: true, metadata: { ...n.metadata, status: action === 'approve' ? 'approved' : 'rejected' } } : n
      ));
      setUnreadCount(c => Math.max(0, c - 1));
      setApprovalForm(null);
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Toast Notification */}
      {toastNotification && (
        <NotificationToast
          notification={toastNotification}
          onDismiss={() => setToastNotification(null)}
          onNavigate={(notif) => {
            const pid = notif.metadata?.project_id || (notif.entity_type === 'project' ? notif.entity_id : null);
            const navTab = notif.metadata?.nav_tab;
            if (pid) {
              navigate(navTab ? `/projects/${pid}?tab=${navTab}` : `/projects/${pid}`);
            } else if (notif.entity_type === 'crm_lead' || notif.entity_type === 'crm_deal' || notif.entity_type === 'lead') {
              const chatTab = notif.metadata?.nav_tab;
              navigate(chatTab ? `/crm/leads/${notif.entity_id}?tab=${chatTab}` : `/crm/leads/${notif.entity_id}`);
            } else if (notif.entity_type === 'quotation') {
              navigate(`/crm/quotations/${notif.entity_id}`);
            } else if (notif.entity_type === 'order') {
              navigate(`/crm/orders/${notif.entity_id}`);
            } else if (notif.entity_type === 'invoice') {
              navigate(`/crm/invoices/${notif.entity_id}`);
            } else if (notif.entity_type === 'crm_task') {
              navigate(`/crm/tasks`);
            } else if (notif.entity_type === 'event') {
              navigate(`/crm/events`);
            } else if (notif.entity_type === 'release_note') {
              navigate(`/updates`);
            }
            setOpen(false);
          }}
        />
      )}

      {/* Settings Modal */}
      <NotificationSettings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

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

      {open && (
        <div className="absolute left-full ml-2 top-0 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 animate-fade-in overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Thông báo</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer flex items-center gap-1">
                  <CheckCheck className="h-3.5 w-3.5" /> Đọc tất cả
                </button>
              )}
              <button 
                onClick={() => setSettingsOpen(true)}
                className="w-6 h-6 rounded hover:bg-gray-100 flex items-center justify-center text-gray-400 cursor-pointer hover:text-gray-600 transition-colors"
                title="Cài đặt thông báo"
              >
                <Settings className="h-4 w-4" />
              </button>
              <button onClick={() => setOpen(false)} className="w-6 h-6 rounded hover:bg-gray-100 flex items-center justify-center text-gray-400 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

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
                const isApproval = n.metadata?.type === 'approval_request';
                const Icon = isApproval ? FolderKanban : (ICON_MAP[n.type] || Bell);
                const color = isApproval ? 'bg-orange-100 text-orange-600' : (COLOR_MAP[n.type] || 'bg-gray-100 text-gray-600');
                const approvalStatus = n.metadata?.status; // pending | approved | rejected

                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.is_read && !isApproval) markRead(n.id);
                      // Smart navigation based on entity type
                      const pid = n.metadata?.project_id || (n.entity_type === 'project' ? n.entity_id : null);
                      const navTab = n.metadata?.nav_tab;
                      if (pid) {
                        navigate(navTab ? `/projects/${pid}?tab=${navTab}` : `/projects/${pid}`);
                      } else if (n.entity_type === 'task' && n.entity_id) {
                        navigate(`/tasks?task=${n.entity_id}`);
                      } else if (n.entity_type === 'crm_lead' || n.entity_type === 'crm_deal' || n.entity_type === 'lead') {
                        const chatTab = n.metadata?.nav_tab;
                        navigate(chatTab ? `/crm/leads/${n.entity_id}?tab=${chatTab}` : `/crm/leads/${n.entity_id}`);
                      } else if (n.entity_type === 'quotation') {
                        navigate(`/crm/quotations/${n.entity_id}`);
                      } else if (n.entity_type === 'order') {
                        navigate(`/crm/orders/${n.entity_id}`);
                      } else if (n.entity_type === 'invoice') {
                        navigate(`/crm/invoices/${n.entity_id}`);
                      } else if (n.entity_type === 'crm_task') {
                        navigate(`/crm/tasks`);
                      } else if (n.entity_type === 'event') {
                        navigate(`/crm/events`);
                      } else if (n.entity_type === 'release_note') {
                        navigate(`/updates`);
                      }
                      setOpen(false);
                    }}
                    className={`px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 transition-colors ${!n.is_read ? 'bg-blue-50/40' : ''}`}
                  >
                    <div className="flex gap-3">
                      <div className={`w-8 h-8 rounded-lg ${isApproval ? 'bg-orange-100 text-orange-600' : color} flex items-center justify-center shrink-0`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm ${!n.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                            {n.title}
                          </p>
                          {!n.is_read && !isApproval && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 whitespace-pre-line">{n.message}</p>

                        {/* Approval: show notes + files */}
                        {isApproval && n.metadata?.notes && (
                          <div className="mt-1.5 bg-amber-50 border border-amber-100 rounded-lg p-2">
                            <p className="text-xs text-amber-800">📝 {n.metadata.notes}</p>
                          </div>
                        )}
                        {isApproval && n.metadata?.attachments?.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {n.metadata.attachments.map((f, fi) => {
                              const isImg = f.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.file_url || f.file_name || '');
                              return isImg ? (
                                <a key={fi} href={f.file_url} target="_blank" rel="noopener noreferrer">
                                  <img src={f.file_url} alt={f.file_name} className="h-12 w-12 rounded border object-cover" />
                                </a>
                              ) : (
                                <a key={fi} href={f.file_url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                                  <Paperclip className="h-2.5 w-2.5" />{f.file_name || 'file'}
                                </a>
                              );
                            })}
                          </div>
                        )}

                        {/* Approval action buttons */}
                        {isApproval && approvalStatus === 'pending' && approvalForm?.notifId !== n.id && (
                          <div className="flex items-center gap-2 mt-2">
                            <button onClick={(e) => { e.stopPropagation(); setApprovalForm({ notifId: n.id, action: 'approve', reason: '' }); }}
                              className="h-7 px-3 bg-emerald-600 text-white rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer hover:bg-emerald-700">
                              <ThumbsUp className="h-3 w-3" /> Duyệt
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setApprovalForm({ notifId: n.id, action: 'reject', reason: '' }); }}
                              className="h-7 px-3 bg-red-100 text-red-600 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer hover:bg-red-200">
                              <ThumbsDown className="h-3 w-3" /> Từ chối
                            </button>
                          </div>
                        )}
                        {/* Inline reason form */}
                        {isApproval && approvalForm?.notifId === n.id && (
                          <div className="mt-2 space-y-1.5" onClick={e => e.stopPropagation()}>
                            <p className="text-[10px] font-semibold text-gray-700">
                              {approvalForm.action === 'approve' ? '✅ Lý do duyệt:' : '❌ Lý do từ chối:'}
                            </p>
                            <textarea
                              value={approvalForm.reason}
                              onChange={e => setApprovalForm(f => ({ ...f, reason: e.target.value }))}
                              className="w-full h-14 px-2 py-1.5 border rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-300"
                              placeholder={approvalForm.action === 'approve' ? 'Lý do duyệt (bắt buộc)...' : 'Lý do từ chối (bắt buộc)...'}
                              autoFocus
                            />
                            <div className="flex gap-1.5">
                              <button onClick={() => handleApproval(n.id, approvalForm.action, approvalForm.reason)}
                                className={`h-6 px-2.5 text-white rounded text-[10px] font-medium cursor-pointer ${approvalForm.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-500 hover:bg-red-600'}`}>
                                {approvalForm.action === 'approve' ? '✅ Xác nhận duyệt' : '❌ Xác nhận từ chối'}
                              </button>
                              <button onClick={() => setApprovalForm(null)}
                                className="h-6 px-2 text-gray-500 bg-gray-100 rounded text-[10px] cursor-pointer">Hủy</button>
                            </div>
                          </div>
                        )}
                        {isApproval && approvalStatus === 'approved' && (
                          <p className="text-[10px] text-emerald-600 font-medium mt-1">✅ Đã duyệt</p>
                        )}
                        {isApproval && approvalStatus === 'rejected' && (
                          <p className="text-[10px] text-red-500 font-medium mt-1">❌ Đã từ chối</p>
                        )}

                        <p className="text-[10px] text-gray-400 mt-1">{formatDateTime(n.created_at)}</p>
                      </div>
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
