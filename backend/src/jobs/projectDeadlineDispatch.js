/**
 * Cron: kiểm tra công trình quá hạn → POST webhook (n8n / Zalo).
 *
 * Mỗi lần chạy lấy hạn quá hạn theo module (CRM / SX / VC), chỉ gửi link module đó,
 * kèm ID Zalo người chịu trách nhiệm để n8n @mention.
 *
 * Env:
 *   PROJECT_DEADLINE_WEBHOOK_URL          — URL nhận POST (bắt buộc để gửi)
 *   PROJECT_DEADLINE_WEBHOOK_SECRET       — header X-Webhook-Secret (tuỳ chọn)
 *   PROJECT_DEADLINE_WEBHOOK_MODE         — each (mặc định) | batch
 *   PROJECT_DEADLINE_COMPANY_IDS          — uuid,uuid (trống = mọi công ty)
 *   PROJECT_DEADLINE_DISPATCH_DISABLED=1  — tắt cron
 *   PROJECT_DEADLINE_DISPATCH_INTERVAL_MS — mặc định 30 phút
 *
 * Tích hợp: require('./jobs/projectDeadlineDispatch').start()
 */
const { supabase } = require('../config/supabase');
const { runIfLeader } = require('../helpers/cronLeader');
const { listProjectDeadlineNotifications } = require('../helpers/projectDeadlineExport');

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const DEDUP_WINDOW_MS = 12 * 60 * 60 * 1000;
const POST_TIMEOUT_MS = 12000;

function resolveWebhookUrl() {
  const direct = String(process.env.PROJECT_DEADLINE_WEBHOOK_URL || '').trim().replace(/\/+$/, '');
  if (direct) return direct;
  const n8n = String(process.env.N8N_WEBHOOK_BASE_URL || '').trim().replace(/\/+$/, '');
  if (n8n) return `${n8n}/webhook/project-deadlines`;
  return null;
}

function parseCompanyIds() {
  const raw = String(process.env.PROJECT_DEADLINE_COMPANY_IDS || '').trim();
  if (!raw) return null;
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return ids.length ? ids : null;
}

function fingerprintOf(n) {
  const pid = n?.project?.id || '';
  const mod = n?.deadline?.module || '';
  const src = n?.deadline?.source || '';
  const at = n?.deadline?.at || '';
  const kind = n?.deadline?.is_overdue ? 'overdue' : 'warning';
  return `${pid}:${mod}:${src}:${at}:${kind}`;
}

function flattenItem(n) {
  return {
    event: n?.deadline?.is_overdue ? 'project_deadline_overdue' : 'project_deadline_warning',
    title: n.title,
    message: n.message,
    text: n.text,
    project: n.project,
    customer: n.customer,
    deal: n.deal,
    deadline: n.deadline,
    responsible: n.responsible,
    zalo_id: n.responsible?.zalo_id || null,
    zalo_mention: n.responsible?.zalo_mention || null,
    zalo_mentions: n.zalo_mentions || [],
    module: n.deadline?.module || n.links?.module || null,
    module_label: n.links?.label || null,
    link: n.links?.url || null,
    links: n.links,
  };
}

async function postJson(url, payload, secret) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
  try {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'TubepCRM-ProjectDeadline/1.0',
    };
    if (secret) headers['X-Webhook-Secret'] = secret;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const status = res.status;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, status, error: body.slice(0, 300) || `HTTP ${status}` };
    }
    return { ok: true, status };
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'timeout' : (e.message || String(e));
    return { ok: false, status: null, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

async function loadRecentFingerprints() {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('project_deadline_dispatches')
    .select('fingerprint')
    .gte('sent_at', since)
    .limit(4000);
  if (error) {
    if (String(error.message || '').includes('project_deadline_dispatches')) {
      console.warn('[project-deadline-dispatch] Bảng dispatch chưa migrate:', error.message);
      return new Set();
    }
    throw error;
  }
  return new Set((data || []).map((r) => r.fingerprint).filter(Boolean));
}

async function logDispatch(row) {
  const { error } = await supabase.from('project_deadline_dispatches').insert(row);
  if (error) console.warn('[project-deadline-dispatch] log:', error.message);
}

/**
 * @param {{ force?: boolean }} [opts]
 */
async function runOnce(opts = {}) {
  const webhookUrl = resolveWebhookUrl();
  if (!webhookUrl) {
    console.warn('[project-deadline-dispatch] Bỏ qua: chưa đặt PROJECT_DEADLINE_WEBHOOK_URL');
    return { ok: false, skipped: true, reason: 'missing_webhook_url', sent: 0 };
  }

  const mode = String(process.env.PROJECT_DEADLINE_WEBHOOK_MODE || 'each').toLowerCase() === 'batch'
    ? 'batch'
    : 'each';
  const secret = String(process.env.PROJECT_DEADLINE_WEBHOOK_SECRET || '').trim();
  const companyIds = parseCompanyIds();

  const payload = await listProjectDeadlineNotifications({
    companyIds,
    status: 'overdue',
    daysAhead: 0,
    limit: 400,
  });
  const items = payload.notifications || [];
  if (!items.length) {
    console.log('[project-deadline-dispatch] Không có công trình quá hạn');
    return { ok: true, sent: 0, skipped_dup: 0, total: 0 };
  }

  const seen = opts.force ? new Set() : await loadRecentFingerprints();
  const fresh = [];
  for (const n of items) {
    const fp = fingerprintOf(n);
    if (!fp || seen.has(fp)) continue;
    seen.add(fp);
    fresh.push({ n, fp });
  }
  if (!fresh.length) {
    console.log(`[project-deadline-dispatch] ${items.length} quá hạn, đã gửi gần đây — bỏ qua`);
    return { ok: true, sent: 0, skipped_dup: items.length, total: items.length };
  }

  let sent = 0;
  let failed = 0;
  if (mode === 'batch') {
    const body = {
      event: 'project_deadline_overdue_batch',
      generated_at: payload.generated_at,
      count: fresh.length,
      notifications: fresh.map(({ n }) => flattenItem(n)),
    };
    const res = await postJson(webhookUrl, body, secret);
    for (const { n, fp } of fresh) {
      await logDispatch({
        project_id: n.project?.id,
        module_key: n.deadline?.module || '',
        kind: 'overdue',
        fingerprint: fp,
        webhook_url: webhookUrl,
        http_status: res.status,
        error: res.ok ? null : (res.error || null),
      });
    }
    if (res.ok) sent = fresh.length;
    else failed = fresh.length;
  } else {
    for (const { n, fp } of fresh) {
      const body = flattenItem(n);
      const res = await postJson(webhookUrl, body, secret);
      await logDispatch({
        project_id: n.project?.id,
        module_key: n.deadline?.module || '',
        kind: 'overdue',
        fingerprint: fp,
        webhook_url: webhookUrl,
        http_status: res.status,
        error: res.ok ? null : (res.error || null),
      });
      if (res.ok) sent += 1;
      else failed += 1;
    }
  }

  console.log(`[project-deadline-dispatch] Gửi ${sent}/${fresh.length} (dup ${items.length - fresh.length}, lỗi ${failed}) → ${webhookUrl}`);
  return {
    ok: failed === 0,
    sent,
    failed,
    skipped_dup: items.length - fresh.length,
    total: items.length,
    webhook_url: webhookUrl,
    mode,
  };
}

function start() {
  if (process.env.PROJECT_DEADLINE_DISPATCH_DISABLED === '1') {
    console.log('[project-deadline-dispatch] Disabled (env)');
    return;
  }
  const intervalMs = Math.max(
    5 * 60 * 1000,
    parseInt(process.env.PROJECT_DEADLINE_DISPATCH_INTERVAL_MS || String(DEFAULT_INTERVAL_MS), 10) || DEFAULT_INTERVAL_MS,
  );
  const ttlSec = Math.max(120, Math.round(intervalMs / 1000) - 30);
  setTimeout(() => { void runIfLeader('project-deadline-dispatch', () => runOnce(), { ttlSec }); }, 90 * 1000);
  setInterval(() => { void runIfLeader('project-deadline-dispatch', () => runOnce(), { ttlSec }); }, intervalMs);
  const url = resolveWebhookUrl();
  console.log(`[project-deadline-dispatch] Started — mỗi ${Math.round(intervalMs / 60000)} phút${url ? ` → ${url}` : ' (chưa có WEBHOOK_URL)'}`);
}

module.exports = { start, runOnce, resolveWebhookUrl };
