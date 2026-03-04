import { useState, useEffect } from 'react';
import api from '../lib/api';
import Modal from './Modal';
import { FileUploadButton, FilePreview } from './FileUpload';
import { ChevronDown, ChevronRight, Building2, Users } from 'lucide-react';

export default function TaskCreateModal({ open, onClose, onCreated, projectId, stageId, project }) {
  // ── Form state ──
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', assignee_id: '', due_date: '', estimated_hours: '' });
  const [checklists, setChecklists] = useState([]);
  const [newCheck, setNewCheck] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  // ── Khối / Công ty selector ──
  const [divisions, setDivisions] = useState([]);       // depth=1 units (Khối)
  const [companies, setCompanies] = useState([]);       // depth=2 units (Công ty)
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [companyEmployees, setCompanyEmployees] = useState([]);
  const [templateSets, setTemplateSets] = useState([]);
  const [selectedTemplateSet, setSelectedTemplateSet] = useState('');
  const [allUnits, setAllUnits] = useState([]);

  // ── Stage selector (from template or manual) ──
  const [stages, setStages] = useState([]);
  const [selectedStageId, setSelectedStageId] = useState(stageId || '');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Load on open ──
  useEffect(() => {
    if (!open) return;
    setForm({ title: '', description: '', priority: 'medium', assignee_id: '', due_date: '', estimated_hours: '' });
    setChecklists([]);
    setFiles([]);
    setSelectedDivision('');
    setSelectedCompany('');
    setCompanyEmployees([]);
    setTemplateSets([]);
    setSelectedTemplateSet('');
    setSelectedStageId(stageId || '');

    // Load all ecosystem units
    api.get('/ecosystem/units').then(r => {
      const units = r.data.units || [];
      setAllUnits(units);
      // Depth 1 = Khối
      setDivisions(units.filter(u => u.level?.depth === 1 || u.level?.slug === 'division'));
    }).catch(() => {});

    // Load stages for manual select
    api.get('/users/stages').then(r => setStages(r.data.stages || [])).catch(() => {});

    // If project has flowAssignments, pre-populate companies
    if (project?.flowAssignments?.length) {
      const companyUnits = project.flowAssignments.map(a => a.company).filter(Boolean);
      if (companyUnits.length === 1) {
        // Auto-select if only 1 company
        setSelectedCompany(companyUnits[0].id);
        loadEmployees(companyUnits[0].id);
        loadTemplateSets(companyUnits[0].id);
      }
    }
  }, [open, projectId, stageId]);

  // ── When division selected → filter companies ──
  useEffect(() => {
    if (!selectedDivision) { setCompanies([]); return; }
    const children = allUnits.filter(u => u.parent_id === selectedDivision);
    setCompanies(children);
    setSelectedCompany('');
    setCompanyEmployees([]);
    setTemplateSets([]);
    setSelectedTemplateSet('');
  }, [selectedDivision, allUnits]);

  // ── Load employees for company ──
  const loadEmployees = async (unitId) => {
    if (!unitId) { setCompanyEmployees([]); return; }
    try {
      const r = await api.get(`/users?ecosystem_unit_id=${unitId}`);
      setCompanyEmployees(r.data.users || []);
    } catch { setCompanyEmployees([]); }
  };

  // ── Load template sets for company ──
  const loadTemplateSets = async (unitId) => {
    if (!unitId) { setTemplateSets([]); return; }
    try {
      const r = await api.get(`/company-templates/units/${unitId}/template-sets`);
      setTemplateSets(r.data.sets || []);
    } catch { setTemplateSets([]); }
  };

  const handleCompanyChange = (unitId) => {
    setSelectedCompany(unitId);
    setForm(f => ({ ...f, assignee_id: '' }));
    setSelectedTemplateSet('');
    if (unitId) {
      loadEmployees(unitId);
      loadTemplateSets(unitId);
    } else {
      setCompanyEmployees([]);
      setTemplateSets([]);
    }
  };

  // ── Checklist helpers ──
  const addCheck = () => {
    if (!newCheck.trim()) return;
    setChecklists(c => [...c, { title: newCheck.trim(), attachments: [], assignee_id: '' }]);
    setNewCheck('');
  };

  // ── Submit ──
  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setLoading(true);
    try {
      await api.post('/tasks', {
        ...form,
        project_id: projectId,
        stage_id: selectedStageId || stageId || null,
        assignee_id: form.assignee_id || null,
        due_date: form.due_date || null,
        estimated_hours: form.estimated_hours ? +form.estimated_hours : null,
        metadata: selectedCompany ? { company_unit_id: selectedCompany } : undefined,
        checklists: checklists.map(c => ({
          title: c.title,
          attachments: c.attachments,
          notes: c.assignee_id ? JSON.stringify({ assignee_id: c.assignee_id }) : null,
        })),
        attachments: files,
      });
      onCreated?.();
      onClose();
    } catch { }
    setLoading(false);
  };

  // ── Employees to show (company-filtered or all) ──
  const employeeOptions = companyEmployees.length > 0 ? companyEmployees : [];

  // ── Get company name from flowAssignments if available ──
  const flowCompanies = (project?.flowAssignments || []).map(a => a.company).filter(Boolean);

  return (
    <Modal open={open} onClose={onClose} title="Tạo công việc mới" size="lg">
      <form onSubmit={submit} className="space-y-4">

        {/* ── Khối / Công ty Selector ── */}
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
          <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" /> Phân công theo đơn vị
          </p>

          {/* If project has flowAssignments → show company pills to pick */}
          {flowCompanies.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {flowCompanies.map(c => (
                <button key={c.id} type="button"
                  onClick={() => handleCompanyChange(selectedCompany === c.id ? '' : c.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    selectedCompany === c.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}>
                  {c.name}
                </button>
              ))}
            </div>
          ) : (
            /* Manual Khối → Công ty selector */
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Khối</label>
                <select value={selectedDivision} onChange={e => setSelectedDivision(e.target.value)}
                  className="w-full h-8 px-2 rounded border border-gray-300 text-xs focus:outline-none focus:border-blue-500">
                  <option value="">— Chọn Khối —</option>
                  {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Công ty</label>
                <select value={selectedCompany} onChange={e => handleCompanyChange(e.target.value)}
                  className="w-full h-8 px-2 rounded border border-gray-300 text-xs focus:outline-none focus:border-blue-500"
                  disabled={!selectedDivision}>
                  <option value="">— Chọn Công ty —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Employees count badge */}
          {selectedCompany && (
            <p className="text-[10px] text-blue-600 mt-1.5 flex items-center gap-1">
              <Users className="h-3 w-3" />
              {companyEmployees.length} nhân viên
              {templateSets.length > 0 && ` • ${templateSets.length} bộ quy trình`}
            </p>
          )}
        </div>

        {/* ── Task Info ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Tiêu đề <span className="text-red-500">*</span></label>
          <input value={form.title} onChange={e => set('title', e.target.value)} required
            className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-blue-500"
            placeholder="Tên công việc" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Mô tả</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-blue-500 resize-none min-h-[70px]"
            placeholder="Mô tả chi tiết..." />
        </div>

        {/* ── Stage + Priority ── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Quy trình (giai đoạn)</label>
            <select value={selectedStageId} onChange={e => setSelectedStageId(e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-blue-500">
              <option value="">— Chọn —</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Độ ưu tiên</label>
            <select value={form.priority} onChange={e => set('priority', e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-blue-500">
              <option value="low">Thấp</option>
              <option value="medium">Trung bình</option>
              <option value="high">Cao</option>
              <option value="urgent">Gấp</option>
            </select>
          </div>
        </div>

        {/* ── Assignee + Due date ── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Người thực hiện
              {selectedCompany && companyEmployees.length > 0 && (
                <span className="text-blue-500 font-normal ml-1">(theo công ty)</span>
              )}
            </label>
            <select value={form.assignee_id} onChange={e => set('assignee_id', e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-blue-500">
              <option value="">— Chưa gán —</option>
              {employeeOptions.map(u => (
                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
              ))}
              {!employeeOptions.length && <option disabled>Chọn công ty trước</option>}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Hạn chót</label>
            <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        {/* ── File Upload ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Đính kèm</label>
          <FileUploadButton onFilesUploaded={(uploaded) => setFiles(f => [...f, ...uploaded])} />
          <FilePreview files={files} onRemove={(i) => setFiles(f => f.filter((_, j) => j !== i))} />
        </div>

        {/* ── Checklist ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">
            Checklist {checklists.length > 0 && <span className="text-gray-400 font-normal">({checklists.length})</span>}
          </label>
          <div className="space-y-2">
            {checklists.map((c, i) => (
              <div key={i} className="flex items-center gap-2 bg-purple-50 rounded-lg px-3 py-2 border border-purple-100">
                <span className="w-4 h-4 rounded border border-gray-300 bg-white shrink-0" />
                <span className="text-sm flex-1">{c.title}</span>
                {/* Checklist assignee */}
                <select value={c.assignee_id || ''} onChange={e => setChecklists(cl =>
                    cl.map((item, j) => j === i ? { ...item, assignee_id: e.target.value } : item))}
                  className="h-7 px-1.5 rounded border border-gray-300 text-xs max-w-[130px] focus:outline-none focus:border-blue-400">
                  <option value="">👤 Gán</option>
                  {employeeOptions.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setChecklists(cl => cl.filter((_, j) => j !== i))}
                  className="text-gray-400 hover:text-red-500 text-xs cursor-pointer shrink-0">✕</button>
              </div>
            ))}
            <div className="flex gap-2">
              <input value={newCheck} onChange={e => setNewCheck(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCheck())}
                placeholder="Thêm mục checklist..." className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-blue-500" />
              <button type="button" onClick={addCheck}
                className="h-9 px-3 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 cursor-pointer shrink-0">+</button>
            </div>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <button type="button" onClick={onClose}
            className="h-9 px-4 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 cursor-pointer">
            Hủy
          </button>
          <button type="submit" disabled={loading}
            className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
            {loading ? 'Đang tạo...' : 'Tạo công việc'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
