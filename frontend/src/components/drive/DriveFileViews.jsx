/**
 * Hiển thị file Drive dạng list / grid — dùng chung cho DrivePage, DriveAttachments, DriveFilePicker.
 */
import { useEffect, useRef, useState } from 'react';
import { User as UserIcon, ZoomIn, MoreHorizontal, Eye, Download, Trash2, FolderInput, Play, Pencil, Star, StarOff } from 'lucide-react';
import DriveFileIcon from './DriveFileIcon';
import { driveFileThumbnailUrl, driveFetchFileBlobUrl, driveRefreshFileThumbnail } from '../../lib/drive';
import DriveMarqueeSelectArea, { shouldIgnoreDriveMarqueeClick } from './DriveMarqueeSelectArea';

/** Cột grid cho bảng list file (Tên | Người tải | Ngày tải | Kích thước | Hành động) */
export const DRIVE_FILE_LIST_GRID = 'grid-cols-[1fr_minmax(130px,170px)_110px_90px_96px]';
export const DRIVE_FILE_LIST_GRID_SELECTABLE = 'grid-cols-[28px_1fr_minmax(130px,170px)_110px_90px_96px]';

export function DriveFileSelectCheckbox({ checked, indeterminate, onChange, className = '', title }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={!!checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      title={title}
      aria-label={title || 'Chọn file'}
      className={`w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0 cursor-pointer ${className}`}
    />
  );
}

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

/** PDF upload lên Drive. */
export function isPdfFile(mime, filename) {
  if (mime === 'application/pdf') return true;
  if (filename && /\.pdf$/i.test(filename)) return true;
  return false;
}

/** Video lớn hơn ngưỡng này — khuyên tải xuống thay vì phát trong trình duyệt. */
export const LARGE_VIDEO_BYTES = 80 * 1024 * 1024;

export function driveSelectId(id) {
  return id == null ? '' : String(id);
}

/** Video upload lên Drive. */
export function isVideoFile(mime, filename) {
  if (typeof mime === 'string' && mime.startsWith('video/')) return true;
  if (filename && /\.(mp4|webm|mov|avi|mkv|m4v|wmv)$/i.test(filename)) return true;
  return false;
}

/** Click 1 lần mở preview: ảnh / PDF / Doc/Sheet embed / video. */
export function isQuickPreviewFile(file) {
  return isImageMime(file?.mime_type, file?.name)
    || isGoogleWorkspaceFile(file?.mime_type)
    || isPdfFile(file?.mime_type, file?.name)
    || isVideoFile(file?.mime_type, file?.name);
}

export function filterImageFiles(files) {
  return (files || []).filter((f) => isImageMime(f.mime_type, f.name));
}

const VIDEO_POSTER_MAX_BYTES = 120 * 1024 * 1024;

/** Trích khung hình đầu từ video (fallback khi Google chưa có thumbnail). */
function VideoFramePoster({ file, className, size, onFailed }) {
  const [poster, setPoster] = useState(null);
  const blobRef = useRef(null);

  useEffect(() => {
    if (!file?.id) return undefined;
    if (file.size_bytes != null && file.size_bytes > VIDEO_POSTER_MAX_BYTES) {
      onFailed?.();
      return undefined;
    }

    let cancelled = false;
    let video = null;

    (async () => {
      try {
        const blobUrl = await driveFetchFileBlobUrl(file.id);
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        blobRef.current = blobUrl;

        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = blobUrl;

        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('timeout')), 20000);
          video.onloadeddata = () => { clearTimeout(timer); resolve(); };
          video.onerror = () => { clearTimeout(timer); reject(new Error('video error')); };
        });

        const seekTo = Math.min(0.5, Math.max(0.05, (video.duration || 1) * 0.05));
        video.currentTime = seekTo;
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 4000);
          video.onseeked = () => { clearTimeout(timer); resolve(); };
        });

        const w = video.videoWidth || 640;
        const h = video.videoHeight || 360;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
        if (!cancelled) setPoster(canvas.toDataURL('image/jpeg', 0.82));
      } catch {
        if (!cancelled) onFailed?.();
      }
    })();

    return () => {
      cancelled = true;
      if (video) {
        video.src = '';
        video.load();
      }
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [file?.id, file?.size_bytes]);

  if (!poster) {
    return (
      <div className="flex items-center justify-center w-full h-full min-h-[52px]">
        <DriveFileIcon mime={file?.mime_type} size={size} />
      </div>
    );
  }

  return (
    <img src={poster} alt="" loading="lazy" draggable={false} className={className} />
  );
}

/** Thumbnail grid — ảnh: luôn tải file gốc (/download, cùng preview); Doc/Sheet/video: proxy thumbnail. */
export function DriveFileThumbnail({
  file, size = 52, className = 'w-full h-full object-cover', zoomHint = false,
}) {
  const isImg = isImageMime(file?.mime_type, file?.name);
  const isGws = isGoogleWorkspaceFile(file?.mime_type);
  const isPdf = isPdfFile(file?.mime_type, file?.name);
  const isVid = isVideoFile(file?.mime_type, file?.name);
  const canTryThumb = isImg || isGws || isPdf || isVid || !!file?.thumbnail_url;
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [useVideoPoster, setUseVideoPoster] = useState(false);
  const [refreshAttempted, setRefreshAttempted] = useState(false);
  const blobRef = useRef(null);

  useEffect(() => {
    setFailed(false);
    setSrc(null);
    setUseVideoPoster(false);
    setRefreshAttempted(false);
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
    if (!file?.id || !canTryThumb) return undefined;

    let cancelled = false;

    if (isImg) {
      driveFetchFileBlobUrl(file.id)
        .then((url) => {
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          blobRef.current = url;
          setSrc(url);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    } else {
      setSrc(driveFileThumbnailUrl(file.id));
    }

    return () => { cancelled = true; };
  }, [file?.id, canTryThumb, isImg]);

  useEffect(() => () => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
  }, []);

  const handleThumbError = () => {
    if (isVid && !refreshAttempted) {
      setRefreshAttempted(true);
      driveRefreshFileThumbnail(file.id)
        .then((r) => {
          if (r?.thumbnail_url) {
            const base = driveFileThumbnailUrl(file.id);
            setSrc(`${base}${base.includes('?') ? '&' : '?'}_r=${Date.now()}`);
            return;
          }
          setUseVideoPoster(true);
        })
        .catch(() => setUseVideoPoster(true));
      return;
    }
    if (isVid && !useVideoPoster) {
      setUseVideoPoster(true);
      return;
    }
    setFailed(true);
  };

  if (!canTryThumb || (failed && !useVideoPoster)) {
    return <DriveFileIcon mime={file?.mime_type} size={size} />;
  }

  if (useVideoPoster && isVid) {
    return (
      <VideoFramePoster
        file={file}
        className={className}
        size={size}
        onFailed={() => setFailed(true)}
      />
    );
  }

  if (!src) {
    return null;
  }

  return (
    <>
      <img
        src={src}
        alt=""
        loading="lazy"
        draggable={false}
        className={className}
        onError={handleThumbError}
      />
      {zoomHint && isImg && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/thumb:bg-black/30 transition-colors pointer-events-none">
          <ZoomIn size={28} className="text-white opacity-0 group-hover/thumb:opacity-100 drop-shadow-lg transition-opacity" />
        </span>
      )}
    </>
  );
}

/** Menu ⋯ gom Xem / Tải / Đổi tên / Sao / Di chuyển / Bỏ gắn */
export function DriveFileMoreMenu({
  onPreview,
  onDownload,
  onRename,
  onToggleStar,
  isStarred = false,
  onMove,
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
    <div className="relative shrink-0" ref={ref} data-no-marquee>
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
          {onRename && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 text-slate-700"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onRename(); }}
            >
              <Pencil size={14} className="text-slate-600 shrink-0" /> Đổi tên
            </button>
          )}
          {onToggleStar && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 text-slate-700"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onToggleStar(); }}
            >
              {isStarred ? (
                <StarOff size={14} className="text-amber-600 shrink-0" />
              ) : (
                <Star size={14} className="text-amber-500 shrink-0" />
              )}
              {isStarred ? 'Bỏ gắn dấu' : 'Gắn dấu sao'}
            </button>
          )}
          {onMove && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 text-slate-700"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onMove(); }}
            >
              <FolderInput size={14} className="text-amber-600 shrink-0" /> Di chuyển
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
export function DriveFilesListHeader({
  actionsLabel = '',
  selectable = false,
  allSelected = false,
  someSelected = false,
  onSelectAll,
}) {
  const grid = selectable ? DRIVE_FILE_LIST_GRID_SELECTABLE : DRIVE_FILE_LIST_GRID;
  return (
    <div className={`grid ${grid} gap-2 px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase border-b bg-slate-50`}>
      {selectable && (
        <div className="flex items-center justify-center">
          <DriveFileSelectCheckbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={(e) => onSelectAll?.(e.target.checked)}
            title="Chọn tất cả"
          />
        </div>
      )}
      <div>Tên</div>
      <div>Người tải lên</div>
      <div>Ngày tải lên</div>
      <div className="text-right">Kích thước</div>
      <div>{actionsLabel}</div>
    </div>
  );
}

/** Một dòng file trong bảng list */
export function DriveFileListRow({
  file, formatBytes, onPreview, renderActions, className = '', alwaysShowActions = false,
  selectable = false, selected = false, onToggleSelect, onContextMenu,
}) {
  const isImg = isImageMime(file.mime_type, file.name);
  const quickOpen = isQuickPreviewFile(file);
  const grid = selectable ? DRIVE_FILE_LIST_GRID_SELECTABLE : DRIVE_FILE_LIST_GRID;
  return (
    <div
      data-drive-select-id={selectable ? driveSelectId(file.id) : undefined}
      onClick={(e) => {
        if (shouldIgnoreDriveMarqueeClick()) return;
        if (selectable && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          onToggleSelect?.(file);
          return;
        }
        if (quickOpen) onPreview?.(file);
      }}
      onDoubleClick={() => onPreview?.(file)}
      onContextMenu={(e) => onContextMenu?.(e, file)}
      className={`group grid ${grid} gap-2 px-3 py-2.5 items-center hover:bg-slate-50 cursor-pointer ${
        selected ? 'bg-blue-50/70 hover:bg-blue-50/70' : ''
      } ${className}`}
    >
      {selectable && (
        <div className="flex items-center justify-center" data-no-marquee>
          <DriveFileSelectCheckbox
            checked={selected}
            onChange={() => onToggleSelect?.(file)}
            title={selected ? 'Bỏ chọn' : 'Chọn file'}
          />
        </div>
      )}
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
      <div className={`flex items-center gap-0.5 justify-self-end ${alwaysShowActions ? '' : 'opacity-0 group-hover:opacity-100 transition'}`}>
        {renderActions?.(file)}
      </div>
    </div>
  );
}

/** Bảng list đầy đủ */
export function DriveFilesListView({
  files, formatBytes, onPreview, renderActions, alwaysShowActions = false, actionsLabel = '',
  selectedIds, onToggleSelect, onSelectAll, onSelectionChange, onContextMenu,
  bare = false,
  embedMarquee = true,
}) {
  if (!files?.length) return null;
  const selectable = !!onToggleSelect;
  const idSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const allSelected = selectable && files.length > 0 && files.every((f) => idSet.has(driveSelectId(f.id)));
  const someSelected = selectable && files.some((f) => idSet.has(driveSelectId(f.id))) && !allSelected;

  const rowsInner = (
    <div className="divide-y">
      {files.map((f) => (
        <DriveFileListRow
          key={f.id}
          file={f}
          formatBytes={formatBytes}
          onPreview={onPreview}
          renderActions={renderActions}
          alwaysShowActions={alwaysShowActions}
          selectable={selectable}
          selected={idSet.has(driveSelectId(f.id))}
          onToggleSelect={onToggleSelect}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );

  const rows = embedMarquee ? (
    <DriveMarqueeSelectArea
      enabled={selectable && !!onSelectionChange}
      selectedIds={selectedIds}
      onSelectionChange={onSelectionChange}
      className={bare ? 'min-h-[120px]' : undefined}
    >
      {rowsInner}
    </DriveMarqueeSelectArea>
  ) : rowsInner;

  if (bare) return rows;

  return (
    <div className="bg-white border rounded-lg min-w-0">
      <DriveFilesListHeader
        actionsLabel={actionsLabel}
        selectable={selectable}
        allSelected={allSelected}
        someSelected={someSelected}
        onSelectAll={onSelectAll}
      />
      {rows}
    </div>
  );
}

const GRID_COLS = {
  default: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3',
  picker: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3',
};

/** Grid card lớn có thumbnail */
export function DriveFilesGridView({
  files, formatBytes, onPreview, renderActions, columns = 'default', alwaysShowActions = false,
  selectedIds, onToggleSelect, onSelectionChange, onContextMenu,
  embedMarquee = true,
}) {
  if (!files?.length) return null;
  const selectable = !!onToggleSelect;
  const idSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const gridClass = GRID_COLS[columns] || GRID_COLS.default;

  const cards = files.map((f) => {
        const isImg = isImageMime(f.mime_type, f.name);
        const isGws = isGoogleWorkspaceFile(f.mime_type);
        const isPdf = isPdfFile(f.mime_type, f.name);
        const isVid = isVideoFile(f.mime_type, f.name);
        const quickOpen = isQuickPreviewFile(f);
        const showThumbArea = isImg || isGws || isPdf || isVid || !!f.thumbnail_url;
        const selected = idSet.has(driveSelectId(f.id));
        return (
          <div
            key={f.id}
            data-drive-select-id={selectable ? driveSelectId(f.id) : undefined}
            onClick={(e) => {
              if (shouldIgnoreDriveMarqueeClick()) return;
              if (selectable && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                onToggleSelect?.(f);
              }
            }}
            onDoubleClick={() => onPreview?.(f)}
            onContextMenu={(e) => onContextMenu?.(e, f)}
            className={`group bg-white border rounded-lg overflow-hidden hover:border-blue-400 hover:shadow-md cursor-pointer flex flex-col transition relative ${
              selected ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50/40' : ''
            }`}
          >
            {selectable && (
              <div className="absolute top-2 left-2 z-10" data-no-marquee>
                <DriveFileSelectCheckbox
                  checked={selected}
                  onChange={() => onToggleSelect?.(f)}
                  title={selected ? 'Bỏ chọn' : 'Chọn file'}
                  className="bg-white/90 shadow-sm"
                />
              </div>
            )}
            <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-1.5 min-w-0">
              <DriveFileIcon mime={f.mime_type} size={16} className="shrink-0" />
              <p
                className={`text-[13px] font-medium truncate min-w-0 flex-1 ${quickOpen ? 'text-blue-700' : 'text-slate-800'}`}
                title={f.name}
                onClick={(e) => {
                  if (shouldIgnoreDriveMarqueeClick()) return;
                  if (quickOpen) { e.stopPropagation(); onPreview?.(f); }
                }}
              >
                {f.name}
              </p>
              <div className={`shrink-0 ${alwaysShowActions ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}>
                {renderActions?.(f)}
              </div>
            </div>
            <div
              className={`relative mx-2 mb-2 aspect-[4/3] bg-slate-50 border rounded flex items-center justify-center overflow-hidden group/thumb ${quickOpen ? 'cursor-pointer' : ''}`}
              onClick={(e) => {
                if (shouldIgnoreDriveMarqueeClick()) return;
                if (quickOpen) { e.stopPropagation(); onPreview?.(f); }
              }}
              title={isImg ? 'Xem ảnh full màn hình' : isGws ? 'Mở chỉnh sửa' : isPdf ? 'Xem PDF' : isVid ? 'Xem video' : undefined}
              role={quickOpen ? 'button' : undefined}
              tabIndex={quickOpen ? 0 : undefined}
              onKeyDown={(e) => { if (quickOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPreview?.(f); } }}
            >
              {showThumbArea ? (
                <>
                  <DriveFileThumbnail file={f} size={52} zoomHint={isImg} />
                  {isVid && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none">
                      <span className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center shadow-md">
                        <Play size={22} className="text-slate-800 ml-0.5" fill="currentColor" />
                      </span>
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
  });

  const grid = <div className={gridClass}>{cards}</div>;

  if (!embedMarquee) return grid;

  return (
    <DriveMarqueeSelectArea
      enabled={selectable && !!onSelectionChange}
      selectedIds={selectedIds}
      onSelectionChange={onSelectionChange}
      className={gridClass}
    >
      {cards}
    </DriveMarqueeSelectArea>
  );
}
