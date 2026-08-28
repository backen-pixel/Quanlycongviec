import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Calendar, ChevronDown, Eye, Factory, FileText, Loader2, Plus, Truck, X } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { displayPipelineStageName } from './ProjectDealSyncPanel';
import { TEMP_SX_FREE_DRAG } from '../lib/sxPipelineRevenue';
import { isProjectAlreadyInLogistics, VC_TEMP_LOCK_MSG } from '../lib/projectLogistics';
import { isLogisticsAdmin, isProductionAdmin, isProductionStaff } from '../lib/adminRole';
import { isDealResponsibleUser } from '../lib/fileOwnership';
import {
  classifyCrmLeadTypeForSx,
  orderSxCompaniesPreferredFirst,
  preferredSxFromLeadTypeRow,
} from '../lib/sxCompanySuggestFromLeadType';
import SxMultiTargetPicker, {
  ShiftQuickPick,
  sxTargetsToApiPayload,
  validateSxTargets,
} from './SxMultiTargetPicker';
import MultiDayDatePicker, { formatYmdListVi } from './MultiDayDatePicker';
import { OverlayPortal } from './Modal';
import VcHandoverEventsPopup from './VcHandoverEventsPopup';

function normalizeStageDisplayName(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  const parts = s.split(/[—–-]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.every((p) => p.toLowerCase() === parts[0].toLowerCase())) {
    return parts[0];
  }
  return s;
}

function formatVnDateTimeShort(raw) {
  if (!raw) return '';
  const d = new Date(String(raw).length === 10 ? `${raw}T12:00:00+07:00` : raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function subtractCalendarDaysYmd(ymd, days = 2) {
  const m = String(ymd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  if (Number.isNaN(dt.getTime())) return '';
  dt.setUTCDate(dt.getUTCDate() - Math.abs(Number(days) || 0));
  return dt.toISOString().slice(0, 10);
}

function toDatetimeLocalValue(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return s;
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function projectInstallDisplayRaw(pp) {
  return pp?.install_date || pp?.delivery_date || null;
}

function normalizeInstallOccYmds(...sources) {
  const out = [];
  for (const src of sources) {
    if (Array.isArray(src)) {
      for (const d of src) {
        const ymd = String(d || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) out.push(ymd);
      }
    } else if (src != null && src !== '') {
      const ymd = String(src).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) out.push(ymd);
    }
  }
  return [...new Set(out)].sort();
}

function asStageList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.stages)) return data.stages;
  return [];
}

const PIPELINE_STAGE_CACHE = { sx: new Map(), vc: new Map() };

function pipelineCacheKey(kind, pp) {
  if (kind === 'vc') {
    return String(pp?.logistics_company_id || pp?.logistics_company?.id || pp?.company_id || '');
  }
  return `${pp?.company_id || ''}::${pp?.workshop_type_id || ''}`;
}

function resolveSxProgressMeta(pp) {
  const stage = pp?.sx_pipeline_stage || null;
  const named = stage ? displayPipelineStageName(stage) : '';
  const stageName = (named && named !== 'Chưa có')
    ? named
    : (pp?.status === 'consulting' ? 'Chờ vào xưởng' : '');
  return { stage, stageName: stageName || 'Chưa có giai đoạn' };
}

function resolveVcProgressMeta(pp) {
  const stage = pp?.vc_pipeline_stage || null;
  const named = stage ? displayPipelineStageName(stage) : '';
  return { stage, stageName: named && named !== 'Chưa có' ? named : '' };
}

function notifyPipelineBadges(projectId) {
  if (!projectId || typeof window === 'undefined') return;
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('crm-project-badges-refresh', {
      detail: { projectId: String(projectId) },
    }));
  }, 200);
}

async function moveSxColumn(projectId, stage, pp) {
  if (stage?.is_switch_workshop_type === true && stage?.target_workshop_type_id) {
    const err = new Error('Cột này đổi phân loại xưởng — mở chi tiết Sản xuất để chuyển.');
    throw err;
  }
  if (!TEMP_SX_FREE_DRAG && stage?.is_handover_to_logistics === true && !isProjectAlreadyInLogistics(pp)) {
    await api.post(`/vc-handover/projects/${projectId}/request`, { sx_stage_id: String(stage?.id || '') });
    return { handover: true };
  }
  let body;
  if (stage?.bucket_slug === 'won_pending' || String(stage?.id || '').startsWith('__fb_')) {
    body = { move_to_intake: true };
  } else {
    body = {
      sx_pipeline_stage_id: stage?.id,
      current_sx_pipeline_stage_id: pp?.sx_pipeline_stage?.id || pp?.sx_kanban_column_id || null,
    };
  }
  await api.patch(`/production/projects/${projectId}/stage`, body);
  return { handover: false };
}

async function moveVcColumn(projectId, stage, pp) {
  if (pp?.vc_temp_staged && String(stage?.id) !== String(pp?.vc_pipeline_stage?.id || pp?.vc_kanban_column_id || '')) {
    throw new Error(VC_TEMP_LOCK_MSG);
  }
  let body = { vc_stage_id: stage?.id };
  if (stage?.workflow_stage_id) body.stage_id = stage.workflow_stage_id;
  if (stage?.bucket_slug === 'delivery_pending') body = { move_to_intake: true };
  await api.patch(`/logistics/projects/${projectId}/stage`, body);
}

function rememberVcCompany(companyId) {
  if (!companyId) return;
  try {
    localStorage.setItem('vc_pipeline_settings_company_id', String(companyId));
  } catch {
    /* ignore */
  }
}

function PipelineProgress({
  label,
  tone,
  stageName,
  icon,
  canEdit = false,
  projectRow = null,
  onMoved,
  onPickCompany,
}) {
  const isVc = tone === 'vc';
  const displayName = normalizeStageDisplayName(stageName);
  const shell = isVc ? 'bg-orange-50 border-orange-100' : 'bg-teal-50 border-teal-100';
  const badge = isVc ? 'bg-orange-100 text-orange-800' : 'bg-teal-100 text-teal-800';
  const nameColor = isVc ? 'text-orange-950' : 'text-teal-950';
  const pid = projectRow?.project_id || null;
  const vcCompanyId = projectRow?.logistics_company_id || projectRow?.logistics_company?.id || null;
  const vcCompanyName = projectRow?.logistics_company_name
    || projectRow?.logistics_company?.short_name
    || projectRow?.logistics_company?.name
    || null;
  const [open, setOpen] = useState(false);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const loadStages = async () => {
    const kind = isVc ? 'vc' : 'sx';
    const key = pipelineCacheKey(kind, projectRow);
    const cached = PIPELINE_STAGE_CACHE[kind].get(key);
    if (cached) {
      setStages(cached);
      return;
    }
    const companyId = isVc
      ? (projectRow?.logistics_company_id || projectRow?.logistics_company?.id || projectRow?.company_id)
      : projectRow?.company_id;
    if (!companyId) {
      setStages([]);
      return;
    }
    setLoading(true);
    try {
      const params = { company_id: companyId };
      if (!isVc && projectRow?.workshop_type_id) params.workshop_type_id = projectRow.workshop_type_id;
      const url = isVc ? '/logistics/pipeline-stages' : '/production/pipeline-stages';
      const r = await api.get(url, { params });
      const list = asStageList(r.data).map((s) => {
        const name = displayPipelineStageName(s);
        return { ...s, name: name === 'Chưa có' ? s.name : name };
      });
      PIPELINE_STAGE_CACHE[kind].set(key, list);
      setStages(list);
    } catch {
      setStages([]);
    } finally {
      setLoading(false);
    }
  };

  const openPicker = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!canEdit || !pid || moving) return;
    setOpen(true);
    await loadStages();
  };

  const pickStage = async (stage) => {
    if (!pid || !stage?.id || moving) return;
    const currentId = String(
      (isVc ? projectRow?.vc_pipeline_stage?.id : projectRow?.sx_pipeline_stage?.id) || '',
    );
    if (currentId && currentId === String(stage.id)) {
      setOpen(false);
      return;
    }
    setMoving(true);
    try {
      if (isVc) {
        await moveVcColumn(pid, stage, projectRow);
      } else {
        const result = await moveSxColumn(pid, stage, {
          ...projectRow,
          vc_kanban_column_id: projectRow?.vc_pipeline_stage?.id || projectRow?.vc_kanban_column_id,
          logistics_company_id: projectRow?.logistics_company_id || projectRow?.logistics_company?.id,
        });
        if (result?.handover) {
          alert('Đã gửi thông báo cho Sale CRM — chọn công ty VC/LĐ và ngày lấy/lắp trong bình luận deal. VC xác nhận xong mới tạo lịch.');
        }
      }
      setOpen(false);
      notifyPipelineBadges(pid);
      await onMoved?.();
    } catch (err) {
      const bodyErr = err?.response?.data || {};
      if (bodyErr.code === 'SX_BLOCKING_TASKS_INCOMPLETE' || bodyErr.code === 'VC_BLOCKING_TASKS_INCOMPLETE') {
        const names = (bodyErr.remaining_tasks || []).map((t) => t.title || t.name).filter(Boolean);
        alert(`Còn nhiệm vụ chặn chuyển cột${bodyErr.current_stage_name ? ` tại «${bodyErr.current_stage_name}»` : ''}${names.length ? `:\n• ${names.slice(0, 8).join('\n• ')}` : ''}`);
      } else if (bodyErr.code === 'requires_deadline') {
        alert(bodyErr.error || 'Cột này bắt buộc deadline — mở trang chi tiết để nhập hạn.');
      } else {
        alert(bodyErr.error || err.message || 'Không chuyển được cột');
      }
    } finally {
      setMoving(false);
    }
  };

  const companyRow = (
    <div className="mt-1.5 flex items-center gap-1 min-w-0">
      {pid && (vcCompanyName || vcCompanyId) ? (
        <Link
          to={`/vc/projects/${pid}`}
          title={`Mở Kanban công ty vận chuyển${vcCompanyName ? `: ${vcCompanyName}` : ''}`}
          onClick={() => rememberVcCompany(vcCompanyId)}
          className="min-w-0 flex-1 truncate text-[10px] font-semibold text-orange-800 hover:underline"
        >
          🚚 {vcCompanyName || 'Công ty vận chuyển'}
        </Link>
      ) : onPickCompany ? (
        <button
          type="button"
          title="Chọn công ty vận chuyển / lắp đặt"
          onClick={onPickCompany}
          className="min-w-0 flex-1 truncate text-left text-[10px] font-semibold text-amber-800 hover:underline cursor-pointer"
        >
          🚚 Chưa chọn công ty VC — chọn ngay
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[10px] text-amber-800/80">
          🚚 Chưa chọn công ty VC
        </span>
      )}
      {canEdit && onPickCompany ? (
        <button
          type="button"
          title="Đổi công ty VC/LĐ"
          onClick={onPickCompany}
          className="shrink-0 h-5 w-5 inline-flex items-center justify-center rounded text-orange-800 hover:bg-orange-100 cursor-pointer"
        >
          <Building2 className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );

  const stageBlock = (
    <>
      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${badge}`}>
        <span className="text-[11px] leading-none">{icon || (isVc ? '🚚' : '🏭')}</span>
        {label}
        {canEdit && pid ? <ChevronDown className="h-3 w-3 opacity-70" /> : null}
      </span>
      <p className={`mt-1 text-[11px] font-semibold leading-snug line-clamp-2 ${displayName ? nameColor : 'text-gray-400 italic'}`}>
        {moving ? 'Đang chuyển…' : (displayName || 'Chưa có giai đoạn')}
      </p>
    </>
  );

  if (!canEdit || !pid) {
    return (
      <div className={`rounded-lg border px-2.5 py-2 min-w-0 ${shell}`}>
        {stageBlock}
        {companyRow}
      </div>
    );
  }

  return (
    <div ref={boxRef} className={`relative min-w-0 rounded-lg border px-2.5 py-2 ${shell} ${moving ? 'opacity-70' : ''}`}>
      <button
        type="button"
        onClick={openPicker}
        disabled={moving}
        title={`Đổi cột ${label} nhanh`}
        className={`w-full text-left min-w-0 cursor-pointer ${
          isVc ? 'hover:text-orange-900' : 'hover:text-teal-900'
        }`}
      >
        {stageBlock}
      </button>
      {companyRow}
      {open ? (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-[11px] text-gray-400">Đang tải cột…</p>
          ) : !stages.length ? (
            <p className="px-3 py-2 text-[11px] text-gray-400">Không có cột pipeline</p>
          ) : stages.map((s) => {
            const sid = String(s.id);
            const currentId = String(
              (isVc ? projectRow?.vc_pipeline_stage?.id : projectRow?.sx_pipeline_stage?.id) || '',
            );
            const active = currentId && currentId === sid;
            return (
              <button
                key={sid}
                type="button"
                disabled={moving}
                onClick={() => pickStage(s)}
                className={`w-full text-left px-3 py-1.5 text-[12px] leading-snug cursor-pointer hover:bg-slate-50 ${
                  active ? 'font-semibold bg-slate-50' : 'text-slate-800'
                }`}
              >
                <span className="mr-1">{s.icon || ''}</span>
                {s.name}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MetaChip({ tone = 'gray', icon, children, title, onClick }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
    orange: 'bg-orange-50 text-orange-900 border-orange-100',
    teal: 'bg-teal-50 text-teal-900 border-teal-100',
    sky: 'bg-sky-50 text-sky-900 border-sky-100',
    amber: 'bg-amber-50 text-amber-800 border-amber-100',
  };
  const Comp = onClick ? 'button' : 'span';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title || undefined}
      className={`inline-flex items-center gap-1 max-w-full rounded-md border px-1.5 py-0.5 text-[10px] font-medium truncate ${tones[tone] || tones.gray} ${
        onClick ? 'cursor-pointer hover:ring-1 hover:ring-amber-400/80 hover:brightness-[0.98]' : ''
      }`}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="truncate">{children}</span>
    </Comp>
  );
}

function IconCtrl({ title, to, onClick, warn = false, children }) {
  const cls = `relative h-7 w-7 inline-flex items-center justify-center rounded-lg border shrink-0 ${
    warn
      ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
      : 'border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100'
  }`;
  const inner = (
    <>
      {children}
      {warn ? (
        <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 ring-1 ring-white" />
      ) : null}
    </>
  );
  if (to) {
    return (
      <Link to={to} title={title} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" title={title} onClick={onClick} className={`${cls} cursor-pointer`}>
      {inner}
    </button>
  );
}

function canUserEditSxVcSchedule(user, lead) {
  return isDealResponsibleUser(user, lead)
    || isProductionStaff(user)
    || isProductionAdmin(user)
    || isLogisticsAdmin(user);
}

/**
 * Thẻ dự án SX/VC — layout Deal trên LeadDetail, gồm Sửa lịch + Thêm dự án SX.
 */
export default function DealProductionProjectsPanel({
  projects = [],
  currentProjectId = null,
  leadId = null,
  lead = null,
  canEdit: canEditProp,
  onReload,
}) {
  const { user } = useAuth();
  const canEdit = canEditProp ?? canUserEditSxVcSchedule(user, lead);
  const rows = Array.isArray(projects) ? projects.filter((p) => p?.project_id || p?.code) : [];
  const dealId = leadId || lead?.id || null;
  const canAdd = canEdit && dealId && rows.some((p) => p?.project_id);

  const [sxScheduleEdit, setSxScheduleEdit] = useState(null);
  const [sxScheduleBusy, setSxScheduleBusy] = useState(false);
  const [sxScheduleAssigningVc, setSxScheduleAssigningVc] = useState(false);
  const [sxScheduleErr, setSxScheduleErr] = useState('');
  const [sxScheduleVcUsers, setSxScheduleVcUsers] = useState([]);
  const [sxScheduleLogisticsCompanies, setSxScheduleLogisticsCompanies] = useState([]);

  const [addSxOpen, setAddSxOpen] = useState(false);
  const [addSxBusy, setAddSxBusy] = useState(false);
  const [addSxErr, setAddSxErr] = useState('');
  const [addSxTargets, setAddSxTargets] = useState([]);
  const [addSxCompanies, setAddSxCompanies] = useState([]);
  const [addSxLeadTypeRow, setAddSxLeadTypeRow] = useState(null);

  const addSxKind = useMemo(
    () => classifyCrmLeadTypeForSx(
      addSxLeadTypeRow?.name
      || lead?.lead_type_name
      || lead?.lead_type
      || '',
    ),
    [addSxLeadTypeRow, lead?.lead_type, lead?.lead_type_name],
  );
  const addSxCompaniesForSelect = useMemo(() => {
    const pref = preferredSxFromLeadTypeRow(addSxLeadTypeRow);
    return orderSxCompaniesPreferredFirst(
      addSxCompanies,
      addSxKind,
      pref.companyId,
      pref.companyIds,
    );
  }, [addSxCompanies, addSxKind, addSxLeadTypeRow]);

  const refreshAfterChange = useCallback(async () => {
    if (typeof onReload === 'function') await onReload();
  }, [onReload]);

  const closeSxScheduleEdit = () => {
    if (sxScheduleBusy || sxScheduleAssigningVc) return;
    setSxScheduleEdit(null);
    setSxScheduleErr('');
    setSxScheduleVcUsers([]);
  };

  const openSxScheduleEdit = (pp) => {
    if (!pp?.project_id) return;
    const installRaw = projectInstallDisplayRaw(pp);
    const ymd = String(installRaw || '').slice(0, 10);
    const timeM = String(installRaw || '').match(/T(\d{2}):(\d{2})/);
    const installYmd = /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : '';
    const initialOcc = normalizeInstallOccYmds(
      pp.install_occurrence_dates,
      pp.installOccurrenceDates,
      installYmd,
    );
    const logisticsFromPp = pp.logistics_company_id
      || pp.logistics_company?.id
      || null;
    const initialLogisticsPersonId = pp.logistics_person_id
      || pp.logistics_person?.id
      || null;
    setSxScheduleEdit({
      projectId: pp.project_id,
      code: pp.code || '',
      logisticsCompanyId: logisticsFromPp ? String(logisticsFromPp) : '',
      logisticsPersonId: initialLogisticsPersonId ? String(initialLogisticsPersonId) : '',
      installYmd: initialOcc[0] || installYmd,
      installTime: timeM ? `${timeM[1]}:${timeM[2]}` : '14:00',
      installOccurrenceDates: initialOcc.length ? initialOcc : (installYmd ? [installYmd] : []),
      vcNotes: pp.vc_notes || '',
      pickupLocal: pp.pickup_at
        ? toDatetimeLocalValue(pp.pickup_at)
        : ((initialOcc[0] || installYmd) ? `${initialOcc[0] || installYmd}T08:00` : ''),
    });
    setSxScheduleErr('');
    setSxScheduleVcUsers([]);

    const projectId = String(pp.project_id);
    Promise.all([
      api.get('/companies', { params: { for_module: 'logistics' } }).catch(() => null),
      api.get(`/projects/${projectId}`).catch(() => null),
      api.get('/workshop-teams/users').catch(() => null),
      dealId
        ? api.get('/events', {
          params: { lead_id: dealId, limit: 100, include_as_participant: '1' },
        }).catch(() => null)
        : api.get('/events', {
          params: { project_id: projectId, limit: 100, include_as_participant: '1' },
        }).catch(() => null),
    ]).then(([companiesRes, projectRes, vcUsersRes, eventsRes]) => {
      const list = companiesRes?.data?.companies || companiesRes?.data || [];
      let companies = Array.isArray(list) ? list.map((c) => ({ ...c, id: String(c.id) })) : [];
      const proj = projectRes?.data?.project || projectRes?.data || null;
      const rawEvents = eventsRes?.data?.events || eventsRes?.data || [];
      const eventList = (Array.isArray(rawEvents) ? rawEvents : []).filter((e) => {
        if (!e) return false;
        if (String(e.project_id || '') === projectId) return true;
        return !e.project_id && dealId && String(e.lead_id || '') === String(dealId);
      });
      const preferType = (types) => eventList.find((e) => {
        const t = String(e?.event_type || '').toLowerCase();
        return types.includes(t) && e?.company_id;
      })?.company_id;
      const fromEvents = preferType(['installation', 'pickup', 'delivery']) || null;
      const lid = proj?.logistics_company_id
        || proj?.logistics_company?.id
        || logisticsFromPp
        || fromEvents
        || null;
      const lidStr = lid ? String(lid) : '';
      if (lidStr && !companies.some((c) => String(c.id) === lidStr)) {
        const fromEv = eventList.find((e) => String(e?.company_id) === lidStr);
        const name = proj?.logistics_company?.short_name
          || proj?.logistics_company?.name
          || fromEv?.company?.short_name
          || fromEv?.company?.name
          || fromEv?.company_name
          || pp.logistics_company_name
          || 'Công ty VC/LĐ đã chọn';
        companies = [{ id: lidStr, name, short_name: name }, ...companies];
      }
      setSxScheduleLogisticsCompanies(companies);

      const personId = proj?.logistics_person_id || proj?.logistics_person?.id || initialLogisticsPersonId || null;
      const personName = proj?.logistics_person?.full_name || pp.logistics_person_name || pp.logistics_person?.full_name || null;
      const rawVcUsers = vcUsersRes?.data?.users || vcUsersRes?.data || [];
      let vcUsers = Array.isArray(rawVcUsers) ? rawVcUsers : [];
      if (personId && !vcUsers.some((u) => String(u.id) === String(personId))) {
        vcUsers = [{ id: personId, full_name: personName || 'Người quản lý VC đã gán' }, ...vcUsers];
      }
      setSxScheduleVcUsers(vcUsers);

      const companyIdForUsers = lidStr || logisticsFromPp;
      if (companyIdForUsers) {
        api.get(`/logistics/handover-settings/${companyIdForUsers}`)
          .then((r) => {
            const coUsers = r.data?.users || [];
            if (!Array.isArray(coUsers) || !coUsers.length) return;
            setSxScheduleVcUsers((prev) => {
              const map = new Map();
              for (const u of [...coUsers, ...(prev || [])]) {
                if (u?.id) map.set(String(u.id), u);
              }
              return [...map.values()].sort((a, b) =>
                String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi'));
            });
          })
          .catch(() => {});
      }

      setSxScheduleEdit((s) => {
        if (!s || String(s.projectId) !== projectId) return s;
        const next = { ...s };
        if (lidStr) next.logisticsCompanyId = lidStr;
        if (personId) next.logisticsPersonId = String(personId);
        if (proj?.pickup_at && !String(s.pickupLocal || '').trim()) {
          next.pickupLocal = toDatetimeLocalValue(proj.pickup_at);
        }
        if (proj?.vc_notes != null && !String(s.vcNotes || '').trim()) {
          next.vcNotes = String(proj.vc_notes || '');
        }
        const installEv = eventList.find((e) => {
          const t = String(e?.event_type || '').toLowerCase();
          return t === 'installation' && String(e.project_id || '') === projectId;
        }) || eventList.find((e) => String(e?.event_type || '').toLowerCase() === 'installation');
        const occ = normalizeInstallOccYmds(
          installEv?.occurrence_dates,
          proj?.install_occurrence_dates,
          proj?.installOccurrenceDates,
          (() => {
            if (!installEv?.start_time) return [];
            const startYmd = String(installEv.start_time).slice(0, 10);
            const endYmd = installEv.end_time ? String(installEv.end_time).slice(0, 10) : startYmd;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd)) return [];
            if (!endYmd || endYmd === startYmd || endYmd < startYmd) return [startYmd];
            const days = [];
            const cur = new Date(`${startYmd}T12:00:00`);
            const end = new Date(`${endYmd}T12:00:00`);
            const pad = (n) => String(n).padStart(2, '0');
            while (cur <= end && days.length < 31) {
              days.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
              cur.setDate(cur.getDate() + 1);
            }
            return days;
          })(),
          s.installOccurrenceDates,
          s.installYmd,
        );
        if (occ.length) {
          next.installOccurrenceDates = occ;
          next.installYmd = occ[0];
          const tm = String(installEv?.start_time || '').match(/T(\d{2}):(\d{2})/)
            || String(proj?.install_date || proj?.delivery_date || '').match(/T(\d{2}):(\d{2})/)
            || String(s.installTime || '').match(/^(\d{2}):(\d{2})$/);
          if (tm) next.installTime = `${tm[1]}:${tm[2]}`;
        }
        return next;
      });
    }).catch(() => {
      setSxScheduleLogisticsCompanies([]);
      setSxScheduleVcUsers([]);
    });
  };

  const assignVcManagerOnDeal = async (userId) => {
    if (!sxScheduleEdit?.projectId) return;
    const uid = String(userId || '').trim();
    setSxScheduleAssigningVc(true);
    setSxScheduleErr('');
    try {
      await api.patch(`/workshop-teams/projects/${sxScheduleEdit.projectId}/assign`, {
        logistics_person_id: uid || null,
      });
      setSxScheduleEdit((s) => (s ? { ...s, logisticsPersonId: uid } : s));
      await refreshAfterChange();
    } catch (e) {
      setSxScheduleErr(e.response?.data?.error || e.message || 'Lỗi gán người quản lý vận chuyển');
    } finally {
      setSxScheduleAssigningVc(false);
    }
  };

  const submitSxScheduleEdit = async () => {
    if (!sxScheduleEdit?.projectId) return;
    const occ = [...new Set(
      (Array.isArray(sxScheduleEdit.installOccurrenceDates) ? sxScheduleEdit.installOccurrenceDates : [])
        .map((d) => String(d || '').slice(0, 10))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    )].sort();
    const ymd = occ[0] || String(sxScheduleEdit.installYmd || '').trim();
    if (ymd && !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      setSxScheduleErr('Ngày lắp đặt không hợp lệ.');
      return;
    }
    const time = String(sxScheduleEdit.installTime || '14:00').trim() || '14:00';
    if (ymd && !/^\d{2}:\d{2}$/.test(time)) {
      setSxScheduleErr('Giờ lắp đặt không hợp lệ.');
      return;
    }
    const lid = String(sxScheduleEdit.logisticsCompanyId || '').trim();
    if (lid && !ymd) {
      setSxScheduleErr('Đã chọn công ty VC/LĐ — vui lòng nhập ngày lắp đặt.');
      return;
    }
    setSxScheduleBusy(true);
    setSxScheduleErr('');
    try {
      await api.put(`/projects/${sxScheduleEdit.projectId}`, {
        install_date: ymd ? `${ymd}T${time}:00+07:00` : null,
        delivery_date: ymd || null,
        production_deadline: ymd ? (subtractCalendarDaysYmd(ymd, 2) || null) : null,
        production_finish_date: ymd ? (subtractCalendarDaysYmd(ymd, 2) || null) : null,
        pickup_at: sxScheduleEdit.pickupLocal
          ? new Date(sxScheduleEdit.pickupLocal).toISOString()
          : null,
        logistics_company_id: lid || null,
        install_occurrence_dates: occ.length ? occ : (ymd ? [ymd] : []),
        vc_notes: String(sxScheduleEdit.vcNotes || '').trim() || null,
        sync_vc_ld_events: true,
      });
      const nextPersonId = String(sxScheduleEdit.logisticsPersonId || '').trim();
      if (nextPersonId) {
        await api.patch(`/workshop-teams/projects/${sxScheduleEdit.projectId}/assign`, {
          logistics_person_id: nextPersonId,
        });
      }
      setSxScheduleEdit(null);
      setSxScheduleVcUsers([]);
      await refreshAfterChange();
    } catch (e) {
      setSxScheduleErr(e.response?.data?.error || e.message || 'Lỗi lưu lịch lắp đặt');
    } finally {
      setSxScheduleBusy(false);
    }
  };

  const openAddSx = () => {
    setAddSxErr('');
    setAddSxTargets([]);
    setAddSxOpen(true);
  };

  useEffect(() => {
    if (!addSxOpen) return undefined;
    let cancelled = false;
    const cid = lead?.company_id;
    const companiesReq = cid
      ? api.get('/crm/production-companies', { params: { company_id: cid } })
      : api.get('/companies', { params: { for_module: 'production' } });
    const typesReq = cid
      ? api.get('/crm/lead-types', { params: { company_id: cid } })
      : Promise.resolve({ data: [] });
    Promise.all([companiesReq.catch(() => null), typesReq.catch(() => null)]).then(([coRes, typesRes]) => {
      if (cancelled) return;
      const list = coRes?.data?.companies || coRes?.data || [];
      setAddSxCompanies(Array.isArray(list) ? list : []);
      const types = Array.isArray(typesRes?.data) ? typesRes.data : [];
      const typeId = lead?.lead_type_id;
      setAddSxLeadTypeRow(
        typeId ? (types.find((t) => String(t.id) === String(typeId)) || null) : null,
      );
    });
    return () => { cancelled = true; };
  }, [addSxOpen, lead?.company_id, lead?.lead_type_id]);

  const submitAddSxProject = async () => {
    if (!dealId) return;
    const err = validateSxTargets(addSxTargets);
    if (err) {
      setAddSxErr(err);
      return;
    }
    setAddSxBusy(true);
    setAddSxErr('');
    const targetsPayload = sxTargetsToApiPayload(addSxTargets);
    try {
      const { data } = await api.post(`/crm/deals/${dealId}/auto-create-project`, {
        mode: 'additional',
        targets: targetsPayload,
      });
      if (data?.partial_error || data?.warning) {
        setAddSxErr(data.partial_error || data.warning);
      } else {
        setAddSxOpen(false);
        setAddSxTargets([]);
      }
      await refreshAfterChange();
    } catch (e) {
      setAddSxErr(e.response?.data?.error || e.message || 'Lỗi thêm dự án SX');
    } finally {
      setAddSxBusy(false);
    }
  };

  if (!rows.length) return null;
  const showPrimary = rows.length <= 1;

  return (
    <div className="rounded-xl border border-teal-200 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-gray-900">Dự án sản xuất</h4>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-100 rounded-md px-1.5 py-0.5 tabular-nums">
            {rows.length}
          </span>
          {canAdd ? (
            <button
              type="button"
              className="h-7 px-2 rounded-md text-[11px] font-semibold bg-teal-600 text-white hover:bg-teal-700 cursor-pointer inline-flex items-center gap-0.5"
              onClick={openAddSx}
              title="Thêm dự án SX tại xưởng khác"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm
            </button>
          ) : null}
        </div>
      </div>
      <p className="text-[11px] text-gray-500 leading-snug">
        {canEdit
          ? 'Bấm ô Sản xuất / VC-LĐ để đổi cột. Tên công ty vận chuyển trên ô — bấm để mở Kanban VC; icon tòa nhà để đổi công ty.'
          : 'Bấm tên công ty vận chuyển trên ô Sản xuất / VC-LĐ để mở Kanban VC của dự án.'}
      </p>
      <ul className="space-y-2.5">
        {rows.map((pp) => {
          const pid = pp.project_id;
          const isCurrent = pid && currentProjectId && String(pid) === String(currentProjectId);
          const sxProgress = resolveSxProgressMeta(pp);
          const vcProgress = resolveVcProgressMeta(pp);
          const vcName = pp.logistics_company_name || pp.logistics_company?.short_name || pp.logistics_company?.name || null;
          const logisticsPerson = pp.logistics_person_name || pp.logistics_person?.full_name || null;
          const installRaw = projectInstallDisplayRaw(pp);
          const occ = normalizeInstallOccYmds(pp.install_occurrence_dates, pp.installOccurrenceDates);
          const installLabel = occ.length > 1
            ? `Lắp ${occ.length} ngày: ${formatYmdListVi(occ)}`
            : (installRaw ? `Lắp ${formatVnDateTimeShort(installRaw)}` : null);
          const pickupLabel = pp.pickup_at ? formatVnDateTimeShort(pp.pickup_at) : null;
          const openEdit = canEdit && pid ? () => openSxScheduleEdit(pp) : undefined;
          return (
            <li
              key={pid || pp.code}
              className={`rounded-xl border bg-white shadow-sm overflow-hidden ${
                isCurrent ? 'border-teal-400 ring-1 ring-teal-200' : 'border-gray-200'
              }`}
            >
              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-gray-900 truncate">
                      {pp.code || '—'}
                      {showPrimary && pp.is_primary ? (
                        <span className="ml-1.5 inline-flex items-center rounded-md bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800 align-middle">
                          Chính
                        </span>
                      ) : null}
                      {isCurrent ? (
                        <span className="ml-1.5 inline-flex items-center rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 align-middle">
                          Đang xem
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500 truncate">
                      {[pp.company_name, pp.workshop_type_name || pp.label, pp.name].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {pid && (
                    <div className="shrink-0 flex items-center gap-1">
                      {canEdit && (
                        <IconCtrl
                          title="Sửa lịch lắp đặt / gán người quản lý vận chuyển"
                          onClick={openEdit}
                          warn={!installLabel || !vcName || !logisticsPerson}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                        </IconCtrl>
                      )}
                      {!isCurrent && (
                        <IconCtrl title="Xem Work Unified xưởng này" to={`/management/work-unified/${pid}`}>
                          <Eye className="h-3.5 w-3.5" />
                        </IconCtrl>
                      )}
                      <IconCtrl title="Mở Kanban sản xuất" to={`/sx/projects/${pid}`}>
                        <Factory className="h-3.5 w-3.5" />
                      </IconCtrl>
                      <IconCtrl title="Mở Kanban vận chuyển / lắp đặt" to={`/vc/projects/${pid}`}>
                        <Truck className="h-3.5 w-3.5" />
                      </IconCtrl>
                      {dealId && (
                        <IconCtrl title="Mở deal CRM" to={`/crm/leads/${dealId}`}>
                          <FileText className="h-3.5 w-3.5" />
                        </IconCtrl>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <PipelineProgress
                    label="Sản xuất"
                    tone="sx"
                    stageName={sxProgress.stageName}
                    icon={sxProgress.stage?.icon}
                    canEdit={canEdit}
                    projectRow={pp}
                    onMoved={refreshAfterChange}
                    onPickCompany={openEdit}
                  />
                  <PipelineProgress
                    label="VC / LĐ"
                    tone="vc"
                    stageName={vcProgress.stageName || (vcName ? 'Chưa vào pipeline' : null)}
                    icon={vcProgress.stage?.icon}
                    canEdit={canEdit}
                    projectRow={pp}
                    onMoved={refreshAfterChange}
                    onPickCompany={openEdit}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {vcName ? (
                    <MetaChip tone="orange" icon="🏢" title="Công ty VC/LĐ — bấm để sửa" onClick={openEdit}>{vcName}</MetaChip>
                  ) : (
                    <MetaChip tone="amber" icon="⚠️" title="Chọn công ty VC/LĐ" onClick={openEdit}>Chưa chọn công ty VC/LĐ</MetaChip>
                  )}
                  {logisticsPerson ? (
                    <MetaChip tone="orange" icon="👤" title="Quản lý vận chuyển — bấm để sửa" onClick={openEdit}>{logisticsPerson}</MetaChip>
                  ) : (
                    <MetaChip tone="amber" icon="👤" title="Gán quản lý vận chuyển" onClick={openEdit}>Chưa gán QL VC</MetaChip>
                  )}
                  {installLabel ? (
                    <MetaChip tone="teal" icon="🔧" title="Lịch lắp đặt — bấm để sửa" onClick={openEdit}>{installLabel}</MetaChip>
                  ) : (
                    <MetaChip tone="amber" icon="🔧" title="Nhập lịch lắp đặt" onClick={openEdit}>Chưa có lịch lắp</MetaChip>
                  )}
                  {pickupLabel ? (
                    <MetaChip tone="sky" icon="📦" title="Lịch lấy hàng — bấm để sửa" onClick={openEdit}>Lấy {pickupLabel}</MetaChip>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {sxScheduleEdit && (
        <OverlayPortal
          open
          size="xl"
          closeOnBackdrop={!sxScheduleBusy && !sxScheduleAssigningVc}
          onClose={closeSxScheduleEdit}
          panelClassName="p-5 space-y-3 overflow-y-auto"
        >
          <div className="flex items-start justify-between gap-2 shrink-0">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Sửa lịch lắp đặt</h3>
              <p className="text-xs text-gray-500 mt-1">
                {sxScheduleEdit.code || 'Dự án'} — gán người quản lý vận chuyển, công ty VC/LĐ, ngày lắp / lấy hàng.
              </p>
            </div>
            <button type="button" disabled={sxScheduleBusy || sxScheduleAssigningVc} onClick={closeSxScheduleEdit} className="p-1 cursor-pointer disabled:opacity-40">
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
            <div className="space-y-3 min-w-0">
              <label className="text-[10px] font-semibold text-gray-700 block">
                Công ty vận chuyển / lắp đặt
                <select
                  value={sxScheduleEdit.logisticsCompanyId || ''}
                  disabled={sxScheduleBusy || sxScheduleAssigningVc}
                  onChange={(e) => {
                    const nextCid = e.target.value;
                    setSxScheduleEdit((s) => ({ ...s, logisticsCompanyId: nextCid }));
                    if (!nextCid) return;
                    api.get(`/logistics/handover-settings/${nextCid}`)
                      .then((r) => {
                        const coUsers = r.data?.users || [];
                        if (!Array.isArray(coUsers) || !coUsers.length) return;
                        setSxScheduleVcUsers((prev) => {
                          const map = new Map();
                          for (const u of [...coUsers, ...(prev || [])]) {
                            if (u?.id) map.set(String(u.id), u);
                          }
                          return [...map.values()].sort((a, b) =>
                            String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi'));
                        });
                      })
                      .catch(() => {});
                  }}
                  className="mt-0.5 w-full h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white"
                >
                  <option value="">— Chưa chọn công ty VC/LĐ —</option>
                  {sxScheduleLogisticsCompanies.map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>{c.short_name || c.name}</option>
                  ))}
                </select>
              </label>

              <label className="text-[10px] font-semibold text-gray-700 block">
                <span className="inline-flex items-center gap-1">
                  <Truck className="h-3 w-3 text-orange-500" /> Người quản lý vận chuyển
                </span>
                <select
                  value={sxScheduleEdit.logisticsPersonId || ''}
                  disabled={sxScheduleBusy || sxScheduleAssigningVc}
                  onChange={(e) => { void assignVcManagerOnDeal(e.target.value); }}
                  className="mt-0.5 w-full h-9 px-2 border border-orange-200 rounded-lg text-sm bg-orange-50/50"
                >
                  <option value="">— Chưa gán — chọn để thêm và gửi thông báo —</option>
                  {sxScheduleVcUsers.map((u) => (
                    <option key={String(u.id)} value={String(u.id)}>{u.full_name || u.email || u.id}</option>
                  ))}
                </select>
                <span className="mt-0.5 block text-[10px] font-normal text-orange-700/90">
                  {sxScheduleAssigningVc
                    ? 'Đang gán và gửi thông báo…'
                    : 'Chọn người sẽ thêm vào thành viên deal và gửi thông báo ngay.'}
                </span>
              </label>

              <label className="text-[10px] font-semibold text-gray-700 block">
                Ghi chú cho bên vận chuyển / lắp đặt
                <textarea
                  rows={2}
                  value={sxScheduleEdit.vcNotes || ''}
                  disabled={sxScheduleBusy}
                  onChange={(e) => setSxScheduleEdit((s) => ({ ...s, vcNotes: e.target.value }))}
                  placeholder="VD: hàng dễ vỡ, gọi trước 30 phút, thang máy nhỏ…"
                  className="mt-0.5 w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white resize-y"
                />
              </label>

              <div className="rounded-lg border border-teal-100 bg-teal-50/40 px-2.5 py-2 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-teal-800">
                  Deadline lắp đặt (VC/LĐ) &amp; hoàn thiện (SX)
                </p>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-700 block mb-1">
                      Ngày lắp đặt <span className="font-normal text-teal-600">(deadline VC/LĐ · có thể nhiều ngày)</span>
                    </label>
                    <MultiDayDatePicker
                      accent="teal"
                      disabled={sxScheduleBusy}
                      selectedYmds={
                        Array.isArray(sxScheduleEdit.installOccurrenceDates)
                          && sxScheduleEdit.installOccurrenceDates.length
                          ? sxScheduleEdit.installOccurrenceDates
                          : (sxScheduleEdit.installYmd ? [sxScheduleEdit.installYmd] : [])
                      }
                      onChange={(ymds) => {
                        const occ = normalizeInstallOccYmds(ymds);
                        setSxScheduleEdit((s) => ({
                          ...s,
                          installOccurrenceDates: occ,
                          installYmd: occ[0] || '',
                          pickupLocal: s.pickupLocal || (occ[0] ? `${occ[0]}T08:00` : ''),
                        }));
                      }}
                      anchorYmd={sxScheduleEdit.installYmd || undefined}
                      hint="Bấm chọn từng ngày lắp — liên tiếp hoặc cách ngày (1, 3, 5…)"
                    />
                    {(Array.isArray(sxScheduleEdit.installOccurrenceDates)
                      ? sxScheduleEdit.installOccurrenceDates
                      : []).length > 0 ? (
                      <p className="mt-1.5 text-[11px] text-teal-900 font-medium">
                        Đã chọn{' '}
                        <strong>{sxScheduleEdit.installOccurrenceDates.length} ngày</strong>
                        {': '}
                        {formatYmdListVi(sxScheduleEdit.installOccurrenceDates)}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-gray-700 block">Giờ lắp đặt</span>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <ShiftQuickPick
                        tone="teal"
                        hm={sxScheduleEdit.installTime || ''}
                        disabled={sxScheduleBusy || !(
                          (Array.isArray(sxScheduleEdit.installOccurrenceDates)
                            && sxScheduleEdit.installOccurrenceDates.length)
                          || sxScheduleEdit.installYmd
                        )}
                        onPick={(hm) => setSxScheduleEdit((s) => ({ ...s, installTime: hm }))}
                      />
                      <input
                        type="time"
                        value={sxScheduleEdit.installTime}
                        disabled={sxScheduleBusy || !(
                          (Array.isArray(sxScheduleEdit.installOccurrenceDates)
                            && sxScheduleEdit.installOccurrenceDates.length)
                          || sxScheduleEdit.installYmd
                        )}
                        onChange={(e) => setSxScheduleEdit((s) => ({ ...s, installTime: e.target.value }))}
                        title="Giờ khác — nhập trực tiếp"
                        className="w-[7.5rem] h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white tabular-nums"
                      />
                    </div>
                  </div>
                </div>
                <label className="text-[10px] font-semibold text-indigo-700 block">
                  Ngày hoàn thiện
                  <span className="font-normal text-indigo-500"> (deadline tổng dự án SX = lắp đầu − 2)</span>
                  <input
                    type="date"
                    value={sxScheduleEdit.installYmd ? (subtractCalendarDaysYmd(sxScheduleEdit.installYmd, 2) || '') : ''}
                    readOnly
                    disabled
                    className="mt-0.5 w-full h-9 px-2 border border-indigo-200 rounded-lg text-sm bg-indigo-50 text-indigo-900 font-semibold"
                  />
                </label>
              </div>

              <div className="rounded-lg border border-sky-100 bg-sky-50/50 px-2.5 py-2 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-sky-800">Lấy hàng (VC)</p>
                <div>
                  <span className="text-[10px] font-semibold text-gray-700 block">
                    Thời gian lấy hàng tại xưởng <span className="font-normal text-gray-400">(không bắt buộc)</span>
                  </span>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <ShiftQuickPick
                      tone="sky"
                      hm={String(sxScheduleEdit.pickupLocal || '').match(/T(\d{2}:\d{2})/)?.[1] || ''}
                      disabled={sxScheduleBusy}
                      onPick={(hm) => setSxScheduleEdit((s) => {
                        const ymd = String(s.pickupLocal || '').slice(0, 10) || s.installYmd || '';
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return s;
                        return { ...s, pickupLocal: `${ymd}T${hm}` };
                      })}
                    />
                    <input
                      type="datetime-local"
                      value={sxScheduleEdit.pickupLocal}
                      disabled={sxScheduleBusy}
                      onChange={(e) => setSxScheduleEdit((s) => ({ ...s, pickupLocal: e.target.value }))}
                      title="Ngày giờ khác — nhập trực tiếp"
                      className="w-[13rem] h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {sxScheduleErr && <p className="text-xs text-red-600">{sxScheduleErr}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={sxScheduleBusy || sxScheduleAssigningVc}
                  onClick={closeSxScheduleEdit}
                  className="flex-1 h-10 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={sxScheduleBusy || sxScheduleAssigningVc}
                  onClick={() => submitSxScheduleEdit()}
                  className="flex-1 h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                >
                  {sxScheduleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {sxScheduleBusy ? 'Đang lưu…' : 'Lưu lịch'}
                </button>
              </div>
            </div>

            <div className="min-w-0 rounded-xl border-2 border-orange-200 overflow-hidden bg-orange-50/30">
              <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-orange-900 border-b border-orange-100 bg-orange-50">
                Lịch sự kiện VC/LĐ
              </p>
              <VcHandoverEventsPopup
                embedded
                opsScheduleOnly
                leadId={dealId}
                projectId={sxScheduleEdit.projectId || null}
                companyId={sxScheduleEdit.logisticsCompanyId || null}
                focusDate={
                  (sxScheduleEdit.installYmd
                    ? `${sxScheduleEdit.installYmd}T${sxScheduleEdit.installTime || '14:00'}`
                    : null)
                  || sxScheduleEdit.pickupLocal
                  || null
                }
                pickMode
                pickTarget="both"
                anchorPickupAt={sxScheduleEdit.pickupLocal || null}
                anchorInstallAt={
                  sxScheduleEdit.installYmd
                    ? `${sxScheduleEdit.installYmd}T${sxScheduleEdit.installTime || '14:00'}`
                    : null
                }
                anchorInstallOccurrenceDates={
                  Array.isArray(sxScheduleEdit.installOccurrenceDates)
                    ? sxScheduleEdit.installOccurrenceDates
                    : (sxScheduleEdit.installYmd ? [sxScheduleEdit.installYmd] : [])
                }
                anchorFinishAt={
                  sxScheduleEdit.installYmd
                    ? (() => {
                      const finish = subtractCalendarDaysYmd(sxScheduleEdit.installYmd, 2);
                      return finish ? `${finish}T17:00` : null;
                    })()
                    : null
                }
                onPickDates={({ pickupAt, installAt, installOccurrenceDates: occFromCal }) => {
                  setSxScheduleEdit((s) => {
                    if (!s) return s;
                    const next = { ...s };
                    if (pickupAt) next.pickupLocal = String(pickupAt).slice(0, 16);
                    const occ = [...new Set(
                      (Array.isArray(occFromCal) ? occFromCal : [])
                        .map((d) => String(d || '').slice(0, 10))
                        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
                    )].sort();
                    if (occ.length) {
                      next.installOccurrenceDates = occ;
                      next.installYmd = occ[0];
                      if (installAt) {
                        const tm = String(installAt).match(/T(\d{2}:\d{2})/);
                        if (tm) next.installTime = tm[1];
                      }
                    } else if (installAt) {
                      const day = String(installAt).slice(0, 10);
                      const tm = String(installAt).match(/T(\d{2}:\d{2})/);
                      next.installYmd = day;
                      next.installTime = tm ? tm[1] : (s.installTime || '14:00');
                      next.installOccurrenceDates = day ? [day] : [];
                    }
                    return next;
                  });
                }}
                onPickDate={(local) => {
                  const day = String(local || '').slice(0, 10);
                  const tm = String(local || '').match(/T(\d{2}:\d{2})/);
                  if (!day) return;
                  setSxScheduleEdit((s) => (s ? {
                    ...s,
                    installYmd: day,
                    installTime: tm ? tm[1] : (s.installTime || '14:00'),
                    installOccurrenceDates: [day],
                    pickupLocal: s.pickupLocal || `${day}T08:00`,
                  } : s));
                }}
                onClose={() => {}}
              />
            </div>
          </div>
        </OverlayPortal>
      )}

      {addSxOpen && canAdd && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[200] p-4"
          onClick={() => { if (!addSxBusy) { setAddSxOpen(false); setAddSxErr(''); setAddSxTargets([]); } }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 pb-3 shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-6 w-6 text-teal-600" />
                <h3 className="text-lg font-bold text-gray-900">Thêm dự án SX</h3>
              </div>
              <p className="text-sm text-gray-600">
                Tạo thêm thẻ Kanban tại xưởng khác (vd. tủ ở HCB khi đã có cửa ở Phúc Đạt). Có thể gắn ngày lắp, công ty VC/LĐ và thời gian lấy hàng.
              </p>
            </div>
            <div className="px-6 flex-1 min-h-0 overflow-y-auto">
              <SxMultiTargetPicker
                key="add-sx-wu"
                companies={addSxCompaniesForSelect}
                leadTypeRow={addSxLeadTypeRow}
                kind={addSxKind}
                accent="teal"
                showDates
                showVcSetup
                leadId={dealId}
                disabled={addSxBusy}
                onChange={(next) => { setAddSxTargets(next); setAddSxErr(''); }}
              />
              {addSxErr && <p className="text-xs text-red-600 mt-2">{addSxErr}</p>}
            </div>
            <div className="flex gap-2 p-6 pt-4 shrink-0 border-t border-gray-100 bg-white rounded-b-2xl">
              <button
                type="button"
                disabled={addSxBusy}
                className="flex-1 h-10 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                onClick={() => { setAddSxOpen(false); setAddSxErr(''); setAddSxTargets([]); }}
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={addSxBusy || !!validateSxTargets(addSxTargets)}
                className="flex-1 h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold disabled:opacity-40"
                onClick={() => submitAddSxProject()}
              >
                {addSxBusy ? 'Đang tạo…' : 'Thêm dự án'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
