import { useEffect, useState } from 'react';
import api from '../lib/api';
import {
  setNotificationPrefsCache,
  setReadTitleAloudEnabled,
  setNotificationVolumePercent,
  setNotificationSpeechVolumePercent,
  setUseCustomNotificationSound,
  setNotificationCustomSoundTrim,
  setNotificationCustomSoundFileDurationSec,
  clearNotificationCustomSoundMeta,
} from '../lib/notificationPrefsCache';
import {
  saveCustomNotificationSoundBuffer,
  clearCustomNotificationSoundBuffer,
  getCustomNotificationSoundBuffer,
} from '../lib/notificationSoundIdb';
import { playLoudNotificationSound, invalidateNotificationSoundCache } from '../lib/notificationAlert';

/**
 * NotificationSettings — UI for notification preferences and web push
 */
export default function NotificationSettings({ isOpen, onClose }) {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [readTitleAloud, setReadTitleAloud] = useState(true);
  const [soundVolume, setSoundVolume] = useState(100);
  const [speechVolume, setSpeechVolume] = useState(100);
  const [customSoundHint, setCustomSoundHint] = useState('');
  const [fileDurationSec, setFileDurationSec] = useState(0);
  const [trimStartSec, setTrimStartSec] = useState(0);
  const [trimPlaySec, setTrimPlaySec] = useState(15);
  const [hasCustomBell, setHasCustomBell] = useState(false);

  const syncTrimFromStorage = (duration) => {
    const dur = Number(duration) || 0;
    const st = parseFloat(localStorage.getItem('notification_custom_sound_start_sec') || '0');
    const ln = parseFloat(localStorage.getItem('notification_custom_sound_play_sec') || '15');
    const maxStart = Math.max(0, dur - 0.05);
    const start = Number.isFinite(st) ? Math.min(Math.max(0, st), maxStart) : 0;
    const maxLen = Math.min(15, Math.max(0.05, dur - start));
    const play = Number.isFinite(ln) ? Math.min(Math.max(0.05, ln), maxLen) : Math.min(15, dur);
    setTrimStartSec(start);
    setTrimPlaySec(play);
    setNotificationCustomSoundTrim(start, play);
  };

  useEffect(() => {
    if (isOpen) {
      checkPushSupport();
      fetchPreferences();
      try {
        setReadTitleAloud(localStorage.getItem('notification_read_title_aloud') !== '0');
        const v = parseInt(localStorage.getItem('notification_volume_percent') || '100', 10);
        setSoundVolume(Number.isFinite(v) ? Math.min(150, Math.max(0, v)) : 100);
        const sv = parseInt(localStorage.getItem('notification_speech_volume_percent') || '100', 10);
        setSpeechVolume(Number.isFinite(sv) ? Math.min(100, Math.max(0, sv)) : 100);
        const useC = localStorage.getItem('notification_use_custom_sound') === '1';
        setHasCustomBell(useC);
        const d = parseFloat(localStorage.getItem('notification_custom_sound_file_duration_sec') || '0');
        if (useC && Number.isFinite(d) && d > 0) {
          setFileDurationSec(d);
          syncTrimFromStorage(d);
          setCustomSoundHint(`Đang dùng file tùy chỉnh — tổng ${d.toFixed(1)}s (phát tối đa 15s / lần).`);
        } else if (useC) {
          setCustomSoundHint('Đang dùng file tùy chỉnh — đang đọc thời lượng…');
        } else {
          setFileDurationSec(0);
          setCustomSoundHint('');
        }
      } catch {
        setReadTitleAloud(true);
      }
    }
  }, [isOpen]);

  /** Bản cài cũ: có file trong IDB nhưng chưa lưu độ dài — giải mã một lần khi mở cài đặt. */
  useEffect(() => {
    if (!isOpen || !hasCustomBell) return;
    if (fileDurationSec > 0) return;
    let cancelled = false;
    (async () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      try {
        const raw = await getCustomNotificationSoundBuffer();
        if (!raw || cancelled) return;
        const buf = await ctx.decodeAudioData(raw.slice(0));
        if (cancelled) return;
        setFileDurationSec(buf.duration);
        setNotificationCustomSoundFileDurationSec(buf.duration);
        syncTrimFromStorage(buf.duration);
        setCustomSoundHint(`Đang dùng file tùy chỉnh — tổng ${buf.duration.toFixed(1)}s (phát tối đa 15s / lần).`);
      } catch {
        if (!cancelled) setCustomSoundHint('Không đọc được file chuông — chọn lại (MP3/WAV…).');
      } finally {
        await ctx.close().catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, hasCustomBell, fileDurationSec]);

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
      setNotificationPrefsCache(data);
    } catch (e) {
      // If table doesn't exist yet, use defaults
      const fallback = {
        browser_push: true, sound: true,
        task_assigned: true, task_completed: true, deadline_warning: true,
        comment_added: true, stage_changed: true, deal_won: true,
        approval_request: true, checklist_completed: true,
        lead_assigned: true, order_confirmed: true, invoice_overdue: true,
      };
      setPreferences(fallback);
      setNotificationPrefsCache(fallback);
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

  const applySoundVolume = (n) => {
    const x = Math.min(150, Math.max(0, Math.round(n)));
    setSoundVolume(x);
    setNotificationVolumePercent(x);
  };

  const applySpeechVolume = (n) => {
    const x = Math.min(100, Math.max(0, Math.round(n)));
    setSpeechVolume(x);
    setNotificationSpeechVolumePercent(x);
  };

  const handleTrimStart = (value) => {
    const dur = fileDurationSec;
    if (!(dur > 0)) return;
    const maxStart = Math.max(0, dur - 0.05);
    const st = Math.min(Math.max(0, value), maxStart);
    const maxLen = Math.min(15, Math.max(0.05, dur - st));
    const ln = Math.min(trimPlaySec, maxLen);
    setTrimStartSec(st);
    setTrimPlaySec(ln);
    setNotificationCustomSoundTrim(st, ln);
  };

  const handleTrimPlay = (value) => {
    const dur = fileDurationSec;
    if (!(dur > 0)) return;
    const maxStart = Math.max(0, dur - 0.05);
    const st = Math.min(trimStartSec, maxStart);
    const maxLen = Math.min(15, Math.max(0.05, dur - st));
    const ln = Math.min(Math.max(0.05, value), maxLen);
    setTrimStartSec(st);
    setTrimPlaySec(ln);
    setNotificationCustomSoundTrim(st, ln);
  };

  const handleCustomSoundFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      alert('Trình duyệt không hỗ trợ Web Audio.');
      return;
    }
    const ctx = new Ctx();
    try {
      const raw = await file.arrayBuffer();
      const copy = raw.slice(0);
      const audioBuf = await ctx.decodeAudioData(copy);
      await saveCustomNotificationSoundBuffer(raw.slice(0));
      setUseCustomNotificationSound(true);
      setHasCustomBell(true);
      setFileDurationSec(audioBuf.duration);
      setNotificationCustomSoundFileDurationSec(audioBuf.duration);
      const defaultLen = Math.min(15, Math.max(0.05, audioBuf.duration));
      setTrimStartSec(0);
      setTrimPlaySec(defaultLen);
      setNotificationCustomSoundTrim(0, defaultLen);
      invalidateNotificationSoundCache();
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      setCustomSoundHint(
        `Đã lưu ${ext === 'mp3' || file.type === 'audio/mpeg' ? 'MP3' : 'âm thanh'}: ${file.name} — dài ${audioBuf.duration.toFixed(1)}s (chọn đoạn phát bên dưới, tối đa 15s).`,
      );
    } catch (err) {
      alert('Không đọc được file âm thanh (thử MP3/WAV). ' + (err?.message || String(err)));
    } finally {
      await ctx.close().catch(() => {});
    }
  };

  const clearCustomSound = async () => {
    await clearCustomNotificationSoundBuffer();
    clearNotificationCustomSoundMeta();
    setUseCustomNotificationSound(false);
    invalidateNotificationSoundCache();
    setCustomSoundHint('');
    setFileDurationSec(0);
    setHasCustomBell(false);
    setTrimStartSec(0);
    setTrimPlaySec(15);
  };

  const save = async () => {
    setLoading(true);
    try {
      await api.put('/push/preferences', preferences);
      setNotificationPrefsCache(preferences);
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
              <div className="space-y-2">
                <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wide">Chung</h3>
                <Toggle label="🔊 Bật chuông thông báo" checked={preferences.sound} onChange={() => toggle('sound')} />
                <div className="px-3 py-2 rounded-lg bg-gray-50 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm text-gray-700">Âm lượng chuông</label>
                    <span className="text-xs font-mono text-gray-500">{soundVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={150}
                    value={soundVolume}
                    onChange={(ev) => applySoundVolume(Number(ev.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <p className="text-[10px] text-gray-500">0% = tắt chuông (vẫn có thể đọc thông báo nếu bật bên dưới).</p>
                </div>
                <div className="px-3 py-2 rounded-lg bg-gray-50 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm text-gray-700">Âm lượng giọng đọc</label>
                    <span className="text-xs font-mono text-gray-500">{speechVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={speechVolume}
                    onChange={(ev) => applySpeechVolume(Number(ev.target.value))}
                    className="w-full accent-violet-600 cursor-pointer"
                  />
                </div>
                <Toggle
                  label="🗣 Đọc thông báo bằng giọng nói (TTS)"
                  checked={readTitleAloud}
                  onChange={() => {
                    const next = !readTitleAloud;
                    setReadTitleAloud(next);
                    setReadTitleAloudEnabled(next);
                  }}
                />
                <div className="px-3 py-2 rounded-lg border border-gray-100 space-y-3">
                  <p className="text-xs font-medium text-gray-800">Chuông tùy chỉnh (MP3, WAV, OGG…)</p>
                  <p className="text-[10px] text-gray-500">
                    File có thể dài bất kỳ; mỗi thông báo chỉ phát <strong>tối đa 15 giây</strong> — chọn đoạn bên dưới.
                  </p>
                  <input
                    type="file"
                    accept="audio/mpeg,audio/mp3,.mp3,audio/*,.wav,.ogg,.m4a,.webm"
                    onChange={handleCustomSoundFile}
                    className="block w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 cursor-pointer"
                  />
                  {customSoundHint ? <p className="text-[10px] text-emerald-700 leading-snug">{customSoundHint}</p> : null}
                  {hasCustomBell && fileDurationSec > 0 ? (
                    (() => {
                      const maxStart = Math.max(0, fileDurationSec - 0.05);
                      const startClamped = Math.min(trimStartSec, maxStart);
                      const maxPlay = Math.max(0.05, Math.min(15, fileDurationSec - startClamped));
                      const playClamped = Math.min(trimPlaySec, maxPlay);
                      return (
                        <div className="space-y-3 rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                          <p className="text-[11px] font-semibold text-slate-800">Đoạn phát trong file</p>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] text-slate-600">
                              <span>Bắt đầu (giây)</span>
                              <span className="font-mono">{startClamped.toFixed(1)}s / {fileDurationSec.toFixed(1)}s</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={maxStart || 0}
                              step={0.1}
                              value={startClamped}
                              onChange={(ev) => handleTrimStart(Number(ev.target.value))}
                              className="w-full accent-indigo-600 cursor-pointer"
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] text-slate-600">
                              <span>Độ dài phát (tối đa 15s)</span>
                              <span className="font-mono">{playClamped.toFixed(1)}s</span>
                            </div>
                            <input
                              type="range"
                              min={0.05}
                              max={maxPlay}
                              step={0.05}
                              value={playClamped}
                              onChange={(ev) => handleTrimPlay(Number(ev.target.value))}
                              className="w-full accent-indigo-600 cursor-pointer"
                            />
                          </div>
                          <p className="text-[10px] text-slate-500">
                            Kết thúc đoạn ≈ {Math.min(fileDurationSec, startClamped + playClamped).toFixed(1)}s trong file.
                          </p>
                        </div>
                      );
                    })()
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void playLoudNotificationSound()}
                      className="h-8 px-3 rounded-lg bg-slate-100 text-slate-800 text-xs font-medium hover:bg-slate-200 cursor-pointer"
                    >
                      Nghe thử chuông
                    </button>
                    <button
                      type="button"
                      onClick={() => void clearCustomSound()}
                      className="h-8 px-3 rounded-lg border border-gray-200 text-gray-700 text-xs hover:bg-gray-50 cursor-pointer"
                    >
                      Xóa chuông tùy chỉnh
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 px-1">
                  Chuông mặc định phát tối đa 15 giây từ đầu file. Tắt đọc: gạt «Đọc thông báo bằng giọng nói» hoặc âm lượng giọng về 0%.
                </p>
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
