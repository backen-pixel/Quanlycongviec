/**
 * Auto Tool Zalo OA — quét SĐT từ tin webhook + tạo/cập nhật lead (không Graph).
 */
const { supabase } = require('../config/supabase');
const {
  loadZaloContactsBatch,
  extractFromZaloContact,
  createLeadFromZaloContact,
  updateZaloLeadFromExtract,
} = require('./zaloBatchTools');

async function fetchOaConfig(oaId) {
  const { data } = await supabase.from('zalo_oa_accounts')
    .select('*').eq('oa_id', String(oaId)).eq('is_active', true).maybeSingle();
  return data;
}

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
  batchesInCycle: 0,
  phonesFound: 0,
  leadsCreated: 0,
  leadsUpdated: 0,
  errors: 0,
  startedAt: null,
  lastUpdatedAt: null,
  logs: [],
  config: {
    limit: 100,
    batchesPerCycle: 1,
    pauseSec: 60,
    cyclePauseSec: 300,
    delayMs: 100,
    requirePhoneForLead: true,
    forceRescanPhones: false,
  },
};

let _io = null;
function setIO(io) { _io = io; }

function emit() {
  if (_io) _io.emit('zalo_auto_tool_state', getState());
}

function pushLog(text, level = 'info') {
  state.logs.push({ ts: new Date().toISOString(), text, level });
  if (state.logs.length > 300) state.logs = state.logs.slice(-200);
  state.lastUpdatedAt = new Date().toISOString();
  console.log(`[ZaloAutoTool] ${text}`);
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
  const cfg = state.config;
  if (partial.limit != null) cfg.limit = Math.min(1000, Math.max(1, parseInt(partial.limit, 10) || 100));
  if (partial.batchesPerCycle != null) cfg.batchesPerCycle = Math.min(500, Math.max(1, parseInt(partial.batchesPerCycle, 10) || 1));
  if (partial.pauseSec != null) cfg.pauseSec = Math.min(3600, Math.max(0, parseInt(partial.pauseSec, 10) || 60));
  if (partial.cyclePauseSec != null) cfg.cyclePauseSec = Math.min(3600, Math.max(0, parseInt(partial.cyclePauseSec, 10) || 300));
  if (partial.delayMs != null) cfg.delayMs = Math.min(5000, Math.max(0, parseInt(partial.delayMs, 10) || 100));
  if (partial.requirePhoneForLead != null) cfg.requirePhoneForLead = !!partial.requirePhoneForLead;
  if (partial.forceRescanPhones != null) cfg.forceRescanPhones = !!partial.forceRescanPhones;
  supabase.from('app_settings').upsert({
    key: 'zalo_auto_tool_config',
    value: cfg,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' }).then(() => {}).catch(() => {});
}

async function loadConfigFromDb() {
  try {
    const { data } = await supabase.from('app_settings')
      .select('value').eq('key', 'zalo_auto_tool_config').maybeSingle();
    if (data?.value && typeof data.value === 'object') setConfig(data.value);
  } catch (e) {
    console.warn('[ZaloAutoTool] loadConfig:', e.message);
  }
}

async function countTotalContacts() {
  const { count } = await supabase.from('zalo_contacts').select('id', { count: 'exact', head: true });
  return count || 0;
}

async function loadContacts(limit, offset) {
  return loadZaloContactsBatch({ limit, offset });
}

async function runOneBatch() {
  const cfg = state.config;
  const contacts = await loadContacts(cfg.limit, state.offset);
  state.totalContacts = contacts.length;
  emit();

  if (!contacts.length) {
    pushLog(`📭 Hết contacts (offset ${state.offset}). Lặp lại từ đầu.`);
    return { done: true };
  }

  pushLog(`📋 Batch: ${contacts.length} contacts (offset ${state.offset})`);

  const oaCache = {};
  let batchPhones = 0;
  let batchLeads = 0;
  let batchUpdated = 0;
  state.processed = 0;

  for (let i = 0; i < contacts.length; i++) {
    if (state.stopRequested) {
      pushLog('🛑 Đã dừng');
      return { done: true };
    }

    const contact = contacts[i];
    state.currentContact = contact.display_name || contact.id;
    state.processed = i + 1;
    state.processedTotal++;
    emit();

    try {
      const { extractedPhone, extractedAddress } = await extractFromZaloContact(contact, {
        forceRescanPhones: cfg.forceRescanPhones,
      });

      if (extractedPhone) {
        batchPhones++;
        state.phonesFound++;
      }

      const phone = extractedPhone || (contact.phone && String(contact.phone).trim() ? contact.phone : null);

      if (!phone && cfg.requirePhoneForLead) {
        continue;
      }

      const { data: fresh } = await supabase.from('zalo_contacts')
        .select('lead_id, phone').eq('id', contact.id).maybeSingle();
      if (fresh?.lead_id) contact.lead_id = fresh.lead_id;

      if (!contact.lead_id) {
        if (!oaCache[contact.oa_id]) oaCache[contact.oa_id] = await fetchOaConfig(contact.oa_id);
        const oaConfig = oaCache[contact.oa_id];
        if (!oaConfig?.auto_create_lead) continue;

        const lead = await createLeadFromZaloContact(oaConfig, contact, null, phone, extractedAddress);
        if (lead?.id) {
          batchLeads++;
          state.leadsCreated++;
          pushLog(`✅ ${contact.display_name}: SĐT ${phone || '—'} → Lead ${lead.code || lead.id}`, 'ok');
        }
      } else if (phone) {
        const updated = await updateZaloLeadFromExtract(contact.lead_id, phone, extractedAddress, contact.display_name);
        if (updated) {
          batchUpdated++;
          state.leadsUpdated++;
        }
      }
    } catch (err) {
      state.errors++;
      pushLog(`❌ ${contact.display_name}: ${err.message}`, 'error');
    }

    if (cfg.delayMs > 0 && i < contacts.length - 1) {
      await new Promise((r) => setTimeout(r, cfg.delayMs));
    }
  }

  state.currentContact = null;
  state.offset += contacts.length;
  pushLog(
    `📊 Batch: ${contacts.length} KH, ${batchPhones} SĐT, ${batchLeads} lead mới, ${batchUpdated} cập nhật`,
    'ok',
  );
  emit();
  return { done: false };
}

let _loopPromise = null;

async function runLoopInner() {
  state.running = true;
  state.stopRequested = false;
  if (!state.startedAt) state.startedAt = new Date().toISOString();
  emit();

  while (state.enabled && !state.stopRequested) {
    state.cycleCount++;
    state.batchesInCycle = 0;
    pushLog(`🔄 Vòng ${state.cycleCount} bắt đầu`);

    const maxBatches = state.config.batchesPerCycle;
    while (state.batchesInCycle < maxBatches && state.enabled && !state.stopRequested) {
      const { done } = await runOneBatch();
      state.batchesInCycle++;
      if (done) {
        state.offset = 0;
        break;
      }
      if (state.batchesInCycle < maxBatches && state.config.pauseSec > 0) {
        await new Promise((r) => setTimeout(r, state.config.pauseSec * 1000));
      }
    }

    if (!state.enabled || state.stopRequested) break;

    state.offset = 0;
    const pause = state.config.cyclePauseSec;
    pushLog(`💤 Nghỉ ${pause}s trước vòng tiếp theo`);
    emit();
    await new Promise((r) => setTimeout(r, pause * 1000));
  }

  state.running = false;
  state.enabled = false;
  pushLog('⏹ Auto Tool Zalo dừng');
  emit();
}

function startLoop() {
  if (state.running) return Promise.resolve(getState());
  state.enabled = true;
  state.totalPool = 0;
  countTotalContacts().then((n) => {
    state.totalPool = n;
    emit();
  });
  _loopPromise = runLoopInner();
  return _loopPromise;
}

function stop() {
  state.stopRequested = true;
  state.enabled = false;
  emit();
}

module.exports = {
  setIO,
  getState,
  getConfig,
  setConfig,
  loadConfigFromDb,
  startLoop,
  stop,
};
