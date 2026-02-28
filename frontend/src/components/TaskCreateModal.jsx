import { useState, useEffect } from 'react';
import api from '../lib/api';
import Modal from './Modal';
import { FileUploadButton, FilePreview } from './FileUpload';

const STAGE_NAMES = { consulting:'Tư vấn', design:'Thiết kế', quotation:'Báo giá', contract:'Hợp đồng', production:'Sản xuất', shipping:'Vận chuyển', installation:'Lắp đặt', 'customer-care':'Chăm sóc KH' };

export default function TaskCreateModal({ open, onClose, onCreated, projectId, stageId }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', assignee_id: '', due_date: '', estimated_hours: '', workflow_line_id: '' });
  const [users, setUsers] = useState([]);
  const [stages, setStages] = useState([]);
  const [workflowLines, setWorkflowLines] = useState([]);
  const [selectedStageId, setSelectedStageId] = useState(stageId || '');
  const [checklists, setChecklists] = useState([]);
  const [newCheck, setNewCheck] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      api.get('/users').then(r => setUsers(r.data.users || []));
      api.get('/users/stages').then(r => setStages(r.data.stages || [])).catch(() => {});
      setForm({ title: '', description: '', priority: 'medium', assignee_id: '', due_date: '', estimated_hours: '', workflow_line_id: '' });
      setSelectedStageId(stageId || '');
      setChecklists([]);
      setFiles([]);
      setWorkflowLines([]);

      // Load workflow lines if project
      if (projectId) {
        api.get(`/projects/${projectId}/workflow-lines`).then(r => setWorkflowLines(r.data.lines || [])).catch(() => {});
      }
    }
  }, [open, projectId, stageId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addCheck = () => {
    if (!newCheck.trim()) return;
    setChecklists(c => [...c, { title: newCheck.trim(), attachments: [] }]);
    setNewCheck('');
  };

  // Get stage slug for selected stageId
  const selectedStage = stages.find(s => s.id === selectedStageId);
  const selectedStageSlug = selectedStage?.slug || '';

  // Filter workflow lines for the selected stage
  const stageLines = workflowLines.filter(l => l.stage_slug === selectedStageSlug);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setLoading(true);
    try {
      await api.post('/tasks', {
        ...form,
        project_id: projectId,
        stage_id: selectedStageId || stageId || null,
        workflow_line_id: form.workflow_line_id || null,
        assignee_id: form.assignee_id || null,
        due_date: form.due_date || null,
        estimated_hours: form.estimated_hours ? +form.estimated_hours : null,
        checklists: checklists.map(c => ({ title: c.title, attachments: c.attachments })),
        attachments: files,
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
          <input value={form.title} onChange={e => set('title', e.target.value)} required className="input" placeholder="Tên công việc" />
        </Field>

        <Field label="Mô tả">
          <textarea value={form.description} onChange={e => set('description', e.target.value)} className="input min-h-[80px]" placeholder="Mô tả chi tiết..." />
        </Field>

        {/* Stage + Workflow Line selectors */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Giai đoạn (quy trình)">
            <select value={selectedStageId} onChange={e => { setSelectedStageId(e.target.value); set('workflow_line_id', ''); }}
              className="input">
              <option value="">— Chọn giai đoạn —</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          {stageLines.length > 0 && (
            <Field label="Bộ phận (workflow line)">
              <select value={form.workflow_line_id} onChange={e => {
                set('workflow_line_id', e.target.value);
                // Auto-set assignee from line
                const line = stageLines.find(l => l.id === e.target.value);
                if (line?.assignee_id && !form.assignee_id) set('assignee_id', line.assignee_id);
              }} className="input">
                <option value="">— Tất cả —</option>
                {stageLines.map(l => (
                  <option key={l.id} value={l.id}>{l.label}{l.assignee ? ` (${l.assignee.full_name})` : ''}</option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Người thực hiện">
            <select value={form.assignee_id} onChange={e => set('assignee_id', e.target.value)} className="input">
              <option value="">— Chọn —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </Field>
          <Field label="Độ ưu tiên">
            <select value={form.priority} onChange={e => set('priority', e.target.value)} className="input">
              <option value="low">Thấp</option><option value="medium">Trung bình</option>
              <option value="high">Cao</option><option value="urgent">Gấp</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Hạn chót">
            <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className="input" />
          </Field>
          <Field label="Giờ ước tính">
            <input type="number" step="0.5" value={form.estimated_hours} onChange={e => set('estimated_hours', e.target.value)} className="input" placeholder="VD: 4" />
          </Field>
        </div>

        {/* File Upload */}
        <Field label="Đính kèm file / hình ảnh">
          <FileUploadButton onFilesUploaded={(uploaded) => setFiles(f => [...f, ...uploaded])} />
          <FilePreview files={files} onRemove={(i) => setFiles(f => f.filter((_, j) => j !== i))} />
        </Field>

        {/* Checklist */}
        <Field label="Checklist">
          <div className="space-y-2">
            {checklists.map((c, i) => (
              <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-lg p-2">
                <span className="w-5 h-5 rounded border border-gray-300 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm">{c.title}</span>
                  <FilePreview files={c.attachments} small />
                  <FileUploadButton compact
                    onFilesUploaded={(uploaded) => {
                      setChecklists(cl => cl.map((item, j) => j === i ? { ...item, attachments: [...item.attachments, ...uploaded] } : item));
                    }} />
                </div>
                <button type="button" onClick={() => setChecklists(cl => cl.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 text-xs cursor-pointer shrink-0">✕</button>
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
          <button type="button" onClick={onClose} className="h-10 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 cursor-pointer">Hủy</button>
          <button type="submit" disabled={loading} className="h-10 px-6 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
            {loading ? 'Đang tạo...' : 'Tạo công việc'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }) {
  return <div><label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>{children}</div>;
}
