import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useMessengerDock } from '../context/MessengerDockContext';
import OnlineStatusDot from '../components/OnlineStatusDot';
import LiveActivityMap from '../components/LiveActivityMap';
import { getInitials, avatarColor } from '../lib/utils';
import { Activity, Building2, ExternalLink, History, Laptop, LogIn, LogOut, Loader2, MapPin, MessageCircle, Monitor, RefreshCw, ShieldAlert, Smartphone, Users } from 'lucide-react';
import ScopeFilterBar from '../shared/components/ScopeFilterBar';
import { useScopeFilter } from '../shared/hooks/useScopeFilter';

const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Quản lý',
  region_admin: 'Admin KV',
  sales_admin: 'Sales Admin',
  sales: 'Kinh doanh',
  designer: 'Thiết kế',
  production: 'Sản xuất',
  staff: 'Nhân viên',
};

function formatRelativeTime(iso) {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Vừa xong';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} phút trước`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} giờ trước`;
  return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatAtSeconds(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  } catch { return String(iso); }
}

function formatDurationMs(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}p ${sec}s`;
  if (m > 0) return `${m}p ${sec}s`;
  return `${sec}s`;
}

const AUTH_EVENT_META = {
  login_success:        { label: 'Đăng nhập',         tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: LogIn },
  login_failed:         { label: 'Đăng nhập sai',     tone: 'bg-rose-50 text-rose-700 border-rose-200',          Icon: ShieldAlert },
  logout:               { label: 'Đăng xuất',         tone: 'bg-slate-100 text-slate-700 border-slate-200',      Icon: LogOut },
  auto_logout_midnight: { label: 'Hết phiên qua đêm', tone: 'bg-amber-50 text-amber-800 border-amber-200',       Icon: LogOut },
  session_expired:      { label: 'Phiên hết hạn',     tone: 'bg-amber-50 text-amber-800 border-amber-200',       Icon: LogOut },
  token_invalid:        { label: 'Token lỗi',         tone: 'bg-rose-50 text-rose-700 border-rose-200',          Icon: ShieldAlert },
  password_changed:     { label: 'Đổi mật khẩu',      tone: 'bg-sky-50 text-sky-700 border-sky-200',             Icon: ShieldAlert },
};

const PLATFORM_META = {
  android: { Icon: Smartphone, label: 'Android', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  ios: { Icon: Smartphone, label: 'iOS', color: 'text-slate-700 bg-slate-50 border-slate-200' },
  web: { Icon: Monitor, label: 'Web', color: 'text-sky-700 bg-sky-50 border-sky-200' },
  desktop: { Icon: Laptop, label: 'Desktop', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
};

function platformInfo(p) {
  return PLATFORM_META[p] || { Icon: Monitor, label: p || 'Khác', color: 'text-slate-600 bg-slate-50 border-slate-200' };
}

function mapOpenHref(point) {
  if (!point) return '#';
  if (point.map_url && String(point.map_url).trim()) return String(point.map_url).trim();
  if (Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))) {
    return `https://www.google.com/maps?q=${Number(point.lat)},${Number(point.lng)}`;
  }
  const q = String(point.address || point.label || '').trim();
  return q ? `https://www.google.com/maps?q=${encodeURIComponent(q)}` : '#';
}

function DeviceBadge({ device }) {
  const { Icon, label, color } = platformInfo(device.platform);
  const hasGeo = Number.isFinite(Number(device.geo_lat)) && Number.isFinite(Number(device.geo_lng));
  const mapUrl = hasGeo ? `https://www.google.com/maps?q=${Number(device.geo_lat)},${Number(device.geo_lng)}` : null;
  const tooltip = [
    device.device_name || label,
    device.os_version ? `${device.os_name || ''} ${device.os_version}` : device.os_name,
    device.app_version ? `App v${device.app_version}` : null,
    device.network_name ? `Mạng: ${device.network_name}` : (device.network_label || (device.network_type ? `Mạng: ${device.network_type}` : null)),
    device.ip ? `IP: ${device.ip}` : null,
    device.geo_address ? `Địa chỉ: ${device.geo_address}` : null,
    mapUrl ? `Map: ${mapUrl}` : null,
    device.duplicate_count > 1 ? `Gộp ${device.duplicate_count} phiên trùng tên` : null,
    `Ping: ${formatRelativeTime(device.last_ping_at)}`,
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${color} ${
        device.online ? '' : 'opacity-60'
      }`}
    >
      <Icon className="h-3 w-3" />
      <span className="truncate max-w-[80px]">{device.device_name || label}</span>
      {device.duplicate_count > 1 ? <span className="text-[9px] font-bold">x{device.duplicate_count}</span> : null}
      {device.online ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> : null}
    </span>
  );
}

export default function ActiveUsersPage() {
  const { user } = useAuth();
  const { openMessengerGroupChat, markGroupRead } = useMessengerDock();
  const uid = user?.id || user?.user_id;
  const [chatLoadingId, setChatLoadingId] = useState(null);
  const scope = useScopeFilter({
    storageKey: 'crm_activity',
    companiesModule: 'crm',
    showCompany: true,
    showDepartment: true,
    showSearch: true,
    persist: true,
    autoDefaultCompany: true,
  });
  const { companyId, departmentId, companies, apiParams: scopeApiParams } = scope;
  const [filter, setFilter] = useState('online');
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ online: 0, total: 0 });
  const [thresholdMin, setThresholdMin] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [branchRegions, setBranchRegions] = useState([]);
  const [mapEmployeeScope, setMapEmployeeScope] = useState('all');
  const [mapSectionTab, setMapSectionTab] = useState('map');
  const [authEvents, setAuthEvents] = useState([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authDays, setAuthDays] = useState(1);
  const [authEventFilter, setAuthEventFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { ...scopeApiParams };
      const { data } = await api.get('/users/activity', { params });
      setRows(data?.users || []);
      setStats(data?.stats || { online: 0, total: 0 });
      if (data?.online_threshold_minutes) setThresholdMin(data.online_threshold_minutes);
    } catch (e) {
      setRows([]);
      setStats({ online: 0, total: 0 });
      setError(e.response?.data?.error || e.message || 'Không tải được danh sách');
    }
    setLoading(false);
  }, [scopeApiParams]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const fetchRegions = async () => {
      try {
        let params = {};
        if (companyId) {
          params = { company_id: companyId };
        } else if (companies.length > 0) {
          params = { company_ids: companies.map((c) => c.id).filter(Boolean).join(',') };
        }
        if (!params.company_id && !params.company_ids) {
          setBranchRegions([]);
          return;
        }
        const { data } = await api.get('/crm/company-regions', { params });
        setBranchRegions(Array.isArray(data) ? data : []);
      } catch {
        setBranchRegions([]);
      }
    };
    void fetchRegions();
  }, [companyId, companies]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void load();
    }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const displayRows = useMemo(() => {
    if (filter === 'online') return rows.filter((u) => !!u.online);
    if (filter === 'offline') return rows.filter((u) => !u.online);
    if (filter === 'auth_log') return [];
    return rows;
  }, [rows, filter]);

  const userMap = useMemo(() => {
    const m = new Map();
    for (const u of rows || []) m.set(String(u.id), u);
    return m;
  }, [rows]);

  const loadAuthEvents = useCallback(async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const params = {
        since: new Date(Date.now() - authDays * 24 * 3600 * 1000).toISOString(),
        limit: 500,
      };
      if (companyId) params.company_id = companyId;
      if (departmentId) params.department_id = departmentId;
      if (authEventFilter !== 'all') params.events = authEventFilter;
      const { data } = await api.get('/auth-events', { params });
      setAuthEvents(data?.items || []);
    } catch (e) {
      setAuthEvents([]);
      const msg = e.response?.data?.error || e.message || 'Không tải được lịch sử đăng nhập';
      setAuthError(e.response?.status === 403 ? 'Cần quyền quản trị để xem log toàn nhóm' : msg);
    }
    setAuthLoading(false);
  }, [companyId, departmentId, authDays, authEventFilter]);

  useEffect(() => {
    if (filter !== 'auth_log') return;
    void loadAuthEvents();
  }, [filter, loadAuthEvents]);

  /** Ghép cặp login → logout để tính thời lượng phiên. */
  const authSessions = useMemo(() => {
    if (filter !== 'auth_log') return [];
    const logins = new Map();
    const out = [];
    const sorted = [...authEvents].sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
    for (const ev of sorted) {
      const key = `${ev.user_id}|${ev.session_id || ev.id}`;
      if (ev.event === 'login_success') {
        logins.set(key, ev);
      } else if (['logout', 'auto_logout_midnight', 'session_expired'].includes(ev.event)) {
        const login = logins.get(key) || (ev.session_id && logins.get(`${ev.user_id}|${ev.session_id}`));
        if (login) {
          out.push({
            ...ev,
            login_at: login.occurred_at,
            duration_ms: ev.metadata?.ms_session_duration
              ? Number(ev.metadata.ms_session_duration)
              : new Date(ev.occurred_at).getTime() - new Date(login.occurred_at).getTime(),
          });
          logins.delete(key);
        } else {
          out.push({ ...ev, login_at: null, duration_ms: null });
        }
      } else {
        out.push({ ...ev, login_at: null, duration_ms: null });
      }
    }
    // Phiên còn mở (login chưa có logout).
    for (const login of logins.values()) {
      out.push({
        ...login,
        login_at: login.occurred_at,
        duration_ms: Date.now() - new Date(login.occurred_at).getTime(),
        still_open: true,
      });
    }
    return out.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
  }, [authEvents, filter]);

  const branchLocations = useMemo(() => {
    return (branchRegions || [])
      .filter((r) => r && (String(r.address || '').trim() || String(r.map_url || '').trim() || (Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng)))))
      .map((r) => {
        const lat = Number(r.lat);
        const lng = Number(r.lng);
        // Chỉ giữ toạ độ nằm trong phạm vi Việt Nam.
        const hasGeo = Number.isFinite(lat) && Number.isFinite(lng)
          && !(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)
          && lat >= 6.0 && lat <= 24.0
          && lng >= 101.5 && lng <= 118.0;
        return {
          key: `branch:${r.id}`,
          id: r.id,
          type: 'branch',
          label: r.name || 'Chi nhánh',
          address: String(r.address || '').trim(),
          map_url: String(r.map_url || '').trim() || null,
          lat: hasGeo ? lat : null,
          lng: hasGeo ? lng : null,
          users: [],
        };
      });
  }, [branchRegions]);

  const branchesPending = useMemo(
    () => branchLocations.filter((b) => b.lat == null || b.lng == null),
    [branchLocations],
  );

  const resolveUserLocation = useCallback((u) => {
    // Bộ lọc cứng theo phạm vi Việt Nam (đồng bộ với backend/geoBounds.js).
    const isValid = (lat, lng) => {
      const la = Number(lat);
      const ln = Number(lng);
      if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
      if (Math.abs(la) < 0.0001 && Math.abs(ln) < 0.0001) return false;
      return la >= 6.0 && la <= 24.0 && ln >= 101.5 && ln <= 118.0;
    };
    const cl = u?.current_location;
    if (cl && isValid(cl.lat, cl.lng)) {
      return {
        lat: Number(cl.lat),
        lng: Number(cl.lng),
        address: cl.address || '',
        captured_at: cl.captured_at || cl.updated_at || null,
        source: cl.source || null,
      };
    }
    const d = (u.devices || []).find((x) => isValid(x.geo_lat, x.geo_lng));
    if (!d) return null;
    return {
      lat: Number(d.geo_lat),
      lng: Number(d.geo_lng),
      address: d.geo_address || '',
      captured_at: d.last_ping_at || null,
      source: d.platform || null,
    };
  }, []);

  const employeeLivePoints = useMemo(() => {
    const list = (rows || []).filter((u) => mapEmployeeScope !== 'online' || u.online);
    return list
      .map((u) => {
        const loc = resolveUserLocation(u);
        if (!loc) return null;
        return {
          key: `employee:${u.id}`,
          type: 'employee',
          label: u.full_name || u.email || 'Nhân viên',
          lat: loc.lat,
          lng: loc.lng,
          address: loc.address,
          online: !!u.online,
          captured_at: loc.captured_at,
          source: loc.source,
          users: [{ id: u.id, full_name: u.full_name, email: u.email }],
        };
      })
      .filter(Boolean);
  }, [rows, mapEmployeeScope, resolveUserLocation]);

  const employeesWithoutLocation = useMemo(() => {
    const list = (rows || []).filter((u) => mapEmployeeScope !== 'online' || u.online);
    return list.filter((u) => !resolveUserLocation(u));
  }, [rows, mapEmployeeScope, resolveUserLocation]);

  const mapPoints = useMemo(() => {
    return [...branchLocations, ...employeeLivePoints];
  }, [branchLocations, employeeLivePoints]);

  const mapPlottedPoints = useMemo(
    () => mapPoints.filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))),
    [mapPoints],
  );


  const isAdmin = useMemo(() => {
    const role = String(user?.role || '').toLowerCase();
    return ['admin', 'super_admin', 'owner', 'region_admin'].includes(role);
  }, [user?.role]);

  const refetchRegions = useCallback(async () => {
    try {
      const params = companyId
        ? { company_id: companyId }
        : (companies.length > 0 ? { company_ids: companies.map((c) => c.id).filter(Boolean).join(',') } : null);
      if (!params) return;
      const { data } = await api.get('/crm/company-regions', { params });
      setBranchRegions(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, [companyId, companies]);

  const regeocodeBranch = useCallback(async (branchId, opts = {}) => {
    try {
      const { data } = await api.post(`/crm/company-regions/${branchId}/regeocode`, {
        clear_cache: !!opts.clearCache,
      });
      if (data?.ok) {
        await refetchRegions();
      } else {
        alert(`Không xác định được toạ độ cho chi nhánh này.\nĐịa chỉ: ${data?.address || '(trống)'}\nMap URL: ${data?.map_url || '(trống)'}`);
      }
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Lỗi geocode chi nhánh');
    }
  }, [refetchRegions]);

  const startDirectChat = async (u) => {
    const peerId = u.id || u.user_id;
    if (!peerId || String(peerId) === String(uid)) return;
    setChatLoadingId(peerId);
    try {
      const { data } = await api.post('/messenger/direct', { peer_user_id: peerId });
      if (data?.id) {
        markGroupRead(data.id);
        openMessengerGroupChat({
          id: data.id,
          name: data.name || data.display_name || u.full_name || u.email,
          is_direct: true,
          peer_id: peerId,
        });
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không mở được chat');
    }
    setChatLoadingId(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-600" />
              Đang hoạt động
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              Ai đang mở app (có ping trong {thresholdMin} phút). Thiết bị trùng tên sẽ được gộp để tránh lặp. Tự làm mới mỗi 30 giây.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {stats.online} đang hoạt động
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1 text-xs font-medium">
            <Users className="h-3.5 w-3.5" />
            {stats.total} nhân viên
          </span>
        </div>

        <ScopeFilterBar
          scope={scope}
          className="mt-4"
          searchPlaceholder="Tên hoặc email…"
        />

        <div className="mt-3 flex flex-wrap gap-1">
          {[
            { id: 'online', label: 'Đang hoạt động' },
            { id: 'all', label: 'Tất cả' },
            { id: 'offline', label: 'Offline' },
            { id: 'auth_log', label: 'Lịch sử đăng nhập' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                filter === tab.id
                  ? 'bg-sky-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        )}

        {filter !== 'auth_log' && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-sky-600" />
              Bản đồ chi nhánh + vị trí nhân viên
            </h2>
            <span className="text-[11px] text-slate-500">
              {mapPoints.length} điểm · {employeeLivePoints.length} NV có vị trí
              {employeesWithoutLocation.length > 0 ? ` · ${employeesWithoutLocation.length} chưa có` : ''}
            </span>
          </div>

          <div className="flex border-b border-slate-200 px-3 sm:px-4 gap-0 overflow-x-auto">
            {[
              { id: 'map', label: 'Bản đồ' },
              { id: 'list', label: 'Danh sách điểm', count: mapPoints.length },
              { id: 'missing', label: 'Chưa có vị trí', count: employeesWithoutLocation.length },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMapSectionTab(tab.id)}
                className={`shrink-0 px-3 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                  mapSectionTab === tab.id
                    ? 'border-sky-600 text-sky-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
                {tab.count != null && tab.count > 0 ? (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                    tab.id === 'missing' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {tab.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMapEmployeeScope('all')}
                  className={`h-7 px-2.5 text-[11px] font-semibold ${mapEmployeeScope === 'all' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  Tất cả NV
                </button>
                <button
                  type="button"
                  onClick={() => setMapEmployeeScope('online')}
                  className={`h-7 px-2.5 text-[11px] font-semibold border-l border-slate-200 ${mapEmployeeScope === 'online' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  Chỉ online
                </button>
              </div>
              <span className="text-[11px] text-slate-500 inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-indigo-600" /> Chi nhánh</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> NV online</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-500" /> NV offline</span>
              </span>
            </div>

            {mapSectionTab === 'map' && (
              mapPlottedPoints.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-xs text-slate-600 space-y-1 text-center">
                  <p className="font-semibold text-slate-700">Chưa có toạ độ để vẽ bản đồ.</p>
                  <p>
                    Thêm địa chỉ chi nhánh (hệ thống sẽ tự xác định toạ độ trong vài phút) và yêu cầu nhân viên cho phép định vị trên web/mobile (Cài đặt → Vị trí làm việc → «Cập nhật ngay»).
                  </p>
                  {branchesPending.length > 0 && (
                    <p className="text-amber-700">
                      Đang chờ geocode {branchesPending.length} chi nhánh — thử bấm «Làm mới» sau ~30 giây.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <LiveActivityMap
                    branches={branchLocations}
                    employees={employeeLivePoints}
                    height="min(480px, 60vh)"
                  />
                  <p className="text-xs text-slate-600">
                    Bản đồ chỉ hiển thị marker chi nhánh và nhân viên có vị trí hợp lệ — lược bỏ mọi điểm khác. Trang tự làm mới vị trí mỗi 30 giây.
                    {branchesPending.length > 0 ? ` ${branchesPending.length} chi nhánh đang chờ xác định toạ độ.` : ''}
                  </p>
                </div>
              )
            )}

            {mapSectionTab === 'list' && (
              mapPoints.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">Chưa có điểm nào trên bản đồ.</p>
              ) : (
                <ul className="divide-y divide-slate-100 max-h-[min(480px,60vh)] overflow-y-auto rounded-lg border border-slate-200">
                  {mapPoints.map((loc) => {
                    const href = mapOpenHref(loc);
                    const hasGeo = Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng));
                    const coordsLabel = hasGeo ? `${Number(loc.lat).toFixed(5)}, ${Number(loc.lng).toFixed(5)}` : '';
                    return (
                      <li key={loc.key} className="px-3 py-2.5 hover:bg-slate-50 flex items-start gap-2">
                        <MapPin className={`h-4 w-4 shrink-0 mt-0.5 ${loc.type === 'branch' ? 'text-indigo-500' : 'text-sky-500'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 truncate">{loc.label}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {loc.type === 'branch' ? 'Chi nhánh' : loc.online ? 'Đang online' : 'Offline'}
                            {loc.address ? ` · ${loc.address}` : ''}
                            {!hasGeo ? ' · (chưa có toạ độ)' : coordsLabel ? ` · ${coordsLabel}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {loc.type === 'branch' && isAdmin ? (
                            <button
                              type="button"
                              onClick={() => void regeocodeBranch(loc.id, { clearCache: true })}
                              className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 hover:underline"
                              title="Xác định lại toạ độ chi nhánh từ địa chỉ / map URL (xóa cache geocode)"
                            >
                              Sửa toạ độ
                            </button>
                          ) : null}
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-400 hover:text-slate-700"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
            )}

            {mapSectionTab === 'missing' && (
              employeesWithoutLocation.length === 0 ? (
                <p className="text-sm text-emerald-700 py-6 text-center font-medium">
                  Tất cả nhân viên trong bộ lọc đã có vị trí ghi nhận.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {employeesWithoutLocation.length} nhân viên chưa có vị trí hợp lệ ({mapEmployeeScope === 'online' ? 'đang online' : 'trong bộ lọc'}).
                    Nhắc mở app/web → Cài đặt → <strong>Vị trí làm việc</strong> → «Cập nhật ngay» và cho phép định vị.
                  </p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-[min(480px,60vh)] overflow-y-auto">
                    {employeesWithoutLocation.map((u) => (
                      <li
                        key={u.id}
                        className="text-[11px] text-slate-700 px-2 py-1.5 rounded border border-slate-100 bg-slate-50 truncate"
                        title={u.email || ''}
                      >
                        <span className="font-medium">{u.full_name || u.email}</span>
                        <span className={u.online ? ' text-emerald-600' : ' text-slate-400'}>
                          {u.online ? ' · online' : ' · offline'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            )}
          </div>
        </div>
        )}

        {filter === 'auth_log' && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <History className="h-4 w-4 text-sky-600" />
                Lịch sử đăng nhập / đăng xuất
                <span className="text-[11px] font-normal text-slate-500">
                  (chi tiết đến giây)
                </span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={authDays}
                  onChange={(e) => setAuthDays(Number(e.target.value))}
                  className="h-8 px-2 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  <option value={1}>Hôm nay & hôm qua</option>
                  <option value={3}>3 ngày qua</option>
                  <option value={7}>7 ngày qua</option>
                  <option value={30}>30 ngày qua</option>
                </select>
                <select
                  value={authEventFilter}
                  onChange={(e) => setAuthEventFilter(e.target.value)}
                  className="h-8 px-2 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  <option value="all">Tất cả sự kiện</option>
                  <option value="login_success">Đăng nhập thành công</option>
                  <option value="login_failed">Đăng nhập sai</option>
                  <option value="logout,auto_logout_midnight,session_expired">Đăng xuất</option>
                  <option value="token_invalid">Token lỗi</option>
                  <option value="password_changed">Đổi mật khẩu</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadAuthEvents()}
                  disabled={authLoading}
                  className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${authLoading ? 'animate-spin' : ''}`} />
                  Tải lại
                </button>
              </div>
            </div>

            {authError && (
              <div className="px-4 py-3 text-xs text-amber-900 bg-amber-50 border-b border-amber-200">
                {authError}
              </div>
            )}

            {authLoading && authSessions.length === 0 ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
              </div>
            ) : authSessions.length === 0 ? (
              <div className="text-center py-12 text-sm text-slate-500">
                Chưa có sự kiện đăng nhập trong khoảng thời gian này.
                <p className="mt-1 text-[11px] text-slate-400">
                  Nếu bảng <code className="text-rose-600">auth_event_log</code> chưa tồn tại,
                  chạy migration <code>database/241_auth_event_log.sql</code> trên Supabase SQL Editor.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 sticky top-0">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2">Thời gian</th>
                      <th className="text-left font-semibold px-3 py-2">Nhân viên</th>
                      <th className="text-left font-semibold px-3 py-2">Sự kiện</th>
                      <th className="text-left font-semibold px-3 py-2">Thiết bị / IP</th>
                      <th className="text-left font-semibold px-3 py-2">Phiên</th>
                      <th className="text-left font-semibold px-3 py-2">Lý do</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {authSessions.map((ev, idx) => {
                      const meta = AUTH_EVENT_META[ev.event] || { label: ev.event, tone: 'bg-slate-100 text-slate-700 border-slate-200', Icon: Activity };
                      const u = userMap.get(String(ev.user_id));
                      const name = u?.full_name || ev.email || (ev.user_id ? `User ${String(ev.user_id).slice(0, 8)}…` : '(không xác định)');
                      const EventIcon = meta.Icon;
                      return (
                        <tr key={`${ev.id || idx}`} className="hover:bg-slate-50">
                          <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px] text-slate-700">
                            {formatAtSeconds(ev.occurred_at)}
                            <div className="text-[10px] text-slate-400">{formatRelativeTime(ev.occurred_at)}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-slate-800 truncate max-w-[180px]">{name}</div>
                            {ev.email ? <div className="text-[10px] text-slate-500 truncate max-w-[180px]">{ev.email}</div> : null}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold ${meta.tone}`}>
                              <EventIcon className="h-3 w-3" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-slate-700 truncate max-w-[180px]" title={ev.device_name || ''}>
                              {ev.device_name || ev.platform || '—'}
                            </div>
                            {ev.ip ? <div className="text-[10px] text-slate-500 font-mono">{ev.ip}</div> : null}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {ev.login_at && ev.event !== 'login_success' ? (
                              <>
                                <div className="text-[10px] text-slate-500">Login: <span className="font-mono">{formatAtSeconds(ev.login_at)}</span></div>
                                <div className="font-semibold text-slate-700">
                                  {ev.still_open ? <span className="text-emerald-700">Còn mở · </span> : null}
                                  {formatDurationMs(ev.duration_ms)}
                                </div>
                              </>
                            ) : ev.still_open ? (
                              <span className="text-emerald-700 font-semibold">Còn mở · {formatDurationMs(ev.duration_ms)}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                            {ev.session_id ? <div className="text-[9px] text-slate-400 font-mono truncate max-w-[120px]">{ev.session_id}</div> : null}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {ev.reason || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {filter === 'auth_log' ? null : loading && rows.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        ) : displayRows.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">
            {filter === 'online' ? 'Chưa có ai đang hoạt động trong bộ lọc này.' : 'Không có nhân viên phù hợp.'}
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {displayRows.map((u) => (
              <li
                key={u.id}
                className={`rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
                  u.online ? 'border-emerald-200' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white ${avatarColor(u.full_name || u.email)}`}
                    >
                      {u.avatar ? (
                        <img src={u.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        getInitials(u.full_name || u.email)
                      )}
                    </div>
                    <OnlineStatusDot online={u.online} className="absolute -bottom-0.5 -right-0.5" size="md" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 truncate">{u.full_name || u.email}</p>
                    <p className="text-xs text-slate-500 truncate">{u.email}</p>
                    <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{u.department?.name || '—'}</span>
                      {u.role && (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      )}
                    </p>
                    <p className={`text-[11px] mt-1.5 font-medium ${u.online ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {u.online ? 'Đang hoạt động' : `Offline · ${formatRelativeTime(u.last_ping_at)}`}
                    </p>
                    {(() => {
                      const loc = resolveUserLocation(u);
                      if (!loc) return null;
                      const label = loc.address || `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
                      return (
                        <p className="text-[11px] mt-1 text-slate-600 flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-sky-600 shrink-0" />
                          <span className="truncate" title={label}>
                            {label}
                          </span>
                        </p>
                      );
                    })()}
                    {Array.isArray(u.devices) && u.devices.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {u.devices.slice(0, 4).map((d, idx) => (
                          <DeviceBadge key={`${d.platform}-${idx}`} device={d} />
                        ))}
                        {u.devices.length > 4 ? (
                          <span className="text-[10px] text-slate-400 font-semibold self-center">
                            +{u.devices.length - 4}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {(() => {
                      const loc = resolveUserLocation(u);
                      if (!loc) return null;
                      const href = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
                      const label = loc.address || 'Xem vị trí trên bản đồ';
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-700 hover:text-sky-900 hover:underline"
                        >
                          <MapPin className="h-3 w-3" />
                          {label}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      );
                    })()}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    disabled={chatLoadingId === u.id || String(u.id) === String(uid)}
                    onClick={() => void startDirectChat(u)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 disabled:opacity-50"
                  >
                    {chatLoadingId === u.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MessageCircle className="h-3.5 w-3.5" />
                    )}
                    Nhắn tin
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
