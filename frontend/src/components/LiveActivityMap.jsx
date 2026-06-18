import { useEffect, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polygon,
  Tooltip,
  LayersControl,
  useMap,
} from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import { Building2, ExternalLink, Laptop, Loader2, MessageCircle, Monitor, Smartphone } from 'lucide-react';
import { getInitials } from '../lib/utils';

/**
 * Bản đồ live trang Activity — marker NV theo trạng thái:
 *   xanh lá: online + đã bật định vị (current_location)
 *   vàng: online nhưng chưa bật định vị
 *   xám: offline (vị trí cuối nếu có)
 */

const DEFAULT_CENTER = [16.047079, 108.20623];
const VN_BOUNDS = L.latLngBounds([6.0, 101.5], [24.0, 118.0]);

const HOANG_SA_POLYGON = [
  [17.20, 111.00],
  [17.20, 113.10],
  [15.45, 113.10],
  [15.45, 111.00],
];

const TRUONG_SA_POLYGON = [
  [12.00, 109.50],
  [12.00, 117.50],
  [6.50, 117.50],
  [6.50, 109.50],
];

const HOANG_SA_CENTER = [16.50, 112.00];
const TRUONG_SA_CENTER = [9.60, 114.00];

const SOVEREIGNTY_STYLE = {
  color: '#dc2626',
  weight: 1.5,
  opacity: 0.9,
  fillColor: '#fecaca',
  fillOpacity: 0.18,
  dashArray: '6 4',
  interactive: false,
};

const MARKER_STYLES = {
  green: { bg: '#10b981', ring: '#a7f3d0', ping: true },
  yellow: { bg: '#f59e0b', ring: '#fde68a', ping: true },
  gray: { bg: '#64748b', ring: '#cbd5e1', ping: false },
};

const PLATFORM_META = {
  android: { Icon: Smartphone, label: 'Android', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  ios: { Icon: Smartphone, label: 'iOS', color: 'text-slate-700 bg-slate-50 border-slate-200' },
  web: { Icon: Monitor, label: 'Web', color: 'text-sky-700 bg-sky-50 border-sky-200' },
  desktop: { Icon: Laptop, label: 'Desktop', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
};

function platformInfo(p) {
  return PLATFORM_META[p] || { Icon: Monitor, label: p || 'Khác', color: 'text-slate-600 bg-slate-50 border-slate-200' };
}

const sovereigntyLabelIcon = (text) =>
  L.divIcon({
    html: `<div class="lam-sov-label"><span class="lam-sov-label__flag">🇻🇳</span><span>${text}</span></div>`,
    className: 'lam-sov-label-wrap',
    iconSize: [180, 22],
    iconAnchor: [90, 11],
  });

function isInVietnam(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (Math.abs(la) < 0.0001 && Math.abs(ln) < 0.0001) return false;
  return la >= 6.0 && la <= 24.0 && ln >= 101.5 && ln <= 118.0;
}

function makeBranchIcon() {
  return L.divIcon({
    html: `
      <div class="lam-pin" style="--bg:#4f46e5;--ring:#c7d2fe">
        <span class="lam-pin__core lam-pin__emoji">🏢</span>
      </div>
    `,
    className: 'lam-pin-wrap',
    iconSize: [34, 34],
    iconAnchor: [17, 30],
    popupAnchor: [0, -28],
  });
}

function makeInitialsIcon(initials, markerStatus) {
  const style = MARKER_STYLES[markerStatus] || MARKER_STYLES.gray;
  const safe = String(initials || '?').slice(0, 2).toUpperCase();
  return L.divIcon({
    html: `
      <div class="lam-pin" style="--bg:${style.bg};--ring:${style.ring}">
        ${style.ping ? '<span class="lam-pin__ping"></span>' : ''}
        <span class="lam-pin__core lam-pin__initials">${safe}</span>
      </div>
    `,
    className: 'lam-pin-wrap',
    iconSize: [34, 34],
    iconAnchor: [17, 30],
    popupAnchor: [0, -28],
  });
}

const branchIcon = makeBranchIcon();

function FitBounds({ points, fallback }) {
  const map = useMap();
  const prevKey = useRef('');
  useEffect(() => {
    if (!map) return;
    const valid = (points || []).filter((p) => isInVietnam(p?.lat, p?.lng));
    const key = valid.map((p) => `${p.key || ''}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
    if (key === prevKey.current) return;
    prevKey.current = key;
    if (valid.length === 0) {
      map.fitBounds(VN_BOUNDS, { animate: false });
      map.setView(fallback || DEFAULT_CENTER, 5);
      return;
    }
    if (valid.length === 1) {
      map.setView([valid[0].lat, valid[0].lng], 15);
      return;
    }
    const bounds = L.latLngBounds(valid.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds.pad(0.2), { animate: true, maxZoom: 16 });
  }, [map, points, fallback]);
  return null;
}

function formatTime(iso) {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Vừa xong';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} phút trước`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} giờ trước`;
  return new Date(iso).toLocaleString('vi-VN');
}

function statusLabel(markerStatus) {
  if (markerStatus === 'green') return '● Online · có vị trí';
  if (markerStatus === 'yellow') return '● Online · chưa bật định vị';
  return '○ Offline';
}

function PopupDeviceChip({ device }) {
  const { Icon, label, color } = platformInfo(device.platform);
  return (
    <span
      title={device.device_name || label}
      className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded border text-[9px] font-semibold ${color} ${
        device.online ? '' : 'opacity-55'
      }`}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate max-w-[56px]">{device.device_name || label}</span>
      {device.online ? <span className="w-1 h-1 rounded-full bg-emerald-500 shrink-0" /> : null}
    </span>
  );
}

function EmployeeMapPopup({ point, onMessage, messagingUserId }) {
  const gmaps = Number.isFinite(point.lat) && Number.isFinite(point.lng)
    ? `https://www.google.com/maps?q=${point.lat},${point.lng}`
    : null;
  const busy = messagingUserId != null && String(messagingUserId) === String(point.userId);

  return (
    <div className="lam-popup lam-popup--employee">
      <div className="flex items-start gap-2.5">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 shadow-sm ring-2 ring-white ${
            point.markerStatus === 'green'
              ? 'bg-emerald-500'
              : point.markerStatus === 'yellow'
                ? 'bg-amber-500'
                : 'bg-slate-500'
          }`}
        >
          {getInitials(point.label || point.email)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="lam-popup__title truncate">{point.label || 'Nhân viên'}</div>
          {point.email ? <div className="lam-popup__meta truncate">{point.email}</div> : null}
          <div className="lam-popup__meta flex items-center gap-1 mt-0.5">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{point.department || '—'}</span>
          </div>
          <div
            className={`text-[10px] font-semibold mt-1 ${
              point.markerStatus === 'green'
                ? 'text-emerald-700'
                : point.markerStatus === 'yellow'
                  ? 'text-amber-700'
                  : 'text-slate-500'
            }`}
          >
            {statusLabel(point.markerStatus)}
            {point.captured_at && point.hasRealLocation ? ` · ${formatTime(point.captured_at)}` : ''}
          </div>
        </div>
      </div>

      {point.isFallbackPosition ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-900">
          Chưa bật định vị làm việc — vị trí trên bản đồ chỉ mang tính gợi ý nhóm.
        </div>
      ) : point.address ? (
        <div className="mt-2 text-[11px] text-slate-700 leading-snug">{point.address}</div>
      ) : point.hasRealLocation ? (
        <div className="mt-2 text-[10px] text-slate-500 font-mono">
          {Number(point.lat).toFixed(5)}, {Number(point.lng).toFixed(5)}
        </div>
      ) : null}

      {Array.isArray(point.devices) && point.devices.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {point.devices.slice(0, 4).map((d, idx) => (
            <PopupDeviceChip key={`${d.platform}-${idx}`} device={d} />
          ))}
          {point.devices.length > 4 ? (
            <span className="text-[9px] text-slate-400 self-center">+{point.devices.length - 4}</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center gap-2">
        {onMessage ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onMessage(point)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
            Nhắn tin
          </button>
        ) : null}
        {gmaps && point.hasRealLocation && !point.isFallbackPosition ? (
          <a
            href={gmaps}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 hover:underline"
          >
            Maps
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function BranchMapPopup({ point }) {
  const gmaps = `https://www.google.com/maps?q=${point.lat},${point.lng}`;
  return (
    <div className="lam-popup">
      <div className="lam-popup__title">🏢 {point.label || 'Chi nhánh'}</div>
      {point.address ? <div className="lam-popup__meta">{point.address}</div> : null}
      <div className="lam-popup__meta mt-2">
        <a href={gmaps} target="_blank" rel="noreferrer" className="lam-popup__link">
          Mở Google Maps ↗
        </a>
      </div>
    </div>
  );
}

export default function LiveActivityMap({
  branches = [],
  employees = [],
  height = 420,
  fallbackCenter = DEFAULT_CENTER,
  onMessageUser,
  messagingUserId = null,
}) {
  const heightStyle = typeof height === 'number' ? `${height}px` : String(height);
  const iconCache = useRef(new Map());

  const branchPoints = useMemo(
    () =>
      (branches || [])
        .filter((x) => isInVietnam(x?.lat, x?.lng))
        .map((x) => ({
          ...x,
          lat: Number(x.lat),
          lng: Number(x.lng),
          type: 'branch',
          key: x.key || `branch:${x.id || x.label}`,
        })),
    [branches],
  );

  const employeePoints = useMemo(
    () =>
      (employees || [])
        .filter((x) => isInVietnam(x?.lat, x?.lng))
        .map((x) => ({
          ...x,
          lat: Number(x.lat),
          lng: Number(x.lng),
          type: 'employee',
          key: x.key || `employee:${x.userId || x.id || x.label}`,
          initials: getInitials(x.label || x.email),
        })),
    [employees],
  );

  const allPoints = useMemo(() => [...branchPoints, ...employeePoints], [branchPoints, employeePoints]);

  const getEmployeeIcon = (point) => {
    const cacheKey = `${point.markerStatus}:${point.initials}`;
    if (!iconCache.current.has(cacheKey)) {
      iconCache.current.set(cacheKey, makeInitialsIcon(point.initials, point.markerStatus));
    }
    return iconCache.current.get(cacheKey);
  };

  return (
    <div className="lam-root rounded-lg overflow-hidden border border-slate-200" style={{ height: heightStyle }}>
      <style>{`
        .lam-pin-wrap { background: transparent !important; border: none !important; }
        .lam-pin { position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; }
        .lam-pin__core {
          position: relative; z-index: 2;
          width: 28px; height: 28px; border-radius: 50%;
          background: var(--bg); color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; line-height: 1;
          box-shadow: 0 1px 6px rgba(15, 23, 42, .35), 0 0 0 3px var(--ring);
        }
        .lam-pin__initials { font-size: 10px; font-weight: 800; letter-spacing: -0.02em; }
        .lam-pin__emoji { font-size: 13px; line-height: 1; }
        .lam-pin__ping {
          position: absolute; inset: 0;
          border-radius: 50%; background: var(--bg);
          opacity: .35; animation: lam-ping 1.6s ease-out infinite;
        }
        @keyframes lam-ping {
          0% { transform: scale(.85); opacity: .55; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .lam-popup { font-size: 12px; min-width: 220px; max-width: 280px; }
        .lam-popup--employee { padding: 2px 0; }
        .lam-popup__title { font-weight: 700; color: #0f172a; font-size: 13px; }
        .lam-popup__meta { color: #64748b; margin-top: 2px; font-size: 11px; }
        .lam-popup__link { color: #0369a1; text-decoration: underline; }
        .leaflet-container { font-family: inherit; }
        .leaflet-popup-content { margin: 10px 12px; }
        .marker-cluster-small, .marker-cluster-medium, .marker-cluster-large {
          background: rgba(16, 185, 129, 0.25) !important;
        }
        .marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div {
          background: rgba(5, 150, 105, 0.92) !important;
          color: #fff !important;
          font-weight: 700 !important;
        }
        .lam-sov-label-wrap { background: transparent !important; border: none !important; }
        .lam-sov-label {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 999px;
          background: rgba(220, 38, 38, .92); color: #fff;
          font-size: 11px; font-weight: 700; white-space: nowrap;
          box-shadow: 0 1px 4px rgba(15, 23, 42, .35);
          border: 1px solid #fee2e2;
        }
        .lam-sov-label__flag { font-size: 12px; line-height: 1; }
        .lam-sov-tooltip {
          background: rgba(220, 38, 38, .92) !important;
          color: #fff !important;
          border: 1px solid #fee2e2 !important;
          font-weight: 700 !important;
          font-size: 11px !important;
        }
        .lam-sov-tooltip::before { display: none !important; }
      `}</style>
      <MapContainer
        center={fallbackCenter}
        zoom={5}
        minZoom={5}
        maxZoom={19}
        maxBounds={VN_BOUNDS}
        maxBoundsViscosity={1.0}
        scrollWheelZoom
        worldCopyJump={false}
        className="w-full h-full"
        style={{ height: '100%', width: '100%' }}
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Bản đồ Việt Nam (CARTO)">
            <TileLayer
              attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> · &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Quần đảo Hoàng Sa &amp; Trường Sa thuộc chủ quyền Việt Nam'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              subdomains={['a', 'b', 'c', 'd']}
              noWrap
              bounds={VN_BOUNDS}
              minZoom={5}
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="OpenStreetMap">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Quần đảo Hoàng Sa &amp; Trường Sa thuộc chủ quyền Việt Nam'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              noWrap
              bounds={VN_BOUNDS}
              minZoom={5}
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Vệ tinh (Esri)">
            <TileLayer
              attribution='Tiles &copy; Esri · Quần đảo Hoàng Sa &amp; Trường Sa thuộc chủ quyền Việt Nam'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              noWrap
              bounds={VN_BOUNDS}
              minZoom={5}
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        <Polygon positions={HOANG_SA_POLYGON} pathOptions={SOVEREIGNTY_STYLE}>
          <Tooltip permanent direction="center" className="lam-sov-tooltip" opacity={1}>
            🇻🇳 Quần đảo Hoàng Sa (Việt Nam)
          </Tooltip>
        </Polygon>
        <Polygon positions={TRUONG_SA_POLYGON} pathOptions={SOVEREIGNTY_STYLE}>
          <Tooltip permanent direction="center" className="lam-sov-tooltip" opacity={1}>
            🇻🇳 Quần đảo Trường Sa (Việt Nam)
          </Tooltip>
        </Polygon>
        <Marker position={HOANG_SA_CENTER} icon={sovereigntyLabelIcon('Hoàng Sa – Việt Nam')} interactive={false} keyboard={false} />
        <Marker position={TRUONG_SA_CENTER} icon={sovereigntyLabelIcon('Trường Sa – Việt Nam')} interactive={false} keyboard={false} />

        <FitBounds points={allPoints} fallback={fallbackCenter} />

        {branchPoints.map((p) => (
          <Marker key={p.key} position={[p.lat, p.lng]} icon={branchIcon}>
            <Popup>
              <BranchMapPopup point={p} />
            </Popup>
          </Marker>
        ))}

        <MarkerClusterGroup
          chunkedLoading
          showCoverageOnHover={false}
          spiderfyOnMaxZoom
          maxClusterRadius={50}
          disableClusteringAtZoom={17}
        >
          {employeePoints.map((p) => (
            <Marker key={p.key} position={[p.lat, p.lng]} icon={getEmployeeIcon(p)}>
              <Popup minWidth={240}>
                <EmployeeMapPopup
                  point={p}
                  onMessage={onMessageUser}
                  messagingUserId={messagingUserId}
                />
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
