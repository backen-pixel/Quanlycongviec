import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, AlertTriangle, Clock, RefreshCw, RotateCcw,
  TrendingUp, Zap, Server, BarChart2, ChevronDown, ChevronUp,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}g ${m}p ${sec}s`;
  if (m > 0) return `${m}p ${sec}s`;
  return `${sec}s`;
}

function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ── Sparkline 60 phút ─────────────────────────────────────── */
function Sparkline({ buckets, height = 48 }) {
  if (!buckets?.length) return null;
  const W = 560; const H = height;
  const max = Math.max(...buckets.map((b) => b.total), 1);
  const step = W / buckets.length;
  const pts = buckets.map((b, i) => {
    const x = i * step + step / 2;
    const y = H - (b.total / max) * (H - 4);
    return `${x},${y}`;
  });
  const errPts = buckets.map((b, i) => {
    const x = i * step + step / 2;
    const y = H - (b.errors / max) * (H - 4);
    return `${x},${y}`;
  });
  const area = `M${pts[0]} ${pts.slice(1).map((p) => `L${p}`).join(' ')} L${W},${H} L0,${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id="spGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spGrad)" />
      <polyline points={pts.join(' ')} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round" />
      <polyline points={errPts.join(' ')} fill="none" stroke="#ef4444" strokeWidth="1" strokeLinejoin="round" strokeDasharray="3 2" />
    </svg>
  );
}

/* ── Mini bar chart (top endpoint) ────────────────────────── */
function Bar({ pct, color = '#6366f1' }) {
  return (
    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden w-full">
      <div style={{ width: `${Math.max(pct, 2)}%`, background: color }} className="h-full rounded-full transition-all duration-300" />
    </div>
  );
}

/* ── Stat card ─────────────────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1 shadow-sm hover:shadow transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

const METHOD_COLOR = {
  GET: 'bg-blue-100 text-blue-700',
  POST: 'bg-green-100 text-green-700',
  PUT: 'bg-yellow-100 text-yellow-700',
  PATCH: 'bg-orange-100 text-orange-700',
  DELETE: 'bg-red-100 text-red-700',
};

export default function RequestMonitorPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sortBy, setSortBy] = useState('count'); // count | errors | avgMs
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');
  const [resetting, setResetting] = useState(false);
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/metrics`, { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => { if (!document.hidden) fetchData(); }, 10_000);
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, fetchData]);

  const handleReset = async () => {
    if (!confirm('Xoá toàn bộ số liệu request? Không thể hoàn tác.')) return;
    setResetting(true);
    try {
      await fetch(`${API}/api/metrics/reset`, { method: 'POST', headers: hdr() });
      await fetchData();
    } finally { setResetting(false); }
  };

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const sortedEndpoints = (() => {
    if (!data?.topEndpoints) return [];
    const filtered = data.topEndpoints.filter(
      (e) => !search || e.endpoint.toLowerCase().includes(search.toLowerCase()),
    );
    return [...filtered].sort((a, b) => {
      const av = a[sortBy]; const bv = b[sortBy];
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  })();

  const maxCount = sortedEndpoints.length ? sortedEndpoints[0].count : 1;

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <ChevronDown className="h-3 w-3 text-gray-300 inline ml-0.5" />;
    return sortDir === 'desc'
      ? <ChevronDown className="h-3 w-3 text-indigo-500 inline ml-0.5" />
      : <ChevronUp className="h-3 w-3 text-indigo-500 inline ml-0.5" />;
  };

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-600" />
            Theo dõi Request API
          </h1>
          {data && (
            <p className="text-xs text-gray-500 mt-0.5">
              Uptime: {fmtUptime(data.uptimeMs)} · Cập nhật lúc{' '}
              {new Date(data.generatedAt).toLocaleTimeString('vi-VN')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Tự động (10s)
          </label>
          <button
            onClick={fetchData}
            disabled={loading}
            className="h-8 px-3 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="h-8 px-3 bg-white border border-red-200 rounded-lg text-xs text-red-600 hover:bg-red-50 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Xoá số liệu
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error === 'HTTP 403' ? 'Bạn cần quyền admin/manager để xem trang này.' : error}
        </div>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Req / phút vừa rồi"
              value={data.reqLastMin.toLocaleString()}
              sub={`5 phút: ${data.reqLast5Min.toLocaleString()}`}
              icon={Zap}
              accent="text-indigo-500"
            />
            <StatCard
              label="60 phút qua"
              value={data.reqLast60Min.toLocaleString()}
              sub={`Trung bình ${Math.round(data.reqLast60Min / 60)}/phút`}
              icon={BarChart2}
              accent="text-blue-500"
            />
            <StatCard
              label="Tổng từ khởi động"
              value={data.globalTotal.toLocaleString()}
              sub={`${data.globalErrors.toLocaleString()} lỗi`}
              icon={Server}
              accent="text-teal-500"
            />
            <StatCard
              label="Tỉ lệ lỗi (5xx)"
              value={`${data.errorRateGlobal}%`}
              sub={`${data.globalErrors} lỗi / ${data.globalTotal} req`}
              icon={AlertTriangle}
              accent={data.errorRateGlobal > 5 ? 'text-red-500' : 'text-gray-400'}
            />
          </div>

          {/* Sparkline 60 phút */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-semibold text-gray-800">Biểu đồ request 60 phút gần nhất</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-indigo-500 inline-block rounded" /> Tổng
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-red-500 inline-block rounded border-dashed border-b" /> Lỗi
                </span>
              </div>
            </div>
            <Sparkline buckets={data.timeBuckets} height={60} />
            {/* X axis labels */}
            <div className="flex justify-between mt-1">
              {[0, 14, 29, 44, 59].map((i) => (
                <span key={i} className="text-[10px] text-gray-400">
                  {data.timeBuckets[i] ? fmtTime(data.timeBuckets[i].ts) : ''}
                </span>
              ))}
            </div>
          </div>

          {/* Top endpoints table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-800">
                  Top endpoints ({sortedEndpoints.length})
                </span>
              </div>
              <input
                type="text"
                placeholder="Tìm endpoint..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 px-2.5 border border-gray-200 rounded-lg text-xs text-gray-700 w-52 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left font-medium w-8">#</th>
                    <th className="px-4 py-2.5 text-left font-medium">Endpoint</th>
                    <th
                      className="px-4 py-2.5 text-right font-medium cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => toggleSort('count')}
                    >
                      Req <SortIcon col="count" />
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium w-36">Tỉ lệ</th>
                    <th
                      className="px-4 py-2.5 text-right font-medium cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => toggleSort('errors')}
                    >
                      Lỗi <SortIcon col="errors" />
                    </th>
                    <th
                      className="px-4 py-2.5 text-right font-medium cursor-pointer hover:text-gray-800 whitespace-nowrap"
                      onClick={() => toggleSort('avgMs')}
                    >
                      TB ms <SortIcon col="avgMs" />
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Lần cuối</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEndpoints.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                        {search ? 'Không tìm thấy endpoint phù hợp' : 'Chưa có dữ liệu — chờ request đầu tiên'}
                      </td>
                    </tr>
                  )}
                  {sortedEndpoints.map((ep, idx) => {
                    const [method, ...pathParts] = ep.endpoint.split(' ');
                    const path = pathParts.join(' ');
                    const pct = Math.round((ep.count / maxCount) * 100);
                    const methodCls = METHOD_COLOR[method] || 'bg-gray-100 text-gray-700';
                    const isHot = pct === 100;
                    return (
                      <tr
                        key={ep.endpoint}
                        className={`border-t border-gray-50 hover:bg-indigo-50/30 transition-colors ${isHot ? 'bg-indigo-50/20' : ''}`}
                      >
                        <td className="px-4 py-2.5 text-gray-400 font-mono">{idx + 1}</td>
                        <td className="px-4 py-2.5 max-w-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${methodCls}`}>
                              {method}
                            </span>
                            <span className="font-mono text-gray-700 truncate" title={path}>{path}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                          {ep.count.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 w-36">
                          <Bar pct={pct} color={isHot ? '#6366f1' : '#a5b4fc'} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {ep.errors > 0 ? (
                            <span className="text-red-600 font-semibold">
                              {ep.errors} <span className="text-red-400 font-normal">({ep.errorRate}%)</span>
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={ep.avgMs > 1000 ? 'text-red-600 font-semibold' : ep.avgMs > 300 ? 'text-yellow-600' : 'text-gray-600'}>
                            {ep.avgMs}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-400 font-mono">
                          {ep.lastSeen ? fmtTime(ep.lastSeen) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {data.topEndpoints?.length >= 30 && (
              <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 text-center">
                Hiển thị 30 endpoint nhiều request nhất
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="text-xs text-gray-400 flex flex-wrap gap-4 pb-2">
            <span>• TB ms <span className="text-yellow-600 font-medium">&gt;300ms</span> cần kiểm tra</span>
            <span>• TB ms <span className="text-red-600 font-medium">&gt;1000ms</span> nghiêm trọng</span>
            <span>• Lỗi 5xx được đánh dấu đỏ</span>
            <span>• Số liệu lưu trong RAM — reset khi khởi động lại server</span>
          </div>
        </>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20 text-gray-400 gap-3">
          <Clock className="h-5 w-5 animate-pulse" />
          <span className="text-sm">Đang tải số liệu...</span>
        </div>
      )}
    </div>
  );
}
