const express = require('express');
const r = express.Router();
const { generateRestToken, stringeeAPI, STRINGEE_SID } = require('../helpers/stringee');
const { supabase } = require('../config/supabase');

// ═══════════════════════════════════════════════════════════════
// TEST: Kiểm tra kết nối Stringee
// ═══════════════════════════════════════════════════════════════
r.get('/test', async (req, res) => {
  try {
    if (!STRINGEE_SID) return res.status(400).json({ error: 'Chưa cấu hình STRINGEE_API_SID' });
    const token = generateRestToken();
    // Thử gọi API lấy thông tin account
    const result = await stringeeAPI('GET', '/account');
    res.json({
      ok: true,
      sid: STRINGEE_SID.slice(0, 10) + '...',
      token_preview: token.slice(0, 30) + '...',
      account: result.data,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// WEBHOOK: Nhận callback từ Stringee khi có cuộc gọi
// ═══════════════════════════════════════════════════════════════
r.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    console.log('[STRINGEE WEBHOOK]', JSON.stringify(payload).slice(0, 500));

    // Stringee gửi nhiều event: RINGING, ANSWERED, ENDED, etc.
    const event = payload.call_status || payload.event || payload.type || 'unknown';
    const callId = payload.call_id || payload.callId || '';
    const from = payload.from?.number || payload.from || '';
    const to = payload.to?.number || payload.to || '';
    const direction = payload.direction || (payload.call_type === 1 ? 'inbound' : 'outbound');
    const duration = payload.duration || payload.call_duration || 0;
    const recordingUrl = payload.recording_url || payload.recordUrl || '';
    const startedAt = payload.answer_time || payload.start_time || payload.created_time || null;
    const endedAt = payload.end_time || null;

    // Lưu raw log vào crm_call_logs
    const { data: log, error } = await supabase.from('crm_call_logs').upsert({
      third_party_call_id: callId,
      provider: 'stringee',
      phone_from: from,
      phone_to: to,
      direction,
      status: event,
      duration_seconds: duration,
      recording_url: recordingUrl,
      started_at: startedAt ? new Date(startedAt * 1000).toISOString() : null,
      ended_at: endedAt ? new Date(endedAt * 1000).toISOString() : null,
      raw_payload: payload,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'third_party_call_id' }).select().single();

    if (error) console.error('[STRINGEE WEBHOOK] DB error:', error.message);

    // Auto-match: tìm lead/deal/customer theo số điện thoại
    if (log && (event === 'ENDED' || event === 'ended' || recordingUrl)) {
      const phone = direction === 'inbound' ? from : to;
      if (phone) {
        // Tìm customer
        const cleanPhone = phone.replace(/^\+84/, '0').replace(/\D/g, '');
        const { data: customer } = await supabase.from('customers')
          .select('id')
          .or(`phone.eq.${cleanPhone},phone.eq.+84${cleanPhone.slice(1)}`)
          .limit(1).maybeSingle();

        if (customer) {
          await supabase.from('crm_call_logs').update({
            customer_id: customer.id,
          }).eq('id', log.id);

          // Tìm lead/deal active của customer
          const { data: lead } = await supabase.from('crm_leads')
            .select('id')
            .eq('customer_id', customer.id)
            .in('status', ['new', 'contacted', 'qualified', 'negotiation', 'proposal', 'open', 'active'])
            .order('created_at', { ascending: false })
            .limit(1).maybeSingle();

          if (lead) {
            await supabase.from('crm_call_logs').update({
              lead_id: lead.id,
            }).eq('id', log.id);
          }
        }
        console.log(`[STRINGEE] Matched phone ${cleanPhone} → customer: ${customer?.id || 'none'}`);
      }
    }

    // Stringee expect 200 response
    res.json({ ok: true, call_id: callId, event });
  } catch (e) {
    console.error('[STRINGEE WEBHOOK ERROR]', e.message);
    res.status(200).json({ ok: false, error: e.message }); // vẫn 200 để Stringee không retry quá nhiều
  }
});

// ═══════════════════════════════════════════════════════════════
// GET: Lấy lịch sử cuộc gọi theo lead
// ═══════════════════════════════════════════════════════════════
r.get('/calls', async (req, res) => {
  try {
    const { lead_id, customer_id, limit = 50 } = req.query;
    let query = supabase.from('crm_call_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(parseInt(limit));
    if (lead_id) query = query.eq('lead_id', lead_id);
    if (customer_id) query = query.eq('customer_id', customer_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
