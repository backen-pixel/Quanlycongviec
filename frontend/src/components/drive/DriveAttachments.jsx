/**
 * DriveAttachments — embed vào trang detail (lead/task/project) để hiện file Drive đã gắn.
 *
 * Có 2 cách thêm file:
 *  • "Tải lên từ máy"  → upload vào folder entity trên Drive + auto link
 *  • "Liên kết file Drive" → chọn file đã có sẵn trong Drive
 *
 * Hiển thị file dạng list / grid (giống trang Drive chính).
 *
 * props: { entityType, entityId, className, onCountChange }
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Upload, Loader2, LayoutGrid, List as ListIcon, FileText, Table2 } from 'lucide-react';
import {
  driveLinksByEntity, driveUnlinkFile, drivePreview, driveOpenDownload, driveFormatBytes,
  driveUploadToEntity, driveCreateGoogleForEntity, driveEntityBreadcrumb,
} from '../../lib/drive';
import DriveFilePicker from './DriveFilePicker';
import PreviewModal from './PreviewModal';
import DriveLocationBar, { enrichDriveBreadcrumb } from './DriveLocationBar';
import { DriveFilesListView, DriveFilesGridView, filterImageFiles, DriveFileMoreMenu } from './DriveFileViews';

function readViewMode() {
  try { return localStorage.getItem('drive.viewMode') || 'grid'; } catch (_) { return 'grid'; }
}

export default function DriveAttachments({ entityType, entityId, className = '', onCountChange }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [previewing, setPreviewing] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [creatingGoogle, setCreatingGoogle] = useState(null);
  const [viewMode, setViewMode] = useState(readViewMode);
  const [locationPath, setLocationPath] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem('drive.viewMode', viewMode); } catch (_) {}
  }, [viewMode]);

  const reload = useCallback(async () => {
    if (!entityType || !entityId) return;
    setLoading(true);
    try {
      const r = await driveLinksByEntity(entityType, entityId);
      setLinks(r.links || []);
    } finally { setLoading(false); }
  }, [entityType, entityId]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!entityType || !entityId) {
      setLocationPath([]);
      return;
    }
    let cancelled = false;
    driveEntityBreadcrumb(entityType, entityId)
      .then((r) => {
        if (cancelled) return;
        setLocationPath(enrichDriveBreadcrumb(r.breadcrumb || []));
      })
      .catch(() => {
        if (!cancelled) setLocationPath([]);
      });
    return () => { cancelled = true; };
  }, [entityType, entityId, links.length]);

  useEffect(() => {
    onCountChange?.(links.length);
  }, [links.length, onCountChange]);

  const linkByFileId = useMemo(() => {
    const m = new Map();
    for (const l of links) if (l.file_id) m.set(l.file_id, l.id);
    return m;
  }, [links]);

  const files = useMemo(
    () => links.map((l) => l.file).filter(Boolean),
    [links],
  );

  async function unlink(linkId) {
    if (!confirm('Bỏ gắn file này?')) return;
    try {
      await driveUnlinkFile(linkId);
      setLinks((cur) => cur.filter((l) => l.id !== linkId));
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  async function preview(file) {
    try {
      const meta = await drivePreview(file.id);
      setPreviewing({ ...file, preview: meta });
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  function pickLocalFiles() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  async function handleFilesSelected(e) {
    const selected = Array.from(e.target.files || []);
    e.target.value = '';
    if (!selected.length) return;

    const initial = selected.map((f) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: f.name,
      size: f.size,
      progress: 0,
      status: 'uploading',
      error: null,
    }));
    setUploads((cur) => [...cur, ...initial]);

    for (let i = 0; i < selected.length; i++) {
      const file = selected[i];
      const item = initial[i];
      try {
        await driveUploadToEntity(file, {
          entity_type: entityType,
          entity_id: entityId,
          onProgress: (p) => {
            setUploads((cur) => cur.map((x) => (x.id === item.id ? { ...x, progress: p } : x)));
          },
        });
        setUploads((cur) => cur.map((x) => (x.id === item.id ? { ...x, progress: 100, status: 'done' } : x)));
      } catch (err) {
        setUploads((cur) => cur.map((x) => (x.id === item.id ? { ...x, status: 'error', error: err?.response?.data?.error || err?.message || 'Lỗi upload' } : x)));
      }
    }

    await reload();
    setTimeout(() => { setUploads((cur) => cur.filter((x) => x.status !== 'done')); }, 4000);
  }

  async function handleCreateGoogle(kind) {
    setCreatingGoogle(kind);
    try {
      const r = await driveCreateGoogleForEntity({
        entity_type: entityType,
        entity_id: entityId,
        kind,
      });
      await reload();
      if (r?.file) {
        setPreviewing({
          ...r.file,
          preview: r.preview || {
            preview_mode: 'google_edit',
            edit_embed_url: r.edit_embed_url,
            edit_url: r.edit_url,
            mime_type: r.file.mime_type,
          },
        });
      }
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || 'Không tạo được file');
    } finally {
      setCreatingGoogle(null);
    }
  }

  function renderActions(file) {
    const linkId = linkByFileId.get(file.id);
    return (
      <DriveFileMoreMenu
        onPreview={() => preview(file)}
        onDownload={() => driveOpenDownload(file.id, file.name)}
        onUnlink={linkId ? () => unlink(linkId) : undefined}
        showUnlink={!!linkId}
      />
    );
  }

  return (
    <div className={`bg-white border rounded-xl p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Link2 size={16} className="text-blue-600" /> File từ Drive ({links.length})
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              title="Dạng danh sách"
              className={`h-8 w-8 flex items-center justify-center transition ${viewMode === 'list' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <ListIcon size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title="Dạng lớn"
              className={`h-8 w-8 flex items-center justify-center transition ${viewMode === 'grid' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <LayoutGrid size={15} />
            </button>
          </div>
          <button
            type="button"
            onClick={pickLocalFiles}
            className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
          >
            <Upload size={12} /> Tải lên từ máy
          </button>
          <button
            type="button"
            onClick={() => handleCreateGoogle('doc')}
            disabled={!!creatingGoogle}
            className="h-8 px-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1 disabled:opacity-60"
            title="Tạo Google Doc và gắn vào bản ghi"
          >
            {creatingGoogle === 'doc' ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} className="text-blue-600" />}
            Doc
          </button>
          <button
            type="button"
            onClick={() => handleCreateGoogle('sheet')}
            disabled={!!creatingGoogle}
            className="h-8 px-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1 disabled:opacity-60"
            title="Tạo Google Sheet và gắn vào bản ghi"
          >
            {creatingGoogle === 'sheet' ? <Loader2 size={12} className="animate-spin" /> : <Table2 size={12} className="text-emerald-600" />}
            Sheet
          </button>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="h-8 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5"
          >
            <Link2 size={12} /> Liên kết file Drive
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".doc,.docx,.xls,.xlsx,.pdf,.ppt,.pptx,.txt,.csv,image/*"
            className="hidden"
            onChange={handleFilesSelected}
          />
        </div>
      </div>

      {locationPath.length > 0 && (
        <DriveLocationBar items={locationPath} readOnly className="rounded-lg border mb-3 -mx-1" />
      )}

      {uploads.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {uploads.map((u) => (
            <div key={u.id} className="flex items-center gap-2 text-xs px-2 py-1.5 bg-slate-50 rounded border">
              {u.status === 'uploading' && <Loader2 size={12} className="animate-spin text-blue-600 shrink-0" />}
              {u.status === 'done' && <span className="text-emerald-600 text-base leading-none">✓</span>}
              {u.status === 'error' && <span className="text-rose-600 text-base leading-none">✗</span>}
              <span className="flex-1 truncate text-slate-700" title={u.name}>{u.name}</span>
              {u.status === 'uploading' && (
                <>
                  <div className="w-24 h-1.5 bg-slate-200 rounded overflow-hidden">
                    <div className="h-full bg-blue-600 transition-all" style={{ width: `${u.progress}%` }} />
                  </div>
                  <span className="text-slate-500 w-9 text-right">{u.progress}%</span>
                </>
              )}
              {u.status === 'done' && <span className="text-emerald-600 text-[11px]">Đã tải lên</span>}
              {u.status === 'error' && <span className="text-rose-500 text-[11px] max-w-[200px] truncate" title={u.error}>{u.error}</span>}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
          <Loader2 size={18} className="animate-spin mr-2" /> Đang tải...
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm border border-dashed rounded-lg bg-slate-50/50">
          Chưa gắn file nào từ Drive
        </div>
      ) : viewMode === 'list' ? (
        <DriveFilesListView
          files={files}
          formatBytes={driveFormatBytes}
          onPreview={preview}
          renderActions={renderActions}
        />
      ) : (
        <DriveFilesGridView
          files={files}
          formatBytes={driveFormatBytes}
          onPreview={preview}
          renderActions={renderActions}
        />
      )}

      {picking && (
        <DriveFilePicker
          entityType={entityType}
          entityId={entityId}
          onPicked={() => reload()}
          onClose={() => setPicking(false)}
        />
      )}
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
}
