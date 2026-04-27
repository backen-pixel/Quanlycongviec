/**
 * Auto Tool — Công cụ tự động Facebook → Lead (viết lại đơn giản)
 *
 * Luồng:
 * 1. Kéo contacts (có PSID)
 * 2. Đồng bộ tin nhắn từ Graph API → DB
 * 3. Quét SĐT từ tin inbound
 * 4. Nếu có SĐT + chưa có lead → tạo lead
 *
 * Không engine phức tạp, không pool/stale/reconcile/dedup.
 * Một vòng lặp duy nhất, tuần tự, dễ debug.
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
  synced: 0,
  phonesFound: 0,
  leadsCreated: 0,
  errors: 0,
  startedAt: null,
  lastUpdatedAt: null,
  logs: [],       // { ts, text, level }
  config: {
    limit: 100,           // contacts mỗi vòng
    graphPages: 10,       // trang Graph mỗi contact
    pauseSec: 300,        // nghỉ giữa các vòng (giây)
    delayMs: 50,          // delay giữa các contact (ms)
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
  if (state.logs.length > 200) state.logs = state.logs.slice(-150);
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
    synced: state.synced,
    phonesFound: state.phonesFound,
    leadsCreated: state.leadsCreated,
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
  if (partial.pauseSec != null) state.config.pauseSec = Math.min(3600, Math.max(0, parseInt(partial.pauseSec, 10) || 300));
  if (partial.delayMs != null) state.config.delayMs = Math.min(5000, Math.max(0, parseInt(partial.delayMs, 10) || 50));
  // Persist to DB
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
      setConfig(data.value);
    }
  } catch (e) {
    console.warn('[AutoTool] loadConfig:', e.message);
  }
}

// ── Core functions (injected from facebook.js to avoid circular deps) ──
let _coreFns = null;
function injectCoreFunctions(fns) {
  _coreFns = fns;
}

// ── Load contacts ──
async function loadContacts(limit) {
  const lim = Math.min(1000, Math.max(1, limit));
  // Lấy tất cả contacts có PSID, sắp xếp theo hoạt động mới nhất
  const { data, error } = await supabase
    .from('facebook_contacts')
    .select('id, psid, page_id, fb_name, lead_id, phone, customer_id, last_message_at, created_at')
    .not('psid', 'is', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(lim);
  if (error) {
    console.error('[AutoTool] loadContacts:', error.message);
    return [];
  }
  return data || [];
}

// ── Run one cycle ──
async function runOneCycle() {
  if (!_coreFns) {
    pushLog('❌ Core functions chưa được inject', 'error');
    return;
  }

  const { graphSyncMessagesForContactRow, extractInboundContactInfo, createLeadFromFacebook, extractContactInfo, inboundMessageEligibleForPhoneScan } = _coreFns;
  const cfg = state.config;

  // Reset cycle stats
  state.processed = 0;
  state.synced = 0;
  state.phonesFound = 0;
  state.leadsCreated = 0;
  state.errors = 0;
  state.currentContact = null;

  // 1. Kéo contacts
  pushLog(`📋 Đang kéo danh sách contacts (tối đa ${cfg.limit})...`);
  const contacts = await loadContacts(cfg.limit);
  state.totalContacts = contacts.length;
  emit();

  if (!contacts.length) {
    pushLog('ℹ️ Không có contact nào để xử lý');
    return;
  }
  pushLog(`✅ Tìm thấy ${contacts.length} contacts`);

  const pageTokens = {};

  // 2–4. Xử lý từng contact
  for (let i = 0; i < contacts.length; i++) {
    if (state.stopRequested) {
      pushLog('🛑 Đã dừng theo yêu cầu');
      break;
    }

    const contact = contacts[i];
    state.currentContact = contact.fb_name || contact.id;
    state.processed = i + 1;
    emit();

    try {
      // 2. Đồng bộ tin nhắn Graph → DB
      const syncRes = await graphSyncMessagesForContactRow(contact, pageTokens, {
        maxGraphPages: cfg.graphPages,
      });

      if (syncRes.synced > 0) {
        state.synced += syncRes.synced;
      }

      if (syncRes.status === 'error') {
        state.errors++;
        pushLog(`⚠️ ${contact.fb_name}: sync lỗi — ${syncRes.error || 'unknown'}`, 'error');
        continue;
      }

      if (syncRes.status === 'no_token') {
        state.errors++;
        pushLog(`⚠️ ${contact.fb_name}: không có token cho page ${contact.page_id}`, 'error');
        continue;
      }

      // 3. Quét SĐT từ tin inbound trong DB
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
        state.phonesFound++;

        // Cập nhật SĐT vào contact nếu chưa có hoặc khác
        const currentPhone = contact.phone ? String(contact.phone).trim() : '';
        if (!currentPhone || currentPhone !== phone) {
          await supabase.from('facebook_contacts')
            .update({ phone, updated_at: new Date().toISOString() })
            .eq('id', contact.id);
        }

        // 4. Tạo lead nếu chưa có
        if (!contact.lead_id) {
          const lead = await createLeadFromFacebook(contact.page_id, contact, 'Auto Tool', {
            full_name: contact.fb_name || 'KH Facebook',
            phone,
            address: inboundInfo.address || undefined,
          });

          if (lead?.id) {
            state.leadsCreated++;
            pushLog(`✅ ${contact.fb_name}: SĐT ${phone} → Lead ${lead.code || lead.id}`, 'ok');
          }
        } else {
          // Đã có lead → cập nhật SĐT vào lead/customer nếu cần
          await updateLeadPhone(contact.lead_id, phone, inboundInfo.address);
        }
      }

      // Log mỗi 20 contacts
      if ((i + 1) % 20 === 0) {
        pushLog(`📊 Đã xử lý ${i + 1}/${contacts.length} — sync: ${state.synced} tin, SĐT: ${state.phonesFound}, lead: ${state.leadsCreated}`);
      }

    } catch (err) {
      state.errors++;
      pushLog(`❌ ${contact.fb_name}: ${err.message}`, 'error');
    }

    // Delay giữa các contact
    if (cfg.delayMs > 0 && i < contacts.length - 1) {
      await new Promise(r => setTimeout(r, cfg.delayMs));
    }
  }

  state.currentContact = null;
  pushLog(
    `🏁 Vòng ${state.cycleCount} xong: ${state.processed} contacts, ${state.synced} tin, ${state.phonesFound} SĐT, ${state.leadsCreated} lead mới, ${state.errors} lỗi`,
    state.errors > 0 ? 'warn' : 'ok',
  );
  emit();
}

// ── Update lead phone (helper) ──
async function updateLeadPhone(leadId, phone, address) {
  if (!leadId || !phone) return;
  try {
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, customer_id, description')
      .eq('id', leadId).single();
    if (!lead) return;

    // Update customer phone
    if (lead.customer_id) {
      const { data: cust } = await supabase.from('customers')
        .select('id, phone').eq('id', lead.customer_id).single();
      if (cust && (!cust.phone || !String(cust.phone).trim())) {
        await supabase.from('customers')
          .update({ phone, updated_at: new Date().toISOString() })
          .eq('id', cust.id);
      }
    }

    // Update lead description
    let desc = lead.description || '';
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
    if (desc !== (lead.description || '')) {
      await supabase.from('crm_leads')
        .update({ description: desc, updated_at: new Date().toISOString() })
        .eq('id', leadId);
    }
  } catch (e) {
    console.warn('[AutoTool] updateLeadPhone:', e.message);
  }
}

// ── Main loop ──
async function startLoop() {
  if (state.running) return;
  state.running = true;
  state.stopRequested = false;
  state.enabled = true;
  state.startedAt = new Date().toISOString();
  state.cycleCount = 0;
  state.logs = [];
  emit();

  pushLog('🚀 Auto Tool bắt đầu chạy');

  while (state.enabled && !state.stopRequested) {
    state.cycleCount++;
    pushLog(`🔄 Bắt đầu vòng ${state.cycleCount}`);
    emit();

    try {
      await runOneCycle();
    } catch (err) {
      pushLog(`❌ Lỗi vòng ${state.cycleCount}: ${err.message}`, 'error');
    }

    if (state.stopRequested || !state.enabled) break;

    // Nghỉ giữa các vòng
    const pauseMs = state.config.pauseSec * 1000;
    if (pauseMs > 0) {
      pushLog(`⏸️ Nghỉ ${state.config.pauseSec}s trước vòng tiếp...`);
      emit();
      const start = Date.now();
      while (Date.now() - start < pauseMs) {
        if (state.stopRequested || !state.enabled) break;
        await new Promise(r => setTimeout(r, 1000));
      }
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
