import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isCrmCompanyAdmin } from '../lib/crmAdminScope';
import { isAdminLike, normalizeRole, hasCompanyId } from '../lib/adminRole';
import { resolveDefaultCrmAdminCompanyId } from '../lib/crmCompanyFilter';
import { Upload, RefreshCw, Square, Circle, ScanLine, Calendar as CalendarIcon, Search, SlidersHorizontal, ChevronLeft, ChevronRight, UserPlus, Mic, AudioLines } from 'lucide-react';
import VoiceCalendarPanel from '../components/VoiceCalendarPanel';
import VoiceRecordingCard from '../components/voice/VoiceRecordingCard';
import { useIsMobile } from '../hooks/useIsMobile';

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

  /** all | unassigned | linked | prospect — prospect = Lead tiềm năng */
  const [listTab, setListTab] = useState('all');
  const [relinking, setRelinking] = useState(false);
  const [relinkingRowId, setRelinkingRowId] = useState(null);
  const [transcribingRowId, setTranscribingRowId] = useState(null);
  const [classifyBusy, setClassifyBusy] = useState(false);
  const [scanMetaBusy, setScanMetaBusy] = useState(false);
  const [scanDupBusy, setScanDupBusy] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dragOver, setDragOver] = useState(false);

  const [bootstrapRecording, setBootstrapRecording] = useState(null);
  const [bootFullName, setBootFullName] = useState('');
  const [bootTitle, setBootTitle] = useState('');
  const [bootType, setBootType] = useState('lead');
  const [bootCompanyId, setBootCompanyId] = useState('');
  const [bootPhone, setBootPhone] = useState('');
  const [bootErr, setBootErr] = useState('');
  const [savingBootstrap, setSavingBootstrap] = useState(false);

  /** Công ty đang áp dụng — NV có company_id luôn khóa; admin hệ thống chọn dropdown. */
  const voiceScopeCompanyId = useMemo(() => {
    const userCo = user?.company_id ? String(user.company_id) : '';
    const isSystemAdminUnscoped = isAdmin && !isCompanyScopedAdmin;
    if (userCo && !isSystemAdminUnscoped) return userCo;
    if (isSystemAdminUnscoped && filterCompanyId) return String(filterCompanyId);
    return '';
  }, [isAdmin, isCompanyScopedAdmin, user?.company_id, filterCompanyId]);

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const params = { include_transcript: '1' };
      if (listPhoneFilter.trim()) params.phone = listPhoneFilter.trim();
      if (listTab === 'unassigned') params.unassigned = '1';
      if (listTab === 'linked') params.linked_only = '1';
      if (listTab === 'prospect') params.prospect_class = 'prospect_lead';
      if (companyViewer && filterUserId) params.user_id = filterUserId;
      if (voiceScopeCompanyId) params.company_id = voiceScopeCompanyId;
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
  }, [listTab, filterUserId, filterCompanyId, companyViewer, listPhoneFilter, voiceScopeCompanyId]);

  /** Lọc client-side theo ngày đã chọn trong calendar — không cần gọi lại API */
  const filteredList = useMemo(() => {
    if (!calendarDate) return list;
    return list.filter((r) => toLocalISODate(r.call_started_at || r.created_at) === calendarDate);
  }, [list, calendarDate]);

  const searchedList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredList;
    return filteredList.filter((r) => {
      const hay = [
        r.file_name,
        r.phone_number,
        r.source,
        r.notes,
        r.device_label,
        r.uploader?.full_name,
        r.uploader?.email,
        r.customer?.full_name,
        r.lead?.code,
        r.lead?.title,
      ];
      return hay.some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [filteredList, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(searchedList.length / pageSize));
  const isMobile = useIsMobile();
  /** Mobile chỉ đủ chỗ 3 nút số trang bên cạnh nút lùi/tiến. */
  const maxPageButtons = isMobile ? 3 : 5;
  const paginatedList = useMemo(() => {
    const start = (page - 1) * pageSize;
    return searchedList.slice(start, start + pageSize);
  }, [searchedList, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [listTab, searchQuery, calendarDate, filterUserId, filterCompanyId, listPhoneFilter, voiceScopeCompanyId, pageSize]);

  useEffect(() => {
    if (!showCalendar) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setShowCalendar(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCalendar]);

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

  const voiceListScopeParams = () => {
    const params = {};
    if (companyViewer && filterUserId) params.user_id = filterUserId;
    if (voiceScopeCompanyId) params.company_id = voiceScopeCompanyId;
    return params;
  };

  const runAutoRelinkScan = async () => {
    setRelinking(true);
    setErr('');
    setScanMessage('');
    try {
      const body = companyViewer ? { all_users: true } : {};
      const { data } = await api.post('/voice-recordings/relink-unassigned', body, {
        params: voiceListScopeParams(),
      });
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
      const { data } = await api.post('/voice-recordings/scan-metadata-phones', {}, {
        params: voiceListScopeParams(),
      });
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

  /** Phân loại Lead tiềm năng + xếp hàng STT */
  const runClassifyProspects = async () => {
    setClassifyBusy(true);
    setErr('');
    setScanMessage('');
    try {
      const { data } = await api.post(
        '/voice-recordings/classify-prospects',
        { force: true, limit: 200 },
        { params: voiceListScopeParams() },
      );
      await load();
      if (data?.classified != null) {
        setScanMessage(
          `Phân loại: quét ${data.scanned} — cập nhật ${data.classified} (xếp hàng STT: ${data.pending}, bỏ qua: ${data.skipped}).`,
        );
      }
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Phân loại thất bại');
    }
    setClassifyBusy(false);
  };

  const requestTranscribe = async (id, force = false) => {
    setTranscribingRowId(id);
    setErr('');
    try {
      const { data } = await api.post(`/voice-recordings/${id}/transcribe`, { force: force ? 1 : 0 });
      if (data?.recording) {
        setList((prev) => prev.map((r) => (r.id === id ? { ...r, ...data.recording } : r)));
        setScanMessage('Đã xếp hàng chuyển văn bản. Làm mới sau vài chục giây để xem kết quả.');
      } else {
        await load();
      }
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Không xếp hàng STT');
    }
    setTranscribingRowId(null);
  };

  /** Quét bản ghi trùng trên server (tên + dung lượng + SĐT + thời gian + thời lượng). */
  const runScanDuplicates = async () => {
    setScanDupBusy(true);
    setErr('');
    setScanMessage('');
    try {
      const { data } = await api.post('/voice-recordings/scan-duplicates', {}, {
        params: voiceListScopeParams(),
      });
      if (data?.duplicate_groups != null) {
        setScanMessage(
          `Quét trùng: ${data.scanned} bản — ${data.duplicate_groups} nhóm trùng (${data.duplicate_rows} bản ghi).`,
        );
      }
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Quét trùng thất bại');
    }
    setScanDupBusy(false);
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

  const onDropFiles = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) void uploadFile(f);
  };

  const pillClass = (active, tone = 'violet') => {
    if (active && tone === 'violet') {
      return 'bg-gradient-to-r from-violet-600 to-violet-500 text-white shadow-md shadow-violet-500/25';
    }
    if (active && tone === 'amber') {
      return 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/20';
    }
    if (active && tone === 'emerald') {
      return 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/20';
    }
    if (active && tone === 'sky') {
      return 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-500/20';
    }
    if (tone === 'amber') return 'bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100';
    if (tone === 'emerald') return 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 hover:bg-emerald-100';
    if (tone === 'sky') return 'bg-sky-50 text-sky-800 border border-sky-200/80 hover:bg-sky-100';
    return 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50';
  };

  return (
    <div className="min-h-full bg-white">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {scanMessage && (
          <div className="rounded-[20px] border border-emerald-200 bg-emerald-50/80 text-emerald-900 text-sm px-4 py-3">
            {scanMessage}
          </div>
        )}

        {err && (
          <div className="rounded-[20px] border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">
            {err}
            {String(err).includes('voice_recordings') || String(err).includes('relation') || String(err).includes('customer_id') ? (
              <p className="mt-2 text-xs leading-relaxed">
                Chạy migration SQL trên Supabase:{' '}
                <code className="bg-white/80 px-1 rounded">database/61_voice_recordings.sql</code>
                {String(err).includes('phone_number') || String(err).includes('column') ? (
                  <> · <code className="bg-white/80 px-1 rounded">database/62_voice_recordings_call_fields.sql</code></>
                ) : null}
                {' '}· <code className="bg-white/80 px-1 rounded">database/63_voice_recordings_crm_link.sql</code>
              </p>
            ) : null}
          </div>
        )}

        {/* Upload card — compact hero strip */}
        <section className="relative overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50/70 shadow-[0_8px_32px_rgba(124,58,237,0.12)] ring-1 ring-violet-100/80">
          <div className="pointer-events-none absolute -right-8 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-violet-400/12 blur-2xl" />

          <div className="relative p-3.5 sm:p-4 space-y-2.5">
            <input ref={fileRef} type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.amr" className="hidden" onChange={onPickFile} />

            <div className="flex flex-col lg:flex-row lg:items-stretch gap-2.5">
              <div className="flex items-center gap-2.5 shrink-0 lg:w-[148px] lg:border-r lg:border-violet-100/80 lg:pr-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/30">
                  <AudioLines className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-900 leading-tight">Tải lên &amp; ghi âm</h2>
                  {recording && (
                    <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-semibold text-red-600">
                      <Mic className="h-3 w-3 animate-pulse" />
                      Đang ghi…
                    </span>
                  )}
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => !uploading && fileRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDropFiles}
                className={`group flex flex-1 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-3 py-2.5 transition-all ${
                  dragOver
                    ? 'border-violet-500 bg-violet-100/70 shadow-inner'
                    : 'border-violet-300/55 bg-white/75 hover:border-violet-400 hover:bg-white'
                } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
              >
                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  dragOver ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-600 group-hover:bg-violet-200/80'
                }`}>
                  <Upload className="h-4 w-4" />
                </span>
                <div className="min-w-0 text-left">
                  <p className="text-xs font-semibold text-slate-800 truncate">
                    {dragOver ? 'Thả file để tải lên' : 'Kéo thả hoặc bấm chọn file audio'}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate">
                    <span className="text-violet-700 font-medium">.m4a · .mp3 · .wav</span>
                    <span className="hidden sm:inline"> · webm, ogg, amr · tối đa 100MB</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 lg:max-w-[420px] lg:justify-end">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="h-9 px-3 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-semibold hover:brightness-105 disabled:opacity-50 inline-flex items-center gap-1.5 shadow-md shadow-violet-500/20"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Chọn file
                </button>
                {!recording ? (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => void startMic()}
                    className="h-9 px-3 rounded-lg border border-red-200/80 bg-white/90 text-slate-800 text-xs font-medium hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <Circle className="h-3.5 w-3.5 text-red-500 fill-red-500" />
                    Ghi micro
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopMic}
                    className="h-9 px-3 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 inline-flex items-center gap-1.5 animate-pulse"
                  >
                    <Square className="h-3.5 w-3.5" />
                    Dừng
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading}
                  title="Làm mới"
                  className="h-9 w-9 rounded-lg border border-slate-200/80 bg-white/80 text-slate-600 hover:bg-white inline-flex items-center justify-center"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => void runScanDuplicates()}
                  disabled={loading || relinking || scanMetaBusy || scanDupBusy || relinkingRowId != null}
                  title="Quét trùng (tên, dung lượng, SĐT, thời gian)"
                  className="h-9 px-2.5 rounded-lg border border-slate-200/80 bg-white/90 text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <ScanLine className={`h-3.5 w-3.5 ${scanDupBusy ? 'animate-pulse' : ''}`} />
                  <span className="hidden sm:inline">{scanDupBusy ? 'Quét trùng…' : 'Quét trùng'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void runScanPhonesFromMetadata()}
                  disabled={loading || relinking || scanMetaBusy || scanDupBusy || classifyBusy || relinkingRowId != null}
                  title="Quét SĐT từ tên file"
                  className="h-9 px-2.5 rounded-lg border border-amber-200/80 bg-amber-50/90 text-amber-900 text-xs font-medium hover:bg-amber-100 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <ScanLine className={`h-3.5 w-3.5 ${scanMetaBusy ? 'animate-pulse' : ''}`} />
                  <span className="hidden sm:inline">{scanMetaBusy ? 'Quét…' : 'Quét SĐT'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void runClassifyProspects()}
                  disabled={loading || relinking || scanMetaBusy || scanDupBusy || classifyBusy || relinkingRowId != null}
                  title="Phân loại Lead tiềm năng và xếp hàng chuyển văn bản (STT)"
                  className="h-9 px-2.5 rounded-lg border border-sky-200/80 bg-sky-50/90 text-sky-900 text-xs font-medium hover:bg-sky-100 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <AudioLines className={`h-3.5 w-3.5 ${classifyBusy ? 'animate-pulse' : ''}`} />
                  <span className="hidden sm:inline">{classifyBusy ? 'Phân loại…' : 'Phân loại & STT'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCalendar((v) => !v)}
                  title="Lịch ghi âm"
                  className={`h-9 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-all ${
                    showCalendar
                      ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/25'
                      : 'border border-violet-200/80 bg-white/80 text-violet-700 hover:bg-violet-50'
                  }`}
                >
                  <CalendarIcon size={14} />
                  <span className="hidden sm:inline">Lịch</span>
                </button>
              </div>
            </div>

            <details className="group rounded-lg border border-violet-100/60 bg-white/50">
              <summary className="cursor-pointer list-none px-3 py-1.5 text-[11px] font-medium text-violet-800 hover:bg-violet-50/60 rounded-lg [&::-webkit-details-marker]:hidden inline-flex items-center gap-1">
                <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                Tuỳ chọn kèm file (SĐT, thời gian cuộc gọi, …)
              </summary>
              <div className="px-3 pb-3 pt-1 grid gap-2 sm:grid-cols-2 border-t border-violet-100/60">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-500">Số điện thoại</label>
                <input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+84… hoặc để trống nếu ghi SĐT ở ghi chú / tên file"
                  className="mt-1 w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Hướng</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  className="mt-1 w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white"
                >
                  <option value="">—</option>
                  <option value="inbound">Gọi đến</option>
                  <option value="outbound">Gọi đi</option>
                  <option value="unknown">Không rõ</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Bắt đầu (ISO)</label>
                <input
                  value={callStartedAt}
                  onChange={(e) => setCallStartedAt(e.target.value)}
                  placeholder="2026-04-15T10:00:00.000Z"
                  className="mt-1 w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Kết thúc (ISO)</label>
                <input
                  value={callEndedAt}
                  onChange={(e) => setCallEndedAt(e.target.value)}
                  placeholder="2026-04-15T10:05:00.000Z"
                  className="mt-1 w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white font-mono text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-500">ID thiết bị (chống trùng)</label>
                <input
                  value={externalCallId}
                  onChange={(e) => setExternalCallId(e.target.value)}
                  placeholder="calllog_…"
                  className="mt-1 w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Nhãn thiết bị</label>
                <input
                  value={deviceLabel}
                  onChange={(e) => setDeviceLabel(e.target.value)}
                  className="mt-1 w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Ghi chú</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white"
                />
              </div>
            </div>
          </details>
          </div>
        </section>

        {showCalendar && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-4 pt-[6vh] overflow-y-auto"
            onClick={() => setShowCalendar(false)}
            role="presentation"
          >
            <div
              className="w-full max-w-2xl animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Lịch ghi âm"
            >
              <VoiceCalendarPanel
                recordings={list}
                selectedDate={calendarDate}
                onSelectDate={(d) => setCalendarDate(d || '')}
                selectedPhone={listPhoneFilter}
                onSelectPhone={(p) => setListPhoneFilter(p || '')}
                onClose={() => setShowCalendar(false)}
              />
            </div>
          </div>
        )}

        {/* Filters + grid */}
        <section className="rounded-[20px] border border-slate-200/70 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setListTab('all')} className={`h-8 px-3.5 rounded-full text-xs font-semibold transition-all ${pillClass(listTab === 'all', 'violet')}`}>
                  Tất cả ({listTab === 'all' ? filteredList.length : searchedList.length})
                </button>
                <button type="button" onClick={() => setListTab('unassigned')} className={`h-8 px-3.5 rounded-full text-xs font-semibold transition-all ${pillClass(listTab === 'unassigned', 'amber')}`}>
                  Chưa gắn
                </button>
                <button type="button" onClick={() => setListTab('linked')} className={`h-8 px-3.5 rounded-full text-xs font-semibold transition-all ${pillClass(listTab === 'linked', 'emerald')}`}>
                  Đã gắn
                </button>
                <button type="button" onClick={() => setListTab('prospect')} className={`h-8 px-3.5 rounded-full text-xs font-semibold transition-all ${pillClass(listTab === 'prospect', 'sky')}`}>
                  Lead tiềm năng
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px] sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm kiếm ghi âm…"
                    className="w-full h-9 pl-8 pr-3 rounded-full border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  className={`h-9 px-3 rounded-full border text-xs font-medium inline-flex items-center gap-1.5 shrink-0 ${
                    showFilters ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal size={14} />
                  Bộ lọc
                </button>
              </div>
            </div>

            {(calendarDate || showFilters) && (
              <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                {calendarDate && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-800 border border-violet-200 shrink-0">
                    <CalendarIcon className="h-3 w-3" />
                    {calendarDate.split('-').reverse().join('/')}
                    <button type="button" onClick={() => setCalendarDate('')} className="text-violet-600 hover:text-violet-900 leading-none">×</button>
                  </span>
                )}
                {showFilters && (
                  <>
                    {isAdmin && !isCompanyScopedAdmin && filterCompanies.length > 0 ? (
                      <label className="flex flex-col gap-0.5 min-w-[140px] flex-1 max-w-[200px]">
                        <span className="text-[10px] font-medium text-slate-500">Công ty NV</span>
                        <select
                          id="voice-filter-company"
                          value={filterCompanyId}
                          onChange={(e) => { setFilterCompanyId(e.target.value); setFilterUserId(''); }}
                          className="h-8 px-2.5 border border-slate-200 rounded-lg text-xs bg-white"
                        >
                          <option value="">Tất cả công ty</option>
                          {filterCompanies.map((c) => (
                            <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {companyViewer ? (
                      <label className="flex flex-col gap-0.5 min-w-[140px] flex-1 max-w-[200px]">
                        <span className="text-[10px] font-medium text-slate-500">Nhân viên</span>
                        <select
                          id="voice-filter-user"
                          value={filterUserId}
                          onChange={(e) => setFilterUserId(e.target.value)}
                          className="h-8 px-2.5 border border-slate-200 rounded-lg text-xs bg-white"
                        >
                          <option value="">Tất cả NV</option>
                          {staffUsers.map((u) => (
                            <option key={u.id} value={u.id}>{u.full_name || u.email || u.id}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="flex flex-col gap-0.5 min-w-[120px] flex-1 max-w-[160px]">
                      <span className="text-[10px] font-medium text-slate-500">Số điện thoại</span>
                      <input
                        value={listPhoneFilter}
                        onChange={(e) => setListPhoneFilter(e.target.value)}
                        placeholder="Lọc SĐT…"
                        className="h-8 px-2.5 border border-slate-200 rounded-lg text-xs bg-white"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void runAutoRelinkScan()}
                      disabled={loading || relinking || scanMetaBusy}
                      className="h-8 px-3 rounded-lg border border-violet-200 text-violet-700 text-xs font-medium hover:bg-violet-50 inline-flex items-center gap-1.5 shrink-0 ml-auto"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${relinking ? 'animate-spin' : ''}`} />
                      Quét ghép CRM
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-slate-500">Đang tải…</div>
          ) : searchedList.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                {calendarDate
                  ? `Không có ghi âm nào trong ngày ${calendarDate.split('-').reverse().join('/')}.`
                  : listTab === 'unassigned'
                    ? 'Không có bản nào cần gắn Lead/Deal.'
                    : listTab === 'linked'
                      ? 'Chưa có bản ghi nào đã ghép lead/deal.'
                      : listTab === 'prospect'
                        ? 'Chưa có ghi âm nào gắn Lead tiềm năng.'
                        : 'Chưa có bản ghi. Tải lên hoặc đồng bộ từ app mobile.'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {paginatedList.map((r) => (
                  <VoiceRecordingCard
                    key={r.id}
                    recording={r}
                    audioUrl={recordingAudioUrl(r)}
                    companyViewer={companyViewer}
                    relinkingRowId={relinkingRowId}
                    transcribingRowId={transcribingRowId}
                    onAttach={openAttach}
                    onRelink={relinkFromPhone}
                    onBootstrap={openBootstrap}
                    onRemove={remove}
                    onTranscribe={requestTranscribe}
                  />
                ))}
              </div>

              {/* Pagination */}
              <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  Hiển thị {(page - 1) * pageSize + 1} – {Math.min(page * pageSize, searchedList.length)} trong tổng số {searchedList.length} ghi âm
                </p>
                {/* Mobile: hàng này cần ~420px (prev + 5 nút trang + next + select 112px)
                    trong khi chỉ có ~280px → cho xuống hàng và rút còn 3 nút trang. */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, maxPageButtons) }, (_, i) => {
                    const half = Math.floor(maxPageButtons / 2);
                    let pageNum = i + 1;
                    if (totalPages > maxPageButtons) {
                      if (page <= half + 1) pageNum = i + 1;
                      else if (page >= totalPages - half) pageNum = totalPages - maxPageButtons + 1 + i;
                      else pageNum = page - half + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setPage(pageNum)}
                        className={`h-9 min-w-[36px] px-2 rounded-xl text-sm font-semibold ${
                          page === pageNum
                            ? 'bg-gradient-to-r from-violet-600 to-violet-500 text-white shadow-md shadow-violet-500/25'
                            : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="h-9 px-2 border border-slate-200 rounded-xl text-sm bg-white sm:ml-2"
                  >
                    <option value={10}>10 / trang</option>
                    <option value={20}>20 / trang</option>
                    <option value={50}>50 / trang</option>
                  </select>
                </div>
              </div>
            </>
          )}
        </section>

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
    </div>
  );
}
