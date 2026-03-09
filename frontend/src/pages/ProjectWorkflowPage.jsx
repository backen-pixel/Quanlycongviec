import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  FolderKanban, RefreshCw, Building2, Search, ChevronRight, CheckSquare,
  LayoutGrid, List, Filter, Briefcase, ArrowLeft, Users, Eye, EyeOff, 
  MessageSquare, Paperclip, Save, Clock, AlertCircle, PlayCircle
} from 'lucide-react';
import { FileUploadButton, FilePreview } from '../components/FileUpload';
import { getInitials, avatarColor, PRIORITY_LABELS, PRIORITY_COLORS } from '../lib/utils';

// TaskCard component with expandable checklist
function TaskCard({ task, onToggle, onSaveNote, onStart, onDone }) {
  const [expanded, setExpanded] = useState(false);
  const [editingNote, setEditingNote] = useState({});
  const [noteText, setNoteText] = useState({});
  const [noteFiles, setNoteFiles] = useState({});

  const checklists = task.checklists || [];
  const clDone = checklists.filter(c => c.is_completed).length;
  const clTotal = checklists.length;
  const allClDone = clTotal > 0 && clDone === clTotal;
  const isDone = task.status === 'done';
  const isPending = task.status === 'pending';
  const now = new Date();
  const isOverdue = task.due_date && new Date(task.due_date) < now && !isDone;

  const saveNote = (clId) => {
    const text = noteText[clId] || '';
    const files = noteFiles[clId] || [];
    onSaveNote(task.id, clId, text, files);
    setEditingNote({ ...editingNote, [clId]: false });
  };

  return (
    <div className={`bg-white rounded-lg border ${isDone ? 'border-emerald-200 bg-emerald-50/30' : isOverdue ? 'border-red-200 bg-red-50/20' : 'border-gray-200'}`}>
      {/* Task header */}
      <div className="p-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDone ? 'bg-emerald-100 text-emerald-700' : task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                {isDone ? '✓ Xong' : task.status === 'in_progress' ? '▶ Đang làm' : '⏳ Chờ'}
              </span>
            </div>
            <h4 className="text-sm font-semibold text-gray-900">{task.title}</h4>
            {task.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>}
          </div>
          <ChevronRight className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
        {task.assignee && (
          <div className="flex items-center gap-1.5 mb-2">
            <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ backgroundColor: avatarColor(task.assignee.full_name) }}>
              {getInitials(task.assignee.full_name)}
            </div>
            <span className="text-[10px] text-gray-500">{task.assignee.full_name}</span>
          </div>
        )}
        {task.due_date && (
          <div className={`flex items-center gap-1 mb-2 text-[10px] ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
            <Clock className="h-3 w-3" />{new Date(task.due_date).toLocaleDateString('vi-VN')}
          </div>
        )}
        {clTotal > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-500">Checklist</span>
              <span className={`text-[10px] font-medium ${allClDone ? 'text-emerald-600' : 'text-gray-400'}`}>{clDone}/{clTotal}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full mb-1">
              <div className={`h-full rounded-full ${isDone ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${clTotal ? (clDone/clTotal)*100 : 0}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Checklist details (expandable) */}
      {expanded && clTotal > 0 && (
        <div className="px-3 pb-3 border-t space-y-2 pt-2">
          {checklists.map(cl => (
            <div key={cl.id} className="bg-gray-50 rounded-lg p-2 border border-gray-200">
              <div className="flex items-start gap-2">
                <button onClick={(e) => { e.stopPropagation(); onToggle(task.id, cl.id, cl.is_completed); }}
                  className={`shrink-0 w-4 h-4 mt-0.5 rounded border-2 flex items-center justify-center cursor-pointer ${
                    cl.is_completed ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 bg-white hover:border-blue-400'
                  }`}>
                  {cl.is_completed && <CheckSquare className="h-3 w-3 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs ${cl.is_completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>{cl.title}</p>
                  {cl.notes && (
                    <div className="mt-1 text-[10px] text-gray-500 bg-white rounded px-2 py-1 border">
                      {cl.notes}
                    </div>
                  )}
                  {cl.attachments?.length > 0 && (
                    <div className="mt-1 flex gap-1 flex-wrap">
                      {cl.attachments.map((att, i) => (
                        <a key={i} href={att} target="_blank" rel="noopener noreferrer"
                          className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">
                          <Paperclip className="h-2.5 w-2.5 inline" /> File {i+1}
                        </a>
                      ))}
                    </div>
                  )}
                  {editingNote[cl.id] ? (
                    <div className="mt-2 space-y-1" onClick={e => e.stopPropagation()}>
                      <textarea value={noteText[cl.id] || ''} onChange={e => setNoteText({ ...noteText, [cl.id]: e.target.value })}
                        placeholder="Ghi chú..."
                        className="w-full text-xs border rounded px-2 py-1 min-h-[50px]" />
                      <FileUploadButton onFilesUploaded={files => setNoteFiles({ ...noteFiles, [cl.id]: files })} />
                      <div className="flex gap-1">
                        <button onClick={() => saveNote(cl.id)}
                          className="h-6 px-2 bg-blue-600 text-white rounded text-[10px] hover:bg-blue-700 cursor-pointer">
                          <Save className="h-3 w-3 inline" /> Lưu
                        </button>
                        <button onClick={() => setEditingNote({ ...editingNote, [cl.id]: false })}
                          className="h-6 px-2 bg-gray-100 text-gray-600 rounded text-[10px] hover:bg-gray-200 cursor-pointer">
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); setEditingNote({ ...editingNote, [cl.id]: true }); setNoteText({ ...noteText, [cl.id]: cl.notes || '' }); }}
                      className="mt-1 text-[9px] text-blue-600 hover:underline">
                      <MessageSquare className="h-2.5 w-2.5 inline" /> {cl.notes ? 'Sửa ghi chú' : 'Thêm ghi chú'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {!isDone && (
        <div className="px-3 pb-3 flex gap-1 border-t pt-2">
          {isPending && <button onClick={(e) => { e.stopPropagation(); onStart(task.id); }} className="flex-1 h-7 bg-blue-50 text-blue-600 rounded text-[10px] font-medium hover:bg-blue-100 cursor-pointer">▶ Bắt đầu</button>}
          {!isPending && allClDone && <button onClick={(e) => { e.stopPropagation(); onDone(task.id); }} className="flex-1 h-7 bg-emerald-50 text-emerald-600 rounded text-[10px] font-medium hover:bg-emerald-100 cursor-pointer">✓ Hoàn thành</button>}
        </div>
      )}
    </div>
  );
}

export default function ProjectWorkflowPage() {
  const { user } = useAuth();
  const isAdmin = ['admin', 'manager', 'director'].includes(user?.role);

  const [view, setView] = useState('projects');
  const [viewMode, setViewMode] = useState('grid');
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filterDivision, setFilterDivision] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterTimeRange, setFilterTimeRange] = useState('all'); // 'all' | 'custom'
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null); // NEW: selected stage tab
  const [tasks, setTasks] = useState([]);
  const [stages, setStages] = useState([]); // All workflow stages
  const [departments, setDepartments] = useState([]);
  const [teams, setTeams] = useState([]);

  // Permission check for viewing all employees
  const canViewAllEmployees = ['admin', 'manager', 'director', 'supervisor'].includes(user?.role);

  useEffect(() => { loadData(); }, [filterDivision, filterCompany, filterDepartment, filterTeam, filterEmployee, filterTimeRange, filterDateFrom, filterDateTo]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = { limit: 500 };
      if (filterDivision !== 'all') params.division_id = filterDivision;
      if (filterCompany !== 'all') params.company_id = filterCompany;

      const [projRes, empRes, compRes, divRes, deptRes, teamRes, stagesRes] = await Promise.all([
        api.get('/projects', { params }),
        api.get('/users'),
        api.get('/companies'),
        api.get('/ecosystem/units', { params: { level_code: 'division' } }),
        api.get('/departments').catch(() => ({ data: { departments: [] } })),
        api.get('/ecosystem/units', { params: { level_code: 'team' } }).catch(() => ({ data: { units: [] } })),
        api.get('/users/stages').catch(() => ({ data: { stages: [] } })),
      ]);

      let allProjects = projRes.data.projects || [];
      
      // Filter by employee (if not viewing all employees AND user is not admin/manager/supervisor)
      if (filterEmployee !== 'all') {
        const { data: empTasks } = await api.get('/tasks', { params: { assignee_id: filterEmployee } });
        const empProjectIds = new Set((empTasks.tasks || []).map(t => t.project_id));
        allProjects = allProjects.filter(p => empProjectIds.has(p.id));
      } else if (!canViewAllEmployees) {
        // Regular employee can only see their own projects
        const { data: myTasks } = await api.get('/tasks', { params: { assignee_id: user.userId } });
        const myProjectIds = new Set((myTasks.tasks || []).map(t => t.project_id));
        allProjects = allProjects.filter(p => myProjectIds.has(p.id));
      }

      // Filter by time range
      if (filterTimeRange === 'custom' && (filterDateFrom || filterDateTo)) {
        allProjects = allProjects.filter(p => {
          const createdAt = p.created_at ? new Date(p.created_at) : null;
          if (!createdAt) return false;
          if (filterDateFrom && createdAt < new Date(filterDateFrom)) return false;
          if (filterDateTo) {
            const endDate = new Date(filterDateTo);
            endDate.setHours(23, 59, 59, 999);
            if (createdAt > endDate) return false;
          }
          return true;
        });
      }

      // Filter by department
      if (filterDepartment !== 'all') {
        allProjects = allProjects.filter(p => {
          // Assuming projects have a department_id or we need to check via company
          // For now, we'll filter via assigned users' departments
          return true; // TODO: Implement department filter logic
        });
      }

      // Filter by team
      if (filterTeam !== 'all') {
        allProjects = allProjects.filter(p => {
          // TODO: Implement team filter logic
          return true;
        });
      }

      setProjects(allProjects);
      setEmployees(empRes.data.users || []);
      setCompanies(compRes.data.companies || []);
      setDivisions(divRes.data.units || []);
      setDepartments(deptRes.data.departments || []);
      setTeams(teamRes.data.units || []);
      setStages((stagesRes.data.stages || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const selectProject = async (project) => {
    setSelectedProject(project);
    setSelectedStage(null); // Reset stage selection
    setLoading(true);
    try {
      // Load project details with flow assignments
      const { data: projectDetail } = await api.get(`/projects/${project.id}`);
      const fullProject = projectDetail.project || project;
      setSelectedProject(fullProject);

      // Load tasks
      const { data: tasksData } = await api.get('/tasks', { params: { project_id: project.id } });
      let allTasks = tasksData.tasks || [];
      
      console.log('[ProjectWorkflow] Loaded tasks:', allTasks.length);
      console.log('[ProjectWorkflow] Tasks:', allTasks.map(t => ({ id: t.id, title: t.title, stage_id: t.stage_id, stage: t.stage })));

      // Load checklists for each task
      const checklistPromises = allTasks.map(t =>
        api.get(`/tasks/${t.id}/checklists`)
          .then(r => ({ taskId: t.id, checklists: r.data.checklists || [] }))
          .catch(() => ({ taskId: t.id, checklists: [] }))
      );
      const checklistResults = await Promise.all(checklistPromises);
      const clMap = {};
      checklistResults.forEach(r => { clMap[r.taskId] = r.checklists; });
      allTasks = allTasks.map(t => ({ ...t, checklists: clMap[t.id] || [] }));

      setTasks(allTasks);

      // Extract stages from project flow assignments or tasks
      let projectStages = [];
      if (fullProject.flowAssignments?.length > 0) {
        // Get stages from flow assignments (via template sets)
        const stageIds = new Set();
        fullProject.flowAssignments.forEach(fa => {
          fa.tasks?.forEach(t => {
            if (t.stage_id) stageIds.add(t.stage_id);
          });
        });
        // Filter global stages to only those in the flow
        projectStages = stages.filter(s => stageIds.has(s.id));
      } else {
        // Fallback: get stages from tasks
        const stageIds = new Set(allTasks.map(t => t.stage?.id).filter(Boolean));
        projectStages = stages.filter(s => stageIds.has(s.id));
      }

      // If still empty, use all stages as fallback
      if (projectStages.length === 0) {
        projectStages = stages;
      }

      // Store project-specific stages (we'll use this in render)
      setSelectedProject({ ...fullProject, projectStages });

    } catch (e) {
      console.error(e);
    }
    setLoading(false);
    setView('kanban');
  };

  const backToProjects = () => {
    setView('projects');
    setSelectedProject(null);
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
      selectProject(selectedProject);
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
      selectProject(selectedProject);
    }
  };

  const startTask = async (taskId) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'in_progress' } : t));
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: 'in_progress' });
    } catch {
      selectProject(selectedProject);
    }
  };

  const markTaskDone = async (taskId) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'done' } : t));
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: 'done' });
    } catch {
      selectProject(selectedProject);
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
              className={`h-9 px-4 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer ${showFilters ? 'bg-blue-600 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}>
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
            {/* Search */}
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
                placeholder="Tìm tên dự án, mã DA, khách hàng..." className="flex-1 h-9 px-3 border rounded-lg text-sm" />
            </div>

            {/* Time range filter */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Thời gian</label>
                <select value={filterTimeRange} onChange={e => setFilterTimeRange(e.target.value)}
                  className="w-full h-9 px-3 border rounded-lg text-sm bg-white">
                  <option value="all">Tất cả</option>
                  <option value="custom">Tùy chỉnh</option>
                </select>
              </div>
              {filterTimeRange === 'custom' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Từ ngày</label>
                    <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                      className="w-full h-9 px-3 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Đến ngày</label>
                    <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                      className="w-full h-9 px-3 border rounded-lg text-sm" />
                  </div>
                </>
              )}
            </div>

            {/* Hierarchy filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Khối
                </label>
                <select value={filterDivision} onChange={e => { setFilterDivision(e.target.value); setFilterCompany('all'); setFilterDepartment('all'); setFilterTeam('all'); }}
                  className="w-full h-9 px-3 border rounded-lg text-sm bg-white">
                  <option value="all">Tất cả Khối</option>
                  {divisions.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Công ty
                </label>
                <select value={filterCompany} onChange={e => { setFilterCompany(e.target.value); setFilterDepartment('all'); setFilterTeam('all'); }}
                  className="w-full h-9 px-3 border rounded-lg text-sm bg-white" disabled={filterDivision === 'all'}>
                  <option value="all">Tất cả Công ty</option>
                  {companies.filter(c => filterDivision === 'all' || c.division_unit_id === filterDivision).map(c => (
                    <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <Users className="h-3 w-3" /> Phòng ban
                </label>
                <select value={filterDepartment} onChange={e => { setFilterDepartment(e.target.value); setFilterTeam('all'); }}
                  className="w-full h-9 px-3 border rounded-lg text-sm bg-white" disabled={filterCompany === 'all'}>
                  <option value="all">Tất cả Phòng ban</option>
                  {departments.filter(d => filterCompany === 'all' || d.company_id === filterCompany).map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <Users className="h-3 w-3" /> Nhóm
                </label>
                <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
                  className="w-full h-9 px-3 border rounded-lg text-sm bg-white" disabled={filterDepartment === 'all'}>
                  <option value="all">Tất cả Nhóm</option>
                  {teams.filter(t => filterDepartment === 'all' || t.parent_id === filterDepartment).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Employee filter - only for admin/manager/supervisor */}
            {canViewAllEmployees && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <User className="h-3 w-3" /> Nhân viên
                </label>
                <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}
                  className="w-full h-9 px-3 border rounded-lg text-sm bg-white">
                  <option value="all">Tất cả nhân viên</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.full_name || e.email}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Permission notice for regular employees */}
            {!canViewAllEmployees && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                <Eye className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-900">
                  <p className="font-medium">Chế độ xem nhân viên</p>
                  <p className="text-blue-700 mt-0.5">Bạn chỉ thấy dự án được giao cho mình. Giám đốc/Quản lý/Giám sát mới xem được tất cả.</p>
                </div>
              </div>
            )}

            {/* Clear filters */}
            <div className="flex justify-end pt-2 border-t">
              <button onClick={() => {
                setFilterDivision('all');
                setFilterCompany('all');
                setFilterDepartment('all');
                setFilterTeam('all');
                setFilterEmployee('all');
                setFilterSearch('');
                setFilterTimeRange('all');
                setFilterDateFrom('');
                setFilterDateTo('');
              }} className="h-8 px-3 text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1">
                <X className="h-3 w-3" /> Xóa bộ lọc
              </button>
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
        ) : (
          /* Status-based Kanban for PROJECTS */
          (() => {
            const STATUS_COLUMNS = [
              { id: 'pending', label: 'Đang chờ', color: '#6b7280', statuses: ['consulting', 'designing', 'quoting'] },
              { id: 'processing', label: 'Chờ xử lý', color: '#f59e0b', statuses: ['contract_signed'] },
              { id: 'working', label: 'Đang làm', color: '#3b82f6', statuses: ['producing', 'shipping', 'installing'] },
              { id: 'review', label: 'Chờ kiểm tra', color: '#8b5cf6', statuses: [] }, // Custom logic
              { id: 'done', label: 'Hoàn thành', color: '#10b981', statuses: ['completed'] },
              { id: 'blocked', label: 'Bị chặn', color: '#ef4444', statuses: [] }, // Custom logic
              { id: 'paused', label: 'Tạm hoãn', color: '#64748b', statuses: ['on_hold'] },
            ];

            const projectsByStatus = {};
            STATUS_COLUMNS.forEach(col => { projectsByStatus[col.id] = []; });

            filteredProjects.forEach(proj => {
              const status = proj.status || 'consulting';
              let placed = false;
              
              STATUS_COLUMNS.forEach(col => {
                if (col.statuses.includes(status)) {
                  projectsByStatus[col.id].push(proj);
                  placed = true;
                }
              });
              
              if (!placed) projectsByStatus['pending'].push(proj); // Default fallback
            });

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
                {STATUS_COLUMNS.map(col => (
                  <div key={col.id} className="flex flex-col">
                    <div className="rounded-t-xl p-3 border border-b-0 bg-white" style={{ borderTopColor: col.color, borderTopWidth: '3px' }}>
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-bold text-gray-900">{col.label}</h3>
                        <span className="text-xs font-medium text-gray-400">{projectsByStatus[col.id].length}</span>
                      </div>
                    </div>
                    <div className="flex-1 rounded-b-xl border p-2 space-y-2 bg-gray-50/50 overflow-y-auto" style={{ minHeight: '400px', maxHeight: '70vh' }}>
                      {projectsByStatus[col.id].map(proj => (
                        <div key={proj.id} onClick={() => selectProject(proj)}
                          className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-blue-600">{proj.code}</span>
                          </div>
                          <h3 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2">{proj.name}</h3>
                          {proj.customers?.full_name && <p className="text-xs text-gray-500 mb-1">👤 {proj.customers.full_name}</p>}
                          {proj.company && <p className="text-[10px] text-indigo-600 font-medium">🏢 {proj.company.short_name || proj.company.name}</p>}
                          {proj.current_stage && (
                            <div className="mt-2 pt-2 border-t">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{proj.current_stage.name}</span>
                            </div>
                          )}
                        </div>
                      ))}
                      {projectsByStatus[col.id].length === 0 && (
                        <div className="flex items-center justify-center h-32 text-xs text-gray-300">Trống</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
        )}
      </div>
    );
  }

  if (view === 'kanban' && selectedProject) {
    // Use project-specific stages or fallback to all stages
    const projectStages = selectedProject.projectStages || stages;

    // If no stage selected, show stage tabs
    if (!selectedStage) {
      // Group tasks by stage to show count (use both id and slug for matching)
      const tasksByStage = {};
      projectStages.forEach(s => { 
        tasksByStage[s.id] = []; 
        if (s.slug) tasksByStage[s.slug] = tasksByStage[s.id]; // Alias
      });
      tasks.forEach(t => {
        const stageId = t.stage?.id;
        const slug = t.stage?.slug;
        if (stageId && tasksByStage[stageId]) {
          tasksByStage[stageId].push(t);
        } else if (slug && tasksByStage[slug]) {
          tasksByStage[slug].push(t);
        } else {
          tasksByStage['other'] = tasksByStage['other'] || [];
          tasksByStage['other'].push(t);
        }
      });

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

          {/* Stage Tabs */}
          <div className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Chọn quy trình để xem chi tiết 
              {selectedProject.flowAssignments?.length > 0 && (
                <span className="text-xs text-gray-500 ml-2">({projectStages.length} quy trình trong luồng)</span>
              )}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {projectStages.map(stage => {
                const stageTasks = tasksByStage[stage.id] || tasksByStage[stage.slug] || [];
                const doneCount = stageTasks.filter(t => t.status === 'done').length;
                return (
                  <button key={stage.id || stage.slug} onClick={() => setSelectedStage(stage)}
                    className="p-4 rounded-xl border-2 hover:shadow-lg transition-all cursor-pointer text-left"
                    style={{ borderColor: stage.color + '40', backgroundColor: stage.color + '08' }}>
                    <div className="w-3 h-3 rounded-full mb-2" style={{ backgroundColor: stage.color }} />
                    <h4 className="text-sm font-bold text-gray-900 mb-1">{stage.name}</h4>
                    <p className="text-xs text-gray-500">{doneCount}/{stageTasks.length} hoàn thành</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // Stage selected: show task kanban (columns = tasks, cards = checklists)
    // Use stage.id for matching (more reliable than slug)
    const stageTasks = tasks.filter(t => t.stage?.id === selectedStage.id || t.stage?.slug === selectedStage.slug);
    
    console.log('[ProjectWorkflow] Selected stage:', selectedStage.id, selectedStage.slug, selectedStage.name);
    console.log('[ProjectWorkflow] Total tasks:', tasks.length);
    console.log('[ProjectWorkflow] Tasks with stage:', tasks.map(t => ({ id: t.id, title: t.title, stageId: t.stage?.id, stageSlug: t.stage?.slug, stageName: t.stage?.name })));
    console.log('[ProjectWorkflow] Filtered stageTasks:', stageTasks.length);
    
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedStage(null)} className="h-9 w-9 bg-white border rounded-lg flex items-center justify-center hover:bg-gray-50 cursor-pointer">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{selectedProject.code} — {selectedProject.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-4 rounded-full" style={{ backgroundColor: selectedStage.color }} />
              <p className="text-sm font-medium" style={{ color: selectedStage.color }}>{selectedStage.name}</p>
            </div>
          </div>
          <div className="text-sm text-gray-500">{stageTasks.length} nhiệm vụ</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
          </div>
        ) : stageTasks.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border">
            <FolderKanban className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">Chưa có nhiệm vụ trong quy trình này</p>
          </div>
        ) : (
          /* Task Kanban: Each column = 1 task, cards = checklists */
          <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '500px' }}>
            {stageTasks.map(task => {
              const checklists = task.checklists || [];
              const clDone = checklists.filter(c => c.is_completed).length;
              return (
                <div key={task.id} className="shrink-0 w-80 flex flex-col">
                  <div className="rounded-t-xl p-3 border border-b-0 bg-white" style={{ borderTopColor: selectedStage.color, borderTopWidth: '3px' }}>
                    <div className="mb-2">
                      <h3 className="text-sm font-bold text-gray-900 mb-1">{task.title}</h3>
                      {task.description && <p className="text-xs text-gray-500 line-clamp-2">{task.description}</p>}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Checklist: {clDone}/{checklists.length}</span>
                      {task.assignee && (
                        <div className="flex items-center gap-1">
                          <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ backgroundColor: avatarColor(task.assignee.full_name) }}>
                            {getInitials(task.assignee.full_name)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 rounded-b-xl border p-2 space-y-2 bg-gray-50/50 overflow-y-auto" style={{ maxHeight: '70vh' }}>
                    {checklists.map(cl => (
                      <div key={cl.id} className={`bg-white rounded-lg border p-3 ${cl.is_completed ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200'}`}>
                        <div className="flex items-start gap-2">
                          <button onClick={() => toggleCheckItem(task.id, cl.id, cl.is_completed)}
                            className={`shrink-0 w-4 h-4 mt-0.5 rounded border-2 flex items-center justify-center cursor-pointer ${
                              cl.is_completed ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 bg-white hover:border-blue-400'
                            }`}>
                            {cl.is_completed && <CheckSquare className="h-3 w-3 text-white" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium ${cl.is_completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>{cl.title}</p>
                            {cl.notes && (
                              <div className="mt-1 text-[10px] text-gray-500 bg-gray-50 rounded px-2 py-1 border">
                                {cl.notes}
                              </div>
                            )}
                            {cl.attachments?.length > 0 && (
                              <div className="mt-1 flex gap-1 flex-wrap">
                                {cl.attachments.map((att, i) => (
                                  <a key={i} href={att} target="_blank" rel="noopener noreferrer"
                                    className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">
                                    <Paperclip className="h-2.5 w-2.5 inline" /> File {i+1}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {checklists.length === 0 && (
                      <div className="flex items-center justify-center h-32 text-xs text-gray-300">Chưa có checklist</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }


  return null;
}
