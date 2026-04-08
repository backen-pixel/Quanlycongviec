import { useState, useEffect } from 'react';
import api from '../lib/api';

const BATCH_SIZE = 300;
const SYNC_TIMEOUT_SEC = 90;
const LOOP_PAUSE_MS = 1500; // nghỉ rất ngắn giữa các vòng để tránh spam API

if (!window.__batchAuto) {
  window.__batchAuto = {
    enabled: localStorage.getItem('batch_auto') !== 'off',
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
    logs: [],
    _subs: new Set(),
  };
}

const G = window.__batchAuto;

function _notify() {
  G._subs.forEach(fn => fn());
}

function _log(text, status = 'info') {
  G.logs = [...G.logs.slice(-199), { text, status, ts: Date.now() }];
  _notify();
}

async function _runPipeline() {
  if (G.running) return;
  G.running = true;
  G.phase = 'loop';
  G.logs = [];
  _log('🚀 Bắt đầu auto-run liên tục: 300 user → sync → quét SĐT → hết DB → quét tay 1 lần → lặp lại');
  _notify();

  while (G.enabled) {
    G.cycleCount += 1;
    G.batchOffset = 0;
    G.batchIndex = 0;
    G.totalBatches = 0;
    G.totalContacts = 0;
    _log(`🔄 Chu kỳ ${G.cycleCount} bắt đầu`);
    _notify();

    let done = false;
    while (!done && G.enabled) {
      G.batchIndex += 1;

      // Bước 1: Sync 300 contacts
      G.step = 0;
      G.stepLabel = `📨 Đồng bộ tin nhắn • Batch ${G.batchIndex}`;
      _notify();

      let syncData = null;
      try {
        const { data } = await api.post('/facebook/batch-sync-messages', {
          mode: 'all',
          offset: G.batchOffset,
          limit: BATCH_SIZE,
          timeout: SYNC_TIMEOUT_SEC,
        });
        syncData = data;
        G.totalContacts = data.total || G.totalContacts;
        G.totalBatches = G.totalContacts > 0 ? Math.ceil(G.totalContacts / BATCH_SIZE) : 0;
        _log(`✅ Batch ${G.batchIndex}: sync ${data.processedCount || 0} contacts, +${data.totalSynced || 0} tin nhắn`, 'ok');
      } catch (e) {
        _log(`❌ Batch ${G.batchIndex}: lỗi sync — ${e.response?.data?.error || e.message}`, 'error');
        break;
      }

      // Bước 2: Quét SĐT đúng batch vừa sync
      G.step = 1;
      G.stepLabel = `📞 Quét SĐT & thông tin • Batch ${G.batchIndex}`;
      _notify();
      try {
        const { data } = await api.post('/facebook/batch-extract-phones', {
          offset: G.batchOffset,
          limit: BATCH_SIZE,
        });
        _log(
          `✅ Batch ${G.batchIndex}: contact=${data.updatedContactPhone || 0}, customer=${data.updatedCustomerPhone || 0}, lead=${data.leadsUpdatedPhone || 0}`,
          'ok'
        );
      } catch (e) {
        _log(`❌ Batch ${G.batchIndex}: lỗi quét SĐT — ${e.response?.data?.error || e.message}`, 'error');
      }

      done = syncData?.done === true || !syncData?.nextOffset;
      if (done) {
        _log(`🏁 Chu kỳ ${G.cycleCount} hoàn tất: đã chạy hết ${G.totalContacts || 0} contacts`, 'ok');
        G.batchOffset = 0;
        G.batchIndex = G.totalBatches || G.batchIndex;
      } else {
        G.batchOffset = syncData.nextOffset || (G.batchOffset + BATCH_SIZE);
        _log(`⏭️ Chuyển sang batch tiếp theo: offset ${G.batchOffset}`, 'info');
      }

      _notify();
    }

    if (!G.enabled) break;

    // Quét full-scan 1 lần theo logic thủ công sau khi hết DB
    G.phase = 'manual_full_scan';
    G.step = 2;
    G.stepLabel = '📞 Quét SĐT toàn bộ (logic thủ công)';
    _notify();
    try {
      const { data } = await api.post('/facebook/batch-extract-phones');
      _log(
        `✅ Full scan cuối chu kỳ: contact=${data.updatedContactPhone || 0}, customer=${data.updatedCustomerPhone || 0}, lead=${data.leadsUpdatedPhone || 0}`,
        'ok'
      );
    } catch (e) {
      _log(`❌ Full scan cuối chu kỳ: ${e.response?.data?.error || e.message}`, 'error');
    }

    if (!G.enabled) break;
    _log(`♻️ Quay lại từ đầu sau chu kỳ ${G.cycleCount}...`, 'info');
    _notify();
    await new Promise(resolve => setTimeout(resolve, LOOP_PAUSE_MS));
  }

  G.running = false;
  G.phase = 'idle';
  G.step = -1;
  G.stepLabel = null;
  _log('⏹️ Auto-run đã dừng');
  _notify();
}

export function triggerPipelineNow() {
  _runPipeline();
}

export function toggleBatchAuto() {
  G.enabled = !G.enabled;
  localStorage.setItem('batch_auto', G.enabled ? 'on' : 'off');
  if (G.enabled) _runPipeline();
  _notify();
}

export function formatCountdown() {
  return '∞';
}

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
    phase: G.phase,
    step: G.step,
    totalSteps: G.totalSteps,
    stepLabel: G.stepLabel,
    cycleCount: G.cycleCount,
    batchIndex: G.batchIndex,
    totalBatches: G.totalBatches,
    totalContacts: G.totalContacts,
    batchOffset: G.batchOffset,
    countdown: 0,
    logs: G.logs,
  };
}
