/**
 * Hiển thị file Drive trong tin nhắn chat (lead / messenger).
 */
import { useEffect, useState } from 'react';
import { Cloud, Download, Eye } from 'lucide-react';
import { drivePreview, driveOpenDownload, driveFetchFileBlobUrl, driveFormatBytes } from '../../lib/drive';
import { FileTypeBadge } from '../MessengerFileAttachmentCard';
import PreviewModal from './PreviewModal';

export default function DriveChatAttachmentCard({ attachment, compact = false, alignEnd = false }) {
  const id = attachment?.drive_file_id;
  const name = attachment?.name || 'File Drive';
  const mime = attachment?.type || '';
  const isImg = mime.startsWith('image/');
  const [imgUrl, setImgUrl] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!isImg || !id) return undefined;
    let cancelled = false;
    let blobUrl = null;
    driveFetchFileBlobUrl(id)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        blobUrl = u;
        setImgUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [id, isImg]);

  async function openPreview() {
    if (!id) return;
    setLoadingPreview(true);
    try {
      const meta = await drivePreview(id);
      setPreviewing({ id, name, mime_type: mime, preview: meta });
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Không mở được file');
    } finally {
      setLoadingPreview(false);
    }
  }

  if (isImg) {
    return (
      <>
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={name}
            className={`${
              alignEnd ? 'ml-auto ' : ''
            }${
              compact
                ? 'rounded-2xl max-w-full max-h-72 cursor-pointer shadow-md object-cover block'
                : 'rounded-lg max-w-full max-h-48 cursor-pointer bg-slate-100 object-contain'
            }`}
            onClick={() => void openPreview()}
          />
        ) : (
          <div className={`flex items-center gap-2 text-xs text-slate-500 ${alignEnd ? 'ml-auto' : ''}`}>
            <Cloud size={14} className="text-blue-500" /> Đang tải ảnh Drive…
          </div>
        )}
        {previewing && (
          <PreviewModal item={previewing} onClose={() => setPreviewing(null)} />
        )}
      </>
    );
  }

  const sizeLabel = attachment?.size ? driveFormatBytes(attachment.size) : '';
  const widthClass = compact ? 'w-full max-w-[248px]' : 'w-full max-w-[320px]';

  return (
    <>
      <div
        className={`flex items-center gap-2 rounded-xl border border-sky-100/90 bg-gradient-to-r from-sky-50/95 to-slate-50/90 shadow-sm box-border min-w-0 overflow-hidden ${
          alignEnd ? 'ml-auto' : ''
        } ${widthClass} ${compact ? 'px-2.5 py-2' : 'px-3.5 py-3'}`}
      >
        <FileTypeBadge name={name} mime={mime} compact={compact} />

        <div className="flex-1 min-w-0 basis-0 overflow-hidden">
          <p
            className="block w-full text-[13px] font-semibold text-slate-900 truncate leading-snug"
            title={name}
          >
            {name}
          </p>
          <div className="flex items-center gap-1 mt-0.5 min-w-0 overflow-hidden">
            <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 font-medium shrink-0">
              <Cloud className="h-2.5 w-2.5 shrink-0" /> Drive
            </span>
            {sizeLabel ? (
              <span className="text-[10px] text-slate-500 truncate min-w-0">{sizeLabel}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => void openPreview()}
            disabled={loadingPreview}
            className="w-7 h-7 rounded-lg border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-600 flex items-center justify-center transition disabled:opacity-40"
            title="Xem trước"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void driveOpenDownload(id, name)}
            className="w-7 h-7 rounded-lg border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-600 flex items-center justify-center transition"
            title="Tải xuống"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {previewing && (
        <PreviewModal item={previewing} onClose={() => setPreviewing(null)} />
      )}
    </>
  );
}
