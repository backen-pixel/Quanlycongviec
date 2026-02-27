import { useState, useEffect } from 'react';
import api from '../lib/api';
import Modal from './Modal';

export default function TaskCreateModal({ open, onClose, onCreated, projectId, stageId }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', assignee_id: '', due_date: '', estimated_hours: '' });
  const [users, setUsers] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [newCheck, setNewCheck] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      api.get('/users').then(r => setUsers(r.data.users || []));
      setForm({ title: '', description: '', priority: 'medium', assignee_id: '', due_date: '', estimated_hours: '' });
      setChecklists([]);
    }
  }, [open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addCheck = () => {
    if (!newCheck.trim()) return;
    setChecklists(c => [...c, newCheck.trim()]);
    setNewCheck('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setLoading(true);
    try {
      await api.post('/tasks', {
        ...form,
        project_id: projectId,
        stage_id: stageId || null,
        assignee_id: form.assignee_id || null,
        due_date: form.due_date || null,
        estimated_hours: form.estimated_hours ? +form.estimated_hours : null,
        checklists: checklists.map(c => ({ title: c })),
      });
      onCreated?.();
      onClose();
    } catch { }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Tạo công việc mới" size="md">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Tiêu đề *">
          <input value={form.title} onChange={e => set('title', e.target.value)} required
            className="input" placeholder="Tên công việc" />
        </Field>

        <Field label="Mô tả">
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            className="input min-h-[80px]" placeholder="Mô tả chi tiết..." />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Người thực hiện">
            <select value={form.assignee_id} onChange={e => set('assignee_id', e.target.value)} className="input">
              <option value="">— Chọn —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </Field>
          <Field label="Độ ưu tiên">
            <select value={form.priority} onChange={e => set('priority', e.target.value)} className="input">
              <option value="low">Thấp</option>
              <option value="medium">Trung bình</option>
              <option value="high">Cao</option>
              <option value="urgent">Gấp</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Hạn chót">
            <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className="input" />
          </Field>
          <Field label="Giờ ước tính">
            <input type="number" step="0.5" value={form.estimated_hours} onChange={e => set('estimated_hours', e.target.value)}
              className="input" placeholder="VD: 4" />
          </Field>
        </div>

        {/* Checklist */}
        <Field label="Checklist">
          <div className="space-y-1">
            {checklists.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 h-5 rounded border border-gray-300 shrink-0" />
                <span className="text-sm flex-1">{c}</span>
                <button type="button" onClick={() => setChecklists(cl => cl.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 text-xs cursor-pointer">✕</button>
              </div>
            ))}
            <div className="flex gap-2">
              <input value={newCheck} onChange={e => setNewCheck(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCheck())}
                placeholder="Thêm mục..." className="input flex-1" />
              <button type="button" onClick={addCheck} className="h-9 px-3 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 cursor-pointer">+</button>
            </div>
          </div>
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-10 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 cursor-pointer">
            Hủy
          </button>
          <button type="submit" disabled={loading} className="h-10 px-6 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
            {loading ? 'Đang tạo...' : 'Tạo công việc'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
