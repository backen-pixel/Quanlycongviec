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
  Network, MapPin, LayoutGrid, List as ListIcon, Folder as FolderIcon,
  FilePlus, FileText, Table2, Tag, Briefcase, PanelLeftClose, PanelLeftOpen,
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
import DriveFileIcon from '../components/drive/DriveFileIcon';
import DriveLocationBar, { enrichDriveBreadcrumb } from '../components/drive/DriveLocationBar';
import { DRIVE_FILE_LIST_GRID, UploaderCell, fmtDriveDate, fmtDriveDateTime, isImageMime, isQuickPreviewFile, isGoogleWorkspaceFile, isPdfFile, filterImageFiles, DriveFileThumbnail } from '../components/drive/DriveFileViews';
import UploadDropzone from '../components/drive/UploadDropzone';
import PreviewModal from '../components/drive/PreviewModal';
import ShareModal from '../components/drive/ShareModal';
import { useAuth } from '../lib/auth';
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

export default function DrivePage() {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const lockedModule = (searchParams.get('module') || '').toLowerCase() || null;
  const myModuleKey = (user?.drive_module || 'other').toLowerCase();
  const scopeModuleKey = lockedModule || myModuleKey;
  const isAdmin = ['admin', 'sales_admin', 'manager'].includes(user?.role);
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
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [previewItem, setPreviewItem] = useState(null);
  const [shareItem, setShareItem] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, item }
  const [starredIds, setStarredIds] = useState(new Set());
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('drive.viewMode') || 'grid'; } catch (_) { return 'grid'; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('drive.sidebarOpen') !== '0'; } catch (_) { return true; }
  });
  const searchTimer = useRef(null);

  useEffect(() => {
    try { localStorage.setItem('drive.sidebarOpen', sidebarOpen ? '1' : '0'); } catch (_) {}
  }, [sidebarOpen]);

  useEffect(() => {
    try { localStorage.setItem('drive.viewMode', viewMode); } catch (_) {}
  }, [viewMode]);

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
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  async function handleDownload(file) {
    try { await driveOpenDownload(file.id, file.name); }
    catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  async function handlePreview(file) {
    try {
      const meta = await drivePreview(file.id);
      setPreviewItem({ ...file, preview: meta });
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
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
    const h = () => setContextMenu(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
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
    <div className="h-[calc(100vh-3.5rem)] flex bg-slate-50">
      {/* Sidebar trái */}
      {sidebarOpen && (
      <aside className="w-64 shrink-0 border-r bg-white flex flex-col">
        <div className="p-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
          <h1 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <HardDrive size={20} className="text-blue-600 shrink-0" /> Drive
            {lockedModule && (
              <span className="text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full">
                {moduleScopeLabel(lockedModule)}
              </span>
            )}
          </h1>
          {lockedModule && (
            <p className="text-[11px] text-slate-500 mt-1">Chỉ công ty thuộc khối {moduleScopeLabel(lockedModule)}</p>
          )}
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 shrink-0"
            title="Thu gọn sidebar"
            aria-label="Thu gọn sidebar Drive"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        <div className="px-3 space-y-1 overflow-auto flex-1">
          <SidebarSection title="Quick views">
            <SidebarLink icon={Clock} label="Gần đây" active={view === 'recent'} onClick={() => openView('recent')} />
            <SidebarLink icon={Star} label="Đã gắn dấu" active={view === 'starred'} onClick={() => openView('starred')} />
            <SidebarLink icon={Users} label="Được chia sẻ" active={view === 'shared'} onClick={() => openView('shared')} />
            <SidebarLink icon={Trash2} label="Thùng rác" active={view === 'trash'} onClick={() => openView('trash')} />
          </SidebarSection>

          <SidebarSection title="Drive của tôi">
            {showRoots.personal.length === 0 && (
              <button onClick={async () => {
                try { const r = await driveEnsurePersonalRoot(); setRoots([r.root, ...roots]); await openRoot(r.root); }
                catch (e) { alert(e?.response?.data?.error || e?.message); }
              }} className="text-xs text-blue-600 hover:underline px-2">
                + Tạo Drive cá nhân
              </button>
            )}
            {showRoots.personal.map((r) => (
              <SidebarLink key={r.id} icon={UserIcon} label={r.name} active={activeRoot?.id === r.id && !view} onClick={() => openRoot(r)} />
            ))}
          </SidebarSection>

          {showRoots.moduleShared.length > 0 && (
            <SidebarSection title="Drive chung module">
              {showRoots.moduleShared.map((r) => (
                <SidebarLink
                  key={r.id}
                  icon={Globe}
                  label={r.shared_kind === 'shared_company' ? `Chung công ty · ${r.name}` : r.name}
                  active={activeRoot?.id === r.id && !view}
                  onClick={() => openRoot(r)}
                />
              ))}
            </SidebarSection>
          )}

          {isAdmin && showRoots.otherShared.length > 0 && (
            <SidebarSection title={
              <span className="flex items-center justify-between">
                <span>Drive chung khác</span>
                <button onClick={handleCreateSharedDrive} className="text-blue-600 hover:underline text-[10px]">+ Tạo</button>
              </span>
            }>
              {showRoots.otherShared.map((r) => (
                <SidebarLink key={r.id} icon={Globe} label={r.name} active={activeRoot?.id === r.id && !view} onClick={() => openRoot(r)} />
              ))}
            </SidebarSection>
          )}

          <SidebarSection title={
            <span className="flex items-center gap-1.5">
              <Network size={11} className="text-slate-400" />
              <span>Drive theo module</span>
            </span>
          }>
            <OrgTreeNav
              activeRootId={activeRoot?.id}
              onOpenRoot={openRoot}
              refreshRoots={refreshRootsList}
              isAdmin={isAdmin}
              myModuleKey={myModuleKey}
              scopeModuleKey={scopeModuleKey}
              lockModule={lockedModule}
            />
          </SidebarSection>
        </div>
      </aside>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Toolbar */}
        <div className="h-14 border-b bg-white px-4 flex items-center gap-3">
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0"
              title="Mở sidebar Drive"
              aria-label="Mở sidebar Drive"
            >
              <PanelLeftOpen size={18} />
            </button>
          )}
          <div className="flex-1 min-w-0" />

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm trong Drive..."
              className="pl-8 pr-3 py-1.5 w-56 text-sm border rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* View toggle: List ↔ Grid */}
          <div className="flex items-center border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              title="Dạng danh sách"
              className={`h-9 w-9 flex items-center justify-center transition ${viewMode === 'list' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <ListIcon size={16} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Dạng lớn"
              className={`h-9 w-9 flex items-center justify-center transition ${viewMode === 'grid' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <LayoutGrid size={16} />
            </button>
          </div>

          {/* Action buttons - chỉ hiện khi đang ở root/folder, không phải view tổng hợp */}
          {(activeRoot || activeFolder) && !isTrashView && (
            <>
              <button
                onClick={() => setCreatingFolder(true)}
                className="h-9 px-3 border rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-slate-50"
              >
                <FolderPlus size={16} /> Thư mục
              </button>
              <button
                onClick={() => setShowUpload((s) => !s)}
                className="h-9 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"
              >
                <Upload size={16} /> Tải lên
              </button>
              <div className="relative" ref={createMenuRef}>
                <button
                  onClick={() => setShowCreateMenu((s) => !s)}
                  disabled={!!creatingGoogle}
                  className="h-9 px-3 border rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-60"
                >
                  {creatingGoogle ? <Loader2 size={16} className="animate-spin" /> : <FilePlus size={16} />}
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

        <DriveLocationBar items={breadcrumb} onNavigate={handleLocationNav} />

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
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
                className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:border-blue-400"
              />
              <button onClick={handleCreateFolder} className="h-7 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs">Tạo</button>
              <button onClick={() => { setCreatingFolder(false); setNewFolderName(''); }} className="h-7 px-2 text-slate-500 hover:text-slate-700"><X size={14} /></button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="animate-spin mr-2" size={20} /> Đang tải...
            </div>
          ) : (
            <>
              {viewMode === 'list' ? (
                <DriveListView
                  folders={displayFolders}
                  files={displayFiles}
                  starredIds={starredIds}
                  isTrashView={isTrashView}
                  onOpenFolder={(id) => openFolder(id)}
                  onPreview={(f) => handlePreview(f)}
                  onShare={(item, type) => setShareItem({ ...item, target_type: type })}
                  onContextMenu={(e, item, type) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, item, type }); }}
                  formatBytes={driveFormatBytes}
                />
              ) : (
                <DriveGridView
                  folders={displayFolders}
                  files={displayFiles}
                  starredIds={starredIds}
                  isTrashView={isTrashView}
                  onOpenFolder={(id) => openFolder(id)}
                  onPreview={(f) => handlePreview(f)}
                  onShare={(item, type) => setShareItem({ ...item, target_type: type })}
                  onContextMenu={(e, item, type) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, item, type }); }}
                  formatBytes={driveFormatBytes}
                />
              )}

              {displayFolders.length === 0 && displayFiles.length === 0 && (
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
    </div>
  );
}

const viewLabels = { recent: 'Gần đây', starred: 'Đã gắn dấu', shared: 'Được chia sẻ', trash: 'Thùng rác' };

function SidebarSection({ title, children }) {
  return (
    <div className="mb-4">
      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-2 mb-1">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarLink({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition ${
        active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Icon size={15} />
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

function fmtDate(iso) {
  return fmtDriveDate(iso);
}

/**
 * Dạng danh sách: bảng tên / kích thước / ngày sửa / hành động.
 */
function DriveListView({ folders, files, starredIds, isTrashView, onOpenFolder, onPreview, onShare, onContextMenu, formatBytes }) {
  if (!folders.length && !files.length) return null;
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className={`grid ${DRIVE_FILE_LIST_GRID} gap-2 px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase border-b bg-slate-50`}>
        <div>Tên</div>
        <div>Người tải lên</div>
        <div>Ngày tải lên</div>
        <div className="text-right">Kích thước</div>
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
        {files.map((f) => {
          const isStarred = starredIds.has('file:' + f.id);
          const quickOpen = !isTrashView && isQuickPreviewFile(f);
          const isImg = isImageMime(f.mime_type, f.name);
          return (
            <div
              key={`file-${f.id}`}
              onClick={() => { if (quickOpen) onPreview(f); }}
              onDoubleClick={() => !isTrashView && onPreview(f)}
              onContextMenu={(e) => onContextMenu(e, f, 'file')}
              className={`group grid ${DRIVE_FILE_LIST_GRID} gap-2 px-3 py-2 items-center hover:bg-slate-50 cursor-pointer`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <DriveFileIcon mime={f.mime_type} size={18} />
                <span className={`text-sm truncate ${quickOpen ? 'text-blue-700 hover:underline' : 'text-slate-800'}`} title={f.name}>{f.name}</span>
                {isStarred && <Star size={12} className="text-amber-400 fill-amber-400 shrink-0" />}
              </div>
              <UploaderCell file={f} />
              <div className="text-xs text-slate-500" title={fmtDriveDateTime(f.created_at)}>
                {fmtDriveDate(f.created_at)}
              </div>
              <div className="text-right text-xs text-slate-500">{formatBytes(f.size_bytes)}</div>
              <div className="flex items-center gap-0.5 justify-self-end opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); onShare?.(f, 'file'); }}
                  className="p-1 hover:bg-blue-50 text-blue-600 rounded" title="Chia sẻ (Xem / Sửa)">
                  <Share2 size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onContextMenu(e, f, 'file'); }}
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
 * Dạng lớn (grid): folders dạng pill nhỏ, files dạng card có thumbnail to giống Google Drive.
 */
function DriveGridView({ folders, files, starredIds, isTrashView, onOpenFolder, onPreview, onShare, onContextMenu, formatBytes }) {
  return (
    <>
      {folders.length > 0 && (
        <section className="mb-6">
          <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Thư mục</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {folders.map((f) => {
              const isStarred = starredIds.has('folder:' + f.id);
              return (
                <div
                  key={f.id}
                  onDoubleClick={() => !isTrashView && onOpenFolder(f.id)}
                  onContextMenu={(e) => onContextMenu(e, f, 'folder')}
                  className="group bg-slate-50 hover:bg-blue-50 border rounded-lg px-3 py-2.5 cursor-pointer flex items-center gap-2"
                >
                  <FolderIcon size={18} className="text-amber-500 shrink-0" fill="currentColor" />
                  <p className="text-sm font-medium text-slate-800 truncate flex-1" title={f.name}>{f.name}</p>
                  {isStarred && <Star size={12} className="text-amber-400 fill-amber-400 shrink-0" />}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); onShare?.(f, 'folder'); }}
                      className="p-1 hover:bg-white text-blue-600 rounded" title="Chia sẻ (Xem / Sửa)">
                      <Share2 size={13} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onContextMenu(e, f, 'folder'); }}
                      className="p-1 hover:bg-white rounded">
                      <MoreHorizontal size={14} className="text-slate-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {files.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">File</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {files.map((f) => {
              const isStarred = starredIds.has('file:' + f.id);
              const isImg = isImageMime(f.mime_type, f.name);
              const isGws = isGoogleWorkspaceFile(f.mime_type);
              const isPdf = isPdfFile(f.mime_type, f.name);
              const quickOpen = !isTrashView && isQuickPreviewFile(f);
              const showThumbArea = isImg || isGws || isPdf || !!f.thumbnail_url;
              return (
                <div
                  key={f.id}
                  onDoubleClick={() => !isTrashView && onPreview(f)}
                  onContextMenu={(e) => onContextMenu(e, f, 'file')}
                  className="group bg-white border rounded-lg overflow-hidden hover:border-blue-400 hover:shadow-md cursor-pointer flex flex-col transition"
                >
                  <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2">
                    <DriveFileIcon mime={f.mime_type} size={16} />
                    <p
                      className={`text-[13px] font-medium truncate flex-1 ${quickOpen ? 'text-blue-700' : 'text-slate-800'}`}
                      title={f.name}
                      onClick={(e) => { if (quickOpen) { e.stopPropagation(); onPreview(f); } }}
                    >
                      {f.name}
                    </p>
                    {isStarred && <Star size={12} className="text-amber-400 fill-amber-400 shrink-0" />}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); onShare?.(f, 'file'); }}
                        className="p-1 hover:bg-blue-50 text-blue-600 rounded" title="Chia sẻ (Xem / Sửa)">
                        <Share2 size={13} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onContextMenu(e, f, 'file'); }}
                        className="p-1 hover:bg-slate-100 rounded">
                        <MoreHorizontal size={14} className="text-slate-400" />
                      </button>
                    </div>
                  </div>

                  <div
                    className={`relative mx-2 mb-2 aspect-[4/3] bg-slate-50 border rounded flex items-center justify-center overflow-hidden group/thumb ${quickOpen ? 'cursor-pointer' : ''}`}
                    onClick={(e) => {
                      if (quickOpen) { e.stopPropagation(); onPreview(f); }
                    }}
                    title={isImg ? 'Xem ảnh full màn hình' : isGws ? 'Mở chỉnh sửa' : isPdf ? 'Xem PDF' : undefined}
                  >
                    {showThumbArea ? (
                      <DriveFileThumbnail file={f} size={52} zoomHint={isImg && !isTrashView} />
                    ) : (
                      <DriveFileIcon mime={f.mime_type} size={52} />
                    )}
                  </div>

                  <div className="px-3 pb-1 flex items-center gap-1.5 min-w-0">
                    <UploaderCell file={f} compact />
                  </div>
                  <div className="px-3 pb-2 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>{formatBytes(f.size_bytes)}</span>
                    <span title={fmtDriveDateTime(f.created_at)}>{fmtDriveDate(f.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

/**
 * Cây Drive — Module → Công ty → Khu vực → Loại → Phòng ban → Nhân viên (không có folder nhãn trung gian).
 */
function OrgTreeNav({ activeRootId, onOpenRoot, refreshRoots, isAdmin, myModuleKey, scopeModuleKey, lockModule }) {
  const [tree, setTree] = useState(null);
  const [myModule, setMyModule] = useState(scopeModuleKey || myModuleKey || 'other');
  const [moduleFilter, setModuleFilter] = useState(lockModule || (isAdmin ? '' : (scopeModuleKey || myModuleKey || 'other')));
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
      const effectiveMod = lockModule || modKey || scopeModuleKey || myModuleKey || undefined;
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
  }, [isAdmin, myModuleKey, scopeModuleKey, lockModule, refreshRoots]);

  useEffect(() => {
    if (lockModule) setModuleFilter(lockModule);
  }, [lockModule]);

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
    return <p className="px-2 py-1 text-[11px] text-slate-400">Chưa có dữ liệu module.</p>;
  }

  return (
    <div className="space-y-1 text-sm">
      {isAdmin && !lockModule && (
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="w-full mb-1 px-2 py-1 text-[11px] border rounded-lg bg-white"
        >
          <option value="">Tất cả module</option>
          {tree.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
        </select>
      )}
      {(lockModule || !isAdmin) && (
        <p className="px-1 text-[10px] text-slate-400 mb-1">Module: {moduleScopeLabel(lockModule || tree[0]?.key || myModule)}</p>
      )}

      {tree.map((mod) => {
        const modOpen = expanded.modules.has(mod.key);
        return (
          <div key={mod.key}>
            <button
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
                {(mod.companies || []).map((co) => {
                  const coKey = `${mod.key}:${co.id}`;
                  const coOpen = expanded.companies.has(coKey);
                  return (
                    <div key={coKey}>
                      <button
                        onClick={() => toggle('companies', coKey)}
                        className="flex items-center gap-1 w-full text-left px-1 py-0.5 rounded hover:bg-slate-50"
                      >
                        {coOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                        <Building2 size={11} className="text-emerald-600 shrink-0" />
                        <span className="text-[12px] text-slate-700 truncate">{co.name}</span>
                      </button>
                      {coOpen && (
                        <div className="ml-3 border-l border-slate-100 pl-1 mt-0.5 space-y-0.5">
                          <button
                            onClick={() => openSharedCompany(co.id, mod.key, co.shared_root_id)}
                            className={`w-full flex items-center gap-1.5 px-1.5 py-0.5 rounded text-left text-[12px] ${
                              activeRootId === co.shared_root_id && co.shared_root_id
                                ? 'bg-emerald-50 text-emerald-800 font-medium'
                                : 'text-emerald-700 hover:bg-emerald-50'
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
                                        onClick={() => openSharedRegion(rg.id, mod.key, rg.shared_root_id)}
                                        className={`w-full flex items-center gap-1.5 px-1.5 py-0.5 rounded text-left text-[12px] ${
                                          activeRootId === rg.shared_root_id && rg.shared_root_id
                                            ? 'bg-amber-50 text-amber-800 font-medium'
                                            : 'text-amber-700 hover:bg-amber-50'
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
                                                            onClick={() => openUserDrive(u)}
                                                            className={`w-full flex items-center gap-1.5 px-1.5 py-0.5 rounded text-left text-[12px] truncate ${
                                                              activeRootId && activeRootId === u.drive_root_id
                                                                ? 'bg-blue-50 text-blue-700 font-medium'
                                                                : 'text-slate-600 hover:bg-slate-50'
                                                            }`}
                                                          >
                                                            {u.avatar ? (
                                                              <img src={u.avatar} alt="" className="w-4 h-4 rounded-full shrink-0" />
                                                            ) : (
                                                              <UserIcon size={11} className="text-blue-600 shrink-0" />
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
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
