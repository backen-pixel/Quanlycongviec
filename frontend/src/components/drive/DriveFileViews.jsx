/**
 * Hiển thị file Drive dạng list / grid — dùng chung cho DrivePage, DriveAttachments, DriveFilePicker.
 */
import { useEffect, useRef, useState } from 'react';
import { User as UserIcon, ZoomIn, MoreHorizontal, Eye, Download, Trash2 } from 'lucide-react';
import DriveFileIcon from './DriveFileIcon';

/** Cột grid cho bảng list file (Tên | Người tải | Ngày tải | Kích thước | Hành động) */
export const DRIVE_FILE_LIST_GRID = 'grid-cols-[1fr_minmax(130px,170px)_110px_90px_96px]';

export function fmtDriveDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return '—'; }
}

export function fmtDriveDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('vi-VN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch (_) { return '—'; }
}

export function isImageMime(mime, filename) {
  if (typeof mime === 'string' && mime.startsWith('image/')) return true;
  if (filename && /\.(jpe?g|png|gif|webp|bmp|svg|avif|heic|heif)$/i.test(filename)) return true;
  return false;
}

/** Google Doc / Sheet / Slides (native trên Drive). */
export function isGoogleWorkspaceFile(mime) {
  return typeof mime === 'string'
    && mime.startsWith('application/vnd.google-apps.')
    && mime !== 'application/vnd.google-apps.folder';
}

/** Click 1 lần mở preview: ảnh full màn hoặc Doc/Sheet embed. */
export function isQuickPreviewFile(file) {
  return isImageMime(file?.mime_type, file?.name) || isGoogleWorkspaceFile(file?.mime_type);
}

export function filterImageFiles(files) {
  return (files || []).filter((f) => isImageMime(f.mime_type, f.name));
}

/** Menu ⋯ gom Xem / Tải / Bỏ gắn — tiết kiệm chỗ tên file. */
export function DriveFileMoreMenu({
  onPreview,
  onDownload,
  onUnlink,
  unlinkLabel = 'Bỏ gắn',
  showUnlink = true,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded"
        title="Thao tác"
        aria-label="Thao tác file"
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-0.5 z-30 min-w-[148px] bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {onPreview && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 text-slate-700"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onPreview(); }}
            >
              <Eye size={14} className="text-blue-600 shrink-0" /> Xem trước
            </button>
          )}
          {onDownload && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 text-slate-700"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onDownload(); }}
            >
              <Download size={14} className="text-blue-600 shrink-0" /> Tải xuống
            </button>
          )}
          {showUnlink && onUnlink && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-red-50 text-red-600"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onUnlink(); }}
            >
              <Trash2 size={14} className="shrink-0" /> {unlinkLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function uploaderName(file) {
  const u = file?.uploader;
  if (u?.full_name) return u.full_name;
  if (u?.email) return u.email;
  return '—';
}

/** Ô hiển thị người tải lên (avatar + tên) */
export function UploaderCell({ file, compact = false }) {
  const u = file?.uploader;
  const name = uploaderName(file);
  const size = compact ? 'w-4 h-4' : 'w-5 h-5';
  const text = compact ? 'text-[11px]' : 'text-xs';
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {u?.avatar ? (
        <img src={u.avatar} alt="" className={`${size} rounded-full shrink-0 object-cover`} />
      ) : (
        <span className={`${size} rounded-full bg-slate-200 shrink-0 flex items-center justify-center`}>
          <UserIcon size={compact ? 9 : 11} className="text-slate-500" />
        </span>
      )}
      <span className={`${text} text-slate-600 truncate`} title={name}>{name}</span>
    </div>
  );
}

/** Header bảng list file */
export function DriveFilesListHeader({ actionsLabel = '' }) {
  return (
    <div className={`grid ${DRIVE_FILE_LIST_GRID} gap-2 px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase border-b bg-slate-50`}>
      <div>Tên</div>
      <div>Người tải lên</div>
      <div>Ngày tải lên</div>
      <div className="text-right">Kích thước</div>
      <div>{actionsLabel}</div>
    </div>
  );
}

/** Một dòng file trong bảng list */
export function DriveFileListRow({ file, formatBytes, onPreview, renderActions, className = '' }) {
  const isImg = isImageMime(file.mime_type, file.name);
  const quickOpen = isQuickPreviewFile(file);
  return (
    <div
      onClick={() => { if (quickOpen) onPreview?.(file); }}
      onDoubleClick={() => onPreview?.(file)}
      className={`group grid ${DRIVE_FILE_LIST_GRID} gap-2 px-3 py-2.5 items-center hover:bg-slate-50 cursor-pointer ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <DriveFileIcon mime={file.mime_type} size={18} />
        <span className={`text-sm truncate ${quickOpen ? 'text-blue-700 hover:underline' : 'text-slate-800'}`} title={file.name}>
          {file.name}
        </span>
      </div>
      <UploaderCell file={file} />
      <div className="text-xs text-slate-500" title={fmtDriveDateTime(file.created_at)}>
        {fmtDriveDate(file.created_at)}
      </div>
      <div className="text-right text-xs text-slate-500">{formatBytes(file.size_bytes)}</div>
      <div className="flex items-center gap-0.5 justify-self-end opacity-0 group-hover:opacity-100 transition">
        {renderActions?.(file)}
      </div>
    </div>
  );
}

/** Bảng list đầy đủ */
export function DriveFilesListView({ files, formatBytes, onPreview, renderActions }) {
  if (!files?.length) return null;
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <DriveFilesListHeader />
      <div className="divide-y">
        {files.map((f) => (
          <DriveFileListRow
            key={f.id}
            file={f}
            formatBytes={formatBytes}
            onPreview={onPreview}
            renderActions={renderActions}
          />
        ))}
      </div>
    </div>
  );
}

/** Grid card lớn có thumbnail */
export function DriveFilesGridView({ files, formatBytes, onPreview, renderActions }) {
  if (!files?.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {files.map((f) => {
        const thumb = f.thumbnail_url;
        const isImg = isImageMime(f.mime_type, f.name);
        const isGws = isGoogleWorkspaceFile(f.mime_type);
        const quickOpen = isQuickPreviewFile(f);
        const showThumb = isImg || isGws || !!thumb;
        return (
          <div
            key={f.id}
            onDoubleClick={() => onPreview?.(f)}
            className="group bg-white border rounded-lg overflow-hidden hover:border-blue-400 hover:shadow-md cursor-pointer flex flex-col transition"
          >
            <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-1.5 min-w-0">
              <DriveFileIcon mime={f.mime_type} size={16} className="shrink-0" />
              <p
                className={`text-[13px] font-medium truncate min-w-0 flex-1 ${quickOpen ? 'text-blue-700' : 'text-slate-800'}`}
                title={f.name}
                onClick={(e) => { if (quickOpen) { e.stopPropagation(); onPreview?.(f); } }}
              >
                {f.name}
              </p>
              <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {renderActions?.(f)}
              </div>
            </div>
            <div
              className={`relative mx-2 mb-2 aspect-[4/3] bg-slate-50 border rounded flex items-center justify-center overflow-hidden group/thumb ${quickOpen ? 'cursor-pointer' : ''}`}
              onClick={(e) => {
                if (quickOpen) { e.stopPropagation(); onPreview?.(f); }
              }}
              title={isImg ? 'Xem ảnh full màn hình' : isGws ? 'Mở chỉnh sửa' : undefined}
              role={quickOpen ? 'button' : undefined}
              tabIndex={quickOpen ? 0 : undefined}
              onKeyDown={(e) => { if (quickOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPreview?.(f); } }}
            >
              {showThumb && thumb ? (
                <>
                  <img
                    src={thumb}
                    alt={f.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  {isImg && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/thumb:bg-black/30 transition-colors pointer-events-none">
                      <ZoomIn size={28} className="text-white opacity-0 group-hover/thumb:opacity-100 drop-shadow-lg transition-opacity" />
                    </span>
                  )}
                </>
              ) : (
                <DriveFileIcon mime={f.mime_type} size={52} />
              )}
            </div>
            <div className="px-3 pb-1 flex items-center gap-1.5 min-w-0">
              <UploaderCell file={f} compact />
            </div>
            <div className="px-3 pb-2.5 text-[11px] text-slate-400 flex items-center justify-between">
              <span>{formatBytes(f.size_bytes)}</span>
              <span title={fmtDriveDateTime(f.created_at)}>{fmtDriveDate(f.created_at)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
