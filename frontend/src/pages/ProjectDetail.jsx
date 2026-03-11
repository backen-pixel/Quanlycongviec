import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskCreateModal from '../components/TaskCreateModal';
import Modal from '../components/Modal';
import { FileUploadButton, FilePreview, FileList } from '../components/FileUpload';
import EmployeePicker from '../components/EmployeePicker';
import {
  ArrowLeft, Plus, Send, Trash2, ChevronRight, ChevronDown, Phone, MapPin,
  Calendar, Clock, CheckSquare, MessageSquare, ArrowRightCircle, ArrowRight,
  Paperclip, FileText, Edit, UserPlus, X, Shield, PlayCircle, AlertCircle, List, LayoutGrid
} from 'lucide-react';
import UserSelect from '../components/UserSelect';
import ProjectApprovalsTab from '../components/ProjectApprovalsTab';
import ProjectDocumentsTab from '../components/ProjectDocumentsTab';
import ProjectFlowTab from '../components/ProjectFlowTab';
import {
  STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS,
  TASK_STATUS, TASK_COLORS, formatVND, formatDate, formatDateTime,
  getInitials, avatarColor
} from '../lib/utils';

const STAGE_FLOW = [
  { slug: 'consulting', status: 'consulting', label: 'Tư vấn', personKey: 'consulting_person' },
  { slug: 'design', status: 'designing', label: 'Thiết kế', personKey: 'design_person' },
  { slug: 'quotation', status: 'quoting', label: 'Báo giá', personKey: 'quotation_person' },
  { slug: 'contract', status: 'contract_signed', label: 'Hợp đồng', personKey: 'contract_person' },
  { slug: 'production', status: 'producing', label: 'Sản xuất', personKey: 'production_person' },
  { slug: 'shipping', status: 'shipping', label: 'Vận chuyển', personKey: 'shipping_person' },
  { slug: 'installation', status: 'installing', label: 'Lắp đặt', personKey: 'installation_person' },
  { slug: 'customer-care', status: 'warranty', label: 'CSKH', personKey: 'care_person' },
];

export default function ProjectDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'tasks');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commentFiles, setCommentFiles] = useState([]);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [approvalRule, setApprovalRule] = useState(null); // { mode: 'auto'|'manual' }
  const [showAdvance, setShowAdvance] = useState(false);
  const [showApprovalRequest, setShowApprovalRequest] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [editingLines, setEditingLines] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [addLineStage, setAddLineStage] = useState('');

  const load = () => {
    setLoading(true);
    api.get(`/projects/${id}`).then(r => setProject(r.data.project)).catch(() => {}).finally(() => setLoading(false));
    // Load pending approval count
    api.get(`/approvals/project/${id}`).then(r => {
      const pending = (r.data.approvals || []).filter(a => a.status === 'pending').length;
      setPendingApprovalCount(pending);
    }).catch(() => {});
    // Load approval rule for current stage
    api.get(`/approvals/check-auto/${id}`).then(r => {
      setApprovalRule(r.data);
    }).catch(() => {});
  };
  useEffect(() => { load(); api.get('/users').then(r => setAllUsers(r.data.users || [])).catch(() => {}); }, [id]);

  const deleteProject = async () => {
    if (!confirm('Xóa dự án này?')) return;
    await api.delete(`/projects/${id}`); navigate('/projects');
  };

  const addComment = async () => {
    if (!newComment.trim() && !commentFiles.length) return;
    await api.post(`/projects/${id}/comments`, { content: newComment, attachments: commentFiles });
    setNewComment(''); setCommentFiles([]); load();
  };

  // Workflow line CRUD
  const updateLine = async (lineId, data) => {
    try { await api.put(`/projects/${id}/workflow-lines/${lineId}`, data); load(); } catch {}
  };
  const deleteLine = async (lineId) => {
    if (!confirm('Xóa bộ phận này?')) return;
    try { await api.delete(`/projects/${id}/workflow-lines/${lineId}`); load(); } catch {}
  };
  const addLine = async (stageSlug) => {
    const label = prompt('Tên bộ phận mới:');
    if (!label?.trim()) return;
    try { await api.post(`/projects/${id}/workflow-lines`, { stage_slug: stageSlug, label: label.trim() }); load(); } catch {}
  };

  if (loading) return <div className="flex items-center justify-center h-64"><svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div>;
  if (!project) return <div className="text-center py-16 text-gray-400">Dự án không tồn tại</div>;

  // Extract stages from project flow (if has flowAssignments)
  let projectStages = STAGE_FLOW; // Default fallback
  if (project.flowAssignments?.length > 0) {
    // Get unique stage IDs from flow assignments
    const stageIds = new Set();
    project.flowAssignments.forEach(fa => {
      fa.tasks?.forEach(t => {
        if (t.stage_id) stageIds.add(t.stage_id);
      });
    });
    
    // Map to stage info (need to load stages from API or use task stages)
    // For now, use tasks to get stage info
    const stagesFromTasks = new Set();
    project.tasks?.forEach(t => {
      if (t.stage) stagesFromTasks.add(JSON.stringify({
        id: t.stage.id,
        name: t.stage.name,
        slug: t.stage.slug,
        color: t.stage.color,
        order: t.stage.order_index
      }));
    });
    
    if (stagesFromTasks.size > 0) {
      projectStages = Array.from(stagesFromTasks)
        .map(s => JSON.parse(s))
        .sort((a, b) => a.order - b.order)
        .map(s => ({
          slug: s.slug,
          status: s.slug, // Approximate mapping
          label: s.name,
          personKey: null, // Will get from flowAssignments
          color: s.color
        }));
    }
  }

  const currentStageIdx = projectStages.findIndex(s => s.status === project.status || s.slug === project.current_stage?.slug);
  const nextStage = currentStageIdx >= 0 && currentStageIdx < projectStages.length - 1 ? projectStages[currentStageIdx + 1] : null;
  const canAdvance = project.canAdvance;

  const totalTasks = project.tasks?.length || 0;
  const doneTasks = project.tasks?.filter(t => t.status === 'done').length || 0;

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate('/projects')} className="mt-1 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-blue-600">{project.code}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[project.status] || ''}`}>{STATUS_LABELS[project.status]}</span>
              {project.priority && <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[project.priority] || ''}`}>{PRIORITY_LABELS[project.priority]}</span>}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
            {project.company && (
              <p className="text-xs text-indigo-600 font-medium flex items-center gap-1 mt-0.5">🏢 {project.company.name}{project.company.short_name ? ` (${project.company.short_name})` : ''}</p>
            )}
            {project.supervisor && (
              <div className="flex items-center gap-1.5 mt-1">
                <div className="h-4 w-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold"
                  style={{ backgroundColor: avatarColor(project.supervisor.full_name) }}>
                  {getInitials(project.supervisor.full_name)}
                </div>
                <p className="text-[10px] text-gray-500">
                  👁️ Giám sát: <span className="font-medium text-gray-700">{project.supervisor.full_name}</span>
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canAdvance && nextStage && approvalRule?.mode === 'auto' && (
            <button onClick={() => setShowAdvance(true)}
              className="h-9 px-4 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 cursor-pointer flex items-center gap-1 animate-pulse">
              <ArrowRightCircle className="h-4 w-4" /> Chuyển → {nextStage.label}
            </button>
          )}
          {canAdvance && nextStage && approvalRule?.mode !== 'auto' && (
            <button onClick={() => { setActiveTab('approvals'); setShowApprovalRequest(true); }}
              className="h-9 px-4 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 cursor-pointer flex items-center gap-1 animate-pulse">
              <Shield className="h-4 w-4" /> Chờ duyệt → {nextStage.label}
            </button>
          )}
          {!canAdvance && nextStage && project.stageTasksTotal > 0 && (
            <span className="text-xs text-gray-400">
              {project.stageTasksDone}/{project.stageTasksTotal} hoàn thành
            </span>
          )}
          <button onClick={deleteProject} className="h-9 px-3 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 cursor-pointer"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Stage pipeline - Flow-based */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          {projectStages.map((s, i) => {
            const isCurrent = s.slug === project.current_stage?.slug || s.status === project.status;
            const isPast = i < currentStageIdx;
            const person = project[s.personKey]; // Will be null for flow-based stages, handled below
            
            return (
              <div key={s.slug || i} className="flex items-center gap-1">
                <div className={`h-8 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5 ${
                  isCurrent ? 'bg-blue-600 text-white' : isPast ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`} style={{ borderLeftColor: s.color, borderLeftWidth: '3px' }}>
                  {isPast && <CheckSquare className="h-3 w-3" />}
                  {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                  {s.label}
                  {person && (
                    <div className="h-4 w-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold ml-0.5"
                      style={{ backgroundColor: avatarColor(person.full_name) }} title={person.full_name}>
                      {getInitials(person.full_name)}
                    </div>
                  )}
                </div>
                {i < projectStages.length - 1 && <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />}
              </div>
            );
          })}
        </div>
        {/* Stage counter */}
        <div className="mt-2 text-[10px] text-gray-400 flex items-center gap-2">
          <span>{currentStageIdx + 1}/{STAGE_FLOW.length} bước</span>
          <span>•</span>
          <span className="text-emerald-600 font-medium">{currentStageIdx} hoàn thành</span>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Khách hàng</h3>
          {project.customers && (<div className="space-y-2">
            <p className="text-sm font-semibold">{project.customers.full_name}</p>
            {project.customers.phone && <p className="text-xs text-gray-500 flex items-center gap-1"><Phone className="h-3 w-3" />{project.customers.phone}</p>}
            {project.customers.city && <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="h-3 w-3" />{project.customers.city}</p>}
          </div>)}
        </div>
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Giá trị</h3>
          <p className="text-2xl font-bold text-gray-900">{formatVND(project.estimated_value)}</p>
          {project.kitchen_type && <p className="text-xs text-gray-500 mt-2">Loại: {project.kitchen_type} · {project.material}</p>}
        </div>
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tiến độ</h3>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-bold">{totalTasks > 0 ? Math.round((doneTasks/totalTasks)*100) : 0}%</span>
            <span className="text-xs text-gray-500">{doneTasks}/{totalTasks} tasks</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${totalTasks > 0 ? (doneTasks/totalTasks)*100 : 0}%` }} />
          </div>
        </div>
      </div>

      {/* Quotation files — collapsible */}
      <div className="bg-white rounded-xl border">
        <button onClick={() => setShowFiles(v => !v)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" /> File báo giá
            {project.quotation_files?.length > 0 && (
              <span className="ml-1 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                {project.quotation_files.length}
              </span>
            )}
          </h3>
          {showFiles ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        </button>
        
        {showFiles && (
          <div className="px-4 pb-4 border-t">
            <div className="flex justify-end mb-2 pt-2">
              <FileUploadButton compact onFilesUploaded={async (files) => {
                const existing = project.quotation_files || [];
                await api.put(`/projects/${id}`, { quotation_files: [...existing, ...files] });
                load();
              }} />
            </div>
            {project.quotation_files?.length > 0 ? (
              <div className="space-y-1.5">
                {project.quotation_files.map((f, fi) => (
                  <div key={fi} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 group">
                    <Paperclip className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex-1 truncate">{f.file_name || `File ${fi + 1}`}</a>
                    {f.file_size && <span className="text-[10px] text-gray-400">{(f.file_size / 1024).toFixed(0)}KB</span>}
                    <button onClick={async () => {
                      const updated = (project.quotation_files || []).filter((_, j) => j !== fi);
                      await api.put(`/projects/${id}`, { quotation_files: updated });
                      load();
                    }} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 cursor-pointer shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-3">Chưa có file báo giá</p>
            )}
          </div>
        )}
      </div>

      {/* People — collapsible + editable */}
      <div className="bg-white rounded-xl border">
        <button onClick={() => setShowPeople(!showPeople)} className="w-full flex items-center justify-between p-3 sm:p-4 cursor-pointer hover:bg-gray-50">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nhân sự dự án</h3>
          <div className="flex items-center gap-2">
            {showPeople && (
              <button onClick={(e) => { e.stopPropagation(); setEditingLines(!editingLines); }}
                className={`h-6 px-2 rounded text-[10px] font-medium flex items-center gap-1 cursor-pointer ${editingLines ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-blue-50'}`}>
                <Edit className="h-3 w-3" /> {editingLines ? 'Xong' : 'Sửa'}
              </button>
            )}
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showPeople ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {showPeople && (
          <div className="px-3 sm:px-4 pb-4">
            {/* Show people by stage with their assigned tasks */}
            <div className="space-y-3">
              {projectStages.map(s => {
                // Get tasks for this stage
                const stageTasks = (project.tasks || []).filter(t => 
                  t.stage?.slug === s.slug || t.stage?.id === s.id
                );
                
                // Group users by tasks
                const userTasks = {};
                stageTasks.forEach(task => {
                  if (task.assignee) {
                    const uid = task.assignee.id;
                    if (!userTasks[uid]) {
                      userTasks[uid] = { user: task.assignee, tasks: [] };
                    }
                    userTasks[uid].tasks.push(task);
                  }
                });
                
                const users = Object.values(userTasks);
                
                return (
                  <div key={s.slug || s.label}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase flex-1">
                        {s.label} ({users.length} người)
                      </p>
                    </div>
                    {users.length > 0 ? (
                      <div className="space-y-1.5">
                        {users.map(({ user, tasks }) => (
                          <div key={user.id} className="bg-gray-50 rounded-lg px-2.5 py-2">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                                style={{ backgroundColor: avatarColor(user.full_name) }}>
                                {getInitials(user.full_name)}
                              </div>
                              <p className="text-xs font-medium text-gray-900">{user.full_name}</p>
                              <span className="text-[9px] text-gray-500">({tasks.length} nhiệm vụ)</span>
                            </div>
                            <div className="ml-8 space-y-0.5">
                              {tasks.map(task => (
                                <div key={task.id} className="flex items-center gap-1 text-[10px] text-gray-600">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    task.status === 'done' ? 'bg-green-500' : 
                                    task.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-300'
                                  }`} />
                                  <span className="truncate">{task.title}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-gray-300 py-1">Chưa phân công</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Template Sets & Assignments - NEW SECTION */}
      {project.flowAssignments && project.flowAssignments.length > 0 && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-bold text-gray-900">📋 Bộ Quy Trình Đang Dùng</h3>
            {project.flow && (
              <span className="text-xs text-blue-600 bg-white px-2 py-1 rounded border border-blue-200">
                {project.flow.name}
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {project.flowAssignments.map((assignment, idx) => (
              <div key={assignment.id} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                        {idx + 1}
                      </span>
                      <h4 className="text-sm font-semibold text-gray-900">
                        {assignment.company?.name || 'N/A'}
                      </h4>
                    </div>
                    <p className="text-xs text-gray-600 ml-8">
                      {assignment.template_set?.name || 'Chưa chọn template'}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-blue-600">
                      {assignment.progress || 0}%
                    </div>
                    <div className="text-xs text-gray-500">
                      {assignment.tasks_completed || 0}/{assignment.tasks_total || 0}
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all"
                    style={{ width: `${assignment.progress || 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { id: 'tasks', label: 'Công việc', icon: CheckSquare, count: totalTasks },
          { id: 'flow', label: 'Luồng', icon: ArrowRight },
          { id: 'documents', label: 'Tài liệu', icon: FileText },
          { id: 'approvals', label: 'Duyệt', icon: Shield, count: pendingApprovalCount || undefined },
          { id: 'chat', label: 'Trao đổi', icon: MessageSquare, count: project.comments?.length },
          { id: 'history', label: 'Lịch sử', icon: Clock, count: project.activities?.length },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 cursor-pointer ${
              activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon className="h-4 w-4" />{t.label}
            {t.count > 0 && <span className="text-xs bg-gray-100 px-1.5 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ─── Tasks Tab ─── */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
            <div className="flex-1">
              <h3 className="text-sm font-bold text-gray-900 mb-1">Quản lý công việc</h3>
              <p className="text-xs text-gray-600">Tạo task mới, gán nhân viên và theo dõi tiến độ</p>
            </div>
            <button onClick={() => setShowCreateTask(true)}
              className="h-10 px-5 bg-blue-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-blue-700 cursor-pointer shadow-sm hover:shadow-md transition-all">
              <Plus className="h-4 w-4" /> Thêm công việc
            </button>
          </div>

          {/* Flow-based view (Company → Process → Tasks) */}
          {project.flowAssignments?.length > 0 ? (
            <div className="space-y-4">
              {project.flowAssignments.map((assignment, aIdx) => {
                const assignmentTasks = assignment.tasks || [];
                // Group tasks by stage
                const byStage = {};
                assignmentTasks.forEach(t => {
                  const slug = t.stage?.slug || 'other';
                  if (!byStage[slug]) byStage[slug] = { stage: t.stage, tasks: [] };
                  byStage[slug].tasks.push(t);
                });
                const doneCount = assignmentTasks.filter(t => t.status === 'done').length;

                return (
                  <div key={assignment.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    {/* Company Header */}
                    <div className="bg-gray-50 border-b px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">{aIdx + 1}</span>
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">{assignment.company?.name || 'N/A'}</h4>
                          {assignment.template_set && (
                            <p className="text-xs text-gray-500">📋 {assignment.template_set.name}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-blue-600">{doneCount}/{assignmentTasks.length}</div>
                        <div className="w-24 bg-gray-200 rounded-full h-1.5 mt-1">
                          <div className="bg-blue-500 h-full rounded-full" style={{ width: `${assignmentTasks.length ? Math.round(doneCount/assignmentTasks.length*100) : 0}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Stages → Tasks */}
                    <div className="divide-y">
                      {Object.entries(byStage).map(([slug, group]) => {
                        const stageDone = group.tasks.filter(t => t.status === 'done').length;
                        const allDone = stageDone === group.tasks.length;
                        return (
                          <div key={slug}>
                            {/* Stage sub-header */}
                            <div className="flex items-center gap-2 px-4 py-2 bg-white" style={{ borderLeft: `3px solid ${group.stage?.color || '#6b7280'}` }}>
                              <span className="text-xs font-semibold text-gray-700 flex-1">
                                {group.stage?.name || 'Quy trình khác'}
                              </span>
                              <span className="text-xs text-gray-400">{stageDone}/{group.tasks.length}</span>
                              {allDone && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">✓</span>}
                            </div>
                            {/* Tasks */}
                            <div className="px-3 pb-2 space-y-1 bg-gray-50">
                              {group.tasks.map(t => (
                                <TaskRow key={t.id} task={t} isLocked={false} onSelect={setSelectedTask} companyUnitId={assignment.company?.id} onReload={load} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {assignmentTasks.length === 0 && (
                        <div className="px-4 py-4 text-xs text-gray-400 text-center">Chưa có nhiệm vụ</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
          /* ── OLD: Stage-based flat view (legacy projects) ── */
          <div className="space-y-4">
          {STAGE_FLOW.map((sf) => {
            const stageTasks = (project.tasks || []).filter(t => t.stage?.slug === sf.slug);
            const stageIdx = STAGE_FLOW.findIndex(s => s.slug === sf.slug);
            const isCurrent = sf.status === project.status;
            const isPast = stageIdx < currentStageIdx;
            const isFuture = stageIdx > currentStageIdx;
            const allDone = stageTasks.length > 0 && stageTasks.every(t => t.status === 'done');
            const done = stageTasks.filter(t => t.status === 'done').length;

            let prevAllDone = true;
            if (isFuture) {
              for (let pi = 0; pi < stageIdx; pi++) {
                const prevTasks = (project.tasks || []).filter(t => t.stage?.slug === STAGE_FLOW[pi].slug);
                if (prevTasks.length > 0 && !prevTasks.every(t => t.status === 'done')) { prevAllDone = false; break; }
              }
            }
            const isLocked = isFuture && !prevAllDone;
            const wlForStage = (project.workflowLines || []).filter(l => l.stage_slug === sf.slug);

            return (
              <div key={sf.slug}>
                <h4 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${
                  isCurrent ? 'text-blue-600' : allDone ? 'text-emerald-600' : isFuture ? 'text-gray-400' : 'text-gray-700'
                }`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    isCurrent ? 'bg-blue-600 animate-pulse' : allDone ? 'bg-emerald-500' : isFuture ? 'bg-gray-300' : 'bg-gray-400'
                  }`} />
                  {sf.label}
                  <span className="text-xs text-gray-400 font-normal">{done}/{stageTasks.length}</span>
                  {allDone && stageTasks.length > 0 && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ Hoàn thành</span>}
                  {isLocked && <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">🔒 Chờ quy trình trước</span>}
                  {stageTasks.length === 0 && !isLocked && (isCurrent || isPast) && (
                    <button onClick={async () => {
                      if (!confirm(`Tạo nhiệm vụ mẫu cho "${sf.label}"?`)) return;
                      try {
                        const { data } = await api.post(`/projects/${id}/generate-tasks`, { stage_slug: sf.slug });
                        alert(`✅ Đã tạo ${data.count} nhiệm vụ cho "${data.stage}"`);
                        load();
                      } catch (e) { alert(e.response?.data?.error || 'Lỗi tạo nhiệm vụ'); }
                    }} className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full hover:bg-blue-100 cursor-pointer font-normal">
                      + Tạo dự án mẫu
                    </button>
                  )}
                </h4>
                {wlForStage.length > 1 && stageTasks.length > 0 && (
                  <div className="ml-3 space-y-3">
                    {wlForStage.map(line => {
                      const lineTasks = stageTasks.filter(t => t.workflow_line_id ? t.workflow_line_id === line.id : false);
                      if (!lineTasks.length) return null;
                      return (
                        <div key={line.id}>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: line.color || '#6b7280' }} />
                            <span className="text-xs font-medium text-gray-600">{line.label}</span>
                            {line.assignee && <span className="text-[10px] text-gray-400">{line.assignee.full_name}</span>}
                          </div>
                          <div className="space-y-1">
                            {lineTasks.map(t => (
                              <TaskRow key={t.id} task={t} isLocked={isLocked} onSelect={setSelectedTask} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {stageTasks.filter(t => !t.workflow_line_id).length > 0 && (
                      <div className="space-y-1">
                        {stageTasks.filter(t => !t.workflow_line_id).map(t => (
                          <TaskRow key={t.id} task={t} isLocked={isLocked} onSelect={setSelectedTask} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {(wlForStage.length <= 1 || !stageTasks.length) && (
                  isLocked ? (
                    <div className="bg-gray-50 rounded-lg p-4 text-center text-xs text-gray-400 border border-dashed">
                      🔒 Hoàn thành tất cả nhiệm vụ ở quy trình trước để mở khóa
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {stageTasks.map(t => (
                        <TaskRow key={t.id} task={t} isLocked={false} onSelect={setSelectedTask} />
                      ))}
                      {!stageTasks.length && (
                        <div className="text-xs text-gray-300 py-2 text-center">—</div>
                      )}
                    </div>
                  )
                )}
              </div>
            );
          })}
          </div>
          )}
          {totalTasks === 0 && <div className="text-center py-10 text-gray-400"><CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">Chưa có công việc</p></div>}
        </div>
      )}

      {/* ─── Approvals (Duyệt) Tab ─── */}
      {activeTab === 'flow' && (
        <ProjectFlowTab projectId={id} />
      )}

      {activeTab === 'approvals' && (
        <ProjectApprovalsTab projectId={id} project={project} onUpdated={load} autoShowRequest={showApprovalRequest} onRequestShown={() => setShowApprovalRequest(false)} />
      )}

      {/* ─── Documents (Tài liệu) Tab ─── */}
      {activeTab === 'documents' && (
        <ProjectDocumentsTab projectId={id} project={project} />
      )}

      {/* ─── Chat (Trao đổi) Tab ─── */}
      {activeTab === 'chat' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex gap-2">
              <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addComment()}
                placeholder="Nhập nội dung trao đổi..." className="flex-1 h-10 px-4 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <FileUploadButton compact onFilesUploaded={(f) => setCommentFiles(prev => [...prev, ...f])} />
              <button onClick={addComment} className="h-10 px-4 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 cursor-pointer"><Send className="h-4 w-4" /></button>
            </div>
            <FilePreview files={commentFiles} onRemove={(i) => setCommentFiles(f => f.filter((_, j) => j !== i))} small />
          </div>
          {project.comments?.map(c => {
            const atts = c.attachments || [];
            const images = atts.filter(f => f.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(f.file_url || f.file_name || ''));
            const otherFiles = atts.filter(f => !images.includes(f));
            return (
              <div key={c.id} className="flex gap-3">
                <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: avatarColor(c.user?.full_name) }}>{getInitials(c.user?.full_name)}</div>
                <div className="flex-1 bg-white rounded-xl border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{c.user?.full_name}</span>
                    <span className="text-xs text-gray-400">{formatDateTime(c.created_at)}</span>
                  </div>
                  {c.content && <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>}
                  {/* Inline images */}
                  {images.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {images.map((img, ii) => (
                        <a key={ii} href={img.file_url} target="_blank" rel="noopener noreferrer" className="block">
                          <img src={img.file_url} alt={img.file_name || 'image'} className="max-h-48 max-w-xs rounded-lg border object-cover hover:opacity-80 transition-opacity" />
                        </a>
                      ))}
                    </div>
                  )}
                  {/* Other files */}
                  {otherFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {otherFiles.map((f, fi) => (
                        <a key={fi} href={f.file_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 hover:bg-gray-100 transition-colors">
                          <Paperclip className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          <span className="text-xs text-blue-600 truncate flex-1">{f.file_name || 'file'}</span>
                          {f.file_size && <span className="text-[10px] text-gray-400 shrink-0">{(f.file_size / 1024).toFixed(0)} KB</span>}
                        </a>
                      ))}
                    </div>
                  )}
                  {/* Legacy: FileList fallback */}
                  {!atts.length && <FileList files={[]} />}
                </div>
              </div>
            );
          })}
          {!project.comments?.length && <p className="text-sm text-gray-400 text-center py-6">Chưa có trao đổi</p>}
        </div>
      )}

      {/* ─── History Tab ─── */}
      {activeTab === 'history' && (
        <div className="space-y-2">
          {/* Stage transitions */}
          {project.transitions?.map(t => (
            <div key={t.id} className="flex items-start gap-3 bg-blue-50 rounded-lg p-3 border border-blue-100">
              <ArrowRightCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">
                  {t.from_stage?.name || '—'} → <strong>{t.to_stage?.name}</strong>
                </p>
                {t.notes && <p className="text-xs text-blue-700 mt-1">{t.notes}</p>}
                {t.attachments?.length > 0 && <FileList files={t.attachments} />}
                <p className="text-[10px] text-blue-400 mt-1">{t.user?.full_name} · {formatDateTime(t.created_at)}</p>
              </div>
            </div>
          ))}
          {project.activities?.map(a => (
            <div key={a.id} className="flex items-center gap-3 text-sm py-2 border-b border-gray-50">
              <Clock className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="flex-1 text-gray-700">{a.description}</span>
              <span className="text-xs text-gray-400 shrink-0">{a.user?.full_name} · {formatDateTime(a.created_at)}</span>
            </div>
          ))}
          {!project.activities?.length && !project.transitions?.length && <p className="text-sm text-gray-400 text-center py-6">Chưa có lịch sử</p>}
        </div>
      )}

      {/* Modals */}
      <TaskDetailModal taskId={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)} onUpdated={load} />
      <TaskCreateModal open={showCreateTask} onClose={() => setShowCreateTask(false)} onCreated={load} projectId={id} stageId={project.current_stage?.id} project={project} />
      <AdvanceStageModal open={showAdvance} onClose={() => setShowAdvance(false)} project={project} nextStage={nextStage} onAdvanced={load} />
    </div>
  );
}

// ═══ Task Row (reusable) ═══
// ═══ Workflow Line Row (view + edit mode) ═══
function WorkflowLineRow({ line, editing, users, onUpdate, onDelete }) {
  const [editLabel, setEditLabel] = useState(false);
  const [label, setLabel] = useState(line.label);

  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-2 group">
      <div className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
        style={{ backgroundColor: line.assignee ? avatarColor(line.assignee.full_name) : '#d1d5db' }}>
        {line.assignee ? getInitials(line.assignee.full_name) : '?'}
      </div>
      <div className="flex-1 min-w-0">
        {editLabel ? (
          <div className="flex items-center gap-1">
            <input value={label} onChange={e => setLabel(e.target.value)}
              className="h-6 px-1.5 border rounded text-xs bg-white w-full" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') { onUpdate(line.id, { label }); setEditLabel(false); } }}
              onBlur={() => { onUpdate(line.id, { label }); setEditLabel(false); }} />
          </div>
        ) : (
          <p className="text-xs font-medium text-gray-900 cursor-pointer" onClick={() => editing && setEditLabel(true)}>
            {line.label} {editing && <Edit className="h-2.5 w-2.5 inline text-gray-300 ml-0.5" />}
          </p>
        )}
        {editing ? (
          <UserSelect value={line.assignee_id || ''} onChange={v => onUpdate(line.id, { assignee_id: v || null })}
            users={users} placeholder="— Chọn NV —" className="w-full max-w-[200px] mt-0.5" size="sm" />
        ) : (
          <p className="text-[10px] text-gray-500">{line.assignee?.full_name || 'Chưa phân công'}</p>
        )}
      </div>
      {editing && (
        <button onClick={() => onDelete(line.id)}
          className="text-gray-300 hover:text-red-500 cursor-pointer shrink-0 opacity-0 group-hover:opacity-100">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function TaskRow({ task: t, isLocked, onSelect, companyUnitId, onReload }) {
  const [showChecklist, setShowChecklist] = useState(false);
  const [localTask, setLocalTask] = useState(t);
  const checklists = localTask.checklists || [];
  const checkDone = checklists.filter(c => c.is_completed).length;

  // Sync when prop changes
  useEffect(() => { setLocalTask(t); }, [t]);

  const handleAssigneeChange = async (newAssigneeId, userObj) => {
    if (newAssigneeId === (localTask.assignee_id || localTask.assignee?.id)) return;
    try {
      setLocalTask(prev => ({ ...prev, assignee_id: newAssigneeId, assignee: userObj || null }));
      await api.put(`/tasks/${localTask.id}`, { assignee_id: newAssigneeId || null });
      onReload?.();
    } catch { setLocalTask(t); }
  };

  return (
    <div className={`bg-white rounded-lg border ${isLocked ? 'opacity-50' : 'hover:shadow-sm hover:border-gray-300'}`}>
      {/* Main row */}
      <div onClick={() => !isLocked && onSelect(localTask.id)}
        className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0 ${TASK_COLORS[localTask.status] || 'bg-gray-400'}`} />
        <span className="flex-1 text-xs sm:text-sm font-medium text-gray-800 truncate">{localTask.title}</span>

        {/* Assignee - EmployeePicker */}
        {!isLocked && companyUnitId ? (
          <div className="shrink-0 w-36" onClick={e => e.stopPropagation()}>
            <EmployeePicker
              companyUnitId={companyUnitId}
              value={localTask.assignee_id || localTask.assignee?.id || ''}
              onChange={handleAssigneeChange}
              placeholder="+ Gán"
              size="sm"
            />
          </div>
        ) : localTask.assignee ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="h-5 w-5 sm:h-6 sm:w-6 rounded-full flex items-center justify-center text-white text-[8px] sm:text-[9px] font-bold"
              style={{ backgroundColor: avatarColor(localTask.assignee.full_name) }}>
              {getInitials(localTask.assignee.full_name)}
            </div>
            <span className="text-xs text-gray-600 hidden md:inline truncate max-w-[100px]">{localTask.assignee.full_name}</span>
          </div>
        ) : null}

        <span className={`text-[10px] px-1.5 py-0.5 rounded-full hidden sm:inline ${PRIORITY_COLORS[localTask.priority] || ''}`}>{PRIORITY_LABELS[localTask.priority]}</span>
        {localTask.due_date && <span className={`text-[10px] hidden sm:inline ${new Date(localTask.due_date) < new Date() && localTask.status !== 'done' ? 'text-red-500' : 'text-gray-400'}`}>{formatDate(localTask.due_date)}</span>}
        <span className="text-[10px] text-gray-400">{TASK_STATUS[localTask.status]}</span>

        {/* Checklist toggle */}
        {checklists.length > 0 && (
          <button onClick={e => { e.stopPropagation(); setShowChecklist(v => !v); }}
            className="flex items-center gap-1 text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded hover:bg-purple-100 shrink-0">
            {showChecklist ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {checkDone}/{checklists.length}
          </button>
        )}
      </div>

      {/* Checklists */}
      {showChecklist && checklists.length > 0 && (
        <div className="border-t px-3 pb-2 pt-2 space-y-2 bg-purple-50">
          {checklists.sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).map(c => (
            <ChecklistItem key={c.id} item={c} companyUnitId={companyUnitId}
              onReload={onReload} taskId={localTask.id} />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══ Checklist Item ═══
function ChecklistItem({ item: c, companyUnitId, onReload, taskId }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');

  const parseNotes = (raw) => {
    if (!raw) return { text: '', assignee_id: null };
    if (typeof raw === 'object') return { text: raw.text || '', assignee_id: raw.assignee_id || null };
    try { 
      const p = JSON.parse(raw); 
      return { text: p.text || raw, assignee_id: p.assignee_id || null }; 
    } catch { 
      return { text: raw, assignee_id: null }; 
    }
  };

  const { text: notesDisplay, assignee_id: notesAssigneeId } = parseNotes(c.notes);
  // Ưu tiên dùng assignee_id từ cột riêng (sau migration), fallback là từ notes JSON (legacy)
  const checklistAssigneeId = c.assignee_id || notesAssigneeId;
  const assignedUserId = c.assigned_user_id || checklistAssigneeId;
  const attachments = c.attachments || [];

  const saveNotes = async () => {
    setEditingNotes(false);
    try {
      // Chỉ lưu text vào notes, không lưu assignee_id
      await api.put(`/tasks/checklists/${c.id}`, { notes: notesText.trim() || null });
      onReload?.();
    } catch { }
  };

  const handleChecklistAssignee = async (newUserId) => {
    try {
      // Lưu assignee_id vào cột riêng, không vào notes
      await api.put(`/tasks/checklists/${c.id}`, { 
        assignee_id: newUserId || null,
        assigned_user_id: newUserId || null 
      });
      onReload?.();
    } catch { }
  };

  return (
    <div className="bg-white rounded-lg border border-purple-100 p-2 space-y-1">
      {/* Title row */}
      <div className="flex items-start gap-2">
        <div className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center mt-0.5 ${c.is_completed ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'}`}>
          {c.is_completed && <span className="text-white text-[8px]">✓</span>}
        </div>
        <span className={`text-xs flex-1 ${c.is_completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{c.title}</span>

        {/* Checklist assignee - EmployeePicker */}
        {companyUnitId && (
          <div className="shrink-0 w-32" onClick={e => e.stopPropagation()}>
            <EmployeePicker
              companyUnitId={companyUnitId}
              value={assignedUserId || ''}
              onChange={handleChecklistAssignee}
              placeholder="+ Gán"
              size="sm"
            />
          </div>
        )}

        {/* Edit notes button */}
        <button onClick={() => { setNotesText(notesDisplay); setEditingNotes(true); }}
          className="text-[9px] text-gray-300 hover:text-blue-500 cursor-pointer shrink-0" title="Sửa ghi chú">
          ✎
        </button>
      </div>

      {/* Notes */}
      {editingNotes ? (
        <div className="ml-5 space-y-1">
          <textarea value={notesText} onChange={e => setNotesText(e.target.value)}
            className="w-full text-xs border border-blue-300 rounded p-1.5 resize-none outline-none focus:ring-1 focus:ring-blue-400 min-h-[60px]"
            placeholder="Ghi chú..." autoFocus />
          <div className="flex gap-1.5">
            <button onClick={saveNotes} className="h-6 px-2 bg-blue-600 text-white text-[10px] rounded cursor-pointer hover:bg-blue-700">Lưu</button>
            <button onClick={() => setEditingNotes(false)} className="h-6 px-2 bg-gray-100 text-gray-600 text-[10px] rounded cursor-pointer hover:bg-gray-200">Hủy</button>
          </div>
        </div>
      ) : notesDisplay ? (
        <p className="ml-5 text-[10px] text-gray-500 whitespace-pre-wrap">{notesDisplay}</p>
      ) : null}

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="ml-5 space-y-1 mt-1">
          {attachments.map((f, fi) => (
            <a key={fi} href={f.file_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-gray-50 rounded px-2 py-1 hover:bg-gray-100 transition-colors">
              <Paperclip className="h-3 w-3 text-gray-400 shrink-0" />
              <span className="text-[10px] text-blue-600 truncate flex-1">{f.file_name || 'file'}</span>
              {f.file_size && <span className="text-[9px] text-gray-400">{(f.file_size / 1024).toFixed(0)}KB</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══ Advance Stage Modal ═══
function AdvanceStageModal({ open, onClose, project, nextStage, onAdvanced }) {
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open) { setNotes(''); setFiles([]); } }, [open]);

  const submit = async () => {
    if (!nextStage) return;
    setLoading(true);
    try {
      await api.put(`/projects/${project.id}/stage`, {
        stage_slug: nextStage.slug,
        new_status: nextStage.status,
        notes: notes || null,
        attachments: files,
      });
      onAdvanced?.(); onClose();
    } catch { }
    setLoading(false);
  };

  if (!open || !nextStage) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Chuyển sang giai đoạn: ${nextStage.label}`} size="md">
      <div className="space-y-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-sm text-emerald-800">
            ✅ Tất cả công việc giai đoạn <strong>"{STAGE_FLOW.find(s => s.status === project.status)?.label}"</strong> đã hoàn thành!
          </p>
          <p className="text-xs text-emerald-600 mt-1">
            Hệ thống sẽ tự động tạo nhiệm vụ cho giai đoạn <strong>"{nextStage.label}"</strong>
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Ghi chú chuyển giao</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input min-h-[80px]"
            placeholder="Ghi chú khi chuyển giao sang giai đoạn mới..." />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Đính kèm file</label>
          <FileUploadButton onFilesUploaded={(f) => setFiles(prev => [...prev, ...f])} />
          <FilePreview files={files} onRemove={(i) => setFiles(f => f.filter((_, j) => j !== i))} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-10 px-4 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button>
          <button onClick={submit} disabled={loading}
            className="h-10 px-6 bg-emerald-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50">
            {loading ? 'Đang chuyển...' : <><ArrowRightCircle className="h-4 w-4" /> Chuyển giai đoạn</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
