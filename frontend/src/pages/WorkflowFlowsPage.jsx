import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  GitBranch, Plus, Edit, Save, Trash2, Copy, Star, ChevronDown, ChevronRight,
  ArrowRight, Clock, Building2, X, GripVertical
} from 'lucide-react';

const ICONS = ['🔄','📋','🏭','🚛','🔧','❤️','💼','⭐','🏗️','🛡️','📊','🏠'];

export default function WorkflowFlowsPage() {
  const [flows, setFlows] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, uRes] = await Promise.all([
        api.get('/flows'),
        api.get('/ecosystem/units'),
      ]);
      setFlows(fRes.data.flows || []);
      setDivisions((uRes.data.units || []).filter(u => u.level?.depth === 1));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteFlow = async (id) => {
    if (!confirm('Vô hiệu hóa luồng này?')) return;
    try { await api.delete(`/flows/${id}`); load(); } catch {}
  };

  const cloneFlow = async (id) => {
    try { await api.post(`/flows/${id}/clone`); load(); } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const setDefault = async (id) => {
    try { await api.put(`/flows/${id}`, { is_default: true }); load(); } catch {}
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full" />
    </div>
  );

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-indigo-600" /> Quản Lý Luồng
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Tạo luồng công việc: xác định thứ tự các Khối mà dự án đi qua
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="h-9 px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Tạo luồng
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <FlowForm
          divisions={divisions}
          onSaved={() => { load(); setShowCreate(false); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* List */}
      <div className="space-y-3">
        {flows.map(f => (
          editId === f.id ? (
            <FlowForm
              key={f.id}
              flow={f}
              divisions={divisions}
              onSaved={() => { load(); setEditId(null); }}
              onCancel={() => setEditId(null)}
            />
          ) : (
            <FlowCard
              key={f.id}
              flow={f}
              onEdit={() => setEditId(f.id)}
              onDelete={() => deleteFlow(f.id)}
              onClone={() => cloneFlow(f.id)}
              onSetDefault={() => setDefault(f.id)}
            />
          )
        ))}
      </div>

      {flows.length === 0 && !showCreate && (
        <div className="text-center py-16 bg-white rounded-2xl border">
          <GitBranch className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-500">Chưa có luồng nào</p>
          <p className="text-xs text-gray-400 mt-1">Tạo luồng đầu tiên để xác định quy trình dự án</p>
        </div>
      )}
    </div>
  );
}

/* ═══ FLOW CARD ═══ */
function FlowCard({ flow, onEdit, onDelete, onClone, onSetDefault }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl border overflow-hidden hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3 p-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: (flow.color || '#6366F1') + '15' }}
        >
          {flow.icon || '🔄'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-900">{flow.name}</h3>
            {flow.is_default && (
              <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <Star className="h-2.5 w-2.5" /> Mặc định
              </span>
            )}
          </div>
          {flow.description && (
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{flow.description}</p>
          )}
        </div>

        {/* Flow steps preview */}
        <div className="hidden sm:flex items-center gap-1 shrink-0 max-w-[400px] overflow-x-auto">
          {(flow.steps || []).map((step, i) => (
            <span key={step.id} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />}
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                style={{
                  backgroundColor: (step.division?.level?.color || '#6b7280') + '20',
                  color: step.division?.level?.color || '#6b7280',
                }}
              >
                {step.division?.level?.icon} {step.division?.short_name || step.division?.name}
              </span>
            </span>
          ))}
          {(flow.steps || []).length === 0 && (
            <span className="text-[10px] text-gray-400 italic">Chưa có bước</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {!flow.is_default && (
            <button onClick={onSetDefault} className="w-7 h-7 rounded-lg hover:bg-amber-50 flex items-center justify-center text-gray-400 hover:text-amber-600 cursor-pointer" title="Đặt mặc định">
              <Star className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={onClone} className="w-7 h-7 rounded-lg hover:bg-blue-50 flex items-center justify-center text-gray-400 hover:text-blue-600 cursor-pointer" title="Nhân bản">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button onClick={onEdit} className="w-7 h-7 rounded-lg hover:bg-indigo-50 flex items-center justify-center text-gray-400 hover:text-indigo-600 cursor-pointer" title="Sửa">
            <Edit className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer" title="Xóa">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <button onClick={() => setExpanded(!expanded)} className="cursor-pointer shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        </button>
      </div>

      {/* Expanded: step details */}
      {expanded && (
        <div className="border-t px-4 py-3 space-y-2 bg-gray-50/50">
          <p className="text-[10px] font-semibold text-gray-500 uppercase">Chi tiết các bước ({(flow.steps || []).length})</p>
          {(flow.steps || []).map((step, i) => (
            <div key={step.id} className="flex items-center gap-3 bg-white rounded-lg border p-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ backgroundColor: step.division?.level?.color || '#6b7280' }}
              >
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {step.division?.level?.icon} {step.division?.name}
                </p>
                {step.description && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{step.description}</p>
                )}
              </div>
              {(step.setup_days > 0 || step.setup_hours > 0) && (
                <span className="text-[10px] text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                  <Clock className="h-2.5 w-2.5" />
                  {step.setup_days > 0 && `${step.setup_days}d`}
                  {step.setup_hours > 0 && `${step.setup_hours}h`} setup
                </span>
              )}
              {i < (flow.steps || []).length - 1 && (
                <ArrowRight className="h-4 w-4 text-gray-300 shrink-0" />
              )}
            </div>
          ))}
          {(flow.steps || []).length === 0 && (
            <p className="text-xs text-gray-400 italic py-2">Chưa có bước nào trong luồng</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══ FLOW FORM ═══ */
function FlowForm({ flow, divisions, onSaved, onCancel }) {
  const [name, setName] = useState(flow?.name || '');
  const [desc, setDesc] = useState(flow?.description || '');
  const [color, setColor] = useState(flow?.color || '#6366F1');
  const [icon, setIcon] = useState(flow?.icon || '🔄');
  const [isDefault, setIsDefault] = useState(flow?.is_default || false);
  const [steps, setSteps] = useState(
    (flow?.steps || []).map(s => ({
      _key: s.id || Math.random().toString(36).slice(2),
      division_unit_id: s.division_unit_id,
      setup_days: s.setup_days || 0,
      setup_hours: s.setup_hours || 0,
      description: s.description || '',
    }))
  );
  const [saving, setSaving] = useState(false);

  const addStep = (divId) => {
    if (!divId) return;
    setSteps(prev => [
      ...prev,
      {
        _key: Math.random().toString(36).slice(2),
        division_unit_id: divId,
        setup_days: 0,
        setup_hours: 0,
        description: '',
      }
    ]);
  };

  const updateStep = (key, field, value) => {
    setSteps(prev => prev.map(s => s._key === key ? { ...s, [field]: value } : s));
  };

  const removeStep = (key) => {
    setSteps(prev => prev.filter(s => s._key !== key));
  };

  const moveStep = (key, dir) => {
    setSteps(prev => {
      const idx = prev.findIndex(s => s._key === key);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  };

  const save = async () => {
    if (!name.trim()) return alert('Nhập tên luồng');
    if (steps.length === 0) return alert('Thêm ít nhất 1 bước');

    setSaving(true);
    try {
      if (flow?.id) {
        // Update
        await api.put(`/flows/${flow.id}`, { name, description: desc, color, icon, is_default: isDefault });
        await api.put(`/flows/${flow.id}/steps`, {
          steps: steps.map((s, i) => ({
            division_unit_id: s.division_unit_id,
            order_index: i,
            setup_days: parseInt(s.setup_days) || 0,
            setup_hours: parseInt(s.setup_hours) || 0,
            description: s.description || null,
          })),
        });
      } else {
        // Create
        await api.post('/flows', {
          name, description: desc, color, icon, is_default: isDefault,
          steps: steps.map((s, i) => ({
            division_unit_id: s.division_unit_id,
            order_index: i,
            setup_days: parseInt(s.setup_days) || 0,
            setup_hours: parseInt(s.setup_hours) || 0,
            description: s.description || null,
          })),
        });
      }
      onSaved();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  // Available divisions not yet in steps (for quick add)
  const usedDivIds = new Set(steps.map(s => s.division_unit_id));

  return (
    <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-4 space-y-4">
      <h3 className="text-sm font-bold text-indigo-900">
        {flow ? '✏️ Sửa luồng' : '➕ Tạo luồng mới'}
      </h3>

      {/* Basic info */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="text-[11px] font-medium text-gray-600 block mb-1">Tên luồng *</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="VD: Luồng tủ bếp chuẩn" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="text-[11px] font-medium text-gray-600 block mb-1">Mô tả</label>
          <input value={desc} onChange={e => setDesc(e.target.value)}
            className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="Ghi chú..." />
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-600 block mb-1">Màu</label>
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            className="w-full h-9 border rounded-lg cursor-pointer" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-600 block mb-1">Icon</label>
          <div className="flex flex-wrap gap-1">
            {ICONS.map(i => (
              <button key={i} type="button" onClick={() => setIcon(i)}
                className={`w-7 h-7 rounded text-sm cursor-pointer ${icon === i ? 'bg-indigo-200 ring-2 ring-indigo-400' : 'bg-white border hover:bg-gray-50'}`}>
                {i}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)}
              className="accent-indigo-600" />
            <span className="text-xs text-gray-700">Đặt làm luồng mặc định</span>
          </label>
        </div>
      </div>

      {/* Steps builder */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 uppercase block mb-2">
          Các bước trong luồng ({steps.length})
        </label>

        <div className="space-y-2">
          {steps.map((step, i) => {
            const div = divisions.find(d => d.id === step.division_unit_id);
            return (
              <div key={step._key} className="bg-white rounded-lg border p-3 flex items-start gap-2">
                {/* Number + drag area */}
                <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: div?.level?.color || '#6b7280' }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button type="button" onClick={() => moveStep(step._key, -1)} disabled={i === 0}
                      className="text-[10px] text-gray-400 hover:text-gray-700 cursor-pointer disabled:opacity-30">▲</button>
                    <button type="button" onClick={() => moveStep(step._key, 1)} disabled={i === steps.length - 1}
                      className="text-[10px] text-gray-400 hover:text-gray-700 cursor-pointer disabled:opacity-30">▼</button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={step.division_unit_id}
                      onChange={e => updateStep(step._key, 'division_unit_id', e.target.value)}
                      className="flex-1 h-8 px-2 border rounded-lg text-xs min-w-[150px]"
                    >
                      <option value="">— Chọn Khối —</option>
                      {divisions.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.level?.icon} {d.name}
                        </option>
                      ))}
                    </select>

                    {i > 0 && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Clock className="h-3 w-3 text-orange-500" />
                        <input
                          type="number" min="0" value={step.setup_days}
                          onChange={e => updateStep(step._key, 'setup_days', e.target.value)}
                          className="w-12 h-7 px-1 border rounded text-[11px] text-center"
                          title="Ngày setup"
                        />
                        <span className="text-[10px] text-gray-500">ngày</span>
                        <input
                          type="number" min="0" value={step.setup_hours}
                          onChange={e => updateStep(step._key, 'setup_hours', e.target.value)}
                          className="w-12 h-7 px-1 border rounded text-[11px] text-center"
                          title="Giờ setup"
                        />
                        <span className="text-[10px] text-gray-500">giờ</span>
                      </div>
                    )}
                  </div>

                  <input
                    value={step.description}
                    onChange={e => updateStep(step._key, 'description', e.target.value)}
                    className="w-full h-7 px-2 border rounded text-[11px] text-gray-600"
                    placeholder="Ghi chú cho bước này..."
                  />
                </div>

                {/* Arrow + remove */}
                <div className="flex items-center gap-1 shrink-0">
                  {i < steps.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-gray-300" />
                  )}
                  <button type="button" onClick={() => removeStep(step._key)}
                    className="w-6 h-6 rounded hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add step buttons */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {divisions.map(d => (
            <button
              key={d.id}
              type="button"
              onClick={() => addStep(d.id)}
              className="text-[10px] px-2 py-1 rounded-lg border border-dashed hover:bg-white cursor-pointer flex items-center gap-1 transition-colors"
              style={{ borderColor: (d.level?.color || '#6b7280') + '60', color: d.level?.color || '#6b7280' }}
            >
              <Plus className="h-2.5 w-2.5" />
              {d.level?.icon} {d.short_name || d.name}
            </button>
          ))}
          {divisions.length === 0 && (
            <p className="text-[10px] text-gray-400 italic">Chưa có Khối nào — tạo Khối trong Hệ sinh thái trước</p>
          )}
        </div>

        {/* Preview */}
        {steps.length > 0 && (
          <div className="mt-3 bg-white rounded-lg border p-3">
            <p className="text-[10px] font-medium text-gray-500 mb-2">Luồng dự kiến:</p>
            <div className="flex items-center flex-wrap gap-1">
              {steps.map((step, i) => {
                const div = divisions.find(d => d.id === step.division_unit_id);
                return (
                  <span key={step._key} className="flex items-center gap-1">
                    {i > 0 && (
                      <span className="flex items-center text-gray-300">
                        <ArrowRight className="h-3 w-3" />
                        {(step.setup_days > 0 || step.setup_hours > 0) && (
                          <span className="text-[8px] text-orange-500">
                            +{step.setup_days > 0 ? `${step.setup_days}d` : ''}{step.setup_hours > 0 ? `${step.setup_hours}h` : ''}
                          </span>
                        )}
                      </span>
                    )}
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: (div?.level?.color || '#6b7280') + '20',
                        color: div?.level?.color || '#6b7280',
                      }}
                    >
                      {div?.level?.icon} {div?.short_name || div?.name || '?'}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="h-8 px-3 border rounded-lg text-xs text-gray-600 cursor-pointer">Hủy</button>
        <button type="button" onClick={save} disabled={saving}
          className="h-8 px-4 bg-indigo-600 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
          {saving ? 'Đang lưu...' : <><Save className="h-3.5 w-3.5" /> Lưu</>}
        </button>
      </div>
    </div>
  );
}
