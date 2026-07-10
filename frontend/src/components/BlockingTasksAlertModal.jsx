import { useState, useEffect } from 'react';
import { AlertCircle, X, Lock, CheckCircle2, Paperclip, MessageSquare, Loader2, FileText, Image as ImageIcon, Film } from 'lucide-react';
import api from '../lib/api';
import TaskQuickVerdictBar from './TaskQuickVerdictBar';
import { publicFileUrl, getFileOpenAnchorProps } from '../lib/publicFileUrl';
import { TASK_ATTACHMENT_FILE_ACCEPT } from '../lib/attachmentFileIcon';

function fmtDateTime(value) {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const ATT_ICONS = { image: ImageIcon, video: Film, drawing: FileText, other: FileText, task_note: MessageSquare, task_inline_note: MessageSquare };

function isTextNoteRecord(r) {
  const dt = String(r?.doc_type || '');
  if (dt === 'task_inline_note' || dt === 'task_note') return !!(r.notes || '').trim();
  return !r.file_url && !!(r.notes || '').trim();
}

function splitTaskRecords(recs, inlineTaskNote) {
  const list = Array.isArray(recs) ? recs : [];
  const textFromAtt = list.filter(isTextNoteRecord);
  const files = list.filter((r) => r.file_url);
  const texts = [];
  const seen = new Set();
  const pushText = (body, meta = {}) => {
    const key = String(body || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    texts.push({ id: meta.id || key, body: key, creator: meta.creator, created_at: meta.created_at, label: meta.label });
  };
  if (inlineTaskNote?.trim()) pushText(inlineTaskNote, { label: 'Ghi chú nhiệm vụ' });
  textFromAtt.forEach((n) => pushText(n.notes, {
    id: n.id,
    creator: n.creator?.full_name,
    created_at: n.created_at,
    label: n.doc_type === 'task_note' ? 'Ghi chú đính kèm' : 'Ghi chú',
  }));
  return { texts, files };
}

function TaskRecordedContent({ inlineTaskNote, recs, loading }) {
  if (loading) {
    return (
      <div className="mt-2 pl-7 flex items-center gap-1.5 text-[11px] text-gray-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Đang tải ghi chú & file…
      </div>
    );
  }
  const { texts, files } = splitTaskRecords(recs, inlineTaskNote);
  if (texts.length === 0 && files.length === 0) {
    return (
      <div className="mt-2 pl-7 text-[11px] text-gray-400 italic">
        Chưa có ghi chú / file minh chứng.
      </div>
    );
  }
  return (
    <div className="mt-2 pl-7 space-y-2">
      {texts.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 mb-1">📝 Ghi chú</div>
          <div className="space-y-1.5">
            {texts.map((n) => (
              <div key={n.id} className="rounded-md bg-white border border-blue-100 px-2.5 py-2">
                {n.label && n.label !== 'Ghi chú' && (
                  <p className="text-[10px] font-medium text-blue-500 mb-0.5">{n.label}</p>
                )}
                <p className="text-[12px] text-gray-800 whitespace-pre-line break-words">{n.body}</p>
                {(n.creator || n.created_at) && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    {n.creator || 'Ẩn danh'}
                    {n.created_at ? ` • ${fmtDateTime(n.created_at)}` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {files.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 mb-1">📎 File đính kèm ({files.length})</div>
          <div className="space-y-1.5">
            {files.map((f) => {
              const AttIcon = ATT_ICONS[f.doc_type] || FileText;
              const attOpen = f.file_url ? getFileOpenAnchorProps(f.file_url, { fileName: f.file_name }) : null;
              const isImage = f.mime_type?.startsWith('image/') || f.doc_type === 'image';
              const isVideo = f.mime_type?.startsWith('video/') || f.doc_type === 'video';
              return (
                <div key={f.id} className="rounded-md bg-white border border-gray-200 px-2.5 py-2">
                  <div className="flex items-start gap-2">
                    <AttIcon className="h-3.5 w-3.5 text-gray-500 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      {attOpen ? (
                        <a {...attOpen} className="text-[12px] font-medium text-blue-700 hover:underline break-words">
                          {f.name || f.file_name || 'Mở file'}
                        </a>
                      ) : (
                        <p className="text-[12px] font-medium text-gray-800">{f.name || f.file_name || 'File'}</p>
                      )}
                      {f.notes && (
                        <p className="text-[11px] text-gray-600 mt-0.5 whitespace-pre-line">{f.notes}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {f.creator?.full_name || ''}
                        {f.created_at ? ` • ${fmtDateTime(f.created_at)}` : ''}
                      </p>
                    </div>
                  </div>
                  {isImage && attOpen && (
                    <a {...attOpen} className="block mt-2">
                      <img
                        src={publicFileUrl(f.file_url)}
                        alt={f.name || f.file_name}
                        className="max-h-36 w-full rounded-lg border border-gray-200 object-contain bg-gray-50"
                      />
                    </a>
                  )}
                  {isVideo && (
                    <video
                      src={publicFileUrl(f.file_url)}
                      controls
                      preload="metadata"
                      className="mt-2 max-h-40 w-full rounded-lg border border-gray-200 bg-black"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Modal cảnh báo khi không thể chuyển giai đoạn vì còn nhiệm vụ chưa hoàn thành.
 * Hiển thị sau khi backend trả về code: 'CRM_BLOCKING_TASKS_INCOMPLETE'.
 *
 * Cho phép xử lý NGAY trong hộp: tích hoàn thành, thêm ghi chú, đính kèm file
 * (giống tab Nhiệm vụ ở chi tiết).
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - leadId: string  (bắt buộc để thao tác nhiệm vụ)
 *  - currentStageName, targetStageName: string
 *  - remainingTasks: [{ id, title, status, blocks_stage_advance? }]
 *  - onGoToTasks?: () => void
 *  - onChanged?: () => void  (gọi sau khi hoàn thành 1 nhiệm vụ — parent có thể reload)
 *  - onAllCleared?: () => void  (gọi khi đã hết nhiệm vụ chặn — parent có thể thử chuyển cột lại)
 */
export default function BlockingTasksAlertModal({
  open,
  onClose,
  leadId,
  currentStageName,
  targetStageName,
  remainingTasks = [],
  onGoToTasks,
  onChanged,
  onAllCleared,
}) {
  const [tasks, setTasks] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [errById, setErrById] = useState({});
  const [noteOpenId, setNoteOpenId] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [uploadingId, setUploadingId] = useState(null);
  // Ghi chú + đính kèm đã ghi nhận cho từng nhiệm vụ.
  const [recordsById, setRecordsById] = useState({});
  const [recordsLoadingById, setRecordsLoadingById] = useState({});
  const [taskNotesById, setTaskNotesById] = useState({});

  const loadRecords = async (taskId) => {
    if (!leadId || !taskId) return;
    setRecordsLoadingById((prev) => ({ ...prev, [taskId]: true }));
    try {
      const { data } = await api.get(`/crm/leads/${leadId}/tasks/${taskId}/attachments`);
      setRecordsById((prev) => ({ ...prev, [taskId]: Array.isArray(data) ? data : [] }));
    } catch (_) {
      setRecordsById((prev) => ({ ...prev, [taskId]: [] }));
    } finally {
      setRecordsLoadingById((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const loadAllTaskContent = async (taskList) => {
    if (!leadId || !taskList?.length) return;
    const ids = new Set(taskList.map((t) => String(t.id)));
    try {
      const { data: allTasks } = await api.get(`/crm/leads/${leadId}/tasks`);
      const notesMap = {};
      (allTasks || []).forEach((t) => {
        if (ids.has(String(t.id)) && (t.notes || '').trim()) {
          notesMap[t.id] = String(t.notes).trim();
        }
      });
      setTaskNotesById(notesMap);
    } catch (_) {
      setTaskNotesById({});
    }
    await Promise.all(taskList.map((t) => loadRecords(t.id)));
  };

  useEffect(() => {
    if (open) {
      const list = remainingTasks || [];
      setTasks(list);
      setBusyId(null);
      setErrById({});
      setNoteOpenId(null);
      setNoteText('');
      setUploadingId(null);
      setRecordsById({});
      setRecordsLoadingById({});
      setTaskNotesById({});
      loadAllTaskContent(list);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, remainingTasks, leadId]);

  if (!open) return null;

  const removeTask = (taskId) => {
    setTasks((prev) => {
      const next = prev.filter((t) => String(t.id) !== String(taskId));
      if (next.length === 0) {
        onAllCleared?.();
      }
      return next;
    });
  };

  /** Chỉ còn chặn vì thiếu minh chứng — sau khi thêm ghi chú/file có thể bỏ khỏi danh sách. */
  const tryClearAfterEvidence = (task) => {
    const stillNeedsComplete =
      task.blocks_stage_advance && task.status !== 'completed' && task.status !== 'cancelled';
    if (!stillNeedsComplete && task.block_reason === 'missing_evidence') {
      removeTask(task.id);
    }
  };

  const tryClearAfterQuickVerdict = (task, updated) => {
    if (task.block_reason !== 'missing_quick_verdict') return;
    if (updated?.quick_verdict !== 'sufficient') return;
    const stillNeedsComplete =
      task.blocks_stage_advance && task.status !== 'completed' && task.status !== 'cancelled';
    if (!stillNeedsComplete) removeTask(task.id);
  };

  const patchTaskInList = (taskId, patch) => {
    setTasks((prev) => prev.map((t) => (String(t.id) === String(taskId) ? { ...t, ...patch } : t)));
  };

  const setTaskError = (taskId, msg) => {
    setErrById((prev) => ({ ...prev, [taskId]: msg }));
  };

  const completeTask = async (task) => {
    if (!leadId) return;
    setBusyId(task.id);
    setTaskError(task.id, '');
    try {
      await api.put(`/crm/leads/${leadId}/tasks/${task.id}`, { status: 'completed' });
      onChanged?.();
      removeTask(task.id);
    } catch (e) {
      const msg = e.response?.data?.error || 'Không hoàn thành được nhiệm vụ';
      setTaskError(task.id, msg);
      // Nếu thiếu minh chứng → mở sẵn ô ghi chú để bổ sung.
      if (/minh chứng|ghi chú|đính kèm|file/i.test(msg)) {
        setNoteOpenId(task.id);
        setNoteText('');
      }
    } finally {
      setBusyId(null);
    }
  };

  const saveNote = async (task) => {
    if (!leadId) return;
    if (!noteText.trim()) {
      setTaskError(task.id, 'Nhập nội dung ghi chú trước khi lưu.');
      return;
    }
    setBusyId(task.id);
    setTaskError(task.id, '');
    try {
      const trimmed = noteText.trim();
      await api.put(`/crm/leads/${leadId}/tasks/${task.id}/notes`, { notes: trimmed });
      setTaskNotesById((prev) => ({ ...prev, [task.id]: trimmed }));
      setNoteOpenId(null);
      setNoteText('');
      await loadRecords(task.id);
      onChanged?.();
      tryClearAfterEvidence(task);
    } catch (e) {
      setTaskError(task.id, e.response?.data?.error || 'Lỗi lưu ghi chú');
    } finally {
      setBusyId(null);
    }
  };

  const compressImage = (file, maxWidth = 1920, quality = 0.8) =>
    new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.size < 500 * 1024) { resolve(file); return; }
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file), 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });

  const uploadFile = (task) => {
    if (!leadId) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = TASK_ATTACHMENT_FILE_ACCEPT;
    input.onchange = async (e) => {
      const rawFiles = Array.from(e.target.files || []).slice(0, 20);
      if (!rawFiles.length) return;
      setUploadingId(task.id);
      setTaskError(task.id, '');
      try {
        const compressed = await Promise.all(rawFiles.map((f) => compressImage(f)));
        const formData = new FormData();
        compressed.forEach((f) => formData.append('files', f));
        const { data: uploadRes } = await api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const uploaded = uploadRes.files || (Array.isArray(uploadRes) ? uploadRes : [uploadRes]);
        const items = uploaded.map((up) => ({
          name: (up.original_name || up.file_name || 'File').replace(/\.[^.]+$/, ''),
          doc_type: (up.mime_type || '').startsWith('image/') ? 'image'
            : (up.mime_type || '').startsWith('video/') ? 'video'
            : (up.file_name || '').match(/\.(dwg|dxf)$/i) ? 'drawing' : 'other',
          file_url: up.file_url,
          file_name: up.file_name,
          file_size: up.file_size,
          mime_type: up.mime_type,
        }));
        await api.post(`/crm/leads/${leadId}/tasks/${task.id}/attachments/bulk`, { items });
        await loadRecords(task.id);
        onChanged?.();
        setTaskError(task.id, '');
        tryClearAfterEvidence(task);
      } catch (err) {
        setTaskError(task.id, err.response?.data?.error || err.message || 'Upload lỗi');
      } finally {
        setUploadingId(null);
      }
    };
    input.click();
  };

  const allCleared = tasks.length === 0;
  const stageNamesInTasks = [...new Set(tasks.map((t) => t.stage_name).filter(Boolean))];
  const multiStageBlock = stageNamesInTasks.length > 1;

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className={`px-5 py-4 flex items-start gap-3 ${allCleared ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-amber-500 to-orange-500'}`}>
          <div className="shrink-0 w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
            {allCleared ? <CheckCircle2 className="h-6 w-6 text-white" /> : <AlertCircle className="h-6 w-6 text-white" />}
          </div>
          <div className="flex-1 text-white">
            {allCleared ? (
              <>
                <h3 className="text-base font-bold">✅ Đã hoàn thành nhiệm vụ chặn</h3>
                <p className="text-xs mt-0.5 text-emerald-50">Bạn có thể chuyển sang "{targetStageName || 'giai đoạn mới'}" ngay.</p>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold">⛔ Không thể chuyển giai đoạn</h3>
                <p className="text-xs mt-0.5 text-amber-50">
                  Còn <b>{tasks.length}</b> nhiệm vụ cần hoàn thành
                  {multiStageBlock ? (
                    <> ở <b>{stageNamesInTasks.length}</b> giai đoạn: {stageNamesInTasks.map((n) => `"${n}"`).join(', ')}</>
                  ) : (
                    <> ở <b>"{stageNamesInTasks[0] || currentStageName || '—'}"</b></>
                  )}
                  {tasks.some((t) => t.block_reason === 'missing_evidence') && (
                    <span className="block mt-0.5">Một số nhiệm vụ cần ghi chú hoặc file đính kèm.</span>
                  )}
                  {tasks.some((t) => t.block_reason === 'missing_quick_verdict') && (
                    <span className="block mt-0.5">Một số nhiệm vụ cần chọn «Đã đủ» trong ghi chú nhanh.</span>
                  )}
                </p>
              </>
            )}
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {allCleared ? (
            <p className="text-sm text-gray-700">
              Tất cả nhiệm vụ chặn đã xong. Bấm <b>"Chuyển giai đoạn ngay"</b> để tiếp tục.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-700 mb-3">
                Hoàn thành, thêm ghi chú hoặc đính kèm file cho các nhiệm vụ dưới đây để chuyển sang
                {' '}<b className="text-emerald-700">"{targetStageName || 'giai đoạn mới'}"</b>:
              </p>
              <div className="space-y-2">
                {tasks.map((t, i) => {
                  const isBusy = busyId === t.id;
                  const isUploading = uploadingId === t.id;
                  const err = errById[t.id];
                  return (
                    <div key={t.id || i} className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-amber-700 w-5 shrink-0">{i + 1}.</span>
                        {t.stage_name && (
                          <span className="shrink-0 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full max-w-[10rem] truncate" title={t.stage_name}>
                            {t.stage_name}
                          </span>
                        )}
                        <span className="text-sm text-gray-800 flex-1 min-w-0 truncate" title={t.title}>{t.title}</span>
                        {t.blocks_stage_advance && (
                          <span className="shrink-0 text-[10px] text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-semibold">
                            <Lock className="h-2.5 w-2.5" /> Chặn
                          </span>
                        )}
                        {t.block_reason === 'missing_evidence' && (
                          <span
                            className="shrink-0 text-[10px] text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-semibold max-w-[180px] truncate"
                            title={t.missing_label ? `Thiếu: ${t.missing_label}` : 'Thiếu ghi chú hoặc file đính kèm'}
                          >
                            <Paperclip className="h-2.5 w-2.5" /> {t.missing_label ? `Thiếu: ${t.missing_label}` : 'Thiếu file/GC'}
                          </span>
                        )}
                        {t.block_reason === 'missing_quick_verdict' && (
                          <span
                            className="shrink-0 text-[10px] text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-semibold max-w-[180px] truncate"
                            title={t.missing_label || 'Chưa chọn Đủ/Chưa'}
                          >
                            <MessageSquare className="h-2.5 w-2.5" /> {t.missing_label || 'Chưa Đủ/Chưa'}
                          </span>
                        )}
                      </div>

                      {(t.requires_quick_verdict || t.block_reason === 'missing_quick_verdict') && (
                        <div className="mt-2 pl-7">
                          <TaskQuickVerdictBar
                            compact
                            task={t}
                            leadId={leadId}
                            onUpdated={(updated) => {
                              patchTaskInList(t.id, updated);
                              onChanged?.();
                              tryClearAfterQuickVerdict(t, updated);
                            }}
                          />
                        </div>
                      )}

                      {/* Hàng nút thao tác */}
                      <div className="flex items-center gap-1.5 mt-2 pl-7">
                        <button
                          onClick={() => completeTask(t)}
                          disabled={isBusy || isUploading}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                        >
                          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Hoàn thành
                        </button>
                        <button
                          onClick={() => {
                            const inline = recordsById[t.id]?.find((r) => r.doc_type === 'task_inline_note')?.notes;
                            const existing = taskNotesById[t.id] || inline || '';
                            if (noteOpenId === t.id) {
                              setNoteOpenId(null);
                              setNoteText('');
                            } else {
                              setNoteOpenId(t.id);
                              setNoteText(existing);
                            }
                            setTaskError(t.id, '');
                          }}
                          disabled={isBusy || isUploading}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                        >
                          <MessageSquare className="h-3 w-3" /> Ghi chú
                        </button>
                        <button
                          onClick={() => uploadFile(t)}
                          disabled={isBusy || isUploading}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                        >
                          {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                          {isUploading ? 'Đang tải…' : 'Đính kèm'}
                        </button>
                      </div>

                      <TaskRecordedContent
                        inlineTaskNote={taskNotesById[t.id]}
                        recs={recordsById[t.id]}
                        loading={recordsLoadingById[t.id]}
                      />

                      {/* Ô ghi chú */}
                      {noteOpenId === t.id && (
                        <div className="mt-2 pl-7">
                          <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            rows={2}
                            autoFocus
                            placeholder="Nhập ghi chú minh chứng…"
                            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
                          />
                          <div className="flex justify-end gap-1.5 mt-1.5">
                            <button
                              onClick={() => { setNoteOpenId(null); setNoteText(''); }}
                              className="px-2.5 py-1 rounded-md text-[11px] text-gray-600 hover:bg-gray-100 cursor-pointer"
                            >
                              Huỷ
                            </button>
                            <button
                              onClick={() => saveNote(t)}
                              disabled={isBusy}
                              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                            >
                              Lưu ghi chú
                            </button>
                          </div>
                        </div>
                      )}

                      {err && (
                        <p className="mt-1.5 pl-7 text-[11px] text-red-600 whitespace-pre-line">{err}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t flex items-center justify-end gap-2">
          {allCleared && onAllCleared && (
            <button
              onClick={() => { onAllCleared(); onClose?.(); }}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
            >
              ➡️ Chuyển giai đoạn ngay
            </button>
          )}
          {!allCleared && onGoToTasks && (
            <button
              onClick={() => { onGoToTasks(); onClose?.(); }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
            >
              📋 Mở tab Nhiệm vụ
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
