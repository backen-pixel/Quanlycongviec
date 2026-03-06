import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  Layers, Plus, Edit, Save, Trash2, Star, CheckSquare, FileText, Building2, Copy
} from 'lucide-react';

export default function TemplateSetsPage() {
  const navigate = useNavigate();
  const [units, setUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState('');
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);

  const loadUnits = useCallback(async () => {
    try {
      const { data } = await api.get('/ecosystem/units');
      const companies = (data.units || []).filter(u => u.level?.depth === 2);
      setUnits(companies);
      if (!selectedUnit && companies.length > 0) setSelectedUnit(companies[0].id);
    } catch {}
  }, []);

  const loadSets = useCallback(async () => {
    if (!selectedUnit) { setSets([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/company-templates/units/${selectedUnit}/template-sets`);
      setSets(data.sets || []);
    } catch {}
    setLoading(false);
  }, [selectedUnit]);

  useEffect(() => { loadUnits(); }, [loadUnits]);
  useEffect(() => { loadSets(); }, [loadSets]);

  const deleteSet = async (id) => {
    if (!confirm('Xóa bộ mẫu này?')) return;
    try {
      await api.put(`/company-templates/template-sets/${id}`, { is_active: false });
      loadSets();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const setDefault = async (id) => {
    try {
      await api.put(`/company-templates/template-sets/${id}`, { is_default: true });
      loadSets();
    } catch {}
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="h-5 w-5 text-purple-600" /> Bộ Quy Trình Mẫu
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Mỗi công ty có thể có nhiều bộ quy trình khác nhau</p>
        </div>
        <div className="flex items-center gap-2">
          <select 
            value={selectedUnit} 
            onChange={e => setSelectedUnit(e.target.value)} 
            className="h-9 px-3 border rounded-lg text-sm min-w-[200px]"
          >
            <option value="">— Chọn Công ty —</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>
                {u.level?.icon} {u.parent?.name ? u.parent.name + ' · ' : ''}{u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedUnit && (
        <button 
          onClick={() => setShowCreate(true)}
          className="h-8 px-3 bg-purple-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-purple-700 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" /> Tạo bộ quy trình mới
        </button>
      )}

      {showCreate && (
        <SetForm 
          unitId={selectedUnit} 
          onSaved={() => { loadSets(); setShowCreate(false); }} 
          onCancel={() => setShowCreate(false)} 
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-6 w-6 border-2 border-purple-200 border-t-purple-600 rounded-full" />
        </div>
      ) : (
        <div className="space-y-2">
          {sets.map(set => editId === set.id ? (
            <SetForm 
              key={set.id} 
              set={set} 
              unitId={selectedUnit} 
              onSaved={() => { loadSets(); setEditId(null); }} 
              onCancel={() => setEditId(null)} 
            />
          ) : (
            <SetCard 
              key={set.id} 
              set={set} 
              onEdit={() => setEditId(set.id)} 
              onDelete={() => deleteSet(set.id)}
              onSetDefault={() => setDefault(set.id)}
              onManage={() => navigate(`/template-sets/${set.id}`)}
            />
          ))}
        </div>
      )}

      {!loading && sets.length === 0 && selectedUnit && (
        <div className="text-center py-16 bg-white rounded-2xl border">
          <Layers className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-500">Công ty chưa có bộ quy trình nào</p>
        </div>
      )}
    </div>
  );
}

function SetCard({ set, onEdit, onDelete, onSetDefault, onManage }) {
  return (
    <div className="bg-white rounded-xl border p-4 hover:shadow-md transition">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-gray-900">{set.name}</h3>
            {set.is_default && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                <Star className="h-3 w-3 inline" /> Mặc định
              </span>
            )}
          </div>
          {set.description && (
            <p className="text-xs text-gray-500 mb-2">{set.description}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <CheckSquare className="h-3.5 w-3.5" />
              {set.task_count || 0} nhiệm vụ
            </span>
            {set.project_type && (
              <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                {set.project_type}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button 
            onClick={onManage}
            className="w-8 h-8 rounded-lg hover:bg-purple-50 flex items-center justify-center text-purple-600 cursor-pointer"
            title="Quản lý nhiệm vụ"
          >
            <FileText className="h-4 w-4" />
          </button>
          {!set.is_default && (
            <button 
              onClick={onSetDefault}
              className="w-8 h-8 rounded-lg hover:bg-amber-50 flex items-center justify-center text-amber-600 cursor-pointer"
              title="Đặt làm mặc định"
            >
              <Star className="h-4 w-4" />
            </button>
          )}
          <button 
            onClick={onEdit}
            className="w-8 h-8 rounded-lg hover:bg-blue-50 flex items-center justify-center text-blue-600 cursor-pointer"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button 
            onClick={onDelete}
            className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-500 cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SetForm({ set, unitId, onSaved, onCancel }) {
  const [name, setName] = useState(set?.name || '');
  const [description, setDescription] = useState(set?.description || '');
  const [projectType, setProjectType] = useState(set?.project_type || '');
  const [isDefault, setIsDefault] = useState(set?.is_default || false);
  const [saving, setSaving] = useState(false);
  const [processes, setProcesses] = useState([]);
  const [selectedProcessIds, setSelectedProcessIds] = useState([]);
  const [loadingProcesses, setLoadingProcesses] = useState(false);

  // Load processes when creating new template (not editing)
  useEffect(() => {
    if (!set?.id && unitId) {
      loadProcesses();
    }
  }, [unitId, set]);

  const loadProcesses = async () => {
    setLoadingProcesses(true);
    try {
      const { data } = await api.get(`/company-processes/unit/${unitId}`);
      setProcesses(data.processes || []);
    } catch (e) {
      console.error('Load processes error:', e);
    }
    setLoadingProcesses(false);
  };

  const toggleProcess = (processId) => {
    setSelectedProcessIds(prev =>
      prev.includes(processId)
        ? prev.filter(id => id !== processId)
        : [...prev, processId]
    );
  };

  const selectAllProcesses = () => {
    if (selectedProcessIds.length === processes.length) {
      setSelectedProcessIds([]);
    } else {
      setSelectedProcessIds(processes.map(p => p.id));
    }
  };

  const totalSelectedTasks = processes
    .filter(p => selectedProcessIds.includes(p.id))
    .reduce((sum, p) => sum + (p.task_count || 0), 0);

  const save = async () => {
    if (!name.trim()) return alert('Nhập tên bộ mẫu');
    if (!set?.id && selectedProcessIds.length === 0) {
      return alert('Vui lòng chọn ít nhất 1 quy trình nội bộ');
    }
    
    setSaving(true);
    try {
      if (set?.id) {
        await api.put(`/company-templates/template-sets/${set.id}`, {
          name: name.trim(),
          description: description.trim() || null,
          project_type: projectType.trim() || null,
          is_default: isDefault,
        });
        onSaved();
      } else {
        const { data } = await api.post(`/company-templates/units/${unitId}/template-sets`, {
          name: name.trim(),
          description: description.trim() || null,
          project_type: projectType.trim() || null,
          is_default: isDefault,
        });

        // Copy tasks from ALL selected processes
        const newSetId = data.set.id;
        try {
          const { data: copyResult } = await api.post(`/company-templates/template-sets/${newSetId}/copy-from-process`, {
            process_ids: selectedProcessIds
          });
          alert(`✅ Đã copy ${copyResult.copied_tasks} nhiệm vụ từ ${copyResult.source_processes?.length || 0} quy trình`);
        } catch (copyErr) {
          console.error('Copy tasks error:', copyErr);
          alert('Bộ mẫu đã tạo nhưng lỗi khi copy nhiệm vụ.');
        }
        
        onSaved();
      }
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
    setSaving(false);
  };

  return (
    <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 space-y-3">
      <h3 className="text-sm font-bold text-purple-900">
        {set ? '✏️ Sửa' : '➕ Tạo'} bộ quy trình
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {/* Process selection - only for new templates */}
        {!set?.id && (
          <div className="col-span-2 bg-white rounded-lg border-2 border-purple-300 p-3">
            <label className="text-xs font-bold text-purple-900 block mb-2 flex items-center gap-1">
              <Copy className="h-3.5 w-3.5" /> Chọn quy trình nội bộ làm gốc *
            </label>
            {loadingProcesses ? (
              <div className="text-xs text-gray-500 py-2">Đang tải quy trình...</div>
            ) : processes.length === 0 ? (
              <div className="text-xs text-amber-700 bg-amber-50 rounded p-2">
                ⚠️ Công ty này chưa có quy trình nội bộ. Vui lòng tạo quy trình trước.
              </div>
            ) : (
              <>
                {/* Select all toggle */}
                <div className="flex items-center justify-between mb-2">
                  <button
                    type="button"
                    onClick={selectAllProcesses}
                    className="text-[10px] text-purple-600 hover:text-purple-800 font-medium"
                  >
                    {selectedProcessIds.length === processes.length ? '⬜ Bỏ chọn tất cả' : '✅ Chọn tất cả'}
                  </button>
                  {selectedProcessIds.length > 0 && (
                    <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                      {selectedProcessIds.length} quy trình · {totalSelectedTasks} nhiệm vụ
                    </span>
                  )}
                </div>
                
                {/* Process checkbox list */}
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {processes.map(p => {
                    const checked = selectedProcessIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'border-purple-400 bg-purple-50'
                            : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/30'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProcess(p.id)}
                          className="w-4 h-4 accent-purple-600 shrink-0"
                        />
                        <span className="text-sm shrink-0">{p.icon || '📋'}</span>
                        <span className="flex-1 text-sm font-medium text-gray-800">{p.name}</span>
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded shrink-0">
                          {p.task_count || 0} NV
                        </span>
                      </label>
                    );
                  })}
                </div>
                
                <p className="text-[10px] text-purple-600 mt-2">
                  Nhiệm vụ + checklist sẽ được copy từ các quy trình đã chọn (tự động phân theo giai đoạn)
                </p>
              </>
            )}
          </div>
        )}
        
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs font-medium text-gray-600 block mb-1">Tên bộ mẫu *</label>
          <input 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="VD: Quy trình tiêu chuẩn"
            className="w-full h-9 px-3 border rounded-lg text-sm" 
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="text-xs font-medium text-gray-600 block mb-1">Loại dự án</label>
          <input 
            value={projectType} 
            onChange={e => setProjectType(e.target.value)} 
            placeholder="VD: Tủ bếp, Nội thất..."
            className="w-full h-9 px-3 border rounded-lg text-sm" 
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-600 block mb-1">Mô tả</label>
          <textarea 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            placeholder="Mô tả ngắn gọn..."
            rows="2"
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={isDefault} 
              onChange={e => setIsDefault(e.target.checked)} 
              className="w-4 h-4 accent-purple-600"
            />
            <span className="text-sm text-gray-700">Đặt làm bộ mặc định</span>
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button 
          onClick={onCancel} 
          className="h-8 px-3 border rounded-lg text-xs cursor-pointer"
        >
          Hủy
        </button>
        <button 
          onClick={save} 
          disabled={saving} 
          className="h-8 px-4 bg-purple-600 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50"
        >
          {saving ? '...' : <><Save className="h-3.5 w-3.5 inline mr-1" />Lưu</>}
        </button>
      </div>
    </div>
  );
}
