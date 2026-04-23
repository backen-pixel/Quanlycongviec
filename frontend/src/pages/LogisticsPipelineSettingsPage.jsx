import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { Settings, Plus, Trash2, Save, ChevronRight, Loader2, Truck } from 'lucide-react';

const INTAKE = 'delivery_pending';
const COLORS = ['#f97316', '#ea580c', '#d97706', '#0f766e', '#3B82F6', '#8B5CF6', '#10B981', '#64748b'];
const ICONS = ['🚚', '📦', '🔧', '🤝', '⏳', '📋', '✅', '🎯', '🏗️', '🛻'];

const CRM_SYNC_OPTIONS = [
  { value: '', label: '— Không đồng bộ CRM —' },
  { value: 'delivery', label: '📋 Vận chuyển thành công → CRM: Vận chuyển' },
  { value: 'installation', label: '🔧 Lắp đặt thành công → CRM: Lắp đặt' },
  { value: 'customer_care', label: '🤝 Hoàn thành → CRM: Chăm sóc KH' },
];

const CRM_SYNC_LABEL = {
  delivery: '📋 → CRM: Vận chuyển',
  installation: '🔧 → CRM: Lắp đặt',
  customer_care: '🤝 → CRM: CSKH',
};

export default function LogisticsPipelineSettingsPage() {
  const [stages, setStages] = useState([]);
  const [workflowStages, setWorkflowStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    name: '', color: COLORS[0], icon: '📦', workflow_stage_id: '', is_active: true, crm_sync_type: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pipeRes, stRes] = await Promise.all([
        api.get('/logistics/pipeline-stages', { params: { all: 'true' } }),
        api.get('/stages').catch(() => api.get('/users/stages').catch(() => ({ data: { stages: [] } }))),
      ]);
      setStages(pipeRes.data || []);
      setWorkflowStages(stRes.data?.stages || []);
    } catch {
      setStages([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const hasIntake = stages.some((s) => s.bucket_slug === INTAKE);

  const startAdd = () => {
    setAdding(true);
    setEditId(null);
    setForm({
      name: '', color: COLORS[stages.length % COLORS.length], icon: ICONS[stages.length % ICONS.length],
      workflow_stage_id: '', is_active: true, crm_sync_type: '',
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
    });
  };

  const saveNew = async () => {
    if (!form.name.trim()) return alert('Nhập tên cột');
    try {
      await api.post('/logistics/pipeline-stages', {
        name: form.name.trim(), color: form.color, icon: form.icon,
        workflow_stage_id: form.workflow_stage_id || null,
        is_active: form.is_active,
        crm_sync_type: form.crm_sync_type || null,
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
        workflow_stage_id: intakeRow ? null : (form.workflow_stage_id || null),
        is_active: form.is_active,
        crm_sync_type: intakeRow ? null : (form.crm_sync_type || null),
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
    const list = [...stages].sort((a, b) => a.order_index - b.order_index);
    const idx = list.findIndex((s) => s.id === stage.id);
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === list.length - 1)) return;
    [list[idx], list[idx + dir]] = [list[idx + dir], list[idx]];
    const reorder = list.map((s, i) => ({ id: s.id, order_index: i + 1 }));
    try {
      await api.put('/logistics/pipeline-stages-reorder', { stages: reorder });
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi sắp xếp'); }
  };

  const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);
  const editingIntake = editId && sorted.find((s) => s.id === editId)?.bucket_slug === INTAKE;

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

      <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-sm text-orange-900">
        <strong>Đồng bộ CRM:</strong> Chọn <em>«Đồng bộ CRM»</em> cho cột VC thì khi deal tới cột đó, hệ thống tự cập nhật cột CRM tương ứng (Vận chuyển / Lắp đặt / CSKH).
        Nhớ cấu hình <em>sync_role</em> ở CRM Pipeline Settings để map đúng cột.
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
                    {s.crm_sync_type && <span className="ml-1 text-[9px] font-normal opacity-70">↔CRM</span>}
                  </button>
                  {i < sorted.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300 mx-0.5 shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          {/* Stage list */}
          <div className="border-t">
            {sorted.map((s, i) => (
              <div key={s.id}
                className={`flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 hover:bg-gray-50 ${!s.is_active ? 'opacity-50' : ''}`}>
                <div className="flex flex-col gap-0.5">
                  <button type="button" onClick={() => moveStage(s, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[10px]">▲</button>
                  <button type="button" onClick={() => moveStage(s, 1)} disabled={i === sorted.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[10px]">▼</button>
                </div>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: s.color || '#f97316' }}>
                  {s.order_index}
                </div>
                <span className="text-lg shrink-0">{s.icon || '📦'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    {s.name}
                    {s.crm_sync_type && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                        {CRM_SYNC_LABEL[s.crm_sync_type] || s.crm_sync_type}
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
            ))}
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

              {/* CRM sync */}
              {!editingIntake && (
                <div>
                  <label className="text-[10px] font-medium text-gray-500 block mb-1">
                    Đồng bộ CRM khi deal VC tới cột này ✅
                  </label>
                  <select
                    value={form.crm_sync_type}
                    onChange={(e) => setForm((f) => ({ ...f, crm_sync_type: e.target.value }))}
                    className="w-full h-8 px-2 border rounded-lg text-sm bg-white"
                  >
                    {CRM_SYNC_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Khi chọn, deal CRM liên kết sẽ tự động nhảy sang cột CRM tương ứng và thông báo nhân viên sale.
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
              Chưa có cột «chờ vận chuyển». Thêm migration hoặc tạo thủ công với <code>bucket_slug: &apos;delivery_pending&apos;</code>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
