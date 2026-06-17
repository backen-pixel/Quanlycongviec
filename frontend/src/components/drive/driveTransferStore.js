/** Hàng đợi tải lên / tải xuống Drive — dùng chung toàn app. */

const abortControllers = new Map();

let state = { uploads: [], downloads: [] };
const listeners = new Set();

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

export function createTransferId() {
  return `tr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
  const ctrl = abortControllers.get(id);
  if (ctrl) ctrl.abort();
  patchDriveUpload(id, { status: 'cancelled', progress: 0 });
  setTimeout(() => removeUpload(id), 1500);
}

export function cancelAllDriveUploads() {
  state.uploads
    .filter((u) => u.status === 'uploading')
    .forEach((u) => cancelDriveUpload(u.id));
}

export function clearFinishedDriveTransfers() {
  state = {
    uploads: state.uploads.filter((u) => u.status === 'uploading'),
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
