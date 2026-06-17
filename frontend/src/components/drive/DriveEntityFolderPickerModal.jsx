/**
 * Modal chọn thư mục đích — cây entity Lead/Deal hoặc Drive chung.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, ChevronRight, FolderInput, Globe } from 'lucide-react';
import {
  driveEntityChildren,
  driveListRoots,
  driveListRootChildren,
  driveListFolderChildren,
  driveFolderBreadcrumb,
} from '../../lib/drive';
import DriveLocationBar, { enrichDriveBreadcrumb, driveScopeHomeLabel } from './DriveLocationBar';
import DriveFileIcon from './DriveFileIcon';

function sharedRootLabel(root) {
  if (root?.shared_kind === 'shared_company') return `Chung công ty · ${root.name}`;
  if (root?.shared_kind === 'shared_region') return `Chung khu vực · ${root.name}`;
  return root.name || 'Drive chung';
}

export default function DriveEntityFolderPickerModal({
  entityType,
  entityId,
  title = 'Chọn thư mục đích',
  confirmLabel = 'Di chuyển vào đây',
  fileCount = 1,
  submitting = false,
  onConfirm,
  onClose,
}) {
  const [tab, setTab] = useState('entity');
  const [loading, setLoading] = useState(true);
  const [subFolders, setSubFolders] = useState([]);
  const [locationPath, setLocationPath] = useState([]);

  // Entity browse
  const [entityFolderId, setEntityFolderId] = useState(null);
  const [entityBrowseFolderId, setEntityBrowseFolderId] = useState(null);

  // Shared browse
  const [sharedRoots, setSharedRoots] = useState([]);
  const [activeSharedRoot, setActiveSharedRoot] = useState(null);
  const [sharedBrowseFolderId, setSharedBrowseFolderId] = useState(null);

  const loadEntityBrowse = useCallback(async (folderId) => {
    if (!entityType || !entityId) return;
    setLoading(true);
    try {
      const r = await driveEntityChildren(entityType, entityId, folderId || undefined);
      setEntityFolderId(r.entity_folder_id);
      setEntityBrowseFolderId(r.folder?.id || r.entity_folder_id);
      setSubFolders(r.folders || []);
      setLocationPath(enrichDriveBreadcrumb(r.breadcrumb || []));
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Không tải được thư mục');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  const loadSharedRoot = useCallback(async (root) => {
    setLoading(true);
    try {
      setActiveSharedRoot(root);
      setSharedBrowseFolderId(null);
      const r = await driveListRootChildren(root.id);
      setSubFolders(r.folders || []);
      setLocationPath(enrichDriveBreadcrumb([
        { type: 'root', id: root.id, name: root.name, scope: root.scope, shared_kind: root.shared_kind },
      ], root));
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Không tải được Drive chung');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSharedFolder = useCallback(async (folderId) => {
    if (!activeSharedRoot) return;
    setLoading(true);
    try {
      const [children, crumb] = await Promise.all([
        driveListFolderChildren(folderId),
        driveFolderBreadcrumb(folderId),
      ]);
      setSharedBrowseFolderId(folderId);
      setSubFolders(children.folders || []);
      setLocationPath(enrichDriveBreadcrumb(crumb.breadcrumb || [], activeSharedRoot));
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Không tải được thư mục');
    } finally {
      setLoading(false);
    }
  }, [activeSharedRoot]);

  useEffect(() => {
    void loadEntityBrowse(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  useEffect(() => {
    if (tab !== 'shared') return;
    (async () => {
      setLoading(true);
      try {
        const r = await driveListRoots();
        const list = (r.roots || []).filter(
          (root) => root.scope === 'shared'
            && ['shared_company', 'shared_region'].includes(root.shared_kind),
        );
        setSharedRoots(list);
        if (list.length && !activeSharedRoot) {
          await loadSharedRoot(list[0]);
        } else {
          setLoading(false);
        }
      } catch (e) {
        alert(e?.response?.data?.error || e?.message || 'Không tải được Drive chung');
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function handleLocationNav(item) {
    if (tab === 'entity') {
      if (item.type === 'folder') void loadEntityBrowse(item.id);
      else if (item.type === 'root') void loadEntityBrowse(null);
      return;
    }
    if (item.type === 'folder') {
      void loadSharedFolder(item.id);
    } else if (item.type === 'scope' || item.type === 'root') {
      const rootId = item.rootId || item.id;
      const root = sharedRoots.find((x) => x.id === rootId) || activeSharedRoot;
      if (root) void loadSharedRoot(root);
    }
  }

  function openSubFolder(folderId) {
    if (tab === 'entity') void loadEntityBrowse(folderId);
    else void loadSharedFolder(folderId);
  }

  const canConfirm = useMemo(() => {
    if (tab === 'entity') return !!entityBrowseFolderId;
    return !!activeSharedRoot;
  }, [tab, entityBrowseFolderId, activeSharedRoot]);

  function currentFolderName() {
    const folders = locationPath.filter((c) => c.type === 'folder');
    if (folders.length) return folders[folders.length - 1].name;
    if (tab === 'shared' && activeSharedRoot) return sharedRootLabel(activeSharedRoot);
    const root = locationPath.find((c) => c.type === 'root');
    return root?.name || 'Thư mục gốc';
  }

  function handleConfirm() {
    if (tab === 'entity') {
      onConfirm?.({ folderId: entityBrowseFolderId });
    } else {
      onConfirm?.({
        folderId: sharedBrowseFolderId,
        rootId: activeSharedRoot?.id,
      });
    }
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
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[min(85vh,640px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="h-14 px-4 border-b flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-800 truncate">{title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {fileCount > 1 ? `${fileCount} file sẽ được di chuyển` : '1 file sẽ được di chuyển'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-3 pt-2 flex gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setTab('entity')}
            className={`h-8 px-3 rounded-lg text-xs font-medium transition ${
              tab === 'entity' ? 'bg-blue-100 text-blue-800' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Thư mục Lead/Deal
          </button>
          <button
            type="button"
            onClick={() => setTab('shared')}
            className={`h-8 px-3 rounded-lg text-xs font-medium transition flex items-center gap-1 ${
              tab === 'shared' ? 'bg-violet-100 text-violet-800' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Globe size={13} /> Drive chung
          </button>
        </div>

        {tab === 'shared' && sharedRoots.length > 1 && (
          <div className="px-3 py-2 border-b shrink-0">
            <select
              value={activeSharedRoot?.id || ''}
              onChange={(e) => {
                const root = sharedRoots.find((x) => x.id === e.target.value);
                if (root) void loadSharedRoot(root);
              }}
              className="w-full px-2 py-1.5 border rounded-lg text-sm bg-white focus:outline-none focus:border-blue-400"
            >
              {sharedRoots.map((root) => (
                <option key={root.id} value={root.id}>{sharedRootLabel(root)}</option>
              ))}
            </select>
          </div>
        )}

        {locationPath.length > 0 && (
          <DriveLocationBar
            items={locationPath}
            onNavigate={handleLocationNav}
            className="border-b-0"
          />
        )}

        <div className="flex-1 overflow-auto min-h-[200px] p-3">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
              <Loader2 size={18} className="animate-spin mr-2" /> Đang tải...
            </div>
          ) : tab === 'shared' && !sharedRoots.length ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Chưa có Drive chung công ty/khu vực khả dụng.
            </div>
          ) : subFolders.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              {tab === 'shared' ? (
                <>Không có thư mục con trong {driveScopeHomeLabel('shared', activeSharedRoot)}. Bấm &quot;{confirmLabel}&quot; để dùng thư mục gốc.</>
              ) : (
                <>Không có thư mục con. Bấm &quot;{confirmLabel}&quot; để dùng thư mục hiện tại.</>
              )}
            </div>
          ) : (
            <div className="border rounded-lg divide-y overflow-hidden">
              {subFolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => openSubFolder(f.id)}
                  className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 hover:bg-blue-50/80 transition-colors"
                >
                  <DriveFileIcon isFolder size={18} className="shrink-0" />
                  <span className="text-sm text-slate-800 truncate flex-1">{f.name}</span>
                  <ChevronRight size={14} className="text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        <footer className="px-4 py-3 border-t bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 text-xs text-slate-600 truncate">
            Đích: <span className="font-medium text-slate-800">{currentFolderName()}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-white"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={submitting || !canConfirm}
              onClick={handleConfirm}
              className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-60"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <FolderInput size={14} />}
              {confirmLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
