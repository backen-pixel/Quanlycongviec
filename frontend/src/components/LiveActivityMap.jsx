import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Bản đồ live của trang Activity:
 *   - Chỉ vẽ marker cho hai loại điểm: chi nhánh (branch) và nhân viên (employee).
 *   - Auto-fit bounds theo dữ liệu, KHÔNG hiển thị bất kỳ POI/place marker mặc định nào khác
 *     (TileLayer OSM raster không tự thêm marker — đảm bảo "lược bỏ các chỉ điểm khác").
 */

const DEFAULT_CENTER = [16.047079, 108.20623]; // Đà Nẵng — fallback nếu chưa có điểm nào.

/**
 * Phạm vi Việt Nam (đất liền + Trường Sa + Hoàng Sa) — đồng bộ với
 * backend/src/helpers/geoBounds.js. User không thể pan ra ngoài vùng này
 * và mọi marker ngoài vùng sẽ không được render.
 */
const VN_BOUNDS = L.latLngBounds([6.0, 101.5], [24.0, 118.0]);

function isInVietnam(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (Math.abs(la) < 0.0001 && Math.abs(ln) < 0.0001) return false;
  return la >= 6.0 && la <= 24.0 && ln >= 101.5 && ln <= 118.0;
}

function makeIcon({ emoji, bg, ring, ping = false }) {
  const inner = `
    <div class="lam-pin" style="--bg:${bg};--ring:${ring}">
      ${ping ? '<span class="lam-pin__ping"></span>' : ''}
      <span class="lam-pin__core">${emoji}</span>
    </div>
  `;
  return L.divIcon({
    html: inner,
    className: 'lam-pin-wrap',
    iconSize: [34, 34],
    iconAnchor: [17, 30],
    popupAnchor: [0, -28],
  });
}

const branchIcon = makeIcon({ emoji: '🏢', bg: '#4f46e5', ring: '#c7d2fe' });
const employeeOnlineIcon = makeIcon({ emoji: '👤', bg: '#10b981', ring: '#a7f3d0', ping: true });
const employeeOfflineIcon = makeIcon({ emoji: '👤', bg: '#64748b', ring: '#cbd5e1' });

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

export default function LiveActivityMap({
  branches = [],
  employees = [],
  height = 420,
  fallbackCenter = DEFAULT_CENTER,
}) {
  const heightStyle = typeof height === 'number' ? `${height}px` : String(height);
  const allPoints = useMemo(() => {
    // Bộ lọc cứng: chỉ giữ marker trong phạm vi Việt Nam.
    const b = (branches || [])
      .filter((x) => isInVietnam(x?.lat, x?.lng))
      .map((x) => ({
        ...x,
        lat: Number(x.lat),
        lng: Number(x.lng),
        type: 'branch',
        key: x.key || `branch:${x.id || x.label}`,
      }));
    const e = (employees || [])
      .filter((x) => isInVietnam(x?.lat, x?.lng))
      .map((x) => ({
        ...x,
        lat: Number(x.lat),
        lng: Number(x.lng),
        type: 'employee',
        key: x.key || `employee:${x.id || x.label}`,
      }));
    return [...b, ...e];
  }, [branches, employees]);

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
        .lam-popup { font-size: 12px; min-width: 200px; }
        .lam-popup__title { font-weight: 700; color: #0f172a; }
        .lam-popup__meta { color: #64748b; margin-top: 2px; }
        .lam-popup__link { color: #0369a1; text-decoration: underline; }
        .leaflet-container { font-family: inherit; }
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
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Việt Nam'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          noWrap
          bounds={VN_BOUNDS}
          minZoom={5}
          maxZoom={19}
        />
        <FitBounds points={allPoints} fallback={fallbackCenter} />
        {allPoints.map((p) => {
          const isBranch = p.type === 'branch';
          const icon = isBranch
            ? branchIcon
            : (p.online ? employeeOnlineIcon : employeeOfflineIcon);
          const gmaps = `https://www.google.com/maps?q=${p.lat},${p.lng}`;
          return (
            <Marker key={p.key} position={[p.lat, p.lng]} icon={icon}>
              <Popup>
                <div className="lam-popup">
                  <div className="lam-popup__title">
                    {isBranch ? '🏢 ' : '👤 '}{p.label || (isBranch ? 'Chi nhánh' : 'Nhân viên')}
                  </div>
                  {p.address ? <div className="lam-popup__meta">{p.address}</div> : null}
                  {!isBranch ? (
                    <div className="lam-popup__meta">
                      {p.online ? 'Đang online' : 'Offline'}
                      {p.captured_at ? ` · ${formatTime(p.captured_at)}` : ''}
                      {p.source ? ` · ${p.source}` : ''}
                    </div>
                  ) : null}
                  <div className="lam-popup__meta">
                    <a href={gmaps} target="_blank" rel="noreferrer" className="lam-popup__link">
                      Mở Google Maps ↗
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
