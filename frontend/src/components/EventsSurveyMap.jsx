import { useEffect, useMemo } from 'react';
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
import { ExternalLink, Loader2, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

const DEFAULT_CENTER = [16.047079, 108.20623];
const VN_BOUNDS = L.latLngBounds([6.0, 101.5], [24.0, 118.0]);

/** Quần đảo Hoàng Sa — chủ quyền Việt Nam (khung bao gần đúng) */
const HOANG_SA_POLYGON = [
  [17.20, 111.00],
  [17.20, 113.10],
  [15.45, 113.10],
  [15.45, 111.00],
];

/** Quần đảo Trường Sa — chủ quyền Việt Nam (khung bao gần đúng) */
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

const sovereigntyLabelIcon = (text) =>
  L.divIcon({
    html: `<div class="esm-sov-label"><span class="esm-sov-label__flag">🇻🇳</span><span>${text}</span></div>`,
    className: 'esm-sov-label-wrap',
    iconSize: [180, 22],
    iconAnchor: [90, 11],
  });

function FitBounds({ points }) {
  const map = useMap();
  const key = useMemo(
    () => (points || []).map((p) => `${p.id}:${p.lat},${p.lng}`).join('|'),
    [points],
  );

  useEffect(() => {
    if (!points?.length) {
      map.fitBounds(VN_BOUNDS, { animate: false, padding: [12, 12] });
      map.setView(DEFAULT_CENTER, 5);
      return;
    }
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds.pad(0.18), { maxZoom: 14 });
  }, [map, key, points]);

  return null;
}

function surveyIcon(color, emoji) {
  const bg = color || '#F59E0B';
  return L.divIcon({
    html: `
      <div style="
        width:34px;height:34px;border-radius:50%;
        background:${bg};border:2px solid #fff;
        box-shadow:0 2px 8px rgba(15,23,42,.35);
        display:flex;align-items:center;justify-content:center;
        font-size:15px;line-height:1;
      ">${emoji || '🏠'}</div>
    `,
    className: 'esm-pin-wrap',
    iconSize: [34, 34],
    iconAnchor: [17, 30],
    popupAnchor: [0, -28],
  });
}

function formatWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const STATUS_LABEL = {
  planned: 'Đã lên kế hoạch',
  in_progress: 'Đang thực hiện',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

/**
 * Bản đồ địa điểm khảo sát / đo đạc (points từ GET /events/map).
 */
export default function EventsSurveyMap({
  points = [],
  loading = false,
  stats = null,
  heightClass = 'h-[420px]',
  regions = [],
  regionId = '',
  onRegionChange,
  regionFilterDisabled = false,
}) {
  const icons = useMemo(() => {
    const map = new Map();
    for (const p of points) {
      const key = `${p.event_type_color || ''}|${p.event_type_icon || ''}`;
      if (!map.has(key)) map.set(key, surveyIcon(p.event_type_color, p.event_type_icon));
    }
    return map;
  }, [points]);

  const selectedRegionName = useMemo(() => {
    if (!regionId) return '';
    return regions.find((r) => String(r.id) === String(regionId))?.name || '';
  }, [regions, regionId]);

  const canFilterRegion = typeof onRegionChange === 'function';
  const emptyHint = useMemo(() => {
    if (!stats) return 'Thêm địa điểm khi tạo sự kiện Khảo sát, hoặc địa chỉ trên hồ sơ khách hàng.';
    if ((stats.total || 0) === 0) return 'Không có sự kiện Khảo sát / Đo đạc trong khoảng lọc.';
    if ((stats.no_location || 0) > 0 && (stats.plotted || 0) === 0) {
      return `${stats.no_location} sự kiện thiếu địa chỉ trên form sự kiện (và không có địa chỉ KH).`;
    }
    if ((stats.geocode_failed || 0) > 0 && (stats.plotted || 0) === 0) {
      return `${stats.geocode_failed} sự kiện có địa chỉ nhưng chưa geocode được — thử ghi rõ hơn (VD: số nhà + quận + TP.HCM).`;
    }
    return 'Thêm địa điểm khi tạo sự kiện Khảo sát.';
  }, [stats]);

  return (
    <div className="rounded-xl border border-amber-200/80 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-white flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-amber-600" /> Bản đồ địa điểm khảo sát
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Marker lấy từ địa chỉ trên sự kiện (ưu tiên), hoặc địa chỉ khách hàng.
            {selectedRegionName ? (
              <span className="text-amber-800 font-medium"> · Đang lọc: {selectedRegionName}</span>
            ) : null}
          </p>
        </div>
        {stats && (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-medium">
              {stats.plotted ?? points.length} trên bản đồ
            </span>
            {(stats.no_location > 0 || stats.geocode_failed > 0) && (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600" title="Thiếu địa chỉ hoặc không geocode được">
                {(stats.no_location || 0) + (stats.geocode_failed || 0)} chưa hiện
              </span>
            )}
          </div>
        )}
      </div>

      {canFilterRegion && (
        <div className="px-4 py-2.5 border-b border-amber-50 bg-white flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mr-1">
            Khu vực
          </span>
          <button
            type="button"
            disabled={regionFilterDisabled}
            onClick={() => onRegionChange('')}
            className={`h-7 px-2.5 rounded-md text-[11px] font-medium border transition-colors disabled:opacity-50 ${
              !regionId
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'
            }`}
          >
            Tất cả
          </button>
          {regions.map((rg) => {
            const active = String(regionId) === String(rg.id);
            return (
              <button
                key={rg.id}
                type="button"
                disabled={regionFilterDisabled}
                onClick={() => onRegionChange(active ? '' : String(rg.id))}
                className={`h-7 px-2.5 rounded-md text-[11px] font-medium border transition-colors disabled:opacity-50 ${
                  active
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300'
                }`}
                title="Lọc theo khu vực NV hoặc Lead/Deal"
              >
                {rg.name}
              </button>
            );
          })}
          {!regions.length && !regionFilterDisabled && (
            <span className="text-[11px] text-slate-400">
              Chưa có khu vực cho công ty / khối đang chọn
            </span>
          )}
        </div>
      )}

      <div className={`relative w-full ${heightClass} bg-slate-100`}>
        {loading && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/70">
            <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
          </div>
        )}
        {!loading && points.length === 0 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] max-w-[min(420px,90%)] pointer-events-none">
            <div className="rounded-lg border border-amber-200 bg-white/95 shadow-md px-3 py-2 text-center text-[12px] text-slate-600">
              <p className="font-medium text-slate-800">Chưa có điểm khảo sát trong khoảng lọc</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{emptyHint}</p>
            </div>
          </div>
        )}
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={5}
          minZoom={5}
          maxZoom={19}
          maxBounds={VN_BOUNDS}
          maxBoundsViscosity={1}
          scrollWheelZoom
          className="w-full h-full"
          style={{ height: '100%', width: '100%' }}
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Bản đồ (CARTO)">
              <TileLayer
                attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> · OSM · Quần đảo Hoàng Sa &amp; Trường Sa thuộc chủ quyền Việt Nam'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                subdomains={['a', 'b', 'c', 'd']}
                noWrap
                bounds={VN_BOUNDS}
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="OpenStreetMap">
              <TileLayer
                attribution='&copy; OpenStreetMap · Quần đảo Hoàng Sa &amp; Trường Sa thuộc chủ quyền Việt Nam'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                noWrap
                bounds={VN_BOUNDS}
              />
            </LayersControl.BaseLayer>
          </LayersControl>

          <Polygon positions={HOANG_SA_POLYGON} pathOptions={SOVEREIGNTY_STYLE}>
            <Tooltip permanent direction="center" className="esm-sov-tooltip" opacity={1}>
              Quần đảo Hoàng Sa (Việt Nam)
            </Tooltip>
          </Polygon>
          <Polygon positions={TRUONG_SA_POLYGON} pathOptions={SOVEREIGNTY_STYLE}>
            <Tooltip permanent direction="center" className="esm-sov-tooltip" opacity={1}>
              Quần đảo Trường Sa (Việt Nam)
            </Tooltip>
          </Polygon>
          <Marker
            position={HOANG_SA_CENTER}
            icon={sovereigntyLabelIcon('Hoàng Sa – Việt Nam')}
            interactive={false}
            keyboard={false}
          />
          <Marker
            position={TRUONG_SA_CENTER}
            icon={sovereigntyLabelIcon('Trường Sa – Việt Nam')}
            interactive={false}
            keyboard={false}
          />

          <FitBounds points={points} />

          <MarkerClusterGroup
            chunkedLoading
            showCoverageOnHover={false}
            spiderfyOnMaxZoom
            maxClusterRadius={48}
            disableClusteringAtZoom={16}
          >
            {points.map((p) => {
              const iconKey = `${p.event_type_color || ''}|${p.event_type_icon || ''}`;
              return (
                <Marker
                  key={p.id}
                  position={[p.lat, p.lng]}
                  icon={icons.get(iconKey) || surveyIcon(p.event_type_color, p.event_type_icon)}
                >
                  <Popup minWidth={240}>
                    <div className="text-xs space-y-1.5 min-w-[220px]">
                      <div className="font-bold text-slate-900 text-sm leading-snug">
                        {p.event_type_icon} {p.title}
                      </div>
                      <div className="text-slate-500">
                        {p.event_type_name}
                        {p.status ? ` · ${STATUS_LABEL[p.status] || p.status}` : ''}
                      </div>
                      {p.start_time && (
                        <div className="text-slate-600">🗓 {formatWhen(p.start_time)}</div>
                      )}
                      {(p.location || p.address) && (
                        <div className="text-slate-700">
                          📍 {p.location || p.address}
                          {p.address_source === 'customer' && (
                            <span className="text-slate-400"> (địa chỉ KH)</span>
                          )}
                          {p.address_source === 'event' && p.location && p.address && p.address !== p.location && (
                            <div className="text-[10px] text-slate-400 mt-0.5">{p.address}</div>
                          )}
                        </div>
                      )}
                      {p.customer_name && (
                        <div className="text-slate-600">
                          👤 {p.customer_name}
                          {p.customer_phone ? ` · ${p.customer_phone}` : ''}
                        </div>
                      )}
                      {p.assignee_name && (
                        <div className="text-slate-600">👷 {p.assignee_name}</div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {p.lead_id && (
                          <Link
                            to={`/crm/leads/${p.lead_id}`}
                            className="inline-flex items-center gap-1 text-sky-700 font-semibold underline"
                          >
                            {p.lead_code || 'Hồ sơ'} <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                        <a
                          href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-700 font-semibold underline"
                        >
                          Google Maps <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
        </MapContainer>
      </div>
      <style>{`
        .esm-pin-wrap { background: transparent !important; border: none !important; }
        .leaflet-container { font-family: inherit; z-index: 0; }
        .esm-sov-label-wrap { background: transparent !important; border: none !important; }
        .esm-sov-label {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 999px;
          background: rgba(220, 38, 38, .92); color: #fff;
          font-size: 11px; font-weight: 700; white-space: nowrap;
          box-shadow: 0 1px 4px rgba(15, 23, 42, .35);
          border: 1px solid #fee2e2;
        }
        .esm-sov-label__flag { font-size: 12px; line-height: 1; }
        .esm-sov-tooltip {
          background: rgba(220, 38, 38, .92) !important;
          color: #fff !important;
          border: 1px solid #fee2e2 !important;
          font-weight: 700 !important;
          font-size: 11px !important;
        }
        .esm-sov-tooltip::before { display: none !important; }
      `}</style>
    </div>
  );
}
