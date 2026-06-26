/**
 * Kiểm tra GT Pipeline mở — khớp logic app crm-mobile-v2 (loại Thua/Hủy/Thắng).
 * Usage: node backend/scripts/verify-open-pipeline.js [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 */
require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');

const BASE = (process.env.CHECK_API_URL || 'https://tubep-backend.onrender.com').replace(/\/$/, '');

const LOST_PIPELINE_STAGE_NAME_RE =
  /(hủy\s*deal|^\s*thua\s*\.?\s*$|chê\s*gi[aá]|khách\s*hủy|từ\s*chối|rớt|\blost\b|mất\s*deal)/i;

function monthRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  return { from, to };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { ...monthRange() };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from') out.from = args[++i];
    else if (args[i] === '--to') out.to = args[++i];
  }
  return out;
}

function fmtVnd(n) {
  const v = Math.round(Number(n) || 0);
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} tỷ`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} tr`;
  return v.toLocaleString('vi-VN');
}

function stageOrderIndex(stage) {
  const ord = Number(stage?.order_index);
  return Number.isFinite(ord) ? ord : 999;
}

function isLostOrCancelledPipelineStage(stage) {
  if (!stage) return false;
  if (stage.is_lost) return true;
  if (stage.canonical_slug === 'lost') return true;
  if (stage.deal_report_bucket === 'lost') return true;
  const name = String(stage.name || '').trim();
  return LOST_PIPELINE_STAGE_NAME_RE.test(name);
}

function isWonOrClosedPipelineStage(stage) {
  if (!stage) return false;
  if (stage.is_won) return true;
  if (stage.counts_as_completed_revenue) return true;
  const slug = stage.canonical_slug || '';
  if (slug === 'won' || slug === 'completed') return true;
  if (stage.deal_report_bucket === 'completed') return true;
  return false;
}

function isOpenPipelineValueStage(stage) {
  if (!stage?.id) return false;
  if (isLostOrCancelledPipelineStage(stage)) return false;
  if (isWonOrClosedPipelineStage(stage)) return false;
  return true;
}

function resolveDealWonAnchorStage(stagesDeal) {
  const won = [...stagesDeal]
    .sort((a, b) => stageOrderIndex(a) - stageOrderIndex(b))
    .filter((s) => !!s.is_won && !s.is_lost);
  if (!won.length) return null;
  if (won.length === 1) return won[0];
  return won.reduce((best, s) => (stageOrderIndex(s) > stageOrderIndex(best) ? s : best));
}

function splitDealStagesForCrmTabs(stagesDeal) {
  const sorted = [...stagesDeal].sort((a, b) => stageOrderIndex(a) - stageOrderIndex(b));
  const wonStage = resolveDealWonAnchorStage(sorted);
  const wonAnchorOrder = wonStage ? stageOrderIndex(wonStage) : null;
  const wonStageId = wonStage ? String(wonStage.id) : null;

  if (wonAnchorOrder == null) {
    return { dealTabStages: sorted, wonStage, wonAnchorOrder };
  }

  const dealTabStages = [];
  for (const s of sorted) {
    const sid = String(s.id);
    const order = stageOrderIndex(s);
    if (s.is_lost) {
      dealTabStages.push(s);
      continue;
    }
    if (sid === wonStageId || order === wonAnchorOrder) {
      dealTabStages.push(s);
      continue;
    }
    if (order < wonAnchorOrder) dealTabStages.push(s);
  }
  return { dealTabStages, wonStage, wonAnchorOrder };
}

function preWonStagesForDealStats(dealTabStages, wonStage, wonAnchorOrder) {
  const wonId = wonStage?.id ? String(wonStage.id) : null;
  return (dealTabStages || []).filter((s) => {
    if (s.is_lost) return true;
    if (wonAnchorOrder == null) return !s.is_won;
    if (wonId && String(s.id) === wonId) return false;
    return stageOrderIndex(s) < wonAnchorOrder;
  });
}

function hasExplicitExpectedRevenueStage(stages) {
  return (stages || []).some((s) => !!s.counts_as_expected_revenue && isOpenPipelineValueStage(s));
}

function expectedRevenueStagesForPipelineValue(dealStages) {
  const openStages = (dealStages || []).filter(isOpenPipelineValueStage);
  if (hasExplicitExpectedRevenueStage(dealStages)) {
    return openStages.filter((s) => !!s.counts_as_expected_revenue);
  }
  const { dealTabStages, wonStage, wonAnchorOrder } = splitDealStagesForCrmTabs(openStages);
  return preWonStagesForDealStats(dealTabStages, wonStage, wonAnchorOrder)
    .filter(isOpenPipelineValueStage);
}

function sumCrmOpenPipelineValue(dealStages, stageValues) {
  const stages = expectedRevenueStagesForPipelineValue(dealStages);
  const includeOrphan = !hasExplicitExpectedRevenueStage(dealStages);
  let total = 0;
  for (const stage of stages) {
    total += Number(stageValues?.[stage.id] ?? 0) || 0;
  }
  if (includeOrphan) total += Number(stageValues?.__none__ ?? 0) || 0;
  return Math.round(total);
}

function sumCrmOpenWeightedPipelineValue(dealStages, stageWeightedValues) {
  const stages = expectedRevenueStagesForPipelineValue(dealStages);
  const includeOrphan = !hasExplicitExpectedRevenueStage(dealStages);
  let total = 0;
  for (const stage of stages) {
    total += Number(stageWeightedValues?.[stage.id] ?? 0) || 0;
  }
  if (includeOrphan) total += Number(stageWeightedValues?.__none__ ?? 0) || 0;
  return Math.round(total);
}

function sumRawValues(values) {
  return Math.round(Object.values(values || {}).reduce((s, v) => s + (Number(v) || 0), 0));
}

async function fetchCompanyOpenPipelineFromSupabase(company) {
  const { supabase } = require('../src/config/supabase');
  const { data: pipelines, error: pipeErr } = await supabase
    .from('crm_pipelines')
    .select('id')
    .eq('company_id', company.id);
  if (pipeErr) throw pipeErr;
  const pipelineIds = (pipelines || []).map((p) => p.id).filter(Boolean);
  if (!pipelineIds.length) {
    return { openValue: 0, openWeighted: 0, excludedLostValue: 0, excludedLostNames: [] };
  }

  const { data: stages, error: stErr } = await supabase
    .from('crm_pipeline_stages')
    .select('id, name, order_index, is_won, is_lost, counts_as_expected_revenue, counts_as_completed_revenue, canonical_slug, deal_report_bucket, pipeline_id')
    .eq('pipeline_type', 'deal')
    .in('pipeline_id', pipelineIds)
    .order('order_index');
  if (stErr) throw stErr;

  const stageIds = (stages || []).map((s) => s.id).filter(Boolean);
  const { data: rpcRaw, error: rpcErr } = await supabase.rpc('crm_leads_stage_counts', {
    p_type: 'deal',
    p_company_id: company.id,
    p_phone_filter: 'has_phone',
    p_pipeline_stage_ids: stageIds.length ? stageIds : null,
  });
  if (rpcErr) throw rpcErr;

  let rpc = rpcRaw;
  if (typeof rpc === 'string') {
    try { rpc = JSON.parse(rpc); } catch { /* keep */ }
  }
  const values = rpc?.values || {};
  const weighted = rpc?.weighted_values || {};
  const openValue = sumCrmOpenPipelineValue(stages, values);
  const openWeighted = sumCrmOpenWeightedPipelineValue(stages, weighted);
  const excludedLost = (stages || []).filter(isLostOrCancelledPipelineStage);
  const excludedLostValue = excludedLost.reduce((s, st) => s + (Number(values[st.id]) || 0), 0);

  return {
    source: 'supabase_rpc',
    hasValues: Object.keys(values).length > 0,
    openValue,
    openWeighted,
    rawSum: sumRawValues(values),
    excludedLostValue,
    excludedLostNames: excludedLost.map((s) => s.name).filter(Boolean),
  };
}

async function getToken() {
  if (process.env.UPLOAD_AUTH_TOKEN || process.env.ADMIN_AUTH_TOKEN) {
    return process.env.UPLOAD_AUTH_TOKEN || process.env.ADMIN_AUTH_TOKEN;
  }
  const { supabase } = require('../src/config/supabase');
  const { data: user } = await supabase
    .from('users')
    .select('id, email, role, full_name, company_id, department_id')
    .eq('role', 'admin')
    .neq('is_active', false)
    .order('email')
    .limit(1)
    .maybeSingle();
  if (!user || !process.env.JWT_SECRET) throw new Error('Need admin user + JWT_SECRET');
  return jwt.sign({
    userId: user.id,
    email: user.email,
    role: user.role,
    fullName: user.full_name,
    company_id: user.company_id || null,
    department_id: user.department_id || null,
    crm_region_ids: [],
  }, process.env.JWT_SECRET);
}

async function apiGet(token, path, params = {}) {
  const { data } = await axios.get(`${BASE}/api${path}`, {
    params,
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

async function fetchCompanyOpenPipeline(token, company, from, to) {
  const params = { type: 'deal', phone_filter: 'has_phone', lite: '1', company_id: company.id };
  const [stageCounts, stages, orgReport] = await Promise.all([
    apiGet(token, '/crm/stage-counts', params),
    apiGet(token, '/crm/pipeline-stages', { type: 'deal', company_id: company.id }),
    apiGet(token, '/crm/reports/org-overview', {
      date_from: from,
      date_to: to,
      type: 'deal',
      company_id: company.id,
    }),
  ]);

  const values = stageCounts?.values || {};
  const weighted = stageCounts?.weighted_values || {};
  const hasValues = Object.keys(values).length > 0;
  const openValue = sumCrmOpenPipelineValue(stages, values);
  const openWeighted = sumCrmOpenWeightedPipelineValue(stages, weighted);
  const rawSum = sumRawValues(values);
  const excludedLost = (stages || []).filter(isLostOrCancelledPipelineStage);
  const excludedLostValue = excludedLost.reduce((s, st) => s + (Number(values[st.id]) || 0), 0);

  return {
    company,
    hasValues,
    openValue,
    openWeighted,
    rawSum,
    excludedLostValue,
    excludedLostNames: excludedLost.map((s) => s.name).filter(Boolean),
    orgExpected: orgReport?.summary?.expected_value ?? 0,
    orgPipeline: orgReport?.summary?.pipeline_value ?? 0,
    orgWeighted: orgReport?.summary?.weighted_value ?? 0,
  };
}

async function main() {
  const { from, to } = parseArgs();
  const token = await getToken();

  const { companies } = await apiGet(token, '/companies', { for_module: 'crm' });
  const list = Array.isArray(companies) ? companies : [];

  console.log(`API: ${BASE}`);
  console.log(`Kỳ org-overview: ${from} → ${to}`);
  console.log('');

  const probe = await apiGet(token, '/crm/stage-counts', {
    type: 'deal',
    phone_filter: 'has_phone',
    lite: '1',
  });
  const apiKeys = probe && typeof probe === 'object' ? Object.keys(probe).sort() : [];
  console.log('stage-counts keys:', apiKeys.join(', '));
  console.log('HAS values:', apiKeys.includes('values') ? 'YES' : 'NO');
  console.log('');

  let totalOpen = 0;
  let totalOpenWeighted = 0;
  let totalOrgExpected = 0;
  let totalOrgPipeline = 0;
  let totalExcludedLost = 0;

  for (const co of list) {
    const row = await fetchCompanyOpenPipeline(token, co, from, to);
    totalOrgExpected += row.orgExpected;
    totalOrgPipeline += row.orgPipeline;

    const label = co.short_name || co.name || co.id;
    console.log(`── ${label} ──`);
    console.log(`  org expected_value (kỳ):     ${fmtVnd(row.orgExpected)}`);
    console.log(`  org pipeline_value (kỳ):     ${fmtVnd(row.orgPipeline)}`);

    if (!row.hasValues) {
      console.log('  ⚠ API chưa trả values — kiểm tra qua Supabase RPC...');
      try {
        const sb = await fetchCompanyOpenPipelineFromSupabase(co);
        console.log(`  Pipeline mở (sau deploy):  ${fmtVnd(sb.openValue)} (${sb.openValue.toLocaleString('vi-VN')} đ)`);
        console.log(`  Kỳ vọng có trọng số:       ${fmtVnd(sb.openWeighted)}`);
        if (sb.excludedLostValue > 0) {
          console.log(`  Đã loại GT cột Thua/Hủy:   ${fmtVnd(sb.excludedLostValue)} (${sb.excludedLostNames.join(', ')})`);
        }
        totalOpen += sb.openValue;
        totalOpenWeighted += sb.openWeighted;
        totalExcludedLost += sb.excludedLostValue;
      } catch (e) {
        console.log(`  Supabase RPC lỗi: ${e.message}`);
      }
    } else {
      console.log(`  Pipeline mở (app logic):     ${fmtVnd(row.openValue)} (${row.openValue.toLocaleString('vi-VN')} đ)`);
      console.log(`  Kỳ vọng có trọng số:         ${fmtVnd(row.openWeighted)}`);
      if (row.excludedLostValue > 0) {
        console.log(`  Đã loại GT cột Thua/Hủy:     ${fmtVnd(row.excludedLostValue)} (${row.excludedLostNames.join(', ')})`);
      }
      totalOpen += row.openValue;
      totalOpenWeighted += row.openWeighted;
      totalExcludedLost += row.excludedLostValue;
    }
    console.log('');
  }

  console.log('══ TỔNG (cộng theo công ty) ══');
  console.log(`Pipeline mở (số app sau deploy): ${fmtVnd(totalOpen)} (${totalOpen.toLocaleString('vi-VN')} đ)`);
  console.log(`Kỳ vọng có trọng số:           ${fmtVnd(totalOpenWeighted)}`);
  console.log(`org expected_value (kỳ):       ${fmtVnd(totalOrgExpected)} ← không dùng cho Pipeline mở`);
  console.log(`org pipeline_value (kỳ):       ${fmtVnd(totalOrgPipeline)}`);
  console.log(`GT loại khỏi pipeline mở:      ${fmtVnd(totalExcludedLost)} (Thua/Hủy/Chê giá/Khách hủy)`);
  if (!apiKeys.includes('values')) {
    console.log('');
    console.log('NOTE: Cần deploy backend (core.js trả values) để app hiện đúng số trên production.');
  }
}

main().catch((e) => {
  console.error('ERR:', e.response?.data?.error || e.message);
  process.exit(1);
});
