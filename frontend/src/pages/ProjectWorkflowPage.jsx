import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskCreateModal from '../components/TaskCreateModal';
import Modal from '../components/Modal';
import { FileUploadButton, FilePreview } from '../components/FileUpload';
import {
  PRIORITY_LABELS, PRIORITY_COLORS, formatDate, getInitials, avatarColor, ROLE_LABELS,
} from '../lib/utils';
import {
  Plus, FolderKanban, CheckSquare, Lock, RefreshCw, Building2, Users, Search,
  ArrowRightCircle, Send, Paperclip, MessageSquare, Eye, EyeOff, Save, Calendar,
  Briefcase, ChevronRight, LayoutGrid, List, Filter
} from 'lucide-react';

const STAGE_NAMES = {
  consulting: 'Tư vấn', design: 'Thiết kế', quotation: 'Báo giá', contract: 'Hợp đồng',
  production: 'Sản xuất', shipping: 'Vận chuyển', installation: 'Lắp đặt', 'customer-care': 'Chăm sóc KH',
};

const STAGE_COLORS = {
  consulting: '#8b5cf6', design: '#06b6d4', quotation: '#f59e0b', contract: '#10b981',
  production: '#3b82f6', shipping: '#6366f1', installation: '#ec4899', 'customer-care': '#14b8a6',
};

const NEXT_STATUS = { consulting:'designing', design:'quoting', quotation:'contract_signed', contract:'producing', production:'shipping', shipping:'installing', installation:'warranty' };
const NEXT_SLUG = { consulting:'design', design:'quotation', quotation:'contract', contract:'production', production:'shipping', shipping:'installation', installation:'customer-care' };
const SLUG_TO_STATUS = { consulting:'consulting', design:'designing', quotation:'quoting', contract:'contract_signed', production:'producing', shipping:'shipping', installation:'installing', 'customer-care':'warranty' };

export default function ProjectWorkflowPage() {
  const { user } = useAuth();
  const isAdmin = ['admin', 'manager', 'director'].includes(user?.role);

  // ═══ STATE ═══
  const [view, setView] = useState('projects'); // 'projects' | 'workflow'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [projects, setProjects] = useState([]);
  const [allStages, setAllStages] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ═══ FILTERS ═══
  const [filterDivision, setFilterDivision] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // ═══ WORKFLOW VIEW STATE ═══
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [stageInfo, setStageInfo] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [advProj, setAdvProj] = useState(null);
  const [advNotes, setAdvNotes] = useState('');
  const [advFiles, setAdvFiles] = useState([]);
  const [advMode, setAdvMode] = useState('advance');
  const [advLoading, setAdvLoading] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState({});
  const [approvalRules, setApprovalRules] = useState({});

  // ═══ LOAD DATA ═══
  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projRes, stageRes, compRes, divRes] = await Promise.all([
        api.get('/projects', { params: { limit: 500 } }).catch(() => ({ data: { projects: [] } })),
        api.get('/users/stages').catch(() => ({ data: { stages: [] } })),
        api.get('/companies').catch(() => ({ data: { companies: [] } })),
        api.get('/ecosystem/units', { params: { level_code: 'division' } }).catch(() => ({ data: { units: [] } })),
      ]);

      let allProjects = projRes.data.projects || [];
      
      // Filter by permission
      if (!isAdmin) {
        // Employee: only projects they are assigned to or participating in
        allProjects = allProjects.filter(p => {
          const isOwner = p.created_by === user.id;
          const isResponsible = p.responsible_person_id === user.id;
          // TODO: check project_members table if needed
          return isOwner || isResponsible;
        });
      }

      setProjects(allProjects);
      setAllStages(stageRes.data.stages || []);
      setCompanies(compRes.data.companies || []);
      setDivisions(divRes.data.units || []);
    } catch (e) {
      console.error('loadProjects error:', e);
      setError('Không thể tải dữ liệu.');
    }
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // ═══ LOAD WORKFLOW DATA (when project + stage selected) ═══
  const loadWorkflow = useCallback(async (projectId, stageSlug) => {
    if (!projectId || !stageSlug) return;
    setLoading(true);
    try {
      // Find all stages matching this slug
      const matchedStages = allStages.filter(s => s.slug === stageSlug || s.name === STAGE_NAMES[stageSlug]);
      const primaryStage = matchedStages[0] || null;
      setStageInfo(primaryStage || { slug: stageSlug, name: STAGE_NAMES[stageSlug], color: STAGE_COLORS[stageSlug] || '#3b82f6' });

      if (matchedStages.length === 0) {
        setTasks([]);
        setLoading(false);
        return;
      }

      // Load tasks for this project + stage
      const stageIds = matchedStages.map(s => s.id);
      const taskPromises = stageIds.map(stageId =>
        api.get('/tasks', { params: { stage_id: stageId, project_id: projectId } })
          .then(r => r.data.tasks || [])
          .catch(() => [])
      );
      const taskArrays = await Promise.all(taskPromises);
      let stageTasks = taskArrays.flat();

      // Load checklists
      const checklistPromises = stageTasks.map(t =>
        api.get(`/tasks/${t.id}/checklists`).then(r => ({ taskId: t.id, checklists: r.data.checklists || [] })).catch(() => ({ taskId: t.id, checklists: [] }))
      );
      const checklistResults = await Promise.all(checklistPromises);
      const clMap = {};
      checklistResults.forEach(r => { clMap[r.taskId] = r.checklists; });
      stageTasks = stageTasks.map(t => ({ ...t, checklists: clMap[t.id] || [] }));

      setTasks(stageTasks.sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));

      // Load approval info
      try {
        const { data: pendData } = await api.get('/approvals/pending').catch(() => ({ data: { approvals: [] } }));
        const pendingMap = {};
        (pendData.approvals || []).forEach(a => {
          if (a.project_id === projectId) pendingMap[a.project_id] = true;
        });
        setPendingApprovals(pendingMap);

        const { data: rulesData } = await api.get('/approvals/rules');
        const rulesMap = {};
        (rulesData.rules || []).forEach(r => { rulesMap[r.stage_id] = r; });
        setApprovalRules(rulesMap);
      } catch { setPendingApprovals({}); setApprovalRules({}); }

    } catch (e) {
      console.error('loadWorkflow error:', e);
      setError('Không thể tải quy trình.');
    }
    setLoading(false);
  }, [allStages]);

  useEffect(() => {
    if (view === 'workflow' && selectedProject && selectedStage) {
      loadWorkflow(selectedProject.id, selectedStage);
    }
  }, [view, selectedProject, selectedStage, loadWorkflow]);

  // ═══ ACTIONS ═══
  const doAdvance = async () => {
    if (!advProj || !selectedStage) return;
    setAdvLoading(true);
    try {
      const ns = NEXT_SLUG[selectedStage], nst = NEXT_STATUS[selectedStage];
      if (advMode === 'advance' && ns && nst) {
        await api.put(`/projects/${advProj.id}/stage`, { stage_slug: ns, new_status: nst, notes: advNotes || null, attachments: advFiles });
      } else if (advMode === 'review' && ns && nst) {
        await api.post(`/approvals/project/${advProj.id}/request`, {
          next_stage_slug: ns, next_status: nst, notes: advNotes || null, attachments: advFiles,
        });
        alert('✅ Đã gửi yêu cầu duyệt!');
      }
      setAdvProj(null); setAdvNotes(''); setAdvFiles([]);
      loadWorkflow(selectedProject.id, selectedStage);
    } catch (e) { alert('Lỗi: ' + (e.response?.data?.error || e.message)); }
    setAdvLoading(false);
  };

  const collectChecklistSummary = (projectId) => {
    let allNotes = [];
    let allFiles = [];
    tasks.forEach(t => {
      if (t.project_id !== projectId) return;
      const cls = t.checklists || [];
      cls.forEach(cl => {
        if (cl.notes) allNotes.push(`[${t.title.replace(/\s*—\s*.+$/, '')}] ${cl.title}: ${cl.notes}`);
        if (cl.attachments?.length) allFiles.push(...cl.attachments);
      });
    });
    return { notes: allNotes.join('\n'), files: allFiles };
  };

  const openAdvanceModal = (proj, mode) => {
    const summary = collectChecklistSummary(proj.id);
    setAdvProj(proj);
    setAdvMode(mode);
    setAdvNotes(summary.notes);
    setAdvFiles([...summary.files]);
  };

  const startTask = async (taskId) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'in_progress' } : t));
    try { await api.patch(`/tasks/${taskId}/status`, { status: 'in_progress' }); } catch { }
    loadWorkflow(selectedProject.id, selectedStage);
  };

  const markTaskDone = async (taskId) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'done' } : t));
    try { await api.patch(`/tasks/${taskId}/status`, { status: 'done' }); } catch { }
    loadWorkflow(selectedProject.id, selectedStage);
  };

  const toggleCheckItem = async (taskId, clId, isCompleted) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      return { ...t, checklists: t.checklists.map(cl => cl.id === clId ? { ...cl, is_completed: !isCompleted } : cl) };
    }));
    try { await api.patch(`/tasks/${taskId}/checklists/${clId}`, { is_completed: !isCompleted }); } catch { loadWorkflow(selectedProject.id, selectedStage); }
  };

  const saveChecklistNote = async (taskId, clId, notes, attachments) => {
    try {
      await api.patch(`/tasks/${taskId}/checklists/${clId}`, { notes, attachments });
      setTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t;
        return { ...t, checklists: t.checklists.map(cl => cl.id === clId ? { ...cl, notes, attachments } : cl) };
      }));
    } catch { loadWorkflow(selectedProject.id, selectedStage); }
  };

  const selectProjectAndStage = (project, stageSlug) => {
    setSelectedProject(project);
    setSelectedStage(stageSlug);
    setView('workflow');
  };

  const backToProjects = () => {
    setView('projects');
    setSelectedProject(null);
    setSelectedStage(null);
    setTasks([]);
  };

  // ═══ FILTERS ═══
  let filteredProjects = [...projects];
  
  // Auto-filter by division/company
  if (filterDivision !== 'all') {
    const divCompanies = companies.filter(c => c.division_unit_id === filterDivision).map(c => c.id);
    filteredProjects = filteredProjects.filter(p => divCompanies.includes(p.company_id));
  }
  if (filterCompany !== 'all') {
    filteredProjects = filteredProjects.filter(p => p.company_id === filterCompany);
  }
  if (filterSearch) {
    const s = filterSearch.toLowerCase();
    filteredProjects = filteredProjects.filter(p =>
      p.code?.toLowerCase().includes(s) ||
      p.name?.toLowerCase().includes(s) ||
      p.customers?.full_name?.toLowerCase().includes(s)
    );
  }

  // ═══ PROJECT LIST VIEW ═══
  if (view === 'projects') {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-blue-600" />
              Công việc dự án
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {filteredProjects.length} dự án · {isAdmin ? 'Quản lý' : 'Nhân viên'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilters(!showFilters)}
              className={`h-9 px-4 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer transition-colors ${
                showFilters ? 'bg-blue-600 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'
              }`}>
              <Filter className="h-4 w-4" />
              Lọc
            </button>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setViewMode('grid')}
                className={`h-7 w-7 rounded flex items-center justify-center cursor-pointer ${
                  viewMode === 'grid' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
                }`}>
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode('list')}
                className={`h-7 w-7 rounded flex items-center justify-center cursor-pointer ${
                  viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
                }`}>
                <List className="h-4 w-4" />
              </button>
            </div>
            <button onClick={loadProjects} className="h-9 w-9 bg-white border rounded-lg flex items-center justify-center hover:bg-gray-50 cursor-pointer text-gray-400">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={filterSearch}
                  onChange={e => setFilterSearch(e.target.value)}
                  placeholder="Tìm mã DA, tên, KH..."
                  className="flex-1 h-9 px-3 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-400" />
                <select
                  value={filterDivision}
                  onChange={e => { setFilterDivision(e.target.value); setFilterCompany('all'); }}
                  className="h-9 px-3 border rounded-lg text-sm bg-white">
                  <option value="all">Tất cả Khối</option>
                  {divisions.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <select
                value={filterCompany}
                onChange={e => setFilterCompany(e.target.value)}
                className="h-9 px-3 border rounded-lg text-sm bg-white">
                <option value="all">Tất cả Công ty</option>
                {companies
                  .filter(c => filterDivision === 'all' || c.division_unit_id === filterDivision)
                  .map(c => (
                    <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                  ))}
              </select>
            </div>
          </div>
        )}

        {/* Projects Grid/List */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-2">
              <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              <span className="text-sm text-gray-400">Đang tải dự án...</span>
            </div>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border">
            <FolderKanban className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">Không có dự án nào</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map(proj => (
              <ProjectCard key={proj.id} project={proj} onSelectStage={(slug) => selectProjectAndStage(proj, slug)} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Mã DA</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tên dự án</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Khách hàng</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Công ty</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Trạng thái</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Quy trình</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredProjects.map(proj => (
                  <ProjectRow key={proj.id} project={proj} onSelectStage={(slug) => selectProjectAndStage(proj, slug)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ═══ WORKFLOW VIEW (Kanban by stage) ═══
  if (view === 'workflow' && selectedProject && selectedStage) {
    return <WorkflowKanbanView
      project={selectedProject}
      stageSlug={selectedStage}
      tasks={tasks}
      stageInfo={stageInfo}
      loading={loading}
      error={error}
      isAdmin={isAdmin}
      user={user}
      onBack={backToProjects}
      onRefresh={() => loadWorkflow(selectedProject.id, selectedStage)}
      onStartTask={startTask}
      onMarkTaskDone={markTaskDone}
      onToggleCheckItem={toggleCheckItem}
      onSaveChecklistNote={saveChecklistNote}
      onOpenAdvance={openAdvanceModal}
      pendingApprovals={pendingApprovals}
      approvalRules={approvalRules}
      selectedTask={selectedTask}
      setSelectedTask={setSelectedTask}
      showCreateTask={showCreateTask}
      setShowCreateTask={setShowCreateTask}
      advProj={advProj}
      advNotes={advNotes}
      advFiles={advFiles}
      advMode={advMode}
      advLoading={advLoading}
      setAdvProj={setAdvProj}
      setAdvNotes={setAdvNotes}
      setAdvFiles={setAdvFiles}
      doAdvance={doAdvance}
    />;
  }

  return null;
}

// ═══ PROJECT CARD (Grid) ═══
function ProjectCard({ project, onSelectStage }) {
  const currentStage = Object.keys(SLUG_TO_STATUS).find(k => SLUG_TO_STATUS[k] === project.status) || 'consulting';
  const stageName = STAGE_NAMES[currentStage];
  const stageColor = STAGE_COLORS[currentStage];

  return (
    <div className="bg-white rounded-xl border hover:shadow-lg transition-shadow p-4 space-y-3">
      <div>
        <div className="flex items-start justify-between mb-2">
          <Link to={`/projects/${project.id}`} className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-blue-600">{project.code}</span>
              <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: stageColor + '20', color: stageColor }}>
                {stageName}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{project.name}</h3>
          </Link>
        </div>
        {project.customers?.full_name && (
          <p className="text-xs text-gray-500">👤 {project.customers.full_name}</p>
        )}
        {project.company && (
          <p className="text-xs text-indigo-600 mt-1">🏢 {project.company.short_name || project.company.name}</p>
        )}
      </div>

      <div className="border-t pt-3">
        <p className="text-xs font-medium text-gray-700 mb-2">Chọn quy trình xem:</p>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.keys(STAGE_NAMES).map(slug => {
            const isActive = slug === currentStage;
            return (
              <button
                key={slug}
                onClick={() => onSelectStage(slug)}
                className={`h-8 px-2 rounded text-[10px] font-medium cursor-pointer transition-all ${
                  isActive
                    ? 'text-white shadow-sm'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
                style={isActive ? { backgroundColor: STAGE_COLORS[slug] } : {}}>
                {STAGE_NAMES[slug]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══ PROJECT ROW (List) ═══
function ProjectRow({ project, onSelectStage }) {
  const currentStage = Object.keys(SLUG_TO_STATUS).find(k => SLUG_TO_STATUS[k] === project.status) || 'consulting';
  const stageName = STAGE_NAMES[currentStage];
  const stageColor = STAGE_COLORS[currentStage];

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <Link to={`/projects/${project.id}`} className="text-sm font-semibold text-blue-600 hover:underline">
          {project.code}
        </Link>
      </td>
      <td className="px-4 py-3">
        <Link to={`/projects/${project.id}`} className="text-sm text-gray-900 hover:text-blue-600">
          {project.name}
        </Link>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {project.customers?.full_name || '-'}
      </td>
      <td className="px-4 py-3 text-xs text-indigo-600">
        {project.company?.short_name || project.company?.name || '-'}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs px-2 py-1 rounded font-medium" style={{ backgroundColor: stageColor + '20', color: stageColor }}>
          {stageName}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1 flex-wrap">
          {Object.keys(STAGE_NAMES).slice(0, 4).map(slug => (
            <button
              key={slug}
              onClick={() => onSelectStage(slug)}
              className="h-6 px-2 bg-gray-100 text-gray-600 rounded text-[10px] font-medium hover:bg-blue-50 hover:text-blue-600 cursor-pointer">
              {STAGE_NAMES[slug]}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ═══ WORKFLOW KANBAN VIEW (same as StageView.jsx but for 1 project) ═══
function WorkflowKanbanView({
  project, stageSlug, tasks, stageInfo, loading, error, isAdmin, user,
  onBack, onRefresh, onStartTask, onMarkTaskDone, onToggleCheckItem, onSaveChecklistNote, onOpenAdvance,
  pendingApprovals, approvalRules, selectedTask, setSelectedTask, showCreateTask, setShowCreateTask,
  advProj, advNotes, advFiles, advMode, advLoading, setAdvProj, setAdvNotes, setAdvFiles, doAdvance
}) {
  const stageName = STAGE_NAMES[stageSlug] || stageSlug;
  const canInteract = isAdmin; // simplify for now
  const nextStageName = STAGE_NAMES[NEXT_SLUG[stageSlug]];

  // Build kanban columns
  const colMap = {};
  tasks.forEach(t => {
    const idx = t.order_index ?? 0;
    if (!colMap[idx]) colMap[idx] = { titles: [], tasks: [] };
    colMap[idx].tasks.push(t);
    const base = t.title.replace(/\s*—\s*.+$/, '');
    colMap[idx].titles.push(base);
  });

  const columns = Object.keys(colMap).sort((a, b) => +a - +b).map(idx => {
    const g = colMap[idx];
    const titleCounts = {};
    g.titles.forEach(t => titleCounts[t] = (titleCounts[t] || 0) + 1);
    const baseTitle = Object.entries(titleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || `NV ${+idx + 1}`;
    return { orderIndex: +idx, title: baseTitle, tasks: g.tasks };
  });

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const allTasksDone = totalTasks > 0 && doneTasks === totalTasks;
  const isPending = pendingApprovals[project.id];
  const currentRule = stageInfo?.id ? approvalRules[stageInfo.id] : null;
  const isAutoApproval = currentRule?.approval_mode === 'auto';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="h-9 w-9 bg-white border rounded-lg flex items-center justify-center hover:bg-gray-50 cursor-pointer">
            <ChevronRight className="h-4 w-4 rotate-180" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stageInfo?.color || '#3b82f6' }} />
              <h1 className="text-xl font-bold text-gray-900">{project.code} — {stageName}</h1>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{project.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRefresh} className="h-9 w-9 bg-white border rounded-lg flex items-center justify-center hover:bg-gray-50 cursor-pointer text-gray-400">
            <RefreshCw className="h-4 w-4" />
          </button>
          {canInteract && (
            <button onClick={() => setShowCreateTask(true)} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
              <Plus className="h-4 w-4" /> Thêm NV
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Advance banner */}
      {nextStageName && allTasksDone && project.status === SLUG_TO_STATUS[stageSlug] && (
        <div className={`${isPending ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'} border rounded-xl p-4 flex items-center gap-3 flex-wrap`}>
          <CheckSquare className={`h-5 w-5 ${isPending ? 'text-amber-600' : 'text-emerald-600'}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${isPending ? 'text-amber-800' : 'text-emerald-800'}`}>
              {isPending ? '⏳ Đang chờ duyệt' : '✅ Hoàn thành!'}
            </p>
            <p className={`text-xs ${isPending ? 'text-amber-600' : 'text-emerald-600'}`}>
              {isPending ? 'Yêu cầu duyệt đã được gửi.' : `Tất cả NV ở ${stageName} đã xong.`}
            </p>
          </div>
          {!isPending && isAutoApproval && (
            <button onClick={() => onOpenAdvance(project, 'advance')}
              className="h-8 px-3 bg-emerald-600 text-white rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer hover:bg-emerald-700">
              <ArrowRightCircle className="h-3.5 w-3.5" /> Chuyển → {nextStageName}
            </button>
          )}
          {!isPending && !isAutoApproval && (
            <button onClick={() => onOpenAdvance(project, 'review')}
              className="h-8 px-3 bg-amber-500 text-white rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer hover:bg-amber-600">
              <Send className="h-3.5 w-3.5" /> Chờ duyệt → {nextStageName}
            </button>
          )}
        </div>
      )}

      {/* Progress */}
      {totalTasks > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Tiến độ</span>
            <span className="text-sm font-bold text-gray-900">{Math.round((doneTasks / totalTasks) * 100)}%</span>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${(doneTasks / totalTasks) * 100}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-2">{doneTasks}/{totalTasks} nhiệm vụ hoàn thành</p>
        </div>
      )}

      {/* Kanban columns */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
        </div>
      ) : columns.length > 0 ? (
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '300px' }}>
          {columns.map(col => {
            const colDone = col.tasks.filter(t => t.status === 'done').length;
            return (
              <div key={col.orderIndex} className="shrink-0 w-80 flex flex-col">
                {/* Column header */}
                <div className="rounded-t-xl p-3 border border-b-0 bg-white">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: stageInfo?.color || '#3b82f6' }}>
                        {col.orderIndex + 1}
                      </span>
                      <h3 className="text-sm font-bold text-gray-900">{col.title}</h3>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${col.tasks.length > 0 ? (colDone / col.tasks.length) * 100 : 0}%` }} />
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 rounded-b-xl border p-2 space-y-2 bg-gray-50/50 overflow-y-auto" style={{ maxHeight: '60vh' }}>
                  {col.tasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      project={project}
                      canInteract={canInteract}
                      onStartTask={onStartTask}
                      onMarkTaskDone={onMarkTaskDone}
                      onToggleCheckItem={onToggleCheckItem}
                      onSaveChecklistNote={onSaveChecklistNote}
                      onViewDetail={() => setSelectedTask(task.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border">
          <CheckSquare className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">Chưa có nhiệm vụ</p>
        </div>
      )}

      {/* Modals */}
      <TaskDetailModal taskId={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)} onUpdated={onRefresh} />
      <TaskCreateModal open={showCreateTask} onClose={() => setShowCreateTask(false)} onCreated={onRefresh} stageId={stageInfo?.id} projectId={project.id} />

      {/* Advance Modal */}
      <Modal open={!!advProj} onClose={() => setAdvProj(null)}
        title={advMode === 'advance' ? `Chuyển → ${nextStageName}` : 'Chờ duyệt'} size="lg">
        <div className="space-y-4">
          <div className={`${advMode === 'advance' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'} border rounded-xl p-4`}>
            <p className={`text-sm ${advMode === 'advance' ? 'text-emerald-800' : 'text-amber-800'}`}>
              {advMode === 'advance'
                ? `✅ Chuyển dự án → "${nextStageName}"`
                : `🔍 Gửi yêu cầu duyệt`}
            </p>
          </div>

          {(advNotes || advFiles.length > 0) && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h4 className="text-xs font-semibold text-blue-700 uppercase mb-2">📋 Tổng hợp từ checklist</h4>
              {advNotes && (
                <div className="bg-white rounded-lg p-3 border mb-2 max-h-40 overflow-y-auto">
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">{advNotes}</pre>
                </div>
              )}
              {advFiles.length > 0 && (
                <FilePreview files={advFiles} onRemove={i => setAdvFiles(f => f.filter((_, j) => j !== i))} />
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Ghi chú</label>
            <textarea value={advNotes} onChange={e => setAdvNotes(e.target.value)}
              className="w-full h-24 px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Ghi chú..." />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Đính kèm</label>
            <FileUploadButton onFilesUploaded={f => setAdvFiles(prev => [...prev, ...f])} />
            <FilePreview files={advFiles} onRemove={i => setAdvFiles(f => f.filter((_, j) => j !== i))} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdvProj(null)} className="h-9 px-4 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button>
            <button onClick={doAdvance} disabled={advLoading}
              className={`h-9 px-4 text-white rounded-lg text-sm font-medium cursor-pointer flex items-center gap-1 disabled:opacity-50 ${
                advMode === 'advance' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-500 hover:bg-amber-600'
              }`}>
              {advLoading ? 'Đang xử lý...' : advMode === 'advance' ? <><ArrowRightCircle className="h-3.5 w-3.5" /> Chuyển</> : <><Send className="h-3.5 w-3.5" /> Gửi</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ═══ TASK CARD ═══
function TaskCard({ task, project, canInteract, onStartTask, onMarkTaskDone, onToggleCheckItem, onSaveChecklistNote, onViewDetail }) {
  const isDone = task.status === 'done';
  const isActive = task.status === 'in_progress';
  const checklists = task.checklists || [];
  const clDone = checklists.filter(c => c.is_completed).length;
  const clTotal = checklists.length;
  const allClDone = clTotal > 0 && clDone === clTotal;

  return (
    <div className={`bg-white rounded-lg border p-3 transition-all ${
      isDone ? 'border-emerald-200 bg-emerald-50/30 opacity-80' : 'border-gray-200'
    }`}>
      {/* Task header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>
              {PRIORITY_LABELS[task.priority]}
            </span>
          </div>
          <h4 className="text-sm font-semibold text-gray-900 leading-tight">{task.title}</h4>
        </div>
        {isDone && <CheckSquare className="h-4 w-4 text-emerald-500 shrink-0" />}
      </div>

      {/* Assignee */}
      {task.assignee && (
        <div className="flex items-center gap-1.5 mt-2">
          <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ backgroundColor: avatarColor(task.assignee.full_name) }}>
            {getInitials(task.assignee.full_name)}
          </div>
          <span className="text-[10px] text-gray-500">{task.assignee.full_name}</span>
        </div>
      )}

      {/* Checklist */}
      {clTotal > 0 && (
        <div className="mt-2 space-y-1">
          <div className="w-full h-1 bg-gray-100 rounded-full">
            <div className={`h-full rounded-full transition-all ${isDone ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${(clDone/clTotal)*100}%` }} />
          </div>
          {checklists.map(cl => (
            <ChecklistCard
              key={cl.id}
              cl={cl}
              taskId={task.id}
              canInteract={canInteract}
              canToggle={canInteract && !isDone}
              onToggle={() => canInteract && !isDone && onToggleCheckItem(task.id, cl.id, cl.is_completed)}
              onSaveNote={(notes, files) => onSaveChecklistNote(task.id, cl.id, notes, files)}
            />
          ))}
        </div>
      )}

      {/* Actions */}
      {canInteract && !isDone && (
        <div className="flex gap-1 mt-2">
          {task.status === 'pending' && (
            <button onClick={() => onStartTask(task.id)} className="flex-1 h-6 bg-blue-50 text-blue-600 rounded text-[10px] font-medium hover:bg-blue-100 cursor-pointer">
              ▶ Bắt đầu
            </button>
          )}
          {isActive && allClDone && (
            <button onClick={() => onMarkTaskDone(task.id)} className="flex-1 h-6 bg-emerald-50 text-emerald-600 rounded text-[10px] font-medium hover:bg-emerald-100 cursor-pointer animate-pulse">
              ✓ Hoàn thành
            </button>
          )}
          <button onClick={onViewDetail} className="flex-1 h-6 text-gray-400 bg-white border rounded text-[10px] hover:text-blue-600 cursor-pointer">
            Chi tiết
          </button>
        </div>
      )}
    </div>
  );
}

// ═══ CHECKLIST CARD ═══
function ChecklistCard({ cl, taskId, canInteract, canToggle, onToggle, onSaveNote }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteFiles, setNoteFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const hasNotes = !!cl.notes;
  const hasFiles = cl.attachments?.length > 0;
  const hasExtra = hasNotes || hasFiles;

  const startEdit = (e) => {
    e.stopPropagation();
    setNoteText(cl.notes || '');
    setNoteFiles(cl.attachments || []);
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
    <div className="group">
      <div className="flex items-start gap-1.5">
        <button onClick={onToggle} disabled={!canToggle}
          className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
            cl.is_completed ? 'bg-emerald-500 border-emerald-500 text-white' : canToggle ? 'border-gray-300 hover:border-blue-400 cursor-pointer' : 'border-gray-200'
          }`}>
          {cl.is_completed && <CheckSquare className="h-2.5 w-2.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={`text-[11px] leading-tight flex-1 ${cl.is_completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
              {cl.title}
            </span>
            <div className="flex items-center gap-0.5 shrink-0">
              {hasFiles && <Paperclip className="h-2.5 w-2.5 text-blue-400" />}
              {hasNotes && <MessageSquare className="h-2.5 w-2.5 text-amber-400" />}
              {hasExtra && !editing && (
                <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                  className="text-gray-300 hover:text-blue-500 cursor-pointer p-0.5">
                  {expanded ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                </button>
              )}
              {canInteract && !editing && (
                <button onClick={startEdit} className="text-gray-300 hover:text-blue-500 cursor-pointer p-0.5 opacity-0 group-hover:opacity-100">
                  <MessageSquare className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          </div>

          {/* View */}
          {expanded && hasExtra && !editing && (
            <div className="mt-1 space-y-1">
              {hasNotes && <p className="text-[10px] text-gray-600 bg-amber-50 rounded px-2 py-1 border border-amber-100">{cl.notes}</p>}
              {hasFiles && (
                <div className="flex flex-wrap gap-1">
                  {cl.attachments.map((f, fi) => {
                    const isImg = f.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.file_url || f.file_name || '');
                    return isImg ? (
                      <a key={fi} href={f.file_url} target="_blank" rel="noopener noreferrer">
                        <img src={f.file_url} alt={f.file_name} className="h-10 w-10 rounded border object-cover hover:opacity-80" />
                      </a>
                    ) : (
                      <a key={fi} href={f.file_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-[9px] text-blue-600 bg-blue-50 rounded px-1.5 py-0.5 hover:bg-blue-100">
                        <Paperclip className="h-2 w-2" />{f.file_name || 'file'}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Edit */}
          {editing && (
            <div className="mt-1 space-y-1.5 bg-blue-50/50 rounded p-2 border border-blue-100" onClick={e => e.stopPropagation()}>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                className="w-full h-12 px-2 py-1 border rounded text-[11px] outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                placeholder="Ghi chú..." autoFocus />
              <FilePreview files={noteFiles} onRemove={i => setNoteFiles(f => f.filter((_, j) => j !== i))} small />
              <div className="flex items-center gap-1.5 flex-wrap">
                <FileUploadButton compact onFilesUploaded={files => setNoteFiles(prev => [...prev, ...files])} />
                <button onClick={save} disabled={saving}
                  className="h-5 px-2 bg-blue-600 text-white rounded text-[10px] font-medium cursor-pointer disabled:opacity-50 flex items-center gap-0.5">
                  <Save className="h-2.5 w-2.5" />{saving ? '...' : 'Lưu'}
                </button>
                <button onClick={() => setEditing(false)} className="h-5 px-1.5 text-gray-500 bg-gray-100 rounded text-[10px] cursor-pointer">Hủy</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}