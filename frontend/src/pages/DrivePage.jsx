/**
 * Drive lưu trữ — clone trải nghiệm Google Drive trên CRM.
 * Routes:
 *   /drive                       → tự động ensure personal root rồi mở
 *   /drive/root/:rootId          → mở 1 drive root
 *   /drive/folder/:folderId      → mở 1 folder
 *   /drive/view/recent|starred|shared|trash → các view tổng hợp
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  HardDrive, FolderPlus, Upload, Star, StarOff, Search, Trash2, RotateCcw, Share2,
  ChevronRight, Home, Users, Clock, Download, Pencil, Move, Link2, MoreHorizontal,
  Loader2, Building2, User as UserIcon, Globe, Plus, X, FolderOpen, Eye, AlertCircle,
} from 'lucide-react';
import {
  driveListRoots, driveEnsurePersonalRoot, driveEnsureCompanyRoot, driveCreateSharedRoot,
  driveListRootChildren, driveListFolderChildren, driveFolderBreadcrumb,
  driveCreateFolder, driveTrashFolder, driveTrashFile, driveUpdateFolder, driveUpdateFile,
  driveStar, driveUnstar, driveStarred, driveRecent, driveSharedWithMe, driveTrashList,
  driveRestoreFile, driveRestoreFolder, driveDeleteFileForever, driveDeleteFolderForever,
  driveSearch, driveOpenDownload, drivePreview, driveHealth, driveFormatBytes,
} from '../lib/drive';
import DriveFileIcon from '../components/drive/DriveFileIcon';
import UploadDropzone from '../components/drive/UploadDropzone';
import PreviewModal from '../components/drive/PreviewModal';
import ShareModal from '../components/drive/ShareModal';

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

export default function DrivePage() {
  const navigate = useNavigate();
  const params = useParams();
  const view = params.view || null; // recent|starred|shared|trash
  const rootIdParam = params.rootId || null;
  const folderIdParam = params.folderId || null;

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
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [previewItem, setPreviewItem] = useState(null);
  const [shareItem, setShareItem] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, item }
  const [starredIds, setStarredIds] = useState(new Set());
  const searchTimer = useRef(null);

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
    setBreadcrumb([{ type: 'root', id: root.id, name: root.name, scope: root.scope }]);
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
    navigate(`/drive/root/${root.id}`, { replace: true });
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
      setBreadcrumb(crumb.breadcrumb || []);
      const rootCrumb = crumb.breadcrumb?.find((c) => c.type === 'root');
      if (rootCrumb) {
        const r = roots.find((x) => x.id === rootCrumb.id) || activeRoot;
        if (r) setActiveRoot(r);
      }
      navigate(`/drive/folder/${folderId}`, { replace: true });
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
    navigate(`/drive/view/${viewKey}`, { replace: true });
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

  async function handleEnsureCompany() {
    try {
      const r = await driveEnsureCompanyRoot();
      const newRoots = roots.some((x) => x.id === r.root.id) ? roots : [...roots, r.root];
      setRoots(newRoots);
      await openRoot(r.root);
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  // Close context menu on click outside
  useEffect(() => {
    const h = () => setContextMenu(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  const isTrashView = view === 'trash';
  const showRoots = useMemo(() => ({
    personal: roots.filter((r) => r.scope === 'user'),
    company: roots.filter((r) => r.scope === 'company'),
    shared: roots.filter((r) => r.scope === 'shared'),
  }), [roots]);

  const displayFolders = searchResults?.folders ?? folders;
  const displayFiles = searchResults?.files ?? files;

  if (health && !health.configured) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={22} />
            <div>
              <h2 className="text-amber-900 font-semibold">Google Drive chưa được cấu hình</h2>
              <p className="text-amber-800 text-sm mt-1.5">
                Vui lòng đặt các biến môi trường backend trước khi sử dụng module Drive:
              </p>
              <ul className="text-amber-800 text-sm mt-2 space-y-1 list-disc pl-5">
                <li><code className="bg-amber-100 px-1.5 rounded">GDRIVE_SERVICE_ACCOUNT_JSON</code> hoặc <code className="bg-amber-100 px-1.5 rounded">GDRIVE_SERVICE_ACCOUNT_FILE</code></li>
                <li><code className="bg-amber-100 px-1.5 rounded">GDRIVE_ROOT_FOLDER_ID</code> (folder gốc Drive đã share Editor cho service account)</li>
              </ul>
              <p className="text-amber-800 text-sm mt-3">Sau khi đặt biến môi trường, khởi động lại backend.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex bg-slate-50">
      {/* Sidebar trái */}
      <aside className="w-64 border-r bg-white flex flex-col">
        <div className="p-4">
          <h1 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <HardDrive size={20} className="text-blue-600" /> Drive
          </h1>
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

          <SidebarSection title="Drive công ty">
            {showRoots.company.length === 0 && (
              <button onClick={handleEnsureCompany} className="text-xs text-blue-600 hover:underline px-2">
                + Tạo Drive công ty
              </button>
            )}
            {showRoots.company.map((r) => (
              <SidebarLink key={r.id} icon={Building2} label={r.name} active={activeRoot?.id === r.id && !view} onClick={() => openRoot(r)} />
            ))}
          </SidebarSection>

          <SidebarSection title={
            <span className="flex items-center justify-between">
              <span>Drive chung</span>
              <button onClick={handleCreateSharedDrive} className="text-blue-600 hover:underline text-[10px]">+ Tạo</button>
            </span>
          }>
            {showRoots.shared.length === 0 && (
              <p className="text-[11px] text-slate-400 px-2">Chưa có Drive chung</p>
            )}
            {showRoots.shared.map((r) => (
              <SidebarLink key={r.id} icon={Globe} label={r.name} active={activeRoot?.id === r.id && !view} onClick={() => openRoot(r)} />
            ))}
          </SidebarSection>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="h-14 border-b bg-white px-4 flex items-center gap-3">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-hidden">
            {breadcrumb.map((c, idx) => (
              <span key={`${c.type}-${c.id}`} className="flex items-center gap-1 min-w-0">
                {idx > 0 && <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                <button
                  onClick={() => {
                    if (c.type === 'root') {
                      const r = roots.find((x) => x.id === c.id);
                      if (r) openRoot(r);
                    } else if (c.type === 'folder') {
                      openFolder(c.id);
                    }
                  }}
                  className={`truncate px-2 py-1 rounded hover:bg-slate-100 ${idx === breadcrumb.length - 1 ? 'font-semibold text-slate-900' : 'text-slate-600'}`}
                >
                  {c.type === 'root' && idx === 0 && <Home size={12} className="inline mr-1" />}
                  {c.name}
                </button>
              </span>
            ))}
          </nav>

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
            </>
          )}
        </div>

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
              {/* Folders */}
              {displayFolders.length > 0 && (
                <section className="mb-6">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">Thư mục</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {displayFolders.map((f) => {
                      const isStarred = starredIds.has('folder:' + f.id);
                      return (
                        <div
                          key={f.id}
                          onDoubleClick={() => !isTrashView && openFolder(f.id)}
                          onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, item: f, type: 'folder' }); }}
                          className="group bg-white border rounded-lg p-3 hover:border-blue-400 hover:shadow-sm cursor-pointer flex items-center gap-3"
                        >
                          <DriveFileIcon isFolder size={28} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{f.name}</p>
                            {f.trashed_at && <p className="text-[10px] text-red-500">Đã xoá</p>}
                          </div>
                          {isStarred && <Star size={14} className="text-amber-400 fill-amber-400" />}
                          <button
                            onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, item: f, type: 'folder' }); }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded">
                            <MoreHorizontal size={16} className="text-slate-400" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Files */}
              {displayFiles.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">File</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {displayFiles.map((f) => {
                      const isStarred = starredIds.has('file:' + f.id);
                      return (
                        <div
                          key={f.id}
                          onDoubleClick={() => !isTrashView && handlePreview(f)}
                          onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, item: f, type: 'file' }); }}
                          className="group bg-white border rounded-lg p-3 hover:border-blue-400 hover:shadow-sm cursor-pointer flex items-center gap-3"
                        >
                          <DriveFileIcon mime={f.mime_type} size={28} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate" title={f.name}>{f.name}</p>
                            <p className="text-[11px] text-slate-400">{driveFormatBytes(f.size_bytes)}</p>
                          </div>
                          {isStarred && <Star size={14} className="text-amber-400 fill-amber-400" />}
                          <button
                            onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, item: f, type: 'file' }); }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded">
                            <MoreHorizontal size={16} className="text-slate-400" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
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

      {previewItem && <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} onDownload={() => handleDownload(previewItem)} />}
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
