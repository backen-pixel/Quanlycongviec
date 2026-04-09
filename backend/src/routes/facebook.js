const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const r = express.Router();
const { supabase } = require('../config/supabase');

// ═══════════════════════════════════════════════════════════════
// AUTO PIPELINE STATE (backend-managed, realtime)
// ═══════════════════════════════════════════════════════════════
const AUTO_BATCH_SIZE = 300;
const AUTO_SYNC_TIMEOUT_SEC = 90;
const AUTO_LOOP_PAUSE_MS = 1500;

const autoPipeline = {
  enabled: false,
  running: false,
  stopRequested: false,
  phase: 'idle',
  step: -1,
  totalSteps: 3,
  stepLabel: null,
  cycleCount: 0,
  batchIndex: 0,
  totalBatches: 0,
  totalContacts: 0,
  batchOffset: 0,
  lastUpdatedAt: null,
  logs: [],
  // Per-batch results + accumulated KPIs
  batchResults: [],
  kpi: { messagesSynced: 0, contactsProcessed: 0, contactPhones: 0, customerPhones: 0, leadPhones: 0, errors: 0 },
  startedAt: null,
};

function pushAutoLog(text, status = 'info') {
  autoPipeline.logs = [...autoPipeline.logs.slice(-199), { text, status, ts: Date.now() }];
  autoPipeline.lastUpdatedAt = new Date().toISOString();
  emitAutoState();
}

function getAutoState() {
  return {
    enabled: autoPipeline.enabled,
    running: autoPipeline.running,
    phase: autoPipeline.phase,
    step: autoPipeline.step,
    totalSteps: autoPipeline.totalSteps,
    stepLabel: autoPipeline.stepLabel,
    cycleCount: autoPipeline.cycleCount,
    batchIndex: autoPipeline.batchIndex,
    totalBatches: autoPipeline.totalBatches,
    totalContacts: autoPipeline.totalContacts,
    batchOffset: autoPipeline.batchOffset,
    lastUpdatedAt: autoPipeline.lastUpdatedAt,
    logs: autoPipeline.logs,
    batchResults: autoPipeline.batchResults,
    kpi: autoPipeline.kpi,
    startedAt: autoPipeline.startedAt,
  };
}

function emitAutoState() {
  if (r._ioRef) r._ioRef.emit('auto_pipeline_state', getAutoState());
}

function getInternalAutoHeaders() {
  const token = jwt.sign({ userId: 'auto-pipeline', role: 'system', fullName: 'Auto Pipeline' }, config.jwtSecret, { expiresIn: '1h' });
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-auto-pipeline-internal': '1',
  };
}

async function runAutoPipelineLoop() {
  if (autoPipeline.running) return;
  autoPipeline.running = true;
  autoPipeline.stopRequested = false;
  autoPipeline.phase = 'loop';
  autoPipeline.lastUpdatedAt = new Date().toISOString();
  autoPipeline.startedAt = new Date().toISOString();
  autoPipeline.batchResults = [];
  autoPipeline.kpi = { messagesSynced: 0, contactsProcessed: 0, contactPhones: 0, customerPhones: 0, leadPhones: 0, errors: 0 };
  pushAutoLog('🚀 Bắt đầu auto pipeline realtime ở backend');

  while (autoPipeline.enabled && !autoPipeline.stopRequested) {
    autoPipeline.cycleCount += 1;
    autoPipeline.batchOffset = 0;
    autoPipeline.batchIndex = 0;
    autoPipeline.totalBatches = 0;
    autoPipeline.totalContacts = 0;
    autoPipeline.phase = 'loop';
    pushAutoLog(`🔄 Chu kỳ ${autoPipeline.cycleCount} bắt đầu`);

    let done = false;
    while (!done && autoPipeline.enabled && !autoPipeline.stopRequested) {
      autoPipeline.batchIndex += 1;

      autoPipeline.step = 0;
      autoPipeline.stepLabel = `📨 Đồng bộ tin nhắn • Batch ${autoPipeline.batchIndex}`;
      emitAutoState();

      let syncData = null;
      try {
        const resp = await fetch(`http://127.0.0.1:${config.port}/api/facebook/batch-sync-messages`, {
          method: 'POST',
          headers: getInternalAutoHeaders(),
          body: JSON.stringify({ mode: 'all', offset: autoPipeline.batchOffset, limit: AUTO_BATCH_SIZE, timeout: AUTO_SYNC_TIMEOUT_SEC }),
        });
        syncData = await resp.json();
        console.log('[AutoPipeline] sync response', { status: resp.status, batch: autoPipeline.batchIndex, total: syncData?.total, processed: syncData?.processedCount, nextOffset: syncData?.nextOffset, done: syncData?.done, error: syncData?.error });
        if (!resp.ok) throw new Error(syncData?.error || `HTTP ${resp.status}`);
      } catch (e) {
        console.error('[AutoPipeline] sync error', e);
        pushAutoLog(`❌ Batch ${autoPipeline.batchIndex}: lỗi sync — ${e.message}`, 'error');
        break;
      }

      if (!syncData || syncData.error) {
        console.error('[AutoPipeline] invalid sync payload', syncData);
        pushAutoLog(`❌ Batch ${autoPipeline.batchIndex}: sync payload lỗi — ${syncData?.error || 'empty payload'}`, 'error');
        break;
      }

      autoPipeline.totalContacts = syncData.total || autoPipeline.totalContacts;
      autoPipeline.totalBatches = autoPipeline.totalContacts > 0 ? Math.ceil(autoPipeline.totalContacts / AUTO_BATCH_SIZE) : 0;
      const batchMsgsSynced = syncData.totalSynced || 0;
      const batchProcessed = syncData.processedCount || 0;
      pushAutoLog(`✅ Batch ${autoPipeline.batchIndex}: sync ${batchProcessed} contacts, +${batchMsgsSynced} tin nhắn`, 'ok');
      emitAutoState();

      // Track per-batch result (sync step)
      const batchEntry = {
        batch: autoPipeline.batchIndex,
        cycle: autoPipeline.cycleCount,
        ts: Date.now(),
        contactsProcessed: batchProcessed,
        messagesSynced: batchMsgsSynced,
        contactPhones: 0,
        customerPhones: 0,
        leadPhones: 0,
        status: 'synced',
      };

      autoPipeline.step = 1;
      autoPipeline.stepLabel = `📞 Quét SĐT & thông tin • Batch ${autoPipeline.batchIndex}`;
      emitAutoState();
      try {
        const resp = await fetch(`http://127.0.0.1:${config.port}/api/facebook/batch-extract-phones`, {
          method: 'POST',
          headers: getInternalAutoHeaders(),
          body: JSON.stringify({ offset: autoPipeline.batchOffset, limit: AUTO_BATCH_SIZE }),
        });
        const data = await resp.json();
        console.log('[AutoPipeline] extract response', { status: resp.status, batch: autoPipeline.batchIndex, total: data?.total, updated: data?.updated, leadsUpdatedPhone: data?.leadsUpdatedPhone, error: data?.error });
        if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
        batchEntry.contactPhones = data.updatedContactPhone || 0;
        batchEntry.customerPhones = data.updatedCustomerPhone || 0;
        batchEntry.leadPhones = data.leadsUpdatedPhone || 0;
        batchEntry.status = 'done';
        pushAutoLog(`✅ Batch ${autoPipeline.batchIndex}: contact=${batchEntry.contactPhones}, customer=${batchEntry.customerPhones}, lead=${batchEntry.leadPhones}`, 'ok');
      } catch (e) {
        console.error('[AutoPipeline] extract error', e);
        batchEntry.status = 'error';
        batchEntry.error = e.message;
        autoPipeline.kpi.errors += 1;
        pushAutoLog(`❌ Batch ${autoPipeline.batchIndex}: lỗi quét SĐT — ${e.message}`, 'error');
      }

      // Save batch result + accumulate KPIs
      autoPipeline.batchResults = [...autoPipeline.batchResults.slice(-99), batchEntry];
      autoPipeline.kpi.messagesSynced += batchEntry.messagesSynced;
      autoPipeline.kpi.contactsProcessed += batchEntry.contactsProcessed;
      autoPipeline.kpi.contactPhones += batchEntry.contactPhones;
      autoPipeline.kpi.customerPhones += batchEntry.customerPhones;
      autoPipeline.kpi.leadPhones += batchEntry.leadPhones;

      done = syncData.done === true || !syncData.nextOffset;
      if (done) {
        autoPipeline.batchOffset = 0;
        autoPipeline.batchIndex = autoPipeline.totalBatches || autoPipeline.batchIndex;
        pushAutoLog(`🏁 Chu kỳ ${autoPipeline.cycleCount} hoàn tất batch loop: ${autoPipeline.totalContacts || 0} contacts`, 'ok');
      } else {
        autoPipeline.batchOffset = syncData.nextOffset || (autoPipeline.batchOffset + AUTO_BATCH_SIZE);
        pushAutoLog(`⏭️ Chuyển batch tiếp theo: offset ${autoPipeline.batchOffset}`);
      }
      emitAutoState();
    }

    if (!autoPipeline.enabled || autoPipeline.stopRequested) break;

    autoPipeline.phase = 'manual_full_scan';
    autoPipeline.step = 2;
    autoPipeline.stepLabel = '📞 Quét SĐT toàn bộ (logic thủ công)';
    emitAutoState();
    const fullScanEntry = { batch: 'full', cycle: autoPipeline.cycleCount, ts: Date.now(), contactsProcessed: 0, messagesSynced: 0, contactPhones: 0, customerPhones: 0, leadPhones: 0, status: 'running' };
    try {
      const resp = await fetch(`http://127.0.0.1:${config.port}/api/facebook/batch-extract-phones`, {
        method: 'POST',
        headers: getInternalAutoHeaders(),
        body: JSON.stringify({}),
      });
      const data = await resp.json();
      console.log('[AutoPipeline] full scan response', { status: resp.status, total: data?.total, updated: data?.updated, leadsUpdatedPhone: data?.leadsUpdatedPhone, error: data?.error });
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
      fullScanEntry.contactPhones = data.updatedContactPhone || 0;
      fullScanEntry.customerPhones = data.updatedCustomerPhone || 0;
      fullScanEntry.leadPhones = data.leadsUpdatedPhone || 0;
      fullScanEntry.contactsProcessed = data.total || 0;
      fullScanEntry.status = 'done';
      autoPipeline.kpi.contactPhones += fullScanEntry.contactPhones;
      autoPipeline.kpi.customerPhones += fullScanEntry.customerPhones;
      autoPipeline.kpi.leadPhones += fullScanEntry.leadPhones;
      pushAutoLog(`✅ Full scan cuối chu kỳ: contact=${fullScanEntry.contactPhones}, customer=${fullScanEntry.customerPhones}, lead=${fullScanEntry.leadPhones}`, 'ok');
    } catch (e) {
      console.error('[AutoPipeline] full scan error', e);
      fullScanEntry.status = 'error';
      fullScanEntry.error = e.message;
      autoPipeline.kpi.errors += 1;
      pushAutoLog(`❌ Full scan cuối chu kỳ: ${e.message}`, 'error');
    }
    autoPipeline.batchResults = [...autoPipeline.batchResults.slice(-99), fullScanEntry];

    if (!autoPipeline.enabled || autoPipeline.stopRequested) break;
    pushAutoLog(`♻️ Quay lại từ đầu sau chu kỳ ${autoPipeline.cycleCount}...`);
    await new Promise(resolve => setTimeout(resolve, AUTO_LOOP_PAUSE_MS));
  }

  autoPipeline.running = false;
  autoPipeline.enabled = false;
  autoPipeline.stopRequested = false;
  autoPipeline.phase = 'idle';
  autoPipeline.step = -1;
  autoPipeline.stepLabel = null;
  pushAutoLog('⏹️ Auto pipeline đã dừng');
  emitAutoState();
}

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

const _pageConfigCache = {}; // pageId → { data, ts }
async function getPageConfig(pageId) {
  const cached = _pageConfigCache[pageId];
  if (cached && Date.now() - cached.ts < 60000) return cached.data; // cache 60s
  const { data } = await supabase.from('facebook_pages')
    .select('*').eq('page_id', pageId).eq('is_active', true).single();
  _pageConfigCache[pageId] = { data, ts: Date.now() };
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
    }
  }

  // Tạo contact mới
  const { data: newContact, error } = await supabase.from('facebook_contacts')
    .insert({ page_id: pageId, psid, fb_name: name || 'Facebook User', fb_profile_pic: profilePic })
    .select().single();
  if (error) {
    // Race condition: contact đã được tạo bởi request khác → select lại
    if (error.message.includes('duplicate key') || error.code === '23505') {
      const { data: existing } = await supabase.from('facebook_contacts')
        .select('*').eq('page_id', pageId).eq('psid', psid).single();
      if (existing) return existing;
    }
    console.error('[FB] Create contact error:', error.message);
    return null;
  }

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

// Helper: ghi kết quả fetch tên vào webhook logs
async function logFetchResult(pageId, psid, status, details) {
  try {
    await supabase.from('facebook_webhook_logs').insert({
      page_id: pageId,
      payload: { type: 'fetch_name', psid, ...details },
      status,
    });
  } catch (e) { /* ignore */ }
}

// Lấy tên user qua Conversations API (không cần Advanced Access)
// Flow: GET /me/conversations?user_id=PSID → GET /CONV_ID/messages?fields=from → extract name
// Fallback: GET /CONV_ID?fields=participants → filter by PSID
async function fetchProfileViaConversations(pageId, psid) {
  try {
    const page = await getPageConfig(pageId);
    if (!page?.access_token) { await logFetchResult(pageId, psid, 'no_token', null); return null; }
    const token = page.access_token;

    // Step 1: Get conversation ID
    const convResp = await fetch(`https://graph.facebook.com/v22.0/me/conversations?user_id=${psid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const convData = await convResp.json();
    if (!convData.data?.[0]?.id) {
      await logFetchResult(pageId, psid, 'no_conversation', null);
      return null;
    }
    const convId = convData.data[0].id;

    // Step 2a: Try participants API (fastest, most reliable)
    try {
      const partResp = await fetch(`https://graph.facebook.com/v22.0/${convId}?fields=participants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const partData = await partResp.json();
      const participant = partData.participants?.data?.find(p => p.id === psid);
      if (participant?.name && participant.name !== 'Facebook User') {
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(participant.name)}&background=0D8ABC&color=fff&size=200&bold=true`;
        await logFetchResult(pageId, psid, 'success_participants', { name: participant.name });
        return { name: participant.name, profilePic: avatarUrl };
      }
    } catch (e) { /* fallthrough */ }

    // Step 2b: Fallback — messages with from.name
    const msgResp = await fetch(`https://graph.facebook.com/v22.0/${convId}/messages?fields=from&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const msgData = await msgResp.json();
    if (!msgData.data?.length) { await logFetchResult(pageId, psid, 'no_messages', null); return null; }

    const userMsg = msgData.data.find(m => m.from?.id === psid);
    if (!userMsg?.from?.name) {
      await logFetchResult(pageId, psid, 'no_name', null);
      return null;
    }

    const userName = userMsg.from.name;
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=0D8ABC&color=fff&size=200&bold=true`;
    await logFetchResult(pageId, psid, 'success_messages', { name: userName });

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
    /(?:0|\+84)(?:\d[\s.\-\/]?){9,10}/g,  // 0912345678, +84912345678, 0912 345 678, 0984/462/000
    /(?:84)(?:\d[\s.\-\/]?){9,10}/g,       // 84912345678
  ];
  
  let phone = null;
  for (const pattern of phonePatterns) {
    const matches = text.match(pattern);
    if (matches?.[0]) {
      phone = matches[0].replace(/[\s.\-\/]/g, ''); // Remove spaces/dashes/slashes
      // Normalize: +84 → 0
      if (phone.startsWith('+84')) phone = '0' + phone.slice(3);
      else if (phone.startsWith('84') && phone.length >= 11) phone = '0' + phone.slice(2);
      // Validate length: VN phone = 10 digits (0xxx) or 11 digits (01xxx old format)
      if (phone.length < 10 || phone.length > 11) phone = null;
      if (phone) break;
    }
  }
  
  // Fallback: tìm dãy 9-10 chữ số liên tiếp (không có prefix 0) — có thể user gửi thiếu số 0
  if (!phone) {
    const bareMatch = text.match(/(?:^|[^\d])([3-9]\d{8})(?:[^\d]|$)/);
    if (bareMatch?.[1]) {
      phone = '0' + bareMatch[1]; // Thêm prefix 0
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

// ── In-memory lock để chống race condition tạo lead trùng ──
const _createLeadLocks = new Map();

async function createLeadFromFacebook(pageId, contact, source, extraData = {}) {
  const page = await getPageConfig(pageId);
  if (!page) return null;

  // ── LOCK theo contact.id: chỉ 1 request được tạo lead cho 1 contact ──
  const lockKey = contact.id;
  if (_createLeadLocks.has(lockKey)) {
    console.log(`[FB] 🔒 Lock active for contact ${lockKey}, waiting...`);
    // Chờ lock giải phóng (tối đa 10s)
    const start = Date.now();
    while (_createLeadLocks.has(lockKey) && Date.now() - start < 10000) {
      await new Promise(r => setTimeout(r, 100));
    }
    // Sau khi lock mở → re-check lead_id
    const { data: recheck } = await supabase.from('facebook_contacts')
      .select('lead_id').eq('id', contact.id).single();
    if (recheck?.lead_id) {
      console.log(`[FB] 🔒 Lock released, lead already created: ${recheck.lead_id}`);
      return { id: recheck.lead_id };
    }
  }
  _createLeadLocks.set(lockKey, Date.now());
  // Auto-release lock sau 30s (safety)
  setTimeout(() => _createLeadLocks.delete(lockKey), 30000);

  try {

  // ── ANTI-DUPLICATE: 4 tầng kiểm tra ──
  const { data: freshContact } = await supabase.from('facebook_contacts')
    .select('lead_id, customer_id, psid, phone').eq('id', contact.id).single();
  
  // 1. Check contact đã có lead_id
  if (freshContact?.lead_id) {
    return { id: freshContact.lead_id };
  }
  
  // 2. Check trùng theo customer_id
  if (freshContact?.customer_id) {
     const { data: existing } = await supabase.from('crm_leads')
       .select('id').eq('customer_id', freshContact.customer_id).eq('type', 'lead').limit(1);
     if (existing?.length > 0) {
       console.log(`[FB] ⚠️  Đã có lead cho customer ${freshContact.customer_id}, sync lại lead_id.`);
       await supabase.from('facebook_contacts').update({ lead_id: existing[0].id }).eq('id', contact.id);
       return { id: existing[0].id };
     }
  }

  // 3. Check trùng theo PSID (cùng người FB dù khác contact record)
  if (freshContact?.psid) {
    const { data: samePsid } = await supabase.from('facebook_contacts')
      .select('lead_id').eq('psid', freshContact.psid).not('lead_id', 'is', null).limit(1);
    if (samePsid?.length > 0) {
      console.log(`[FB] ⚠️  Đã có lead cho PSID ${freshContact.psid}, sync lại.`);
      await supabase.from('facebook_contacts').update({ lead_id: samePsid[0].lead_id }).eq('id', contact.id);
      return { id: samePsid[0].lead_id };
    }
  }

  // 4. Check trùng theo SĐT (nếu có phone → tìm lead/customer trùng SĐT)
  const phone = extraData.phone || freshContact?.phone || contact.phone;
  if (phone && phone.trim()) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length >= 9) {
      // Tìm customer trùng SĐT
      const { data: sameCust } = await supabase.from('customers')
        .select('id').ilike('phone', `%${cleanPhone.slice(-9)}`).limit(1);
      if (sameCust?.length > 0) {
        const { data: existLead } = await supabase.from('crm_leads')
          .select('id').eq('customer_id', sameCust[0].id).eq('type', 'lead').limit(1);
        if (existLead?.length > 0) {
          console.log(`[FB] ⚠️  Đã có lead cho SĐT ${cleanPhone}, gộp vào lead ${existLead[0].id}`);
          await supabase.from('facebook_contacts').update({ 
            lead_id: existLead[0].id, 
            customer_id: sameCust[0].id 
          }).eq('id', contact.id);
          return { id: existLead[0].id };
        }
      }
    }
  }

  // Tìm/tạo customer
  let customerId = contact.customer_id || freshContact?.customer_id;
  if (!customerId) {
    // Thử tìm customer theo SĐT trước khi tạo mới
    if (phone && phone.trim()) {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      if (cleanPhone.length >= 9) {
        const { data: existCust } = await supabase.from('customers')
          .select('id').ilike('phone', `%${cleanPhone.slice(-9)}`).limit(1);
        if (existCust?.length > 0) {
          customerId = existCust[0].id;
          await supabase.from('facebook_contacts').update({ customer_id: customerId }).eq('id', contact.id);
          console.log(`[FB] ♻️ Reuse customer ${customerId} by phone match`);
        }
      }
    }
    // Nếu vẫn không tìm được → tạo mới
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

  } finally {
    // Release lock
    _createLeadLocks.delete(lockKey);
  }
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
  if (!senderId || senderId === pageId) return;

  console.log(`\n[FB] 📨 Incoming message from PSID: ${senderId}`);

  // Get or create contact
  const contact = await getOrCreateContact(pageId, senderId);
  if (!contact) return;

  console.log(`[FB] 👤 Contact: ${contact.fb_name || 'Unknown'} (ID: ${contact.id})`);

  // Log kết quả xử lý vào DB
  await supabase.from('facebook_webhook_logs').upsert({
    page_id: pageId,
    payload: { type: 'message_processed', psid: senderId, event },
    status: 'processed',
    result: {
      contact_id: contact.id,
      contact_name: contact.fb_name,
      has_lead: !!contact.lead_id,
      lead_id: contact.lead_id,
      avatar: contact.fb_profile_pic || null,
    },
  }, { ignoreDuplicates: true }).then(() => {}).catch(() => {});

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
      // Refresh contact.lead_id vì có thể vừa được tạo trong createLeadFromFacebook ở trên
      if (!contact.lead_id) {
        const { data: refreshed } = await supabase.from('facebook_contacts')
          .select('lead_id, phone').eq('id', contact.id).single();
        if (refreshed) {
          contact.lead_id = refreshed.lead_id;
          if (refreshed.phone && !contact.phone) contact.phone = refreshed.phone;
        }
      }

      // Nếu không tìm thấy SĐT trong tin nhắn hiện tại, quét tin nhắn cũ nếu lead chưa có phone
      if (!extractedPhone && contact.lead_id && !contact.phone) {
        const { data: oldMsgs } = await supabase.from('facebook_messages')
          .select('content').eq('contact_id', contact.id).eq('direction', 'inbound')
          .order('created_at', { ascending: false }).limit(50);
        for (const m of (oldMsgs || [])) {
          if (m.content) {
            const ex = extractContactInfo(m.content);
            if (ex.phone) { extractedPhone = ex.phone; break; }
            if (ex.address && !extractedAddress) extractedAddress = ex.address;
          }
        }
        if (extractedPhone) console.log(`[FB] 📞 Found phone in old messages: ${extractedPhone}`);
      }

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
            let desc = currentLead?.description || '';
            if (/SĐT:/.test(desc)) {
              desc = desc.replace(/SĐT:.*$/m, `SĐT: ${extractedPhone}`);
            } else {
              desc = desc.trimEnd() + `\nSĐT: ${extractedPhone}`;
            }
            if (extractedAddress) {
              if (/Địa chỉ:/.test(desc)) {
                desc = desc.replace(/Địa chỉ:.*$/m, `Địa chỉ: ${extractedAddress}`);
              } else {
                desc = desc.trimEnd() + `\nĐịa chỉ: ${extractedAddress}`;
              }
            }
            leadUpd.description = desc.trim();
          }
          await supabase.from('crm_leads').update(leadUpd).eq('id', contact.lead_id);
          console.log(`[FB] ✅ Updated lead ${contact.lead_id}:`, { phone: extractedPhone, address: extractedAddress });

          // Update customer — cập nhật phone/address + tên nếu vẫn là 'User'
          const { data: lead } = await supabase.from('crm_leads')
            .select('customer_id, title').eq('id', contact.lead_id).single();
          if (lead?.customer_id) {
            const { data: cust } = await supabase.from('customers')
              .select('full_name, phone, address').eq('id', lead.customer_id).single();
            const custUpd = { updated_at: new Date().toISOString() };
            // Chỉ gán phone nếu customer CHƯA CÓ phone
            if (extractedPhone && !cust?.phone) custUpd.phone = extractedPhone;
            if (extractedAddress && !cust?.address) custUpd.address = extractedAddress;
            // Nếu customer tên vẫn là 'User' và contact đã có tên thật → cập nhật
            if (contact.fb_name && contact.fb_name !== 'User' && contact.fb_name !== 'Facebook User') {
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
    const { page_id, has_lead, search, limit: rawLimit } = req.query;
    const maxLimit = Math.min(parseInt(rawLimit) || 1000, 5000);
    let q = supabase.from('facebook_contacts')
      .select('*, lead:crm_leads(id, title, code, type), customer:customers(id, full_name, phone)')
      .order('last_message_at', { ascending: false, nullsFirst: false });
    
    if (page_id) q = q.eq('page_id', page_id);
    if (has_lead === 'true') q = q.not('lead_id', 'is', null);
    if (has_lead === 'false') q = q.is('lead_id', null);
    if (search) q = q.or(`fb_name.ilike.%${search}%,phone.ilike.%${search}%`);

    const { data } = await q.limit(maxLimit);
    
    // Thêm message_count + display_phone cho mỗi contact
    if (data?.length) {
      const contactIds = data.map(c => c.id);
      const { data: counts } = await supabase.from('facebook_messages')
        .select('contact_id')
        .in('contact_id', contactIds)
        .eq('direction', 'inbound');
      const countMap = {};
      (counts || []).forEach(m => { countMap[m.contact_id] = (countMap[m.contact_id] || 0) + 1; });
      data.forEach(c => {
        c.message_count = countMap[c.id] || 0;
        c.display_phone = c.phone || c.customer?.phone || null;
      });
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
    contact.display_phone = contact.phone || contact.customer?.phone || null;

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
// POST /facebook/dedup-leads — Gộp lead trùng: giữ lead tốt nhất, chuyển data, xóa phần dư
r.post('/dedup-leads', authMiddleware, async (req, res) => {
  try {
    const io = r._ioRef;

    // 1. Lấy tất cả leads (không join customer để tránh lỗi FK)
    const { data: allLeads, error: leadsErr } = await supabase.from('crm_leads')
      .select('id, code, customer_id, source_id, title, type, estimated_value, created_at, updated_at, stage_id, assigned_to, description, install_address')
      .eq('type', 'lead')
      .order('created_at', { ascending: false })
      .limit(5000);
    
    if (leadsErr) {
      console.error('[Dedup] Query error:', leadsErr.message);
      return res.status(500).json({ error: `Query lỗi: ${leadsErr.message}` });
    }
    if (!allLeads?.length) return res.json({ merged: 0, scanned: 0, message: 'Không có lead nào' });

    // 1b. Lấy customers riêng
    const custIds = [...new Set(allLeads.map(l => l.customer_id).filter(Boolean))];
    const custMap = {};
    if (custIds.length) {
      const { data: custs } = await supabase.from('customers')
        .select('id, full_name, phone').in('id', custIds);
      (custs || []).forEach(c => { custMap[c.id] = c; });
    }
    // Attach customer data
    allLeads.forEach(l => { l.customer = custMap[l.customer_id] || null; });

    // 2. Lấy FB contacts map
    const { data: fbContacts } = await supabase.from('facebook_contacts')
      .select('id, lead_id, psid, fb_name, phone, page_id').not('lead_id', 'is', null);
    const fbLeadMap = {}; // lead_id → { psid, fb_name, phone }
    const psidLeadMap = {}; // psid → [lead_ids]
    (fbContacts || []).forEach(c => {
      if (c.lead_id) fbLeadMap[c.lead_id] = c;
      if (c.psid) {
        if (!psidLeadMap[c.psid]) psidLeadMap[c.psid] = new Set();
        psidLeadMap[c.psid].add(c.lead_id);
      }
    });

    // 3. Normalize SĐT → last 9 digits
    const normalizePhone = (p) => {
      if (!p) return null;
      const clean = p.replace(/[^0-9]/g, '');
      return clean.length >= 9 ? clean.slice(-9) : null;
    };

    // 4. Build union-find groups bằng nhiều tiêu chí
    const leadById = {};
    allLeads.forEach(l => { leadById[l.id] = l; });

    // Parent map cho union-find
    const parent = {};
    allLeads.forEach(l => { parent[l.id] = l.id; });
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

    // Group by customer_id
    const byCustomer = {};
    allLeads.forEach(l => {
      if (!l.customer_id) return;
      if (!byCustomer[l.customer_id]) byCustomer[l.customer_id] = [];
      byCustomer[l.customer_id].push(l.id);
    });
    Object.values(byCustomer).forEach(ids => {
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    });

    // Group by PSID
    Object.values(psidLeadMap).forEach(leadIdSet => {
      const ids = [...leadIdSet];
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    });

    // Group by phone (last 9 digits)
    const byPhone = {};
    allLeads.forEach(l => {
      const p = normalizePhone(l.customer?.phone);
      if (!p) return;
      if (!byPhone[p]) byPhone[p] = [];
      byPhone[p].push(l.id);
    });
    Object.values(byPhone).forEach(ids => {
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    });

    // Group by Title chuẩn hóa (loại [FB], lowercase, trim)
    const byTitle = {};
    allLeads.forEach(l => {
      const norm = (l.title || '').replace(/\[.*?\]/g, '').toLowerCase().trim();
      // Bỏ qua tên chung chung
      if (!norm || norm === 'kh facebook' || norm === 'user' || norm === 'facebook user' || norm.length < 3) return;
      if (!byTitle[norm]) byTitle[norm] = [];
      byTitle[norm].push(l.id);
    });
    Object.values(byTitle).forEach(ids => {
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    });

    console.log(`[Dedup] Scanned ${allLeads.length} leads | Groups: customer=${Object.values(byCustomer).filter(v=>v.length>1).length}, psid=${Object.values(psidLeadMap).filter(v=>v.size>1).length}, phone=${Object.values(byPhone).filter(v=>v.length>1).length}, title=${Object.values(byTitle).filter(v=>v.length>1).length}`);

    // 5. Collect groups
    const groups = {};
    allLeads.forEach(l => {
      const root = find(l.id);
      if (!groups[root]) groups[root] = [];
      groups[root].push(l);
    });

    // Filter: chỉ groups có >= 2 leads
    const dupGroups = Object.values(groups).filter(g => g.length > 1);
    if (!dupGroups.length) {
      return res.json({ merged: 0, scanned: allLeads.length, message: 'Không có lead trùng cần gộp' });
    }

    if (io) io.emit('batch_progress', { type: 'dedup', phase: 'start', total: dupGroups.length, current: 0 });

    let totalMerged = 0;
    const details = [];

    for (let g = 0; g < dupGroups.length; g++) {
      const group = dupGroups[g];

      // Chọn lead tốt nhất: ưu tiên có FB link > có phone > có value > cũ nhất (đầu tiên tạo)
      group.sort((a, b) => {
        const aFb = fbLeadMap[a.id] ? 1 : 0;
        const bFb = fbLeadMap[b.id] ? 1 : 0;
        if (bFb !== aFb) return bFb - aFb;
        const aPhone = (a.customer?.phone) ? 1 : 0;
        const bPhone = (b.customer?.phone) ? 1 : 0;
        if (bPhone !== aPhone) return bPhone - aPhone;
        const aVal = a.estimated_value || 0;
        const bVal = b.estimated_value || 0;
        if (bVal !== aVal) return bVal - aVal;
        return new Date(a.created_at) - new Date(b.created_at); // oldest first = keep
      });

      const keep = group[0];
      const dupes = group.slice(1);

      for (const dupe of dupes) {
        try {
          // Gộp estimated_value
          if (dupe.estimated_value > 0 && !keep.estimated_value) {
            await supabase.from('crm_leads').update({ estimated_value: dupe.estimated_value }).eq('id', keep.id);
          }
          // Gộp phone nếu keep thiếu
          const keepCust = custMap[keep.customer_id];
          const dupeCust = custMap[dupe.customer_id];
          if (keepCust && !keepCust.phone && dupeCust?.phone) {
            await supabase.from('customers').update({ phone: dupeCust.phone }).eq('id', keep.customer_id);
            keepCust.phone = dupeCust.phone;
          }
          // Gộp install_address nếu keep thiếu
          if (!keep.install_address && dupe.install_address) {
            await supabase.from('crm_leads').update({ install_address: dupe.install_address }).eq('id', keep.id);
          }

          // Move related data → keep
          await supabase.from('facebook_contacts').update({ lead_id: keep.id }).eq('lead_id', dupe.id);
          await supabase.from('facebook_messages').update({ lead_id: keep.id }).eq('lead_id', dupe.id);
          try { await supabase.from('crm_pipeline_history').update({ lead_id: keep.id }).eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('crm_tasks').update({ lead_id: keep.id }).eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('crm_activities').update({ lead_id: keep.id }).eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('lead_documents').update({ lead_id: keep.id }).eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('quotations').update({ lead_id: keep.id }).eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('orders').update({ lead_id: keep.id }).eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('invoices').update({ lead_id: keep.id }).eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('lead_members').delete().eq('lead_id', dupe.id); } catch (_) {}
          try { await supabase.from('lead_messages').delete().eq('lead_id', dupe.id); } catch (_) {}

          // Xóa duplicate lead
          await supabase.from('crm_leads').delete().eq('id', dupe.id);

          // Xóa customer trùng nếu không còn lead nào dùng
          if (dupe.customer_id && dupe.customer_id !== keep.customer_id) {
            const { count } = await supabase.from('crm_leads').select('id', { count: 'exact', head: true }).eq('customer_id', dupe.customer_id);
            if (count === 0) {
              try { await supabase.from('customers').delete().eq('id', dupe.customer_id); } catch (_) {}
            }
          }

          totalMerged++;
          details.push({ deleted: dupe.code, kept: keep.code, reason: `Gộp → ${keep.code}` });
        } catch (e) {
          console.error(`[Dedup] Error merging ${dupe.code} → ${keep.code}:`, e.message);
          details.push({ deleted: dupe.code, kept: keep.code, reason: `Lỗi: ${e.message}` });
        }
      }

      if (io) io.emit('batch_progress', { type: 'dedup', current: g + 1, total: dupGroups.length, name: `${keep.code} (gộp ${dupes.length})`, status: 'merged' });
    }

    const summary = {
      merged: totalMerged,
      scanned: allLeads.length,
      groups: dupGroups.length,
      details: details.slice(0, 100),
      message: totalMerged > 0
        ? `Đã gộp ${totalMerged} lead trùng (${dupGroups.length} nhóm)`
        : 'Không có lead trùng cần gộp',
    };
    if (io) io.emit('batch_done', { type: 'dedup', ...summary });
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DEBUG: Scan duplicate leads — hiển thị nhóm trùng theo title + phone + customer
r.get('/scan-duplicates-debug', authMiddleware, async (req, res) => {
  try {
    const { data: allLeads, error: err } = await supabase.from('crm_leads')
      .select('id, code, title, customer_id, source_id, created_at')
      .eq('type', 'lead')
      .limit(5000);
    
    if (err) return res.status(500).json({ error: err.message });

    // Lấy customer phone riêng
    const custIds = [...new Set(allLeads.map(l => l.customer_id).filter(Boolean))];
    const custMap = {};
    if (custIds.length) {
      const { data: custs } = await supabase.from('customers').select('id, full_name, phone').in('id', custIds);
      (custs || []).forEach(c => { custMap[c.id] = c; });
    }
    
    // Group theo title chuẩn hóa
    const byTitle = {};
    allLeads.forEach(l => {
      const norm = (l.title || '').replace(/\[.*?\]/g, '').toLowerCase().trim();
      if (!norm || norm === 'kh facebook' || norm === 'user' || norm === 'facebook user' || norm.length < 3) return;
      if (!byTitle[norm]) byTitle[norm] = [];
      const cust = custMap[l.customer_id];
      byTitle[norm].push({ id: l.id, code: l.code, title: l.title, phone: cust?.phone, custName: cust?.full_name, customer_id: l.customer_id });
    });

    // Group theo phone (last 9 digits)
    const byPhone = {};
    allLeads.forEach(l => {
      const cust = custMap[l.customer_id];
      const raw = cust?.phone;
      if (!raw) return;
      const clean = raw.replace(/[^0-9]/g, '');
      const norm = clean.length >= 9 ? clean.slice(-9) : null;
      if (!norm) return;
      if (!byPhone[norm]) byPhone[norm] = [];
      byPhone[norm].push({ id: l.id, code: l.code, title: l.title, phone: raw, customer_id: l.customer_id });
    });

    const titleDups = Object.entries(byTitle)
      .filter(([_, leads]) => leads.length > 1)
      .map(([title, leads]) => ({ match: 'title', key: title, count: leads.length, leads }));

    const phoneDups = Object.entries(byPhone)
      .filter(([_, leads]) => leads.length > 1)
      .map(([phone, leads]) => ({ match: 'phone', key: phone, count: leads.length, leads }));

    res.json({
      total_leads: allLeads.length,
      title_groups: titleDups.length,
      phone_groups: phoneDups.length,
      duplicates: [...titleDups, ...phoneDups],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /facebook/batch-create-leads
// ═══════════════════════════════════════════════════════════════

r.post('/batch-create-leads', authMiddleware, async (req, res) => {
  try {
    const io = r._ioRef;
    // Lấy tất cả contacts chưa có lead
    const { data: contacts } = await supabase.from('facebook_contacts')
      .select('*').is('lead_id', null).order('created_at');
    
    if (!contacts?.length) return res.json({ created: 0, updated: 0, message: 'Không có contact nào cần xử lý' });

    let created = 0, updated = 0, skipped = 0;
    const results = [];
    const total = contacts.length;

    // Pre-fetch messages cho tất cả contacts 1 lần
    const contactIds = contacts.map(c => c.id);
    const { data: allMsgs } = await supabase.from('facebook_messages')
      .select('contact_id, content')
      .in('contact_id', contactIds)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(50000);
    const msgsByContact = {};
    (allMsgs || []).forEach(m => {
      if (!msgsByContact[m.contact_id]) msgsByContact[m.contact_id] = [];
      msgsByContact[m.contact_id].push(m);
    });

    // Cache page configs
    const pageConfigCache = {};

    // Emit start
    if (io) io.emit('batch_progress', { type: 'create_leads', phase: 'start', total, current: 0 });

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      try {
        // Verify lead chưa có (double check)
        if (contact.lead_id) { skipped++; continue; }

        // Lấy page config (cached)
        if (!pageConfigCache[contact.page_id]) {
          pageConfigCache[contact.page_id] = await getPageConfig(contact.page_id);
        }
        const page = pageConfigCache[contact.page_id];
        if (!page || !page.is_active) {
          results.push({ contact: contact.fb_name, status: 'skipped', reason: 'Page không active' });
          skipped++;
          if (io) io.emit('batch_progress', { type: 'create_leads', current: i + 1, total, name: contact.fb_name, status: 'skipped' });
          continue;
        }

        // Extract phone/address từ pre-fetched messages
        let extractedPhone = contact.phone || null;
        let extractedAddress = null;

        const messages = msgsByContact[contact.id] || [];
        
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
          if (io) io.emit('batch_progress', { type: 'create_leads', current: i + 1, total, name: contact.fb_name, status: 'created', code: lead.code, phone: extractedPhone });
          console.log(`[FB Batch] ✅ Lead ${lead.code} — ${contact.fb_name} (phone: ${extractedPhone || 'N/A'})`);
        } else {
          results.push({ contact: contact.fb_name, status: 'failed', reason: 'createLeadFromFacebook returned null' });
          skipped++;
          if (io) io.emit('batch_progress', { type: 'create_leads', current: i + 1, total, name: contact.fb_name, status: 'failed' });
        }
      } catch (e) {
        results.push({ contact: contact.fb_name, status: 'error', reason: e.message });
        skipped++;
        if (io) io.emit('batch_progress', { type: 'create_leads', current: i + 1, total, name: contact.fb_name, status: 'error' });
        console.error(`[FB Batch] ❌ ${contact.fb_name}:`, e.message);
      }
    }

    const summary = { total, created, phone_updated: updated, skipped, results };
    if (io) io.emit('batch_done', { type: 'create_leads', ...summary });
    console.log(`[FB Batch] Done: created=${created}, updated=${updated}, skipped=${skipped}`);
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// SYNC PHONE: Contacts đã có SĐT → cập nhật vào lead/customer ngay
// POST /facebook/sync-contact-phones
// ═══════════════════════════════════════════════════════════════
r.post('/sync-contact-phones', authMiddleware, async (req, res) => {
  try {
    const io = r._ioRef;
    console.log('[SyncPhone] START — contacts có phone → lead/customer');

    // Lấy tất cả contacts có phone (phân trang)
    let contacts = [];
    let pageStart = 0;
    while (true) {
      const { data: page } = await supabase.from('facebook_contacts')
        .select('id, fb_name, phone, lead_id, customer_id')
        .not('psid', 'is', null)
        .not('phone', 'is', null)
        .neq('phone', '')
        .range(pageStart, pageStart + 999);
      if (!page?.length) break;
      contacts = contacts.concat(page);
      if (page.length < 1000) break;
      pageStart += 1000;
    }

    const total = contacts.length;
    console.log(`[SyncPhone] ${total} contacts có SĐT`);
    if (io) io.emit('batch_progress', { type: 'sync_contact_phones', phase: 'start', total, current: 0, name: `Tìm thấy ${total} contacts có SĐT` });

    if (!total) return res.json({ total: 0, updated: 0, skipped: 0, alreadyHad: 0, noLead: 0, details: [] });

    // Load leads
    const leadIds = [...new Set(contacts.map(c => c.lead_id).filter(Boolean))];
    const leadMap = {};
    for (let b = 0; b < leadIds.length; b += 500) {
      const { data: ls } = await supabase.from('crm_leads')
        .select('id, code, title, customer_id, description')
        .in('id', leadIds.slice(b, b + 500));
      (ls || []).forEach(l => { leadMap[l.id] = l; });
    }

    // Load customers
    const custIds = [...new Set([
      ...contacts.map(c => c.customer_id).filter(Boolean),
      ...Object.values(leadMap).map(l => l.customer_id).filter(Boolean),
    ])];
    const custMap = {};
    for (let b = 0; b < custIds.length; b += 500) {
      const { data: cs } = await supabase.from('customers')
        .select('id, phone, address')
        .in('id', custIds.slice(b, b + 500));
      (cs || []).forEach(c => { custMap[c.id] = c; });
    }

    let updated = 0, alreadyHad = 0, noLead = 0, skipped = 0;
    const details = []; // contacts đã được update
    const stillMissing = []; // contacts có lead nhưng vẫn thiếu (skip)

    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      const phone = String(c.phone).trim();
      const lead = c.lead_id ? leadMap[c.lead_id] : null;
      const custId = lead?.customer_id || c.customer_id;
      let cust = custId ? custMap[custId] : null;

      if (io && i % 50 === 0) {
        io.emit('batch_progress', { type: 'sync_contact_phones', current: i + 1, total, name: c.fb_name || c.id });
      }

      if (!lead) { noLead++; continue; }

      // Fetch customer trực tiếp nếu thiếu trong cache
      if (!cust && custId) {
        const { data: fc } = await supabase.from('customers').select('id, phone, address').eq('id', custId).single();
        if (fc) { cust = fc; custMap[custId] = fc; }
      }

      const customerAlreadyHasPhone = cust?.phone && String(cust.phone).trim();
      // Description đã có SĐT đúng chưa
      const descHasPhone = lead.description && new RegExp(`SĐT:\s*${phone.replace(/[+]/g, '\\+')}`).test(lead.description);

      if (customerAlreadyHasPhone && descHasPhone) {
        alreadyHad++;
        continue; // Đã đầy đủ, bỏ qua
      }

      const custUpd = {};
      const leadUpd = { updated_at: new Date().toISOString() };

      // Update customer phone nếu còn trống
      if (!customerAlreadyHasPhone && custId) {
        custUpd.phone = phone;
        await supabase.from('customers').update(custUpd).eq('id', custId);
        if (custMap[custId]) custMap[custId].phone = phone;
        else custMap[custId] = { id: custId, phone };
      }

      // Update lead description
      let desc = lead.description || '';
      if (!descHasPhone) {
        if (/SĐT:/.test(desc)) {
          desc = desc.replace(/SĐT:.*$/m, `SĐT: ${phone}`);
        } else {
          desc = `${desc.trimEnd()}\nSĐT: ${phone}`.trim();
        }
        leadUpd.description = desc;
      }

      if (Object.keys(leadUpd).length > 1) {
        await supabase.from('crm_leads').update(leadUpd).eq('id', lead.id);
      }

      updated++;
      details.push({
        contact_id: c.id,
        fb_name: c.fb_name,
        phone,
        lead_id: lead.id,
        lead_code: lead.code,
        lead_title: lead.title,
        updated_customer: !customerAlreadyHasPhone,
        updated_desc: !!leadUpd.description,
      });

      if (io) io.emit('batch_progress', { type: 'sync_contact_phones', current: i + 1, total, name: c.fb_name, status: 'updated', phone });
    }

    const summary = { total, updated, alreadyHad, noLead, skipped, details: details.slice(0, 500) };
    console.log(`[SyncPhone] DONE total=${total} updated=${updated} alreadyHad=${alreadyHad} noLead=${noLead}`);
    if (io) io.emit('batch_done', { type: 'sync_contact_phones', ...summary });
    res.json(summary);
  } catch (e) {
    console.error('[SyncPhone] ERROR', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// BATCH: Extract SĐT từ tin nhắn cho contacts ĐÃ CÓ lead nhưng thiếu phone
// POST /facebook/batch-extract-phones
// ═══════════════════════════════════════════════════════════════

r.post('/batch-extract-phones', authMiddleware, async (req, res) => {
  try {
    const io = r._ioRef;
    // offset/limit cho phép pipeline gọi theo batch 300
    const reqOffset = parseInt(req.body?.offset) || 0;
    const reqLimit  = parseInt(req.body?.limit)  || 0; // 0 = lấy tất cả
    console.log(`[ExtractPhones] START offset=${reqOffset} limit=${reqLimit || 'all'}`);

    let contacts = [];
    if (reqLimit > 0) {
      // Chế độ batch: lấy đúng reqLimit contacts từ offset
      const { data: page } = await supabase.from('facebook_contacts')
        .select('*')
        .not('psid', 'is', null)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .range(reqOffset, reqOffset + reqLimit - 1);
      contacts = page || [];
    } else {
      // Chế độ full scan (manual): phân trang lấy hết
      let pageStart = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const { data: page } = await supabase.from('facebook_contacts')
          .select('*')
          .not('psid', 'is', null)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .range(pageStart, pageStart + PAGE_SIZE - 1);
        if (!page?.length) break;
        contacts = contacts.concat(page);
        if (page.length < PAGE_SIZE) break;
        pageStart += PAGE_SIZE;
      }
    }
    console.log(`[ExtractPhones] Loaded ${contacts.length} contacts`);

    if (!contacts?.length) {
      return res.json({ total: 0, updated: 0, message: 'Không có contact nào để quét' });
    }

    let updated = 0;
    let foundPhones = 0;
    let foundAddresses = 0;
    let noInfo = 0;
    let updatedContactPhone = 0;
    let updatedCustomerPhone = 0;
    let updatedCustomerAddress = 0;
    let updatedLeadAddress = 0;
    let updatedLeadDescription = 0;
    const results = [];

    contacts.sort((a, b) => {
      const score = (c) => {
        let s = 0;
        if (!c.phone) s += 2;
        if (!c.lead_id) s += 0.5;
        return s;
      };
      return score(b) - score(a);
    });

    const total = contacts.length;

    if (io) io.emit('batch_progress', { type: 'extract_phones', phase: 'start', total, current: 0 });

    // ── Fix #3: Phân trang leadIds/custIds theo batch 500 để tránh Supabase 1000-row limit ──
    const leadIds = [...new Set(contacts.map(c => c.lead_id).filter(Boolean))];
    const leadMap = {};
    for (let b = 0; b < leadIds.length; b += 500) {
      const batch = leadIds.slice(b, b + 500);
      const { data: leads } = await supabase.from('crm_leads').select('id, customer_id, description, install_address').in('id', batch);
      (leads || []).forEach(l => { leadMap[l.id] = l; });
    }

    const custIds = [...new Set(Object.values(leadMap).map(l => l.customer_id).filter(Boolean))];
    const custMap = {};
    for (let b = 0; b < custIds.length; b += 500) {
      const batch = custIds.slice(b, b + 500);
      const { data: custs } = await supabase.from('customers').select('id, phone, address').in('id', batch);
      (custs || []).forEach(c => { custMap[c.id] = c; });
    }
    console.log(`[ExtractPhones] Loaded ${Object.keys(leadMap).length} leads, ${Object.keys(custMap).length} customers`);

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const lead = leadMap[contact.lead_id];
      let cust = lead ? custMap[lead.customer_id] : null;

      console.log(`[ExtractPhones] Scan ${i + 1}/${total}: ${contact.fb_name || contact.id}`);
      const { data: messages } = await supabase.from('facebook_messages')
        .select('content, direction, created_at')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(300);

      let extractedPhone = null;
      let extractedAddress = null;
      const extraPhones = [];

      for (const msg of (messages || [])) {
        if (!msg.content) continue;
        const { phone, address } = extractContactInfo(msg.content);
        if (phone && !extractedPhone) extractedPhone = phone;
        else if (phone && phone !== extractedPhone && !extraPhones.includes(phone)) extraPhones.push(phone);
        if (address && !extractedAddress) extractedAddress = address;
        if (extractedPhone && extractedAddress) break;
      }

      // ── Fix #1 & #4: Fallback sang contact.phone nếu tin nhắn không tìm được số mới ──
      const effectivePhone = extractedPhone || (contact.phone && String(contact.phone).trim() ? contact.phone : null);

      if (!effectivePhone && !extractedAddress && extraPhones.length === 0) {
        noInfo++;
        results.push({ contact: contact.fb_name, status: 'no_info_found' });
        if (io) io.emit('batch_progress', { type: 'extract_phones', current: i + 1, total, name: contact.fb_name, status: 'no_info' });
        continue;
      }

      const contactUpd = { updated_at: new Date().toISOString() };
      if (extractedPhone && !contact.phone) {
        contactUpd.phone = extractedPhone;
        foundPhones++;
      }
      if (Object.keys(contactUpd).length > 1) {
        await supabase.from('facebook_contacts').update(contactUpd).eq('id', contact.id);
        if (contactUpd.phone) updatedContactPhone++;
      }

      // ── Fix #1: Dùng effectivePhone (bao gồm contact.phone sẵn có) để sync sang customer ──
      const leadCustId = lead?.customer_id || contact.customer_id;
      // Nếu custMap thiếu (do không được load ban đầu) → fetch trực tiếp
      if (!cust && leadCustId) {
        const { data: freshCust } = await supabase.from('customers').select('id, phone, address').eq('id', leadCustId).single();
        if (freshCust) { cust = freshCust; custMap[leadCustId] = freshCust; }
      }
      if (leadCustId) {
        const custUpd = {};
        if (effectivePhone && (!cust?.phone || !String(cust.phone).trim())) custUpd.phone = effectivePhone;
        if (extractedAddress && extractedAddress !== cust?.address) {
          custUpd.address = extractedAddress;
          foundAddresses++;
        }
        if (Object.keys(custUpd).length) {
          await supabase.from('customers').update(custUpd).eq('id', leadCustId);
          if (custUpd.phone) {
            updatedCustomerPhone++;
            if (custMap[leadCustId]) custMap[leadCustId].phone = effectivePhone;
            else custMap[leadCustId] = { id: leadCustId, phone: effectivePhone };
          }
          if (custUpd.address) updatedCustomerAddress++;
        }
      }

      if (lead && contact.lead_id) {
        const leadUpd = { updated_at: new Date().toISOString() };
        if (extractedAddress && extractedAddress !== lead.install_address) leadUpd.install_address = extractedAddress;

        // Cập nhật title nếu đang là tên mặc định
        const defaultNames = ['kh facebook', 'facebook user', 'user', '[fb]'];
        const currentTitle = (lead.title || '').toLowerCase().trim();
        if (contact.fb_name && defaultNames.some(d => currentTitle.startsWith(d) || currentTitle === d)) {
          const newTitle = contact.fb_name;
          if (newTitle !== lead.title) leadUpd.title = newTitle;
        }

        let desc = lead.description || '';
        if (effectivePhone) {
          if (/SĐT:/.test(desc)) {
            const oldMatch = desc.match(/SĐT:\s*(\S*)/);
            // Chỉ update nếu SĐT trống hoặc khác
            if (!oldMatch?.[1] || oldMatch[1] !== effectivePhone) {
              desc = desc.replace(/SĐT:.*$/m, `SĐT: ${effectivePhone}`);
            }
          } else {
            desc = `${desc.trimEnd()}\nSĐT: ${effectivePhone}`.trim();
          }
        }
        if (extractedAddress) {
          if (/Địa chỉ:/.test(desc)) desc = desc.replace(/Địa chỉ:.*$/m, `Địa chỉ: ${extractedAddress}`);
          else desc = `${desc.trimEnd()}\nĐịa chỉ: ${extractedAddress}`.trim();
        }
        if (extraPhones.length) {
          if (/SĐT khác:/.test(desc)) desc = desc.replace(/SĐT khác:.*$/m, `SĐT khác: ${extraPhones.join(', ')}`);
          else desc = `${desc.trimEnd()}\nSĐT khác: ${extraPhones.join(', ')}`.trim();
        }
        if (desc !== (lead.description || '')) leadUpd.description = desc;

        if (Object.keys(leadUpd).length > 1) {
          await supabase.from('crm_leads').update(leadUpd).eq('id', contact.lead_id);
          if (leadUpd.install_address) updatedLeadAddress++;
          if (leadUpd.description) updatedLeadDescription++;
        }
      }

      updated++;
      results.push({
        contact: contact.fb_name,
        phone: effectivePhone || cust?.phone || null,
        address: extractedAddress || cust?.address || lead?.install_address || null,
        extraPhones: extraPhones.length ? extraPhones : undefined,
        status: extractedPhone ? 'updated_phone' : (effectivePhone && !extractedPhone) ? 'synced_existing' : extractedAddress ? 'updated_address' : 'refreshed',
      });
      if (io) io.emit('batch_progress', {
        type: 'extract_phones',
        current: i + 1,
        total,
        name: contact.fb_name,
        status: 'found',
        phone: extractedPhone || contact.phone || cust?.phone || null,
        address: extractedAddress || cust?.address || lead?.install_address || null,
      });
    }

    // ═══ VÒNG CUỐI: Sync phone từ customer → lead cho TẤT CẢ leads ═══
    console.log('[ExtractPhones] 🔄 Vòng cuối: sync customer.phone → lead...');
    if (io) io.emit('batch_progress', { type: 'extract_phones', phase: 'lead_sync', current: 0, total: 0, name: 'Sync SĐT vào lead...' });

    const leadsUpdated = [];
    let leadsStillMissing = 0;

    // Lấy tất cả leads loại 'lead' có customer_id
    let allLeads = [];
    let lp = 0;
    while (true) {
      const { data: lpage } = await supabase.from('crm_leads')
        .select('id, code, title, customer_id, description')
        .eq('type', 'lead')
        .not('customer_id', 'is', null)
        .range(lp, lp + 999);
      if (!lpage?.length) break;
      allLeads = allLeads.concat(lpage);
      if (lpage.length < 1000) break;
      lp += 1000;
    }

    // Lấy tất cả customers có phone
    const allCustIds = [...new Set(allLeads.map(l => l.customer_id))];
    const fullCustMap = {};
    for (let b = 0; b < allCustIds.length; b += 500) {
      const batch = allCustIds.slice(b, b + 500);
      const { data: custs } = await supabase.from('customers').select('id, phone').in('id', batch);
      (custs || []).forEach(c => { fullCustMap[c.id] = c; });
    }

    for (const lead of allLeads) {
      const cPhone = fullCustMap[lead.customer_id]?.phone;
      const leadUpd = {};

      // SĐT vào description
      if (cPhone && String(cPhone).trim()) {
        let desc = lead.description || '';
        const hasPhoneInDesc = /SĐT:\s*\S/.test(desc);
        if (hasPhoneInDesc) {
          const match = desc.match(/SĐT:\s*(\S+)/);
          if (!match || match[1] !== cPhone) {
            desc = desc.replace(/SĐT:.*$/m, `SĐT: ${cPhone}`);
            leadUpd.description = desc;
          }
        } else {
          desc = `${desc.trimEnd()}\nSĐT: ${cPhone}`.trim();
          leadUpd.description = desc;
        }
      } else {
        leadsStillMissing++;
      }

      if (Object.keys(leadUpd).length) {
        leadUpd.updated_at = new Date().toISOString();
        await supabase.from('crm_leads').update(leadUpd).eq('id', lead.id);
        leadsUpdated.push({ id: lead.id, code: lead.code, title: lead.title, phone: cPhone });
      }
    }

    // Đếm leads vẫn thiếu phone hoàn toàn (customer cũng không có)
    const totalLeads = allLeads.length;
    const leadsWithPhone = totalLeads - leadsStillMissing;

    console.log(`[ExtractPhones] ✅ Lead sync done: updated=${leadsUpdated.length}, withPhone=${leadsWithPhone}, stillMissing=${leadsStillMissing}, totalLeads=${totalLeads}`);

    const summary = {
      total,
      updated,
      foundPhones,
      foundAddresses,
      noInfo,
      updatedContactPhone,
      updatedCustomerPhone,
      updatedCustomerAddress,
      updatedLeadAddress,
      updatedLeadDescription,
      // Vòng cuối: lead sync
      leadsUpdatedPhone: leadsUpdated.length,
      leadsWithPhone,
      leadsStillMissingPhone: leadsStillMissing,
      totalLeads,
      leadsUpdatedList: leadsUpdated.slice(0, 200), // giới hạn 200 mẫu
      results,
    };
    console.log(`[ExtractPhones] DONE total=${total} updated=${updated} phones=${foundPhones} addresses=${foundAddresses} noInfo=${noInfo} leadsUpdatedPhone=${leadsUpdated.length}`);
    if (io) io.emit('batch_done', { type: 'extract_phones', ...summary });
    res.json(summary);
  } catch (e) {
    console.error('[ExtractPhones] ERROR', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// BATCH SYNC MESSAGES — Smart sync: chỉ contacts cần thiết
// ═══════════════════════════════════════════════════════════════
r.post('/batch-sync-messages', authMiddleware, async (req, res) => {
  try {
    const io = r._ioRef;
    const mode = req.body?.mode || 'smart'; // 'smart' | 'all'
    const offsetIdx = parseInt(req.body?.offset) || 0;  // bắt đầu từ index nào
    const batchLimit = parseInt(req.body?.limit) || 0;  // 0 = không giới hạn
    const timeoutMs = Math.min(parseInt(req.body?.timeout) || 0, 300) * 1000; // giới hạn thời gian (s)
    const startTime = Date.now();

    // Lấy tất cả contacts có PSID
    const { data: allContacts } = await supabase.from('facebook_contacts')
      .select('id, psid, page_id, fb_name, lead_id, phone, last_message_at, last_synced_at, created_at')
      .not('psid', 'is', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(5000);

    if (!allContacts?.length) return res.json({ synced: 0, total: 0, message: 'Không có contact nào' });

    // ── SMART FILTER: chỉ sync contacts cần thiết ──
    const now = Date.now();
    const FIVE_MIN = 5 * 60 * 1000;
    const ONE_HOUR = 60 * 60 * 1000;
    const ONE_DAY = 24 * ONE_HOUR;
    const ONE_WEEK = 7 * ONE_DAY;

    let candidates;
    if (mode === 'all') {
      candidates = allContacts;
    } else {
      candidates = allContacts.filter(c => {
        const lastSync = c.last_synced_at ? new Date(c.last_synced_at).getTime() : 0;
        const lastMsg = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
        const createdAt = c.created_at ? new Date(c.created_at).getTime() : 0;
        const age = now - (lastMsg || createdAt); // tuổi của contact

        // 1. Chưa bao giờ sync → luôn sync
        if (!lastSync) return true;

        // 2. Tin nhắn mới trong 1h → sync mỗi 5 phút
        if (age < ONE_HOUR) return (now - lastSync) > FIVE_MIN;

        // 3. Tin nhắn trong 24h → sync mỗi 30 phút
        if (age < ONE_DAY) return (now - lastSync) > 30 * 60 * 1000;

        // 4. Tin nhắn trong 7 ngày → sync mỗi 2h
        if (age < ONE_WEEK) return (now - lastSync) > 2 * ONE_HOUR;

        // 5. Cũ hơn 7 ngày → sync mỗi 24h
        return (now - lastSync) > ONE_DAY;
      });
    }

    if (!candidates.length) return res.json({ synced: 0, total: 0, filtered: allContacts.length, nextOffset: 0, done: true, message: 'Smart: tất cả đã cập nhật' });

    // Slice từ offset, giới hạn batch nếu có
    const sliced = candidates.slice(offsetIdx);
    const contacts = batchLimit > 0 ? sliced.slice(0, batchLimit) : sliced;
    const nextOffsetAbs = offsetIdx + contacts.length;
    const batchDone = nextOffsetAbs >= candidates.length;
    if (!contacts.length) return res.json({ synced: 0, total: candidates.length, nextOffset: 0, done: true, message: 'Đã đồng bộ hết' });

    // Group contacts theo page_id để lấy token 1 lần
    const pageTokens = {};
    const total = candidates.length;
    let totalSynced = 0;
    let totalErrors = 0;
    let processedCount = 0;
    const results = [];

    if (io) io.emit('batch_progress', { type: 'sync_messages', phase: 'start', total, current: 0 });

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];

      // Kiểm tra timeout — dừng và trả về nextOffset để caller tiếp tục
      if (timeoutMs > 0 && (Date.now() - startTime) >= timeoutMs) {
        const nextOffset = offsetIdx + i;
        if (io) io.emit('batch_progress', { type: 'sync_messages', phase: 'timeout', current: i, total: contacts.length, nextOffset });
        const summary = { total, totalSynced, totalErrors, processedCount: i, nextOffset, done: false, details: results };
        if (io) io.emit('batch_done', { type: 'sync_messages', ...summary });
        return res.json(summary);
      }

      try {
        // Lấy page token (cache)
        if (!pageTokens[contact.page_id]) {
          const page = await getPageConfig(contact.page_id);
          pageTokens[contact.page_id] = page?.access_token || null;
        }
        const token = pageTokens[contact.page_id];
        if (!token) {
          if (io) io.emit('batch_progress', { type: 'sync_messages', current: i + 1, total, name: contact.fb_name, status: 'no_token' });
          continue;
        }

        // Get conversation
        const convResp = await fetch(`https://graph.facebook.com/v22.0/me/conversations?user_id=${contact.psid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const convData = await convResp.json();
        if (!convData.data?.[0]?.id) {
          if (io) io.emit('batch_progress', { type: 'sync_messages', current: i + 1, total, name: contact.fb_name, status: 'no_conv' });
          continue;
        }

        // Get messages (limit 100)
        const convId = convData.data[0].id;
        const msgResp = await fetch(`https://graph.facebook.com/v22.0/${convId}/messages?fields=message,from,created_time,attachments&limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const msgData = await msgResp.json();
        if (!msgData.data?.length) {
          if (io) io.emit('batch_progress', { type: 'sync_messages', current: i + 1, total, name: contact.fb_name, status: 'no_msg' });
          continue;
        }

        let synced = 0;
        for (const msg of msgData.data) {
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

        // Update last_message_at + last_synced_at
        const upd = { last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        if (synced > 0 || !contact.last_message_at) {
          const latestTime = msgData.data[0]?.created_time;
          if (latestTime) upd.last_message_at = latestTime;
        }
        await supabase.from('facebook_contacts').update(upd).eq('id', contact.id);

        totalSynced += synced;
        processedCount++;
        if (synced > 0) results.push({ contact: contact.fb_name, synced });
        if (io) io.emit('batch_progress', { type: 'sync_messages', current: i + 1, total, name: contact.fb_name, status: synced > 0 ? 'synced' : 'up_to_date', synced });
      } catch (err) {
        totalErrors++;
        // Vẫn đánh dấu đã sync để không retry liên tục
        try { await supabase.from('facebook_contacts').update({ last_synced_at: new Date().toISOString() }).eq('id', contact.id); } catch (_) {}
        if (io) io.emit('batch_progress', { type: 'sync_messages', current: i + 1, total, name: contact.fb_name, status: 'error', error: err.message });
      }

      // Rate limit: 50ms giữa mỗi contact (tránh FB API throttle)
      if (i < contacts.length - 1) await new Promise(r => setTimeout(r, 50));
    }

    const nextOffset = offsetIdx + contacts.length;
    const done = nextOffset >= total;
    const summary = { total, totalSynced, totalErrors, processedCount, nextOffset: done ? 0 : nextOffset, done, allContacts: allContacts.length, mode, details: results };
    if (io) io.emit('batch_done', { type: 'sync_messages', ...summary });
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// AUTO-LEAD CONFIG — Điều kiện tự động tạo Lead
// ═══════════════════════════════════════════════════════════════

const { getConfig: getAutoLeadConfig, loadConfig: loadAutoLeadConfig, saveConfig: saveAutoLeadConfig, DEFAULT_CONFIG: AUTO_LEAD_DEFAULTS } = require('../config/autoLeadConfig');

// Preload config vào cache khi khởi động
loadAutoLeadConfig().then(() => console.log('[AutoLead] ✅ Config loaded from DB'));

// GET /facebook/auto-lead-config
r.get('/auto-lead-config', authMiddleware, async (req, res) => {
  try {
    const config = await loadAutoLeadConfig();
    res.json(config);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /facebook/auto-lead-config
r.put('/auto-lead-config', authMiddleware, async (req, res) => {
  try {
    const saved = await saveAutoLeadConfig(req.body);
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

async function loadScanConfig() {
  try {
    const { data } = await supabase.from('app_settings')
      .select('value').eq('key', 'lead_scan_config').single();
    if (data?.value) scanConfig = { enabled: false, interval_minutes: 60, ...data.value };
  } catch (e) { console.warn('[LeadScan] DB config load error:', e.message); }
  return scanConfig;
}
async function saveScanConfig(cfg) {
  scanConfig = { ...scanConfig, ...cfg };
  await supabase.from('app_settings').upsert({
    key: 'lead_scan_config',
    value: scanConfig,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
  return scanConfig;
}

// Preload
loadScanConfig().then(() => console.log('[LeadScan] ✅ Config loaded'));

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

// GET /facebook/audit-phone-sync — đối soát contact/customer/lead
r.get('/audit-phone-sync', authMiddleware, async (req, res) => {
  try {
    const { data: contacts } = await supabase.from('facebook_contacts')
      .select('id, fb_name, phone, lead_id, customer_id, page_id, updated_at')
      .not('psid', 'is', null)
      .limit(5000);

    const leadIds = [...new Set((contacts || []).map(c => c.lead_id).filter(Boolean))];
    const { data: leads } = leadIds.length
      ? await supabase.from('crm_leads').select('id, code, title, customer_id, description, install_address').in('id', leadIds)
      : { data: [] };
    const leadMap = {};
    (leads || []).forEach(l => { leadMap[l.id] = l; });

    const custIds = [...new Set([
      ...(contacts || []).map(c => c.customer_id).filter(Boolean),
      ...(leads || []).map(l => l.customer_id).filter(Boolean),
    ])];
    const { data: customers } = custIds.length
      ? await supabase.from('customers').select('id, full_name, phone, address').in('id', custIds)
      : { data: [] };
    const custMap = {};
    (customers || []).forEach(c => { custMap[c.id] = c; });

    const summary = {
      total_contacts: contacts?.length || 0,
      contacts_with_phone: 0,
      contacts_with_lead: 0,
      leads_with_customer_phone: 0,
      mismatches_contact_has_phone_customer_missing: 0,
      mismatches_lead_exists_no_customer_phone: 0,
      samples: [],
    };

    for (const c of (contacts || [])) {
      const lead = c.lead_id ? leadMap[c.lead_id] : null;
      const cust = custMap[c.customer_id || lead?.customer_id] || null;
      const contactPhone = c.phone && String(c.phone).trim() ? c.phone : null;
      const customerPhone = cust?.phone && String(cust.phone).trim() ? cust.phone : null;
      if (contactPhone) summary.contacts_with_phone++;
      if (lead) summary.contacts_with_lead++;
      if (lead && customerPhone) summary.leads_with_customer_phone++;

      if (contactPhone && !customerPhone) {
        summary.mismatches_contact_has_phone_customer_missing++;
        if (summary.samples.length < 100) {
          summary.samples.push({
            kind: 'contact_has_phone_customer_missing',
            contact_id: c.id,
            fb_name: c.fb_name,
            contact_phone: contactPhone,
            lead_id: c.lead_id,
            lead_code: lead?.code || null,
            customer_id: cust?.id || c.customer_id || lead?.customer_id || null,
            customer_phone: customerPhone,
          });
        }
      } else if (lead && !customerPhone) {
        summary.mismatches_lead_exists_no_customer_phone++;
        if (summary.samples.length < 100) {
          summary.samples.push({
            kind: 'lead_exists_no_customer_phone',
            contact_id: c.id,
            fb_name: c.fb_name,
            contact_phone: contactPhone,
            lead_id: c.lead_id,
            lead_code: lead?.code || null,
            customer_id: cust?.id || c.customer_id || lead?.customer_id || null,
            customer_phone: customerPhone,
          });
        }
      }
    }

    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /facebook/lead-scan/config — xem cấu hình
r.get('/lead-scan/config', authMiddleware, async (req, res) => {
  const cfg = await loadScanConfig();
  res.json({ ...cfg, timer_active: !!scanTimer });
});

// PUT /facebook/lead-scan/config — cập nhật cấu hình
r.put('/lead-scan/config', authMiddleware, async (req, res) => {
  try {
    const { enabled, interval_minutes } = req.body;
    const cfg = await saveScanConfig({
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
    const io = r._ioRef;
    const { data: stuckContacts } = await supabase.from('facebook_contacts')
      .select('id, page_id, psid, fb_name, lead_id')
      .or('fb_name.eq.Facebook User,fb_name.eq.User,fb_name.is.null')
      .limit(100);
    if (!stuckContacts?.length) return res.json({ updated: 0, message: 'Không có contact nào cần cập nhật' });

    const total = stuckContacts.length;
    let updated = 0;
    if (io) io.emit('batch_progress', { type: 'refresh_names', phase: 'start', total, current: 0 });

    for (let i = 0; i < stuckContacts.length; i++) {
      const c = stuckContacts[i];
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
        if (io) io.emit('batch_progress', { type: 'refresh_names', current: i + 1, total, name: profile.name, oldName: c.fb_name, status: 'updated' });
        console.log(`[FB Refresh] ${c.psid}: "${c.fb_name}" → "${profile.name}"`);
      } else {
        if (io) io.emit('batch_progress', { type: 'refresh_names', current: i + 1, total, name: c.fb_name, status: 'unchanged' });
      }
    }
    const summary = { updated, total };
    if (io) io.emit('batch_done', { type: 'refresh_names', ...summary });
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/webhook-logs', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase.from('facebook_webhook_logs')
      .select('*')
      .order('processed_at', { ascending: false })
      .limit(100);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/webhook-logs', authMiddleware, async (req, res) => {
  try {
    await supabase.from('facebook_webhook_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// AUTO PIPELINE CONTROL (backend-managed realtime)
// ═══════════════════════════════════════════════════════════════
r.get('/auto-pipeline/status', authMiddleware, async (_req, res) => {
  res.json(getAutoState());
});

r.post('/auto-pipeline/start', authMiddleware, async (_req, res) => {
  if (!autoPipeline.running) {
    autoPipeline.enabled = true;
    runAutoPipelineLoop().catch(err => {
      console.error('[AutoPipeline] FATAL', err.message);
      pushAutoLog(`❌ Auto pipeline lỗi nghiêm trọng: ${err.message}`, 'error');
      autoPipeline.running = false;
      autoPipeline.enabled = false;
      autoPipeline.phase = 'idle';
      autoPipeline.step = -1;
      autoPipeline.stepLabel = null;
      emitAutoState();
    });
  } else {
    autoPipeline.enabled = true;
    emitAutoState();
  }
  res.json({ ok: true, state: getAutoState() });
});

r.post('/auto-pipeline/stop', authMiddleware, async (_req, res) => {
  autoPipeline.stopRequested = true;
  autoPipeline.enabled = false;
  pushAutoLog('🛑 Đã yêu cầu dừng auto pipeline');
  res.json({ ok: true, state: getAutoState() });
});

module.exports = r;
