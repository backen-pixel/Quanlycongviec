/** Theo dõi % + tốc độ mạng + thời gian còn lại khi upload file. */

export function createUploadProgressTracker(totalBytes = 0) {
  return {
    totalBytes: Number(totalBytes) || 0,
    loadedBytes: 0,
    percent: 0,
    bytesPerSec: 0,
    remainingSec: null,
    _lastLoaded: 0,
    _lastTime: null,
  };
}

export function updateUploadProgressTracker(tracker, { loaded, total, now = Date.now() } = {}) {
  if (!tracker) return { percent: 0, bytesPerSec: 0, remainingSec: null, loadedBytes: 0, totalBytes: 0 };

  const loadedBytes = Math.max(0, Number(loaded) || 0);
  const totalBytes = Math.max(0, Number(total) || tracker.totalBytes || 0);
  if (totalBytes > 0) tracker.totalBytes = totalBytes;
  tracker.loadedBytes = loadedBytes;

  const percent = totalBytes > 0
    ? Math.min(99, Math.round((loadedBytes * 100) / totalBytes))
    : 0;
  tracker.percent = percent;

  if (tracker._lastTime != null && loadedBytes >= tracker._lastLoaded) {
    const dt = (now - tracker._lastTime) / 1000;
    const dLoaded = loadedBytes - tracker._lastLoaded;
    if (dt >= 0.08 && dLoaded > 0) {
      const instant = dLoaded / dt;
      tracker.bytesPerSec = tracker.bytesPerSec
        ? tracker.bytesPerSec * 0.65 + instant * 0.35
        : instant;
    }
  }
  tracker._lastLoaded = loadedBytes;
  tracker._lastTime = now;

  const remaining = Math.max(0, tracker.totalBytes - loadedBytes);
  tracker.remainingSec = tracker.bytesPerSec > 512 && remaining > 0
    ? remaining / tracker.bytesPerSec
    : null;

  return {
    percent: tracker.percent,
    loadedBytes: tracker.loadedBytes,
    totalBytes: tracker.totalBytes,
    bytesPerSec: tracker.bytesPerSec,
    remainingSec: tracker.remainingSec,
  };
}

export function formatUploadSpeed(bytesPerSec) {
  const bps = Number(bytesPerSec) || 0;
  if (bps <= 0) return '';
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(bps < 10 * 1024 ? 1 : 0)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(bps < 10 * 1024 * 1024 ? 1 : 0)} MB/s`;
}

export function formatRemainingTime(seconds) {
  const sec = Math.ceil(Number(seconds) || 0);
  if (sec <= 0) return '';
  if (sec < 60) return `còn ~${sec} giây`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s > 0 ? `còn ~${m} phút ${s} giây` : `còn ~${m} phút`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `còn ~${h} giờ ${rm} phút` : `còn ~${h} giờ`;
}

export function formatUploadProgressMeta({
  percent = 0,
  bytesPerSec = 0,
  remainingSec = null,
  includePercent = false,
} = {}) {
  if (percent >= 99) {
    return includePercent ? '99% · Đang xử lý trên server…' : 'Đang xử lý trên server…';
  }
  const parts = [];
  if (includePercent) parts.push(`${percent || 0}%`);
  const speed = formatUploadSpeed(bytesPerSec);
  const remaining = formatRemainingTime(remainingSec);
  if (speed) parts.push(speed);
  if (remaining) parts.push(remaining);
  if (parts.length) return parts.join(' · ');
  return `${percent || 0}%`;
}

/** Callback cho axios `onUploadProgress`. */
export function makeAxiosUploadProgressHandler(fileSize, onUpdate) {
  const tracker = createUploadProgressTracker(fileSize);
  return (ev) => {
    const stats = updateUploadProgressTracker(tracker, {
      loaded: ev.loaded,
      total: ev.total || fileSize,
    });
    onUpdate?.(stats);
    return stats;
  };
}

/** Upload 1 file qua XHR — dùng cho /upload/single, /upload/stream. */
export function uploadSingleFileWithProgress({
  file,
  endpoint,
  baseURL,
  token,
  onProgress,
}) {
  const tracker = createUploadProgressTracker(file?.size || 0);
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${baseURL}${endpoint}`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      const stats = updateUploadProgressTracker(tracker, { loaded: ev.loaded, total: ev.total });
      onProgress?.({ ...stats, name: file.name, size: file.size });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Phản hồi upload không hợp lệ'));
        }
      } else {
        reject(new Error(`Upload lỗi: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Lỗi mạng'));
    xhr.send(formData);
  });
}

/** Gộp stats upload vào object state (chat bubble, task bar, drive panel). */
export function mergeUploadProgressState(base, stats) {
  if (!stats) return base;
  return {
    ...base,
    percent: stats.percent ?? base?.percent ?? 0,
    loadedBytes: stats.loadedBytes ?? base?.loadedBytes,
    totalBytes: stats.totalBytes ?? base?.totalBytes,
    bytesPerSec: stats.bytesPerSec ?? base?.bytesPerSec ?? 0,
    remainingSec: stats.remainingSec ?? base?.remainingSec ?? null,
  };
}
