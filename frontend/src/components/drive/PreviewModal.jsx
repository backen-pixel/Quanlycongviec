import { X, Download, ExternalLink } from 'lucide-react';
import { driveFormatBytes } from '../../lib/drive';

/**
 * PreviewModal — hiện thị preview file Drive.
 * Ưu tiên embed Google Drive (https://drive.google.com/file/d/<id>/preview) cho mọi loại;
 * fallback hiển thị icon + thông tin nếu không có view_url.
 */
export default function PreviewModal({ item, onClose, onDownload }) {
  const preview = item?.preview || {};
  const mime = item.mime_type || preview.mime_type || '';
  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  const isAudio = mime.startsWith('audio/');
  const embedUrl = preview.embed_url || preview.view_url;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="h-14 px-4 border-b flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-slate-800 truncate" title={item.name}>{item.name}</h2>
            <p className="text-xs text-slate-400">{mime || 'unknown'} · {driveFormatBytes(item.size_bytes)}</p>
          </div>
          <div className="flex items-center gap-2">
            {preview.view_url && (
              <a
                href={preview.view_url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3 border rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-slate-50"
              >
                <ExternalLink size={14} /> Mở Google Drive
              </a>
            )}
            <button
              onClick={onDownload}
              className="h-9 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"
            >
              <Download size={14} /> Tải xuống
            </button>
            <button onClick={onClose} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-slate-100">
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="flex-1 bg-slate-900 overflow-hidden flex items-center justify-center">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              className="w-full h-full bg-white"
              title={item.name}
              allow="autoplay; encrypted-media; fullscreen"
            />
          ) : isImage && preview.thumbnail_url ? (
            <img src={preview.thumbnail_url} alt={item.name} className="max-w-full max-h-full object-contain" />
          ) : (
            <div className="text-center text-slate-300">
              <p className="mb-2">Không có bản xem trước trực tiếp.</p>
              <button onClick={onDownload} className="px-4 py-2 bg-blue-600 rounded-lg text-white text-sm font-medium">
                Tải xuống để xem
              </button>
            </div>
          )}
          {/* Audio: phát đè */}
          {isAudio && !embedUrl && (
            <audio controls src={preview.view_url} className="w-3/4" />
          )}
          {isVideo && !embedUrl && (
            <video controls src={preview.view_url} className="max-w-full max-h-full" />
          )}
        </div>
      </div>
    </div>
  );
}
