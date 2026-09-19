import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

/**
 * Tệp đính kèm Zalo đã chép về kho công ty.
 *
 * Endpoint trả tệp có kiểm quyền, mà thẻ <img> thì KHÔNG gửi được header xác
 * thực — nên phải tải bằng fetch rồi dựng blob URL. Đổi lại ảnh khách hàng
 * không bị phơi ra cho bất kỳ ai có link.
 */
/**
 * Bộ nhớ đệm blob URL dùng chung cho cả trang.
 *
 * Danh sách tin vẽ lại mỗi vài giây (socket, làm mới), kéo theo component ảnh
 * bị gỡ rồi gắn lại. Nếu thu hồi blob URL lúc gỡ thì thẻ <img> đang hiển thị
 * mất nguồn ngay — ảnh vỡ dù vừa tải xong. Giữ lại trong phiên, không thu hồi.
 */
const blobCache = new Map();      // path → objectURL
const inflight = new Map();       // path → Promise
const CACHE_MAX = 60;

async function loadBlobUrl(path) {
  if (blobCache.has(path)) return blobCache.get(path);
  if (inflight.has(path)) return inflight.get(path);

  const job = (async () => {
    const r = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!r.ok) throw new Error(String(r.status));
    const objectUrl = URL.createObjectURL(await r.blob());

    // Giới hạn để trang mở lâu không phình bộ nhớ
    if (blobCache.size >= CACHE_MAX) {
      const oldest = blobCache.keys().next().value;
      URL.revokeObjectURL(blobCache.get(oldest));
      blobCache.delete(oldest);
    }
    blobCache.set(path, objectUrl);
    return objectUrl;
  })().finally(() => inflight.delete(path));

  inflight.set(path, job);
  return job;
}

export function useAuthedBlob(path) {
  const [url, setUrl] = useState(() => (path ? blobCache.get(path) || null : null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return undefined; }

    const cached = blobCache.get(path);
    if (cached) { setUrl(cached); return undefined; }

    loadBlobUrl(path)
      .then((u) => { if (!cancelled) setUrl(u); })
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
  }, [path]);

  return { url, failed };
}

/**
 * Ảnh đã chép về kho. Tải lỗi thì rơi về link gốc của Zalo — thà hiện được ảnh
 * còn hơn để ô trống.
 */
export function StoredImage({ storedPath, fallbackUrl, className, alt, onClick }) {
  const { url, failed } = useAuthedBlob(storedPath);
  const src = url || (failed ? fallbackUrl : null);
  if (!src) {
    return <div className={`${className} bg-gray-100 animate-pulse`} style={{ minHeight: 80 }} />;
  }
  return <img src={src} className={className} alt={alt || ''} onClick={onClick} loading="lazy" />;
}

/** Tải tệp về máy, qua endpoint có kiểm quyền. */
export async function downloadStored(path, filename) {
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  if (!r.ok) throw new Error('Không tải được tệp');
  const blob = await r.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename || 'tep-dinh-kem';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
