/**
 * Auto Tool v2 — Công cụ tự động Facebook → Lead
 *
 * Luồng mỗi vòng:
 * 1. Kéo contacts (có PSID), sắp xếp mới nhất trước
 * 2. Từng contact: đồng bộ tin Graph → DB (nếu lỗi vẫn tiếp tục quét DB)
 * 3. Quét SĐT từ tin inbound trong DB
 * 4. Có SĐT + chưa lead → tạo lead; đã có lead → cập nhật SĐT
 *
 * Chạy liên tục: mỗi vòng xử lý tối đa `batchesPerCycle` batch (mặc định 1 = chỉ 100/batch rồi nghỉ),
 * không quét offset tiếp đến hết pool. Khi hết contacts thì reset offset, nghỉ rồi lặp lại.
 */

const { supabase } = require('../config/supabase');
const { sortFacebookContactsNewestFirst } = require('./facebookContactActivity');

// ── State ──
const state = {
  enabled: false,
  running: false,
  stopRequested: false,
  cycleCount: 0,
  currentContact: null,
  processed: 0,
  processedTotal: 0,
  totalContacts: 0,
  totalPool: 0,
  offset: 0,
  /** Số batch đã chạy trong vòng hiện tại (reset khi offset về 0 sau cycle pause). */
  batchesInCycle: 0,
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
    /** Số batch tối đa mỗi vòng (offset chỉ tăng trong vòng này). 1 = chỉ chạy 1×limit contact rồi nghỉ vòng — không quét hết pool. */
    batchesPerCycle: 1,
    pauseSec: 60,         // nghỉ giữa các batch trong cùng một vòng (khi batchesPerCycle > 1)
    cyclePauseSec: 300,   // nghỉ cuối vòng (sau đủ batch hoặc hết contact)
    delayMs: 100,         // delay giữa các contact (ms) — tránh rate limit
  },
};

// ── IO ref (socket.io) ──
let _io = null;
function setIO(io) { _io = io; }

function emit() {
  if (_io) _io.emit('auto_tool_state', getState());
}

function phoneDigitsLen(s) {
  if (s == null || s === '') return 0;
  return String(s).replace(/\D/g, '').length;
}

/** KH đã có SĐT chuẩn (≥9 số) → không dùng SĐT trích từ chat cho luồng tự động. */
async function customerHasCanonicalPhone(contact) {
  let cid = contact.customer_id || null;
  if (!cid && contact.lead_id) {
    const { data: ld } = await supabase.from('crm_leads').select('customer_id').eq('id', contact.lead_id).maybeSingle();
    cid = ld?.customer_id || null;
  }
  if (!cid) return false;
  const { data: cust } = await supabase.from('customers').select('phone').eq('id', cid).maybeSingle();
  return phoneDigitsLen(cust?.phone) >= 9;
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
    processedTotal: state.processedTotal,
    totalContacts: state.totalContacts,
    totalPool: state.totalPool,
    offset: state.offset,
    batchesInCycle: state.batchesInCycle,
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
  if (partial.batchesPerCycle != null) state.config.batchesPerCycle = Math.min(500, Math.max(1, parseInt(partial.batchesPerCycle, 10) || 1));
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
      if (v.batchesPerCycle != null) state.config.batchesPerCycle = Math.min(500, Math.max(1, parseInt(v.batchesPerCycle, 10) || 1));
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

// ── Load contacts with newest activity first ──
async function loadContacts(limit, offset) {
  const lim = Math.min(1000, Math.max(1, limit));
  const off = Math.max(0, offset);

  // Lấy 2 nhóm rồi sort lại bằng helper chuẩn:
  // 1) có last_message_at
  // 2) chưa có last_message_at nhưng mới tạo
  // Nếu chỉ ORDER BY last_message_at rồi LIMIT thì có thể bỏ sót user mới tạo.
  const pick = 'id, psid, page_id, fb_name, lead_id, phone, customer_id, last_message_at, created_at';

  const [{ data: withMsg, error: err1 }, { data: noMsg, error: err2 }] = await Promise.all([
    supabase
      .from('facebook_contacts')
      .select(pick)
      .not('psid', 'is', null)
      .not('last_message_at', 'is', null)
      .order('last_message_at', { ascending: false })
      .limit(Math.max(lim * 3, 300)),
    supabase
      .from('facebook_contacts')
      .select(pick)
      .not('psid', 'is', null)
      .is('last_message_at', null)
      .order('created_at', { ascending: false })
      .limit(Math.max(lim * 3, 300)),
  ]);

  if (err1 || err2) {
    console.error('[AutoTool] loadContacts:', err1?.message || err2?.message || 'unknown');
    return [];
  }

  const merged = sortFacebookContactsNewestFirst([...(withMsg || []), ...(noMsg || [])]);
  return merged.slice(off, off + lim);
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

  state.processed = 0;

  for (let i = 0; i < contacts.length; i++) {
    if (state.stopRequested) {
      pushLog('🛑 Đã dừng theo yêu cầu');
      return { done: true };
    }

    const contact = contacts[i];
    state.currentContact = contact.fb_name || contact.id;
    state.processed = i + 1;
    state.processedTotal++;
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
      const phoneRaw = inboundInfo.phone || null;
      const custPhoneOk = await customerHasCanonicalPhone(contact);
      const phone = phoneRaw && !custPhoneOk ? phoneRaw : null;

      if (phone) {
        batchPhones++;
        state.phonesFound++;

        // Không ghi SĐT vào facebook_contacts — nguồn chuẩn là customers.phone

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
  state.batchesInCycle = 0;
  state.processed = 0;
  state.processedTotal = 0;
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
      const maxBatches = Math.max(1, parseInt(state.config.batchesPerCycle, 10) || 1);

      if (result.done) {
        // Hết contact tại offset hiện tại → reset offset, nghỉ vòng
        state.offset = 0;
        state.batchesInCycle = 0;
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
        state.batchesInCycle = (state.batchesInCycle || 0) + 1;

        if (state.batchesInCycle >= maxBatches) {
          // Đủ số batch trong vòng — không tăng offset tiếp (không quét hết pool)
          state.offset = 0;
          state.batchesInCycle = 0;
          state.currentContact = null;
          pushLog(
            `🏁 Vòng ${state.cycleCount}: đã chạy ${maxBatches} batch (tối đa ${maxBatches * state.config.limit} contact) — không quét tiếp offset trong pool (~${state.totalPool} contact). Nghỉ trước vòng sau.`,
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
          // Cùng vòng, còn batch → nghỉ ngắn rồi batch tiếp (offset đã tăng trong runOneBatch)
          if (state.stopRequested || !state.enabled) break;

          const batchPause = state.config.pauseSec;
          if (batchPause > 0) {
            pushLog(`⏸️ Nghỉ ${batchPause}s trước batch tiếp (offset ${state.offset})...`);
            emit();
            const ok = await interruptibleSleep(batchPause * 1000);
            if (!ok) break;
          }
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
