/**
 * DriveAttachments — embed vào trang detail (lead/task/project) để hiện file Drive đã gắn.
 *
 * Có 2 cách thêm file:
 *  • "Tải lên từ máy"  → upload vào folder entity trên Drive + auto link
 *  • "Liên kết file Drive" → chọn file đã có sẵn trong Drive
 *
 * Duyệt folder entity, tạo thư mục con, hiển thị file dạng list / grid.
 *
 * props: { entityType, entityId, className, onCountChange }
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link2, Upload, Loader2, LayoutGrid, List as ListIcon, FileText, Table2,
  FolderPlus, ChevronRight, X, Download, Trash2, FolderInput,
} from 'lucide-react';
import {
  driveLinksByEntity, driveUnlinkFile, drivePreview, driveOpenDownload, driveFormatBytes,
  driveUploadToEntity, driveCreateGoogleForEntity, driveEntityChildren, driveEntityCreateFolder,
  driveUpdateFile,
} from '../../lib/drive';
import DriveFilePicker from './DriveFilePicker';
import DriveEntityFolderPickerModal from './DriveEntityFolderPickerModal';
import PreviewModal from './PreviewModal';
import DriveLocationBar, { enrichDriveBreadcrumb } from './DriveLocationBar';
import DriveUploadStatus from './DriveUploadStatus';
import DriveFileIcon from './DriveFileIcon';
import { DriveFilesListView, DriveFilesGridView, filterImageFiles, DriveFileMoreMenu } from './DriveFileViews';

function readViewMode() {
  try { return localStorage.getItem('drive.viewMode') || 'grid'; } catch (_) { return 'grid'; }
}

export default function DriveAttachments({ entityType, entityId, className = '', onCountChange }) {
  const [links, setLinks] = useState([]);
  const [subFolders, setSubFolders] = useState([]);
  const [folderFiles, setFolderFiles] = useState([]);
  const [entityFolderId, setEntityFolderId] = useState(null);
  const [folderNav, setFolderNav] = useState({ history: [null], index: 0 });
  const currentFolderId = folderNav.history[folderNav.index] ?? null;
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [previewing, setPreviewing] = useState(null);
  const [creatingGoogle, setCreatingGoogle] = useState(null);
  const [viewMode, setViewMode] = useState(readViewMode);
  const [locationPath, setLocationPath] = useState([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null);
  const fileInputRef = useRef(null);

  const activeFolderId = currentFolderId || entityFolderId;

  const canGoBack = folderNav.index > 0;
  const canGoForward = folderNav.index < folderNav.history.length - 1;

  function navigateToFolder(folderId) {
    setFolderNav(({ history, index }) => {
      const next = [...history.slice(0, index + 1), folderId ?? null];
      return { history: next, index: next.length - 1 };
    });
  }

  function goBack() {
    setFolderNav(({ history, index }) => {
      if (index <= 0) return { history, index };
      return { history, index: index - 1 };
    });
  }

  function goForward() {
    setFolderNav(({ history, index }) => {
      if (index >= history.length - 1) return { history, index };
      return { history, index: index + 1 };
    });
  }

  useEffect(() => {
    try { localStorage.setItem('drive.viewMode', viewMode); } catch (_) {}
  }, [viewMode]);

  const reloadLinks = useCallback(async () => {
    if (!entityType || !entityId) return;
    const r = await driveLinksByEntity(entityType, entityId);
    setLinks(r.links || []);
  }, [entityType, entityId]);

  const reloadBrowse = useCallback(async () => {
    if (!entityType || !entityId) return;
    const r = await driveEntityChildren(entityType, entityId, currentFolderId || undefined);
    setSubFolders(r.folders || []);
    setFolderFiles(r.files || []);
    if (r.entity_folder_id) setEntityFolderId(r.entity_folder_id);
    setLocationPath(enrichDriveBreadcrumb(r.breadcrumb || []));
  }, [entityType, entityId, currentFolderId]);

  const reload = useCallback(async () => {
    if (!entityType || !entityId) return;
    setLoading(true);
    try {
      await Promise.all([reloadLinks(), reloadBrowse()]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, reloadLinks, reloadBrowse]);

  useEffect(() => {
    setEntityFolderId(null);
    setFolderNav({ history: [null], index: 0 });
    setSelectedIds(new Set());
  }, [entityType, entityId]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentFolderId]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    onCountChange?.(links.length);
  }, [links.length, onCountChange]);

  const linkByFileId = useMemo(() => {
    const m = new Map();
    for (const l of links) if (l.file_id) m.set(l.file_id, l.id);
    return m;
  }, [links]);

  function toggleSelect(file) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(file.id)) next.delete(file.id);
      else next.add(file.id);
      return next;
    });
  }

  function handleSelectAll(checked) {
    if (checked) setSelectedIds(new Set(folderFiles.map((f) => f.id)));
    else setSelectedIds(new Set());
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const selectedFiles = useMemo(
    () => folderFiles.filter((f) => selectedIds.has(f.id)),
    [folderFiles, selectedIds],
  );

  const selectedLinkIds = useMemo(
    () => selectedFiles.map((f) => linkByFileId.get(f.id)).filter(Boolean),
    [selectedFiles, linkByFileId],
  );

  async function bulkDownload() {
    if (!selectedFiles.length) return;
    setBulkWorking(true);
    try {
      for (const f of selectedFiles) {
        await driveOpenDownload(f.id, f.name);
      }
    } finally {
      setBulkWorking(false);
    }
  }

  async function bulkUnlink() {
    if (!selectedLinkIds.length) return;
    if (!confirm(`Xóa ${selectedLinkIds.length} file đã chọn?`)) return;
    setBulkWorking(true);
    try {
      await Promise.all(selectedLinkIds.map((id) => driveUnlinkFile(id)));
      setLinks((cur) => cur.filter((l) => !selectedLinkIds.includes(l.id)));
      clearSelection();
    } catch (e) {
      alert(e?.response?.data?.error || e?.message);
    } finally {
      setBulkWorking(false);
    }
  }

  function openMoveDialog(fileIds) {
    if (!fileIds?.length) return;
    setMoveTarget({ fileIds });
  }

  async function handleMoveToFolder(dest) {
    const ids = moveTarget?.fileIds || [];
    const { folderId, rootId } = typeof dest === 'object' && dest !== null
      ? dest
      : { folderId: dest, rootId: undefined };

    if (!ids.length) return;
    if (folderId == null && !rootId) return;

    const filesToMove = folderFiles.filter((f) => ids.includes(f.id));
    const alreadyThere = filesToMove.length > 0 && filesToMove.every((f) => {
      if (folderId) return f.folder_id === folderId;
      return f.folder_id == null && f.root_id === rootId;
    });
    if (alreadyThere) {
      alert('Các file đã nằm trong thư mục này.');
      return;
    }

    const body = folderId != null ? { folder_id: folderId } : { folder_id: null, root_id: rootId };

    setBulkWorking(true);
    try {
      await Promise.all(ids.map((id) => driveUpdateFile(id, body)));
      setMoveTarget(null);
      clearSelection();
      await reloadBrowse();
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Không di chuyển được file');
    } finally {
      setBulkWorking(false);
    }
  }

  async function unlink(linkId) {
    if (!confirm('Xóa file này?')) return;
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

    for (const file of selected) {
      try {
        await driveUploadToEntity(file, {
          entity_type: entityType,
          entity_id: entityId,
          folder_id: activeFolderId || undefined,
        });
      } catch (_) { /* panel góc phải hiển thị lỗi */ }
    }

    await reload();
  }

  async function handleCreateGoogle(kind) {
    setCreatingGoogle(kind);
    try {
      const r = await driveCreateGoogleForEntity({
        entity_type: entityType,
        entity_id: entityId,
        kind,
        folder_id: activeFolderId || undefined,
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

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setSavingFolder(true);
    try {
      await driveEntityCreateFolder(entityType, entityId, {
        name,
        parent_folder_id: activeFolderId || undefined,
      });
      setCreatingFolder(false);
      setNewFolderName('');
      await reloadBrowse();
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Không tạo được thư mục');
    } finally {
      setSavingFolder(false);
    }
  }

  function handleLocationNav(item) {
    if (item.type === 'folder') {
      navigateToFolder(item.id);
    } else if (item.type === 'root') {
      navigateToFolder(null);
    }
  }

  function renderActions(file) {
    const linkId = linkByFileId.get(file.id);
    return (
      <DriveFileMoreMenu
        onPreview={() => preview(file)}
        onDownload={() => driveOpenDownload(file.id, file.name)}
        onMove={() => openMoveDialog([file.id])}
        onUnlink={linkId ? () => unlink(linkId) : undefined}
        unlinkLabel="Xóa"
        showUnlink={!!linkId}
      />
    );
  }

  const isEmpty = !loading && subFolders.length === 0 && folderFiles.length === 0;

  return (
    <div className={`bg-white border rounded-xl p-4 ${className}`}>
      <DriveUploadStatus className="mb-3" />
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
            onClick={() => { setCreatingFolder(true); setNewFolderName(''); }}
            className="h-8 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5"
          >
            <FolderPlus size={12} /> Thư mục
          </button>
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

      {(locationPath.length > 0 || canGoBack || canGoForward) && (
        <DriveLocationBar
          items={locationPath}
          onNavigate={handleLocationNav}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onBack={goBack}
          onForward={goForward}
          className="rounded-lg border mb-3 -mx-1"
        />
      )}

      {creatingFolder && (
        <div className="mb-3 flex items-center gap-2 bg-slate-50 border rounded-lg p-2.5">
          <FolderPlus size={16} className="text-amber-500 shrink-0" />
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreateFolder();
              if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
            }}
            placeholder="Tên thư mục mới"
            className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:border-blue-400 bg-white"
          />
          <button
            type="button"
            onClick={() => void handleCreateFolder()}
            disabled={savingFolder || !newFolderName.trim()}
            className="h-7 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs disabled:opacity-50"
          >
            {savingFolder ? <Loader2 size={12} className="animate-spin" /> : 'Tạo'}
          </button>
          <button
            type="button"
            onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}
            className="h-7 px-2 text-slate-500 hover:text-slate-700"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
          <Loader2 size={18} className="animate-spin mr-2" /> Đang tải...
        </div>
      ) : (
        <>
          {subFolders.length > 0 && (
            <section className="mb-4">
              <h4 className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Thư mục</h4>
              <div className="bg-white border rounded-lg divide-y overflow-hidden">
                {subFolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => navigateToFolder(f.id)}
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

          {folderFiles.length > 0 ? (
            <>
              {selectedIds.size > 0 && (
                <div className="mb-3 flex items-center flex-wrap gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <span className="text-slate-700">
                    Đã chọn <strong className="text-blue-800">{selectedIds.size}</strong> file
                  </span>
                  <button
                    type="button"
                    onClick={() => void bulkDownload()}
                    disabled={bulkWorking}
                    className="h-7 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-md text-xs font-medium flex items-center gap-1 disabled:opacity-60"
                  >
                    <Download size={13} className="text-blue-600" /> Tải xuống
                  </button>
                  <button
                    type="button"
                    onClick={() => openMoveDialog(selectedFiles.map((f) => f.id))}
                    disabled={bulkWorking}
                    className="h-7 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-md text-xs font-medium flex items-center gap-1 disabled:opacity-60"
                  >
                    <FolderInput size={13} className="text-amber-600" /> Di chuyển
                  </button>
                  {selectedLinkIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void bulkUnlink()}
                      disabled={bulkWorking}
                      className="h-7 px-2.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-md text-xs font-medium flex items-center gap-1 disabled:opacity-60"
                    >
                      <Trash2 size={13} /> Xóa ({selectedLinkIds.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="h-7 px-2 text-slate-500 hover:text-slate-700 text-xs"
                  >
                    Bỏ chọn
                  </button>
                </div>
              )}

              {viewMode === 'list' ? (
                <DriveFilesListView
                  files={folderFiles}
                  formatBytes={driveFormatBytes}
                  onPreview={preview}
                  renderActions={renderActions}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onSelectAll={handleSelectAll}
                  onSelectionChange={setSelectedIds}
                />
              ) : (
                <DriveFilesGridView
                  files={folderFiles}
                  formatBytes={driveFormatBytes}
                  onPreview={preview}
                  renderActions={renderActions}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onSelectionChange={setSelectedIds}
                />
              )}

              {viewMode === 'grid' && selectedIds.size === 0 && folderFiles.length > 1 && (
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleSelectAll(true)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Chọn tất cả ({folderFiles.length})
                  </button>
                </div>
              )}
            </>
          ) : isEmpty ? (
            <div className="text-center py-12 text-slate-400 text-sm border border-dashed rounded-lg bg-slate-50/50">
              Chưa có file trong thư mục này. Tạo thư mục hoặc tải file lên.
            </div>
          ) : null}
        </>
      )}

      {moveTarget && (
        <DriveEntityFolderPickerModal
          entityType={entityType}
          entityId={entityId}
          fileCount={moveTarget.fileIds.length}
          submitting={bulkWorking}
          onConfirm={handleMoveToFolder}
          onClose={() => !bulkWorking && setMoveTarget(null)}
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
          galleryFiles={filterImageFiles(folderFiles)}
          onClose={() => setPreviewing(null)}
          onDownload={(f) => driveOpenDownload((f || previewing).id, (f || previewing).name)}
        />
      )}
    </div>
  );
}
