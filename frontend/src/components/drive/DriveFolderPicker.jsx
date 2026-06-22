/**
 * DriveFolderPicker — chọn thư mục Drive (không chọn file).
 * companyId: lọc Drive công ty, mặc định mở kho ảnh chung.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderOpen, ChevronRight, Loader2, Check } from 'lucide-react';
import {
  driveListRoots,
  driveListRootChildren,
  driveListFolderChildren,
  driveFolderBreadcrumb,
  driveEnsureCompanyImages,
} from '../../lib/drive';
import DriveLocationBar, { enrichDriveBreadcrumb } from './DriveLocationBar';

export const DRIVE_FOLDER_PICKER_ATTR = 'data-drive-folder-picker';

function rootBelongsToCompany(root, companyId) {
  if (!root || !companyId) return true;
  if (root.company_id && String(root.company_id) === String(companyId)) return true;
  if (root.scope === 'company' && String(root.owner_id) === String(companyId)) return true;
  return !root.company_id;
}

function rootLabel(root) {
  if (root?.shared_kind === 'company_images') return 'Kho ảnh chung';
  if (root?.shared_kind === 'shared_company') return 'Drive chung công ty';
  if (root?.shared_kind === 'shared_region') return 'Drive chung khu vực';
  return root?.name || 'Drive';
}

export default function DriveFolderPicker({
  onPicked,
  onClose,
  title = 'Chọn thư mục Drive',
  companyId = null,
  /** @deprecated dùng companyId */
  companyImagesCompanyId = null,
}) {
  const effectiveCompanyId = companyId || companyImagesCompanyId || null;
  const [roots, setRoots] = useState([]);
  const [activeRoot, setActiveRoot] = useState(null);
  const [browseFolderId, setBrowseFolderId] = useState(null);
  const [browseFolderName, setBrowseFolderName] = useState('');
  const [folders, setFolders] = useState([]);
  const [crumb, setCrumb] = useState([]);
  const [loading, setLoading] = useState(true);

  const openRoot = useCallback(async (root) => {
    setLoading(true);
    try {
      setActiveRoot(root);
      setBrowseFolderId(null);
      setBrowseFolderName('');
      const data = await driveListRootChildren(root.id);
      setFolders(data.folders || []);
      setCrumb(enrichDriveBreadcrumb([
        { type: 'root', id: root.id, name: rootLabel(root), scope: root.scope, shared_kind: root.shared_kind },
      ]));
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Không tải được Drive');
    } finally {
      setLoading(false);
    }
  }, []);

  const openFolder = useCallback(async (f) => {
    setLoading(true);
    try {
      const [data, bc] = await Promise.all([
        driveListFolderChildren(f.id),
        driveFolderBreadcrumb(f.id),
      ]);
      setBrowseFolderId(f.id);
      setBrowseFolderName(f.name);
      setFolders(data.folders || []);
      setCrumb(enrichDriveBreadcrumb(bc.breadcrumb || []));
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Không tải được thư mục');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await driveListRoots();
        let list = (r.roots || []).filter((root) => rootBelongsToCompany(root, effectiveCompanyId));

        let defaultRoot = null;
        if (effectiveCompanyId) {
          try {
            const kho = await driveEnsureCompanyImages(effectiveCompanyId, 'crm');
            if (kho?.root) {
              if (!list.some((x) => String(x.id) === String(kho.root.id))) {
                list = [kho.root, ...list];
              }
              defaultRoot = kho.root;
            }
          } catch {
            /* kho chưa sẵn sàng */
          }
        }

        if (!defaultRoot) {
          defaultRoot = list.find((x) => x.shared_kind === 'company_images') || list[0] || null;
        }

        if (cancelled) return;
        setRoots(list);
        if (defaultRoot) await openRoot(defaultRoot);
        else setLoading(false);
      } catch (e) {
        if (!cancelled) {
          alert(e?.response?.data?.error || e?.message || 'Không tải được danh sách Drive');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [effectiveCompanyId, openRoot]);

  async function goCrumb(item) {
    if (item.type === 'root') {
      const root = roots.find((r) => String(r.id) === String(item.id)) || activeRoot;
      if (root) await openRoot(root);
      return;
    }
    if (item.type === 'folder') {
      await openFolder({ id: item.id, name: item.name });
    }
  }

  const pickFolder = (f) => {
    onPicked?.({ id: f.id, name: f.name, rootId: activeRoot?.id || null });
    onClose?.();
  };

  const pickCurrent = () => {
    if (browseFolderId) {
      onPicked?.({ id: browseFolderId, name: browseFolderName, rootId: activeRoot?.id || null });
    } else if (activeRoot?.id) {
      onPicked?.({ id: null, name: rootLabel(activeRoot), rootId: activeRoot.id });
    }
    onClose?.();
  };

  const currentLabel = browseFolderId
    ? browseFolderName
    : (activeRoot ? `${rootLabel(activeRoot)} (gốc)` : 'Chưa chọn');

  const modal = (
    <div
      {...{ [DRIVE_FOLDER_PICKER_ATTR]: '' }}
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/55 p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-lg max-h-[min(85vh,640px)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{title}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {roots.length > 1 && (
          <div className="px-3 py-2 border-b shrink-0">
            <select
              value={activeRoot?.id || ''}
              onChange={(e) => {
                const root = roots.find((x) => String(x.id) === String(e.target.value));
                if (root) void openRoot(root);
              }}
              className="w-full h-9 px-2.5 text-xs border border-gray-200 rounded-lg bg-white"
            >
              {roots.map((r) => (
                <option key={r.id} value={r.id}>{rootLabel(r)}</option>
              ))}
            </select>
          </div>
        )}

        <div className="px-3 py-2 border-b shrink-0">
          <DriveLocationBar crumb={crumb} onNavigate={goCrumb} />
        </div>

        <div className="flex-1 overflow-y-auto min-h-[180px] p-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
            </div>
          ) : (
            <div className="space-y-0.5">
              {folders.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-1 rounded-lg hover:bg-amber-50/80 border border-transparent hover:border-amber-100"
                >
                  <button
                    type="button"
                    onClick={() => openFolder(f)}
                    className="flex-1 min-w-0 flex items-center gap-2 px-2 py-2 text-left text-sm text-gray-800"
                  >
                    <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
                    <span className="truncate flex-1">{f.name}</span>
                    <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => pickFolder(f)}
                    className="shrink-0 mr-1 h-7 px-2 text-[10px] font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-0.5"
                    title={`Chọn thư mục ${f.name}`}
                  >
                    <Check className="h-3 w-3" /> Chọn
                  </button>
                </div>
              ))}
              {!folders.length && (
                <p className="text-xs text-gray-400 text-center py-8 px-3">
                  {browseFolderId
                    ? 'Thư mục trống — bấm «Chọn thư mục này» để dùng thư mục hiện tại.'
                    : 'Không có thư mục con — bấm «Chọn thư mục này» để dùng thư mục gốc Drive.'}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="border-t px-4 py-3 flex items-center justify-between gap-2 shrink-0 bg-gray-50/80">
          <p className="text-[11px] text-gray-600 truncate min-w-0">
            📁 {currentLabel}
          </p>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={onClose} className="h-8 px-3 text-xs rounded-lg bg-gray-100 hover:bg-gray-200">
              Hủy
            </button>
            <button
              type="button"
              onClick={pickCurrent}
              disabled={!activeRoot}
              className="h-8 px-3 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Chọn thư mục này
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
