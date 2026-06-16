import { Mic } from 'lucide-react';
import { resolveMediaUrl } from '../lib/mediaUrl';

/**
 * Trình phát âm thanh / ghi âm trong bong bóng chat — giới hạn chiều rộng, không tràn bubble.
 */
export default function ChatAudioAttachment({
  attachment,
  src,
  name,
  compact = false,
  alignEnd = false,
  /** Tin gửi đi (nền tím/xanh) — bọc nền sáng để controls audio đọc được */
  isMe = false,
  showLabel = false,
}) {
  const fileUrl = resolveMediaUrl(src || attachment?.url);
  const fileName = name || attachment?.name || '';
  if (!fileUrl) return null;

  const widthCls = compact
    ? 'w-full max-w-[min(100%,236px)]'
    : 'w-full max-w-[min(100%,280px)]';

  return (
    <div className={`min-w-0 ${widthCls} ${alignEnd ? 'ml-auto' : ''}`}>
      <div
        className={`rounded-xl border overflow-hidden shadow-sm ${
          isMe
            ? 'bg-white/95 border-white/40'
            : 'bg-white border-slate-200/90'
        }`}
      >
        {showLabel ? (
          <div className={`flex items-center gap-1.5 px-2.5 pt-2 pb-0.5 ${isMe ? 'text-violet-700' : 'text-violet-600'}`}>
            <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="text-[10px] font-bold uppercase tracking-wide">Ghi âm</span>
          </div>
        ) : null}
        {fileName ? (
          <p className="px-2.5 pt-1.5 pb-0 text-[10px] font-medium truncate text-slate-600" title={fileName}>
            {fileName}
          </p>
        ) : null}
        <audio
          src={fileUrl}
          controls
          preload="metadata"
          className="block w-full min-w-0 h-9 max-w-full"
        />
      </div>
    </div>
  );
}
