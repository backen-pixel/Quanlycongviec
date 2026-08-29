import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Save, Settings, ArrowLeft, Plus, Trash2, ChevronDown, Check, Loader2, Building2, FolderTree, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AutoProjectConfigPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Config
  const [config, setConfig] = useState(null);
  const [flowId, setFlowId] = useState('');
  const [assignments, setAssignments] = useState([]); // [{division_unit_id, company_unit_id, template_set_id, order_index}]
  const [defaultPriority, setDefaultPriority] = useState('medium');
  const [importCrmTasks, setImportCrmTasks] = useState(true);
  const [createCrmTasks, setCreateCrmTasks] = useState(true);

  // Lookup data
  const [flows, setFlows] = useState([]);
  const [flowSteps, setFlowSteps] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [templateSets, setTemplateSets] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, flowsRes, divRes] = await Promise.all([
        api.get('/crm/auto-project-config'),
        api.get('/flows'),
        api.get('/ecosystem/units'),
      ]);

      const cfg = cfgRes.data;
      setConfig(cfg);
      setFlowId(cfg.flow_id || '');
      setAssignments(cfg.flow_assignments || []);
      setDefaultPriority(cfg.default_priority || 'medium');
      setImportCrmTasks(cfg.import_crm_tasks !== false);
      setCreateCrmTasks(cfg.create_crm_tasks !== false);

      setFlows(flowsRes.data || []);
      const units = divRes.data || [];
      setDivisions(units.filter(u => u.level === 1));
      const companyUnits = units.filter(u => u.level === 2);
      setCompanies(companyUnits);

      // Load template sets — không có API liệt kê toàn bộ, phải gọi theo từng công ty rồi gộp lại.
      try {
        const tsResList = await Promise.all(
          companyUnits.map(c => api.get(`/company-templates/units/${c.id}/template-sets`).catch(() => null))
        );
        const allSets = tsResList.flatMap(res => res?.data?.sets || []);
        setTemplateSets(allSets);
      } catch { setTemplateSets([]); }

      // Load flow steps if flow selected
      if (cfg.flow_id) {
        await loadFlowSteps(cfg.flow_id, flowsRes.data);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadFlowSteps = async (fId, flowsList) => {
    if (!fId) { setFlowSteps([]); return; }
    try {
      const res = await api.get(`/flows/${fId}`);
      const steps = res.data?.steps || [];
      setFlowSteps(steps.sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));
    } catch { setFlowSteps([]); }
  };

  const handleFlowChange = async (newFlowId) => {
    setFlowId(newFlowId);
    if (newFlowId) {
      await loadFlowSteps(newFlowId);
      // Auto-populate assignments from flow steps
      try {
        const res = await api.get(`/flows/${newFlowId}`);
        const steps = (res.data?.steps || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        setFlowSteps(steps);
        const newAssignments = steps.map((s, i) => ({
          division_unit_id: s.division_unit_id || '',
          company_unit_id: s.company_unit_id || '',
          template_set_id: s.template_set_id || '',
          order_index: i,
        }));
        setAssignments(newAssignments);
      } catch { }
    } else {
      setFlowSteps([]);
      setAssignments([]);
    }
  };

  const updateAssignment = (idx, field, value) => {
    setAssignments(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  };

  const addAssignment = () => {
    setAssignments(prev => [...prev, { division_unit_id: '', company_unit_id: '', template_set_id: '', order_index: prev.length }]);
  };

  const removeAssignment = (idx) => {
    setAssignments(prev => prev.filter((_, i) => i !== idx).map((a, i) => ({ ...a, order_index: i })));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/crm/auto-project-config', {
        flow_id: flowId || null,
        flow_assignments: assignments.filter(a => a.division_unit_id),
        default_priority: defaultPriority,
        import_crm_tasks: importCrmTasks,
        create_crm_tasks: createCrmTasks,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu cấu hình');
    }
    setSaving(false);
  };

  const getDivisionName = (id) => divisions.find(d => d.id === id)?.name || id?.substring(0, 8) || '—';
  const getCompaniesForDivision = (divId) => companies.filter(c => c.parent_id === divId);
  const getTemplateSetsForCompany = (compUnitId) => templateSets.filter(ts => ts.unit_id === compUnitId);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-600" />
            Cấu hình tự động tạo dự án
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Setup sẵn luồng + bộ nhiệm vụ — khi Deal thắng sẽ tự động áp dụng</p>
        </div>
      </div>

      {/* Flow selection */}
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-blue-600" />
          Luồng quy trình mặc định
        </h2>
        <select
          value={flowId}
          onChange={e => handleFlowChange(e.target.value)}
          className="w-full h-10 px-3 border rounded-lg text-sm"
        >
          <option value="">— Chọn luồng —</option>
          {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {!flowId && (
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            ⚠️ Chưa chọn luồng — sẽ dùng luồng đầu tiên trong hệ thống
          </p>
        )}
      </div>

      {/* Flow assignments */}
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-purple-600" />
            Phân công Khối / Công ty / Bộ nhiệm vụ
          </h2>
          <button onClick={addAssignment} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer">
            <Plus className="h-3 w-3" /> Thêm bước
          </button>
        </div>

        {assignments.length === 0 && (
          <p className="text-xs text-gray-400 italic py-4 text-center">
            {flowId ? 'Chọn luồng ở trên để tự động tải bước — hoặc thêm thủ công' : 'Chọn luồng trước để setup phân công'}
          </p>
        )}

        <div className="space-y-3">
          {assignments.map((a, idx) => (
            <div key={idx} className="bg-gray-50 rounded-lg p-4 space-y-3 relative group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-600">
                  Bước {idx + 1} {idx === 0 ? '(Kinh doanh)' : idx === 1 ? '(Sản xuất)' : ''}
                </span>
                <button onClick={() => removeAssignment(idx)} className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 cursor-pointer">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                {/* Khối */}
                <div>
                  <label className="text-[10px] font-medium text-gray-500 mb-1 block">Khối</label>
                  <select value={a.division_unit_id} onChange={e => updateAssignment(idx, 'division_unit_id', e.target.value)}
                    className="w-full h-9 px-2 border rounded-lg text-xs">
                    <option value="">— Chọn Khối —</option>
                    {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                {/* Công ty */}
                <div>
                  <label className="text-[10px] font-medium text-gray-500 mb-1 block">Công ty</label>
                  <select value={a.company_unit_id} onChange={e => updateAssignment(idx, 'company_unit_id', e.target.value)}
                    className="w-full h-9 px-2 border rounded-lg text-xs">
                    <option value="">— Chọn Công ty —</option>
                    {getCompaniesForDivision(a.division_unit_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {/* Bộ nhiệm vụ */}
                <div>
                  <label className="text-[10px] font-medium text-gray-500 mb-1 block">Bộ nhiệm vụ</label>
                  <select value={a.template_set_id} onChange={e => updateAssignment(idx, 'template_set_id', e.target.value)}
                    className="w-full h-9 px-2 border rounded-lg text-xs">
                    <option value="">— Mặc định —</option>
                    {getTemplateSetsForCompany(a.company_unit_id).map(ts => (
                      <option key={ts.id} value={ts.id}>{ts.name}{ts.is_default ? ' ★' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Options */}
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-emerald-600" />
          Tùy chọn
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-700">Độ ưu tiên mặc định</label>
            <select value={defaultPriority} onChange={e => setDefaultPriority(e.target.value)}
              className="w-full h-9 px-3 border rounded-lg text-sm mt-1">
              <option value="low">Thấp</option>
              <option value="medium">Trung bình</option>
              <option value="high">Cao</option>
              <option value="urgent">Khẩn cấp</option>
            </select>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={importCrmTasks} onChange={e => setImportCrmTasks(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300" />
            <div>
              <p className="text-sm font-medium text-gray-800">Import CRM tasks → Dự án (bước KD)</p>
              <p className="text-xs text-gray-500">Copy nhiệm vụ CRM đã hoàn thành vào dự án (đánh dấu done)</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={createCrmTasks} onChange={e => setCreateCrmTasks(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300" />
            <div>
              <p className="text-sm font-medium text-gray-800">Tạo thêm CRM tasks (bộ mẫu CRM)</p>
              <p className="text-xs text-gray-500">Tạo nhiệm vụ CRM mới từ crm_task_templates cho deal</p>
            </div>
          </label>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className={`px-6 h-10 rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer transition-all ${
            saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
          } disabled:opacity-50`}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? 'Đang lưu...' : saved ? 'Đã lưu ✓' : 'Lưu cấu hình'}
        </button>
      </div>
    </div>
  );
}
