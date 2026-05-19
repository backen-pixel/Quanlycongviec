import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  Upload, X, Paperclip, ExternalLink, Link2,
  ChevronLeft, ChevronRight, Trash2, Download,
} from 'lucide-react';

/** Phân loại hiển thị: image | video | audio | link | doc */
export function fileSlideKind(f) {
  const mime = (f.mime_type || '').toLowerCase();
  const url = (f.file_url || '').trim();
  const isUrlOnly = !f.storage_path || mime === 'text/uri-list' || mime === 'application/link';

  if (isUrlOnly && /^https?:\/\//i.test(url)) return 'link';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (/\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i.test(url)) return 'image';
  if (/\.(mp4|webm|mov|ogg|m4v)(\?|$)/i.test(url)) return 'video';
  if (/\.(mp3|wav|m4a|aac|flac|ogg)(\?|$)/i.test(url)) return 'audio';
  return 'doc';
}

export function fileThumbEmoji(sk, f) {
  if (sk === 'image') return null;
  if (sk === 'video') return '🎬';
  if (sk === 'audio') return '🎵';
  if (sk === 'link') return '🔗';
  const mime = (f?.mime_type || '').toLowerCase();
  const name = (f?.file_name || '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return '📕';
  if (/(sheet|excel|spreadsheet)/.test(mime) || /\.(xlsx?|csv)$/i.test(name)) return '📊';
  if (/(word|document)/.test(mime) || /\.(docx?|rtf)$/i.test(name)) return '📄';
  if (/(zip|rar|7z|tar)/.test(mime) || /\.(zip|rar|7z)$/i.test(name)) return '📦';
  if (/(presentation|powerpoint)/.test(mime) || /\.(pptx?)$/i.test(name)) return '📽️';
  return '📎';
}

export function useAssignmentFiles(assignmentId, kind) {
  const { user } = useAuth();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!assignmentId) return;
    setLoading(true);
    try {
      const r = await api.get(`/crm/assignments/${assignmentId}/files`, { params: { kind } });
      setFiles(r.data?.files || []);
    } catch {
      setFiles([]);
    }
    setLoading(false);
  }, [assignmentId, kind]);

  useEffect(() => { void load(); }, [load]);

  const uploadFiles = async (fileList) => {
    setUploading(true);
    try {
      for (const file of fileList) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('kind', kind);
        await api.post(`/crm/assignments/${assignmentId}/files`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi upload file');
    }
    setUploading(false);
  };

  const addUrl = async (url, fileName) => {
    setUploading(true);
    try {
      await api.post(`/crm/assignments/${assignmentId}/files/link`, {
        url,
        file_name: fileName || undefined,
        kind,
      });
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi thêm URL');
    }
    setUploading(false);
  };

  const removeFile = async (fileId) => {
    if (!confirm('Xoá mục này?')) return;
    try {
      await api.delete(`/crm/assignments/${assignmentId}/files/${fileId}`);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi xóa');
    }
  };

  const canDelete = (f) => String(f.uploaded_by) === String(user?.id);

  return { files, loading, uploading, uploadFiles, addUrl, removeFile, canDelete, reload: load };
}

function AddUrlInline({ onAdd, busy }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const u = url.trim();
    if (!u) return;
    await onAdd(u, name.trim() || undefined);
    setUrl('');
    setName('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className="h-7 px-2.5 rounded-lg border border-blue-300 bg-white hover:bg-blue-50 text-blue-700 text-[11px] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
      >
        <Link2 className="h-3 w-3" />Thêm URL
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5 w-full sm:w-auto sm:min-w-[220px]">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://..."
        className="h-7 px-2 border rounded text-xs outline-none focus:border-blue-500 w-full"
        autoFocus
      />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên hiển thị (tuỳ chọn)"
        className="h-7 px-2 border rounded text-xs outline-none focus:border-blue-500 w-full"
      />
      <div className="flex gap-1">
        <button type="submit" disabled={busy || !url.trim()} className="h-7 px-2 rounded bg-blue-600 text-white text-[11px] cursor-pointer disabled:opacity-50">
          {busy ? '...' : 'Lưu'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setUrl(''); setName(''); }} className="h-7 px-2 rounded border text-[11px] cursor-pointer">
          Huỷ
        </button>
      </div>
    </form>
  );
}

/** Trình chiếu file yêu cầu — ảnh / video / URL; file khác chỉ nút tải */
export function RequirementFilesGallery({ assignmentId, canUpload }) {
  const { files, loading, uploading, uploadFiles, addUrl, removeFile, canDelete } = useAssignmentFiles(assignmentId, 'req');
  const [idx, setIdx] = useState(0);

  useEffect(() => { setIdx(0); }, [files.length, assignmentId]);

  const cur = files[idx];
  const kind = cur ? fileSlideKind(cur) : null;
  const go = (d) => setIdx((i) => {
    if (!files.length) return 0;
    return (i + d + files.length) % files.length;
  });

  const onPick = (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (list.length) void uploadFiles(list);
  };

  const renderSlide = () => {
    if (!cur) return null;
    if (kind === 'image') {
      return <img src={cur.file_url} alt={cur.file_name} className="max-h-[min(52vh,420px)] w-full object-contain bg-black/5" />;
    }
    if (kind === 'video') {
      return <video key={cur.id} src={cur.file_url} controls className="max-h-[min(52vh,420px)] w-full bg-black" />;
    }
    if (kind === 'audio') {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-8 min-h-[160px]">
          <span className="text-4xl">🎵</span>
          <p className="text-sm font-medium text-gray-800 text-center px-4">{cur.file_name}</p>
          <audio key={cur.id} src={cur.file_url} controls className="w-full max-w-md" />
        </div>
      );
    }
    if (kind === 'link') {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-8 min-h-[200px]">
          <ExternalLink className="h-10 w-10 text-blue-500" />
          <p className="text-sm font-medium text-gray-800 text-center px-4">{cur.file_name}</p>
          <p className="text-xs text-gray-500 break-all text-center px-6 max-h-16 overflow-y-auto">{cur.file_url}</p>
          <a href={cur.file_url} target="_blank" rel="noreferrer" className="h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" /> Mở liên kết
          </a>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-10 min-h-[200px]">
        <span className="text-5xl">{fileThumbEmoji('doc', cur)}</span>
        <p className="text-sm font-medium text-gray-800 text-center px-4 max-w-md">{cur.file_name}</p>
        <a
          href={cur.file_url}
          target="_blank"
          rel="noreferrer"
          download={cur.file_name}
          className="h-10 px-6 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-2 shadow-sm"
        >
          <Download className="h-4 w-4" /> Bấm để tải file về
        </a>
      </div>
    );
  };

  return (
    <div className="border border-blue-200 rounded-xl bg-blue-50/30 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-blue-100 bg-white/60">
        <h4 className="text-sm font-semibold text-gray-800">📋 File yêu cầu công việc</h4>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          {files.length > 0 && <span className="text-[11px] text-gray-500">{idx + 1} / {files.length}</span>}
          {canUpload && (
            <>
              <label className="h-7 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer">
                <Upload className="h-3 w-3" />{uploading ? '...' : 'Thêm file'}
                <input type="file" multiple onChange={onPick} disabled={uploading} className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.dwg,.dxf" />
              </label>
              <AddUrlInline busy={uploading} onAdd={addUrl} />
            </>
          )}
        </div>
      </div>
      {loading ? (
        <p className="text-center text-xs text-gray-400 py-12">Đang tải...</p>
      ) : files.length === 0 ? (
        <p className="text-center text-xs text-gray-400 py-12">Chưa có file — thêm file hoặc URL</p>
      ) : (
        <>
          <div className="relative bg-gray-900/5">
            {renderSlide()}
            {files.length > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center cursor-pointer shadow-lg" aria-label="Trước">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button type="button" onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center cursor-pointer shadow-lg" aria-label="Sau">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
          <div className="px-3 py-2 flex items-center justify-between gap-2 border-t border-blue-100 bg-white/80">
            <p className="text-xs text-gray-700 truncate flex-1" title={cur?.file_name}>{cur?.file_name}</p>
            <div className="flex items-center gap-2 shrink-0">
              {kind === 'doc' || kind === 'audio' ? (
                <a href={cur?.file_url} target="_blank" rel="noreferrer" download={cur?.file_name} className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5">
                  <Download className="h-3 w-3" /> Tải về
                </a>
              ) : kind === 'link' ? (
                <a href={cur?.file_url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline">Mở link</a>
              ) : (
                <a href={cur?.file_url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline">Mở</a>
              )}
              {cur && canDelete(cur) && (
                <button type="button" onClick={() => removeFile(cur.id)} className="text-[11px] text-red-500 hover:underline cursor-pointer">Xoá</button>
              )}
            </div>
          </div>
          {files.length > 1 && (
            <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto">
              {files.map((f, i) => {
                const sk = fileSlideKind(f);
                const emoji = fileThumbEmoji(sk, f);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setIdx(i)}
                    title={f.file_name}
                    className={`shrink-0 h-12 w-12 rounded-lg border-2 overflow-hidden cursor-pointer ${i === idx ? 'border-blue-600 ring-2 ring-blue-200' : 'border-gray-200 opacity-70 hover:opacity-100'}`}
                  >
                    {sk === 'image' ? (
                      <img src={f.file_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="h-full w-full flex items-center justify-center text-lg bg-gray-100">{emoji}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function isStagedUrl(item) {
  return item && typeof item === 'object' && item._stagedUrl === true;
}

/** File + URL khi tạo mới (chưa có assignment id) */
export function StagedAttachmentsSection({ files, onChange }) {
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [urlName, setUrlName] = useState('');

  const onPick = (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (!list.length) return;
    onChange([...(files || []), ...list]);
  };

  const removeAt = (idx) => onChange(files.filter((_, i) => i !== idx));

  const addStagedUrl = (e) => {
    e.preventDefault();
    const u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) {
      alert('URL phải bắt đầu bằng http:// hoặc https://');
      return;
    }
    let label = urlName.trim();
    if (!label) {
      try {
        const parsed = new URL(u);
        label = decodeURIComponent(parsed.pathname.split('/').pop() || '') || parsed.hostname;
      } catch {
        label = 'Liên kết';
      }
    }
    onChange([...(files || []), { _stagedUrl: true, url: u, name: label }]);
    setUrl('');
    setUrlName('');
    setUrlOpen(false);
  };

  const fmtSize = (b) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  const stagedKindIcon = (f) => {
    if (isStagedUrl(f)) return '🔗';
    if (f.type.startsWith('image/')) return '🖼️';
    if (f.type.startsWith('video/')) return '🎬';
    if (f.type.startsWith('audio/')) return '🎵';
    if (f.type.includes('pdf')) return '📕';
    if (/(sheet|excel)/.test(f.type)) return '📊';
    if (/(word|document)/.test(f.type)) return '📄';
    return '📎';
  };

  return (
    <div className="border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <Paperclip className="h-4 w-4" />
          📋 File yêu cầu công việc ({files.length})
        </h4>
        <div className="flex flex-wrap gap-1.5">
          <label className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1 cursor-pointer">
            <Upload className="h-3.5 w-3.5" />Thêm file
            <input type="file" multiple onChange={onPick} className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.dwg,.dxf" />
          </label>
          <button type="button" onClick={() => setUrlOpen((v) => !v)} className="h-8 px-3 rounded-lg border border-blue-300 text-blue-700 text-xs font-medium flex items-center gap-1 cursor-pointer hover:bg-blue-50">
            <Link2 className="h-3.5 w-3.5" />Thêm URL
          </button>
        </div>
      </div>
      {urlOpen && (
        <form onSubmit={addStagedUrl} className="mb-2 p-2 border border-blue-200 rounded-lg bg-blue-50/50 flex flex-col sm:flex-row gap-2">
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="flex-1 h-8 px-2 border rounded text-xs outline-none focus:border-blue-500" />
          <input type="text" value={urlName} onChange={(e) => setUrlName(e.target.value)} placeholder="Tên (tuỳ chọn)" className="sm:w-36 h-8 px-2 border rounded text-xs outline-none focus:border-blue-500" />
          <button type="submit" className="h-8 px-3 rounded bg-blue-600 text-white text-xs cursor-pointer">Thêm</button>
        </form>
      )}
      <p className="text-[11px] text-gray-500 mb-2">
        File / hình / video / URL hướng dẫn. Tải lên sau khi tạo nhiệm vụ.
      </p>

      {files.length === 0 ? (
        <p className="text-center text-xs text-gray-400 py-3 border border-dashed rounded-lg">
          Chưa có file hoặc URL
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {files.map((f, i) => {
            const isUrl = isStagedUrl(f);
            const isImg = !isUrl && f.type?.startsWith('image/');
            const previewUrl = isImg ? URL.createObjectURL(f) : null;
            const title = isUrl ? f.name : f.name;
            const sub = isUrl ? f.url : `${fmtSize(f.size)} • ${f.type || 'unknown'}`;
            return (
              <div key={isUrl ? `url-${f.url}-${i}` : `${f.name}-${i}`} className="flex items-center gap-2 p-2 border rounded-lg bg-blue-50/40">
                {isImg ? (
                  <img src={previewUrl} alt="" className="h-10 w-10 object-cover rounded shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded bg-white border flex items-center justify-center text-lg shrink-0">
                    {stagedKindIcon(f)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate" title={title}>{title}</p>
                  <p className="text-[10px] text-gray-400 truncate" title={sub}>{sub}</p>
                </div>
                <button type="button" onClick={() => removeAt(i)} className="text-gray-400 hover:text-red-500 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmtFileSize(b) {
  if (!b && b !== 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

/** File nộp công việc — danh sách + upload */
export function SubmitFilesCompact({ assignmentId, canUpload }) {
  const { files, loading, uploading, uploadFiles, removeFile, canDelete } = useAssignmentFiles(assignmentId, 'sub');
  const onPickSub = (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (list.length) void uploadFiles(list);
  };

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-emerald-100 bg-white/50">
        <span className="text-xs font-medium text-gray-800">
          📤 Nộp công việc {files.length > 0 && <span className="text-emerald-700 font-normal">({files.length} file)</span>}
        </span>
        {canUpload ? (
          <label className="h-7 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer shrink-0">
            <Upload className="h-3 w-3" />{uploading ? 'Đang nộp...' : 'Nộp file'}
            <input type="file" multiple onChange={onPickSub} disabled={uploading} className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar" />
          </label>
        ) : (
          <span className="text-[10px] text-gray-400">Chỉ NV được giao mới nộp</span>
        )}
      </div>

      {loading ? (
        <p className="text-center text-xs text-gray-400 py-3">Đang tải...</p>
      ) : files.length === 0 ? (
        <p className="text-center text-xs text-gray-400 py-3 px-3">Chưa có file nộp</p>
      ) : (
        <ul className="divide-y divide-emerald-100 max-h-40 overflow-y-auto">
          {files.map((f) => {
            const sk = fileSlideKind(f);
            const emoji = fileThumbEmoji(sk, f);
            const isImg = sk === 'image';
            return (
              <li key={f.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/60 group">
                {isImg ? (
                  <a href={f.file_url} target="_blank" rel="noreferrer" className="shrink-0">
                    <img src={f.file_url} alt="" className="h-9 w-9 rounded object-cover border border-emerald-100" />
                  </a>
                ) : (
                  <span className="h-9 w-9 shrink-0 flex items-center justify-center rounded bg-white border border-emerald-100 text-base">{emoji}</span>
                )}
                <div className="flex-1 min-w-0">
                  <a
                    href={f.file_url}
                    target="_blank"
                    rel="noreferrer"
                    download={f.file_name}
                    className="text-xs font-medium text-gray-800 hover:text-emerald-700 truncate block"
                    title={f.file_name}
                  >
                    {f.file_name}
                  </a>
                  <p className="text-[10px] text-gray-400">
                    {fmtFileSize(f.file_size)}
                    {f.uploader?.full_name ? ` · ${f.uploader.full_name}` : ''}
                  </p>
                </div>
                <a
                  href={f.file_url}
                  target="_blank"
                  rel="noreferrer"
                  download={f.file_name}
                  className="shrink-0 h-7 px-2 rounded border border-emerald-200 bg-white text-[10px] text-emerald-700 hover:bg-emerald-50 flex items-center gap-0.5"
                >
                  <Download className="h-3 w-3" /> Tải
                </a>
                {canDelete(f) && (
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    className="shrink-0 text-gray-400 hover:text-red-500 opacity-70 group-hover:opacity-100 cursor-pointer p-1"
                    title="Xoá"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
