/**
 * Danh sách file đang upload — nhúng trong tab Drive CRM / Lead / Deal.
 * Đồng bộ với DriveTransferPanel (cùng driveTransferStore).
 */
import { Loader2, X, Clock3 } from 'lucide-react';
import { formatFileSize } from '../../lib/messengerUploadLimits';
import { formatUploadProgressMeta } from '../../lib/uploadProgressEta';
import DriveFileTypeBadge from './DriveFileTypeBadge';
import { cancelDriveUpload } from './driveTransferStore';
import { useDriveTransfers } from './useDriveTransfers';

function DriveUploadRow({ item }) {
  const queued = item.status === 'queued';
  const active = item.status === 'uploading';

  const meta = formatUploadProgressMeta({
    percent: item.progress || 0,
    bytesPerSec: item.bytesPerSec || 0,
    remainingSec: item.remainingSec,
    includePercent: true,
  });

  return (
    <div className={`rounded-xl border px-3 py-2.5 shadow-sm ${
      queued
        ? 'border-slate-200 bg-slate-50'
        : 'border-blue-200 bg-gradient-to-br from-blue-50 to-white'
    }`}>
      <div className="flex items-start gap-2">
        <DriveFileTypeBadge name={item.name} size={18} compact className="mt-0.5 shrink-0" />
        {queued ? (
          <Clock3 size={14} className="text-slate-400 shrink-0 mt-0.5" />
        ) : (
          <Loader2 size={14} className="animate-spin text-blue-600 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-slate-800 truncate flex-1" title={item.name}>
              {item.name}
            </p>
            {active && (
              <span className="text-xs font-bold text-blue-700 tabular-nums shrink-0">
                {item.progress >= 99 ? '99%' : `${item.progress || 0}%`}
              </span>
            )}
            {queued && (
              <span className="text-[10px] text-slate-500 shrink-0">Đang chờ</span>
            )}
          </div>
          {item.sizeBytes ? (
            <p className="text-[10px] text-slate-500 mt-0.5">{formatFileSize(item.sizeBytes)}</p>
          ) : null}
          {active && (
            <>
              <div className="mt-2 h-1.5 rounded-full bg-blue-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-[width] duration-200"
                  style={{ width: `${Math.max(item.progress || 0, 8)}%` }}
                />
              </div>
              <p className="text-[10px] text-blue-600/90 mt-1 tabular-nums truncate">{meta}</p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => cancelDriveUpload(item.id)}
          className="p-1 rounded hover:bg-blue-100 text-slate-400 hover:text-slate-600 shrink-0"
          title="Huỷ tải lên"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/** Bong bóng danh sách upload — đặt đầu tab Drive CRM. */
export default function DriveUploadStatus({ className = '' }) {
  const { uploads } = useDriveTransfers();
  const pending = uploads.filter((u) => u.status === 'uploading' || u.status === 'queued');
  if (!pending.length) return null;

  const uploadingCount = pending.filter((u) => u.status === 'uploading').length;
  const queuedCount = pending.filter((u) => u.status === 'queued').length;

  return (
    <div className={`space-y-2 ${className}`} role="status" aria-live="polite" aria-label="Đang tải file lên Drive">
      <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">
        Đang tải lên ({pending.length})
        {queuedCount > 0 ? ` · ${uploadingCount} đang chạy, ${queuedCount} chờ` : ''}
      </p>
      {pending.map((item) => (
        <DriveUploadRow key={item.id} item={item} />
      ))}
    </div>
  );
}
