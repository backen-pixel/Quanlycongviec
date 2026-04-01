const express = require('express');
const r = express.Router();
const { supabase } = require('../config/supabase');

// ═══════════════════════════════════════════════════════════════
// FACEBOOK WEBHOOK — Nhận Lead Ads, Messenger, Comments
// ═══════════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────

async function getPageConfig(pageId) {
  const { data } = await supabase.from('facebook_pages')
    .select('*').eq('page_id', pageId).eq('is_active', true).single();
  return data;
}

async function getOrCreateContact(pageId, psid, name, profilePic) {
  // Tìm contact đã có
  let { data: contact } = await supabase.from('facebook_contacts')
    .select('*').eq('page_id', pageId).eq('psid', psid).single();
  
  if (contact) {
    // Cập nhật tên/ảnh nếu thay đổi
    if ((name && name !== contact.fb_name) || (profilePic && profilePic !== contact.fb_profile_pic)) {
      const upd = {};
      if (name) upd.fb_name = name;
      if (profilePic) upd.fb_profile_pic = profilePic;
      upd.updated_at = new Date().toISOString();
      await supabase.from('facebook_contacts').update(upd).eq('id', contact.id);
    }
    return contact;
  }

  // Lấy profile từ Facebook
  if (!name) {
    try {
      const page = await getPageConfig(pageId);
      if (page?.access_token) {
        const resp = await fetch(`https://graph.facebook.com/v19.0/${psid}?fields=name,profile_pic&access_token=${page.access_token}`);
        if (resp.ok) {
          const profile = await resp.json();
          name = profile.name;
          profilePic = profile.profile_pic;
        }
      }
    } catch (e) { console.warn('[FB] Get profile error:', e.message); }
  }

  // Tạo contact mới
  const { data: newContact, error } = await supabase.from('facebook_contacts')
    .insert({ page_id: pageId, psid, fb_name: name || 'Facebook User', fb_profile_pic: profilePic })
    .select().single();
  if (error) { console.error('[FB] Create contact error:', error.message); return null; }
  return newContact;
}

async function createLeadFromFacebook(pageId, contact, source, extraData = {}) {
  const page = await getPageConfig(pageId);
  if (!page?.auto_create_lead) return null;

  // Tìm/tạo customer
  let customerId = contact.customer_id;
  if (!customerId) {
    const customerData = {
      full_name: extraData.full_name || contact.fb_name || 'Facebook KH',
      phone: extraData.phone || contact.phone || null,
      email: extraData.email || contact.email || null,
      source: 'Facebook',
    };
    const { data: customer } = await supabase.from('customers')
      .insert(customerData).select().single();
    if (customer) {
      customerId = customer.id;
      await supabase.from('facebook_contacts').update({ customer_id: customer.id }).eq('id', contact.id);
    }
  }

  // Tìm source "Facebook"
  const { data: fbSource } = await supabase.from('crm_sources')
    .select('id').eq('name', 'Facebook').single();

  // Tạo lead code
  const { count } = await supabase.from('crm_leads')
    .select('id', { count: 'exact', head: true }).eq('type', 'lead');
  const code = `LEAD-${String((count || 0) + 1).padStart(4, '0')}`;

  const leadData = {
    code,
    title: `[FB] ${extraData.full_name || contact.fb_name || 'KH Facebook'}`,
    type: 'lead',
    customer_id: customerId,
    source_id: page.default_source_id || fbSource?.id || null,
    stage_id: page.default_stage_id || null,
    description: `Nguồn: Facebook ${source}\nTên: ${extraData.full_name || contact.fb_name || ''}\nSĐT: ${extraData.phone || contact.phone || ''}\nEmail: ${extraData.email || contact.email || ''}`.trim(),
    lead_owner_id: page.created_by,
    assigned_to: page.created_by,
    created_by: page.created_by,
  };

  const { data: lead, error } = await supabase.from('crm_leads')
    .insert(leadData).select().single();
  
  if (error) { console.error('[FB] Create lead error:', error.message); return null; }

  // Link contact → lead
  await supabase.from('facebook_contacts').update({ lead_id: lead.id }).eq('id', contact.id);

  console.log(`[FB] Lead created: ${lead.code} — ${lead.title}`);

  // Notify admins
  try {
    const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
    for (const admin of (admins || [])) {
      await supabase.from('notifications').insert({
        user_id: admin.id,
        type: 'lead_created',
        title: '📘 Lead mới từ Facebook',
        message: `${lead.title} — ${extraData.phone || contact.fb_name || ''}`,
        entity_type: 'crm_lead',
        entity_id: lead.id,
      });
    }
    // Push via Socket.IO
    const pushFn = r._app?.get?.('pushNotification');
    if (pushFn) {
      for (const admin of (admins || [])) {
        pushFn(admin.id, { type: 'lead_created', title: '📘 Lead mới từ Facebook', message: lead.title, entity_type: 'crm_lead', entity_id: lead.id });
      }
    }
  } catch (e) { console.warn('[FB] Notify error:', e.message); }

  return lead;
}

async function sendMessengerReply(pageId, psid, text) {
  const page = await getPageConfig(pageId);
  if (!page?.access_token) return null;

  const resp = await fetch(`https://graph.facebook.com/v19.0/${pageId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: psid },
      message: { text },
      messaging_type: 'RESPONSE',
      access_token: page.access_token,
    }),
  });
  const result = await resp.json();
  if (result.error) console.error('[FB] Send message error:', result.error);
  return result;
}

// ── WEBHOOK VERIFY (GET) ─────────────────────────────────────

r.get('/webhook', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Kiểm tra verify token từ bất kỳ page config nào
  if (mode === 'subscribe') {
    const verifyToken = process.env.FB_WEBHOOK_VERIFY_TOKEN || 'tubep_pro_verify_2024';
    
    // Check env var first, then check database
    if (token === verifyToken) {
      console.log('[FB] Webhook verified via env token');
      return res.status(200).send(challenge);
    }

    const { data: pages } = await supabase.from('facebook_pages')
      .select('webhook_verify_token').eq('is_active', true);
    const valid = (pages || []).some(p => p.webhook_verify_token === token);
    if (valid) {
      console.log('[FB] Webhook verified via page config');
      return res.status(200).send(challenge);
    }
  }

  res.sendStatus(403);
});

// ── WEBHOOK RECEIVE (POST) ───────────────────────────────────

r.post('/webhook', async (req, res) => {
  const body = req.body;
  
  // Luôn trả 200 ngay để Facebook không retry
  res.sendStatus(200);

  try {
    if (body.object === 'page') {
      for (const entry of (body.entry || [])) {
        const pageId = entry.id;

        // ═══ MESSENGER MESSAGES ═══
        if (entry.messaging) {
          for (const event of entry.messaging) {
            await handleMessaging(pageId, event, r._ioRef);
          }
        }

        // ═══ LEAD ADS (leadgen) ═══
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'leadgen') {
              await handleLeadGen(pageId, change.value);
            }
            if (change.field === 'feed' && change.value?.item === 'comment') {
              await handleComment(pageId, change.value);
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('[FB] Webhook processing error:', e.message, e.stack);
  }
});

// ── HANDLE MESSENGER ─────────────────────────────────────────

async function handleMessaging(pageId, event, io) {
  const senderId = event.sender?.id;
  if (!senderId || senderId === pageId) return; // Skip page's own messages

  // Get or create contact
  const contact = await getOrCreateContact(pageId, senderId);
  if (!contact) return;

  if (event.message) {
    const msg = event.message;
    const isEcho = msg.is_echo;

    // Determine message type & content
    let messageType = 'text';
    let content = msg.text || '';
    let attachmentUrl = null;
    let attachmentType = null;

    if (msg.attachments && msg.attachments.length > 0) {
      const att = msg.attachments[0];
      messageType = att.type || 'file'; // image, video, audio, file
      attachmentUrl = att.payload?.url;
      attachmentType = att.type;
      if (!content) content = `[${messageType}]`;
    }

    if (msg.sticker_id) {
      messageType = 'sticker';
      content = `[Sticker: ${msg.sticker_id}]`;
    }

    // Save message
    const { data: savedMsg } = await supabase.from('facebook_messages').insert({
      contact_id: contact.id,
      lead_id: contact.lead_id,
      fb_message_id: msg.mid,
      direction: isEcho ? 'outbound' : 'inbound',
      message_type: messageType,
      content,
      attachment_url: attachmentUrl,
      attachment_type: attachmentType,
      metadata: msg.attachments ? { attachments: msg.attachments } : null,
    }).select().single();

    if (!isEcho) {
      // Update last message + unread count
      await supabase.from('facebook_contacts').update({
        last_message_at: new Date().toISOString(),
        unread_count: (contact.unread_count || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', contact.id);

      // Auto-create lead nếu chưa có
      if (!contact.lead_id) {
        const lead = await createLeadFromFacebook(pageId, contact, 'Messenger', {
          full_name: contact.fb_name,
          description: `Tin nhắn đầu tiên: ${content}`,
        });
        if (lead && savedMsg) {
          await supabase.from('facebook_messages').update({ lead_id: lead.id }).eq('id', savedMsg.id);
        }
      }

      // Auto-reply (chỉ cho tin nhắn đầu tiên)
      if (!contact.lead_id) {
        const page = await getPageConfig(pageId);
        if (page?.auto_reply_message) {
          await sendMessengerReply(pageId, senderId, page.auto_reply_message);
        }
      }

      // Push realtime notification
      try {
        if (io) {
          io.emit('fb_message', {
            contact_id: contact.id,
            lead_id: contact.lead_id,
            message: savedMsg,
            contact,
          });
          console.log('[FB] Socket.IO emit fb_message →', contact.fb_name);
        }
      } catch (e) { /* ignore */ }

      console.log(`[FB] Messenger inbound: ${contact.fb_name} → "${content.substring(0, 50)}"`);
    }
  }

  // Read receipts
  if (event.read) {
    await supabase.from('facebook_contacts').update({ unread_count: 0 }).eq('id', contact.id);
  }
}

// ── HANDLE LEAD ADS ──────────────────────────────────────────

async function handleLeadGen(pageId, value) {
  const leadgenId = value.leadgen_id;
  const formId = value.form_id;
  
  console.log(`[FB] Lead Ad received: leadgen_id=${leadgenId}, form_id=${formId}`);

  // Check duplicate
  const { data: existing } = await supabase.from('facebook_lead_ads')
    .select('id').eq('leadgen_id', leadgenId).single();
  if (existing) { console.log('[FB] Duplicate leadgen, skipping'); return; }

  // Fetch lead data from Facebook
  const page = await getPageConfig(pageId);
  if (!page?.access_token) { console.warn('[FB] No access token for page', pageId); return; }

  let leadData = {};
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${page.access_token}`
    );
    leadData = await resp.json();
  } catch (e) {
    console.error('[FB] Fetch leadgen data error:', e.message);
  }

  // Parse fields
  const fields = {};
  for (const f of (leadData.field_data || [])) {
    fields[f.name] = f.values?.[0] || '';
  }

  const fullName = fields.full_name || fields.first_name
    ? `${fields.first_name || ''} ${fields.last_name || ''}`.trim()
    : 'KH Facebook Ads';
  const phone = fields.phone_number || fields.phone || '';
  const email = fields.email || '';

  // Save raw lead ad data
  const { data: savedAd } = await supabase.from('facebook_lead_ads').insert({
    page_id: pageId,
    leadgen_id: leadgenId,
    form_id: formId,
    form_name: leadData.form_name || value.form_name || null,
    field_data: fields,
    full_name: fullName,
    phone,
    email,
    raw_data: leadData,
  }).select().single();

  // Create contact + lead
  const contact = await getOrCreateContact(pageId, `leadad_${leadgenId}`, fullName);
  if (contact) {
    if (phone) await supabase.from('facebook_contacts').update({ phone, email }).eq('id', contact.id);
    
    const lead = await createLeadFromFacebook(pageId, contact, 'Lead Ads', {
      full_name: fullName,
      phone,
      email,
      description: `Form: ${leadData.form_name || formId}\n` +
        Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n'),
    });

    if (lead && savedAd) {
      await supabase.from('facebook_lead_ads').update({
        customer_id: contact.customer_id,
        lead_id: lead.id,
        processed: true,
      }).eq('id', savedAd.id);
    }
  }
}

// ── HANDLE COMMENTS ──────────────────────────────────────────

async function handleComment(pageId, value) {
  const commentId = value.comment_id;
  if (!commentId) return;

  // Skip page's own comments
  if (value.from?.id === pageId) return;

  console.log(`[FB] Comment: "${(value.message || '').substring(0, 50)}" by ${value.from?.name}`);

  // Check duplicate
  const { data: existing } = await supabase.from('facebook_comments')
    .select('id').eq('comment_id', commentId).single();
  if (existing) return;

  // Save comment
  await supabase.from('facebook_comments').insert({
    page_id: pageId,
    post_id: value.post_id,
    comment_id: commentId,
    parent_comment_id: value.parent_id || null,
    from_id: value.from?.id,
    from_name: value.from?.name,
    message: value.message,
    attachment_url: value.photo || value.video || null,
  });

  // Notify admins
  try {
    const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
    for (const admin of (admins || [])) {
      await supabase.from('notifications').insert({
        user_id: admin.id,
        type: 'fb_comment',
        title: '💬 Bình luận mới trên Facebook',
        message: `${value.from?.name}: "${(value.message || '').substring(0, 80)}"`,
        entity_type: 'fb_comment',
        entity_id: commentId,
      });
    }
  } catch (e) { /* ignore */ }
}


// ═══════════════════════════════════════════════════════════════
// API ENDPOINTS (Authenticated — for frontend)
// ═══════════════════════════════════════════════════════════════

const { auth: authMiddleware } = require('../middleware/auth');

// ── Pages config CRUD ────────────────────────────────────────

r.get('/pages', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase.from('facebook_pages')
      .select('id, page_id, page_name, is_active, auto_create_lead, auto_reply_message, created_at')
      .order('created_at', { ascending: false });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/pages', authMiddleware, async (req, res) => {
  try {
    const { page_id, page_name, access_token, webhook_verify_token, auto_create_lead, auto_reply_message, default_source_id, default_stage_id } = req.body;
    const { data, error } = await supabase.from('facebook_pages').insert({
      page_id, page_name, access_token,
      webhook_verify_token: webhook_verify_token || 'tubep_pro_verify_2024',
      auto_create_lead: auto_create_lead !== false,
      auto_reply_message: auto_reply_message || null,
      default_source_id: default_source_id || null,
      default_stage_id: default_stage_id || null,
      created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/pages/:id', authMiddleware, async (req, res) => {
  try {
    const update = {};
    ['page_name', 'access_token', 'is_active', 'auto_create_lead', 'auto_reply_message',
     'webhook_verify_token', 'default_source_id', 'default_stage_id', 'default_pipeline_id'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('facebook_pages').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/pages/:id', authMiddleware, async (req, res) => {
  try {
    await supabase.from('facebook_pages').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Contacts (danh sách chat FB) ─────────────────────────────

r.get('/contacts', authMiddleware, async (req, res) => {
  try {
    const { page_id, has_lead, search } = req.query;
    let q = supabase.from('facebook_contacts')
      .select('*, lead:crm_leads(id, title, code, type), customer:customers(id, full_name, phone)')
      .order('last_message_at', { ascending: false, nullsFirst: false });
    
    if (page_id) q = q.eq('page_id', page_id);
    if (has_lead === 'true') q = q.not('lead_id', 'is', null);
    if (has_lead === 'false') q = q.is('lead_id', null);
    if (search) q = q.or(`fb_name.ilike.%${search}%,phone.ilike.%${search}%`);

    const { data } = await q.limit(100);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Link contact → existing lead
r.put('/contacts/:id/link-lead', authMiddleware, async (req, res) => {
  try {
    const { lead_id } = req.body;
    const { data, error } = await supabase.from('facebook_contacts')
      .update({ lead_id, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    // Update all messages of this contact
    await supabase.from('facebook_messages').update({ lead_id }).eq('contact_id', req.params.id);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Messages (lịch sử chat) ─────────────────────────────────

r.get('/contacts/:contactId/messages', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase.from('facebook_messages')
      .select('*')
      .eq('contact_id', req.params.contactId)
      .order('created_at', { ascending: true })
      .limit(200);
    
    // Mark as read
    await supabase.from('facebook_contacts').update({ unread_count: 0 }).eq('id', req.params.contactId);
    
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get messages by lead_id
r.get('/leads/:leadId/messages', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase.from('facebook_messages')
      .select('*, contact:facebook_contacts(fb_name, fb_profile_pic)')
      .eq('lead_id', req.params.leadId)
      .order('created_at', { ascending: true })
      .limit(200);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Send reply via Messenger
r.post('/contacts/:contactId/reply', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const { data: contact } = await supabase.from('facebook_contacts')
      .select('*').eq('id', req.params.contactId).single();
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    // Send via Facebook
    const result = await sendMessengerReply(contact.page_id, contact.psid, message);
    if (result?.error) return res.status(500).json({ error: result.error.message });

    // Save outbound message
    const { data: saved } = await supabase.from('facebook_messages').insert({
      contact_id: contact.id,
      lead_id: contact.lead_id,
      fb_message_id: result?.message_id,
      direction: 'outbound',
      message_type: 'text',
      content: message,
      sent_by: req.user.userId,
    }).select().single();

    res.json(saved);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Lead Ads ─────────────────────────────────────────────────

r.get('/lead-ads', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase.from('facebook_lead_ads')
      .select('*, lead:crm_leads(id, title, code)')
      .order('created_at', { ascending: false })
      .limit(100);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Comments ─────────────────────────────────────────────────

r.get('/comments', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase.from('facebook_comments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reply to comment
r.post('/comments/:id/reply', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    const { data: comment } = await supabase.from('facebook_comments')
      .select('*').eq('id', req.params.id).single();
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    const page = await getPageConfig(comment.page_id);
    if (!page?.access_token) return res.status(400).json({ error: 'No page token' });

    // Reply via Graph API
    const resp = await fetch(`https://graph.facebook.com/v19.0/${comment.comment_id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: page.access_token }),
    });
    const result = await resp.json();
    if (result.error) return res.status(500).json({ error: result.error.message });

    // Update comment as replied
    await supabase.from('facebook_comments').update({ replied: true, reply_text: message }).eq('id', req.params.id);
    
    res.json({ success: true, comment_id: result.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard stats ──────────────────────────────────────────

r.get('/stats', authMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [contacts, messages, leadAds, comments, unread] = await Promise.all([
      supabase.from('facebook_contacts').select('id', { count: 'exact', head: true }),
      supabase.from('facebook_messages').select('id', { count: 'exact', head: true }).eq('direction', 'inbound').gte('created_at', today),
      supabase.from('facebook_lead_ads').select('id', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('facebook_comments').select('id', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('facebook_contacts').select('unread_count').gt('unread_count', 0),
    ]);

    res.json({
      total_contacts: contacts.count || 0,
      messages_today: messages.count || 0,
      lead_ads_today: leadAds.count || 0,
      comments_today: comments.count || 0,
      total_unread: (unread.data || []).reduce((s, c) => s + c.unread_count, 0),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
