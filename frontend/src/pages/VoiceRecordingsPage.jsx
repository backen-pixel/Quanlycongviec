import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isCrmCompanyAdmin } from '../lib/crmAdminScope';
import { isAdminLike, normalizeRole, hasCompanyId } from '../lib/adminRole';
import { resolveDefaultCrmAdminCompanyId } from '../lib/crmCompanyFilter';
import { Mic, Upload, Trash2, RefreshCw, Square, Circle, UserRound, Link2, UserPlus, Inbox, ScanLine, Calendar as CalendarIcon } from 'lucide-react';
import { formatDateTime } from '../lib/utils';
import VoiceCalendarPanel from '../components/VoiceCalendarPanel';

function toLocalISODate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isVoiceRecordingsAdmin(role) {
  const x = String(role ?? '').toLowerCase().trim();
  return ['admin', 'superadmin', 'super_admin', 'administrator'].includes(x);
}

function isVoiceRegionAdmin(user) {
  return normalizeRole(user?.role) === 'region_admin' && hasCompanyId(user);
}

function isVoiceSalesAdmin(user) {
  const r = normalizeRole(user?.role);
  return (r === 'sales_admin' || r === 'crm_production_admin') && hasCompanyId(user);
}

/** Xem ghi âm toàn công ty + lọc theo NV (admin hệ thống, admin công ty, sales_admin, region_admin). */
function canViewCompanyVoiceList(user) {
  return (
    isVoiceRecordingsAdmin(user?.role)
    || isCrmCompanyAdmin(user)
    || isVoiceRegionAdmin(user)
    || isVoiceSalesAdmin(user)
  );
}

function recordingAudioUrl(rec) {
  if (rec?.audio_url) return rec.audio_url;
  const storage_path = rec?.storage_path || rec;
  if (typeof storage_path !== 'string') return '';
  const path = storage_path.startsWith('/') ? storage_path : `/${storage_path}`;
  const base = import.meta.env.VITE_API_URL;
  if (base) return `${String(base).replace(/\/$/, '')}${path}`;
  return path;
}

function dirLabel(d) {
  if (d === 'inbound') return 'Gọi đến';
  if (d === 'outbound') return 'Gọi đi';
  if (d === 'unknown') return 'Không rõ';
  return d || '';
}

function leadTypeLabel(type) {
  if (type === 'deal') return 'Deal';
  if (type === 'lead') return 'Lead';
  return type || 'CRM';
}

function recordingCustomerId(r) {
  return r?.customer_id || r?.customer?.id || '';
}

function recordingLeadId(r) {
  return r?.lead_id || r?.lead?.id || '';
}

function recordingHasCustomer(r) {
  return !!recordingCustomerId(r);
}

function recordingHasLead(r) {
  return !!recordingLeadId(r);
}

export default function VoiceRecordingsPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  /** Admin công ty / sales_admin — backend khóa theo company_id (giống CRM). */
  const isCompanyScopedAdmin = isCrmCompanyAdmin(user);
  const companyViewer = canViewCompanyVoiceList(user);
  const [filterUserId, setFilterUserId] = useState('');
  /** Công ty NV — admin hệ thống chọn; admin công ty / NV tự khóa theo company_id. */
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const [userCompanyId, setUserCompanyId] = useState('');
  /** Công ty Lead/Deal — lọc thêm (admin hệ thống). */
  const [filterLeadCompanyId, setFilterLeadCompanyId] = useState('');
  const [staffUsers, setStaffUsers] = useState([]);
  const [filterCompanies, setFilterCompanies] = useState([]);

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [direction, setDirection] = useState('');
  const [callStartedAt, setCallStartedAt] = useState('');
  const [callEndedAt, setCallEndedAt] = useState('');
  const [externalCallId, setExternalCallId] = useState('');
  const fileRef = useRef(null);

  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const [listPhoneFilter, setListPhoneFilter] = useState('');
  const [calendarDate, setCalendarDate] = useState('');
  const [attachRecording, setAttachRecording] = useState(null);
  const [custQuery, setCustQuery] = useState('');
  const [custRows, setCustRows] = useState([]);
  const [pickCustomerId, setPickCustomerId] = useState('');
  const [leadRows, setLeadRows] = useState([]);
  const [pickLeadId, setPickLeadId] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [leadRowsLoading, setLeadRowsLoading] = useState(false);
  const [attachPreviewLoading, setAttachPreviewLoading] = useState(false);
  const attachSeqRef = useRef(0);

  /** all | unassigned | linked — linked = đã gắn lead/deal */
  const [listTab, setListTab] = useState('all');
  const [relinking, setRelinking] = useState(false);
  const [relinkingRowId, setRelinkingRowId] = useState(null);
  const [scanMetaBusy, setScanMetaBusy] = useState(false);
  const [scanMessage, setScanMessage] = useState('');

  const [bootstrapRecording, setBootstrapRecording] = useState(null);
  const [bootFullName, setBootFullName] = useState('');
  const [bootTitle, setBootTitle] = useState('');
  const [bootType, setBootType] = useState('lead');
  const [bootCompanyId, setBootCompanyId] = useState('');
  const [bootPhone, setBootPhone] = useState('');
  const [bootErr, setBootErr] = useState('');
  const [savingBootstrap, setSavingBootstrap] = useState(false);

  /** Công ty đang áp dụng (mirror CRM dashboardScopeCompanyId). */
  const voiceScopeCompanyId = useMemo(() => {
    if (isCompanyScopedAdmin && user?.company_id) return String(user.company_id);
    if (!isAdmin && user?.company_id) return String(user.company_id);
    if (isAdmin && filterCompanyId) return String(filterCompanyId);
    return '';
  }, [isCompanyScopedAdmin, isAdmin, user?.company_id, filterCompanyId]);

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const params = {};
      if (listPhoneFilter.trim()) params.phone = listPhoneFilter.trim();
      if (listTab === 'unassigned') params.unassigned = '1';
      if (listTab === 'linked') params.linked_only = '1';
      if (companyViewer && filterUserId) params.user_id = filterUserId;
      if (voiceScopeCompanyId) params.company_id = voiceScopeCompanyId;
      if (isAdmin && !isCompanyScopedAdmin && filterLeadCompanyId) {
        params.lead_company_id = filterLeadCompanyId;
      }
      const { data } = await api.get('/voice-recordings', { params });
      setList(data.recordings || []);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Lỗi tải danh sách');
    }
    setLoading(false);
  };

  useEffect(() => {
    void api
      .get('/companies', { params: { for_module: 'crm' } })
      .then(({ data }) => {
        const list = data?.companies || data || [];
        setFilterCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => setFilterCompanies([]));
  }, []);

  /** Tự khóa công ty theo JWT — giống CRM Dashboard. */
  useEffect(() => {
    if (!user?.company_id) return;
    const cid = String(user.company_id);
    setUserCompanyId(cid);
    if (!isAdmin || isCompanyScopedAdmin) {
      setFilterCompanyId(cid);
    }
  }, [user?.company_id, isAdmin, isCompanyScopedAdmin]);

  /** Admin hệ thống: mặc định công ty đầu danh sách (giống CRM). */
  useEffect(() => {
    if (isCompanyScopedAdmin) return;
    if (!isAdmin || !filterCompanies.length) return;
    if (filterCompanyId) return;
    const cid = resolveDefaultCrmAdminCompanyId(filterCompanies);
    if (cid) setFilterCompanyId(String(cid));
  }, [isAdmin, isCompanyScopedAdmin, filterCompanies, filterCompanyId]);

  useEffect(() => {
    if (!companyViewer) return;
    const params = {};
    if (voiceScopeCompanyId) params.company_id = voiceScopeCompanyId;
    void api
      .get('/users', { params })
      .then(({ data }) => setStaffUsers(Array.isArray(data?.users) ? data.users : []))
      .catch(() => setStaffUsers([]));
  }, [companyViewer, voiceScopeCompanyId]);

  useEffect(() => {
    void load();
  }, [listTab, filterUserId, filterCompanyId, filterLeadCompanyId, companyViewer, listPhoneFilter, voiceScopeCompanyId]);

  /** Lọc client-side theo ngày đã chọn trong calendar — không cần gọi lại API */
  const filteredList = useMemo(() => {
    if (!calendarDate) return list;
    return list.filter((r) => toLocalISODate(r.call_started_at || r.created_at) === calendarDate);
  }, [list, calendarDate]);

  useEffect(() => {
    if (!attachRecording) return;
    const q = custQuery.trim();
    if (q.length < 2) {
      setCustRows([]);
      return;
    }
    const t = setTimeout(() => {
      void api
        .get('/crm/customers', { params: { search: q } })
        .then(({ data }) => setCustRows(Array.isArray(data) ? data : []))
        .catch(() => setCustRows([]));
    }, 300);
    return () => clearTimeout(t);
  }, [custQuery, attachRecording]);

  useEffect(() => {
    if (!attachRecording || !pickCustomerId) {
      setLeadRows([]);
      setLeadRowsLoading(false);
      return;
    }
    setLeadRowsLoading(true);
    void api
      .get('/voice-recordings/crm-lead-options', { params: { customer_id: pickCustomerId } })
      .then(({ data }) => setLeadRows(data.leads || []))
      .catch(() => setLeadRows([]))
      .finally(() => setLeadRowsLoading(false));
  }, [pickCustomerId, attachRecording]);

  /** Khi mở modal: nếu chưa có KH join sẵn nhưng có SĐT → tra CRM và điền KH + lead nếu hệ thống tự ghép được */
  useEffect(() => {
    if (!attachRecording) {
      setAttachPreviewLoading(false);
      return;
    }
    if (attachRecording.customer?.id) {
      setAttachPreviewLoading(false);
      return;
    }
    const phone = String(attachRecording.phone_number || '').replace(/\s/g, '').trim();
    if (phone.length < 9) {
      setAttachPreviewLoading(false);
      return;
    }
    const seq = attachSeqRef.current;
    let cancelled = false;
    setAttachPreviewLoading(true);
    void api
      .get('/voice-recordings/phone-preview', { params: { phone } })
      .then(({ data }) => {
        if (cancelled || seq !== attachSeqRef.current) return;
        const m = data?.match;
        if (m?.customer_id) {
          setPickCustomerId(m.customer_id);
          setPickLeadId(m.lead_id || '');
          setCustQuery(m.customer?.full_name || phone);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled && seq === attachSeqRef.current) setAttachPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attachRecording?.id]);

  const openAttach = (row) => {
    attachSeqRef.current += 1;
    setAttachRecording(row);
    setCustQuery('');
    setCustRows([]);
    setPickCustomerId(row.customer?.id || '');
    setPickLeadId(row.lead?.id || '');
  };

  const closeAttach = () => {
    setAttachRecording(null);
    setSavingLink(false);
  };

  const saveAttach = async () => {
    if (!attachRecording) return;
    setSavingLink(true);
    setErr('');
    try {
      const customer_id = pickCustomerId || null;
      const lead_id = customer_id ? pickLeadId || null : null;
      await api.patch(`/voice-recordings/${attachRecording.id}`, {
        customer_id,
        lead_id,
      });
      closeAttach();
      await load();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Lỗi lưu liên kết');
    }
    setSavingLink(false);
  };

  const relinkFromPhone = async (id, opts = {}) => {
    const { updateAttachModal } = opts;
    setErr('');
    setRelinkingRowId(id);
    try {
      const { data } = await api.patch(`/voice-recordings/${id}`, { action: 'relink_from_phone' });
      if (updateAttachModal && data?.recording) {
        setAttachRecording(data.recording);
        setPickCustomerId(data.recording.customer?.id || '');
        setPickLeadId(data.recording.lead?.id || '');
        if (data.recording.customer?.full_name) {
          setCustQuery(data.recording.customer.full_name);
        }
      }
      await load();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Quét thủ công thất bại');
    }
    setRelinkingRowId(null);
  };

  const openBootstrap = (row) => {
    setBootstrapRecording(row);
    setBootFullName(row.customer?.full_name || '');
    setBootPhone(row.phone_number || '');
    const label = row.phone_number || row.customer?.full_name || '';
    setBootTitle(label ? `Cuộc gọi ${label}` : '');
    setBootType('lead');
    setBootCompanyId(voiceScopeCompanyId || (user?.company_id ? String(user.company_id) : ''));
    setBootErr('');
  };

  const closeBootstrap = () => {
    setBootstrapRecording(null);
    setSavingBootstrap(false);
    setBootErr('');
  };

  const runAutoRelinkScan = async () => {
    setRelinking(true);
    setErr('');
    setScanMessage('');
    try {
      const body = companyViewer ? { all_users: true } : {};
      const { data } = await api.post('/voice-recordings/relink-unassigned', body);
      await load();
      if (data?.updated != null) {
        setScanMessage(`Đã quét ${data.scanned} bản ghi — cập nhật ghép CRM: ${data.updated} bản.`);
      }
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Quét ghép thất bại');
    }
    setRelinking(false);
  };

  /** Quét số di động trong tên file / ghi chú / nhãn thiết bị → điền SĐT và thử ghép khách + lead */
  const runScanPhonesFromMetadata = async () => {
    setScanMetaBusy(true);
    setErr('');
    setScanMessage('');
    try {
      const params = {};
      if (companyViewer && filterUserId) params.user_id = filterUserId;
      const { data } = await api.post('/voice-recordings/scan-metadata-phones', {}, { params });
      await load();
      if (data?.filled_phone != null) {
        setScanMessage(
          `Quét tên & ghi chú: xử lý ${data.processed} bản (trong tối đa 80 bản chưa có SĐT; còn ${data.queue_without_phone} bản trong hàng đợi). Đã điền/ghép ${data.filled_phone} bản.`,
        );
      }
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Quét tên file thất bại');
    }
    setScanMetaBusy(false);
  };

  const saveBootstrap = async () => {
    if (!bootstrapRecording) return;
    const hasCustomer = recordingHasCustomer(bootstrapRecording);
    const name = bootFullName.trim();
    const phone = bootPhone.replace(/\s/g, '').trim();
    const recordingPhone = bootstrapRecording.phone_number
      ? String(bootstrapRecording.phone_number).replace(/\s/g, '').trim()
      : '';
    if (!hasCustomer && !name) {
      setBootErr('Nhập tên khách hàng');
      return;
    }
    if (!hasCustomer && !phone && !recordingPhone) {
      setBootErr('Nhập số điện thoại');
      return;
    }
    if (bootType === 'deal' && !bootCompanyId) {
      setBootErr('Chọn công ty cho Deal');
      return;
    }
    setSavingBootstrap(true);
    setBootErr('');
    setErr('');
    try {
      await api.post(`/voice-recordings/${bootstrapRecording.id}/bootstrap-crm`, {
        full_name: name || undefined,
        title: bootTitle.trim() || undefined,
        type: bootType,
        company_id: bootType === 'deal' ? bootCompanyId : undefined,
        phone_number: !recordingPhone && phone ? phone : undefined,
        force_new: true,
      });
      closeBootstrap();
      await load();
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Tạo CRM thất bại';
      setBootErr(msg);
    }
    setSavingBootstrap(false);
  };

  const appendMeta = (fd) => {
    if (deviceLabel.trim()) fd.append('device_label', deviceLabel.trim());
    if (notes.trim()) fd.append('notes', notes.trim());
    if (phoneNumber.replace(/\s/g, '').trim()) fd.append('phone_number', phoneNumber.replace(/\s/g, '').trim());
    if (direction) fd.append('direction', direction);
    if (callStartedAt.trim()) fd.append('call_started_at', callStartedAt.trim());
    if (callEndedAt.trim()) fd.append('call_ended_at', callEndedAt.trim());
    if (externalCallId.trim()) fd.append('external_call_id', externalCallId.trim());
  };

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('audio', file);
      fd.append('source', 'web');
      appendMeta(fd);
      await api.post('/voice-recordings', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setNotes('');
      await load();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Upload thất bại');
    }
    setUploading(false);
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    void uploadFile(f);
  };

  const startMic = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined });
      mr.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = mr.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes('webm') ? 'webm' : 'm4a';
        const file = new File([blob], `mic_${Date.now()}.${ext}`, { type });
        void uploadFile(file);
        setRecording(false);
        mediaRecorderRef.current = null;
      };
      mr.start(250);
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (e) {
      setErr('Không bật được micro: ' + (e.message || String(e)));
    }
  };

  const stopMic = () => {
    mediaRecorderRef.current?.stop();
  };

  const remove = async (id) => {
    if (!confirm('Xóa bản ghi này?')) return;
    try {
      await api.delete(`/voice-recordings/${id}`);
      await load();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Xóa lỗi');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-1 sm:px-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 flex-wrap" style={{ color: '#000000' }}>
          <Mic className="h-7 w-7 text-violet-600 shrink-0" />
          Cuộc gọi &amp; đồng bộ ghi âm
        </h1>
        {isAdmin && !isCompanyScopedAdmin ? (
          <p className="text-sm text-violet-800 mt-2 rounded-lg bg-violet-50 border border-violet-100 px-3 py-2">
            Admin hệ thống: chọn công ty NV để lọc ghi âm (mặc định công ty đầu danh sách). Có thể lọc thêm công ty Lead/Deal.
          </p>
        ) : isCompanyScopedAdmin ? (
          <p className="text-sm text-indigo-800 mt-2 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
            Admin công ty: tự lọc theo công ty được phân — chỉ ghi âm do NV công ty bạn upload.
          </p>
        ) : null}
      </div>

      {scanMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm px-4 py-3">
          {scanMessage}
        </div>
      )}

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
          {err}
          {String(err).includes('voice_recordings') || String(err).includes('relation') || String(err).includes('customer_id') ? (
            <p className="mt-2 text-xs leading-relaxed">
              Chạy migration SQL trên Supabase:{' '}
              <code className="bg-white/80 px-1 rounded">database/61_voice_recordings.sql</code>
              {String(err).includes('phone_number') || String(err).includes('column') ? (
                <>
                  {' '}
                  · <code className="bg-white/80 px-1 rounded">database/62_voice_recordings_call_fields.sql</code>
                </>
              ) : null}
              {' '}
              · <code className="bg-white/80 px-1 rounded">database/63_voice_recordings_crm_link.sql</code> (liên kết KH / lead)
            </p>
          ) : null}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4 shadow-sm">
        <h2 className="font-semibold text-gray-900">Tải lên / ghi từ web</h2>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.amr" className="hidden" onChange={onPickFile} />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="h-10 px-4 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            <Upload className="h-4 w-4" />
            Chọn file ghi âm
          </button>
          {!recording ? (
            <button
              type="button"
              disabled={uploading}
              onClick={() => void startMic()}
              className="h-10 px-4 rounded-lg border border-violet-300 text-violet-800 text-sm font-medium hover:bg-violet-50 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              <Circle className="h-4 w-4 text-red-500 fill-red-500" />
              Ghi từ micro
            </button>
          ) : (
            <button
              type="button"
              onClick={stopMic}
              className="h-10 px-4 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 flex items-center gap-2 cursor-pointer"
            >
              <Square className="h-4 w-4" />
              Dừng &amp; tải lên
            </button>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="h-10 px-4 rounded-lg border text-gray-700 text-sm hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
          <button
            type="button"
            onClick={() => void runScanPhonesFromMetadata()}
            disabled={loading || relinking || scanMetaBusy || relinkingRowId != null}
            className="h-10 px-4 rounded-lg border border-amber-300 bg-amber-50/80 text-amber-950 text-sm font-medium hover:bg-amber-100 disabled:opacity-50 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            title="Tìm số di động trong tên file, ghi chú, nhãn thiết bị — điền SĐT và thử ghép CRM (tối đa 80 bản/lần)"
          >
            <ScanLine className={`h-4 w-4 shrink-0 ${scanMetaBusy ? 'animate-pulse' : ''}`} />
            {scanMetaBusy ? 'Đang quét…' : 'Quét SĐT từ tên ghi âm'}
          </button>
        </div>
        <details className="group rounded-lg border border-gray-100 bg-gray-50/50">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm text-violet-800 hover:bg-violet-50/80 rounded-lg [&::-webkit-details-marker]:hidden flex items-center gap-2">
            <span className="text-gray-400 group-open:rotate-90 transition-transform">▸</span>
            Tuỳ chọn kèm file (SĐT, thời gian cuộc gọi, …)
          </summary>
          <div className="px-3 pb-3 pt-1 grid gap-3 sm:grid-cols-2 border-t border-gray-100">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-500">Số điện thoại</label>
              <input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+84… hoặc để trống nếu ghi SĐT ở ghi chú / tên file"
                className="mt-1 w-full h-9 px-3 border rounded-lg text-sm bg-white"
              />
              <p className="mt-1 text-xs text-gray-500">
                Nếu không nhập ở đây, khi tải lên hệ thống sẽ quét số di động Việt Nam trong ghi chú, tên file và nhãn
                thiết bị. Sau đó tự ghép lead/deal có sẵn (nếu rõ ràng theo SĐT) hoặc{' '}
                <span className="font-medium text-amber-800">tạo Lead mới</span> và gắn vào ghi âm. Nhiều lead hoặc
                nhiều deal song song thì tạo lead mới — vẫn có thể chọn tay trong «Gắn KH / Lead».
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Hướng</label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                className="mt-1 w-full h-9 px-3 border rounded-lg text-sm bg-white"
              >
                <option value="">—</option>
                <option value="inbound">Gọi đến</option>
                <option value="outbound">Gọi đi</option>
                <option value="unknown">Không rõ</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Bắt đầu (ISO)</label>
              <input
                value={callStartedAt}
                onChange={(e) => setCallStartedAt(e.target.value)}
                placeholder="2026-04-15T10:00:00.000Z"
                className="mt-1 w-full h-9 px-3 border rounded-lg text-sm bg-white font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Kết thúc (ISO)</label>
              <input
                value={callEndedAt}
                onChange={(e) => setCallEndedAt(e.target.value)}
                placeholder="2026-04-15T10:05:00.000Z"
                className="mt-1 w-full h-9 px-3 border rounded-lg text-sm bg-white font-mono text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-500">ID thiết bị (chống trùng)</label>
              <input
                value={externalCallId}
                onChange={(e) => setExternalCallId(e.target.value)}
                placeholder="calllog_…"
                className="mt-1 w-full h-9 px-3 border rounded-lg text-sm bg-white font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Nhãn thiết bị</label>
              <input
                value={deviceLabel}
                onChange={(e) => setDeviceLabel(e.target.value)}
                className="mt-1 w-full h-9 px-3 border rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Ghi chú</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full h-9 px-3 border rounded-lg text-sm bg-white"
              />
            </div>
          </div>
        </details>
      </div>

      <VoiceCalendarPanel
        recordings={list}
        selectedDate={calendarDate}
        onSelectDate={(d) => setCalendarDate(d || '')}
        selectedPhone={listPhoneFilter}
        onSelectPhone={(p) => setListPhoneFilter(p || '')}
      />

      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-100 pb-3">
          <button
            type="button"
            onClick={() => setListTab('all')}
            className={`h-9 px-3 rounded-lg text-sm font-medium ${
              listTab === 'all' ? 'bg-violet-600 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Tất cả
          </button>
          <button
            type="button"
            onClick={() => setListTab('unassigned')}
            className={`h-9 px-3 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${
              listTab === 'unassigned'
                ? 'bg-amber-600 text-white'
                : 'border border-amber-200 text-amber-900 hover:bg-amber-50'
            }`}
          >
            <Inbox className="h-4 w-4" />
            Chưa gắn Lead/Deal
          </button>
          <button
            type="button"
            onClick={() => setListTab('linked')}
            className={`h-9 px-3 rounded-lg text-sm font-medium ${
              listTab === 'linked' ? 'bg-emerald-600 text-white' : 'border border-emerald-200 text-emerald-900 hover:bg-emerald-50'
            }`}
          >
            Đã gắn Deal/Lead
          </button>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-3">
          <h2 className="font-semibold flex items-center gap-2 flex-wrap" style={{ color: '#000000' }}>
            {listTab === 'unassigned'
              ? 'Chưa gắn Lead/Deal (có SĐT hoặc đã có KH)'
              : listTab === 'linked'
                ? 'Đã gắn Deal / Lead'
                : 'Đã đồng bộ'}{' '}
            ({filteredList.length}
            {calendarDate ? ` / ${list.length}` : ''})
            {calendarDate && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200">
                <CalendarIcon className="h-3 w-3" />
                {calendarDate.split('-').reverse().join('/')}
                <button
                  type="button"
                  onClick={() => setCalendarDate('')}
                  className="ml-0.5 text-violet-700 hover:text-violet-900 cursor-pointer"
                  title="Bỏ lọc ngày"
                >
                  ×
                </button>
              </span>
            )}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && !isCompanyScopedAdmin && filterCompanies.length > 0 ? (
              <>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <label htmlFor="voice-filter-company" className="text-xs text-gray-500 shrink-0">
                    Công ty NV
                  </label>
                  <select
                    id="voice-filter-company"
                    value={filterCompanyId}
                    onChange={(e) => {
                      setFilterCompanyId(e.target.value);
                      setFilterUserId('');
                    }}
                    className="h-9 px-3 border rounded-lg text-sm bg-white min-w-0 max-w-full sm:max-w-[200px] text-gray-800"
                  >
                    <option value="">Tất cả công ty</option>
                    {filterCompanies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.short_name || c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <label htmlFor="voice-filter-lead-company" className="text-xs text-gray-500 shrink-0">
                    Công ty Lead/Deal
                  </label>
                  <select
                    id="voice-filter-lead-company"
                    value={filterLeadCompanyId}
                    onChange={(e) => setFilterLeadCompanyId(e.target.value)}
                    className="h-9 px-3 border rounded-lg text-sm bg-white min-w-0 max-w-full sm:max-w-[200px] text-gray-800"
                  >
                    <option value="">Tất cả</option>
                    {filterCompanies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.short_name || c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}
            {!isAdmin && userCompanyId ? (
              <span
                className="h-9 inline-flex items-center px-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800"
                title="Công ty của bạn"
              >
                🏢{' '}
                {filterCompanies.find((c) => String(c.id) === String(userCompanyId))?.short_name
                  || filterCompanies.find((c) => String(c.id) === String(userCompanyId))?.name
                  || 'Công ty của bạn'}
              </span>
            ) : null}
            {isCompanyScopedAdmin && userCompanyId ? (
              <span
                className="h-9 inline-flex items-center px-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-900"
                title="Admin phạm vi một công ty"
              >
                🏢{' '}
                {filterCompanies.find((c) => String(c.id) === String(userCompanyId))?.short_name
                  || filterCompanies.find((c) => String(c.id) === String(userCompanyId))?.name
                  || 'Công ty của bạn'}
              </span>
            ) : null}
            {companyViewer ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <label htmlFor="voice-filter-user" className="text-xs text-gray-500 shrink-0">
                  Lọc theo NV
                </label>
                <select
                  id="voice-filter-user"
                  value={filterUserId}
                  onChange={(e) => setFilterUserId(e.target.value)}
                  className="h-9 px-3 border rounded-lg text-sm bg-white min-w-0 max-w-full sm:max-w-[220px] text-gray-800"
                >
                  <option value="">Tất cả nhân viên</option>
                  {staffUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.email || u.id}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <input
              value={listPhoneFilter}
              onChange={(e) => setListPhoneFilter(e.target.value)}
              placeholder="Lọc theo số điện thoại…"
              className="h-9 px-3 border rounded-lg text-sm w-full sm:w-48"
            />
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="h-9 px-3 rounded-lg border text-gray-700 text-sm hover:bg-gray-50"
            >
              Áp dụng lọc
            </button>
            <button
              type="button"
              onClick={() => void runScanPhonesFromMetadata()}
              disabled={loading || relinking || scanMetaBusy || relinkingRowId != null}
              className="h-9 px-3 rounded-lg border border-amber-300 text-amber-900 text-sm hover:bg-amber-50 inline-flex items-center gap-1.5"
              title="Tìm số di động Việt Nam trong tên file, ghi chú, nhãn thiết bị — điền ô SĐT và thử ghép CRM (tối đa 80 bản/lần)"
            >
              <ScanLine className={`h-3.5 w-3.5 ${scanMetaBusy ? 'animate-pulse' : ''}`} />
              {scanMetaBusy ? 'Đang quét…' : 'Quét SĐT từ tên ghi âm'}
            </button>
            <button
              type="button"
              onClick={() => void runAutoRelinkScan()}
              disabled={loading || relinking || scanMetaBusy || relinkingRowId != null}
              className="h-9 px-3 rounded-lg border border-violet-300 text-violet-800 text-sm hover:bg-violet-50 inline-flex items-center gap-1.5"
              title="Quét & ghép KH/Lead theo SĐT cho các bản chưa gắn đủ (theo quyền của bạn)"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${relinking ? 'animate-spin' : ''}`} />
              {relinking ? 'Đang quét…' : 'Quét ghép CRM (hàng loạt)'}
            </button>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-gray-500">Đang tải…</p>
        ) : filteredList.length === 0 ? (
          <p className="text-sm text-gray-500">
            {calendarDate
              ? `Không có ghi âm nào trong ngày ${calendarDate.split('-').reverse().join('/')} (theo bộ lọc hiện tại).`
              : listTab === 'unassigned'
                ? 'Không có bản nào cần gắn Lead/Deal. Tab này gồm bản đã có SĐT hoặc đã có khách nhưng chưa chọn cơ hội — dùng «Quét gắn» hoặc «Gắn KH / Lead».'
                : listTab === 'linked'
                  ? 'Chưa có bản ghi nào đã ghép lead/deal. Dùng «Quét ghép CRM» sau khi có SĐT trùng khách & cơ hội do bạn phụ trách.'
                  : 'Chưa có bản ghi. App mobile sau khi đăng nhập sẽ hiện ở đây.'}
          </p>
        ) : (
          <ul className="space-y-4">
            {filteredList.map((r) => (
              <li
                key={r.id}
                className="border border-gray-100 rounded-lg p-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium text-gray-900 break-all">{r.file_name}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                    <span>{formatDateTime(r.created_at)}</span>
                    {companyViewer && r.uploader?.full_name ? (
                      <span className="font-medium text-violet-800">NV: {r.uploader.full_name}</span>
                    ) : null}
                    {r.phone_number ? (
                      <span className="font-medium text-gray-800">Số: {r.phone_number}</span>
                    ) : null}
                    {r.direction ? <span>{dirLabel(r.direction)}</span> : null}
                    {r.source ? <span>Nguồn: {r.source}</span> : null}
                    {r.device_label ? <span>{r.device_label}</span> : null}
                  </div>
                  {(r.call_started_at || r.call_ended_at) && (
                    <p className="text-xs text-gray-800 mt-1 rounded-md bg-slate-50 border border-slate-100 px-2 py-1.5">
                      <span className="font-medium text-slate-700">Thời điểm cuộc gọi: </span>
                      {r.call_started_at ? `bắt đầu ${formatDateTime(r.call_started_at)}` : null}
                      {r.call_started_at && r.call_ended_at ? ' · ' : null}
                      {r.call_ended_at ? `kết thúc ${formatDateTime(r.call_ended_at)}` : null}
                    </p>
                  )}
                  {r.external_call_id ? (
                    <p className="text-xs font-mono text-gray-500 break-all">ID: {r.external_call_id}</p>
                  ) : null}
                  {r.notes ? <p className="text-xs text-gray-600 mt-1 line-clamp-3">{r.notes}</p> : null}
                  {!r.customer && !r.lead && r.phone_number ? (
                    <p className="text-xs text-amber-800 mt-1 rounded border border-amber-100 bg-amber-50/80 px-2 py-1 inline-block">
                      Chưa ghép CRM — thử «Quét thủ công» hoặc «Gắn KH / Lead».
                    </p>
                  ) : null}
                  {(r.customer || r.lead) && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs rounded-lg bg-violet-50/80 border border-violet-100 px-3 py-2">
                      <span className="font-medium text-violet-900 flex items-center gap-1">
                        <Link2 className="h-3.5 w-3.5" />
                        CRM
                      </span>
                      {r.customer ? (
                        <Link className="text-violet-700 hover:underline font-medium" to={`/customers/${r.customer.id}`}>
                          <UserRound className="inline h-3.5 w-3.5 mr-0.5 align-text-bottom" />
                          {r.customer.full_name}
                        </Link>
                      ) : (
                        <span className="text-gray-500">Chưa gắn khách hàng</span>
                      )}
                      {r.lead ? (
                        <Link className="text-violet-700 hover:underline" to={`/crm/leads/${r.lead.id}`}>
                          {leadTypeLabel(r.lead.type)}: {r.lead.code || r.lead.title}
                        </Link>
                      ) : r.customer ? (
                        <span className="text-gray-500">
                          Chưa gắn lead/deal — nếu khách có từ hai cơ hội trở lên, chọn thủ công trong «Gắn KH / Lead»
                        </span>
                      ) : null}
                    </div>
                  )}
                  <audio controls className="mt-2 w-full max-w-md h-9" src={recordingAudioUrl(r)} preload="none" />
                </div>
                <div className="flex flex-col gap-2 shrink-0 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={() => openAttach(r)}
                    className="h-9 px-3 rounded-lg border border-violet-200 text-violet-800 text-sm hover:bg-violet-50 flex items-center gap-1 cursor-pointer"
                  >
                    <Link2 className="h-4 w-4" />
                    Gắn KH / Lead
                  </button>
                  <button
                    type="button"
                    onClick={() => void relinkFromPhone(r.id)}
                    disabled={relinkingRowId != null}
                    title="Quét SĐT (ô số, ghi chú, tên file…) → ghép khách; nếu khách có đúng một lead hoặc một deal (hoặc một lead kèm deal) thì gắn theo quy tắc hệ thống"
                    className="h-9 px-3 rounded-lg border border-emerald-200 bg-emerald-50/80 text-emerald-900 text-sm hover:bg-emerald-100 cursor-pointer disabled:opacity-50 disabled:pointer-events-none inline-flex items-center gap-1.5"
                  >
                    <ScanLine className={`h-3.5 w-3.5 shrink-0 ${relinkingRowId === r.id ? 'animate-pulse' : ''}`} />
                    {relinkingRowId === r.id ? 'Đang quét…' : 'Quét gắn Lead'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openBootstrap(r)}
                    className="h-9 px-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm hover:bg-amber-100 flex items-center gap-1 cursor-pointer"
                  >
                    <UserPlus className="h-4 w-4" />
                    {recordingHasLead(r)
                      ? 'Tạo thêm Lead/Deal'
                      : recordingHasCustomer(r)
                        ? 'Tạo Lead/Deal'
                        : 'Tạo KH + Lead/Deal'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(r.id)}
                    className="h-9 px-3 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                    Xóa
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {bootstrapRecording && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-amber-600" />
              {recordingHasLead(bootstrapRecording)
                ? 'Tạo thêm Lead/Deal rồi liên kết'
                : recordingHasCustomer(bootstrapRecording)
                  ? 'Tạo Lead/Deal rồi liên kết'
                  : 'Tạo khách & Lead/Deal rồi liên kết'}
            </h3>
            {bootErr ? (
              <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">
                {bootErr}
              </div>
            ) : null}
            {recordingHasLead(bootstrapRecording) ? (
              <p className="text-xs text-amber-800 rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2">
                Ghi âm đã gắn {leadTypeLabel(bootstrapRecording.lead?.type)} — thao tác này sẽ tạo cơ hội mới và
                cập nhật liên kết sang lead/deal vừa tạo.
              </p>
            ) : null}
            {recordingHasCustomer(bootstrapRecording) ? (
              <p className="text-xs text-gray-600">
                Khách đã gắn:{' '}
                <span className="font-medium">{bootstrapRecording.customer?.full_name || '—'}</span>
                {bootstrapRecording.phone_number ? (
                  <>
                    {' '}
                    · SĐT: <span className="font-mono">{bootstrapRecording.phone_number}</span>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="text-xs text-gray-600">
                {bootstrapRecording.phone_number ? (
                  <>
                    Số trên ghi âm: <span className="font-mono font-medium">{bootstrapRecording.phone_number}</span>. Nếu SĐT đã
                    có trong CRM, hệ thống dùng khách đó và chỉ tạo thêm cơ hội.
                  </>
                ) : (
                  'Nhập tên và SĐT để tạo khách mới (hoặc ghép khách có sẵn theo số).'
                )}
              </p>
            )}
            {!recordingHasCustomer(bootstrapRecording) ? (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Tên khách hàng *</label>
                  <input
                    value={bootFullName}
                    onChange={(e) => setBootFullName(e.target.value)}
                    className="mt-1 w-full h-9 px-3 border rounded-lg text-sm"
                    placeholder="Họ tên hiển thị trên CRM"
                  />
                </div>
                {!bootstrapRecording.phone_number ? (
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">Số điện thoại *</label>
                    <input
                      value={bootPhone}
                      onChange={(e) => setBootPhone(e.target.value)}
                      className="mt-1 w-full h-9 px-3 border rounded-lg text-sm"
                      placeholder="+84…"
                    />
                  </div>
                ) : null}
              </>
            ) : null}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Tên Lead / Deal</label>
              <input
                value={bootTitle}
                onChange={(e) => setBootTitle(e.target.value)}
                className="mt-1 w-full h-9 px-3 border rounded-lg text-sm"
                placeholder="Mặc định theo số điện thoại"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Loại</label>
              <select
                value={bootType}
                onChange={(e) => setBootType(e.target.value)}
                className="mt-1 w-full h-9 px-3 border rounded-lg text-sm bg-white"
              >
                <option value="lead">Lead</option>
                <option value="deal">Deal</option>
              </select>
            </div>
            {bootType === 'deal' && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Công ty *</label>
                <select
                  value={bootCompanyId}
                  onChange={(e) => setBootCompanyId(e.target.value)}
                  className="mt-1 w-full h-9 px-3 border rounded-lg text-sm bg-white"
                >
                  <option value="">— Chọn —</option>
                  {filterCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.short_name || c.name || c.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <button type="button" onClick={closeBootstrap} className="h-9 px-4 rounded-lg border text-gray-700 text-sm">
                Huỷ
              </button>
              <button
                type="button"
                disabled={savingBootstrap}
                onClick={() => void saveBootstrap()}
                className="h-9 px-4 rounded-lg bg-amber-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {savingBootstrap ? 'Đang tạo…' : 'Tạo & liên kết'}
              </button>
            </div>
          </div>
        </div>
      )}

      {attachRecording && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">Gắn ghi âm với CRM</h3>
            <p className="text-xs text-gray-600">File: {attachRecording.file_name}</p>
            {attachRecording.phone_number ? (
              <p className="text-xs text-gray-700">
                SĐT trên ghi âm: <span className="font-mono font-medium">{attachRecording.phone_number}</span>
              </p>
            ) : null}
            {attachPreviewLoading ? (
              <p className="text-xs text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                Đang tra số với danh sách khách hàng…
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={savingLink || relinkingRowId != null}
                onClick={() => void relinkFromPhone(attachRecording.id, { updateAttachModal: true })}
                className="h-9 px-3 rounded-lg border border-emerald-200 bg-emerald-50/80 text-emerald-900 text-sm hover:bg-emerald-100 inline-flex items-center gap-1.5 disabled:opacity-50"
                title="Quét SĐT từ file/ghi chú rồi tự ghép KH; nếu đủ điều kiện sẽ gắn luôn Lead/Deal"
              >
                <ScanLine className="h-3.5 w-3.5 shrink-0" />
                {relinkingRowId === attachRecording.id ? 'Đang quét…' : 'Quét gắn từ SĐT'}
              </button>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Tìm khách hàng (gõ tên hoặc SĐT)</label>
              <input
                value={custQuery}
                onChange={(e) => setCustQuery(e.target.value)}
                className="mt-1 w-full h-9 px-3 border rounded-lg text-sm"
                placeholder="ít nhất 2 ký tự"
              />
              {custRows.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-y-auto border rounded-lg divide-y text-sm">
                  {custRows.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={`w-full text-left px-3 py-2 hover:bg-violet-50 ${pickCustomerId === c.id ? 'bg-violet-50 font-medium' : ''}`}
                        onClick={() => {
                          setPickCustomerId(c.id);
                          setPickLeadId('');
                        }}
                      >
                        {c.full_name} · {c.phone || '—'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">
                Lead / Deal của khách hàng
                {pickCustomerId && leadRows.length > 0 ? (
                  <span className="text-gray-400 font-normal normal-case"> ({leadRows.length} cơ hội)</span>
                ) : null}
              </label>
              {leadRowsLoading ? (
                <p className="mt-1 text-xs text-gray-500">Đang tải danh sách Lead/Deal…</p>
              ) : null}
              <select
                value={pickLeadId}
                onChange={(e) => setPickLeadId(e.target.value)}
                className="mt-1 w-full h-9 px-3 border rounded-lg text-sm bg-white disabled:bg-gray-50"
                disabled={!pickCustomerId || leadRowsLoading}
              >
                <option value="">
                  {!pickCustomerId
                    ? '— Chọn khách hàng trước —'
                    : leadRows.length === 0
                      ? '— Khách chưa có Lead/Deal trong phạm vi của bạn —'
                      : '— Không chọn (chỉ gắn khách) —'}
                </option>
                {leadRows.map((l) => (
                  <option key={l.id} value={l.id}>
                    {leadTypeLabel(l.type)} {l.code ? `${l.code} · ` : ''}
                    {l.title}
                  </option>
                ))}
              </select>
              {pickCustomerId && !leadRowsLoading && leadRows.length === 0 ? (
                <p className="mt-1 text-xs text-amber-800">
                  Không có Lead/Deal nào bạn được xem cho khách này — tạo thêm trên CRM hoặc nhờ quản trị phân quyền.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <button type="button" onClick={closeAttach} className="h-9 px-4 rounded-lg border text-gray-700 text-sm">
                Huỷ
              </button>
              <button
                type="button"
                disabled={savingLink}
                onClick={() => void saveAttach()}
                className="h-9 px-4 rounded-lg bg-violet-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {savingLink ? 'Đang lưu…' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
