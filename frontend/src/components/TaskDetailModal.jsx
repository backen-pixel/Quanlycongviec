import { useState, useEffect } from 'react';
import api from '../lib/api';
import Modal from './Modal';
import { FileUploadButton, FilePreview, FileList } from './FileUpload';
import ParticipantManager from './ParticipantManager';
import {
  Clock, CheckSquare, MessageSquare, Users, Send, Trash2, Edit,
  User, Eye, EyeOff, Plus, Calendar, AlertTriangle, Paperclip, Save, X, ChevronDown
} from 'lucide-react';
import { TASK_STATUS, PRIORITY_LABELS, PRIORITY_COLORS, formatDate, formatDateTime, getInitials, avatarColor } from '../lib/utils';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Chờ', color: 'bg-gray-400' },
  { value: 'in_progress', label: 'Đang làm', color: 'bg-blue-500' },
  { value: 'review', label: 'Kiểm tra', color: 'bg-amber-500' },
  { value: 'done', label: 'Xong', color: 'bg-emerald-500' },
  { value: 'deferred', label: 'Hoãn', color: 'bg-purple-400' },
  { value: 'blocked', label: 'Chặn', color: 'bg-red-500' },
];

export default function TaskDetailModal({ taskId, open, onClose, onUpdated }) {
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [commentFiles, setCommentFiles] = useState([]);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [checkFiles, setCheckFiles] = useState([]);
  const [activeTab, setActiveTab] = useState('detail');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    if (open && taskId) loadTask();
    else { setTask(null); setActiveTab('detail'); setEditing(false); }
  }, [open, taskId]);

  const loadTask = async () => {
    setLoading(true);
    try { const { data } = await api.get(`/tasks/${taskId}`); setTask(data.task); } catch { }
    setLoading(false);
  };

  const updateStatus = async (status) => {
    await api.patch(`/tasks/${taskId}/status`, { status }); loadTask(); onUpdated?.();
  };

  const deleteTask = async () => {
    if (!confirm('Xóa công việc này? Hành động không thể hoàn tác.')) return;
    try { await api.delete(`/tasks/${taskId}`); onUpdated?.(); onClose(); } catch {}
  };

  const saveEdit = async () => {
    try {
      await api.put(`/tasks/${taskId}`, editForm);
      setEditing(false); loadTask(); onUpdated?.();
    } catch {}
  };

  const startEdit = () => {
    setEditForm({ title: task.title, description: task.description || '', priority: task.priority, due_date: task.due_date?.slice(0,10) || '' });
    setEditing(true);
  };

  // Checklist
  const addCheckItem = async () => {
    if (!newCheckItem.trim()) return;
    await api.post(`/tasks/${taskId}/checklists`, { title: newCheckItem, attachments: checkFiles });
    setNewCheckItem(''); setCheckFiles([]); loadTask();
  };
  const toggleCheckItem = async (clId, isCompleted) => {
    await api.patch(`/tasks/${taskId}/checklists/${clId}`, { is_completed: !isCompleted }); loadTask();
  };
  const deleteCheckItem = async (clId) => {
    await api.delete(`/tasks/${taskId}/checklists/${clId}`); loadTask();
  };
  const saveChecklistNote = async (clId, notes, attachments) => {
    await api.patch(`/tasks/${taskId}/checklists/${clId}`, { notes, attachments });
    loadTask();
  };

  // Comments
  const addComment = async () => {
    if (!newComment.trim() && !commentFiles.length) return;
    await api.post(`/tasks/${taskId}/comments`, { content: newComment, attachments: commentFiles });
    setNewComment(''); setCommentFiles([]); loadTask();
  };

  // Time tracking
  const addTimeLog = async () => {
    const minutes = prompt('Số phút đã làm:');
    if (!minutes || isNaN(+minutes)) return;
    const desc = prompt('Mô tả (tùy chọn):') || '';
    await api.post(`/tasks/${taskId}/time-logs`, {
      started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
      duration_minutes: +minutes, description: desc,
    });
    loadTask();
  };

  if (!open) return null;

  const tabs = [
    { id: 'detail', label: 'Chi tiết', icon: CheckSquare },
    { id: 'checklist', label: 'Checklist', icon: CheckSquare, count: task?.checklists?.length },
    { id: 'comments', label: 'Bình luận', icon: MessageSquare, count: task?.comments?.length },
    { id: 'time', label: 'T.gian', icon: Clock, count: task?.timeLogs?.length },
    { id: 'people', label: 'T.viên', icon: Users },
  ];

  const checkDone = task?.checklists?.filter(c => c.is_completed).length || 0;
  const checkTotal = task?.checklists?.length || 0;
  const totalMinutes = task?.timeLogs?.reduce((s, l) => s + (l.duration_minutes || 0), 0) || 0;
  const isOverdue = task?.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';

  return (
    <Modal open={open} onClose={onClose} title="" size="lg">
      {loading || !task ? (
        <div className="flex items-center justify-center h-40">
          <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {task.projects && <span className="text-xs text-gray-400 font-medium">{task.projects.code}</span>}
              {isOverdue && <span className="text-xs text-red-600 flex items-center gap-1 font-medium"><AlertTriangle className="h-3 w-3" /> Quá hạn</span>}
              <div className="ml-auto flex items-center gap-1">
                <button onClick={startEdit} className="h-7 px-2 bg-gray-100 text-gray-600 rounded-lg text-xs flex items-center gap-1 hover:bg-blue-50 hover:text-blue-600 cursor-pointer"><Edit className="h-3 w-3" /> Sửa</button>
                <button onClick={deleteTask} className="h-7 px-2 bg-gray-100 text-gray-600 rounded-lg text-xs flex items-center gap-1 hover:bg-red-50 hover:text-red-600 cursor-pointer"><Trash2 className="h-3 w-3" /> Xóa</button>
              </div>
            </div>

            {editing ? (
              <div className="space-y-2 bg-blue-50 rounded-lg p-3 border border-blue-100">
                <input value={editForm.title || ''} onChange={e => setEditForm(f => ({...f, title: e.target.value}))}
                  className="w-full h-9 px-3 border rounded-lg text-sm font-bold" placeholder="Tên công việc" />
                <textarea value={editForm.description || ''} onChange={e => setEditForm(f => ({...f, description: e.target.value}))}
                  className="w-full h-16 px-3 py-2 border rounded-lg text-sm" placeholder="Mô tả..." />
                <div className="flex gap-2 flex-wrap">
                  <select value={editForm.priority || 'medium'} onChange={e => setEditForm(f => ({...f, priority: e.target.value}))} className="h-8 px-2 border rounded text-xs">
                    <option value="low">Thấp</option><option value="medium">TB</option><option value="high">Cao</option><option value="urgent">Gấp</option>
                  </select>
                  <input type="date" value={editForm.due_date || ''} onChange={e => setEditForm(f => ({...f, due_date: e.target.value}))} className="h-8 px-2 border rounded text-xs" />
                  <button onClick={saveEdit} className="h-8 px-3 bg-blue-600 text-white rounded-lg text-xs font-medium cursor-pointer flex items-center gap-1"><Save className="h-3 w-3" /> Lưu</button>
                  <button onClick={() => setEditing(false)} className="h-8 px-2 text-gray-500 text-xs cursor-pointer">Hủy</button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 mb-3">{task.title}</h1>
                <div className="flex gap-1.5 flex-wrap">
                  {STATUS_OPTIONS.map(s => (
                    <button key={s.value} onClick={() => updateStatus(s.value)}
                      className={`h-7 sm:h-8 px-2 sm:px-3 rounded-lg text-[11px] sm:text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
                        task.status === s.value ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${s.color}`} />{s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Info grid — responsive */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <InfoBox label="Người giao" value={task.creator?.full_name} icon={User} />
            <InfoBox label="Thực hiện" value={task.assignee?.full_name} icon={User} />
            <InfoBox label="Ưu tiên" value={PRIORITY_LABELS[task.priority]} badge={PRIORITY_COLORS[task.priority]} />
            <InfoBox label="Hạn chót" value={formatDate(task.due_date)} icon={Calendar} danger={isOverdue} />
          </div>

          {task.description && !editing && <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">{task.description}</div>}

          {task.attachments?.length > 0 && (
            <div><p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Paperclip className="h-3 w-3" /> Đính kèm</p>
              <FileList files={task.attachments} /></div>
          )}

          {/* Tabs — scrollable on mobile */}
          <div className="flex gap-0.5 border-b border-gray-200 overflow-x-auto no-scrollbar">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium border-b-2 cursor-pointer whitespace-nowrap ${
                  activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                <t.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />{t.label}
                {t.count > 0 && <span className="text-[10px] bg-gray-100 px-1 rounded-full">{t.count}</span>}
              </button>
            ))}
          </div>

          {/* ─── Detail Tab ─── */}
          {activeTab === 'detail' && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><span className="text-gray-500">Dự án:</span> <strong>{task.projects?.name}</strong></div>
                <div><span className="text-gray-500">Giai đoạn:</span> <strong>{task.stage?.name || '—'}</strong></div>
                <div><span className="text-gray-500">Bắt đầu:</span> {formatDate(task.start_date) || '—'}</div>
                <div><span className="text-gray-500">Ngày tạo:</span> {formatDate(task.created_at)}</div>
                <div><span className="text-gray-500">Giờ ước tính:</span> {task.estimated_hours ? `${task.estimated_hours}h` : '—'}</div>
                <div><span className="text-gray-500">Giờ thực tế:</span> {task.actual_hours ? `${task.actual_hours}h` : '—'}</div>
              </div>
              {checkTotal > 0 && (
                <div><span className="text-gray-500">Checklist:</span> <strong>{checkDone}/{checkTotal}</strong>
                  <div className="w-full h-2 bg-gray-100 rounded-full mt-1">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(checkDone/checkTotal)*100}%` }} />
                  </div></div>
              )}
            </div>
          )}

          {/* ─── Checklist Tab ─── */}
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
                <ChecklistItemRow key={cl.id} cl={cl} taskId={taskId}
                  onToggle={() => toggleCheckItem(cl.id, cl.is_completed)}
                  onDelete={() => deleteCheckItem(cl.id)}
                  onSaveNote={saveChecklistNote}
                  onUpdated={loadTask} />
              ))}
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <input value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCheckItem()}
                    placeholder="Thêm mục checklist..." className="flex-1 h-9 px-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  <FileUploadButton compact onFilesUploaded={(f) => setCheckFiles(prev => [...prev, ...f])} />
                  <button onClick={addCheckItem} className="h-9 px-3 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 cursor-pointer">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <FilePreview files={checkFiles} onRemove={(i) => setCheckFiles(f => f.filter((_, j) => j !== i))} small />
              </div>
            </div>
          )}

          {/* ─── Comments Tab ─── */}
          {activeTab === 'comments' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input value={newComment} onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addComment()}
                    placeholder="Viết bình luận..." className="flex-1 h-9 px-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  <FileUploadButton compact onFilesUploaded={(f) => setCommentFiles(prev => [...prev, ...f])} />
                  <button onClick={addComment} className="h-9 px-3 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 cursor-pointer">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <FilePreview files={commentFiles} onRemove={(i) => setCommentFiles(f => f.filter((_, j) => j !== i))} small />
              </div>
              {task.comments?.map(c => (
                <div key={c.id} className="flex gap-2 sm:gap-3">
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center text-white text-[9px] sm:text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: avatarColor(c.user?.full_name) }}>{getInitials(c.user?.full_name)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{c.user?.full_name}</span>
                      <span className="text-[10px] text-gray-400">{formatDateTime(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5">{c.content}</p>
                    <FileList files={c.attachments || []} />
                  </div>
                </div>
              ))}
              {!task.comments?.length && <p className="text-sm text-gray-400 text-center py-4">Chưa có bình luận</p>}
            </div>
          )}

          {/* ─── Time Tab ─── */}
          {activeTab === 'time' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Tổng: <strong>{Math.floor(totalMinutes/60)}h {totalMinutes%60}m</strong></span>
                <button onClick={addTimeLog} className="h-8 px-3 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 cursor-pointer flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" /> Thêm
                </button>
              </div>
              {task.timeLogs?.map(tl => (
                <div key={tl.id} className="flex items-center gap-2 sm:gap-3 bg-gray-50 rounded-lg p-2 sm:p-3">
                  <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{tl.duration_minutes} phút</span>
                    {tl.description && <span className="text-xs text-gray-500 ml-1 sm:ml-2">— {tl.description}</span>}
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">{tl.user?.full_name}</span>
                </div>
              ))}
              {!task.timeLogs?.length && <p className="text-sm text-gray-400 text-center py-4">Chưa có bản ghi</p>}
            </div>
          )}

          {/* ─── People Tab ─── */}
          {activeTab === 'people' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <RoleCard icon={User} label="Người giao" user={task.creator} />
                <RoleCard icon={User} label="Thực hiện" user={task.assignee} />
              </div>
              
              {/* Sử dụng ParticipantManager component */}
              <ParticipantManager
                entityType="task"
                entityId={taskId}
                participants={task.participants || []}
                onUpdated={loadTask}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ═══ Checklist Item with inline note/file editing ═══
function ChecklistItemRow({ cl, taskId, onToggle, onDelete, onSaveNote, onUpdated }) {
  const [showDetail, setShowDetail] = useState(false);
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteFiles, setNoteFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const hasNotes = cl.notes;
  const hasFiles = cl.attachments?.length > 0;
  const hasExtra = hasNotes || hasFiles;

  const startEdit = () => {
    setNoteText(cl.notes || '');
    setNoteFiles(cl.attachments || []);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    await onSaveNote(cl.id, noteText, noteFiles);
    setEditing(false);
    setSaving(false);
  };

  return (
    <div className="group">
      <div className="flex items-start gap-2">
        <button onClick={onToggle}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 cursor-pointer ${
            cl.is_completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 hover:border-blue-400'
          }`}>
          {cl.is_completed && <CheckSquare className="h-3 w-3" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-sm ${cl.is_completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{cl.title}</span>
            {hasFiles && <Paperclip className="h-3 w-3 text-blue-400" />}
            {hasNotes && <MessageSquare className="h-3 w-3 text-amber-400" />}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {hasExtra && (
            <button onClick={() => { setShowDetail(!showDetail); if (editing) setEditing(false); }}
              className="text-gray-300 hover:text-blue-500 cursor-pointer p-0.5" title="Xem ghi chú/file">
              {showDetail ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          )}
          <button onClick={startEdit} className="text-gray-300 hover:text-blue-500 cursor-pointer p-0.5 opacity-0 group-hover:opacity-100" title="Sửa ghi chú">
            <Edit className="h-3 w-3" />
          </button>
          <button onClick={onDelete} className="text-gray-300 hover:text-red-500 cursor-pointer p-0.5 opacity-0 group-hover:opacity-100">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* View saved notes+files */}
      {showDetail && hasExtra && !editing && (
        <div className="mt-1.5 ml-7 space-y-1.5">
          {hasNotes && <p className="text-xs text-gray-600 bg-amber-50 rounded p-2 border border-amber-100">{cl.notes}</p>}
          {hasFiles && (
            <div className="space-y-1">
              {cl.attachments.map((f, fi) => {
                const isImg = f.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.file_url || f.file_name || '');
                return isImg ? (
                  <a key={fi} href={f.file_url} target="_blank" rel="noopener noreferrer">
                    <img src={f.file_url} alt={f.file_name} className="max-h-24 rounded border object-cover" />
                  </a>
                ) : (
                  <a key={fi} href={f.file_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline bg-gray-50 rounded px-2 py-1">
                    <Paperclip className="h-3 w-3" />{f.file_name || 'file'}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit form: notes + files, save together */}
      {editing && (
        <div className="mt-2 ml-7 space-y-2 bg-blue-50/50 rounded-lg p-2 border border-blue-100">
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
            className="w-full h-14 px-2 py-1 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-300 bg-white"
            placeholder="Ghi chú..." />
          <FilePreview files={noteFiles} onRemove={(i) => setNoteFiles(f => f.filter((_, j) => j !== i))} small />
          <div className="flex items-center gap-2 flex-wrap">
            <FileUploadButton compact onFilesUploaded={(files) => setNoteFiles(prev => [...prev, ...files])} />
            <button onClick={save} disabled={saving}
              className="h-7 px-3 bg-blue-600 text-white rounded text-xs font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1">
              <Save className="h-3 w-3" />{saving ? '...' : 'Lưu'}
            </button>
            <button onClick={() => setEditing(false)} className="h-7 px-2 text-gray-500 text-xs cursor-pointer">Hủy</button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoBox({ label, value, icon: Icon, badge, danger }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
      <p className="text-[10px] sm:text-[11px] text-gray-500 mb-0.5 sm:mb-1">{label}</p>
      <div className={`flex items-center gap-1 ${danger ? 'text-red-600' : 'text-gray-900'}`}>
        {Icon && <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
        {badge ? <span className={`text-[11px] sm:text-xs px-1.5 py-0.5 rounded-full font-medium ${badge}`}>{value || '—'}</span>
          : <span className="text-xs sm:text-sm font-medium truncate">{value || '—'}</span>}
      </div>
    </div>
  );
}

function RoleCard({ icon: Icon, label, user }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 bg-gray-50 rounded-lg p-2 sm:p-3">
      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-white text-[10px] sm:text-xs font-bold shrink-0"
        style={{ backgroundColor: user ? avatarColor(user.full_name) : '#9ca3af' }}>
        {user ? getInitials(user.full_name) : '?'}
      </div>
      <div className="min-w-0"><p className="text-[10px] sm:text-[11px] text-gray-500">{label}</p><p className="text-xs sm:text-sm font-medium truncate">{user?.full_name || '—'}</p></div>
    </div>
  );
}

function PersonRow({ user }) {
  if (!user) return null;
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
        style={{ backgroundColor: avatarColor(user.full_name) }}>{getInitials(user.full_name)}</div>
      <span className="text-sm text-gray-700">{user.full_name}</span>
    </div>
  );
}