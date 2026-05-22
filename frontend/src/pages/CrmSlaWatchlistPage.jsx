import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isSystemAdmin as checkSystemAdmin } from '../lib/adminRole';
import KpiUserFilter from '../components/KpiUserFilter';
import { RefreshCw, Bell, AlertTriangle, Clock, ExternalLink, MapPin, CheckCircle2 } from 'lucide-react';

function formatDt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN');
  } catch {
    return iso;
  }
}

export default function CrmSlaWatchlistPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  /** Admin hệ thống (không gắn company) — được «Tất cả công ty» / chọn công ty */
  const isSystemAdmin = checkSystemAdmin(user);
  const [filter, setFilter] = useState({ companyId: '', departmentId: '', regionId: '', q: '' });
  const [regions, setRegions] = useState([]);
  const [type, setType] = useState('all');
  const [bucket, setBucket] = useState('all');
  const [horizon, setHorizon] = useState(14);
  /** Gửi include_on_track — hiển thị mọi lead/deal mở kể cả hạn còn xa (không chỉ quá hạn + cửa sổ). */
  const [includeOpenPipeline, setIncludeOpenPipeline] = useState(true);
  const [rows, setRows] = useState([]);
  const [listMeta, setListMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [remindLoading, setRemindLoading] = useState(false);

  const setFilterSafe = useCallback((patch) => {
    setFilter((prev) => {
      const next = { ...prev, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'companyId') && patch.companyId !== prev.companyId) {
        next.regionId = '';
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (isSystemAdmin || !user?.company_id) return;
    setFilter((f) => (f.companyId ? f : { ...f, companyId: String(user.company_id) }));
  }, [isSystemAdmin, user?.company_id]);

  useEffect(() => {
    if (!filter.companyId) {
      setRegions([]);
      return;
    }
    let cancelled = false;
    api
      .get('/crm/company-regions', { params: { company_id: filter.companyId } })
      .then((r) => {
        if (cancelled) return;
        setRegions(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => {
        if (!cancelled) setRegions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [filter.companyId]);

  const queryParams = useMemo(() => {
    const p = {
      horizon_days: horizon,
      bucket,
      ...(type !== 'all' ? { type } : {}),
      ...(filter.companyId ? { company_id: filter.companyId } : {}),
      ...(filter.regionId ? { region_id: filter.regionId } : {}),
      ...(filter.departmentId ? { department_id: filter.departmentId } : {}),
      ...(includeOpenPipeline ? { include_on_track: '1' } : {}),
    };
    return p;
  }, [horizon, bucket, type, filter.companyId, filter.regionId, filter.departmentId, includeOpenPipeline]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get('/crm/admin/sla-at-risk', { params: queryParams });
      let list = data?.rows || [];
      setListMeta(
        data
          ? {
              leads_scanned: data.meta?.leads_scanned,
              include_on_track: data.include_on_track,
              horizon_days: data.horizon_days,
            }
          : null,
      );
      const q = filter.q?.trim().toLowerCase();
      if (q) {
        list = list.filter((r) => {
          const hay = `${r.code || ''} ${r.title || ''} ${r.stage_name || ''} ${r.assigned_to_name || ''} ${r.lead_owner_name || ''}`.toLowerCase();
          return hay.includes(q);
        });
      }
      setRows(list);
      setSelected(new Set());
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Không tải được danh sách');
      setRows([]);
      setListMeta(null);
    } finally {
      setLoading(false);
    }
  }, [queryParams, filter.q]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.lead_id)));
  };

  const sendRemind = async () => {
    const ids = [...selected];
    if (!ids.length) {
      alert('Chọn ít nhất một lead/deal.');
      return;
    }
    setRemindLoading(true);
    try {
      await api.post('/crm/admin/sla-remind', {
        lead_ids: ids,
        ...(filter.companyId ? { company_id: filter.companyId } : {}),
      });
      alert(`Đã gửi nhắc cho các hồ sơ đã chọn (${ids.length}).`);
      setSelected(new Set());
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi gửi nhắc');
    } finally {
      setRemindLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-6 h-6 text-amber-600" />
            SLA Lead / Deal — sắp quá hạn giai đoạn
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Dựa trên <code className="text-xs bg-slate-100 px-1 rounded">stage_entered_at</code> và SLA từng cột. Nếu tắt «Toàn bộ pipeline», chỉ hiện{' '}
            <strong>quá hạn</strong> hoặc <strong>sắp hết hạn trong cửa sổ ngày</strong> — có thể ra 0 dòng dù vẫn có lead mở.
            Nhắc NV gửi qua tab <strong>Hoạt động</strong>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <KpiUserFilter value={filter} onChange={setFilterSafe} compact showSearch />
          <div className="relative min-w-[200px]">
            <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <select
              value={filter.regionId}
              onChange={(e) => setFilterSafe({ regionId: e.target.value })}
              disabled={!filter.companyId}
              className="w-full pl-8 pr-2 py-1.5 border rounded-lg text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">{filter.companyId ? 'Tất cả khu vực' : 'Chọn công ty trước'}</option>
              {regions.map((reg) => (
                <option key={reg.id} value={reg.id}>
                  {reg.name || reg.code || reg.id}
                </option>
              ))}
            </select>
          </div>
          {!isSystemAdmin && user?.company_id && (
            <span className="text-xs text-slate-500">Theo công ty trên tài khoản của bạn.</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={type} onChange={(e) => setType(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
            <option value="all">Lead + Deal</option>
            <option value="lead">Chỉ Lead</option>
            <option value="deal">Chỉ Deal</option>
          </select>
          <select value={bucket} onChange={(e) => setBucket(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
            <option value="all">Quá hạn + sắp hết hạn</option>
            <option value="overdue">Chỉ quá hạn SLA</option>
            <option value="due_soon">Chỉ sắp hết (trong cửa sổ)</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Cửa sổ (ngày)
            <input
              type="number"
              min={1}
              max={30}
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value) || 14)}
              className="w-16 border rounded px-2 py-1 text-sm"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeOpenPipeline}
              onChange={(e) => setIncludeOpenPipeline(e.target.checked)}
              className="rounded border-slate-300"
            />
            Toàn bộ pipeline mở (kể cả trong hạn)
          </label>
        </div>
      </div>

      {err && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{err}</div>
      )}

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <p className="text-sm text-slate-600">
          {loading
            ? 'Đang tải…'
            : `${rows.length} hồ sơ${listMeta?.leads_scanned != null ? ` · đã quét ${listMeta.leads_scanned} lead/deal mở` : ''}`}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={toggleAll}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            {selected.size === rows.length && rows.length ? 'Bỏ chọn' : 'Chọn tất cả'}
          </button>
          <button
            type="button"
            onClick={sendRemind}
            disabled={remindLoading || !selected.size}
            className="inline-flex items-center gap-2 text-sm px-4 py-1.5 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Bell className="w-4 h-4" />
            {remindLoading ? 'Đang gửi…' : `Nhắc NV (${selected.size})`}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 w-10">
                  <span className="sr-only">Chọn</span>
                </th>
                <th className="px-3 py-2">Mã</th>
                <th className="px-3 py-2">Tiêu đề</th>
                <th className="px-3 py-2">Loại</th>
                <th className="px-3 py-2">Giai đoạn</th>
                <th className="px-3 py-2">SLA (ngày)</th>
                <th className="px-3 py-2">Hạn</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">NV</th>
                <th className="px-3 py-2 w-24"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.lead_id} className="hover:bg-slate-50/80">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.lead_id)}
                      onChange={() => toggle(r.lead_id)}
                      className="rounded border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.code || '—'}</td>
                  <td className="px-3 py-2 max-w-[220px] truncate" title={r.title}>{r.title || '—'}</td>
                  <td className="px-3 py-2 capitalize">{r.type === 'deal' ? 'Deal' : 'Lead'}</td>
                  <td className="px-3 py-2">{r.stage_name || '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{r.sla_days}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{formatDt(r.due_at)}</td>
                  <td className="px-3 py-2">
                    {r.risk === 'overdue' ? (
                      <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-2 py-0.5 rounded text-xs font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" /> Quá hạn
                      </span>
                    ) : r.risk === 'on_track' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Trong hạn
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-50 px-2 py-0.5 rounded text-xs font-medium">
                        <Clock className="w-3.5 h-3.5" /> Sắp hết hạn
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs max-w-[160px] truncate" title={r.assigned_to_name || r.lead_owner_name || ''}>
                    {r.assigned_to_name || r.lead_owner_name || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/crm/leads/${r.lead_id}`)}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                    >
                      Mở <ExternalLink className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-500 text-sm leading-relaxed max-w-lg mx-auto">
                    Không có dòng nào khớp bộ lọc.
                    {listMeta?.leads_scanned != null && (
                      <span className="block mt-2 text-slate-600">
                        Đã quét <strong>{listMeta.leads_scanned}</strong> lead/deal đang mở (chưa Thắng/Thua).
                        {!includeOpenPipeline && (
                          <> Thử bật <strong>Toàn bộ pipeline mở</strong> hoặc tăng <strong>Cửa sổ (ngày)</strong>.</>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
