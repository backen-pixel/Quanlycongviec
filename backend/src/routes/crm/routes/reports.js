/**
 * CRM Reports — BC nhân viên, org-overview, deal-stage-report-buckets.
 */
const { Router } = require('express');
const { supabase } = require('../../../config/supabase');
const {
  normalizeCrmUserRole,
  userSeesAllCrmDealsForScope,
  userSeesAllCrmLeadsForScope,
} = require('../../../helpers/crmAccessRoles');
const {
  applyCrmLeadRegionFilterToQuery,
  assertRegionBelongsToCompany,
} = require('../../../helpers/crmRegionScope');
const { effectivePipelineStageSlaDays } = require('../../../helpers/crmPipelineSla');
const { pipeStaffLeadDealSummaryPdf, pipeStaffPipelineDetailPdf } = require('../../../helpers/staffLeadDealReportPdf');
const { pipeOrgOverviewReportPdf } = require('../../../helpers/orgOverviewReportPdf');
const { userIsAdmin, scopedAdminCompanyId, requireUserCompanyId } = require('../shared/requestScope');
const { STAFF_LEAD_DEAL_REPORT_ROLES } = require('../shared/reportRoles');

const r = Router();

const CRM_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function endOfCalendarDayAfterEntered(startIso, slaDays) {
  const base = startIso ? new Date(startIso) : new Date();
  const d = new Date(base);
  d.setDate(d.getDate() + Math.max(1, slaDays));
  d.setHours(23, 59, 59, 999);
  return d;
}

function defaultKpiLedgerMonthStartYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return y + '-' + m + '-01';
}

/** Gom lead/deal đủ trường cho báo cáo tổ chức (công ty / khu vực / NV). */
async function fetchCrmLeadsForOrgReportBatched(type, {
  company_id, region_id, date_from, date_to, assigned_to_only, assigned_to_user, req,
}, pageSize = 1000) {
  const { listCrmModuleCompanyIds } = require('../../../helpers/crmModuleCompanies');
  const crmCompanyIds = company_id ? null : await listCrmModuleCompanyIds();
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase
      .from('crm_leads')
      .select('id, stage_id, estimated_value, probability, type, assigned_to, lead_owner_id, company_id, region_id, created_at, source_id, stage_entered_at, first_touch_time, lead_type_id')
      .eq('type', type)
      .is('parent_lead_id', null);
    if (company_id) {
      const { isCrmAccountingUser } = require('../../helpers/crmAccessRoles');
      const { applyAccountingCrmCompanyFilter } = require('../../helpers/accountingScope');
      if (req?.user && isCrmAccountingUser(req.user)) {
        q = applyAccountingCrmCompanyFilter(q, company_id);
      } else {
        q = q.eq('company_id', company_id);
      }
    } else if (crmCompanyIds?.length) {
      q = q.in('company_id', crmCompanyIds);
    }
    if (region_id) q = q.eq('region_id', region_id);
    if (req) q = applyCrmLeadRegionFilterToQuery(q, req);
    if (assigned_to_only) {
      if (type === 'lead') {
        q = q.or(`assigned_to.eq.${assigned_to_only},lead_owner_id.eq.${assigned_to_only}`);
      } else {
        q = q.eq('assigned_to', assigned_to_only);
      }
    } else if (assigned_to_user) {
      if (type === 'lead') {
        q = q.or(`assigned_to.eq.${assigned_to_user},lead_owner_id.eq.${assigned_to_user}`);
      } else {
        q = q.eq('assigned_to', assigned_to_user);
      }
    }
    if (date_from) q = q.gte('created_at', date_from);
    if (date_to) q = q.lte('created_at', date_to + 'T23:59:59.999Z');
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function parseCrmReportDateRange(req) {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const endCal = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const defaultTo = `${endCal.getFullYear()}-${pad(endCal.getMonth() + 1)}-${pad(endCal.getDate())}`;
  const isoFrom = (v) => {
    if (!v || typeof v !== 'string') return null;
    const m = v.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  };
  return {
    df: isoFrom(req.query?.date_from) || defaultFrom,
    dt: isoFrom(req.query?.date_to) || defaultTo,
  };
}

/** Phạm vi công ty + khu vực cho báo cáo CRM. Trả null nếu đã gửi response lỗi. */
async function resolveCrmReportScope(req, res) {
  const rawC = req.query.company_id && String(req.query.company_id).trim()
    ? String(req.query.company_id).trim()
    : null;
  let effectiveCompanyId = rawC;
  const sacDash = scopedAdminCompanyId(req);
  if (sacDash) {
    effectiveCompanyId = sacDash;
  } else if (!userIsAdmin(req.user?.role)) {
    const cid = requireUserCompanyId(req, res);
    if (!cid) return null;
    effectiveCompanyId = cid;
  }

  const rawRegionQ = req.query.region_id && String(req.query.region_id).trim();
  let explicitRegionId = rawRegionQ && CRM_UUID_RE.test(rawRegionQ) ? rawRegionQ : null;

  if (explicitRegionId && !effectiveCompanyId) {
    const { data: regRow, error: regErr } = await supabase
      .from('company_regions')
      .select('company_id')
      .eq('id', explicitRegionId)
      .maybeSingle();
    if (regErr) throw regErr;
    if (!regRow?.company_id) {
      res.status(400).json({ error: 'Khu vực không tồn tại' });
      return null;
    }
    effectiveCompanyId = String(regRow.company_id);
  }

  if (explicitRegionId && effectiveCompanyId) {
    const v = await assertRegionBelongsToCompany(supabase, effectiveCompanyId, explicitRegionId);
    if (!v.ok) {
      res.status(400).json({ error: v.error });
      return null;
    }
  }

  return { effectiveCompanyId: effectiveCompanyId || null, explicitRegionId };
}

/** Tháng KPI (YYYY-MM-01) theo đồng hồ máy chủ — khớp mặc định tab «Điểm KPI» trên chi tiết lead. */
function defaultKpiLedgerMonthStartYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/**
 * Tổng điểm ròng sổ cái KPI (crm_kpi_ledger) theo từng lead_id trong kỳ.
 * Gom theo chunk vì .in() và phân trang tránh trần PostgREST.
 * @param {{ userId?: string|null }} [opts] — Khi có `userId`, chỉ cộng điểm của nhân viên đó (khớp bộ lọc NV trên dashboard).
 */
async function sumCrmKpiLedgerNetByLeadIds(leadIds, periodStart, periodType = 'monthly', opts = {}) {
  const sums = Object.create(null);
  if (!leadIds?.length || !periodStart) return sums;
  const userId = opts.userId && String(opts.userId).trim() ? String(opts.userId).trim() : null;
  const uniq = [...new Set(leadIds.map((x) => String(x)))];
  const CHUNK = 150;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const part = uniq.slice(i, i + CHUNK);
    let from = 0;
    const PAGE = 1000;
    for (;;) {
      let q = supabase
        .from('crm_kpi_ledger')
        .select('lead_id, points')
        .in('lead_id', part)
        .eq('period_type', periodType)
        .eq('period_start', periodStart);
      if (userId) q = q.eq('user_id', userId);
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      for (const r of rows) {
        const lid = r.lead_id;
        if (!lid) continue;
        const k = String(lid);
        sums[k] = (sums[k] || 0) + Number(r.points || 0);
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }
  for (const k of Object.keys(sums)) {
    sums[k] = Math.round(sums[k] * 100) / 100;
  }
  return sums;
}

/** Tháng KPI (YYYY-MM-01) theo ngày bắt đầu báo cáo. */
function orgReportKpiPeriodStart(dateFromYmd) {
  if (dateFromYmd && /^\d{4}-\d{2}-\d{2}$/.test(String(dateFromYmd).slice(0, 10))) {
    return `${String(dateFromYmd).slice(0, 7)}-01`;
  }
  return defaultKpiLedgerMonthStartYmd();
}

/** Tổng điểm ròng crm_kpi_ledger theo user_id trong kỳ. */
async function sumCrmKpiLedgerNetByUserIds(userIds, periodStart, periodType = 'monthly') {
  const sums = Object.create(null);
  if (!userIds?.length || !periodStart) return sums;
  const uniq = [...new Set(userIds.map((x) => String(x)))];
  const CHUNK = 80;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const part = uniq.slice(i, i + CHUNK);
    let from = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await supabase
        .from('crm_kpi_ledger')
        .select('user_id, points')
        .in('user_id', part)
        .eq('period_type', periodType)
        .eq('period_start', periodStart)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      for (const r of rows) {
        if (!r.user_id) continue;
        const k = String(r.user_id);
        sums[k] = (sums[k] || 0) + Number(r.points || 0);
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }
  for (const k of Object.keys(sums)) {
    sums[k] = Math.round(sums[k] * 100) / 100;
  }
  return sums;
}

/** Lead/deal của đúng một user — dùng BC chi tiết theo pipeline (tránh trần 1000 dòng). */
async function fetchCrmLeadsForUserDetailBatched(userId, type, { company_id, region_id, date_from, date_to, req }, pageSize = 1000) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase
      .from('crm_leads')
      .select('id, pipeline_id, stage_id, estimated_value, probability, type, created_at, stage_entered_at, lead_type_id, first_touch_time, assigned_to, lead_owner_id, company_id, region_id, source_id')
      .eq('type', type)
      .is('parent_lead_id', null);
    if (company_id) q = q.eq('company_id', company_id);
    if (region_id) q = q.eq('region_id', region_id);
    if (req) q = applyCrmLeadRegionFilterToQuery(q, req);
    q = q.or(`assigned_to.eq.${userId},lead_owner_id.eq.${userId}`);
    if (date_from) q = q.gte('created_at', date_from);
    if (date_to) q = q.lte('created_at', date_to + 'T23:59:59.999Z');
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}
function emptyStaffLeadDealAgg() {
  return {
    lead_count: 0,
    lead_pipeline_value: 0,
    deal_count: 0,
    deal_pipeline_value: 0,
    won_deal_count: 0,
    won_value: 0,
    lost_deal_count: 0,
    lost_value: 0,
    lost_lead_count: 0,
    expected_value: 0,
    weighted_value: 0,
    completed_deal_count: 0,
    completed_value: 0,
    open_count: 0,
    overdue_count: 0,
    reception_eligible_count: 0,
    reception_overdue_count: 0,
    first_stage_open_count: 0,
    first_stage_on_time_count: 0,
    first_stage_overdue_count: 0,
    kpi_ledger_net: 0,
    quote_deal_count: 0,
    quote_value: 0,
    won_or_later_deal_count: 0,
    won_or_later_value: 0,
    customer_order_count: 0,
    customer_order_value: 0,
  };
}

/** Slug mặc định = giai đoạn trước ký HĐ (khi chưa cấu hình deal_report_bucket) */
const DEAL_PRE_CONTRACT_SLUGS_STAFF = new Set([
  'designing',
  'quoted',
  'negotiating',
  'waiting_deposit',
]);

/**
 * Phân loại cột Deal cho BC Lead/Deal theo NV.
 * `deal_report_bucket` trên crm_pipeline_stages ghi đè; is_lost luôn ưu tiên thua.
 * @returns {'lost'|'project_completed'|'implementation'|'pre_contract'}
 */
function classifyDealStageForStaffReport(st, slug) {
  if (!st) return 'pre_contract';
  const slugStr = slug || null;
  if (st.is_lost || slugStr === 'lost') return 'lost';

  const bucket = st.deal_report_bucket || null;
  if (bucket === 'lost') return 'lost';
  if (bucket === 'completed') return 'project_completed';
  if (bucket === 'implementation') return 'implementation';
  if (bucket === 'pre_contract') return 'pre_contract';

  if (slugStr === 'completed') return 'project_completed';
  if ((slugStr && DEAL_PRE_CONTRACT_SLUGS_STAFF.has(slugStr)) || (!slugStr && !st.is_won)) return 'pre_contract';
  return 'implementation';
}

/** Trả về { df, dt, effectiveCompanyId, rows } hoặc null (đã gửi response lỗi). */
async function computeStaffLeadDealReportData(req, res) {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Không có quyền xem báo cáo này' });
      return null;
    }

    const { department_id, q } = req.query;
    const scope = await resolveCrmReportScope(req, res);
    if (!scope) return null;
    const { effectiveCompanyId, explicitRegionId } = scope;

    // ── Filter type: 'all' | 'lead' | 'deal' ──
    const rawType = String(req.query.type || 'all').toLowerCase();
    const typeView = rawType === 'lead' || rawType === 'deal' ? rawType : 'all';

    const { df, dt } = parseCrmReportDateRange(req);

    const numEst = (x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    };

    const dealAssigneeOnly =
      req.user?.userId && !userSeesAllCrmDealsForScope(req.user) ? req.user.userId : null;
    const leadAssigneeOnly =
      req.user?.userId && !userSeesAllCrmLeadsForScope(req.user) ? req.user.userId : null;

    const skipLeads = typeView === 'deal';
    const skipDeals = typeView === 'lead';
    const fetchOpts = {
      company_id: effectiveCompanyId || undefined,
      region_id: explicitRegionId || undefined,
      date_from: df,
      date_to: dt,
      req,
    };
    const [leadRows, dealRows] = await Promise.all([
      skipLeads ? Promise.resolve([]) : fetchCrmLeadsForDashboardBatched('lead', {
        ...fetchOpts,
        assigned_to_only: leadAssigneeOnly,
      }),
      skipDeals ? Promise.resolve([]) : fetchCrmLeadsForDashboardBatched('deal', {
        ...fetchOpts,
        assigned_to_only: dealAssigneeOnly,
      }),
    ]);

    const stageIds = [...new Set(
      [...leadRows, ...dealRows].map((l) => l.stage_id).filter(Boolean),
    )];
    let stageMap = {};
    if (stageIds.length) {
      const { data: stages } = await supabase
        .from('crm_pipeline_stages')
        .select('id, is_won, is_lost')
        .in('id', stageIds);
      stageMap = Object.fromEntries((stages || []).map((s) => [s.id, s]));
    }

    const UNASSIGNED = '__unassigned__';
    const agg = {};

    const ownerId = (row) => String(row.assigned_to || row.lead_owner_id || '').trim() || null;

    const bump = (uid, patch) => {
      const key = uid || UNASSIGNED;
      if (!agg[key]) agg[key] = emptyStaffLeadDealAgg();
      Object.assign(agg[key], patch(agg[key]));
    };

    for (const l of leadRows) {
      const uid = ownerId(l);
      const v = numEst(l.estimated_value);
      bump(uid, (a) => ({
        lead_count: a.lead_count + 1,
        lead_pipeline_value: a.lead_pipeline_value + v,
      }));
    }

    for (const l of dealRows) {
      const uid = ownerId(l);
      const v = numEst(l.estimated_value);
      const st = l.stage_id ? stageMap[l.stage_id] : null;
      bump(uid, (a) => {
        const n = { ...a };
        n.deal_count += 1;
        n.deal_pipeline_value += v;
        if (st?.is_won) {
          n.won_deal_count += 1;
          n.won_value += v;
        }
        if (st?.is_lost) {
          n.lost_deal_count += 1;
          n.lost_value += v;
        }
        return n;
      });
    }

    if (department_id && String(department_id).trim()) {
      const depId = String(department_id).trim();
      if (effectiveCompanyId) {
        const { data: dep } = await supabase
          .from('departments')
          .select('id, company_id')
          .eq('id', depId)
          .maybeSingle();
        if (!dep || String(dep.company_id) !== String(effectiveCompanyId)) {
          res.status(400).json({ error: 'Phòng ban không thuộc công ty đang chọn' });
          return null;
        }
      }
      const { data: deptUsers } = await supabase
        .from('users')
        .select('id')
        .eq('department_id', depId)
        .neq('is_active', false);
      for (const u of deptUsers || []) {
        if (!agg[u.id]) agg[u.id] = emptyStaffLeadDealAgg();
      }
      const allowed = new Set((deptUsers || []).map((u) => u.id));
      for (const k of Object.keys(agg)) {
        if (k === UNASSIGNED) continue;
        if (!allowed.has(k)) delete agg[k];
      }
      delete agg[UNASSIGNED];
    }

    const userIds = Object.keys(agg).filter((k) => k !== UNASSIGNED);
    let userMap = {};
    if (userIds.length) {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, email, department_id, department:departments!users_department_id_fkey(id, name, company_id)')
        .in('id', userIds);
      userMap = Object.fromEntries((users || []).map((u) => [u.id, u]));
    }

    let rows = Object.entries(agg).map(([uidKey, m]) => {
      if (uidKey === UNASSIGNED) {
        return {
          user_id: null,
          full_name: 'Chưa gán phụ trách',
          email: null,
          department_name: null,
          ...m,
        };
      }
      const u = userMap[uidKey];
      return {
        user_id: uidKey,
        full_name: u?.full_name || uidKey,
        email: u?.email || null,
        department_name: u?.department?.name || null,
        ...m,
      };
    });

    const qTerm = q && String(q).trim().toLowerCase();
    if (qTerm) {
      rows = rows.filter((r) => {
        const name = (r.full_name || '').toLowerCase();
        const em = (r.email || '').toLowerCase();
        return name.includes(qTerm) || em.includes(qTerm);
      });
    }

    rows.sort((a, b) => (b.won_value || 0) - (a.won_value || 0)
      || (b.deal_pipeline_value || 0) - (a.deal_pipeline_value || 0));

    return { df, dt, effectiveCompanyId, explicitRegionId, rows, typeView };
  } catch (e) {
    console.error('computeStaffLeadDealReportData:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
    return null;
  }
}

function orgReportDayKey(row) {
  const raw = row?.created_at;
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function orgReportOwnerId(row) {
  return String(row.assigned_to || row.lead_owner_id || '').trim() || null;
}

function orgReportConversionRate(wonCount, dealCount) {
  return dealCount > 0 ? Math.round((wonCount / dealCount) * 100) : 0;
}

function orgReportPreviousPeriod(df, dt) {
  const parse = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const from = parse(df);
  const to = parse(dt);
  const dayMs = 86400000;
  const days = Math.max(1, Math.round((to - from) / dayMs) + 1);
  const prevTo = new Date(from.getTime() - dayMs);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * dayMs);
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { prevFrom: fmt(prevFrom), prevTo: fmt(prevTo), days };
}

function orgReportPctDelta(cur, prev) {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  if (p === 0) return c > 0 ? 100 : 0;
  return Math.round(((c - p) / p) * 100);
}

function orgReportCompareSummary(current, previous) {
  const metrics = [
    'lead_count', 'deal_count', 'pipeline_value', 'won_deal_count', 'won_value',
    'quote_deal_count', 'quote_value', 'won_or_later_deal_count', 'won_or_later_value',
    'customer_order_count', 'customer_order_value',
    'expected_value', 'weighted_value', 'completed_deal_count', 'completed_value',
    'overdue_count', 'kpi_ledger_net', 'reception_overdue_count',
  ];
  const out = {};
  for (const key of metrics) {
    const c = Number(current?.[key]) || 0;
    const p = Number(previous?.[key]) || 0;
    out[key] = {
      previous: p,
      delta: Math.round(c - p),
      pct: orgReportPctDelta(c, p),
    };
  }
  out.conversion_rate = {
    previous: Number(previous?.conversion_rate) || 0,
    delta: (Number(current?.conversion_rate) || 0) - (Number(previous?.conversion_rate) || 0),
    pct: null,
  };
  return out;
}

function orgReportNumEst(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function buildPipelineStagesMap(stageMap) {
  const byPipe = {};
  for (const st of Object.values(stageMap || {})) {
    const pid = st.pipeline_id ? String(st.pipeline_id) : '__none__';
    if (!byPipe[pid]) byPipe[pid] = [];
    byPipe[pid].push(st);
  }
  return byPipe;
}

function pipelineHasExplicitExpected(stagesInPipe) {
  return (stagesInPipe || []).some((s) => !!s.counts_as_expected_revenue);
}

function pipelineHasExplicitCompleted(stagesInPipe) {
  return (stagesInPipe || []).some((s) => !!s.counts_as_completed_revenue);
}

function pipelineHasExplicitWon(stagesInPipe) {
  return (stagesInPipe || []).some((s) => !!s.counts_as_won_revenue);
}

function orgReportDealProbability(dealRow, st) {
  const raw = dealRow?.probability;
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
  }
  const fb = st?.default_probability;
  if (fb != null && fb !== '') {
    const n = Number(fb);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
  }
  return 50;
}

function orgReportDealIsCompleted(st, stagesInPipe) {
  if (!st) return false;
  const slug = st.canonical_slug || null;
  if (st.is_lost || slug === 'lost' || st.deal_report_bucket === 'lost') return false;
  if (pipelineHasExplicitCompleted(stagesInPipe)) return !!st.counts_as_completed_revenue;
  return classifyDealStageForStaffReport(st, slug) === 'project_completed';
}

function orgReportDealCountsExpected(st, stagesInPipe) {
  if (!st || st.is_lost) return false;
  const slug = st.canonical_slug || null;
  if (pipelineHasExplicitExpected(stagesInPipe)) return !!st.counts_as_expected_revenue;
  if (st.is_won) return false;
  if (orgReportDealIsCompleted(st, stagesInPipe)) return false;
  if (st.deal_report_bucket === 'lost' || st.deal_report_bucket === 'completed') return false;
  if (slug === 'completed' || slug === 'lost') return false;
  return true;
}

/**
 * Deal đã chốt = cột Thắng trở về sau (ký HĐ, SX, lắp đặt, hoàn thành).
 * Hoàn thành và chốt là một — không tách riêng.
 */
function buildWonStageOrderByPipeline(stageMap) {
  const byPipe = {};
  for (const st of Object.values(stageMap || {})) {
    if (!st?.pipeline_id || st.pipeline_type !== 'deal') continue;
    if (st.is_lost || st.canonical_slug === 'lost' || st.deal_report_bucket === 'lost') continue;
    const pid = String(st.pipeline_id);
    const ord = Number(st.order_index);
    const order = Number.isFinite(ord) ? ord : 999;
    const isWonAnchor = !!st.is_won
      || !!st.counts_as_won_revenue
      || st.canonical_slug === 'contract_signed'
      || st.deal_report_bucket === 'won';
    if (!isWonAnchor) continue;
    if (!Number.isFinite(byPipe[pid]) || order < byPipe[pid]) {
      byPipe[pid] = order;
    }
  }
  return byPipe;
}

function orgReportDealSplitBuckets(st, wonStageOrderByPipe) {
  if (!st) return { inDealTab: true, inCustomerTab: false };
  if (st.is_lost || st.canonical_slug === 'lost' || st.deal_report_bucket === 'lost') {
    return { inDealTab: true, inCustomerTab: false };
  }
  const pid = st.pipeline_id ? String(st.pipeline_id) : null;
  const ordRaw = Number(st.order_index);
  const ord = Number.isFinite(ordRaw) ? ordRaw : 999;
  const anchor = pid ? wonStageOrderByPipe?.[pid] : null;
  if (!Number.isFinite(anchor)) return { inDealTab: true, inCustomerTab: false };
  return {
    inDealTab: ord < anchor,
    inCustomerTab: ord >= anchor,
  };
}

function orgReportDealIsClosedWon(st, wonStageOrderByPipe, stagesInPipe) {
  if (!st || st.is_lost) return false;
  const slug = st.canonical_slug || null;
  if (slug === 'lost' || st.deal_report_bucket === 'lost') return false;

  const pid = st.pipeline_id ? String(st.pipeline_id) : null;
  const ordRaw = Number(st.order_index);
  const ord = Number.isFinite(ordRaw) ? ordRaw : 999;
  if (pid && Number.isFinite(wonStageOrderByPipe?.[pid])) {
    return ord >= wonStageOrderByPipe[pid];
  }

  if (pipelineHasExplicitWon(stagesInPipe)) return !!st.counts_as_won_revenue;
  if (st.is_won) return true;
  if (orgReportDealIsCompleted(st, stagesInPipe)) return true;
  if (st.deal_report_bucket === 'implementation' || st.deal_report_bucket === 'completed') return true;
  if (slug === 'contract_signed' || slug === 'producing' || slug === 'installing' || slug === 'completed' || slug === 'won') {
    return true;
  }
  return false;
}

function orgReportExtendedDealMetrics(dealRow, st, stagesInPipe) {
  const v = orgReportNumEst(dealRow.estimated_value);
  const isWon = !!st?.is_won;
  const isLost = !!st?.is_lost;
  const isCompleted = orgReportDealIsCompleted(st, stagesInPipe);
  const countsExpected = orgReportDealCountsExpected(st, stagesInPipe);
  const pct = orgReportDealProbability(dealRow, st);
  return {
    value: v,
    isWon,
    isLost,
    expected_value: countsExpected ? v : 0,
    weighted_value: countsExpected ? Math.round((v * pct) / 100) : 0,
    completed_value: isCompleted ? v : 0,
    completed_deal_count: isCompleted ? 1 : 0,
  };
}

function orgReportStageIsClosed(st) {
  if (!st) return false;
  return !!st.is_won || !!st.is_lost;
}

function orgReportIsSlaOverdue(row, st) {
  if (!st || orgReportStageIsClosed(st)) return false;
  const slaDays = effectivePipelineStageSlaDays(st.sla_days);
  if (slaDays == null) return false;
  const entered = row.stage_entered_at || row.created_at;
  if (!entered) return false;
  const dueAt = endOfCalendarDayAfterEntered(entered, slaDays);
  return dueAt.getTime() < Date.now();
}

function orgReportBumpOpenOverdue(target, row, st) {
  if (orgReportStageIsClosed(st)) return;
  target.open_count += 1;
  if (orgReportIsSlaOverdue(row, st)) {
    target.overdue_count += 1;
  }
}

function orgReportOverdueRatePct(m) {
  const open = Number(m?.open_count) || 0;
  const overdue = Number(m?.overdue_count) || 0;
  if (!open) return null;
  return Math.round((overdue / open) * 1000) / 10;
}

function orgReportReceptionOverdueRatePct(m) {
  const eligible = Number(m?.reception_eligible_count) || 0;
  const overdue = Number(m?.reception_overdue_count) || 0;
  if (!eligible) return null;
  return Math.round((overdue / eligible) * 1000) / 10;
}

/** Cột đầu tiên (order_index nhỏ nhất) theo từng pipeline. */
function buildFirstStageIdByPipeline(stageMap) {
  const byPipe = {};
  for (const st of Object.values(stageMap || {})) {
    if (!st?.pipeline_id) continue;
    const pid = String(st.pipeline_id);
    const ord = Number(st.order_index);
    const order = Number.isFinite(ord) ? ord : 999;
    if (!byPipe[pid] || order < byPipe[pid].order) {
      byPipe[pid] = { stageId: String(st.id), order, stage: st };
    }
  }
  return byPipe;
}

/** order_index cột "Báo giá" (canonical_slug='quoted') theo từng pipeline Deal. */
function buildQuotedStageOrderByPipeline(stageMap) {
  const byPipe = {};
  for (const st of Object.values(stageMap || {})) {
    if (!st?.pipeline_id || st.pipeline_type !== 'deal') continue;
    if (st.canonical_slug !== 'quoted') continue;
    const pid = String(st.pipeline_id);
    const ord = Number(st.order_index);
    const order = Number.isFinite(ord) ? ord : 999;
    if (!Number.isFinite(byPipe[pid]) || order < byPipe[pid]) {
      byPipe[pid] = order;
    }
  }
  return byPipe;
}

function orgReportDealIsQuotedOrAfter(st, quotedStageOrderByPipe) {
  if (!st) return false;
  const pid = st.pipeline_id ? String(st.pipeline_id) : null;
  const ordRaw = Number(st.order_index);
  const ord = Number.isFinite(ordRaw) ? ordRaw : 999;
  if (pid && Number.isFinite(quotedStageOrderByPipe?.[pid])) {
    return ord >= quotedStageOrderByPipe[pid];
  }
  const slug = st.canonical_slug || null;
  if (slug && ['quoted', 'negotiating', 'waiting_deposit', 'contract_signed', 'producing', 'installing', 'completed', 'won'].includes(slug)) {
    return true;
  }
  if (st.is_won) return true;
  if (st.deal_report_bucket === 'implementation' || st.deal_report_bucket === 'completed') return true;
  return false;
}

function orgReportFirstStageOnTimeRatePct(m) {
  const open = Number(m?.first_stage_open_count) || 0;
  if (!open) return null;
  const onTime = Number(m?.first_stage_on_time_count) || 0;
  return Math.round((onTime / open) * 1000) / 10;
}

function orgReportFirstStageOverdueRatePct(m) {
  const open = Number(m?.first_stage_open_count) || 0;
  if (!open) return null;
  const overdue = Number(m?.first_stage_overdue_count) || 0;
  return Math.round((overdue / open) * 1000) / 10;
}

/** Lead/deal đang mở ở cột đầu pipeline — đúng hạn vs quá hạn SLA cột. */
function orgReportBumpFirstStageMetrics(target, row, stageMap, firstStageByPipe) {
  const st = row.stage_id ? stageMap[row.stage_id] : null;
  if (!st || orgReportStageIsClosed(st)) return;
  const pid = st.pipeline_id ? String(st.pipeline_id) : null;
  if (!pid) return;
  const first = firstStageByPipe[pid];
  if (!first || String(st.id) !== first.stageId) return;
  target.first_stage_open_count = (target.first_stage_open_count || 0) + 1;
  if (orgReportIsSlaOverdue(row, st)) {
    target.first_stage_overdue_count = (target.first_stage_overdue_count || 0) + 1;
  } else {
    target.first_stage_on_time_count = (target.first_stage_on_time_count || 0) + 1;
  }
}

function orgReportAttachFirstStageRates(m) {
  return {
    first_stage_on_time_rate_pct: orgReportFirstStageOnTimeRatePct(m),
    first_stage_overdue_rate_pct: orgReportFirstStageOverdueRatePct(m),
  };
}

/** Lead quá hạn tiếp nhận: chưa cham hoặc cham muộn hơn sla_minutes (wall-clock). */
function orgReportIsReceptionOverdue(leadRow, slaMinutes) {
  const createdRaw = leadRow?.created_at;
  if (!createdRaw) return false;
  const created = new Date(createdRaw).getTime();
  if (!Number.isFinite(created)) return false;
  const slaMs = Math.max(1, Number(slaMinutes) || 15) * 60 * 1000;
  const firstTouchRaw = leadRow?.first_touch_time;
  if (firstTouchRaw) {
    const touched = new Date(firstTouchRaw).getTime();
    if (!Number.isFinite(touched)) return false;
    return touched - created > slaMs;
  }
  return Date.now() - created > slaMs;
}

function orgReportBumpReceptionMetrics(target, leadRow, slaMinutes) {
  if (!leadRow || leadRow.type === 'deal') return;
  target.reception_eligible_count = (target.reception_eligible_count || 0) + 1;
  if (orgReportIsReceptionOverdue(leadRow, slaMinutes)) {
    target.reception_overdue_count = (target.reception_overdue_count || 0) + 1;
  }
}

async function orgReportReceptionSlaMinutes(_companyId) {
  const { positiveNumberParam } = require('../../helpers/kpiCalcParams');
  try {
    const { data } = await supabase
      .from('kpi_definitions')
      .select('calc_params')
      .eq('code', 'A1')
      .maybeSingle();
    const params = data?.calc_params && typeof data.calc_params === 'object' ? data.calc_params : {};
    return positiveNumberParam(params, 'sla_minutes', 15);
  } catch {
    return 15;
  }
}

function orgReportCancelRatePct(m) {
  const total = (Number(m?.lead_count) || 0) + (Number(m?.deal_count) || 0);
  if (!total) return null;
  const lost = (Number(m?.lost_lead_count) || 0) + (Number(m?.lost_deal_count) || 0);
  return Math.round((lost / total) * 1000) / 10;
}

function orgReportClosedWonDealCount(m) {
  return Number(m?.won_or_later_deal_count ?? m?.won_deal_count) || 0;
}

function orgReportClosedWonValue(m) {
  return Number(m?.won_or_later_value ?? m?.won_value) || 0;
}

function orgReportQuoteWinRatePct(m) {
  const quoteCount = Number(m?.quote_deal_count) || 0;
  const closedCount = orgReportClosedWonDealCount(m);
  if (!quoteCount) return null;
  return Math.round((closedCount / quoteCount) * 1000) / 10;
}

function orgReportQuoteValueCloseRatePct(m) {
  const quoteValue = Number(m?.quote_value) || 0;
  const closedValue = orgReportClosedWonValue(m);
  if (!quoteValue) return null;
  return Math.round((closedValue / quoteValue) * 1000) / 10;
}

/** Tỉ lệ giá trị chốt / tổng GT deal trong kỳ */
function orgReportDealCloseValueRatePct(m) {
  const dealValue = Number(m?.deal_pipeline_value) || 0;
  const closedValue = orgReportClosedWonValue(m);
  if (!dealValue) return null;
  return Math.round((closedValue / dealValue) * 1000) / 10;
}

function aggregateOrgReportRows(leadRows, dealRows, stageMap, opts = {}) {
  const { slaMinutes = 15, dealKhSplit = false } = opts;
  const pipelineStagesMap = buildPipelineStagesMap(stageMap);
  const firstStageByPipe = buildFirstStageIdByPipeline(stageMap);
  const quotedStageOrderByPipe = buildQuotedStageOrderByPipeline(stageMap);
  const wonStageOrderByPipe = buildWonStageOrderByPipeline(stageMap);
  const UNASSIGNED = '__unassigned__';
  const NONE_REGION = '__none__';
  const NONE_COMPANY = '__none__';
  const NONE_SOURCE = '__none__';
  const NONE_LEAD_TYPE = '__none_lead_type__';

  const summary = emptyStaffLeadDealAgg();
  const timelineMap = {};
  const companyMap = {};
  const regionMap = {};
  const employeeMap = {};
  const sourceMap = {};
  const leadTypeMap = {};
  const funnelMap = {};

  const ensureBucket = (map, key) => {
    if (!map[key]) map[key] = emptyStaffLeadDealAgg();
    return map[key];
  };

  const leadTypeKeyForRow = (row) => (
    row.lead_type_id ? String(row.lead_type_id) : NONE_LEAD_TYPE
  );

  for (const l of leadRows) {
    const v = orgReportNumEst(l.estimated_value);
    const st = l.stage_id ? stageMap[l.stage_id] : null;
    const ck = orgReportDayKey(l);
    const uid = orgReportOwnerId(l) || UNASSIGNED;
    const cid = l.company_id ? String(l.company_id) : NONE_COMPANY;
    const rid = l.region_id ? String(l.region_id) : NONE_REGION;
    const sid = l.source_id ? String(l.source_id) : NONE_SOURCE;
    const ltKey = leadTypeKeyForRow(l);

    orgReportBumpMetrics(summary, { value: v, isLost: !!st?.is_lost }, null);
    orgReportBumpMetrics(ensureBucket(companyMap, cid), { value: v, isLost: !!st?.is_lost }, null);
    orgReportBumpMetrics(ensureBucket(regionMap, rid), { value: v, isLost: !!st?.is_lost }, null);
    orgReportBumpMetrics(ensureBucket(employeeMap, uid), { value: v, isLost: !!st?.is_lost }, null);
    orgReportBumpMetrics(ensureBucket(sourceMap, sid), { value: v, isLost: !!st?.is_lost }, null);
    orgReportBumpMetrics(ensureBucket(leadTypeMap, ltKey), { value: v, isLost: !!st?.is_lost }, null);
    orgReportBumpOpenOverdue(summary, l, st);
    orgReportBumpOpenOverdue(ensureBucket(companyMap, cid), l, st);
    orgReportBumpOpenOverdue(ensureBucket(regionMap, rid), l, st);
    orgReportBumpOpenOverdue(ensureBucket(employeeMap, uid), l, st);
    orgReportBumpOpenOverdue(ensureBucket(sourceMap, sid), l, st);
    orgReportBumpOpenOverdue(ensureBucket(leadTypeMap, ltKey), l, st);
    orgReportBumpReceptionMetrics(summary, l, slaMinutes);
    orgReportBumpReceptionMetrics(ensureBucket(companyMap, cid), l, slaMinutes);
    orgReportBumpReceptionMetrics(ensureBucket(regionMap, rid), l, slaMinutes);
    orgReportBumpReceptionMetrics(ensureBucket(employeeMap, uid), l, slaMinutes);
    orgReportBumpReceptionMetrics(ensureBucket(sourceMap, sid), l, slaMinutes);
    orgReportBumpReceptionMetrics(ensureBucket(leadTypeMap, ltKey), l, slaMinutes);
    orgReportBumpFirstStageMetrics(summary, l, stageMap, firstStageByPipe);
    orgReportBumpFirstStageMetrics(ensureBucket(companyMap, cid), l, stageMap, firstStageByPipe);
    orgReportBumpFirstStageMetrics(ensureBucket(regionMap, rid), l, stageMap, firstStageByPipe);
    orgReportBumpFirstStageMetrics(ensureBucket(employeeMap, uid), l, stageMap, firstStageByPipe);
    orgReportBumpFirstStageMetrics(ensureBucket(sourceMap, sid), l, stageMap, firstStageByPipe);
    orgReportBumpFirstStageMetrics(ensureBucket(leadTypeMap, ltKey), l, stageMap, firstStageByPipe);

    if (l.stage_id) {
      orgReportBumpMetrics(ensureBucket(funnelMap, String(l.stage_id)), { value: v, isLost: !!st?.is_lost }, null);
    }

    if (ck) {
      if (!timelineMap[ck]) {
        timelineMap[ck] = { date: ck, lead_count: 0, deal_count: 0, customer_order_count: 0, won_value: 0, pipeline_value: 0 };
      }
      timelineMap[ck].lead_count += 1;
      timelineMap[ck].pipeline_value += v;
    }
  }

  for (const l of dealRows) {
    const v = orgReportNumEst(l.estimated_value);
    const st = l.stage_id ? stageMap[l.stage_id] : null;
    const pid = st?.pipeline_id ? String(st.pipeline_id) : '__none__';
    const stagesInPipe = pipelineStagesMap[pid] || [];
    const ext = orgReportExtendedDealMetrics(l, st, stagesInPipe);
    const isQuotedOrAfter = orgReportDealIsQuotedOrAfter(st, quotedStageOrderByPipe);
    const isClosedWon = orgReportDealIsClosedWon(st, wonStageOrderByPipe, stagesInPipe);
    const splitBuckets = dealKhSplit
      ? orgReportDealSplitBuckets(st, wonStageOrderByPipe)
      : { inDealTab: true, inCustomerTab: false };
    const dealPatch = {
      value: ext.value,
      isWon: isClosedWon,
      isLost: ext.isLost,
      expected_value: ext.expected_value,
      weighted_value: ext.weighted_value,
      completed_value: isClosedWon ? ext.value : 0,
      completed_deal_count: isClosedWon ? 1 : 0,
      quote_deal_count: isQuotedOrAfter ? 1 : 0,
      quote_value: isQuotedOrAfter ? ext.value : 0,
      won_or_later_deal_count: isClosedWon ? 1 : 0,
      won_or_later_value: isClosedWon ? ext.value : 0,
      inDealTab: splitBuckets.inDealTab,
      inCustomerTab: splitBuckets.inCustomerTab,
    };
    const ck = orgReportDayKey(l);
    const uid = orgReportOwnerId(l) || UNASSIGNED;
    const cid = l.company_id ? String(l.company_id) : NONE_COMPANY;
    const rid = l.region_id ? String(l.region_id) : NONE_REGION;
    const sid = l.source_id ? String(l.source_id) : NONE_SOURCE;

    orgReportBumpMetrics(summary, null, dealPatch);
    orgReportBumpMetrics(ensureBucket(companyMap, cid), null, dealPatch);
    orgReportBumpMetrics(ensureBucket(regionMap, rid), null, dealPatch);
    orgReportBumpMetrics(ensureBucket(employeeMap, uid), null, dealPatch);
    orgReportBumpMetrics(ensureBucket(sourceMap, sid), null, dealPatch);
    orgReportBumpMetrics(ensureBucket(leadTypeMap, leadTypeKeyForRow(l)), null, dealPatch);
    orgReportBumpOpenOverdue(summary, l, st);
    orgReportBumpOpenOverdue(ensureBucket(companyMap, cid), l, st);
    orgReportBumpOpenOverdue(ensureBucket(regionMap, rid), l, st);
    orgReportBumpOpenOverdue(ensureBucket(employeeMap, uid), l, st);
    orgReportBumpOpenOverdue(ensureBucket(sourceMap, sid), l, st);
    orgReportBumpOpenOverdue(ensureBucket(leadTypeMap, leadTypeKeyForRow(l)), l, st);
    orgReportBumpFirstStageMetrics(summary, l, stageMap, firstStageByPipe);
    orgReportBumpFirstStageMetrics(ensureBucket(companyMap, cid), l, stageMap, firstStageByPipe);
    orgReportBumpFirstStageMetrics(ensureBucket(regionMap, rid), l, stageMap, firstStageByPipe);
    orgReportBumpFirstStageMetrics(ensureBucket(employeeMap, uid), l, stageMap, firstStageByPipe);
    orgReportBumpFirstStageMetrics(ensureBucket(sourceMap, sid), l, stageMap, firstStageByPipe);
    orgReportBumpFirstStageMetrics(ensureBucket(leadTypeMap, leadTypeKeyForRow(l)), l, stageMap, firstStageByPipe);

    if (l.stage_id) {
      orgReportBumpMetrics(ensureBucket(funnelMap, String(l.stage_id)), null, dealPatch);
    }

    if (ck) {
      if (!timelineMap[ck]) {
        timelineMap[ck] = { date: ck, lead_count: 0, deal_count: 0, customer_order_count: 0, won_value: 0, pipeline_value: 0 };
      }
      timelineMap[ck].deal_count += dealKhSplit ? (splitBuckets.inDealTab ? 1 : 0) : 1;
      if (dealKhSplit && splitBuckets.inCustomerTab) {
        timelineMap[ck].customer_order_count = (timelineMap[ck].customer_order_count || 0) + 1;
      }
      timelineMap[ck].pipeline_value += v;
      if (isClosedWon) timelineMap[ck].won_value += v;
    }
  }

  const summaryFinal = {
    ...summary,
    pipeline_value: summary.lead_pipeline_value + summary.deal_pipeline_value,
    conversion_rate: orgReportConversionRate(orgReportClosedWonDealCount(summary), summary.deal_count),
    quote_win_rate_pct: orgReportQuoteWinRatePct(summary),
    quote_close_value_rate_pct: orgReportQuoteValueCloseRatePct(summary),
    deal_close_value_rate_pct: orgReportDealCloseValueRatePct(summary),
    overdue_rate_pct: orgReportOverdueRatePct(summary),
    reception_overdue_rate_pct: orgReportReceptionOverdueRatePct(summary),
    ...orgReportAttachFirstStageRates(summary),
    cancel_rate_pct: orgReportCancelRatePct(summary),
  };

  return {
    summary: summaryFinal,
    timelineMap,
    companyMap,
    regionMap,
    employeeMap,
    sourceMap,
    leadTypeMap,
    funnelMap,
    UNASSIGNED,
    NONE_REGION,
    NONE_COMPANY,
    NONE_SOURCE,
    NONE_LEAD_TYPE,
  };
}

async function loadOrgReportStageMap(leadRows, dealRows) {
  const stageIds = [...new Set([...leadRows, ...dealRows].map((l) => l.stage_id).filter(Boolean))];
  if (!stageIds.length) return {};
  const stageSelect =
    'id, name, color, icon, order_index, is_won, is_lost, pipeline_type, pipeline_id, sla_days, counts_as_expected_revenue, counts_as_completed_revenue, counts_as_won_revenue, default_probability, canonical_slug, deal_report_bucket';
  const { data: stages } = await supabase
    .from('crm_pipeline_stages')
    .select(stageSelect)
    .in('id', stageIds);
  const stageMap = Object.fromEntries((stages || []).map((s) => [s.id, s]));
  const pipeIds = [...new Set((stages || []).map((s) => s.pipeline_id).filter(Boolean))];
  if (pipeIds.length) {
    const { data: allStages } = await supabase
      .from('crm_pipeline_stages')
      .select(stageSelect)
      .in('pipeline_id', pipeIds);
    for (const s of allStages || []) {
      stageMap[s.id] = s;
    }
  }
  return stageMap;
}

function orgReportBumpMetrics(target, patchLead, patchDeal) {
  if (patchLead != null) {
    const leadVal = typeof patchLead === 'object' ? orgReportNumEst(patchLead.value) : orgReportNumEst(patchLead);
    const leadLost = typeof patchLead === 'object' ? !!patchLead.isLost : false;
    target.lead_count += 1;
    target.lead_pipeline_value += leadVal;
    if (leadLost) target.lost_lead_count += 1;
  }
  if (patchDeal) {
    if (patchDeal.inDealTab) {
      target.deal_count += 1;
      target.deal_pipeline_value += patchDeal.value;
      if (patchDeal.isLost) {
        target.lost_deal_count += 1;
        target.lost_value += patchDeal.value;
      }
      target.expected_value += patchDeal.expected_value || 0;
      target.weighted_value += patchDeal.weighted_value || 0;
    }
    if (patchDeal.inCustomerTab) {
      target.customer_order_count += 1;
      target.customer_order_value += patchDeal.value || 0;
    }
    if (patchDeal.isWon) {
      target.won_deal_count += 1;
      target.won_value += patchDeal.value;
    }
    target.completed_deal_count += patchDeal.completed_deal_count || 0;
    target.completed_value += patchDeal.completed_value || 0;
    target.quote_deal_count += patchDeal.quote_deal_count || 0;
    target.quote_value += patchDeal.quote_value || 0;
    target.won_or_later_deal_count += patchDeal.won_or_later_deal_count || 0;
    target.won_or_later_value += patchDeal.won_or_later_value || 0;
  }
}

/** Báo cáo phân cấp công ty / khu vực / nhân viên */
async function computeOrgOverviewReportData(req, res) {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Không có quyền xem báo cáo này' });
      return null;
    }

    const scope = await resolveCrmReportScope(req, res);
    if (!scope) return null;
    const { effectiveCompanyId, explicitRegionId } = scope;
    const { df, dt } = parseCrmReportDateRange(req);

    const rawType = String(req.query.type || 'all').toLowerCase();
    const typeView = rawType === 'lead' || rawType === 'deal' ? rawType : 'all';
    const skipLeads = typeView === 'deal';
    const skipDeals = typeView === 'lead';

    const dealKhSplit = req.query.deal_kh_split === '1'
      || req.query.deal_kh_split === 'true'
      || String(req.query.deal_kh_split || '').toLowerCase() === 'yes';

    const dealAssigneeOnly =
      req.user?.userId && !userSeesAllCrmDealsForScope(req.user) ? req.user.userId : null;
    const leadAssigneeOnly =
      req.user?.userId && !userSeesAllCrmLeadsForScope(req.user) ? req.user.userId : null;

    const assignedToQuery = uuidQueryOrNull(req.query.assigned_to);
    const assignedToUser = !leadAssigneeOnly && !dealAssigneeOnly && assignedToQuery
      ? assignedToQuery
      : null;

    const fetchBase = {
      company_id: effectiveCompanyId || undefined,
      region_id: explicitRegionId || undefined,
      assigned_to_user: assignedToUser || undefined,
      req,
    };

    const skipCompare =
      req.query.compare === '0'
      || req.query.compare === 'false'
      || String(req.query.compare || '').toLowerCase() === 'no';
    const { prevFrom, prevTo } = orgReportPreviousPeriod(df, dt);

    const [leadRows, dealRows, prevLeadRows, prevDealRows] = await Promise.all([
      skipLeads ? Promise.resolve([]) : fetchCrmLeadsForOrgReportBatched('lead', {
        ...fetchBase,
        date_from: df,
        date_to: dt,
        assigned_to_only: leadAssigneeOnly,
      }),
      skipDeals ? Promise.resolve([]) : fetchCrmLeadsForOrgReportBatched('deal', {
        ...fetchBase,
        date_from: df,
        date_to: dt,
        assigned_to_only: dealAssigneeOnly,
      }),
      skipCompare || skipLeads ? Promise.resolve([]) : fetchCrmLeadsForOrgReportBatched('lead', {
        ...fetchBase,
        date_from: prevFrom,
        date_to: prevTo,
        assigned_to_only: leadAssigneeOnly,
      }),
      skipCompare || skipDeals ? Promise.resolve([]) : fetchCrmLeadsForOrgReportBatched('deal', {
        ...fetchBase,
        date_from: prevFrom,
        date_to: prevTo,
        assigned_to_only: dealAssigneeOnly,
      }),
    ]);

    const [stageMap, prevStageMap, receptionSlaMinutes] = await Promise.all([
      loadOrgReportStageMap(leadRows, dealRows),
      skipCompare ? Promise.resolve({}) : loadOrgReportStageMap(prevLeadRows, prevDealRows),
      orgReportReceptionSlaMinutes(effectiveCompanyId),
    ]);

    const aggOpts = { slaMinutes: receptionSlaMinutes, dealKhSplit };
    const aggregated = aggregateOrgReportRows(leadRows, dealRows, stageMap, aggOpts);
    const {
      summary,
      timelineMap,
      companyMap,
      regionMap,
      employeeMap,
      sourceMap,
      leadTypeMap,
      funnelMap,
      UNASSIGNED,
      NONE_REGION,
      NONE_COMPANY,
      NONE_SOURCE,
      NONE_LEAD_TYPE,
    } = aggregated;

    let period_previous = null;
    let compare = null;
    let prevAgg = null;
    if (!skipCompare) {
      prevAgg = aggregateOrgReportRows(prevLeadRows, prevDealRows, prevStageMap, aggOpts);
      period_previous = {
        date_from: prevFrom,
        date_to: prevTo,
        summary: prevAgg.summary,
      };
      compare = orgReportCompareSummary(summary, prevAgg.summary);
    }

    const department_id = req.query.department_id && String(req.query.department_id).trim();
    if (department_id) {
      const depId = String(department_id).trim();
      if (effectiveCompanyId) {
        const { data: dep } = await supabase
          .from('departments')
          .select('id, company_id')
          .eq('id', depId)
          .maybeSingle();
        if (!dep || String(dep.company_id) !== String(effectiveCompanyId)) {
          res.status(400).json({ error: 'Phòng ban không thuộc công ty đang chọn' });
          return null;
        }
      }
      const { data: deptUsers } = await supabase
        .from('users')
        .select('id')
        .eq('department_id', depId)
        .neq('is_active', false);
      const allowed = new Set((deptUsers || []).map((u) => String(u.id)));
      for (const k of Object.keys(employeeMap)) {
        if (k === UNASSIGNED) {
          delete employeeMap[k];
          continue;
        }
        if (!allowed.has(k)) delete employeeMap[k];
      }
    }

    const companyIds = Object.keys(companyMap).filter((k) => k !== NONE_COMPANY);
    const regionIds = Object.keys(regionMap).filter((k) => k !== NONE_REGION);
    const userIds = Object.keys(employeeMap).filter((k) => k !== UNASSIGNED);
    const sourceIds = Object.keys(sourceMap).filter((k) => k !== NONE_SOURCE);
    const leadTypeIds = Object.keys(leadTypeMap).filter((k) => k !== NONE_LEAD_TYPE);

    const [companiesRes, regionsRes, usersRes, sourcesRes, leadTypesRes] = await Promise.all([
      companyIds.length
        ? supabase.from('companies').select('id, name, short_name').in('id', companyIds)
        : Promise.resolve({ data: [] }),
      regionIds.length
        ? supabase.from('company_regions').select('id, name, code, company_id').in('id', regionIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? supabase.from('users').select('id, full_name, email, avatar, department_id, department:departments!users_department_id_fkey(id, name)').in('id', userIds)
        : Promise.resolve({ data: [] }),
      sourceIds.length
        ? supabase.from('crm_sources').select('id, name, icon').in('id', sourceIds)
        : Promise.resolve({ data: [] }),
      leadTypeIds.length
        ? supabase.from('crm_lead_types').select('id, name, applies_to, color, order_index, company_id').in('id', leadTypeIds)
        : Promise.resolve({ data: [] }),
    ]);

    const coNameById = Object.fromEntries((companiesRes.data || []).map((c) => [
      String(c.id),
      c.short_name || c.name || String(c.id),
    ]));
    const regById = Object.fromEntries((regionsRes.data || []).map((r) => [String(r.id), r]));
    const userById = Object.fromEntries((usersRes.data || []).map((u) => [String(u.id), u]));
    const srcById = Object.fromEntries((sourcesRes.data || []).map((s) => [String(s.id), s]));
    const leadTypeById = Object.fromEntries((leadTypesRes.data || []).map((t) => [String(t.id), t]));

    const kpiPeriodStart = orgReportKpiPeriodStart(df);
    let kpiByUser = {};
    try {
      kpiByUser = await sumCrmKpiLedgerNetByUserIds(userIds, kpiPeriodStart);
    } catch (e) {
      console.warn('[crm/org-overview] kpi ledger by user:', e.message);
    }
    for (const uid of userIds) {
      if (employeeMap[uid]) {
        employeeMap[uid].kpi_ledger_net = kpiByUser[uid] ?? 0;
      }
    }
    summary.kpi_ledger_net = Math.round(
      userIds.reduce((acc, uid) => acc + (kpiByUser[uid] ?? 0), 0) * 100,
    ) / 100;

    const finalizeRows = (entries, labelFn, previousMap = null) => entries
      .map(([key, m]) => {
        const prev = previousMap?.[key] || null;
        return {
          ...m,
          pipeline_value: m.lead_pipeline_value + m.deal_pipeline_value,
          conversion_rate: orgReportConversionRate(orgReportClosedWonDealCount(m), m.deal_count),
          quote_win_rate_pct: orgReportQuoteWinRatePct(m),
          quote_close_value_rate_pct: orgReportQuoteValueCloseRatePct(m),
          deal_close_value_rate_pct: orgReportDealCloseValueRatePct(m),
          monthly_growth_pct: prev
            ? orgReportPctDelta(
              orgReportClosedWonValue(m),
              orgReportClosedWonValue(prev),
            )
            : null,
          overdue_rate_pct: orgReportOverdueRatePct(m),
          reception_overdue_rate_pct: orgReportReceptionOverdueRatePct(m),
          ...orgReportAttachFirstStageRates(m),
          cancel_rate_pct: orgReportCancelRatePct(m),
          ...labelFn(key, m),
        };
      })
      .sort((a, b) => (b.won_value || 0) - (a.won_value || 0)
        || (b.pipeline_value || 0) - (a.pipeline_value || 0));

    const by_company = finalizeRows(Object.entries(companyMap), (key) => ({
      company_id: key === NONE_COMPANY ? null : key,
      company_name: key === NONE_COMPANY ? 'Chưa gán công ty' : (coNameById[key] || key),
    }), prevAgg?.companyMap || null);

    const by_region = finalizeRows(Object.entries(regionMap), (key) => {
      const reg = regById[key];
      const cid = reg?.company_id ? String(reg.company_id) : null;
      return {
        region_id: key === NONE_REGION ? null : key,
        region_name: key === NONE_REGION ? 'Chưa gán khu vực' : (reg?.name || key),
        region_code: reg?.code || null,
        company_id: cid,
        company_name: cid ? (coNameById[cid] || cid) : null,
      };
    }, prevAgg?.regionMap || null);

    const by_employee = finalizeRows(Object.entries(employeeMap), (key) => {
      if (key === UNASSIGNED) {
        return {
          user_id: null,
          full_name: 'Chưa gán phụ trách',
          email: null,
          department_name: null,
        };
      }
      const u = userById[key];
      return {
        user_id: key,
        full_name: u?.full_name || key,
        email: u?.email || null,
        avatar: u?.avatar || null,
        department_name: u?.department?.name || null,
      };
    }, prevAgg?.employeeMap || null);

    const by_source = finalizeRows(Object.entries(sourceMap), (key) => {
      const s = srcById[key];
      return {
        source_id: key === NONE_SOURCE ? null : key,
        source_name: key === NONE_SOURCE ? 'Khác / chưa gán' : (s?.name || key),
        source_icon: s?.icon || null,
      };
    }, prevAgg?.sourceMap || null);

    const by_lead_type = finalizeRows(Object.entries(leadTypeMap), (key) => {
      const lt = leadTypeById[key];
      return {
        lead_type_id: key === NONE_LEAD_TYPE ? null : key,
        lead_type_name: key === NONE_LEAD_TYPE ? 'Chưa gán phân loại' : (lt?.name || key),
        applies_to: lt?.applies_to || null,
        lead_type_color: lt?.color || null,
        order_index: lt?.order_index ?? 999,
        company_id: lt?.company_id ? String(lt.company_id) : null,
      };
    }, prevAgg?.leadTypeMap || null).sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999)
      || (b.pipeline_value || 0) - (a.pipeline_value || 0));

    const pipeline_funnel = Object.entries(funnelMap)
      .map(([stageId, m]) => {
        const st = stageMap[stageId];
        return {
          stage_id: stageId,
          name: st?.name || 'Giai đoạn',
          color: st?.color || '#64748b',
          icon: st?.icon || '',
          order_index: st?.order_index ?? 999,
          pipeline_type: st?.pipeline_type || null,
          count: m.lead_count + m.deal_count,
          lead_count: m.lead_count,
          deal_count: m.deal_count,
          value: m.lead_pipeline_value + m.deal_pipeline_value,
          won_count: m.won_deal_count,
          won_value: m.won_value,
        };
      })
      .sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999));

    const timeline = Object.values(timelineMap).sort((a, b) => a.date.localeCompare(b.date));

    return {
      df,
      dt,
      effectiveCompanyId,
      explicitRegionId,
      typeView,
      dealKhSplit,
      summary,
      kpi_ledger_period_start: kpiPeriodStart,
      period_previous,
      compare,
      timeline,
      pipeline_funnel,
      by_company,
      by_region,
      by_employee,
      by_source,
      by_lead_type,
      reception_sla_minutes: receptionSlaMinutes,
    };
  } catch (e) {
    console.error('computeOrgOverviewReportData:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
    return null;
  }
}

r.get('/reports/staff-lead-deal/export.pdf', async (req, res) => {
  try {
    const data = await computeStaffLeadDealReportData(req, res);
    if (!data) return;
    let companyName = '';
    if (data.effectiveCompanyId) {
      const { data: co } = await supabase
        .from('companies')
        .select('name, short_name')
        .eq('id', data.effectiveCompanyId)
        .maybeSingle();
      companyName = co?.short_name || co?.name || '';
    }
    const generatedAt = new Date().toLocaleString('vi-VN');
    pipeStaffLeadDealSummaryPdf(res, {
      rows: data.rows,
      dateFrom: data.df,
      dateTo: data.dt,
      companyName,
      generatedAt,
    });
  } catch (e) {
    console.error('GET /reports/staff-lead-deal/export.pdf:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.get('/reports/staff-lead-deal', async (req, res) => {
  try {
    const data = await computeStaffLeadDealReportData(req, res);
    if (!data) return;
    res.json({
      date_from: data.df,
      date_to: data.dt,
      company_id: data.effectiveCompanyId || null,
      region_id: data.explicitRegionId || null,
      basis: 'created_at',
      type: data.typeView || 'all',
      rows: data.rows,
    });
  } catch (e) {
    console.error('GET /crm/reports/staff-lead-deal:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

/** GET /crm/reports/org-overview — BC phân cấp công ty / khu vực / nhân viên */
r.get('/reports/org-overview', async (req, res) => {
  try {
    const data = await computeOrgOverviewReportData(req, res);
    if (!data) return;
    res.json({
      date_from: data.df,
      date_to: data.dt,
      company_id: data.effectiveCompanyId || null,
      region_id: data.explicitRegionId || null,
      basis: 'created_at',
      type: data.typeView || 'all',
      deal_kh_split: !!data.dealKhSplit,
      summary: data.summary,
      period_previous: data.period_previous,
      compare: data.compare,
      timeline: data.timeline,
      pipeline_funnel: data.pipeline_funnel,
      by_company: data.by_company,
      by_region: data.by_region,
      by_employee: data.by_employee,
      by_source: data.by_source,
      by_lead_type: data.by_lead_type,
      reception_sla_minutes: data.reception_sla_minutes ?? 15,
    });
  } catch (e) {
    console.error('GET /crm/reports/org-overview:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

/** GET /crm/reports/org-overview/export.pdf */
r.get('/reports/org-overview/export.pdf', async (req, res) => {
  try {
    const data = await computeOrgOverviewReportData(req, res);
    if (!data) return;
    let companyName = '';
    if (data.effectiveCompanyId) {
      const { data: co } = await supabase
        .from('companies')
        .select('name, short_name')
        .eq('id', data.effectiveCompanyId)
        .maybeSingle();
      companyName = co?.short_name || co?.name || '';
    }
    let regionName = '';
    if (data.explicitRegionId) {
      const { data: reg } = await supabase
        .from('company_regions')
        .select('name')
        .eq('id', data.explicitRegionId)
        .maybeSingle();
      regionName = reg?.name || '';
    }
    pipeOrgOverviewReportPdf(res, {
      summary: data.summary,
      compare: data.compare,
      periodPrevious: data.period_previous,
      by_company: data.by_company,
      by_region: data.by_region,
      by_employee: data.by_employee,
      dateFrom: data.df,
      dateTo: data.dt,
      companyName,
      regionName,
      typeView: data.typeView,
      generatedAt: new Date().toLocaleString('vi-VN'),
    });
  } catch (e) {
    console.error('GET /crm/reports/org-overview/export.pdf:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

function isUuidString(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || '').trim());
}

/** Chi tiết pipeline theo nhân viên — dùng cho JSON + PDF */
async function computeStaffPipelineDetailPayload(req, res) {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Không có quyền xem báo cáo này' });
      return null;
    }

    const targetId = String(req.params.userId || '').trim();
    if (!isUuidString(targetId)) {
      res.status(400).json({ error: 'userId không hợp lệ' });
      return null;
    }

    const leadSelfOnly = req.user?.userId && !userSeesAllCrmLeadsForScope(req.user);
    const dealSelfOnly = req.user?.userId && !userSeesAllCrmDealsForScope(req.user);
    if (leadSelfOnly && String(targetId) !== String(req.user.userId)) {
      res.status(403).json({ error: 'Chỉ xem được dữ liệu của chính bạn' });
      return null;
    }
    if (dealSelfOnly && String(targetId) !== String(req.user.userId)) {
      res.status(403).json({ error: 'Chỉ xem được dữ liệu của chính bạn' });
      return null;
    }

    const { date_from, date_to } = req.query;
    const scope = await resolveCrmReportScope(req, res);
    if (!scope) return null;
    const { effectiveCompanyId, explicitRegionId } = scope;

    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const defaultFrom = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const endCal = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const defaultTo = `${endCal.getFullYear()}-${pad(endCal.getMonth() + 1)}-${pad(endCal.getDate())}`;

    const isoFrom = (v) => {
      if (!v || typeof v !== 'string') return null;
      const m = v.trim().match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : null;
    };
    const df = isoFrom(date_from) || defaultFrom;
    const dt = isoFrom(date_to) || defaultTo;

    const numEst = (x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    };

    const rawType = String(req.query.type || 'all').toLowerCase();
    const typeView = rawType === 'lead' || rawType === 'deal' ? rawType : 'all';
    const skipLeads = typeView === 'deal';
    const skipDeals = typeView === 'lead';

    const [leadRows, dealRows] = await Promise.all([
      skipLeads ? Promise.resolve([]) : fetchCrmLeadsForUserDetailBatched(targetId, 'lead', {
        company_id: effectiveCompanyId || undefined,
        region_id: explicitRegionId || undefined,
        date_from: df,
        date_to: dt,
        req,
      }),
      skipDeals ? Promise.resolve([]) : fetchCrmLeadsForUserDetailBatched(targetId, 'deal', {
        company_id: effectiveCompanyId || undefined,
        region_id: explicitRegionId || undefined,
        date_from: df,
        date_to: dt,
        req,
      }),
    ]);

    const allStageIds = [...new Set(
      [...leadRows, ...dealRows].map((l) => l.stage_id).filter(Boolean),
    )];
    let stageMetaById = {};
    if (allStageIds.length) {
      const stageSelect =
        'id, name, order_index, pipeline_id, is_won, is_lost, pipeline_type, canonical_slug, deal_report_bucket, sla_days, counts_as_expected_revenue, counts_as_completed_revenue, counts_as_won_revenue, default_probability';
      const { data: stages } = await supabase
        .from('crm_pipeline_stages')
        .select(stageSelect)
        .in('id', allStageIds);
      stageMetaById = Object.fromEntries((stages || []).map((s) => [s.id, s]));
      const pipeIds = [...new Set((stages || []).map((s) => s.pipeline_id).filter(Boolean))];
      if (pipeIds.length) {
        const { data: allStages } = await supabase
          .from('crm_pipeline_stages')
          .select(stageSelect)
          .in('pipeline_id', pipeIds);
        for (const s of allStages || []) {
          stageMetaById[s.id] = s;
        }
      }
    }
    const pipelineStagesMap = buildPipelineStagesMap(stageMetaById);
    const wonStageOrderByPipe = buildWonStageOrderByPipeline(stageMetaById);

    const NONE = '__none__';
    const byPipe = {};

    const ensure = (pid) => {
      const key = pid || NONE;
      if (!byPipe[key]) {
        byPipe[key] = {
          pipeline_id: pid || null,
          lead_count: 0,
          lead_value: 0,
          deal_count: 0,
          deal_value: 0,
          won_deal_count: 0,
          won_value: 0,
          lost_deal_count: 0,
          lost_value: 0,
          completed_deal_count: 0,
          completed_value: 0,
        };
      }
      return byPipe[key];
    };

    for (const l of leadRows) {
      const b = ensure(l.pipeline_id);
      const v = numEst(l.estimated_value);
      b.lead_count += 1;
      b.lead_value += v;
    }

    for (const l of dealRows) {
      const st = l.stage_id ? stageMetaById[l.stage_id] : null;
      const pipeKey = st?.pipeline_id || l.pipeline_id;
      const b = ensure(pipeKey);
      const v = numEst(l.estimated_value);
      const pid = st?.pipeline_id ? String(st.pipeline_id) : (l.pipeline_id ? String(l.pipeline_id) : '__none__');
      const stagesInPipe = pipelineStagesMap[pid] || [];
      const ext = orgReportExtendedDealMetrics(l, st, stagesInPipe);
      b.deal_count += 1;
      b.deal_value += v;
      const isClosedWon = orgReportDealIsClosedWon(st, wonStageOrderByPipe, stagesInPipe);
      if (isClosedWon) {
        b.won_deal_count += 1;
        b.won_value += v;
      }
      if (st?.is_lost) {
        b.lost_deal_count += 1;
        b.lost_value += v;
      }
      if (ext.completed_deal_count && !isClosedWon) {
        b.completed_deal_count += 1;
        b.completed_value += ext.completed_value;
      }
    }

    const pipeIds = [...new Set(
      Object.keys(byPipe)
        .filter((k) => k !== NONE)
        .map((k) => byPipe[k].pipeline_id)
        .filter(Boolean),
    )];
    let nameMap = {};
    if (pipeIds.length) {
      const { data: pipes } = await supabase
        .from('crm_pipelines')
        .select('id, name')
        .in('id', pipeIds);
      nameMap = Object.fromEntries((pipes || []).map((p) => [p.id, p.name]));
    }

    const pipelines = Object.values(byPipe).map((b) => {
      const pid = b.pipeline_id;
      const name = pid ? (nameMap[pid] || 'Pipeline') : 'Chưa gán pipeline';
      const totalValue = b.lead_value + b.deal_value;
      const openDealCount = Math.max(0, (b.deal_count || 0) - (b.won_deal_count || 0) - (b.lost_deal_count || 0));
      let openValue = b.deal_value - (b.won_value || 0) - (b.lost_value || 0);
      if (!Number.isFinite(openValue) || openValue < 0) openValue = 0;
      return {
        ...b,
        pipeline_name: name,
        total_value: totalValue,
        open_deal_count: openDealCount,
        open_value: openValue,
        completion_rate_pct: (b.deal_count || 0) > 0
          ? Math.round(((b.completed_deal_count || 0) / b.deal_count) * 1000) / 10
          : null,
      };
    });

    pipelines.sort((a, b) => (b.total_value || 0) - (a.total_value || 0));

    /** Theo ngày (phần date của ISO) — khớp filter created_at */
    const dayKey = (row) => {
      const raw = row.created_at;
      if (!raw) return null;
      const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : null;
    };
    const timelineMap = {};
    for (const l of leadRows) {
      const k = dayKey(l);
      if (!k) continue;
      if (!timelineMap[k]) {
        timelineMap[k] = { date: k, lead_count: 0, lead_value: 0, deal_count: 0, deal_value: 0 };
      }
      timelineMap[k].lead_count += 1;
      timelineMap[k].lead_value += numEst(l.estimated_value);
    }
    for (const l of dealRows) {
      const k = dayKey(l);
      if (!k) continue;
      if (!timelineMap[k]) {
        timelineMap[k] = { date: k, lead_count: 0, lead_value: 0, deal_count: 0, deal_value: 0 };
      }
      timelineMap[k].deal_count += 1;
      timelineMap[k].deal_value += numEst(l.estimated_value);
    }

    const timeline = Object.values(timelineMap).sort((a, b) => String(a.date).localeCompare(String(b.date)));

    let dealOpenCount = 0;
    let dealOpenValue = 0;
    let dealWonCount = 0;
    let dealWonValue = 0;
    let dealLostCount = 0;
    let dealLostValue = 0;
    let dealProjectCompletedCount = 0;
    let dealProjectCompletedValue = 0;
    /** Đã ký HĐ → trước hoàn thành: SX, lắp đặt, ký HĐ… */
    let dealImplementationCount = 0;
    let dealImplementationValue = 0;
    /** Trước ký HĐ */
    let dealPreContractCount = 0;
    let dealPreContractValue = 0;
    let dealExpectedValue = 0;
    let dealWeightedValue = 0;
    for (const l of dealRows) {
      const v = numEst(l.estimated_value);
      const st = l.stage_id ? stageMetaById[l.stage_id] : null;
      const pid = st?.pipeline_id ? String(st.pipeline_id) : (l.pipeline_id ? String(l.pipeline_id) : '__none__');
      const stagesInPipe = pipelineStagesMap[pid] || [];
      const ext = orgReportExtendedDealMetrics(l, st, stagesInPipe);
      dealExpectedValue += ext.expected_value;
      dealWeightedValue += ext.weighted_value;
      const slug = st?.canonical_slug || null;
      const cls = classifyDealStageForStaffReport(st, slug);

      if (cls === 'lost') {
        dealLostCount += 1;
        dealLostValue += v;
        continue;
      }
      if (cls === 'project_completed') {
        dealProjectCompletedCount += 1;
        dealProjectCompletedValue += v;
      } else if (cls === 'pre_contract') {
        dealPreContractCount += 1;
        dealPreContractValue += v;
      } else {
        dealImplementationCount += 1;
        dealImplementationValue += v;
      }

      const isClosedWon = orgReportDealIsClosedWon(st, wonStageOrderByPipe, stagesInPipe);

      if (isClosedWon) {
        dealWonCount += 1;
        dealWonValue += v;
      } else if (!st?.is_lost) {
        dealOpenCount += 1;
        dealOpenValue += v;
      }
    }

    const leadTot = leadRows.length;
    const leadValTot = leadRows.reduce((s, l) => s + numEst(l.estimated_value), 0);
    let leadLostCount = 0;
    for (const l of leadRows) {
      const st = l.stage_id ? stageMetaById[l.stage_id] : null;
      if (st?.is_lost) leadLostCount += 1;
    }
    const dealTot = dealRows.length;
    const dealValTot = dealRows.reduce((s, l) => s + numEst(l.estimated_value), 0);
    const totalPipelineVal = leadValTot + dealValTot;
    const receptionSlaMinutes = await orgReportReceptionSlaMinutes(effectiveCompanyId);
    const { summary: orgAlignedSummary } = aggregateOrgReportRows(leadRows, dealRows, stageMetaById, {
      slaMinutes: receptionSlaMinutes,
    });
    const closedWonCount = orgReportClosedWonDealCount(orgAlignedSummary);
    const closedWonValue = orgReportClosedWonValue(orgAlignedSummary);
    const closedForRate = closedWonCount + (orgAlignedSummary.lost_deal_count || 0);
    const kpiPeriodStart = orgReportKpiPeriodStart(df);
    let kpiLedgerNet = 0;
    try {
      const kpiByUser = await sumCrmKpiLedgerNetByUserIds([targetId], kpiPeriodStart);
      kpiLedgerNet = kpiByUser[String(targetId)] ?? 0;
    } catch (e) {
      console.warn('[crm/staff-pipelines] kpi ledger:', e.message);
    }
    const summary = {
      ...orgAlignedSummary,
      lead_value: orgAlignedSummary.lead_pipeline_value,
      deal_value: orgAlignedSummary.deal_pipeline_value,
      total_pipeline_value: orgAlignedSummary.pipeline_value,
      won_deal_count: closedWonCount,
      won_value: closedWonValue,
      won_or_later_deal_count: closedWonCount,
      won_or_later_value: closedWonValue,
      completed_deal_count: closedWonCount,
      completed_value: closedWonValue,
      lost_deal_count: orgAlignedSummary.lost_deal_count,
      lost_value: orgAlignedSummary.lost_value,
      lost_lead_count: orgAlignedSummary.lost_lead_count,
      open_deal_count: dealOpenCount,
      open_value: dealOpenValue,
      project_completed_count: dealProjectCompletedCount,
      project_completed_value: dealProjectCompletedValue,
      implementation_count: dealImplementationCount,
      implementation_value: dealImplementationValue,
      pre_contract_count: dealPreContractCount,
      pre_contract_value: dealPreContractValue,
      pending_completion_count: dealImplementationCount + dealPreContractCount,
      pending_completion_value: dealImplementationValue + dealPreContractValue,
      net_won_minus_lost_value: closedWonValue - (orgAlignedSummary.lost_value || 0),
      total_excluding_lost_value: totalPipelineVal - (orgAlignedSummary.lost_value || 0),
      pipeline_count: pipelines.filter((p) => (p.lead_count || 0) + (p.deal_count || 0) > 0).length,
      win_rate_closed_pct: closedForRate > 0 ? Math.round((closedWonCount / closedForRate) * 1000) / 10 : null,
      win_rate_all_deals_pct: dealTot > 0 ? Math.round((closedWonCount / dealTot) * 1000) / 10 : null,
      kpi_ledger_net: kpiLedgerNet,
      kpi_ledger_period_start: kpiPeriodStart,
    };

    /** Gom theo từng giai đoạn (stage) — tiền đang nằm ở cột Kanban nào */
    const stageAgg = new Map();
    const bumpStageRow = (row, kind, val) => {
      const key = row.stage_id ? String(row.stage_id) : '__none__';
      if (!stageAgg.has(key)) {
        stageAgg.set(key, {
          stage_id: row.stage_id || null,
          lead_count: 0,
          lead_value: 0,
          deal_count: 0,
          deal_value: 0,
        });
      }
      const b = stageAgg.get(key);
      if (kind === 'lead') {
        b.lead_count += 1;
        b.lead_value += val;
      } else {
        b.deal_count += 1;
        b.deal_value += val;
      }
    };
    for (const l of leadRows) bumpStageRow(l, 'lead', numEst(l.estimated_value));
    for (const l of dealRows) bumpStageRow(l, 'deal', numEst(l.estimated_value));

    const stagePipelineIds = [...new Set(
      [...stageAgg.values()]
        .map((a) => (a.stage_id ? stageMetaById[a.stage_id]?.pipeline_id : null))
        .filter(Boolean),
    )];
    let stagePipeNames = {};
    if (stagePipelineIds.length) {
      const { data: spipes } = await supabase
        .from('crm_pipelines')
        .select('id, name')
        .in('id', stagePipelineIds);
      stagePipeNames = Object.fromEntries((spipes || []).map((p) => [p.id, p.name]));
    }

    const outcomeLabel = (outcome) => {
      if (outcome === 'lost') return 'Thua';
      if (outcome === 'project_completed') return 'Hoàn thành';
      if (outcome === 'implementation') return 'Đang triển khai';
      if (outcome === 'pre_contract') return 'Chưa chốt';
      return '';
    };

    const stage_breakdown = [...stageAgg.values()].map((agg) => {
      const meta = agg.stage_id ? stageMetaById[agg.stage_id] : null;
      const pid = meta?.pipeline_id || null;
      const slug = meta?.canonical_slug || null;
      let dealOutcome = null;
      if (agg.deal_count > 0 && meta) {
        const cls = classifyDealStageForStaffReport(meta, slug);
        if (cls === 'lost') dealOutcome = 'lost';
        else if (cls === 'project_completed') dealOutcome = 'project_completed';
        else if (cls === 'implementation') dealOutcome = 'implementation';
        else dealOutcome = 'pre_contract';
      }
      const stageTotalValue = agg.lead_value + agg.deal_value;
      const pt = meta?.pipeline_type || null;
      return {
        stage_id: agg.stage_id,
        stage_name: meta?.name || (agg.stage_id ? '—' : 'Chưa xác định giai đoạn'),
        pipeline_id: pid,
        pipeline_name: pid ? (stagePipeNames[pid] || 'Pipeline') : null,
        pipeline_type: pt,
        kanban_type_label: pt === 'deal' ? 'Deal' : pt === 'lead' ? 'Lead' : '',
        canonical_slug: slug || null,
        order_index: meta?.order_index ?? null,
        deal_outcome: dealOutcome,
        deal_outcome_label: dealOutcome ? outcomeLabel(dealOutcome) : '',
        deal_report_bucket: meta?.deal_report_bucket ?? null,
        lead_count: agg.lead_count,
        lead_value: agg.lead_value,
        deal_count: agg.deal_count,
        deal_value: agg.deal_value,
        stage_total_value: stageTotalValue,
      };
    });

    stage_breakdown.sort((a, b) => {
      const na = a.stage_id ? 0 : 1;
      const nb = b.stage_id ? 0 : 1;
      if (na !== nb) return na - nb;
      const pa = String(a.pipeline_id || '\uffff');
      const pb = String(b.pipeline_id || '\uffff');
      if (pa !== pb) return pa.localeCompare(pb);
      const oa = a.order_index ?? 999999;
      const ob = b.order_index ?? 999999;
      if (oa !== ob) return oa - ob;
      return String(a.stage_name || '').localeCompare(String(b.stage_name || ''));
    });

    const firstStageByPipe = buildFirstStageIdByPipeline(stageMetaById);
    const firstStageAgg = emptyStaffLeadDealAgg();
    for (const l of leadRows) {
      orgReportBumpFirstStageMetrics(firstStageAgg, l, stageMetaById, firstStageByPipe);
    }
    for (const l of dealRows) {
      orgReportBumpFirstStageMetrics(firstStageAgg, l, stageMetaById, firstStageByPipe);
    }
    const firstStageNames = [...new Set(
      Object.values(firstStageByPipe).map((x) => x.stage?.name).filter(Boolean),
    )];
    const first_stage_sla = {
      open_count: firstStageAgg.first_stage_open_count,
      on_time_count: firstStageAgg.first_stage_on_time_count,
      overdue_count: firstStageAgg.first_stage_overdue_count,
      on_time_rate_pct: orgReportFirstStageOnTimeRatePct(firstStageAgg),
      overdue_rate_pct: orgReportFirstStageOverdueRatePct(firstStageAgg),
      stage_labels: firstStageNames.slice(0, 5),
    };
    summary.first_stage_open_count = firstStageAgg.first_stage_open_count;
    summary.first_stage_on_time_count = firstStageAgg.first_stage_on_time_count;
    summary.first_stage_overdue_count = firstStageAgg.first_stage_overdue_count;
    Object.assign(summary, orgReportAttachFirstStageRates(firstStageAgg));

    const NONE_LEAD_TYPE = '__none_lead_type__';
    const leadTypeDetailMap = {};
    const ensureLeadTypeBucket = (key) => {
      if (!leadTypeDetailMap[key]) {
        leadTypeDetailMap[key] = { lead_count: 0, deal_count: 0, lead_value: 0, deal_value: 0 };
      }
      return leadTypeDetailMap[key];
    };
    for (const l of leadRows) {
      const key = l.lead_type_id ? String(l.lead_type_id) : NONE_LEAD_TYPE;
      const b = ensureLeadTypeBucket(key);
      b.lead_count += 1;
      b.lead_value += numEst(l.estimated_value);
    }
    for (const l of dealRows) {
      const key = l.lead_type_id ? String(l.lead_type_id) : NONE_LEAD_TYPE;
      const b = ensureLeadTypeBucket(key);
      b.deal_count += 1;
      b.deal_value += numEst(l.estimated_value);
    }
    const detailLeadTypeIds = Object.keys(leadTypeDetailMap).filter((k) => k !== NONE_LEAD_TYPE);
    let detailLeadTypeById = {};
    if (detailLeadTypeIds.length) {
      const { data: ltRows } = await supabase
        .from('crm_lead_types')
        .select('id, name, applies_to, color, order_index')
        .in('id', detailLeadTypeIds);
      detailLeadTypeById = Object.fromEntries((ltRows || []).map((t) => [String(t.id), t]));
    }
    const by_lead_type = Object.entries(leadTypeDetailMap)
      .map(([key, m]) => {
        const lt = detailLeadTypeById[key];
        return {
          lead_type_id: key === NONE_LEAD_TYPE ? null : key,
          lead_type_name: key === NONE_LEAD_TYPE ? 'Chưa gán phân loại' : (lt?.name || key),
          applies_to: lt?.applies_to || null,
          lead_type_color: lt?.color || null,
          order_index: lt?.order_index ?? 999,
          lead_count: m.lead_count,
          deal_count: m.deal_count,
          lead_value: m.lead_value,
          deal_value: m.deal_value,
          pipeline_value: m.lead_value + m.deal_value,
        };
      })
      .sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999)
        || (b.pipeline_value || 0) - (a.pipeline_value || 0));

    const { data: uRow } = await supabase
      .from('users')
      .select('id, full_name, email, avatar, department:departments!users_department_id_fkey(name)')
      .eq('id', targetId)
      .maybeSingle();

    return {
      user_id: targetId,
      full_name: uRow?.full_name || null,
      email: uRow?.email || null,
      avatar: uRow?.avatar || null,
      department_name: uRow?.department?.name || null,
      df,
      dt,
      effectiveCompanyId,
      pipelines,
      summary,
      timeline,
      stage_breakdown,
      by_lead_type,
      first_stage_sla,
      typeView,
    };
  } catch (e) {
    console.error('computeStaffPipelineDetailPayload:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
    return null;
  }
}

r.get('/reports/staff-lead-deal/:userId/pipelines/export.pdf', async (req, res) => {
  try {
    const p = await computeStaffPipelineDetailPayload(req, res);
    if (!p) return;
    let companyName = '';
    if (p.effectiveCompanyId) {
      const { data: co } = await supabase
        .from('companies')
        .select('name, short_name')
        .eq('id', p.effectiveCompanyId)
        .maybeSingle();
      companyName = co?.short_name || co?.name || '';
    }
    pipeStaffPipelineDetailPdf(res, {
      pipelines: p.pipelines,
      fullName: p.full_name,
      departmentName: p.department_name,
      dateFrom: p.df,
      dateTo: p.dt,
      companyName,
      generatedAt: new Date().toLocaleString('vi-VN'),
    });
  } catch (e) {
    console.error('GET pipelines/export.pdf:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

/** GET /crm/reports/staff-lead-deal/:userId/pipelines — chi tiết theo từng pipeline (giá trị ước tính) */
r.get('/reports/staff-lead-deal/:userId/pipelines', async (req, res) => {
  try {
    const p = await computeStaffPipelineDetailPayload(req, res);
    if (!p) return;
    res.json({
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
      department_name: p.department_name,
      date_from: p.df,
      date_to: p.dt,
      company_id: p.effectiveCompanyId || null,
      basis: 'created_at',
      type: p.typeView || 'all',
      pipelines: p.pipelines,
      summary: p.summary,
      timeline: p.timeline,
      stage_breakdown: p.stage_breakdown,
      by_lead_type: p.by_lead_type,
      first_stage_sla: p.first_stage_sla,
    });
  } catch (e) {
    console.error('GET /crm/reports/staff-lead-deal/:userId/pipelines:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

const DEAL_REPORT_BUCKET_VALUES = new Set(['pre_contract', 'implementation', 'completed', 'lost']);

/** GET /crm/settings/deal-stage-report-buckets — cột Deal → nhóm BC Lead/Deal theo NV */
r.get('/settings/deal-stage-report-buckets', async (req, res) => {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Không có quyền xem cấu hình này' });
      return;
    }
    const rawC = req.query.company_id && String(req.query.company_id).trim() ? String(req.query.company_id).trim() : null;
    let effectiveCompanyId = rawC;
    const sacDash = scopedAdminCompanyId(req);
    if (sacDash) {
      effectiveCompanyId = sacDash;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    }
    if (!effectiveCompanyId) {
      res.status(400).json({ error: 'Cần chọn công ty (company_id)' });
      return;
    }

    const { data: pipes, error: pe } = await supabase
      .from('crm_pipelines')
      .select('id, name')
      .eq('company_id', effectiveCompanyId)
      .eq('is_active', true);
    if (pe) throw pe;

    const pipeIds = (pipes || []).map((p) => p.id);
    if (!pipeIds.length) {
      res.json({ company_id: effectiveCompanyId, stages: [] });
      return;
    }

    const { data: stages, error: se } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, order_index, pipeline_id, canonical_slug, is_won, is_lost, deal_report_bucket, pipeline_type')
      .in('pipeline_id', pipeIds)
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .order('order_index');
    if (se) throw se;

    const nameByPid = Object.fromEntries((pipes || []).map((p) => [p.id, p.name]));
    const rows = (stages || []).map((s) => ({
      ...s,
      pipeline_name: nameByPid[s.pipeline_id] || '',
    }));

    res.json({ company_id: effectiveCompanyId, stages: rows });
  } catch (e) {
    console.error('GET /crm/settings/deal-stage-report-buckets:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

/** PUT /crm/settings/deal-stage-report-buckets — cập nhật nhóm báo cáo cho từng cột Deal */
r.put('/settings/deal-stage-report-buckets', async (req, res) => {
  try {
    const roleNorm = normalizeCrmUserRole(req.user?.role);
    if (!STAFF_LEAD_DEAL_REPORT_ROLES.has(roleNorm)) {
      res.status(403).json({ error: 'Không có quyền chỉnh cấu hình này' });
      return;
    }

    const body = req.body || {};
    const rawC = body.company_id && String(body.company_id).trim() ? String(body.company_id).trim() : null;
    let effectiveCompanyId = rawC;
    const sacDash = scopedAdminCompanyId(req);
    if (sacDash) {
      effectiveCompanyId = sacDash;
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      effectiveCompanyId = cid;
    }
    if (!effectiveCompanyId) {
      res.status(400).json({ error: 'Cần company_id' });
      return;
    }

    const updates = Array.isArray(body.updates) ? body.updates : [];
    if (!updates.length) {
      res.status(400).json({ error: 'updates không được rỗng' });
      return;
    }

    const { data: pipes } = await supabase
      .from('crm_pipelines')
      .select('id')
      .eq('company_id', effectiveCompanyId)
      .eq('is_active', true);
    const allowedPipe = new Set((pipes || []).map((p) => p.id));

    for (const u of updates) {
      const sid = u.stage_id && String(u.stage_id).trim();
      if (!sid || !isUuidString(sid)) {
        res.status(400).json({ error: 'stage_id không hợp lệ' });
        return;
      }
      let bucket = u.deal_report_bucket;
      if (bucket === '' || bucket === undefined) bucket = null;
      if (bucket !== null && !DEAL_REPORT_BUCKET_VALUES.has(String(bucket))) {
        res.status(400).json({ error: 'deal_report_bucket không hợp lệ' });
        return;
      }

      const { data: st, error: ste } = await supabase
        .from('crm_pipeline_stages')
        .select('id, pipeline_id, pipeline_type')
        .eq('id', sid)
        .maybeSingle();
      if (ste) throw ste;
      if (!st || st.pipeline_type !== 'deal' || !allowedPipe.has(st.pipeline_id)) {
        res.status(403).json({ error: 'Giai đoạn không thuộc pipeline Deal của công ty đang chọn' });
        return;
      }

      const { error: ue } = await supabase
        .from('crm_pipeline_stages')
        .update({ deal_report_bucket: bucket })
        .eq('id', sid);
      if (ue) throw ue;
    }

    res.json({ ok: true, updated: updates.length, company_id: effectiveCompanyId });
  } catch (e) {
    console.error('PUT /crm/settings/deal-stage-report-buckets:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

module.exports = r;
