/**
 * Cron quét & bổ sung nhiệm vụ CRM thiếu theo bộ mẫu pipeline.
 * Chạy 2 lần/ngày: 12:30 và 18:00 giờ VN.
 *
 * Tích hợp: require('./jobs/crmMissingTasksCron').start()
 * Disable: CRM_MISSING_TASKS_CRON_DISABLED=1
 * Giới hạn: CRM_MISSING_TASKS_CRON_MAX_LEADS (mặc định 2000)
 * Song song: CRM_MISSING_TASKS_CRON_CONCURRENCY (mặc định 4)
 */
const { supabase } = require('../config/supabase');
const { runIfLeader } = require('../helpers/cronLeader');
const { ensureMissingCrmTasksForLead } = require('../helpers/autoGenCrmTasks');
const { resolveCrmTaskWriteLeadId } = require('../helpers/crmLeadTaskMutations');

const HOUR_MS = 3600 * 1000;
const VN_OFFSET_MS = 7 * HOUR_MS;

const RUN_HOURS_VN = [
  { h: 12, m: 30 },
  { h: 18, m: 0 },
];

function nowVN() {
  return new Date(Date.now() + VN_OFFSET_MS);
}

function msUntilNextRun() {
  const vn = nowVN();
  const hhmm = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  const slots = RUN_HOURS_VN.map((s) => s.h * 60 + s.m).sort((a, b) => a - b);
  for (const slot of slots) {
    if (slot > hhmm) return (slot - hhmm) * 60 * 1000;
  }
  return (24 * 60 - hhmm + slots[0]) * 60 * 1000;
}

function envInt(name, fallback) {
  const n = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function mapPool(items, concurrency, fn) {
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

/**
 * Lấy lead/deal đang mở (không thắng/thua) có pipeline — quét theo batch.
 */
async function fetchOpenLeadsForScan(maxLeads) {
  const { data: pipelines, error: plErr } = await supabase
    .from('crm_pipelines')
    .select('id')
    .eq('is_active', true);
  if (plErr) throw plErr;
  const pipelineIds = (pipelines || []).map((p) => p.id);
  if (!pipelineIds.length) return [];

  const { data: stages, error: stErr } = await supabase
    .from('crm_pipeline_stages')
    .select('id, is_won, is_lost')
    .in('pipeline_id', pipelineIds)
    .eq('is_active', true);
  if (stErr) throw stErr;

  const openStageIds = (stages || [])
    .filter((s) => !s.is_won && !s.is_lost)
    .map((s) => s.id);
  if (!openStageIds.length) return [];

  const batchSize = 500;
  const out = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore && out.length < maxLeads) {
    const end = Math.min(offset + batchSize - 1, offset + (maxLeads - out.length) - 1);
    const { data: batch, error } = await supabase
      .from('crm_leads')
      .select('id, type, pipeline_id, stage_id, company_id, created_by, parent_lead_id')
      .is('parent_lead_id', null)
      .not('pipeline_id', 'is', null)
      .in('pipeline_id', pipelineIds)
      .in('stage_id', openStageIds)
      .order('updated_at', { ascending: false })
      .range(offset, end);
    if (error) throw error;
    const rows = batch || [];
    out.push(...rows);
    hasMore = rows.length === batchSize;
    offset += batchSize;
  }
  return out.slice(0, maxLeads);
}

async function runOnce() {
  const startedAt = Date.now();
  const vnTime = nowVN().toISOString().replace('T', ' ').slice(0, 19);
  const maxLeads = envInt('CRM_MISSING_TASKS_CRON_MAX_LEADS', 2000);
  const concurrency = envInt('CRM_MISSING_TASKS_CRON_CONCURRENCY', 4);

  console.log(`[crm-missing-tasks] Bắt đầu quét lúc ${vnTime} (VN) max=${maxLeads} concurrency=${concurrency}`);

  const stats = {
    scanned: 0,
    touched: 0,
    created: 0,
    resynced: 0,
    deleted: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    const leads = await fetchOpenLeadsForScan(maxLeads);
    stats.scanned = leads.length;
    if (!leads.length) {
      console.log('[crm-missing-tasks] Không có lead/deal mở để quét');
      return stats;
    }

    await mapPool(leads, concurrency, async (lead) => {
      try {
        const taskLeadId = await resolveCrmTaskWriteLeadId(lead.id);
        const result = await ensureMissingCrmTasksForLead({
          leadId: taskLeadId,
          userId: lead.created_by || null,
          req: null,
          allStages: true,
        });

        if (!result?.ok && result?.error) {
          stats.errors += 1;
          console.warn(`[crm-missing-tasks] lead=${lead.id}: ${result.error}`);
          return;
        }

        const created = Number(result?.created || 0);
        const deleted = Number(result?.deleted || 0);
        if (result?.resynced) {
          stats.resynced += 1;
          stats.deleted += deleted;
          stats.created += created;
          stats.touched += 1;
          return;
        }
        if (created > 0) {
          stats.created += created;
          stats.touched += 1;
          return;
        }
        stats.skipped += 1;
      } catch (e) {
        stats.errors += 1;
        console.warn(`[crm-missing-tasks] lead=${lead.id}: ${e.message}`);
      }
    });

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `[crm-missing-tasks] Xong sau ${elapsed}s — scanned=${stats.scanned} touched=${stats.touched} `
      + `created=${stats.created} resynced=${stats.resynced} deleted=${stats.deleted} `
      + `skipped=${stats.skipped} errors=${stats.errors}`,
    );
    return stats;
  } catch (err) {
    console.error('[crm-missing-tasks] Lỗi:', err.message || err);
    stats.errors += 1;
    return stats;
  }
}

let started = false;
function start() {
  if (started) return;
  if (['1', 'true', 'yes', 'on'].includes(String(process.env.CRM_MISSING_TASKS_CRON_DISABLED || '').toLowerCase())) {
    console.log('[crm-missing-tasks] Disabled (CRM_MISSING_TASKS_CRON_DISABLED)');
    return;
  }
  started = true;

  const delay = msUntilNextRun();
  const delayH = (delay / HOUR_MS).toFixed(2);
  console.log(`[crm-missing-tasks] Lịch 12:30 & 18:00 VN — lần chạy tiếp sau ~${delayH}h`);

  function scheduleNext() {
    const nextDelay = Math.max(msUntilNextRun(), 60 * 1000);
    setTimeout(() => {
      void runIfLeader('crm-missing-tasks', () => runOnce(), { ttlSec: 7200 }).finally(scheduleNext);
    }, nextDelay);
  }

  setTimeout(() => {
    void runIfLeader('crm-missing-tasks', () => runOnce(), { ttlSec: 7200 }).finally(scheduleNext);
  }, Math.max(delay, 15 * 1000));
}

module.exports = { start, runOnce, msUntilNextRun, RUN_HOURS_VN };
