/**
 * DriveFilePicker — modal chọn file từ Drive để gắn vào entity (lead/task/...).
 * Hiển thị list / grid giống trang Drive, có người tải + ngày tải.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Loader2, FolderOpen, ChevronRight, Link2, LayoutGrid, List as ListIcon, Eye } from 'lucide-react';
import {
  driveListRoots, driveListRootChildren, driveListFolderChildren, driveSearch,
  driveLinkFile, driveFormatBytes, drivePreview, driveOpenDownload,
} from '../../lib/drive';
import DriveFileIcon from './DriveFileIcon';
import PreviewModal from './PreviewModal';
import {
  DriveFilesGridView, DriveFilesListView,
  isImageMime, filterImageFiles,
} from './DriveFileViews';

function readViewMode() {
  try { return localStorage.getItem('drive.pickerViewMode') || 'list'; } catch (_) { return 'list'; }
}

export default function DriveFilePicker({
  entityType,
  entityId,
  onPicked,
  onClose,
  title = 'Chọn file từ Drive',
  pickLabel,
}) {
  const actionLabel = pickLabel || (entityType && entityId ? 'Gắn' : 'Chọn');
  const [roots, setRoots] = useState([]);
  const [activeRoot, setActiveRoot] = useState(null);
  const [folder, setFolder] = useState(null);
  const [crumb, setCrumb] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(null);
  const [viewMode, setViewMode] = useState(readViewMode);
  const [previewing, setPreviewing] = useState(null);

  useEffect(() => {
    try { localStorage.setItem('drive.pickerViewMode', viewMode); } catch (_) {}
  }, [viewMode]);

  useEffect(() => {
    (async () => {
      const r = await driveListRoots();
      setRoots(r.roots || []);
      if (r.roots?.[0]) await openRoot(r.roots[0]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openRoot(root) {
    setLoading(true);
    setActiveRoot(root);
    setFolder(null);
    setCrumb([{ type: 'root', id: root.id, name: root.name }]);
    setQuery('');
    try {
      const r = await driveListRootChildren(root.id);
      setFolders(r.folders || []);
      setFiles(r.files || []);
    } finally { setLoading(false); }
  }

  async function openFolder(f) {
    setLoading(true);
    try {
      const r = await driveListFolderChildren(f.id);
      setFolder(r.folder);
      setFolders(r.folders || []);
      setFiles(r.files || []);
      setCrumb((c) => [...c, { type: 'folder', id: f.id, name: f.name }]);
    } finally { setLoading(false); }
  }

  async function jumpCrumb(idx) {
    const c = crumb[idx];
    if (c.type === 'root') {
      const root = roots.find((x) => x.id === c.id);
      if (root) return openRoot(root);
    }
    if (c.type === 'folder') {
      setLoading(true);
      const r = await driveListFolderChildren(c.id);
      setFolder(r.folder);
      setFolders(r.folders || []);
      setFiles(r.files || []);
      setCrumb((cur) => cur.slice(0, idx + 1));
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!query.trim()) return;
    const t = setTimeout(async () => {
      try {
        const r = await driveSearch({ q: query.trim(), root_id: activeRoot?.id });
        setFolders(r.folders || []);
        setFiles(r.files || []);
      } catch (_) {}
    }, 300);
    return () => clearTimeout(t);
  }, [query, activeRoot?.id]);

  async function openPreview(file) {
    try {
      const meta = await drivePreview(file.id);
      setPreviewing({ ...file, preview: meta });
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  async function pick(file) {
    if (entityType && entityId) {
      try {
        setSubmitting(file.id);
        await driveLinkFile(file.id, entityType, entityId);
        onPicked?.(file);
        onClose?.();
      } catch (e) { alert(e?.response?.data?.error || e?.message); }
      finally { setSubmitting(null); }
    } else {
      onPicked?.(file);
      onClose?.();
    }
  }

  function renderPickAction(file) {
    return (
      <>
        {isImageMime(file.mime_type, file.name) && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openPreview(file); }}
            className="p-1.5 hover:bg-blue-50 text-blue-600 rounded"
            title="Xem ảnh"
          >
            <Eye size={14} />
          </button>
        )}
        <button
          type="button"
          disabled={submitting === file.id}
          onClick={(e) => { e.stopPropagation(); pick(file); }}
          className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-1 disabled:opacity-50"
        >
          {submitting === file.id ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
          {actionLabel}
        </button>
      </>
    );
  }

  const modal = (
    <div
      className="fixed inset-0 z-[10050] bg-black/55 flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[min(92vh,880px)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="h-14 px-4 border-b flex items-center justify-between gap-3 shrink-0">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-md overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="Dạng danh sách"
                className={`h-7 w-7 flex items-center justify-center transition ${viewMode === 'list' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <ListIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Dạng lưới"
                className={`h-7 w-7 flex items-center justify-center transition ${viewMode === 'grid' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <LayoutGrid className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              </button>
            </div>
            <button type="button" onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 shrink-0">
              <X className="h-4 w-4 shrink-0" />
            </button>
          </div>
        </header>

        <div className="px-4 py-2 border-b bg-slate-50 flex items-center gap-2 shrink-0 flex-wrap">
          <select
            value={activeRoot?.id || ''}
            onChange={(e) => {
              const r = roots.find((x) => x.id === e.target.value);
              if (r) openRoot(r);
            }}
            className="px-2 py-1.5 border rounded-lg text-sm bg-white focus:outline-none focus:border-blue-400 max-w-[180px]"
          >
            {roots.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <nav className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-x-auto">
            {crumb.map((c, i) => (
              <span key={`${c.type}-${c.id}`} className="flex items-center gap-1 shrink-0">
                {i > 0 && <ChevronRight size={12} className="text-slate-400" />}
                <button type="button" onClick={() => jumpCrumb(i)} className="px-2 py-1 rounded hover:bg-white text-slate-600 truncate max-w-[140px]">
                  {c.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="relative">
            <Search size={12} className="absolute left-2 top-2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm..."
              className="pl-7 pr-2 py-1.5 w-44 text-sm border rounded-lg bg-white focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="animate-spin mr-2" size={18} /> Đang tải...
            </div>
          ) : (
            <>
              {folders.length > 0 && (
                <section className="mb-4">
                  <h3 className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Thư mục</h3>
                  <div className="bg-white border rounded-lg divide-y overflow-hidden">
                    {folders.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => openFolder(f)}
                        className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 hover:bg-blue-50/80 transition-colors"
                      >
                        <DriveFileIcon isFolder size={18} className="shrink-0" />
                        <span className="text-sm text-slate-800 truncate flex-1">{f.name}</span>
                        <ChevronRight size={14} className="text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {files.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-semibold text-slate-500 uppercase mb-2">File</h3>
                  {viewMode === 'list' ? (
                    <DriveFilesListView
                      files={files}
                      formatBytes={driveFormatBytes}
                      onPreview={openPreview}
                      renderActions={renderPickAction}
                      alwaysShowActions
                      actionsLabel="Chọn"
                    />
                  ) : (
                    <DriveFilesGridView
                      files={files}
                      formatBytes={driveFormatBytes}
                      onPreview={openPreview}
                      renderActions={renderPickAction}
                      columns="picker"
                      alwaysShowActions
                    />
                  )}
                </section>
              )}

              {folders.length === 0 && files.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <FolderOpen className="mx-auto mb-2" size={36} />
                  <p className="text-sm">Trống</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {previewing && (
        <PreviewModal
          item={previewing}
          galleryFiles={filterImageFiles(files)}
          onClose={() => setPreviewing(null)}
          onDownload={(f) => driveOpenDownload((f || previewing).id, (f || previewing).name)}
        />
      )}
    </div>
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
}
