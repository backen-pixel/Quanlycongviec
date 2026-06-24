import { Loader2 } from 'lucide-react';
import { formatFileSize } from '../lib/messengerUploadLimits';
import { formatUploadProgressMeta } from '../lib/uploadProgressEta';

/**
 * Bong bóng / thanh tiến trình upload — dùng chung chat, tài liệu, bình luận, Drive.
 *
 * variant:
 *   bubble  — bong bóng trong luồng chat (mặc định)
 *   inline  — thanh gọn trong form nhiệm vụ / đính kèm
 */
export default function UploadProgressBubble({
  fileName,
  fileSize,
  percent = 0,
  bytesPerSec = 0,
  remainingSec = null,
  compact = false,
  align = 'end',
  variant = 'bubble',
  title,
  className = '',
}) {
  if (!fileName && !title) return null;

  const meta = formatUploadProgressMeta({ percent, bytesPerSec, remainingSec });
  const barWidth = Math.max(percent >= 99 ? 99 : 8, percent || 0);

  if (variant === 'inline') {
    return (
      <div className={`mb-2 ${className}`}>
        <div className="flex items-center justify-between text-[10px] text-blue-600 mb-1 gap-2">
          <span className="truncate min-w-0">
            📤 {fileName}
            {fileSize ? ` (${formatFileSize(fileSize)})` : ''}
          </span>
          <span className="font-bold shrink-0 tabular-nums">{percent >= 99 ? '…' : `${percent}%`}</span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300"
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <p className="text-[9px] text-blue-500/90 mt-0.5 tabular-nums truncate">{meta}</p>
      </div>
    );
  }

  const alignClass = align === 'start' ? 'justify-start' : 'justify-end';
  const colors = align === 'start'
    ? 'border-slate-200 from-slate-50 to-white text-slate-800'
    : 'border-violet-200 from-violet-50 to-white text-violet-800';
  const barBg = align === 'start' ? 'bg-slate-100' : 'bg-violet-100';
  const barFill = align === 'start' ? 'bg-blue-500' : 'bg-violet-500';
  const metaColor = align === 'start' ? 'text-slate-500' : 'text-violet-500';

  return (
    <div className={`flex ${alignClass} my-2 px-1 ${className}`}>
      <div
        className={`max-w-[min(92%,320px)] rounded-2xl border bg-gradient-to-br shadow-sm ${colors} ${
          compact ? 'px-3 py-2' : 'px-4 py-3'
        }`}
      >
        <div className="flex items-center gap-2">
          <Loader2 className={`shrink-0 animate-spin ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
          <span className={compact ? 'text-[11px] font-medium' : 'text-sm font-medium'}>
            {title || 'Đang tải lên…'}
          </span>
        </div>
        {fileName ? (
          <p className={`mt-1 truncate opacity-90 ${compact ? 'text-[10px]' : 'text-xs'}`} title={fileName}>
            {fileName}
            {fileSize ? ` · ${formatFileSize(fileSize)}` : ''}
          </p>
        ) : null}
        <div className={`mt-2 h-1.5 rounded-full overflow-hidden ${barBg}`}>
          <div
            className={`h-full rounded-full transition-[width] duration-200 ease-out ${barFill}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <p className={`mt-1 tabular-nums truncate ${metaColor} ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          {meta}
        </p>
      </div>
    </div>
  );
}
