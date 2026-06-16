/**
 * Hiển thị file Drive trong tin nhắn chat (lead / messenger).
 */
import { useEffect, useState } from 'react';
import { Cloud, Download, Eye } from 'lucide-react';
import { drivePreview, driveOpenDownload, driveFetchFileBlobUrl, driveFormatBytes } from '../../lib/drive';
import DriveFileIcon from './DriveFileIcon';
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

  return (
    <>
      <div
        className={`flex items-center gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 max-w-sm ${
          alignEnd ? 'ml-auto' : ''
        } ${compact ? 'text-xs' : 'text-sm'}`}
      >
        <DriveFileIcon mime={mime} size={compact ? 28 : 32} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-800 truncate" title={name}>{name}</p>
          <p className="text-[10px] text-blue-600 flex items-center gap-1">
            <Cloud size={10} /> Google Drive
            {attachment?.size ? ` · ${driveFormatBytes(attachment.size)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => void openPreview()}
            disabled={loadingPreview}
            className="p-1.5 rounded-lg hover:bg-white text-blue-600"
            title="Xem trước"
          >
            <Eye size={14} />
          </button>
          <button
            type="button"
            onClick={() => void driveOpenDownload(id, name)}
            className="p-1.5 rounded-lg hover:bg-white text-blue-600"
            title="Tải xuống"
          >
            <Download size={14} />
          </button>
        </div>
      </div>
      {previewing && (
        <PreviewModal item={previewing} onClose={() => setPreviewing(null)} />
      )}
    </>
  );
}
