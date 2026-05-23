/**
 * /api/ai-chat-bot — Cấu hình & vận hành "🤖 AI Assistant" cho chat phòng ban / nhóm.
 *
 * Endpoints:
 *   GET    /bot                       — info bot user (id, name)
 *   GET    /channels                  — list kênh có thể chọn (departments + messenger_groups)
 *   GET    /schedules                 — list tất cả lịch (admin)
 *   POST   /schedules                 — tạo lịch mới
 *   PUT    /schedules/:id             — sửa lịch
 *   DELETE /schedules/:id             — xoá lịch
 *   POST   /schedules/:id/run-now     — bắn 1 tin thử ngay (không tính vào quota max_runs_per_day)
 *   GET    /schedules/:id/runs        — 30 lần chạy gần nhất
 *
 * Tất cả mutate yêu cầu admin-like (admin / sales_admin).
 */

const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { isAdminLike } = require('../helpers/adminRole');
const {
  AI_BOT_USER_ID,
  AI_BOT_DISPLAY_NAME,
  runScheduleSend,
} = require('../helpers/aiBotSender');

const r = Router();
r.use(auth);

function requireAdmin(req, res, next) {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Cần quyền quản trị' });
  next();
}

/* ─────────────────── BOT INFO ─────────────────── */

r.get('/bot', (_req, res) => {
  res.json({
    id: AI_BOT_USER_ID,
    full_name: AI_BOT_DISPLAY_NAME,
    is_bot: true,
    openai_configured: !!process.env.OPENAI_API_KEY,
  });
});

/* ─────────────────── CHANNELS ─────────────────── */

/**
 * Danh sách kênh có thể chọn để gắn bot:
 *   - Tất cả phòng ban đang hoạt động
 *   - Tất cả nhóm chat (không phải chat 1-1, không phải nhóm gắn lead riêng tư)
 */
r.get('/channels', requireAdmin, async (_req, res) => {
  try {
    const { data: depts } = await supabase
      .from('departments')
      .select('id, name, color, is_active')
      .eq('is_active', true)
      .order('name');

    const { data: groups } = await supabase
      .from('messenger_groups')
      .select('id, name, is_direct, crm_lead_id')
      .order('name');

    res.json({
      departments: (depts || []).map((d) => ({
        id: d.id,
        name: d.name,
        color: d.color || null,
      })),
      groups: (groups || [])
        .filter((g) => !g.is_direct)
        .map((g) => ({
          id: g.id,
          name: g.name,
          is_lead_group: !!g.crm_lead_id,
        })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─────────────────── PLAYBOOKS (mẫu nội dung AI) ─────────────────── */

const VALID_DATA_SOURCES = ['channel_context', 'kpi', 'none'];

function validatePlaybook(body, { allowMissingPrompt = false } = {}) {
  const errors = [];
  if (!String(body.name || '').trim()) errors.push('Thiếu name');
  if (!VALID_DATA_SOURCES.includes(body.data_source || 'channel_context')) {
    errors.push('data_source không hợp lệ');
  }
  if (!allowMissingPrompt && !String(body.system_prompt || '').trim()) {
    errors.push('Thiếu system_prompt');
  }
  const mt = parseInt(body.max_tokens, 10);
  if (body.max_tokens != null && (!Number.isFinite(mt) || mt < 200 || mt > 4000)) {
    errors.push('max_tokens phải trong 200..4000');
  }
  const temp = parseFloat(body.temperature);
  if (body.temperature != null && (!Number.isFinite(temp) || temp < 0 || temp > 1.5)) {
    errors.push('temperature phải trong 0..1.5');
  }
  return errors;
}

function buildPlaybookRow(body, userId, existing = null) {
  return {
    code: existing?.code || String(body.code || `pb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`).slice(0, 80),
    name: String(body.name || '').trim().slice(0, 200),
    description: body.description ? String(body.description).trim().slice(0, 1000) : null,
    icon: body.icon ? String(body.icon).trim().slice(0, 16) : null,
    data_source: VALID_DATA_SOURCES.includes(body.data_source) ? body.data_source : 'channel_context',
    system_prompt: String(body.system_prompt || '').trim().slice(0, 8000),
    user_prompt_extra: body.user_prompt_extra ? String(body.user_prompt_extra).trim().slice(0, 4000) : null,
    max_tokens: Math.max(200, Math.min(4000, parseInt(body.max_tokens, 10) || 700)),
    temperature: Math.max(0, Math.min(1.5, parseFloat(body.temperature) || 0.55)),
    enabled: body.enabled !== false,
    ...(existing ? {} : { created_by: userId || null, is_builtin: false }),
    updated_at: new Date().toISOString(),
  };
}

r.get('/playbooks', requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('ai_chat_bot_playbooks')
      .select('*')
      .order('is_builtin', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ playbooks: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/playbooks', requireAdmin, async (req, res) => {
  try {
    const errors = validatePlaybook(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    const row = buildPlaybookRow(req.body, req.user.userId);
    const { data, error } = await supabase
      .from('ai_chat_bot_playbooks')
      .insert(row)
      .select('*')
      .single();
    if (error) {
      if (String(error.code) === '23505') {
        return res.status(409).json({ error: 'Trùng code — đổi tên/code' });
      }
      throw error;
    }
    res.status(201).json({ playbook: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/playbooks/:id', requireAdmin, async (req, res) => {
  try {
    const { data: existing } = await supabase
      .from('ai_chat_bot_playbooks')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy mẫu' });

    const errors = validatePlaybook(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const row = buildPlaybookRow(req.body, req.user.userId, existing);
    // Builtin: cho phép sửa nội dung nhưng giữ nguyên code & is_builtin
    if (existing.is_builtin) {
      row.code = existing.code;
    }

    const { data, error } = await supabase
      .from('ai_chat_bot_playbooks')
      .update(row)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json({ playbook: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.patch('/playbooks/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const enabled = !!req.body?.enabled;
    const { data, error } = await supabase
      .from('ai_chat_bot_playbooks')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Không tìm thấy mẫu' });
    res.json({ playbook: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/playbooks/:id', requireAdmin, async (req, res) => {
  try {
    const { data: existing } = await supabase
      .from('ai_chat_bot_playbooks')
      .select('id, is_builtin, name')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy mẫu' });
    if (existing.is_builtin) {
      return res.status(400).json({ error: 'Mẫu hệ thống không thể xoá — chỉ tắt' });
    }
    // Kiểm tra có schedule nào đang dùng không
    const { count } = await supabase
      .from('ai_chat_bot_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('playbook_id', req.params.id);
    if ((count || 0) > 0) {
      return res.status(400).json({
        error: `Có ${count} lịch đang dùng mẫu này — đổi lịch sang mẫu khác trước khi xoá`,
      });
    }
    const { error } = await supabase.from('ai_chat_bot_playbooks').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─────────────────── SCHEDULES ─────────────────── */

// Giữ alias cũ để frontend cũ vẫn chạy nếu chưa cập nhật.
const VALID_KINDS = ['daily_brief', 'overdue', 'kpi', 'custom'];

function normalizeSlots(input) {
  if (!Array.isArray(input)) return [{ h: 8, m: 0 }];
  const out = [];
  for (const s of input) {
    const h = parseInt(s?.h, 10);
    const m = parseInt(s?.m, 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
    if (h < 0 || h > 23 || m < 0 || m > 59) continue;
    out.push({ h, m });
  }
  out.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
  return out.length ? out : [{ h: 8, m: 0 }];
}

function normalizeWeekdays(input) {
  if (!Array.isArray(input) || !input.length) return null; // null = mọi ngày
  const out = [...new Set(input.map((x) => parseInt(x, 10)).filter((x) => x >= 1 && x <= 7))];
  out.sort();
  return out.length ? out : null;
}

async function validatePayload(body) {
  const errors = [];
  if (!['department', 'group'].includes(body.channel_type)) errors.push('channel_type không hợp lệ');
  if (!body.channel_id) errors.push('Thiếu channel_id');
  if (!String(body.title || '').trim()) errors.push('Thiếu title');

  // Phải có playbook_id (mới) HOẶC prompt_kind (cũ, để backward-compat)
  if (!body.playbook_id && !VALID_KINDS.includes(body.prompt_kind)) {
    errors.push('Cần chọn mẫu nội dung (playbook_id)');
  }
  if (body.playbook_id) {
    const { data } = await supabase
      .from('ai_chat_bot_playbooks')
      .select('id')
      .eq('id', body.playbook_id)
      .maybeSingle();
    if (!data) errors.push('playbook_id không tồn tại');
  }

  const maxRuns = parseInt(body.max_runs_per_day, 10);
  if (!Number.isFinite(maxRuns) || maxRuns < 1 || maxRuns > 24) {
    errors.push('max_runs_per_day phải trong 1..24');
  }
  return errors;
}

function buildRow(body, userId) {
  return {
    channel_type: body.channel_type,
    channel_id: body.channel_id,
    playbook_id: body.playbook_id || null,
    prompt_kind: body.prompt_kind || null,
    custom_prompt: body.custom_prompt ? String(body.custom_prompt).trim().slice(0, 4000) : null,
    title: String(body.title || '').trim().slice(0, 200),
    note: body.note ? String(body.note).trim().slice(0, 500) : null,
    run_slots: normalizeSlots(body.run_slots),
    max_runs_per_day: Math.max(1, Math.min(24, parseInt(body.max_runs_per_day, 10) || 2)),
    weekdays: normalizeWeekdays(body.weekdays),
    enabled: body.enabled !== false,
    created_by: userId || null,
    updated_at: new Date().toISOString(),
  };
}

/** Enrich schedule với info kênh + playbook để admin UI hiển thị tên/icon. */
async function enrichSchedule(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;

  const deptIds = [...new Set(rows.filter((r) => r.channel_type === 'department').map((r) => r.channel_id))];
  const groupIds = [...new Set(rows.filter((r) => r.channel_type === 'group').map((r) => r.channel_id))];
  const pbIds = [...new Set(rows.map((r) => r.playbook_id).filter(Boolean))];

  const deptMap = new Map();
  const groupMap = new Map();
  const pbMap = new Map();
  if (deptIds.length) {
    const { data } = await supabase.from('departments').select('id, name, color').in('id', deptIds);
    (data || []).forEach((d) => deptMap.set(d.id, d));
  }
  if (groupIds.length) {
    const { data } = await supabase.from('messenger_groups').select('id, name, is_direct').in('id', groupIds);
    (data || []).forEach((g) => groupMap.set(g.id, g));
  }
  if (pbIds.length) {
    const { data } = await supabase
      .from('ai_chat_bot_playbooks')
      .select('id, code, name, icon, enabled, data_source')
      .in('id', pbIds);
    (data || []).forEach((p) => pbMap.set(p.id, p));
  }

  return rows.map((r) => {
    const info = r.channel_type === 'department' ? deptMap.get(r.channel_id) : groupMap.get(r.channel_id);
    const pb = r.playbook_id ? pbMap.get(r.playbook_id) : null;
    return {
      ...r,
      channel_name: info?.name || '(đã xóa)',
      channel_color: info?.color || null,
      playbook: pb || null,
    };
  });
}

r.get('/schedules', requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('ai_chat_bot_schedules')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const enriched = await enrichSchedule(data || []);
    res.json({ schedules: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/schedules', requireAdmin, async (req, res) => {
  try {
    const errors = await validatePayload(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    const row = buildRow(req.body, req.user.userId);
    const { data, error } = await supabase
      .from('ai_chat_bot_schedules')
      .insert(row)
      .select('*')
      .single();
    if (error) throw error;
    const [enriched] = await enrichSchedule([data]);
    res.status(201).json({ schedule: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/schedules/:id', requireAdmin, async (req, res) => {
  try {
    const errors = await validatePayload(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    const row = buildRow(req.body, req.user.userId);
    delete row.created_by; // không đổi người tạo
    const { data, error } = await supabase
      .from('ai_chat_bot_schedules')
      .update(row)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Không tìm thấy lịch' });
    const [enriched] = await enrichSchedule([data]);
    res.json({ schedule: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.patch('/schedules/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const enabled = !!req.body?.enabled;
    const { data, error } = await supabase
      .from('ai_chat_bot_schedules')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Không tìm thấy lịch' });
    res.json({ schedule: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/schedules/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase.from('ai_chat_bot_schedules').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Bắn 1 tin ngay — không đụng max_runs_per_day. Log lại trong ai_chat_bot_runs với slot_label='manual'. */
r.post('/schedules/:id/run-now', requireAdmin, async (req, res) => {
  try {
    const { data: sched, error } = await supabase
      .from('ai_chat_bot_schedules')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !sched) return res.status(404).json({ error: 'Không tìm thấy lịch' });

    const io = req.app.get('io');
    const result = await runScheduleSend(sched, io);
    const vnDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

    await supabase.from('ai_chat_bot_runs').insert({
      schedule_id: sched.id,
      vn_date: vnDate,
      slot_label: 'manual',
      status: result.status,
      message_preview: result.preview || null,
      error_text: result.error || null,
      message_id: result.message_id || null,
      triggered_by: req.user.userId,
    });

    await supabase
      .from('ai_chat_bot_schedules')
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: result.status,
        last_run_message: result.preview || result.error || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sched.id);

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/schedules/:id/runs', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ai_chat_bot_runs')
      .select('*')
      .eq('schedule_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    res.json({ runs: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
