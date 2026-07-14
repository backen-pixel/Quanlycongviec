import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, ChevronDown, ChevronRight, Phone, X } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import {
  setNotificationPrefsCache,
  setNotificationVolumePercent,
  setUseCustomNotificationSound,
  setNotificationCustomSoundTrim,
  setNotificationCustomSoundFileDurationSec,
  clearNotificationCustomSoundMeta,
  setNotificationPresetId,
  getNotificationPresetId,
} from '../lib/notificationPrefsCache';
import {
  saveCustomNotificationSoundBuffer,
  clearCustomNotificationSoundBuffer,
  getCustomNotificationSoundBuffer,
} from '../lib/notificationSoundIdb';
import { playLoudNotificationSound, invalidateNotificationSoundCache, playPresetBell } from '../lib/notificationAlert';
import { NOTIFICATION_PRESETS } from '../lib/notificationPresets';
import {
  saveCustomCallRingtone,
  clearCustomCallRingtone,
} from '../lib/callRingtoneIdb';
import {
  getCallRingtoneVolumePercent,
  setCallRingtoneVolumePercent,
  setUseCustomCallRingtone,
  getUseCustomCallRingtone,
  getCallRingtoneFileName,
  setCallRingtoneFileName,
  clearCallRingtonePrefs,
} from '../lib/callRingtonePrefs';
import {
  invalidateCallRingtoneCache,
  previewCallRingtone,
  previewGlobalCallRingtone,
} from '../lib/callRingtonePlayer';
import {
  fetchGlobalCallRingtoneConfig,
  invalidateGlobalCallRingtoneCache,
} from '../lib/callRingtoneServer';
import CommentDisplayUsersSetup from './CommentDisplayUsersSetup';

const PREFS_FALLBACK = {
  browser_push: true,
  sound: true,
  task_assigned: true,
  task_completed: true,
  deadline_warning: true,
  comment_added: true,
  comment_show_on_screen: true,
  stage_changed: true,
  deal_won: true,
  approval_request: true,
  checklist_completed: true,
  lead_assigned: true,
  order_confirmed: true,
  invoice_overdue: true,
  lead_new: true,
  deal_new: true,
  production_deadlines: true,
  crm_lead_deadlines: true,
  logistics_deadlines: true,
  project_notifications: false,
};

/** Mỗi dòng: label + mô tả ngắn + ví dụ TB khi BẬT chế độ đó */
const MODULE_SECTIONS = [
  {
    title: 'CRM — Lead',
    rows: [
      {
        key: 'lead_new',
        label: 'Lead mới',
        sub: 'Thông báo khi có lead mới trong hệ thống hoặc tự động từ kênh (Facebook, form…).',
        examples: ['Có lead mới được tạo', 'Lead tự động từ tin nhắn / quét Facebook'],
      },
      {
        key: 'lead_assigned',
        label: 'Được giao / chuyển lead',
        sub: 'Khi bạn được chỉ định phụ trách lead hoặc lead được chuyển cho bạn.',
        examples: ['Bạn được giao làm chủ lead / phụ trách', 'Lead chuyển từ sale khác sang bạn'],
      },
      {
        key: 'crm_lead_deadlines',
        label: 'Nhắc hạn nhiệm vụ CRM (lead & deal, không gồm cột SX)',
        sub: 'Nhiệm vụ tab Công việc trên lead/deal: tư vấn, báo giá, hợp đồng… (trừ nhóm sx_* — nhóm đó dùng mục «Xưởng» bên dưới).',
        examples: [
          'Ngày mai đến hạn nhiệm vụ',
          'Còn 1 giờ đến hạn',
          'Đã quá hạn nhiệm vụ',
          'Ai đó đặt / đổi deadline trên nhiệm vụ (TB trong luồng thao tác)',
          'Tóm tắt nhắc hạn CRM do AI (2 lần/ngày, nếu bật OPENAI_API_KEY trên server)',
        ],
      },
    ],
  },
  {
    title: 'CRM — Deal',
    rows: [
      {
        key: 'deal_new',
        label: 'Deal mới & giao deal',
        sub: 'Deal vừa tạo hoặc deal được giao cho bạn.',
        examples: ['Deal mới sau khi chốt từ lead', 'Bạn được giao deal / đổi người phụ trách deal'],
      },
      {
        key: 'deal_won',
        label: 'Deal thắng',
        sub: 'Khi deal chuyển sang trạng thái thắng / chốt.',
        examples: ['Deal thắng (có thể kèm TB nội bộ cho admin / pipeline)'],
      },
      {
        key: 'stage_changed',
        label: 'Đổi giai đoạn pipeline',
        sub: 'Lead hoặc deal được kéo sang cột khác trên Kanban CRM.',
        examples: ['Deal chuyển từ «Báo giá» sang «Hợp đồng»', 'Lead đổi giai đoạn tư vấn'],
      },
    ],
  },
  {
    title: 'Dự án & sản xuất',
    rows: [
      {
        key: 'project_notifications',
        label: 'Thông báo dự án (pipeline DA)',
        sub: 'Tắt = không nhận TB tạo DA, đổi giai đoạn, cập nhật trạng thái, NV/bình luận trên dự án, duyệt chuyển giai đoạn, nhắc hạn task giai đoạn tư vấn/thiết kế (trước SX), sự cố dự án…',
        examples: ['Dự án mới & phân công vai trò', 'Chuyển giai đoạn workflow', 'Bình luận / NV trên DA'],
      },
      {
        key: 'task_assigned',
        label: 'Nhiệm vụ được giao (dự án)',
        sub: 'Task trên dự án / xưởng khi có người được giao.',
        examples: ['Bạn được giao một task trên dự án', 'Đổi người thực hiện task'],
      },
      {
        key: 'task_completed',
        label: 'Nhiệm vụ hoàn thành / cập nhật',
        sub: 'Khi task đổi trạng thái hoàn thành hoặc cập nhật đáng chú ý (theo cấu hình hệ thống).',
        examples: ['Task được đánh dấu hoàn thành', 'Cập nhật tiến độ liên quan đến bạn'],
      },
      {
        key: 'production_deadlines',
        label: 'Nhắc / quá hạn — Xưởng & nhiệm vụ SX trên deal',
        sub: 'Gồm: task dự án khi dự án đang ở giai đoạn sản xuất, và nhiệm vụ CRM cột sx_* (Sản xuất) trên deal — chỉ gửi người liên quan thuộc đúng module xưởng.',
        examples: ['Sắp hết hạn / quá hạn task xưởng', 'Nhắc hạn nhiệm vụ pipeline SX trên tab Công việc deal'],
      },
      {
        key: 'logistics_deadlines',
        label: 'Nhắc / quá hạn — Vận chuyển',
        sub: 'Task dự án khi dự án ở giai đoạn giao hàng, lắp đặt, bảo hành — chỉ người được giao task.',
        examples: ['Sắp đến hạn giao / lắp', 'Task VC quá hạn'],
      },
      {
        key: 'deadline_warning',
        label: 'Nhắc / quá hạn — Giai đoạn dự án trước SX',
        sub: 'Task dự án khi dự án chưa vào chế độ «đang sản xuất» (tư vấn kỹ thuật, khảo sát…).',
        examples: ['Hạn task trong giai đoạn chuẩn bị / thiết kế dự án'],
      },
      {
        key: 'checklist_completed',
        label: 'Checklist hoàn thành',
        sub: 'Khi mục checklist trên task / quy trình được tick xong.',
        examples: ['Một hạng mục checklist hoàn thành (có thông báo cho người liên quan)'],
      },
      {
        key: '_comments_setup',
        collapsible: true,
        label: 'Setup thông báo bình luận',
        sub: 'Bấm để mở: bật/tắt chuông khi có bình luận mới. Ai được hiện thread trên màn hình cấu hình ở mục đầu trang.',
        children: [
          {
            key: 'comment_added',
            label: 'Nhận thông báo bình luận',
            sub: 'Chuông / toast / push khi có bình luận mới trên task, dự án hoặc luồng bạn tham gia.',
            examples: ['Ai đó nhắc bạn trong comment', 'Bình luận mới trên công việc bạn theo dõi'],
          },
        ],
      },
    ],
  },
  {
    title: 'Bán hàng & kế toán',
    rows: [
      {
        key: 'order_confirmed',
        label: 'Đơn hàng (tạo / cập nhật)',
        sub: 'Sự kiện đơn hàng: tạo mới, xác nhận, thay đổi trạng thái quan trọng.',
        examples: ['Đơn hàng mới', 'Đơn được xác nhận / cập nhật'],
      },
      {
        key: 'invoice_overdue',
        label: 'Hóa đơn quá hạn thanh toán',
        sub: 'Nhắc khi hóa đơn đã quá hạn thanh toán theo ngày đến hạn (thường gửi người tạo / phụ trách).',
        examples: ['Hóa đơn quá hạn N ngày', 'Còn nợ chưa thanh toán đủ'],
      },
    ],
  },
  {
    title: 'Khác',
    rows: [
      {
        key: 'approval_request',
        label: 'Phê duyệt tạm ứng / yêu cầu duyệt',
        sub: 'Luồng duyệt chi phí, tạm ứng, bước cần chữ ký.',
        examples: ['Có yêu cầu phê duyệt cần bạn xử lý', 'Kết quả duyệt / từ chối'],
      },
    ],
  },
];

/**
 * NotificationSettings — âm lượng, chuông tùy chỉnh, web push
 */
export default function NotificationSettings({ isOpen, onClose, anchorPanel = null }) {
  const { user } = useAuth();
  const canManageGlobalCallRing = isAdminLike(user);
  const [modulePrefs, setModulePrefs] = useState(() => ({ ...PREFS_FALLBACK }));
  const [savingPrefKey, setSavingPrefKey] = useState(null);
  /** Nhóm collapsible trong Cài đặt TB — mặc định thu gọn, bấm mới hiện chi tiết. */
  const [expandedPrefGroups, setExpandedPrefGroups] = useState(() => ({}));
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushHint, setPushHint] = useState('');
  const [soundVolume, setSoundVolume] = useState(100);
  const [customSoundHint, setCustomSoundHint] = useState('');
  const [fileDurationSec, setFileDurationSec] = useState(0);
  const [trimStartSec, setTrimStartSec] = useState(0);
  const [trimPlaySec, setTrimPlaySec] = useState(15);
  const [hasCustomBell, setHasCustomBell] = useState(false);
  const [presetId, setPresetId] = useState(() => {
    try { return getNotificationPresetId() || 'classic'; } catch { return 'classic'; }
  });
  const [callRingVolume, setCallRingVolume] = useState(85);
  const [hasCallRing, setHasCallRing] = useState(false);
  const [callRingHint, setCallRingHint] = useState('');
  const [globalCallRing, setGlobalCallRing] = useState(null);
  const [globalCallRingUploading, setGlobalCallRingUploading] = useState(false);

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
    if (!isOpen) return;

    checkPushSupport();
    (async () => {
      try {
        const { data } = await api.get('/push/preferences');
        if (data) {
          const merged = { ...PREFS_FALLBACK, ...data, sound: true };
          setNotificationPrefsCache(merged);
          setModulePrefs(merged);
        } else {
          setNotificationPrefsCache({ ...PREFS_FALLBACK, sound: true });
          setModulePrefs({ ...PREFS_FALLBACK });
        }
      } catch {
        setNotificationPrefsCache({ ...PREFS_FALLBACK, sound: true });
        setModulePrefs({ ...PREFS_FALLBACK });
      }
    })();

    try {
      const v = parseInt(localStorage.getItem('notification_volume_percent') || '100', 10);
      setSoundVolume(Number.isFinite(v) ? Math.min(150, Math.max(0, v)) : 100);
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
      /* ignore */
    }
    try {
      setCallRingVolume(getCallRingtoneVolumePercent());
      const useCall = getUseCustomCallRingtone();
      setHasCallRing(useCall);
      const name = getCallRingtoneFileName();
      if (useCall && name) {
        setCallRingHint(`Ghi đè cá nhân: ${name}`);
      } else if (useCall) {
        setCallRingHint('Đang ghi đè bằng file trên máy bạn (chỉ trình duyệt này).');
      } else {
        setCallRingHint('');
      }
    } catch {
      /* ignore */
    }
    void fetchGlobalCallRingtoneConfig(true).then((g) => setGlobalCallRing(g));
    setPushHint('');
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

  const toggleModulePref = async (key, next) => {
    setSavingPrefKey(key);
    try {
      const { data } = await api.put('/push/preferences', { [key]: next });
      const merged = { ...modulePrefs, ...data };
      setModulePrefs(merged);
      setNotificationPrefsCache(merged);
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không lưu được cài đặt');
    } finally {
      setSavingPrefKey(null);
    }
  };

  const handleTogglePush = async () => {
    if (!pushSupported) {
      alert('Web push không được hỗ trợ trên thiết bị này');
      return;
    }

    if (pushSubscribed) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await api.post('/push/unsubscribe', { endpoint: subscription.endpoint });
          await subscription.unsubscribe();
          setPushSubscribed(false);
        }
      } catch (e) {
        console.error('Unsubscribe error:', e);
      }
    } else {
      try {
        await navigator.serviceWorker.register('/sw.js');
        const { data: vapidData } = await api.get('/push/vapid-key');
        if (!vapidData?.vapidPublicKey) {
          alert('Web push chưa được cấu hình trên server');
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          alert('Bạn đã từ chối quyền thông báo');
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidData.vapidPublicKey),
        });

        await api.post('/push/subscribe', { subscription: subscription.toJSON() });
        setPushSubscribed(true);
        setPushHint('✓ Đã bật thông báo browser');
        setTimeout(() => setPushHint(''), 3000);
      } catch (e) {
        alert('Lỗi bật thông báo: ' + e.message);
      }
    }
  };

  const applySoundVolume = (n) => {
    const x = Math.min(150, Math.max(0, Math.round(n)));
    setSoundVolume(x);
    setNotificationVolumePercent(x);
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

  const applyCallRingVolume = (n) => {
    const v = Math.min(150, Math.max(0, Math.round(Number(n) || 0)));
    setCallRingVolume(v);
    setCallRingtoneVolumePercent(v);
  };

  const handleCallRingFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('File quá lớn (tối đa 8 MB). Hãy chọn file ngắn hơn hoặc nén MP3.');
      return;
    }
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
      const mime = file.type || 'audio/mpeg';
      await saveCustomCallRingtone({ buffer: raw.slice(0), mime, fileName: file.name });
      setUseCustomCallRingtone(true);
      setHasCallRing(true);
      setCallRingtoneFileName(file.name);
      invalidateCallRingtoneCache();
      setCallRingHint(
        `Đã lưu ${file.name} — ${audioBuf.duration.toFixed(1)}s. Dùng cho cuộc gọi đến và khi bạn gọi đi (lặp đến khi trả lời / huỷ).`,
      );
    } catch (err) {
      alert('Không đọc được file âm thanh (thử MP3/WAV). ' + (err?.message || String(err)));
    } finally {
      await ctx.close().catch(() => {});
    }
  };

  const clearCallRing = async () => {
    await clearCustomCallRingtone();
    clearCallRingtonePrefs();
    invalidateCallRingtoneCache();
    setHasCallRing(false);
    setCallRingHint('');
  };

  const handleGlobalCallRingFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('File quá lớn (tối đa 8 MB).');
      return;
    }
    setGlobalCallRingUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/settings/call-ringtone', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      invalidateGlobalCallRingtoneCache();
      const refreshed = await fetchGlobalCallRingtoneConfig(true);
      setGlobalCallRing(refreshed || (data?.url ? data : null));
      alert(`Đã đặt nhạc chuông mặc định cho toàn bộ người dùng: ${data.fileName || file.name}`);
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || 'Upload thất bại');
    } finally {
      setGlobalCallRingUploading(false);
    }
  };

  const clearGlobalCallRing = async () => {
    if (!window.confirm('Xóa nhạc chuông mặc định toàn hệ thống? Mọi user sẽ nghe tiếng bíp.')) return;
    try {
      await api.delete('/settings/call-ringtone');
      invalidateGlobalCallRingtoneCache();
      setGlobalCallRing(null);
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || 'Không xóa được');
    }
  };

  const makeCallTonePreview = () => (variant) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      const actx = new AudioCtx();
      const gain = actx.createGain();
      gain.gain.value = 0.05;
      gain.connect(actx.destination);
      let stopped = false;
      const loop = () => {
        if (stopped) return;
        const osc = actx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = variant === 'ringtone' ? 520 : 440;
        osc.connect(gain);
        osc.start();
        osc.stop(actx.currentTime + 0.4);
        setTimeout(loop, 1100);
      };
      loop();
      return {
        pause: () => {
          stopped = true;
          try { actx.close(); } catch { /* noop */ }
        },
      };
    } catch {
      return null;
    }
  };

  const previewCallRing = () => {
    void previewCallRingtone(makeCallTonePreview());
  };

  const PANEL_WIDTH = 460;

  const panelGeometry = useMemo(() => {
    if (!isOpen) return null;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const maxH = Math.min(620, vh - 24);

    if (anchorPanel) {
      let left = anchorPanel.left + anchorPanel.width + 12;
      if (left + PANEL_WIDTH > vw - 12) {
        left = anchorPanel.left - PANEL_WIDTH - 12;
        if (left < 12) left = Math.max(12, vw - PANEL_WIDTH - 12);
      }
      let top = anchorPanel.top;
      if (top + maxH > vh - 12) top = Math.max(12, vh - maxH - 12);
      return { top, left, width: PANEL_WIDTH, maxHeight: maxH };
    }

    return {
      top: Math.max(12, (vh - maxH) / 2),
      left: Math.max(12, (vw - PANEL_WIDTH) / 2),
      width: PANEL_WIDTH,
      maxHeight: maxH,
    };
  }, [isOpen, anchorPanel]);

  if (!isOpen) return null;

  return createPortal(
    <>
      <div
        data-notification-settings-backdrop
        className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-[1px] animate-fade-in"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onClose}
        aria-hidden
      />
      <div
        data-notification-settings-panel
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-[9999] bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.45)] border border-gray-200 overflow-hidden flex flex-col animate-fade-in"
        style={{
          top: panelGeometry.top,
          left: panelGeometry.left,
          width: panelGeometry.width,
          maxHeight: panelGeometry.maxHeight,
        }}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 px-4 py-3 shrink-0">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="absolute -top-6 -right-8 w-32 h-32 bg-blue-400 rounded-full blur-3xl" />
            <div className="absolute -bottom-8 -left-6 w-28 h-28 bg-purple-400 rounded-full blur-3xl" />
          </div>
          <div className="relative flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-md shrink-0">
                <Bell className="h-4 w-4" style={{ color: '#ffffff' }} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold leading-tight" style={{ color: '#ffffff' }}>Cài đặt thông báo</h3>
                <p className="text-[11px] mt-0.5" style={{ color: 'rgba(219,234,254,0.9)' }}>
                  Âm thanh · Push · Loại thông báo
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
              style={{ color: 'rgba(255,255,255,0.85)' }}
              title="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <CommentDisplayUsersSetup
            enabledSelfPref={modulePrefs.comment_show_on_screen !== false}
            onSelfPrefSynced={(on) => {
              setModulePrefs((prev) => {
                const merged = { ...prev, comment_show_on_screen: !!on };
                setNotificationPrefsCache(merged);
                return merged;
              });
            }}
          />

          {pushSupported && (
            <div className="border rounded-xl p-4 bg-blue-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">📱 Thông báo Browser</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {pushSubscribed ? 'Đang nhận thông báo desktop' : 'Bật để nhận thông báo desktop'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTogglePush}
                  className={`h-8 px-4 rounded-full text-xs font-bold cursor-pointer transition-all ${
                    pushSubscribed ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  {pushSubscribed ? '✓ Đang bật' : 'Bật'}
                </button>
              </div>
              {pushHint ? (
                <p className="text-xs font-medium text-emerald-600 mt-2 text-center">{pushHint}</p>
              ) : null}
            </div>
          )}

          <div className="space-y-3 border rounded-xl p-3 bg-slate-50/80 border-slate-100">
            <h3 className="font-semibold text-xs text-slate-600 uppercase tracking-wide">Loại thông báo (theo module)</h3>
            <p className="text-[10px] text-slate-600 leading-relaxed">
              Bật / tắt từng nhóm để điều khiển cả <strong>thông báo trong app</strong> và <strong>Web Push</strong> (nếu đã đăng ký).
              Khi <strong>Tắt</strong>, bạn sẽ không nhận các ví dụ liệt kê bên dưới mục đó.
            </p>
            {MODULE_SECTIONS.map((sec) => (
              <div key={sec.title} className="space-y-2 pt-1 border-t border-slate-200/80 first:border-t-0 first:pt-0">
                <p className="text-[11px] font-bold text-slate-700">{sec.title}</p>
                <div className="space-y-2">
                  {sec.rows.map((row) => {
                    if (row.collapsible && Array.isArray(row.children)) {
                      const open = !!expandedPrefGroups[row.key];
                      const childOns = row.children.map((c) => modulePrefs[c.key] !== false);
                      const allOn = childOns.every(Boolean);
                      const someOn = childOns.some(Boolean);
                      return (
                        <div key={row.key} className="rounded-lg bg-white border border-slate-100 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpandedPrefGroups((prev) => ({ ...prev, [row.key]: !prev[row.key] }))}
                            className="w-full flex items-start gap-2 px-2 py-2.5 text-left cursor-pointer hover:bg-slate-50/80 transition"
                            aria-expanded={open}
                          >
                            <span className="mt-0.5 shrink-0 text-slate-500">
                              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-slate-800 font-medium">{row.label}</p>
                              {row.sub ? <p className="text-[10px] text-slate-600 mt-1 leading-snug">{row.sub}</p> : null}
                            </div>
                            <span
                              className={`shrink-0 mt-0.5 text-[10px] font-bold px-2 py-1 rounded-full ${
                                allOn
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : someOn
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {allOn ? 'Đang bật' : someOn ? 'Một phần' : 'Đang tắt'}
                            </span>
                          </button>
                          {open ? (
                            <div className="border-t border-slate-100 px-2 pb-2 pt-1.5 space-y-2 bg-slate-50/50">
                              {row.children.map((child) => {
                                const on = modulePrefs[child.key] !== false;
                                return (
                                  <div key={child.key} className="flex items-start justify-between gap-2 rounded-lg bg-white px-2 py-2 border border-slate-100">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm text-slate-800 font-medium">{child.label}</p>
                                      {child.sub ? <p className="text-[10px] text-slate-600 mt-1 leading-snug">{child.sub}</p> : null}
                                      {child.examples?.length ? (
                                        <div className="mt-1.5 pl-0.5">
                                          <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide">Ví dụ khi bật</p>
                                          <ul className="mt-0.5 space-y-0.5 list-disc list-inside text-[10px] text-slate-500 leading-snug">
                                            {child.examples.map((ex) => (
                                              <li key={ex}>{ex}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      ) : null}
                                    </div>
                                    <button
                                      type="button"
                                      disabled={savingPrefKey !== null}
                                      onClick={() => void toggleModulePref(child.key, !on)}
                                      className={`shrink-0 h-8 px-3 rounded-full text-xs font-bold transition ${
                                        on ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                                      } ${savingPrefKey ? 'opacity-60' : 'hover:opacity-90'}`}
                                      title={on ? 'Nhấn để tắt' : 'Nhấn để bật'}
                                    >
                                      {savingPrefKey === child.key ? '…' : on ? 'Đang bật' : 'Đang tắt'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    }

                    const on = modulePrefs[row.key] !== false;
                    return (
                      <div key={row.key} className="flex items-start justify-between gap-2 rounded-lg bg-white px-2 py-2.5 border border-slate-100">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-800 font-medium">{row.label}</p>
                          {row.sub ? <p className="text-[10px] text-slate-600 mt-1 leading-snug">{row.sub}</p> : null}
                          {row.examples?.length ? (
                            <div className="mt-1.5 pl-0.5">
                              <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide">Ví dụ khi bật</p>
                              <ul className="mt-0.5 space-y-0.5 list-disc list-inside text-[10px] text-slate-500 leading-snug">
                                {row.examples.map((ex) => (
                                  <li key={ex}>{ex}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          disabled={savingPrefKey !== null}
                          onClick={() => void toggleModulePref(row.key, !on)}
                          className={`shrink-0 h-8 px-3 rounded-full text-xs font-bold transition ${
                            on ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                          } ${savingPrefKey ? 'opacity-60' : 'hover:opacity-90'}`}
                          title={on ? 'Nhấn để tắt nhóm thông báo này' : 'Nhấn để bật nhóm thông báo này'}
                        >
                          {savingPrefKey === row.key ? '…' : on ? 'Đang bật' : 'Đang tắt'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wide">Chuông trong app</h3>
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
              <p className="text-[10px] text-gray-500">0% = tắt chuông.</p>
            </div>
            <div className="px-3 py-2 rounded-lg border border-gray-100 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-gray-800">Chuông mặc định</p>
                {hasCustomBell ? (
                  <span className="text-[10px] text-amber-600 font-medium">Đang dùng chuông tùy chỉnh — tắt bên dưới để dùng preset</span>
                ) : null}
              </div>
              <p className="text-[10px] text-gray-500">
                Chọn một bộ chuông cài sẵn. Bấm 🔊 để nghe thử.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {NOTIFICATION_PRESETS.map((pset) => {
                  const active = presetId === pset.id && !hasCustomBell;
                  return (
                    <div
                      key={pset.id}
                      className={`relative rounded-lg border p-2 transition-all ${
                        active
                          ? 'border-blue-400 bg-blue-50 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/40'
                      } ${hasCustomBell ? 'opacity-60' : ''}`}
                    >
                      <button
                        type="button"
                        disabled={hasCustomBell}
                        onClick={() => {
                          setPresetId(pset.id);
                          setNotificationPresetId(pset.id);
                        }}
                        className="block text-left w-full pr-7 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <p className={`text-xs font-bold ${active ? 'text-blue-700' : 'text-gray-800'}`}>
                          {pset.label}
                        </p>
                        <p className="text-[10px] text-gray-500 leading-snug mt-0.5">{pset.description}</p>
                      </button>
                      <button
                        type="button"
                        title="Nghe thử"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          const volPct = soundVolume;
                          const vol = Math.min(1.5, Math.max(0.05, volPct / 100));
                          playPresetBell(pset.id, vol);
                        }}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-white border border-gray-200 hover:bg-blue-100 hover:border-blue-300 flex items-center justify-center text-xs cursor-pointer"
                      >
                        🔊
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
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
                          <span className="font-mono">
                            {startClamped.toFixed(1)}s / {fileDurationSec.toFixed(1)}s
                          </span>
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
                  onClick={() => void playLoudNotificationSound({ skipThrottle: true })}
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
              Thông báo trong app chỉ kèm chuông, không đọc giọng. Chuông mặc định phát tối đa 15 giây từ đầu file (hoặc đoạn bạn chọn nếu dùng file tùy chỉnh).
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              Nhạc chuông cuộc gọi
            </h3>
            <p className="text-[10px] text-gray-500 px-1">
              Cuộc gọi audio/video Messenger. Ưu tiên: <strong>file cá nhân</strong> (nếu bật bên dưới) → <strong>nhạc mặc định hệ thống</strong> (admin upload) → tiếng bíp.
            </p>
            {canManageGlobalCallRing ? (
              <div className="px-3 py-2 rounded-lg border border-amber-200 bg-amber-50/80 space-y-2">
                <p className="text-xs font-semibold text-amber-900">Nhạc chuông mặc định — toàn hệ thống (admin)</p>
                <p className="text-[10px] text-amber-800/90">
                  Upload trên <strong>host production</strong> (tubep-backend): file lưu Supabase Storage, không mất khi redeploy.
                  Upload localhost chỉ có hiệu lực trên máy dev.
                </p>
                {globalCallRing?.fileName ? (
                  <p className="text-[10px] text-emerald-800">
                    Đang dùng: <strong>{globalCallRing.fileName}</strong>
                    {globalCallRing.source === 'supabase' ? ' · Supabase Storage' : ''}
                    {globalCallRing.updatedAt ? ` · ${new Date(globalCallRing.updatedAt).toLocaleString('vi-VN')}` : ''}
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-600">
                    Chưa có file trên server — dùng <code className="text-[9px]">/call-ringtone.wav</code> trong bản build (nếu có).
                  </p>
                )}
                <input
                  type="file"
                  accept="audio/mpeg,audio/mp3,.mp3,audio/*,.wav,.ogg,.m4a,.webm"
                  disabled={globalCallRingUploading}
                  onChange={handleGlobalCallRingFile}
                  className="block w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-amber-100 file:text-amber-900 cursor-pointer disabled:opacity-50"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!globalCallRing?.url}
                    onClick={() => {
                      void fetchGlobalCallRingtoneConfig(true).then(() => previewGlobalCallRing(makeCallTonePreview()));
                    }}
                    className="h-8 px-3 rounded-lg bg-amber-100 text-amber-900 text-xs font-medium hover:bg-amber-200 cursor-pointer disabled:opacity-50"
                  >
                    Nghe thử (mặc định HT)
                  </button>
                  <button
                    type="button"
                    disabled={!globalCallRing?.url || globalCallRingUploading}
                    onClick={() => void clearGlobalCallRing()}
                    className="h-8 px-3 rounded-lg border border-amber-300 text-amber-900 text-xs hover:bg-amber-100 cursor-pointer disabled:opacity-50"
                  >
                    Xóa mặc định HT
                  </button>
                </div>
              </div>
            ) : globalCallRing?.fileName ? (
              <p className="text-[10px] text-emerald-700 px-1">
                Hệ thống: <strong>{globalCallRing.fileName}</strong> (do admin cấu hình).
              </p>
            ) : null}
            <div className="px-3 py-2 rounded-lg bg-gray-50 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm text-gray-700">Âm lượng cuộc gọi</label>
                <span className="text-xs font-mono text-gray-500">{callRingVolume}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={150}
                value={callRingVolume}
                onChange={(ev) => applyCallRingVolume(Number(ev.target.value))}
                className="w-full accent-violet-600 cursor-pointer"
              />
            </div>
            <div className="px-3 py-2 rounded-lg border border-violet-100 space-y-3 bg-violet-50/30">
              <p className="text-xs font-medium text-gray-800">Ghi đè cá nhân (chỉ trình duyệt này)</p>
              <input
                type="file"
                accept="audio/mpeg,audio/mp3,.mp3,audio/*,.wav,.ogg,.m4a,.webm"
                onChange={handleCallRingFile}
                className="block w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-violet-100 file:text-violet-800 cursor-pointer"
              />
              {callRingHint ? (
                <p className="text-[10px] text-emerald-700 leading-snug">{callRingHint}</p>
              ) : (
                <p className="text-[10px] text-gray-500">Chưa chọn file — dùng tiếng bíp mặc định của hệ thống.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={previewCallRing}
                  className="h-8 px-3 rounded-lg bg-violet-100 text-violet-900 text-xs font-medium hover:bg-violet-200 cursor-pointer"
                >
                  Nghe thử
                </button>
                <button
                  type="button"
                  disabled={!hasCallRing}
                  onClick={() => void clearCallRing()}
                  className="h-8 px-3 rounded-lg border border-gray-200 text-gray-700 text-xs hover:bg-gray-50 cursor-pointer disabled:opacity-50"
                >
                  Xóa / dùng bíp mặc định
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 p-3 shrink-0 bg-gradient-to-b from-white to-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 font-medium text-sm cursor-pointer transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </>,
    document.body,
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
