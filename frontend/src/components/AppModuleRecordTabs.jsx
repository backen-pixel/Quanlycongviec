import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import AppModuleTasksTab from './AppModuleTasksTab';
import CRMTasksTab from './CRMTasksTab';
import DealSharedWorkspaceTab from './DealSharedWorkspaceTab';
import CrmChatNotesPanel from './CrmChatNotesPanel';
import CrmTaskDocumentsPanel from './CrmTaskDocumentsPanel';
import { LeadMembersTab } from './LeadChatTabs';
import { CrmLeadCommentsPanel } from './CommentsPanels';
import DriveAttachments from './drive/DriveAttachments';
import LeadVoiceRecordingsTab from './LeadVoiceRecordingsTab';
import { PO_STATUS, PO_COLORS } from '../pages/PurchasingInboxPage';
import { formatDate, formatVND } from '../lib/utils';
import { countMembersByModule } from '../lib/memberModuleCounts';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import {
  FileUp, ShoppingCart, Plus, MessageSquare, Mic, Eye, ExternalLink,
  Loader2, Send, Trash2, Globe,
} from 'lucide-react';

const TAB_DEFS = [
  { id: 'tasks', label: '✅ Công việc', title: 'Nhiệm vụ pipeline' },
  { id: 'shared-workspace', label: '🤝 Không gian chung', title: 'Phân công giao chéo', activeClass: 'text-indigo-600 border-indigo-600' },
  { id: 'purchase_orders', label: '🛒 Đặt hàng', title: 'Lệnh đặt hàng', activeClass: 'text-amber-700 border-amber-500', badgeKey: 'po' },
  { id: 'documents', label: '📋 Tài liệu', title: 'Tài liệu', badgeKey: 'docs' },
  { id: 'drive', label: '☁️ Drive', title: 'Google Drive', badgeKey: 'drive' },
  { id: 'notes', label: '📝 Ghi chú & HĐ', title: 'Ghi chú và hoạt động', badgeKey: 'notes' },
  { id: 'team', label: '👥 Thành viên', title: 'Thành viên' },
  { id: 'comments', label: '💬 Bình luận', title: 'Bình luận', badgeKey: 'comments' },
  { id: 'voice_crm', label: null, title: 'Ghi âm', activeClass: 'text-violet-600 border-violet-600' },
];

function EmptyDash({ icon: Icon, title, hint, action }) {
  return (
    <div className="text-center py-10 text-gray-400">
      {Icon && <Icon className="h-10 w-10 mx-auto mb-2 opacity-30" />}
      <p className="text-sm">{title}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {action}
    </div>
  );
}

function ModuleCommentsLocal({ comments = [], onChange, users = [] }) {
  const { user } = useAuth();
  const [body, setBody] = useState('');
  const selfId = user?.id || user?.userId;

  const post = () => {
    const text = body.trim();
    if (!text) return;
    const next = [
      {
        id: `c_${Date.now()}`,
        body: text,
        user_id: selfId,
        user_name: user?.full_name || 'Tôi',
        created_at: new Date().toISOString(),
      },
      ...comments,
    ];
    onChange(next);
    setBody('');
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Viết bình luận…"
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="button"
          onClick={post}
          disabled={!body.trim()}
          className="h-10 px-3 self-end rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1"
        >
          <Send className="h-4 w-4" /> Gửi
        </button>
      </div>
      {comments.length === 0 ? (
        <EmptyDash icon={MessageSquare} title="Chưa có bình luận" />
      ) : (
        <div className="space-y-2 max-h-[480px] overflow-y-auto">
          {comments.map((c) => {
            const name = c.user_name || users.find((u) => String(u.id) === String(c.user_id))?.full_name || 'Người dùng';
            return (
              <div key={c.id} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">{name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">{formatDate(c.created_at)}</span>
                    <button
                      type="button"
                      onClick={() => onChange(comments.filter((x) => x.id !== c.id))}
                      className="p-1 text-slate-300 hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{c.body}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Cột tab phải — thứ tự + chrome giống LeadDetail CRM.
 */
export default function AppModuleRecordTabs({
  moduleKey,
  recordId,
  record,
  stages = [],
  users = [],
  crmLeadId = null,
  onRecordPatch,
  onReload,
  onStats,
}) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('tasks');
  const [tasksRefreshKey, setTasksRefreshKey] = useState(0);
  const [crmLead, setCrmLead] = useState(null);
  const [crmActivities, setCrmActivities] = useState([]);
  const [crmDocuments, setCrmDocuments] = useState([]);
  const [crmTasks, setCrmTasks] = useState([]);
  const [dealPurchaseOrders, setDealPurchaseOrders] = useState([]);
  const [poStatusFilter, setPoStatusFilter] = useState('');
  const [commentCount, setCommentCount] = useState(0);
  const [driveFileCount, setDriveFileCount] = useState(0);
  const [memberModuleCounts, setMemberModuleCounts] = useState({ crm: 0, production: 0, logistics: 0 });
  const [loadingCrm, setLoadingCrm] = useState(false);
  const [notesDraft, setNotesDraft] = useState(record?.meta?.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [localComments, setLocalComments] = useState(() => (
    Array.isArray(record?.meta?.comments) ? record.meta.comments : []
  ));

  useEffect(() => {
    setNotesDraft(record?.meta?.notes || '');
    setLocalComments(Array.isArray(record?.meta?.comments) ? record.meta.comments : []);
  }, [record?.id, record?.meta?.notes, record?.updated_at]);

  const loadCrmBundle = useCallback(async () => {
    if (!crmLeadId) {
      setCrmLead(null);
      setCrmActivities([]);
      setCrmDocuments([]);
      setCrmTasks([]);
      setDealPurchaseOrders([]);
      return;
    }
    setLoadingCrm(true);
    try {
      const [leadRes, actRes, docRes, taskRes, poRes] = await Promise.all([
        api.get(`/crm/leads/${crmLeadId}`).catch(() => ({ data: null })),
        api.get(`/crm/leads/${crmLeadId}/activities`).catch(() => ({ data: [] })),
        api.get(`/crm/leads/${crmLeadId}/documents`).catch(() => ({ data: [] })),
        api.get(`/crm/leads/${crmLeadId}/tasks`).catch(() => ({ data: { tasks: [] } })),
        api.get('/purchasing/orders', { params: { lead_id: crmLeadId } }).catch(() => ({ data: [] })),
      ]);
      setCrmLead(leadRes.data?.lead || leadRes.data || null);
      const acts = actRes.data?.activities || actRes.data || [];
      setCrmActivities(Array.isArray(acts) ? acts : []);
      setCrmDocuments(Array.isArray(docRes.data) ? docRes.data : (docRes.data?.documents || []));
      setCrmTasks(taskRes.data?.tasks || taskRes.data || []);
      setDealPurchaseOrders(Array.isArray(poRes.data) ? poRes.data : (poRes.data?.orders || []));
    } finally {
      setLoadingCrm(false);
    }
  }, [crmLeadId]);

  useEffect(() => { loadCrmBundle(); }, [loadCrmBundle]);

  useEffect(() => {
    if (activeTab === 'purchase_orders' && crmLeadId) {
      api.get('/purchasing/orders', { params: { lead_id: crmLeadId } })
        .then((r) => setDealPurchaseOrders(Array.isArray(r.data) ? r.data : (r.data?.orders || [])))
        .catch(() => {});
    }
  }, [activeTab, crmLeadId]);

  const noteActivities = useMemo(
    () => (crmActivities || []).filter((a) => a.type === 'note'),
    [crmActivities],
  );

  const badges = {
    po: dealPurchaseOrders.length,
    docs: crmDocuments.length,
    drive: driveFileCount,
    notes: noteActivities.length + (notesDraft ? 1 : 0) + (crmActivities.length || 0),
    comments: crmLeadId ? commentCount : localComments.length,
  };

  useEffect(() => {
    onStats?.({
      activities: crmActivities.length || (notesDraft ? 1 : 0),
      documents: crmDocuments.length,
      taskFiles: 0,
      taskNotes: 0,
      comments: badges.comments,
    });
  }, [crmActivities.length, crmDocuments.length, notesDraft, badges.comments, onStats]);

  const saveLocalNotes = async () => {
    setSavingNotes(true);
    try {
      await onRecordPatch?.({ notes: notesDraft });
    } finally {
      setSavingNotes(false);
    }
  };

  const saveLocalComments = async (next) => {
    setLocalComments(next);
    await onRecordPatch?.({ meta_patch: { comments: next } });
  };

  const leadType = crmLead?.type || 'lead';

  const tabBtnClass = (tab) => {
    const active = activeTab === tab.id;
    const base = tab.activeClass || 'text-blue-600 border-blue-600';
    const [text, border] = base.split(' ');
    return `relative flex-1 min-w-[6.75rem] py-3 px-3 text-sm font-medium transition-all whitespace-nowrap ${
      active ? `${text} border-b-2 ${border}` : 'text-gray-600 hover:text-gray-900'
    }`;
  };

  return (
    <div className="bg-white rounded-xl border">
      <div className="flex border-b overflow-x-auto">
        {TAB_DEFS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            title={tab.title}
            onClick={() => setActiveTab(tab.id)}
            className={tabBtnClass(tab)}
          >
            {tab.id === 'voice_crm' ? (
              <span className="inline-flex items-center justify-center gap-1">
                <Mic className="h-3.5 w-3.5 shrink-0" /> Ghi âm
              </span>
            ) : tab.id === 'team' ? (
              <span className="inline-flex flex-col items-center gap-0.5">
                {(memberModuleCounts.crm > 0 || memberModuleCounts.production > 0 || memberModuleCounts.logistics > 0) && (
                  <span className="inline-flex items-center gap-0.5">
                    <span className="min-w-[1.15rem] h-[1.15rem] px-1 rounded text-[10px] font-bold leading-[1.15rem] text-center bg-blue-100 text-blue-700">{memberModuleCounts.crm}</span>
                    <span className="min-w-[1.15rem] h-[1.15rem] px-1 rounded text-[10px] font-bold leading-[1.15rem] text-center bg-teal-100 text-teal-700">{memberModuleCounts.production}</span>
                    <span className="min-w-[1.15rem] h-[1.15rem] px-1 rounded text-[10px] font-bold leading-[1.15rem] text-center bg-orange-100 text-orange-700">{memberModuleCounts.logistics}</span>
                  </span>
                )}
                <span>👥 Thành viên</span>
              </span>
            ) : (
              tab.label
            )}
            {tab.badgeKey && badges[tab.badgeKey] > 0 && (
              <span className={`absolute top-1 right-1.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full text-[10px] font-bold leading-none flex items-center justify-center ${
                activeTab === tab.id
                  ? (tab.id === 'purchase_orders' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white')
                  : (tab.id === 'purchase_orders' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600')
              }`}>
                {badges[tab.badgeKey]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-5">
        {loadingCrm && crmLeadId && activeTab !== 'tasks' && (
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải dữ liệu CRM…
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="space-y-6">
            {crmLeadId ? (
              <>
                <CRMTasksTab
                  leadId={crmLeadId}
                  leadType={leadType}
                  users={users}
                  refreshKey={tasksRefreshKey}
                  sxTemplateCompanyId={crmLead?.sx_template_company_id || null}
                  linkedProjectId={crmLead?.project_id || null}
                  dealResponsible={crmLead}
                  onLeadSynced={() => { loadCrmBundle(); onReload?.(); }}
                />
                <div className="border-t border-slate-200 pt-5">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-3">Công việc module · {moduleKey}</p>
                  <AppModuleTasksTab
                    moduleKey={moduleKey}
                    recordId={recordId}
                    stages={stages}
                    currentStageId={record?.stage_id}
                    users={users}
                    refreshKey={tasksRefreshKey}
                    onChanged={() => { setTasksRefreshKey((k) => k + 1); onReload?.(); }}
                  />
                </div>
              </>
            ) : (
              <AppModuleTasksTab
                moduleKey={moduleKey}
                recordId={recordId}
                stages={stages}
                currentStageId={record?.stage_id}
                users={users}
                refreshKey={tasksRefreshKey}
                onChanged={() => { setTasksRefreshKey((k) => k + 1); onReload?.(); }}
              />
            )}
          </div>
        )}

        {activeTab === 'shared-workspace' && (
          crmLeadId ? (
            <DealSharedWorkspaceTab
              leadId={crmLeadId}
              leadType={leadType}
              users={users}
              taskScope="production"
              defaultAssignModule="crm"
              companyId={crmLead?.company_id || record?.company_id || null}
              sxCompanyId={crmLead?.sx_template_company_id || null}
              sxTemplateCompanyId={crmLead?.sx_template_company_id || null}
              linkedProjectId={crmLead?.project_id || null}
              dealResponsible={crmLead}
              refreshKey={tasksRefreshKey}
            />
          ) : (
            <div className="rounded-xl border border-teal-300 bg-gradient-to-br from-teal-50 to-white px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-teal-950 flex items-center gap-2">
                <Globe className="h-4 w-4 text-teal-600" /> Không gian làm việc chung
              </p>
              <p className="text-xs text-teal-800">
                Hiển thị việc giao cho công ty khác. Bản ghi module chưa gắn deal CRM — chưa có nhiệm vụ giao chéo.
              </p>
              <p className="text-xs text-teal-700 bg-white/70 border border-teal-200 rounded-lg px-3 py-2">
                Chưa có nhiệm vụ giao cho công ty khác. Gắn nguồn CRM hoặc mở tab Công việc để giao việc nội bộ module.
              </p>
            </div>
          )
        )}

        {activeTab === 'purchase_orders' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Đặt hàng</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {crmLeadId
                    ? `${dealPurchaseOrders.length} bản ghi · chọn SP từ catalog`
                    : 'Đặt hàng gắn với deal CRM nguồn'}
                </p>
              </div>
              {crmLeadId && (
                <Link
                  to={`/crm/leads/${crmLeadId}`}
                  className="h-8 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" /> Thêm trên CRM
                </Link>
              )}
            </div>
            {!crmLeadId ? (
              <EmptyDash
                icon={ShoppingCart}
                title="Chưa có đặt hàng"
                hint="Chuyển từ deal CRM để quản lý đặt hàng tại đây."
              />
            ) : (
              <>
                <div className="flex gap-2 overflow-x-auto pb-0.5">
                  <button
                    type="button"
                    onClick={() => setPoStatusFilter('')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${!poStatusFilter ? 'bg-amber-600 text-white border-amber-600' : 'hover:bg-gray-50'}`}
                  >
                    Tất cả
                    <span className={`min-w-[1.1rem] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${!poStatusFilter ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {dealPurchaseOrders.length}
                    </span>
                  </button>
                  {Object.entries(PO_STATUS).map(([k, v]) => {
                    const n = dealPurchaseOrders.filter((o) => o.status === k).length;
                    if (!n) return null;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setPoStatusFilter(poStatusFilter === k ? '' : k)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${poStatusFilter === k ? 'bg-amber-600 text-white border-amber-600' : PO_COLORS[k]}`}
                      >
                        {v}
                        <span className={`min-w-[1.1rem] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${poStatusFilter === k ? 'bg-white/25 text-white' : 'bg-black/5'}`}>
                          {n}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  const filtered = poStatusFilter
                    ? dealPurchaseOrders.filter((o) => o.status === poStatusFilter)
                    : dealPurchaseOrders;
                  if (!filtered.length) {
                    return (
                      <EmptyDash
                        icon={ShoppingCart}
                        title="Chưa có đặt hàng"
                        action={(
                          <Link to={`/crm/leads/${crmLeadId}`} className="mt-3 inline-flex h-9 px-4 items-center rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium">
                            Thêm mới
                          </Link>
                        )}
                      />
                    );
                  }
                  return (
                    <div className="overflow-auto rounded-lg border" style={{ maxHeight: 'min(480px, 60vh)' }}>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr className="border-b text-left text-xs text-gray-500 uppercase">
                            <th className="py-2.5 px-3">Mã</th>
                            <th className="py-2.5 px-3">Tiêu đề</th>
                            <th className="py-2.5 px-3 text-right">Tổng</th>
                            <th className="py-2.5 px-3">Trạng thái</th>
                            <th className="py-2.5 px-3">Ngày</th>
                            <th className="py-2.5 px-3 w-20" />
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((o) => (
                            <tr key={o.id} className="border-b hover:bg-amber-50/40">
                              <td className="py-2.5 px-3 font-bold text-amber-700">{o.code}</td>
                              <td className="py-2.5 px-3 font-medium">{o.title || '—'}</td>
                              <td className="py-2.5 px-3 text-right font-semibold">{formatVND(o.total || 0)}</td>
                              <td className="py-2.5 px-3">
                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${PO_COLORS[o.status] || ''}`}>
                                  {PO_STATUS[o.status] || o.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-gray-500 text-xs">{formatDate(o.order_date || o.created_at)}</td>
                              <td className="py-2.5 px-3 text-right">
                                <Link to={`/crm/leads/${crmLeadId}`} className="p-1.5 inline-flex text-gray-400 hover:text-amber-700" title="Xem trên CRM">
                                  <Eye className="h-3.5 w-3.5" />
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {crmLeadId ? (
                  <Link
                    to={`/crm/leads/${crmLeadId}`}
                    className="h-8 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Nhập / Upload trên CRM
                  </Link>
                ) : null}
              </div>
            </div>
            {crmLeadId && (
              <CrmTaskDocumentsPanel
                tasks={crmTasks}
                artifacts={[]}
                leadCurrentStageId={crmLead?.stage_id}
                leadType={leadType}
              />
            )}
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">
              📄 Tài liệu Lead ({crmDocuments.length})
            </p>
            {crmDocuments.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed">
                <FileUp className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Chưa có tài liệu</p>
                <p className="text-xs text-gray-400 mt-1">
                  {crmLeadId
                    ? 'Upload file hoặc nhập văn bản trên CRM để thêm tài liệu'
                    : 'Gắn deal/lead CRM nguồn để dùng tab Tài liệu đầy đủ'}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {crmDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{doc.title || doc.file_name || doc.name || 'Tài liệu'}</p>
                      <p className="text-[11px] text-slate-400">{formatDate(doc.created_at)}</p>
                    </div>
                    {crmLeadId && (
                      <Link to={`/crm/leads/${crmLeadId}`} className="text-xs font-semibold text-blue-600 inline-flex items-center gap-0.5 shrink-0">
                        Mở <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'drive' && (
          crmLeadId ? (
            <DriveAttachments
              entityType={leadType === 'deal' ? 'deal' : 'lead'}
              entityId={crmLeadId}
              onCountChange={setDriveFileCount}
            />
          ) : (
            <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed">
              <FileUp className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Chưa gắn Drive</p>
              <p className="text-xs text-gray-400 mt-1">Tab Drive dùng entity lead/deal CRM nguồn.</p>
            </div>
          )
        )}

        {activeTab === 'notes' && (
          <div className="space-y-6">
            {crmLeadId ? (
              <CrmChatNotesPanel
                variant="embedded"
                leadId={crmLeadId}
                notes={noteActivities}
                onPosted={() => loadCrmBundle()}
                currentUserId={user?.id || user?.userId}
                canEditAnyNote={isAdminLike(user) || user?.role === 'manager'}
                includeVoiceTimeline
                contextLine={`${leadType === 'deal' ? '🎯 Deal' : '💼 Lead'} ${[crmLead?.code, crmLead?.title].filter(Boolean).join(' — ')}`}
                contextBadge={crmLead?.code || ''}
              />
            ) : (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-800">Ghi chú</h3>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={8}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Ghi chú nội bộ…"
                />
                <button
                  type="button"
                  onClick={saveLocalNotes}
                  disabled={savingNotes}
                  className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  {savingNotes ? 'Đang lưu…' : 'Lưu ghi chú'}
                </button>
              </div>
            )}

            <div className="border-t pt-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-800">Hoạt động</h3>
                {crmLeadId && (
                  <Link
                    to={`/crm/leads/${crmLeadId}`}
                    className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Thêm
                  </Link>
                )}
              </div>
              {crmActivities.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-10 w-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Chưa có hoạt động</p>
                </div>
              ) : (
                <div className="space-y-2 min-h-[200px] max-h-[min(420px,55vh)] overflow-y-auto">
                  <div className="relative">
                    <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-300 to-blue-100" />
                    {crmActivities.map((act) => (
                      <div key={act.id} className="p-3 bg-gray-50 rounded-lg border relative z-10 ml-4 mb-2">
                        <div className="absolute -left-5 top-4 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900">{act.title || act.type}</p>
                          <span className="text-[10px] text-gray-400 shrink-0">{formatDate(act.activity_date || act.created_at)}</span>
                        </div>
                        {act.creator?.full_name && (
                          <p className="text-[10px] text-gray-400 mt-0.5">{act.creator.full_name}</p>
                        )}
                        {act.description && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{act.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          crmLeadId ? (
            <LeadMembersTab
              leadId={crmLeadId}
              onMembersChange={(list) => setMemberModuleCounts(countMembersByModule(list))}
              onOpenSharedWorkspace={() => setActiveTab('shared-workspace')}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 p-4 space-y-2">
              <p className="text-sm font-semibold text-slate-800">Phụ trách module</p>
              <p className="text-sm text-slate-600">{record?.assignee?.full_name || 'Chưa gán'}</p>
              <p className="text-xs text-slate-400">Tab Thành viên đầy đủ (CRM / SX / VC) khi bản ghi gắn lead/deal CRM.</p>
            </div>
          )
        )}

        {activeTab === 'comments' && (
          crmLeadId ? (
            <CrmLeadCommentsPanel leadId={crmLeadId} onCountChange={setCommentCount} />
          ) : (
            <ModuleCommentsLocal
              comments={localComments}
              users={users}
              onChange={saveLocalComments}
            />
          )
        )}

        {activeTab === 'voice_crm' && (
          crmLeadId ? (
            <LeadVoiceRecordingsTab leadId={crmLeadId} />
          ) : (
            <EmptyDash
              icon={Mic}
              title="Chưa có ghi âm"
              hint="Ghi âm gắn với lead/deal CRM nguồn."
            />
          )
        )}
      </div>
    </div>
  );
}
