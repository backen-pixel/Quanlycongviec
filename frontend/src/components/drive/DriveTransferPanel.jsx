/**
 * Panel góc dưới — tiến trình tải lên / tải xuống (kiểu Google Drive).
 * Portal toàn app, thu nhỏ thành thanh dưới cùng, giữ khi đổi trang.
 */
import { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, X, Loader2, CheckCircle2, AlertCircle, Upload, Download } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { formatFileSize } from '../../lib/messengerUploadLimits';
import { formatUploadProgressMeta } from '../../lib/uploadProgressEta';
import {
  cancelDriveUpload,
  cancelAllDriveUploads,
  clearFinishedDriveTransfers,
} from './driveTransferStore';
import { useDriveTransfers } from './useDriveTransfers';

function statusLabel(items, kind) {
  const active = items.filter((x) => x.status === (kind === 'upload' ? 'uploading' : 'downloading'));
  const done = items.filter((x) => x.status === 'done');
  const err = items.filter((x) => x.status === 'error' || x.status === 'cancelled');
  if (active.length) {
    return kind === 'upload' ? 'Đang bắt đầu tải lên…' : 'Đang tải xuống…';
  }
  if (err.length && !done.length) return kind === 'upload' ? 'Tải lên thất bại' : 'Tải xuống thất bại';
  if (done.length) return kind === 'upload' ? 'Đã tải lên xong' : 'Đã tải xuống xong';
  return kind === 'upload' ? 'Tải lên' : 'Tải xuống';
}

function TransferRow({ item, kind }) {
  const active = item.status === 'uploading' || item.status === 'downloading';
  const done = item.status === 'done';
  const failed = item.status === 'error' || item.status === 'cancelled';

  return (
    <li className="flex items-start gap-2 px-3 py-2 border-b border-slate-100 last:border-0">
      <div className="mt-0.5 shrink-0 text-slate-400">
        {active && <Loader2 size={14} className="animate-spin text-blue-600" />}
        {done && <CheckCircle2 size={14} className="text-emerald-500" />}
        {failed && <AlertCircle size={14} className="text-red-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-800 truncate flex-1" title={item.name}>{item.name}</p>
          {active && (
            <span className="text-[11px] font-bold text-blue-700 tabular-nums shrink-0">
              {item.progress >= 99 ? '99%' : `${item.progress || 0}%`}
            </span>
          )}
        </div>
        {active && (
          <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${kind === 'upload' ? 'bg-blue-500' : 'bg-violet-500'}`}
              style={{ width: `${Math.max(item.progress || 0, active && !item.progress ? 8 : 0)}%` }}
            />
          </div>
        )}
        {active && (
          <p className="text-[10px] text-slate-500 mt-0.5 tabular-nums truncate">
            {formatUploadProgressMeta({
              percent: item.progress || 0,
              bytesPerSec: item.bytesPerSec || 0,
              remainingSec: item.remainingSec,
              includePercent: true,
            })}
            {item.sizeBytes ? ` · ${formatFileSize(item.sizeBytes)}` : ''}
          </p>
        )}
        {item.status === 'done' && (
          <p className="text-[10px] text-emerald-600 mt-0.5">{kind === 'upload' ? 'Đã tải lên' : 'Đã tải xuống'}</p>
        )}
        {item.status === 'cancelled' && (
          <p className="text-[10px] text-slate-500 mt-0.5">Đã huỷ</p>
        )}
        {item.status === 'error' && (
          <p className="text-[10px] text-red-600 mt-0.5 truncate" title={item.error}>{item.error || 'Lỗi'}</p>
        )}
      </div>
      {kind === 'upload' && item.status === 'uploading' && (
        <button
          type="button"
          onClick={() => cancelDriveUpload(item.id)}
          className="text-[11px] text-blue-600 hover:underline shrink-0"
        >
          Huỷ
        </button>
      )}
    </li>
  );
}

function TransferSection({ title, icon: Icon, items, kind }) {
  const active = items.some((x) => x.status === (kind === 'upload' ? 'uploading' : 'downloading'));
  const summary = statusLabel(items, kind);

  if (!items.length) return null;

  return (
    <div className="border-b border-slate-200 last:border-0">
      <div className={`flex items-center gap-2 px-3 py-2 text-xs ${active ? 'bg-blue-50' : 'bg-slate-50'}`}>
        <Icon size={14} className={active ? 'text-blue-600' : 'text-slate-500'} />
        <span className="flex-1 font-medium text-slate-700 truncate">{title}</span>
      </div>
      <div className="px-3 py-1.5 text-[11px] text-slate-500 bg-white border-b border-slate-100">{summary}</div>
      <ul className="max-h-40 overflow-y-auto bg-white">
        {items.map((item) => (
          <TransferRow key={item.id} item={item} kind={kind} />
        ))}
      </ul>
    </div>
  );
}

function DriveTransferPanelInner() {
  const { uploads, downloads } = useDriveTransfers();
  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const total = uploads.length + downloads.length;
  const activeUploads = useMemo(() => uploads.filter((u) => u.status === 'uploading'), [uploads]);
  const activeDownloads = useMemo(() => downloads.filter((d) => d.status === 'downloading'), [downloads]);
  const hasActive = activeUploads.length > 0 || activeDownloads.length > 0;

  const avgProgress = useMemo(() => {
    const active = [
      ...activeUploads.map((u) => u.progress || 0),
      ...activeDownloads.map((d) => d.progress || 0),
    ];
    if (!active.length) return 0;
    return Math.round(active.reduce((a, b) => a + b, 0) / active.length);
  }, [activeUploads, activeDownloads]);

  useEffect(() => {
    if (total > 0) setDismissed(false);
  }, [total]);

  const prevActiveRef = useRef(0);
  useEffect(() => {
    const activeCount = activeUploads.length + activeDownloads.length;
    if (activeCount > prevActiveRef.current) {
      setMinimized(false);
      setDismissed(false);
    }
    prevActiveRef.current = activeCount;
  }, [activeUploads.length, activeDownloads.length]);

  if (!total || dismissed) return null;

  const headerUpload = activeUploads.length
    ? `Đang tải ${activeUploads.length} mục lên`
    : uploads.length
      ? `Tải lên (${uploads.length})`
      : null;
  const headerDownload = activeDownloads.length
    ? `Đang tải ${activeDownloads.length} mục xuống`
    : downloads.length
      ? `Tải xuống (${downloads.length})`
      : null;
  const header = [headerUpload, headerDownload].filter(Boolean).join(' · ') || 'Truyền tệp Drive';

  function handleClose() {
    if (hasActive) {
      setMinimized(true);
      return;
    }
    clearFinishedDriveTransfers();
    setDismissed(true);
  }

  const panel = (
    <div
      className={`fixed z-[10040] w-[min(100vw-1.5rem,380px)] bg-white shadow-2xl border border-slate-200 overflow-hidden transition-all ${
        minimized
          ? 'bottom-0 right-4 rounded-t-xl border-b-0'
          : 'bottom-4 right-4 rounded-xl'
      }`}
      role="region"
      aria-label="Tiến trình Drive"
    >
      <div
        className={`flex items-center gap-2 px-3 py-2.5 bg-white ${minimized ? '' : 'border-b'} ${minimized ? 'cursor-pointer select-none' : ''}`}
        onClick={() => { if (minimized) setMinimized(false); }}
        onKeyDown={(e) => { if (minimized && (e.key === 'Enter' || e.key === ' ')) setMinimized(false); }}
        role={minimized ? 'button' : undefined}
        tabIndex={minimized ? 0 : undefined}
        title={minimized ? 'Bấm để mở rộng' : undefined}
      >
        {hasActive && (
          <Loader2 size={16} className="animate-spin text-blue-600 shrink-0" />
        )}
        <span className="flex-1 text-sm font-medium text-slate-800 truncate">{header}</span>
        {minimized && hasActive && (
          <span className="text-xs text-slate-500 shrink-0 tabular-nums">
            {avgProgress}%
            {activeUploads[0]?.bytesPerSec ? ` · ${formatUploadProgressMeta({
              percent: activeUploads[0].progress || avgProgress,
              bytesPerSec: activeUploads[0].bytesPerSec,
              remainingSec: activeUploads[0].remainingSec,
            }).split(' · ')[0] || ''}` : ''}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMinimized((v) => !v);
          }}
          className="p-1 rounded hover:bg-slate-100 text-slate-500"
          aria-label={minimized ? 'Mở rộng' : 'Thu nhỏ xuống dưới'}
        >
          {minimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          className="p-1 rounded hover:bg-slate-100 text-slate-500"
          aria-label="Đóng"
        >
          <X size={16} />
        </button>
      </div>

      {minimized && hasActive && (
        <div className="h-0.5 bg-slate-100">
          <div className="h-full bg-blue-500 transition-all" style={{ width: `${avgProgress}%` }} />
        </div>
      )}

      {!minimized && (
        <>
          {hasActive && activeUploads.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 text-xs bg-blue-50 border-b border-blue-100">
              <span className="text-slate-600">
                {activeUploads.length} file đang tải lên
                {activeUploads[0]?.bytesPerSec ? (
                  <span className="text-blue-700 font-medium ml-1">
                    · {formatUploadProgressMeta({
                      percent: activeUploads[0].progress || 0,
                      bytesPerSec: activeUploads[0].bytesPerSec,
                      remainingSec: activeUploads[0].remainingSec,
                      includePercent: true,
                    })}
                  </span>
                ) : null}
              </span>
              <button type="button" onClick={cancelAllDriveUploads} className="text-blue-600 hover:underline">
                Huỷ tất cả
              </button>
            </div>
          )}
          <TransferSection title="Tải lên" icon={Upload} items={uploads} kind="upload" />
          <TransferSection title="Tải xuống" icon={Download} items={downloads} kind="download" />
        </>
      )}
    </div>
  );

  return createPortal(panel, document.body);
}

/** Gắn ở App root — giữ panel khi đổi trang CRM/Drive/... */
export default function DriveTransferPanel() {
  const { user } = useAuth();
  if (!user) return null;
  return <DriveTransferPanelInner />;
}
