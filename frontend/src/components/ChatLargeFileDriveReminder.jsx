import { createPortal } from 'react-dom';
import { Cloud, HardDrive, Paperclip, X } from 'lucide-react';
import { CHAT_DRIVE_REMIND_MB, formatFileSize } from '../lib/messengerUploadLimits';

/**
 * Modal nhắc gửi file lớn qua Google Drive thay vì đính kèm trực tiếp.
 */
export default function ChatLargeFileDriveReminder({
  largeFiles = [],
  onUseDrive,
  onProceed,
  onClose,
}) {
  if (!largeFiles.length) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center p-4 bg-black/45"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-large-file-drive-title"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200/80"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b bg-gradient-to-r from-sky-50 to-violet-50 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-sky-100 flex items-center justify-center shrink-0 shadow-sm">
            <HardDrive className="h-5 w-5 text-sky-600" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 id="chat-large-file-drive-title" className="text-sm font-semibold text-slate-900">
              File dung lượng lớn
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              File từ {CHAT_DRIVE_REMIND_MB} MB trở lên nên tải lên <strong>Google Drive</strong> rồi chia sẻ qua nút ☁️ —
              gửi ổn định hơn, dễ tra cứu và không chiếm bộ nhớ server.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-lg hover:bg-white/80 text-slate-500 flex items-center justify-center"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="px-4 py-3 max-h-40 overflow-y-auto space-y-1.5 [scrollbar-width:thin]">
          {largeFiles.map((f) => (
            <li
              key={`${f.name}-${f.size}-${f.lastModified}`}
              className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50 rounded-lg px-2.5 py-2 border border-slate-100"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate font-medium" title={f.name}>{f.name}</span>
              <span className="shrink-0 text-slate-500 tabular-nums">{formatFileSize(f.size)}</span>
            </li>
          ))}
        </ul>

        <div className="px-4 py-3 border-t bg-slate-50/80 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onProceed}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
          >
            Vẫn gửi từ máy
          </button>
          <button
            type="button"
            onClick={onUseDrive}
            className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold flex items-center justify-center gap-1.5 transition"
          >
            <Cloud className="h-4 w-4" />
            Chọn trên Drive
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
