import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  FolderKanban, RefreshCw, Building2, Search, ChevronRight, CheckSquare,
  LayoutGrid, List, Filter, Briefcase, ArrowLeft, Users, Eye, EyeOff, 
  MessageSquare, Paperclip, Save
} from 'lucide-react';
import { FileUploadButton, FilePreview } from '../components/FileUpload';
import { getInitials, avatarColor, PRIORITY_LABELS, PRIORITY_COLORS } from '../lib/utils';

const STAGE_COLORS = {
  consulting: '#8b5cf6', design: '#06b6d4', quotation: '#f59e0b', contract: '#10b981',
  production: '#3b82f6', shipping: '#6366f1', installation: '#ec4899', 'customer-care': '#14b8a6',
};

export default function ProjectWorkflowPage() {
  const { user } = useAuth();
  const isAdmin = ['admin', 'manager', 'director'].includes(user?.role);

  const [view, setView] = useState('projects'); // 'projects' | 'kanban'
  const [viewMode, setViewMode] = useState('grid');
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filterDivision, setFilterDivision] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Kanban view state
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [projectStages, setProjectStages] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    loadData();
  }, [filterDivision, filterCompany, filterEmployee]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = { limit: 500 };
      if (filterDivision !== 'all') params.division_id = filterDivision;
      if (filterCompany !== 'all') params.company_id = filterCompany;

      const [projRes, empRes, compRes, divRes] = await Promise.all([
        api.get('/projects', { params }),
        api.get('/users'),
        api.get('/companies'),
        api.get('/ecosystem/units', { params: { level_code: 'division' } }),
      ]);

      let allProjects = projRes.data.projects || [];
      
      // Filter by employee (if tasks have this employee assigned)
      if (filterEmployee !== 'all') {
        const { data: empTasks } = await api.get('/tasks', { params: { assignee_id: filterEmployee } });
        const empProjectIds = new Set((empTasks.tasks || []).map(t => t.project_id));
        allProjects = allProjects.filter(p => empProjectIds.has(p.id));
      }

      setProjects(allProjects);
      setEmployees(empRes.data.users || []);
      setCompanies(compRes.data.companies || []);
      setDivisions(divRes.data.units || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadProjectStages = async (projectId) => {
    try {
      const { data: tasksData } = await api.get('/tasks', { params: { project_id: projectId } });
      const allTasks = tasksData.tasks || [];

      const stageMap = new Map();
      allTasks.forEach(t => {
        if (t.stage && !stageMap.has(t.stage.id)) {
          stageMap.set(t.stage.id, t.stage);
        }
      });

      return Array.from(stageMap.values()).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    } catch (e) {
      console.error(e);
      return [];
    }
  };

  const selectProject = async (project) => {
    setSelectedProject(project);
    const stages = await loadProjectStages(project.id);
    setProjectStages(stages);
    if (stages.length > 0) {
      selectStage(stages[0]);
    }
    setView('kanban');
  };

  const selectStage = async (stage) => {
    setSelectedStage(stage);
    setLoading(true);
    try {
      const { data: tasksData } = await api.get('/tasks', {
        params: { project_id: selectedProject.id, stage_id: stage.id }
      });
      let stageTasks = tasksData.tasks || [];

      const checklistPromises = stageTasks.map(t =>
        api.get(`/tasks/${t.id}/checklists`)
          .then(r => ({ taskId: t.id, checklists: r.data.checklists || [] }))
          .catch(() => ({ taskId: t.id, checklists: [] }))
      );
      const checklistResults = await Promise.all(checklistPromises);
      const clMap = {};
      checklistResults.forEach(r => { clMap[r.taskId] = r.checklists; });
      stageTasks = stageTasks.map(t => ({ ...t, checklists: clMap[t.id] || [] }));

      setTasks(stageTasks.sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const backToProjects = () => {
    setView('projects');
    setSelectedProject(null);
    setSelectedStage(null);
    setProjectStages([]);
    setTasks([]);
  };

  const toggleCheckItem = async (taskId, clId, isCompleted) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      return { ...t, checklists: t.checklists.map(cl => cl.id === clId ? { ...cl, is_completed: !isCompleted } : cl) };
    }));
    try {
      await api.patch(`/tasks/${taskId}/checklists/${clId}`, { is_completed: !isCompleted });
    } catch {
      selectStage(selectedStage);
    }
  };

  const saveChecklistNote = async (taskId, clId, notes, attachments) => {
    try {
      await api.patch(`/tasks/${taskId}/checklists/${clId}`, { notes, attachments });
      setTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t;
        return { ...t, checklists: t.checklists.map(cl => cl.id === clId ? { ...cl, notes, attachments } : cl) };
      }));
    } catch {
      selectStage(selectedStage);
    }
  };

  let filteredProjects = [...projects];
  if (filterSearch) {
    const s = filterSearch.toLowerCase();
    filteredProjects = filteredProjects.filter(p =>
      p.code?.toLowerCase().includes(s) ||
      p.name?.toLowerCase().includes(s) ||
      p.customers?.full_name?.toLowerCase().includes(s)
    );
  }

  if (view === 'projects') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-blue-600" />
              Công việc dự án
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{filteredProjects.length} dự án</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilters(!showFilters)}
              className={`h-9 px-4 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer ${
                showFilters ? 'bg-blue-600 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'
              }`}>
              <Filter className="h-4 w-4" />Lọc
            </button>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setViewMode('grid')} className={`h-7 w-7 rounded flex items-center justify-center cursor-pointer ${viewMode === 'grid' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode('list')} className={`h-7 w-7 rounded flex items-center justify-center cursor-pointer ${viewMode === 'list' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
                <List className="h-4 w-4" />
              </button>
            </div>
            <button onClick={loadData} className="h-9 w-9 bg-white border rounded-lg flex items-center justify-center hover:bg-gray-50 cursor-pointer">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
                placeholder="Tìm tên dự án..." className="flex-1 h-9 px-3 border rounded-lg text-sm" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 className="h-4 w-4 text-gray-400" />
              <select value={filterDivision} onChange={e => { setFilterDivision(e.target.value); setFilterCompany('all'); }}
                className="h-9 px-3 border rounded-lg text-sm bg-white">
                <option value="all">Tất cả Khối</option>
                {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
                className="h-9 px-3 border rounded-lg text-sm bg-white">
                <option value="all">Tất cả Công ty</option>
                {companies.filter(c => filterDivision === 'all' || c.division_unit_id === filterDivision).map(c =>
                  <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                )}
              </select>
              <Users className="h-4 w-4 text-gray-400" />
              <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}
                className="h-9 px-3 border rounded-lg text-sm bg-white">
                <option value="all">Tất cả Nhân viên</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border">
            <FolderKanban className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">Không có dự án</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map(proj => (
              <div key={proj.id} className="bg-white rounded-xl border hover:shadow-lg transition p-4 cursor-pointer" onClick={() => selectProject(proj)}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-blue-600">{proj.code}</span>
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">{proj.name}</h3>
                {proj.customers?.full_name && <p className="text-xs text-gray-500">👤 {proj.customers.full_name}</p>}
                {proj.company && <p className="text-xs text-indigo-600 mt-1">🏢 {proj.company.short_name || proj.company.name}</p>}
                <div className="flex items-center justify-between pt-2 border-t mt-2">
                  <span className="text-xs text-gray-500">Click xem quy trình</span>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Mã DA</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tên</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Khách hàng</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Công ty</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredProjects.map(proj => (
                  <tr key={proj.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => selectProject(proj)}>
                    <td className="px-4 py-3"><span className="text-sm font-semibold text-blue-600">{proj.code}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-900">{proj.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{proj.customers?.full_name || '-'}</td>
                    <td className="px-4 py-3 text-xs text-indigo-600">{proj.company?.short_name || proj.company?.name || '-'}</td>
                    <td className="px-4 py-3 text-right"><ChevronRight className="h-4 w-4 text-gray-400 inline" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (view === 'kanban' && selectedProject && selectedStage) {
    const stageColor = STAGE_COLORS[selectedStage.slug] || selectedStage.color || '#3b82f6';
    const columns = tasks.map(t => ({ task: t, checklists: t.checklists || [] }));

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={backToProjects} className="h-9 w-9 bg-white border rounded-lg flex items-center justify-center hover:bg-gray-50 cursor-pointer">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{selectedProject.code} — {selectedProject.name}</h1>
            <p className="text-sm text-gray-500">{selectedProject.customers?.full_name || ''}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-2">
          <div className="flex gap-2 overflow-x-auto">
            {projectStages.map(s => (
              <button key={s.id} onClick={() => selectStage(s)}
                className={`h-10 px-4 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap ${
                  s.id === selectedStage.id ? 'text-white shadow-sm' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
                style={s.id === selectedStage.id ? { backgroundColor: STAGE_COLORS[s.slug] || s.color } : {}}>
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
          </div>
        ) : columns.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border">
            <CheckSquare className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">Chưa có nhiệm vụ</p>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '400px' }}>
            {columns.map((col, idx) => (
              <TaskColumn key={col.task.id} task={col.task} checklists={col.checklists} stageColor={stageColor} index={idx}
                onToggleCheckItem={toggleCheckItem} onSaveChecklistNote={saveChecklistNote} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function TaskColumn({ task, checklists, stageColor, index, onToggleCheckItem, onSaveChecklistNote }) {
  const clDone = checklists.filter(c => c.is_completed).length;
  return (
    <div className="shrink-0 w-80 flex flex-col">
      <div className="rounded-t-xl p-3 border border-b-0 bg-white">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: stageColor }}>{index + 1}</span>
            <h3 className="text-sm font-bold text-gray-900">{task.title}</h3>
          </div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
        </div>
        {task.assignee && (
          <div className="flex items-center gap-1.5 mt-2">
            <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ backgroundColor: avatarColor(task.assignee.full_name) }}>
              {getInitials(task.assignee.full_name)}
            </div>
            <span className="text-[10px] text-gray-500">{task.assignee.full_name}</span>
          </div>
        )}
        <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2">
          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${checklists.length > 0 ? (clDone / checklists.length) * 100 : 0}%` }} />
        </div>
      </div>
      <div className="flex-1 rounded-b-xl border p-2 space-y-2 bg-gray-50/50 overflow-y-auto" style={{ maxHeight: '60vh' }}>
        {checklists.length > 0 ? checklists.map(cl => (
          <ChecklistCard key={cl.id} checklist={cl} taskId={task.id} onToggle={() => onToggleCheckItem(task.id, cl.id, cl.is_completed)}
            onSaveNote={(notes, files) => onSaveChecklistNote(task.id, cl.id, notes, files)} />
        )) : <div className="text-center py-8 text-xs text-gray-400">Không có checklist</div>}
      </div>
    </div>
  );
}

function ChecklistCard({ checklist, taskId, onToggle, onSaveNote }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteFiles, setNoteFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const hasNotes = !!checklist.notes;
  const hasFiles = checklist.attachments?.length > 0;

  const startEdit = () => {
    setNoteText(checklist.notes || '');
    setNoteFiles(checklist.attachments || []);
    setEditing(true);
    setExpanded(true);
  };

  const save = async () => {
    setSaving(true);
    await onSaveNote(noteText, noteFiles);
    setEditing(false);
    setSaving(false);
  };

  return (
    <div className={`bg-white rounded-lg border p-3 ${checklist.is_completed ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200'}`}>
      <div className="flex items-start gap-2">
        <button onClick={onToggle} className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 cursor-pointer ${
          checklist.is_completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 hover:border-blue-400'
        }`}>
          {checklist.is_completed && <CheckSquare className="h-3 w-3" />}
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <span className={`text-sm flex-1 ${checklist.is_completed ? 'line-through text-gray-400' : 'text-gray-700 font-medium'}`}>
              {checklist.title}
            </span>
            <div className="flex gap-0.5">
              {hasFiles && <Paperclip className="h-3 w-3 text-blue-400" />}
              {hasNotes && <MessageSquare className="h-3 w-3 text-amber-400" />}
              {(hasNotes || hasFiles) && !editing && (
                <button onClick={() => setExpanded(!expanded)} className="text-gray-300 hover:text-blue-500 cursor-pointer">
                  {expanded ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
              )}
              <button onClick={startEdit} className="text-gray-300 hover:text-blue-500 cursor-pointer">
                <MessageSquare className="h-3 w-3" />
              </button>
            </div>
          </div>
          {expanded && (hasNotes || hasFiles) && !editing && (
            <div className="mt-2 space-y-1">
              {hasNotes && <p className="text-xs text-gray-600 bg-amber-50 rounded px-2 py-1">{checklist.notes}</p>}
              {hasFiles && (
                <div className="flex flex-wrap gap-1">
                  {checklist.attachments.map((f, fi) => (
                    <a key={fi} href={f.file_url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-blue-600 bg-blue-50 rounded px-1.5 py-0.5 flex items-center gap-0.5">
                      <Paperclip className="h-2.5 w-2.5" />{f.file_name || 'file'}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          {editing && (
            <div className="mt-2 space-y-2 bg-blue-50 rounded p-2">
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                className="w-full h-16 px-2 py-1 border rounded text-xs" placeholder="Ghi chú..." />
              <FilePreview files={noteFiles} onRemove={i => setNoteFiles(f => f.filter((_, j) => j !== i))} small />
              <div className="flex gap-2">
                <FileUploadButton compact onFilesUploaded={files => setNoteFiles(prev => [...prev, ...files])} />
                <button onClick={save} disabled={saving} className="h-6 px-2 bg-blue-600 text-white rounded text-[10px] cursor-pointer flex items-center gap-1">
                  <Save className="h-2.5 w-2.5" />{saving ? '...' : 'Lưu'}
                </button>
                <button onClick={() => setEditing(false)} className="h-6 px-2 bg-gray-100 text-gray-600 rounded text-[10px] cursor-pointer">Hủy</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
