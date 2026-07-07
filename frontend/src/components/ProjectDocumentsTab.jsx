import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { publicFileUrl, getFileOpenAnchorProps } from '../lib/publicFileUrl';
import UploadFileLightbox, {
  buildUploadLightboxItem,
  collectUploadLightboxItems,
  findUploadLightboxIndex,
} from './UploadFileLightbox';
import {
  FileText, Paperclip, ChevronDown, ChevronRight, CheckCircle2, ShieldCheck,
  FolderOpen, ClipboardList, StickyNote, ExternalLink, Download, ZoomIn
} from 'lucide-react';
import { formatDateTime, getInitials, avatarColor } from '../lib/utils';
import {
  parseShareModules,
  cleanShareModulesForApi,
  shareModuleLabels,
} from '../lib/documentShareScope';
import DocumentShareModulePicker from './DocumentShareModulePicker';

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
  const [leadDocuments, setLeadDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedStage, setExpandedStage] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Parallel fetch — 2 requests only (no N+1!)
      const [leadDocsRes, approvalsRes] = await Promise.allSettled([
        api.get(`/crm/project/${projectId}/lead-documents`, { params: { for_module: 'workshop' } }),
        api.get(`/approvals/project/${projectId}`),
      ]);

      if (leadDocsRes.status === 'fulfilled') {
        setLeadDocuments(leadDocsRes.value.data || []);
      }

      if (approvalsRes.status === 'fulfilled') {
        const approved = (approvalsRes.value.data.approvals || [])
          .filter(a => a.status === 'approved' || a.status === 'auto_approved');
        setApprovals(approved);
      }
    } catch {}
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const dealImageGallery = useMemo(
    () => collectUploadLightboxItems(leadDocuments),
    [leadDocuments],
  );

  const openDealImage = useCallback((rawPath) => {
    const path = String(rawPath || '').trim();
    if (!path) return;
    const idx = findUploadLightboxIndex(dealImageGallery, path);
    if (idx >= 0) {
      setLightbox({ items: dealImageGallery, index: idx });
      return;
    }
    const item = buildUploadLightboxItem({ file_url: path, file_path: path });
    if (item) setLightbox({ items: [item], index: 0 });
  }, [dealImageGallery]);

  if (loading) return (
    <div className="flex items-center justify-center py-10">
      <svg className="animate-spin h-5 w-5 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
    </div>
  );

  // Use tasks + checklists from project (already loaded by ProjectDetail)
  const tasks = project?.tasks || [];

  const STAGE_FLOW = [
    { slug: 'consulting', status: 'consulting', label: 'Tư vấn' },
    { slug: 'design', status: 'designing', label: 'Thiết kế' },
    { slug: 'quotation', status: 'quoting', label: 'Báo giá' },
    { slug: 'contract', status: 'contract_signed', label: 'Hợp đồng' },
    { slug: 'production', status: 'producing', label: 'Sản xuất' },
    { slug: 'delivery', status: 'shipping', label: 'Vận chuyển' },
    { slug: 'customer-care', status: 'warranty', label: 'CSKH' },
  ];

  // Build stage documents
  const stageDocuments = STAGE_FLOW.map(sf => {
    const stageApprovals = approvals.filter(a => a.stage?.slug === sf.slug);
    const stageTasks = tasks.filter(t => t.stage?.slug === sf.slug);

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

    // Use checklists already included in project.tasks (loaded by ProjectDetail)
    const taskDocs = stageTasks.map(task => {
      const taskChecklists = task.checklists || [];
      const checklistDocs = taskChecklists
        .filter(c => c.notes?.trim() || (c.attachments || []).length > 0)
        .map(c => ({
          type: 'checklist',
          title: c.title,
          notes: c.notes,
          attachments: c.attachments || [],
          is_completed: c.is_completed,
        }));
      return { task, checklists: checklistDocs };
    }).filter(td => td.checklists.length > 0);

    const hasContent = approvalDocs.length > 0 || taskDocs.length > 0;

    let totalFiles = 0;
    approvalDocs.forEach(d => { totalFiles += d.attachments.length; });
    taskDocs.forEach(td => td.checklists.forEach(c => { totalFiles += c.attachments.length; }));

    return { ...sf, approvalDocs, taskDocs, hasContent, totalFiles };
  });

  const totalDocs = stageDocuments.filter(s => s.hasContent).length;

  return (
    <div className="space-y-4">
      {/* Lead Documents Section */}
      {leadDocuments.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 overflow-hidden">
          <div className="flex items-center gap-2 p-4 pb-3">
            <FileText className="h-5 w-5 text-amber-600" />
            <h3 className="text-sm font-bold text-amber-900">📋 Tài liệu từ Lead / Deal</h3>
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{leadDocuments.length} tài liệu</span>
          </div>
          <div className="px-4 pb-4 space-y-2">
            {leadDocuments.map(doc => (
              <LeadDocumentCard key={doc.id} doc={doc} onVisibilitySaved={load} onOpenImage={openDealImage} />
            ))}
          </div>
        </div>
      )}

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
                          <span className="text-[10px] text-gray-500">bởi {doc.requester.full_name}</span>
                        )}
                        <span className="text-[10px] text-gray-400">· {formatDateTime(doc.decided_at || doc.created_at)}</span>
                      </div>

                      {doc.notes && (
                        <div className="bg-white rounded-lg p-2.5 mb-2">
                          <label className="text-[9px] font-semibold text-gray-400 uppercase block mb-0.5">📝 Ghi chú chuyển giao</label>
                          <p className="text-xs text-gray-700 whitespace-pre-wrap">{doc.notes}</p>
                        </div>
                      )}

                      {doc.approve_notes && (
                        <div className="bg-white rounded-lg p-2.5 mb-2">
                          <label className="text-[9px] font-semibold text-emerald-500 uppercase block mb-0.5">
                            ✅ Ghi chú duyệt {doc.decider ? `(${doc.decider.full_name})` : ''}
                          </label>
                          <p className="text-xs text-gray-700 whitespace-pre-wrap">{doc.approve_notes}</p>
                        </div>
                      )}

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

      {/* Empty stages */}
      {stageDocuments.filter(s => !s.hasContent).length > 0 && (
        <div className="text-[10px] text-gray-400 flex flex-wrap gap-1">
          <span>Chưa có tài liệu:</span>
          {stageDocuments.filter(s => !s.hasContent).map(s => (
            <span key={s.slug} className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{s.label}</span>
          ))}
        </div>
      )}

      {totalDocs === 0 && !leadDocuments.length && (
        <div className="text-center py-10 text-gray-400">
          <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Chưa có tài liệu quy trình</p>
          <p className="text-[10px] mt-1">Tài liệu sẽ tự động xuất hiện khi các giai đoạn được duyệt</p>
        </div>
      )}

      {lightbox?.items?.length > 0 && (
        <UploadFileLightbox
          items={lightbox.items}
          index={lightbox.index}
          onIndexChange={(index) => setLightbox((prev) => (prev ? { ...prev, index } : prev))}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

// ═══ Lead Document Card — expandable with full detail ═══
const DOC_TYPE_MAP = {
  requirement: { label: 'Yêu cầu KH', icon: '📝', color: 'text-blue-600 bg-blue-50' },
  drawing: { label: 'Bản vẽ', icon: '📐', color: 'text-purple-600 bg-purple-50' },
  image: { label: 'Hình ảnh', icon: '🖼️', color: 'text-pink-600 bg-pink-50' },
  contract: { label: 'Hợp đồng', icon: '📄', color: 'text-emerald-600 bg-emerald-50' },
  measurement: { label: 'Số đo', icon: '📏', color: 'text-orange-600 bg-orange-50' },
  note: { label: 'Ghi chú', icon: '📝', color: 'text-amber-600 bg-amber-50' },
  other: { label: 'Khác', icon: '📎', color: 'text-gray-600 bg-gray-50' },
};

function LeadDocumentCard({ doc, onVisibilitySaved, onOpenImage }) {
  const [expanded, setExpanded] = useState(false);
  const [showVis, setShowVis] = useState(false);
  const [sharedToWorkshop, setSharedToWorkshop] = useState(!!doc.shared_to_workshop);
  const [allowedShareModules, setAllowedShareModules] = useState(() => parseShareModules(doc.allowed_share_modules) || []);
  const [savingVis, setSavingVis] = useState(false);
  const typeInfo = DOC_TYPE_MAP[doc.doc_type] || DOC_TYPE_MAP.other;
  const rawFileRef = doc.file_url || doc.file_path || '';
  const fileHref = rawFileRef ? publicFileUrl(rawFileRef) : '';
  const fileOpenProps = fileHref ? getFileOpenAnchorProps(rawFileRef, { fileName: doc.file_name }) : null;
  const isFile = !!fileHref;
  const isImage = doc.doc_type === 'image' || doc.mime_type?.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(doc.file_url || doc.file_name || '');
  const hasNotes = doc.notes?.trim();
  const hasContent = hasNotes || isFile;

  const saveVisibility = async () => {
    if (!doc.id) return;
    setSavingVis(true);
    try {
      await api.put(`/crm/documents/${doc.id}/visibility`, {
        allowed_companies: doc.allowed_companies ?? null,
        allowed_departments: doc.allowed_departments ?? null,
        shared_to_workshop: !!sharedToWorkshop,
        allowed_share_modules: sharedToWorkshop ? cleanShareModulesForApi(allowedShareModules) : null,
      });
      setShowVis(false);
      onVisibilitySaved?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu phân quyền');
    }
    setSavingVis(false);
  };

  return (
    <div className="bg-white rounded-lg border border-amber-100 overflow-hidden hover:shadow-sm transition-shadow">
      {/* Header - always visible */}
      <div
        className={`flex items-center gap-3 p-3 ${hasContent ? 'cursor-pointer hover:bg-amber-50/50' : ''}`}
        onClick={() => hasContent && setExpanded(!expanded)}
      >
        <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${typeInfo.color}`}>
          {typeInfo.icon} {typeInfo.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{doc.name}</p>
          <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
            {doc.creator && <span>{doc.creator.full_name}</span>}
            {doc.created_at && <span>• {formatDateTime(doc.created_at)}</span>}
            {isFile && <span>• {doc.file_name}</span>}
            {doc.file_size && <span>• {(doc.file_size / 1024).toFixed(0)} KB</span>}
            {(doc.allowed_departments?.length > 0 || doc.allowed_companies?.length > 0) && (
              <span className="bg-red-50 text-red-600 px-1 py-0.5 rounded-full font-medium">🔒 Giới hạn</span>
            )}
            {doc.shared_to_workshop && (
              <span className="bg-teal-50 text-teal-700 px-1 py-0.5 rounded-full font-medium" title="Khối được xem">
                🧩 {shareModuleLabels(doc.allowed_share_modules)}
              </span>
            )}
          </div>
        </div>

        {/* Quick preview: truncated notes or image thumbnail */}
        {isImage && fileHref && onOpenImage && !expanded && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenImage(rawFileRef); }}
            className="shrink-0 hidden sm:block rounded-lg overflow-hidden border border-amber-200 hover:ring-2 hover:ring-blue-400 transition-shadow cursor-zoom-in"
            title="Phóng to ảnh"
          >
            <img src={fileHref} alt="" className="h-10 w-10 object-cover" loading="lazy" />
          </button>
        )}
        {hasNotes && !expanded && !isImage && (
          <p className="text-xs text-gray-500 truncate max-w-[200px] hidden sm:block">{doc.notes}</p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {doc.id && onVisibilitySaved && (
            <button
              type="button"
              title="Chia sẻ khối SX / VC / CV"
              onClick={(e) => { e.stopPropagation(); setShowVis((v) => !v); }}
              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              ⚙️
            </button>
          )}
          {isImage && fileHref && onOpenImage && (
            <button
              type="button"
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              onClick={(e) => { e.stopPropagation(); onOpenImage(rawFileRef); }}
              title="Phóng to ảnh"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          )}
          {isFile && fileOpenProps && !isImage && (
            <a {...fileOpenProps}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              onClick={e => e.stopPropagation()} title="Mở file">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {hasContent && (
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          )}
        </div>
      </div>

      {showVis && (
        <div className="border-t border-amber-100 p-3 bg-white space-y-3" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs font-bold text-gray-700">🔐 Chia sẻ khối</p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={sharedToWorkshop} onChange={(e) => setSharedToWorkshop(e.target.checked)} />
            Hiển thị ngoài CRM (SX / VC / Công việc dự án)
          </label>
          {sharedToWorkshop && (
            <DocumentShareModulePicker value={allowedShareModules} onChange={setAllowedShareModules} />
          )}
          <button
            type="button"
            onClick={saveVisibility}
            disabled={savingVis}
            className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            {savingVis ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-amber-100 p-3 space-y-3 bg-amber-50/30">
          {/* Text content */}
          {hasNotes && (
            <div className="bg-white rounded-lg p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 mb-2">
                <StickyNote className="h-3 w-3 text-amber-500" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase">Nội dung</span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{doc.notes}</p>
            </div>
          )}

          {/* File preview */}
          {isFile && (
            <div className="bg-white rounded-lg p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 mb-2">
                <Paperclip className="h-3 w-3 text-blue-500" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase">File đính kèm</span>
              </div>

              {isImage ? (
                fileHref && onOpenImage ? (
                  <button type="button" onClick={() => onOpenImage(rawFileRef)} className="block text-left group/img">
                    <img src={fileHref} alt={doc.name} loading="lazy"
                      className="max-h-64 rounded-lg border object-contain cursor-zoom-in hover:opacity-90 hover:ring-2 hover:ring-blue-400 transition-all" />
                    <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 mt-1.5 opacity-80 group-hover/img:opacity-100">
                      <ZoomIn className="h-3 w-3" /> Click để phóng to
                    </span>
                  </button>
                ) : null
              ) : fileOpenProps ? (
                <a {...fileOpenProps}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <FileText className="h-8 w-8 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-blue-600 truncate">{doc.file_name || doc.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                      {doc.mime_type && <span>{doc.mime_type}</span>}
                      {doc.file_size && <span>{(doc.file_size / 1024).toFixed(0)} KB</span>}
                    </div>
                  </div>
                  <Download className="h-4 w-4 text-gray-400" />
                </a>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FileItem({ file: f, index, small }) {
  const isImage = f.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(f.file_url || f.file_name || '');
  const href = f.file_url ? publicFileUrl(f.file_url) : '';
  const openProps = f.file_url ? getFileOpenAnchorProps(f.file_url, { fileName: f.file_name }) : null;

  const inner = (
    <>
      {isImage ? (
        <img src={href || undefined} alt="" className={`${small ? 'h-6 w-6' : 'h-8 w-8'} rounded object-cover shrink-0`} loading="lazy" />
      ) : (
        <FileText className={`${small ? 'h-3 w-3' : 'h-4 w-4'} text-gray-400 shrink-0`} />
      )}
      <span className={`${small ? 'text-[10px]' : 'text-xs'} text-blue-600 truncate flex-1`}>{f.file_name || `File ${index + 1}`}</span>
      {f.file_size && <span className="text-[9px] text-gray-400 shrink-0">{(f.file_size / 1024).toFixed(0)} KB</span>}
    </>
  );

  if (!openProps) {
    return (
      <div className={`flex items-center gap-2 bg-gray-50 rounded-lg text-gray-400 ${small ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
        {inner}
      </div>
    );
  }

  return (
    <a {...openProps}
      className={`flex items-center gap-2 bg-white rounded-lg hover:bg-gray-50 transition-colors ${small ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
      {inner}
    </a>
  );
}
