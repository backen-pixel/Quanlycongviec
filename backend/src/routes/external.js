/**
 * External API — xác thực qua X-Api-Key (không cần JWT).
 * Dùng cho bên ngoài (landing page, zap, webhook, ...) tạo lead vào CRM.
 *
 * POST /api/external/leads
 * Headers: X-Api-Key: <key>
 * Body:
 *   title          (bắt buộc) — tên lead
 *   full_name      — tên khách hàng
 *   phone          — SĐT (dùng để tìm / tạo customer)
 *   email          — email khách hàng
 *   address        — địa chỉ
 *   company        — tên công ty KH
 *   source_name    — tên nguồn (VD: "Website", "Zalo") — tự tạo nếu chưa có
 *   stage_id       — UUID giai đoạn (nếu trống → giai đoạn đầu tiên)
 *   assigned_to    — UUID user phụ trách (nếu trống → default_assigned_to trong key)
 *   company_id     — UUID công ty nội bộ
 *   estimated_value — giá trị ước tính (số)
 *   description    — mô tả thêm
 *   notes          — ghi chú nội bộ
 *   webhook_url    — URL callback sau khi tạo thành công (ghi đè webhook_url của key)
 *
 * GET /api/external/stages?type=lead
 * GET /api/external/sources
 * GET /api/external/users
 * GET /api/external/ping
 */
const { Router } = require('express');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');
const { supabase } = require('../config/supabase');
const https = require('https');
const http = require('http');

const r = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function nextLeadCode() {
  const { count } = await supabase
    .from('crm_leads')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'lead');
  return 'LEAD-' + String((count || 0) + 1).padStart(4, '0');
}

async function findOrCreateCustomer({ full_name, phone, email, address, company }) {
  if (!full_name && !phone && !email) return null;

  if (phone) {
    const { data } = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle();
    if (data) return data.id;
  }
  if (email) {
    const { data } = await supabase.from('customers').select('id').eq('email', email).maybeSingle();
    if (data) return data.id;
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({ full_name: full_name || phone || email, phone: phone || null, email: email || null, address: address || null, company: company || null })
    .select('id')
    .single();
  if (error) throw new Error('Lỗi tạo khách hàng: ' + error.message);
  return data.id;
}

async function findOrCreateSource(name) {
  if (!name) return null;
  const { data } = await supabase.from('crm_sources').select('id').ilike('name', name).maybeSingle();
  if (data) return data.id;
  const { data: created } = await supabase.from('crm_sources').insert({ name }).select('id').single();
  return created?.id || null;
}

async function getFirstLeadStage() {
  const { data } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_type', 'lead')
    .eq('is_active', true)
    .order('order_index')
    .limit(1)
    .single();
  return data?.id || null;
}

/**
 * Gọi webhook URL với payload JSON (không chặn response)
 */
function callWebhook(url, payload) {
  if (!url) return;
  try {
    const body = JSON.stringify(payload);
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'TubepCRM-Webhook/1.0',
        },
        timeout: 8000,
      },
      (res) => {
        console.log(`[Webhook] ${url} → ${res.statusCode}`);
      }
    );
    req.on('error', (e) => console.warn('[Webhook] Error:', e.message));
    req.on('timeout', () => { req.destroy(); console.warn('[Webhook] Timeout:', url); });
    req.write(body);
    req.end();
  } catch (e) {
    console.warn('[Webhook] Invalid URL or error:', e.message);
  }
}

/**
 * Gửi notification tới người phụ trách khi có lead mới qua API
 */
async function notifyAssignee(req, userId, lead, apiKeyName) {
  if (!userId) return;
  try {
    const { supabase: sb } = require('../config/supabase');
    await sb.from('notifications').insert({
      user_id: userId,
      type: 'new_lead',
      title: '🔔 Lead mới từ API ngoài',
      message: `Lead "${lead.title}" vừa được tạo qua "${apiKeyName}". SĐT: ${lead.customer?.phone || '—'}`,
      entity_type: 'lead',
      entity_id: lead.id,
      is_read: false,
      created_at: new Date().toISOString(),
    });
    // Emit socket nếu có
    if (req.app) {
      const io = req.app.get('io');
      if (io) io.emit('notification:new', { userId });
    }
  } catch (e) {
    console.warn('[External API] Notify error:', e.message);
  }
}

// ── POST /api/external/leads ──────────────────────────────────────────────────

r.post('/leads', apiKeyAuth, async (req, res) => {
  try {
    const {
      title,
      full_name, phone, email, address, company: customerCompany,
      source_name,
      stage_id,
      assigned_to,
      company_id,
      estimated_value,
      description,
      notes,
      webhook_url: bodyWebhookUrl,
    } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Trường title (tên lead) là bắt buộc' });
    }

    const customerId = await findOrCreateCustomer({ full_name, phone, email, address, company: customerCompany });
    const sourceId = await findOrCreateSource(source_name);
    const resolvedStageId = stage_id || (await getFirstLeadStage());
    const resolvedAssignee = assigned_to || req.apiKey.default_assigned_to || null;
    const code = await nextLeadCode();

    const { data: lead, error } = await supabase
      .from('crm_leads')
      .insert({
        code,
        title: String(title).trim(),
        type: 'lead',
        customer_id: customerId,
        source_id: sourceId,
        stage_id: resolvedStageId,
        assigned_to: resolvedAssignee,
        lead_owner_id: resolvedAssignee,
        company_id: company_id || null,
        estimated_value: estimated_value ? Number(estimated_value) : null,
        description: description || null,
        notes: notes || null,
        created_by: null,
      })
      .select(`
        id, code, title, type, estimated_value, description, created_at,
        customer:customers(id, full_name, phone, email),
        stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color)
      `)
      .single();

    if (error) throw error;

    // Ghi log nguồn gốc vào activity
    await supabase.from('crm_activities').insert({
      lead_id: lead.id,
      type: 'note',
      title: `Lead được tạo từ API ngoài (key: ${req.apiKey.name})`,
      activity_date: new Date().toISOString(),
    }).catch(() => {});

    // Notify người phụ trách
    if (resolvedAssignee) {
      await notifyAssignee(req, resolvedAssignee, lead, req.apiKey.name);
    }

    // Gọi webhook (không đồng bộ — không chờ)
    const webhookTarget = bodyWebhookUrl || req.apiKey.webhook_url;
    if (webhookTarget) {
      callWebhook(webhookTarget, {
        event: 'lead.created',
        key_name: req.apiKey.name,
        lead: {
          id: lead.id,
          code: lead.code,
          title: lead.title,
          customer: lead.customer,
          stage: lead.stage,
          created_at: lead.created_at,
        },
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({
      success: true,
      lead: {
        id: lead.id,
        code: lead.code,
        title: lead.title,
        customer: lead.customer,
        stage: lead.stage,
        created_at: lead.created_at,
      },
    });
  } catch (e) {
    console.error('[External API] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/external/stages — danh sách giai đoạn pipeline ─────────────────

r.get('/stages', apiKeyAuth, async (req, res) => {
  try {
    const type = req.query.type || 'lead';
    const { data, error } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, color, order_index, pipeline_type')
      .eq('pipeline_type', type)
      .eq('is_active', true)
      .order('order_index');
    if (error) throw error;
    res.json({ stages: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/external/sources — danh sách nguồn lead ─────────────────────────

r.get('/sources', apiKeyAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('crm_sources')
      .select('id, name')
      .order('name');
    if (error) throw error;
    res.json({ sources: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/external/users — danh sách nhân viên (id + tên) ─────────────────

r.get('/users', apiKeyAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name');
    if (error) throw error;
    res.json({ users: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/external/leads/stats — thống kê lead tạo qua key này ────────────

r.get('/leads/stats', apiKeyAuth, async (req, res) => {
  try {
    const keyName = req.apiKey.name;
    // Đếm leads có activity ghi log từ key này
    const { count } = await supabase
      .from('crm_activities')
      .select('id', { count: 'exact', head: true })
      .ilike('title', `%key: ${keyName}%`);
    res.json({ key_name: keyName, leads_created: count || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/external/ping — kiểm tra key hợp lệ ────────────────────────────

r.get('/ping', apiKeyAuth, (req, res) => {
  res.json({
    ok: true,
    key_name: req.apiKey.name,
    default_assigned_to: req.apiKey.default_assigned_to,
    webhook_url: req.apiKey.webhook_url,
    message: 'API key hợp lệ',
  });
});

module.exports = r;
