import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Eye, FileUp, MessageSquare, Plus, Save, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { compressImage } from '../lib/compressImage';
import { getFileDownloadAnchorProps, publicFileUrl } from '../lib/publicFileUrl';
import { AttachmentFileIcon, inferAttachmentDocType, TASK_ATTACHMENT_FILE_ACCEPT } from '../lib/attachmentFileIcon';
import { mergeUploadProgressState, uploadSingleFileWithProgress } from '../lib/uploadProgressEta';
import UploadProgressBubble from './UploadProgressBubble';
import UploadFileLightbox, {
  collectUploadLightboxItems,
  findUploadLightboxIndex,
  isUploadImageFile,
} from './UploadFileLightbox';
import { FilePreviewOpenLink } from '../context/FilePreviewContext';
import CommentDisplayHiddenBanner, { useCommentShowOnScreenEnabled } from './CommentDisplayHiddenBanner';

function isImageAtt(att) {
  if (!att?.file_url) return false;
  if (att.doc_type === 'image') return true;
  if (att.mime_type?.startsWith('image/')) return true;
  return isUploadImageFile(att.mime_type, att.file_name || att.file_url);
}

function isVideoAtt(att) {
  if (!att?.file_url) return false;
  if (att.doc_type === 'video') return true;
  if (att.mime_type?.startsWith('video/')) return true;
  return /\.(mp4|mov|webm|avi|mkv|m4v)$/i.test(att.file_name || att.file_url || '');
}

function UploadedNoteCard({ att, expanded, onToggle, onDelete }) {
  const text = att.notes || att.name || '';
  const long = text.length > 180;
  const showFull = expanded || !long;

  return (
    <div className="py-2 px-2.5 rounded-lg bg-amber-50/80 border border-amber-100">
      <div className="flex items-start gap-2">
        <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
        <div className="flex-1 min-w-0">
          {att.name && att.name !== 'Ghi chú' && (
            <p className="text-xs font-semibold text-gray-800 mb-0.5">{att.name}</p>
          )}
          <p className={`text-xs text-gray-700 whitespace-pre-wrap ${showFull ? '' : 'line-clamp-3'}`}>
            {text}
          </p>
          {att.creator?.full_name && (
            <p className="text-[9px] text-gray-400 mt-1">{att.creator.full_name}</p>
          )}
          {long && (
            <button
              type="button"
              onClick={onToggle}
              className="mt-1 text-[10px] font-medium text-amber-800 hover:text-amber-950 inline-flex items-center gap-0.5 cursor-pointer"
            >
              {expanded ? <><ChevronUp className="h-3 w-3" /> Thu gọn</> : <><ChevronDown className="h-3 w-3" /> Xem chi tiết</>}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="p-1 text-gray-400 hover:text-red-600 cursor-pointer shrink-0"
          title="Xóa"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function FileAttachmentCard({ att, allAtts, onOpenLightbox, onDelete }) {
  const img = isImageAtt(att);
  const video = isVideoAtt(att);
  const downloadProps = att.file_url ? getFileDownloadAnchorProps(att.file_url, { fileName: att.file_name || att.name }) : null;

  return (
    <div className="py-2 px-2.5 rounded-lg bg-white border border-gray-200 space-y-1.5">
      <div className="flex items-start gap-2">
        <AttachmentFileIcon att={att} className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-800 truncate">{att.name || att.file_name || 'File'}</p>
          {att.notes && <p className="text-[10px] text-gray-500 mt-0.5 whitespace-pre-wrap">{att.notes}</p>}
          {att.creator?.full_name && (
            <p className="text-[9px] text-gray-400 mt-0.5">{att.creator.full_name}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {att.file_url && (
            img ? (
              <button
                type="button"
                onClick={() => onOpenLightbox(allAtts, att.file_url)}
                className="text-[10px] font-medium text-emerald-700 hover:text-emerald-900 px-1.5 py-0.5 rounded hover:bg-emerald-50 cursor-pointer inline-flex items-center gap-0.5"
              >
                <Eye className="h-3 w-3" /> Xem ảnh
              </button>
            ) : (
              <FilePreviewOpenLink
                fileUrl={att.file_url}
                fileName={att.file_name || att.name}
                mimeType={att.mime_type}
                className="text-[10px] font-medium text-emerald-700 hover:text-emerald-900 px-1.5 py-0.5 rounded hover:bg-emerald-50 cursor-pointer inline-flex items-center gap-0.5"
              >
                <Eye className="h-3 w-3 inline" /> Xem file
              </FilePreviewOpenLink>
            )
          )}
          {downloadProps && (
            <a
              {...downloadProps}
              className="text-[10px] text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50"
            >
              Tải xuống
            </a>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="text-[10px] font-medium text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50 cursor-pointer"
          >
            Xóa
          </button>
        </div>
      </div>

      {img && att.file_url && (
        <button
          type="button"
          onClick={() => onOpenLightbox(allAtts, att.file_url)}
          className="block w-full text-left rounded-lg border border-gray-200 overflow-hidden cursor-zoom-in hover:ring-2 hover:ring-blue-300 transition-shadow bg-gray-50"
          title="Phóng to xem ảnh"
        >
          <img
            src={publicFileUrl(att.file_url)}
            alt={att.name || att.file_name || ''}
            loading="lazy"
            className="max-h-64 w-full object-contain"
          />
        </button>
      )}

      {video && att.file_url && (
        <video
          src={publicFileUrl(att.file_url)}
          controls
          preload="metadata"
          className="max-h-64 w-full rounded-lg border border-gray-200 bg-black"
        />
      )}
    </div>
  );
}

function CrmTaskNotesAttachments({ task }) {
  const taskId = task.source_id;
  const leadId = task.lead_id;
  const [notes, setNotes] = useState(task.notes || '');
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingNote, setSavingNote] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [addingAttNote, setAddingAttNote] = useState(false);
  const [attNoteName, setAttNoteName] = useState('');
  const [attNoteText, setAttNoteText] = useState('');
  const [expandedNoteId, setExpandedNoteId] = useState(null);
  const [lightboxItems, setLightboxItems] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const openLightbox = useCallback((atts, rawPath) => {
    const items = collectUploadLightboxItems(
      (atts || []).filter((a) => a.doc_type !== 'checklist_inline_note'),
    );
    if (!items.length) return;
    const idx = rawPath ? findUploadLightboxIndex(items, rawPath) : 0;
    setLightboxItems(items);
    setLightboxIndex(Math.max(idx, 0));
  }, []);

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
      api.get(`/crm/leads/${leadId}/tasks/${taskId}/attachments`).catch(() => ({ data: [] })),
    ]).then(([attRes]) => {
      if (cancelled) return;
      setNotes(task.notes || '');
      setAttachments(Array.isArray(attRes.data) ? attRes.data : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [leadId, taskId, task.notes]);

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
    input.accept = TASK_ATTACHMENT_FILE_ACCEPT;
    input.onchange = async (e) => {
      const rawFiles = Array.from(e.target.files || []).slice(0, 50);
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

  const addAttachmentNote = async () => {
    if (!attNoteText.trim()) return alert('Nhập nội dung ghi chú');
    try {
      await api.post(`/crm/leads/${leadId}/tasks/${taskId}/attachments`, {
        name: attNoteName.trim() || 'Ghi chú',
        doc_type: 'task_note',
        notes: attNoteText,
      });
      setAddingAttNote(false);
      setAttNoteText('');
      setAttNoteName('');
      await loadAttachments();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi thêm ghi chú');
    }
  };

  if (loading) {
    return <p className="text-xs text-gray-400 py-4 text-center">Đang tải ghi chú & file…</p>;
  }

  const taskLevelAtts = attachments.filter((a) => !a.checklist_id);
  const fileAtts = taskLevelAtts.filter(
    (a) => a.file_url && a.doc_type !== 'task_note' && a.doc_type !== 'checklist_inline_note',
  );
  const uploadedNotes = taskLevelAtts.filter(
    (a) => a.doc_type === 'task_note' || (!a.file_url && (a.notes || a.name)),
  );

  return (
    <div className="space-y-3 pt-1">
      <p className="text-[11px] text-slate-500 leading-relaxed rounded-lg border border-amber-100 bg-amber-50/80 px-2.5 py-1.5">
        File tiến trình Sales (bản vẽ, render, bảng mô tả) nộp tại đây. Không đưa vào tab Bình luận — file bình luận không thay thế công việc và dễ bị xóa.
      </p>
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
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAddingAttNote((v) => !v)}
              className="text-[10px] text-emerald-700 hover:text-emerald-900 flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded hover:bg-emerald-50"
            >
              <Plus className="h-3 w-3" /> Ghi chú
            </button>
            <button
              type="button"
              onClick={uploadFiles}
              className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50"
            >
              <FileUp className="h-3 w-3" /> Upload file
            </button>
          </div>
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

      {addingAttNote && (
        <div className="p-2 rounded-lg border border-emerald-200 bg-emerald-50/50 space-y-1.5">
          <input
            value={attNoteName}
            onChange={(e) => setAttNoteName(e.target.value)}
            placeholder="Tiêu đề (tuỳ chọn)"
            className="w-full px-2 py-1 border rounded text-xs outline-none focus:border-emerald-400"
          />
          <textarea
            value={attNoteText}
            onChange={(e) => setAttNoteText(e.target.value)}
            rows={2}
            placeholder="Nội dung ghi chú đính kèm…"
            className="w-full px-2 py-1 border rounded text-xs outline-none focus:border-emerald-400 resize-y"
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => { setAddingAttNote(false); setAttNoteText(''); setAttNoteName(''); }}
              className="px-2 py-0.5 text-[10px] text-gray-600 hover:bg-gray-100 rounded cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={addAttachmentNote}
              className="px-2 py-0.5 text-[10px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 cursor-pointer"
            >
              Lưu ghi chú
            </button>
          </div>
        </div>
      )}

      {uploadedNotes.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">
            Ghi chú đã lưu ({uploadedNotes.length})
          </label>
          {uploadedNotes.map((att) => (
            <UploadedNoteCard
              key={att.id}
              att={att}
              expanded={expandedNoteId === att.id}
              onToggle={() => setExpandedNoteId((id) => (id === att.id ? null : att.id))}
              onDelete={() => deleteAttachment(att.id)}
            />
          ))}
        </div>
      )}

      {fileAtts.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">
            Đính kèm ({fileAtts.length})
          </label>
          {fileAtts.map((att) => (
            <FileAttachmentCard
              key={att.id}
              att={att}
              allAtts={fileAtts}
              onOpenLightbox={openLightbox}
              onDelete={() => deleteAttachment(att.id)}
            />
          ))}
        </div>
      )}

      {lightboxIndex != null && lightboxItems.length > 0 && (
        <UploadFileLightbox
          items={lightboxItems}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => {
            setLightboxIndex(null);
            setLightboxItems([]);
          }}
        />
      )}

      {fileAtts.length === 0 && uploadedNotes.length === 0 && !notes?.trim() && (
        <p className="text-[10px] text-gray-400 italic">Chưa có ghi chú hoặc file đính kèm</p>
      )}
    </div>
  );
}

function AssignmentComments({ task }) {
  const showOnScreen = useCommentShowOnScreenEnabled();
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

  useEffect(() => {
    if (!showOnScreen) {
      setComments([]);
      setLoading(false);
      return;
    }
    void load();
  }, [showOnScreen, load]);

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

  if (!showOnScreen) return <CommentDisplayHiddenBanner />;
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
  const showOnScreen = useCommentShowOnScreenEnabled();
  const taskId = task.source_id;
  const [comments, setComments] = useState([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!showOnScreen) {
      setComments([]);
      setLoading(false);
      return undefined;
    }
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
  }, [showOnScreen, taskId]);

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

  if (!showOnScreen) return <CommentDisplayHiddenBanner />;
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
