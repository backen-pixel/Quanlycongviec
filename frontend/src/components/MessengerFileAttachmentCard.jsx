import { useState } from 'react';
import { Download, Check, Loader2 } from 'lucide-react';
import { resolveMediaUrl } from '../lib/mediaUrl';
import { displayMessengerFilename, downloadMessengerFile } from '../lib/messengerMessageActions';
import DriveFileTypeBadge from './drive/DriveFileTypeBadge';

function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(2)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

/** @deprecated alias — dùng DriveFileTypeBadge trực tiếp nếu có thể */
export function FileTypeBadge({ name, mime, compact = false }) {
  return (
    <DriveFileTypeBadge
      name={name}
      mime={mime}
      size={compact ? 36 : 44}
    />
  );
}

const DL_CACHE_KEY = 'messenger_file_downloaded';

function markDownloaded(url) {
  try {
    const raw = sessionStorage.getItem(DL_CACHE_KEY);
    const set = new Set(raw ? JSON.parse(raw) : []);
    set.add(url);
    sessionStorage.setItem(DL_CACHE_KEY, JSON.stringify([...set].slice(-200)));
  } catch {
    /* ignore */
  }
}

function wasDownloaded(url) {
  try {
    const raw = sessionStorage.getItem(DL_CACHE_KEY);
    const set = new Set(raw ? JSON.parse(raw) : []);
    return set.has(url);
  } catch {
    return false;
  }
}

/**
 * Thẻ file đính kèm kiểu Zalo — icon, tên, dung lượng, tải xuống.
 */
export default function MessengerFileAttachmentCard({ attachment, compact = false, alignEnd = false }) {
  const [downloaded, setDownloaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileUrl = resolveMediaUrl(attachment?.url);
  const name = displayMessengerFilename(attachment);
  const sizeLabel = formatFileSize(attachment?.size);
  const showCached = downloaded || (fileUrl && wasDownloaded(fileUrl));

  const handleDownload = async () => {
    if (!attachment?.url || busy) return;
    setBusy(true);
    try {
      await downloadMessengerFile(attachment.url, name);
      if (fileUrl) markDownloaded(fileUrl);
      setDownloaded(true);
    } catch (e) {
      alert(e?.message || 'Không tải được tệp');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-sky-100/90 bg-gradient-to-r from-sky-50/95 to-slate-50/90 shadow-sm box-border min-w-0 overflow-hidden ${
        alignEnd ? 'ml-auto' : ''
      } ${
        compact ? 'w-full max-w-[248px] px-2.5 py-2' : 'w-full max-w-[320px] px-3.5 py-3'
      }`}
    >
      <FileTypeBadge name={name} mime={attachment?.type} compact={compact} />

      <div className="flex-1 min-w-0 basis-0 overflow-hidden">
        <p className="block w-full text-[13px] font-semibold text-slate-900 truncate leading-snug" title={name}>
          {name}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {sizeLabel ? <span className="text-[11px] text-slate-500">{sizeLabel}</span> : null}
          {showCached ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
              <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} />
              Đã có trên máy
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={!fileUrl || busy}
          className="w-8 h-8 rounded-lg border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-600 flex items-center justify-center transition disabled:opacity-40"
          title="Tải xuống"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
