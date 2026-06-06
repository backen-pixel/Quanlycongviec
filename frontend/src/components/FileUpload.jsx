import { useState, useRef } from 'react';
import api from '../lib/api';
import { Paperclip, X, FileText, Image, Film, File, Box } from 'lucide-react';

const ICON_MAP = {
  image: Image,
  video: Film,
  pdf: FileText,
  skp: Box,   // SketchUp 3D
  default: File,
};

function getFileIcon(mime) {
  if (!mime) return ICON_MAP.default;
  if (mime.startsWith('image/')) return ICON_MAP.image;
  if (mime.startsWith('video/')) return ICON_MAP.video;
  if (mime.includes('pdf')) return ICON_MAP.pdf;
  if (mime.includes('skp') || mime.includes('sketch')) return ICON_MAP.skp;
  return ICON_MAP.default;
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1048576).toFixed(1) + 'MB';
}

export function FileUploadButton({ onFilesUploaded, multiple = true, compact = false }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;

    setUploading(true);
    try {
      const formData = new FormData();
      for (const f of files) formData.append('files', f);

      const { data } = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      onFilesUploaded?.(data.files || []);
    } catch (err) {
      console.error('Upload error:', err);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <>
      <input ref={inputRef} type="file" multiple={multiple} onChange={handleFiles}
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.zip,.rar,.skp,.skb" className="hidden" />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
        className={`flex items-center gap-1 cursor-pointer ${compact
          ? 'text-gray-400 hover:text-blue-500'
          : 'h-9 px-3 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200'
        } disabled:opacity-50`}>
        {uploading ? (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
        ) : (
          <Paperclip className="h-4 w-4" />
        )}
        {!compact && <span>{uploading ? 'Đang tải...' : 'Đính kèm'}</span>}
      </button>
    </>
  );
}

export function FilePreview({ files, onRemove, small = false, large = false }) {
  if (!files?.length) return null;

  const imgClass = large
    ? 'w-full max-w-sm h-44 object-contain bg-gray-50 border rounded-xl'
    : small
      ? 'w-12 h-12 rounded-lg object-cover'
      : 'w-20 h-20 rounded-lg object-cover';

  return (
    <div className={`flex flex-wrap gap-3 ${small ? 'mt-1' : 'mt-2'} ${large ? 'w-full' : ''}`}>
      {files.map((f, i) => {
        const Icon = getFileIcon(f.mime_type);
        const isImage = f.mime_type?.startsWith('image/');
        return (
          <div key={i} className={`relative group ${large ? 'w-full max-w-sm' : small ? '' : 'bg-gray-50 rounded-lg border p-2'}`}>
            {isImage ? (
              <a href={f.file_url} target="_blank" rel="noopener noreferrer" className={large ? 'block' : undefined}>
                <img src={f.file_url} alt={f.file_name} className={imgClass} />
                {large && (
                  <p className="text-xs text-gray-600 mt-1.5 truncate px-1">{f.file_name}</p>
                )}
              </a>
            ) : (
              <a href={f.file_url} target="_blank" rel="noopener noreferrer"
                className={`flex items-center gap-2 text-blue-600 hover:underline ${large ? 'p-3 bg-gray-50 rounded-xl border text-sm' : 'text-xs'}`}>
                <Icon className={`shrink-0 ${large ? 'h-6 w-6' : 'h-4 w-4'}`} />
                <span className={`truncate ${large ? 'max-w-none flex-1 font-medium' : 'max-w-[120px]'}`}>{f.file_name}</span>
                {!small && <span className="text-gray-400">{formatSize(f.file_size)}</span>}
              </a>
            )}
            {onRemove && (
              <button onClick={() => onRemove(i)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer text-[10px]">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FileList({ files }) {
  if (!files?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {files.map((f, i) => {
        const Icon = getFileIcon(f.mime_type);
        const isImage = f.mime_type?.startsWith('image/');
        return isImage ? (
          <a key={i} href={f.file_url} target="_blank" rel="noopener noreferrer">
            <img src={f.file_url} alt={f.file_name} className="w-16 h-16 rounded-lg object-cover border" />
          </a>
        ) : (
          <a key={i} href={f.file_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded">
            <Icon className="h-3 w-3" />{f.file_name}
          </a>
        );
      })}
    </div>
  );
}
