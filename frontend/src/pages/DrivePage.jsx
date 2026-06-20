/**
 * Drive lưu trữ — clone trải nghiệm Google Drive trên CRM.
 * Routes:
 *   /drive                       → tự động ensure personal root rồi mở
 *   /drive/root/:rootId          → mở 1 drive root
 *   /drive/folder/:folderId      → mở 1 folder
 *   /drive/view/recent|starred|shared|trash → các view tổng hợp
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  HardDrive, FolderPlus, Upload, Star, StarOff, Search, Trash2, RotateCcw, Share2,
  ChevronRight, ChevronDown, Home, Users, Clock, Download, Pencil, Move, Link2, MoreHorizontal,
  Loader2, Building2, User as UserIcon, Globe, Plus, X, FolderOpen, Eye, AlertCircle,
  MapPin, LayoutGrid, List as ListIcon, Folder as FolderIcon,
  FilePlus, FileText, Table2, Tag, Briefcase, PanelLeftClose, PanelLeftOpen, FolderInput, Info,
} from 'lucide-react';
import {
  driveListRoots, driveEnsurePersonalRoot, driveCreateSharedRoot,
  driveListRootChildren, driveListFolderChildren, driveFolderBreadcrumb,
  driveCreateFolder, driveTrashFolder, driveTrashFile, driveUpdateFolder, driveUpdateFile,
  driveStar, driveUnstar, driveStarred, driveRecent, driveSharedWithMe, driveTrashList,
  driveRestoreFile, driveRestoreFolder, driveDeleteFileForever, driveDeleteFolderForever,
  driveSearch, driveOpenDownload, drivePreview, driveHealth, driveFormatBytes,
  driveOrgTree, driveEnsureUserDrive,
  driveEnsureSharedCompany, driveEnsureSharedRegion,
  driveCreateGoogleFile,
} from '../lib/drive';
import DriveLocationBar, { enrichDriveBreadcrumb } from '../components/drive/DriveLocationBar';
import { DRIVE_FILE_LIST_GRID, fmtDriveDate, filterImageFiles, DriveFilesListView, DriveFilesGridView, DriveFileMoreMenu, driveSelectId } from '../components/drive/DriveFileViews';
import DriveFolderPickerModal from '../components/drive/DriveFolderPickerModal';
import DriveMarqueeSelectArea from '../components/drive/DriveMarqueeSelectArea';
import UploadDropzone from '../components/drive/UploadDropzone';
import PreviewModal from '../components/drive/PreviewModal';
import ShareModal from '../components/drive/ShareModal';
import { useAuth } from '../lib/auth';
import { isSystemAdmin } from '../lib/adminRole';
import { appendDriveModuleQuery, resolveModuleFromDriveQuery, storeModule } from '../lib/sidebarModuleContext';

function scopeIcon(scope) {
  if (scope === 'user') return UserIcon;
  if (scope === 'company') return Building2;
  if (scope === 'shared') return Globe;
  return HardDrive;
}
function scopeBadge(scope) {
  if (scope === 'user') return { label: 'Cá nhân', cls: 'bg-blue-50 text-blue-700' };
  if (scope === 'company') return { label: 'Công ty', cls: 'bg-emerald-50 text-emerald-700' };
  if (scope === 'shared') return { label: 'Drive chung', cls: 'bg-violet-50 text-violet-700' };
  return { label: 'Drive', cls: 'bg-slate-100 text-slate-600' };
}

function moduleScopeLabel(key) {
  const k = String(key || '').toLowerCase();
  if (k === 'crm') return 'CRM';
  if (k === 'sx') return 'Sản xuất';
  if (k === 'vc') return 'Vận chuyển';
  if (k === 'mkt') return 'Marketing';
  return 'Khác';
}

function fmtDriveRelativeTime(iso) {
  if (!iso) return '—';
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(ms)) return '—';
    if (ms < 60_000) return 'vừa xong';
    const mins = Math.floor(ms / 60_000);
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ngày trước`;
    return fmtDriveDate(iso);
  } catch {
    return '—';
  }
}

function sortDriveFolders(folders, sortKey) {
  const arr = [...(folders || [])];
  if (sortKey === 'name_desc') {
    return arr.sort((a, b) => String(b.name || '').localeCompare(String(a.name || ''), 'vi'));
  }
  if (sortKey === 'updated_desc') {
    return arr.sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
  }
  return arr.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
}

export default function DrivePage() {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const lockedModule = (searchParams.get('module') || '').toLowerCase() || null;
  const myModuleKey = (user?.drive_module || 'other').toLowerCase();
  const scopeModuleKey = lockedModule || myModuleKey;
  const isAdmin = ['admin', 'sales_admin', 'manager'].includes(user?.role);
  const systemAdmin = isSystemAdmin(user);
  const view = params.view || null; // recent|starred|shared|trash
  const rootIdParam = params.rootId || null;
  const folderIdParam = params.folderId || null;

  const driveNavigate = useCallback((path, options) => {
    navigate(appendDriveModuleQuery(path, lockedModule), options);
  }, [navigate, lockedModule]);

  useEffect(() => {
    const sidebarModule = resolveModuleFromDriveQuery(lockedModule);
    if (sidebarModule) storeModule(sidebarModule);
  }, [lockedModule]);

  const [health, setHealth] = useState(null);
  const [roots, setRoots] = useState([]);
  const [activeRoot, setActiveRoot] = useState(null);
  const [activeFolder, setActiveFolder] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [creatingGoogle, setCreatingGoogle] = useState(null); // doc | sheet | slides
  const createMenuRef = useRef(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [shareItem, setShareItem] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, item }
  const [starredIds, setStarredIds] = useState(new Set());
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('drive.viewMode') || 'grid'; } catch (_) { return 'grid'; }
  });
  const [folderSort, setFolderSort] = useState(() => {
    try { return localStorage.getItem('drive.folderSort') || 'name_asc'; } catch (_) { return 'name_asc'; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('drive.sidebarOpen') !== '0'; } catch (_) { return true; }
  });
  const searchTimer = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem('drive.sidebarOpen', sidebarOpen ? '1' : '0'); } catch (_) {}
  }, [sidebarOpen]);

  useEffect(() => {
    try { localStorage.setItem('drive.viewMode', viewMode); } catch (_) {}
  }, [viewMode]);

  useEffect(() => {
    try { localStorage.setItem('drive.folderSort', folderSort); } catch (_) {}
  }, [folderSort]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleSelectFile = useCallback((file) => {
    const id = driveSelectId(file.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAllFiles = useCallback((checked, fileList) => {
    if (!checked) {
      clearSelection();
      return;
    }
    setSelectedIds(new Set((fileList || []).map((f) => driveSelectId(f.id))));
  }, [clearSelection]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeFolder?.id, activeRoot?.id, view, searchResults]);

  useEffect(() => {
    if (!showCreateMenu) return undefined;
    const onDocClick = (e) => {
      if (createMenuRef.current && !createMenuRef.current.contains(e.target)) setShowCreateMenu(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showCreateMenu]);

  // ── Bootstrap: load health + roots ──
  useEffect(() => {
    (async () => {
      try {
        const h = await driveHealth();
        setHealth(h);
        const r = await driveListRoots();
        let list = r.roots || [];
        // Nếu user chưa có Drive cá nhân và đã cấu hình → ensure ngay.
        if (h?.configured && !list.some((x) => x.scope === 'user')) {
          try {
            const ep = await driveEnsurePersonalRoot();
            list = [ep.root, ...list];
          } catch (_) {}
        }
        setRoots(list);

        // Đồng bộ tham số URL
        if (folderIdParam) {
          await openFolder(folderIdParam);
        } else if (rootIdParam) {
          const root = list.find((x) => x.id === rootIdParam) || list[0];
          if (root) await openRoot(root);
        } else if (view) {
          await openView(view);
        } else if (list[0]) {
          // Mặc định: mở Drive cá nhân.
          const personal = list.find((x) => x.scope === 'user') || list[0];
          await openRoot(personal);
        }
      } catch (e) {
        console.error('bootstrap drive error', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Star cache ──
  const refreshStarred = useCallback(async () => {
    try {
      const s = await driveStarred();
      const ids = new Set();
      (s.files || []).forEach((x) => ids.add('file:' + x.id));
      (s.folders || []).forEach((x) => ids.add('folder:' + x.id));
      setStarredIds(ids);
    } catch (_) {}
  }, []);
  useEffect(() => { void refreshStarred(); }, [refreshStarred]);

  // ── Mở root ──
  async function openRoot(root) {
    setActiveRoot(root);
    setActiveFolder(null);
    setBreadcrumb(enrichDriveBreadcrumb([
      { type: 'root', id: root.id, name: root.name, scope: root.scope },
    ], root));
    setSearchResults(null);
    setQuery('');
    setLoading(true);
    try {
      const r = await driveListRootChildren(root.id);
      setFolders(r.folders || []);
      setFiles(r.files || []);
    } catch (e) {
      console.error('list root error', e);
    } finally {
      setLoading(false);
    }
    driveNavigate(`/drive/root/${root.id}`, { replace: true });
  }

  // ── Mở folder ──
  async function openFolder(folderId) {
    setLoading(true);
    setSearchResults(null);
    setQuery('');
    try {
      const [children, crumb] = await Promise.all([
        driveListFolderChildren(folderId),
        driveFolderBreadcrumb(folderId),
      ]);
      setActiveFolder(children.folder);
      setFolders(children.folders || []);
      setFiles(children.files || []);
      const rootCrumb = crumb.breadcrumb?.find((c) => c.type === 'root');
      const r = roots.find((x) => x.id === rootCrumb?.id) || activeRoot;
      setBreadcrumb(enrichDriveBreadcrumb(crumb.breadcrumb || [], r));
      if (r) setActiveRoot(r);
      driveNavigate(`/drive/folder/${folderId}`, { replace: true });
    } catch (e) {
      console.error('open folder error', e);
    } finally {
      setLoading(false);
    }
  }

  // ── View tổng hợp (recent/starred/shared/trash) ──
  async function openView(viewKey) {
    setActiveFolder(null);
    setActiveRoot(null);
    setBreadcrumb([{ type: 'view', id: viewKey, name: viewLabels[viewKey] }]);
    setSearchResults(null);
    setQuery('');
    setLoading(true);
    try {
      let folders = [];
      let files = [];
      if (viewKey === 'recent') {
        const r = await driveRecent(100);
        files = r.files || [];
      } else if (viewKey === 'starred') {
        const r = await driveStarred();
        folders = r.folders || [];
        files = r.files || [];
      } else if (viewKey === 'shared') {
        const r = await driveSharedWithMe();
        folders = r.folders || [];
        files = r.files || [];
      } else if (viewKey === 'trash') {
        const r = await driveTrashList();
        folders = r.folders || [];
        files = r.files || [];
      }
      setFolders(folders);
      setFiles(files);
    } catch (e) { console.error(e); }
    setLoading(false);
    driveNavigate(`/drive/view/${viewKey}`, { replace: true });
  }

  // ── Search ──
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) { setSearchResults(null); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const params = { q: query.trim() };
        if (activeRoot?.id) params.root_id = activeRoot.id;
        const r = await driveSearch(params);
        setSearchResults({ folders: r.folders || [], files: r.files || [] });
      } catch (e) { console.error('search error', e); }
    }, 300);
  }, [query, activeRoot?.id]);

  function handleLocationNav(item) {
    if (item.type === 'scope' || item.type === 'root') {
      const r = roots.find((x) => x.id === (item.rootId || item.id));
      if (r) void openRoot(r);
    } else if (item.type === 'folder') {
      void openFolder(item.id);
    }
  }

  // ── Actions ──
  async function reload() {
    if (activeFolder) await openFolder(activeFolder.id);
    else if (activeRoot) await openRoot(activeRoot);
    else if (view) await openView(view);
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(false);
    setNewFolderName('');
    try {
      await driveCreateFolder({
        name,
        parent_id: activeFolder?.id || null,
        root_id: activeFolder ? null : activeRoot?.id,
      });
      await reload();
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Lỗi tạo folder');
    }
  }

  async function handleTrash(item, type) {
    if (!confirm(`Đưa "${item.name}" vào thùng rác?`)) return;
    try {
      if (type === 'folder') await driveTrashFolder(item.id);
      else await driveTrashFile(item.id);
      await reload();
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  async function handleRestore(item, type) {
    try {
      if (type === 'folder') await driveRestoreFolder(item.id);
      else await driveRestoreFile(item.id);
      await reload();
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  async function handleDeleteForever(item, type) {
    if (!confirm(`Xoá vĩnh viễn "${item.name}"? Không thể khôi phục.`)) return;
    try {
      if (type === 'folder') await driveDeleteFolderForever(item.id);
      else await driveDeleteFileForever(item.id);
      await reload();
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  async function handleRename(item, type) {
    const name = prompt('Tên mới', item.name);
    if (!name || name === item.name) return;
    try {
      if (type === 'folder') await driveUpdateFolder(item.id, { name });
      else await driveUpdateFile(item.id, { name });
      await reload();
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  async function handleToggleStar(item, type) {
    const key = `${type}:${item.id}`;
    try {
      if (starredIds.has(key)) {
        await driveUnstar(type, item.id);
      } else {
        await driveStar(type, item.id);
      }
      await refreshStarred();
      await reload();
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  async function handleDownload(file) {
    try { await driveOpenDownload(file.id, file.name); }
    catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  async function bulkDownload() {
    const list = searchResults?.files ?? files;
    const picked = list.filter((f) => selectedIds.has(driveSelectId(f.id)));
    if (!picked.length) return;
    setBulkWorking(true);
    try {
      for (const f of picked) {
        await driveOpenDownload(f.id, f.name);
      }
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Lỗi tải xuống');
    } finally {
      setBulkWorking(false);
    }
  }

  async function bulkTrash() {
    if (!confirm(`Đưa ${selectedIds.size} file vào thùng rác?`)) return;
    setBulkWorking(true);
    try {
      for (const id of selectedIds) {
        await driveTrashFile(id);
      }
      clearSelection();
      await reload();
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Lỗi xoá');
    } finally {
      setBulkWorking(false);
    }
  }

  async function bulkRestore() {
    setBulkWorking(true);
    try {
      for (const id of selectedIds) {
        await driveRestoreFile(id);
      }
      clearSelection();
      await reload();
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Lỗi khôi phục');
    } finally {
      setBulkWorking(false);
    }
  }

  async function bulkDeleteForever() {
    if (!confirm(`Xoá vĩnh viễn ${selectedIds.size} file? Không thể khôi phục.`)) return;
    setBulkWorking(true);
    try {
      for (const id of selectedIds) {
        await driveDeleteFileForever(id);
      }
      clearSelection();
      await reload();
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Lỗi xoá');
    } finally {
      setBulkWorking(false);
    }
  }

  async function handlePreview(file) {
    try {
      const meta = await drivePreview(file.id);
      setPreviewItem({ ...file, preview: meta });
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  function openMoveDialog({ fileIds = [], folderIds = [], restrictRootId: fixedRootId = null } = {}) {
    if (!fileIds.length && !folderIds.length) return;
    let restrictRootId = fixedRootId || null;
    if (!restrictRootId && folderIds.length) {
      const allFolders = searchResults?.folders ?? folders;
      const folder = allFolders.find((f) => f.id === folderIds[0]);
      restrictRootId = folder?.root_id || activeRoot?.id || null;
    }
    setMoveTarget({ fileIds, folderIds, restrictRootId });
  }

  async function handleMoveToDestination(dest) {
    if (!moveTarget) return;
    const { fileIds, folderIds } = moveTarget;
    const { folderId, rootId } = dest;

    if (folderId && folderIds.includes(folderId)) {
      alert('Không thể di chuyển thư mục vào chính nó.');
      return;
    }

    const fileBody = folderId != null
      ? { folder_id: folderId }
      : { folder_id: null, root_id: rootId };
    const folderBody = folderId != null
      ? { parent_id: folderId }
      : { parent_id: null };

    const allFiles = searchResults?.files ?? files;
    const filesToMove = allFiles.filter((f) => fileIds.includes(f.id));
    const allFolders = searchResults?.folders ?? folders;
    const foldersToMove = allFolders.filter((f) => folderIds.includes(f.id));

    const filesAlreadyThere = filesToMove.length > 0 && filesToMove.every((f) => {
      if (folderId) return f.folder_id === folderId;
      return f.folder_id == null && f.root_id === rootId;
    });
    const foldersAlreadyThere = foldersToMove.length > 0 && foldersToMove.every((f) => {
      if (folderId) return f.parent_id === folderId;
      return f.parent_id == null;
    });
    const hasFiles = fileIds.length > 0;
    const hasFolders = folderIds.length > 0;
    if (
      (hasFiles || hasFolders)
      && (!hasFiles || filesAlreadyThere)
      && (!hasFolders || foldersAlreadyThere)
    ) {
      alert('Các mục đã nằm trong thư mục đích.');
      setMoveTarget(null);
      return;
    }

    setBulkWorking(true);
    try {
      await Promise.all([
        ...fileIds.map((id) => driveUpdateFile(id, fileBody)),
        ...folderIds.map((id) => driveUpdateFolder(id, folderBody)),
      ]);
      setMoveTarget(null);
      clearSelection();
      await reload();
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Không di chuyển được');
    } finally {
      setBulkWorking(false);
    }
  }

  async function handleCreateGoogle(kind) {
    if (!activeRoot && !activeFolder) return;
    setShowCreateMenu(false);
    setCreatingGoogle(kind);
    try {
      const r = await driveCreateGoogleFile({
        folder_id: activeFolder?.id || null,
        root_id: activeFolder ? null : activeRoot?.id,
        kind,
      });
      await reload();
      if (r?.file) {
        setPreviewItem({
          ...r.file,
          preview: r.preview || {
            preview_mode: 'google_edit',
            edit_embed_url: r.edit_embed_url,
            edit_url: r.edit_url,
            mime_type: r.file.mime_type,
          },
        });
      }
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Không tạo được file');
    } finally {
      setCreatingGoogle(null);
    }
  }

  async function handleCreateSharedDrive() {
    const name = prompt('Tên Drive chung mới');
    if (!name) return;
    try {
      const r = await driveCreateSharedRoot(name);
      const newRoots = [...roots, r.root];
      setRoots(newRoots);
      await openRoot(r.root);
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  // Refresh danh sách roots — cây tổ chức gọi khi mở Drive của user khác để có root mới.
  const refreshRootsList = useCallback(async () => {
    try {
      const r = await driveListRoots();
      const list = r.roots || [];
      setRoots(list);
      return list;
    } catch (e) {
      console.error('refresh roots error', e);
      return [];
    }
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    const h = (e) => {
      if (e.target instanceof Element && e.target.closest('[data-drive-context-menu]')) return;
      setContextMenu(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const isTrashView = view === 'trash';
  const showRoots = useMemo(() => ({
    personal: roots.filter((r) => r.scope === 'user'),
    moduleShared: roots.filter((r) =>
      r.scope === 'shared'
      && ['shared_company', 'shared_region'].includes(r.shared_kind)
      && (r.module_key || 'other').toLowerCase() === scopeModuleKey
    ),
    otherShared: roots.filter((r) =>
      r.scope === 'shared' && !['shared_company', 'shared_region'].includes(r.shared_kind)
    ),
  }), [roots, scopeModuleKey]);

  const displayFolders = searchResults?.folders ?? folders;
  const displayFiles = searchResults?.files ?? files;
  const sortedDisplayFolders = useMemo(
    () => sortDriveFolders(displayFolders, folderSort),
    [displayFolders, folderSort],
  );
  const showFolderContentEmpty = !loading
    && !searchResults
    && !isTrashView
    && !view
    && !activeFolder
    && displayFiles.length === 0
    && !!activeRoot;

  const renderFileActions = useCallback((f) => (
    <>
      {!isTrashView && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShareItem({ ...f, target_type: 'file' }); }}
          className="p-1 hover:bg-blue-50 text-blue-600 rounded"
          title="Chia sẻ (Xem / Sửa)"
        >
          <Share2 size={14} />
        </button>
      )}
      <DriveFileMoreMenu
        onPreview={!isTrashView ? () => { void handlePreview(f); } : undefined}
        onDownload={!isTrashView ? () => { void handleDownload(f); } : undefined}
        onRename={!isTrashView ? () => { void handleRename(f, 'file'); } : undefined}
        onToggleStar={!isTrashView ? () => { void handleToggleStar(f, 'file'); } : undefined}
        isStarred={starredIds.has(`file:${f.id}`)}
        onMove={!isTrashView ? () => openMoveDialog({ fileIds: [f.id] }) : undefined}
        showUnlink={false}
      />
    </>
  ), [starredIds, isTrashView]);

  const handleFileContextMenu = useCallback((e, f) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item: f, type: 'file' });
  }, []);

  if (health && !health.configured) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={22} />
            <div className="flex-1">
              <h2 className="text-amber-900 font-semibold">Google Drive chưa được cấu hình</h2>
              <p className="text-amber-800 text-xs mt-1">Chế độ phát hiện: <code className="bg-amber-100 px-1.5 rounded">{health.auth_mode || 'none'}</code></p>

              <p className="text-amber-900 font-semibold text-sm mt-4">Chọn MỘT trong hai cách cấu hình:</p>

              <div className="mt-3 bg-white border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-700">Cách 1 — OAuth Refresh Token (đơn giản, dùng tài khoản Gmail/Workspace cá nhân)</p>
                <p className="text-xs text-slate-500 mt-1">Thêm 4 biến vào <code className="bg-slate-100 px-1">backend/.env</code>:</p>
                <pre className="text-xs bg-slate-50 border rounded p-2 mt-1.5 overflow-x-auto">
{`GDRIVE_OAUTH_CLIENT_ID=<client_id>.apps.googleusercontent.com
GDRIVE_OAUTH_CLIENT_SECRET=<client_secret>
GDRIVE_OAUTH_REFRESH_TOKEN=<refresh_token từ OAuth Playground>
GDRIVE_ROOT_FOLDER_ID=<id folder gốc Drive của user>`}</pre>
                <p className="text-[11px] text-slate-500 mt-1.5">Lấy refresh_token bằng <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" className="text-blue-600 underline">OAuth Playground</a> với scope <code className="bg-slate-100 px-1">https://www.googleapis.com/auth/drive</code>.</p>
              </div>

              <div className="mt-3 bg-white border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-700">Cách 2 — Service Account (cho Workspace tổ chức)</p>
                <p className="text-xs text-slate-500 mt-1">Thêm vào <code className="bg-slate-100 px-1">backend/.env</code>:</p>
                <pre className="text-xs bg-slate-50 border rounded p-2 mt-1.5 overflow-x-auto">
{`GDRIVE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...toàn bộ key.json...}'
GDRIVE_ROOT_FOLDER_ID=<id folder gốc>`}</pre>
                <p className="text-[11px] text-slate-500 mt-1.5">Tạo Service Account ở Google Cloud Console → tải JSON key → share folder gốc với email service account.</p>
              </div>

              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-blue-900">Sau khi cấu hình</p>
                <ol className="text-xs text-blue-800 mt-1.5 space-y-0.5 list-decimal pl-5">
                  <li>Save file <code className="bg-blue-100 px-1">backend/.env</code></li>
                  <li>Restart backend (Ctrl+C trong terminal → <code className="bg-blue-100 px-1">npm run dev</code>)</li>
                  <li>Thấy log <code className="bg-blue-100 px-1">[drive-sync] started</code> là OK</li>
                  <li>Refresh trang này (F5)</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex bg-[#f4f6f8]">
      {sidebarOpen && (
      <aside className="w-[17.5rem] shrink-0 border-r border-slate-200/80 bg-white flex flex-col">
        <div className="px-4 py-3.5 flex items-start justify-between gap-2 border-b border-slate-100">
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-slate-900 flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                <HardDrive size={18} />
              </span>
              Drive
              {lockedModule ? (
                <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-md uppercase tracking-wide">
                  {moduleScopeLabel(lockedModule)}
                </span>
              ) : (
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md uppercase tracking-wide">
                  Lưu trữ
                </span>
              )}
            </h1>
            {lockedModule ? (
              <p className="text-[11px] text-slate-500 mt-2 leading-snug pl-10">Chỉ công ty thuộc khối {moduleScopeLabel(lockedModule)}</p>
            ) : (
              <p className="text-[11px] text-slate-500 mt-2 leading-snug pl-10">Tất cả module và công ty</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 shrink-0"
            title="Thu gọn sidebar"
            aria-label="Thu gọn sidebar Drive"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        <div className="px-2.5 py-3 overflow-auto flex-1">
          <SidebarSection title="Truy cập nhanh">
            <SidebarLink icon={Clock} label="Gần đây" active={view === 'recent'} onClick={() => openView('recent')} moduleLayout />
            <SidebarLink icon={Users} label="Được chia sẻ với tôi" active={view === 'shared'} onClick={() => openView('shared')} moduleLayout />
            <SidebarLink icon={Star} label="Đã gắn dấu sao" active={view === 'starred'} onClick={() => openView('starred')} moduleLayout />
            <SidebarLink icon={Trash2} label="Thùng rác" active={view === 'trash'} onClick={() => openView('trash')} moduleLayout />
          </SidebarSection>

          <SidebarSection title="Drive của tôi">
            {showRoots.personal.length === 0 && !lockedModule && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const r = await driveEnsurePersonalRoot();
                    setRoots([r.root, ...roots]);
                    await openRoot(r.root);
                  } catch (e) { alert(e?.response?.data?.error || e?.message); }
                }}
                className="text-xs text-indigo-600 hover:underline px-2.5 mb-1"
              >
                + Tạo Drive cá nhân
              </button>
            )}
            {showRoots.personal.map((r) => (
              <SidebarLink
                key={r.id}
                icon={UserIcon}
                label={r.name}
                active={activeRoot?.id === r.id && !view}
                onClick={() => openRoot(r)}
                moduleLayout
              />
            ))}
            <OrgTreeNav
              activeRootId={activeRoot?.id}
              onOpenRoot={openRoot}
              refreshRoots={refreshRootsList}
              isAdmin={isAdmin}
              isSystemAdmin={systemAdmin}
              myModuleKey={myModuleKey}
              scopeModuleKey={scopeModuleKey}
              lockModule={lockedModule}
              moduleLayout
            />
          </SidebarSection>

          {isAdmin && showRoots.otherShared.length > 0 && (
            <SidebarSection title={
              <span className="flex items-center justify-between">
                <span>Drive chung khác</span>
                <button type="button" onClick={handleCreateSharedDrive} className="text-indigo-600 hover:underline text-[10px]">+ Tạo</button>
              </span>
            }>
              {showRoots.otherShared.map((r) => (
                <SidebarLink key={r.id} icon={Globe} label={r.name} active={activeRoot?.id === r.id && !view} onClick={() => openRoot(r)} moduleLayout />
              ))}
            </SidebarSection>
          )}
        </div>
      </aside>
      )}

      <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white">
        <div className="shrink-0 border-b border-slate-200/80 bg-white px-4 flex items-center gap-3 h-[3.25rem]">
          {!sidebarOpen && (
            <button type="button" onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0" title="Mở sidebar Drive" aria-label="Mở sidebar Drive">
              <PanelLeftOpen size={18} />
            </button>
          )}
          <div className="relative flex-1 max-w-xl min-w-[12rem]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm trong Drive..."
              className="w-full pl-9 pr-14 py-2 text-sm border rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-slate-50 border-slate-200"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400">⌘K</kbd>
          </div>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <div className="flex items-center rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
              <button onClick={() => setViewMode('list')} title="Dạng danh sách" className={`h-9 w-9 flex items-center justify-center transition ${viewMode === 'list' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-white/70'}`}>
                <ListIcon size={16} />
              </button>
              <button onClick={() => setViewMode('grid')} title="Dạng lưới" className={`h-9 w-9 flex items-center justify-center transition ${viewMode === 'grid' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-white/70'}`}>
                <LayoutGrid size={16} />
              </button>
            </div>
            {(activeRoot || activeFolder) && !isTrashView && (
              <>
                <button onClick={() => setCreatingFolder(true)} className="h-9 px-3 border border-slate-200 rounded-xl text-sm font-medium flex items-center gap-1.5 hover:bg-slate-50 bg-white">
                  <Plus size={16} /> Thư mục
                </button>
                <button onClick={() => setShowUpload((s) => !s)} className="h-9 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium flex items-center gap-1.5 shadow-sm">
                  <Upload size={16} /> Tải lên
                </button>
                <div className="relative" ref={createMenuRef}>
                  <button onClick={() => setShowCreateMenu((s) => !s)} disabled={!!creatingGoogle} className="h-9 px-3 border border-slate-200 rounded-xl text-sm font-medium flex items-center gap-1.5 hover:bg-slate-50 bg-white disabled:opacity-60">
                    {creatingGoogle ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} className="text-slate-500" />}
                    Tạo mới
                    <ChevronDown size={14} className="text-slate-400" />
                  </button>
                {showCreateMenu && (
                  <div className="absolute right-0 top-full mt-1 z-30 min-w-[200px] bg-white border rounded-lg shadow-lg py-1 text-sm">
                    <button
                      type="button"
                      onClick={() => handleCreateGoogle('doc')}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50"
                    >
                      <FileText size={16} className="text-blue-600" /> Google Doc
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCreateGoogle('sheet')}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50"
                    >
                      <Table2 size={16} className="text-emerald-600" /> Google Sheet
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          </div>
        </div>

        <DriveLocationBar
          items={breadcrumb}
          onNavigate={handleLocationNav}
          className="bg-white border-slate-200/80 px-5 py-2.5"
        />

        <div className="flex-1 overflow-auto px-5 py-4 bg-[#f4f6f8]">
          {/* Upload dropzone */}
          {showUpload && (activeRoot || activeFolder) && (
            <div className="mb-4">
              <UploadDropzone
                folderId={activeFolder?.id || null}
                rootId={activeFolder ? null : activeRoot?.id}
                onUploaded={() => reload()}
                onClose={() => setShowUpload(false)}
              />
            </div>
          )}

          {/* Create folder inline */}
          {creatingFolder && (
            <div className="mb-3 flex items-center gap-2 bg-white border rounded-lg p-2.5">
              <FolderPlus size={16} className="text-amber-500" />
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); } }}
                placeholder="Tên thư mục mới"
                className="flex-1 px-2 py-1 border rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <button onClick={handleCreateFolder} className="h-7 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs">Tạo</button>
              <button onClick={() => { setCreatingFolder(false); setNewFolderName(''); }} className="h-7 px-2 text-slate-500 hover:text-slate-700"><X size={14} /></button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="animate-spin mr-2" size={20} /> Đang tải...
            </div>
          ) : (
            <>
              {displayFiles.length > 0 && selectedIds.size === 0 && !isTrashView && (
                <p className="text-xs text-slate-400 mb-2">
                  Kéo chuột trên vùng file để chọn nhiều · Giữ Ctrl/Cmd để cộng thêm · Click checkbox hoặc Ctrl+click từng file
                </p>
              )}

              {displayFiles.length > 0 && selectedIds.size > 0 && (
                <div className="mb-3 flex items-center flex-wrap gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <span className="text-slate-700">
                    Đã chọn <strong className="text-blue-800">{selectedIds.size}</strong> file
                  </span>
                  {!isTrashView && (
                    <>
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
                        onClick={() => openMoveDialog({ fileIds: [...selectedIds] })}
                        disabled={bulkWorking}
                        className="h-7 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-md text-xs font-medium flex items-center gap-1 disabled:opacity-60"
                      >
                        <FolderInput size={13} className="text-amber-600" /> Di chuyển
                      </button>
                      <button
                        type="button"
                        onClick={() => void bulkTrash()}
                        disabled={bulkWorking}
                        className="h-7 px-2.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-md text-xs font-medium flex items-center gap-1 disabled:opacity-60"
                      >
                        <Trash2 size={13} /> Xoá
                      </button>
                    </>
                  )}
                  {isTrashView && (
                    <>
                      <button
                        type="button"
                        onClick={() => void bulkRestore()}
                        disabled={bulkWorking}
                        className="h-7 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-md text-xs font-medium flex items-center gap-1 disabled:opacity-60"
                      >
                        <RotateCcw size={13} className="text-emerald-600" /> Khôi phục
                      </button>
                      <button
                        type="button"
                        onClick={() => void bulkDeleteForever()}
                        disabled={bulkWorking}
                        className="h-7 px-2.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-md text-xs font-medium flex items-center gap-1 disabled:opacity-60"
                      >
                        <Trash2 size={13} /> Xoá vĩnh viễn
                      </button>
                    </>
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
                <DriveMarqueeSelectArea
                  enabled={displayFiles.length > 0}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                >
                  {sortedDisplayFolders.length > 0 && (
                    <DriveFolderListBlock
                      folders={sortedDisplayFolders}
                      starredIds={starredIds}
                      isTrashView={isTrashView}
                      onOpenFolder={(id) => openFolder(id)}
                      onShare={(item, type) => setShareItem({ ...item, target_type: type })}
                      onContextMenu={(e, item, type) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, item, type }); }}
                    />
                  )}
                  {displayFiles.length > 0 && (
                    <DriveFilesListView
                      files={displayFiles}
                      formatBytes={driveFormatBytes}
                      onPreview={(f) => handlePreview(f)}
                      renderActions={renderFileActions}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelectFile}
                      onSelectAll={(checked) => handleSelectAllFiles(checked, displayFiles)}
                      onSelectionChange={setSelectedIds}
                      onContextMenu={handleFileContextMenu}
                      embedMarquee={false}
                    />
                  )}
                </DriveMarqueeSelectArea>
              ) : (
                <DriveMarqueeSelectArea
                  enabled={displayFiles.length > 0}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                >
                  {sortedDisplayFolders.length > 0 && (
                    <DriveFolderGridBlock
                      folders={sortedDisplayFolders}
                      folderSort={folderSort}
                      onFolderSortChange={setFolderSort}
                      moduleLayout
                      starredIds={starredIds}
                      isTrashView={isTrashView}
                      onOpenFolder={(id) => openFolder(id)}
                      onShare={(item, type) => setShareItem({ ...item, target_type: type })}
                      onContextMenu={(e, item, type) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, item, type }); }}
                    />
                  )}
                  {showFolderContentEmpty && (
                    <DriveFolderContentEmpty moduleLayout onUpload={() => setShowUpload(true)} hasFolders={sortedDisplayFolders.length > 0} />
                  )}
                  {displayFiles.length > 0 && (
                    <section className={sortedDisplayFolders.length > 0 ? 'mt-4' : ''}>
                      {sortedDisplayFolders.length > 0 && (
                        <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">File</h3>
                      )}
                      <DriveFilesGridView
                        files={displayFiles}
                        formatBytes={driveFormatBytes}
                        onPreview={(f) => handlePreview(f)}
                        renderActions={renderFileActions}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelectFile}
                        onSelectionChange={setSelectedIds}
                        onContextMenu={handleFileContextMenu}
                        embedMarquee={false}
                      />
                    </section>
                  )}
                </DriveMarqueeSelectArea>
              )}

              {viewMode === 'grid' && displayFiles.length > 1 && selectedIds.size === 0 && (
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleSelectAllFiles(true, displayFiles)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Chọn tất cả ({displayFiles.length})
                  </button>
                </div>
              )}

              {displayFolders.length === 0 && displayFiles.length === 0 && !showFolderContentEmpty && (
                <div className="text-center py-20 text-slate-400">
                  <FolderOpen className="mx-auto mb-3" size={48} />
                  <p>{searchResults ? 'Không tìm thấy kết quả' : 'Chưa có file/folder nào'}</p>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Context menu */}
      {contextMenu && (
        <div
          data-drive-context-menu
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 bg-white border rounded-lg shadow-xl py-1 min-w-[200px] text-sm"
        >
          {contextMenu.type === 'file' && !isTrashView && (
            <MenuBtn icon={Eye} label="Mở / Xem trước" onClick={() => { handlePreview(contextMenu.item); setContextMenu(null); }} />
          )}
          {contextMenu.type === 'folder' && !isTrashView && (
            <MenuBtn icon={FolderOpen} label="Mở thư mục" onClick={() => { openFolder(contextMenu.item.id); setContextMenu(null); }} />
          )}
          {contextMenu.type === 'file' && !isTrashView && (
            <MenuBtn icon={Download} label="Tải xuống" onClick={() => { handleDownload(contextMenu.item); setContextMenu(null); }} />
          )}
          {!isTrashView && (
            <>
              <MenuBtn icon={Pencil} label="Đổi tên" onClick={() => { handleRename(contextMenu.item, contextMenu.type); setContextMenu(null); }} />
              <MenuBtn
                icon={starredIds.has(`${contextMenu.type}:${contextMenu.item.id}`) ? StarOff : Star}
                label={starredIds.has(`${contextMenu.type}:${contextMenu.item.id}`) ? 'Bỏ gắn dấu' : 'Gắn dấu sao'}
                onClick={() => { handleToggleStar(contextMenu.item, contextMenu.type); setContextMenu(null); }}
              />
              <MenuBtn icon={Share2} label="Chia sẻ" onClick={() => { setShareItem({ ...contextMenu.item, target_type: contextMenu.type }); setContextMenu(null); }} />
              <MenuBtn
                icon={Move}
                label="Di chuyển"
                onClick={() => {
                  if (contextMenu.type === 'file') {
                    openMoveDialog({ fileIds: [contextMenu.item.id] });
                  } else {
                    openMoveDialog({
                      folderIds: [contextMenu.item.id],
                      restrictRootId: contextMenu.item.root_id,
                    });
                  }
                  setContextMenu(null);
                }}
              />
              <div className="border-t my-1" />
              <MenuBtn icon={Trash2} danger label="Xoá (thùng rác)" onClick={() => { handleTrash(contextMenu.item, contextMenu.type); setContextMenu(null); }} />
            </>
          )}
          {isTrashView && (
            <>
              <MenuBtn icon={RotateCcw} label="Khôi phục" onClick={() => { handleRestore(contextMenu.item, contextMenu.type); setContextMenu(null); }} />
              <MenuBtn icon={Trash2} danger label="Xoá vĩnh viễn" onClick={() => { handleDeleteForever(contextMenu.item, contextMenu.type); setContextMenu(null); }} />
            </>
          )}
        </div>
      )}

      {previewItem && (
        <PreviewModal
          item={previewItem}
          galleryFiles={filterImageFiles(displayFiles)}
          onClose={() => setPreviewItem(null)}
          onDownload={(f) => handleDownload(f || previewItem)}
        />
      )}
      {shareItem && (
        <ShareModal
          targetType={shareItem.target_type}
          targetId={shareItem.id}
          targetName={shareItem.name}
          onClose={() => setShareItem(null)}
        />
      )}
      {moveTarget && (
        <DriveFolderPickerModal
          itemCount={(moveTarget.fileIds?.length || 0) + (moveTarget.folderIds?.length || 0)}
          restrictRootId={moveTarget.restrictRootId}
          excludeFolderIds={moveTarget.folderIds || []}
          submitting={bulkWorking}
          onConfirm={handleMoveToDestination}
          onClose={() => !bulkWorking && setMoveTarget(null)}
        />
      )}
    </div>
  );
}

const viewLabels = { recent: 'Gần đây', starred: 'Đã gắn dấu', shared: 'Được chia sẻ', trash: 'Thùng rác' };

function SidebarSection({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] px-2.5 mb-2">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarLink({ icon: Icon, label, active, onClick, moduleLayout }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-left transition ${
        active
          ? (moduleLayout ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'bg-blue-50 text-blue-700 font-medium')
          : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Icon size={15} className={active ? (moduleLayout ? 'text-indigo-600' : 'text-blue-600') : 'text-slate-400'} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function MenuBtn({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left ${danger ? 'text-red-600' : 'text-slate-700'}`}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

/**
 * Khối thư mục — dạng danh sách (không nằm trong vùng marquee chọn file).
 */
function DriveFolderListBlock({ folders, starredIds, isTrashView, onOpenFolder, onShare, onContextMenu }) {
  if (!folders.length) return null;
  return (
    <div className="bg-white border rounded-lg overflow-hidden mb-3">
      <div className={`grid ${DRIVE_FILE_LIST_GRID} gap-2 px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase border-b bg-slate-50`}>
        <div>Thư mục</div>
        <div />
        <div />
        <div />
        <div />
      </div>
      <div className="divide-y">
        {folders.map((f) => {
          const isStarred = starredIds.has('folder:' + f.id);
          return (
            <div
              key={`folder-${f.id}`}
              onDoubleClick={() => !isTrashView && onOpenFolder(f.id)}
              onContextMenu={(e) => onContextMenu(e, f, 'folder')}
              className={`group grid ${DRIVE_FILE_LIST_GRID} gap-2 px-3 py-2 items-center hover:bg-slate-50 cursor-pointer`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FolderIcon size={18} className="text-amber-500 shrink-0" fill="currentColor" />
                <span className="text-sm text-slate-800 truncate font-medium" title={f.name}>{f.name}</span>
                {isStarred && <Star size={12} className="text-amber-400 fill-amber-400 shrink-0" />}
                {f.trashed_at && <span className="text-[10px] text-red-500 shrink-0">đã xoá</span>}
              </div>
              <div className="text-xs text-slate-400">—</div>
              <div className="text-xs text-slate-500">{fmtDriveDate(f.updated_at || f.created_at)}</div>
              <div className="text-right text-xs text-slate-500">—</div>
              <div className="flex items-center gap-0.5 justify-self-end opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); onShare?.(f, 'folder'); }}
                  className="p-1 hover:bg-blue-50 text-blue-600 rounded" title="Chia sẻ (Xem / Sửa)">
                  <Share2 size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onContextMenu(e, f, 'folder'); }}
                  className="p-1 hover:bg-slate-100 rounded">
                  <MoreHorizontal size={16} className="text-slate-400" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Khối thư mục — dạng grid (mockup Drive CRM).
 */
function DriveFolderGridBlock({
  folders, starredIds, isTrashView, onOpenFolder, onShare, onContextMenu,
  folderSort, onFolderSortChange, moduleLayout,
}) {
  if (!folders.length) return null;

  return (
    <section className="mb-2">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Thư mục</h3>
        {moduleLayout && onFolderSortChange && (
          <div className="flex items-center gap-2">
            <select
              value={folderSort || 'name_asc'}
              onChange={(e) => onFolderSortChange(e.target.value)}
              className="h-8 px-2.5 pr-7 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg bg-white cursor-pointer focus:outline-none focus:border-indigo-400"
              aria-label="Sắp xếp thư mục"
            >
              <option value="name_asc">Tên (A - Z)</option>
              <option value="name_desc">Tên (Z - A)</option>
              <option value="updated_desc">Cập nhật mới nhất</option>
            </select>
            <button type="button" title="Sắp xếp thư mục" className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 hover:text-slate-600">
              <Info size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {folders.map((f) => {
          const isStarred = starredIds.has('folder:' + f.id);
          return (
            <div
              key={f.id}
              onDoubleClick={() => !isTrashView && onOpenFolder(f.id)}
              onContextMenu={(e) => onContextMenu(e, f, 'folder')}
              className={`group relative bg-white border rounded-2xl px-4 py-3.5 cursor-pointer transition-all hover:shadow-md ${
                moduleLayout ? 'border-slate-200/90 shadow-sm min-h-[7.5rem]' : 'border-slate-200 hover:bg-blue-50/40'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                  <div className={`flex items-center justify-center rounded-xl ${moduleLayout ? 'h-11 w-11 bg-indigo-50' : ''}`}>
                    <FolderIcon size={moduleLayout ? 24 : 18} className={moduleLayout ? 'text-indigo-600' : 'text-amber-500'} fill="currentColor" />
                  </div>
                  {moduleLayout && (
                    <span className="absolute -top-1 -right-1 rounded-md bg-slate-100 border border-slate-200 px-1 py-px text-[9px] font-medium text-slate-500 whitespace-nowrap">
                      — mục
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-start gap-1 min-w-0 pr-6">
                    <p className="text-sm font-semibold text-slate-900 truncate flex-1" title={f.name}>{f.name}</p>
                    {isStarred && <Star size={12} className="text-amber-400 fill-amber-400 shrink-0 mt-0.5" />}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Cập nhật {fmtDriveRelativeTime(f.updated_at || f.created_at)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onContextMenu(e, f, 'folder'); }}
                className={`absolute bottom-3 right-3 p-1.5 rounded-lg hover:bg-slate-100 ${moduleLayout ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                title="Tùy chọn"
              >
                <MoreHorizontal size={16} className="text-slate-400" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DriveFolderContentEmpty({ moduleLayout, onUpload, hasFolders }) {
  if (!moduleLayout) {
    return (
      <div className="text-center py-16 text-slate-400">
        <FolderOpen className="mx-auto mb-3" size={44} />
        <p className="text-sm">Chọn thư mục để xem nội dung</p>
      </div>
    );
  }
  return (
    <div className={`${hasFolders ? 'mt-1' : 'mt-0'} rounded-2xl border border-dashed border-slate-200 bg-white py-14 px-6 text-center shadow-sm`}>
      <div className="mx-auto mb-5 flex h-28 w-28 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-indigo-50 via-blue-50 to-violet-50 border border-indigo-100/80">
        <div className="relative">
          <FolderOpen size={46} className="text-indigo-500" strokeWidth={1.4} />
          <FileText size={16} className="absolute -top-2 -right-3 text-indigo-300 rotate-12" />
          <FileText size={14} className="absolute -bottom-1 -left-3 text-violet-300 -rotate-12" />
        </div>
      </div>
      <h4 className="text-base font-semibold text-slate-900">Chọn thư mục để xem nội dung</h4>
      <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
        Hoặc tải lên tệp để bắt đầu lưu trữ dữ liệu của bạn
      </p>
      <button
        type="button"
        onClick={onUpload}
        className="mt-5 h-10 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium inline-flex items-center gap-2 shadow-sm"
      >
        <Upload size={16} /> Tải tệp lên
      </button>
    </div>
  );
}

/**
 * Cây Drive — Công ty → Khu vực → Loại → Phòng ban → Nhân viên (+ Drive chung công ty/khu vực).
 */
function OrgTreeNav({ activeRootId, onOpenRoot, refreshRoots, isAdmin, isSystemAdmin = false, myModuleKey, scopeModuleKey, lockModule, moduleLayout = false }) {
  const [tree, setTree] = useState(null);
  const [myModule, setMyModule] = useState(scopeModuleKey || myModuleKey || 'other');
  const [moduleFilter, setModuleFilter] = useState(() => {
    if (isSystemAdmin) return '';
    return lockModule || (isAdmin ? '' : (scopeModuleKey || myModuleKey || 'other'));
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({
    modules: new Set(),
    companies: new Set(),
    regions: new Set(),
    categories: new Set(),
    departments: new Set(),
  });

  const loadTree = useCallback(async (modKey) => {
    setLoading(true);
    setError(null);
    try {
      const effectiveMod = isSystemAdmin
        ? undefined
        : (lockModule || modKey || scopeModuleKey || myModuleKey || undefined);
      const r = await driveOrgTree(effectiveMod || undefined);
      const modules = r.modules || [];
      setMyModule(r.my_module || scopeModuleKey || myModuleKey || 'other');
      setTree(modules);

      const initModules = new Set();
      const initCompanies = new Set();
      const initRegions = new Set();
      const initCategories = new Set();
      const initDepartments = new Set();
      const focusKey = lockModule || r.filter_module || scopeModuleKey || myModuleKey;
      const focusMod = modules.find((m) => m.key === focusKey) || modules[0];
      if (focusMod) {
        initModules.add(focusMod.key);
        const co = focusMod.companies?.[0];
        if (co) {
          initCompanies.add(`${focusMod.key}:${co.id}`);
          const rg = co.regions?.[0];
          if (rg) {
            initRegions.add(`${focusMod.key}:${co.id}:${rg.id || 'none'}`);
            const cat = rg.categories?.[0];
            if (cat) {
              initCategories.add(`${focusMod.key}:${co.id}:${rg.id || 'none'}:${cat.name}`);
              const dept = cat.departments?.[0];
              if (dept) {
                initDepartments.add(`${focusMod.key}:${co.id}:${rg.id || 'none'}:${cat.name}:${dept.id || dept.name}`);
              }
            }
          }
        }
      }
      setExpanded({
        modules: initModules,
        companies: initCompanies,
        regions: initRegions,
        categories: initCategories,
        departments: initDepartments,
      });
      await refreshRoots();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Không tải được cây module');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isSystemAdmin, myModuleKey, scopeModuleKey, lockModule, refreshRoots]);

  useEffect(() => {
    if (lockModule && !isSystemAdmin) setModuleFilter(lockModule);
  }, [lockModule, isSystemAdmin]);

  useEffect(() => { loadTree(moduleFilter); }, [loadTree, moduleFilter]);

  function toggle(kind, key) {
    setExpanded((s) => {
      const set = new Set(s[kind]);
      if (set.has(key)) set.delete(key); else set.add(key);
      return { ...s, [kind]: set };
    });
  }

  async function openRootById(rootId) {
    if (!rootId) return;
    const latest = await refreshRoots();
    const root = (latest || []).find((x) => x.id === rootId);
    if (root) onOpenRoot(root);
  }

  async function openUserDrive(userNode) {
    try {
      let rootId = userNode.drive_root_id;
      if (!rootId) {
        const r = await driveEnsureUserDrive(userNode.id);
        rootId = r?.root?.id;
        userNode.drive_root_id = rootId;
      }
      await openRootById(rootId);
    } catch (e) { alert(e?.response?.data?.error || e?.message || 'Không mở được Drive nhân viên'); }
  }

  async function openSharedCompany(companyId, moduleKey, existingRootId) {
    try {
      if (existingRootId) {
        await openRootById(existingRootId);
        return;
      }
      const r = await driveEnsureSharedCompany(companyId, moduleKey);
      await openRootById(r?.root?.id);
    } catch (e) { alert(e?.response?.data?.error || e?.message || 'Không mở được Drive chung công ty'); }
  }

  async function openSharedRegion(regionId, moduleKey, existingRootId) {
    try {
      if (existingRootId) {
        await openRootById(existingRootId);
        return;
      }
      const r = await driveEnsureSharedRegion(regionId, moduleKey);
      await openRootById(r?.root?.id);
    } catch (e) { alert(e?.response?.data?.error || e?.message || 'Không mở được Drive chung khu vực'); }
  }

  function countRegionEmployees(rg) {
    return (rg.categories || []).reduce(
      (acc, cat) => acc + (cat.departments || []).reduce((a2, d) => a2 + (d.employees?.length || 0), 0),
      0,
    );
  }

  function countEmployees(mod) {
    return (mod.companies || []).reduce(
      (acc, c) => acc + (c.regions || []).reduce((a2, r) => a2 + countRegionEmployees(r), 0),
      0,
    );
  }

  if (loading) {
    return <div className="px-2 py-1 text-[11px] text-slate-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Đang tải…</div>;
  }
  if (error) {
    return <p className="px-2 py-1 text-[11px] text-rose-500">{error}</p>;
  }
  if (!tree || tree.length === 0) {
    return <p className="px-2 py-1 text-[11px] text-slate-400">Chưa có dữ liệu công ty.</p>;
  }

  const activeLeafCls = moduleLayout
    ? 'bg-indigo-50 text-indigo-700 font-semibold'
    : 'bg-blue-50 text-blue-700 font-medium';
  const activeSharedCompanyCls = moduleLayout
    ? 'bg-indigo-50 text-indigo-800 font-semibold'
    : 'bg-emerald-50 text-emerald-800 font-medium';
  const activeSharedRegionCls = moduleLayout
    ? 'bg-indigo-50/80 text-indigo-800 font-medium'
    : 'bg-amber-50 text-amber-800 font-medium';

  function renderCompanyTree(mod) {
    return (mod.companies || []).map((co) => {
      const coKey = `${mod.key}:${co.id}`;
      const coOpen = expanded.companies.has(coKey);
      return (
        <div key={coKey}>
          <button
            type="button"
            onClick={() => toggle('companies', coKey)}
            className={`flex items-center gap-1 w-full text-left px-1.5 py-1 rounded-lg hover:bg-slate-50 ${
              moduleLayout ? 'py-1.5' : 'py-0.5'
            }`}
          >
            {coOpen ? <ChevronDown size={moduleLayout ? 13 : 11} /> : <ChevronRight size={moduleLayout ? 13 : 11} />}
            <Building2 size={moduleLayout ? 13 : 11} className="text-emerald-600 shrink-0" />
            <span className={`${moduleLayout ? 'text-[13px] font-semibold' : 'text-[12px]'} text-slate-800 truncate`}>{co.name}</span>
          </button>
          {coOpen && (
            <div className="ml-3 border-l border-slate-100 pl-1.5 mt-0.5 space-y-0.5">
              <button
                type="button"
                onClick={() => openSharedCompany(co.id, mod.key, co.shared_root_id)}
                className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded-lg text-left text-[12px] ${
                  activeRootId === co.shared_root_id && co.shared_root_id
                    ? activeSharedCompanyCls
                    : (moduleLayout ? 'text-indigo-700 hover:bg-indigo-50/60' : 'text-emerald-700 hover:bg-emerald-50')
                }`}
                title={`Drive chung công ty — ${mod.name}`}
              >
                <Globe size={11} className="text-emerald-500 shrink-0" />
                <span className="truncate">Chung công ty</span>
              </button>
              {(co.regions || []).map((rg) => {
                const rgKey = `${coKey}:${rg.id || 'none'}`;
                const rgOpen = expanded.regions.has(rgKey);
                const rgCount = countRegionEmployees(rg);
                return (
                  <div key={rgKey}>
                    <button
                      type="button"
                      onClick={() => toggle('regions', rgKey)}
                      className="flex items-center gap-1 w-full text-left px-1 py-0.5 rounded hover:bg-slate-50"
                    >
                      {rgOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      <MapPin size={11} className="text-amber-600 shrink-0" />
                      <span className="text-[12px] text-slate-700 truncate">{rg.name}</span>
                      <span className="ml-auto text-[9px] text-slate-400">{rgCount}</span>
                    </button>
                    {rgOpen && (
                      <div className="ml-3 border-l border-slate-100 pl-1 mt-0.5 space-y-0.5">
                        {rg.id && (
                          <button
                            type="button"
                            onClick={() => openSharedRegion(rg.id, mod.key, rg.shared_root_id)}
                            className={`w-full flex items-center gap-1.5 px-1.5 py-0.5 rounded text-left text-[12px] ${
                              activeRootId === rg.shared_root_id && rg.shared_root_id
                                ? activeSharedRegionCls
                                : (moduleLayout ? 'text-indigo-600 hover:bg-indigo-50/60' : 'text-amber-700 hover:bg-amber-50')
                            }`}
                          >
                            <FolderIcon size={11} className="text-amber-500 shrink-0" fill="currentColor" />
                            <span className="truncate">Chung khu vực</span>
                          </button>
                        )}
                        {(rg.categories || []).map((cat) => {
                          const catKey = `${rgKey}:${cat.name}`;
                          const catOpen = expanded.categories.has(catKey);
                          const catCount = (cat.departments || []).reduce((a, d) => a + (d.employees?.length || 0), 0);
                          return (
                            <div key={catKey}>
                              <button
                                type="button"
                                onClick={() => toggle('categories', catKey)}
                                className="flex items-center gap-1 w-full text-left px-1 py-0.5 rounded hover:bg-slate-50"
                              >
                                {catOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                <Tag size={10} className="text-violet-500 shrink-0" />
                                <span className="text-[11px] text-slate-700 truncate">{cat.name}</span>
                                <span className="ml-auto text-[9px] text-slate-400">{catCount}</span>
                              </button>
                              {catOpen && (
                                <div className="ml-3 border-l border-slate-100 pl-1 mt-0.5 space-y-0.5">
                                  {(cat.departments || []).map((dept) => {
                                    const deptKey = `${catKey}:${dept.id || dept.name}`;
                                    const deptOpen = expanded.departments.has(deptKey);
                                    return (
                                      <div key={deptKey}>
                                        <button
                                          type="button"
                                          onClick={() => toggle('departments', deptKey)}
                                          className="flex items-center gap-1 w-full text-left px-1 py-0.5 rounded hover:bg-slate-50"
                                        >
                                          {deptOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                          <Briefcase size={10} className="text-slate-500 shrink-0" />
                                          <span className="text-[11px] text-slate-700 truncate">{dept.name}</span>
                                          <span className="ml-auto text-[9px] text-slate-400">{(dept.employees || []).length}</span>
                                        </button>
                                        {deptOpen && (
                                          <div className="ml-3 border-l border-slate-100 pl-1 mt-0.5 space-y-0.5">
                                            {(dept.employees || []).map((u) => (
                                              <button
                                                key={u.id}
                                                type="button"
                                                onClick={() => openUserDrive(u)}
                                                className={`w-full flex items-center gap-1.5 px-1.5 py-0.5 rounded-lg text-left text-[12px] truncate ${
                                                  activeRootId && activeRootId === u.drive_root_id
                                                    ? activeLeafCls
                                                    : 'text-slate-600 hover:bg-slate-50'
                                                }`}
                                              >
                                                {u.avatar ? (
                                                  <img src={u.avatar} alt="" className="w-4 h-4 rounded-full shrink-0" />
                                                ) : (
                                                  <UserIcon size={11} className={moduleLayout ? 'text-indigo-500 shrink-0' : 'text-blue-600 shrink-0'} />
                                                )}
                                                <span className="truncate">{u.name}</span>
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    });
  }

  const showModuleLevel = isSystemAdmin || !(moduleLayout && lockModule);
  const displayTree = (isSystemAdmin && moduleFilter)
    ? (tree || []).filter((m) => m.key === moduleFilter)
    : (tree || []);

  return (
    <div className="space-y-1 text-sm">
      {isSystemAdmin && (
        <>
          <p className="px-1 text-[10px] text-indigo-600 mb-1 font-medium">Admin hệ thống — tất cả công ty</p>
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="w-full mb-1 px-2 py-1 text-[11px] border rounded-lg bg-white"
          >
            <option value="">Tất cả module</option>
            {tree.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
          </select>
        </>
      )}
      {isAdmin && !isSystemAdmin && !lockModule && (
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="w-full mb-1 px-2 py-1 text-[11px] border rounded-lg bg-white"
        >
          <option value="">Tất cả module</option>
          {tree.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
        </select>
      )}
      {(lockModule || !isAdmin) && !isSystemAdmin && !moduleLayout && (
        <p className="px-1 text-[10px] text-slate-400 mb-1">Module: {moduleScopeLabel(lockModule || tree[0]?.key || myModule)}</p>
      )}

      {showModuleLevel ? displayTree.map((mod) => {
        const modOpen = expanded.modules.has(mod.key);
        return (
          <div key={mod.key}>
            <button
              type="button"
              onClick={() => toggle('modules', mod.key)}
              className="flex items-center gap-1 w-full text-left px-1 py-1 rounded hover:bg-slate-50"
            >
              {modOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <HardDrive size={12} className="text-violet-600 shrink-0" />
              <span className="text-[12px] font-semibold text-slate-700 truncate">{mod.name}</span>
              <span className="ml-auto text-[10px] text-slate-400 shrink-0">{countEmployees(mod)}</span>
            </button>
            {modOpen && (
              <div className="ml-3 border-l border-slate-100 pl-1 mt-0.5 space-y-0.5">
                {renderCompanyTree(mod)}
              </div>
            )}
          </div>
        );
      }) : (
        <div className="space-y-0.5">
          {displayTree.flatMap((mod) => renderCompanyTree(mod))}
        </div>
      )}
    </div>
  );
}
