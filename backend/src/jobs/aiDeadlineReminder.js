/**
 * Nhắc hạn CRM bằng AI — chạy 2 lần/ngày (mặc định 8:00 & 13:30 giờ VN).
 * Gom nhiệm vụ CRM (crm_tasks) đang mở, có deadline, giao cho assignee: sắp hạn trong 72h hoặc quá hạn (tối đa 14 ngày).
 * Gọi OpenAI (gpt-4o-mini) viết đoạn nhắc tiếng Việt → thông báo in-app + socket (type: ai_crm_deadline_digest).
 *
 * Tích hợp: require('./jobs/aiDeadlineReminder').start(io) trong server.js
 * Tắt: AI_DEADLINE_CRON_DISABLED=1
 * Cần OPENAI_API_KEY — không có key thì bỏ qua lượt chạy (không tạo TB).
 * Tuỳ chọn giờ chạy (VN): AI_DEADLINE_CRON_SLOTS_VN=8:00,13:30  (mặc định 8:00,13:30)
 * Tuỳ chọn nhận TB: cùng công tắc «crm_lead_deadlines» trong notification_preferences.
 */
const { supabase } = require('../config/supabase');
const { isNotificationAllowedForUser } = require('../helpers/notificationPrefsUser');

const HOUR_MS = 3600 * 1000;
const VN_TZ = 'Asia/Ho_Chi_Minh';

const DEFAULT_RUN_SLOTS = [
  { h: 8, m: 0 },
  { h: 13, m: 30 },
];

function parseRunSlotsFromEnv() {
  const raw = String(process.env.AI_DEADLINE_CRON_SLOTS_VN || '').trim();
  if (!raw) return DEFAULT_RUN_SLOTS;
  const slots = [];
  for (const part of raw.split(',')) {
    const s = part.trim();
    if (!s) continue;
    const m = s.match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      if (h >= 0 && h <= 23 && min >= 0 && min <= 59) slots.push({ h, m: min });
    }
  }
  return slots.length ? slots.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m)) : DEFAULT_RUN_SLOTS;
}

/** YYYY-MM-DD theo lịch Việt Nam */
function vnCalendarYmd(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Phút trong ngày theo đồng hồ VN (0–1439) */
function vnMinutesNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hh = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const mm = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return hh * 60 + mm;
}

function msUntilNextRun(slots) {
  const nowMin = vnMinutesNow();
  const slotMins = slots.map((s) => s.h * 60 + s.m).sort((a, b) => a - b);
  for (const sm of slotMins) {
    if (sm > nowMin) return (sm - nowMin) * 60 * 1000;
  }
  return (24 * 60 - nowMin + slotMins[0]) * 60 * 1000;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function openAiDigestMessage(displayName, tasksForPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const userContent = JSON.stringify(
    {
      assignee_display_name: displayName,
      tasks: tasksForPrompt,
      instruction:
        'Chỉ dựa trên danh sách tasks, không bịa thêm nhiệm vụ. Ưu tiên quá hạn trước, rồi sắp hạn gần nhất.',
    },
    null,
    0,
  );

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.45,
      max_tokens: 450,
      messages: [
        {
          role: 'system',
          content:
            'Bạn là trợ lý nội bộ TuBep Pro. Viết một thông báo nhắc hạn CRM bằng tiếng Việt, tối đa 900 ký tự, thân thiện, súc tích. ' +
            'Xưng hô với nhân viên theo tên hoặc «bạn». Nêu rõ có bao nhiêu nhiệm vụ cần chú ý, liệt kê 3–8 ý (gạch đầu dòng «- »), mỗi ý gắn tên nhiệm vụ + lead (mã/tên nếu có) + hạn (giờ/ngày) hoặc «quá hạn». ' +
            'Không dùng markdown heading (#). Không hứa hệ thống sẽ tự làm giúp họ.',
        },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') return null;
  return text.trim().slice(0, 2000);
}

async function fetchCrmTasksDueWindow() {
  const now = Date.now();
  const horizon = new Date(now + 72 * HOUR_MS).toISOString();
  const floor = new Date(now - 14 * 24 * HOUR_MS).toISOString();
  const rows = [];
  const page = 400;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('crm_tasks')
      .select(
        'id, title, deadline, priority, assignee_id, lead_id, status, stage_slug, lead:crm_leads(title, code, type)',
      )
      .in('status', ['pending', 'in_progress'])
      .not('assignee_id', 'is', null)
      .not('deadline', 'is', null)
      .lte('deadline', horizon)
      .gte('deadline', floor)
      .order('deadline', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < page) break;
    if (rows.length > 8000) break;
  }
  return rows;
}

function groupTasksByAssignee(rows) {
  const map = new Map();
  for (const t of rows) {
    const uid = t.assignee_id && String(t.assignee_id);
    if (!uid) continue;
    if (!map.has(uid)) map.set(uid, []);
    map.get(uid).push(t);
  }
  return map;
}

async function loadActiveUsersByIds(ids) {
  const m = new Map();
  const uniq = [...new Set(ids.map(String))];
  const chunkSize = 120;
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const part = uniq.slice(i, i + chunkSize);
    if (!part.length) continue;
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, is_active')
      .in('id', part)
      .eq('is_active', true);
    if (error) throw error;
    for (const u of data || []) {
      m.set(String(u.id), u);
    }
  }
  return m;
}

async function runOnce(io) {
  const startedAt = Date.now();
  const ymd = vnCalendarYmd();
  console.log(`[ai-deadline] Bắt đầu lúc ${new Date().toISOString()} · digest_date=${ymd}`);

  if (!process.env.OPENAI_API_KEY) {
    console.log('[ai-deadline] Bỏ qua: chưa có OPENAI_API_KEY');
    return;
  }

  try {
    const rows = await fetchCrmTasksDueWindow();
    const byUser = groupTasksByAssignee(rows);
    const userIds = [...byUser.keys()];
    if (!userIds.length) {
      console.log('[ai-deadline] Không có nhiệm vụ CRM trong cửa sổ hạn');
      return;
    }

    const usersMap = await loadActiveUsersByIds(userIds);
    const maxUsers = Math.min(
      120,
      Math.max(1, parseInt(String(process.env.AI_DEADLINE_MAX_USERS || '80'), 10) || 80),
    );

    const userIdsSorted = [...byUser.keys()].sort((a, b) => (byUser.get(b).length - byUser.get(a).length));

    const entityIds = userIdsSorted
      .filter((uid) => byUser.get(uid)?.length && usersMap.has(uid))
      .slice(0, maxUsers)
      .map((uid) => `ai_digest:${uid}:${ymd}`);

    const existing = new Set();
    if (entityIds.length) {
      const chunkSize = 80;
      for (let i = 0; i < entityIds.length; i += chunkSize) {
        const part = entityIds.slice(i, i + chunkSize);
        const { data: exRows } = await supabase
          .from('notifications')
          .select('entity_id')
          .eq('type', 'ai_crm_deadline_digest')
          .in('entity_id', part);
        for (const r of exRows || []) {
          if (r.entity_id) existing.add(r.entity_id);
        }
      }
    }

    const notifs = [];
    let aiOk = 0;
    let aiSkip = 0;

    for (const uid of userIdsSorted) {
      if (notifs.length >= maxUsers) break;
      const list = byUser.get(uid) || [];
      if (!list.length) continue;
      const urow = usersMap.get(uid);
      if (!urow) continue;

      const entityId = `ai_digest:${uid}:${ymd}`;
      if (existing.has(entityId)) {
        aiSkip += 1;
        continue;
      }

      const allowed = await isNotificationAllowedForUser(
        uid,
        'ai_crm_deadline_digest',
        'system',
        { ecosystem_module_key: 'crm', module_key: 'crm' },
      );
      if (!allowed) {
        aiSkip += 1;
        continue;
      }

      const nowMs = Date.now();
      const sorted = [...list].sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).slice(0, 18);
      const tasksForPrompt = sorted.map((t) => {
        const lead = t.lead || {};
        const dl = new Date(t.deadline);
        const overdue = dl.getTime() < nowMs;
        return {
          task_id: t.id,
          title: t.title,
          priority: t.priority || null,
          deadline_iso: t.deadline,
          overdue,
          lead_code: lead.code || null,
          lead_title: lead.title || null,
          lead_type: lead.type || null,
        };
      });

      const displayName =
        (urow.full_name && String(urow.full_name).trim()) || (urow.email && String(urow.email).split('@')[0]) || 'bạn';

      let message;
      try {
        message = await openAiDigestMessage(displayName, tasksForPrompt);
      } catch (e) {
        console.warn(`[ai-deadline] OpenAI lỗi user ${uid}:`, e.message || e);
        await sleep(400);
        continue;
      }
      if (!message) {
        aiSkip += 1;
        await sleep(120);
        continue;
      }

      aiOk += 1;
      notifs.push({
        user_id: uid,
        type: 'ai_crm_deadline_digest',
        title: '🤖 AI: Nhắc hạn nhiệm vụ CRM',
        message,
        entity_type: 'system',
        entity_id: entityId,
        metadata: {
          digest_date: ymd,
          ecosystem_module_key: 'crm',
          module_key: 'crm',
          task_count: list.length,
          task_ids: sorted.map((t) => t.id),
          nav_url: '/crm/tasks',
        },
      });

      await sleep(parseInt(String(process.env.AI_DEADLINE_OPENAI_GAP_MS || '180'), 10) || 180);
    }

    if (notifs.length) {
      const BATCH = 25;
      let insertedTotal = 0;
      for (let i = 0; i < notifs.length; i += BATCH) {
        const chunk = notifs.slice(i, i + BATCH);
        const { data: inserted, error: insErr } = await supabase.from('notifications').insert(chunk).select('*');
        if (insErr) {
          console.error('[ai-deadline] Insert lỗi:', insErr.message);
          break;
        }
        if (inserted?.length && io) {
          for (const n of inserted) {
            io.to(`user:${n.user_id}`).emit('notification', n);
          }
        }
        insertedTotal += inserted?.length || 0;
      }
      console.log(
        `[ai-deadline] Đã tạo ${insertedTotal} TB · AI ok=${aiOk} · bỏ qua(trùng/tắt prefs/lỗi)=${aiSkip} · tasks quét=${rows.length}`,
      );
    } else {
      console.log(`[ai-deadline] Không tạo TB mới · bỏ qua=${aiSkip} · tasks=${rows.length}`);
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[ai-deadline] Xong sau ${elapsed}s`);
  } catch (err) {
    console.error('[ai-deadline] Lỗi:', err.message || err);
  }
}

let started = false;

function start(io) {
  if (started) return;
  if (process.env.AI_DEADLINE_CRON_DISABLED === '1') {
    console.log('[ai-deadline] Disabled by env AI_DEADLINE_CRON_DISABLED=1');
    return;
  }
  started = true;

  const slots = parseRunSlotsFromEnv();
  const delay = msUntilNextRun(slots);
  console.log(
    `[ai-deadline] Lịch VN: ${slots.map((s) => `${String(s.h).padStart(2, '0')}:${String(s.m).padStart(2, '0')}`).join(', ')} · lần chạy tiếp sau ${(delay / HOUR_MS).toFixed(2)}h`,
  );

  function scheduleNext() {
    const nextDelay = Math.max(msUntilNextRun(slots), 60 * 1000);
    setTimeout(() => {
      runOnce(io).finally(scheduleNext);
    }, nextDelay);
  }

  setTimeout(() => {
    runOnce(io).finally(scheduleNext);
  }, delay);
}

module.exports = { start, runOnce };
