import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Plus, GripVertical, Pencil, Trash2, Power, PowerOff, ChevronDown, ChevronUp, Save, X, Link2, ArrowRight, Settings2 } from 'lucide-react';

const ICONS = ['💬','🎨','💰','📝','🏭','🚛','🔧','❤️','📋','🔍','📦','🛡️','⭐','📊','🔔','✅','❌','🏗️','🔄','📌'];

function slugify(str) {
  return str.toLowerCase().replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g,'a').replace(/[èéẹẻẽêềếệểễ]/g,'e')
    .replace(/[ìíịỉĩ]/g,'i').replace(/[òóọỏõôồốộổỗơờớợởỡ]/g,'o')
    .replace(/[ùúụủũưừứựửữ]/g,'u').replace(/[ỳýỵỷỹ]/g,'y').replace(/đ/g,'d')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

export default function WorkflowSettings() {
  const [stages, setStages] = useState([]);
  const [custStatuses, setCustStatuses] = useState([]);
  const [mappings, setMappings] = useState([]); // { stage_id, customer_status_id }
  const [loading, setLoading] = useState(true);
  const [editStage, setEditStage] = useState(null); // stage being edited
  const [editStatus, setEditStatus] = useState(null);
  const [tab, setTab] = useState('stages'); // 'stages' | 'statuses' | 'mapping'
  const [dragIdx, setDragIdx] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, csr, mr] = await Promise.all([
        api.get('/stages').catch(() => ({ data: { stages: [] } })),
        api.get('/stages/customer-statuses').catch(() => ({ data: { statuses: [] } })),
        api.get('/stages/status-mapping').catch(() => ({ data: { mappings: [] } })),
      ]);
      setStages(sr.data.stages || []);
      setCustStatuses(csr.data.statuses || []);
      setMappings((mr.data.mappings || []).map(m => ({ stage_id: m.stage_id, customer_status_id: m.customer_status_id })));
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ═══ Stage CRUD ═══
  const saveStage = async (s) => {
    try {
      if (s.id) {
        await api.put(`/stages/${s.id}`, s);
      } else {
        await api.post('/stages', { ...s, slug: s.slug || slugify(s.name) });
      }
      setEditStage(null);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const toggleStageActive = async (s) => {
    try {
      await api.put(`/stages/${s.id}`, { is_active: !s.is_active });
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteStage = async (s) => {
    if (!confirm(`Xóa quy trình "${s.name}"? Chỉ xóa được nếu không có NV/DA liên kết.`)) return;
    try {
      await api.delete(`/stages/${s.id}`);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Không thể xóa — hãy vô hiệu hóa thay vì xóa'); }
  };

  const moveStage = async (idx, dir) => {
    const arr = [...stages];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
    const order = arr.map((s, i) => ({ id: s.id, order_index: i + 1 }));
    setStages(arr.map((s, i) => ({ ...s, order_index: i + 1 })));
    try { await api.put('/stages/reorder', { order }); } catch (_) { load(); }
  };

  // ═══ Customer Status CRUD ═══
  const saveCustStatus = async (s) => {
    try {
      if (s.id) {
        await api.put(`/stages/customer-statuses/${s.id}`, s);
      } else {
        await api.post('/stages/customer-statuses', { ...s, slug: s.slug || slugify(s.name) });
      }
      setEditStatus(null);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteCustStatus = async (s) => {
    if (!confirm(`Xóa trạng thái KH "${s.name}"?`)) return;
    try { await api.delete(`/stages/customer-statuses/${s.id}`); load(); } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  // ═══ Mapping save ═══
  const saveMapping = async () => {
    try {
      await api.put('/stages/status-mapping', { mappings: mappings.filter(m => m.customer_status_id) });
      alert('Đã lưu liên kết!');
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const updateMapping = (stageId, custStatusId) => {
    setMappings(prev => {
      const next = prev.filter(m => m.stage_id !== stageId);
      if (custStatusId) next.push({ stage_id: stageId, customer_status_id: custStatusId });
      return next;
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
    </div>
  );

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2"><Settings2 className="h-6 w-6 text-blue-600" /> Quản Lý Quy Trình</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Thêm, sửa, sắp xếp quy trình · Trạng thái KH · Liên kết QT↔KH</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
        {[
          { id: 'stages', label: '📋 Quy trình', count: stages.length },
          { id: 'statuses', label: '👤 Trạng thái KH', count: custStatuses.length },
          { id: 'mapping', label: '🔗 Liên kết QT↔KH' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 h-9 rounded-md text-xs sm:text-sm font-medium cursor-pointer flex items-center justify-center gap-1 ${
              tab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label} {t.count !== undefined && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ═══ TAB: QUY TRÌNH ═══ */}
      {tab === 'stages' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setEditStage({ name: '', slug: '', color: '#3B82F6', icon: '📋', description: '' })}
              className="h-8 px-3 bg-blue-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-blue-700 cursor-pointer">
              <Plus className="h-3.5 w-3.5" /> Thêm quy trình
            </button>
          </div>

          <div className="space-y-2">
            {stages.map((s, i) => (
              <div key={s.id} className={`flex items-center gap-2 sm:gap-3 p-3 rounded-xl border transition-all ${s.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                {/* Drag handle + order */}
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <button onClick={() => moveStage(i, -1)} disabled={i === 0} className="w-6 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20 cursor-pointer"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <span className="text-[10px] font-bold text-gray-400">{s.order_index}</span>
                  <button onClick={() => moveStage(i, 1)} disabled={i === stages.length - 1} className="w-6 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20 cursor-pointer"><ChevronDown className="h-3.5 w-3.5" /></button>
                </div>

                {/* Color bar + icon */}
                <div className="w-2 h-12 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-lg shrink-0">{s.icon || '📋'}</span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-gray-900">{s.name}</h3>
                    {!s.is_active && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Tắt</span>}
                  </div>
                  <p className="text-[10px] text-gray-500">{s.slug} · {s.description || '—'}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEditStage({ ...s })} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-blue-600 cursor-pointer" title="Sửa">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => toggleStageActive(s)} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center cursor-pointer" title={s.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'}>
                    {s.is_active ? <PowerOff className="h-3.5 w-3.5 text-amber-500" /> : <Power className="h-3.5 w-3.5 text-emerald-500" />}
                  </button>
                  <button onClick={() => deleteStage(s)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer" title="Xóa">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Edit/Create modal */}
          {editStage && <StageForm stage={editStage} onSave={saveStage} onCancel={() => setEditStage(null)} icons={ICONS} />}
        </div>
      )}

      {/* ═══ TAB: TRẠNG THÁI KH ═══ */}
      {tab === 'statuses' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setEditStatus({ name: '', slug: '', color: '#6B7280', icon: '👤', description: '' })}
              className="h-8 px-3 bg-blue-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-blue-700 cursor-pointer">
              <Plus className="h-3.5 w-3.5" /> Thêm trạng thái
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {custStatuses.map(s => (
              <div key={s.id} className={`p-3 rounded-xl border ${s.is_active !== false ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{s.icon || '👤'}</span>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <h3 className="text-sm font-bold text-gray-900 flex-1">{s.name}</h3>
                  <span className="text-[10px] text-gray-400 font-mono">{s.slug}</span>
                </div>
                {s.description && <p className="text-[10px] text-gray-500 mb-2">{s.description}</p>}
                <div className="flex items-center gap-1 justify-end">
                  <button onClick={() => setEditStatus({ ...s })} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-blue-600 cursor-pointer">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteCustStatus(s)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {editStatus && <StatusForm status={editStatus} onSave={saveCustStatus} onCancel={() => setEditStatus(null)} icons={ICONS} />}
        </div>
      )}

      {/* ═══ TAB: LIÊN KẾT QT↔KH ═══ */}
      {tab === 'mapping' && (
        <div className="space-y-4">
          <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
            <strong>Cách hoạt động:</strong> Khi dự án chuyển đến quy trình nào → khách hàng tự động cập nhật trạng thái tương ứng.
          </div>

          <div className="space-y-2">
            {stages.filter(s => s.is_active).map(s => {
              const currentMapping = mappings.find(m => m.stage_id === s.id);
              return (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border">
                  <div className="w-2 h-10 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-base">{s.icon || '📋'}</span>
                  <div className="w-32 sm:w-40 shrink-0">
                    <h3 className="text-sm font-bold text-gray-900">{s.name}</h3>
                    <p className="text-[10px] text-gray-400">{s.slug}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                  <select value={currentMapping?.customer_status_id || ''}
                    onChange={e => updateMapping(s.id, e.target.value)}
                    className="flex-1 h-8 px-2 border rounded-lg text-xs bg-white max-w-xs">
                    <option value="">— Không liên kết —</option>
                    {custStatuses.filter(cs => cs.is_active !== false).map(cs => (
                      <option key={cs.id} value={cs.id}>{cs.icon} {cs.name}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <button onClick={saveMapping}
            className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
            <Save className="h-4 w-4" /> Lưu liên kết
          </button>
        </div>
      )}
    </div>
  );
}

// ═══ Stage edit form ═══
function StageForm({ stage, onSave, onCancel, icons }) {
  const [f, setF] = useState({ ...stage });
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold text-gray-900">{stage.id ? 'Sửa quy trình' : 'Thêm quy trình'}</h2>
        <div>
          <label className="text-[11px] font-medium text-gray-500 block mb-1">Tên quy trình *</label>
          <input value={f.name} onChange={e => setF({ ...f, name: e.target.value, slug: f.id ? f.slug : slugify(e.target.value) })}
            className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="VD: Sản xuất" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">Slug</label>
            <input value={f.slug} onChange={e => setF({ ...f, slug: e.target.value })}
              className="w-full h-9 px-3 border rounded-lg text-sm font-mono" placeholder="san-xuat" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">Màu</label>
            <div className="flex items-center gap-2">
              <input type="color" value={f.color} onChange={e => setF({ ...f, color: e.target.value })} className="w-9 h-9 rounded-lg cursor-pointer border-0" />
              <input value={f.color} onChange={e => setF({ ...f, color: e.target.value })} className="flex-1 h-9 px-2 border rounded-lg text-xs font-mono" />
            </div>
          </div>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-500 block mb-1">Icon</label>
          <div className="flex flex-wrap gap-1">
            {icons.map(ic => (
              <button key={ic} type="button" onClick={() => setF({ ...f, icon: ic })}
                className={`w-8 h-8 rounded-lg text-base flex items-center justify-center cursor-pointer ${f.icon === ic ? 'bg-blue-100 ring-2 ring-blue-500' : 'hover:bg-gray-100'}`}>{ic}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-500 block mb-1">Mô tả</label>
          <input value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })}
            className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="Mô tả ngắn gọn" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="h-8 px-3 border rounded-lg text-xs text-gray-600 cursor-pointer hover:bg-gray-50">Hủy</button>
          <button onClick={() => f.name && onSave(f)} disabled={!f.name}
            className="h-8 px-4 bg-blue-600 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-blue-700 disabled:opacity-50">
            {stage.id ? 'Cập nhật' : 'Tạo mới'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══ Customer status edit form ═══
function StatusForm({ status, onSave, onCancel, icons }) {
  const [f, setF] = useState({ ...status });
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold text-gray-900">{status.id ? 'Sửa trạng thái' : 'Thêm trạng thái KH'}</h2>
        <div>
          <label className="text-[11px] font-medium text-gray-500 block mb-1">Tên *</label>
          <input value={f.name} onChange={e => setF({ ...f, name: e.target.value, slug: f.id ? f.slug : slugify(e.target.value) })}
            className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="VD: Đang thi công" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">Slug</label>
            <input value={f.slug} onChange={e => setF({ ...f, slug: e.target.value })}
              className="w-full h-9 px-3 border rounded-lg text-sm font-mono" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">Màu</label>
            <div className="flex items-center gap-2">
              <input type="color" value={f.color} onChange={e => setF({ ...f, color: e.target.value })} className="w-9 h-9 rounded-lg cursor-pointer border-0" />
              <input value={f.color} onChange={e => setF({ ...f, color: e.target.value })} className="flex-1 h-9 px-2 border rounded-lg text-xs font-mono" />
            </div>
          </div>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-500 block mb-1">Icon</label>
          <div className="flex flex-wrap gap-1">
            {icons.map(ic => (
              <button key={ic} type="button" onClick={() => setF({ ...f, icon: ic })}
                className={`w-8 h-8 rounded-lg text-base flex items-center justify-center cursor-pointer ${f.icon === ic ? 'bg-blue-100 ring-2 ring-blue-500' : 'hover:bg-gray-100'}`}>{ic}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-500 block mb-1">Mô tả</label>
          <input value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })}
            className="w-full h-9 px-3 border rounded-lg text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="h-8 px-3 border rounded-lg text-xs text-gray-600 cursor-pointer hover:bg-gray-50">Hủy</button>
          <button onClick={() => f.name && onSave(f)} disabled={!f.name}
            className="h-8 px-4 bg-blue-600 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-blue-700 disabled:opacity-50">
            {status.id ? 'Cập nhật' : 'Tạo mới'}
          </button>
        </div>
      </div>
    </div>
  );
}
