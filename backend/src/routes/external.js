/**
 * External API — xác thực qua X-Api-Key (không cần JWT).
 * Dùng cho bên ngoài (landing page, zap, webhook, ...) tạo lead vào CRM.
 *
 * POST /api/external/leads
 * Auth: header X-Api-Key: <key> hoặc query ?api_key= / ?x-api-key= (key trong giá trị, không phải tên param)
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
const { nextCrmCode } = require('../helpers/crmNextCode');
const https = require('https');
const http = require('http');
// Cùng helper auto-gen task theo template lead type — y hệt POST /crm/leads
let autoGenCrmTasks = null;
try { ({ autoGenCrmTasks } = require('../helpers/autoGenCrmTasks')); } catch (_) {}

const r = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

// Simple in-memory rate limiter (per key + ip)
const _rateBucket = new Map();
function checkRateLimit({ apiKeyId, ip, windowMs = 60_000, limit = 60 }) {
  const now = Date.now();
  const bucketKey = `${apiKeyId || 'unknown'}:${ip || 'unknown'}`;
  const cur = _rateBucket.get(bucketKey) || { t: now, c: 0 };
  if (now - cur.t > windowMs) {
    _rateBucket.set(bucketKey, { t: now, c: 1 });
    return { ok: true, remaining: limit - 1 };
  }
  if (cur.c >= limit) return { ok: false, remaining: 0 };
  cur.c += 1;
  _rateBucket.set(bucketKey, cur);
  return { ok: true, remaining: Math.max(0, limit - cur.c) };
}

async function tryAuditLog(req, { status, error, created_lead_id } = {}) {
  try {
    await supabase.from('external_api_logs').insert({
      api_key_id: req.apiKey?.id || null,
      api_key_name: req.apiKey?.name || null,
      company_id: req.apiKey?.company_id || null,
      endpoint: req.originalUrl || null,
      method: req.method || null,
      status: status || null,
      ip: req.ip || (req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : null),
      user_agent: req.headers['user-agent'] || null,
      error: error ? String(error) : null,
      created_lead_id: created_lead_id || null,
      created_at: new Date().toISOString(),
    });
  } catch (_) {
    // ignore if table doesn't exist / permission issue
  }
}

/** Trùng mã lead (race / sequence) — PostgREST trả code 23505 hoặc message duplicate */
function isLeadCodeUniqueViolation(err) {
  if (!err) return false;
  const c = String(err.code || '');
  const m = String(err.message || err.details || '');
  return c === '23505' || /duplicate key|unique constraint|idx_crm_leads_code_unique/i.test(m);
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

async function findOrCreateSource(name, category_id, company_id) {
  if (!name) return null;
  const { data } = await supabase.from('crm_sources').select('id, category_id').ilike('name', name).maybeSingle();
  if (data) {
    // Nếu source đã có nhưng chưa có category và body có truyền → cập nhật
    if (category_id && !data.category_id) {
      await supabase.from('crm_sources').update({ category_id }).eq('id', data.id);
    }
    return data.id;
  }
  const payload = { name };
  if (category_id) payload.category_id = category_id;
  if (company_id) payload.company_id = company_id;
  const { data: created } = await supabase.from('crm_sources').insert(payload).select('id').single();
  return created?.id || null;
}

// (Helper getFirstLeadStage cũ đã loại bỏ — stage mặc định LUÔN là cột đầu của
// pipeline thuộc đúng công ty, không fallback global. Xem POST /leads.)

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
  const rl = checkRateLimit({ apiKeyId: req.apiKey?.id, ip: req.ip });
  if (!rl.ok) {
    await tryAuditLog(req, { status: 429, error: 'rate_limited' });
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  try {
    const {
      title,
      full_name, phone, email, address, company: customerCompany,
      source_name,
      source_category_id: bodySourceCategoryId,
      stage_id: bodyStageId,
      pipeline_id: bodyPipelineId,
      lead_type_id: bodyLeadTypeId,
      region_id: bodyRegionId,
      assigned_to,
      estimated_value,
      description,
      notes,
      webhook_url: bodyWebhookUrl,
    } = req.body;

    if (!title || !String(title).trim()) {
      await tryAuditLog(req, { status: 400, error: 'missing_title' });
      return res.status(400).json({ error: 'Trường title (tên lead) là bắt buộc' });
    }

    const normalizePhone = (v) => (v == null ? '' : String(v)).replace(/\s+/g, '').trim();
    const normalizeEmail = (v) => (v == null ? '' : String(v)).trim().toLowerCase();
    const nPhone = normalizePhone(phone);
    const nEmail = normalizeEmail(email);

    // assigned_to: nếu gửi lên thì bắt buộc thuộc đúng công ty của API key
    if (assigned_to) {
      const { data: u, error: ue } = await supabase.from('users').select('id, company_id, is_active').eq('id', assigned_to).maybeSingle();
      if (ue) throw ue;
      if (!u || u.is_active === false) {
        await tryAuditLog(req, { status: 400, error: 'invalid_assigned_to' });
        return res.status(400).json({ error: 'assigned_to không hợp lệ (user không tồn tại hoặc đã bị tắt)' });
      }
      if (u.company_id !== req.apiKey.company_id) {
        await tryAuditLog(req, { status: 400, error: 'assigned_to_wrong_company' });
        return res.status(400).json({ error: 'assigned_to phải thuộc đúng công ty của API key' });
      }
    }

    if (estimated_value != null && estimated_value !== '') {
      const n = Number(estimated_value);
      if (!Number.isFinite(n) || n < 0) {
        await tryAuditLog(req, { status: 400, error: 'invalid_estimated_value' });
        return res.status(400).json({ error: 'estimated_value không hợp lệ (phải là số >= 0)' });
      }
    }

    // Khu vực: ưu tiên body, fallback default của key. Bắt buộc phải có.
    const resolvedRegionId = bodyRegionId || req.apiKey.region_id || null;
    if (!resolvedRegionId) {
      await tryAuditLog(req, { status: 400, error: 'missing_region_id' });
      return res.status(400).json({ error: 'region_id là bắt buộc (chưa cấu hình khu vực mặc định cho key)' });
    }
    // Validate region thuộc đúng company của key
    {
      const { data: rg } = await supabase
        .from('company_regions')
        .select('id, company_id, is_active')
        .eq('id', resolvedRegionId)
        .maybeSingle();
      if (!rg) {
        await tryAuditLog(req, { status: 400, error: 'invalid_region_id' });
        return res.status(400).json({ error: 'region_id không tồn tại' });
      }
      if (String(rg.company_id) !== String(req.apiKey.company_id)) {
        await tryAuditLog(req, { status: 400, error: 'region_wrong_company' });
        return res.status(400).json({ error: 'region_id phải thuộc đúng công ty của API key' });
      }
      if (rg.is_active === false) {
        await tryAuditLog(req, { status: 400, error: 'region_inactive' });
        return res.status(400).json({ error: 'Khu vực đã bị tắt' });
      }
    }

    // Phân loại nguồn (không bắt buộc): ưu tiên body, fallback default của key
    const resolvedCategoryId = bodySourceCategoryId || req.apiKey.default_source_category_id || null;

    // ── Pipeline: ưu tiên body, fallback default của công ty (cùng luồng /crm/leads)
    let resolvedPipelineId = bodyPipelineId || req.apiKey.default_pipeline_id || null;
    if (!resolvedPipelineId) {
      const { data: def } = await supabase
        .from('crm_pipelines')
        .select('id')
        .eq('company_id', req.apiKey.company_id)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at')
        .limit(1)
        .maybeSingle();
      resolvedPipelineId = def?.id || null;
    } else {
      // Validate pipeline thuộc đúng công ty
      const { data: pl } = await supabase.from('crm_pipelines').select('id, company_id').eq('id', resolvedPipelineId).maybeSingle();
      if (!pl) {
        await tryAuditLog(req, { status: 400, error: 'invalid_pipeline_id' });
        return res.status(400).json({ error: 'pipeline_id không tồn tại' });
      }
      if (String(pl.company_id) !== String(req.apiKey.company_id)) {
        await tryAuditLog(req, { status: 400, error: 'pipeline_wrong_company' });
        return res.status(400).json({ error: 'pipeline_id phải thuộc đúng công ty của API key' });
      }
    }

    // ── Stage: BẮT BUỘC là cột đầu tiên (order_index nhỏ nhất) của pipeline
    // thuộc đúng công ty đã cấu hình. Không fallback sang stage global.
    if (!resolvedPipelineId) {
      await tryAuditLog(req, { status: 400, error: 'company_has_no_pipeline' });
      return res.status(400).json({
        error: 'Công ty của API key chưa có pipeline CRM nào — vào "CRM → Pipeline" để tạo trước.',
      });
    }
    let resolvedStageId = bodyStageId || null;
    if (resolvedStageId) {
      // Nếu client gửi stage_id thì validate phải thuộc đúng pipeline đã chọn
      const { data: st } = await supabase
        .from('crm_pipeline_stages')
        .select('id, pipeline_id, pipeline_type, is_active')
        .eq('id', resolvedStageId)
        .maybeSingle();
      if (!st) {
        await tryAuditLog(req, { status: 400, error: 'invalid_stage_id' });
        return res.status(400).json({ error: 'stage_id không tồn tại' });
      }
      if (String(st.pipeline_id) !== String(resolvedPipelineId)) {
        await tryAuditLog(req, { status: 400, error: 'stage_wrong_pipeline' });
        return res.status(400).json({ error: 'stage_id không thuộc pipeline đã chọn' });
      }
      if (st.pipeline_type !== 'lead') {
        await tryAuditLog(req, { status: 400, error: 'stage_wrong_type' });
        return res.status(400).json({ error: 'stage_id không phải giai đoạn Lead' });
      }
      if (st.is_active === false) {
        await tryAuditLog(req, { status: 400, error: 'stage_inactive' });
        return res.status(400).json({ error: 'Giai đoạn đã bị tắt' });
      }
    } else {
      // Mặc định = cột ĐẦU TIÊN (order_index nhỏ nhất) của pipeline công ty
      const { data: firstStage } = await supabase
        .from('crm_pipeline_stages')
        .select('id, name, order_index')
        .eq('pipeline_id', resolvedPipelineId)
        .eq('pipeline_type', 'lead')
        .eq('is_active', true)
        .order('order_index', { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      resolvedStageId = firstStage?.id || null;
      if (!resolvedStageId) {
        await tryAuditLog(req, { status: 400, error: 'pipeline_has_no_lead_stage' });
        return res.status(400).json({
          error: 'Pipeline của công ty chưa có giai đoạn Lead nào — vào "CRM → Pipeline" để thêm cột.',
        });
      }
    }

    // ── Loại Lead/Deal: ưu tiên body, fallback default của key
    const resolvedLeadTypeId = bodyLeadTypeId || req.apiKey.default_lead_type_id || null;
    if (resolvedLeadTypeId) {
      const { data: lt } = await supabase
        .from('crm_lead_types')
        .select('id, company_id, applies_to, is_active')
        .eq('id', resolvedLeadTypeId)
        .maybeSingle();
      if (!lt) {
        await tryAuditLog(req, { status: 400, error: 'invalid_lead_type' });
        return res.status(400).json({ error: 'lead_type_id không tồn tại' });
      }
      if (String(lt.company_id) !== String(req.apiKey.company_id)) {
        await tryAuditLog(req, { status: 400, error: 'lead_type_wrong_company' });
        return res.status(400).json({ error: 'lead_type_id phải thuộc đúng công ty của API key' });
      }
      if (lt.is_active === false) {
        await tryAuditLog(req, { status: 400, error: 'lead_type_inactive' });
        return res.status(400).json({ error: 'Loại Lead/Deal đang bị ẩn' });
      }
      if (lt.applies_to && !['lead', 'both'].includes(String(lt.applies_to))) {
        await tryAuditLog(req, { status: 400, error: 'lead_type_not_for_lead' });
        return res.status(400).json({ error: 'Loại này không áp dụng cho Lead' });
      }
    }

    const customerId = await findOrCreateCustomer({ full_name, phone: nPhone || null, email: nEmail || null, address, company: customerCompany });
    const sourceId = await findOrCreateSource(source_name, resolvedCategoryId, req.apiKey.company_id);
    const resolvedAssignee = assigned_to || req.apiKey.default_assigned_to || null;

    // Gộp notes vào description (bảng crm_leads không có cột notes riêng)
    const mergedDescription = [description, notes ? `Ghi chú: ${notes}` : null]
      .filter(Boolean)
      .join('\n\n') || null;

    const leadSelect = `
        id, code, title, type, estimated_value, description, created_at, stage_entered_at,
        company_id, region_id, pipeline_id, stage_id, lead_type_id, source_id, customer_id,
        assigned_to, lead_owner_id, created_by,
        customer:customers(id, full_name, phone, email, address, company),
        stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, order_index),
        pipeline:crm_pipelines!crm_leads_pipeline_id_fkey(id, name, is_default),
        lead_type:crm_lead_types!crm_leads_lead_type_id_fkey(id, name),
        region:company_regions!crm_leads_region_id_fkey(id, name, code),
        company:companies!crm_leads_company_id_fkey(id, name, short_name),
        source:crm_sources!crm_leads_source_id_fkey(id, name, category_id),
        assignee:users!crm_leads_assigned_to_fkey(id, full_name, email, phone)
      `;

    // Mã LEAD-YYYY-NNN đồng bộ CRM (code_sequences). Retry khi trùng do race song song.
    let lead = null;
    let insertErr = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextCrmCode('LEAD');
      const { data: row, error } = await supabase
        .from('crm_leads')
        .insert({
          code,
          title: String(title).trim(),
          type: 'lead',
          customer_id: customerId,
          source_id: sourceId,
          pipeline_id: resolvedPipelineId,
          stage_id: resolvedStageId,
          lead_type_id: resolvedLeadTypeId,
          assigned_to: resolvedAssignee,
          lead_owner_id: resolvedAssignee,
          company_id: req.apiKey.company_id,
          region_id: resolvedRegionId,
          estimated_value: estimated_value ? Number(estimated_value) : null,
          description: mergedDescription,
          created_by: resolvedAssignee,
          stage_entered_at: new Date().toISOString(),
        })
        .select(leadSelect.trim())
        .single();

      if (!error && row) {
        lead = row;
        break;
      }
      insertErr = error;
      if (isLeadCodeUniqueViolation(error) && attempt < 7) {
        console.warn('[External API] Duplicate lead code, retry:', code, attempt + 1);
        continue;
      }
      throw error;
    }
    if (!lead) throw insertErr || new Error('Không tạo được lead');

    // Auto-gen tasks theo template lead type — cùng luồng với POST /crm/leads
    if (autoGenCrmTasks) {
      try {
        const { data: existingTasks } = await supabase.from('crm_tasks')
          .select('id').eq('lead_id', lead.id).limit(1);
        if (!existingTasks?.length) {
          await autoGenCrmTasks(lead.id, 'lead', resolvedAssignee || null);
        }
      } catch (autoErr) {
        console.warn('[External API] Auto-create tasks error:', autoErr.message);
      }
    }

    await tryAuditLog(req, { status: 201, created_lead_id: lead.id });

    // Ghi log nguồn gốc vào activity
    try {
      await supabase.from('crm_activities').insert({
        lead_id: lead.id,
        type: 'note',
        title: `Lead được tạo từ API ngoài (key: ${req.apiKey.name})`,
        activity_date: new Date().toISOString(),
      });
    } catch (_) { /* bảng crm_activities có thể chưa tồn tại — bỏ qua */ }

    // Notify người phụ trách
    if (resolvedAssignee) {
      await notifyAssignee(req, resolvedAssignee, lead, req.apiKey.name);
    }

    // ── Payload gọn nhất có thể: chỉ lead / khách hàng / công ty / khu vực
    const baseAppUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');

    // Công ty + khu vực đã gắn cố định trên API key → không lặp lại trong payload.
    const richLead = {
      id: lead.id,
      code: lead.code,
      title: lead.title,
      value: lead.estimated_value,
      stage: lead.stage?.name || null,
      url: `${baseAppUrl}/crm/leads/${lead.id}`,
      created_at: lead.created_at,
      customer: lead.customer
        ? {
            name: lead.customer.full_name || null,
            phone: lead.customer.phone || null,
            email: lead.customer.email || null,
          }
        : null,
    };

    const webhookPayload = {
      event: 'lead.created',
      timestamp: new Date().toISOString(),
      key: req.apiKey.name,
      lead: richLead,
    };

    // Gọi webhook (không đồng bộ — không chờ)
    const webhookTarget = bodyWebhookUrl || req.apiKey.webhook_url;
    if (webhookTarget) {
      callWebhook(webhookTarget, webhookPayload);
    }

    res.status(201).json({
      success: true,
      lead: richLead,
      webhook_sent: !!webhookTarget,
    });
  } catch (e) {
    console.error('[External API] Error:', e.message);
    await tryAuditLog(req, { status: 500, error: e.message });
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

// ── GET /api/external/regions — danh sách khu vực của công ty gắn với key ──
r.get('/regions', apiKeyAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('company_regions')
      .select('id, name, code, order_index, is_active')
      .eq('company_id', req.apiKey.company_id)
      .eq('is_active', true)
      .order('order_index');
    if (error) throw error;
    res.json({ regions: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/external/lead-types — danh sách "Loại Lead/Deal" của công ty ──
r.get('/lead-types', apiKeyAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('crm_lead_types')
      .select('id, name, applies_to, is_active')
      .eq('company_id', req.apiKey.company_id)
      .eq('is_active', true)
      .order('order_index', { ascending: true, nullsFirst: false })
      .order('name');
    if (error) throw error;
    const filtered = (data || []).filter((t) => !t.applies_to || ['lead', 'both'].includes(t.applies_to));
    res.json({ lead_types: filtered });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/external/pipelines — pipeline CRM của công ty ──
r.get('/pipelines', apiKeyAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('crm_pipelines')
      .select('id, name, is_default, is_active')
      .eq('company_id', req.apiKey.company_id)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at');
    if (error) throw error;
    res.json({ pipelines: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/external/source-categories — danh sách phân loại nguồn lead ──
r.get('/source-categories', apiKeyAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('crm_source_categories')
      .select('id, name, icon, color, order_index, company_id')
      .eq('is_active', true)
      .or(`company_id.is.null,company_id.eq.${req.apiKey.company_id}`)
      .order('order_index');
    if (error) throw error;
    res.json({ categories: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/external/ping — kiểm tra key hợp lệ ────────────────────────────

r.get('/ping', apiKeyAuth, (req, res) => {
  res.json({
    ok: true,
    key_name: req.apiKey.name,
    company_id: req.apiKey.company_id,
    region_id: req.apiKey.region_id,
    default_source_category_id: req.apiKey.default_source_category_id,
    default_assigned_to: req.apiKey.default_assigned_to,
    webhook_url: req.apiKey.webhook_url,
    message: 'API key hợp lệ',
  });
});

module.exports = r;
