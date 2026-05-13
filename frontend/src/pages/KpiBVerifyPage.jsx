import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  Search, ArrowRight, CheckCircle, XCircle, AlertTriangle,
  TrendingUp, Clock, RefreshCw, ChevronDown, ChevronRight, Activity,
} from 'lucide-react';
import KpiUserFilter from '../components/KpiUserFilter';

const RANK_LABEL = {
  1: { slug: 'lead_new', label: 'Lead mới', color: 'bg-slate-100 text-slate-700' },
  2: { slug: 'not_contacted', label: 'Không LH', color: 'bg-slate-100 text-slate-700' },
  3: { slug: 'cold', label: 'Lạnh', color: 'bg-blue-100 text-blue-700' },
  4: { slug: 'warm', label: 'Ấm', color: 'bg-amber-100 text-amber-700' },
  5: { slug: 'hot', label: 'Nóng', color: 'bg-red-100 text-red-700' },
  6: { slug: 'survey_scheduled', label: 'Hẹn khảo sát', color: 'bg-cyan-100 text-cyan-700' },
  7: { slug: 'survey_done', label: 'Đã khảo sát', color: 'bg-teal-100 text-teal-700' },
  8: { slug: 'designing', label: 'Thiết kế', color: 'bg-indigo-100 text-indigo-700' },
  9: { slug: 'quoted', label: 'Đã báo giá', color: 'bg-purple-100 text-purple-700' },
  10: { slug: 'negotiating', label: 'Đàm phán', color: 'bg-fuchsia-100 text-fuchsia-700' },
  11: { slug: 'waiting_deposit', label: 'Chờ cọc', color: 'bg-pink-100 text-pink-700' },
  12: { slug: 'contract_signed', label: 'Ký HD', color: 'bg-emerald-100 text-emerald-700' },
  13: { slug: 'producing', label: 'Sản xuất', color: 'bg-emerald-100 text-emerald-700' },
  14: { slug: 'installing', label: 'Lắp đặt', color: 'bg-emerald-100 text-emerald-700' },
  15: { slug: 'completed', label: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-700' },
};

function defaultMonthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
}

function StageBadge({ rank }) {
  if (!rank) return <span className="text-xs text-gray-400">—</span>;
  const info = RANK_LABEL[rank];
  if (!info) return <span className="text-xs text-gray-500">rank {rank}</span>;
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${info.color}`}>
      <span className="font-mono mr-1">#{rank}</span>{info.label}
    </span>
  );
}

function KpiCheck({ contrib, name, kpiCode }) {
  const c = contrib[kpiCode];
  if (kpiCode === 'B5') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-mono text-gray-500 w-7">{kpiCode}</span>
        {c.counts ? (
          <span className="text-xs text-emerald-700 flex items-center gap-1">
            <Clock className="w-3 h-3" /> {c.duration_days?.toFixed(1)} ngày
          </span>
        ) : c.skipped_no_survey ? (
          <span className="text-xs text-amber-700 flex items-center gap-1" title="Lead nhảy cóc qua survey_done — không tính B5">
            <AlertTriangle className="w-3 h-3" /> Skip survey
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-mono text-gray-500 w-7">{kpiCode}</span>
      {!c.denom ? (
        <span className="text-xs text-gray-400">không vào mẫu số</span>
      ) : c.numer ? (
        <span className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Đạt</span>
      ) : (
        <span className="text-xs text-red-700 flex items-center gap-1"><XCircle className="w-3 h-3" /> Chưa đạt</span>
      )}
    </div>
  );
}

function LeadRow({ trace }) {
  const [expanded, setExpanded] = useState(false);
  const eventsHasSkip = trace.events.some((e, i, arr) => {
    const prevRank = e.from && Object.values(RANK_LABEL).find((r) => r.slug === e.from);
    const curRank = Object.values(RANK_LABEL).find((r) => r.slug === e.to);
    return prevRank && curRank && Math.abs(curRank - prevRank) > 1;
  });

  return (
    <>
      <tr className={`border-t hover:bg-blue-50/30 cursor-pointer ${expanded ? 'bg-blue-50/30' : ''}`}
        onClick={() => setExpanded((v) => !v)}>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
            <span className="font-mono text-xs">{trace.lead.code || trace.lead.id.slice(0, 8)}</span>
          </div>
          <div className="text-xs text-gray-700 ml-5">{trace.lead.title || '—'}</div>
        </td>
        <td className="px-3 py-2"><StageBadge rank={trace.current_rank} /></td>
        <td className="px-3 py-2">
          <StageBadge rank={trace.max_rank} />
          {trace.was_lost && <span className="ml-1 text-[10px] text-red-600">· LOST</span>}
        </td>
        <td className="px-3 py-2 text-xs">
          {trace.events.length} bước
          {eventsHasSkip && <span className="ml-1 text-amber-600" title="Có nhảy cóc">⚡</span>}
          {trace.current_rank > 0 && trace.max_rank > trace.current_rank && (
            <span className="ml-1 text-purple-600" title="Đã đi lùi">↩</span>
          )}
        </td>
        <td className="px-3 py-2 space-y-0.5">
          <KpiCheck contrib={trace.kpi_contribution} kpiCode="B2" />
          <KpiCheck contrib={trace.kpi_contribution} kpiCode="B3" />
        </td>
        <td className="px-3 py-2 space-y-0.5">
          <KpiCheck contrib={trace.kpi_contribution} kpiCode="B4" />
          <KpiCheck contrib={trace.kpi_contribution} kpiCode="B5" />
        </td>
      </tr>
      {expanded && (
        <tr className="border-t bg-gray-50/50">
          <td colSpan={6} className="px-6 py-3">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700">Lịch sử kéo stage:</div>
              <div className="flex items-center gap-1 flex-wrap">
                {trace.events.map((e, i) => {
                  const fromInfo = e.from ? Object.entries(RANK_LABEL).find(([, r]) => r.slug === e.from) : null;
                  const toInfo = Object.entries(RANK_LABEL).find(([, r]) => r.slug === e.to);
                  const fromRank = fromInfo ? Number(fromInfo[0]) : null;
                  const toRank = toInfo ? Number(toInfo[0]) : null;
                  const isSkip = fromRank && toRank && Math.abs(toRank - fromRank) > 1;
                  const isBack = fromRank && toRank && toRank < fromRank;
                  return (
                    <div key={i} className="flex items-center gap-1 text-[11px]">
                      {i > 0 && <ArrowRight className={`w-3 h-3 ${isBack ? 'text-purple-500' : isSkip ? 'text-amber-500' : 'text-gray-400'}`} />}
                      <div className={`px-2 py-0.5 rounded ${isBack ? 'bg-purple-100 border border-purple-300' : isSkip ? 'bg-amber-100 border border-amber-300' : 'bg-white border border-gray-200'}`}>
                        <div className="font-medium">{e.to}</div>
                        <div className="text-[9px] text-gray-500">{new Date(e.entered_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[11px] text-gray-600 space-y-0.5 mt-2">
                <div>• <strong>Mốc đầu tiên vào survey_done:</strong> {trace.first_entered.survey_done ? new Date(trace.first_entered.survey_done).toLocaleString('vi-VN') : 'chưa từng đến'}</div>
                <div>• <strong>Mốc đầu tiên vào quoted:</strong> {trace.first_entered.quoted ? new Date(trace.first_entered.quoted).toLocaleString('vi-VN') : 'chưa từng đến'}</div>
                <div>• <strong>Mốc đầu tiên vào contract_signed:</strong> {trace.first_entered.contract_signed ? new Date(trace.first_entered.contract_signed).toLocaleString('vi-VN') : 'chưa từng đến'}</div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function KpiBVerifyPage() {
  const { user } = useAuth();
  const role = String(user?.role || '').toLowerCase();
  const isManager = ['admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'administrator'].includes(role);

  const [periodStart, setPeriodStart] = useState(defaultMonthStart());
  const [filter, setFilter] = useState({ companyId: '', departmentId: '', q: '' });
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState('');
  const [kpiFilter, setKpiFilter] = useState('all'); // all | b2 | b3 | b4 | b5 | skip | back

  useEffect(() => {
    const t = setTimeout(() => {
      const params = {
        ...(filter.companyId ? { company_id: filter.companyId } : {}),
        ...(filter.departmentId ? { department_id: filter.departmentId } : {}),
        ...(filter.q?.trim() ? { q: filter.q.trim() } : {}),
      };
      api.get('/kpi/users', { params }).then((r) => setUsers(r.data?.users || [])).catch(() => setUsers([]));
    }, 300);
    return () => clearTimeout(t);
  }, [filter.companyId, filter.departmentId, filter.q]);

  const load = async () => {
    if (!userId) { setData(null); return; }
    setLoading(true); setErr(null);
    try {
      const { data } = await api.get('/kpi/lead-trace', {
        params: { user_id: userId, period_start: periodStart, period_type: 'monthly' },
      });
      setData(data);
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId, periodStart]);

  const filteredLeads = useMemo(() => {
    if (!data?.leads) return [];
    let arr = [...data.leads];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((l) => (l.lead.code || '').toLowerCase().includes(q) || (l.lead.title || '').toLowerCase().includes(q));
    }
    if (kpiFilter === 'b2') arr = arr.filter((l) => l.kpi_contribution.B2.numer);
    if (kpiFilter === 'b3') arr = arr.filter((l) => l.kpi_contribution.B3.numer);
    if (kpiFilter === 'b4') arr = arr.filter((l) => l.kpi_contribution.B4.numer);
    if (kpiFilter === 'b5') arr = arr.filter((l) => l.kpi_contribution.B5.counts);
    if (kpiFilter === 'skip') arr = arr.filter((l) => l.kpi_contribution.B5.skipped_no_survey);
    if (kpiFilter === 'back') arr = arr.filter((l) => l.current_rank > 0 && l.max_rank > l.current_rank);
    return arr;
  }, [data, search, kpiFilter]);

  const stats = useMemo(() => {
    if (!data?.leads) return null;
    const arr = data.leads;
    return {
      total: arr.length,
      b2_denom: arr.filter((l) => l.kpi_contribution.B2.denom).length,
      b2_numer: arr.filter((l) => l.kpi_contribution.B2.numer).length,
      b3_denom: arr.filter((l) => l.kpi_contribution.B3.denom).length,
      b3_numer: arr.filter((l) => l.kpi_contribution.B3.numer).length,
      b4_denom: arr.filter((l) => l.kpi_contribution.B4.denom).length,
      b4_numer: arr.filter((l) => l.kpi_contribution.B4.numer).length,
      b5_count: arr.filter((l) => l.kpi_contribution.B5.counts).length,
      skip_count: arr.filter((l) => l.kpi_contribution.B5.skipped_no_survey).length,
      back_count: arr.filter((l) => l.current_rank > 0 && l.max_rank > l.current_rank).length,
    };
  }, [data]);

  if (!isManager) return <div className="p-6"><div className="bg-amber-50 border border-amber-200 rounded p-4 text-sm">Chỉ manager+ xem được trang này.</div></div>;

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Activity className="w-6 h-6 text-purple-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">KPI nhóm B — Verify từng lead</h1>
          <p className="text-sm text-gray-500">
            Xem chi tiết hệ thống chấm KPI B2/B3/B4/B5 cho từng lead. Hỗ trợ <strong>nhảy cóc</strong> và <strong>đi lùi</strong>.
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-3 space-y-2">
        <KpiUserFilter value={filter} onChange={setFilter} />
        <div className="flex gap-2 flex-wrap items-center">
          <select value={userId} onChange={(e) => setUserId(e.target.value)}
            className="px-3 py-1.5 border rounded text-sm min-w-[280px]">
            <option value="">— Chọn nhân viên để verify —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
          </select>
          <input type="month" value={periodStart.slice(0, 7)}
            onChange={(e) => setPeriodStart(`${e.target.value}-01`)}
            className="px-3 py-1.5 border rounded text-sm" />
          <button onClick={load} disabled={!userId || loading}
            className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50 flex items-center gap-1 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Tải
          </button>
        </div>
      </div>

      {err && <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-700">{err}</div>}

      {!userId ? (
        <div className="text-center py-12 text-gray-400 text-sm">Chọn nhân viên để xem chi tiết lead/deal được chấm KPI.</div>
      ) : loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Đang tải…</div>
      ) : !data?.leads?.length ? (
        <div className="text-center py-12 text-gray-400 text-sm">NV này chưa có lead/deal có thay đổi stage trong kỳ.</div>
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                <div className="text-xs text-gray-600">Tổng lead</div>
                <div className="text-xl font-bold text-blue-700">{stats.total}</div>
              </div>
              <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-2.5">
                <div className="text-xs text-gray-600">B2 đạt</div>
                <div className="text-xl font-bold text-cyan-700">{stats.b2_numer}/{stats.b2_denom}</div>
                <div className="text-[10px] text-gray-500">{stats.b2_denom > 0 ? ((stats.b2_numer / stats.b2_denom) * 100).toFixed(1) : '—'}%</div>
              </div>
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-2.5">
                <div className="text-xs text-gray-600">B3 đạt</div>
                <div className="text-xl font-bold text-teal-700">{stats.b3_numer}/{stats.b3_denom}</div>
                <div className="text-[10px] text-gray-500">{stats.b3_denom > 0 ? ((stats.b3_numer / stats.b3_denom) * 100).toFixed(1) : '—'}%</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5">
                <div className="text-xs text-gray-600">B4 đạt</div>
                <div className="text-xl font-bold text-purple-700">{stats.b4_numer}/{stats.b4_denom}</div>
                <div className="text-[10px] text-gray-500">{stats.b4_denom > 0 ? ((stats.b4_numer / stats.b4_denom) * 100).toFixed(1) : '—'}%</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <div className="text-xs text-gray-600">⚡ Nhảy cóc</div>
                <div className="text-xl font-bold text-amber-700">{stats.skip_count}</div>
                <div className="text-[10px] text-gray-500">không tính B5</div>
              </div>
              <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-lg p-2.5">
                <div className="text-xs text-gray-600">↩ Đi lùi</div>
                <div className="text-xl font-bold text-fuchsia-700">{stats.back_count}</div>
                <div className="text-[10px] text-gray-500">vẫn giữ max_rank</div>
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap items-center">
            <div className="flex-1 relative max-w-sm">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input type="text" placeholder="Tìm theo mã/tên lead…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 border rounded text-sm" />
            </div>
            <div className="flex gap-1 flex-wrap">
              {[
                { id: 'all', l: `Tất cả (${data.leads.length})`, c: 'bg-gray-700' },
                { id: 'b2', l: 'B2 đạt', c: 'bg-cyan-600' },
                { id: 'b3', l: 'B3 đạt', c: 'bg-teal-600' },
                { id: 'b4', l: 'B4 đạt', c: 'bg-purple-600' },
                { id: 'b5', l: 'B5 tính được', c: 'bg-emerald-600' },
                { id: 'skip', l: '⚡ Nhảy cóc', c: 'bg-amber-600' },
                { id: 'back', l: '↩ Đi lùi', c: 'bg-fuchsia-600' },
              ].map((t) => (
                <button key={t.id} onClick={() => setKpiFilter(t.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${
                    kpiFilter === t.id ? `${t.c} text-white` : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}>{t.l}</button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-700 uppercase">
                <tr>
                  <th className="text-left px-3 py-2 min-w-[200px]">Lead/Deal</th>
                  <th className="text-left px-3 py-2">Stage hiện tại</th>
                  <th className="text-left px-3 py-2">Max stage đạt</th>
                  <th className="text-left px-3 py-2">Diễn biến</th>
                  <th className="text-left px-3 py-2">B2 / B3</th>
                  <th className="text-left px-3 py-2">B4 / B5</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-8">Không có lead khớp bộ lọc.</td></tr>
                ) : filteredLeads.map((l) => <LeadRow key={l.lead.id} trace={l} />)}
              </tbody>
            </table>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-900 space-y-1">
            <p className="font-semibold flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Quy tắc chấm</p>
            <ul className="space-y-0.5 ml-4 list-disc">
              <li><strong>B2/B3/B4 (tỷ lệ chuyển đổi):</strong> dùng <em>max_rank đã đạt</em> — nhảy cóc 1→3 vẫn được tính cả 2, đi lùi không reset điểm.</li>
              <li><strong>B5 (thời gian):</strong> chỉ tính khi lead có CẢ 2 sự kiện vào <code>survey_done</code> và <code>quoted</code>. Nhảy cóc thì bỏ qua (cảnh báo ⚡).</li>
              <li><strong>Đi lùi (↩):</strong> max_rank giữ nguyên, current_rank giảm — KPI tỷ lệ không đổi.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
