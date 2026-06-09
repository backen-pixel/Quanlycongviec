import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import {
  Smartphone, Plus, Upload, Trash2, Eye, EyeOff, ShieldAlert, ShieldCheck,
  Loader2, X, Package, Download, RefreshCw, ChevronRight, FolderSearch, FileWarning,
} from 'lucide-react';

/** Đọc version / versionCode từ tên file APK (khớp quy tắc backend). */
function parseFilenameClient(name) {
  if (!name || !/\.apk$/i.test(name)) return { ok: false, error: 'File phải là .apk' };
  const base = name.replace(/\.apk$/i, '');
  const verMatch = base.match(/(\d+\.\d+(?:\.\d+)?(?:\.\d+)?)/);
  if (!verMatch) return { ok: false, error: 'Tên file phải chứa số phiên bản (vd: 1.0.0)' };
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

function formatDateVN(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function AppUpdatesPage() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [releases, setReleases] = useState([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [showAppForm, setShowAppForm] = useState(false);
  const [showReleaseForm, setShowReleaseForm] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filenameRule, setFilenameRule] = useState('');

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = ['admin', 'sales_admin'].includes(currentUser.role);

  const loadApps = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/app-updates/apps');
      setApps(data.apps || []);
      if (!selected && data.apps?.length) setSelected(data.apps[0]);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadReleases = async (appId) => {
    if (!appId) return;
    setLoadingReleases(true);
    try {
      const { data } = await api.get(`/app-updates/apps/${appId}/releases`);
      setReleases(data.releases || []);
    } catch (e) { console.error(e); }
    setLoadingReleases(false);
  };

  const scanFiles = async (appId) => {
    if (!appId) return;
    setScanning(true);
    try {
      const { data } = await api.get(`/app-updates/apps/${appId}/scan-files`);
      setScanResult(data);
    } catch (e) {
      console.error(e);
      setScanResult(null);
    }
    setScanning(false);
  };

  const importScanned = async () => {
    if (!selected?.id || !scanResult?.importable?.length) return;
    setImporting(true);
    try {
      const { data } = await api.post(`/app-updates/apps/${selected.id}/scan-import`, {});
      const n = (data.imported || []).length;
      const f = (data.failed || []).length;
      alert(
        n > 0
          ? `Đã import ${n} bản phát hành.${f ? ` ${f} file lỗi.` : ''}`
          : data.message || 'Không có file mới để import',
      );
      await loadReleases(selected.id);
      await loadApps();
      await scanFiles(selected.id);
    } catch (e) {
      alert(e.response?.data?.error || 'Import thất bại');
    }
    setImporting(false);
  };

  useEffect(() => {
    loadApps();
    api.get('/app-updates/filename-rule').then((r) => setFilenameRule(r.data?.rule || '')).catch(() => {});
  }, []);
  useEffect(() => {
    if (selected) {
      loadReleases(selected.id);
      scanFiles(selected.id);
    }
  }, [selected?.id]);

  const toggleRelease = async (rel, field) => {
    try {
      await api.put(`/app-updates/releases/${rel.id}`, { [field]: !rel[field] });
      loadReleases(selected.id);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteRelease = async (rel) => {
    if (!confirm(
      `Xóa phiên bản ${rel.version}?\n\nBản ghi database và file trên bucket Supabase sẽ bị xóa.\nFile APK local trên server (uploads) không bị xóa.`,
    )) return;
    try {
      const { data } = await api.delete(`/app-updates/releases/${rel.id}`);
      const n = data?.storageFilesRemoved;
      if (n) alert(`Đã xóa phiên bản ${rel.version} (${n} file trên bucket).`);
      loadReleases(selected.id);
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

      {loading ? (
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
                  {app.latest_release && (
                    <div className="text-[11px] text-emerald-600 font-mono mt-0.5">v{app.latest_release.version}</div>
                  )}
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
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { loadReleases(selected.id); scanFiles(selected.id); }}
                      className="h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-gray-50 cursor-pointer" title="Tải lại">
                      <RefreshCw className={`h-4 w-4 text-gray-500 ${scanning ? 'animate-spin' : ''}`} />
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
                    </div>
                    {scanResult.scan_dirs?.length ? (
                      <p className="text-slate-500 font-mono text-[10px] break-all">
                        {scanResult.scan_dirs.join(' · ')}
                      </p>
                    ) : (
                      <p className="text-slate-500">Chưa có thư mục (đặt APK trong <code className="bg-white px-1">{selected.app_key}/dist/</code>)</p>
                    )}
                    {scanResult.importable?.length > 0 && (
                      <ul className="space-y-1">
                        {scanResult.importable.map((f) => (
                          <li key={f.path} className="flex justify-between gap-2 bg-emerald-50 text-emerald-800 px-2 py-1 rounded">
                            <span className="truncate font-mono">{f.name}</span>
                            <span>v{f.version}{f.version_code != null ? ` · code ${f.version_code}` : ''}</span>
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

                {loadingReleases ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
                ) : releases.length === 0 ? (
                  <div className="text-sm text-gray-400 p-6 border rounded-xl text-center">Chưa có phiên bản nào</div>
                ) : (
                  <div className="space-y-2">
                    {releases.map((rel) => (
                      <div key={rel.id} className={`p-3 rounded-xl border bg-white ${rel.is_active ? '' : 'opacity-60'}`}>
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-sm text-gray-900">v{rel.version}</span>
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
                            </div>
                            {rel.release_notes && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{rel.release_notes}</p>}
                            <p className="text-[11px] text-gray-400 mt-1">
                              {formatBytes(rel.file_size)} · {rel.creator?.full_name || 'Admin'} · {formatDateVN(rel.created_at)}
                            </p>
                            {rel.sha256 && <p className="text-[10px] text-gray-300 font-mono truncate mt-0.5">sha256: {rel.sha256}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {(rel.file_url || rel.external_url) && (
                              <a href={rel.external_url || rel.file_url} target="_blank" rel="noreferrer"
                                className="h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-gray-50 cursor-pointer" title="Tải file">
                                <Download className="h-4 w-4 text-gray-500" />
                              </a>
                            )}
                            {isAdmin && (
                              <>
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
        <AppForm onClose={() => setShowAppForm(false)} onSaved={() => { setShowAppForm(false); loadApps(); }} />
      )}
      {showReleaseForm && selected && (
        <ReleaseForm app={selected}
          onClose={() => setShowReleaseForm(false)}
          onSaved={() => { setShowReleaseForm(false); loadReleases(selected.id); loadApps(); }} />
      )}
    </div>
  );
}

function AppForm({ onClose, onSaved }) {
  const [form, setForm] = useState({ app_key: '', display_name: '', android_package: '', platform: 'android' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.app_key.trim() || !form.display_name.trim()) return alert('Nhập app_key và tên hiển thị');
    setSaving(true);
    try {
      await api.post('/app-updates/apps', form);
      onSaved();
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
      </div>
      <FormFooter saving={saving} onClose={onClose} onSave={save} />
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
      await api.post(`/app-updates/apps/${app.id}/releases`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      onSaved();
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
