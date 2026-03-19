import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Settings, Plus, Trash2, Save, GripVertical, ChevronRight, Trophy, XCircle, Eye, EyeOff } from 'lucide-react';

const COLORS = ['#94A3B8','#3B82F6','#8B5CF6','#F59E0B','#F97316','#10B981','#EF4444','#EC4899','#06B6D4','#6366F1'];
const ICONS = ['🆕','📞','💬','📋','📧','⏳','🤝','💰','📝','✅','❌','🎯','🔥','⭐','🏆'];

export default function PipelineSettingsPage() {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState('lead');
  const [adding, setAdding] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#94A3B8', icon: '🆕', is_won: false, is_lost: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/crm/pipeline-stages', { params: { all: 'true' } });
      setStages(data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = stages.filter(s => s.pipeline_type === activeType).sort((a, b) => a.order_index - b.order_index);
  const otherType = activeType === 'lead' ? 'deal' : 'lead';
  const otherFiltered = stages.filter(s => s.pipeline_type === otherType).sort((a, b) => a.order_index - b.order_index);

  const startAdd = (type) => {
    setAdding(type);
    setEditId(null);
    setForm({ name: '', color: COLORS[filtered.length % COLORS.length], icon: '🆕', is_won: false, is_lost: false });
  };

  const startEdit = (stage) => {
    setEditId(stage.id);
    setAdding(null);
    setForm({ name: stage.name, color: stage.color, icon: stage.icon || '', is_won: stage.is_won, is_lost: stage.is_lost });
  };

  const saveNew = async () => {
    if (!form.name.trim()) return alert('Nhập tên giai đoạn');
    try {
      await api.post('/crm/pipeline-stages', { ...form, pipeline_type: adding });
      setAdding(null);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const saveEdit = async () => {
    if (!form.name.trim()) return alert('Nhập tên giai đoạn');
    try {
      await api.put(`/crm/pipeline-stages/${editId}`, form);
      setEditId(null);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const del = async (id) => {
    if (!confirm('Xóa giai đoạn này?')) return;
    try {
      await api.delete(`/crm/pipeline-stages/${id}`);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const toggleActive = async (stage) => {
    try {
      await api.put(`/crm/pipeline-stages/${stage.id}`, { is_active: !stage.is_active });
      load();
    } catch (e) { alert('Lỗi'); }
  };

  const moveStage = async (stage, dir) => {
    const list = filtered.slice();
    const idx = list.findIndex(s => s.id === stage.id);
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === list.length - 1)) return;
    [list[idx], list[idx + dir]] = [list[idx + dir], list[idx]];
    const reorder = list.map((s, i) => ({ id: s.id, order_index: i + 1 }));
    try {
      await api.put('/crm/pipeline-stages-reorder', { stages: reorder });
      load();
    } catch (e) { alert('Lỗi'); }
  };

  const renderPipeline = (type, list) => (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm ${type === 'lead' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
            {type === 'lead' ? '🎯' : '💰'}
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Pipeline {type === 'lead' ? 'Lead' : 'Deal'}</h2>
            <p className="text-[10px] text-gray-500">{list.length} giai đoạn</p>
          </div>
        </div>
        <button onClick={() => startAdd(type)}
          className="h-8 px-3 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 flex items-center gap-1.5 cursor-pointer">
          <Plus className="h-3.5 w-3.5" /> Thêm
        </button>
      </div>

      {/* Pipeline Visual */}
      <div className="p-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {list.map((s, i) => (
            <div key={s.id} className="flex items-center shrink-0">
              <div
                onClick={() => startEdit(s)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all hover:scale-105 border-2 ${
                  !s.is_active ? 'opacity-40 border-dashed' : 'border-transparent'
                } ${editId === s.id ? 'ring-2 ring-blue-500' : ''}`}
                style={{ backgroundColor: s.color + '20', color: s.color, borderColor: editId === s.id ? '#3B82F6' : s.is_active ? 'transparent' : s.color }}
              >
                {s.icon && <span className="mr-1">{s.icon}</span>}
                {s.name}
                {s.is_won && <Trophy className="inline h-3 w-3 ml-1" />}
                {s.is_lost && <XCircle className="inline h-3 w-3 ml-1" />}
              </div>
              {i < list.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300 mx-0.5 shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Stages List */}
      <div className="border-t">
        {list.map((s, i) => (
          <div key={s.id} className={`flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 hover:bg-gray-50 ${!s.is_active ? 'opacity-50' : ''}`}>
            <div className="flex flex-col gap-0.5">
              <button onClick={() => moveStage(s, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[10px]">▲</button>
              <button onClick={() => moveStage(s, 1)} disabled={i === list.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[10px]">▼</button>
            </div>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: s.color }}>
              {s.order_index}
            </div>
            <span className="text-lg shrink-0">{s.icon || '📋'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{s.name}</p>
              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                {s.is_won && <span className="text-emerald-600 font-bold">✅ Thắng</span>}
                {s.is_lost && <span className="text-red-500 font-bold">❌ Thua/Mất</span>}
                {!s.is_active && <span className="text-orange-500">Ẩn</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => toggleActive(s)} className="p-1.5 rounded hover:bg-gray-100 cursor-pointer" title={s.is_active ? 'Ẩn' : 'Hiện'}>
                {s.is_active ? <Eye className="h-3.5 w-3.5 text-gray-400" /> : <EyeOff className="h-3.5 w-3.5 text-orange-400" />}
              </button>
              <button onClick={() => startEdit(s)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600 cursor-pointer">
                <Save className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => del(s.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500 cursor-pointer">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Form */}
      {adding === type && (
        <div className="p-4 border-t bg-blue-50/50">
          <StageForm form={form} setForm={setForm} onSave={saveNew} onCancel={() => setAdding(null)} />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6 text-blue-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cài đặt Pipeline</h1>
          <p className="text-sm text-gray-500">Quản lý giai đoạn cho Lead và Deal</p>
        </div>
      </div>

      {/* Edit Form (floating) */}
      {editId && (
        <div className="bg-white rounded-xl border border-blue-200 p-4 shadow-lg">
          <h3 className="text-sm font-bold text-gray-800 mb-3">✏️ Sửa giai đoạn</h3>
          <StageForm form={form} setForm={setForm} onSave={saveEdit} onCancel={() => setEditId(null)} />
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-400">Đang tải...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {renderPipeline('lead', stages.filter(s => s.pipeline_type === 'lead').sort((a, b) => a.order_index - b.order_index))}
          {renderPipeline('deal', stages.filter(s => s.pipeline_type === 'deal').sort((a, b) => a.order_index - b.order_index))}
        </div>
      )}
    </div>
  );
}

function StageForm({ form, setForm, onSave, onCancel }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-medium text-gray-500 block mb-1">Tên giai đoạn *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full h-8 px-3 border rounded-lg text-sm" placeholder="VD: Đang tư vấn" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-gray-500 block mb-1">Icon</label>
          <div className="flex flex-wrap gap-1">
            {ICONS.map(ic => (
              <button key={ic} onClick={() => setForm(f => ({ ...f, icon: ic }))}
                className={`w-7 h-7 rounded text-sm cursor-pointer ${form.icon === ic ? 'bg-blue-100 ring-2 ring-blue-500' : 'bg-gray-50 hover:bg-gray-100'}`}>
                {ic}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="text-[10px] font-medium text-gray-500 block mb-1">Màu</label>
        <div className="flex gap-1.5">
          {COLORS.map(c => (
            <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
              className={`w-7 h-7 rounded-full cursor-pointer transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={form.is_won} onChange={e => setForm(f => ({ ...f, is_won: e.target.checked, is_lost: false }))}
            className="rounded" />
          <Trophy className="h-3.5 w-3.5 text-emerald-500" /> Giai đoạn Thắng
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={form.is_lost} onChange={e => setForm(f => ({ ...f, is_lost: e.target.checked, is_won: false }))}
            className="rounded" />
          <XCircle className="h-3.5 w-3.5 text-red-500" /> Giai đoạn Thua/Mất
        </label>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="h-8 px-3 bg-gray-100 text-gray-700 rounded-lg text-xs cursor-pointer">Hủy</button>
        <button onClick={onSave} className="h-8 px-4 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 cursor-pointer flex items-center gap-1">
          <Save className="h-3.5 w-3.5" /> Lưu
        </button>
      </div>
    </div>
  );
}
