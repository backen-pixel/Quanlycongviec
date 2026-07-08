import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, FileUp, MessageSquare, Save, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { publicFileUrl } from '../lib/publicFileUrl';
import { AttachmentFileIcon, inferAttachmentDocType } from '../lib/attachmentFileIcon';
import { mergeUploadProgressState, uploadSingleFileWithProgress } from '../lib/uploadProgressEta';
import UploadProgressBubble from './UploadProgressBubble';

function compressImage(file, maxWidth = 1920, quality = 0.8) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.size < 500 * 1024) { resolve(file); return; }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

function CrmTaskNotesAttachments({ task }) {
  const taskId = task.source_id;
  const leadId = task.lead_id;
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingNote, setSavingNote] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  const loadAttachments = useCallback(async () => {
    try {
      const { data } = await api.get(`/crm/leads/${leadId}/tasks/${taskId}/attachments`);
      setAttachments(Array.isArray(data) ? data : []);
    } catch {
      setAttachments([]);
    }
  }, [leadId, taskId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get(`/crm/leads/${leadId}/tasks`).catch(() => ({ data: { tasks: [] } })),
      api.get(`/crm/leads/${leadId}/tasks/${taskId}/attachments`).catch(() => ({ data: [] })),
    ]).then(([taskRes, attRes]) => {
      if (cancelled) return;
      const list = taskRes.data?.tasks || taskRes.data || [];
      const row = Array.isArray(list) ? list.find((x) => String(x.id) === String(taskId)) : null;
      setNotes(row?.notes || '');
      setAttachments(Array.isArray(attRes.data) ? attRes.data : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [leadId, taskId]);

  const saveNotes = async () => {
    setSavingNote(true);
    try {
      await api.put(`/crm/leads/${leadId}/tasks/${taskId}/notes`, { notes });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu ghi chú');
    }
    setSavingNote(false);
  };

  const uploadFiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.mp4,.mov,.webm,.avi';
    input.onchange = async (e) => {
      const rawFiles = Array.from(e.target.files || []).slice(0, 20);
      if (!rawFiles.length) return;
      setUploading(true);
      try {
        const imageFiles = rawFiles.filter((f) => f.type.startsWith('image/'));
        const otherFiles = rawFiles.filter((f) => !f.type.startsWith('image/'));
        const allUploaded = [];

        if (imageFiles.length) {
          const compressed = await Promise.all(imageFiles.map((f) => compressImage(f)));
          const formData = new FormData();
          compressed.forEach((f) => formData.append('files', f));
          const { data: uploadRes } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          allUploaded.push(...(uploadRes.files || (Array.isArray(uploadRes) ? uploadRes : [uploadRes])));
        }

        for (const file of otherFiles) {
          setUploadProgress({ percent: 0, name: file.name, size: file.size });
          const isLarge = file.size > 10 * 1024 * 1024;
          const endpoint = isLarge ? '/upload/stream' : '/upload/single';
          const result = await uploadSingleFileWithProgress({
            file,
            endpoint,
            baseURL: api.defaults.baseURL,
            token: localStorage.getItem('token'),
            onProgress: (stats) => {
              setUploadProgress((p) => mergeUploadProgressState({
                percent: 0, name: file.name, size: file.size,
              }, stats));
            },
          });
          allUploaded.push(result);
        }

        setUploadProgress(null);
        if (!allUploaded.length) throw new Error('Upload không trả về file');

        const items = allUploaded.map((up) => ({
          name: (up.original_name || up.file_name || 'File').replace(/\.[^.]+$/, ''),
          doc_type: inferAttachmentDocType(up),
          file_url: up.file_url,
          file_name: up.file_name,
          file_size: up.file_size,
          mime_type: up.mime_type,
        }));
        await api.post(`/crm/leads/${leadId}/tasks/${taskId}/attachments/bulk`, { items });
        await loadAttachments();
      } catch (err) {
        alert(err.response?.data?.error || err.message || 'Upload lỗi');
      }
      setUploading(false);
      setUploadProgress(null);
    };
    input.click();
  };

  const deleteAttachment = async (attId) => {
    if (!confirm('Xóa đính kèm này?')) return;
    try {
      await api.delete(`/crm/leads/${leadId}/tasks/${taskId}/attachments/${attId}`);
      await loadAttachments();
    } catch {
      alert('Lỗi xóa file');
    }
  };

  if (loading) {
    return <p className="text-xs text-gray-400 py-4 text-center">Đang tải ghi chú & file…</p>;
  }

  const fileAtts = attachments.filter((a) => a.file_url);

  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center justify-between gap-2">
        <Link
          to={`/crm/leads/${leadId}`}
          className="text-xs text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 font-medium"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Mở chi tiết deal
        </Link>
        {uploading ? (
          <span className="text-[10px] text-orange-600">Đang upload…</span>
        ) : (
          <button
            type="button"
            onClick={uploadFiles}
            className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50"
          >
            <FileUp className="h-3 w-3" /> Upload file
          </button>
        )}
      </div>

      <div>
        <label className="text-[10px] font-semibold text-gray-500 uppercase">Ghi chú nhiệm vụ</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Nhập ghi chú như ở tab Nhiệm vụ trong deal…"
          className="mt-1 w-full px-2.5 py-1.5 border rounded-lg text-xs outline-none focus:border-blue-400 resize-y"
        />
        <div className="flex justify-end mt-1">
          <button
            type="button"
            onClick={saveNotes}
            disabled={savingNote}
            className={`px-2.5 py-1 rounded text-[10px] font-medium cursor-pointer inline-flex items-center gap-1 disabled:opacity-50 ${
              savedFlash ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <Save className="h-2.5 w-2.5" />
            {savingNote ? 'Đang lưu…' : savedFlash ? '✓ Đã lưu' : 'Lưu ghi chú'}
          </button>
        </div>
      </div>

      {uploadProgress && (
        <UploadProgressBubble
          variant="inline"
          fileName={uploadProgress.name}
          fileSize={uploadProgress.size}
          percent={uploadProgress.percent}
          bytesPerSec={uploadProgress.bytesPerSec}
          remainingSec={uploadProgress.remainingSec}
        />
      )}

      {fileAtts.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">
            Đính kèm ({fileAtts.length})
          </label>
          {fileAtts.map((att) => {
            const img = att.mime_type?.startsWith('image/') || att.doc_type === 'image';
            return (
              <div key={att.id} className="py-1.5 px-2 rounded bg-gray-50 border flex items-start gap-2">
                <AttachmentFileIcon att={att} className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <a
                    href={publicFileUrl(att.file_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-blue-700 hover:underline truncate block"
                  >
                    {att.name || att.file_name}
                  </a>
                  {att.notes && <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{att.notes}</p>}
                  {img && att.file_url && (
                    <img
                      src={publicFileUrl(att.file_url)}
                      alt=""
                      className="mt-1 max-h-32 rounded border object-contain"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => deleteAttachment(att.id)}
                  className="p-1 text-gray-400 hover:text-red-600 cursor-pointer shrink-0"
                  title="Xóa"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AssignmentComments({ task }) {
  const assignmentId = task.source_id;
  const [comments, setComments] = useState([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/crm/assignments/${assignmentId}/comments`);
      setComments(data?.comments || data || []);
    } catch {
      setComments([]);
    }
    setLoading(false);
  }, [assignmentId]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await api.post(`/work-tasks/crm_assignment/${assignmentId}/comment`, { content: content.trim() });
      setContent('');
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi gửi bình luận');
    }
    setSaving(false);
  };

  if (loading) return <p className="text-xs text-gray-400 py-4 text-center">Đang tải…</p>;

  return (
    <div className="space-y-2 pt-1">
      <label className="text-[10px] font-semibold text-gray-500 uppercase flex items-center gap-1">
        <MessageSquare className="h-3 w-3" /> Bình luận giao việc
      </label>
      <div className="max-h-40 overflow-y-auto space-y-1.5 [scrollbar-width:thin]">
        {comments.length === 0 && <p className="text-xs text-gray-400">Chưa có bình luận</p>}
        {comments.map((c) => (
          <div key={c.id} className="text-xs bg-gray-50 border rounded px-2 py-1.5">
            <p className="text-gray-800 whitespace-pre-wrap">{c.content}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{c.user?.full_name || c.author?.full_name || ''}</p>
          </div>
        ))}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={2}
        placeholder="Thêm bình luận…"
        className="w-full px-2.5 py-1.5 border rounded-lg text-xs outline-none focus:border-blue-400 resize-none"
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !content.trim()}
          className="px-2.5 py-1 rounded text-[10px] font-medium bg-blue-600 text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50"
        >
          {saving ? 'Đang gửi…' : 'Gửi bình luận'}
        </button>
      </div>
    </div>
  );
}

function ProductionTaskComments({ task }) {
  const taskId = task.source_id;
  const [comments, setComments] = useState([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get(`/tasks/${taskId}`).then((r) => {
      if (!cancelled) {
        setComments(r.data?.comments || []);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [taskId]);

  const submit = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await api.post(`/work-tasks/task/${taskId}/comment`, { content: content.trim() });
      const { data } = await api.get(`/tasks/${taskId}`);
      setComments(data?.comments || []);
      setContent('');
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi gửi bình luận');
    }
    setSaving(false);
  };

  if (loading) return <p className="text-xs text-gray-400 py-4 text-center">Đang tải…</p>;

  return (
    <div className="space-y-2 pt-1">
      {task.project_id && (
        <Link
          to={`/sx/projects/${task.project_id}`}
          className="text-xs text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 font-medium"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Mở dự án
        </Link>
      )}
      <label className="text-[10px] font-semibold text-gray-500 uppercase">Bình luận</label>
      <div className="max-h-40 overflow-y-auto space-y-1.5 [scrollbar-width:thin]">
        {comments.length === 0 && <p className="text-xs text-gray-400">Chưa có bình luận</p>}
        {comments.map((c) => (
          <div key={c.id} className="text-xs bg-gray-50 border rounded px-2 py-1.5">
            <p className="text-gray-800 whitespace-pre-wrap">{c.content}</p>
          </div>
        ))}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={2}
        placeholder="Thêm bình luận (file đính kèm: mở chi tiết dự án)…"
        className="w-full px-2.5 py-1.5 border rounded-lg text-xs outline-none focus:border-blue-400 resize-none"
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !content.trim()}
          className="px-2.5 py-1 rounded text-[10px] font-medium bg-blue-600 text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50"
        >
          {saving ? 'Đang gửi…' : 'Gửi bình luận'}
        </button>
      </div>
    </div>
  );
}

export default function WorkTaskExtrasPanel({ task }) {
  if (!task) return null;
  if (task.source === 'crm_task' && task.lead_id) {
    return <CrmTaskNotesAttachments task={task} />;
  }
  if (task.source === 'crm_assignment') {
    return <AssignmentComments task={task} />;
  }
  if (task.source === 'task') {
    return <ProductionTaskComments task={task} />;
  }
  return (
    <p className="text-xs text-gray-400 py-2">Loại nhiệm vụ này chưa hỗ trợ ghi chú/file tại đây.</p>
  );
}
