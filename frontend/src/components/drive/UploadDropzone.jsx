import { useCallback, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { driveUploadFilesBatch } from '../../lib/drive';

/**
 * Vùng drag&drop để tải file lên folder/root hiện tại.
 * props: { folderId, rootId, onUploaded(file), onBatchComplete(), onClose, disabled }
 */
export default function UploadDropzone({ folderId, rootId, onUploaded, onBatchComplete, onClose, disabled }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const startUpload = useCallback(async (files) => {
    if (disabled) return;
    const list = Array.from(files);
    if (!list.length) return;

    await driveUploadFilesBatch(list, {
      folder_id: folderId,
      root_id: folderId ? null : rootId,
      onFileComplete: (result) => {
        if (result.ok) onUploaded?.(result.data?.file);
      },
    });
    onBatchComplete?.();
  }, [folderId, rootId, disabled, onUploaded, onBatchComplete]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDrag(false);
    if (!e.dataTransfer?.files?.length) return;
    void startUpload(e.dataTransfer.files);
  }, [startUpload]);

  const onSelect = (e) => {
    if (!e.target.files?.length) return;
    void startUpload(e.target.files);
    e.target.value = '';
  };

  return (
    <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Upload size={16} /> Tải file lên Drive
        </h3>
        {onClose && (
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        )}
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed text-center px-4 py-8 transition ${
          drag ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <Upload className="mx-auto mb-2 text-slate-400" size={28} />
        <p className="text-sm text-slate-600 font-medium">Kéo & thả file vào đây</p>
        <p className="text-xs text-slate-400 mt-0.5">hoặc bấm để chọn file (nhiều file) — tiến trình hiện ở góc dưới phải</p>
        <input ref={inputRef} type="file" multiple hidden onChange={onSelect} disabled={disabled} />
      </div>
    </div>
  );
}
