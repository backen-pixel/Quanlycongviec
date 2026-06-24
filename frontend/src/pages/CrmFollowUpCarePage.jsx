import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { formatDate } from '../lib/utils';
import { loadXlsx } from '../lib/xlsxLoader';
import DateRangePickerPopover from '../components/DateRangePickerPopover';
import {
  getStoredCrmFilterCompanyId,
  resolveDefaultCrmAdminCompanyId,
} from '../lib/crmCompanyFilter';
import { isCrmCompanyAdmin } from '../lib/crmAdminScope';
import EmployeePicker from '../components/EmployeePicker';
import {
  CalendarClock,
  Search,
  User,
  Layers,
  AlertTriangle,
  RefreshCw,
  Building2,
  Target,
  Filter,
  Tag,
  CheckCircle2,
  Download,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Settings,
} from 'lucide-react';

function parseStageIdsFromSearchParams(sp) {
  const multi = sp.get('stage_ids');
  if (multi) return multi.split(',').map((s) => s.trim()).filter(Boolean);
  const single = sp.get('stage_id');
  return single ? [single] : [];
}

function sanitizeExcelSheetName(name, fallback = 'Pipeline') {
  const cleaned = String(name || fallback)
    .replace(/[\\/*?:\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);
  return cleaned || fallback;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function toIso(d) {
  return startOfDay(d).toISOString().split('T')[0];
}

function getLeadAgeDays(createdAt) {
  if (!createdAt) return null;
  const created = startOfDay(new Date(createdAt));
  const today = startOfDay(new Date());
  return Math.max(0, Math.floor((today - created) / 86400000));
}

function getPersonInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const AVATAR_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#6366F1', '#14B8A6'];

function avatarColorFromName(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h + s.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

function formatDateTimeVi(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Khoảng ngày (YYYY-MM-DD) để lọc theo created_at, dạng bucket tuần quá khứ (không chồng lấn). */
function getCreatedAtAgeRange(preset) {
  const now = new Date();
  const today = startOfDay(now);
  switch (preset) {
    case 'w0': {
      // 0–6 ngày trước (tuần hiện tại, tính theo tuổi lead)
      return { from: toIso(addDays(today, -6)), to: toIso(today) };
    }
    case 'w1': {
      // 7–13 ngày trước
      return { from: toIso(addDays(today, -13)), to: toIso(addDays(today, -7)) };
    }
    case 'w2': {
      // 14–20 ngày trước
      return { from: toIso(addDays(today, -20)), to: toIso(addDays(today, -14)) };
    }
    case 'w3': {
      // 21–27 ngày trước
      return { from: toIso(addDays(today, -27)), to: toIso(addDays(today, -21)) };
    }
    case 'w4': {
      // 28–34 ngày trước
      return { from: toIso(addDays(today, -34)), to: toIso(addDays(today, -28)) };
    }
    case 'w8plus': {
      // >= 56 ngày trước
      return { from: null, to: toIso(addDays(today, -56)) };
    }
    default:
      return { from: '', to: '' };
  }
}

const TIME_PRESETS = [
  { key: 'all', label: 'Tất cả (không lọc theo tuổi lead)' },
  { key: 'w0', label: '0–6 ngày trước' },
  { key: 'w1', label: 'Tuần 1: 7–13 ngày trước' },
  { key: 'w2', label: 'Tuần 2: 14–20 ngày trước' },
  { key: 'w3', label: 'Tuần 3: 21–27 ngày trước' },
  { key: 'w4', label: 'Tuần 4: 28–34 ngày trước' },
  { key: 'w8plus', label: '>= 8 tuần trước' },
  { key: 'custom', label: 'Tùy chỉnh ngày' },
];

export default function CrmFollowUpCarePage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const isCompanyScopedAdmin = isCrmCompanyAdmin(user);
  const [searchParams, setSearchParams] = useSearchParams();

  const [companies, setCompanies] = useState([]);
  const [filterCompany, setFilterCompany] = useState(() => {
    if (typeof window === 'undefined') return '';
    const qc = new URLSearchParams(window.location.search).get('company_id');
    if (qc) return qc;
    return getStoredCrmFilterCompanyId() || '';
  });
  const [pipelines, setPipelines] = useState([]);
  const [pipelineId, setPipelineId] = useState(() => {
    return new URLSearchParams(window.location.search).get('pipeline_id') || '';
  });
  const [stagesLead, setStagesLead] = useState([]);
  const [stagesDeal, setStagesDeal] = useState([]);
  const [pipelineType, setPipelineType] = useState(() => {
    const qt = new URLSearchParams(window.location.search).get('type');
    if (qt === 'lead' || qt === 'deal') return qt;
    try {
      const t = localStorage.getItem('crm_pinned_tab');
      return t === 'deal' ? 'deal' : 'lead';
    } catch {
      return 'lead';
    }
  });
  const [stageIds, setStageIds] = useState(() => parseStageIdsFromSearchParams(new URLSearchParams(window.location.search)));
  const [stageDropdownOpen, setStageDropdownOpen] = useState(false);
  const stageDropdownRef = useRef(null);
  const [timePreset, setTimePreset] = useState(() => {
    const qt = new URLSearchParams(window.location.search).get('time');
    return qt || 'w1';
  });
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [onlyOpenStages, setOnlyOpenStages] = useState(true);
  const [users, setUsers] = useState([]);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [sources, setSources] = useState([]);
  const [filterSourceId, setFilterSourceId] = useState('');

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(null);
  /** lead_id → mark object ({ marked_at, expires_at }) — đã chăm sóc trong 30 ngày */
  const [careMarks, setCareMarks] = useState({});
  const [careBusyId, setCareBusyId] = useState(null);
  const [stageMoveBusyId, setStageMoveBusyId] = useState(null);
  const [wonAssignModal, setWonAssignModal] = useState(false);
  const [wonAssignLeadId, setWonAssignLeadId] = useState(null);
  const [wonAssignUser, setWonAssignUser] = useState('');
  const [wonAssigning, setWonAssigning] = useState(false);
  const [wonAssignError, setWonAssignError] = useState('');
  const [wonAssignRegion, setWonAssignRegion] = useState('');
  const [wonAssignRegions, setWonAssignRegions] = useState([]);
  const [wonAssignRegionsLoading, setWonAssignRegionsLoading] = useState(false);
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [lostModalRow, setLostModalRow] = useState(null);
  const [lostModalStageId, setLostModalStageId] = useState(null);
  const [lostReason, setLostReason] = useState('');
  const [lostSubmitting, setLostSubmitting] = useState(false);
  const [lostError, setLostError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [rowMenuOpenId, setRowMenuOpenId] = useState(null);

  // Áp filter từ URL search params mỗi khi URL thay đổi (kể cả khi component đã mount sẵn,
  // ví dụ user bấm thông báo CSKH lần thứ hai). Không xóa params để giữ làm "source of truth"
  // — refresh hay copy URL vẫn lọc đúng.
  useEffect(() => {
    const qPipeline = searchParams.get('pipeline_id');
    const qStageIds = parseStageIdsFromSearchParams(searchParams);
    const qCompany = searchParams.get('company_id');
    const qTime = searchParams.get('time');
    const qType = searchParams.get('type');

    if (qType === 'lead' || qType === 'deal') setPipelineType(qType);
    if (qPipeline) setPipelineId(qPipeline);
    if (qStageIds.length) setStageIds(qStageIds);
    if (qCompany) setFilterCompany(qCompany);
    if (qTime) setTimePreset(qTime);
  }, [searchParams]);

  useEffect(() => {
    if (!stageDropdownOpen) return undefined;
    const onDocClick = (e) => {
      if (stageDropdownRef.current && !stageDropdownRef.current.contains(e.target)) {
        setStageDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [stageDropdownOpen]);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/companies', { params: { for_module: 'crm' } })
      .then((r) => setCompanies(r.data?.companies || []))
      .catch(() => setCompanies([]));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !companies.length || filterCompany) return;
    const cid = resolveDefaultCrmAdminCompanyId(companies);
    if (cid) setFilterCompany(cid);
  }, [isAdmin, companies, filterCompany]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get('/crm/pipelines');
        if (cancel) return;
        const list = Array.isArray(data) ? data : [];
        setPipelines(list);
      } catch {
        if (!cancel) setPipelines([]);
      }
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText), 400);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    let cancel = false;
    const pid = pipelineId || null;
    const base = pid ? { pipeline_id: pid } : {};
    (async () => {
      try {
        const [leadRes, dealRes] = await Promise.all([
          api.get('/crm/pipeline-stages', { params: { ...base, type: 'lead' } }),
          api.get('/crm/pipeline-stages', { params: { ...base, type: 'deal' } }),
        ]);
        if (cancel) return;
        setStagesLead(Array.isArray(leadRes.data) ? leadRes.data : []);
        setStagesDeal(Array.isArray(dealRes.data) ? dealRes.data : []);
      } catch {
        if (!cancel) {
          setStagesLead([]);
          setStagesDeal([]);
        }
      }
    })();
    return () => { cancel = true; };
  }, [pipelineId]);

  const effectiveCompanyId = useMemo(
    () => (isAdmin ? filterCompany : user?.company_id ? String(user.company_id) : ''),
    [isAdmin, filterCompany, user?.company_id],
  );

  /** Pipeline thuộc công ty đang lọc — dùng cho danh sách cột «Chuyển cột». */
  const companyPipelineIds = useMemo(() => {
    if (!effectiveCompanyId) return new Set((pipelines || []).map((p) => String(p.id)));
    return new Set(
      (pipelines || [])
        .filter((p) => String(p.company_id || '') === String(effectiveCompanyId))
        .map((p) => String(p.id)),
    );
  }, [pipelines, effectiveCompanyId]);

  const filterStagesForCompany = useCallback(
    (list) =>
      (list || [])
        .filter((s) => {
          if (pipelineId && String(s.pipeline_id || '') !== String(pipelineId)) return false;
          if (effectiveCompanyId && s.pipeline_id && !companyPipelineIds.has(String(s.pipeline_id))) return false;
          return true;
        })
        .slice()
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [pipelineId, effectiveCompanyId, companyPipelineIds],
  );

  /** Cột lọc theo tab Lead/Deal đang chọn */
  const filterStages = useMemo(
    () => filterStagesForCompany(pipelineType === 'deal' ? stagesDeal : stagesLead),
    [pipelineType, stagesLead, stagesDeal, filterStagesForCompany],
  );

  /** Cột «Chuyển cột» theo từng dòng: lead → cột lead, deal → cột deal */
  const getMoveStagesForRow = useCallback(
    (row) => filterStagesForCompany(row?.type === 'deal' ? stagesDeal : stagesLead),
    [stagesLead, stagesDeal, filterStagesForCompany],
  );

  useEffect(() => {
    if (!isAdmin || !filterCompany || !pipelines.length) return;
    const byCo = pipelines.filter((p) => String(p.company_id || '') === String(filterCompany));
    if (!byCo.length) return;
    const current = pipelineId ? pipelines.find((p) => String(p.id) === String(pipelineId)) : null;
    if (current && String(current.company_id || '') === String(filterCompany)) return;
    const def = byCo.find((p) => p.is_default) || byCo[0];
    if (def?.id) setPipelineId(String(def.id));
  }, [isAdmin, filterCompany, pipelines, pipelineId]);

  useEffect(() => {
    if (!stageIds.length || !filterStages.length) return;
    if (pipelineId && !filterStages.some((s) => String(s.pipeline_id) === String(pipelineId))) return;
    const valid = new Set(filterStages.map((s) => String(s.id)));
    const next = stageIds.filter((id) => valid.has(String(id)));
    if (next.length !== stageIds.length) setStageIds(next);
  }, [stageIds, filterStages, pipelineId]);

  useEffect(() => {
    api.get('/users').then((r) => setUsers(r.data?.users || [])).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    if (!isAdmin) setFilterAssignee((prev) => prev || (user?.id ? String(user.id) : ''));
  }, [isAdmin, user?.id]);

  useEffect(() => {
    setFilterSourceId('');
  }, [filterCompany]);

  useEffect(() => {
    let cancel = false;
    const params = {};
    if (isAdmin && filterCompany) params.company_id = filterCompany;
    api
      .get('/crm/sources', { params })
      .then((r) => {
        if (!cancel) setSources(Array.isArray(r.data?.sources) ? r.data.sources : []);
      })
      .catch(() => {
        if (!cancel) setSources([]);
      });
    return () => { cancel = true; };
  }, [isAdmin, filterCompany]);

  const buildParams = useCallback((overrides = {}) => {
    const params = {
      type: pipelineType,
      limit: 2000,
      offset: 0,
      phone_filter: 'has_phone',
      ...overrides,
    };
    if (isAdmin && filterCompany) params.company_id = filterCompany;
    const pid = overrides.pipeline_id !== undefined ? overrides.pipeline_id : pipelineId;
    if (pid) params.pipeline_id = pid;
    const stages = overrides.stage_ids !== undefined ? overrides.stage_ids : stageIds;
    if (Array.isArray(stages) && stages.length === 1) params.stage_id = stages[0];
    else if (Array.isArray(stages) && stages.length > 1) params.stage_ids = stages.join(',');
    if (isAdmin && filterAssignee) params.assigned_to = filterAssignee;
    if (filterSourceId) params.source_id = filterSourceId;
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

    if (timePreset === 'custom') {
      const df = customFrom && /^\d{4}-\d{2}-\d{2}$/.test(customFrom) ? customFrom : null;
      const dt = customTo && /^\d{4}-\d{2}-\d{2}$/.test(customTo) ? customTo : null;
      if (df) params.date_from = df;
      if (dt) params.date_to = dt;
    } else if (timePreset !== 'all') {
      const r = getCreatedAtAgeRange(timePreset);
      if (r.from) params.date_from = r.from;
      if (r.to) params.date_to = r.to;
    }

    return params;
  }, [
    pipelineType,
    isAdmin,
    filterCompany,
    pipelineId,
    stageIds,
    filterAssignee,
    filterSourceId,
    debouncedSearch,
    timePreset,
    customFrom,
    customTo,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/crm/leads', { params: buildParams() });
      setLeads(data?.data || []);
      setTotal(typeof data?.total === 'number' ? data.total : (data?.data || []).length);
    } catch (e) {
      console.error(e);
      setLeads([]);
      setTotal(0);
    }
    setLoading(false);
  }, [buildParams]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sau khi load lead xong, lấy danh sách dấu tích "đã chăm sóc" của user hiện tại cho các lead này.
  useEffect(() => {
    if (!leads.length) {
      setCareMarks({});
      return;
    }
    let cancel = false;
    const ids = leads.map((l) => l.id).filter(Boolean).join(',');
    api
      .get('/crm/lead-care-marks', { params: { lead_ids: ids } })
      .then((r) => {
        if (cancel) return;
        const map = {};
        (r.data?.marks || []).forEach((m) => {
          map[m.lead_id] = m;
        });
        setCareMarks(map);
      })
      .catch(() => {
        if (!cancel) setCareMarks({});
      });
    return () => { cancel = true; };
  }, [leads]);

  const applyStageChangeOnRow = useCallback((row, newStageId, target, data) => {
    const nextStage = data?.stage || target;
    setLeads((prev) =>
      prev.map((l) =>
        String(l.id) === String(row.id)
          ? {
              ...l,
              stage_id: newStageId,
              stage: nextStage,
              stage_entered_at: data?.stage_entered_at || l.stage_entered_at,
              ...(data?.type ? { type: data.type } : {}),
              ...(data?.lost_reason !== undefined ? { lost_reason: data.lost_reason } : {}),
            }
          : l,
      ),
    );
  }, []);

  const moveLeadToStage = useCallback(
    async (row, newStageId) => {
      if (!row?.id || !newStageId || stageMoveBusyId) return;
      if (String(row.stage_id || '') === String(newStageId)) return;

      const rowMoveStages = getMoveStagesForRow(row);
      const target = rowMoveStages.find((s) => String(s.id) === String(newStageId));
      if (!target) return;

      const rowType = row.type === 'deal' ? 'deal' : 'lead';

      if (target.is_won && rowType === 'lead') {
        setWonAssignLeadId(row.id);
        setWonAssignUser(row.assigned_to || row.lead_owner_id || filterAssignee || user?.id || '');
        setWonAssignRegion(row.region_id ? String(row.region_id) : '');
        setWonAssignError('');
        setWonAssignModal(true);
        return;
      }

      if (target.is_lost) {
        setLostModalRow(row);
        setLostModalStageId(newStageId);
        setLostReason(row.lost_reason?.trim() || '');
        setLostError('');
        setLostModalOpen(true);
        return;
      }

      if (
        target.is_won &&
        rowType === 'deal' &&
        !row.project_id &&
        !window.confirm('Chuyển deal sang cột Thắng? Nếu chưa có dự án SX, hệ thống có thể yêu cầu chọn xưởng trên Kanban CRM.')
      ) {
        return;
      }

      setStageMoveBusyId(row.id);
      try {
        const { data } = await api.patch(`/crm/leads/${encodeURIComponent(row.id)}/stage`, {
          stage_id: newStageId,
        });
        if (data?.requires_conversion) {
          setWonAssignLeadId(row.id);
          setWonAssignUser(row.assigned_to || row.lead_owner_id || filterAssignee || user?.id || '');
          setWonAssignRegion(row.region_id ? String(row.region_id) : '');
          setWonAssignError('');
          setWonAssignModal(true);
          return;
        }
        if (data?.requires_production_company) {
          alert('Cần chọn công ty sản xuất — chuyển trên Kanban CRM hoặc trang chi tiết deal.');
          return;
        }
        applyStageChangeOnRow(row, newStageId, target, data);
      } catch (e) {
        alert(e.response?.data?.error || e.message || 'Không chuyển được cột');
      } finally {
        setStageMoveBusyId(null);
      }
    },
    [getMoveStagesForRow, stageMoveBusyId, applyStageChangeOnRow, filterAssignee, user?.id],
  );

  const closeLostModal = useCallback(() => {
    if (lostSubmitting) return;
    setLostModalOpen(false);
    setLostModalRow(null);
    setLostModalStageId(null);
    setLostReason('');
    setLostError('');
  }, [lostSubmitting]);

  const confirmLostStageMove = useCallback(async () => {
    const reason = lostReason.trim();
    if (!reason) {
      setLostError('Vui lòng nhập lý do thua / mất');
      return;
    }
    const row = lostModalRow;
    const newStageId = lostModalStageId;
    if (!row?.id || !newStageId) return;

    const target = getMoveStagesForRow(row).find((s) => String(s.id) === String(newStageId));
    if (!target) return;

    setLostSubmitting(true);
    setLostError('');
    setStageMoveBusyId(row.id);
    try {
      const { data } = await api.patch(`/crm/leads/${encodeURIComponent(row.id)}/stage`, {
        stage_id: newStageId,
        lost_reason: reason,
      });
      if (data?.requires_conversion) {
        closeLostModal();
        setWonAssignLeadId(row.id);
        setWonAssignUser(row.assigned_to || row.lead_owner_id || filterAssignee || user?.id || '');
        setWonAssignRegion(row.region_id ? String(row.region_id) : '');
        setWonAssignError('');
        setWonAssignModal(true);
        return;
      }
      if (data?.requires_production_company) {
        alert('Deal cần chọn công ty sản xuất — hãy chuyển trên Kanban CRM hoặc trang chi tiết deal.');
        return;
      }
      applyStageChangeOnRow(row, newStageId, target, { ...data, lost_reason: data?.lost_reason ?? reason });
      closeLostModal();
    } catch (e) {
      setLostError(e.response?.data?.error || e.message || 'Không chuyển được cột');
    } finally {
      setLostSubmitting(false);
      setStageMoveBusyId(null);
    }
  }, [
    lostReason,
    lostModalRow,
    lostModalStageId,
    getMoveStagesForRow,
    applyStageChangeOnRow,
    closeLostModal,
    filterAssignee,
    user?.id,
  ]);

  const handleWonAssignConvert = useCallback(async () => {
    if (!wonAssignUser) {
      setWonAssignError('Vui lòng chọn nhân viên phụ trách deal');
      return;
    }
    if (!wonAssignRegion) {
      setWonAssignError('Vui lòng chọn khu vực');
      return;
    }
    const lead = leads.find((l) => String(l.id) === String(wonAssignLeadId));
    if (!lead) return;
    setWonAssigning(true);
    setWonAssignError('');
    try {
      await api.post(`/crm/leads/${encodeURIComponent(wonAssignLeadId)}/convert-to-deal`, {
        assigned_to: wonAssignUser,
        company_id: lead.company_id || effectiveCompanyId || undefined,
        region_id: wonAssignRegion,
      });
      setWonAssignModal(false);
      setWonAssignLeadId(null);
      setLeads((prev) => prev.filter((l) => String(l.id) !== String(wonAssignLeadId)));
      void load();
    } catch (e) {
      setWonAssignError(e.response?.data?.error || 'Lỗi chuyển sang Deal');
    } finally {
      setWonAssigning(false);
    }
  }, [wonAssignUser, wonAssignRegion, wonAssignLeadId, leads, effectiveCompanyId, load]);

  /** Tải danh sách khu vực CRM cho modal "Chuyển sang Deal" theo công ty của lead. */
  useEffect(() => {
    if (!wonAssignModal || !wonAssignLeadId) return undefined;
    const lead = leads.find((l) => String(l.id) === String(wonAssignLeadId));
    const cid = lead?.company_id ? String(lead.company_id) : (effectiveCompanyId ? String(effectiveCompanyId) : '');
    if (!cid) {
      setWonAssignRegions([]);
      return undefined;
    }
    let cancel = false;
    setWonAssignRegionsLoading(true);
    api
      .get('/crm/company-regions', { params: { company_id: cid, for_module: 'crm' } })
      .then((r) => {
        if (cancel) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setWonAssignRegions(list.filter((x) => x.is_active !== false));
      })
      .catch(() => {
        if (!cancel) setWonAssignRegions([]);
      })
      .finally(() => {
        if (!cancel) setWonAssignRegionsLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [wonAssignModal, wonAssignLeadId, leads, effectiveCompanyId]);

  const toggleCareMark = useCallback(async (leadId) => {
    if (!leadId || careBusyId) return;
    setCareBusyId(leadId);
    const isMarked = !!careMarks[leadId];
    try {
      if (isMarked) {
        await api.delete(`/crm/leads/${encodeURIComponent(leadId)}/care-mark`);
        setCareMarks((prev) => {
          const next = { ...prev };
          delete next[leadId];
          return next;
        });
      } else {
        const { data } = await api.post(`/crm/leads/${encodeURIComponent(leadId)}/care-mark`);
        setCareMarks((prev) => ({
          ...prev,
          [leadId]: data?.mark || { marked_at: new Date().toISOString() },
        }));
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi cập nhật dấu chăm sóc');
    } finally {
      setCareBusyId(null);
    }
  }, [careMarks, careBusyId]);

  const filtered = useMemo(() => {
    let rows = leads;
    if (onlyOpenStages) {
      rows = rows.filter((l) => {
        const st = l.stage;
        return !st?.is_won && !st?.is_lost;
      });
    }
    return rows;
  }, [leads, onlyOpenStages]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [
    debouncedSearch,
    timePreset,
    customFrom,
    customTo,
    pipelineType,
    pipelineId,
    stageIds.join(','),
    filterAssignee,
    filterSourceId,
    filterCompany,
    onlyOpenStages,
  ]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / pageSize)),
    [filtered.length, pageSize],
  );

  const safePage = Math.min(page, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const pageSelectedCount = useMemo(
    () => paginatedRows.filter((r) => selectedIds.has(String(r.id))).length,
    [paginatedRows, selectedIds],
  );

  const toggleSelectAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = paginatedRows.every((r) => next.has(String(r.id)));
      paginatedRows.forEach((r) => {
        const id = String(r.id);
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }, [paginatedRows]);

  const toggleSelectRow = useCallback((id) => {
    const sid = String(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }, []);

  const overdueCount = useMemo(() => {
    const t0 = startOfDay(new Date()).getTime();
    return filtered.filter((l) => {
      if (!l.next_follow_up) return false;
      return new Date(l.next_follow_up).getTime() < t0;
    }).length;
  }, [filtered]);

  const toggleStageId = useCallback((id) => {
    const sid = String(id);
    setStageIds((prev) => {
      if (prev.some((x) => String(x) === sid)) return prev.filter((x) => String(x) !== sid);
      return [...prev, sid];
    });
  }, []);

  /** Các cột sẽ xuất Excel — mỗi cột = 1 sheet. */
  const stagesForExport = useMemo(() => {
    const all = filterStages.slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    if (!stageIds.length) return all;
    const picked = new Set(stageIds.map(String));
    return all.filter((s) => picked.has(String(s.id)));
  }, [filterStages, stageIds]);

  const rowToExcelRow = useCallback((row, careMarkMap) => {
    const st = row.stage;
    const assignee = row.assignee || row.lead_owner;
    const phone = row.display_phone || row.customer?.phone || row.phone;
    const src = row.source;
    const nf = row.next_follow_up;
    const nfMs = nf ? new Date(nf).getTime() : null;
    const today0 = startOfDay(new Date()).getTime();
    const overdue = nfMs != null && nfMs < today0;
    const mark = careMarkMap[row.id];
    return {
      'Loại': row.type === 'deal' ? 'Deal' : 'Lead',
      'Mã': row.code || '',
      'Tiêu đề': row.title || '',
      'Khách hàng': row.customer?.full_name || '',
      'Nguồn': src?.name || '',
      'SĐT': phone || '',
      'Cột pipeline': st ? `${st.icon ? `${st.icon} ` : ''}${st.name}` : '',
      'Tuổi lead (ngày)': getLeadAgeDays(row.created_at) ?? '',
      'Cập nhật cuối': formatDateTimeVi(row.updated_at || row.stage_entered_at || row.created_at),
      'Theo dõi tiếp': nf ? formatDate(nf) + (overdue ? ' (quá hạn)' : '') : 'Chưa hẹn',
      'Phụ trách': assignee?.full_name || '',
      'Đã CSKH': mark ? 'Có' : 'Không',
      'Ngày tạo': row.created_at ? formatDate(row.created_at) : '',
      'Lý do mất': row.lost_reason || '',
    };
  }, []);

  const exportExcel = useCallback(async () => {
    if (!stageIds.length) {
      alert('Vui lòng chọn ít nhất một cột giai đoạn trước khi xuất Excel (mỗi cột = 1 sheet).');
      return;
    }
    if (!stagesForExport.length) {
      alert('Không tìm thấy cột đã chọn — thử chọn lại pipeline hoặc loại Lead/Deal.');
      return;
    }
    setExporting(true);
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.utils.book_new();
      const usedSheetNames = new Set();

      for (const stage of stagesForExport) {
        const params = buildParams({
          pipeline_id: stage.pipeline_id || pipelineId || undefined,
          stage_ids: [String(stage.id)],
        });

        const { data } = await api.get('/crm/leads', { params });
        let rows = data?.data || [];
        if (onlyOpenStages) {
          rows = rows.filter((l) => {
            const st = l.stage;
            return !st?.is_won && !st?.is_lost;
          });
        }

        const sheetData = rows.length
          ? rows.map((row) => rowToExcelRow(row, careMarks))
          : [{
              'Loại': '',
              'Mã': '',
              'Tiêu đề': '(Không có lead/deal trong cột này)',
              'Khách hàng': '',
              'Nguồn': '',
              'SĐT': '',
              'Cột pipeline': stage.name || '',
              'Theo dõi tiếp': '',
              'Phụ trách': '',
              'Đã CSKH': '',
              'Ngày tạo': '',
              'Lý do mất': '',
            }];

        let baseName = sanitizeExcelSheetName(stage.name || 'Cot');
        let sheetName = baseName;
        let n = 2;
        while (usedSheetNames.has(sheetName)) {
          const suffix = ` ${n}`;
          sheetName = sanitizeExcelSheetName(`${baseName.slice(0, 31 - suffix.length)}${suffix}`);
          n += 1;
        }
        usedSheetNames.add(sheetName);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetData), sheetName);
      }

      const dateStamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `CSKH_${dateStamp}.xlsx`);
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.error || e.message || 'Lỗi xuất Excel');
    } finally {
      setExporting(false);
    }
  }, [
    stagesForExport,
    stageIds.length,
    pipelineId,
    buildParams,
    onlyOpenStages,
    rowToExcelRow,
    careMarks,
  ]);

  useEffect(() => {
    if (!rowMenuOpenId) return undefined;
    const onDoc = (e) => {
      if (!e.target.closest('[data-row-menu]')) setRowMenuOpenId(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [rowMenuOpenId]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const nums = new Set([1, totalPages, safePage, safePage - 1, safePage + 1]);
    return [...nums].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  }, [totalPages, safePage]);

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto px-3 sm:px-4 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarClock className="h-7 w-7 text-emerald-600 shrink-0" />
            CSKH — Lead theo tuổi & pipeline
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={exporting || loading}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Xuất Excel — mỗi cột giai đoạn đã chọn = 1 sheet"
          >
            <Download className={`h-4 w-4 ${exporting ? 'animate-pulse' : ''}`} />
            {exporting ? 'Đang xuất…' : 'Xuất Excel'}
          </button>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 cursor-pointer shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/80">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <Filter className="h-4 w-4" /> Bộ lọc
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-900 cursor-pointer"
          >
            {showFilters ? (
              <>
                Thu gọn
                <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Mở rộng
                <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {isAdmin && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Công ty</span>
              <select
                value={filterCompany}
                onChange={(e) => {
                  setFilterCompany(e.target.value);
                  setPipelineId('');
                  setStageIds([]);
                }}
                className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
              >
                <option value="">Tất cả</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 flex items-center gap-1"><Target className="h-3.5 w-3.5" /> Loại pipeline</span>
            <select
              value={pipelineType}
              onChange={(e) => {
                setPipelineType(e.target.value);
                setStageIds([]);
              }}
              className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="lead">Lead</option>
              <option value="deal">Deal</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> Pipeline CRM</span>
            <select
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="">Mặc định / tất cả (theo quyền)</option>
              {(filterCompany ? pipelines.filter((p) => String(p.company_id) === String(filterCompany)) : pipelines).map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' ★' : ''}</option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1" ref={stageDropdownRef}>
            <span className="text-xs text-gray-500">Cột giai đoạn</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setStageDropdownOpen((o) => !o)}
                className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white flex items-center justify-between gap-2 hover:border-emerald-400 cursor-pointer"
              >
                <span className="truncate text-left">
                  {stageIds.length === 0
                    ? 'Tất cả cột'
                    : `${stageIds.length} cột đã chọn`}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${stageDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {stageDropdownOpen && (
                <div className="absolute z-30 mt-1 w-full min-w-[14rem] max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
                  {filterStages.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-500">Chưa có cột — chọn pipeline CRM.</p>
                  ) : (
                    <>
                      <div className="px-2 py-1 border-b border-gray-100 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setStageIds(filterStages.map((s) => String(s.id)))}
                          className="text-[11px] text-emerald-700 hover:underline cursor-pointer"
                        >
                          Chọn tất cả
                        </button>
                        <button
                          type="button"
                          onClick={() => setStageIds([])}
                          className="text-[11px] text-gray-500 hover:underline cursor-pointer"
                        >
                          Bỏ chọn
                        </button>
                      </div>
                      {filterStages.map((s) => {
                        const checked = stageIds.some((id) => String(id) === String(s.id));
                        return (
                          <label
                            key={s.id}
                            className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-emerald-50 ${checked ? 'bg-emerald-50/60' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleStageId(s.id)}
                              className="rounded border-gray-300 accent-emerald-600"
                            />
                            <span className="truncate">
                              {s.icon ? `${s.icon} ` : ''}{s.name}
                            </span>
                          </label>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Tuổi lead</span>
            <select
              value={timePreset}
              onChange={(e) => setTimePreset(e.target.value)}
              className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
            >
              {TIME_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </label>

          {isAdmin && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 flex items-center gap-1"><User className="h-3.5 w-3.5" /> NV phụ trách</span>
              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
              >
                <option value="">Tất cả</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 flex items-center gap-1"><Tag className="h-3.5 w-3.5" /> Nguồn khách hàng</span>
            <select
              value={filterSourceId}
              onChange={(e) => setFilterSourceId(e.target.value)}
              className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="">Tất cả nguồn</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {(s.icon ? `${s.icon} ` : '')}{s.name || s.id}
                </option>
              ))}
            </select>
          </label>
        </div>

        {timePreset === 'custom' && (
          <div className="flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={() => setShowDateRangePicker(true)}
              className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm hover:bg-gray-50 cursor-pointer"
              title="Chọn ngày bắt đầu/kết thúc"
            >
              {customFrom && customTo ? `${customFrom} → ${customTo}` : 'Phạm vi tuỳ chỉnh'}
            </button>
          </div>
        )}

        <DateRangePickerPopover
          open={showDateRangePicker}
          title="Phạm vi tuỳ chỉnh"
          from={customFrom}
          to={customTo}
          onChange={({ from, to }) => {
            setCustomFrom(from);
            setCustomTo(to);
          }}
          onClose={() => setShowDateRangePicker(false)}
        />

        <div className="space-y-3">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Tìm mã, tiêu đề, SĐT, email, khách hàng…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm"
            />
          </div>
          <div className="flex justify-end">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyOpenStages}
                onChange={(e) => setOnlyOpenStages(e.target.checked)}
                className="rounded border-gray-300 accent-violet-600"
              />
              Ẩn lead/deal đã chốt hoặc thua
            </label>
          </div>
        </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-gray-600">
          Hiển thị <strong>{filtered.length}</strong>
          {total != null && ` / tổng server ${total}`} lead/deal
        </span>
        {onlyOpenStages && overdueCount > 0 && (
          <span className="inline-flex items-center gap-1 text-red-600 font-medium">
            <AlertTriangle className="h-4 w-4" />
            {overdueCount} quá hạn trong danh sách
          </span>
        )}
        {filtered.some((l) => careMarks[l.id]) && (
          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {filtered.filter((l) => careMarks[l.id]).length} đã chăm sóc
          </span>
        )}
        {(stagesLead.length === 0 && stagesDeal.length === 0) && (
          <span className="text-amber-700 text-xs">
            Chưa có danh sách cột để chuyển — chọn pipeline CRM (và công ty nếu là admin).
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin h-10 w-10 border-3 border-emerald-600 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-gray-500">
          Không có lead/deal khớp bộ lọc. Thử nới «Khung thời gian» hoặc bỏ cột pipeline.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 280px)', minHeight: '420px' }}>
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide sticky top-0 z-10 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={paginatedRows.length > 0 && pageSelectedCount === paginatedRows.length}
                      onChange={toggleSelectAllOnPage}
                      className="rounded border-gray-300 accent-violet-600"
                      aria-label="Chọn tất cả trang"
                    />
                  </th>
                  <th className="px-3 py-3 text-center w-16">CSKH</th>
                  <th className="px-3 py-3 min-w-[14rem]">Lead / Deal</th>
                  <th className="px-3 py-3 min-w-[12rem]">Khách hàng</th>
                  <th className="px-3 py-3">Nguồn</th>
                  <th className="px-3 py-3 min-w-[10rem]">NV phụ trách</th>
                  <th className="px-3 py-3">Giai đoạn</th>
                  <th className="px-3 py-3">Tuổi lead</th>
                  <th className="px-3 py-3 whitespace-nowrap">Cập nhật cuối</th>
                  <th className="px-3 py-3 w-10">
                    <Settings className="h-4 w-4 text-gray-400 mx-auto" aria-hidden />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRows.map((row) => {
                  const st = row.stage;
                  const assignee = row.assignee || row.lead_owner;
                  const assigneeName = assignee?.full_name || assignee?.email || '';
                  const src = row.source;
                  const mark = careMarks[row.id];
                  const isMarked = !!mark;
                  const busy = careBusyId === row.id;
                  const moving = stageMoveBusyId === row.id;
                  const rowMoveStages = getMoveStagesForRow(row);
                  const moveDisabled = moving || rowMoveStages.length === 0;
                  const rowTypeLabel = row.type === 'deal' ? 'DEAL' : 'LEAD';
                  const leadAge = getLeadAgeDays(row.created_at);
                  const lastUpdate = row.updated_at || row.stage_entered_at || row.created_at;
                  const initials = getPersonInitials(assigneeName);
                  const avatarColor = avatarColorFromName(assigneeName || row.id);
                  const isSelected = selectedIds.has(String(row.id));
                  const sourceLabel = src?.name || '';
                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-violet-50/30 ${isMarked ? 'bg-emerald-50/40' : ''} ${isSelected ? 'bg-violet-50/50' : ''}`}
                    >
                      <td className="px-3 py-3 align-middle">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(row.id)}
                          className="rounded border-gray-300 accent-violet-600"
                          aria-label={`Chọn ${row.code || row.title}`}
                        />
                      </td>
                      <td className="px-3 py-3 align-middle text-center">
                        <button
                          type="button"
                          onClick={() => toggleCareMark(row.id)}
                          disabled={busy}
                          className={`w-9 h-9 rounded-full inline-flex items-center justify-center text-[11px] font-bold text-white shadow-sm transition-all cursor-pointer ${
                            isMarked ? 'ring-2 ring-emerald-500 ring-offset-1' : 'hover:scale-105'
                          } ${busy ? 'opacity-50 cursor-wait' : ''}`}
                          style={{ backgroundColor: avatarColor }}
                          title={
                            isMarked
                              ? `Đã chăm sóc${mark?.marked_at ? ` lúc ${formatDate(mark.marked_at)}` : ''} — bấm để bỏ`
                              : `${assigneeName || 'Chưa có NV'} — đánh dấu đã CSKH`
                          }
                        >
                          {initials}
                        </button>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                row.type === 'deal' ? 'bg-cyan-100 text-cyan-800' : 'bg-violet-100 text-violet-800'
                              }`}
                            >
                              {rowTypeLabel}
                            </span>
                            <Link
                              to={`/crm/leads/${row.id}`}
                              className="font-semibold text-gray-900 hover:text-violet-700 hover:underline"
                            >
                              {row.code || row.title}
                            </Link>
                          </div>
                          <p className="text-xs text-gray-600 line-clamp-2">
                            {sourceLabel ? `[${sourceLabel}] ` : ''}
                            {row.title}
                            {row.customer?.full_name ? ` · ${row.customer.full_name}` : ''}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className="inline-flex items-start gap-1.5 text-gray-800">
                          <Building2 className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{row.customer?.full_name || row.customer?.company_name || '—'}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top text-gray-700">
                        {src ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            {src.icon ? <span aria-hidden>{src.icon}</span> : null}
                            {src.name || '—'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        {assigneeName ? (
                          <span className="inline-flex items-center gap-2 text-gray-800">
                            <span
                              className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                              style={{ backgroundColor: avatarColor }}
                            >
                              {initials}
                            </span>
                            <span className="text-sm">{assigneeName}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        {st ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-gray-800">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: st.color || '#64748b' }}
                            />
                            {st.name}
                          </span>
                        ) : (
                          '—'
                        )}
                        {row.lost_reason && (
                          <p className="mt-1 text-[11px] text-red-600 line-clamp-2" title={row.lost_reason}>
                            {row.lost_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        {leadAge != null ? (
                          <span className="font-semibold text-amber-600">{leadAge} ngày</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-3 align-top whitespace-nowrap text-gray-700 text-xs">
                        {formatDateTimeVi(lastUpdate)}
                      </td>
                      <td className="px-3 py-3 align-middle relative" data-row-menu>
                        <button
                          type="button"
                          onClick={() => setRowMenuOpenId((id) => (id === row.id ? null : row.id))}
                          className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-gray-500 hover:bg-gray-100 cursor-pointer"
                          aria-label="Thao tác"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {rowMenuOpenId === row.id && (
                          <div className="absolute right-2 top-full z-30 mt-1 w-52 rounded-xl border border-gray-200 bg-white shadow-lg py-1 text-sm">
                            <Link
                              to={`/crm/leads/${row.id}`}
                              className="block px-3 py-2 text-gray-800 hover:bg-violet-50"
                              onClick={() => setRowMenuOpenId(null)}
                            >
                              Xem chi tiết
                            </Link>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-gray-800 hover:bg-violet-50 cursor-pointer"
                              onClick={() => {
                                setRowMenuOpenId(null);
                                void toggleCareMark(row.id);
                              }}
                            >
                              {isMarked ? 'Bỏ đánh dấu CSKH' : 'Đánh dấu đã CSKH'}
                            </button>
                            <div className="border-t border-gray-100 my-1 px-3 py-2">
                              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Chuyển giai đoạn</p>
                              <select
                                value={String(row.stage_id || '')}
                                disabled={moveDisabled}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v && v !== String(row.stage_id || '')) {
                                    setRowMenuOpenId(null);
                                    moveLeadToStage(row, v);
                                  }
                                }}
                                className="w-full h-8 px-2 rounded-lg border border-gray-200 text-xs bg-white"
                              >
                                <option value={row.stage_id || ''}>
                                  {st ? st.name : '— Chọn cột —'}
                                </option>
                                {rowMoveStages
                                  .filter((s) => String(s.id) !== String(row.stage_id || ''))
                                  .map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                      {s.is_won ? ' · Thắng' : ''}
                                      {s.is_lost ? ' · Mất' : ''}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/50">
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 px-2 rounded-lg border border-gray-200 bg-white text-sm"
              >
                {[20, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span>/ trang</span>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="min-w-8 h-8 px-2 rounded-lg border border-gray-200 bg-white text-sm disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-gray-50"
              >
                ‹
              </button>
              {pageNumbers.map((n, idx) => {
                const prev = pageNumbers[idx - 1];
                const showEllipsis = prev != null && n - prev > 1;
                return (
                  <span key={n} className="inline-flex items-center gap-1">
                    {showEllipsis && <span className="px-1 text-gray-400">…</span>}
                    <button
                      type="button"
                      onClick={() => setPage(n)}
                      className={`min-w-8 h-8 px-2 rounded-lg text-sm cursor-pointer ${
                        n === safePage
                          ? 'bg-violet-600 text-white font-medium'
                          : 'border border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      {n}
                    </button>
                  </span>
                );
              })}
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="min-w-8 h-8 px-2 rounded-lg border border-gray-200 bg-white text-sm disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-gray-50"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      )}

      {isCompanyScopedAdmin && (
        <p className="text-xs text-gray-500">
          Admin công ty: dữ liệu giới hạn theo phạm vi API (công ty / khu vực đã cấu hình).
        </p>
      )}

      {lostModalOpen && lostModalRow && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={closeLostModal}
        >
          <div
            className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-1">❌ Lý do thua / mất</h3>
            <p className="text-xs text-gray-500 mb-3 truncate">
              {lostModalRow.code ? `${lostModalRow.code} · ` : ''}{lostModalRow.title}
            </p>
            <textarea
              className="w-full border border-gray-200 rounded-lg p-3 text-sm min-h-[100px] focus:ring-2 focus:ring-red-300 focus:border-red-400"
              placeholder="Nhập lý do (giá cao, đối thủ, KH hủy…)"
              value={lostReason}
              onChange={(e) => {
                setLostReason(e.target.value);
                setLostError('');
              }}
              autoFocus
              disabled={lostSubmitting}
            />
            {lostError && (
              <p className="mt-2 text-xs text-red-600">{lostError}</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={closeLostModal}
                disabled={lostSubmitting}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void confirmLostStageMove()}
                disabled={lostSubmitting || !lostReason.trim()}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
              >
                {lostSubmitting ? 'Đang lưu…' : 'Xác nhận chuyển mất'}
              </button>
            </div>
          </div>
        </div>
      )}

      {wonAssignModal && (() => {
        const wonLead = leads.find((l) => String(l.id) === String(wonAssignLeadId));
        return (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
            onClick={() => {
              if (!wonAssigning) {
                setWonAssignModal(false);
                setWonAssignError('');
              }
            }}
          >
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-2xl">🏆</span>
                <h3 className="text-base font-bold text-gray-900">Chuyển sang Deal</h3>
              </div>

              {wonLead && (
                <div className="bg-gray-50 rounded-xl px-3 py-2 mb-4 mt-2">
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Lead:</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{wonLead.title}</p>
                  {wonLead.customer?.full_name && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      👤 {wonLead.customer.full_name}
                      {wonLead.customer.phone && (
                        <span className="ml-2 text-green-600">📞 {wonLead.customer.phone}</span>
                      )}
                      {!wonLead.customer.phone && (
                        <span className="ml-2 text-amber-500">⚠️ Chưa có SĐT</span>
                      )}
                    </p>
                  )}
                  {!wonLead.customer_id && (
                    <p className="text-xs text-red-500 mt-0.5 font-medium">
                      ⛔ Chưa liên kết khách hàng — cần vào chi tiết Lead để thêm trước
                    </p>
                  )}
                </div>
              )}

              <div className="mb-3">
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                  📍 Khu vực <span className="text-red-500">*</span>
                </label>
                <select
                  value={wonAssignRegion}
                  onChange={(e) => {
                    setWonAssignRegion(e.target.value);
                    setWonAssignError('');
                  }}
                  disabled={!wonLead?.company_id || wonAssignRegionsLoading || wonAssignRegions.length === 0}
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="">
                    {!wonLead?.company_id
                      ? '— Lead chưa có công ty —'
                      : wonAssignRegionsLoading
                        ? 'Đang tải khu vực…'
                        : wonAssignRegions.length === 0
                          ? '— Công ty chưa có khu vực —'
                          : '— Chọn khu vực —'}
                  </option>
                  {wonAssignRegions.map((reg) => (
                    <option key={reg.id} value={reg.id}>{reg.name}</option>
                  ))}
                </select>
                {wonLead?.company_id && !wonAssignRegionsLoading && wonAssignRegions.length === 0 && (
                  <p className="text-[10px] text-amber-500 mt-1">⚠️ Công ty chưa có khu vực — vào CRM/Khu vực để thêm trước</p>
                )}
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">👤 Người phụ trách deal</label>
                <EmployeePicker
                  companyId={wonLead?.company_id}
                  value={wonAssignUser}
                  onChange={(userId) => {
                    setWonAssignUser(userId || '');
                    setWonAssignError('');
                  }}
                  placeholder="Tìm và chọn nhân viên..."
                  size="md"
                />
                {!wonLead?.company_id && (
                  <p className="text-[10px] text-amber-500 mt-1">⚠️ Lead chưa có công ty — hiển thị toàn bộ nhân viên</p>
                )}
              </div>

              {wonAssignError && (
                <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  ⛔ {wonAssignError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setWonAssignModal(false);
                    setWonAssignError('');
                  }}
                  disabled={wonAssigning}
                  className="flex-1 h-10 border rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => void handleWonAssignConvert()}
                  disabled={wonAssigning || !wonAssignUser || !wonAssignRegion || !wonLead?.customer_id}
                  className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {wonAssigning ? (
                    <>
                      <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      Đang xử lý...
                    </>
                  ) : (
                    <>✅ Xác nhận & Chuyển Deal</>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
