import { useState, useEffect } from 'react';
import api from '../lib/api';
import Modal from './Modal';
import {
  Clock, CheckSquare, MessageSquare, Users, Play, Pause, Send, Trash2,
  User, Eye, Plus, Calendar, AlertTriangle
} from 'lucide-react';
import { TASK_STATUS, PRIORITY_LABELS, PRIORITY_COLORS, formatDate, formatDateTime, getInitials, avatarColor } from '../lib/utils';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Đang chờ', color: 'bg-gray-400' },
  { value: 'in_progress', label: 'Đang làm', color: 'bg-blue-500' },
  { value: 'review', label: 'Chờ kiểm tra', color: 'bg-amber-500' },
  { value: 'done', label: 'Hoàn thành', color: 'bg-emerald-500' },
  { value: 'deferred', label: 'Tạm hoãn', color: 'bg-purple-400' },
  { value: 'blocked', label: 'Bị chặn', color: 'bg-red-500' },
];

export default function TaskDetailModal({ taskId, open, onClose, onUpdated }) {
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [newCheckItem, setNewCheckItem] = useState('');
  const [activeTab, setActiveTab] = useState('detail');

  useEffect(() => {
    if (open && taskId) loadTask();
    else { setTask(null); setActiveTab('detail'); }
  }, [open, taskId]);

  const loadTask = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/tasks/${taskId}`);
      setTask(data.task);
    } catch { }
    setLoading(false);
  };

  const updateStatus = async (status) => {
    await api.patch(`/tasks/${taskId}/status`, { status });
    loadTask();
    onUpdated?.();
  };

  const updateField = async (field, value) => {
    await api.put(`/tasks/${taskId}`, { [field]: value });
    loadTask();
    onUpdated?.();
  };

  // Checklist
  const addCheckItem = async () => {
    if (!newCheckItem.trim()) return;
    await api.post(`/tasks/${taskId}/checklists`, { title: newCheckItem });
    setNewCheckItem('');
    loadTask();
  };

  const toggleCheckItem = async (clId, isCompleted) => {
    await api.patch(`/tasks/${taskId}/checklists/${clId}`, { is_completed: !isCompleted });
    loadTask();
  };

  const deleteCheckItem = async (clId) => {
    await api.delete(`/tasks/${taskId}/checklists/${clId}`);
    loadTask();
  };

  // Comments
  const addComment = async () => {
    if (!newComment.trim()) return;
    await api.post(`/tasks/${taskId}/comments`, { content: newComment });
    setNewComment('');
    loadTask();
  };

  // Time tracking
  const addTimeLog = async () => {
    const minutes = prompt('Số phút đã làm:');
    if (!minutes || isNaN(+minutes)) return;
    const desc = prompt('Mô tả (tùy chọn):') || '';
    await api.post(`/tasks/${taskId}/time-logs`, {
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      duration_minutes: +minutes,
      description: desc,
    });
    loadTask();
  };

  if (!open) return null;

  const tabs = [
    { id: 'detail', label: 'Chi tiết', icon: CheckSquare },
    { id: 'checklist', label: 'Checklist', icon: CheckSquare, count: task?.checklists?.length },
    { id: 'comments', label: 'Bình luận', icon: MessageSquare, count: task?.comments?.length },
    { id: 'time', label: 'Thời gian', icon: Clock, count: task?.timeLogs?.length },
    { id: 'people', label: 'Thành viên', icon: Users },
  ];

  const checkDone = task?.checklists?.filter(c => c.is_completed).length || 0;
  const checkTotal = task?.checklists?.length || 0;
  const totalMinutes = task?.timeLogs?.reduce((s, l) => s + (l.duration_minutes || 0), 0) || 0;
  const isOverdue = task?.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';

  return (
    <Modal open={open} onClose={onClose} title="" size="lg">
      {loading || !task ? (
        <div className="flex items-center justify-center h-40">
          <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Task header */}
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {task.projects && <span className="text-xs text-gray-400 font-medium">{task.projects.code}</span>}
              {isOverdue && (
                <span className="text-xs text-red-600 flex items-center gap-1 font-medium">
                  <AlertTriangle className="h-3 w-3" /> Quá hạn
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-3">{task.title}</h1>

            {/* Status buttons */}
            <div className="flex gap-2 flex-wrap">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.value}
                  onClick={() => updateStatus(s.value)}
                  className={`h-8 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                    task.status === s.value
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${s.color}`} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoBox label="Người giao" value={task.creator?.full_name} icon={User} />
            <InfoBox label="Người thực hiện" value={task.assignee?.full_name} icon={User} />
            <InfoBox label="Ưu tiên" value={PRIORITY_LABELS[task.priority]} badge={PRIORITY_COLORS[task.priority]} />
            <InfoBox label="Hạn chót" value={formatDate(task.due_date)} icon={Calendar} danger={isOverdue} />
          </div>

          {task.description && (
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700">{task.description}</div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  activeTab === t.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
                {t.count > 0 && <span className="text-xs bg-gray-100 px-1.5 rounded-full">{t.count}</span>}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'detail' && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-gray-500">Dự án:</span> <strong>{task.projects?.name}</strong></div>
                <div><span className="text-gray-500">Giai đoạn:</span> <strong>{task.stage?.name || '—'}</strong></div>
                <div><span className="text-gray-500">Ngày bắt đầu:</span> {formatDate(task.start_date) || '—'}</div>
                <div><span className="text-gray-500">Ngày tạo:</span> {formatDate(task.created_at)}</div>
                <div><span className="text-gray-500">Giờ ước tính:</span> {task.estimated_hours ? `${task.estimated_hours}h` : '—'}</div>
                <div><span className="text-gray-500">Giờ thực tế:</span> {task.actual_hours ? `${task.actual_hours}h` : '—'}</div>
              </div>
              {checkTotal > 0 && (
                <div>
                  <span className="text-gray-500">Checklist:</span>{' '}
                  <strong>{checkDone}/{checkTotal}</strong>
                  <div className="w-full h-2 bg-gray-100 rounded-full mt-1">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(checkDone/checkTotal)*100}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'checklist' && (
            <div className="space-y-2">
              {checkTotal > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(checkDone/checkTotal)*100}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 font-medium">{checkDone}/{checkTotal}</span>
                </div>
              )}
              {task.checklists?.map(cl => (
                <div key={cl.id} className="flex items-center gap-2 group">
                  <button
                    onClick={() => toggleCheckItem(cl.id, cl.is_completed)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                      cl.is_completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {cl.is_completed && <CheckSquare className="h-3 w-3" />}
                  </button>
                  <span className={`flex-1 text-sm ${cl.is_completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{cl.title}</span>
                  <button onClick={() => deleteCheckItem(cl.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 mt-3">
                <input
                  value={newCheckItem}
                  onChange={e => setNewCheckItem(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCheckItem()}
                  placeholder="Thêm mục checklist..."
                  className="flex-1 h-9 px-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={addCheckItem} className="h-9 px-3 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 cursor-pointer">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addComment()}
                  placeholder="Viết bình luận..."
                  className="flex-1 h-9 px-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={addComment} className="h-9 px-3 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 cursor-pointer">
                  <Send className="h-4 w-4" />
                </button>
              </div>
              {task.comments?.map(c => (
                <div key={c.id} className="flex gap-3">
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: avatarColor(c.user?.full_name) }}
                  >
                    {getInitials(c.user?.full_name)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{c.user?.full_name}</span>
                      <span className="text-xs text-gray-400">{formatDateTime(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5">{c.content}</p>
                  </div>
                </div>
              ))}
              {!task.comments?.length && <p className="text-sm text-gray-400 text-center py-4">Chưa có bình luận</p>}
            </div>
          )}

          {activeTab === 'time' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Tổng: <strong>{Math.floor(totalMinutes/60)}h {totalMinutes%60}m</strong></span>
                <button onClick={addTimeLog} className="h-8 px-3 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 cursor-pointer flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" /> Thêm
                </button>
              </div>
              {task.timeLogs?.map(tl => (
                <div key={tl.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <div className="flex-1">
                    <span className="text-sm font-medium">{tl.duration_minutes} phút</span>
                    {tl.description && <span className="text-xs text-gray-500 ml-2">— {tl.description}</span>}
                  </div>
                  <span className="text-xs text-gray-400">{tl.user?.full_name} · {formatDate(tl.started_at)}</span>
                </div>
              ))}
              {!task.timeLogs?.length && <p className="text-sm text-gray-400 text-center py-4">Chưa có bản ghi thời gian</p>}
            </div>
          )}

          {activeTab === 'people' && (
            <div className="space-y-4">
              {/* Roles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <RoleCard icon={User} label="Người giao việc" user={task.creator} color="indigo" />
                <RoleCard icon={User} label="Người thực hiện" user={task.assignee} color="blue" />
              </div>
              {/* Participants */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Users className="h-4 w-4" /> Người hỗ trợ
                </h4>
                <div className="space-y-1">
                  {task.participants?.filter(p => p.role === 'participant').map(p => (
                    <PersonRow key={p.id} user={p.user} />
                  ))}
                  {!task.participants?.filter(p => p.role === 'participant').length && (
                    <p className="text-xs text-gray-400">Chưa có</p>
                  )}
                </div>
              </div>
              {/* Observers */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Eye className="h-4 w-4" /> Người quan sát
                </h4>
                <div className="space-y-1">
                  {task.participants?.filter(p => p.role === 'observer').map(p => (
                    <PersonRow key={p.id} user={p.user} />
                  ))}
                  {!task.participants?.filter(p => p.role === 'observer').length && (
                    <p className="text-xs text-gray-400">Chưa có</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function InfoBox({ label, value, icon: Icon, badge, danger }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-[11px] text-gray-500 mb-1">{label}</p>
      <div className={`flex items-center gap-1.5 ${danger ? 'text-red-600' : 'text-gray-900'}`}>
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {badge ? (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge}`}>{value || '—'}</span>
        ) : (
          <span className="text-sm font-medium">{value || '—'}</span>
        )}
      </div>
    </div>
  );
}

function RoleCard({ icon: Icon, label, user, color }) {
  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold`}
        style={{ backgroundColor: user ? avatarColor(user.full_name) : '#9ca3af' }}
      >
        {user ? getInitials(user.full_name) : '?'}
      </div>
      <div>
        <p className="text-[11px] text-gray-500">{label}</p>
        <p className="text-sm font-medium">{user?.full_name || '—'}</p>
      </div>
    </div>
  );
}

function PersonRow({ user }) {
  if (!user) return null;
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
        style={{ backgroundColor: avatarColor(user.full_name) }}
      >
        {getInitials(user.full_name)}
      </div>
      <span className="text-sm text-gray-700">{user.full_name}</span>
    </div>
  );
}
