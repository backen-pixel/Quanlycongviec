import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { logClick } from '../lib/activityLogger';
import { sendDevicePing } from '../lib/deviceHeartbeat';
import SupabaseMonitorGate from '../components/SupabaseMonitorGate';
import SupabaseSwitchPanel from '../components/SupabaseSwitchPanel';
import {
  Database, RefreshCw, Settings, Play, Loader2, CheckCircle2,
  AlertTriangle, Clock, ArrowLeft, Server, Activity, HardDrive, Globe, Users, BarChart3, ClipboardList, ScrollText, History,
} from 'lucide-react';

const TAB_LABELS = {
  monitor: 'Giám sát',
  check: 'Kiểm tra drift',
  schedule: 'Lịch đồng bộ',
  usage: 'Phân tích sử dụng',
  audit: 'Nhật ký truy cập',
  'update-log': 'Cập nhật log',
  history: 'Lịch sử đồng bộ',
};

function fmtDurationMs(startIso, endIso) {
  if (!startIso || !endIso) return '—';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function fmtTriggeredBy(value) {
  if (!value) return '—';
  if (value === 'cron') return 'Lịch tự động';
  if (value === 'bootstrap') return 'Hệ thống';
  if (String(value).startsWith('switch:')) return 'Chuyển DB';
  return String(value);
}

function fmtDt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN');
  } catch {
    return iso;
  }
}

function SyncRunStatusBadge({ status }) {
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3" />
        Thành công
      </span>
    );
  }
  if (status === 'success_with_warnings') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900 border border-amber-200">
        <AlertTriangle className="w-3 h-3" />
        Xong (còn lệch nhẹ)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
      <AlertTriangle className="w-3 h-3" />
      Lỗi
    </span>
  );
}

function verifyRowsLookStale(rows, checkedAt) {
  if (!rows?.length) return true;
  if (rows.some((r) => /ENETUNREACH|ipv6_unreachable/i.test(String(r.error || '')))) return true;
  if (!checkedAt) return true;
  return Date.now() - new Date(checkedAt).getTime() > 30 * 60 * 1000;
}

function fmtAuditDevice(row) {
  const name = row.device?.name || row.metadata?.device_name;
  const id = row.device?.id || row.metadata?.device_id;
  if (name && id && name !== id) return name;
  return name || id || '—';
}

function fmtAuditLocation(row) {
  const loc = row.location;
  const lat = loc?.lat ?? row.metadata?.geo_lat;
  const lng = loc?.lng ?? row.metadata?.geo_lng;
  const address = loc?.address || row.metadata?.geo_address;
  if (address) return address;
  if (lat != null && lng != null) {
    return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
  }
  return '—';
}

function auditLocationMapUrl(row) {
  const loc = row.location;
  const lat = loc?.lat ?? row.metadata?.geo_lat;
  const lng = loc?.lng ?? row.metadata?.geo_lng;
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${Number(lat)},${Number(lng)}`;
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

function formatCheckError(check, label) {
  if (!check?.error) return 'Lỗi';
  if (check.error === 'not_configured') {
    return label === 'backup'
      ? 'Chưa cấu hình SUPABASE_BACKUP_DB_URL'
      : 'Chưa cấu hình SUPABASE_DB_URL';
  }
  if (check.error === 'auth_backoff') {
    return 'Tạm dừng PG (sai mật khẩu) — kiểm tra DB URL trên Render';
  }
  if (check.error === 'password_auth_failed') {
    return check.error_detail || 'Sai mật khẩu DB — cập nhật SUPABASE_DB_URL trên Render';
  }
  if (check.error === 'circuit_breaker') {
    return check.error_detail || 'Supabase tạm khóa kết nối — thử lại sau';
  }
  if (check.error === 'connect_failed' && check.error_detail) {
    return check.error_detail;
  }
  if (check.skipped && check.mode === 'rest_only') {
    return 'Bỏ qua (PG_POOL_DISABLED)';
  }
  return check.error;
}

function CheckRow({ name, check, instanceLabel }) {
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
          <span className="text-red-600 text-xs max-w-[220px] truncate" title={check.error}>
            {formatCheckError(check, instanceLabel)}
          </span>
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
      <CheckRow name="Auth API" check={c.auth} instanceLabel={instance.label} />
      <CheckRow name="REST API" check={c.rest} instanceLabel={instance.label} />
      <CheckRow name="PostgreSQL" check={c.db} instanceLabel={instance.label} />
      <CheckRow name="Storage" check={c.storage} instanceLabel={instance.label} />
      {(c.db?.table_count != null || c.storage?.buckets?.length > 0) && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-3 text-xs text-slate-500">
          {c.db?.table_count != null && (
            <div className="grid grid-cols-2 gap-2">
              <div>Bảng public: <strong className="text-slate-700">{c.db.table_count}</strong></div>
              <div>Dung lượng DB: <strong className="text-slate-700">{fmtBytes(c.db.db_size_bytes)}</strong></div>
              {c.db?.postgres_version && (
                <div className="col-span-2 truncate" title={c.db.postgres_version}>PG: {c.db.postgres_version}</div>
              )}
            </div>
          )}
          {c.storage?.buckets?.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-slate-600 flex items-center gap-1">
                  <HardDrive className="w-3 h-3" />
                  Dung lượng bucket
                </span>
                {c.storage.total_size_bytes != null && (
                  <span className="text-slate-700 font-semibold">
                    Tổng {fmtBytes(c.storage.total_size_bytes)}
                    {c.storage.total_object_count != null && (
                      <span className="text-slate-400 font-normal"> · {c.storage.total_object_count.toLocaleString('vi-VN')} file</span>
                    )}
                  </span>
                )}
              </div>
              <ul className="rounded-lg border border-slate-100 divide-y divide-slate-100 overflow-hidden">
                {c.storage.buckets.map((b) => (
                  <li key={b.name} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-slate-50/50">
                    <span className="font-mono text-slate-800 truncate" title={b.name}>{b.name}</span>
                    <span className="shrink-0 text-right tabular-nums">
                      {b.error ? (
                        <span className="text-red-600" title={b.error}>Lỗi</span>
                      ) : (
                        <>
                          <strong className="text-slate-700">{fmtBytes(b.size_bytes)}</strong>
                          {b.object_count != null && (
                            <span className="text-slate-400 ml-1">({b.object_count.toLocaleString('vi-VN')} file)</span>
                          )}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {c.storage.stats_source && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Nguồn: {c.storage.stats_source === 'postgres' ? 'PostgreSQL storage.objects' : 'Storage API (bucket đồng bộ)'}
                </p>
              )}
            </div>
          )}
          {!c.storage?.buckets?.length && c.storage?.bucket_count != null && (
            <div>Storage buckets: <strong className="text-slate-700">{c.storage.bucket_count}</strong></div>
          )}
        </div>
      )}
      <p className="text-xs text-slate-400 mt-3">Kiểm tra: {fmtDt(instance.checked_at)}</p>
    </div>
  );
}

function fmtSlotLabel(slot) {
  if (!slot) return '—';
  const label = `${String(slot.h).padStart(2, '0')}:${String(slot.m).padStart(2, '0')}`;
  if (slot.h === 5 && slot.m === 0) return `${label} sáng`;
  if (slot.h === 12 && slot.m === 30) return `${label} trưa`;
  if (slot.h === 18 && slot.m === 0) return `${label} chiều`;
  return label;
}

function slotToTimeValue(slot) {
  return `${String(slot.h).padStart(2, '0')}:${String(slot.m).padStart(2, '0')}`;
}

function timeValueToSlot(value) {
  const [hh, mm] = String(value || '0:0').split(':');
  return { h: parseInt(hh, 10) || 0, m: parseInt(mm, 10) || 0 };
}

const DEFAULT_SYNC_SLOTS = [
  { h: 5, m: 0 },
  { h: 12, m: 30 },
  { h: 18, m: 0 },
];

const DEFAULT_USAGE_FILTERS = {
  user_id: '',
  department_id: '',
  module: '',
  action_type: '',
  weekday: '',
  hour_from: '',
  hour_to: '',
  min_importance: '1',
};

const ACTION_TYPE_LABELS = {
  view: 'Xem trang',
  filter: 'Lọc',
  search: 'Tìm kiếm',
  sort: 'Sắp xếp',
  navigate: 'Điều hướng',
  click: 'Click',
  create: 'Tạo mới',
  update: 'Cập nhật',
  delete: 'Xóa',
  export: 'Xuất file',
  open_modal: 'Mở modal',
  submit_form: 'Gửi form',
  chat_open: 'Mở chat',
  chat_send: 'Gửi tin nhắn',
};

function usageFilterParams(days, filters) {
  const p = { days };
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== '') p[k] = v;
  }
  return p;
}

function hasActiveUsageFilters(filters) {
  return Object.entries(filters).some(([k, v]) => k !== 'min_importance' && v !== '' && v != null)
    || filters.min_importance !== '1';
}

function UpdateLogStatusBadge({ applied, error }) {
  if (error) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
        Lỗi
      </span>
    );
  }
  if (applied) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
        Đã replay
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
      Chờ replay
    </span>
  );
}

function UpdateLogPanel({ title, direction, description, enabled, statsLine, pendingCount, error, loading, items, showApplied }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div>
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-teal-700" />
          {title}
        </h3>
        <p className="text-xs text-teal-700 font-medium mt-0.5">{direction}</p>
        <p className="text-xs text-slate-500 mt-1">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className={`px-2 py-1 rounded-md ${enabled ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
          Ghi log: {enabled ? 'Bật' : 'Tắt'}
        </span>
        {pendingCount != null && (
          <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-900">
            Chờ replay: <strong>{pendingCount}</strong>
          </span>
        )}
        {statsLine && (
          <span className="px-2 py-1 rounded-md bg-slate-50 text-slate-600">{statsLine}</span>
        )}
      </div>
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      {loading && !items?.length ? (
        <div className="flex items-center gap-2 text-slate-500 py-6 justify-center text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Đang tải log…
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-slate-100 rounded-lg">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="py-2 px-3 font-medium">Thời gian</th>
                <th className="py-2 px-3 font-medium">Loại</th>
                <th className="py-2 px-3 font-medium">Thao tác</th>
                {showApplied && <th className="py-2 px-3 font-medium">Trạng thái</th>}
                {showApplied && <th className="py-2 px-3 font-medium">Replay lúc</th>}
              </tr>
            </thead>
            <tbody>
              {!items?.length ? (
                <tr>
                  <td colSpan={showApplied ? 5 : 3} className="py-8 text-center text-slate-400 text-xs">
                    {enabled ? 'Chưa có bản ghi log — mọi ghi DB/Storage qua backend sẽ được ghi tự động.' : 'Bật SUPABASE_SWITCH_LOG_ENABLED=1 và SUPABASE_REPLICATION_ENABLED=1 trong backend/.env rồi restart server.'}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                    <td className="py-2 px-3 text-xs text-slate-600 whitespace-nowrap">
                      {fmtDt(row.enqueued_at || row.created_at)}
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-500 uppercase">{row.type || row.job_type}</td>
                    <td className="py-2 px-3 font-mono text-xs text-slate-800 break-all max-w-[280px]">
                      {row.summary || row.path || row.storage_path || '—'}
                      {row.retry > 0 && (
                        <span className="ml-1 text-amber-600">retry {row.retry}</span>
                      )}
                    </td>
                    {showApplied && (
                      <td className="py-2 px-3">
                        <UpdateLogStatusBadge applied={row.applied_to_primary} error={row.error} />
                      </td>
                    )}
                    {showApplied && (
                      <td className="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">
                        {row.applied_at ? fmtDt(row.applied_at) : '—'}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProductionBackupSyncContent() {
  const [tab, setTab] = useState('monitor');
  const enteredRef = useRef(false);
  const [auditLog, setAuditLog] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [updateLogs, setUpdateLogs] = useState(null);
  const [updateLogsLoading, setUpdateLogsLoading] = useState(false);
  const [updateLogsPendingOnly, setUpdateLogsPendingOnly] = useState(false);
  const [syncHistory, setSyncHistory] = useState(null);
  const [syncHistoryLoading, setSyncHistoryLoading] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [status, setStatus] = useState(null);
  const [monitor, setMonitor] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const autoVerifyAttempted = useRef(false);
  const [monitorError, setMonitorError] = useState('');
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageDays, setUsageDays] = useState(14);
  const [usageFilters, setUsageFilters] = useState(DEFAULT_USAGE_FILTERS);
  const [filterOptions, setFilterOptions] = useState(null);

  const [form, setForm] = useState({
    schedule_enabled: false,
    schedule_mode: 'slots',
    sync_slots_vn: DEFAULT_SYNC_SLOTS,
    verify_before_sync: true,
    interval_hours: 24,
    include_db: true,
    include_storage: true,
    verify_after_sync: true,
  });

  const loadAuditLog = useCallback(async (silent = false) => {
    if (!silent) setAuditLoading(true);
    try {
      const { data } = await api.get('/production/backup-sync/activity-log', { params: { days: 30, limit: 100 } });
      setAuditLog(data);
    } catch (e) {
      setAuditLog({ ok: false, error: e.response?.data?.error || e.message, items: [] });
    }
    if (!silent) setAuditLoading(false);
  }, []);

  const loadSyncHistory = useCallback(async (silent = false) => {
    if (!silent) setSyncHistoryLoading(true);
    try {
      const { data } = await api.get('/production/backup-sync/history', { params: { limit: 50 } });
      setSyncHistory(data);
    } catch (e) {
      setSyncHistory({ error: e.response?.data?.error || e.message, items: [], total: 0 });
    }
    if (!silent) setSyncHistoryLoading(false);
  }, []);

  const loadUpdateLogs = useCallback(async (silent = false) => {
    if (!silent) setUpdateLogsLoading(true);
    try {
      const { data } = await api.get('/production/backup-sync/update-logs', {
        params: {
          limit: 100,
          pending_only: updateLogsPendingOnly ? '1' : '0',
        },
      });
      setUpdateLogs(data);
    } catch (e) {
      setUpdateLogs({
        error: e.response?.data?.error || e.message,
        primary_log: { items: [] },
        backup_log: { items: [] },
      });
    }
    if (!silent) setUpdateLogsLoading(false);
  }, [updateLogsPendingOnly]);

  useEffect(() => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    void sendDevicePing({ forceGeo: true });
    logClick({
      module: 'supabase_monitor',
      feature: 'backup_sync',
      label: 'Vào trang Giám sát Supabase',
      metadata: { action: 'monitor_enter' },
    });
  }, []);

  const selectTab = (next) => {
    setTab(next);
    logClick({
      module: 'supabase_monitor',
      feature: 'backup_sync',
      label: `Tab ${TAB_LABELS[next] || next}`,
      metadata: { tab: next },
    });
    if (next === 'audit') void loadAuditLog();
    if (next === 'update-log') void loadUpdateLogs();
    if (next === 'history') void loadSyncHistory();
  };

  const loadUsage = useCallback(async (silent = false) => {
    if (!silent) setUsageLoading(true);
    try {
      const { data } = await api.get('/production/backup-sync/usage-analytics', {
        params: usageFilterParams(usageDays, usageFilters),
      });
      setUsage(data);
      if (data?.filter_options) setFilterOptions(data.filter_options);
    } catch (e) {
      console.error(e);
      setUsage({ ok: false, error: e.response?.data?.error || e.message });
    }
    if (!silent) setUsageLoading(false);
  }, [usageDays, usageFilters]);

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
          schedule_mode: data.settings.schedule_mode || 'slots',
          sync_slots_vn: data.settings.sync_slots_vn?.length
            ? data.settings.sync_slots_vn
            : (data.schedule?.sync_slots_vn || DEFAULT_SYNC_SLOTS),
          verify_before_sync: data.settings.verify_before_sync !== false,
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
    if (tab !== 'usage') return;
    void loadUsage();
  }, [tab, usageDays, usageFilters, loadUsage]);

  useEffect(() => {
    if (tab !== 'audit') return;
    void loadAuditLog();
  }, [tab, loadAuditLog]);

  useEffect(() => {
    if (tab !== 'update-log') return undefined;
    void loadUpdateLogs(true);
    const id = setInterval(() => void loadUpdateLogs(true), 15000);
    return () => clearInterval(id);
  }, [tab, loadUpdateLogs, updateLogsPendingOnly]);

  useEffect(() => {
    if (tab !== 'history') return;
    void loadSyncHistory();
  }, [tab, loadSyncHistory]);

  useEffect(() => {
    void load();
    void loadMonitor();
    const poll = setInterval(() => {
      if (tab === 'monitor') void loadMonitor(true);
      if (tab === 'usage') void loadUsage(true);
      if (tab === 'update-log') void loadUpdateLogs(true);
      if (tab === 'history') void loadSyncHistory(true);
      if (status?.job?.running) void load();
    }, 15000);
    return () => clearInterval(poll);
  }, [load, loadMonitor, loadUsage, loadUpdateLogs, loadSyncHistory, tab, status?.job?.running]);

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

  useEffect(() => {
    if (tab !== 'check') {
      autoVerifyAttempted.current = false;
      return;
    }
    if (autoVerifyAttempted.current || verifyLoading || status?.job?.running || !settings) return;
    const rows = settings.last_verify_rows || [];
    if (!verifyRowsLookStale(rows, settings.last_verify_at)) return;
    autoVerifyAttempted.current = true;
    void (async () => {
      setVerifyLoading(true);
      try {
        const { data } = await api.post('/production/backup-sync/verify');
        setVerifyResult(data);
        await load();
      } catch (e) {
        console.error(e);
      }
      setVerifyLoading(false);
    })();
  }, [tab, settings, verifyLoading, status?.job?.running, load]);

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
  const verifyCheckedAt = verifyResult?.checked_at || settings?.last_verify_at;
  const verifyStale = verifyRowsLookStale(verifyRows, verifyCheckedAt);
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
            Giám sát primary/backup, phân tích giờ ít user, lịch clone, chạy đồng bộ
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => selectTab('monitor')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'monitor' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500'}`}
        >
          Giám sát
        </button>
        <button
          type="button"
          onClick={() => selectTab('check')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'check' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500'}`}
        >
          Kiểm tra drift
        </button>
        <button
          type="button"
          onClick={() => selectTab('schedule')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'schedule' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500'}`}
        >
          Lịch đồng bộ
        </button>
        <button
          type="button"
          onClick={() => selectTab('usage')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'usage' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500'}`}
        >
          Phân tích sử dụng
        </button>
        <button
          type="button"
          onClick={() => selectTab('audit')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${tab === 'audit' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500'}`}
        >
          <ClipboardList className="w-4 h-4" />
          Nhật ký
        </button>
        <button
          type="button"
          onClick={() => selectTab('history')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${tab === 'history' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500'}`}
        >
          <History className="w-4 h-4" />
          Lịch sử
        </button>
        <button
          type="button"
          onClick={() => selectTab('update-log')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${tab === 'update-log' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500'}`}
        >
          <ScrollText className="w-4 h-4" />
          Cập nhật log
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

              <SupabaseSwitchPanel
                activeTarget={monitor?.active_target || 'primary'}
                onSwitched={() => {
                  void loadMonitor();
                  void load();
                }}
              />

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
                  <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> Replication: {monitor?.env?.replication_enabled ? (monitor.env.replication_light ? 'Nhẹ' : 'Bật') : 'Tắt'}{monitor?.env?.switch_log_enabled ? ' · Log bật' : ''}</span>
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
                  Lần kiểm tra cuối: {fmtDt(verifyCheckedAt)}
                  {verifyResult?.source && (
                    <span className="ml-2 text-teal-700">· nguồn: {verifyResult.source === 'rest' ? 'REST' : 'PostgreSQL'}</span>
                  )}
                </p>
                {verifyStale && !verifyLoading && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Dữ liệu cũ hoặc lỗi mạng trước đó — đang tự kiểm tra lại hoặc bấm &quot;Kiểm tra ngay&quot;.
                  </div>
                )}
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

          {tab === 'usage' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Phân tích hành vi người dùng</div>
                    <p className="text-sm text-slate-600">
                      Lọc theo NV, phòng ban, module, loại thao tác · khung giờ ít user
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={usageDays}
                      onChange={(e) => setUsageDays(parseInt(e.target.value, 10))}
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <option value={7}>7 ngày</option>
                      <option value={14}>14 ngày</option>
                      <option value={30}>30 ngày</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => loadUsage()}
                      disabled={usageLoading}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-medium disabled:opacity-50"
                    >
                      {usageLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Làm mới
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                  <label className="text-xs text-slate-600">
                    Nhân viên
                    <select
                      value={usageFilters.user_id}
                      onChange={(e) => setUsageFilters((f) => ({ ...f, user_id: e.target.value }))}
                      className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <option value="">Tất cả</option>
                      {(filterOptions?.users || []).map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name || u.email || u.id}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Phòng ban
                    <select
                      value={usageFilters.department_id}
                      onChange={(e) => setUsageFilters((f) => ({ ...f, department_id: e.target.value }))}
                      className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <option value="">Tất cả</option>
                      {(filterOptions?.departments || []).map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Module
                    <select
                      value={usageFilters.module}
                      onChange={(e) => setUsageFilters((f) => ({ ...f, module: e.target.value }))}
                      className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <option value="">Tất cả</option>
                      {(filterOptions?.modules || usage?.filter_options?.modules || []).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Loại thao tác
                    <select
                      value={usageFilters.action_type}
                      onChange={(e) => setUsageFilters((f) => ({ ...f, action_type: e.target.value }))}
                      className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <option value="">Tất cả</option>
                      {(filterOptions?.action_types || usage?.filter_options?.action_types || []).map((a) => (
                        <option key={a} value={a}>{ACTION_TYPE_LABELS[a] || a}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Thứ (VN)
                    <select
                      value={usageFilters.weekday}
                      onChange={(e) => setUsageFilters((f) => ({ ...f, weekday: e.target.value }))}
                      className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <option value="">Cả tuần</option>
                      <option value="1">Thứ 2</option>
                      <option value="2">Thứ 3</option>
                      <option value="3">Thứ 4</option>
                      <option value="4">Thứ 5</option>
                      <option value="5">Thứ 6</option>
                      <option value="6">Thứ 7</option>
                      <option value="7">Chủ nhật</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Giờ từ (VN)
                    <select
                      value={usageFilters.hour_from}
                      onChange={(e) => setUsageFilters((f) => ({ ...f, hour_from: e.target.value }))}
                      className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Giờ đến (VN)
                    <select
                      value={usageFilters.hour_to}
                      onChange={(e) => setUsageFilters((f) => ({ ...f, hour_to: e.target.value }))}
                      className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Mức quan trọng ≥
                    <select
                      value={usageFilters.min_importance}
                      onChange={(e) => setUsageFilters((f) => ({ ...f, min_importance: e.target.value }))}
                      className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <option value="0">Tất cả (kể cả xem list)</option>
                      <option value="1">Bình thường trở lên</option>
                      <option value="2">Quan trọng (CRUD/export)</option>
                      <option value="3">Critical only</option>
                    </select>
                  </label>
                </div>

                {hasActiveUsageFilters(usageFilters) && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-teal-700 bg-teal-50 px-2 py-1 rounded-full">Đang lọc dữ liệu</span>
                    <button
                      type="button"
                      onClick={() => setUsageFilters(DEFAULT_USAGE_FILTERS)}
                      className="text-slate-500 hover:text-slate-800 underline"
                    >
                      Xóa bộ lọc
                    </button>
                  </div>
                )}
              </div>

              {usageLoading && !usage ? (
                <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Đang phân tích…
                </div>
              ) : !usage?.ok ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {usage?.error || 'Không tải được dữ liệu phân tích'}
                </div>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-xs text-slate-500">Tổng thao tác</div>
                      <div className="text-2xl font-bold text-slate-900 mt-1">{usage.summary?.total_actions?.toLocaleString('vi-VN') ?? '—'}</div>
                      <div className="text-xs text-slate-400 mt-1">{usage.days} ngày qua</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-xs text-slate-500">NV có hoạt động</div>
                      <div className="text-2xl font-bold text-slate-900 mt-1">{usage.summary?.distinct_users ?? '—'}</div>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                      <div className="text-xs text-emerald-700">Giờ ít user nhất</div>
                      <div className="text-2xl font-bold text-emerald-900 mt-1">
                        {usage.summary?.quietest_hour?.label ?? '—'}
                      </div>
                      <div className="text-xs text-emerald-700 mt-1">
                        {usage.summary?.quietest_hour?.actions ?? 0} thao tác
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-xs text-slate-500">Snapshot online</div>
                      <div className="text-2xl font-bold text-slate-900 mt-1">{usage.summary?.snapshots_count ?? 0}</div>
                      <div className="text-xs text-slate-400 mt-1">ghi mỗi giờ VN</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      Hoạt động theo giờ (VN)
                    </h2>
                    <div className="flex items-end gap-0.5 h-32 mb-2">
                      {(usage.hourly || []).map((h) => {
                        const max = Math.max(...(usage.hourly || []).map((x) => x.actions), 1);
                        const pct = Math.max(4, (h.actions / max) * 100);
                        const quiet = usage.quietest_hours?.some((q) => q.hour_vn === h.hour_vn);
                        return (
                          <div key={h.hour_vn} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${h.label}: ${h.actions} thao tác, ${h.users} NV`}>
                            <div
                              className={`w-full rounded-t ${quiet ? 'bg-emerald-500' : 'bg-teal-400'}`}
                              style={{ height: `${pct}%` }}
                            />
                            <span className="text-[9px] text-slate-400 truncate w-full text-center">{h.hour_vn}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-500">Cột xanh lá = top giờ ít hoạt động (phù hợp chạy đồng bộ lớn)</p>
                  </div>

                  {(usage.by_weekday?.length > 0) && (
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h2 className="font-semibold text-slate-800 mb-3">Hoạt động theo thứ (VN)</h2>
                      <div className="flex items-end gap-2 h-24">
                        {usage.by_weekday.map((d) => {
                          const max = Math.max(...usage.by_weekday.map((x) => x.actions), 1);
                          const pct = Math.max(4, (d.actions / max) * 100);
                          return (
                            <div key={d.weekday} className="flex-1 flex flex-col items-center gap-1" title={`${d.label}: ${d.actions} thao tác`}>
                              <div className="w-full bg-indigo-400 rounded-t" style={{ height: `${pct}%` }} />
                              <span className="text-[10px] text-slate-500">{d.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-4">
                    {(usage.by_action_type?.length > 0) && (
                      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h3 className="font-semibold text-slate-800 mb-3">Loại thao tác</h3>
                        <ul className="space-y-1.5 text-sm max-h-48 overflow-y-auto">
                          {usage.by_action_type.map((a) => (
                            <li key={a.action_type} className="flex justify-between gap-2">
                              <span className="text-slate-700">{ACTION_TYPE_LABELS[a.action_type] || a.action_type}</span>
                              <span className="text-slate-400 shrink-0">{a.actions?.toLocaleString('vi-VN')}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(usage.by_module?.length > 0) && (
                      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h3 className="font-semibold text-slate-800 mb-3">Module</h3>
                        <ul className="space-y-1.5 text-sm max-h-48 overflow-y-auto">
                          {usage.by_module.map((m) => (
                            <li key={m.module} className="flex justify-between gap-2">
                              <span className="text-slate-700">{m.module === '_none_' ? '(không module)' : m.module}</span>
                              <span className="text-slate-400 shrink-0">{m.actions?.toLocaleString('vi-VN')}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="font-semibold text-slate-800 mb-3">Gợi ý khung giờ đồng bộ</h3>
                      <ul className="space-y-2 text-sm">
                        {(usage.summary?.recommended_sync_slots || []).map((s) => (
                          <li key={s.label} className="flex justify-between text-slate-700">
                            <span>{s.label} VN</span>
                            <span className="text-slate-400">{s.actions} thao tác</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="font-semibold text-slate-800 mb-3">Lịch đồng bộ hiện tại</h3>
                      <ul className="space-y-2 text-sm">
                        {(usage.sync_slot_analysis || []).map((s) => (
                          <li key={s.slot} className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">{s.slot}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_quiet ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                              {s.is_quiet ? 'Ít user' : 'Khá bận'}
                            </span>
                            <span className="text-slate-400 text-xs w-full">{s.activity_actions} thao tác/giờ · online TB {s.avg_online != null ? s.avg_online.toFixed(1) : '—'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm overflow-x-auto">
                    <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Người dùng ({usage.users?.length || 0})
                    </h2>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b">
                          <th className="py-2 pr-3">Nhân viên</th>
                          <th className="py-2 pr-3">Thao tác</th>
                          <th className="py-2 pr-3">Giờ peak VN</th>
                          <th className="py-2 pr-3">Module hay dùng</th>
                          <th className="py-2">Online</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(usage.users || []).map((u) => (
                          <tr key={u.user_id} className="border-b border-slate-50 last:border-0">
                            <td className="py-2 pr-3">
                              <div className="font-medium text-slate-800">{u.full_name || u.email || u.user_id}</div>
                              {u.department && <div className="text-xs text-slate-400">{u.department}</div>}
                            </td>
                            <td className="py-2 pr-3">{u.actions?.toLocaleString('vi-VN')}</td>
                            <td className="py-2 pr-3">
                              {u.peak_hour_vn != null ? `${String(u.peak_hour_vn).padStart(2, '0')}:00` : '—'}
                            </td>
                            <td className="py-2 pr-3 text-xs text-slate-600">
                              {(u.top_modules || []).map((m) => m.module).filter((m) => m !== '_none_').join(', ') || '—'}
                            </td>
                            <td className="py-2">
                              {u.online ? (
                                <span className="text-emerald-600 text-xs font-medium">Online</span>
                              ) : (
                                <span className="text-slate-400 text-xs">Offline</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'audit' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-teal-700" />
                      Nhật ký truy cập &amp; thao tác
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Ai đã mở khóa trang, chạy đồng bộ, chuyển DB, đổi lịch… (30 ngày gần nhất).
                      Mỗi bản ghi gồm thiết bị và vị trí bắt buộc.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadAuditLog()}
                    disabled={auditLoading}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-medium disabled:opacity-50"
                  >
                    {auditLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Làm mới
                  </button>
                </div>

                {auditLog?.error === 'missing_table' && (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Chưa có bảng user_activity_log — chạy migration database/235_user_activity_log.sql
                  </p>
                )}

                {auditLoading && !auditLog?.items?.length ? (
                  <div className="flex items-center gap-2 text-slate-500 py-8 justify-center">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Đang tải nhật ký…
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                          <th className="py-2 pr-3 font-medium">Thời gian</th>
                          <th className="py-2 pr-3 font-medium">Nhân viên</th>
                          <th className="py-2 pr-3 font-medium">Thao tác</th>
                          <th className="py-2 pr-3 font-medium">Thiết bị</th>
                          <th className="py-2 pr-3 font-medium">Vị trí</th>
                          <th className="py-2 font-medium">IP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(auditLog?.items || []).length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400">
                              Chưa có bản ghi — thao tác trên trang này sẽ được ghi nhận tự động.
                            </td>
                          </tr>
                        ) : (
                          auditLog.items.map((row) => (
                            <tr key={row.id} className="border-b border-slate-100 last:border-0">
                              <td className="py-2.5 pr-3 text-xs text-slate-600 whitespace-nowrap">{fmtDt(row.at)}</td>
                              <td className="py-2.5 pr-3">
                                <div className="font-medium text-slate-800">{row.user?.name || '—'}</div>
                                {row.user?.email && (
                                  <div className="text-xs text-slate-400 truncate max-w-[160px]">{row.user.email}</div>
                                )}
                              </td>
                              <td className="py-2.5 pr-3 text-slate-700">{row.label || row.metadata?.monitor_action || '—'}</td>
                              <td className="py-2.5 pr-3 text-xs text-slate-600 max-w-[140px]">
                                <div className="font-medium truncate" title={fmtAuditDevice(row)}>
                                  {fmtAuditDevice(row)}
                                </div>
                              </td>
                              <td className="py-2.5 pr-3 text-xs text-slate-600 max-w-[180px]">
                                {auditLocationMapUrl(row) ? (
                                  <a
                                    href={auditLocationMapUrl(row)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-teal-700 hover:underline line-clamp-2"
                                    title={fmtAuditLocation(row)}
                                  >
                                    {fmtAuditLocation(row)}
                                  </a>
                                ) : (
                                  <span className="text-amber-600">{fmtAuditLocation(row)}</span>
                                )}
                              </td>
                              <td className="py-2.5 text-xs text-slate-500 font-mono">{row.metadata?.ip || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                      <History className="w-5 h-5 text-teal-700" />
                      Lịch sử đồng bộ Primary → Backup
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Các lần chạy thủ công và lịch tự động — lưu tối đa 50 lần gần nhất kèm log chi tiết.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadSyncHistory()}
                    disabled={syncHistoryLoading}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-medium disabled:opacity-50"
                  >
                    {syncHistoryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Làm mới
                  </button>
                </div>

                {syncHistory?.error && (
                  <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                    {syncHistory.error}
                  </p>
                )}

                {syncHistoryLoading && !syncHistory?.items?.length ? (
                  <div className="flex items-center gap-2 text-slate-500 py-8 justify-center">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Đang tải lịch sử…
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(syncHistory?.items || []).length === 0 ? (
                      <p className="text-sm text-slate-500 py-8 text-center">
                        Chưa có lần đồng bộ nào được ghi — chạy đồng bộ hoặc đợi lịch tự động.
                      </p>
                    ) : (
                      (syncHistory.items || []).map((run) => {
                        const expanded = expandedHistoryId === run.id;
                        const parts = (run.sync_parts || []).join(' + ')
                          || [run.include_db !== false && 'DB', run.include_storage !== false && 'Storage'].filter(Boolean).join(' + ');
                        return (
                          <div key={run.id} className="border border-slate-200 rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setExpandedHistoryId(expanded ? null : run.id)}
                              className="w-full text-left px-4 py-3 bg-slate-50/80 hover:bg-slate-100 transition-colors"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <SyncRunStatusBadge status={run.status} />
                                  <span className="text-sm font-medium text-slate-800">{fmtDt(run.started_at)}</span>
                                  {run.slot && (
                                    <span className="text-xs bg-blue-50 text-blue-800 px-2 py-0.5 rounded-full">
                                      Slot {run.slot}
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-slate-500">
                                  {fmtDurationMs(run.started_at, run.finished_at)} · {fmtTriggeredBy(run.triggered_by)}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                <span>{parts || '—'}</span>
                                {run.db_mode && <span>DB: {run.db_mode}</span>}
                                {run.verify_drift_count > 0 && (
                                  <span className="text-amber-700">Drift: {run.verify_drift_count} bảng</span>
                                )}
                                {run.verify_all_ok === true && run.verify_after !== false && (
                                  <span className="text-emerald-700">Verify OK</span>
                                )}
                                {run.error && <span className="text-red-600 truncate max-w-full">{run.error}</span>}
                              </div>
                            </button>
                            {expanded && (
                              <div className="px-4 py-3 border-t border-slate-100 bg-white space-y-3">
                                {run.verify_summary?.length > 0 && (
                                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                    <p className="font-medium mb-1">Bảng còn lệch sau đồng bộ:</p>
                                    <ul className="space-y-0.5 font-mono">
                                      {run.verify_summary.map((r) => (
                                        <li key={r.table}>
                                          {r.table}: primary={r.primary} backup={r.backup} (Δ{r.drift})
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                <pre className="text-xs text-slate-700 max-h-64 overflow-auto whitespace-pre-wrap font-mono leading-relaxed">
                                  {(run.log || []).map((l) => `[${fmtDt(l.at)}] ${l.line}`).join('\n') || 'Không có log.'}
                                </pre>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'update-log' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                    <ScrollText className="w-5 h-5 text-teal-700" />
                    Log cập nhật 2 Database
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Primary: queue replication · Backup: bảng failback_log · Tự refresh 15s
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Đang dùng: <strong>{updateLogs?.active_target === 'backup' ? 'Backup' : 'Primary'}</strong>
                    {' · '}
                    Cập nhật: {fmtDt(updateLogs?.checked_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={updateLogsPendingOnly}
                      onChange={(e) => setUpdateLogsPendingOnly(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Backup: chỉ chờ replay
                  </label>
                  <button
                    type="button"
                    onClick={() => loadUpdateLogs()}
                    disabled={updateLogsLoading}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-medium disabled:opacity-50"
                  >
                    {updateLogsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Làm mới
                  </button>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <UpdateLogPanel
                  title="Log Primary (Chính)"
                  direction={updateLogs?.primary_log?.direction || 'Chính → Dự phòng'}
                  description={updateLogs?.primary_log?.description || ''}
                  enabled={updateLogs?.primary_log?.enabled}
                  pendingCount={updateLogs?.primary_log?.queue_depth}
                  statsLine={
                    updateLogs?.primary_log?.stats
                      ? `Đã áp dụng: ${updateLogs.primary_log.stats.applied ?? 0} · Lỗi: ${updateLogs.primary_log.stats.failed ?? 0}`
                      : null
                  }
                  error={updateLogs?.primary_log?.error}
                  loading={updateLogsLoading}
                  items={updateLogs?.primary_log?.items}
                  showApplied={false}
                />
                <UpdateLogPanel
                  title="Log Backup (Dự phòng)"
                  direction={updateLogs?.backup_log?.direction || 'Dự phòng → Chính'}
                  description={updateLogs?.backup_log?.description || ''}
                  enabled={updateLogs?.backup_log?.enabled}
                  pendingCount={updateLogs?.backup_log?.pending}
                  statsLine={
                    updateLogs?.backup_log?.stats
                      ? `Đã replay: ${updateLogs.backup_log.stats.replayed ?? 0} · Lỗi: ${updateLogs.backup_log.stats.replay_failed ?? 0}`
                      : null
                  }
                  error={updateLogs?.backup_log?.error}
                  loading={updateLogsLoading}
                  items={updateLogs?.backup_log?.items}
                  showApplied
                />
              </div>

              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                Primary: queue job chờ replay · Backup: bảng <code className="text-xs">supabase_failback_log</code>.
                {' '}
                Env: <code className="text-xs">SUPABASE_SWITCH_LOG_ENABLED=1</code>
                {' + '}
                <code className="text-xs">SUPABASE_REPLICATION_ENABLED=1</code>
                {' '}
                (chạy migration 379 trên Backup nếu chưa có bảng log).
              </p>
            </div>
          )}

          {tab === 'schedule' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Cấu hình lịch tự động
                </h2>

                <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                  Mỗi khung giờ VN: <strong>kiểm tra drift</strong> (đếm bảng) → <strong>đồng bộ lớn</strong> (DB + Storage) → kiểm tra lại sau sync.
                </p>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.schedule_enabled}
                    onChange={(e) => setForm((f) => ({ ...f, schedule_enabled: e.target.checked }))}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm">Bật lịch tự động (3 lần/ngày)</span>
                </label>

                <div>
                  <div className="text-sm font-medium text-slate-700 mb-2">Khung giờ đồng bộ (giờ VN)</div>
                  <div className="space-y-2">
                    {form.sync_slots_vn.map((slot, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <input
                          type="time"
                          value={slotToTimeValue(slot)}
                          onChange={(e) => {
                            const next = [...form.sync_slots_vn];
                            next[idx] = timeValueToSlot(e.target.value);
                            setForm((f) => ({ ...f, sync_slots_vn: next }));
                          }}
                          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        />
                        <span className="text-sm text-slate-500">{fmtSlotLabel(slot)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">Mặc định: 05:00 sáng · 12:30 trưa · 18:00 chiều</p>
                </div>

                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.verify_before_sync} onChange={(e) => setForm((f) => ({ ...f, verify_before_sync: e.target.checked }))} />
                    Kiểm tra drift trước sync
                  </label>
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

                {settings?.last_run_slot && (
                  <p className="text-xs text-slate-500">
                    Lần chạy lịch gần nhất: slot {settings.last_run_slot} · {fmtDt(settings.last_run_at)}
                  </p>
                )}

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
                  Đồng bộ incremental: log replication → chỉ bảng lệch → Storage chỉ file mới/khác (không clone full DB trừ khi bật SUPABASE_BACKUP_ALLOW_FULL_CLONE=1).
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
