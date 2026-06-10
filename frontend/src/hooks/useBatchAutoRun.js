import { useEffect, useState } from 'react';
import api from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';

const GLOBAL_KEY = '__global__';

const EMPTY = {
  company_id: null,
  company_key: GLOBAL_KEY,
  master_enabled: false,
  enabled: false,
  running: false,
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
  batchResults: [],
  kpi: { messagesSynced: 0, contactsProcessed: 0, contactPhones: 0, customerPhones: 0, leadPhones: 0, errors: 0 },
  startedAt: null,
  pipelineConfig: null,
};

/** companyId (uuid) hoặc null/'' → khóa global. */
function keyOf(companyId) {
  return companyId != null && String(companyId).trim() !== '' ? String(companyId).trim() : GLOBAL_KEY;
}

/** Tham số company_id cho request (null cho global → bỏ qua). */
function companyParam(companyId) {
  return companyId != null && String(companyId).trim() !== '' ? String(companyId).trim() : undefined;
}

const states = new Map(); // key -> state
let masterEnabled = false;
const subs = new Set(); // { key, fn }  — key có thể là '__master__' để nghe mọi thay đổi
let socketBound = false;

const MASTER_SUB = '__master__';

function getStateFor(key) {
  return states.get(key) || { ...EMPTY, company_key: key, company_id: key === GLOBAL_KEY ? null : key, master_enabled: masterEnabled };
}

function notify(key) {
  subs.forEach((s) => {
    if (s.key === key) s.fn(getStateFor(key));
    else if (s.key === MASTER_SUB) s.fn(getStateFor(key));
  });
}

function notifyAll() {
  subs.forEach((s) => s.fn(getStateFor(s.key === MASTER_SUB ? GLOBAL_KEY : s.key)));
}

function applyState(state) {
  if (!state) return;
  const key = keyOf(state.company_id);
  states.set(key, { ...EMPTY, ...state, company_key: key });
  if (typeof state.master_enabled === 'boolean' && state.master_enabled !== masterEnabled) {
    masterEnabled = state.master_enabled;
    notifyAll();
  } else {
    notify(key);
  }
}

async function loadStatus(companyId) {
  try {
    const { data } = await api.get('/facebook/auto-pipeline/status', { params: { company_id: companyParam(companyId) } });
    applyState(data);
  } catch {
    // keep last known state
  }
}

/** Tải trạng thái tất cả công ty + master (admin). */
export async function loadStatusAll() {
  try {
    const { data } = await api.get('/facebook/auto-pipeline/status-all');
    masterEnabled = !!data?.master_enabled;
    (data?.companies || []).forEach((st) => {
      const key = keyOf(st.company_id);
      states.set(key, { ...EMPTY, ...st, company_key: key });
    });
    notifyAll();
    return data;
  } catch {
    return null;
  }
}

function ensureSocket() {
  connectSocket();
  const socket = getSocket();
  if (!socket || socketBound) return;
  socketBound = true;

  socket.on('auto_pipeline_state', (state) => {
    applyState(state);
  });

  socket.on('connect', () => {
    loadStatusAll();
  });
}

export function isMasterEnabled() {
  return masterEnabled;
}

export async function triggerPipelineNow(companyId) {
  await api.post('/facebook/auto-pipeline/start', { company_id: companyParam(companyId) });
  await loadStatus(companyId);
}

export async function toggleBatchAuto(companyId) {
  const st = getStateFor(keyOf(companyId));
  if (st.enabled || st.running) {
    await api.post('/facebook/auto-pipeline/stop', { company_id: companyParam(companyId) });
  } else {
    await api.post('/facebook/auto-pipeline/start', { company_id: companyParam(companyId) });
  }
  await loadStatus(companyId);
}

/** Bật/tắt công tắc TỔNG (master). */
export async function setMaster(enabled) {
  const { data } = await api.post('/facebook/auto-pipeline/master', { enabled: !!enabled });
  masterEnabled = !!data?.master_enabled;
  notifyAll();
  await loadStatusAll();
}

/** Lưu cấu hình auto pipeline cho 1 công ty. */
export async function saveFbAutoPipelineConfig(companyId, body) {
  await api.put('/facebook/auto-pipeline/config', { ...body, company_id: companyParam(companyId) });
  await loadStatus(companyId);
}

export function formatCountdown() {
  return '';
}

function buildAllSnapshot() {
  return {
    master_enabled: masterEnabled,
    companies: [...states.entries()].map(([key, st]) => ({ ...st, company_key: key })),
  };
}

/** Hook tổng hợp: trạng thái auto của TẤT CẢ công ty + master. Cập nhật realtime qua socket. */
export function useBatchAutoAll() {
  const [snapshot, setSnapshot] = useState(() => buildAllSnapshot());
  useEffect(() => {
    const handler = () => setSnapshot(buildAllSnapshot());
    const sub = { key: MASTER_SUB, fn: handler };
    subs.add(sub);
    ensureSocket();
    loadStatusAll().then(() => handler());
    return () => subs.delete(sub);
  }, []);
  return snapshot;
}

/** Hook trạng thái auto cho 1 công ty (companyId null = global/toàn hệ thống). */
export function useBatchAuto(companyId = null) {
  const key = keyOf(companyId);
  const [state, setState] = useState(() => getStateFor(key));

  useEffect(() => {
    const handler = (next) => setState({ ...next, master_enabled: masterEnabled });
    const sub = { key, fn: handler };
    subs.add(sub);
    ensureSocket();
    loadStatus(companyId);
    loadStatusAll();
    return () => subs.delete(sub);
  }, [key, companyId]);

  return { ...state, master_enabled: masterEnabled };
}
