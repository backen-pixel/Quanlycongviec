import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCrmNotesFab } from '../context/CrmNotesFabContext';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatVND, formatDate, formatDateTime, getInitials, avatarColor } from '../lib/utils';
import {
  ArrowLeft, FileIcon, FolderKanban, MessageSquare, Plus, X,
  FileUp, Edit2, Save,
} from 'lucide-react';
import WorkshopProjectTasksPanel from '../components/WorkshopProjectTasksPanel';
import ProjectApprovalsTab from '../components/ProjectApprovalsTab';
import { LeadMembersTab, LeadChatTab } from '../components/LeadChatTabs';
import CallLogsTab from '../components/CallLogsTab';
import FacebookChatTab from '../components/FacebookChatTab';
import CrmChatNotesPanel from '../components/CrmChatNotesPanel';
import PipelineStepper from '../components/PipelineStepper';

/** Cùng tên tab với LeadDetail (chi tiết deal) */
const DEAL_TAB_KEYS = new Set(['tasks', 'documents', 'activities', 'notes', 'facebook', 'team', 'chat', 'calls', 'approvals']);
const LEGACY_TAB_MAP = {
  timeline: 'activities',
  'crm-notes': 'notes',
  'crm-tasks': 'tasks',
  'crm-chat': 'chat',
  'crm-activities': 'activities',
  'crm-deal-docs': 'documents',
  'crm-members': 'team',
};

const PRODUCTION_SLUGS = new Set(['production']);
const LOGISTICS_SLUGS = new Set(['delivery', 'shipping', 'installing', 'installation']);

function filterProjectTasksByWorkArea(tasks, workArea) {
  const sl = workArea === 'logistics' ? LOGISTICS_SLUGS : PRODUCTION_SLUGS;
  return (tasks || []).filter((t) => sl.has(t.stage?.slug || ''));
}

function calcProgressForTasks(taskList) {
  if (!taskList?.length) return 0;
  return Math.round((taskList.filter((t) => t.status === 'done').length / taskList.length) * 100);
}

const ACTIVITY_TYPES = [
  { value: 'call', label: 'Gọi điện', icon: '📞', color: 'bg-blue-100 text-blue-700' },
  { value: 'meeting', label: 'Gặp mặt', icon: '🤝', color: 'bg-purple-100 text-purple-700' },
  { value: 'email', label: 'Email', icon: '📧', color: 'bg-amber-100 text-amber-700' },
  { value: 'zalo', label: 'Zalo', icon: '💬', color: 'bg-blue-100 text-blue-700' },
  { value: 'note', label: 'Ghi chú', icon: '📝', color: 'bg-gray-100 text-gray-700' },
  { value: 'quote_sent', label: 'Gửi báo giá', icon: '💰', color: 'bg-emerald-100 text-emerald-700' },
];

const ACTIVITY_FORM_TYPES = ACTIVITY_TYPES.filter((t) =>
  ['call', 'meeting', 'email', 'zalo', 'note'].includes(t.value),
);

/** Cột trái — cùng phong cách card "Thông tin" như LeadDetail (chỉ đọc) */
function WorkshopInfoPanel({ project, workArea, filteredTasks }) {
  const fromApi = workArea === 'logistics' ? project.logisticsTaskProgress : project.productionTaskProgress;
  const prob = typeof fromApi === 'number' ? fromApi : calcProgressForTasks(filteredTasks);
  const areaLabel = workArea === 'logistics' ? 'VC & lắp đặt' : 'Sản xuất';
  return (
    <div className="bg-white rounded-xl border p-5 space-y-1">
      <h3 className="text-sm font-bold text-gray-900 uppercase mb-2">Thông tin</h3>
      <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors">
        <span className="text-sm mt-0.5 shrink-0">💰</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Giá trị dự án</p>
          <p className="text-sm font-medium text-gray-900">{formatVND(project.estimated_value)}</p>
        </div>
      </div>
      <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors">
        <span className="text-sm mt-0.5 shrink-0">📅</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Deadline</p>
          <p className="text-sm font-medium text-gray-900">{project.deadline ? formatDate(project.deadline) : '—'}</p>
        </div>
      </div>
      <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors">
        <span className="text-sm mt-0.5 shrink-0">📊</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">
            Tiến độ NV ({areaLabel})
          </p>
          <p className="text-sm font-medium text-gray-900">{prob}%</p>
          <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div className="bg-blue-600 h-full rounded-full transition-all duration-300" style={{ width: `${prob}%` }} />
          </div>
        </div>
      </div>
      <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors">
        <span className="text-sm mt-0.5 shrink-0">🎯</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Ưu tiên</p>
          <p className="text-sm font-medium text-gray-900 capitalize">
            {project.priority === 'high' ? '🔴 Cao' : project.priority === 'medium' ? '🟡 Trung bình' : '🟢 Thấp'}
          </p>
        </div>
      </div>
      {project.notes && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Ghi chú nội bộ xưởng</p>
          <p className="text-xs text-gray-700 whitespace-pre-wrap">{project.notes}</p>
        </div>
      )}
    </div>
  );
}

function ProductionDocumentsDealLayout({ project, crmDealDocs, crmLeadId }) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {crmLeadId ? (
            <Link
              to={`/crm/leads/${crmLeadId}`}
              className="h-8 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
            >
              📋 Chỉnh tài liệu trên CRM
            </Link>
          ) : null}
          <span className="text-xs text-gray-500">Tab xưởng chỉ liệt kê tài liệu đã bật «chia sẻ xưởng»; team CRM vẫn xem đủ trên chi tiết deal. Upload trên deal CRM.</span>
        </div>
      </div>
      <p className="text-xs font-bold text-gray-500 uppercase mb-2">📂 Đã chia sẻ xưởng</p>
      <DocumentsTab project={project} />
      <p className="text-xs font-bold text-gray-500 uppercase mb-2 mt-6">
        📄 Tài liệu deal CRM ({crmDealDocs.length})
      </p>
      {crmDealDocs.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed">
          <FileUp className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Chưa có tài liệu trên deal</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {crmDealDocs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
              <FileIcon className="h-5 w-5 text-blue-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{doc.name || doc.file_name}</p>
                {doc.notes && <p className="text-xs text-gray-500 truncate">{doc.notes}</p>}
              </div>
              {doc.file_url && (
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-blue-600 hover:underline shrink-0"
                >
                  Mở
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ProductionActivitiesDealLayout({
  crmActivities,
  crmLeadId,
  setShowAddCrmActivity,
  project,
}) {
  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-center justify-between mb-4">
          {crmLeadId ? (
            <button
              type="button"
              onClick={() => setShowAddCrmActivity(true)}
              className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Thêm
            </button>
          ) : (
            <p className="text-xs text-gray-500">Liên kết deal CRM để thêm hoạt động.</p>
          )}
        </div>
        {crmActivities.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="h-10 w-10 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Chưa có hoạt động</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            <div className="relative">
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-300 to-blue-100" />
              {crmActivities.map((act) => {
                const typeInfo = ACTIVITY_TYPES.find((t) => t.value === act.type) || ACTIVITY_TYPES[4];
                return (
                  <div key={act.id} className="p-3 bg-gray-50 rounded-lg border relative z-10 ml-4">
                    <div className="absolute -left-5 top-4 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
                    <div className="flex items-start gap-2">
                      <span className="text-lg shrink-0">{typeInfo.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900">{act.title}</p>
                          <span className="text-[10px] text-gray-400">{formatDate(act.activity_date)}</span>
                        </div>
                        {act.description && <p className="text-xs text-gray-600 mt-1">{act.description}</p>}
                        {act.outcome && <p className="text-xs text-blue-600 font-medium mt-1">→ {act.outcome}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {(project.crmSharedNotes?.length > 0) && (
        <section>
          <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">💬 Ghi chú CRM chia sẻ xưởng</h4>
          <CrmSharedNotesTab project={project} />
        </section>
      )}

      <section>
        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">📜 Lịch sử chuyển giai đoạn xưởng</h4>
        <TimelineTab project={project} />
      </section>
    </div>
  );
}

export default function ProductionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { socket, user } = useAuth();
  const { setCrmNotesAnchor } = useCrmNotesFab();
  const [searchParams, setSearchParams] = useSearchParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const tabFromUrl = searchParams.get('tab');
  const normalizedUrlTab = LEGACY_TAB_MAP[tabFromUrl] || tabFromUrl;
  const [activeTab, setActiveTab] = useState(
    DEAL_TAB_KEYS.has(normalizedUrlTab) ? normalizedUrlTab : 'tasks',
  );
  const [crmUsers, setCrmUsers] = useState([]);
  const [crmActivities, setCrmActivities] = useState([]);
  const [crmDealDocs, setCrmDealDocs] = useState([]);
  const [showAddCrmActivity, setShowAddCrmActivity] = useState(false);
  const [crmActivityForm, setCrmActivityForm] = useState({
    type: 'note', title: '', description: '', outcome: '',
  });
  const [savingCrmActivity, setSavingCrmActivity] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [allUsers, setAllUsers] = useState([]);

  // Title inline editing — same pattern as LeadDetail
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  // Production pipeline stages (loaded from API)
  const [productionStages, setProductionStages] = useState([]);

  // Document upload state
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const workArea = searchParams.get('area') === 'logistics' ? 'logistics' : 'production';
  const filteredTasksForArea = useMemo(
    () => filterProjectTasksByWorkArea(project?.tasks, workArea),
    [project?.tasks, workArea],
  );

  const noteActivities = useMemo(
    () => (crmActivities || []).filter((a) => a.type === 'note'),
    [crmActivities],
  );

  const refreshCrmActivities = useCallback(async () => {
    const dealId = project?.crmDeals?.[0]?.id;
    if (!dealId) return;
    try {
      const { data } = await api.get(`/crm/leads/${dealId}/activities`);
      setCrmActivities(Array.isArray(data) ? data : []);
    } catch (_) {
      /* giữ danh sách cũ */
    }
  }, [project?.crmDeals?.[0]?.id]);

  const crmFabDealId = project?.crmDeals?.[0]?.id;

  useEffect(() => {
    if (loadError || loading || !project || !crmFabDealId) return;
    const deal = project.crmDeals?.[0];
    if (!deal || String(deal.id) !== String(crmFabDealId)) return;
    setCrmNotesAnchor({
      leadId: crmFabDealId,
      notes: noteActivities,
      contextLine: `🎯 Deal ${[deal.code, deal.title].filter(Boolean).join(' — ')}`,
      contextBadge: deal?.code || project?.code || '',
      onPosted: refreshCrmActivities,
    });
  }, [
    loadError,
    loading,
    project,
    crmFabDealId,
    noteActivities,
    refreshCrmActivities,
    setCrmNotesAnchor,
  ]);

  const setTab = useCallback((tab) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (tab === 'tasks') p.delete('tab');
      else p.set('tab', tab);
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    const t = searchParams.get('tab');
    const next = LEGACY_TAB_MAP[t] || t;
    if (DEAL_TAB_KEYS.has(next)) setActiveTab(next);
    else setActiveTab('tasks');
  }, [id, searchParams]);

  useEffect(() => {
    let cancelled = false;
    api.get('/users').then((r) => {
      const u = r.data?.users || r.data || [];
      if (!cancelled) setAllUsers(Array.isArray(u) ? u : []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const dealId = project?.crmDeals?.[0]?.id;
    if (!dealId) {
      setCrmUsers([]);
      setCrmActivities([]);
      setCrmDealDocs([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const [usersRes, actRes, docRes] = await Promise.all([
          api.get('/users').then((r) => r.data?.users || r.data || []).catch(() => []),
          api.get(`/crm/leads/${dealId}/activities`).then((r) => r.data || []).catch(() => []),
          api.get(`/crm/leads/${dealId}/documents`).then((r) => r.data || []).catch(() => []),
        ]);
        if (!cancelled) {
          setCrmUsers(Array.isArray(usersRes) ? usersRes : []);
          setCrmActivities(Array.isArray(actRes) ? actRes : []);
          setCrmDealDocs(Array.isArray(docRes) ? docRes : []);
        }
      } catch (_) {
        if (!cancelled) {
          setCrmUsers([]);
          setCrmActivities([]);
          setCrmDealDocs([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [project?.crmDeals?.[0]?.id]);

  // Load production pipeline stages once
  useEffect(() => {
    api.get('/production/pipeline-stages').then((r) => {
      const rows = r.data || [];
      if (rows.length) setProductionStages(rows);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoadError(null);
    load();
  }, [id]);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await api.get(`/production/projects/${id}`);
      setProject(data.project);
    } catch (e) {
      console.error(e);
      const st = e.response?.status;
      const d = e.response?.data || {};

      if (st === 404) {
        if (d.reason === 'deal_without_project' && d.crm_lead_id) {
          setLoadError({
            kind: 'deal_without_project',
            crm_lead_id: d.crm_lead_id,
            title: d.title,
            hint: d.hint,
          });
          setLoading(false);
          return;
        }
        if (d.reason === 'broken_project_link') {
          setLoadError({
            kind: 'broken_project_link',
            hint: d.hint,
            project_id: d.project_id,
          });
          setLoading(false);
          return;
        }
        try {
          const { data: lead } = await api.get(`/crm/leads/${id}/detail`);
          if (lead?.project_id) {
            navigate(`/sx/projects/${lead.project_id}`, { replace: true });
            return;
          }
          if (lead?.id) {
            setLoadError({
              kind: 'deal_without_project',
              crm_lead_id: lead.id,
              title: lead.title,
              hint: 'Deal chưa có dự án (project_id). Chuyển deal sang Thắng hoặc tạo dự án từ deal.',
            });
            setLoading(false);
            return;
          }
        } catch (_) {
          /* ignore */
        }
        setLoadError({
          kind: 'unknown',
          message: d.hint || d.error || 'Không tìm thấy dự án hoặc deal với id này.',
        });
      } else {
        setLoadError({ kind: 'other', message: d.error || e.message || 'Lỗi tải dữ liệu' });
      }
    }
    setLoading(false);
  };

  const refreshProjectSilently = useCallback(async () => {
    try {
      const { data } = await api.get(`/production/projects/${id}`);
      setProject(data.project);
    } catch (_) {
      /* giữ state cũ */
    }
  }, [id]);

  const saveCrmActivity = async () => {
    const dealId = project?.crmDeals?.[0]?.id;
    if (!dealId || !crmActivityForm.title.trim()) {
      alert('Nhập tiêu đề hoạt động');
      return;
    }
    setSavingCrmActivity(true);
    try {
      await api.post(`/crm/leads/${dealId}/activities`, {
        type: crmActivityForm.type,
        title: crmActivityForm.title.trim(),
        description: crmActivityForm.description || '',
        outcome: crmActivityForm.outcome || '',
      });
      const { data } = await api.get(`/crm/leads/${dealId}/activities`);
      setCrmActivities(data || []);
      setShowAddCrmActivity(false);
      setCrmActivityForm({ type: 'note', title: '', description: '', outcome: '' });
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi');
    }
    setSavingCrmActivity(false);
  };

  const moveStage = async (stageId) => {
    try {
      const { data } = await api.patch(`/production/projects/${id}/stage`, { stage_id: stageId });
      const p = data.project;
      setProject((prev) => (prev && p ? {
        ...prev,
        status: p.status,
        current_stage_id: p.current_stage_id,
        current_stage: p.current_stage || prev.current_stage,
      } : prev));
    } catch (e) {
      alert('Lỗi: ' + (e.response?.data?.error || e.message));
    }
  };

  const saveTitle = async () => {
    const dealId = project?.crmDeals?.[0]?.id;
    if (!titleDraft.trim() || savingTitle) return;
    setSavingTitle(true);
    try {
      if (dealId) {
        const { data } = await api.put(`/crm/leads/${dealId}`, { title: titleDraft.trim() });
        setProject((prev) => prev ? { ...prev, crmDeals: prev.crmDeals?.map((d) => d.id === dealId ? { ...d, ...data } : d) } : prev);
      }
      setEditingTitle(false);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật tên');
    }
    setSavingTitle(false);
  };

  const uploadDocument = async () => {
    const dealId = project?.crmDeals?.[0]?.id;
    if (!dealId) { alert('Cần liên kết deal CRM để upload tài liệu'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      setUploadingDoc(true);
      try {
        const uploaded = [];
        for (const file of files) {
          const fd = new FormData();
          fd.append('file', file);
          const { data } = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          uploaded.push({ name: file.name, file_url: data.url || data.file_url, file_name: file.name });
        }
        await api.post(`/crm/leads/${dealId}/documents/bulk`, { documents: uploaded });
        const { data: docs } = await api.get(`/crm/leads/${dealId}/documents`);
        setCrmDealDocs(Array.isArray(docs) ? docs : []);
      } catch (err) {
        alert(err.response?.data?.error || 'Lỗi upload file');
      }
      setUploadingDoc(false);
    };
    input.click();
  };

  if (loadError) {
    const isDealNoProject = loadError.kind === 'deal_without_project';
    const isBroken = loadError.kind === 'broken_project_link';
    return (
      <div className="max-w-lg mx-auto mt-12 p-6 bg-white rounded-xl border border-amber-200 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-gray-900">
          {isDealNoProject && 'Deal chưa có dự án xưởng'}
          {isBroken && 'Liên kết deal → dự án bị lỗi'}
          {loadError.kind === 'unknown' && 'Không tìm thấy dự án'}
          {loadError.kind === 'other' && 'Lỗi tải trang'}
        </h2>
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{loadError.hint || loadError.message}</p>
        {isDealNoProject && loadError.crm_lead_id && (
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/crm/leads/${loadError.crm_lead_id}`}
              className="inline-flex h-10 px-4 items-center rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
            >
              Mở deal trên CRM → chuyển Thắng / tạo dự án
            </Link>
            <button
              type="button"
              onClick={() => navigate('/sx/dashboard')}
              className="inline-flex h-10 px-4 items-center rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Về dashboard xưởng
            </button>
          </div>
        )}
        {!isDealNoProject && (
          <button
            type="button"
            onClick={() => navigate('/sx/dashboard')}
            className="h-10 px-4 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Về dashboard xưởng
          </button>
        )}
      </div>
    );
  }

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const pipelineStages = productionStages.length
    ? productionStages
    : project.workshopPipeline?.length
      ? project.workshopPipeline
      : [
          { id: null, slug: 'production', name: 'Sản xuất', color: '#0f766e', icon: '🏭' },
          { id: null, slug: 'delivery', name: 'VC & Lắp đặt', color: '#14b8a6', icon: '🚚' },
          { id: null, slug: 'customer-care', name: 'CSKH', color: '#5eead4', icon: '🤝' },
        ];

  const currentStageId = project.current_stage_id || project.current_stage?.id;
  const primaryCrmDeal = project.crmDeals?.[0];
  const crmLeadId = primaryCrmDeal?.id;
  const displayCode = primaryCrmDeal?.code || project.code;
  const displayTitle = primaryCrmDeal?.title || project.name;
  const taskCount = filteredTasksForArea.length;
  const taskUsers = allUsers.length ? allUsers : crmUsers;
  const ownDocCount = (project.sharedDocuments?.length || 0) + crmDealDocs.length;

  const tabBtn = (tab, label) => (
    <button
      type="button"
      key={tab}
      onClick={() => setTab(tab)}
      className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
        activeTab === tab
          ? 'text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4 mx-auto">
      {/* Header — same style as LeadDetail */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/sx/dashboard')}
            className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
                🏭 SX
              </span>
              <span className="text-xs text-gray-500 font-mono">{displayCode}</span>
            </div>
            {editingTitle ? (
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="h-10 min-w-[320px] max-w-[560px] px-3 border border-gray-300 rounded-lg text-lg font-semibold text-gray-900 bg-white"
                  placeholder="Nhập tên deal"
                  autoFocus
                />
                <button
                  onClick={saveTitle}
                  disabled={savingTitle || !titleDraft.trim()}
                  className="h-10 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Save className="h-4 w-4" /> {savingTitle ? 'Đang lưu...' : 'Lưu'}
                </button>
                <button
                  onClick={() => { setTitleDraft(displayTitle || ''); setEditingTitle(false); }}
                  disabled={savingTitle}
                  className="h-10 px-3 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <X className="h-4 w-4" /> Hủy
                </button>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{displayTitle}</h1>
                {crmLeadId && (
                  <button
                    onClick={() => { setTitleDraft(displayTitle || ''); setEditingTitle(true); }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition"
                    title="Sửa tên deal"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/projects/${project.id}`}
            className="h-9 px-3 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium flex items-center gap-1.5"
          >
            <FolderKanban className="h-4 w-4" /> Dự án đầy đủ
          </Link>
          {crmLeadId && (
            <Link
              to={`/crm/leads/${crmLeadId}`}
              className="h-9 px-3 bg-teal-100 text-teal-800 rounded-lg text-sm font-medium flex items-center gap-1.5"
            >
              <FolderKanban className="h-4 w-4" /> CRM deal
            </Link>
          )}
        </div>
      </div>

      {/* Pipeline — shared PipelineStepper component */}
      <PipelineStepper
        stages={pipelineStages}
        currentStageId={currentStageId}
        onMoveToStage={moveStage}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Cột trái — giống LeadDetail */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border p-5 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 uppercase">Khách hàng</h3>
            {project.customer ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5 font-medium">👤 Tên</p>
                  <p className="text-sm font-medium text-gray-900">{project.customer.full_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5 font-medium">📞 SĐT</p>
                  {project.customer.phone ? (
                    <a href={`tel:${project.customer.phone}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                      {project.customer.phone}
                    </a>
                  ) : (
                    <p className="text-sm text-gray-400">—</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5 font-medium">✉️ Email</p>
                  {project.customer.email ? (
                    <a href={`mailto:${project.customer.email}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 break-all">
                      {project.customer.email}
                    </a>
                  ) : (
                    <p className="text-sm text-gray-400">—</p>
                  )}
                </div>
                <div className="border-t border-gray-100" />
                <div>
                  <p className="text-xs text-gray-500 mb-0.5 font-medium">📍 Địa chỉ</p>
                  <p className="text-sm font-medium text-gray-900">{project.customer.address || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5 font-medium">🏢 Công ty (KH)</p>
                  <p className="text-sm font-medium text-gray-900">{project.customer.company || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5 font-medium">🧾 MST</p>
                  <p className="text-sm font-medium text-gray-900">{project.customer.tax_code || '—'}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Chưa có khách hàng trên dự án.</p>
            )}
          </div>

          <WorkshopInfoPanel project={project} workArea={workArea} filteredTasks={filteredTasksForArea} />

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-blue-50 rounded-lg border border-blue-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Hoạt động</p>
              <p className="text-xl font-bold text-blue-600">{crmActivities.length}</p>
            </div>
            <div className="bg-amber-50 rounded-lg border border-amber-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Tài liệu</p>
              <p className="text-xl font-bold text-amber-600">{project.sharedDocuments?.length || 0}</p>
            </div>
            <div className="bg-purple-50 rounded-lg border border-purple-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Nhiệm vụ</p>
              <p className="text-xl font-bold text-purple-600">{taskCount}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase">Đội ngũ</h3>
            {primaryCrmDeal && (
              <div className="space-y-2 pb-3 mb-3 border-b border-gray-100">
                <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wide">CRM</p>
                <PersonCard label="Phụ trách CRM" person={primaryCrmDeal.assignee || primaryCrmDeal.lead_owner} showPlaceholder />
                {primaryCrmDeal.sx_pipeline_stage?.name && (
                  <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2">
                    <p className="text-[10px] text-violet-600 font-semibold uppercase">Deal trên Kanban SX</p>
                    <p className="text-sm font-medium text-gray-900">{primaryCrmDeal.sx_pipeline_stage.name}</p>
                  </div>
                )}
              </div>
            )}
            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Dự án xưởng</p>
            <div className="space-y-2">
              <PersonCard label="Kinh doanh" person={project.sales_person} />
              <PersonCard label="QL dự án" person={project.project_manager} />
              <PersonCard label="Giám sát" person={project.supervisor} />
              <PersonCard label="Sản xuất" person={project.production_person} />
              <PersonCard label="Vận chuyển" person={project.shipping_person} />
              <PersonCard label="Lắp đặt" person={project.installation_person} />
              <PersonCard label="CSKH" person={project.care_person} />
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">Công ty phụ trách</p>
              <p className="text-sm text-gray-800">
                {project.company
                  ? `${project.company.name}${project.company.short_name ? ` (${project.company.short_name})` : ''}`
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Cột phải — tab giống LeadDetail */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-xl border">
            <div className="flex border-b flex-wrap">
              {tabBtn('tasks', '✅ Công việc')}
              {tabBtn('documents', `📋 Tài liệu (${ownDocCount})`)}
              {tabBtn('activities', `💬 Hoạt động (${crmActivities.length})`)}
              {tabBtn('notes', `📝 Ghi chú (${noteActivities.length})`)}
              {tabBtn('facebook', '📘 Facebook')}
              {tabBtn('team', '👥 Thành viên')}
              {tabBtn('chat', '💬 Trao đổi')}
              {tabBtn('calls', '📞 Tổng đài')}
              {tabBtn('approvals', '✅ Gửi duyệt')}
            </div>

            <div className="p-5">
              {activeTab === 'tasks' && (
                <WorkshopProjectTasksPanel
                  project={project}
                  workArea={workArea}
                  workshopPipeline={pipelineStages}
                  tasks={project.tasks}
                  users={taskUsers}
                  onReload={refreshProjectSilently}
                  crmSharedNotes={project?.crmSharedNotes || []}
                  crmDealDocs={crmDealDocs}
                />
              )}

              {activeTab === 'documents' && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      {uploadingDoc ? (
                        <span className="h-8 px-3 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium flex items-center gap-1.5">
                          <span className="animate-spin h-3.5 w-3.5 border-2 border-orange-600 border-t-transparent rounded-full" /> Đang tải lên...
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={uploadDocument}
                          className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                        >
                          <FileUp className="h-3.5 w-3.5" /> Upload file
                        </button>
                      )}
                      {crmLeadId && (
                        <span className="text-xs text-gray-500">Upload sẽ lưu vào deal CRM</span>
                      )}
                    </div>
                  </div>
                  <ProductionDocumentsDealLayout
                    project={project}
                    crmDealDocs={crmDealDocs}
                    crmLeadId={crmLeadId}
                  />
                </>
              )}

              {activeTab === 'activities' && (
                <ProductionActivitiesDealLayout
                  crmActivities={crmActivities}
                  crmLeadId={crmLeadId}
                  setShowAddCrmActivity={setShowAddCrmActivity}
                  project={project}
                />
              )}

              {activeTab === 'notes' && (
                crmLeadId ? (
                  <CrmChatNotesPanel
                    variant="embedded"
                    leadId={crmLeadId}
                    notes={noteActivities}
                    onPosted={refreshCrmActivities}
                    currentUserId={user?.id || user?.userId}
                    canEditAnyNote={user?.role === 'admin' || user?.role === 'manager'}
                    contextLine={
                      primaryCrmDeal
                        ? `🎯 Deal ${[primaryCrmDeal.code, primaryCrmDeal.title].filter(Boolean).join(' — ')}`
                        : project?.code
                          ? `📋 Dự án ${project.code}`
                          : ''
                    }
                    contextBadge={primaryCrmDeal?.code || project?.code || ''}
                  />
                ) : (
                  <p className="text-sm text-gray-500 text-center py-8">Liên kết deal CRM để dùng ghi chú.</p>
                )
              )}

              {activeTab === 'facebook' && (
                crmLeadId ? (
                  <FacebookChatTab leadId={crmLeadId} />
                ) : (
                  <p className="text-sm text-gray-500 text-center py-8">Liên kết deal CRM để xem Facebook.</p>
                )
              )}

              {activeTab === 'team' && (
                crmLeadId ? (
                  <LeadMembersTab leadId={crmLeadId} />
                ) : (
                  <p className="text-sm text-gray-500 text-center py-8">Liên kết deal CRM để xem thành viên.</p>
                )
              )}

              {activeTab === 'chat' && (
                crmLeadId ? (
                  <LeadChatTab leadId={crmLeadId} socket={socket} />
                ) : (
                  <p className="text-sm text-gray-500 text-center py-8">Liên kết deal CRM để trao đổi.</p>
                )
              )}

              {activeTab === 'calls' && (
                crmLeadId ? (
                  <CallLogsTab leadId={crmLeadId} customerId={project.customer?.id} />
                ) : (
                  <p className="text-sm text-gray-500 text-center py-8">Liên kết deal CRM để xem ghi âm.</p>
                )
              )}

              {activeTab === 'approvals' && (
                <div className="max-w-2xl space-y-4">
                  <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800">
                    Duyệt file theo dự án xưởng (cùng luồng với CRM). Thêm / xử lý yêu cầu duyệt bên dưới.
                  </div>
                  <ProjectApprovalsTab
                    variant="workshop"
                    projectId={project.id}
                    project={project}
                    onUpdated={() => load()}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showAddCrmActivity && project?.crmDeals?.[0]?.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAddCrmActivity(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Thêm hoạt động CRM</h2>
              <button type="button" onClick={() => setShowAddCrmActivity(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Loại</label>
                <select
                  value={crmActivityForm.type}
                  onChange={(e) => setCrmActivityForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm"
                >
                  {ACTIVITY_FORM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Tiêu đề</label>
                <input
                  value={crmActivityForm.title}
                  onChange={(e) => setCrmActivityForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm"
                  placeholder="Ví dụ: Gọi xác nhận lắp đặt"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Mô tả</label>
                <textarea
                  value={crmActivityForm.description}
                  onChange={(e) => setCrmActivityForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full min-h-[80px] px-2 py-2 border border-gray-200 rounded-lg mt-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Kết quả / bước tiếp</label>
                <input
                  value={crmActivityForm.outcome}
                  onChange={(e) => setCrmActivityForm((f) => ({ ...f, outcome: e.target.value }))}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddCrmActivity(false)} className="h-9 px-4 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={saveCrmActivity}
                  disabled={savingCrmActivity}
                  className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingCrmActivity ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tasks Tab Component
function TasksTab({ project }) {
  return (
    <div className="space-y-4">
      {project.tasksByStage && Object.keys(project.tasksByStage).length > 0 ? (
        Object.entries(project.tasksByStage).map(([stageName, tasks]) => (
          <div key={stageName} className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3 capitalize">{stageName}</h4>
            <div className="space-y-2">
              {tasks.map(task => (
                <div key={task.id} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded transition">
                  <input
                    type="checkbox"
                    checked={task.status === 'done'}
                    readOnly
                    className="mt-1 w-4 h-4 accent-blue-600"
                  />
                  <div className="flex-1">
                    <p className={`text-sm ${task.status === 'done' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                      {task.title}
                    </p>
                    {task.assignee && (
                      <p className="text-xs text-gray-500 mt-1">Giao cho: {task.assignee.full_name}</p>
                    )}
                  </div>
                  {task.priority && (
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
                      {task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-sm text-center py-6">Không có nhiệm vụ</p>
      )}
    </div>
  );
}

// Documents Tab Component
function DocumentsTab({ project }) {
  return (
    <div className="space-y-3">
      {project.sharedDocuments && project.sharedDocuments.length > 0 ? (
        project.sharedDocuments.map((doc) => {
          const href = doc.file_url || (doc.file_path ? `/uploads/${doc.file_path}` : '#');
          return (
            <div key={doc.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              <FileIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name || doc.name || doc.file_path?.split('/').pop() || 'Tài liệu'}</p>
                <p className="text-xs text-gray-500">Tải lên: {formatDate(doc.created_at || doc.uploaded_at)}</p>
                {doc.notes && <p className="text-xs text-gray-400 mt-1 truncate">{doc.notes}</p>}
              </div>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition"
              >
                Xem
              </a>
            </div>
          );
        })
      ) : (
        <p className="text-gray-500 text-sm text-center py-6">Chưa có tài liệu nào được chia sẻ cho xưởng</p>
      )}
      {(project.hiddenDocumentsCount || 0) > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-700">
          Còn {project.hiddenDocumentsCount} tài liệu chưa hiển thị ở đây (trên CRM, ai xem được deal vẫn mở được file). Để xưởng thấy: trên CRM bật <strong>chia sẻ xưởng</strong> (hoặc quyền tương đương) cho từng tài liệu — hoặc chạy migration cột <code className="text-xs bg-white/80 px-1 rounded">shared_to_workshop</code>.
        </div>
      )}
    </div>
  );
}

// Timeline Tab Component
function PersonCard({ label, person, showPlaceholder }) {
  if (!person?.full_name) {
    if (!showPlaceholder) return null;
    return (
      <div className="flex items-center gap-3 py-0.5">
        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-bold shrink-0">
          —
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-sm text-gray-400">Chưa gán</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      {person.avatar ? (
        <img src={person.avatar} alt="" className="h-8 w-8 rounded-full" />
      ) : (
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
          style={{ backgroundColor: avatarColor(person.full_name) }}
        >
          {getInitials(person.full_name)}
        </div>
      )}
      <div className="flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{person.full_name}</p>
      </div>
    </div>
  );
}

function CrmSharedNotesTab({ project }) {
  const notes = project.crmSharedNotes || [];
  const dealMap = Object.fromEntries((project.crmDeals || []).map((d) => [d.id, d]));
  if (!notes.length) {
    return (
      <div className="text-center py-10 text-gray-400 max-w-lg mx-auto">
        <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Chưa có ghi chú / hoạt động CRM nào được đánh dấu chia sẻ xưởng.</p>
        <p className="text-xs mt-2 text-gray-500">Trên CRM, ghi chú vẫn thấy trong cùng module; để hiện ở tab xưởng, bật chia sẻ xưởng (cột <code className="text-[11px] bg-gray-100 px-1 rounded">shared_to_workshop</code>).</p>
      </div>
    );
  }
  return (
    <div className="space-y-3 max-w-3xl">
      {notes.map((n) => {
        const deal = dealMap[n.lead_id];
        return (
          <div key={n.id} className="rounded-xl border border-teal-100 bg-teal-50/40 p-4">
            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
              <span className="text-xs font-bold text-teal-800">{n.title}</span>
              <span className="text-[10px] text-gray-500">{formatDateTime(n.created_at)}</span>
            </div>
            {deal && (
              <p className="text-[11px] text-violet-700 mb-1">Deal CRM: {deal.code}</p>
            )}
            {n.description && <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.description}</p>}
            <p className="text-[10px] text-gray-500 mt-1">
              {n.type} · {n.creator?.full_name || 'CRM'}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function TimelineTab({ project }) {
  return (
    <div className="space-y-4">
      {project.stage_transitions && project.stage_transitions.length > 0 ? (
        project.stage_transitions.map((transition, idx) => (
          <div key={transition.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-4 h-4 bg-blue-600 rounded-full border-4 border-white shadow-md" />
              {idx < project.stage_transitions.length - 1 && (
                <div className="w-0.5 h-16 bg-gray-300 my-2" />
              )}
            </div>
            <div className="flex-1 py-2">
              <p className="text-sm font-semibold text-gray-900">
                {transition.from_stage?.name} → {transition.to_stage?.name}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Bởi: {transition.user?.full_name || 'Hệ thống'} | {formatDate(transition.created_at)}
              </p>
            </div>
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-sm text-center py-6">Không có lịch sử</p>
      )}
    </div>
  );
}
