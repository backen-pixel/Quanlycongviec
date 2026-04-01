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
    // Lần đầu lấy tên thật nếu vẫn là "Facebook User"
    if (contact.fb_name === 'Facebook User' || !contact.fb_name) {
      const profile = await fetchProfileViaConversations(pageId, psid);
      if (profile?.name) {
        const upd = { fb_name: profile.name, updated_at: new Date().toISOString() };
        if (profile.profilePic) upd.fb_profile_pic = profile.profilePic;
        await supabase.from('facebook_contacts').update(upd).eq('id', contact.id);
        contact.fb_name = profile.name;
        if (profile.profilePic) contact.fb_profile_pic = profile.profilePic;
        console.log(`[FB] Updated name: ${profile.name} (psid: ${psid})`);

        // Cập nhật lead title nếu có
        if (contact.lead_id) {
          await supabase.from('crm_leads')
            .update({ title: `[FB] ${profile.name}` })
            .eq('id', contact.lead_id)
            .ilike('title', '%Facebook User%');
          // Cập nhật customer name
          const { data: leadData } = await supabase.from('crm_leads')
            .select('customer_id').eq('id', contact.lead_id).single();
          if (leadData?.customer_id) {
            await supabase.from('customers')
              .update({ full_name: profile.name })
              .eq('id', leadData.customer_id)
              .ilike('full_name', '%Facebook%');
          }
        }
      }
    }
    // Cập nhật tên/ảnh nếu caller truyền vào
    if ((name && name !== contact.fb_name) || (profilePic && profilePic !== contact.fb_profile_pic)) {
      const upd = {};
      if (name) upd.fb_name = name;
      if (profilePic) upd.fb_profile_pic = profilePic;
      upd.updated_at = new Date().toISOString();
      await supabase.from('facebook_contacts').update(upd).eq('id', contact.id);
    }
    return contact;
  }

  // Contact mới → tạo trước với "Facebook User", rồi async lấy tên
  // Khi webhook đến, FB đã có conversation → nhưng cần delay nhỏ để API sẵn sàng

  // Thử lấy tên ngay
  if (!name) {
    const profile = await fetchProfileViaConversations(pageId, psid);
    if (profile?.name) {
      name = profile.name;
      if (profile.profilePic) profilePic = profile.profilePic;
      console.log(`[FB] Got name from conversations: ${name}`);
    }
  }

  // Tạo contact mới
  const { data: newContact, error } = await supabase.from('facebook_contacts')
    .insert({ page_id: pageId, psid, fb_name: name || 'Facebook User', fb_profile_pic: profilePic })
    .select().single();
  if (error) { console.error('[FB] Create contact error:', error.message); return null; }

  // Nếu vẫn "Facebook User" → retry sau 2 giây (background, không block)
  if (!name || name === 'Facebook User') {
    setTimeout(async () => {
      try {
        const profile = await fetchProfileViaConversations(pageId, psid);
        if (profile?.name && profile.name !== 'Facebook User') {
          const upd = { fb_name: profile.name, updated_at: new Date().toISOString() };
          if (profile.profilePic) upd.fb_profile_pic = profile.profilePic;
          await supabase.from('facebook_contacts').update(upd).eq('id', newContact.id);
          console.log(`[FB] Delayed name update: ${profile.name} (psid: ${psid})`);

          // Cập nhật lead + customer nếu đã tạo
          const { data: freshContact } = await supabase.from('facebook_contacts')
            .select('lead_id').eq('id', newContact.id).single();
          if (freshContact?.lead_id) {
            await supabase.from('crm_leads')
              .update({ title: `[FB] ${profile.name}` })
              .eq('id', freshContact.lead_id)
              .ilike('title', '%Facebook User%');
            const { data: leadData } = await supabase.from('crm_leads')
              .select('customer_id').eq('id', freshContact.lead_id).single();
            if (leadData?.customer_id) {
              await supabase.from('customers')
                .update({ full_name: profile.name })
                .eq('id', leadData.customer_id)
                .ilike('full_name', '%Facebook%');
            }
            console.log(`[FB] Delayed lead+customer update: ${profile.name}`);
          }
        }
      } catch (e) { console.warn('[FB] Delayed name fetch failed:', e.message); }
    }, 2000);
  }

  return newContact;
}

// Lấy tên user qua Conversations API (không cần Advanced Access)
// Flow: GET /me/conversations?user_id=PSID → GET /CONV_ID/messages?fields=message,from → extract name
async function fetchProfileViaConversations(pageId, psid) {
  try {
    console.log(`[FB] 🔍 Fetching name for PSID: ${psid}`);
    const page = await getPageConfig(pageId);
    if (!page?.access_token) {
      console.log('[FB] ❌ No page access token');
      return null;
    }
    const token = page.access_token;

    // Step 1: Get conversation ID
    const convResp = await fetch(`https://graph.facebook.com/v22.0/me/conversations?user_id=${psid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const convData = await convResp.json();
    if (!convData.data?.[0]?.id) {
      console.log('[FB] ❌ No conversation found');
      return null;
    }

    // Step 2: Get messages with from.name
    const convId = convData.data[0].id;
    const msgResp = await fetch(`https://graph.facebook.com/v22.0/${convId}/messages?fields=from&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const msgData = await msgResp.json();
    if (!msgData.data?.length) {
      console.log('[FB] ❌ No messages in conversation');
      return null;
    }

    // Step 3: Find message from user (not from page)
    const userMsg = msgData.data.find(m => m.from?.id === psid);
    if (!userMsg?.from?.name) {
      console.log('[FB] ❌ No name in messages');
      return null;
    }

    // Tạo avatar URL từ tên (Facebook không trả avatar với Standard Access)
    const name = userMsg.from.name;
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D8ABC&color=fff&size=200&bold=true`;

    console.log(`[FB] ✅ Got name: ${name}`);
    console.log(`[FB] 🖼️  Avatar: ${avatarUrl}`);

    return { name, profilePic: avatarUrl };
  } catch (e) {
    console.warn('[FB] fetchProfileViaConversations error:', e.message);
    return null;
  }
}

// ── Helper: Extract phone & address từ text ──
function extractContactInfo(text) {
  if (!text) return { phone: null, address: null };
  
  // Phone patterns (VN)
  const phonePatterns = [
    /(?:0|\+84)(?:\d[\s.-]?){9,10}/g,  // 0912345678, +84912345678, 0912 345 678
    /(?:84)(?:\d[\s.-]?){9,10}/g,       // 84912345678
  ];
  
  let phone = null;
  for (const pattern of phonePatterns) {
    const matches = text.match(pattern);
    if (matches?.[0]) {
      phone = matches[0].replace(/[\s.-]/g, ''); // Remove spaces/dashes
      // Normalize: +84 → 0
      if (phone.startsWith('84')) phone = '0' + phone.slice(2);
      if (phone.startsWith('+84')) phone = '0' + phone.slice(3);
      break;
    }
  }
  
  // Address patterns (keywords)
  const addressKeywords = ['địa chỉ', 'đ/c', 'dc:', 'address:', 'ship:', 'giao:', 'giao hàng', 'nhận hàng'];
  let address = null;
  
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (addressKeywords.some(kw => line.includes(kw))) {
      // Lấy dòng này + dòng sau (nếu có)
      address = lines[i];
      if (lines[i + 1]) address += ' ' + lines[i + 1];
      // Clean up keyword
      addressKeywords.forEach(kw => {
        address = address.replace(new RegExp(kw, 'gi'), '').trim();
      });
      address = address.replace(/^[:：\s]+/, '').trim();
      break;
    }
  }
  
  // Fallback: nếu có số nhà + đường/phường/quận
  if (!address && /\d+.*(?:đường|phường|quận|phố|thành phố|tỉnh|huyện)/i.test(text)) {
    const match = text.match(/\d+[^.!?\n]{10,100}(?:đường|phường|quận|phố|thành phố|tỉnh|huyện)[^.!?\n]{0,50}/i);
    if (match) address = match[0].trim();
  }
  
  return { phone, address };
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

  // Default stage: từ page config hoặc stage đầu tiên của pipeline lead
  let stageId = page.default_stage_id || null;
  if (!stageId) {
    const { data: defaultStage } = await supabase.from('crm_pipeline_stages')
      .select('id').eq('pipeline_type', 'lead').order('order_index').limit(1).single();
    stageId = defaultStage?.id || null;
  }

  // Default company: từ page config
  let companyId = null;
  try {
    if (page.default_company_id) companyId = page.default_company_id;
  } catch (e) { /* column may not exist */ }

  const leadData = {
    code,
    title: `[FB] ${extraData.full_name || contact.fb_name || 'KH Facebook'}`,
    type: 'lead',
    customer_id: customerId,
    source_id: page.default_source_id || fbSource?.id || null,
    stage_id: stageId,
    company_id: companyId,
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

// Gửi attachment (image/file/audio/video) qua URL
async function sendMessengerAttachment(pageId, psid, type, url) {
  const page = await getPageConfig(pageId);
  if (!page?.access_token) return null;

  const resp = await fetch(`https://graph.facebook.com/v19.0/${pageId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: psid },
      message: {
        attachment: {
          type, // image, audio, video, file
          payload: { url, is_reusable: true },
        },
      },
      messaging_type: 'RESPONSE',
      access_token: page.access_token,
    }),
  });
  const result = await resp.json();
  if (result.error) console.error('[FB] Send attachment error:', result.error);
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

  console.log(`\n[FB] 📨 Incoming message from PSID: ${senderId}`);

  // Get or create contact
  const contact = await getOrCreateContact(pageId, senderId);
  if (!contact) return;

  console.log(`[FB] 👤 Contact: ${contact.fb_name || 'Unknown'} (ID: ${contact.id})`);
  console.log(`[FB] 🖼️  Avatar: ${contact.fb_profile_pic ? 'Yes' : 'No'} ${contact.fb_profile_pic || ''}`);
  console.log(`[FB] 🏷️  Lead: ${contact.lead_id ? 'Yes (ID: ' + contact.lead_id + ')' : 'No'}`);

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

    // Check duplicate — Facebook có thể gửi webhook 2 lần
    if (msg.mid) {
      const { data: existing } = await supabase.from('facebook_messages')
        .select('id').eq('fb_message_id', msg.mid).limit(1);
      if (existing?.length) {
        console.log(`[FB] ⏭️  Skip duplicate message: ${msg.mid}`);
        return;
      }
    }

    console.log(`[FB] 💬 Message type: ${messageType}, content: ${content?.substring(0, 50)}${content?.length > 50 ? '...' : ''}`);
    console.log(`[FB] 📎 Attachment: ${attachmentUrl || 'None'}`);

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

    console.log(`[FB] ✅ Message saved: ${savedMsg?.id} (${isEcho ? 'outbound' : 'inbound'})`);

    if (!isEcho) {
      // Update last message + unread count
      await supabase.from('facebook_contacts').update({
        last_message_at: new Date().toISOString(),
        unread_count: (contact.unread_count || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', contact.id);

      // Auto-create lead nếu chưa có (chỉ tạo 1 lần duy nhất)
      let isFirstMessage = false;
      if (!contact.lead_id) {
        // Check: có lead cũ đã bị xóa không? (tìm messages có lead_id)
        const { data: oldMsgs } = await supabase.from('facebook_messages')
          .select('lead_id').eq('contact_id', contact.id).not('lead_id', 'is', null).limit(1);
        const hadLeadBefore = oldMsgs?.length > 0;

        if (!hadLeadBefore) {
          console.log(`[FB] 🆕 Creating lead for contact ${contact.id}`);
          isFirstMessage = true;
          const lead = await createLeadFromFacebook(pageId, contact, 'Messenger', {
            full_name: contact.fb_name,
            description: `Tin nhắn đầu tiên: ${content}`,
          });
          if (lead) {
            console.log(`[FB] ✅ Lead created: ${lead.code} (ID: ${lead.id})`);
            contact.lead_id = lead.id;
            if (savedMsg) {
              await supabase.from('facebook_messages').update({ lead_id: lead.id }).eq('id', savedMsg.id);
            }
          } else {
            console.log(`[FB] ❌ Failed to create lead`);
          }
        } else {
          console.log(`[FB] ⏭️ Contact ${contact.id} had a lead before (deleted), skip auto-create`);
        }
      } else {
        // Verify lead vẫn tồn tại — nếu bị xóa thì clear lead_id
        const { data: leadCheck } = await supabase.from('crm_leads')
          .select('id').eq('id', contact.lead_id).single();
        if (!leadCheck) {
          console.log(`[FB] 🗑️ Lead ${contact.lead_id} was deleted, clearing contact.lead_id`);
          await supabase.from('facebook_contacts').update({
            lead_id: null,
            updated_at: new Date().toISOString(),
          }).eq('id', contact.id);
          contact.lead_id = null;
        }
      }

      // Auto-reply chỉ cho tin nhắn đầu tiên (khi vừa tạo lead)
      if (isFirstMessage) {
        const page = await getPageConfig(pageId);
        if (page?.auto_reply_message) {
          await sendMessengerReply(pageId, senderId, page.auto_reply_message);
        }
      }

      // ── Extract phone & address từ tin nhắn ──
      if (content && content.length > 5) {
        const { phone, address } = extractContactInfo(content);
        
        if (phone || address) {
          console.log(`[FB] 📞 Detected — phone: ${phone || 'N/A'}, address: ${address || 'N/A'}`);
          
          // Update contact
          const contactUpd = { updated_at: new Date().toISOString() };
          if (phone && !contact.phone) contactUpd.phone = phone;
          if (Object.keys(contactUpd).length > 1) {
            await supabase.from('facebook_contacts').update(contactUpd).eq('id', contact.id);
          }
          
          // Update lead (install_address)
          if (contact.lead_id) {
            const leadUpd = {};
            if (address) leadUpd.install_address = address;
            if (Object.keys(leadUpd).length) {
              await supabase.from('crm_leads').update(leadUpd).eq('id', contact.lead_id);
              console.log(`[FB] ✅ Updated lead ${contact.lead_id}:`, leadUpd);
            }
            
            // Update customer (phone + address)
            const { data: lead } = await supabase.from('crm_leads')
              .select('customer_id').eq('id', contact.lead_id).single();
            if (lead?.customer_id) {
              const custUpd = {};
              if (phone) custUpd.phone = phone;
              if (address) custUpd.address = address;
              if (Object.keys(custUpd).length) {
                await supabase.from('customers').update(custUpd).eq('id', lead.customer_id);
                console.log(`[FB] ✅ Updated customer ${lead.customer_id}:`, custUpd);
              }
            }
          }
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
      .select('id, page_id, page_name, is_active, auto_create_lead, auto_reply_message, default_stage_id, created_at')
      .order('created_at', { ascending: false });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/pages', authMiddleware, async (req, res) => {
  try {
    const { page_id, page_name, access_token, webhook_verify_token, auto_create_lead, auto_reply_message, default_source_id, default_stage_id, default_company_id } = req.body;
    const insertData = {
      page_id, page_name, access_token,
      webhook_verify_token: webhook_verify_token || 'tubep_pro_verify_2024',
      auto_create_lead: auto_create_lead !== false,
      auto_reply_message: auto_reply_message || null,
      default_source_id: default_source_id || null,
      default_stage_id: default_stage_id || null,
      created_by: req.user.userId,
    };
    // default_company_id — cột có thể chưa tồn tại
    if (default_company_id) insertData.default_company_id = default_company_id;

    let { data, error } = await supabase.from('facebook_pages').insert(insertData).select().single();
    // Retry without default_company_id if column doesn't exist
    if (error?.message?.includes('default_company_id')) {
      delete insertData.default_company_id;
      ({ data, error } = await supabase.from('facebook_pages').insert(insertData).select().single());
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/pages/:id', authMiddleware, async (req, res) => {
  try {
    const update = {};
    ['page_name', 'access_token', 'is_active', 'auto_create_lead', 'auto_reply_message',
     'webhook_verify_token', 'default_source_id', 'default_stage_id', 'default_pipeline_id', 'default_company_id'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    update.updated_at = new Date().toISOString();
    let { data, error } = await supabase.from('facebook_pages').update(update).eq('id', req.params.id).select().single();
    if (error?.message?.includes('default_company_id')) {
      delete update.default_company_id;
      ({ data, error } = await supabase.from('facebook_pages').update(update).eq('id', req.params.id).select().single());
    }
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

// Get single contact (check lead still exists)
r.get('/contacts/:id', authMiddleware, async (req, res) => {
  try {
    const { data: contact } = await supabase.from('facebook_contacts')
      .select('*, lead:crm_leads(id, title, code, type), customer:customers(id, full_name, phone)')
      .eq('id', req.params.id).single();
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    
    // Nếu lead_id có nhưng lead không tồn tại → clear
    if (contact.lead_id && !contact.lead) {
      await supabase.from('facebook_contacts').update({ lead_id: null }).eq('id', contact.id);
      contact.lead_id = null;
      contact.lead = null;
    }
    
    res.json(contact);
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

// Update contact info (sửa tên, phone, email, ghi chú)
r.put('/contacts/:id', authMiddleware, async (req, res) => {
  try {
    const update = {};
    ['fb_name', 'phone', 'email', 'notes', 'lead_id', 'customer_id'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f] || null;
    });
    // fb_name keep truthy
    if (req.body.fb_name) update.fb_name = req.body.fb_name;
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('facebook_contacts')
      .update(update).eq('id', req.params.id)
      .select('*, lead:crm_leads(id, title, code, type), customer:customers(id, full_name, phone)')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete contact (xóa contact + messages)
r.delete('/contacts/:id', authMiddleware, async (req, res) => {
  try {
    await supabase.from('facebook_messages').delete().eq('contact_id', req.params.id);
    await supabase.from('facebook_contacts').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Tạo lead nhanh từ contact
r.post('/contacts/:id/create-lead', authMiddleware, async (req, res) => {
  try {
    const { data: contact } = await supabase.from('facebook_contacts')
      .select('*').eq('id', req.params.id).single();
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (contact.lead_id) return res.status(400).json({ error: 'Contact đã có Lead' });

    // Lấy page config để biết default stage + company
    const { data: page } = await supabase.from('facebook_pages')
      .select('*').eq('page_id', contact.page_id).single();

    // Lấy stage "Mới" (default) nếu page chưa set
    let stageId = page?.default_stage_id || null;
    if (!stageId) {
      const { data: defaultStage } = await supabase.from('crm_pipeline_stages')
        .select('id').eq('pipeline_type', 'lead').order('order_index').limit(1).single();
      stageId = defaultStage?.id || null;
    }

    // Company từ page config hoặc từ request body
    let companyId = req.body.company_id || null;
    if (!companyId && page?.default_company_id) companyId = page.default_company_id;

    // Tạo lead
    const { count } = await supabase.from('crm_leads')
      .select('id', { count: 'exact', head: true }).eq('type', 'lead');
    const code = `LEAD-${String((count || 0) + 1).padStart(4, '0')}`;

    const { data: lead, error } = await supabase.from('crm_leads').insert({
      code,
      title: `[FB] ${contact.fb_name || 'KH Facebook'}`,
      type: 'lead',
      stage_id: stageId,
      company_id: companyId,
      source_id: page?.default_source_id || null,
      description: `Từ Facebook Messenger\nTên: ${contact.fb_name || ''}\nSĐT: ${contact.phone || ''}\nEmail: ${contact.email || ''}`.trim(),
      lead_owner_id: req.user.userId,
      assigned_to: req.user.userId,
      created_by: req.user.userId,
    }).select('id, code, title').single();
    if (error) throw error;

    // Link contact → lead
    await supabase.from('facebook_contacts').update({ lead_id: lead.id }).eq('id', contact.id);
    await supabase.from('facebook_messages').update({ lead_id: lead.id }).eq('contact_id', contact.id);

    res.status(201).json(lead);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Sync lịch sử hội thoại cũ từ Facebook cho 1 contact
r.post('/contacts/:id/sync-history', authMiddleware, async (req, res) => {
  try {
    const { data: contact } = await supabase.from('facebook_contacts')
      .select('*').eq('id', req.params.id).single();
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const page = await getPageConfig(contact.page_id);
    if (!page?.access_token) return res.status(400).json({ error: 'No page token' });

    // Step 1: Get conversation
    const convResp = await fetch(`https://graph.facebook.com/v22.0/me/conversations?user_id=${contact.psid}`, {
      headers: { Authorization: `Bearer ${page.access_token}` },
    });
    const convData = await convResp.json();
    if (!convData.data?.[0]?.id) return res.json({ synced: 0, message: 'Không tìm thấy hội thoại' });

    // Step 2: Get messages (limit 50)
    const convId = convData.data[0].id;
    const msgResp = await fetch(`https://graph.facebook.com/v22.0/${convId}/messages?fields=message,from,created_time,attachments&limit=50`, {
      headers: { Authorization: `Bearer ${page.access_token}` },
    });
    const msgData = await msgResp.json();
    if (!msgData.data?.length) return res.json({ synced: 0, message: 'Không có tin nhắn' });

    let synced = 0;
    for (const msg of msgData.data) {
      // Check duplicate
      const fbMsgId = msg.id;
      const { data: existing } = await supabase.from('facebook_messages')
        .select('id').eq('fb_message_id', fbMsgId).limit(1);
      if (existing?.length) continue;

      const isFromPage = msg.from?.id === contact.page_id;
      let attachmentUrl = null;
      let messageType = 'text';
      if (msg.attachments?.data?.[0]) {
        const att = msg.attachments.data[0];
        attachmentUrl = att.image_data?.url || att.file_url || att.url || null;
        messageType = att.mime_type?.startsWith('image') ? 'image' : att.mime_type?.startsWith('video') ? 'video' : att.mime_type?.startsWith('audio') ? 'audio' : 'file';
      }

      await supabase.from('facebook_messages').insert({
        contact_id: contact.id,
        lead_id: contact.lead_id,
        fb_message_id: fbMsgId,
        direction: isFromPage ? 'outbound' : 'inbound',
        message_type: messageType,
        content: msg.message || (attachmentUrl ? `[${messageType}]` : ''),
        attachment_url: attachmentUrl,
        created_at: msg.created_time || new Date().toISOString(),
      });
      synced++;
    }

    res.json({ synced, total: msgData.data.length, message: `Đã đồng bộ ${synced} tin nhắn mới` });
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
    const { message, attachment_url, attachment_type } = req.body;
    if (!message && !attachment_url) return res.status(400).json({ error: 'Message or attachment required' });

    const { data: contact } = await supabase.from('facebook_contacts')
      .select('*').eq('id', req.params.contactId).single();
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    let result;
    let msgType = 'text';
    let content = message || '';

    // Gửi attachment nếu có
    if (attachment_url) {
      const type = attachment_type || 'file'; // image, audio, video, file
      result = await sendMessengerAttachment(contact.page_id, contact.psid, type, attachment_url);
      msgType = type;
      if (!content) content = `[${type}]`;
    }

    // Gửi text nếu có
    if (message) {
      result = await sendMessengerReply(contact.page_id, contact.psid, message);
    }

    if (result?.error) return res.status(500).json({ error: result.error.message });

    // Save outbound message
    const { data: saved } = await supabase.from('facebook_messages').insert({
      contact_id: contact.id,
      lead_id: contact.lead_id,
      fb_message_id: result?.message_id,
      direction: 'outbound',
      message_type: msgType,
      content,
      attachment_url: attachment_url || null,
      attachment_type: attachment_type || null,
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
