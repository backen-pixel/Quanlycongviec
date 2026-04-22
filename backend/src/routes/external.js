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
 */
const { Router } = require('express');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');
const { supabase } = require('../config/supabase');

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

  // Tìm theo SĐT trước, sau đó email
  if (phone) {
    const { data } = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle();
    if (data) return data.id;
  }
  if (email) {
    const { data } = await supabase.from('customers').select('id').eq('email', email).maybeSingle();
    if (data) return data.id;
  }

  // Tạo mới
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
    } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Trường title (tên lead) là bắt buộc' });
    }

    // Tìm / tạo customer
    const customerId = await findOrCreateCustomer({ full_name, phone, email, address, company: customerCompany });

    // Nguồn
    const sourceId = await findOrCreateSource(source_name);

    // Giai đoạn — nếu không truyền → giai đoạn đầu tiên
    const resolvedStageId = stage_id || (await getFirstLeadStage());

    // Người phụ trách — ưu tiên từ body, sau đó từ config key
    const resolvedAssignee = assigned_to || req.apiKey.default_assigned_to || null;

    // Tạo mã
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

// ── GET /api/external/ping — kiểm tra key hợp lệ ────────────────────────────

r.get('/ping', apiKeyAuth, (req, res) => {
  res.json({ ok: true, key_name: req.apiKey.name, message: 'API key hợp lệ' });
});

module.exports = r;
