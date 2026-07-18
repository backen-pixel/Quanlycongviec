/**
 * Báo cáo tổ chức (org-overview) cho AI Assistant — dùng chung logic với GET /crm/reports/org-overview.
 */
const { supabase } = require('../config/supabase');
const { vnDateYmd, fmtMoneyShort, shortName, fmtInt } = require('./aiReportTools');

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
    set() {
      return this;
    },
  };
  return res;
}

async function loadUserForOrgReport(userId) {
  if (!userId) return null;
  const { data: user } = await supabase
    .from('users')
    .select('id, role, company_id, department_id')
    .eq('id', userId)
    .maybeSingle();
  if (!user) return null;
  let company_id = user.company_id || null;
  if (!company_id && user.department_id) {
    const { data: dept } = await supabase
      .from('departments')
      .select('company_id')
      .eq('id', user.department_id)
      .maybeSingle();
    company_id = dept?.company_id || null;
  }
  if (!company_id) {
    const { resolveCompanyIdForUser } = require('../middleware/auth');
    company_id = await resolveCompanyIdForUser(user.id);
  }
  return {
    userId: user.id,
    role: user.role,
    company_id,
    department_id: user.department_id || null,
  };
}

/** Map time_scope → date_from/date_to (khớp trang BC tổ chức / parseCrmReportDateRange). */
function resolveOrgReportDateRange(timeScope = 'this_month', daysOffset = 0) {
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = vnDateYmd();
  const [yy, mm, dd] = todayStr.split('-').map((x) => parseInt(x, 10));
  const todayLabel = new Date(`${todayStr}T12:00:00+07:00`).toLocaleDateString('vi-VN');

  const endOfMonthYmd = () => {
    const endCal = new Date(yy, mm, 0);
    return `${endCal.getFullYear()}-${pad(endCal.getMonth() + 1)}-${pad(endCal.getDate())}`;
  };

  switch (timeScope) {
    case 'today':
      return { df: todayStr, dt: todayStr, label: `hôm nay (${todayLabel})` };
    case 'yesterday': {
      const y = new Date(`${todayStr}T00:00:00+07:00`);
      y.setDate(y.getDate() - 1);
      const yStr = vnDateYmd(y);
      return { df: yStr, dt: yStr, label: `hôm qua (${y.toLocaleDateString('vi-VN')})` };
    }
    case 'last_7d': {
      const from = new Date(`${todayStr}T00:00:00+07:00`);
      from.setDate(from.getDate() - 6);
      const df = vnDateYmd(from);
      return { df, dt: todayStr, label: '7 ngày qua' };
    }
    case 'last_30d': {
      const from = new Date(`${todayStr}T00:00:00+07:00`);
      from.setDate(from.getDate() - 29);
      const df = vnDateYmd(from);
      return { df, dt: todayStr, label: '30 ngày qua' };
    }
    case 'last_month': {
      const prevM = mm === 1 ? 12 : mm - 1;
      const prevY = mm === 1 ? yy - 1 : yy;
      const lastDay = new Date(prevY, prevM, 0).getDate();
      const df = `${prevY}-${pad(prevM)}-01`;
      const dt = `${prevY}-${pad(prevM)}-${pad(lastDay)}`;
      return { df, dt, label: `tháng ${prevM}/${prevY}` };
    }
    case 'custom': {
      const off = Math.max(0, parseInt(daysOffset, 10) || 0);
      const d = new Date(`${todayStr}T00:00:00+07:00`);
      d.setDate(d.getDate() - off);
      const dStr = vnDateYmd(d);
      return {
        df: dStr,
        dt: off === 0 ? todayStr : dStr,
        label: off === 0 ? `hôm nay (${todayLabel})` : `${off} ngày trước`,
      };
    }
    case 'this_month':
    default:
      return {
        df: `${yy}-${pad(mm)}-01`,
        dt: endOfMonthYmd(),
        label: `tháng ${mm}/${yy}`,
      };
  }
}

function buildMockReq(user, params = {}) {
  const { df, dt } = params.date_from && params.date_to
    ? { df: params.date_from, dt: params.date_to }
    : resolveOrgReportDateRange(params.time_scope || 'this_month', params.days_offset ?? 0);

  const query = {
    date_from: df,
    date_to: dt,
    type: params.type || 'all',
    compare: params.compare === false ? '0' : '1',
  };
  if (params.company_id) query.company_id = String(params.company_id);
  if (params.region_id) query.region_id = String(params.region_id);
  if (params.department_id) query.department_id = String(params.department_id);
  if (params.assigned_to) query.assigned_to = String(params.assigned_to);
  if (params.deal_kh_split) query.deal_kh_split = '1';

  const mockUser = user ? { ...user } : {};
  if (params.bot_schedule_scope && params.company_id) {
    mockUser.role = mockUser.role || 'admin';
    mockUser.company_id = mockUser.company_id || null;
  }

  return {
    user: mockUser,
    query,
  };
}

async function fetchOrgOverviewReportForAi(ctxUser, params = {}) {
  const userId = params.ctx_user_id || ctxUser?.userId || ctxUser?.id;
  const user = await loadUserForOrgReport(userId);
  if (!user) throw new Error('Không xác định được user — cần đăng nhập.');

  const crmRouter = require('../routes/crm');
  if (typeof crmRouter.computeOrgOverviewReportData !== 'function') {
    throw new Error('computeOrgOverviewReportData chưa được export từ routes/crm');
  }

  const mockReq = buildMockReq(user, params);
  const mockRes = createMockRes();
  const data = await crmRouter.computeOrgOverviewReportData(mockReq, mockRes);
  if (!data) {
    const err = mockRes.body?.error || 'Không lấy được báo cáo tổ chức';
    if (mockRes.statusCode === 403) throw new Error(`Không có quyền: ${err}`);
    throw new Error(err);
  }
  return data;
}

function reportClosedWonCount(r) {
  return Number(r?.won_or_later_deal_count ?? r?.won_deal_count) || 0;
}

function reportClosedWonValue(r) {
  return Number(r?.won_or_later_value ?? r?.won_value ?? r?.completed_value) || 0;
}

function reportLostTotal(r) {
  return (Number(r?.lost_lead_count) || 0) + (Number(r?.lost_deal_count) || 0);
}

function orgReportTotalDealCount(m) {
  return (Number(m?.deal_count) || 0)
    + (Number(m?.customer_order_count) || 0)
    + (Number(m?.lost_deal_count) || 0);
}

function employeeDealTotal(r) {
  return orgReportTotalDealCount(r);
}

function reportCancelLostTotal(r) {
  return (Number(r?.lost_lead_count) || 0) + (Number(r?.lost_deal_count) || 0);
}

function reportCancelTotalCount(r) {
  return (Number(r?.lead_count) || 0) + orgReportTotalDealCount(r);
}

function fmtPct(v) {
  if (v == null || v === '') return '—';
  return `${v}%`;
}

async function resolveCompanyIdByName(companyId, companyName) {
  if (companyId) return { companyId: String(companyId), error: null };
  if (!companyName || !String(companyName).trim()) return { companyId: null, error: null };
  const term = String(companyName).trim();
  const { data: rows } = await supabase
    .from('companies')
    .select('id, name, short_name')
    .or(`name.ilike.%${term}%,short_name.ilike.%${term}%`)
    .limit(5);
  if (!rows?.length) {
    return { companyId: null, error: `❓ Không tìm thấy công ty khớp "${term}".` };
  }
  if (rows.length === 1) return { companyId: rows[0].id, error: null };
  const exact = rows.find((c) =>
    (c.short_name || c.name || '').toLowerCase() === term.toLowerCase());
  if (exact) return { companyId: exact.id, error: null };
  return {
    companyId: null,
    error: `❓ Có ${rows.length} công ty khớp "${term}":\n`
      + rows.map((c, i) => `${i + 1}. ${c.short_name || c.name}`).join('\n'),
  };
}

/** Resolve department_id từ tên — giống format_company_report_text. */
async function resolveDepartmentForOrgReport({ company_id: companyId, department_id: departmentId, department_name: departmentName }) {
  if (departmentId) {
    const { data: dept } = await supabase.from('departments').select('name').eq('id', departmentId).maybeSingle();
    return { departmentId, scopeLabel: dept?.name ? `🏷 ${dept.name}` : null, error: null };
  }
  if (!departmentName || !companyId) {
    return { departmentId: null, scopeLabel: null, error: null };
  }
  const term = String(departmentName).trim();
  const { data: deptCandidates } = await supabase
    .from('departments')
    .select('id, name, company_id')
    .eq('company_id', companyId)
    .ilike('name', `%${term}%`)
    .limit(5);
  if (!deptCandidates?.length) {
    return { departmentId: null, scopeLabel: null, error: `❓ Không tìm thấy phòng ban khớp "${term}".` };
  }
  if (deptCandidates.length === 1) {
    return { departmentId: deptCandidates[0].id, scopeLabel: `🏷 ${deptCandidates[0].name}`, error: null };
  }
  const exact = deptCandidates.find((d) => d.name.toLowerCase() === term.toLowerCase());
  if (exact) {
    return { departmentId: exact.id, scopeLabel: `🏷 ${exact.name}`, error: null };
  }
  return {
    departmentId: null,
    scopeLabel: null,
    error: `❓ Có ${deptCandidates.length} phòng khớp "${term}":\n`
      + deptCandidates.map((d, i) => `${i + 1}. ${d.name}`).join('\n'),
  };
}

function formatPeriodLabelVi(df, dt, fallbackLabel) {
  const fmt = (ymd) => {
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return ymd;
    const [y, m, d] = String(ymd).split('-');
    return `${d}/${m}/${y}`;
  };
  if (df && dt) {
    if (df === dt) return fmt(df);
    return `${fmt(df)} – ${fmt(dt)}`;
  }
  return fallbackLabel || '';
}

function rankBadge(idx) {
  if (idx === 0) return '🥇';
  if (idx === 1) return '🥈';
  if (idx === 2) return '🥉';
  return `${idx + 1}.`;
}

/** Khối tổng quan — nhóm theo Deal / Báo giá chốt / KPI (khớp tab NV trên BC tổ chức). */
function formatOrgTabSummaryLines(s) {
  const dealTotal = orgReportTotalDealCount(s);
  const won = reportClosedWonCount(s);
  const lostCancel = reportCancelLostTotal(s);
  const cancelTotal = reportCancelTotalCount(s);
  const cancelPct = s.cancel_rate_pct != null ? `${s.cancel_rate_pct}%` : '—';
  const cancelDetail = cancelTotal ? ` (${lostCancel}/${cancelTotal})` : '';

  const lines = [];
  lines.push('📊 *Tổng quan*');
  lines.push(`   Lead *${fmtInt(s.lead_count || 0)}* · Deal *${fmtInt(dealTotal)}* · Ký HĐ *${fmtInt(won)}*`);
  lines.push(
    `   Chốt *${fmtPct(s.conversion_rate)}* · GT chốt *${fmtPct(s.deal_close_value_rate_pct)}*`
    + ` · Đúng hạn *${fmtInt(s.on_time_deal_count ?? 0)}* · Trễ *${fmtInt(s.late_deal_count ?? 0)}*`,
  );
  lines.push(`   Hủy *${cancelPct}*${cancelDetail}`);

  const quoteParts = [`BG *${fmtInt(s.quote_deal_count ?? 0)}*`];
  if (s.quote_value > 0) quoteParts.push(`GT BG *${fmtMoneyShort(s.quote_value)}*`);
  quoteParts.push(`Chốt SL *${fmtInt(won)}*`);
  if (reportClosedWonValue(s) > 0) quoteParts.push(`GT chốt *${fmtMoneyShort(reportClosedWonValue(s))}*`);
  if (s.quote_win_rate_pct != null) quoteParts.push(`Chốt/BG *${s.quote_win_rate_pct}%*`);
  lines.push(`   ${quoteParts.join(' · ')}`);

  const extra = [];
  if (s.expected_value > 0) extra.push(`Dự kiến *${fmtMoneyShort(s.expected_value)}*`);
  if (s.weighted_value > 0) extra.push(`Kỳ vọng *${fmtMoneyShort(s.weighted_value)}*`);
  if (s.kpi_ledger_net) extra.push(`KPI *${Math.round(s.kpi_ledger_net)}*`);
  if (extra.length) lines.push(`   ${extra.join(' · ')}`);

  return lines;
}

/** Khối 1 nhân viên — 2 dòng gọn, dễ quét trên chat. */
function formatOrgTabEmployeeLines(e, idx, { hideDept = false } = {}) {
  const dealTotal = employeeDealTotal(e);
  const won = reportClosedWonCount(e);
  const lostCancel = reportCancelLostTotal(e);
  const cancelTotal = reportCancelTotalCount(e);
  const cancelPct = e.cancel_rate_pct != null ? `${e.cancel_rate_pct}%` : '—';
  const cancelDetail = cancelTotal ? ` (${lostCancel}/${cancelTotal})` : '';
  const badge = rankBadge(idx);
  const name = shortName(e.full_name);
  const dept = !hideDept && e.department_name ? ` · ${e.department_name}` : '';

  const lines = [];
  lines.push(`${badge} *${name}*${dept}`);
  lines.push(
    `   Deal ${dealTotal} · Ký ${won} (${fmtPct(e.conversion_rate)})`
    + ` · ĐH ${e.on_time_deal_count ?? 0} · Trễ ${e.late_deal_count ?? 0} · Hủy ${cancelPct}${cancelDetail}`,
  );

  const row2 = [];
  row2.push(`BG ${e.quote_deal_count ?? 0}`);
  if (e.quote_value > 0) row2.push(`GT BG ${fmtMoneyShort(e.quote_value)}`);
  if (reportClosedWonValue(e) > 0) row2.push(`Chốt ${fmtMoneyShort(reportClosedWonValue(e))}`);
  if (e.quote_win_rate_pct != null) row2.push(`Chốt/BG ${e.quote_win_rate_pct}%`);
  if (e.kpi_ledger_net) row2.push(`KPI ${Math.round(e.kpi_ledger_net)}`);
  lines.push(`   ${row2.join(' · ')}`);

  return lines;
}

/** @deprecated — giữ export nội bộ nếu cần; dùng formatOrgTabSummaryLines thay thế. */
function formatEmployeeTabMetricsLine(e) {
  const dealTotal = employeeDealTotal(e);
  const won = reportClosedWonCount(e);
  const lostCancel = reportCancelLostTotal(e);
  const cancelTotal = reportCancelTotalCount(e);
  const cancelPct = e.cancel_rate_pct != null ? `${e.cancel_rate_pct}%` : '—';
  const cancelDetail = cancelTotal ? ` (${lostCancel}/${cancelTotal})` : '';

  const row1 = [
    `Deal ${dealTotal}`,
    `TN ${dealTotal}`,
    `Ký HĐ ${won}`,
    `ĐH(A) ${e.on_time_deal_count ?? 0}`,
    `Trễ ${e.late_deal_count ?? 0}`,
    `Chốt/T ${fmtPct(e.conversion_rate)}`,
    `Chốt/GT ${fmtPct(e.deal_close_value_rate_pct)}`,
    `Hủy ${cancelPct}${cancelDetail}`,
  ].join(' | ');

  const row2Parts = [
    `BG ${e.quote_deal_count ?? 0}`,
    (e.quote_value > 0 ? `GT BG ${fmtMoneyShort(e.quote_value)}` : null),
    `Chốt SL ${won}`,
    (reportClosedWonValue(e) > 0 ? `GT chốt ${fmtMoneyShort(reportClosedWonValue(e))}` : null),
    (e.quote_win_rate_pct != null ? `Chốt/BG ${e.quote_win_rate_pct}%` : null),
    (e.monthly_growth_pct != null
      ? `TT ${Number(e.monthly_growth_pct) > 0 ? '+' : ''}${e.monthly_growth_pct}%`
      : null),
    (e.expected_value > 0 ? `DK ${fmtMoneyShort(e.expected_value)}` : null),
    (e.weighted_value > 0 ? `KV ${fmtMoneyShort(e.weighted_value)}` : null),
    (e.kpi_ledger_net ? `KPI ${Math.round(e.kpi_ledger_net)}` : null),
  ].filter(Boolean);

  return { row1, row2: row2Parts.join(' · ') };
}

function formatSummaryTabLine(s) {
  return formatOrgTabSummaryLines(s).slice(1).join('\n');
}

/**
 * Tab Nhân viên — trang «Báo cáo theo tổ chức» (cột Deal, tiếp nhận, Ký HĐ, BG, KPI…).
 * Cơ sở created_at — khác format_company_report_text (báo cáo hoạt động nhanh).
 */
async function formatOrgEmployeeTabReportText(params = {}) {
  const coRes = await resolveCompanyIdByName(params.company_id, params.company_name);
  if (coRes.error) return { text: coRes.error, company_id: null };
  const companyId = coRes.companyId || params.company_id || null;

  const deptRes = await resolveDepartmentForOrgReport({
    company_id: companyId,
    department_id: params.department_id,
    department_name: params.department_name,
  });
  if (deptRes.error) return { text: deptRes.error, company_id: companyId };

  const fetchParams = {
    ...params,
    company_id: companyId || params.company_id,
    department_id: deptRes.departmentId || params.department_id,
    ctx_user_id: params.ctx_user_id,
    deal_kh_split: params.deal_kh_split !== false,
  };

  const data = await fetchOrgOverviewReportForAi(null, fetchParams);
  const s = data.summary || {};
  let employees = (data.by_employee || []).filter((e) => e.user_id);

  if (params.only_with_activity !== false) {
    employees = employees.filter((e) =>
      (e.lead_count || 0) + employeeDealTotal(e) + reportClosedWonCount(e) + (e.quote_deal_count || 0) > 0);
  }

  employees.sort((a, b) =>
    reportClosedWonValue(b) - reportClosedWonValue(a)
    || employeeDealTotal(b) - employeeDealTotal(a)
    || (b.lead_count || 0) - (a.lead_count || 0));

  let companyName = 'Công ty';
  if (data.effectiveCompanyId) {
    const { data: co } = await supabase
      .from('companies')
      .select('name, short_name')
      .eq('id', data.effectiveCompanyId)
      .maybeSingle();
    companyName = co?.short_name || co?.name || companyName;
  }

  const periodLabel = params.date_from && params.date_to
    ? formatPeriodLabelVi(params.date_from, params.date_to)
    : formatPeriodLabelVi(data.df, data.dt);

  const lines = [];
  lines.push('🎯 *Báo cáo tab Nhân viên*');
  lines.push(`🏢 ${companyName}`);
  if (deptRes.scopeLabel) lines.push(deptRes.scopeLabel);
  lines.push(`🗓 ${periodLabel}`);
  lines.push('─────────────────');
  lines.push(...formatOrgTabSummaryLines(s));
  lines.push('─────────────────');

  if (!employees.length) {
    lines.push('');
    lines.push('📭 Không có NV có số liệu trong kỳ / phạm vi lọc.');
    return {
      text: lines.join('\n').slice(0, 3900),
      company_id: data.effectiveCompanyId,
      period_label: periodLabel,
    };
  }

  lines.push(`👥 *${employees.length} nhân viên*`);
  lines.push('');

  const maxRows = Math.min(Math.max(Number(params.top_n) || 15, 1), 25);
  const hideDept = !!(deptRes.departmentId || params.department_id);
  employees.slice(0, maxRows).forEach((e, idx) => {
    lines.push(...formatOrgTabEmployeeLines(e, idx, { hideDept }));
    if (idx < Math.min(employees.length, maxRows) - 1) lines.push('');
  });

  if (employees.length > maxRows) {
    lines.push('');
    lines.push(`_… +${employees.length - maxRows} NV khác_`);
  }

  lines.push('');
  lines.push('─────────────────');
  lines.push(`📌 ${employees.length} NV · Lead ${fmtInt(s.lead_count || 0)} · Deal ${fmtInt(orgReportTotalDealCount(s))}`);

  return {
    text: lines.join('\n').slice(0, 3900),
    company_id: data.effectiveCompanyId,
    department_id: data.appliedDepartmentId || deptRes.departmentId || null,
    period_label: periodLabel,
    employee_count: employees.length,
  };
}

function formatCompareDelta(key, compare) {
  const c = compare?.[key];
  if (!c || c.delta == null) return null;
  const sign = c.delta > 0 ? '+' : '';
  if (key.endsWith('_rate_pct') || key === 'conversion_rate') {
    return `${sign}${c.delta}%`;
  }
  return `${sign}${fmtInt(c.delta)}`;
}

/** Text chat-bubble — metrics khớp trang BC tổ chức (created_at). */
async function formatOrgOverviewReportText(params = {}) {
  const data = await fetchOrgOverviewReportForAi(null, params);
  const s = data.summary || {};
  const cmp = data.compare || {};
  const lines = [];

  let companyName = 'Công ty';
  if (data.effectiveCompanyId) {
    const { data: co } = await supabase
      .from('companies')
      .select('name, short_name')
      .eq('id', data.effectiveCompanyId)
      .maybeSingle();
    companyName = co?.short_name || co?.name || companyName;
  }

  const { df, dt, label } = resolveOrgReportDateRange(
    params.time_scope || 'this_month',
    params.days_offset ?? 0,
  );
  const periodLabel = params.date_from && params.date_to
    ? `${params.date_from} → ${params.date_to}`
    : `${df} → ${dt} (${label})`;

  lines.push(`📊 *Báo cáo tổ chức · ${companyName}*`);
  lines.push(`🗓 ${periodLabel}`);
  lines.push('📌 Cơ sở: ngày tạo (created_at) — khớp trang BC tổ chức');
  if (data.dealKhSplit) lines.push('📂 Tách tab Deal / Đơn hàng: bật');
  lines.push('━━━━━━━━━━━━━');

  lines.push(`📥 Lead: *${fmtInt(s.lead_count || 0)}*`);
  if (data.dealKhSplit) {
    lines.push(
      `🤝 Deal: *${fmtInt(orgReportTotalDealCount(s))}*`
      + ` · Pipeline: *${fmtInt(s.deal_count || 0)}*`
      + ` · ĐH: *${fmtInt(s.customer_order_count || 0)}*`,
    );
  } else {
    lines.push(`🤝 Deal pipeline: *${fmtInt(s.deal_count || 0)}*`
      + (s.customer_order_count ? ` · ĐH: *${fmtInt(s.customer_order_count)}*` : ''));
  }
  lines.push(`💰 GT pipeline: *${fmtMoneyShort(s.pipeline_value ?? ((s.lead_pipeline_value || 0) + (s.deal_pipeline_value || 0) + (s.customer_order_value || 0)))}*`);
  lines.push(`✅ Đã chốt: *${fmtInt(reportClosedWonCount(s))}* · *${fmtMoneyShort(reportClosedWonValue(s))}*`);
  lines.push(`❌ Huỷ/Thua: *${fmtInt(reportLostTotal(s))}*`);
  if (s.conversion_rate != null) {
    lines.push(`📈 Tỉ lệ chốt: *${s.conversion_rate}%*`
      + (cmp.conversion_rate?.delta != null ? ` (${formatCompareDelta('conversion_rate', cmp)})` : ''));
  }
  if (s.expected_value > 0 || s.weighted_value > 0) {
    lines.push(`🎯 Dự kiến: ${fmtMoneyShort(s.expected_value)} · Kỳ vọng: ${fmtMoneyShort(s.weighted_value)}`);
  }
  if (s.lead_overdue_count > 0 || s.lead_open_count > 0 || s.deal_overdue_count > 0 || s.deal_open_count > 0) {
    lines.push(
      `⏱ QH SLA Lead: *${fmtInt(s.lead_overdue_count || 0)}*/${fmtInt(s.lead_open_count || 0)}`
      + ` · Deal: *${fmtInt(s.deal_overdue_count || 0)}*/${fmtInt(s.deal_open_count || 0)}`,
    );
  } else if (s.overdue_count > 0 || s.open_count > 0) {
    lines.push(`⏱ Mở: ${fmtInt(s.open_count || 0)} · Quá SLA: *${fmtInt(s.overdue_count || 0)}*`
      + (s.overdue_rate_pct != null ? ` (${s.overdue_rate_pct}%)` : ''));
  }
  if (s.reception_overdue_count > 0) {
    lines.push(`📞 Tiếp nhận trễ: *${fmtInt(s.reception_overdue_count)}* / ${fmtInt(s.reception_eligible_count || 0)}`);
  }
  if (s.kpi_ledger_net) {
    lines.push(`⭐ KPI tháng (sổ cái): *${fmtInt(Math.round(s.kpi_ledger_net))}* đ`);
  }

  const employees = (data.by_employee || []).filter((e) => e.user_id);
  if (employees.length) {
    lines.push('', '👥 Theo nhân viên (top)');
    employees.slice(0, 10).forEach((e, idx) => {
      const parts = [];
      if (e.lead_count) parts.push(`${e.lead_count}L`);
      if (e.deal_count) parts.push(`${e.deal_count}D`);
      if (e.customer_order_count) parts.push(`${e.customer_order_count}ĐH`);
      const won = reportClosedWonCount(e);
      if (won) parts.push(`✅${won}`);
      if (reportClosedWonValue(e) > 0) parts.push(fmtMoneyShort(reportClosedWonValue(e)));
      if (e.overdue_count) parts.push(`⚠️SLA${e.overdue_count}`);
      if (e.kpi_ledger_net) parts.push(`KPI ${Math.round(e.kpi_ledger_net)}`);
      lines.push(`${idx + 1}. ${shortName(e.full_name)} · ${parts.join(' · ') || '—'}`);
    });
    if (employees.length > 10) {
      lines.push(`   …+${employees.length - 10} NV khác`);
    }
  }

  if (data.period_previous?.summary) {
    const ps = data.period_previous.summary;
    lines.push('', '📉 So với kỳ trước');
    lines.push(`Lead ${fmtInt(ps.lead_count)} → ${fmtInt(s.lead_count)} (${formatCompareDelta('lead_count', cmp) || '—'})`);
    lines.push(`Chốt ${fmtMoneyShort(reportClosedWonValue(ps))} → ${fmtMoneyShort(reportClosedWonValue(s))}`
      + (cmp.won_or_later_value?.pct != null ? ` (${cmp.won_or_later_value.pct > 0 ? '+' : ''}${cmp.won_or_later_value.pct}%)` : ''));
  }

  return {
    text: lines.join('\n').slice(0, 1900),
    company_id: data.effectiveCompanyId || params.company_id || null,
    date_from: data.df,
    date_to: data.dt,
  };
}

/** JSON đầy đủ — khớp GET /crm/reports/org-overview (trang BC tổ chức). */
async function getOrgOverviewReportFull(params = {}) {
  const data = await fetchOrgOverviewReportForAi(null, params);
  return {
    date_from: data.df,
    date_to: data.dt,
    company_id: data.effectiveCompanyId || null,
    region_id: data.explicitRegionId || null,
    basis: 'created_at',
    type: data.typeView || 'all',
    deal_kh_split: !!data.dealKhSplit,
    kpi_ledger_basis: data.kpi_ledger_basis || 'occurred_at_on_report_leads',
    kpi_ledger_date_from: data.kpi_ledger_date_from || data.df,
    kpi_ledger_date_to: data.kpi_ledger_date_to || data.dt,
    department_id: data.appliedDepartmentId || null,
    assigned_to: data.appliedAssignedTo || null,
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
  };
}

/** JSON gọn cho tool get_org_overview_report. */
async function getOrgOverviewReport(params = {}) {
  const data = await fetchOrgOverviewReportForAi(null, params);
  const s = data.summary || {};
  return {
    company_id: data.effectiveCompanyId || null,
    region_id: data.explicitRegionId || null,
    department_id: data.appliedDepartmentId || null,
    date_from: data.df,
    date_to: data.dt,
    basis: 'created_at',
    type: data.typeView || 'all',
    deal_kh_split: !!data.dealKhSplit,
    summary: {
      ...s,
      pipeline_value: s.pipeline_value ?? ((s.lead_pipeline_value || 0) + (s.deal_pipeline_value || 0) + (s.customer_order_value || 0)),
      closed_won_count: reportClosedWonCount(s),
      closed_won_value: reportClosedWonValue(s),
      lost_total: reportLostTotal(s),
    },
    compare: data.compare,
    by_employee: (data.by_employee || []).slice(0, 20).map((e) => ({
      user_id: e.user_id,
      full_name: e.full_name,
      department_name: e.department_name,
      lead_count: e.lead_count,
      deal_count: e.deal_count,
      customer_order_count: e.customer_order_count,
      deal_total: employeeDealTotal(e),
      pipeline_value: e.pipeline_value,
      on_time_deal_count: e.on_time_deal_count,
      late_deal_count: e.late_deal_count,
      closed_won_count: reportClosedWonCount(e),
      closed_won_value: reportClosedWonValue(e),
      conversion_rate: e.conversion_rate,
      deal_close_value_rate_pct: e.deal_close_value_rate_pct,
      cancel_rate_pct: e.cancel_rate_pct,
      quote_deal_count: e.quote_deal_count,
      quote_value: e.quote_value,
      quote_win_rate_pct: e.quote_win_rate_pct,
      monthly_growth_pct: e.monthly_growth_pct,
      expected_value: e.expected_value,
      weighted_value: e.weighted_value,
      overdue_count: e.overdue_count,
      kpi_ledger_net: e.kpi_ledger_net,
    })),
    by_region: (data.by_region || []).slice(0, 10),
    reception_sla_minutes: data.reception_sla_minutes ?? 15,
  };
}

/** Danh sách tất cả NV — format sạch, tách Deal / ĐH như BC tổ chức. */
async function formatAllEmployeesReportText(params = {}) {
  const data = await fetchOrgOverviewReportForAi(null, {
    ...params,
    deal_kh_split: params.deal_kh_split !== false,
  });
  const employees = (data.by_employee || []).filter((e) => e.user_id);
  const s = data.summary || {};

  let companyName = 'Công ty';
  if (data.effectiveCompanyId) {
    const { data: co } = await supabase
      .from('companies')
      .select('name, short_name')
      .eq('id', data.effectiveCompanyId)
      .maybeSingle();
    companyName = co?.short_name || co?.name || companyName;
  }

  const periodLabel = params.date_from && params.date_to
    ? formatPeriodLabelVi(params.date_from, params.date_to)
    : formatPeriodLabelVi(data.df, data.dt);

  const lines = [];
  lines.push('🎯 *Báo cáo theo nhân viên*');
  lines.push(`🏢 ${companyName}`);
  lines.push(`🗓 ${periodLabel}`);
  lines.push('─────────────────');

  if (!employees.length) {
    lines.push('📭 Không có dữ liệu NV trong kỳ.');
    return {
      text: lines.join('\n'),
      company_id: data.effectiveCompanyId,
      period_label: periodLabel,
    };
  }

  const sorted = [...employees].sort((a, b) => {
    const ta = orgReportTotalDealCount(a) + (a.lead_count || 0);
    const tb = orgReportTotalDealCount(b) + (b.lead_count || 0);
    return tb - ta;
  });

  sorted.forEach((e, idx) => {
    lines.push(...formatOrgTabEmployeeLines(e, idx));
    if (idx < sorted.length - 1) lines.push('');
  });

  lines.push('');
  lines.push('─────────────────');
  lines.push(...formatOrgTabSummaryLines(s).slice(1));
  lines.push('💡 Gõ tên NV để xem chi tiết cá nhân.');

  return {
    text: lines.join('\n').slice(0, 1900),
    company_id: data.effectiveCompanyId,
    period_label: periodLabel,
  };
}

module.exports = {
  resolveOrgReportDateRange,
  fetchOrgOverviewReportForAi,
  formatOrgOverviewReportText,
  getOrgOverviewReport,
  getOrgOverviewReportFull,
  formatAllEmployeesReportText,
  formatOrgEmployeeTabReportText,
};
