import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import FilePreviewSidePanel from '../components/FilePreviewSidePanel';
import { resolveFilePreviewMode } from '../lib/filePreview';
import { getFileOpenAnchorProps } from '../lib/publicFileUrl';

const FilePreviewContext = createContext(null);

export function FilePreviewProvider({ children }) {
  const [item, setItem] = useState(null);

  const openFilePreview = useCallback((payload) => {
    if (!payload?.url) return;
    setItem({
      url: payload.url,
      fileName: payload.fileName || payload.title || '',
      title: payload.title || payload.fileName || 'Xem file',
      mimeType: payload.mimeType || payload.mime_type || '',
    });
  }, []);

  const closeFilePreview = useCallback(() => setItem(null), []);

  const value = useMemo(
    () => ({ openFilePreview, closeFilePreview, previewItem: item }),
    [openFilePreview, closeFilePreview, item],
  );

  return (
    <FilePreviewContext.Provider value={value}>
      {children}
      {item && <FilePreviewSidePanel item={item} onClose={closeFilePreview} />}
    </FilePreviewContext.Provider>
  );
}

export function useFilePreview() {
  return useContext(FilePreviewContext);
}

/** Nút/link mở file — PDF/Excel/Word mở panel bên phải; loại khác mở tab mới. */
export function FilePreviewOpenLink({
  fileUrl,
  fileName,
  mimeType,
  className = 'text-[10px] text-blue-600 hover:underline cursor-pointer',
  children,
  onClick,
}) {
  const ctx = useFilePreview();
  const label = children || fileName || 'Xem file';
  const mode = resolveFilePreviewMode({ mimeType, fileName, fileUrl });

  if (mode && ctx?.openFilePreview) {
    return (
      <button
        type="button"
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
          ctx.openFilePreview({ url: fileUrl, fileName, mimeType, title: fileName });
        }}
      >
        {label}
      </button>
    );
  }

  const openProps = fileUrl ? getFileOpenAnchorProps(fileUrl, { fileName }) : null;
  if (!openProps) return null;
  return (
    <a
      {...openProps}
      className={className}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
    >
      {label}
    </a>
  );
}
