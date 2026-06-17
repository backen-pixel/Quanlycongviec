/**
 * Modal chọn thư mục đích trên Drive (cá nhân / chung) — dùng khi di chuyển file hoặc folder.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, ChevronRight, FolderInput } from 'lucide-react';
import {
  driveListRoots,
  driveListRootChildren,
  driveListFolderChildren,
  driveFolderBreadcrumb,
} from '../../lib/drive';
import DriveLocationBar, { enrichDriveBreadcrumb, driveScopeHomeLabel } from './DriveLocationBar';
import DriveFileIcon from './DriveFileIcon';

function rootLabel(root) {
  if (!root) return 'Drive';
  if (root.scope === 'user') return root.name || 'Drive cá nhân';
  if (root.shared_kind === 'shared_company') return `Chung công ty · ${root.name}`;
  if (root.shared_kind === 'shared_region') return `Chung khu vực · ${root.name}`;
  return root.name || 'Drive chung';
}

export default function DriveFolderPickerModal({
  title = 'Chọn thư mục đích',
  confirmLabel = 'Di chuyển vào đây',
  itemCount = 1,
  restrictRootId = null,
  excludeFolderIds = [],
  submitting = false,
  onConfirm,
  onClose,
}) {
  const [loading, setLoading] = useState(true);
  const [roots, setRoots] = useState([]);
  const [activeRoot, setActiveRoot] = useState(null);
  const [browseFolderId, setBrowseFolderId] = useState(null);
  const [subFolders, setSubFolders] = useState([]);
  const [locationPath, setLocationPath] = useState([]);

  const excludeSet = useMemo(
    () => new Set((excludeFolderIds || []).filter(Boolean)),
    [excludeFolderIds],
  );

  const loadRoot = useCallback(async (root) => {
    setLoading(true);
    try {
      setActiveRoot(root);
      setBrowseFolderId(null);
      const r = await driveListRootChildren(root.id);
      setSubFolders(r.folders || []);
      setLocationPath(enrichDriveBreadcrumb([
        { type: 'root', id: root.id, name: root.name, scope: root.scope, shared_kind: root.shared_kind },
      ], root));
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Không tải được Drive');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFolder = useCallback(async (folderId) => {
    if (!activeRoot) return;
    setLoading(true);
    try {
      const [children, crumb] = await Promise.all([
        driveListFolderChildren(folderId),
        driveFolderBreadcrumb(folderId),
      ]);
      setBrowseFolderId(folderId);
      setSubFolders(children.folders || []);
      setLocationPath(enrichDriveBreadcrumb(crumb.breadcrumb || [], activeRoot));
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Không tải được thư mục');
    } finally {
      setLoading(false);
    }
  }, [activeRoot]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await driveListRoots();
        let list = r.roots || [];
        if (restrictRootId) {
          list = list.filter((root) => root.id === restrictRootId);
        }
        setRoots(list);
        const initial = list[0] || null;
        if (initial) await loadRoot(initial);
        else setLoading(false);
      } catch (e) {
        alert(e?.response?.data?.error || e?.message || 'Không tải được danh sách Drive');
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restrictRootId]);

  function handleLocationNav(item) {
    if (item.type === 'folder') {
      void loadFolder(item.id);
    } else if (item.type === 'scope' || item.type === 'root') {
      const rootId = item.rootId || item.id;
      const root = roots.find((x) => x.id === rootId) || activeRoot;
      if (root) void loadRoot(root);
    }
  }

  function openSubFolder(folderId) {
    if (excludeSet.has(folderId)) {
      alert('Không thể di chuyển vào chính thư mục này hoặc thư mục con của nó.');
      return;
    }
    void loadFolder(folderId);
  }

  function currentFolderName() {
    const folders = locationPath.filter((c) => c.type === 'folder');
    if (folders.length) return folders[folders.length - 1].name;
    if (activeRoot) return rootLabel(activeRoot);
    return 'Thư mục gốc';
  }

  function handleConfirm() {
    if (browseFolderId && excludeSet.has(browseFolderId)) {
      alert('Không thể di chuyển vào thư mục này.');
      return;
    }
    if (!activeRoot) return;
    onConfirm?.({
      folderId: browseFolderId,
      rootId: activeRoot.id,
    });
  }

  const visibleSubFolders = subFolders.filter((f) => !excludeSet.has(f.id));

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
              {itemCount > 1 ? `${itemCount} mục sẽ được di chuyển` : '1 mục sẽ được di chuyển'}
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

        {roots.length > 1 && (
          <div className="px-3 py-2 border-b shrink-0">
            <select
              value={activeRoot?.id || ''}
              disabled={!!restrictRootId}
              onChange={(e) => {
                const root = roots.find((x) => x.id === e.target.value);
                if (root) void loadRoot(root);
              }}
              className="w-full px-2 py-1.5 border rounded-lg text-sm bg-white focus:outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-600"
            >
              {roots.map((root) => (
                <option key={root.id} value={root.id}>{rootLabel(root)}</option>
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
          ) : !roots.length ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Không có Drive khả dụng.
            </div>
          ) : visibleSubFolders.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Không có thư mục con trong {driveScopeHomeLabel(activeRoot?.scope, activeRoot)}.
              {' '}Bấm &quot;{confirmLabel}&quot; để dùng thư mục gốc.
            </div>
          ) : (
            <div className="border rounded-lg divide-y overflow-hidden">
              {visibleSubFolders.map((f) => (
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
              disabled={submitting || !activeRoot}
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
