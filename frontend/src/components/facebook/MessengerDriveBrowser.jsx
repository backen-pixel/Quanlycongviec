/**
 * Duyệt Drive trong panel Messenger — breadcrumb, chọn ảnh, xem phóng to, upload.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Send,
  Upload,
  ZoomIn,
} from 'lucide-react';
import {
  driveEnsureCompanyImages,
  driveFolderBreadcrumb,
  driveListFolderChildren,
  driveListRootChildren,
  driveListRoots,
  driveUploadFile,
} from '../../lib/drive';
import { fetchDriveFolderImagesPreview } from '../../lib/facebookImageSets';
import {
  loadMessengerDriveLocation,
  saveMessengerDriveLocation,
} from '../../lib/messengerDriveLocationStorage';
import {
  getCachedLocation,
  getCachedRoots,
  invalidateLocation,
  locationCacheKey,
  setCachedLocation,
  setCachedRoots,
} from '../../lib/messengerDriveCache';
import DriveLocationBar, { enrichDriveBreadcrumb } from '../drive/DriveLocationBar';
import PreviewModal from '../drive/PreviewModal';
import { DriveFileThumbnail, filterImageFiles, isImageMime } from '../drive/DriveFileViews';

export const FB_IMAGE_DRIVE_PANEL_ATTR = 'data-fb-image-drive-panel';

function rootLabel(root) {
  if (root?.shared_kind === 'company_images') return 'Kho ảnh chung';
  if (root?.shared_kind === 'shared_company') return 'Drive chung công ty';
  if (root?.shared_kind === 'shared_region') return 'Drive chung khu vực';
  return root?.name || 'Drive';
}

function rootBelongsToCompany(root, companyId) {
  if (!root || !companyId) return true;
  if (root.company_id && String(root.company_id) === String(companyId)) return true;
  if (root.scope === 'company' && String(root.owner_id) === String(companyId)) return true;
  return !root.company_id;
}

function mapImageRows(files) {
  return filterImageFiles(files || []).map((f) => ({
    id: f.id,
    name: f.name,
    mime_type: f.mime_type,
    thumbnail_url: f.thumbnail_url,
  }));
}

function applySelection(images, restoreSelectedIds, setSelectedIds) {
  const nextImages = images || [];
  if (restoreSelectedIds?.length) {
    const valid = new Set(nextImages.map((img) => String(img.id)));
    const restored = restoreSelectedIds.filter((id) => valid.has(String(id)));
    setSelectedIds(
      restored.length
        ? new Set(restored)
        : new Set(nextImages.map((img) => img.id)),
    );
  } else {
    setSelectedIds(new Set(nextImages.map((img) => img.id)));
  }
}

export default function MessengerDriveBrowser({
  companyId,
  companyQs = '',
  disabled = false,
  sending = false,
  onSend,
}) {
  const [roots, setRoots] = useState([]);
  const [activeRoot, setActiveRoot] = useState(null);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [crumb, setCrumb] = useState([]);
  const [folders, setFolders] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [history, setHistory] = useState({ stack: [], index: -1 });
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [lightboxItem, setLightboxItem] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const fileInputRef = useRef(null);
  const saveTimerRef = useRef(null);
  const loadGenRef = useRef(0);

  const buildCrumb = useCallback(async (root, folder) => {
    if (folder) {
      const bc = await driveFolderBreadcrumb(folder.id);
      return enrichDriveBreadcrumb(bc.breadcrumb || [], root);
    }
    return enrichDriveBreadcrumb([
      { type: 'root', id: root.id, name: rootLabel(root), scope: root.scope, shared_kind: root.shared_kind },
    ], root);
  }, []);

  const applyPayload = useCallback((payload, restoreSelectedIds) => {
    setFolders(payload.folders || []);
    setImages(payload.images || []);
    setCrumb(payload.crumb || []);
    applySelection(payload.images, restoreSelectedIds, setSelectedIds);
  }, []);

  const loadLocationData = useCallback(async (root, folder, {
    restoreSelectedIds = null,
    forceRefresh = false,
    forceSync = false,
  } = {}) => {
    const cacheKey = locationCacheKey(root.id, folder?.id);
    const gen = ++loadGenRef.current;

    if (!forceRefresh) {
      const cached = getCachedLocation(cacheKey);
      if (cached) {
        applyPayload(cached, restoreSelectedIds);
        setLoadError(null);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setLoadError(null);

    try {
      const [children, crumb] = await Promise.all([
        folder ? driveListFolderChildren(folder.id) : driveListRootChildren(root.id),
        buildCrumb(root, folder),
      ]);

      if (gen !== loadGenRef.current) return;

      let nextImages = mapImageRows(children.files);
      setFolders(children.folders || []);
      setCrumb(crumb);

      if (nextImages.length && !forceSync) {
        const payload = { folders: children.folders || [], images: nextImages, crumb };
        setCachedLocation(cacheKey, payload);
        applyPayload(payload, restoreSelectedIds);
        setLoading(false);
        return;
      }

      if (!nextImages.length || forceSync) {
        try {
          const preview = await fetchDriveFolderImagesPreview(
            {
              folderId: folder?.id || null,
              rootId: folder ? null : root.id,
              sync: forceSync || !nextImages.length,
            },
            companyQs,
          );
          if (gen !== loadGenRef.current) return;
          if (preview?.images?.length) nextImages = preview.images;
        } catch (e) {
          if (!nextImages.length) {
            setLoadError(e.response?.data?.error || e.message || 'Không tải được danh sách ảnh');
          }
        }
      }

      const payload = {
        folders: children.folders || [],
        images: nextImages,
        crumb,
      };
      setCachedLocation(cacheKey, payload);
      applyPayload(payload, restoreSelectedIds);
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      setFolders([]);
      setImages([]);
      setSelectedIds(new Set());
      setLoadError(e.response?.data?.error || e.message || 'Không tải được ảnh');
    }
    if (gen === loadGenRef.current) setLoading(false);
  }, [companyQs, applyPayload, buildCrumb]);

  const openLocation = useCallback(async (loc, { push = true, replaceStack = false, restoreSelectedIds = null } = {}) => {
    const { root, folder } = loc;
    setActiveRoot(root);
    setCurrentFolder(folder);
    setLightboxItem(null);
    await loadLocationData(root, folder, { restoreSelectedIds });

    if (push) {
      setHistory((prev) => {
        if (replaceStack) return { stack: [loc], index: 0 };
        const stack = [...prev.stack.slice(0, prev.index + 1), loc];
        return { stack, index: stack.length - 1 };
      });
    }
  }, [loadLocationData]);

  const initRoots = useCallback(async () => {
    setLoading(true);
    try {
      const cachedRoots = getCachedRoots(companyId);
      if (cachedRoots?.list?.length) {
        setRoots(cachedRoots.list);
        const saved = loadMessengerDriveLocation(companyId);
        let targetRoot = cachedRoots.khoRoot;
        if (saved?.rootId) {
          const matched = cachedRoots.list.find((x) => String(x.id) === saved.rootId);
          if (matched) targetRoot = matched;
        }
        if (targetRoot) {
          const folder = saved?.folderId
            ? { id: saved.folderId, name: saved.folderName || '' }
            : null;
          await openLocation(
            { root: targetRoot, folder },
            { push: true, replaceStack: true, restoreSelectedIds: saved?.selectedFileIds },
          );
        }
        return;
      }

      const [rootsRes, khoRes] = await Promise.all([
        driveListRoots(),
        companyId
          ? driveEnsureCompanyImages(companyId, 'crm').catch(() => null)
          : Promise.resolve(null),
      ]);

      let list = (rootsRes.roots || []).filter((root) => rootBelongsToCompany(root, companyId));
      let khoRoot = khoRes?.root || null;
      if (khoRoot && !list.some((x) => String(x.id) === String(khoRoot.id))) {
        list = [khoRoot, ...list];
      }
      if (!khoRoot) {
        khoRoot = list.find((x) => x.shared_kind === 'company_images') || list[0] || null;
      }

      setRoots(list);
      setCachedRoots(companyId, { list, khoRoot });

      const saved = loadMessengerDriveLocation(companyId);
      let targetRoot = khoRoot;
      if (saved?.rootId) {
        const matched = list.find((x) => String(x.id) === saved.rootId);
        if (matched) targetRoot = matched;
      }

      if (targetRoot) {
        const folder = saved?.folderId
          ? { id: saved.folderId, name: saved.folderName || '' }
          : null;
        await openLocation(
          { root: targetRoot, folder },
          { push: true, replaceStack: true, restoreSelectedIds: saved?.selectedFileIds },
        );
      }
    } catch {
      setRoots([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, openLocation]);

  useEffect(() => {
    initRoots();
  }, [initRoots]);

  useEffect(() => {
    if (!companyId || !activeRoot?.id || loading) return undefined;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveMessengerDriveLocation(companyId, {
        rootId: activeRoot.id,
        folderId: currentFolder?.id || null,
        folderName: currentFolder?.name || null,
        selectedFileIds: [...selectedIds],
      });
    }, 350);
    return () => clearTimeout(saveTimerRef.current);
  }, [companyId, activeRoot?.id, currentFolder?.id, currentFolder?.name, selectedIds, loading]);

  const applyLocation = useCallback((loc) => {
    setActiveRoot(loc.root);
    setCurrentFolder(loc.folder);
    setLightboxItem(null);
    loadLocationData(loc.root, loc.folder);
  }, [loadLocationData]);

  const { stack: navStack, index: navIndex } = history;
  const canGoBack = navIndex > 0;
  const canGoForward = navIndex >= 0 && navIndex < navStack.length - 1;

  const goBack = useCallback(() => {
    if (navIndex <= 0) return;
    const next = navIndex - 1;
    const loc = navStack[next];
    setHistory({ stack: navStack, index: next });
    applyLocation(loc);
  }, [navIndex, navStack, applyLocation]);

  const goForward = useCallback(() => {
    if (navIndex < 0 || navIndex >= navStack.length - 1) return;
    const next = navIndex + 1;
    const loc = navStack[next];
    setHistory({ stack: navStack, index: next });
    applyLocation(loc);
  }, [navIndex, navStack, applyLocation]);

  const enterFolder = (folder) => {
    if (!activeRoot) return;
    openLocation({ root: activeRoot, folder }, { push: true });
  };

  const handleCrumbNav = (item) => {
    if (!activeRoot) return;
    if (item.type === 'root' || item.type === 'scope') {
      openLocation({ root: activeRoot, folder: null }, { push: true });
      return;
    }
    if (item.type === 'folder') {
      openLocation({ root: activeRoot, folder: { id: item.id, name: item.name } }, { push: true });
    }
  };

  const switchRoot = async (rootId) => {
    const root = roots.find((r) => String(r.id) === String(rootId));
    if (!root) return;
    await openLocation({ root, folder: null }, { push: true, replaceStack: true });
  };

  const currentLabel = useMemo(() => {
    if (currentFolder?.name) return currentFolder.name;
    if (activeRoot) return rootLabel(activeRoot);
    return 'Drive';
  }, [currentFolder, activeRoot]);

  const selectedCount = useMemo(
    () => images.filter((img) => selectedIds.has(img.id)).length,
    [images, selectedIds],
  );

  const allSelected = images.length > 0 && selectedCount === images.length;

  const toggleImage = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(images.map((img) => img.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleUpload = async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (!list.length || !activeRoot?.id) return;

    setUploading(true);
    try {
      const uploadedIds = [];
      for (const file of list) {
        if (!file.type.startsWith('image/') && !isImageMime(file.type, file.name)) continue;
        const res = await driveUploadFile(file, {
          folder_id: currentFolder?.id || undefined,
          root_id: currentFolder ? undefined : activeRoot.id,
          name: file.name,
        });
        if (res?.file?.id) uploadedIds.push(res.file.id);
      }
      invalidateLocation(locationCacheKey(activeRoot.id, currentFolder?.id));
      await loadLocationData(activeRoot, currentFolder, { forceRefresh: true, forceSync: true });
      if (uploadedIds.length) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          uploadedIds.forEach((id) => next.add(id));
          return next;
        });
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Lỗi upload ảnh');
    }
    setUploading(false);
  };

  const handleSendClick = () => {
    const ids = images.filter((img) => selectedIds.has(img.id)).map((img) => img.id);
    onSend?.({
      folderId: currentFolder?.id || null,
      rootId: currentFolder ? null : activeRoot?.id || null,
      label: currentLabel,
      count: ids.length,
      fileIds: ids,
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0" {...{ [FB_IMAGE_DRIVE_PANEL_ATTR]: '' }}>
      {roots.length > 1 && (
        <div className="px-2 py-1.5 border-b border-gray-100 shrink-0 bg-white/80">
          <select
            value={activeRoot?.id || ''}
            onChange={(e) => switchRoot(e.target.value)}
            className="w-full h-8 px-2 text-[11px] border border-gray-200 rounded-lg bg-white"
          >
            {roots.map((r) => (
              <option key={r.id} value={r.id}>{rootLabel(r)}</option>
            ))}
          </select>
        </div>
      )}

      <DriveLocationBar
        items={crumb}
        onNavigate={handleCrumbNav}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={goBack}
        onForward={goForward}
        className="!px-2 !py-1.5 !text-xs"
      />

      <div className="px-2 py-1.5 border-b border-gray-100 shrink-0 bg-white flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading || loading || !activeRoot}
          className="h-7 px-2 text-[10px] rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1 shrink-0"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {uploading ? 'Đang tải…' : 'Upload'}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
        {images.length > 0 && (
          <>
            <button
              type="button"
              onClick={allSelected ? clearSelection : selectAll}
              disabled={loading}
              className="h-7 px-2 text-[10px] rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 shrink-0"
            >
              {allSelected ? 'Bỏ chọn' : 'Chọn tất cả'}
            </button>
            <span className="text-[10px] text-gray-500 ml-auto shrink-0">
              {selectedCount}/{images.length} ảnh
            </span>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-1.5 py-1.5">
        {loading && !folders.length && !images.length ? (
          <div className="flex items-center justify-center py-10 text-gray-400 gap-2 text-xs">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
          </div>
        ) : (
          <>
            {loading && (folders.length > 0 || images.length > 0) && (
              <p className="text-[10px] text-gray-400 flex items-center gap-1 px-1 mb-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Đang cập nhật…
              </p>
            )}
            {folders.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-1 mb-1">Thư mục</p>
                <div className="rounded-lg border border-gray-100 bg-white divide-y divide-gray-50 overflow-hidden">
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => enterFolder(f)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-amber-50/80 transition-colors"
                    >
                      <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
                      <span className="text-[11px] text-gray-800 truncate flex-1">{f.name}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-1 mb-1 flex items-center gap-1">
                <ImageIcon className="h-3 w-3" />
                Ảnh · {currentLabel}
              </p>
              {loadError && (
                <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5 mb-1.5">
                  {loadError}
                </p>
              )}
              {images.length === 0 ? (
                <p className="text-[11px] text-gray-500 text-center py-6 px-2 border border-dashed border-gray-200 rounded-lg bg-white/70">
                  {folders.length ? 'Mở thư mục con hoặc bấm Upload thêm ảnh.' : 'Thư mục trống — bấm Upload để thêm ảnh.'}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 p-0.5">
                  {images.map((img) => {
                    const selected = selectedIds.has(img.id);
                    return (
                      <div
                        key={img.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setLightboxItem(img)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setLightboxItem(img); }}
                        className={`relative aspect-square rounded-lg overflow-hidden border bg-gray-50 shadow-sm group cursor-zoom-in ${
                          selected ? 'border-blue-500 ring-2 ring-blue-300/50' : 'border-gray-200'
                        }`}
                      >
                        <DriveFileThumbnail
                          file={img}
                          className="w-full h-full object-cover pointer-events-none"
                          size={52}
                        />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleImage(img.id); }}
                          className={`absolute top-1 left-1 z-10 h-5 w-5 rounded-md border flex items-center justify-center transition ${
                            selected
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-white/90 border-gray-300 text-transparent hover:text-gray-400'
                          }`}
                          title={selected ? 'Bỏ chọn' : 'Chọn ảnh'}
                          aria-label={selected ? 'Bỏ chọn ảnh' : 'Chọn ảnh'}
                        >
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </button>
                        <span className="absolute bottom-1 right-1 z-10 h-6 w-6 rounded-md bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <ZoomIn className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-white/95 px-2 py-2">
        <button
          type="button"
          onClick={handleSendClick}
          disabled={disabled || sending || loading || !selectedCount || !activeRoot}
          className="w-full h-9 text-[11px] font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 inline-flex items-center justify-center gap-1.5 shadow-sm"
        >
          {sending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang gửi…
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              Gửi {selectedCount > 0 ? `${selectedCount} ảnh` : 'ảnh'} cho khách
            </>
          )}
        </button>
      </div>

      {lightboxItem && (
        <PreviewModal
          item={lightboxItem}
          galleryFiles={images}
          onClose={() => setLightboxItem(null)}
        />
      )}
    </div>
  );
}
