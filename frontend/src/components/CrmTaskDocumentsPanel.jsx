import { useMemo } from 'react';
import { publicFileUrl, getFileOpenAnchorProps, getFileDownloadAnchorProps } from '../lib/publicFileUrl';
import { buildCrmTaskDocumentSections } from '../lib/crmTaskDocumentTree';

function getFileIcon(name) {
  const ext = (name || '').split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️';
  if (['mp4', 'mov', 'webm', 'avi'].includes(ext)) return '🎬';
  if (['pdf'].includes(ext)) return '📕';
  if (['doc', 'docx'].includes(ext)) return '📘';
  if (['xls', 'xlsx'].includes(ext)) return '📗';
  if (['dwg', 'dxf'].includes(ext)) return '📐';
  return '📎';
}

function isNoteArtifact(f) {
  const dt = f?.doc_type;
  return dt === 'task_note' || dt === 'checklist_inline_note' || dt === 'task_inline_note';
}

function TaskArtifactRow({ f, onOpenImage }) {
  const isVideo = f.doc_type === 'video' || f.mime_type?.startsWith('video/')
    || /\.(mp4|mov|webm|avi)$/i.test(f.file_name || '');
  const isImage = f.doc_type === 'image' || f.mime_type?.startsWith('image/')
    || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.file_name || '');
  const isNote = isNoteArtifact(f);
  const rawFileRef = f.file_url || f.file_path || '';
  const taskFileOpen = rawFileRef ? getFileOpenAnchorProps(rawFileRef, { fileName: f.file_name }) : null;
  const taskFileDownload = rawFileRef
    ? getFileDownloadAnchorProps(rawFileRef, { fileName: f.file_name || f.name || 'tai-lieu' })
    : null;

  return (
    <div className="px-4 py-2 hover:bg-blue-50 transition">
      <div className="flex items-center gap-3">
        <span className="text-lg">{isNote ? '📝' : isVideo ? '🎬' : getFileIcon(f.file_name)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">
            {isNote ? (f.name || 'Ghi chú') : (f.file_name || f.name)}
          </p>
          {f.notes && <p className="text-[10px] text-gray-500 truncate mt-0.5 whitespace-pre-wrap">{f.notes}</p>}
          <div className="flex items-center gap-2 mt-0.5">
            {f.file_size > 0 && (
              <span className="text-[10px] text-gray-400">
                {f.file_size > 1024 * 1024
                  ? `${(f.file_size / 1024 / 1024).toFixed(1)} MB`
                  : `${(f.file_size / 1024).toFixed(1)} KB`}
              </span>
            )}
            {f.created_at && (
              <span className="text-[10px] text-gray-400">
                {new Date(f.created_at).toLocaleDateString('vi-VN')}
              </span>
            )}
            {isImage && rawFileRef && onOpenImage ? (
              <button type="button" onClick={() => onOpenImage(rawFileRef)} className="text-[10px] text-blue-500 hover:underline cursor-pointer">
                Xem ảnh
              </button>
            ) : null}
            {taskFileOpen && !isImage && <a {...taskFileOpen} className="text-[10px] text-blue-500 hover:underline">Mở ↗</a>}
            {taskFileDownload && <a {...taskFileDownload} className="text-[10px] text-emerald-600 hover:underline">Tải ↓</a>}
          </div>
        </div>
      </div>
      {isVideo && rawFileRef && (
        <div className="mt-2 ml-8">
          <video
            src={publicFileUrl(rawFileRef)}
            controls
            preload="metadata"
            className="max-w-full max-h-64 rounded-lg border border-gray-200 bg-black shadow-sm"
          />
        </div>
      )}
      {isImage && rawFileRef && (
        <div className="mt-2 ml-8">
          <button type="button" onClick={() => onOpenImage?.(rawFileRef)} className="block text-left">
            <img
              src={publicFileUrl(rawFileRef)}
              alt={f.name}
              className="max-h-40 max-w-full rounded-lg border border-gray-200 object-contain hover:opacity-90 cursor-zoom-in"
            />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Hiển thị file/ghi chú từ crm_task_attachments — cấu trúc khớp tab Nhiệm vụ.
 */
export default function CrmTaskDocumentsPanel({
  tasks = [],
  artifacts = [],
  pipelineStages = [],
  leadCurrentStageId = null,
  leadType = 'lead',
  title = 'File nhiệm vụ',
  onOpenImage,
}) {
  const { sections, totalCount } = useMemo(
    () => buildCrmTaskDocumentSections({
      tasks,
      artifacts,
      pipelineStages,
      leadCurrentStageId,
      leadType,
    }),
    [tasks, artifacts, pipelineStages, leadCurrentStageId, leadType],
  );

  if (!totalCount) return null;

  return (
    <div className="mb-4">
      <p className="text-xs font-bold text-gray-500 uppercase mb-2">
        📂 {title} ({totalCount})
      </p>
      <div className="space-y-4">
        {sections.map((stage) => (
          <div key={stage.stageKey} className="border rounded-xl overflow-hidden">
            <div
              className="bg-gradient-to-r from-gray-50 to-gray-100 px-3 py-2 border-b flex items-center gap-2"
              style={stage.stageColor ? { borderLeftColor: stage.stageColor, borderLeftWidth: 3 } : undefined}
            >
              <p className="text-xs font-bold text-gray-700">
                {stage.stageIcon ? `${stage.stageIcon} ` : ''}{stage.stageLabel}
              </p>
              {stage.fileCount > 0 && (
                <span className="text-[10px] text-gray-400 bg-white px-2 py-0.5 rounded-full">
                  📎 {stage.fileCount}
                </span>
              )}
              {stage.noteCount > 0 && (
                <span className="text-[10px] text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">
                  📝 {stage.noteCount}
                </span>
              )}
            </div>
            <div className="divide-y">
              {stage.tasks.map((task) => (
                <div key={task.taskId}>
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Nhiệm vụ</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-gray-900 leading-snug">{task.taskTitle}</span>
                      {task.fileCount > 0 && (
                        <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
                          📎 {task.fileCount} file
                        </span>
                      )}
                      {task.noteCount > 0 && (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                          📝 {task.noteCount} ghi chú
                        </span>
                      )}
                    </div>
                  </div>
                  {task.checklistGroups.map((ckGroup) => (
                    <div key={`${task.taskId}-${ckGroup.checklistId}`}>
                      {ckGroup.checklistTitle && (
                        <div className="bg-emerald-50/80 px-4 py-2 border-b border-emerald-100 border-l-4 border-l-emerald-500">
                          <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-0.5">Checklist</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-emerald-950 leading-snug">{ckGroup.checklistTitle}</span>
                            <span className="text-[10px] text-emerald-700 font-medium">{ckGroup.artifacts.length} mục</span>
                          </div>
                        </div>
                      )}
                      <div className="divide-y divide-gray-50">
                        {ckGroup.artifacts.map((f) => (
                          <TaskArtifactRow key={f.id} f={f} onOpenImage={onOpenImage} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
