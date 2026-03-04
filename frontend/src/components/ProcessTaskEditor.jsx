import { useState } from 'react';
import api from '../lib/api';
import { Trash2, Edit, Save, X, Plus, FileText, StickyNote } from 'lucide-react';

export default function ProcessTaskEditor({ task, onUpdated, onDeleted }) {
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editPriority, setEditPriority] = useState(task.priority || 'medium');
  const [editDD, setEditDD] = useState(task.deadline_days || 0);
  const [editDH, setEditDH] = useState(task.deadline_hours || 0);
  const [saving, setSaving] = useState(false);
  const [showAddCL, setShowAddCL] = useState(false);
  const [newCLTitle, setNewCLTitle] = useState('');
  const [newCLReqFile, setNewCLReqFile] = useState(false);
  const [newCLReqNote, setNewCLReqNote] = useState(false);

  const saveEdit = async () => {
    if (!editTitle.trim()) return alert('Nhập tên NV');
    setSaving(true);
    try {
      await api.put(`/company-processes/tasks/${task.id}`, {
        title: editTitle.trim(),
        priority: editPriority,
        deadline_days: parseInt(editDD) || 0,
        deadline_hours: parseInt(editDH) || 0,
      });
      onUpdated?.();
      setEditMode(false);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  const deleteTask = async () => {
    if (!confirm('Xóa NV này cùng tất cả checklist?')) return;
    try {
      await api.delete(`/company-processes/tasks/${task.id}`);
      onDeleted?.();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const addChecklist = async () => {
    if (!newCLTitle.trim()) return;
    try {
      await api.post(`/company-processes/tasks/${task.id}/checklists`, {
        title: newCLTitle.trim(),
        require_file: newCLReqFile,
        require_note: newCLReqNote,
      });
      onUpdated?.();
      setNewCLTitle('');
      setNewCLReqFile(false);
      setNewCLReqNote(false);
      setShowAddCL(false);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const deleteChecklist = async (clId) => {
    try {
      await api.delete(`/company-processes/checklists/${clId}`);
      onUpdated?.();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  if (editMode) {
    return (
      <div className="bg-blue-50 rounded p-2 space-y-1.5 border border-blue-200">
        <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full h-7 px-2 border rounded text-[11px]" autoFocus />
        <div className="flex gap-1 flex-wrap">
          <select value={editPriority} onChange={e => setEditPriority(e.target.value)} className="h-6 px-1.5 border rounded text-[10px]">
            <option value="low">Thấp</option><option value="medium">TB</option><option value="high">Cao</option><option value="urgent">Gấp</option>
          </select>
          <input type="number" min="0" value={editDD} onChange={e => setEditDD(e.target.value)} placeholder="ngày" className="w-12 h-6 px-1 border rounded text-[10px]" />
          <span className="text-[9px] text-gray-400 leading-6">d</span>
          <input type="number" min="0" value={editDH} onChange={e => setEditDH(e.target.value)} placeholder="giờ" className="w-12 h-6 px-1 border rounded text-[10px]" />
          <span className="text-[9px] text-gray-400 leading-6">h</span>
          <div className="flex-1" />
          <button onClick={() => setEditMode(false)} className="h-6 px-1.5 text-[9px] text-gray-500 cursor-pointer">Hủy</button>
          <button onClick={saveEdit} disabled={saving} className="h-6 px-1.5 bg-blue-600 text-white rounded text-[9px] cursor-pointer disabled:opacity-50">Lưu</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded p-2 space-y-1 group">
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="w-1.5 h-1.5 rounded-full bg-purple-300 shrink-0" />
        <span className="flex-1 font-medium text-gray-800">{task.title}</span>
        {task.priority && task.priority !== 'medium' && <span className={`text-[8px] px-1 rounded ${task.priority === 'high' ? 'bg-orange-50 text-orange-600' : task.priority === 'urgent' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`}>{task.priority}</span>}
        {(task.deadline_days > 0 || task.deadline_hours > 0) && <span className="text-[8px] bg-amber-50 text-amber-600 px-1 rounded">{task.deadline_days}d {task.deadline_hours}h</span>}
        <button onClick={() => setEditMode(true)} className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-600 cursor-pointer"><Edit className="h-2.5 w-2.5" /></button>
        <button onClick={deleteTask} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="h-2.5 w-2.5" /></button>
      </div>

      {task.checklists && task.checklists.length > 0 && (
        <div className="ml-4 space-y-0">
          {task.checklists.map(cl => (
            <ChecklistRow key={cl.id} checklist={cl} onDelete={() => deleteChecklist(cl.id)} />
          ))}
        </div>
      )}

      {showAddCL ? (
        <div className="ml-4 bg-white border border-dashed rounded p-1.5 space-y-1">
          <input value={newCLTitle} onChange={e => setNewCLTitle(e.target.value)} placeholder="Tên checklist..." className="w-full h-6 px-1.5 border rounded text-[10px]" autoFocus />
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-0.5 text-[9px] text-gray-500 cursor-pointer"><input type="checkbox" checked={newCLReqFile} onChange={e => setNewCLReqFile(e.target.checked)} className="accent-blue-600 w-3 h-3" /><FileText className="h-2.5 w-2.5" /></label>
            <label className="flex items-center gap-0.5 text-[9px] text-gray-500 cursor-pointer"><input type="checkbox" checked={newCLReqNote} onChange={e => setNewCLReqNote(e.target.checked)} className="accent-amber-600 w-3 h-3" /><StickyNote className="h-2.5 w-2.5" /></label>
            <div className="flex-1" />
            <button onClick={() => setShowAddCL(false)} className="text-[9px] text-gray-400 cursor-pointer">✕</button>
            <button onClick={addChecklist} className="h-5 px-1.5 bg-purple-600 text-white rounded text-[9px] cursor-pointer">+</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAddCL(true)} className="ml-4 text-[9px] text-purple-600 font-medium cursor-pointer flex items-center gap-1"><Plus className="h-2.5 w-2.5" /> Checklist</button>
      )}
    </div>
  );
}

function ChecklistRow({ checklist, onDelete }) {
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState(checklist.title);
  const [editReqFile, setEditReqFile] = useState(checklist.require_file || false);
  const [editReqNote, setEditReqNote] = useState(checklist.require_note || false);
  const [saving, setSaving] = useState(false);

  const saveEdit = async () => {
    if (!editTitle.trim()) return;
    setSaving(true);
    try {
      await api.put(`/company-processes/checklists/${checklist.id}`, {
        title: editTitle.trim(),
        require_file: editReqFile,
        require_note: editReqNote,
      });
      setEditMode(false);
      // Trigger parent reload
      window.location.reload();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  if (editMode) {
    return (
      <div className="bg-blue-50 rounded p-1.5 border border-blue-200 space-y-1">
        <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full h-6 px-1.5 border rounded text-[10px]" autoFocus />
        <div className="flex items-center gap-1">
          <label className="flex items-center gap-0.5 text-[9px] text-gray-500 cursor-pointer"><input type="checkbox" checked={editReqFile} onChange={e => setEditReqFile(e.target.checked)} className="w-3 h-3" /><FileText className="h-2.5 w-2.5" /></label>
          <label className="flex items-center gap-0.5 text-[9px] text-gray-500 cursor-pointer"><input type="checkbox" checked={editReqNote} onChange={e => setEditReqNote(e.target.checked)} className="w-3 h-3" /><StickyNote className="h-2.5 w-2.5" /></label>
          <div className="flex-1" />
          <button onClick={() => setEditMode(false)} className="text-[9px] text-gray-400 cursor-pointer">Hủy</button>
          <button onClick={saveEdit} disabled={saving} className="h-5 px-1.5 bg-blue-600 text-white rounded text-[9px] cursor-pointer disabled:opacity-50">Lưu</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-[9px] text-gray-500 py-0.5 px-1 hover:bg-gray-50 rounded group/cl">
      <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0" />
      <span className="flex-1">{checklist.title}</span>
      {checklist.require_file && <FileText className="h-2 w-2 text-blue-400" />}
      {checklist.require_note && <StickyNote className="h-2 w-2 text-amber-400" />}
      <button onClick={() => setEditMode(true)} className="opacity-0 group-hover/cl:opacity-100 text-blue-400 cursor-pointer"><Edit className="h-2 w-2" /></button>
      <button onClick={onDelete} className="opacity-0 group-hover/cl:opacity-100 text-red-400 cursor-pointer"><Trash2 className="h-2 w-2" /></button>
    </div>
  );
}
