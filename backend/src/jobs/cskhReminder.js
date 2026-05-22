/**
 * CSKH Follow-Up Care Reminder — chạy 2 lần/ngày (8h30, 13h30 giờ VN)
 * Tạo thông báo nhắc CSKH cho từng user dựa trên lead cần chăm lại theo pipeline/stage/time bucket.
 *
 * Tích hợp vào server.js: require('./jobs/cskhReminder').start(io)
 * Disable bằng env CSKH_CRON_DISABLED=1
 */
const { supabase } = require('../config/supabase');
const { isAdminLike } = require('../helpers/adminRole');

const HOUR_MS = 3600 * 1000;
const VN_OFFSET_MS = 7 * HOUR_MS;

const TIME_BUCKETS = [
  { key: 'w1', label: '7–13 ngày trước', daysFrom: 13, daysTo: 7 },
  { key: 'w2', label: '14–20 ngày trước', daysFrom: 20, daysTo: 14 },
  { key: 'w3', label: '21–27 ngày trước', daysFrom: 27, daysTo: 21 },
  { key: 'w4', label: '28–34 ngày trước', daysFrom: 34, daysTo: 28 },
];

const RUN_HOURS_VN = [
  { h: 8, m: 30 },
  { h: 13, m: 30 },
];

function nowVN() {
  return new Date(Date.now() + VN_OFFSET_MS);
}

function msUntilNextRun() {
  const vn = nowVN();
  const hhmm = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  const slots = RUN_HOURS_VN.map((s) => s.h * 60 + s.m).sort((a, b) => a - b);
  for (const slot of slots) {
    if (slot > hhmm) {
      return (slot - hhmm) * 60 * 1000;
    }
  }
  const nextDay = (24 * 60 - hhmm + slots[0]) * 60 * 1000;
  return nextDay;
}

async function runOnce(io) {
  const startedAt = Date.now();
  const vnTime = nowVN().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[cskh-cron] Bắt đầu nhắc CSKH lúc ${vnTime} (VN)`);

  try {
    const { data: activeUsers } = await supabase
      .from('users')
      .select('id, role, company_id')
      .eq('is_active', true);

    if (!activeUsers?.length) {
      console.log('[cskh-cron] Không có user active');
      return;
    }

    const { data: pipelines } = await supabase
      .from('crm_pipelines')
      .select('id, name, company_id')
      .eq('is_active', true);

    if (!pipelines?.length) {
      console.log('[cskh-cron] Không có pipeline active');
      return;
    }

    const pipelineIds = pipelines.map((p) => p.id);
    const pipelineMap = Object.fromEntries(pipelines.map((p) => [p.id, p]));

    const { data: allStages } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, color, icon, pipeline_id, pipeline_type, is_won, is_lost')
      .in('pipeline_id', pipelineIds)
      .eq('is_active', true);

    const stageMap = {};
    const openStageIds = [];
    const pipelineTypeMap = {};
    (allStages || []).forEach((s) => {
      stageMap[s.id] = s;
      if (!s.is_won && !s.is_lost) openStageIds.push(s.id);
      if (s.pipeline_type && s.pipeline_id) pipelineTypeMap[s.pipeline_id] = s.pipeline_type;
    });

    if (!openStageIds.length) {
      console.log('[cskh-cron] Không có stage mở');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDaysBack = Math.max(...TIME_BUCKETS.map((b) => b.daysFrom));
    const globalDateFrom = new Date(today);
    globalDateFrom.setDate(globalDateFrom.getDate() - maxDaysBack);

    let allLeads = [];
    let offset = 0;
    const batchSize = 500;
    let hasMore = true;
    while (hasMore) {
      const { data: batch } = await supabase
        .from('crm_leads')
        .select('id, stage_id, pipeline_id, company_id, assigned_to, lead_owner_id, created_at, type')
        .is('parent_lead_id', null)
        .in('pipeline_id', pipelineIds)
        .in('stage_id', openStageIds)
        .gte('created_at', globalDateFrom.toISOString().split('T')[0])
        .lte('created_at', `${today.toISOString().split('T')[0]}T23:59:59.999Z`)
        .range(offset, offset + batchSize - 1);
      const rows = batch || [];
      allLeads = allLeads.concat(rows);
      hasMore = rows.length === batchSize;
      offset += batchSize;
    }

    if (!allLeads.length) {
      console.log('[cskh-cron] Không có lead nào trong phạm vi');
      return;
    }

    // Lấy care marks (lead đã được đánh dấu chăm sóc) theo user — loại khỏi count.
    const caredByUser = {};
    try {
      const { data: marks } = await supabase
        .from('crm_lead_care_marks')
        .select('user_id, lead_id')
        .gt('expires_at', new Date().toISOString());
      for (const m of (marks || [])) {
        if (!caredByUser[m.user_id]) caredByUser[m.user_id] = new Set();
        caredByUser[m.user_id].add(m.lead_id);
      }
    } catch { }

    const countsPerUserKey = {};
    /** Type của (pipeline|stage) lấy từ chính lead — đáng tin cậy hơn cột pipeline_type của stage. */
    const groupTypeMap = {};
    for (const lead of allLeads) {
      const createdMs = new Date(lead.created_at).getTime();
      for (const bucket of TIME_BUCKETS) {
        const from = new Date(today);
        from.setDate(from.getDate() - bucket.daysFrom);
        const to = new Date(today);
        to.setDate(to.getDate() - bucket.daysTo);
        to.setHours(23, 59, 59, 999);
        if (createdMs >= from.getTime() && createdMs <= to.getTime()) {
          if (lead.type === 'lead' || lead.type === 'deal') {
            groupTypeMap[`${lead.pipeline_id}|${lead.stage_id}`] = lead.type;
          }
          const recipients = [lead.assigned_to, lead.lead_owner_id].filter(Boolean);
          const uniqueRecipients = [...new Set(recipients.map(String))];
          for (const uid of uniqueRecipients) {
            if (caredByUser[uid]?.has(lead.id)) continue; // user đã đánh dấu chăm sóc → bỏ qua
            const key = `${uid}|${lead.pipeline_id}|${lead.stage_id}|${bucket.key}`;
            countsPerUserKey[key] = (countsPerUserKey[key] || 0) + 1;
          }
          break;
        }
      }
    }

    const adminUsers = (activeUsers || []).filter((u) => isAdminLike(u));
    for (const admin of adminUsers) {
      const cid = admin.company_id || null;
      const adminCared = caredByUser[admin.id];
      for (const lead of allLeads) {
        if (cid && String(lead.company_id) !== String(cid)) continue;
        if (adminCared?.has(lead.id)) continue;
        const createdMs = new Date(lead.created_at).getTime();
        for (const bucket of TIME_BUCKETS) {
          const from = new Date(today);
          from.setDate(from.getDate() - bucket.daysFrom);
          const to = new Date(today);
          to.setDate(to.getDate() - bucket.daysTo);
          to.setHours(23, 59, 59, 999);
          if (createdMs >= from.getTime() && createdMs <= to.getTime()) {
            const key = `${admin.id}|${lead.pipeline_id}|${lead.stage_id}|${bucket.key}`;
            countsPerUserKey[key] = (countsPerUserKey[key] || 0) + 1;
            break;
          }
        }
      }
    }

    let dismissedSet = new Set();
    try {
      const { data: dismissals } = await supabase
        .from('crm_followup_care_dismissals')
        .select('user_id, pipeline_id, stage_id, company_id, time_bucket')
        .gt('expires_at', new Date().toISOString());
      dismissedSet = new Set(
        (dismissals || []).map((d) => `${d.user_id}|${d.pipeline_id || ''}|${d.stage_id || ''}|${d.time_bucket}`)
      );
    } catch { }

    const fourHoursAgo = new Date(Date.now() - 4 * HOUR_MS).toISOString();
    const { data: recentNotifs } = await supabase
      .from('notifications')
      .select('user_id, entity_id, metadata')
      .eq('type', 'cskh_followup_reminder')
      .gte('created_at', fourHoursAgo);
    const recentSet = new Set(
      (recentNotifs || []).map((n) => {
        const m = n.metadata || {};
        return `${n.user_id}|${m.pipeline_id || ''}|${m.stage_id || ''}|${m.time_bucket || ''}`;
      })
    );

    const notifs = [];
    for (const [compositeKey, count] of Object.entries(countsPerUserKey)) {
      if (count <= 0) continue;
      const [userId, pipelineId, stageId, timeBucket] = compositeKey.split('|');

      const pipeline = pipelineMap[pipelineId];
      const stage = stageMap[stageId];
      if (!pipeline || !stage) continue;

      const dismissKey = `${userId}|${pipelineId}|${stageId}|${timeBucket}`;
      if (dismissedSet.has(dismissKey)) continue;

      const recentKey = `${userId}|${pipelineId}|${stageId}|${timeBucket}`;
      if (recentSet.has(recentKey)) continue;

      const bucketMeta = TIME_BUCKETS.find((b) => b.key === timeBucket);
      notifs.push({
        user_id: userId,
        type: 'cskh_followup_reminder',
        title: `📋 ${count} lead cần chăm lại`,
        message: `${stage.icon || ''} ${stage.name} · ${pipeline.name} · Tuổi: ${bucketMeta?.label || timeBucket}`,
        entity_type: 'cskh_followup',
        entity_id: `${pipelineId}_${stageId}_${timeBucket}`,
        metadata: {
          pipeline_id: pipelineId,
          pipeline_name: pipeline.name,
          stage_id: stageId,
          stage_name: stage.name,
          stage_icon: stage.icon,
          company_id: pipeline.company_id || null,
          time_bucket: timeBucket,
          time_label: bucketMeta?.label || timeBucket,
          lead_count: count,
          module_key: 'crm',
          nav_url: `/crm/follow-up-care?pipeline_id=${pipelineId}&stage_id=${stageId}&company_id=${pipeline.company_id || ''}&time=${timeBucket}&type=${groupTypeMap[`${pipelineId}|${stageId}`] || stage.pipeline_type || pipelineTypeMap[pipelineId] || 'lead'}`,
        },
      });
    }

    if (notifs.length) {
      const BATCH = 50;
      let insertedTotal = 0;
      for (let i = 0; i < notifs.length; i += BATCH) {
        const chunk = notifs.slice(i, i + BATCH);
        const { data: inserted } = await supabase.from('notifications').insert(chunk).select('id, user_id');
        if (inserted?.length && io) {
          inserted.forEach((n) => io.to(`user:${n.user_id}`).emit('notification', n));
        }
        insertedTotal += inserted?.length || 0;
      }
      console.log(`[cskh-cron] Đã tạo ${insertedTotal}/${notifs.length} thông báo CSKH`);
    } else {
      console.log('[cskh-cron] Không có thông báo CSKH cần tạo');
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[cskh-cron] Xong sau ${elapsed}s`);
  } catch (err) {
    console.error('[cskh-cron] Lỗi:', err.message || err);
  }
}

let started = false;
function start(io) {
  if (started) return;
  if (process.env.CSKH_CRON_DISABLED === '1') {
    console.log('[cskh-cron] Disabled by env CSKH_CRON_DISABLED=1');
    return;
  }
  started = true;

  const delay = msUntilNextRun();
  const delayH = (delay / HOUR_MS).toFixed(2);
  console.log(`[cskh-cron] Nhắc CSKH: lần chạy tiếp sau ${delayH}h (8h30 & 13h30 VN)`);

  function scheduleNext() {
    const nextDelay = msUntilNextRun();
    const minDelay = Math.max(nextDelay, 60 * 1000);
    setTimeout(() => {
      runOnce(io).finally(scheduleNext);
    }, minDelay);
  }

  setTimeout(() => {
    runOnce(io).finally(scheduleNext);
  }, delay);
}

module.exports = { start, runOnce };
