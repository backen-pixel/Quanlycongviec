import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  FileText, Paperclip, ChevronDown, ChevronRight, CheckCircle2, ShieldCheck,
  FolderOpen, ClipboardList, StickyNote, Image
} from 'lucide-react';
import { formatDateTime, getInitials, avatarColor } from '../lib/utils';

const ICON_NAME_TO_EMOJI = {
  MessageSquare: '💬', Palette: '🎨', Calculator: '💰', FileText: '📝',
  Hammer: '🏭', Truck: '🚛', Wrench: '🔧', Heart: '❤️',
  ClipboardList: '📋', Package: '📦',
};

function stageIcon(s) {
  if (!s?.icon) return '📋';
  if (s.icon.charCodeAt(0) > 127) return s.icon;
  return ICON_NAME_TO_EMOJI[s.icon] || '📋';
}

export default function ProjectDocumentsTab({ projectId, project }) {
  const [approvals, setApprovals] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [checklists, setChecklists] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedStage, setExpandedStage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load approved/auto-approved approvals
      const { data: appData } = await api.get(`/approvals/project/${projectId}`);
      const approved = (appData.approvals || []).filter(a => a.status === 'approved' || a.status === 'auto_approved');
      setApprovals(approved);

      // Load tasks with stage info
      const projTasks = project?.tasks || [];
      setTasks(projTasks);

      // Load checklists for all tasks
      const checklistMap = {};
      for (const task of projTasks) {
        try {
          const { data } = await api.get(`/tasks/${task.id}`);
          if (data.task?.checklists?.length) {
            checklistMap[task.id] = data.task.checklists;
          }
        } catch {}
      }
      setChecklists(checklistMap);
    } catch {}
    setLoading(false);
  }, [projectId, project?.tasks]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-10">
      <svg className="animate-spin h-5 w-5 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
    </div>
  );

  // Group approvals by stage
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

  // Build stage documents
  const stageDocuments = STAGE_FLOW.map(sf => {
    // Approvals for this stage
    const stageApprovals = approvals.filter(a => a.stage?.slug === sf.slug);

    // Tasks for this stage
    const stageTasks = tasks.filter(t => t.stage?.slug === sf.slug);

    // Collect all files and notes from approvals
    const approvalDocs = stageApprovals.map(a => ({
      type: 'approval',
      status: a.status,
      notes: a.notes,
      approve_notes: a.approve_notes,
      attachments: a.attachments || [],
      requester: a.requester,
      decider: a.decider,
      created_at: a.created_at,
      decided_at: a.decided_at,
    }));

    // Collect files/notes from task checklists
    const taskDocs = stageTasks.map(task => {
      const taskChecklists = checklists[task.id] || [];
      const checklistDocs = taskChecklists
        .filter(c => c.notes?.trim() || (c.attachments || []).length > 0)
        .map(c => ({
          type: 'checklist',
          title: c.title,
          notes: c.notes,
          attachments: c.attachments || [],
          is_completed: c.is_completed,
        }));
      return {
        task,
        checklists: checklistDocs,
      };
    }).filter(td => td.checklists.length > 0);

    const hasContent = approvalDocs.length > 0 || taskDocs.length > 0;

    // Count total files
    let totalFiles = 0;
    approvalDocs.forEach(d => { totalFiles += d.attachments.length; });
    taskDocs.forEach(td => td.checklists.forEach(c => { totalFiles += c.attachments.length; }));

    return { ...sf, approvalDocs, taskDocs, hasContent, totalFiles };
  });

  const totalDocs = stageDocuments.filter(s => s.hasContent).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FolderOpen className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-medium text-gray-700">Tài liệu quy trình</span>
        <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{totalDocs} giai đoạn có tài liệu</span>
      </div>

      <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
        💡 Tổng hợp ghi chú & file từ các lần duyệt/tự động duyệt + checklist nhiệm vụ — sắp xếp theo quy trình
      </div>

      {/* Stage sections */}
      <div className="space-y-2">
        {stageDocuments.map(sd => {
          const isExpanded = expandedStage === sd.slug;
          if (!sd.hasContent) return null;

          return (
            <div key={sd.slug} className="bg-white rounded-xl border overflow-hidden">
              {/* Stage header */}
              <button
                onClick={() => setExpandedStage(isExpanded ? null : sd.slug)}
                className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="w-1.5 h-10 rounded-full shrink-0 bg-emerald-400" />
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <div className="flex-1 text-left">
                  <h3 className="text-sm font-bold text-gray-900">{sd.label}</h3>
                  <div className="flex items-center gap-2 text-[10px] text-gray-500">
                    {sd.approvalDocs.length > 0 && (
                      <span className="flex items-center gap-0.5">
                        <ShieldCheck className="h-2.5 w-2.5" /> {sd.approvalDocs.length} lần duyệt
                      </span>
                    )}
                    {sd.taskDocs.length > 0 && (
                      <span className="flex items-center gap-0.5">
                        <ClipboardList className="h-2.5 w-2.5" /> {sd.taskDocs.length} NV có tài liệu
                      </span>
                    )}
                    {sd.totalFiles > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Paperclip className="h-2.5 w-2.5" /> {sd.totalFiles} file
                      </span>
                    )}
                  </div>
                </div>
                {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-3 border-t border-gray-100">

                  {/* Approval documents */}
                  {sd.approvalDocs.map((doc, di) => (
                    <div key={`approval-${di}`} className="bg-emerald-50/50 rounded-lg p-3 mt-3">
                      <div className="flex items-center gap-2 mb-2">
                        {doc.status === 'auto_approved' ? (
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                        <span className="text-[10px] font-semibold text-emerald-700 uppercase">
                          {doc.status === 'auto_approved' ? 'Tự động duyệt' : 'Đã duyệt'}
                        </span>
                        {doc.requester && (
                          <span className="text-[10px] text-gray-500">
                            bởi {doc.requester.full_name}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">· {formatDateTime(doc.decided_at || doc.created_at)}</span>
                      </div>

                      {/* Notes from requester */}
                      {doc.notes && (
                        <div className="bg-white rounded-lg p-2.5 mb-2">
                          <label className="text-[9px] font-semibold text-gray-400 uppercase block mb-0.5">📝 Ghi chú chuyển giao</label>
                          <p className="text-xs text-gray-700 whitespace-pre-wrap">{doc.notes}</p>
                        </div>
                      )}

                      {/* Approve notes from manager */}
                      {doc.approve_notes && (
                        <div className="bg-white rounded-lg p-2.5 mb-2">
                          <label className="text-[9px] font-semibold text-emerald-500 uppercase block mb-0.5">
                            ✅ Ghi chú duyệt {doc.decider ? `(${doc.decider.full_name})` : ''}
                          </label>
                          <p className="text-xs text-gray-700 whitespace-pre-wrap">{doc.approve_notes}</p>
                        </div>
                      )}

                      {/* Files */}
                      {doc.attachments.length > 0 && (
                        <div className="space-y-1">
                          {doc.attachments.map((f, fi) => (
                            <FileItem key={fi} file={f} index={fi} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Task → Checklist documents */}
                  {sd.taskDocs.map((td, ti) => (
                    <div key={`task-${ti}`} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <ClipboardList className="h-3.5 w-3.5 text-blue-600" />
                        <span className="text-xs font-bold text-gray-800">{td.task.title}</span>
                        {td.task.assignee && (
                          <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                            style={{ backgroundColor: avatarColor(td.task.assignee.full_name) }}
                            title={td.task.assignee.full_name}>
                            {getInitials(td.task.assignee.full_name)}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 ml-5">
                        {td.checklists.map((cl, ci) => (
                          <div key={ci} className="bg-white rounded-lg p-2.5">
                            <div className="flex items-center gap-2 mb-1">
                              {cl.is_completed ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <div className="w-3 h-3 rounded-full border-2 border-gray-300" />
                              )}
                              <span className="text-[11px] font-medium text-gray-700">{cl.title}</span>
                            </div>

                            {cl.notes && (
                              <div className="ml-5 mb-1">
                                <p className="text-[10px] text-gray-600 whitespace-pre-wrap flex items-start gap-1">
                                  <StickyNote className="h-2.5 w-2.5 text-amber-500 mt-0.5 shrink-0" />
                                  {cl.notes}
                                </p>
                              </div>
                            )}

                            {cl.attachments.length > 0 && (
                              <div className="ml-5 space-y-1">
                                {cl.attachments.map((f, fi) => (
                                  <FileItem key={fi} file={f} index={fi} small />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty stages (no content) */}
      {stageDocuments.filter(s => !s.hasContent).length > 0 && (
        <div className="text-[10px] text-gray-400 flex flex-wrap gap-1">
          <span>Chưa có tài liệu:</span>
          {stageDocuments.filter(s => !s.hasContent).map(s => (
            <span key={s.slug} className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{s.label}</span>
          ))}
        </div>
      )}

      {totalDocs === 0 && (
        <div className="text-center py-10 text-gray-400">
          <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Chưa có tài liệu quy trình</p>
          <p className="text-[10px] mt-1">Tài liệu sẽ tự động xuất hiện khi các giai đoạn được duyệt</p>
        </div>
      )}
    </div>
  );
}

// ═══ File display component ═══
function FileItem({ file: f, index, small }) {
  const isImage = f.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(f.file_url || f.file_name || '');

  return (
    <a href={f.file_url} target="_blank" rel="noopener noreferrer"
      className={`flex items-center gap-2 bg-white rounded-lg hover:bg-gray-50 transition-colors ${small ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
      {isImage ? (
        <img src={f.file_url} alt="" className={`${small ? 'h-6 w-6' : 'h-8 w-8'} rounded object-cover shrink-0`} />
      ) : (
        <FileText className={`${small ? 'h-3 w-3' : 'h-4 w-4'} text-gray-400 shrink-0`} />
      )}
      <span className={`${small ? 'text-[10px]' : 'text-xs'} text-blue-600 truncate flex-1`}>{f.file_name || `File ${index + 1}`}</span>
      {f.file_size && <span className="text-[9px] text-gray-400 shrink-0">{(f.file_size / 1024).toFixed(0)} KB</span>}
    </a>
  );
}
