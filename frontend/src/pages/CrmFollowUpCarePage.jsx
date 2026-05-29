import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { formatDate } from '../lib/utils';
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
  Phone,
  User,
  Layers,
  AlertTriangle,
  RefreshCw,
  Building2,
  Target,
  Filter,
  Tag,
  CheckCircle2,
  Circle,
  ArrowRightCircle,
} from 'lucide-react';

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
  const [stageId, setStageId] = useState(() => {
    return new URLSearchParams(window.location.search).get('stage_id') || '';
  });
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
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [lostModalRow, setLostModalRow] = useState(null);
  const [lostModalStageId, setLostModalStageId] = useState(null);
  const [lostReason, setLostReason] = useState('');
  const [lostSubmitting, setLostSubmitting] = useState(false);
  const [lostError, setLostError] = useState('');

  // Áp filter từ URL search params mỗi khi URL thay đổi (kể cả khi component đã mount sẵn,
  // ví dụ user bấm thông báo CSKH lần thứ hai). Không xóa params để giữ làm "source of truth"
  // — refresh hay copy URL vẫn lọc đúng.
  useEffect(() => {
    const qPipeline = searchParams.get('pipeline_id');
    const qStage = searchParams.get('stage_id');
    const qCompany = searchParams.get('company_id');
    const qTime = searchParams.get('time');
    const qType = searchParams.get('type');

    if (qType === 'lead' || qType === 'deal') setPipelineType(qType);
    if (qPipeline) setPipelineId(qPipeline);
    if (qStage) setStageId(qStage);
    if (qCompany) setFilterCompany(qCompany);
    if (qTime) setTimePreset(qTime);
  }, [searchParams]);

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
    if (!stageId || !filterStages.length) return;
    if (pipelineId && !filterStages.some((s) => String(s.pipeline_id) === String(pipelineId))) return;
    const ok = filterStages.some((s) => String(s.id) === String(stageId));
    if (!ok) setStageId('');
  }, [stageId, filterStages, pipelineId]);

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

  const buildParams = useCallback(() => {
    const params = {
      type: pipelineType,
      limit: 2000,
      offset: 0,
      phone_filter: 'has_phone',
    };
    if (isAdmin && filterCompany) params.company_id = filterCompany;
    if (pipelineId) params.pipeline_id = pipelineId;
    if (stageId) params.stage_id = stageId;
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
    stageId,
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
    const lead = leads.find((l) => String(l.id) === String(wonAssignLeadId));
    if (!lead) return;
    setWonAssigning(true);
    setWonAssignError('');
    try {
      await api.post(`/crm/leads/${encodeURIComponent(wonAssignLeadId)}/convert-to-deal`, {
        assigned_to: wonAssignUser,
        company_id: lead.company_id || effectiveCompanyId || undefined,
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
  }, [wonAssignUser, wonAssignLeadId, leads, effectiveCompanyId, load]);

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

  const overdueCount = useMemo(() => {
    const t0 = startOfDay(new Date()).getTime();
    return filtered.filter((l) => {
      if (!l.next_follow_up) return false;
      return new Date(l.next_follow_up).getTime() < t0;
    }).length;
  }, [filtered]);

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto px-3 sm:px-4 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarClock className="h-7 w-7 text-emerald-600 shrink-0" />
            CSKH — Lead theo tuổi & pipeline
          </h1>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 cursor-pointer shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <Filter className="h-4 w-4" /> Bộ lọc
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {isAdmin && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Công ty</span>
              <select
                value={filterCompany}
                onChange={(e) => {
                  setFilterCompany(e.target.value);
                  setPipelineId('');
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
                setStageId('');
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

          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Cột giai đoạn</span>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="">Tất cả cột</option>
              {filterStages.map((s) => (
                <option key={s.id} value={s.id}>{s.icon ? `${s.icon} ` : ''}{s.name}</option>
              ))}
            </select>
          </label>

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

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Tìm mã, tiêu đề, SĐT…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyOpenStages}
              onChange={(e) => setOnlyOpenStages(e.target.checked)}
              className="rounded border-gray-300"
            />
            Ẩn lead/deal đã chốt hoặc thua
          </label>
        </div>
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
        <div
          className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-auto"
          style={{ maxHeight: 'calc(100vh - 180px)', minHeight: '70vh' }}
        >
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-3 py-2.5 text-center" title="Đã chăm sóc — ẩn nhắc 30 ngày">CSKH</th>
                <th className="px-3 py-2.5">Lead / Deal</th>
                <th className="px-3 py-2.5">Khách</th>
                <th className="px-3 py-2.5">Nguồn</th>
                <th className="px-3 py-2.5">SĐT</th>
                <th className="px-3 py-2.5">Cột pipeline</th>
                <th className="px-3 py-2.5 min-w-[11rem]">
                  <span className="inline-flex items-center gap-1">
                    <ArrowRightCircle className="h-3.5 w-3.5" />
                    Chuyển cột
                  </span>
                </th>
                <th className="px-3 py-2.5">Theo dõi tiếp</th>
                <th className="px-3 py-2.5">Phụ trách</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((row) => {
                const st = row.stage;
                const assignee = row.assignee || row.lead_owner;
                const phone = row.display_phone || row.customer?.phone || row.phone;
                const src = row.source;
                const nf = row.next_follow_up;
                const nfMs = nf ? new Date(nf).getTime() : null;
                const today0 = startOfDay(new Date()).getTime();
                const overdue = nfMs != null && nfMs < today0;
                const mark = careMarks[row.id];
                const isMarked = !!mark;
                const busy = careBusyId === row.id;
                const moving = stageMoveBusyId === row.id;
                const rowMoveStages = getMoveStagesForRow(row);
                const moveDisabled = moving || rowMoveStages.length === 0;
                const rowTypeLabel = row.type === 'deal' ? 'Deal' : 'Lead';
                return (
                  <tr key={row.id} className={`hover:bg-emerald-50/40 ${isMarked ? 'bg-emerald-50/60' : ''}`}>
                    <td className="px-3 py-2 align-middle text-center">
                      <button
                        type="button"
                        onClick={() => toggleCareMark(row.id)}
                        disabled={busy}
                        className={`w-7 h-7 rounded-lg inline-flex items-center justify-center transition-colors cursor-pointer ${
                          isMarked
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'text-gray-300 hover:bg-emerald-100 hover:text-emerald-600'
                        } ${busy ? 'opacity-50 cursor-wait' : ''}`}
                        title={
                          isMarked
                            ? `Đã chăm sóc${mark?.marked_at ? ` lúc ${formatDate(mark.marked_at)}` : ''} — bấm để bỏ`
                            : 'Đánh dấu đã chăm sóc (ẩn nhắc 30 ngày)'
                        }
                      >
                        {isMarked ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            row.type === 'deal' ? 'bg-cyan-100 text-cyan-800' : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {rowTypeLabel}
                        </span>
                        <Link
                          to={`/crm/leads/${row.id}`}
                          className="font-medium text-indigo-600 hover:underline"
                        >
                          {row.code ? `${row.code} · ` : ''}{row.title}
                        </Link>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-gray-800">
                      {row.customer?.full_name || '—'}
                    </td>
                    <td className="px-3 py-2 align-top text-gray-700">
                      {src ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          {src.icon ? <span aria-hidden>{src.icon}</span> : null}
                          {src.name || '—'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {phone ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-gray-700">
                          <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          {phone}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top max-w-[14rem]">
                      {st ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: `${st.color || '#64748b'}18`,
                            color: st.color || '#475569',
                          }}
                        >
                          {st.icon ? `${st.icon} ` : ''}{st.name}
                        </span>
                      ) : (
                        '—'
                      )}
                      {row.lost_reason && (
                        <div
                          className="mt-1.5 px-2 py-1.5 bg-red-50 border border-red-100 rounded-lg"
                          title={row.lost_reason}
                        >
                          <p className="text-[10px] text-red-500 font-medium">❌ Lý do mất</p>
                          <p className="text-xs text-red-700 line-clamp-3 whitespace-pre-wrap break-words">
                            {row.lost_reason}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        value={String(row.stage_id || '')}
                        disabled={moveDisabled}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v && v !== String(row.stage_id || '')) moveLeadToStage(row, v);
                        }}
                        className={`w-full max-w-[12rem] h-8 px-2 rounded-lg border text-xs bg-white ${
                          moving ? 'border-emerald-300 opacity-60' : 'border-gray-200 hover:border-emerald-400'
                        }`}
                        title={
                          rowMoveStages.length
                            ? `Chọn cột pipeline ${rowTypeLabel} (cùng công ty / pipeline đang lọc)`
                            : 'Chọn công ty và pipeline CRM để tải danh sách cột'
                        }
                      >
                        <option value={row.stage_id || ''}>
                          {st ? `${st.icon ? `${st.icon} ` : ''}${st.name}` : '— Chọn cột —'}
                        </option>
                        {rowMoveStages
                          .filter((s) => String(s.id) !== String(row.stage_id || ''))
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.icon ? `${s.icon} ` : ''}
                              {s.name}
                              {s.is_won ? ' · Thắng' : ''}
                              {s.is_lost ? ' · Mất' : ''}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      {nf ? (
                        <span className={overdue ? 'text-red-600 font-semibold' : 'text-gray-800'}>
                          {formatDate(nf)}
                          {overdue && ' · quá hạn'}
                        </span>
                      ) : (
                        <span className="text-amber-700">Chưa hẹn</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-gray-700">
                      {assignee?.full_name || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                  disabled={wonAssigning || !wonAssignUser || !wonLead?.customer_id}
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
