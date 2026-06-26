/** Hàng đợi tải lên / tải xuống Drive — dùng chung toàn app. */

const abortControllers = new Map();
const notifiedBatches = new Set();
const batchRemoveTimers = new Map();

let state = { uploads: [], downloads: [] };
const listeners = new Set();
const batchCompleteListeners = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeDriveTransfers(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDriveTransferState() {
  return state;
}

export function subscribeDriveBatchComplete(fn) {
  batchCompleteListeners.add(fn);
  return () => batchCompleteListeners.delete(fn);
}

export function createTransferId() {
  return `tr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function getUploadBatchStats(batchId) {
  if (!batchId) return null;
  const items = state.uploads.filter((u) => u.batchId === batchId);
  if (!items.length) return null;
  return {
    batchId,
    total: items.length,
    done: items.filter((u) => u.status === 'done').length,
    error: items.filter((u) => u.status === 'error').length,
    cancelled: items.filter((u) => u.status === 'cancelled').length,
    uploading: items.filter((u) => u.status === 'uploading').length,
    queued: items.filter((u) => u.status === 'queued').length,
  };
}

function notifyBatchComplete(stats) {
  batchCompleteListeners.forEach((fn) => {
    try { fn(stats); } catch (_) { /* ignore */ }
  });
}

function maybeFinishBatch(batchId) {
  if (!batchId || notifiedBatches.has(batchId)) return;
  const stats = getUploadBatchStats(batchId);
  if (!stats) return;
  if (stats.uploading > 0 || stats.queued > 0) return;
  notifiedBatches.add(batchId);
  notifyBatchComplete(stats);
  scheduleRemoveBatch(batchId, 120_000);
}

export function recordBatchUploadEnd(batchId) {
  if (!batchId) return;
  maybeFinishBatch(batchId);
}

function scheduleRemoveBatch(batchId, ms = 120_000) {
  const prev = batchRemoveTimers.get(batchId);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    batchRemoveTimers.delete(batchId);
    notifiedBatches.delete(batchId);
    state = {
      ...state,
      uploads: state.uploads.filter((u) => u.batchId !== batchId),
    };
    emit();
  }, ms);
  batchRemoveTimers.set(batchId, timer);
}

function removeUpload(id) {
  state = { ...state, uploads: state.uploads.filter((u) => u.id !== id) };
  abortControllers.delete(id);
  emit();
}

function removeDownload(id) {
  state = { ...state, downloads: state.downloads.filter((d) => d.id !== id) };
  emit();
}

export function addDriveUpload(item) {
  state = { ...state, uploads: [...state.uploads, item] };
  emit();
  return item.id;
}

export function patchDriveUpload(id, patch) {
  state = {
    ...state,
    uploads: state.uploads.map((u) => (u.id === id ? { ...u, ...patch } : u)),
  };
  emit();
}

export function addDriveDownload(item) {
  state = { ...state, downloads: [...state.downloads, item] };
  emit();
  return item.id;
}

export function patchDriveDownload(id, patch) {
  state = {
    ...state,
    downloads: state.downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)),
  };
  emit();
}

export function registerUploadAbort(id, controller) {
  abortControllers.set(id, controller);
}

export function cancelDriveUpload(id) {
  const item = state.uploads.find((u) => u.id === id);
  if (!item) return;

  if (item.status === 'queued') {
    patchDriveUpload(id, { status: 'cancelled', progress: 0 });
    recordBatchUploadEnd(item.batchId);
    setTimeout(() => removeUpload(id), 1500);
    return;
  }

  const ctrl = abortControllers.get(id);
  if (ctrl) ctrl.abort();
  patchDriveUpload(id, { status: 'cancelled', progress: 0 });
  recordBatchUploadEnd(item.batchId);
  setTimeout(() => removeUpload(id), 1500);
}

export function cancelAllDriveUploads() {
  state.uploads
    .filter((u) => u.status === 'uploading' || u.status === 'queued')
    .forEach((u) => cancelDriveUpload(u.id));
}

export function clearFinishedDriveTransfers() {
  const activeBatchIds = new Set(
    state.uploads
      .filter((u) => u.status === 'uploading' || u.status === 'queued')
      .map((u) => u.batchId)
      .filter(Boolean),
  );
  state = {
    uploads: state.uploads.filter((u) => {
      if (u.status === 'uploading' || u.status === 'queued') return true;
      if (u.batchId && activeBatchIds.has(u.batchId)) return true;
      return false;
    }),
    downloads: state.downloads.filter((d) => d.status === 'downloading'),
  };
  emit();
}

export function scheduleRemoveUpload(id, ms = 4000) {
  setTimeout(() => removeUpload(id), ms);
}

export function scheduleRemoveDownload(id, ms = 3500) {
  setTimeout(() => removeDownload(id), ms);
}

export function isUploadCancelledError(err) {
  return err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.message === 'canceled';
}
