import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { formatDateTime as formatDateVN } from '../lib/utils';
import { resolveApiOrigin } from '../lib/apiOrigin';
import {
  Smartphone, Plus, Upload, Trash2, Eye, EyeOff, ShieldAlert, ShieldCheck,
  Loader2, X, Package, Download, RefreshCw, ChevronRight, FolderSearch, FileWarning, Pencil, Play,
  Settings, FolderCog, Check,
} from 'lucide-react';

/** Đọc version / versionCode từ tên file APK (khớp quy tắc backend). */
function parseFilenameClient(name) {
  if (!name || !/\.apk$/i.test(name)) return { ok: false, error: 'File phải là .apk' };
  const base = name.replace(/\.apk$/i, '');
  const verMatches = [...base.matchAll(/(\d+\.\d+(?:\.\d+)?(?:\.\d+)?)/g)];
  const verMatch = verMatches.length ? verMatches[verMatches.length - 1] : null;
  if (!verMatch) return { ok: false, error: 'Không đọc được version từ tên file — nhập version trong form.' };
  const codeMatch = base.match(/(?:^|[-_])code(\d+)/i);
  return {
    ok: true,
    version: verMatch[1],
    versionCode: codeMatch ? codeMatch[1] : '',
  };
}

function formatBytes(n) {
  if (!n) return '—';
  const mb = n / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;
}

/** Link tải APK qua API — hoạt động khi web và backend khác origin (điện thoại). */
function apkDownloadHref(release) {
  if (!release?.id) return '';
  const base = resolveApiOrigin();
  const path = `/api/app-updates/download/${release.id}`;
  return base ? `${base}${path}` : path;
}

function apkDownloadFilename(release, appKey) {
  if (!release?.version) return 'app-release.apk';
  const code = release.version_code != null ? `-code${release.version_code}` : '';
  return `${appKey || 'app'}-${release.version}${code}-release.apk`;
}

function computeLatestRelease(releases) {
  const active = (releases || []).filter((r) => r.is_active);
  if (!active.length) return null;
  return [...active].sort((a, b) => {
    const ac = a.version_code ?? -1;
    const bc = b.version_code ?? -1;
    if (bc !== ac) return bc - ac;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  })[0];
}

function toLatestSummary(rel) {
  if (!rel) return null;
  return {
    app_id: rel.app_id,
    version: rel.version,
    version_code: rel.version_code,
    update_type: rel.update_type,
    is_active: rel.is_active,
    created_at: rel.created_at,
  };
}

function computeStorageStats(releases) {
  let total_bytes = 0;
  let release_count = 0;
  let sized_count = 0;
  for (const r of releases || []) {
    release_count += 1;
    const sz = Number(r.file_size);
    if (Number.isFinite(sz) && sz > 0) {
      total_bytes += sz;
      sized_count += 1;
    }
  }
  return {
    total_bytes,
    release_count,
    sized_count,
    unsized_count: release_count - sized_count,
  };
}

export default function AppUpdatesPage() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [releases, setReleases] = useState([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [showAppForm, setShowAppForm] = useState(false);
  const [showReleaseForm, setShowReleaseForm] = useState(false);
  const [editingRelease, setEditingRelease] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filenameRule, setFilenameRule] = useState('');
  const [runningReleaseId, setRunningReleaseId] = useState(null);
  const [editingScanDir, setEditingScanDir] = useState(false);
  const [scanDirValue, setScanDirValue] = useState('');
  const [savingScanDir, setSavingScanDir] = useState(false);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = ['admin', 'sales_admin'].includes(currentUser.role);

  const selectedStorage = useMemo(
    () => computeStorageStats(releases),
    [releases],
  );

  const selectedStorageByType = useMemo(() => {
    let apk = 0;
    let ota = 0;
    for (const r of releases) {
      const sz = Number(r.file_size);
      if (!Number.isFinite(sz) || sz <= 0) continue;
      if (r.update_type === 'jsbundle') ota += sz;
      else apk += sz;
    }
    return { apk, ota };
  }, [releases]);

  const totalStorageAllApps = useMemo(
    () => apps.reduce((s, a) => s + (a.storage_stats?.total_bytes || 0), 0),
    [apps],
  );

  const syncAppLatest = useCallback((appId, releaseList) => {
    const latest = toLatestSummary(computeLatestRelease(releaseList));
    const storage_stats = computeStorageStats(releaseList);
    setApps((prev) => prev.map((a) => (
      a.id === appId ? { ...a, latest_release: latest, storage_stats } : a
    )));
    setSelected((prev) => (
      prev?.id === appId ? { ...prev, latest_release: latest, storage_stats } : prev
    ));
  }, []);

  const applyReleases = useCallback((appId, releaseList) => {
    setReleases(releaseList);
    syncAppLatest(appId, releaseList);
  }, [syncAppLatest]);

  const mergeRelease = useCallback((updated) => {
    if (!updated?.id) return;
    const appId = updated.app_id || selected?.id;
    let nextList;
    setReleases((prev) => {
      const idx = prev.findIndex((r) => r.id === updated.id);
      nextList = idx >= 0
        ? prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
        : [updated, ...prev];
      return nextList;
    });
    if (appId && nextList) syncAppLatest(appId, nextList);
  }, [selected?.id, syncAppLatest]);

  const removeReleaseById = useCallback((releaseId, appId) => {
    let nextList;
    setReleases((prev) => {
      nextList = prev.filter((r) => r.id !== releaseId);
      return nextList;
    });
    if (appId && nextList) syncAppLatest(appId, nextList);
    setEditingRelease((prev) => (prev?.id === releaseId ? null : prev));
  }, [syncAppLatest]);

  const loadApps = useCallback(async ({ silent = false, pickFirst = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/app-updates/apps');
      const list = data.apps || [];
      setApps(list);
      if (pickFirst && list.length) setSelected(list[0]);
    } catch (e) { console.error(e); }
    if (!silent) setLoading(false);
  }, []);

  const loadReleases = useCallback(async (appId, { silent = false } = {}) => {
    if (!appId) return;
    if (!silent) setLoadingReleases(true);
    try {
      const { data } = await api.get(`/app-updates/apps/${appId}/releases`);
      applyReleases(appId, data.releases || []);
    } catch (e) { console.error(e); }
    if (!silent) setLoadingReleases(false);
  }, [applyReleases]);

  const scanFiles = useCallback(async (appId, { silent = false } = {}) => {
    if (!appId) return;
    if (!silent) setScanning(true);
    try {
      const { data } = await api.get(`/app-updates/apps/${appId}/scan-files`);
      setScanResult(data);
    } catch (e) {
      console.error(e);
      if (!silent) setScanResult(null);
    }
    if (!silent) setScanning(false);
  }, []);

  const importScanned = async () => {
    if (!selected?.id || !scanResult?.importable?.length) return;
    setImporting(true);
    try {
      const { data } = await api.post(`/app-updates/apps/${selected.id}/scan-import`, {});
      const imported = data.imported || [];
      const f = (data.failed || []).length;
      if (imported.length > 0) {
        let merged;
        setReleases((prev) => {
          const ids = new Set(prev.map((r) => r.id));
          merged = [...imported.filter((r) => !ids.has(r.id)), ...prev];
          return merged;
        });
        syncAppLatest(selected.id, merged);
        await scanFiles(selected.id, { silent: true });
      }
      alert(
        imported.length > 0
          ? `Đã import ${imported.length} bản phát hành.${f ? ` ${f} file lỗi.` : ''}`
          : data.message || 'Không có file mới để import',
      );
    } catch (e) {
      alert(e.response?.data?.error || 'Import thất bại');
    }
    setImporting(false);
  };

  useEffect(() => {
    loadApps({ pickFirst: true });
    api.get('/app-updates/filename-rule').then((r) => setFilenameRule(r.data?.rule || '')).catch(() => {});
  }, [loadApps]);

  useEffect(() => {
    if (selected?.id) {
      loadReleases(selected.id);
      scanFiles(selected.id);
      setEditingScanDir(false);
    }
  }, [selected?.id, loadReleases, scanFiles]);

  const saveScanDir = async () => {
    if (!selected?.id) return;
    setSavingScanDir(true);
    try {
      const { data } = await api.put(`/app-updates/apps/${selected.id}/scan-dir`, {
        scan_dir: scanDirValue,
      });
      if (data?.scan) setScanResult(data.scan);
      setEditingScanDir(false);
    } catch (e) {
      alert(e.response?.data?.error || 'Lưu thư mục quét thất bại');
    }
    setSavingScanDir(false);
  };

  const toggleRelease = async (rel, field) => {
    try {
      const { data } = await api.put(`/app-updates/releases/${rel.id}`, { [field]: !rel[field] });
      mergeRelease(data);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const isLiveRelease = (rel) => rel.is_active && rel.is_mandatory;

  const publishRelease = async (rel) => {
    const scope = rel.update_type === 'jsbundle'
      ? `OTA runtime ${rel.runtime_version || '?'} · kênh ${rel.channel}`
      : `APK · kênh ${rel.channel}`;
    if (!confirm(
      `Bắt buộc chạy phiên bản v${rel.version}?\n\nApp sẽ nhận bản này (${scope}). Các bản cùng loại/kênh sẽ tắt phát hành.`,
    )) return;
    setRunningReleaseId(rel.id);
    try {
      const { data } = await api.post(`/app-updates/releases/${rel.id}/run`);
      const updated = data.release;
      let nextList;
      setReleases((prev) => {
        nextList = prev.map((r) => {
          if (r.id === updated.id) return { ...r, ...updated };
          const sameScope = r.app_id === updated.app_id
            && r.channel === updated.channel
            && r.update_type === updated.update_type
            && (updated.update_type !== 'jsbundle' || r.runtime_version === updated.runtime_version);
          if (sameScope) return { ...r, is_active: false, is_mandatory: false };
          return r;
        });
        return nextList;
      });
      if (selected?.id && nextList) syncAppLatest(selected.id, nextList);
    } catch (e) {
      alert(e.response?.data?.error || 'Không chạy được phiên bản');
    }
    setRunningReleaseId(null);
  };

  const deleteRelease = async (rel) => {
    if (!confirm(
      `Xóa phiên bản ${rel.version}?\n\nBản ghi database và file trên bucket Supabase sẽ bị xóa.\nFile APK local trên server (uploads) không bị xóa.`,
    )) return;
    try {
      const { data } = await api.delete(`/app-updates/releases/${rel.id}`);
      const n = data?.storageFilesRemoved;
      if (n) alert(`Đã xóa phiên bản ${rel.version} (${n} file trên bucket).`);
      removeReleaseById(rel.id, selected.id);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi xóa'); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#000000' }}>
            <Smartphone className="h-6 w-6 text-blue-600" /> Cập nhật App Android
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Quản lý nhiều app nội bộ, upload APK và phát hành phiên bản. App sẽ tự kiểm tra & tải bản mới.
          </p>
          {apps.length > 0 && (
            <p className="text-xs text-slate-600 mt-1">
              Tổng dung lượng (theo DB): <strong>{formatBytes(totalStorageAllApps)}</strong>
              · {apps.length} app
            </p>
          )}
          {filenameRule && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2 max-w-2xl">
              <strong>Quy tắc tên file APK:</strong> {filenameRule}
              <br />
              <span className="font-mono text-[11px] text-amber-900">crm-mobile-1.3.35-code51-release.apk</span>
            </p>
          )}
        </div>
        {isAdmin && (
          <button onClick={() => setShowAppForm(true)}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
            <Plus className="h-4 w-4" /> Thêm app
          </button>
        )}
      </div>

      {loading && apps.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* App list */}
          <div className="space-y-2">
            {apps.length === 0 && (
              <div className="text-sm text-gray-400 p-4 border rounded-xl text-center">Chưa có app nào</div>
            )}
            {apps.map((app) => (
              <button key={app.id} onClick={() => setSelected(app)}
                className={`w-full text-left p-3 rounded-xl border transition flex items-center gap-3 cursor-pointer ${
                  selected?.id === app.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}>
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white shrink-0">
                  <Package className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-900 truncate">{app.display_name}</div>
                  <div className="text-xs text-gray-400 truncate">{app.app_key}</div>
                  <div className="mt-1 space-y-0.5">
                    {app.latest_release && (
                      <div className="text-[11px] text-emerald-600 font-mono">v{app.latest_release.version}</div>
                    )}
                    {app.storage_stats?.release_count > 0 && (
                      <div className="text-[10px] text-slate-600 leading-snug">
                        <span>Tổng </span>
                        <strong className="font-mono text-slate-800">{formatBytes(app.storage_stats.total_bytes)}</strong>
                        <span className="text-slate-400"> · {app.storage_stats.release_count} bản</span>
                      </div>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
              </button>
            ))}
          </div>

          {/* Releases */}
          <div className="md:col-span-2 space-y-3">
            {selected ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-gray-900">{selected.display_name}</h2>
                    <p className="text-xs text-gray-400 font-mono">{selected.android_package || selected.app_key}</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Tổng dung lượng: <strong className="font-mono">{formatBytes(selectedStorage.total_bytes)}</strong>
                      · {selectedStorage.release_count} phiên bản
                      {selectedStorage.apk > 0 || selectedStorageByType.ota > 0 ? (
                        <span className="text-slate-500">
                          {' '}(APK {formatBytes(selectedStorageByType.apk)} · OTA {formatBytes(selectedStorageByType.ota)})
                        </span>
                      ) : null}
                      {selectedStorage.unsized_count > 0 && (
                        <span className="text-amber-700"> · {selectedStorage.unsized_count} bản chưa ghi size</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { loadReleases(selected.id, { silent: true }); scanFiles(selected.id, { silent: true }); }}
                      className="h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-gray-50 cursor-pointer" title="Tải lại">
                      <RefreshCw className={`h-4 w-4 text-gray-500 ${scanning || loadingReleases ? 'animate-spin' : ''}`} />
                    </button>
                    {isAdmin && scanResult?.importable?.length > 0 && (
                      <button onClick={importScanned} disabled={importing}
                        className="h-8 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                        {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
                        Import {scanResult.importable.length} file
                      </button>
                    )}
                    {isAdmin && (
                      <button onClick={() => setShowReleaseForm(true)}
                        className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer">
                        <Upload className="h-4 w-4" /> Phát hành
                      </button>
                    )}
                  </div>
                </div>

                {scanResult && (
                  <div className="text-xs space-y-2 border rounded-xl p-3 bg-slate-50">
                    <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <FolderSearch className="h-3.5 w-3.5" /> Quét thư mục APK
                      {scanning && <Loader2 className="h-3 w-3 animate-spin" />}
                      {isAdmin && !editingScanDir && (
                        <button
                          onClick={() => { setScanDirValue(scanResult.my_scan_dir || ''); setEditingScanDir(true); }}
                          className="ml-auto flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 cursor-pointer"
                          title="Chỉnh sửa thư mục quét APK của tôi">
                          <FolderCog className="h-3.5 w-3.5" /> Thư mục của tôi
                        </button>
                      )}
                    </div>

                    {editingScanDir ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-slate-600 font-medium">
                          Thư mục quét APK của <span className="text-blue-700">{currentUser.full_name || 'bạn'}</span> cho app này:
                        </p>
                        <textarea
                          value={scanDirValue}
                          onChange={(e) => setScanDirValue(e.target.value)}
                          rows={2}
                          placeholder={`Đường dẫn thư mục chứa file .apk trên máy của bạn\nVD: D:\\builds\\${selected.app_key}  (nhiều dòng = nhiều thư mục)`}
                          className="w-full px-2 py-1.5 border rounded-lg text-[11px] font-mono resize-y"
                        />
                        <p className="text-[10px] text-slate-400">
                          Cấu hình này lưu riêng theo từng nhân viên. Bỏ trống = dùng thư mục chung của app / mặc định ({selected.app_key}/dist…). Có thể nhập nhiều thư mục, mỗi dòng một đường dẫn.
                        </p>
                        <div className="flex items-center gap-2">
                          <button onClick={saveScanDir} disabled={savingScanDir}
                            className="h-7 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50">
                            {savingScanDir ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Lưu & quét lại
                          </button>
                          <button onClick={() => { setEditingScanDir(false); setScanDirValue(scanResult.my_scan_dir || ''); }}
                            className="h-7 px-2.5 border rounded-lg text-[11px] text-slate-600 hover:bg-white cursor-pointer">
                            Hủy
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {scanResult.my_scan_dir && (
                          <p className="text-blue-700 font-mono text-[10px] break-all flex items-start gap-1">
                            <Settings className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>Của tôi: {scanResult.my_scan_dir}</span>
                          </p>
                        )}
                        {scanResult.app_scan_dir && (
                          <p className="text-slate-500 font-mono text-[10px] break-all">
                            Chung (app): {scanResult.app_scan_dir}
                          </p>
                        )}
                        {scanResult.configured_dirs?.some((d) => !d.exists) && (
                          <p className="text-amber-700 text-[10px]">
                            ⚠ Một số thư mục cấu hình không tồn tại trên server.
                          </p>
                        )}
                        {scanResult.scan_dirs?.length ? (
                          <p className="text-slate-500 font-mono text-[10px] break-all">
                            {scanResult.scan_dirs.join(' · ')}
                          </p>
                        ) : (
                          <p className="text-slate-500">Chưa có thư mục (đặt APK trong <code className="bg-white px-1">{selected.app_key}/dist/</code> hoặc cấu hình đường dẫn riêng)</p>
                        )}
                      </>
                    )}
                    {scanResult.importable?.length > 0 && (
                      <ul className="space-y-1">
                        {scanResult.importable.map((f) => (
                          <li key={f.path} className="flex justify-between gap-2 bg-emerald-50 text-emerald-800 px-2 py-1 rounded">
                            <span className="truncate font-mono">{f.name}</span>
                            <span className="shrink-0 text-right">
                              v{f.version}{f.version_code != null ? ` · code ${f.version_code}` : ''}
                              <br />
                              <span className="text-emerald-700">{formatBytes(f.size)}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {scanResult.skipped?.length > 0 && (
                      <ul className="space-y-1">
                        {scanResult.skipped.map((f) => (
                          <li key={f.path} className="flex gap-2 text-red-700 bg-red-50 px-2 py-1 rounded">
                            <FileWarning className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span><span className="font-mono">{f.name}</span> — {f.reason}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {scanResult.already_imported?.length > 0 && (
                      <p className="text-slate-500">{scanResult.already_imported.length} file đã phát hành trước đó.</p>
                    )}
                  </div>
                )}

                {loadingReleases && releases.length === 0 ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
                ) : releases.length === 0 ? (
                  <div className="text-sm text-gray-400 p-6 border rounded-xl text-center">Chưa có phiên bản nào</div>
                ) : (
                  <div className={`space-y-2 transition-opacity ${loadingReleases ? 'opacity-60 pointer-events-none' : ''}`}>
                    {releases.map((rel) => (
                      <div
                        key={rel.id}
                        className={`p-3 rounded-xl border transition-colors ${
                          isLiveRelease(rel)
                            ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-mono font-bold text-sm ${isLiveRelease(rel) ? 'text-emerald-800' : 'text-gray-500'}`}>v{rel.version}</span>
                              {isLiveRelease(rel) && (
                                <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5">
                                  <Play className="h-3 w-3" /> Đang chạy
                                </span>
                              )}
                              {rel.version_code != null && (
                                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">code {rel.version_code}</span>
                              )}
                              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded uppercase">{rel.update_type}</span>
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{rel.channel}</span>
                              {rel.is_mandatory && (
                                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                  <ShieldAlert className="h-3 w-3" /> Bắt buộc
                                </span>
                              )}
                              {!rel.is_active && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">Đã tắt</span>}
                              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                                {rel.file_size ? formatBytes(rel.file_size) : '—'}
                              </span>
                            </div>
                            {rel.runtime_version && rel.update_type === 'jsbundle' && (
                              <p className="text-[11px] text-indigo-600 mt-0.5">runtime {rel.runtime_version}</p>
                            )}
                            <p className="text-xs text-slate-700 mt-1.5">
                              Dung lượng: <strong className="font-mono">{rel.file_size ? formatBytes(rel.file_size) : '—'}</strong>
                            </p>
                            {rel.release_notes && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{rel.release_notes}</p>}
                            <p className="text-[11px] text-gray-400 mt-1">
                              {rel.creator?.full_name || 'Admin'} · {formatDateVN(rel.created_at)}
                            </p>
                            {rel.sha256 && <p className="text-[10px] text-gray-300 font-mono truncate mt-0.5">sha256: {rel.sha256}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {(rel.file_url || rel.external_url || rel.storage_path) && (
                              <a
                                href={apkDownloadHref(rel)}
                                download={apkDownloadFilename(rel, selected.app_key)}
                                className="h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-gray-50 cursor-pointer"
                                title="Tải APK">
                                <Download className="h-4 w-4 text-gray-500" />
                              </a>
                            )}
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => publishRelease(rel)}
                                  disabled={runningReleaseId === rel.id || isLiveRelease(rel)}
                                  className={`h-8 px-2 flex items-center justify-center gap-1 rounded-lg border text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                                    isLiveRelease(rel)
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                      : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                  }`}
                                  title="Bắt buộc phát hành bản này (tắt bản cùng loại)">
                                  {runningReleaseId === rel.id
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Play className="h-3.5 w-3.5" />}
                                  <span className="hidden sm:inline">Chạy</span>
                                </button>
                                <button onClick={() => setEditingRelease(rel)}
                                  className="h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-gray-50 cursor-pointer"
                                  title="Sửa / upload lại file">
                                  <Pencil className="h-4 w-4 text-gray-500" />
                                </button>
                                <button onClick={() => toggleRelease(rel, 'is_active')}
                                  className="h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-gray-50 cursor-pointer"
                                  title={rel.is_active ? 'Tắt phát hành' : 'Bật phát hành'}>
                                  {rel.is_active ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-gray-400" />}
                                </button>
                                <button onClick={() => toggleRelease(rel, 'is_mandatory')}
                                  className="h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-gray-50 cursor-pointer"
                                  title={rel.is_mandatory ? 'Bỏ bắt buộc' : 'Đặt bắt buộc'}>
                                  {rel.is_mandatory ? <ShieldAlert className="h-4 w-4 text-red-500" /> : <ShieldCheck className="h-4 w-4 text-gray-400" />}
                                </button>
                                <button onClick={() => deleteRelease(rel)}
                                  className="h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-red-50 cursor-pointer" title="Xóa">
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-400 p-6 border rounded-xl text-center">Chọn một app để xem phiên bản</div>
            )}
          </div>
        </div>
      )}

      {showAppForm && (
        <AppForm
          onClose={() => setShowAppForm(false)}
          onSaved={(app) => {
            setShowAppForm(false);
            if (app) {
              const emptyStats = computeStorageStats([]);
              setApps((prev) => [...prev, { ...app, latest_release: null, storage_stats: emptyStats }]);
              setSelected({ ...app, latest_release: null, storage_stats: emptyStats });
            }
          }}
        />
      )}
      {showReleaseForm && selected && (
        <ReleaseForm
          app={selected}
          onClose={() => setShowReleaseForm(false)}
          onSaved={(rel) => {
            setShowReleaseForm(false);
            if (rel) mergeRelease(rel);
            scanFiles(selected.id, { silent: true });
          }}
        />
      )}
      {editingRelease && selected && (
        <ReleaseEditForm
          app={selected}
          release={editingRelease}
          onClose={() => setEditingRelease(null)}
          onSaved={(rel) => {
            setEditingRelease(null);
            if (rel) mergeRelease(rel);
          }}
          onReleaseUpdated={(rel) => {
            setEditingRelease(rel);
            mergeRelease(rel);
          }}
        />
      )}
    </div>
  );
}

function AppForm({ onClose, onSaved }) {
  const [form, setForm] = useState({ app_key: '', display_name: '', android_package: '', platform: 'android', apk_scan_dir: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.app_key.trim() || !form.display_name.trim()) return alert('Nhập app_key và tên hiển thị');
    setSaving(true);
    try {
      const { data } = await api.post('/app-updates/apps', form);
      onSaved(data);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  return (
    <Modal title="Thêm app mới" onClose={onClose}>
      <div className="space-y-4">
        <Field label="App key * (định danh duy nhất)">
          <input value={form.app_key} onChange={(e) => setForm((f) => ({ ...f, app_key: e.target.value }))}
            placeholder="vd: crm-mobile" className="w-full h-10 px-3 border rounded-lg text-sm font-mono" />
        </Field>
        <Field label="Tên hiển thị *">
          <input value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            placeholder="vd: TuBep CRM" className="w-full h-10 px-3 border rounded-lg text-sm" />
        </Field>
        <Field label="Android package">
          <input value={form.android_package} onChange={(e) => setForm((f) => ({ ...f, android_package: e.target.value }))}
            placeholder="vd: vn.tubeppro.crmobile" className="w-full h-10 px-3 border rounded-lg text-sm font-mono" />
        </Field>
        <Field label="Thư mục quét APK (tùy chọn)">
          <input value={form.apk_scan_dir} onChange={(e) => setForm((f) => ({ ...f, apk_scan_dir: e.target.value }))}
            placeholder="vd: D:\builds\my-app — bỏ trống = mặc định" className="w-full h-10 px-3 border rounded-lg text-sm font-mono" />
        </Field>
      </div>
      <FormFooter saving={saving} onClose={onClose} onSave={save} />
    </Modal>
  );
}

function ReleaseEditForm({ app, release, onClose, onSaved, onReleaseUpdated }) {
  const isOta = release.update_type === 'jsbundle';
  const hasStoredFile = isOta
    ? Boolean(release.manifest?.launchAsset?.url)
    : Boolean(release.file_url || release.external_url || release.storage_path);
  const [form, setForm] = useState({
    version: release.version || '',
    version_code: release.version_code != null ? String(release.version_code) : '',
    runtime_version: release.runtime_version || '',
    channel: release.channel || 'production',
    release_notes: release.release_notes || '',
    external_url: release.external_url || '',
    is_mandatory: release.is_mandatory,
    is_active: release.is_active,
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [removingFile, setRemovingFile] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef(null);

  const removeStoredFile = async () => {
    const kind = isOta ? 'bundle OTA trên bucket' : 'file APK trên bucket';
    if (!confirm(
      `Xóa ${kind} của phiên bản ${release.version}?\n\nBản ghi phiên bản vẫn giữ — chỉ gỡ file trên Supabase.`,
    )) return;
    setRemovingFile(true);
    try {
      const { data } = await api.delete(`/app-updates/releases/${release.id}/file`);
      const n = data?.storageFilesRemoved;
      alert(n ? `Đã xóa ${n} file trên bucket.` : 'Đã gỡ liên kết file.');
      if (data?.release) onReleaseUpdated?.(data.release);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa file');
    }
    setRemovingFile(false);
  };

  const save = async () => {
    if (!form.version.trim()) return alert('Nhập version');
    setSaving(true);
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append('version', form.version.trim());
      fd.append('channel', form.channel.trim() || 'production');
      fd.append('release_notes', form.release_notes);
      fd.append('is_mandatory', String(form.is_mandatory));
      fd.append('is_active', String(form.is_active));
      if (isOta) {
        fd.append('runtime_version', form.runtime_version.trim());
      } else {
        if (form.version_code !== '') fd.append('version_code', form.version_code);
        fd.append('external_url', form.external_url.trim());
      }
      if (file) fd.append('file', file);

      const { data } = await api.put(`/app-updates/releases/${release.id}`, fd, {
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      onSaved(data);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu');
    }
    setSaving(false);
  };

  return (
    <Modal title={`Sửa phiên bản v${release.version}`} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-4">
        Loại <span className="font-mono uppercase">{release.update_type}</span>
        — có thể upload lại file khác (file cũ trên bucket sẽ bị xóa).
      </p>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Version (hiển thị) *">
            <input value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
              className="w-full h-10 px-3 border rounded-lg text-sm font-mono" />
          </Field>
          {isOta ? (
            <Field label="Runtime version (expo-updates)">
              <input value={form.runtime_version} onChange={(e) => setForm((f) => ({ ...f, runtime_version: e.target.value }))}
                placeholder="vd: 1.0.0" className="w-full h-10 px-3 border rounded-lg text-sm font-mono" />
            </Field>
          ) : (
            <Field label="Version code">
              <input type="number" value={form.version_code}
                onChange={(e) => setForm((f) => ({ ...f, version_code: e.target.value }))}
                className="w-full h-10 px-3 border rounded-lg text-sm font-mono" />
            </Field>
          )}
        </div>

        <Field label="Kênh phát hành">
          <input value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
            placeholder="production" className="w-full h-10 px-3 border rounded-lg text-sm" />
        </Field>

        <Field label={isOta ? 'Bundle OTA hiện tại' : 'File APK hiện tại'}>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
            {hasStoredFile ? (
              <>
                <p className="text-xs text-gray-600 break-all font-mono leading-relaxed">
                  {isOta
                    ? release.manifest?.launchAsset?.url
                    : (release.file_url || release.external_url)}
                </p>
                {release.file_size ? (
                  <p className="text-[11px] text-gray-400">{formatBytes(release.file_size)}</p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href={isOta ? release.manifest?.launchAsset?.url : apkDownloadHref(release)}
                    download={isOta ? undefined : apkDownloadFilename(release, app.app_key)}
                    target={isOta ? '_blank' : undefined}
                    rel={isOta ? 'noreferrer' : undefined}
                    className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border bg-white text-xs font-medium text-blue-600 hover:bg-blue-50"
                  >
                    <Download className="h-3.5 w-3.5" /> Tải file
                  </a>
                  <button
                    type="button"
                    onClick={removeStoredFile}
                    disabled={removingFile || saving}
                    className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white text-xs font-medium text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-50"
                  >
                    {removingFile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Xóa file trên bucket
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500">Chưa có file trên bucket — upload file mới bên dưới.</p>
            )}
          </div>
        </Field>

        <Field label={isOta ? 'Upload lại bundle OTA (tuỳ chọn)' : 'Upload lại file APK (tuỳ chọn)'}>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="h-10 px-4 border rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50 cursor-pointer">
              <Upload className="h-4 w-4 text-gray-500" />
              {file ? 'Đổi file' : isOta ? 'Chọn bundle (.hbc/.bundle)' : 'Chọn .apk mới'}
            </button>
            <span className="text-xs text-gray-500 truncate max-w-[240px]">
              {file ? `${file.name} (${formatBytes(file.size)})` : 'Giữ nguyên file cũ'}
            </span>
            {file && (
              <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                className="text-xs text-red-600 hover:underline cursor-pointer">
                Bỏ chọn
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={isOta ? '.hbc,.bundle,.js,application/javascript' : '.apk,application/vnd.android.package-archive'}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setFile(f);
                if (f && !isOta) {
                  const p = parseFilenameClient(f.name);
                  if (p.ok) {
                    setForm((prev) => ({
                      ...prev,
                      version: p.version,
                      version_code: p.versionCode || prev.version_code,
                    }));
                  } else {
                    alert(p.error + '\nVí dụ: ' + app.app_key + '-1.0.0-code2-release.apk');
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }
                }
              }}
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            {isOta
              ? 'Chọn file bundle từ expo export (dist/_expo/static/js/android/*.hbc).'
              : 'Upload APK mới → xóa file cũ trên bucket, cập nhật sha256 & link tải.'}
          </p>
        </Field>

        {!isOta && (
          <Field label="External URL (APK host ngoài)">
            <input value={form.external_url} onChange={(e) => setForm((f) => ({ ...f, external_url: e.target.value }))}
              placeholder="https://..." className="w-full h-10 px-3 border rounded-lg text-sm" />
          </Field>
        )}

        <Field label="Ghi chú phát hành">
          <textarea value={form.release_notes} onChange={(e) => setForm((f) => ({ ...f, release_notes: e.target.value }))}
            rows={3} className="w-full px-3 py-2 border rounded-lg text-sm" />
        </Field>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.is_mandatory}
            onChange={(e) => setForm((f) => ({ ...f, is_mandatory: e.target.checked }))} className="rounded" />
          <ShieldAlert className="h-4 w-4 text-red-500" /> Bắt buộc cập nhật
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded" />
          <Eye className="h-4 w-4 text-emerald-600" /> Đang phát hành (active)
        </label>

        {saving && file && (
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className="bg-blue-500 h-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <FormFooter saving={saving} onClose={onClose} onSave={save} saveLabel="Lưu thay đổi" />
    </Modal>
  );
}

function ReleaseForm({ app, onClose, onSaved }) {
  const [form, setForm] = useState({
    version: '', version_code: '', channel: 'production', update_type: 'apk',
    is_mandatory: false, external_url: '', release_notes: '',
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef(null);

  const save = async () => {
    if (!form.version.trim()) return alert('Nhập version');
    if (!file && !form.external_url.trim()) return alert('Chọn file APK hoặc nhập external_url');
    setSaving(true);
    setProgress(0);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('file', file);
      const { data } = await api.post(`/app-updates/apps/${app.id}/releases`, fd, {
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      onSaved(data);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi phát hành'); }
    setSaving(false);
  };

  return (
    <Modal title={`Phát hành phiên bản — ${app.display_name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Version * (hiển thị)">
            <input value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
              placeholder="vd: 1.3.36" className="w-full h-10 px-3 border rounded-lg text-sm font-mono" />
          </Field>
          <Field label="Version code (số, so sánh)">
            <input type="number" value={form.version_code} onChange={(e) => setForm((f) => ({ ...f, version_code: e.target.value }))}
              placeholder="vd: 52" className="w-full h-10 px-3 border rounded-lg text-sm font-mono" />
          </Field>
        </div>

        <Field label="File APK">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="h-10 px-4 border rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50 cursor-pointer">
              <Upload className="h-4 w-4 text-gray-500" /> {file ? 'Đổi file' : 'Chọn .apk'}
            </button>
            <span className="text-xs text-gray-500 truncate">{file ? `${file.name} (${formatBytes(file.size)})` : 'Chưa chọn'}</span>
            <input ref={fileRef} type="file" accept=".apk,application/vnd.android.package-archive" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setFile(f);
                if (f) {
                  const p = parseFilenameClient(f.name);
                  if (p.ok) {
                    setForm((prev) => ({
                      ...prev,
                      version: p.version,
                      version_code: p.versionCode || prev.version_code,
                    }));
                  } else {
                    alert(p.error + '\nVí dụ: ' + app.app_key + '-1.0.0-code2-release.apk');
                  }
                }
              }} />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Tên file phải có số phiên bản — hệ thống tự điền version khi chọn file.</p>
        </Field>

        <Field label="Hoặc external URL (APK lớn host ngoài: Drive/GitHub)">
          <input value={form.external_url} onChange={(e) => setForm((f) => ({ ...f, external_url: e.target.value }))}
            placeholder="https://..." className="w-full h-10 px-3 border rounded-lg text-sm" />
        </Field>

        <Field label="Ghi chú phát hành">
          <textarea value={form.release_notes} onChange={(e) => setForm((f) => ({ ...f, release_notes: e.target.value }))}
            rows={3} placeholder="Có gì mới trong bản này..." className="w-full px-3 py-2 border rounded-lg text-sm" />
        </Field>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.is_mandatory} onChange={(e) => setForm((f) => ({ ...f, is_mandatory: e.target.checked }))} className="rounded" />
          <ShieldAlert className="h-4 w-4 text-red-500" /> Bắt buộc cập nhật (chặn dùng app cho tới khi cập nhật)
        </label>

        {saving && file && (
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className="bg-blue-500 h-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <FormFooter saving={saving} onClose={onClose} onSave={save} saveLabel="Phát hành" />
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><X className="h-5 w-5 text-gray-500" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
      {children}
    </div>
  );
}

function FormFooter({ saving, onClose, onSave, saveLabel = 'Lưu' }) {
  return (
    <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
      <button onClick={onClose} className="h-9 px-4 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium cursor-pointer">Hủy</button>
      <button onClick={onSave} disabled={saving}
        className="h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold cursor-pointer disabled:opacity-50 flex items-center gap-2">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} {saveLabel}
      </button>
    </div>
  );
}
