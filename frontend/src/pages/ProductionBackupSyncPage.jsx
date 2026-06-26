import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { isSupabaseMonitorUnlocked } from '../lib/supabaseMonitorAuth';
import SupabaseMonitorGate from '../components/SupabaseMonitorGate';
import {
  Database, RefreshCw, Settings, Play, Loader2, CheckCircle2,
  AlertTriangle, Clock, ArrowLeft, Server, Activity, HardDrive, Globe,
} from 'lucide-react';

function fmtDt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN');
  } catch {
    return iso;
  }
}

function StatusBadge({ ok, label }) {
  const cls = ok
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : 'bg-red-100 text-red-800 border-red-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {label}
    </span>
  );
}

function OverallBadge({ status }) {
  const map = {
    healthy: { ok: true, label: 'Bình thường', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    warning: { ok: false, label: 'Cảnh báo', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
    degraded: { ok: false, label: 'Suy giảm', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
    down: { ok: false, label: 'Down', cls: 'bg-red-100 text-red-800 border-red-200' },
    not_configured: { ok: false, label: 'Chưa cấu hình', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    on_backup: { ok: true, label: 'Đang dùng Backup', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
    failover_ready: { ok: false, label: 'Primary down — sẵn sàng failover', cls: 'bg-orange-100 text-orange-800 border-orange-200' },
    critical: { ok: false, label: 'Nghiêm trọng', cls: 'bg-red-100 text-red-800 border-red-200' },
  };
  const m = map[status] || { ok: false, label: status || '?', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${m.cls}`}>
      {m.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      {m.label}
    </span>
  );
}

function fmtBytes(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const gb = n / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = n / (1024 ** 2);
  return `${mb.toFixed(1)} MB`;
}

function CheckRow({ name, check }) {
  if (!check) return null;
  const ok = check.ok === true;
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
      <span className="text-slate-600">{name}</span>
      <span className="flex items-center gap-2">
        {check.latency_ms != null && <span className="text-xs text-slate-400">{check.latency_ms}ms</span>}
        {ok ? (
          <span className="text-emerald-600 font-medium">OK</span>
        ) : (
          <span className="text-red-600 text-xs max-w-[180px] truncate" title={check.error}>{check.error || 'Lỗi'}</span>
        )}
      </span>
    </div>
  );
}

function InstanceMonitorCard({ instance, isActive }) {
  if (!instance) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
        <h3 className="font-semibold text-slate-500">—</h3>
        <p className="text-sm text-slate-400 mt-2">Chưa tải được dữ liệu giám sát</p>
      </div>
    );
  }
  if (!instance.configured) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
        <h3 className="font-semibold text-slate-500 capitalize">
          {instance.label === 'primary' ? 'Primary (Chính)' : instance.label === 'backup' ? 'Backup (Dự phòng)' : instance.label}
        </h3>
        <p className="text-sm text-slate-400 mt-2">Chưa cấu hình env trên server</p>
        <p className="text-xs text-slate-400 mt-1">
          {instance.label === 'backup'
            ? 'Cần SUPABASE_BACKUP_URL + SUPABASE_BACKUP_SERVICE_ROLE_KEY (+ DB URL)'
            : 'Cần SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ SUPABASE_DB_URL)'}
        </p>
      </div>
    );
  }
  const c = instance.checks || {};
  return (
    <div className={`rounded-xl border bg-white p-5 shadow-sm ${isActive ? 'border-teal-400 ring-2 ring-teal-100' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold text-slate-900 capitalize flex items-center gap-2">
            {instance.label === 'primary' ? 'Primary (Chính)' : 'Backup (Dự phòng)'}
            {isActive && (
              <span className="text-xs bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full">Đang dùng</span>
            )}
          </h3>
          <p className="text-xs font-mono text-slate-500 mt-0.5">{instance.project_ref || '—'}</p>
        </div>
        <OverallBadge status={instance.overall} />
      </div>
      <p className="text-xs text-slate-400 truncate mb-3" title={instance.url}>{instance.url}</p>
      <CheckRow name="Auth API" check={c.auth} />
      <CheckRow name="REST API" check={c.rest} />
      <CheckRow name="PostgreSQL" check={c.db} />
      <CheckRow name="Storage" check={c.storage} />
      {c.db?.table_count != null && (
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-500">
          <div>Bảng public: <strong className="text-slate-700">{c.db.table_count}</strong></div>
          <div>Dung lượng DB: <strong className="text-slate-700">{fmtBytes(c.db.db_size_bytes)}</strong></div>
          {c.storage?.bucket_count != null && (
            <div>Storage buckets: <strong className="text-slate-700">{c.storage.bucket_count}</strong></div>
          )}
          {c.db?.postgres_version && (
            <div className="col-span-2 truncate" title={c.db.postgres_version}>PG: {c.db.postgres_version}</div>
          )}
        </div>
      )}
      <p className="text-xs text-slate-400 mt-3">Kiểm tra: {fmtDt(instance.checked_at)}</p>
    </div>
  );
}

function ProductionBackupSyncContent() {
  const [tab, setTab] = useState('monitor');
  const [status, setStatus] = useState(null);
  const [monitor, setMonitor] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [monitorError, setMonitorError] = useState('');

  const [form, setForm] = useState({
    schedule_enabled: false,
    interval_hours: 24,
    include_db: true,
    include_storage: true,
    verify_after_sync: true,
  });

  const loadMonitor = useCallback(async (silent = false) => {
    if (!silent) setMonitorLoading(true);
    try {
      const { data } = await api.get('/production/backup-sync/monitor');
      setMonitor(data);
      setMonitorError('');
    } catch (e) {
      console.error(e);
      const code = e.response?.data?.code;
      const msg = e.response?.data?.error || e.message;
      setMonitorError(
        code === 'MONITOR_LOCKED'
          ? 'Phiên giám sát hết hạn — nhập lại mật khẩu (140883).'
          : `Không tải được giám sát: ${msg}`,
      );
    }
    if (!silent) setMonitorLoading(false);
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/production/backup-sync/status');
      setStatus(data);
      if (data?.settings) {
        setSettings(data.settings);
        setForm({
          schedule_enabled: !!data.settings.schedule_enabled,
          interval_hours: data.settings.interval_hours ?? 24,
          include_db: data.settings.include_db !== false,
          include_storage: data.settings.include_storage !== false,
          verify_after_sync: data.settings.verify_after_sync !== false,
        });
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void loadMonitor();
    const poll = setInterval(() => {
      if (tab === 'monitor') void loadMonitor(true);
      if (status?.job?.running) void load();
    }, 15000);
    return () => clearInterval(poll);
  }, [load, loadMonitor, tab, status?.job?.running]);

  useEffect(() => {
    if (tab !== 'monitor') return;
    void loadMonitor(true);
  }, [tab, loadMonitor]);

  const runVerify = async () => {
    setVerifyLoading(true);
    try {
      const { data } = await api.post('/production/backup-sync/verify');
      setVerifyResult(data);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
    setVerifyLoading(false);
  };

  const runSync = async () => {
    if (!window.confirm('Chạy đồng bộ primary → backup? Có thể mất vài phút.')) return;
    setRunLoading(true);
    try {
      await api.post('/production/backup-sync/run', {
        include_db: form.include_db,
        include_storage: form.include_storage,
        verify_after_sync: form.verify_after_sync,
        async: true,
      });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
    setRunLoading(false);
  };

  const saveSettingsForm = async () => {
    setSaveLoading(true);
    try {
      const { data } = await api.put('/production/backup-sync/settings', form);
      setSettings(data);
      alert('Đã lưu lịch đồng bộ.');
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
    setSaveLoading(false);
  };

  const supa = status?.supabase;
  const primaryOk = supa?.primary?.healthy === true;
  const backupOk = supa?.backup?.healthy === true;
  const activeTarget = supa?.active_target || supa?.active || 'primary';
  const verifyRows = verifyResult?.rows || settings?.last_verify_rows || [];
  const jobRunning = status?.job?.running;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="text-slate-500 hover:text-slate-800">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-6 h-6 text-teal-700" />
            Backup Supabase — Giám sát &amp; đồng bộ
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Giám sát primary/backup, kiểm tra drift, lịch clone, chạy đồng bộ
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('monitor')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'monitor' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500'}`}
        >
          Giám sát
        </button>
        <button
          type="button"
          onClick={() => setTab('check')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'check' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500'}`}
        >
          Kiểm tra drift
        </button>
        <button
          type="button"
          onClick={() => setTab('schedule')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'schedule' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500'}`}
        >
          Lịch đồng bộ
        </button>
      </div>

      {loading && !status ? (
        <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Đang tải…
        </div>
      ) : (
        <>
          {tab === 'monitor' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Tổng thể hệ thống</div>
                  <OverallBadge status={monitor?.system_overall} />
                  <p className="text-xs text-slate-400 mt-2">
                    Cập nhật: {fmtDt(monitor?.checked_at)} · Tự refresh 15s
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loadMonitor()}
                  disabled={monitorLoading}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-medium disabled:opacity-50"
                >
                  {monitorLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Làm mới
                </button>
              </div>

              {monitorError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {monitorError}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <InstanceMonitorCard
                  instance={monitor?.instances?.primary}
                  isActive={monitor?.active_target === 'primary'}
                />
                <InstanceMonitorCard
                  instance={monitor?.instances?.backup}
                  isActive={monitor?.active_target === 'backup'}
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Failover &amp; Replication
                </h2>
                <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">Failover</div>
                    <div className="font-medium mt-1">{monitor?.failover_enabled ? 'Bật' : 'Tắt'}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">Lần failover</div>
                    <div className="font-medium mt-1">{monitor?.failover_count ?? 0}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">Replication queue</div>
                    <div className="font-medium mt-1">{monitor?.replication?.queue_depth ?? 0}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">Failback pending</div>
                    <div className="font-medium mt-1">{monitor?.failback?.pending ?? 0}</div>
                  </div>
                </div>
                {monitor?.last_failover_at && (
                  <p className="text-xs text-slate-500 mt-3">
                    Failover gần nhất: {fmtDt(monitor.last_failover_at)}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> Replication: {monitor?.env?.replication_enabled ? (monitor.env.replication_light ? 'Nhẹ' : 'Bật') : 'Tắt'}</span>
                  <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> PG pool: {monitor?.env?.pg_pool}</span>
                  {monitor?.replication?.last_error && (
                    <span className="text-red-600">Rep lỗi: {monitor.replication.last_error}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'check' && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Primary</div>
                  <StatusBadge ok={primaryOk} label={primaryOk ? 'Healthy' : 'Unhealthy'} />
                  <div className="text-xs text-slate-400 mt-2">{supa?.primary?.latency_ms != null ? `${supa.primary.latency_ms}ms` : ''}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Backup</div>
                  <StatusBadge ok={backupOk} label={backupOk ? 'Healthy' : 'Chưa cấu hình / lỗi'} />
                  <div className="text-xs text-slate-400 mt-2">{supa?.backup?.latency_ms != null ? `${supa.backup.latency_ms}ms` : ''}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Đang dùng</div>
                  <div className="font-semibold text-slate-800 flex items-center gap-1">
                    <Server className="w-4 h-4" />
                    {activeTarget === 'backup' ? 'Backup' : 'Primary'}
                  </div>
                  <div className="text-xs text-slate-400 mt-2">
                    Failover: {supa?.failover_enabled ? 'Bật' : 'Tắt'}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h2 className="font-semibold text-slate-800">So sánh số dòng DB</h2>
                  <button
                    type="button"
                    onClick={runVerify}
                    disabled={verifyLoading || jobRunning}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-medium disabled:opacity-50"
                  >
                    {verifyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Kiểm tra ngay
                  </button>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Lần kiểm tra cuối: {fmtDt(settings?.last_verify_at || verifyResult?.checked_at)}
                </p>
                {verifyRows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b">
                          <th className="py-2 pr-4">Bảng</th>
                          <th className="py-2 pr-4">Primary</th>
                          <th className="py-2 pr-4">Backup</th>
                          <th className="py-2 pr-4">Drift</th>
                          <th className="py-2">OK</th>
                        </tr>
                      </thead>
                      <tbody>
                        {verifyRows.map((r) => (
                          <tr key={r.table} className="border-b border-slate-100">
                            <td className="py-2 font-mono text-xs">{r.table}</td>
                            <td className="py-2">{r.primary ?? '—'}</td>
                            <td className="py-2">{r.backup ?? '—'}</td>
                            <td className={`py-2 ${r.drift !== 0 ? 'text-amber-700 font-medium' : ''}`}>{r.drift ?? '—'}</td>
                            <td className="py-2">{r.ok ? '✓' : r.error ? `✗ ${r.error}` : '✗'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Chưa có kết quả — bấm &quot;Kiểm tra ngay&quot;.</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-sm space-y-2">
                <h2 className="font-semibold text-slate-800 mb-2">Replication / Failback</h2>
                <div className="grid md:grid-cols-2 gap-2 text-slate-600">
                  <div>Queue replication: <strong>{status?.replication?.queue_depth ?? 0}</strong></div>
                  <div>Failback pending: <strong>{status?.failback?.pending ?? 0}</strong></div>
                  <div>Replication: {status?.replication?.enabled ? 'Bật' : 'Tắt'}</div>
                  <div>Lần sync cuối: {fmtDt(settings?.last_run_at)} ({settings?.last_run_status || '—'})</div>
                </div>
              </div>

              {jobRunning && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 text-amber-800 font-medium">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang đồng bộ…
                  </div>
                  <pre className="mt-2 text-xs text-amber-900/80 max-h-40 overflow-auto whitespace-pre-wrap">
                    {(status?.job?.log || []).map((l) => l.line).join('\n')}
                  </pre>
                </div>
              )}

              {settings?.last_run_error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  Lỗi lần chạy trước: {settings.last_run_error}
                </div>
              )}
            </div>
          )}

          {tab === 'schedule' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Cấu hình lịch tự động
                </h2>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.schedule_enabled}
                    onChange={(e) => setForm((f) => ({ ...f, schedule_enabled: e.target.checked }))}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm">Bật đồng bộ tự động theo lịch</span>
                </label>

                <div>
                  <label className="block text-sm text-slate-600 mb-1">Chu kỳ (giờ)</label>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={form.interval_hours}
                    onChange={(e) => setForm((f) => ({ ...f, interval_hours: parseInt(e.target.value, 10) || 24 }))}
                    className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-slate-400 mt-1">1–168 giờ (mặc định 24h = 1 lần/ngày)</p>
                </div>

                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.include_db} onChange={(e) => setForm((f) => ({ ...f, include_db: e.target.checked }))} />
                    Clone database
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.include_storage} onChange={(e) => setForm((f) => ({ ...f, include_storage: e.target.checked }))} />
                    Đồng bộ Storage
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.verify_after_sync} onChange={(e) => setForm((f) => ({ ...f, verify_after_sync: e.target.checked }))} />
                    Kiểm tra sau sync
                  </label>
                </div>

                {settings?.next_run_at && form.schedule_enabled && (
                  <p className="text-sm text-slate-500 flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    Lần chạy tiếp theo: {fmtDt(settings.next_run_at)}
                  </p>
                )}

                <button
                  type="button"
                  onClick={saveSettingsForm}
                  disabled={saveLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
                >
                  {saveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Lưu cấu hình
                </button>
              </div>

              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-5 shadow-sm">
                <h2 className="font-semibold text-slate-800 mb-2">Chạy đồng bộ ngay</h2>
                <p className="text-sm text-slate-600 mb-4">
                  Clone DB + Storage từ primary sang backup. Job chạy nền — có thể mất vài phút đến vài chục phút.
                </p>
                <button
                  type="button"
                  onClick={runSync}
                  disabled={runLoading || jobRunning}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 disabled:opacity-50"
                >
                  {runLoading || jobRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                  {jobRunning ? 'Đang chạy…' : 'Chạy đồng bộ ngay'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ProductionBackupSyncPage() {
  return (
    <SupabaseMonitorGate>
      <ProductionBackupSyncContent />
    </SupabaseMonitorGate>
  );
}
