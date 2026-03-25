import { useEffect, useState } from 'react';
import api from '../lib/api';

/**
 * NotificationSettings — UI for notification preferences and web push
 */
export default function NotificationSettings({ isOpen, onClose }) {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      checkPushSupport();
      fetchPreferences();
    }
  }, [isOpen]);

  const checkPushSupport = async () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setPushSubscribed(!!subscription);
      } catch {}
    }
  };

  const fetchPreferences = async () => {
    try {
      const { data } = await api.get('/push/preferences');
      setPreferences(data);
    } catch (e) {
      // If table doesn't exist yet, use defaults
      setPreferences({
        browser_push: true, sound: true,
        task_assigned: true, task_completed: true, deadline_warning: true,
        comment_added: true, stage_changed: true, deal_won: true,
        approval_request: true, checklist_completed: true,
        lead_assigned: true, order_confirmed: true, invoice_overdue: true,
      });
    }
  };

  const handleTogglePush = async () => {
    if (!pushSupported) { alert('Web push không được hỗ trợ trên thiết bị này'); return; }

    if (pushSubscribed) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await api.post('/push/unsubscribe', { endpoint: subscription.endpoint });
          await subscription.unsubscribe();
          setPushSubscribed(false);
        }
      } catch (e) { console.error('Unsubscribe error:', e); }
    } else {
      try {
        await navigator.serviceWorker.register('/sw.js');
        const { data: vapidData } = await api.get('/push/vapid-key');
        if (!vapidData?.vapidPublicKey) { alert('Web push chưa được cấu hình trên server'); return; }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') { alert('Bạn đã từ chối quyền thông báo'); return; }

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidData.vapidPublicKey),
        });

        await api.post('/push/subscribe', { subscription: subscription.toJSON() });
        setPushSubscribed(true);
        setSaveStatus('✓ Đã bật thông báo browser');
        setTimeout(() => setSaveStatus(''), 3000);
      } catch (e) { alert('Lỗi bật thông báo: ' + e.message); }
    }
  };

  const toggle = (key) => setPreferences(prev => ({ ...prev, [key]: !prev[key] }));

  const save = async () => {
    setLoading(true);
    try {
      await api.put('/push/preferences', preferences);
      setSaveStatus('✓ Đã lưu cài đặt');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch { setSaveStatus('✗ Lỗi lưu cài đặt'); }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col animate-fade-in">
        {/* Header */}
        <div className="border-b p-4 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-gray-900">🔔 Cài đặt thông báo</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 cursor-pointer">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Browser Push */}
          {pushSupported && (
            <div className="border rounded-xl p-4 bg-blue-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">📱 Thông báo Browser</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {pushSubscribed ? 'Đang nhận thông báo desktop' : 'Bật để nhận thông báo desktop'}
                  </p>
                </div>
                <button onClick={handleTogglePush}
                  className={`h-8 px-4 rounded-full text-xs font-bold cursor-pointer transition-all ${
                    pushSubscribed ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}>
                  {pushSubscribed ? '✓ Đang bật' : 'Bật'}
                </button>
              </div>
            </div>
          )}

          {!preferences ? (
            <div className="text-center py-8 text-gray-400 text-sm">Đang tải...</div>
          ) : (
            <>
              {/* Global */}
              <div className="space-y-1">
                <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wide">Chung</h3>
                <Toggle label="🔊 Âm thanh thông báo" checked={preferences.sound} onChange={() => toggle('sound')} />
              </div>

              {/* By Type */}
              <div className="space-y-1">
                <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wide">Loại thông báo</h3>
                <Toggle label="📌 Công việc được giao" checked={preferences.task_assigned} onChange={() => toggle('task_assigned')} />
                <Toggle label="✅ Công việc hoàn thành" checked={preferences.task_completed} onChange={() => toggle('task_completed')} />
                <Toggle label="⏰ Cảnh báo deadline" checked={preferences.deadline_warning} onChange={() => toggle('deadline_warning')} />
                <Toggle label="💬 Bình luận dự án" checked={preferences.comment_added} onChange={() => toggle('comment_added')} />
                <Toggle label="🎯 Chuyển giai đoạn" checked={preferences.stage_changed} onChange={() => toggle('stage_changed')} />
                <Toggle label="📋 Checklist hoàn tất" checked={preferences.checklist_completed} onChange={() => toggle('checklist_completed')} />
                <Toggle label="📋 Yêu cầu duyệt" checked={preferences.approval_request} onChange={() => toggle('approval_request')} />
                <Toggle label="👤 Lead được giao" checked={preferences.lead_assigned} onChange={() => toggle('lead_assigned')} />
                <Toggle label="🏆 Deal thắng" checked={preferences.deal_won} onChange={() => toggle('deal_won')} />
                <Toggle label="📦 Đơn hàng xác nhận" checked={preferences.order_confirmed} onChange={() => toggle('order_confirmed')} />
                <Toggle label="💰 Hóa đơn quá hạn" checked={preferences.invoice_overdue} onChange={() => toggle('invoice_overdue')} />
              </div>
            </>
          )}

          {saveStatus && (
            <p className={`text-sm font-medium text-center ${saveStatus.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>{saveStatus}</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex gap-2 shrink-0 bg-gray-50">
          <button onClick={onClose} className="flex-1 h-10 rounded-lg border text-gray-700 hover:bg-gray-100 font-medium text-sm cursor-pointer">Đóng</button>
          <button onClick={save} disabled={loading || !preferences}
            className="flex-1 h-10 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium text-sm cursor-pointer disabled:opacity-50">
            {loading ? 'Đang lưu...' : '💾 Lưu cài đặt'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer select-none">
      <div onClick={e => { e.preventDefault(); onChange(); }}
        className={`w-9 h-5 rounded-full flex items-center cursor-pointer transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}>
        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm text-gray-700 flex-1">{label}</span>
    </label>
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
