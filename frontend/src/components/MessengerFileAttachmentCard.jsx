import { useMemo, useState } from 'react';
import { Download, FolderOpen, Check } from 'lucide-react';
import { resolveMediaUrl } from '../lib/mediaUrl';
import { downloadMessengerFile } from '../lib/messengerMessageActions';

function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(2)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

function fileExtension(name, mime = '') {
  const m = String(name || '').match(/\.([a-z0-9]+)$/i);
  if (m) return m[1].toLowerCase();
  const ml = String(mime || '').toLowerCase();
  if (ml.includes('word') || ml.includes('document')) return 'docx';
  if (ml.includes('sheet') || ml.includes('excel')) return 'xlsx';
  if (ml.includes('pdf')) return 'pdf';
  if (ml.includes('presentation') || ml.includes('powerpoint')) return 'pptx';
  if (ml.includes('zip') || ml.includes('compressed')) return 'zip';
  return '';
}

/**
 * Thẻ file đính kèm kiểu Zalo — icon, tên, dung lượng, mở / tải.
 */
export function FileTypeBadge({ name, mime, compact = false }) {
  const ext = fileExtension(name, mime);
  const cfg = useMemo(() => {
    if (['doc', 'docx'].includes(ext)) return { bg: 'bg-[#2B579A]', letter: 'W', fold: 'bg-[#1e3d6d]' };
    if (['xls', 'xlsx', 'csv'].includes(ext)) return { bg: 'bg-[#217346]', letter: 'X', fold: 'bg-[#185c37]' };
    if (ext === 'pdf') return { bg: 'bg-[#E74C3C]', letter: 'P', fold: 'bg-[#c0392b]' };
    if (['ppt', 'pptx'].includes(ext)) return { bg: 'bg-[#D24726]', letter: 'P', fold: 'bg-[#b33d1f]' };
    if (['zip', 'rar', '7z'].includes(ext)) return { bg: 'bg-amber-500', letter: 'Z', fold: 'bg-amber-600' };
    return { bg: 'bg-slate-500', letter: 'F', fold: 'bg-slate-600' };
  }, [ext]);

  return (
    <div
      className={`relative shrink-0 rounded-md ${cfg.bg} shadow-sm flex items-center justify-center overflow-hidden ${
        compact ? 'w-9 h-9' : 'w-11 h-11'
      }`}
      aria-hidden
    >
      <span
        className={`absolute top-0 right-0 w-3.5 h-3.5 ${cfg.fold}`}
        style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
      />
      <span className={`text-white font-bold leading-none select-none ${compact ? 'text-base' : 'text-lg'}`}>
        {cfg.letter}
      </span>
    </div>
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
 * Thẻ file đính kèm kiểu Zalo — icon, tên, dung lượng, mở / tải.
 */
export default function MessengerFileAttachmentCard({ attachment, compact = false, alignEnd = false }) {
  const [downloaded, setDownloaded] = useState(false);
  const fileUrl = resolveMediaUrl(attachment?.url);
  const name = attachment?.name || 'Tệp đính kèm';
  const sizeLabel = formatFileSize(attachment?.size);
  const showCached = downloaded || (fileUrl && wasDownloaded(fileUrl));

  const openFile = () => {
    if (!fileUrl) return;
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownload = () => {
    if (!fileUrl) return;
    downloadMessengerFile(fileUrl, name);
    markDownloaded(fileUrl);
    setDownloaded(true);
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

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={openFile}
          disabled={!fileUrl}
          className="w-8 h-8 rounded-lg border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-600 flex items-center justify-center transition disabled:opacity-40"
          title="Mở tệp"
        >
          <FolderOpen className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!fileUrl}
          className="w-8 h-8 rounded-lg border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-600 flex items-center justify-center transition disabled:opacity-40"
          title="Tải xuống"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
