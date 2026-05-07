import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { Factory, Users, Save, Loader2, Plus, UserCircle } from 'lucide-react';

export default function ProductionHandoverSettingsPage() {
  const { user } = useAuth();
  const isGlobalAdmin = user?.role === 'admin' && !user?.company_id;
  const lockedCo = user?.company_id ? String(user.company_id) : '';

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(lockedCo);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(null);
  const [responsibleId, setResponsibleId] = useState('');
  const [defaultTeamId, setDefaultTeamId] = useState('');
  const [assignMap, setAssignMap] = useState({});
  const [newTeamName, setNewTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);

  useEffect(() => {
    api
      .get('/companies', { params: { for_module: 'production' } })
      .then((r) => setCompanies(r.data?.companies || []))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    if (lockedCo && !companyId) setCompanyId(lockedCo);
  }, [lockedCo, companyId]);

  const load = useCallback(async () => {
    if (!companyId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const { data: d } = await api.get(`/production/handover-settings/${companyId}`);
      setData(d);
      setResponsibleId(d.settings?.responsible_user_id ? String(d.settings.responsible_user_id) : '');
      setDefaultTeamId(d.settings?.default_production_team_id ? String(d.settings.default_production_team_id) : '');
      const m = {};
      (d.assignments || []).forEach((a) => {
        if (a.template_item_id) m[String(a.template_item_id)] = a.assignee_user_id ? String(a.assignee_user_id) : '';
      });
      setAssignMap(m);
    } catch (e) {
      console.error(e);
      setData(null);
      alert(e.response?.data?.error || e.message || 'Không tải được');
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const users = data?.users || [];
  const teams = data?.production_teams || [];
  const items = data?.template_items || [];

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const assignments = Object.entries(assignMap)
        .filter(([, uid]) => uid)
        .map(([template_item_id, assignee_user_id]) => ({ template_item_id, assignee_user_id }));
      await api.put(`/production/handover-settings/${companyId}`, {
        responsible_user_id: responsibleId || null,
        default_production_team_id: defaultTeamId || null,
        assignments,
      });
      await load();
      alert('Đã lưu cấu hình bàn giao.');
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu');
    }
    setSaving(false);
  };

  const createTeam = async () => {
    const name = newTeamName.trim();
    if (!name || !companyId) return;
    setCreatingTeam(true);
    try {
      await api.post('/workshop-teams', {
        name,
        type: 'production',
        company_id: companyId,
        color: '#0d9488',
      });
      setNewTeamName('');
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Không tạo được đội — kiểm tra đã chạy migration DB (workshop_teams.company_id, type production)');
    }
    setCreatingTeam(false);
  };

  const selectedCompanyLabel = useMemo(() => {
    const c = companies.find((x) => String(x.id) === String(companyId));
    return c?.short_name || c?.name || '';
  }, [companies, companyId]);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-teal-600 flex items-center justify-center">
            <Factory className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Bàn giao CRM → Sản xuất</h1>
            <p className="text-sm text-gray-500">
              Khi deal chọn công ty xưởng: gán người phụ trách, đội SX mặc định và phân công từng mục trong bộ mẫu nhiệm vụ cho thành viên.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
        <label className="flex flex-col gap-1 max-w-md">
          <span className="text-xs font-semibold text-gray-600">Công ty sản xuất</span>
          {isGlobalAdmin ? (
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="">— Chọn —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-800 py-2">{selectedCompanyLabel || '—'}</p>
          )}
        </label>

        {!companyId && (
          <p className="text-sm text-amber-700">Chọn công ty sản xuất để cấu hình.</p>
        )}

        {loading && companyId && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
          </div>
        )}

        {companyId && !loading && data && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                  <UserCircle className="h-3.5 w-3.5" /> Người phụ trách (admin / điều phối SX)
                </span>
                <select
                  value={responsibleId}
                  onChange={(e) => setResponsibleId(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                >
                  <option value="">— Chưa chọn —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </select>
                <span className="text-[11px] text-gray-400">Được gán làm «Sản xuất» trên dự án khi tạo từ deal thắng.</span>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> Đội SX mặc định trên dự án
                </span>
                <select
                  value={defaultTeamId}
                  onChange={(e) => setDefaultTeamId(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                >
                  <option value="">— Không gán đội —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-lg border border-teal-100 bg-teal-50/50 p-3 space-y-2">
              <p className="text-xs font-semibold text-teal-900">Tạo đội sản xuất thuộc công ty</p>
              <div className="flex flex-wrap gap-2 items-end">
                <input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Tên đội (vd: Tổ SX 1)"
                  className="h-9 px-3 rounded-lg border border-teal-200 text-sm flex-1 min-w-[180px]"
                />
                <button
                  type="button"
                  disabled={creatingTeam || !newTeamName.trim()}
                  onClick={() => createTeam()}
                  className="h-9 px-3 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
                >
                  {creatingTeam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Thêm đội
                </button>
              </div>
              <p className="text-[11px] text-teal-800/80">
                Thành viên đội: dùng API / Quản lý đội — có thể mở rộng giao diện thêm thành viên tại đây sau.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-800 mb-2">Phân công theo mục mẫu (nhiệm vụ sx_* sinh ra)</p>
              {items.length === 0 ? (
                <p className="text-sm text-gray-500">Chưa có mục nào — thêm bộ mẫu SX cho công ty tại «Bộ mẫu nhiệm vụ xưởng».</p>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
                      <tr>
                        <th className="px-3 py-2">Bộ mẫu</th>
                        <th className="px-3 py-2">Mục việc</th>
                        <th className="px-3 py-2">Người nhận</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((it) => (
                        <tr key={it.id}>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{it.template_name || '—'}</td>
                          <td className="px-3 py-2 text-gray-900">{it.title}</td>
                          <td className="px-3 py-2">
                            <select
                              value={assignMap[it.id] || ''}
                              onChange={(e) =>
                                setAssignMap((prev) => ({ ...prev, [it.id]: e.target.value }))
                              }
                              className="h-9 w-full max-w-xs px-2 rounded-lg border border-gray-200 text-sm bg-white"
                            >
                              <option value="">— Mặc định (sale / người phụ trách) —</option>
                              {users.map((u) => (
                                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() => save()}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-black disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Lưu cấu hình
            </button>
          </>
        )}
      </div>
    </div>
  );
}
