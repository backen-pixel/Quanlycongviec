/**
 * Auto Tool v2 — Công cụ tự động Facebook → Lead
 *
 * Luồng mỗi vòng:
 * 1. Kéo contacts (có PSID), sắp xếp mới nhất trước
 * 2. Từng contact: đồng bộ tin Graph → DB (nếu lỗi vẫn tiếp tục quét DB)
 * 3. Quét SĐT từ tin inbound trong DB
 * 4. Có SĐT + chưa lead → tạo lead; đã có lead → cập nhật SĐT
 *
 * Chạy liên tục: mỗi vòng xử lý 1 batch (offset tăng dần),
 * khi hết contacts thì reset offset, nghỉ rồi lặp lại.
 */

const { supabase } = require('../config/supabase');

// ── State ──
const state = {
  enabled: false,
  running: false,
  stopRequested: false,
  cycleCount: 0,
  currentContact: null,
  processed: 0,
  totalContacts: 0,
  totalPool: 0,
  offset: 0,
  synced: 0,
  syncErrors: 0,
  phonesFound: 0,
  leadsCreated: 0,
  leadsUpdated: 0,
  errors: 0,
  startedAt: null,
  lastUpdatedAt: null,
  logs: [],
  config: {
    limit: 100,           // contacts mỗi batch
    graphPages: 10,       // trang Graph mỗi contact
    pauseSec: 60,         // nghỉ giữa các batch (giây)
    cyclePauseSec: 300,   // nghỉ khi hết pool, trước khi lặp lại từ đầu
    delayMs: 100,         // delay giữa các contact (ms) — tránh rate limit
  },
};

// ── IO ref (socket.io) ──
let _io = null;
function setIO(io) { _io = io; }

function emit() {
  if (_io) _io.emit('auto_tool_state', getState());
}

function pushLog(text, level = 'info') {
  state.logs.push({ ts: new Date().toISOString(), text, level });
  if (state.logs.length > 300) state.logs = state.logs.slice(-200);
  state.lastUpdatedAt = new Date().toISOString();
  console.log(`[AutoTool] ${text}`);
  emit();
}

function getState() {
  return {
    enabled: state.enabled,
    running: state.running,
    cycleCount: state.cycleCount,
    currentContact: state.currentContact,
    processed: state.processed,
    totalContacts: state.totalContacts,
    totalPool: state.totalPool,
    offset: state.offset,
    synced: state.synced,
    syncErrors: state.syncErrors,
    phonesFound: state.phonesFound,
    leadsCreated: state.leadsCreated,
    leadsUpdated: state.leadsUpdated,
    errors: state.errors,
    startedAt: state.startedAt,
    lastUpdatedAt: state.lastUpdatedAt,
    logs: state.logs.slice(-100),
    config: { ...state.config },
  };
}

function getConfig() { return { ...state.config }; }

function setConfig(partial) {
  if (!partial || typeof partial !== 'object') return;
  if (partial.limit != null) state.config.limit = Math.min(1000, Math.max(1, parseInt(partial.limit, 10) || 100));
  if (partial.graphPages != null) state.config.graphPages = Math.min(30, Math.max(1, parseInt(partial.graphPages, 10) || 10));
  if (partial.pauseSec != null) state.config.pauseSec = Math.min(3600, Math.max(0, parseInt(partial.pauseSec, 10) || 60));
  if (partial.cyclePauseSec != null) state.config.cyclePauseSec = Math.min(3600, Math.max(0, parseInt(partial.cyclePauseSec, 10) || 300));
  if (partial.delayMs != null) state.config.delayMs = Math.min(5000, Math.max(0, parseInt(partial.delayMs, 10) || 100));
  supabase.from('app_settings').upsert({
    key: 'auto_tool_config',
    value: state.config,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' }).then(() => {}).catch(() => {});
}

async function loadConfigFromDb() {
  try {
    const { data } = await supabase.from('app_settings')
      .select('value').eq('key', 'auto_tool_config').maybeSingle();
    if (data?.value && typeof data.value === 'object') {
      // Gán trực tiếp, KHÔNG gọi setConfig (tránh ghi ngược DB)
      const v = data.value;
      if (v.limit != null) state.config.limit = Math.min(1000, Math.max(1, parseInt(v.limit, 10) || 100));
      if (v.graphPages != null) state.config.graphPages = Math.min(30, Math.max(1, parseInt(v.graphPages, 10) || 10));
      if (v.pauseSec != null) state.config.pauseSec = Math.min(3600, Math.max(0, parseInt(v.pauseSec, 10) || 60));
      if (v.cyclePauseSec != null) state.config.cyclePauseSec = Math.min(3600, Math.max(0, parseInt(v.cyclePauseSec, 10) || 300));
      if (v.delayMs != null) state.config.delayMs = Math.min(5000, Math.max(0, parseInt(v.delayMs, 10) || 100));
    }
  } catch (e) {
    console.warn('[AutoTool] loadConfig:', e.message);
  }
}

// ── Core functions (injected from facebook.js) ──
let _coreFns = null;
function injectCoreFunctions(fns) { _coreFns = fns; }

// ── Count total contacts in pool ──
async function countTotalContacts() {
  const { count, error } = await supabase
    .from('facebook_contacts')
    .select('id', { count: 'exact', head: true })
    .not('psid', 'is', null);
  if (error) return 0;
  return count || 0;
}

// ── Load contacts with offset (mới nhất trước) ──
async function loadContacts(limit, offset) {
  const lim = Math.min(1000, Math.max(1, limit));
  const off = Math.max(0, offset);
  const { data, error } = await supabase
    .from('facebook_contacts')
    .select('id, psid, page_id, fb_name, lead_id, phone, customer_id, last_message_at, created_at')
    .not('psid', 'is', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(off, off + lim - 1);
  if (error) {
    console.error('[AutoTool] loadContacts:', error.message);
    return [];
  }
  return data || [];
}

// ── Run one batch ──
async function runOneBatch() {
  if (!_coreFns) {
    pushLog('❌ Core functions chưa được inject', 'error');
    return { done: true };
  }

  const { graphSyncMessagesForContactRow, extractInboundContactInfo, createLeadFromFacebook } = _coreFns;
  const cfg = state.config;

  // Kéo contacts batch
  const contacts = await loadContacts(cfg.limit, state.offset);
  state.totalContacts = contacts.length;
  emit();

  if (!contacts.length) {
    pushLog(`📭 Hết contacts (offset ${state.offset}). Sẽ lặp lại từ đầu.`);
    return { done: true };
  }

  pushLog(`📋 Batch: ${contacts.length} contacts (offset ${state.offset}, pool ~${state.totalPool})`);

  const pageTokens = {};
  let batchSynced = 0;
  let batchPhones = 0;
  let batchLeads = 0;
  let batchUpdated = 0;
  let batchErrors = 0;

  for (let i = 0; i < contacts.length; i++) {
    if (state.stopRequested) {
      pushLog('🛑 Đã dừng theo yêu cầu');
      return { done: true };
    }

    const contact = contacts[i];
    state.currentContact = contact.fb_name || contact.id;
    state.processed++;
    emit();

    try {
      // ── Bước 2: Đồng bộ tin nhắn Graph → DB ──
      let syncOk = false;
      try {
        const syncRes = await graphSyncMessagesForContactRow(contact, pageTokens, {
          maxGraphPages: cfg.graphPages,
        });
        if (syncRes.synced > 0) {
          batchSynced += syncRes.synced;
          state.synced += syncRes.synced;
        }
        if (syncRes.status === 'error') {
          state.syncErrors++;
          // Không dừng — vẫn quét SĐT từ tin đã có trong DB
        } else if (syncRes.status === 'no_token') {
          state.syncErrors++;
          pushLog(`⚠️ ${contact.fb_name}: không có token page ${contact.page_id}`, 'warn');
          // Vẫn tiếp tục quét DB
        } else {
          syncOk = true;
        }
      } catch (syncErr) {
        state.syncErrors++;
        // Graph lỗi nhưng vẫn quét SĐT từ DB
      }

      // ── Bước 3: Quét SĐT từ tin inbound trong DB ──
      const { data: messages } = await supabase
        .from('facebook_messages')
        .select('id, content, direction, message_type, created_at')
        .eq('contact_id', contact.id)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(500);

      const inboundInfo = extractInboundContactInfo(messages || []);
      const phone = inboundInfo.phone || null;

      if (phone) {
        batchPhones++;
        state.phonesFound++;

        // Cập nhật SĐT vào contact
        const currentPhone = contact.phone ? String(contact.phone).trim() : '';
        if (!currentPhone || currentPhone !== phone) {
          await supabase.from('facebook_contacts')
            .update({ phone, updated_at: new Date().toISOString() })
            .eq('id', contact.id);
        }

        // ── Bước 4: Tạo lead hoặc cập nhật ──
        if (!contact.lead_id) {
          const lead = await createLeadFromFacebook(contact.page_id, contact, 'Auto Tool', {
            full_name: contact.fb_name || 'KH Facebook',
            phone,
            address: inboundInfo.address || undefined,
          });
          if (lead?.id) {
            batchLeads++;
            state.leadsCreated++;
            pushLog(`✅ ${contact.fb_name}: SĐT ${phone} → Lead ${lead.code || lead.id}`, 'ok');
          }
        } else {
          // Đã có lead → cập nhật SĐT
          const updated = await updateLeadPhone(contact.lead_id, phone, inboundInfo.address);
          if (updated) {
            batchUpdated++;
            state.leadsUpdated++;
          }
        }
      }

    } catch (err) {
      batchErrors++;
      state.errors++;
      pushLog(`❌ ${contact.fb_name}: ${err.message}`, 'error');
    }

    // Delay giữa contacts
    if (cfg.delayMs > 0 && i < contacts.length - 1) {
      await new Promise(r => setTimeout(r, cfg.delayMs));
    }
  }

  state.currentContact = null;
  state.offset += contacts.length;

  pushLog(
    `📊 Batch xong: ${contacts.length} contacts, +${batchSynced} tin, ${batchPhones} SĐT, ${batchLeads} lead mới, ${batchUpdated} cập nhật` +
    (batchErrors > 0 ? `, ${batchErrors} lỗi` : ''),
    batchErrors > 0 ? 'warn' : 'ok',
  );
  emit();

  return { done: false };
}

// ── Update lead phone (helper) ──
async function updateLeadPhone(leadId, phone, address) {
  if (!leadId || !phone) return false;
  try {
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, customer_id, description')
      .eq('id', leadId).single();
    if (!lead) return false;

    let changed = false;

    // Update customer phone
    if (lead.customer_id) {
      const { data: cust } = await supabase.from('customers')
        .select('id, phone').eq('id', lead.customer_id).single();
      if (cust && (!cust.phone || !String(cust.phone).trim())) {
        await supabase.from('customers')
          .update({ phone, updated_at: new Date().toISOString() })
          .eq('id', cust.id);
        changed = true;
      }
    }

    // Update lead description
    let desc = lead.description || '';
    const origDesc = desc;
    if (/SĐT:/.test(desc)) {
      const match = desc.match(/SĐT:\s*(\S*)/);
      if (!match?.[1] || match[1] !== phone) {
        desc = desc.replace(/SĐT:.*$/m, `SĐT: ${phone}`);
      }
    } else {
      desc = `${desc.trimEnd()}\nSĐT: ${phone}`.trim();
    }
    if (address) {
      if (/Địa chỉ:/.test(desc)) {
        desc = desc.replace(/Địa chỉ:.*$/m, `Địa chỉ: ${address}`);
      } else {
        desc = `${desc.trimEnd()}\nĐịa chỉ: ${address}`.trim();
      }
    }
    if (desc !== origDesc) {
      await supabase.from('crm_leads')
        .update({ description: desc, updated_at: new Date().toISOString() })
        .eq('id', leadId);
      changed = true;
    }
    return changed;
  } catch (e) {
    console.warn('[AutoTool] updateLeadPhone:', e.message);
    return false;
  }
}

// ── Sleep helper (interruptible) ──
async function interruptibleSleep(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (state.stopRequested || !state.enabled) return false;
    await new Promise(r => setTimeout(r, 1000));
  }
  return true;
}

// ── Main loop ──
async function startLoop() {
  if (state.running) return;
  state.running = true;
  state.stopRequested = false;
  state.enabled = true;
  state.startedAt = new Date().toISOString();
  state.cycleCount = 0;
  state.offset = 0;
  state.processed = 0;
  state.synced = 0;
  state.syncErrors = 0;
  state.phonesFound = 0;
  state.leadsCreated = 0;
  state.leadsUpdated = 0;
  state.errors = 0;
  state.logs = [];
  emit();

  pushLog('🚀 Auto Tool bắt đầu chạy (liên tục, user mới nhất trước)');

  while (state.enabled && !state.stopRequested) {
    // Đếm pool
    state.totalPool = await countTotalContacts();

    if (state.offset === 0) {
      state.cycleCount++;
      pushLog(`🔄 Vòng ${state.cycleCount} — bắt đầu từ user mới nhất (pool: ${state.totalPool})`);
    }
    emit();

    try {
      const result = await runOneBatch();

      if (result.done) {
        // Hết pool → reset offset, nghỉ dài rồi lặp lại
        state.offset = 0;
        state.currentContact = null;
        pushLog(
          `🏁 Vòng ${state.cycleCount} hoàn tất: ${state.processed} contacts, ${state.synced} tin, ${state.phonesFound} SĐT, ${state.leadsCreated} lead, ${state.leadsUpdated} cập nhật`,
          'ok',
        );
        emit();

        if (state.stopRequested || !state.enabled) break;

        const cyclePause = state.config.cyclePauseSec;
        if (cyclePause > 0) {
          pushLog(`⏸️ Nghỉ ${cyclePause}s trước vòng mới...`);
          emit();
          const ok = await interruptibleSleep(cyclePause * 1000);
          if (!ok) break;
        }
      } else {
        // Còn contacts → nghỉ ngắn rồi batch tiếp
        if (state.stopRequested || !state.enabled) break;

        const batchPause = state.config.pauseSec;
        if (batchPause > 0) {
          pushLog(`⏸️ Nghỉ ${batchPause}s trước batch tiếp (offset ${state.offset})...`);
          emit();
          const ok = await interruptibleSleep(batchPause * 1000);
          if (!ok) break;
        }
      }
    } catch (err) {
      pushLog(`❌ Lỗi batch: ${err.message}`, 'error');
      state.errors++;
      // Nghỉ 10s rồi thử tiếp
      await interruptibleSleep(10000);
    }
  }

  state.running = false;
  state.enabled = false;
  state.currentContact = null;
  pushLog('🛑 Auto Tool đã dừng');
  emit();
}

function stop() {
  state.stopRequested = true;
  state.enabled = false;
  pushLog('🛑 Đang dừng Auto Tool...');
  emit();
}

module.exports = {
  getState,
  getConfig,
  setConfig,
  loadConfigFromDb,
  setIO,
  injectCoreFunctions,
  startLoop,
  stop,
};
