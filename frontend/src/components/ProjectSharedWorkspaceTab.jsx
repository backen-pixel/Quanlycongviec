import { useEffect, useMemo, useState } from 'react';
import {
  Users, ChevronDown, ChevronRight, Building2, CheckSquare, Plus,
} from 'lucide-react';
import api from '../lib/api';
import DealSharedWorkspaceTab from './DealSharedWorkspaceTab';
import SharedCRMNotes from './SharedCRMNotes';
import {
  resolveCompaniesFromFlowAssignments,
} from '../lib/projectFlowCompanies';
import {
  TASK_STATUS, TASK_COLORS, formatDate, getInitials, avatarColor,
} from '../lib/utils';

const MODULE_FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'crm', label: 'Kinh doanh' },
  { key: 'production', label: 'Sản xuất' },
  { key: 'logistics', label: 'Vận chuyển / Lắp đặt' },
];

function FlowModuleCard({ mod, onOpenTask, onCreateTask, defaultOpen }) {
  const a = mod.assignment || {};
  const tasks = a.tasks || [];
  const [open, setOpen] = useState(defaultOpen);
  const statusKey = a.status || 'pending';
  const statusLabel = statusKey === 'done' ? 'Hoàn thành'
    : statusKey === 'in_progress' ? 'Đang làm' : 'Chờ';
  const statusClass = statusKey === 'done' ? 'bg-emerald-100 text-emerald-700'
    : statusKey === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600';
  const resp = a.responsible_user;

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${
      a.is_project_company ? 'border-blue-300 ring-1 ring-blue-200' : 'border-gray-200'
    }`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-4 hover:bg-slate-50/80 cursor-pointer"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
              <h4 className="text-sm font-semibold text-gray-900">{mod.label}</h4>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusClass}`}>{statusLabel}</span>
              {a.is_project_company && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">Công ty dự án</span>
              )}
            </div>
            <p className="text-xs text-gray-700 flex items-center gap-1 ml-6">
              <Building2 className="h-3.5 w-3.5 text-gray-400" />
              {mod.assignment?.display_company?.name
                || mod.companyName
                || '—'}
            </p>
            {resp && (
              <div className="flex items-center gap-1.5 ml-6 mt-1.5">
                <div
                  className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                  style={{ backgroundColor: avatarColor(resp.full_name) }}
                >
                  {getInitials(resp.full_name)}
                </div>
                <span className="text-[11px] text-gray-600">
                  NV phụ trách: <span className="font-medium text-gray-800">{resp.full_name}</span>
                </span>
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-blue-600">{a.progress || 0}%</div>
            <div className="text-xs text-gray-500">{a.tasks_completed || 0}/{a.tasks_total || tasks.length} NV</div>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden mt-2 ml-6 max-w-[calc(100%-1.5rem)]">
          <div
            className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full"
            style={{ width: `${a.progress || 0}%` }}
          />
        </div>
      </button>

      {open && (
        <div className="border-t bg-slate-50/80 px-3 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1">
              <CheckSquare className="h-3 w-3" /> Nhiệm vụ module
            </p>
            {onCreateTask && (
              <button
                type="button"
                onClick={() => onCreateTask(mod)}
                className="h-7 px-2.5 rounded-lg bg-blue-600 text-white text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-blue-700 cursor-pointer"
              >
                <Plus className="h-3 w-3" /> Thêm NV
              </button>
            )}
          </div>
          {tasks.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Chưa có nhiệm vụ khối này</p>
          ) : (
            <div className="space-y-1">
              {tasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onOpenTask?.(t.id)}
                  className="w-full flex items-center gap-2 bg-white rounded-lg border px-3 py-2 text-left hover:border-blue-300 cursor-pointer"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${TASK_COLORS[t.status] || 'bg-gray-400'}`} />
                  <span className="flex-1 text-sm text-gray-800 truncate">{t.title}</span>
                  {t.assignee?.full_name && (
                    <span className="text-[10px] text-gray-500 truncate max-w-[100px] hidden sm:inline">
                      {t.assignee.full_name}
                    </span>
                  )}
                  {t.due_date && <span className="text-[10px] text-gray-400 hidden md:inline">{formatDate(t.due_date)}</span>}
                  <span className="text-[10px] text-gray-400 shrink-0">{TASK_STATUS[t.status] || t.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Không gian chung trên ProjectDetail:
 * - Có Deal → DealSharedWorkspaceTab với đúng công ty từ Bộ Quy Trình
 * - Chưa Deal → làm việc theo module/công ty của flow (giống thẻ Bộ Quy Trình)
 */
export default function ProjectSharedWorkspaceTab({
  projectId,
  project,
  dealBundle,
  users = [],
  onReload,
  onOpenTask,
  onCreateTask,
}) {
  const flowCompanies = useMemo(
    () => resolveCompaniesFromFlowAssignments(project?.flowAssignments, project, 'flow'),
    [project?.flowAssignments, project],
  );
  const sorCompanies = useMemo(
    () => resolveCompaniesFromFlowAssignments(project?.flowAssignments, project, 'sor'),
    [project?.flowAssignments, project?.module_companies, project?.company_id, project?.logistics_company_id, project],
  );

  const bundleLeadId = dealBundle?.primary_lead?.id || dealBundle?.lead_id || null;
  const [leadId, setLeadId] = useState(bundleLeadId);
  const [leadMeta, setLeadMeta] = useState(dealBundle?.primary_lead || null);
  const [resolving, setResolving] = useState(!bundleLeadId);
  const [moduleFilter, setModuleFilter] = useState('all');

  useEffect(() => {
    setLeadId(bundleLeadId);
    setLeadMeta(dealBundle?.primary_lead || null);
  }, [bundleLeadId, dealBundle?.primary_lead]);

  useEffect(() => {
    if (bundleLeadId || !projectId) {
      setResolving(false);
      return undefined;
    }
    let cancelled = false;
    setResolving(true);
    (async () => {
      try {
        const { data } = await api.get(`/management/by-project/${projectId}`);
        if (cancelled) return;
        const id = data?.primary_lead?.id || data?.lead_id || null;
        if (id) {
          setLeadId(id);
          setLeadMeta(data.primary_lead || null);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bundleLeadId, projectId]);

  const crmCompanyId = sorCompanies.crmCompanyId
    || project?.module_companies?.crm?.id
    || leadMeta?.company_id
    || null;
  const sxCompanyId = sorCompanies.sxCompanyId
    || project?.module_companies?.production?.id
    || project?.company_id
    || null;
  const vcCompanyId = sorCompanies.vcCompanyId
    || project?.module_companies?.logistics?.id
    || project?.logistics_company_id
    || null;

  const visibleModules = useMemo(() => {
    const list = flowCompanies.modules || [];
    if (moduleFilter === 'all') return list;
    return list.filter((m) => m.key === moduleFilter);
  }, [flowCompanies.modules, moduleFilter]);

  if (resolving) {
    return <p className="text-center text-sm text-gray-400 py-10">Đang tải Không gian chung…</p>;
  }

  if (leadId) {
    return (
      <div className="space-y-4">
        {(flowCompanies.modules || []).length > 0 && (
          <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-3">
            <p className="text-[11px] font-semibold text-blue-900 mb-2 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Công ty theo module (CRM / SX / VC)
            </p>
            <div className="flex flex-wrap gap-2">
              {flowCompanies.modules.map((m) => (
                <span
                  key={`${m.key}-${m.companyId || m.companyUnitId || m.label}`}
                  className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-white border border-blue-100 text-gray-700"
                >
                  <span className="font-semibold text-blue-800">{m.label}</span>
                  <span className="text-gray-400">·</span>
                  <span>{m.companyName || '—'}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        <DealSharedWorkspaceTab
          leadId={leadId}
          leadType="deal"
          users={users}
          taskScope="production"
          defaultAssignModule="all"
          companyId={crmCompanyId}
          sxCompanyId={sxCompanyId}
          vcCompanyId={vcCompanyId}
          sxTemplateCompanyId={sxCompanyId}
          vcTemplateCompanyId={vcCompanyId}
          linkedProjectId={projectId}
          dealResponsible={leadMeta}
          workshopProject={project}
          onArtifactsSynced={onReload}
        />
      </div>
    );
  }

  // Chưa gắn Deal — vẫn thao tác theo module/công ty của Bộ Quy Trình
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-600" />
          Không gian chung theo module
        </h3>
        <p className="text-xs text-gray-600 mt-1">
          Dự án chưa gắn Deal CRM — công ty lấy từ dữ liệu từng module (CRM deal / SX dự án / VC logistics).
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 sticky top-0 z-10 py-1 bg-[var(--color-page-bg)]/90 backdrop-blur-sm">
        {MODULE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setModuleFilter(f.key)}
            className={`h-9 px-3.5 rounded-full text-xs font-semibold cursor-pointer border transition-colors ${
              moduleFilter === f.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visibleModules.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10 bg-white rounded-xl border">
          Chưa có Bộ Quy Trình / công ty module trên dự án này.
        </p>
      ) : (
        <div className="space-y-3">
          {visibleModules.map((mod, idx) => (
            <FlowModuleCard
              key={mod.assignment?.id || `${mod.key}-${idx}`}
              mod={mod}
              defaultOpen={idx === 0 || moduleFilter !== 'all'}
              onOpenTask={onOpenTask}
              onCreateTask={onCreateTask}
            />
          ))}
        </div>
      )}

      <SharedCRMNotes projectId={projectId} forModule="workshop" />
    </div>
  );
}
