import { useCallback, useRef, useState } from 'react';
import { Upload, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { driveUploadFile, driveFormatBytes } from '../../lib/drive';

/**
 * Vùng drag&drop để tải file lên folder/root hiện tại.
 * props: { folderId, rootId, onUploaded(file), onClose, disabled }
 */
export default function UploadDropzone({ folderId, rootId, onUploaded, onClose, disabled }) {
  const [items, setItems] = useState([]); // { id, file, progress, status, error }
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const startUpload = useCallback(async (files) => {
    if (disabled) return;
    const newItems = Array.from(files).map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      progress: 0,
      status: 'uploading',
      error: null,
    }));
    setItems((cur) => [...cur, ...newItems]);

    for (const it of newItems) {
      try {
        const res = await driveUploadFile(it.file, {
          folder_id: folderId,
          root_id: folderId ? null : rootId,
          onProgress: (p) => setItems((cur) => cur.map((x) => x.id === it.id ? { ...x, progress: p } : x)),
        });
        setItems((cur) => cur.map((x) => x.id === it.id ? { ...x, status: 'done', progress: 100 } : x));
        onUploaded?.(res.file);
      } catch (e) {
        const msg = e?.response?.data?.error || e?.message || 'Lỗi upload';
        setItems((cur) => cur.map((x) => x.id === it.id ? { ...x, status: 'error', error: msg } : x));
      }
    }
  }, [folderId, rootId, disabled, onUploaded]);

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
        <p className="text-xs text-slate-400 mt-0.5">hoặc bấm để chọn file (nhiều file)</p>
        <input ref={inputRef} type="file" multiple hidden onChange={onSelect} disabled={disabled} />
      </div>

      {items.length > 0 && (
        <ul className="mt-3 space-y-1.5 max-h-48 overflow-auto">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 text-xs">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="truncate text-slate-700">{it.file.name}</span>
                  <span className="text-slate-400 ml-2 shrink-0">{driveFormatBytes(it.file.size)}</span>
                </div>
                <div className="h-1 bg-slate-100 rounded mt-1 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      it.status === 'error' ? 'bg-red-500' : it.status === 'done' ? 'bg-emerald-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${it.progress}%` }}
                  />
                </div>
                {it.error && <div className="text-[10px] text-red-600 mt-0.5">{it.error}</div>}
              </div>
              {it.status === 'done' && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
              {it.status === 'error' && <AlertCircle size={16} className="text-red-500 shrink-0" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
