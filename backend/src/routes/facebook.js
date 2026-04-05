const express = require('express');
const r = express.Router();
const { supabase } = require('../config/supabase');

// ── Auto-migration: thêm cột mới nếu chưa có ──
(async () => {
  try {
    // Test thêm cột default_lead_owner_id
    const { error } = await supabase.from('facebook_pages')
      .select('default_lead_owner_id').limit(1);
    if (error?.message?.includes('default_lead_owner_id')) {
      console.log('[FB] ⚠️ Column default_lead_owner_id chưa có, sẽ dùng fallback (created_by)');
    } else {
      console.log('[FB] ✅ Column default_lead_owner_id OK');
    }
  } catch (e) { /* ignore */ }
})();

// Migration endpoint — chạy 1 lần để thêm cột mới
r.post('/migrate', async (req, res) => {
  try {
    // Kiểm tra column đã tồn tại chưa
    const { error: checkErr } = await supabase.from('facebook_pages')
      .select('default_lead_owner_id').limit(1);
    
    if (!checkErr) {
      return res.json({ message: 'Column default_lead_owner_id already exists', ok: true });
    }

    // Thử tạo RPC function bằng cách dùng supabase.rpc 
    // Nếu ko được thì hướng dẫn chạy SQL manual
    return res.json({
      message: 'Column chưa tồn tại. Vui lòng chạy SQL này trong Supabase Dashboard → SQL Editor:',
      sql: 'ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS default_lead_owner_id UUID;',
      ok: false,
    });
  } catch (e) {
    res.json({ 
      message: 'Run this SQL manually in Supabase Dashboard → SQL Editor:', 
      sql: 'ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS default_lead_owner_id UUID;',
      error: e.message 
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// FACEBOOK WEBHOOK — Nhận Lead Ads, Messenger, Comments
// ═══════════════════════════════════════════════════════════════

// ── In-memory dedup: chống race condition khi chưa có UNIQUE INDEX ──
const _processingMids = new Set();
function acquireMidLock(mid) {
  if (!mid) return true; // no mid = no dedup
  if (_processingMids.has(mid)) return false; // already processing
  _processingMids.add(mid);
  // Auto-cleanup after 60s
  setTimeout(() => _processingMids.delete(mid), 60000);
  return true;
}

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

  // Nếu vẫn "Facebook User" → retry 3 lần, mỗi lần cách nhau 5 giây
  if (!name || name === 'Facebook User') {
    let retryCount = 0;
    const retryFetch = async () => {
      try {
        const profile = await fetchProfileViaConversations(pageId, psid);
        if (profile?.name && profile.name !== 'Facebook User') {
          const upd = { fb_name: profile.name, updated_at: new Date().toISOString() };
          if (profile.profilePic) upd.fb_profile_pic = profile.profilePic;
          await supabase.from('facebook_contacts').update(upd).eq('id', newContact.id);
          console.log(`[FB] ✅ Background name update: ${profile.name} (psid: ${psid})`);

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
            console.log(`[FB] ✅ Background lead+customer update: ${profile.name}`);
          }
        } else if (retryCount < 2) {
          retryCount++;
          setTimeout(retryFetch, 5000); // Retry sau 5s
        }
      } catch (e) { 
        console.warn('[FB] Background profile fetch failed:', e.message);
        if (retryCount < 2) {
          retryCount++;
          setTimeout(retryFetch, 5000);
        }
      }
    };
    setTimeout(retryFetch, 5000);
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

    const userName = userMsg.from.name;

    // Tạo avatar URL từ tên
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=0D8ABC&color=fff&size=200&bold=true`;

    console.log(`[FB] ✅ Got name: ${userName}`);
    console.log(`[FB] 🖼️  Avatar: ${avatarUrl}`);

    return { name: userName, profilePic: avatarUrl };
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
  if (!page) return null;

  // ── ANTI-DUPLICATE ──
  const { data: freshContact } = await supabase.from('facebook_contacts')
    .select('lead_id, customer_id').eq('id', contact.id).single();
  
  // 1. Check race condition (nếu đã có lead_id)
  if (freshContact?.lead_id) {
    return { id: freshContact.lead_id };
  }
  
  // 2. Check trùng theo customer_id (đề phòng chưa có lead_id nhưng đã có lead)
  if (freshContact?.customer_id) {
     const { data: existing } = await supabase.from('crm_leads')
       .select('id').eq('customer_id', freshContact.customer_id).limit(1);
     if (existing?.length > 0) {
       console.log(`[FB] ⚠️  Đã có lead cho customer ${freshContact.customer_id}, sync lại lead_id.`);
       await supabase.from('facebook_contacts').update({ lead_id: existing[0].id }).eq('id', contact.id);
       return { id: existing[0].id };
     }
  }

  // Tìm/tạo customer
  let customerId = contact.customer_id;
  if (!customerId) {
    const customerData = {
      full_name: extraData.full_name || contact.fb_name || 'Facebook KH',
      phone: extraData.phone || contact.phone || '',
      email: extraData.email || contact.email || null,
      address: extraData.address || null,
      source: 'Facebook',
    };
    const { data: customer } = await supabase.from('customers')
      .insert(customerData).select().single();
    if (customer) {
      customerId = customer.id;
      await supabase.from('facebook_contacts').update({ customer_id: customer.id }).eq('id', contact.id);
      console.log(`[FB] ✅ Customer created: ${customer.full_name} (phone: ${customer.phone || 'N/A'})`);
    }
  } else {
    // Customer đã có → update thông tin mới nếu có
    const custUpd = {};
    if (extraData.phone) custUpd.phone = extraData.phone;
    if (extraData.address) custUpd.address = extraData.address;
    const fullName = extraData.full_name || contact.fb_name;
    if (fullName && fullName !== 'Facebook User') custUpd.full_name = fullName;
    if (Object.keys(custUpd).length) {
      await supabase.from('customers').update(custUpd).eq('id', customerId);
      console.log(`[FB] ✅ Customer updated:`, custUpd);
    }
  }

  // Tìm/tạo source riêng cho page Facebook: "[FB] Page Name"
  // Nếu page có default_source_id dùng luôn, còn không thì tìm/tạo "[FB] <page_name>"
  let resolvedSourceId = page.default_source_id || null;
  if (!resolvedSourceId && page.page_name) {
    const fbPageSourceName = `[FB] ${page.page_name}`;
    let { data: fbPageSource } = await supabase.from('crm_sources')
      .select('id').eq('name', fbPageSourceName).single();
    if (!fbPageSource) {
      // Tạo source mới cho page này
      const { data: created } = await supabase.from('crm_sources')
        .insert({ name: fbPageSourceName, is_active: true }).select('id').single();
      fbPageSource = created;
      console.log(`[FB] ✅ Created CRM source: "${fbPageSourceName}"`);
    }
    resolvedSourceId = fbPageSource?.id || null;
  }
  // Fallback: source generic "Facebook"
  if (!resolvedSourceId) {
    const { data: fbSource } = await supabase.from('crm_sources')
      .select('id').ilike('name', 'Facebook').single();
    resolvedSourceId = fbSource?.id || null;
  }

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
    source_id: resolvedSourceId,
    stage_id: stageId,
    company_id: companyId,
    install_address: extraData.address || null,
    description: `Nguồn: Facebook ${source}\nTên: ${extraData.full_name || contact.fb_name || ''}\nSĐT: ${extraData.phone || contact.phone || ''}\nĐịa chỉ: ${extraData.address || ''}`.trim(),
    lead_owner_id: page.default_lead_owner_id || page.created_by,
    assigned_to: page.default_lead_owner_id || page.created_by,
    created_by: page.created_by,
  };

  const { data: lead, error } = await supabase.from('crm_leads')
    .insert(leadData).select().single();
  
  if (error) { console.error('[FB] Create lead error:', error.message); return null; }

  // Link contact → lead
  await supabase.from('facebook_contacts').update({ lead_id: lead.id }).eq('id', contact.id);

  console.log(`[FB] Lead created: ${lead.code} — ${lead.title}`);

  // Notify lead owner only (không gửi cho tất cả admin)
  try {
    const ownerId = page?.default_lead_owner_id || page?.created_by;
    if (ownerId) {
      await supabase.from('notifications').insert({
        user_id: ownerId,
        type: 'lead_created',
        title: '📘 Lead mới từ Facebook',
        message: `${lead.title} — ${extraData.phone || contact.fb_name || ''}`,
        entity_type: 'crm_lead',
        entity_id: lead.id,
      });
      // Push via Socket.IO
      const pushFn = r._app?.get?.('pushNotification');
      if (pushFn) {
        pushFn(ownerId, { type: 'lead_created', title: '📘 Lead mới từ Facebook', message: lead.title, entity_type: 'crm_lead', entity_id: lead.id });
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

  // Ghi log vào DB
  if (body.object === 'page' && body.entry) {
    for (const entry of body.entry) {
      await supabase.from('facebook_webhook_logs').insert({
        page_id: entry.id,
        payload: entry,
        status: 'received'
      });
    }
  }

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

    // Check duplicate — Facebook có thể gửi webhook 2 lần (~30ms)
    // Layer 1: In-memory lock (chống race condition khi 2 request song song)
    if (msg.mid && !acquireMidLock(msg.mid)) {
      console.log(`[FB] ⏭️  In-memory lock: duplicate mid ${msg.mid}`);
      return;
    }
    // Layer 2: DB check
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

    // Save message — dùng upsert để tránh duplicate
    const insertData = {
      contact_id: contact.id,
      lead_id: contact.lead_id,
      fb_message_id: msg.mid,
      direction: isEcho ? 'outbound' : 'inbound',
      message_type: messageType,
      content,
      attachment_url: attachmentUrl,
      attachment_type: attachmentType,
      metadata: msg.attachments ? { attachments: msg.attachments } : null,
    };

    // Upsert: nếu fb_message_id đã tồn tại thì bỏ qua (onConflict ignore)
    const { data: savedMsg, error: insertErr } = await supabase.from('facebook_messages')
      .upsert(insertData, { onConflict: 'fb_message_id', ignoreDuplicates: true })
      .select().single();
    
    if (insertErr) {
      // Nếu lỗi unique constraint → duplicate, skip
      if (insertErr.code === '23505' || insertErr.message?.includes('duplicate')) {
        console.log(`[FB] ⏭️  Duplicate insert blocked: ${msg.mid}`);
        return;
      }
      console.error('[FB] Insert error:', insertErr.message);
    }
    
    if (!savedMsg) {
      console.log(`[FB] ⏭️  No row returned (duplicate upsert): ${msg.mid}`);
      return;
    }

    console.log(`[FB] ✅ Message saved: ${savedMsg?.id} (${isEcho ? 'outbound' : 'inbound'})`);

    if (!isEcho) {
      // Update last message + unread count + preview
      const preview = content ? content.substring(0, 100) : (attachments?.length ? '[Tệp đính kèm]' : '');
      await supabase.from('facebook_contacts').update({
        last_message_at: new Date().toISOString(),
        last_message_preview: preview,
        unread_count: (contact.unread_count || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', contact.id);

      // ── Extract phone & address từ tin nhắn TRƯỚC khi tạo lead ──
      let extractedPhone = null;
      let extractedAddress = null;
      if (content && content.length > 5) {
        const extracted = extractContactInfo(content);
        extractedPhone = extracted.phone;
        extractedAddress = extracted.address;
        if (extractedPhone || extractedAddress) {
          console.log(`[FB] 📞 Detected — phone: ${extractedPhone || 'N/A'}, address: ${extractedAddress || 'N/A'}`);
        }
      }

      // Auto-create lead nếu chưa có — theo cấu hình auto-lead-config
      const autoLeadCfg = getAutoLeadConfig();
      let isFirstMessage = false;
      if (!contact.lead_id) {
        // Check: có lead cũ đã bị xóa không?
        const { data: oldMsgs } = await supabase.from('facebook_messages')
          .select('lead_id').eq('contact_id', contact.id).not('lead_id', 'is', null).limit(1);
        const hadLeadBefore = oldMsgs?.length > 0;

        // Nếu lead bị xóa, check config cho phép tạo lại không
        if (hadLeadBefore && !autoLeadCfg.recreate_deleted_leads) {
          console.log(`[FB] ⏭️ Contact ${contact.id} had a lead before (deleted), config: no recreate`);
        } else {
          let shouldCreate = false;
          const reason = [];

          // Kiểm tra điều kiện tạo lead theo config
          switch (autoLeadCfg.trigger) {
            case 'first_message':
              // Tạo ngay khi có tin nhắn đầu tiên
              shouldCreate = true;
              reason.push('first_message trigger');
              break;

            case 'message_count': {
              // Tạo khi đủ X tin nhắn
              const threshold = autoLeadCfg.message_count_threshold || 2;
              const { count: msgCount } = await supabase.from('facebook_messages')
                .select('id', { count: 'exact', head: true })
                .eq('contact_id', contact.id)
                .eq('direction', 'inbound');
              if ((msgCount || 0) >= threshold) {
                shouldCreate = true;
                reason.push(`message_count: ${msgCount} >= ${threshold}`);
              } else {
                console.log(`[FB] ⏳ Contact ${contact.id}: ${msgCount}/${threshold} messages, waiting...`);
              }
              break;
            }

            case 'has_phone':
              // Chỉ tạo khi có SĐT
              if (extractedPhone || contact.phone) {
                shouldCreate = true;
                reason.push(`has_phone: ${extractedPhone || contact.phone}`);
              } else {
                console.log(`[FB] ⏳ Contact ${contact.id}: no phone yet, waiting...`);
              }
              break;

            case 'manual':
              // Không tự động tạo
              console.log(`[FB] ⏭️ Contact ${contact.id}: manual mode, skip auto-create`);
              break;

            default:
              shouldCreate = true;
              reason.push('default trigger');
          }

          if (shouldCreate) {
            const contactName = contact.fb_name || autoLeadCfg.default_customer_name || 'User';

            if (extractedPhone && !contact.phone) {
              await supabase.from('facebook_contacts').update({ phone: extractedPhone }).eq('id', contact.id);
              contact.phone = extractedPhone;
            }

            console.log(`[FB] 🆕 Creating lead: "${contactName}" (${reason.join(', ')})`);
            isFirstMessage = true;
            const lead = await createLeadFromFacebook(pageId, contact, 'Messenger', {
              full_name: contactName,
              phone: extractedPhone || contact.phone,
              address: extractedAddress,
              description: `Tin nhắn đầu tiên: ${content}`,
            });
            if (lead) {
              console.log(`[FB] ✅ Lead created: ${lead.code} — "${contactName}"`);
              contact.lead_id = lead.id;
              if (savedMsg) {
                await supabase.from('facebook_messages').update({ lead_id: lead.id }).eq('id', savedMsg.id);
              }

              // Fetch profile tên thật SAU khi đã tạo lead (background)
              if (autoLeadCfg.auto_update_name && (!contact.fb_name || contact.fb_name === autoLeadCfg.default_customer_name || contact.fb_name === 'User' || contact.fb_name === 'Facebook User')) {
                fetchProfileViaConversations(pageId, contact.psid || senderId).then(async (profile) => {
                  if (profile?.name && profile.name !== contactName) {
                    const upd = { fb_name: profile.name, updated_at: new Date().toISOString() };
                    if (profile.profilePic) upd.fb_profile_pic = profile.profilePic;
                    await supabase.from('facebook_contacts').update(upd).eq('id', contact.id);
                    await supabase.from('crm_leads').update({
                      title: `[FB] ${profile.name}`,
                      updated_at: new Date().toISOString(),
                    }).eq('id', lead.id);
                    if (lead.customer_id) {
                      await supabase.from('customers').update({
                        full_name: profile.name,
                        updated_at: new Date().toISOString(),
                      }).eq('id', lead.customer_id);
                    }
                    console.log(`[FB] 🔄 Background: name "${contactName}" → "${profile.name}"`);
                  }
                }).catch(e => console.warn('[FB] Background profile fetch:', e.message));
              }

              // Notification đã được gửi trong createLeadFromFacebook() — không cần gửi lại
            } else {
              console.log(`[FB] ❌ Failed to create lead`);
            }
          }
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
      if (isFirstMessage && autoLeadCfg.auto_reply_first_message) {
        const page = await getPageConfig(pageId);
        if (page?.auto_reply_message) {
          await sendMessengerReply(pageId, senderId, page.auto_reply_message);
        }
      }

      // ── Update lead/customer/contact khi có phone/address MỚI (theo config) ──
      if ((extractedPhone && autoLeadCfg.auto_update_phone) || (extractedAddress && autoLeadCfg.auto_update_address)) {
        // Update contact — luôn cập nhật phone mới
        const contactUpd = { updated_at: new Date().toISOString() };
        if (extractedPhone && extractedPhone !== contact.phone) {
          contactUpd.phone = extractedPhone;
          console.log(`[FB] 📞 Contact phone: ${contact.phone || 'N/A'} → ${extractedPhone}`);
        }
        if (Object.keys(contactUpd).length > 1) {
          await supabase.from('facebook_contacts').update(contactUpd).eq('id', contact.id);
        }

        if (contact.lead_id) {
          // Update lead — luôn ghi đè install_address mới nhất
          const leadUpd = { updated_at: new Date().toISOString() };
          if (extractedAddress) leadUpd.install_address = extractedAddress;
          if (extractedPhone) {
            // Cập nhật description với SĐT mới
            const { data: currentLead } = await supabase.from('crm_leads')
              .select('description').eq('id', contact.lead_id).single();
            if (currentLead?.description) {
              leadUpd.description = currentLead.description.replace(/SĐT:.*$/m, `SĐT: ${extractedPhone}`);
              if (extractedAddress) {
                leadUpd.description = leadUpd.description.replace(/Địa chỉ:.*$/m, `Địa chỉ: ${extractedAddress}`);
              }
            }
          }
          await supabase.from('crm_leads').update(leadUpd).eq('id', contact.lead_id);
          console.log(`[FB] ✅ Updated lead ${contact.lead_id}:`, { phone: extractedPhone, address: extractedAddress });

          // Update customer — cập nhật phone/address + tên nếu vẫn là 'User'
          const { data: lead } = await supabase.from('crm_leads')
            .select('customer_id, title').eq('id', contact.lead_id).single();
          if (lead?.customer_id) {
            const custUpd = { updated_at: new Date().toISOString() };
            if (extractedPhone) custUpd.phone = extractedPhone;
            if (extractedAddress) custUpd.address = extractedAddress;
            // Nếu customer tên vẫn là 'User' và contact đã có tên thật → cập nhật
            if (contact.fb_name && contact.fb_name !== 'User' && contact.fb_name !== 'Facebook User') {
              const { data: cust } = await supabase.from('customers')
                .select('full_name').eq('id', lead.customer_id).single();
              if (cust?.full_name === 'User' || cust?.full_name === 'Facebook KH' || cust?.full_name === 'Facebook User') {
                custUpd.full_name = contact.fb_name;
                // Cũng cập nhật lead title
                await supabase.from('crm_leads').update({
                  title: `[FB] ${contact.fb_name}`,
                  updated_at: new Date().toISOString(),
                }).eq('id', contact.lead_id);
                console.log(`[FB] 🔄 Updated customer + lead name: "User" → "${contact.fb_name}"`);
              }
            }
            await supabase.from('customers').update(custUpd).eq('id', lead.customer_id);
            console.log(`[FB] ✅ Updated customer ${lead.customer_id}: phone=${extractedPhone}, address=${extractedAddress}`);
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

  // Read receipts
  if (event.read) {
    await supabase.from('facebook_contacts').update({ unread_count: 0 }).eq('id', contact.id);
  }
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
    // Try with all columns first
    let { data, error } = await supabase.from('facebook_pages')
      .select('id, page_id, page_name, is_active, auto_create_lead, auto_reply_message, default_stage_id, default_lead_owner_id, default_company_id, created_at, webhook_verify_token')
      .order('created_at', { ascending: false });
    
    // Fallback: if column doesn't exist, retry without it
    if (error && (error.message?.includes('default_lead_owner_id') || error.code === '42703')) {
      ({ data, error } = await supabase.from('facebook_pages')
        .select('id, page_id, page_name, is_active, auto_create_lead, auto_reply_message, default_stage_id, default_company_id, created_at, webhook_verify_token')
        .order('created_at', { ascending: false }));
    }
    if (error && (error.message?.includes('default_company_id') || error.code === '42703')) {
      ({ data, error } = await supabase.from('facebook_pages')
        .select('id, page_id, page_name, is_active, auto_create_lead, auto_reply_message, default_stage_id, created_at, webhook_verify_token')
        .order('created_at', { ascending: false }));
    }
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/pages', authMiddleware, async (req, res) => {
  try {
    const { page_id, page_name, access_token, webhook_verify_token, auto_create_lead, auto_reply_message, default_source_id, default_stage_id, default_company_id, default_lead_owner_id } = req.body;
    const insertData = {
      page_id, page_name, access_token,
      webhook_verify_token: webhook_verify_token || 'tubep_pro_verify_2024',
      auto_create_lead: auto_create_lead !== false,
      auto_reply_message: auto_reply_message || null,
      default_source_id: default_source_id || null,
      default_stage_id: default_stage_id || null,
      created_by: req.user.userId,
    };
    if (default_company_id) insertData.default_company_id = default_company_id;
    if (default_lead_owner_id) insertData.default_lead_owner_id = default_lead_owner_id;

    let { data, error } = await supabase.from('facebook_pages').insert(insertData).select().single();
    // Retry without optional columns if they don't exist
    if (error?.message?.includes('default_company_id') || error?.message?.includes('default_lead_owner_id')) {
      delete insertData.default_company_id;
      delete insertData.default_lead_owner_id;
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
     'webhook_verify_token', 'default_source_id', 'default_stage_id', 'default_pipeline_id', 'default_company_id', 'default_lead_owner_id'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    update.updated_at = new Date().toISOString();
    let { data, error } = await supabase.from('facebook_pages').update(update).eq('id', req.params.id).select().single();
    if (error?.message?.includes('default_company_id') || error?.message?.includes('default_lead_owner_id')) {
      delete update.default_company_id;
      delete update.default_lead_owner_id;
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

    const { data } = await q.limit(200);
    
    // Thêm message_count cho mỗi contact (batch query)
    if (data?.length) {
      const contactIds = data.map(c => c.id);
      const { data: counts } = await supabase.from('facebook_messages')
        .select('contact_id')
        .in('contact_id', contactIds)
        .eq('direction', 'inbound');
      // Count per contact
      const countMap = {};
      (counts || []).forEach(m => { countMap[m.contact_id] = (countMap[m.contact_id] || 0) + 1; });
      data.forEach(c => { c.message_count = countMap[c.id] || 0; });
    }

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
    if (contact.lead_id) {
      // Verify lead còn tồn tại
      const { data: existLead } = await supabase.from('crm_leads').select('id').eq('id', contact.lead_id).single();
      if (existLead) return res.status(400).json({ error: 'Contact đã có Lead' });
      // Lead đã bị xóa → clear
      await supabase.from('facebook_contacts').update({ lead_id: null }).eq('id', contact.id);
    }

    // Lấy page config
    const { data: page } = await supabase.from('facebook_pages')
      .select('*').eq('page_id', contact.page_id).single();

    // Lấy stage "Mới" (default)
    let stageId = page?.default_stage_id || null;
    if (!stageId) {
      const { data: defaultStage } = await supabase.from('crm_pipeline_stages')
        .select('id').eq('pipeline_type', 'lead').order('order_index').limit(1).single();
      stageId = defaultStage?.id || null;
    }

    // Company
    let companyId = req.body.company_id || null;
    if (!companyId && page?.default_company_id) companyId = page.default_company_id;

    // Extract phone/address từ TẤT CẢ tin nhắn cũ
    let extractedPhone = contact.phone || null;
    let extractedAddress = null;
    const { data: messages } = await supabase.from('facebook_messages')
      .select('content').eq('contact_id', contact.id).eq('direction', 'inbound')
      .order('created_at', { ascending: false }).limit(50);
    
    for (const msg of (messages || [])) {
      if (msg.content) {
        const { phone, address } = extractContactInfo(msg.content);
        if (phone && !extractedPhone) extractedPhone = phone;
        if (address && !extractedAddress) extractedAddress = address;
        if (extractedPhone && extractedAddress) break;
      }
    }

    console.log(`[FB] Manual create lead — name: ${contact.fb_name}, phone: ${extractedPhone}, address: ${extractedAddress}`);

    // Tạo/lấy customer
    let customerId = contact.customer_id;
    if (!customerId) {
      const { data: customer } = await supabase.from('customers').insert({
        full_name: contact.fb_name || 'KH Facebook',
        phone: extractedPhone || '',
        address: extractedAddress,
        source: 'Facebook',
      }).select().single();
      if (customer) {
        customerId = customer.id;
        await supabase.from('facebook_contacts').update({ 
          customer_id: customer.id,
          phone: extractedPhone || contact.phone,
        }).eq('id', contact.id);
      }
    } else {
      // Update customer nếu có thông tin mới
      const custUpd = {};
      if (extractedPhone) custUpd.phone = extractedPhone;
      if (extractedAddress) custUpd.address = extractedAddress;
      if (Object.keys(custUpd).length) {
        await supabase.from('customers').update(custUpd).eq('id', customerId);
      }
    }

    // Source Facebook
    const { data: fbSource } = await supabase.from('crm_sources')
      .select('id').eq('name', 'Facebook').single();

    // Tạo lead code
    const { count } = await supabase.from('crm_leads')
      .select('id', { count: 'exact', head: true }).eq('type', 'lead');
    const code = `LEAD-${String((count || 0) + 1).padStart(4, '0')}`;

    const { data: lead, error } = await supabase.from('crm_leads').insert({
      code,
      title: `[FB] ${contact.fb_name || 'KH Facebook'}`,
      type: 'lead',
      customer_id: customerId,
      stage_id: stageId,
      company_id: companyId,
      source_id: page?.default_source_id || fbSource?.id || null,
      install_address: extractedAddress,
      description: `Từ Facebook Messenger\nTên: ${contact.fb_name || ''}\nSĐT: ${extractedPhone || ''}\nĐịa chỉ: ${extractedAddress || ''}`.trim(),
      lead_owner_id: req.user.userId,
      assigned_to: req.user.userId,
      created_by: req.user.userId,
    }).select('id, code, title').single();
    if (error) throw error;

    // Link contact → lead + messages
    await supabase.from('facebook_contacts').update({ lead_id: lead.id }).eq('id', contact.id);
    await supabase.from('facebook_messages').update({ lead_id: lead.id }).eq('contact_id', contact.id);

    console.log(`[FB] ✅ Manual lead created: ${lead.code} — ${lead.title}`);
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
      // Check duplicate (memory lock + DB check)
      const fbMsgId = msg.id;
      if (!acquireMidLock(fbMsgId)) continue;
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

    // ── Auto tạo lead nếu contact chưa có ──
    let leadCreated = null;
    if (!contact.lead_id && synced > 0) {
      // Extract phone/address từ messages vừa sync
      let extractedPhone = contact.phone || null;
      let extractedAddress = null;
      const { data: allMsgs } = await supabase.from('facebook_messages')
        .select('content').eq('contact_id', contact.id).eq('direction', 'inbound')
        .order('created_at', { ascending: false }).limit(50);
      
      for (const m of (allMsgs || [])) {
        if (m.content) {
          const { phone, address } = extractContactInfo(m.content);
          if (phone && !extractedPhone) extractedPhone = phone;
          if (address && !extractedAddress) extractedAddress = address;
          if (extractedPhone && extractedAddress) break;
        }
      }

      // Update contact phone
      if (extractedPhone && !contact.phone) {
        await supabase.from('facebook_contacts').update({ phone: extractedPhone }).eq('id', contact.id);
      }

      // Tạo lead
      const lead = await createLeadFromFacebook(contact.page_id, contact, 'Messenger (sync)', {
        full_name: contact.fb_name,
        phone: extractedPhone,
        address: extractedAddress,
      });
      if (lead) {
        leadCreated = lead;
        await supabase.from('facebook_messages').update({ lead_id: lead.id }).eq('contact_id', contact.id);
        console.log(`[FB Sync] ✅ Lead auto-created: ${lead.code} — ${contact.fb_name}`);
      }
    }

    res.json({
      synced,
      total: msgData.data.length,
      message: `Đã đồng bộ ${synced} tin nhắn mới` + (leadCreated ? ` + tạo Lead ${leadCreated.code}` : ''),
      lead: leadCreated ? { id: leadCreated.id, code: leadCreated.code, title: leadCreated.title } : null,
    });
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
    // Tìm contact linked to lead
    const { data: contact } = await supabase.from('facebook_contacts')
      .select('id, fb_name, fb_profile_pic, phone, psid, page_id')
      .eq('lead_id', req.params.leadId).limit(1).single();
    
    if (!contact) {
      // Fallback: tìm messages trực tiếp theo lead_id
      const { data } = await supabase.from('facebook_messages')
        .select('*, contact:facebook_contacts(id, fb_name, fb_profile_pic, phone, psid, page_id)')
        .eq('lead_id', req.params.leadId)
        .order('created_at', { ascending: true })
        .limit(200);
      return res.json(data || []);
    }

    // Lấy TẤT CẢ messages của contact (không chỉ theo lead_id)
    const { data } = await supabase.from('facebook_messages')
      .select('*')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: true })
      .limit(500);
    
    // Gắn contact info vào mỗi message
    const messages = (data || []).map(m => ({ ...m, contact }));
    res.json(messages);
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

    // Update last_message_at cho contact
    const outPreview = content ? content.substring(0, 100) : (attachment_url ? '[Tệp đính kèm]' : '');
    await supabase.from('facebook_contacts').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: outPreview ? `Bạn: ${outPreview}` : null,
    }).eq('id', contact.id);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /facebook/contacts/backfill-last-message — backfill last_message_at từ facebook_messages
r.post('/contacts/backfill-last-message', authMiddleware, async (req, res) => {
  try {
    const { data: msgs } = await supabase.from('facebook_messages')
      .select('contact_id, created_at').order('created_at', { ascending: false });
    const maxByContact = {};
    (msgs || []).forEach(m => {
      if (!maxByContact[m.contact_id] || m.created_at > maxByContact[m.contact_id])
        maxByContact[m.contact_id] = m.created_at;
    });
    const entries = Object.entries(maxByContact);
    let updated = 0;
    for (const [contactId, lastAt] of entries) {
      const { error } = await supabase.from('facebook_contacts')
        .update({ last_message_at: lastAt }).eq('id', contactId).is('last_message_at', null);
      if (!error) updated++;
    }
    console.log(`[FB Backfill] Updated ${updated} contacts with last_message_at`);
    res.json({ updated, total: entries.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
    const week = new Date(Date.now() - 7 * 86400000).toISOString();

    const [contacts, messages, leadAds, comments, unread, allContacts, pages] = await Promise.all([
      supabase.from('facebook_contacts').select('id', { count: 'exact', head: true }),
      supabase.from('facebook_messages').select('id', { count: 'exact', head: true }).eq('direction', 'inbound').gte('created_at', today),
      supabase.from('facebook_lead_ads').select('id', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('facebook_comments').select('id', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('facebook_contacts').select('unread_count, page_id').gt('unread_count', 0),
      supabase.from('facebook_contacts').select('id, page_id, created_at'),
      supabase.from('facebook_pages').select('page_id, page_name').eq('is_active', true),
    ]);

    // Tính số user mới theo page (7 ngày gần nhất)
    const contactsData = allContacts.data || [];
    const pagesData = pages.data || [];
    const newContactsByPage = {};
    const totalByPage = {};
    contactsData.forEach(c => {
      totalByPage[c.page_id] = (totalByPage[c.page_id] || 0) + 1;
      if (c.created_at >= week) {
        newContactsByPage[c.page_id] = (newContactsByPage[c.page_id] || 0) + 1;
      }
    });
    const unreadMap = {};
    const unreadData = unread.data || [];
    unreadData.forEach(c => {
      unreadMap[c.page_id] = (unreadMap[c.page_id] || 0) + (c.unread_count || 0);
    });
    
    const pageStats = pagesData.map(p => ({
      page_id: p.page_id,
      page_name: p.page_name,
      total_contacts: totalByPage[p.page_id] || 0,
      new_contacts_7d: newContactsByPage[p.page_id] || 0,
      unread_count: unreadMap[p.page_id] || 0,
    }));

    res.json({
      total_contacts: contacts.count || 0,
      messages_today: messages.count || 0,
      lead_ads_today: leadAds.count || 0,
      comments_today: comments.count || 0,
      total_unread: (unread.data || []).reduce((s, c) => s + c.unread_count, 0),
      page_stats: pageStats,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ANALYTICS — Phân tích hành vi khách hàng
// ═══════════════════════════════════════════════════════════════

r.get('/analytics', authMiddleware, async (req, res) => {
  try {
    const { page_id, days = 30 } = req.query;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    // 1. Contacts
    let contactQ = supabase.from('facebook_contacts').select('id, phone, lead_id, page_id, created_at');
    if (page_id) contactQ = contactQ.eq('page_id', page_id);
    const { data: allContacts } = await contactQ;
    const contacts = allContacts || [];

    const totalContacts = contacts.length;
    const hasPhone = contacts.filter(c => c.phone).length;
    const hasLead = contacts.filter(c => c.lead_id).length;

    // Deals
    const leadIds = contacts.filter(c => c.lead_id).map(c => c.lead_id);
    let dealCount = 0;
    if (leadIds.length) {
      const { count } = await supabase.from('crm_leads')
        .select('id', { count: 'exact', head: true })
        .in('id', leadIds).eq('type', 'deal');
      dealCount = count || 0;
    }

    // 2. Messages
    const pageContactIds = contacts.map(c => c.id);
    let msgQ = supabase.from('facebook_messages')
      .select('id, direction, created_at, contact_id')
      .gte('created_at', since).order('created_at');
    if (page_id && pageContactIds.length) msgQ = msgQ.in('contact_id', pageContactIds);
    const { data: msgs } = await (page_id && !pageContactIds.length ? Promise.resolve({ data: [] }) : msgQ);
    const messages = msgs || [];

    // By day + hour
    const byDay = {};
    const byHour = Array(24).fill(0);
    const inboundByHour = Array(24).fill(0);
    messages.forEach(m => {
      const d = new Date(m.created_at);
      const day = d.toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = { date: day, inbound: 0, outbound: 0, total: 0 };
      byDay[day][m.direction === 'inbound' ? 'inbound' : 'outbound']++;
      byDay[day].total++;
      const hour = d.getUTCHours();
      byHour[hour]++;
      if (m.direction === 'inbound') inboundByHour[hour]++;
    });

    // New contacts by day
    const newByDay = {};
    contacts.forEach(c => {
      const day = new Date(c.created_at).toISOString().split('T')[0];
      if (day >= since.split('T')[0]) { newByDay[day] = (newByDay[day] || 0) + 1; }
    });

    // Funnel
    const funnel = {
      total_contacts: totalContacts,
      has_phone: hasPhone, has_lead: hasLead, has_deal: dealCount,
      phone_rate: totalContacts ? Math.round(hasPhone / totalContacts * 100) : 0,
      lead_rate: totalContacts ? Math.round(hasLead / totalContacts * 100) : 0,
      deal_rate: hasLead ? Math.round(dealCount / hasLead * 100) : 0,
      overall_rate: totalContacts ? Math.round(dealCount / totalContacts * 100) : 0,
    };

    // Page breakdown
    const { data: pages } = await supabase.from('facebook_pages').select('page_id, page_name');
    const pageMap = {};
    (pages || []).forEach(p => { pageMap[p.page_id] = p.page_name; });
    const pageBk = {};
    contacts.forEach(c => {
      if (!pageBk[c.page_id]) pageBk[c.page_id] = { page_id: c.page_id, page_name: pageMap[c.page_id] || c.page_id, contacts: 0, has_phone: 0, has_lead: 0 };
      pageBk[c.page_id].contacts++;
      if (c.phone) pageBk[c.page_id].has_phone++;
      if (c.lead_id) pageBk[c.page_id].has_lead++;
    });

    // Avg response time
    let totalRT = 0, rtCount = 0;
    const byC = {};
    messages.forEach(m => { if (!byC[m.contact_id]) byC[m.contact_id] = []; byC[m.contact_id].push(m); });
    Object.values(byC).forEach(cm => {
      for (let i = 0; i < cm.length - 1; i++) {
        if (cm[i].direction === 'inbound' && cm[i + 1].direction === 'outbound') {
          const diff = new Date(cm[i + 1].created_at) - new Date(cm[i].created_at);
          if (diff > 0 && diff < 86400000) { totalRT += diff; rtCount++; }
        }
      }
    });

    res.json({
      totalContacts, hasPhone, hasLead, dealCount,
      totalMessages: messages.length,
      inboundMessages: messages.filter(m => m.direction === 'inbound').length,
      outboundMessages: messages.filter(m => m.direction === 'outbound').length,
      messagesByDay: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
      messagesByHour: byHour.map((t, h) => ({ hour: `${String(h).padStart(2, '0')}:00`, total: t, inbound: inboundByHour[h] })),
      newContactsByDay: newByDay,
      conversionFunnel: funnel,
      pageBreakdown: Object.values(pageBk),
      avgResponseTime: rtCount ? Math.round(totalRT / rtCount / 60000) : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// BATCH: Tạo lead cho TẤT CẢ contacts chưa có lead + Extract SĐT
// POST /facebook/dedup-leads — Kiểm tra và xóa lead trùng không liên kết FB
r.post('/dedup-leads', authMiddleware, async (req, res) => {
  try {
    // 1. Lấy danh sách lead_id đang liên kết với facebook_contacts
    const { data: fbContacts } = await supabase.from('facebook_contacts')
      .select('lead_id, fb_name').not('lead_id', 'is', null);
    const linkedLeadIds = new Set((fbContacts || []).map(c => c.lead_id));

    // 2. Lấy tất cả leads loại lead (không phải deal)
    const { data: allLeads } = await supabase.from('crm_leads')
      .select('id, customer_id, title, contact_name, phone, type, created_at')
      .order('created_at', { ascending: true });
    
    if (!allLeads?.length) return res.json({ deleted: 0, scanned: 0, message: 'Không có lead nào' });

    // 3. Group leads theo customer_id
    const byCustomer = {};
    (allLeads || []).forEach(lead => {
      const key = lead.customer_id;
      if (!key) return;
      if (!byCustomer[key]) byCustomer[key] = [];
      byCustomer[key].push(lead);
    });

    // 4. Tìm lead trùng: giữ lead linked với FB, xóa lead không linked
    const toDelete = [];
    const details = [];
    
    Object.entries(byCustomer).forEach(([custId, leads]) => {
      if (leads.length <= 1) return; // Không trùng
      
      const linked = leads.filter(l => linkedLeadIds.has(l.id));
      const unlinked = leads.filter(l => !linkedLeadIds.has(l.id));
      
      if (linked.length > 0 && unlinked.length > 0) {
        // Có lead liên kết FB và có lead không liên kết → xóa lead không liên kết
        unlinked.forEach(l => {
          toDelete.push(l.id);
          details.push({ id: l.id, title: l.title, reason: 'Trùng customer, không liên kết FB' });
        });
      }
    });

    // 5. Xóa leads trùng
    if (toDelete.length > 0) {
      // Xóa từng batch 50 để tránh query quá lớn
      for (let i = 0; i < toDelete.length; i += 50) {
        const batch = toDelete.slice(i, i + 50);
        await supabase.from('crm_leads').delete().in('id', batch);
      }
    }

    res.json({
      deleted: toDelete.length,
      scanned: allLeads.length,
      duplicateGroups: Object.values(byCustomer).filter(g => g.length > 1).length,
      details: details.slice(0, 50), // Giới hạn 50 chi tiết
      message: toDelete.length > 0
        ? `Đã xóa ${toDelete.length} lead trùng không liên kết Facebook`
        : 'Không có lead trùng cần xóa',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /facebook/batch-create-leads
// ═══════════════════════════════════════════════════════════════

r.post('/batch-create-leads', authMiddleware, async (req, res) => {
  try {
    // Lấy tất cả contacts chưa có lead
    const { data: contacts } = await supabase.from('facebook_contacts')
      .select('*').is('lead_id', null).order('created_at');
    
    if (!contacts?.length) return res.json({ created: 0, updated: 0, message: 'Không có contact nào cần xử lý' });

    let created = 0, updated = 0, skipped = 0;
    const results = [];

    for (const contact of contacts) {
      try {
        // Verify lead chưa có (double check)
        if (contact.lead_id) { skipped++; continue; }

        // Lấy page config
        const page = await getPageConfig(contact.page_id);
        if (!page || !page.is_active) {
          results.push({ contact: contact.fb_name, status: 'skipped', reason: 'Page không active' });
          skipped++;
          continue;
        }

        // Extract phone/address từ TẤT CẢ tin nhắn inbound
        let extractedPhone = contact.phone || null;
        let extractedAddress = null;

        const { data: messages } = await supabase.from('facebook_messages')
          .select('content').eq('contact_id', contact.id).eq('direction', 'inbound')
          .order('created_at', { ascending: false }).limit(50);
        
        for (const msg of (messages || [])) {
          if (msg.content) {
            const { phone, address } = extractContactInfo(msg.content);
            if (phone && !extractedPhone) extractedPhone = phone;
            if (address && !extractedAddress) extractedAddress = address;
            if (extractedPhone && extractedAddress) break;
          }
        }

        // Cập nhật phone vào contact nếu tìm được
        if (extractedPhone && !contact.phone) {
          await supabase.from('facebook_contacts').update({
            phone: extractedPhone,
            updated_at: new Date().toISOString(),
          }).eq('id', contact.id);
          updated++;
        }

        // Tạo lead
        const lead = await createLeadFromFacebook(contact.page_id, contact, 'Messenger (batch)', {
          full_name: contact.fb_name,
          phone: extractedPhone,
          address: extractedAddress,
        });

        if (lead) {
          // Link messages → lead
          await supabase.from('facebook_messages')
            .update({ lead_id: lead.id }).eq('contact_id', contact.id);
          
          created++;
          results.push({
            contact: contact.fb_name,
            phone: extractedPhone || null,
            lead_code: lead.code,
            status: 'created',
          });
          console.log(`[FB Batch] ✅ Lead ${lead.code} — ${contact.fb_name} (phone: ${extractedPhone || 'N/A'})`);
        } else {
          results.push({ contact: contact.fb_name, status: 'failed', reason: 'createLeadFromFacebook returned null' });
          skipped++;
        }
      } catch (e) {
        results.push({ contact: contact.fb_name, status: 'error', reason: e.message });
        skipped++;
        console.error(`[FB Batch] ❌ ${contact.fb_name}:`, e.message);
      }
    }

    console.log(`[FB Batch] Done: created=${created}, updated=${updated}, skipped=${skipped}`);
    res.json({
      total: contacts.length,
      created,
      phone_updated: updated,
      skipped,
      results,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// BATCH: Extract SĐT từ tin nhắn cho contacts ĐÃ CÓ lead nhưng thiếu phone
// POST /facebook/batch-extract-phones
// ═══════════════════════════════════════════════════════════════

r.post('/batch-extract-phones', authMiddleware, async (req, res) => {
  try {
    // Contacts có lead nhưng phone = null
    const { data: contacts } = await supabase.from('facebook_contacts')
      .select('*').not('lead_id', 'is', null).is('phone', null);
    
    if (!contacts?.length) return res.json({ updated: 0, message: 'Không có contact nào thiếu SĐT' });

    let updated = 0;
    const results = [];

    for (const contact of contacts) {
      // Quét tất cả tin nhắn inbound
      const { data: messages } = await supabase.from('facebook_messages')
        .select('content').eq('contact_id', contact.id).eq('direction', 'inbound')
        .order('created_at', { ascending: false }).limit(50);
      
      let extractedPhone = null;
      let extractedAddress = null;
      
      for (const msg of (messages || [])) {
        if (msg.content) {
          const { phone, address } = extractContactInfo(msg.content);
          if (phone && !extractedPhone) extractedPhone = phone;
          if (address && !extractedAddress) extractedAddress = address;
          if (extractedPhone && extractedAddress) break;
        }
      }

      if (extractedPhone) {
        // Update contact
        await supabase.from('facebook_contacts').update({
          phone: extractedPhone,
          updated_at: new Date().toISOString(),
        }).eq('id', contact.id);

        // Update customer
        if (contact.customer_id) {
          await supabase.from('customers').update({
            phone: extractedPhone,
            address: extractedAddress || undefined,
          }).eq('id', contact.customer_id);
        } else {
          // Tìm customer qua lead
          const { data: lead } = await supabase.from('crm_leads')
            .select('customer_id').eq('id', contact.lead_id).single();
          if (lead?.customer_id) {
            await supabase.from('customers').update({
              phone: extractedPhone,
              address: extractedAddress || undefined,
            }).eq('id', lead.customer_id);
          }
        }

        // Update lead description
        if (contact.lead_id) {
          const { data: lead } = await supabase.from('crm_leads')
            .select('description').eq('id', contact.lead_id).single();
          const leadUpd = { updated_at: new Date().toISOString() };
          if (extractedAddress) leadUpd.install_address = extractedAddress;
          if (lead?.description) {
            leadUpd.description = lead.description.replace(/SĐT:.*$/m, `SĐT: ${extractedPhone}`);
            if (extractedAddress) {
              leadUpd.description = leadUpd.description.replace(/Địa chỉ:.*$/m, `Địa chỉ: ${extractedAddress}`);
            }
          }
          await supabase.from('crm_leads').update(leadUpd).eq('id', contact.lead_id);
        }

        updated++;
        results.push({
          contact: contact.fb_name,
          phone: extractedPhone,
          address: extractedAddress,
          status: 'updated',
        });
        console.log(`[FB Extract] ✅ ${contact.fb_name}: phone=${extractedPhone}`);
      } else {
        results.push({ contact: contact.fb_name, status: 'no_phone_found' });
      }
    }

    res.json({ total: contacts.length, updated, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// AUTO-LEAD CONFIG — Điều kiện tự động tạo Lead
// ═══════════════════════════════════════════════════════════════

const { getConfig: getAutoLeadConfig, saveConfig: saveAutoLeadConfig, DEFAULT_CONFIG: AUTO_LEAD_DEFAULTS } = require('../config/autoLeadConfig');

// GET /facebook/auto-lead-config
r.get('/auto-lead-config', authMiddleware, async (req, res) => {
  try {
    const config = getAutoLeadConfig();
    res.json(config);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /facebook/auto-lead-config
r.put('/auto-lead-config', authMiddleware, async (req, res) => {
  try {
    const saved = saveAutoLeadConfig(req.body);
    console.log('[AutoLead] ✅ Config updated:', JSON.stringify(saved));
    res.json(saved);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /facebook/auto-lead-config/defaults
r.get('/auto-lead-config/defaults', authMiddleware, (req, res) => {
  res.json(AUTO_LEAD_DEFAULTS);
});

// ═══════════════════════════════════════════════════════════════
// SCHEDULED LEAD SCAN — Quét contacts có SĐT → tạo lead tự động
// ═══════════════════════════════════════════════════════════════

let scanTimer = null;
let scanConfig = { enabled: false, interval_minutes: 60 };
const SCAN_CONFIG_FILE = require('path').join(__dirname, '..', '..', 'lead-scan-config.json');

function loadScanConfig() {
  try {
    if (require('fs').existsSync(SCAN_CONFIG_FILE)) {
      const raw = require('fs').readFileSync(SCAN_CONFIG_FILE, 'utf8');
      scanConfig = { enabled: false, interval_minutes: 60, ...JSON.parse(raw) };
    }
  } catch (e) { console.warn('[LeadScan] Config load error:', e.message); }
  return scanConfig;
}
function saveScanConfig(cfg) {
  scanConfig = { ...scanConfig, ...cfg };
  require('fs').writeFileSync(SCAN_CONFIG_FILE, JSON.stringify(scanConfig, null, 2), 'utf8');
  return scanConfig;
}

/**
 * scanAndCreateLeads — Quét facebook_contacts có SĐT nhưng chưa có lead → tạo lead
 * Chạy theo lịch hoặc gọi thủ công
 */
async function scanAndCreateLeads() {
  console.log('[LeadScan] 🔍 Starting scan...');
  const results = { scanned: 0, created: 0, skipped: 0, errors: [], leads: [] };

  try {
    const autoLeadCfg = getAutoLeadConfig();

    // Lấy tất cả contacts có phone, chưa có lead
    const { data: contacts, error } = await supabase.from('facebook_contacts')
      .select('*')
      .not('phone', 'is', null).neq('phone', '')
      .is('lead_id', null)
      .order('updated_at', { ascending: false });

    if (error) { results.errors.push(error.message); return results; }
    results.scanned = (contacts || []).length;
    console.log(`[LeadScan] Found ${results.scanned} contacts with phone, no lead`);

    for (const contact of (contacts || [])) {
      try {
        // Kiểm tra lead cũ bị xóa
        if (!autoLeadCfg.recreate_deleted_leads) {
          const { data: oldLead } = await supabase.from('crm_leads')
            .select('id').eq('customer_id', contact.customer_id).limit(1).single();
          if (oldLead) {
            results.skipped++;
            continue;
          }
        }

        const lead = await createLeadFromFacebook(contact.page_id, contact, 'Scan (SĐT)', {
          phone: contact.phone,
          full_name: contact.fb_name || 'KH Facebook',
        });

        if (lead && lead.code !== 'EXISTING') {
          results.created++;
          results.leads.push({ name: contact.fb_name, phone: contact.phone, code: lead.code, page_id: contact.page_id });
          console.log(`[LeadScan] ✅ Lead created: ${lead.code} — ${contact.fb_name} — ${contact.phone}`);
        } else {
          results.skipped++;
        }
      } catch (e) {
        results.errors.push(`${contact.fb_name}: ${e.message}`);
      }
    }
  } catch (e) {
    results.errors.push(e.message);
  }

  console.log(`[LeadScan] ✅ Done — Scanned: ${results.scanned}, Created: ${results.created}, Skipped: ${results.skipped}`);
  return results;
}

function startScanTimer() {
  if (scanTimer) clearInterval(scanTimer);
  if (!scanConfig.enabled || !scanConfig.interval_minutes) return;
  const ms = scanConfig.interval_minutes * 60 * 1000;
  console.log(`[LeadScan] ⏰ Timer started — every ${scanConfig.interval_minutes} minutes`);
  scanTimer = setInterval(() => scanAndCreateLeads(), ms);
}

function stopScanTimer() {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  console.log('[LeadScan] ⏹️ Timer stopped');
}

// Auto-start on load
loadScanConfig();
if (scanConfig.enabled) startScanTimer();

// GET /facebook/lead-scan/config — xem cấu hình
r.get('/lead-scan/config', authMiddleware, (req, res) => {
  res.json({ ...scanConfig, timer_active: !!scanTimer });
});

// PUT /facebook/lead-scan/config — cập nhật cấu hình
r.put('/lead-scan/config', authMiddleware, (req, res) => {
  try {
    const { enabled, interval_minutes } = req.body;
    const cfg = saveScanConfig({
      ...(enabled !== undefined && { enabled }),
      ...(interval_minutes && { interval_minutes: Math.max(5, parseInt(interval_minutes) || 60) }),
    });
    // Restart timer
    stopScanTimer();
    if (cfg.enabled) startScanTimer();
    res.json({ ...cfg, timer_active: !!scanTimer });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /facebook/lead-scan/run — chạy quét thủ công
r.post('/lead-scan/run', authMiddleware, async (req, res) => {
  try {
    const results = await scanAndCreateLeads();
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /facebook/lead-scan/preview — xem trước contacts sẽ được tạo lead
r.get('/lead-scan/preview', authMiddleware, async (req, res) => {
  try {
    const { data: contacts } = await supabase.from('facebook_contacts')
      .select('id, fb_name, phone, page_id, updated_at, message_count')
      .not('phone', 'is', null).neq('phone', '')
      .is('lead_id', null)
      .order('updated_at', { ascending: false });

    // Enrich with page names
    const pageIds = [...new Set((contacts || []).map(c => c.page_id))];
    const { data: pages } = await supabase.from('facebook_pages')
      .select('page_id, page_name').in('page_id', pageIds);
    const pageMap = Object.fromEntries((pages || []).map(p => [p.page_id, p.page_name]));

    res.json({
      count: (contacts || []).length,
      contacts: (contacts || []).map(c => ({
        ...c,
        page_name: pageMap[c.page_id] || c.page_id,
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Refresh tên cho các contact đang bị "Facebook User" ──
r.post('/refresh-names', authMiddleware, async (req, res) => {
  try {
    const { data: stuckContacts } = await supabase.from('facebook_contacts')
      .select('id, page_id, psid, fb_name, lead_id')
      .or('fb_name.eq.Facebook User,fb_name.is.null')
      .limit(50);
    if (!stuckContacts?.length) return res.json({ updated: 0, message: 'Không có contact nào cần cập nhật' });

    let updated = 0;
    for (const c of stuckContacts) {
      const profile = await fetchProfileViaConversations(c.page_id, c.psid);
      if (profile?.name && profile.name !== 'Facebook User') {
        const upd = { fb_name: profile.name, updated_at: new Date().toISOString() };
        if (profile.profilePic) upd.fb_profile_pic = profile.profilePic;
        await supabase.from('facebook_contacts').update(upd).eq('id', c.id);

        if (c.lead_id) {
          await supabase.from('crm_leads')
            .update({ title: `[FB] ${profile.name}`, updated_at: new Date().toISOString() })
            .eq('id', c.lead_id).or('title.ilike.%Facebook User%,title.ilike.%[FB] User%');
          const { data: leadData } = await supabase.from('crm_leads')
            .select('customer_id').eq('id', c.lead_id).single();
          if (leadData?.customer_id) {
            await supabase.from('customers')
              .update({ full_name: profile.name, updated_at: new Date().toISOString() })
              .eq('id', leadData.customer_id).ilike('full_name', '%Facebook%');
          }
        }
        updated++;
        console.log(`[FB Refresh] ${c.psid}: "${c.fb_name}" → "${profile.name}"`);
      }
    }
    res.json({ updated, total: stuckContacts.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/webhook-logs', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase.from('facebook_webhook_logs')
      .select('*')
      .order('processed_at', { ascending: false })
      .limit(50);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
