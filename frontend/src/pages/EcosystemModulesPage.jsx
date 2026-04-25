import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { Network, Building2, Save, Loader2, ArrowLeft, Layers } from 'lucide-react';

const MODULE_ROWS = [
  { key: 'crm', label: 'CRM', hint: 'Bán hàng, pipeline, đơn hàng…' },
  { key: 'production', label: 'Sản xuất / Xưởng', hint: '/sx — deal vào xưởng' },
  { key: 'logistics', label: 'Vận chuyển & lắp đặt', hint: '/vc' },
  { key: 'projects', label: 'Dự án (workspace)', hint: '/projects, project-workflow' },
  { key: 'tasks', label: 'Tất cả công việc', hint: '/tasks' },
  { key: 'customers', label: 'Khách hàng (workspace)', hint: '/customers' },
];

export default function EcosystemModulesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [units, setUnits] = useState([]);
  const [local, setLocal] = useState({}); // moduleKey -> Set of division id
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [message, setMessage] = useState('');

  const divisions = useMemo(
    () => (units || []).filter((u) => u.level?.slug === 'division').sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    [units],
  );

  /** Với mỗi khối: module nào user công ty thuộc khối đó sẽ thấy (theo state local hiện tại, chưa lưu có thể khác DB). */
  const summaryByDivision = useMemo(() => {
    return divisions.map((d) => {
      const id = String(d.id);
      const modules = MODULE_ROWS.map((m) => {
        const set = local[m.key] || new Set();
        const restricted = set.size > 0;
        const allowed = !restricted || set.has(id);
        return { key: m.key, label: m.label, allowed, restricted };
      });
      return { d, id, modules };
    });
  }, [divisions, local]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const [uRes, sRes] = await Promise.all([
        api.get('/ecosystem/units'),
        api.get('/ecosystem/module-scopes'),
      ]);
      const u = uRes.data?.units || [];
      setUnits(u);
      const sc = sRes.data?.scopes || [];
      const next = {};
      MODULE_ROWS.forEach((m) => { next[m.key] = new Set(); });
      sc.forEach((row) => {
        if (!row.module_key) return;
        if (!next[row.module_key]) next[row.module_key] = new Set();
        next[row.module_key].add(String(row.division_unit_id));
      });
      setLocal(next);
    } catch (e) {
      setMessage(e.response?.data?.error || e.message || 'Lỗi tải');
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const toggle = (moduleKey, divId) => {
    setLocal((prev) => {
      const s = new Set(prev[moduleKey] || []);
      const id = String(divId);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return { ...prev, [moduleKey]: s };
    });
  };

  const saveModule = async (moduleKey) => {
    setSaving(moduleKey);
    setMessage('');
    try {
      const division_unit_ids = [...(local[moduleKey] || [])];
      await api.put(`/ecosystem/module-scopes/${moduleKey}`, { division_unit_ids });
      setMessage(`Đã lưu «${MODULE_ROWS.find((r) => r.key === moduleKey)?.label || moduleKey}».`);
      await load();
    } catch (e) {
      setMessage(e.response?.data?.error || e.message || 'Lỗi lưu');
    }
    setSaving(null);
  };

  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center text-gray-600">
        <p className="text-sm">Chỉ quản trị viên được cấu hình liên kết module — khối.</p>
        <Link to="/ecosystem" className="text-blue-600 text-sm font-medium mt-4 inline-block">← Về Cấu trúc công ty</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link to="/ecosystem" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium">
              <ArrowLeft className="h-4 w-4" /> Cấu trúc công ty
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="h-7 w-7 text-indigo-600" />
            Module &amp; Khối hệ sinh thái
          </h1>
          <div className="text-xs text-gray-600 mt-2 max-w-3xl space-y-2">
            <p>
              <strong>Luồng quản lý:</strong> mỗi <strong>công ty</strong> thuộc đúng một <strong>khối</strong> (cấu hình tại{' '}
              <Link to="/companies" className="text-indigo-600 font-medium underline">Danh sách công ty</Link>
              {' '}→ trường khối / <code className="text-[10px] bg-gray-100 px-1 rounded">division_unit_id</code>).
              Ở đây bạn chọn <strong>khối nào được dùng module nào</strong>: công ty chỉ thấy menu module khi{' '}
              <strong>khối của công ty đó</strong> nằm trong danh sách khối được phép của module đó.
            </p>
            <p className="text-gray-500">
              Nếu với một module <strong>không tick khối nào</strong> → module đó <strong>không giới hạn theo khối</strong> (mọi công ty đều thấy).
              Khi đã tick ít nhất một khối → <strong>chỉ</strong> các công ty thuộc các khối đó mới thấy module đó; bộ lọc công ty trên <strong>CRM</strong>, <strong>Sản xuất</strong> và <strong>Vận chuyển &amp; lắp đặt</strong> (và cài pipeline theo công ty) cũng chỉ liệt kê đúng các công ty đó.
            </p>
          </div>
        </div>
      </div>

      {message && (
        <div className="text-sm text-gray-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{message}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-500 gap-2">
          <Loader2 className="h-6 w-6 animate-spin" /> Đang tải…
        </div>
      ) : divisions.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Chưa có đơn vị cấp <strong>Khối</strong> (level slug <code>division</code>). Thêm cấp bậc và đơn vị tại{' '}
          <Link to="/ecosystem" className="font-semibold underline">Cấu trúc công ty</Link> và{' '}
          <Link to="/ecosystem-levels" className="font-semibold underline">Cấp bậc HST</Link>.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 overflow-x-auto">
            <h2 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-600" />
              Tóm tắt theo khối
            </h2>
            <p className="text-[11px] text-gray-500 mb-3">
              Mỗi hàng là một khối: các cột là module — ✓ nghĩa công ty thuộc khối đó sẽ thấy module đó (theo ô bạn đang chọn; bấm <strong>Lưu</strong> từng module bên dưới để áp dụng lên hệ thống).
            </p>
            <table className="w-full text-xs border-collapse min-w-[520px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-gray-500">
                  <th className="py-2 pr-3 font-medium">Khối</th>
                  {MODULE_ROWS.map((m) => (
                    <th key={m.key} className="py-2 px-1 font-medium text-center whitespace-nowrap">{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaryByDivision.map(({ d, id, modules }) => (
                  <tr key={id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-medium text-gray-800">{d.short_name || d.name}</td>
                    {modules.map((x) => (
                      <td key={x.key} className="py-2 px-1 text-center" title={x.restricted ? 'Module đang giới hạn theo khối' : 'Module mở cho mọi khối'}>
                        {x.allowed ? (
                          <span className="text-emerald-600 font-semibold">✓</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {MODULE_ROWS.map((mod) => {
            const set = local[mod.key] || new Set();
            const any = set.size > 0;
            return (
              <div key={mod.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b bg-gradient-to-r from-indigo-50 to-white">
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">{mod.label}</h2>
                    <p className="text-[10px] text-gray-500">{mod.hint}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">
                      {any ? `${set.size} khối` : 'Không giới hạn (mọi khối)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => saveModule(mod.key)}
                      disabled={saving === mod.key}
                      className="h-8 px-3 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {saving === mod.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Lưu
                    </button>
                  </div>
                </div>
                <div className="p-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {divisions.map((d) => {
                    const id = String(d.id);
                    const on = set.has(id);
                    return (
                      <label
                        key={id}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${
                          on ? 'border-indigo-300 bg-indigo-50/80' : 'border-gray-100 bg-gray-50/50 hover:border-gray-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(mod.key, id)}
                          className="rounded border-gray-300 text-indigo-600"
                        />
                        <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="font-medium text-gray-800 truncate">{d.short_name || d.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <Network className="h-3.5 w-3.5" />
        Đồng bộ menu ứng dụng theo <code className="bg-gray-100 px-1 rounded">GET /ecosystem/my-module-access</code> (công ty của user → khối).
      </p>
    </div>
  );
}
