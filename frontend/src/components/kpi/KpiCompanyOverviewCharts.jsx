import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity } from 'lucide-react';
import { formatVND } from '../../lib/utils';

export function fmtNumber(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: digits });
}

function formatMonthLabel(periodStart) {
  if (!periodStart) return '';
  const d = new Date(`${periodStart}T00:00:00Z`);
  return d.toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' });
}

function resolveRowFromBarClick(entry) {
  if (!entry) return null;
  const d = entry.payload !== undefined ? entry.payload : entry;
  return d?.row ?? null;
}

/** API company-overview không trả `unit`; suy ra từ mã KPI + formula_type. */
export function formatKpiActualDisplay(code, actual, formulaType, unit) {
  if (actual == null) return '—';
  if (formulaType === 'revenue' || code === 'C1' || code === 'C2') return formatVND(actual);
  if (code === 'C3' || code === 'A6') return String(Math.round(actual));
  if (formulaType === 'duration') {
    const u = unit || (code === 'B5' ? 'day' : 'minute');
    if (u === 'day') return `${fmtNumber(actual, 1)} ngày`;
    return `${Math.round(actual)} phút`;
  }
  if (unit === 'count') return String(Math.round(actual));
  if (unit === '%' || formulaType === 'increasing' || formulaType === 'decreasing') {
    return `${fmtNumber(actual, 2)}%`;
  }
  return fmtNumber(actual, 2);
}

function trendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="font-semibold text-gray-900">{formatMonthLabel(p.period_start)}</div>
      <div className="mt-1 text-gray-700">
        Điểm TB: <span className="font-mono font-semibold">{fmtNumber(p.avg_total, 2)}</span>
      </div>
      <div className="text-gray-500">NV có điểm trong kỳ: {p.user_count ?? '—'}</div>
    </div>
  );
}

/** Xu hướng điểm KPI trung bình theo tháng (Recharts). */
export function KpiTrendLineChart({ trend }) {
  const data = useMemo(() => {
    if (!trend?.length) return [];
    return trend.map((t) => ({
      ...t,
      label: formatMonthLabel(t.period_start),
    }));
  }, [trend]);

  if (!data.length) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-400">
        Chưa có dữ liệu xu hướng
      </div>
    );
  }

  const maxVal = Math.max(120, ...data.map((d) => d.avg_total || 0));

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Activity className="h-4 w-4 text-blue-600" />
          Xu hướng điểm KPI trung bình
        </h3>
        <span className="text-xs text-gray-500">{data.length} kỳ gần nhất</span>
      </div>
      <div className="h-72 w-full min-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#6b7280" />
            <YAxis
              domain={[0, Math.ceil(maxVal / 10) * 10]}
              tick={{ fontSize: 11 }}
              stroke="#6b7280"
              width={36}
            />
            <Tooltip content={trendTooltip} />
            <ReferenceLine y={100} stroke="#10b981" strokeDasharray="4 4" label={{ value: '100 đ', fill: '#059669', fontSize: 10 }} />
            <Line type="monotone" dataKey="avg_total" name="Điểm TB" stroke="#2563eb" strokeWidth={2} dot={{ r: 4, fill: '#2563eb' }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function truncateName(name, max = 22) {
  if (!name) return '—';
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/** Xếp hạng điểm tổng — bar ngang. */
export function KpiRankingBarChart({ rows, onSelectUser }) {
  const [showAll, setShowAll] = useState(false);
  const topN = 15;

  const data = useMemo(() => {
    const sorted = [...(rows || [])].sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
    const slice = showAll || sorted.length <= topN ? sorted : sorted.slice(0, topN);
    return slice.map((r) => ({
      name: truncateName(r.user.full_name || r.user.email),
      fullName: r.user.full_name || r.user.email,
      score: r.total_score ?? 0,
      userId: r.user.id,
      row: r,
    }));
  }, [rows, showAll, topN]);

  if (!data.length) {
    return <div className="rounded-xl border border-gray-100 bg-white p-4 text-center text-sm text-gray-400">Không có nhân viên</div>;
  }

  const rankingTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
        <div className="font-semibold text-gray-900">{p.fullName}</div>
        <div className="mt-1 font-mono text-gray-700">Tổng điểm: {fmtNumber(p.score, 1)}</div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Xếp hạng điểm tổng</h3>
        {(rows || []).length > topN && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            {showAll ? `Chỉ top ${topN}` : 'Hiện tất cả'}
          </button>
        )}
      </div>
      <div style={{ height: `${Math.min(480, Math.max(200, 28 + data.length * 26))}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={data} margin={{ top: 4, right: 24, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
            <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 11 }} stroke="#6b7280" />
            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} stroke="#6b7280" />
            <Tooltip content={rankingTooltip} />
            <Bar
              dataKey="score"
              fill="#3b82f6"
              radius={[0, 4, 4, 0]}
              cursor="pointer"
              onClick={(entry) => {
                const row = resolveRowFromBarClick(entry);
                if (row) onSelectUser?.(row);
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Điểm theo nhóm A / B / C — stacked. */
export function KpiGroupStackedBarChart({ rows, onSelectUser }) {
  const topN = 15;
  const data = useMemo(() => {
    const sorted = [...(rows || [])].sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
    return sorted.slice(0, topN).map((r) => ({
      name: truncateName(r.user.full_name || r.user.email, 18),
      fullName: r.user.full_name || r.user.email,
      A: r.group_totals?.A ?? 0,
      B: r.group_totals?.B ?? 0,
      C: r.group_totals?.C ?? 0,
      row: r,
    }));
  }, [rows]);

  if (!data.length) {
    return <div className="rounded-xl border border-gray-100 bg-white p-4 text-center text-sm text-gray-400">Không có nhân viên</div>;
  }

  const stackTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p0 = payload[0]?.payload;
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
        <div className="font-semibold text-gray-900">{p0?.fullName}</div>
        {payload.map((pl) => (
          <div key={pl.dataKey} className="text-gray-700">
            <span style={{ color: pl.color }}>{pl.name}</span>: {fmtNumber(pl.value, 1)} đ
          </div>
        ))}
      </div>
    );
  };

  const barH = Math.min(420, 40 + data.length * 26);

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Đóng góp nhóm A · B · C (top {topN})</h3>
      <div className="w-full" style={{ height: barH }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={data} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
            <XAxis type="number" tick={{ fontSize: 11 }} stroke="#6b7280" />
            <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10 }} stroke="#6b7280" />
            <Tooltip content={stackTooltip} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="A"
              stackId="g"
              fill="#f59e0b"
              name="Nhóm A"
              cursor="pointer"
              onClick={(entry) => {
                const row = resolveRowFromBarClick(entry);
                if (row) onSelectUser?.(row);
              }}
            />
            <Bar
              dataKey="B"
              stackId="g"
              fill="#10b981"
              name="Nhóm B"
              cursor="pointer"
              onClick={(entry) => {
                const row = resolveRowFromBarClick(entry);
                if (row) onSelectUser?.(row);
              }}
            />
            <Bar
              dataKey="C"
              stackId="g"
              fill="#a855f7"
              name="Nhóm C"
              radius={[0, 4, 4, 0]}
              cursor="pointer"
              onClick={(entry) => {
                const row = resolveRowFromBarClick(entry);
                if (row) onSelectUser?.(row);
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function rowStatusKey(r) {
  if (r.gating) return 'gating';
  if (r.total_score >= 100) return 'elite';
  if (r.total_score >= 80) return 'good';
  if (r.total_score >= 60) return 'warning';
  if (r.total_score > 0) return 'weak';
  return 'no_data';
}

const STATUS_META = {
  elite: { label: 'Xuất sắc (≥100)', color: '#059669' },
  good: { label: 'Tốt (80–99)', color: '#2563eb' },
  warning: { label: 'Cần cải thiện (60–79)', color: '#d97706' },
  weak: { label: 'Yếu (1–59)', color: '#dc2626' },
  gating: { label: 'Gating', color: '#991b1b' },
  no_data: { label: 'Chưa có điểm', color: '#9ca3af' },
};

/** Phân bố NV theo mức điểm (cột). */
export function KpiStatusDistributionBarChart({ rows }) {
  const data = useMemo(() => {
    const counts = { elite: 0, good: 0, warning: 0, weak: 0, gating: 0, no_data: 0 };
    for (const r of rows || []) {
      counts[rowStatusKey(r)] += 1;
    }
    return Object.keys(STATUS_META).map((key) => ({
      key,
      name: STATUS_META[key].label,
      count: counts[key],
      fill: STATUS_META[key].color,
    }));
  }, [rows]);

  if (!(rows || []).length) {
    return <div className="rounded-xl border border-gray-100 bg-white p-4 text-center text-sm text-gray-400">Không có nhân viên</div>;
  }

  const tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
        <div className="font-semibold">{p.name}</div>
        <div>{p.count} nhân viên</div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Phân bố theo trạng thái điểm</h3>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={56} stroke="#6b7280" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#6b7280" width={32} />
            <Tooltip content={tip} />
            <Bar dataKey="count" name="Số NV" radius={[4, 4, 0, 0]}>
              {data.map((e) => (
                <Cell key={e.key} fill={e.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Donut nhỏ cùng dữ liệu phân bố (tùy chọn hiển thị cạnh cột). */
export function KpiStatusPieChart({ rows }) {
  const pieData = useMemo(() => {
    const counts = { elite: 0, good: 0, warning: 0, weak: 0, gating: 0, no_data: 0 };
    for (const r of rows || []) {
      counts[rowStatusKey(r)] += 1;
    }
    return Object.keys(STATUS_META)
      .map((key) => ({
        key,
        name: STATUS_META[key].label,
        value: counts[key],
        fill: STATUS_META[key].color,
      }))
      .filter((d) => d.value > 0);
  }, [rows]);

  if (!pieData.length) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Tỷ lệ trạng thái</h3>
        <div className="flex h-52 items-center justify-center text-sm text-gray-400">Chưa có NV để phân tích</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Tỷ lệ trạng thái</h3>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2}>
              {pieData.map((e) => (
                <Cell key={e.key} fill={e.fill} />
              ))}
            </Pie>
            <Tooltip formatter={(v, n) => [`${v} NV`, n]} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function barColorForRatio(ratio) {
  if (ratio == null) return '#d1d5db';
  const r = Math.min(1.2, ratio);
  if (r >= 1) return '#10b981';
  if (r >= 0.85) return '#34d399';
  if (r >= 0.7) return '#fbbf24';
  if (r >= 0.5) return '#fb923c';
  return '#f87171';
}

/** Bar từng KPI trong modal chi tiết NV. */
export function UserKpiDetailBarChart({ user, definitions }) {
  const data = useMemo(() => {
    if (!user || !definitions?.length) return [];
    return definitions.map((d) => {
      const s = user.scores_by_code?.[d.code];
      return {
        code: d.code,
        short: d.code,
        name: d.name,
        capped: s?.capped ?? 0,
        weight: s?.weight ?? d.weight,
        ratio: s?.ratio,
        actual: s?.actual,
        target: s?.target,
        formula_type: d.formula_type,
        unit: d.unit,
      };
    });
  }, [user, definitions]);

  const tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
        <div className="font-semibold text-gray-900">
          {p.code} — {p.name}
        </div>
        <div className="mt-1 space-y-0.5 text-gray-700">
          <div>
            Điểm: <span className="font-mono font-semibold">{fmtNumber(p.capped, 1)}</span> / weight {fmtNumber(p.weight, 1)}
          </div>
          {p.ratio != null && <div>% đạt (so weight): {Math.round(Math.min(1.2, p.ratio) * 100)}%</div>}
          <div>Thực tế: {formatKpiActualDisplay(p.code, p.actual, p.formula_type, p.unit)}</div>
          <div>Mục tiêu: {formatKpiActualDisplay(p.code, p.target, p.formula_type, p.unit)}</div>
        </div>
      </div>
    );
  };

  if (!data.length) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Điểm từng KPI</h4>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="code" tick={{ fontSize: 10 }} stroke="#6b7280" />
            <YAxis tick={{ fontSize: 10 }} stroke="#6b7280" width={28} />
            <Tooltip content={tip} />
            <Bar dataKey="capped" name="Điểm" radius={[4, 4, 0, 0]}>
              {data.map((e) => (
                <Cell key={e.code} fill={barColorForRatio(e.ratio)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Ô heatmap có tooltip đầy đủ (title nhiều dòng). */
export function HeatmapCellRich({ ratio, kpiCode, kpiName, score, definition }) {
  if (ratio == null) {
    return <div className="flex h-7 w-10 items-center justify-center rounded bg-gray-100" title="Không có dữ liệu" />;
  }
  const r = Math.min(1.2, ratio);
  let bg = 'bg-red-200';
  let text = 'text-red-800';
  if (r >= 1) {
    bg = 'bg-emerald-300';
    text = 'text-emerald-900';
  } else if (r >= 0.85) {
    bg = 'bg-emerald-100';
    text = 'text-emerald-800';
  } else if (r >= 0.7) {
    bg = 'bg-amber-100';
    text = 'text-amber-800';
  } else if (r >= 0.5) {
    bg = 'bg-orange-200';
    text = 'text-orange-900';
  }

  const lines = [
    `${kpiName || kpiCode} (${kpiCode})`,
    `% đạt (capped/weight): ${(r * 100).toFixed(0)}%`,
  ];
  if (score) {
    lines.push(`Thực tế: ${formatKpiActualDisplay(kpiCode, score.actual, definition?.formula_type, definition?.unit)}`);
    lines.push(`Mục tiêu: ${formatKpiActualDisplay(kpiCode, score.target, definition?.formula_type, definition?.unit)}`);
    lines.push(`Điểm: ${fmtNumber(score.capped, 1)} / weight ${fmtNumber(score.weight ?? definition?.weight, 1)}`);
  }

  return (
    <div
      className={`flex h-7 w-10 items-center justify-center rounded text-[10px] font-mono ${bg} ${text}`}
      title={lines.join('\n')}
    >
      {(r * 100).toFixed(0)}
    </div>
  );
}
