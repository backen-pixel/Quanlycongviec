import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskCreateModal from '../components/TaskCreateModal';
import {
  ArrowLeft, Plus, Send, Trash2, ChevronRight, Phone, MapPin,
  Calendar, User, Clock, CheckSquare, MessageSquare
} from 'lucide-react';
import {
  STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS,
  TASK_STATUS, TASK_COLORS, formatVND, formatDate, formatDateTime,
  getInitials, avatarColor
} from '../lib/utils';

const STAGE_FLOW = [
  { slug: 'consulting', status: 'consulting', label: 'Tư vấn' },
  { slug: 'design', status: 'designing', label: 'Thiết kế' },
  { slug: 'quotation', status: 'quoting', label: 'Báo giá' },
  { slug: 'contract', status: 'contract_signed', label: 'Hợp đồng' },
  { slug: 'production', status: 'producing', label: 'Sản xuất' },
  { slug: 'shipping', status: 'shipping', label: 'Vận chuyển' },
  { slug: 'installation', status: 'installing', label: 'Lắp đặt' },
  { slug: 'customer-care', status: 'warranty', label: 'CSKH' },
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

  const load = () => {
    setLoading(true);
    api.get(`/projects/${id}`).then(r => setProject(r.data.project)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const advanceStage = async (stageSlug, newStatus) => {
    try {
      await api.put(`/projects/${id}/stage`, { stage_slug: stageSlug, new_status: newStatus });
      load();
    } catch { }
  };

  const deleteProject = async () => {
    if (!confirm('Xóa dự án này? Tất cả tasks sẽ bị xóa theo.')) return;
    await api.delete(`/projects/${id}`);
    navigate('/projects');
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    await api.post(`/projects/${id}/comments`, { content: newComment });
    setNewComment('');
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
      </div>
    );
  }

  if (!project) return <div className="text-center py-16 text-gray-400">Dự án không tồn tại</div>;

  const currentStageIdx = STAGE_FLOW.findIndex(s => s.status === project.status);
  const nextStage = currentStageIdx >= 0 && currentStageIdx < STAGE_FLOW.length - 1 ? STAGE_FLOW[currentStageIdx + 1] : null;

  // Group tasks by stage
  const tasksByStage = {};
  project.tasks?.forEach(t => {
    const key = t.stage?.name || 'Chung';
    if (!tasksByStage[key]) tasksByStage[key] = [];
    tasksByStage[key].push(t);
  });

  const totalTasks = project.tasks?.length || 0;
  const doneTasks = project.tasks?.filter(t => t.status === 'done').length || 0;

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate('/projects')} className="mt-1 w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 cursor-pointer">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-blue-600">{project.code}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[project.status] || ''}`}>
                {STATUS_LABELS[project.status]}
              </span>
              {project.priority && (
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[project.priority] || ''}`}>
                  {PRIORITY_LABELS[project.priority]}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {nextStage && (
            <button
              onClick={() => advanceStage(nextStage.slug, nextStage.status)}
              className="h-9 px-4 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 cursor-pointer flex items-center gap-1"
            >
              Chuyển sang {nextStage.label} <ChevronRight className="h-4 w-4" />
            </button>
          )}
          <button onClick={deleteProject} className="h-9 px-3 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 cursor-pointer">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stage pipeline */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center gap-1 overflow-x-auto">
          {STAGE_FLOW.map((s, i) => {
            const isCurrent = s.status === project.status;
            const isPast = i < currentStageIdx;
            return (
              <div key={s.slug} className="flex items-center gap-1">
                <button
                  onClick={() => advanceStage(s.slug, s.status)}
                  className={`h-8 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                    isCurrent ? 'bg-blue-600 text-white' : isPast ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {s.label}
                </button>
                {i < STAGE_FLOW.length - 1 && <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Customer */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Khách hàng</h3>
          {project.customers && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{project.customers.full_name}</p>
              {project.customers.phone && <p className="text-xs text-gray-500 flex items-center gap-1"><Phone className="h-3 w-3" />{project.customers.phone}</p>}
              {project.customers.email && <p className="text-xs text-gray-500">{project.customers.email}</p>}
              {project.customers.city && <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="h-3 w-3" />{project.customers.city}</p>}
            </div>
          )}
        </div>

        {/* Value */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Giá trị</h3>
          <p className="text-2xl font-bold text-gray-900">{formatVND(project.estimated_value)}</p>
          {project.final_value && <p className="text-sm text-gray-500 mt-1">Thực tế: {formatVND(project.final_value)}</p>}
          {project.kitchen_type && <p className="text-xs text-gray-500 mt-2">Loại: {project.kitchen_type}</p>}
          {project.material && <p className="text-xs text-gray-500">Vật liệu: {project.material}</p>}
        </div>

        {/* Progress */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tiến độ</h3>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-bold">{totalTasks > 0 ? Math.round((doneTasks/totalTasks)*100) : 0}%</span>
            <span className="text-xs text-gray-500">{doneTasks}/{totalTasks} tasks</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${totalTasks > 0 ? (doneTasks/totalTasks)*100 : 0}%` }} />
          </div>
          {project.consult_date && <p className="text-xs text-gray-500 mt-2 flex items-center gap-1"><Calendar className="h-3 w-3" />Bắt đầu: {formatDate(project.consult_date)}</p>}
        </div>
      </div>

      {/* People */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Nhân sự dự án</h3>
        <div className="flex gap-6">
          <PersonBadge label="Sales" user={project.sales_person} />
          <PersonBadge label="Thiết kế" user={project.designer} />
          <PersonBadge label="Quản lý" user={project.project_manager} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { id: 'tasks', label: 'Công việc', icon: CheckSquare, count: totalTasks },
          { id: 'comments', label: 'Bình luận', icon: MessageSquare, count: project.comments?.length },
          { id: 'activity', label: 'Lịch sử', icon: Clock, count: project.activities?.length },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon className="h-4 w-4" />{t.label}
            {t.count > 0 && <span className="text-xs bg-gray-100 px-1.5 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Tasks tab */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowCreateTask(true)}
              className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer">
              <Plus className="h-4 w-4" /> Thêm công việc
            </button>
          </div>

          {Object.entries(tasksByStage).map(([stageName, tasks]) => (
            <div key={stageName}>
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {stageName}
                <span className="text-xs text-gray-400 font-normal">{tasks.length}</span>
              </h4>
              <div className="space-y-1">
                {tasks.map(t => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTask(t.id)}
                    className="flex items-center gap-3 bg-white rounded-lg border p-3 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                  >
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${TASK_COLORS[t.status] || 'bg-gray-400'}`} />
                    <span className="flex-1 text-sm font-medium text-gray-800">{t.title}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${PRIORITY_COLORS[t.priority] || ''}`}>{PRIORITY_LABELS[t.priority]}</span>
                    {t.assignee && (
                      <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                        style={{ backgroundColor: avatarColor(t.assignee.full_name) }}
                        title={t.assignee.full_name}>
                        {getInitials(t.assignee.full_name)}
                      </div>
                    )}
                    {t.due_date && (
                      <span className={`text-[11px] ${new Date(t.due_date) < new Date() && t.status !== 'done' ? 'text-red-500' : 'text-gray-400'}`}>
                        {formatDate(t.due_date)}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400">{TASK_STATUS[t.status]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {totalTasks === 0 && (
            <div className="text-center py-10 text-gray-400">
              <CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Chưa có công việc</p>
            </div>
          )}
        </div>
      )}

      {/* Comments tab */}
      {activeTab === 'comments' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()}
              placeholder="Viết bình luận..." className="flex-1 h-10 px-4 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={addComment} className="h-10 px-4 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 cursor-pointer">
              <Send className="h-4 w-4" />
            </button>
          </div>
          {project.comments?.map(c => (
            <div key={c.id} className="flex gap-3">
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                style={{ backgroundColor: avatarColor(c.user?.full_name) }}>
                {getInitials(c.user?.full_name)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.user?.full_name}</span>
                  <span className="text-xs text-gray-400">{formatDateTime(c.created_at)}</span>
                </div>
                <p className="text-sm text-gray-700 mt-0.5">{c.content}</p>
              </div>
            </div>
          ))}
          {!project.comments?.length && <p className="text-sm text-gray-400 text-center py-6">Chưa có bình luận</p>}
        </div>
      )}

      {/* Activity tab */}
      {activeTab === 'activity' && (
        <div className="space-y-2">
          {project.activities?.map(a => (
            <div key={a.id} className="flex items-center gap-3 text-sm py-2 border-b border-gray-50">
              <Clock className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="flex-1 text-gray-700">{a.description}</span>
              <span className="text-xs text-gray-400 shrink-0">{a.user?.full_name} · {formatDateTime(a.created_at)}</span>
            </div>
          ))}
          {!project.activities?.length && <p className="text-sm text-gray-400 text-center py-6">Chưa có lịch sử</p>}
        </div>
      )}

      {/* Modals */}
      <TaskDetailModal taskId={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)} onUpdated={load} />
      <TaskCreateModal open={showCreateTask} onClose={() => setShowCreateTask(false)} onCreated={load}
        projectId={id} stageId={project.current_stage?.id} />
    </div>
  );
}

function PersonBadge({ label, user }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
        style={{ backgroundColor: user ? avatarColor(user.full_name) : '#9ca3af' }}>
        {user ? getInitials(user.full_name) : '?'}
      </div>
      <div>
        <p className="text-[10px] text-gray-500">{label}</p>
        <p className="text-xs font-medium">{user?.full_name || '—'}</p>
      </div>
    </div>
  );
}
