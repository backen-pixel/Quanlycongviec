import { useState, useEffect } from 'react';
import api from '../lib/api';

const SYNC_TIMEOUT_SEC = 60;   // Đồng bộ 1 phút rồi chuyển bước
const WAIT_BETWEEN_MS = 5 * 60 * 1000; // 5 phút sau khi hết tất cả

// ── Global singleton state ──
if (!window.__batchAuto) {
  window.__batchAuto = {
    enabled: localStorage.getItem('batch_auto') !== 'off',
    lastCycleEnd: Date.now(),
    running: false,
    step: -1,
    totalSteps: 5,
    stepLabel: null,
    cycleCount: 0,
    syncOffset: 0,
    syncTotal: 0,
    syncDone: false,
    lastSyncProcessed: 0,
    lastSyncNewMessages: 0,
    countdown: 0,
    logs: [],
    _subs: new Set(),
  };
}

const G = window.__batchAuto;

function _notify() { G._subs.forEach(fn => fn()); }

function _log(text, status = 'info') {
  G.logs = [...G.logs.slice(-99), { text, status, ts: Date.now() }];
  _notify();
}

// ── Pipeline xen kẽ: sync(1min) → 4 bước → sync(1min) → ... → hết → 5min nghỉ ──
async function _runInterleavedPipeline() {
  if (G.running) return;
  G.running = true;
  G.syncOffset = 0;
  G.syncDone = false;
  G.logs = [];
  _log('🚀 Bắt đầu pipeline xen kẽ...');
  _notify();

  let cycleCount = 0;

  while (!G.syncDone) {
    cycleCount++;
    G.cycleCount = cycleCount;
    _log(`🔄 Chu kỳ ${cycleCount}: Đồng bộ tin nhắn từ offset ${G.syncOffset}...`);

    // ── Bước 1: Đồng bộ tin nhắn (tối đa 1 phút) ──
    G.step = 0;
    G.stepLabel = `📨 Đồng bộ tin nhắn (${G.syncOffset}+)`;
    _notify();
    try {
      const { data } = await api.post('/facebook/batch-sync-messages', {
        mode: 'smart',
        offset: G.syncOffset,
        timeout: SYNC_TIMEOUT_SEC,
      });
      const prevOffset = G.syncOffset;
      G.syncTotal = data.total || G.syncTotal;
      G.syncDone = data.done === true || !data.nextOffset;
      G.lastSyncProcessed = data.processedCount || 0;
      G.lastSyncNewMessages = data.totalSynced || 0;
      G.syncOffset = data.done ? 0 : (data.nextOffset || 0);
      const msg = G.syncDone
        ? `✅ Sync xong vòng cuối: +${data.totalSynced || 0} tin nhắn | xử lý ${data.processedCount || 0} contacts | hoàn tất ${G.syncTotal}/${G.syncTotal}`
        : `✅ Sync chu kỳ ${cycleCount}: +${data.totalSynced || 0} tin nhắn | xử lý ${data.processedCount || 0} contacts | offset ${prevOffset} → ${G.syncOffset}/${G.syncTotal}`;
      _log(msg, 'ok');
    } catch (e) {
      _log(`❌ Đồng bộ lỗi: ${e.response?.data?.error || e.message}`, 'error');
      G.syncDone = true; // tránh loop vô tận khi lỗi
    }
    await new Promise(r => setTimeout(r, 300));

    // ── Bước 2: Tạo Lead hàng loạt ──
    G.step = 1;
    G.stepLabel = '🆕 Tạo Lead hàng loạt';
    _notify();
    try {
      const { data } = await api.post('/facebook/batch-create-leads');
      _log(`✅ Tạo Lead sau sync: +${data.created || 0} mới, bỏ qua ${data.skipped || 0}`, 'ok');
    } catch (e) {
      _log(`❌ Tạo Lead: ${e.response?.data?.error || e.message}`, 'error');
    }
    await new Promise(r => setTimeout(r, 300));

    // ── Bước 3: Refresh tên ──
    G.step = 2;
    G.stepLabel = '🔄 Refresh tên';
    _notify();
    try {
      const { data } = await api.post('/facebook/refresh-names');
      _log(`✅ Refresh tên sau sync: cập nhật ${data.updated || 0}`, 'ok');
    } catch (e) {
      _log(`❌ Refresh tên: ${e.response?.data?.error || e.message}`, 'error');
    }
    await new Promise(r => setTimeout(r, 300));

    // ── Bước 4: Gộp Lead trùng ──
    G.step = 3;
    G.stepLabel = '🔍 Gộp Lead trùng';
    _notify();
    try {
      const { data } = await api.post('/facebook/dedup-leads');
      _log(`✅ Gộp trùng sau sync: ${data.merged || 0} lead`, 'ok');
    } catch (e) {
      _log(`❌ Gộp trùng: ${e.response?.data?.error || e.message}`, 'error');
    }
    await new Promise(r => setTimeout(r, 300));

    // ── Bước 5: Quét SĐT ──
    G.step = 4;
    G.stepLabel = '📞 Quét SĐT & thông tin';
    _notify();
    try {
      const { data } = await api.post('/facebook/batch-extract-phones');
      _log(`✅ Quét SĐT sau sync: contact=${data.updatedContactPhone || 0}, customer=${data.updatedCustomerPhone || 0}, địa chỉ KH=${data.updatedCustomerAddress || 0}, lead=${data.updatedLeadDescription || 0}`, 'ok');
    } catch (e) {
      _log(`❌ Quét SĐT: ${e.response?.data?.error || e.message}`, 'error');
    }
    await new Promise(r => setTimeout(r, 300));

    // Nếu sync chưa xong → tiếp tục chu kỳ tiếp
    if (!G.syncDone) {
      _log(`⏩ Tiếp tục chu kỳ ${cycleCount + 1} (còn ${G.syncTotal - G.syncOffset} contacts)...`);
    }
  }

  // Hết tất cả
  G.running = false;
  G.step = -1;
  G.stepLabel = null;
  G.cycleCount = cycleCount;
  G.lastCycleEnd = Date.now();
  _log(`🏁 Hoàn tất toàn bộ! Nghỉ ${WAIT_BETWEEN_MS / 60000} phút...`, 'ok');
  _notify();
}

// ── Global countdown timer ──
if (!window.__batchAutoTimer) {
  window.__batchAutoTimer = setInterval(() => {
    if (!G.enabled) return;
    if (G.running) { _notify(); return; }
    const elapsed = Date.now() - G.lastCycleEnd;
    G.countdown = Math.max(0, Math.ceil((WAIT_BETWEEN_MS - elapsed) / 1000));
    if (elapsed >= WAIT_BETWEEN_MS) {
      _runInterleavedPipeline();
    }
    _notify();
  }, 1000);
}

// ── Public API ──
export function triggerPipelineNow() { _runInterleavedPipeline(); }

export function toggleBatchAuto() {
  G.enabled = !G.enabled;
  localStorage.setItem('batch_auto', G.enabled ? 'on' : 'off');
  if (G.enabled) G.lastCycleEnd = Date.now();
  _notify();
}

export function formatCountdown(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
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
    totalSteps: G.totalSteps,
    stepLabel: G.stepLabel,
    cycleCount: G.cycleCount,
    syncOffset: G.syncOffset,
    syncTotal: G.syncTotal,
    syncDone: G.syncDone,
    lastSyncProcessed: G.lastSyncProcessed,
    lastSyncNewMessages: G.lastSyncNewMessages,
    countdown: G.countdown,
    logs: G.logs,
  };
}
