import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';

const AUTO_INTERVAL_MS = 5 * 60 * 1000; // 5 phút
const PIPELINE_KEYS = ['sync_messages', 'create_leads', 'refresh_names', 'dedup', 'extract_phones'];
const PIPELINE_LABELS = {
  sync_messages: '📨 Đồng bộ tin nhắn',
  create_leads: '🆕 Tạo Lead',
  refresh_names: '🔄 Refresh tên',
  dedup: '🔍 Gộp trùng',
  extract_phones: '📞 Quét SĐT',
};
const API_MAP = {
  sync_messages: 'facebook/batch-sync-messages',
  create_leads: 'facebook/batch-create-leads',
  refresh_names: 'facebook/refresh-names',
  dedup: 'facebook/dedup-leads',
  extract_phones: 'facebook/batch-extract-phones',
};

// ── Global singleton state (survives component unmount) ──
if (!window.__batchAuto) {
  window.__batchAuto = {
    enabled: localStorage.getItem('batch_auto') !== 'off',
    lastRun: Date.now(),
    running: false,
    step: -1,        // current pipeline step index
    countdown: 0,    // seconds until next run
    logs: [],        // { text, status, ts }[]
    _subs: new Set(),
  };
}

const G = window.__batchAuto;

function _notify() {
  G._subs.forEach(fn => fn());
}

function _log(text, status = 'info') {
  G.logs = [...G.logs.slice(-49), { text, status, ts: Date.now() }];
  _notify();
}

async function _runPipeline() {
  if (G.running) return;
  G.running = true;
  G.logs = [];
  _log('🚀 Pipeline tự động bắt đầu...');

  for (let i = 0; i < PIPELINE_KEYS.length; i++) {
    const key = PIPELINE_KEYS[i];
    G.step = i;
    _notify();

    try {
      const { data } = await api.post(`/${API_MAP[key]}`);
      const msg = data.message || `created:${data.created ?? ''} updated:${data.updated ?? ''} merged:${data.merged ?? ''} synced:${data.totalSynced ?? ''}`.replace(/\w+:(?=\s)/g, '').trim() || 'xong';
      _log(`✅ ${PIPELINE_LABELS[key]}: ${msg}`, 'ok');
    } catch (e) {
      _log(`❌ ${PIPELINE_LABELS[key]}: ${e.response?.data?.error || e.message}`, 'error');
    }
    await new Promise(r => setTimeout(r, 300));
  }

  G.running = false;
  G.step = -1;
  G.lastRun = Date.now();
  _log('🏁 Pipeline hoàn tất!', 'ok');
  _notify();
}

// ── Global timer (created once, runs forever) ──
if (!window.__batchAutoTimer) {
  window.__batchAutoTimer = setInterval(() => {
    if (!G.enabled || G.running) return;
    const elapsed = Date.now() - G.lastRun;
    G.countdown = Math.max(0, Math.ceil((AUTO_INTERVAL_MS - elapsed) / 1000));
    if (elapsed >= AUTO_INTERVAL_MS) {
      _runPipeline();
    }
    _notify();
  }, 1000);
}

// ── Public API ──
export function triggerPipelineNow() { _runPipeline(); }

export function toggleBatchAuto() {
  G.enabled = !G.enabled;
  localStorage.setItem('batch_auto', G.enabled ? 'on' : 'off');
  if (G.enabled) G.lastRun = Date.now();
  _notify();
}

/** React hook — subscribes to global state changes */
export function useBatchAuto() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const handler = () => setTick(t => t + 1);
    G._subs.add(handler);
    return () => G._subs.delete(handler);
  }, []);

  return {
    enabled: G.enabled,
    running: G.running,
    step: G.step,
    stepLabel: G.step >= 0 ? PIPELINE_LABELS[PIPELINE_KEYS[G.step]] : null,
    totalSteps: PIPELINE_KEYS.length,
    countdown: G.countdown,
    logs: G.logs,
  };
}

export function formatCountdown(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
