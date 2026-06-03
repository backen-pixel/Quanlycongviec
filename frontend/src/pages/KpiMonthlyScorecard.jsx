import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatVND } from '../lib/utils';
import { loadXlsxStyle } from '../lib/xlsxLoader';
import {
  Download, RefreshCw, AlertTriangle, Trophy, Award, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Search, Building2, Filter, Users, Target, Gauge, TrendingUp,
} from 'lucide-react';
import { KPI_SETTINGS_ROLE_FILTER_OPTIONS } from '../lib/kpiRoleApplies';

const EVENT_LABELS = {
  task_completed: 'Task hoàn thành',
  stage_changed: 'Chuyển stage',
  lead_converted: 'Lead → Deal',
  deal_won: 'Chốt HĐ',
  deal_lost: 'Deal mất',
  sla_breach: 'Vi phạm SLA',
  manual: 'Thủ công',
};
const EVENT_COLORS = {
  task_completed: 'bg-blue-500/15 text-blue-300',
  stage_changed: 'bg-indigo-500/15 text-indigo-300',
  lead_converted: 'bg-teal-500/15 text-teal-300',
  deal_won: 'bg-emerald-500/15 text-emerald-300',
  deal_lost: 'bg-rose-500/15 text-rose-300',
  sla_breach: 'bg-orange-500/15 text-orange-300',
  manual: 'bg-slate-600/40 text-slate-300',
};

// Nhãn nhóm KPI theo group_code (khớp seed database/148_crm_kpi_schema.sql).
const GROUP_LABELS = {
  A: 'Nhóm A — Tốc độ phản hồi',
  B: 'Nhóm B — Tỷ lệ chuyển đổi',
  C: 'Nhóm C — Kết quả kinh doanh',
};
const GROUP_ACCENT = {
  A: 'text-sky-300',
  B: 'text-violet-300',
  C: 'text-emerald-300',
};

// Bảng màu avatar theo index để dễ phân biệt nhân viên.
const AVATAR_COLORS = [
  '#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899',
  '#8b5cf6', '#10b981', '#ef4444', '#3b82f6', '#a855f7',
];

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function DealScoreRow({ item }) {
  const [open, setOpen] = useState(false);
  const lead = item.lead;
  const pts = item.total_points;
  return (
    <>
      <tr className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40 cursor-pointer text-sm" onClick={() => setOpen((v) => !v)}>
        <td className="px-3 py-2">
          {lead ? (
            <div>
              <Link to={`/crm/leads/${lead.id}`} className="text-sky-400 hover:underline font-medium" onClick={(e) => e.stopPropagation()}>
                {lead.code || lead.title || lead.id.slice(0, 8)}
              </Link>
              {lead.title && lead.code && <div className="text-xs text-slate-500 truncate max-w-[160px]">{lead.title}</div>}
            </div>
          ) : <span className="text-xs text-slate-500">{item.lead_id.slice(0, 8)}</span>}
        </td>
        <td className="px-3 py-2 text-xs">
          {lead?.stage?.is_won && <span className="bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5 rounded-full">Đã ký HĐ</span>}
          {lead?.stage?.is_lost && <span className="bg-rose-500/15 text-rose-300 px-1.5 py-0.5 rounded-full">Mất</span>}
          {!lead?.stage?.is_won && !lead?.stage?.is_lost && <span className="text-slate-400">{lead?.stage?.name || '—'}</span>}
        </td>
        <td className="px-3 py-2 text-xs text-right text-slate-400">{lead?.estimated_value ? formatVND(lead.estimated_value) : '—'}</td>
        <td className="px-3 py-2 text-right">
          <span className="text-xs text-emerald-400">+{item.plus_points.toFixed(1)}</span>
          {item.minus_points < 0 && <span className="text-xs text-rose-400 ml-1">{item.minus_points.toFixed(1)}</span>}
        </td>
        <td className="px-3 py-2 text-right font-bold">
          <span className={pts > 0 ? 'text-emerald-300' : pts < 0 ? 'text-rose-400' : 'text-slate-400'}>
            {pts > 0 ? '+' : ''}{pts.toFixed(1)}
          </span>
        </td>
        <td className="px-2 py-2 text-center text-slate-500">{open ? <ChevronUp className="h-3.5 w-3.5 mx-auto" /> : <ChevronDown className="h-3.5 w-3.5 mx-auto" />}</td>
      </tr>
      {open && item.events.length > 0 && (
        <tr className="bg-slate-800/40"><td colSpan={6} className="px-4 py-2">
          <div className="space-y-1">
            {item.events.map((ev, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {ev.on_time === true && <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />}
                {ev.on_time === false && <XCircle className="h-3 w-3 text-rose-400 flex-shrink-0" />}
                {ev.on_time === null && <span className="w-3 h-3 flex-shrink-0" />}
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${EVENT_COLORS[ev.event_type] || 'bg-slate-700 text-slate-300'}`}>{EVENT_LABELS[ev.event_type] || ev.event_type}</span>
                {ev.kpi_code && <span className="text-slate-400">KPI {ev.kpi_code}</span>}
                <span className={`font-semibold ml-auto ${Number(ev.points) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {Number(ev.points) > 0 ? '+' : ''}{Number(ev.points).toFixed(1)} điểm
                </span>
              </div>
            ))}
          </div>
        </td></tr>
      )}
    </>
  );
}

function UserDealScorePanel({ userId, periodStart }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get('/kpi/deal-scores', { params: { user_id: userId, period_start: periodStart } })
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [userId, periodStart]);
  if (loading) return <div className="py-4 text-center text-xs text-slate-500">Đang tải…</div>;
  if (!data || !data.deals?.length) return <div className="py-4 text-center text-xs text-slate-500">Chưa có điểm ledger trong kỳ này.</div>;
  return (
    <div>
      <div className="flex items-center gap-4 text-xs mb-2 px-1">
        <span className="text-emerald-400 font-semibold">+{data.summary.total_plus?.toFixed(1)} điểm</span>
        {data.summary.total_minus < 0 && <span className="text-rose-400 font-semibold">{data.summary.total_minus?.toFixed(1)} điểm</span>}
        <span className="font-bold text-slate-300 border-l border-slate-700 pl-3">
          Tổng: <span className={data.summary.total_net >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
            {data.summary.total_net > 0 ? '+' : ''}{data.summary.total_net?.toFixed(1)}
          </span>
        </span>
      </div>
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-700">
          <tr>
            <th className="text-left px-3 py-1.5">Deal</th>
            <th className="text-left px-3 py-1.5">Stage</th>
            <th className="text-right px-3 py-1.5">Giá trị</th>
            <th className="text-right px-3 py-1.5">Cộng/Trừ</th>
            <th className="text-right px-3 py-1.5">Tổng</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>{data.deals.map((item) => <DealScoreRow key={item.lead_id} item={item} />)}</tbody>
      </table>
    </div>
  );
}

function getDefaultPeriodStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
}

function fmtKpi(score) {
  const v = score?.actual_value;
  if (v == null) return '—';
  if (score.formula_type === 'revenue') return formatVND(v);
  if (score.formula_type === 'duration') {
    if (score.unit === 'day') return `${(Math.round(v * 10) / 10)} ngày`;
    if (score.unit === 'minute') return `${Math.round(v)} phút`;
  }
  if (score.unit === '%') return `${Math.round(v * 100) / 100}%`;
  if (score.unit === 'count') return Math.round(v);
  return Math.round(v * 100) / 100;
}

// Tông màu pill ô điểm theo tỉ lệ điểm / trọng số (dark theme).
function cellPillClass(scoreEntry) {
  const v = scoreEntry?.capped_score;
  const w = scoreEntry?.weight_used;
  if (v == null || w == null || w === 0) return 'bg-slate-800 text-slate-500';
  const ratio = v / w;
  if (ratio >= 1) return 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25';
  if (ratio >= 0.8) return 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/25';
  return 'bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/25';
}

function StatCard({ icon: Icon, accent, label, value, descriptor, descriptorTone }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${accent}`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      </div>
      <p className="text-3xl font-bold leading-none text-white tabular-nums">{value}</p>
      {descriptor && (
        <p className={`text-[11px] ${descriptorTone || 'text-slate-500'}`}>{descriptor}</p>
      )}
    </div>
  );
}

export default function KpiMonthlyScorecard() {
  const { user } = useAuth();
  const isManager = ['admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'administrator', 'region_admin'].includes(String(user?.role || '').toLowerCase());
  const [periodStart, setPeriodStart] = useState(getDefaultPeriodStart());
  const [filter, setFilter] = useState({ companyId: '', departmentId: '', q: '', role: '' });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [defs, setDefs] = useState([]);
  const [err, setErr] = useState(null);
  const [activeTab, setActiveTab] = useState('scorecard');
  const [expandedUser, setExpandedUser] = useState(null);

  // ── Dữ liệu cho bộ lọc tối (công ty / phòng ban) ──
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    api.get('/companies').then((r) => setCompanies(r.data?.companies || r.data || [])).catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    if (!filter.companyId) { setDepartments([]); return undefined; }
    let cancelled = false;
    api.get('/departments', { params: { company_id: filter.companyId } })
      .then((r) => { if (!cancelled) setDepartments(r.data?.departments || r.data || []); })
      .catch(() => { if (!cancelled) setDepartments([]); });
    return () => { cancelled = true; };
  }, [filter.companyId]);

  const load = useCallback(async () => {
    if (!isManager) return;
    setLoading(true);
    setErr(null);
    try {
      const params = {
        period_start: periodStart,
        ...(filter.companyId ? { company_id: filter.companyId } : {}),
        ...(filter.departmentId ? { department_id: filter.departmentId } : {}),
        ...(filter.q?.trim() ? { q: filter.q.trim() } : {}),
        ...(filter.role ? { roles: filter.role } : {}),
      };
      const [{ data: d1 }, { data: d2 }] = await Promise.all([
        api.get('/kpi/scorecard', { params }),
        api.get('/kpi/definitions'),
      ]);
      setData(d1);
      setDefs(d2.definitions || []);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [isManager, periodStart, filter]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [periodStart]);

  const sortedDefs = useMemo(() => [...defs].sort((a, b) => a.code.localeCompare(b.code)), [defs]);

  // Gom KPI theo group_code để render header nhóm cột.
  const groupedDefs = useMemo(() => {
    const groups = [];
    const byCode = new Map();
    sortedDefs.forEach((d) => {
      const g = d.group_code || '?';
      if (!byCode.has(g)) {
        const entry = { code: g, label: GROUP_LABELS[g] || `Nhóm ${g}`, items: [] };
        byCode.set(g, entry);
        groups.push(entry);
      }
      byCode.get(g).items.push(d);
    });
    return groups;
  }, [sortedDefs]);

  const usersSorted = useMemo(() => {
    if (!data?.users) return [];
    return [...data.users].sort((a, b) => (b.total_score ?? -1) - (a.total_score ?? -1));
  }, [data]);

  const stats = useMemo(() => {
    const users = usersSorted;
    const n = users.length;
    const scored = users.filter((u) => u.total_score != null);
    const avg = scored.length ? scored.reduce((s, u) => s + Number(u.total_score || 0), 0) / scored.length : 0;
    const passCount = scored.filter((u) => Number(u.total_score) >= 80).length;
    let cells = 0; let hit = 0;
    users.forEach((u) => (u.scores || []).forEach((s) => {
      if (s.weight_used) { cells += 1; if ((s.capped_score / s.weight_used) >= 1) hit += 1; }
    }));
    return {
      n,
      avg: Math.round(avg * 10) / 10,
      passCount,
      passPct: n ? Math.round((passCount / n) * 100) : 0,
      completion: cells ? Math.round((hit / cells) * 100) : 0,
    };
  }, [usersSorted]);

  const handleExport = async () => {
    if (!data?.users) return;
    const XLSX = await loadXlsxStyle();

    const flatDefs = groupedDefs.flatMap((g) => g.items);
    const NFIXED = 5; // Nhân viên · Email · Vai trò · Tổng điểm · Gating
    const NCOLS = NFIXED + flatDefs.length * 2;
    const period = periodStart.slice(0, 7);

    // ---- Bảng màu & style dùng chung ----
    const BORDER = { style: 'thin', color: { rgb: 'CBD5E1' } };
    const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
    const GROUP_FILL = { A: '0EA5E9', B: '8B5CF6', C: '10B981' };
    const blankRow = () => new Array(NCOLS).fill('');

    // ---- Dựng dữ liệu dạng mảng (AOA) ----
    const aoa = [];

    // Hàng 0: tiêu đề lớn
    const rTitle = blankRow();
    rTitle[0] = 'BẢNG ĐIỂM KPI THÁNG';
    aoa.push(rTitle);

    // Hàng 1: phụ đề (kỳ + thời điểm xuất)
    const rSub = blankRow();
    rSub[0] = `Bộ phận Tủ bếp · Kinh doanh (SAE)   —   Kỳ ${period}   —   Xuất lúc ${new Date().toLocaleString('vi-VN')}`;
    aoa.push(rSub);

    // Hàng 2: thống kê nhanh
    const rStat = blankRow();
    rStat[0] = `Nhân viên: ${stats.n}    •    Đạt ≥80đ: ${stats.passCount} (${stats.passPct}%)    •    Điểm TB: ${stats.avg}    •    Hoàn thành: ${stats.completion}%`;
    aoa.push(rStat);

    // Hàng 3: header nhóm
    const rGroup = blankRow();
    rGroup[0] = 'Nhân viên';
    rGroup[1] = 'Email';
    rGroup[2] = 'Vai trò';
    rGroup[3] = 'Tổng điểm';
    rGroup[4] = 'Gating';
    const groupSpans = [];
    let col = NFIXED;
    groupedDefs.forEach((g) => {
      const start = col;
      rGroup[start] = (g.label || `Nhóm ${g.code}`).toUpperCase();
      col += g.items.length * 2;
      groupSpans.push({ code: g.code, start, end: col - 1 });
    });
    aoa.push(rGroup);

    // Hàng 4: mã KPI + trọng số (gộp 2 cột mỗi KPI)
    const rCode = blankRow();
    col = NFIXED;
    flatDefs.forEach((d) => {
      rCode[col] = `${d.code}${d.weight != null ? `  (TS ${d.weight})` : ''}`;
      col += 2;
    });
    aoa.push(rCode);

    // Hàng 5: phụ đề cột (Thực tế / Điểm)
    const rLeaf = blankRow();
    col = NFIXED;
    flatDefs.forEach(() => {
      rLeaf[col] = 'Thực tế';
      rLeaf[col + 1] = 'Điểm';
      col += 2;
    });
    aoa.push(rLeaf);

    // Hàng 6+: dữ liệu nhân viên (theo thứ tự xếp hạng như trên màn hình)
    const DATA_START = aoa.length;
    usersSorted.forEach((u) => {
      const scoreMap = Object.fromEntries((u.scores || []).map((s) => [s.kpi_code, s]));
      const row = blankRow();
      row[0] = u.user?.full_name || '—';
      row[1] = u.user?.email || '';
      row[2] = u.user?.role || '';
      row[3] = u.total_score == null ? '' : Number(u.total_score);
      row[4] = u.gating_triggered ? `Vi phạm ${u.gating_kpi || ''}`.trim() : '';
      col = NFIXED;
      flatDefs.forEach((d) => {
        const s = scoreMap[d.code];
        row[col] = s ? fmtKpi(s) : '—';
        row[col + 1] = s?.capped_score == null ? '' : Number(s.capped_score);
        col += 2;
      });
      aoa.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // ---- Gộp ô (merges) ----
    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: NCOLS - 1 } }, // tiêu đề
      { s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS - 1 } }, // phụ đề
      { s: { r: 2, c: 0 }, e: { r: 2, c: NCOLS - 1 } }, // thống kê
    ];
    // 5 cột cố định: gộp dọc qua 3 hàng header (3,4,5)
    for (let c = 0; c < NFIXED; c += 1) merges.push({ s: { r: 3, c }, e: { r: 5, c } });
    // nhãn nhóm: gộp ngang trên hàng 3
    groupSpans.forEach((g) => merges.push({ s: { r: 3, c: g.start }, e: { r: 3, c: g.end } }));
    // mã KPI: gộp 2 cột trên hàng 4
    col = NFIXED;
    flatDefs.forEach(() => { merges.push({ s: { r: 4, c: col }, e: { r: 4, c: col + 1 } }); col += 2; });
    ws['!merges'] = merges;

    // ---- Độ rộng cột ----
    const cols = [
      { wch: 24 }, { wch: 26 }, { wch: 14 }, { wch: 11 }, { wch: 16 },
    ];
    flatDefs.forEach(() => { cols.push({ wch: 13 }, { wch: 8 }); });
    ws['!cols'] = cols;

    // ---- Chiều cao hàng ----
    ws['!rows'] = [{ hpt: 30 }, { hpt: 18 }, { hpt: 18 }, { hpt: 22 }, { hpt: 22 }, { hpt: 18 }];

    // ---- Áp style cho từng ô ----
    const setStyle = (r, c, style) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = style;
    };

    const titleStyle = {
      font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1E293B' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    const subStyle = {
      font: { italic: true, sz: 10, color: { rgb: '475569' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    const statStyle = {
      font: { bold: true, sz: 10, color: { rgb: '334155' } },
      fill: { fgColor: { rgb: 'F1F5F9' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    const fixedHeadStyle = {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '334155' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: ALL_BORDERS,
    };
    const leafHeadStyle = {
      font: { bold: true, sz: 9, color: { rgb: '334155' } },
      fill: { fgColor: { rgb: 'E2E8F0' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: ALL_BORDERS,
    };

    // Hàng tiêu đề / phụ đề / thống kê
    for (let c = 0; c < NCOLS; c += 1) {
      setStyle(0, c, titleStyle);
      setStyle(1, c, subStyle);
      setStyle(2, c, statStyle);
    }
    // 5 cột cố định trên header
    for (let c = 0; c < NFIXED; c += 1) setStyle(3, c, fixedHeadStyle);
    // nhãn nhóm
    groupSpans.forEach((g) => {
      const gs = {
        font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: GROUP_FILL[g.code] || '64748B' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: ALL_BORDERS,
      };
      for (let c = g.start; c <= g.end; c += 1) setStyle(3, c, gs);
    });
    // mã KPI (hàng 4) + phụ đề cột (hàng 5) cho phần cố định + KPI
    for (let c = NFIXED; c < NCOLS; c += 1) {
      setStyle(4, c, {
        font: { bold: true, sz: 10, color: { rgb: '1E293B' } },
        fill: { fgColor: { rgb: 'F8FAFC' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: ALL_BORDERS,
      });
      setStyle(5, c, leafHeadStyle);
    }

    // Style ô dữ liệu
    const cellTone = (s) => {
      const v = s?.capped_score;
      const w = s?.weight_used;
      if (v == null || w == null || w === 0) return null;
      const ratio = v / w;
      if (ratio >= 1) return { fill: 'DCFCE7', text: '166534' };
      if (ratio >= 0.8) return { fill: 'FEF3C7', text: '92400E' };
      return { fill: 'FEE2E2', text: '991B1B' };
    };

    usersSorted.forEach((u, i) => {
      const r = DATA_START + i;
      const zebra = i % 2 === 1 ? 'F8FAFC' : 'FFFFFF';
      const scoreMap = Object.fromEntries((u.scores || []).map((s) => [s.kpi_code, s]));

      // Tên nhân viên
      setStyle(r, 0, {
        font: { bold: true, sz: 10, color: { rgb: '0F172A' } },
        fill: { fgColor: { rgb: zebra } },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: ALL_BORDERS,
      });
      // Email, Vai trò
      [1, 2].forEach((c) => setStyle(r, c, {
        font: { sz: 10, color: { rgb: '475569' } },
        fill: { fgColor: { rgb: zebra } },
        alignment: { horizontal: c === 2 ? 'center' : 'left', vertical: 'center' },
        border: ALL_BORDERS,
      }));
      // Tổng điểm — tô theo ngưỡng
      const ts = u.total_score;
      let tsFill = zebra; let tsText = '0F172A';
      if (ts != null) {
        if (ts >= 80) { tsFill = 'DCFCE7'; tsText = '166534'; }
        else if (ts >= 60) { tsFill = 'FEF3C7'; tsText = '92400E'; }
        else { tsFill = 'FEE2E2'; tsText = '991B1B'; }
      }
      const tsAddr = XLSX.utils.encode_cell({ r, c: 3 });
      if (ws[tsAddr]) ws[tsAddr].z = '0.0';
      setStyle(r, 3, {
        font: { bold: true, sz: 11, color: { rgb: tsText } },
        fill: { fgColor: { rgb: tsFill } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: ALL_BORDERS,
        numFmt: '0.0',
      });
      // Gating
      setStyle(r, 4, {
        font: { sz: 9, color: { rgb: u.gating_triggered ? '991B1B' : '94A3B8' } },
        fill: { fgColor: { rgb: u.gating_triggered ? 'FEE2E2' : zebra } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: ALL_BORDERS,
      });
      // Các ô KPI
      let cc = NFIXED;
      flatDefs.forEach((d) => {
        const s = scoreMap[d.code];
        const tone = cellTone(s);
        setStyle(r, cc, {
          font: { sz: 9, color: { rgb: '334155' } },
          fill: { fgColor: { rgb: zebra } },
          alignment: { horizontal: 'right', vertical: 'center' },
          border: ALL_BORDERS,
        });
        const scoreAddr = XLSX.utils.encode_cell({ r, c: cc + 1 });
        if (ws[scoreAddr] && typeof ws[scoreAddr].v === 'number') ws[scoreAddr].z = '0.0';
        setStyle(r, cc + 1, {
          font: { bold: true, sz: 10, color: { rgb: tone ? tone.text : '94A3B8' } },
          fill: { fgColor: { rgb: tone ? tone.fill : zebra } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: ALL_BORDERS,
          numFmt: '0.0',
        });
        cc += 2;
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `KPI ${period}`);
    XLSX.writeFile(wb, `KPI_TuBep_${period}.xlsx`);
  };

  if (!isManager) {
    return (
      <div className="min-h-screen bg-slate-950 p-6">
        <div className="max-w-2xl mx-auto bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-sm text-amber-300">
          Bạn không có quyền xem scorecard tổng. Liên hệ quản lý / admin.
        </div>
      </div>
    );
  }

  const inputDark = 'bg-slate-800 border border-slate-700 text-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60 placeholder:text-slate-500';
  // Select dùng nền sáng + chữ đen để đọc rõ cả khi đóng lẫn khi mở danh sách option.
  const selectLight = 'bg-white border border-slate-300 text-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ color: '#ffffff' }}>Bảng điểm KPI tháng</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="month"
              value={periodStart.slice(0, 7)}
              onChange={(e) => setPeriodStart(`${e.target.value}-01`)}
              className="px-3 py-2 bg-white border border-slate-300 text-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60 [color-scheme:light]"
            />
            <button onClick={load} disabled={loading} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Đang tính…' : 'Tính lại'}
            </button>
            <button
              onClick={handleExport}
              disabled={!data?.users?.length}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Download className="w-4 h-4" /> Xuất Excel
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={Users}
            accent="bg-sky-500/15 text-sky-300"
            label="Nhân viên"
            value={stats.n}
            descriptor="Đang hoạt động"
          />
          <StatCard
            icon={Target}
            accent="bg-emerald-500/15 text-emerald-300"
            label="KPI đạt ≥80đ"
            value={stats.passCount}
            descriptor={`${stats.passPct}% tổng số`}
            descriptorTone="text-emerald-400"
          />
          <StatCard
            icon={Gauge}
            accent="bg-indigo-500/15 text-indigo-300"
            label="Điểm TB nhóm"
            value={`${stats.avg}đ`}
            descriptor={data ? `${stats.n} nhân viên` : '—'}
          />
          <StatCard
            icon={TrendingUp}
            accent="bg-amber-500/15 text-amber-300"
            label="Tỷ lệ hoàn thành"
            value={`${stats.completion}%`}
            descriptor={stats.completion >= 80 ? 'Tốt' : stats.completion >= 60 ? 'Khá' : 'Cần cải thiện'}
            descriptorTone={stats.completion >= 80 ? 'text-emerald-400' : stats.completion >= 60 ? 'text-amber-400' : 'text-rose-400'}
          />
        </div>

        {/* Filter row */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Công ty</span>
              <div className="relative">
                <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <select
                  value={filter.companyId}
                  onChange={(e) => setFilter((f) => ({ ...f, companyId: e.target.value, departmentId: '' }))}
                  className={`w-full pl-8 pr-2 py-2 ${selectLight} cursor-pointer`}
                >
                  <option value="">Tất cả</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Phòng ban</span>
              <select
                value={filter.departmentId}
                onChange={(e) => setFilter((f) => ({ ...f, departmentId: e.target.value }))}
                disabled={!filter.companyId}
                className={`w-full px-2 py-2 ${selectLight} cursor-pointer disabled:opacity-50`}
              >
                <option value="">Tất cả</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Vai trò</span>
              <select
                value={filter.role || ''}
                onChange={(e) => setFilter((f) => ({ ...f, role: e.target.value }))}
                className={`w-full px-2 py-2 ${selectLight} cursor-pointer`}
              >
                {KPI_SETTINGS_ROLE_FILTER_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tìm kiếm</span>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    value={filter.q}
                    onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
                    placeholder="Tên / email…"
                    className={`w-full pl-8 pr-2 py-2 ${inputDark}`}
                  />
                </div>
                <button
                  onClick={load}
                  disabled={loading}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
                  {loading ? 'Đang tính…' : 'Lọc'}
                </button>
              </div>
            </label>
          </div>
        </div>

        {err && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-3 text-sm text-rose-300">
            Lỗi: {err}
          </div>
        )}

        {/* Tabs + count */}
        {data && (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
              {[
                { id: 'scorecard', label: '15 KPI × Nhân viên' },
                { id: 'deal-scores', label: 'Điểm từng Deal (Ledger)' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    activeTab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">{data.users.length} nhân viên trong kết quả</p>
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-6 py-12 flex flex-col items-center justify-center gap-3 text-center">
            <RefreshCw className="w-9 h-9 text-indigo-400 animate-spin" />
            <div className="text-base font-semibold text-white">Đang tính toán KPI cho từng nhân viên…</div>
            <div className="text-sm text-slate-400">Hệ thống đang tổng hợp dữ liệu và chấm điểm. Quá trình có thể mất 30–60 giây, vui lòng đợi.</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-indigo-300">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Vui lòng không đóng trang trong khi đang tính
            </div>
          </div>
        ) : data && activeTab === 'scorecard' ? (
          <div className={`rounded-xl border border-slate-800 bg-slate-900/70 overflow-x-auto ${usersSorted.length > 10 ? 'max-h-[640px] overflow-y-auto' : ''}`}>
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="sticky top-0 z-20">
                {/* Hàng nhóm KPI */}
                <tr className="bg-slate-900">
                  <th className="sticky left-0 z-30 bg-slate-900 border-b border-slate-800 px-3 py-2 text-left" />
                  <th className="sticky left-[200px] z-30 bg-slate-900 border-b border-slate-800 px-3 py-2 text-left" />
                  {groupedDefs.map((g) => (
                    <th
                      key={g.code}
                      colSpan={g.items.length}
                      className={`border-b border-l border-slate-800 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide whitespace-nowrap ${GROUP_ACCENT[g.code] || 'text-slate-300'}`}
                    >
                      {g.label}
                    </th>
                  ))}
                </tr>
                {/* Hàng mã KPI + trọng số */}
                <tr className="bg-slate-900 text-[11px] text-slate-400 uppercase">
                  <th className="sticky left-0 z-30 bg-slate-900 border-b border-slate-800 px-3 py-3 text-left">Nhân viên</th>
                  <th className="sticky left-[200px] z-30 bg-slate-900 border-b border-slate-800 px-3 py-3 text-right">Tổng</th>
                  {groupedDefs.map((g) => g.items.map((d, i) => (
                    <th
                      key={d.code}
                      className={`border-b border-slate-800 px-3 py-3 text-right whitespace-nowrap ${i === 0 ? 'border-l border-slate-800' : ''}`}
                      title={d.name}
                    >
                      <div className="text-slate-200 font-semibold">{d.code}</div>
                      <div className="font-normal text-[10px] text-slate-500">TS {d.weight}</div>
                    </th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {usersSorted.map((u, idx) => {
                  const scoreMap = Object.fromEntries((u.scores || []).map((s) => [s.kpi_code, s]));
                  const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                  return (
                    <tr key={u.user?.id || idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="sticky left-0 z-10 bg-slate-900 border-b border-slate-800 px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                            style={{ backgroundColor: avatarColor }}
                          >
                            {getInitials(u.user?.full_name)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-100 flex items-center gap-1 truncate">
                              {idx < 3 && <Trophy className={`w-3.5 h-3.5 shrink-0 ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-slate-300' : 'text-amber-600'}`} />}
                              {u.user?.full_name || '—'}
                            </div>
                            <div className="text-xs text-slate-500">{u.user?.role}</div>
                          </div>
                        </div>
                      </td>
                      <td className="sticky left-[200px] z-10 bg-slate-900 border-b border-slate-800 px-3 py-2 text-right font-semibold">
                        <span className={u.gating_triggered ? 'text-rose-400' : 'text-white'}>
                          {u.total_score == null ? '—' : `${u.total_score}đ`}
                        </span>
                        {u.gating_triggered && (
                          <div className="text-[10px] text-rose-400 flex items-center gap-1 justify-end">
                            <AlertTriangle className="w-3 h-3" /> Cap 70
                          </div>
                        )}
                      </td>
                      {groupedDefs.map((g) => g.items.map((d, i) => {
                        const s = scoreMap[d.code];
                        return (
                          <td
                            key={d.code}
                            className={`border-b border-slate-800 px-2 py-2 text-right whitespace-nowrap ${i === 0 ? 'border-l border-slate-800/70' : ''}`}
                          >
                            <span className={`inline-flex flex-col items-end rounded-md px-2 py-1 min-w-[3rem] ${cellPillClass(s)}`}>
                              <span className="text-xs font-semibold leading-tight">{s ? fmtKpi(s) : '—'}</span>
                              <span className="text-[10px] opacity-80 leading-tight">
                                {s?.capped_score == null ? '' : `${s.capped_score}đ`}
                              </span>
                            </span>
                          </td>
                        );
                      }))}
                    </tr>
                  );
                })}
                {usersSorted.length === 0 && (
                  <tr>
                    <td colSpan={sortedDefs.length + 2} className="text-center text-slate-500 py-12">
                      Không có nhân viên nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : data && activeTab === 'deal-scores' ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Award className="w-4 h-4 text-violet-300" />
              <h2 className="font-semibold text-slate-100">Điểm từng Deal theo nhân viên (CRM Ledger)</h2>
            </div>
            <p className="text-xs text-slate-400">Điểm được ghi tự động từ DB triggers khi task hoàn thành, chuyển stage, chốt / mất deal. Click vào dòng nhân viên để xem chi tiết.</p>
            <div className={`space-y-3 ${usersSorted.length > 10 ? 'max-h-[640px] overflow-y-auto pr-1' : ''}`}>
              {usersSorted.map((u, idx) => (
                <div key={u.user?.id || idx} className="border border-slate-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedUser(expandedUser === (u.user?.id || idx) ? null : (u.user?.id || idx))}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/40 hover:bg-slate-800/70 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                        style={{ backgroundColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
                      >
                        {getInitials(u.user?.full_name)}
                      </div>
                      {idx < 3 && <Trophy className={`w-4 h-4 ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-slate-300' : 'text-amber-600'}`} />}
                      <span className="font-medium text-slate-100">{u.user?.full_name || '—'}</span>
                      <span className="text-xs text-slate-500">{u.user?.role}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-400">
                        KPI 15-chỉ số: <strong className={u.gating_triggered ? 'text-rose-400' : 'text-slate-100'}>{u.total_score ?? '—'}đ</strong>
                      </span>
                      {expandedUser === (u.user?.id || idx)
                        ? <ChevronUp className="h-4 w-4 text-slate-500" />
                        : <ChevronDown className="h-4 w-4 text-slate-500" />}
                    </div>
                  </button>
                  {expandedUser === (u.user?.id || idx) && u.user?.id && (
                    <div className="px-4 pb-4 pt-2">
                      <UserDealScorePanel userId={u.user.id} periodStart={periodStart} />
                    </div>
                  )}
                </div>
              ))}
              {usersSorted.length === 0 && (
                <div className="text-center text-slate-500 py-8 text-sm">Không có nhân viên nào.</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
