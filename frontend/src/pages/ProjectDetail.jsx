import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskCreateModal from '../components/TaskCreateModal';
import Modal from '../components/Modal';
import { FileUploadButton, FilePreview, FileList } from '../components/FileUpload';
import {
  ArrowLeft, Plus, Send, Trash2, ChevronRight, Phone, MapPin,
  Calendar, Clock, CheckSquare, MessageSquare, ArrowRightCircle,
  Paperclip, FileText
} from 'lucide-react';
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
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('tasks');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commentFiles, setCommentFiles] = useState([]);
  const [showAdvance, setShowAdvance] = useState(false);

  const load = () => {
    setLoading(true);
    api.get(`/projects/${id}`).then(r => setProject(r.data.project)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const deleteProject = async () => {
    if (!confirm('Xóa dự án này?')) return;
    await api.delete(`/projects/${id}`); navigate('/projects');
  };

  const addComment = async () => {
    if (!newComment.trim() && !commentFiles.length) return;
    await api.post(`/projects/${id}/comments`, { content: newComment, attachments: commentFiles });
    setNewComment(''); setCommentFiles([]); load();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div>;
  if (!project) return <div className="text-center py-16 text-gray-400">Dự án không tồn tại</div>;

  const currentStageIdx = STAGE_FLOW.findIndex(s => s.status === project.status);
  const nextStage = currentStageIdx >= 0 && currentStageIdx < STAGE_FLOW.length - 1 ? STAGE_FLOW[currentStageIdx + 1] : null;
  const canAdvance = project.canAdvance;

  // Group tasks by stage in correct workflow order
  const stageTaskGroups = [];
  const allStages = [...new Set((project.tasks || []).map(t => t.stage_id).filter(Boolean))];

  // Build ordered stage groups from STAGE_FLOW
  STAGE_FLOW.forEach(sf => {
    const stageTasks = (project.tasks || []).filter(t => t.stage?.slug === sf.slug);
    if (stageTasks.length > 0) {
      const allDone = stageTasks.every(t => t.status === 'done');
      const stageIdx = STAGE_FLOW.findIndex(s => s.slug === sf.slug);
      const isCurrent = sf.status === project.status;
      const isPast = stageIdx < currentStageIdx;
      const isFuture = stageIdx > currentStageIdx;
      stageTaskGroups.push({
        slug: sf.slug, label: sf.label, tasks: stageTasks, allDone, isCurrent, isPast, isFuture,
        stageId: stageTasks[0]?.stage?.id,
      });
    }
  });
  // Ungrouped tasks
  const ungrouped = (project.tasks || []).filter(t => !t.stage_id);
  if (ungrouped.length) stageTaskGroups.push({ slug: 'general', label: 'Chung', tasks: ungrouped, allDone: false, isCurrent: false, isPast: false, isFuture: false });

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
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canAdvance && nextStage && (
            <button onClick={() => setShowAdvance(true)}
              className="h-9 px-4 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 cursor-pointer flex items-center gap-1 animate-pulse">
              <ArrowRightCircle className="h-4 w-4" /> Chuyển → {nextStage.label}
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

      {/* Stage pipeline */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center gap-1 overflow-x-auto">
          {STAGE_FLOW.map((s, i) => {
            const isCurrent = s.status === project.status;
            const isPast = i < currentStageIdx;
            const person = project[s.personKey];
            return (
              <div key={s.slug} className="flex items-center gap-1">
                <div className={`h-9 px-3 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5 ${
                  isCurrent ? 'bg-blue-600 text-white' : isPast ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {isPast && <CheckSquare className="h-3 w-3" />}
                  {s.label}
                  {person && <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold ml-0.5"
                    style={{ backgroundColor: avatarColor(person.full_name) }} title={person.full_name}>{getInitials(person.full_name)}</div>}
                </div>
                {i < STAGE_FLOW.length - 1 && <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />}
              </div>
            );
          })}
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

      {/* Quotation files */}
      {project.quotation_files?.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <h3 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> File báo giá</h3>
          <FileList files={project.quotation_files} />
        </div>
      )}

      {/* People — all stages */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Nhân sự dự án</h3>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          {STAGE_FLOW.map(s => {
            const person = project[s.personKey];
            return (
              <div key={s.slug} className="text-center">
                <div className="h-9 w-9 mx-auto rounded-full flex items-center justify-center text-white text-[10px] font-bold mb-1"
                  style={{ backgroundColor: person ? avatarColor(person.full_name) : '#d1d5db' }}>
                  {person ? getInitials(person.full_name) : '?'}
                </div>
                <p className="text-[10px] font-medium text-gray-900 truncate">{person?.full_name || '—'}</p>
                <p className="text-[9px] text-gray-400">{s.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { id: 'tasks', label: 'Công việc', icon: CheckSquare, count: totalTasks },
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
          <div className="flex justify-end">
            <button onClick={() => setShowCreateTask(true)}
              className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
              <Plus className="h-4 w-4" /> Thêm công việc
            </button>
          </div>
          {stageTaskGroups.map((group) => {
            const done = group.tasks.filter(t => t.status === 'done').length;
            // Determine if this group should show tasks
            // Future stages only show if ALL previous stage tasks are done
            let prevAllDone = true;
            if (group.isFuture) {
              for (const prev of stageTaskGroups) {
                if (prev.slug === group.slug) break;
                if (!prev.allDone) { prevAllDone = false; break; }
              }
            }
            const showTasks = !group.isFuture || prevAllDone;

            return (
              <div key={group.slug}>
                <h4 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${
                  group.isCurrent ? 'text-blue-600' : group.allDone ? 'text-emerald-600' : group.isFuture ? 'text-gray-400' : 'text-gray-700'
                }`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    group.isCurrent ? 'bg-blue-600 animate-pulse' : group.allDone ? 'bg-emerald-500' : group.isFuture ? 'bg-gray-300' : 'bg-gray-400'
                  }`} />
                  {group.label}
                  <span className="text-xs text-gray-400 font-normal">{done}/{group.tasks.length}</span>
                  {group.allDone && group.tasks.length > 0 && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ Hoàn thành</span>}
                  {group.isFuture && !prevAllDone && <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">🔒 Chờ quy trình trước</span>}
                </h4>

                {showTasks ? (
                  <div className="space-y-1">
                    {group.tasks.map(t => (
                      <div key={t.id} onClick={() => setSelectedTask(t.id)}
                        className="flex items-center gap-3 bg-white rounded-lg border p-3 hover:shadow-sm hover:border-gray-300 cursor-pointer">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${TASK_COLORS[t.status] || 'bg-gray-400'}`} />
                        <span className="flex-1 text-sm font-medium text-gray-800">{t.title}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${PRIORITY_COLORS[t.priority] || ''}`}>{PRIORITY_LABELS[t.priority]}</span>
                        {t.assignee && <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                          style={{ backgroundColor: avatarColor(t.assignee.full_name) }} title={t.assignee.full_name}>{getInitials(t.assignee.full_name)}</div>}
                        {t.due_date && <span className={`text-[11px] ${new Date(t.due_date) < new Date() && t.status !== 'done' ? 'text-red-500' : 'text-gray-400'}`}>{formatDate(t.due_date)}</span>}
                        <span className="text-[10px] text-gray-400">{TASK_STATUS[t.status]}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4 text-center text-xs text-gray-400 border border-dashed">
                    🔒 Hoàn thành tất cả nhiệm vụ ở quy trình trước để mở khóa
                  </div>
                )}
              </div>
            );
          })}
          {totalTasks === 0 && <div className="text-center py-10 text-gray-400"><CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">Chưa có công việc</p></div>}
        </div>
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
          {project.comments?.map(c => (
            <div key={c.id} className="flex gap-3">
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                style={{ backgroundColor: avatarColor(c.user?.full_name) }}>{getInitials(c.user?.full_name)}</div>
              <div className="flex-1 bg-white rounded-xl border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{c.user?.full_name}</span>
                  <span className="text-xs text-gray-400">{formatDateTime(c.created_at)}</span>
                </div>
                <p className="text-sm text-gray-700">{c.content}</p>
                <FileList files={c.attachments || []} />
              </div>
            </div>
          ))}
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
      <TaskCreateModal open={showCreateTask} onClose={() => setShowCreateTask(false)} onCreated={load} projectId={id} stageId={project.current_stage?.id} />
      <AdvanceStageModal open={showAdvance} onClose={() => setShowAdvance(false)} project={project} nextStage={nextStage} onAdvanced={load} />
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
