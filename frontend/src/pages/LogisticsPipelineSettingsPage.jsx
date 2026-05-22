import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { Settings, Plus, Trash2, Save, ChevronRight, Loader2, Truck, Building2 } from 'lucide-react';
import WorkshopTypeSettingsSection from '../components/WorkshopTypeSettingsSection';

const INTAKE = 'delivery_pending';
const LS_VC_PIPE_COMPANY = 'vc_pipeline_settings_company_id';
const COLORS = ['#f97316', '#ea580c', '#d97706', '#0f766e', '#3B82F6', '#8B5CF6', '#10B981', '#64748b'];
const ICONS = ['🚚', '📦', '🔧', '🤝', '⏳', '📋', '✅', '🎯', '🏗️', '🛻'];

export default function LogisticsPipelineSettingsPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const [companies, setCompanies] = useState([]);
  const [settingsCompanyId, setSettingsCompanyId] = useState('');
  const [stages, setStages] = useState([]);
  const [workflowStages, setWorkflowStages] = useState([]);
  const [crmStages, setCrmStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    name: '', color: COLORS[0], icon: '📦', workflow_stage_id: '', is_active: true,
    crm_sync_type: '', crm_target_stage_id: '', progress_percent: '',
  });

  const load = useCallback(async () => {
    if (!settingsCompanyId) {
      setStages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const pipeParams = { all: 'true', company_id: settingsCompanyId };
      const [pipeRes, stRes, crmRes] = await Promise.all([
        api.get('/logistics/pipeline-stages', { params: pipeParams }),
        api.get('/stages').catch(() => api.get('/users/stages').catch(() => ({ data: { stages: [] } }))),
        api.get('/crm/pipeline-stages', { params: { type: 'deal' } }).catch(() => ({ data: [] })),
      ]);
      setStages(pipeRes.data || []);
      setWorkflowStages(stRes.data?.stages || []);
      setCrmStages((crmRes.data || []).filter((s) => s.pipeline_type === 'deal' || !s.pipeline_type));
    } catch {
      setStages([]);
    }
    setLoading(false);
  }, [settingsCompanyId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'logistics' } }).then((r) => {
      const list = r.data?.companies || r.data || [];
      const arr = Array.isArray(list) ? list : [];
      setCompanies(arr);
      if (isAdmin) {
        try {
          const s = localStorage.getItem(LS_VC_PIPE_COMPANY);
          if (s && arr.some((c) => String(c.id) === String(s))) {
            setSettingsCompanyId(s);
            return;
          }
        } catch { /* ignore */ }
        if (arr.length) setSettingsCompanyId(String(arr[0].id));
      } else if (user?.company_id) {
        setSettingsCompanyId(String(user.company_id));
      }
    }).catch(() => setCompanies([]));
  }, [isAdmin, user?.company_id]);

  useEffect(() => {
    if (!isAdmin || !settingsCompanyId) return;
    try {
      localStorage.setItem(LS_VC_PIPE_COMPANY, settingsCompanyId);
    } catch { /* ignore */ }
  }, [isAdmin, settingsCompanyId]);

  const settingsCompanyLabel = useMemo(() => {
    if (!settingsCompanyId) return '';
    const c = companies.find((x) => String(x.id) === String(settingsCompanyId));
    return c?.short_name || c?.name || settingsCompanyId;
  }, [companies, settingsCompanyId]);

  const hasIntake = stages.some((s) => s.bucket_slug === INTAKE);

  const startAdd = () => {
    setAdding(true);
    setEditId(null);
    setForm({
      name: '', color: COLORS[stages.length % COLORS.length], icon: ICONS[stages.length % ICONS.length],
      workflow_stage_id: '', is_active: true, crm_sync_type: '', crm_target_stage_id: '', progress_percent: '',
    });
  };

  const startEdit = (stage) => {
    setEditId(stage.id);
    setAdding(false);
    setForm({
      name: stage.name,
      color: stage.color || COLORS[0],
      icon: stage.icon || '📦',
      workflow_stage_id: stage.workflow_stage_id || stage.workflow_stage?.id || '',
      is_active: stage.is_active !== false,
      crm_sync_type: stage.crm_sync_type || '',
      crm_target_stage_id: stage.crm_target_stage_id || '',
      progress_percent: stage.progress_percent ?? '',
    });
  };

  const saveNew = async () => {
    if (!form.name.trim()) return alert('Nhập tên cột');
    try {
      await api.post('/logistics/pipeline-stages', {
        name: form.name.trim(), color: form.color, icon: form.icon,
        progress_percent: form.progress_percent === '' ? null : Number(form.progress_percent),
        workflow_stage_id: form.workflow_stage_id || null,
        is_active: form.is_active,
        crm_sync_type: form.crm_target_stage_id ? null : (form.crm_sync_type || null),
        crm_target_stage_id: form.crm_target_stage_id || null,
        company_id: settingsCompanyId,
      });
      setAdding(false);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi tạo cột'); }
  };

  const saveEdit = async () => {
    if (!form.name.trim()) return alert('Nhập tên cột');
    try {
      const intakeRow = stages.find((s) => s.id === editId)?.bucket_slug === INTAKE;
      await api.put(`/logistics/pipeline-stages/${editId}`, {
        name: form.name.trim(), color: form.color, icon: form.icon,
        progress_percent: form.progress_percent === '' ? null : Number(form.progress_percent),
        workflow_stage_id: intakeRow ? null : (form.workflow_stage_id || null),
        is_active: form.is_active,
        crm_sync_type: intakeRow ? null : (form.crm_target_stage_id ? null : (form.crm_sync_type || null)),
        crm_target_stage_id: intakeRow ? null : (form.crm_target_stage_id || null),
      });
      setEditId(null);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi lưu'); }
  };

  const del = async (id, bucket) => {
    if (bucket === INTAKE) return alert('Không xóa cột chờ vận chuyển — chỉ ẩn hoặc đổi tên');
    if (!confirm('Xóa cột pipeline VC này?')) return;
    try {
      await api.delete(`/logistics/pipeline-stages/${id}`);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi xóa'); }
  };

  const toggleActive = async (stage) => {
    try {
      await api.put(`/logistics/pipeline-stages/${stage.id}`, { is_active: !stage.is_active });
      load();
    } catch { alert('Lỗi'); }
  };

  const moveStage = async (stage, dir) => {
    if (stage.bucket_slug === INTAKE) return; // Cột chờ vận chuyển luôn đứng đầu
    const list = [...stages].sort((a, b) => a.order_index - b.order_index);
    const idx = list.findIndex((s) => s.id === stage.id);
    if (idx < 0 || (dir === -1 && idx === 0) || (dir === 1 && idx === list.length - 1)) return;
    // Không cho nhảy lên trước cột INTAKE
    if (dir === -1 && list[idx - 1]?.bucket_slug === INTAKE) return;
    const newList = [...list];
    [newList[idx], newList[idx + dir]] = [newList[idx + dir], newList[idx]];
    const reorder = newList.map((s, i) => ({ id: s.id, order_index: i + 1 }));
    try {
      await api.put('/logistics/pipeline-stages-reorder', { stages: reorder });
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi sắp xếp'); }
  };

  const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);
  const editingIntake = editId && sorted.find((s) => s.id === editId)?.bucket_slug === INTAKE;

  const getCrmStageBadge = (stage) => {
    if (stage.crm_target_stage) {
      const cs = stage.crm_target_stage;
      return `📋 → CRM: ${cs.icon ? cs.icon + ' ' : ''}${cs.name}`;
    }
    if (stage.crm_sync_type) {
      const map = { delivery: '📋 → CRM: Vận chuyển', installation: '🔧 → CRM: Lắp đặt', customer_care: '🤝 → CRM: CSKH' };
      return map[stage.crm_sync_type] || stage.crm_sync_type;
    }
    return null;
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck className="h-7 w-7 text-orange-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Pipeline Vận chuyển & Lắp đặt</h1>
            <p className="text-sm text-gray-500">
              Cột Kanban trên <strong>/vc/dashboard</strong>. Cột «Chờ vận chuyển» gom dự án bàn giao từ xưởng sản xuất.
            </p>
          </div>
        </div>
        <Link to="/vc/dashboard" className="text-sm font-medium text-orange-700 hover:text-orange-900 border border-orange-200 rounded-lg px-3 py-2 bg-white">
          ← Về dashboard VC
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-orange-200 bg-white shadow-sm">
        <Building2 className="h-5 w-5 text-orange-600 shrink-0" />
        <div className="flex-1 min-w-[200px]">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Công ty (phân loại loại dự án)</p>
          {isAdmin ? (
            <select
              value={settingsCompanyId}
              onChange={(e) => setSettingsCompanyId(e.target.value)}
              className="mt-1 w-full max-w-md h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.short_name || c.name || c.id}</option>
              ))}
            </select>
          ) : (
            <p className="mt-1 text-sm font-medium text-gray-900">{settingsCompanyLabel || 'Theo tài khoản'}</p>
          )}
          <p className="text-[11px] text-gray-500 mt-1">
            Cột Kanban VC phía dưới là pipeline của công ty đã chọn (giống CRM). Nếu chưa có cột riêng, hệ thống dùng pipeline mặc định chung. Phần «Loại dự án» cuối trang cũng theo công ty này.
          </p>
        </div>
      </div>

      <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-sm text-orange-900">
        <strong>Đồng bộ CRM tự động:</strong> Chọn cột CRM mục tiêu cho từng bước VC.
        Khi deal đến bước đó, hệ thống sẽ <strong>tự động chuyển</strong> deal CRM sang đúng cột đã cấu hình.
        Nhớ chạy migration <code className="text-xs bg-white/80 px-1 rounded">database/91_pipeline_crm_target_stage.sql</code> trên Supabase để kích hoạt tính năng này.
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tải...
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-orange-50 to-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm bg-orange-600">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900">Cột Kanban VC</h2>
                <p className="text-[10px] text-gray-500">{sorted.length} cột</p>
              </div>
            </div>
            <button type="button" onClick={startAdd}
              className="h-8 px-3 bg-orange-600 text-white rounded-lg text-xs hover:bg-orange-700 flex items-center gap-1.5 cursor-pointer">
              <Plus className="h-3.5 w-3.5" /> Thêm cột
            </button>
          </div>

          {/* Pipeline preview */}
          <div className="p-4 border-b">
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {sorted.map((s, i) => (
                <div key={s.id} className="flex items-center shrink-0">
                  <button type="button" onClick={() => startEdit(s)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border-2 transition-all ${!s.is_active ? 'opacity-40 border-dashed' : 'border-transparent'} ${editId === s.id ? 'ring-2 ring-orange-500' : ''}`}
                    style={{ backgroundColor: `${s.color || '#f97316'}20`, color: s.color || '#f97316', borderColor: editId === s.id ? '#f97316' : 'transparent' }}>
                    {s.icon && <span className="mr-1">{s.icon}</span>}
                    {s.name}
                    {s.bucket_slug === INTAKE && <span className="ml-1 text-[10px] font-normal">(chờ VC)</span>}
                    {(s.crm_target_stage_id || s.crm_sync_type) && <span className="ml-1 text-[9px] font-normal opacity-70">↔CRM</span>}
                  </button>
                  {i < sorted.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300 mx-0.5 shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          {/* Stage list */}
          <div className="border-t">
            {sorted.map((s, i) => {
              const crmBadge = getCrmStageBadge(s);
              return (
                <div key={s.id}
                  className={`flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 hover:bg-gray-50 ${!s.is_active ? 'opacity-50' : ''}`}>
                  <div className="flex flex-col gap-0.5">
                    <button type="button" onClick={() => moveStage(s, -1)}
                      disabled={i === 0 || s.bucket_slug === INTAKE || sorted[i - 1]?.bucket_slug === INTAKE}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[10px]">▲</button>
                    <button type="button" onClick={() => moveStage(s, 1)}
                      disabled={i === sorted.length - 1 || s.bucket_slug === INTAKE}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[10px]">▼</button>
                  </div>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: s.color || '#f97316' }}>
                    {s.order_index}
                  </div>
                  <span className="text-lg shrink-0">{s.icon || '📦'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                      {s.name}
                      {crmBadge && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                          {crmBadge}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {s.bucket_slug === INTAKE
                        ? 'Bucket: dự án bàn giao từ sản xuất, chờ VC'
                        : (s.workflow_stage?.name || s.workflow_stage_id
                          ? `Workflow: ${s.workflow_stage?.name || s.workflow_stage_id}`
                          : 'Chưa gắn workflow — kéo Kanban sẽ không đổi giai đoạn')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => toggleActive(s)} className="p-1.5 rounded hover:bg-gray-100 cursor-pointer text-[10px] text-gray-500">
                      {s.is_active ? 'Ẩn' : 'Hiện'}
                    </button>
                    <button type="button" onClick={() => startEdit(s)} className="p-1.5 rounded hover:bg-orange-50 text-orange-600 cursor-pointer">
                      <Save className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => del(s.id, s.bucket_slug)} className="p-1.5 rounded hover:bg-red-50 text-red-500 cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add / Edit form */}
          {(adding || editId) && (
            <div className="p-4 border-t bg-orange-50/50 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-gray-500 block mb-1">Tên cột *</label>
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full h-8 px-3 border rounded-lg text-sm" placeholder="VD: Đang lắp đặt" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-500 block mb-1">Giai đoạn workflow</label>
                  <select value={form.workflow_stage_id} disabled={editingIntake}
                    onChange={(e) => setForm((f) => ({ ...f, workflow_stage_id: e.target.value }))}
                    className="w-full h-8 px-2 border rounded-lg text-sm bg-white disabled:opacity-50 disabled:cursor-not-allowed">
                    <option value="">— Không (chỉ hiển thị bucket) —</option>
                    {workflowStages.map((ws) => (
                      <option key={ws.id} value={ws.id}>{ws.name} ({ws.slug})</option>
                    ))}
                  </select>
                  {editingIntake && <p className="text-[10px] text-gray-500 mt-1">Cột chờ VC không gắn workflow.</p>}
                </div>
              </div>

              {/* CRM sync — trực tiếp chọn CRM stage */}
              {!editingIntake && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-blue-700 block">
                    📋 Khi deal đến cột này → CRM deal tự chuyển sang:
                  </label>
                  <select
                    value={form.crm_target_stage_id || ''}
                    onChange={(e) => setForm((f) => ({ ...f, crm_target_stage_id: e.target.value, crm_sync_type: e.target.value ? '' : f.crm_sync_type }))}
                    className="w-full h-8 px-2 border rounded-lg text-sm bg-white border-blue-200 focus:border-blue-400"
                  >
                    <option value="">— Không tự chuyển CRM —</option>
                    {crmStages.filter((cs) => !cs.is_lost && !cs.is_won).map((cs) => (
                      <option key={cs.id} value={cs.id}>
                        {cs.icon ? `${cs.icon} ` : ''}{cs.name}
                        {cs.sync_role ? ` [${cs.sync_role}]` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-500">
                    Khi deal VC đến cột này, deal CRM liên kết sẽ tự chuyển sang cột đã chọn và thông báo nhân viên sale.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[10px] text-gray-500">Màu</span>
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 ${form.color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <div>
                <span className="text-[10px] text-gray-500 block mb-1">Icon</span>
                <div className="flex flex-wrap gap-1">
                  {ICONS.map((ic) => (
                    <button key={ic} type="button" onClick={() => setForm((f) => ({ ...f, icon: ic }))}
                      className={`w-8 h-8 rounded text-sm cursor-pointer ${form.icon === ic ? 'bg-orange-100 ring-2 ring-orange-500' : 'bg-gray-50 hover:bg-gray-100'}`}>
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 block mb-1">% hoàn thành theo cột (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.progress_percent ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, progress_percent: e.target.value }))}
                  className="w-full max-w-[160px] h-8 px-3 border rounded-lg text-sm"
                  placeholder="VD: 80"
                />
                <p className="text-[10px] text-gray-400 mt-1 leading-snug">
                  Dùng để hiển thị % hoàn thành trên thẻ VC/LĐ (không dựa vào % task done). Để trống nếu không muốn áp dụng.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded border-gray-300" />
                Đang hiển thị trên Kanban
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={editId ? saveEdit : saveNew} className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 cursor-pointer">Lưu</button>
                <button type="button" onClick={() => { setAdding(false); setEditId(null); }} className="px-4 py-2 border rounded-lg text-sm cursor-pointer">Hủy</button>
              </div>
            </div>
          )}

          {!adding && !editId && !hasIntake && (
            <div className="p-4 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
              Chưa có cột «chờ vận chuyển». Tạo cột với <code>bucket_slug: &apos;delivery_pending&apos;</code>.
            </div>
          )}
        </div>
      )}

      {!loading && (
        <WorkshopTypeSettingsSection
          moduleContext="logistics"
          accent="orange"
          {...(isAdmin ? { companyId: settingsCompanyId, onCompanyIdChange: setSettingsCompanyId } : {})}
        />
      )}
    </div>
  );
}
