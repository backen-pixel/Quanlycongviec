import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate } from '../lib/utils';
import CRMTasksTab from '../components/CRMTasksTab';
import CrmTaskDocumentsPanel from '../components/CrmTaskDocumentsPanel';
import UnifiedTaskRow from '../components/UnifiedTaskRow';
import { publicFileUrl, getFileOpenAnchorProps } from '../lib/publicFileUrl';
import {
  ArrowLeft, Target, Factory, Truck, CheckSquare, FileText, Activity,
  DollarSign, ExternalLink, User, Calendar, Building2, FolderKanban,
} from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Tổng quan', icon: Target },
  { id: 'crm', label: 'CRM', icon: Target },
  { id: 'tasks', label: 'Nhiệm vụ', icon: CheckSquare },
  { id: 'documents', label: 'Tài liệu', icon: FileText },
  { id: 'sx', label: 'Sản xuất', icon: Factory },
  { id: 'vc', label: 'Vận chuyển', icon: Truck },
  { id: 'activity', label: 'Hoạt động', icon: Activity },
  { id: 'finance', label: 'BG / ĐH', icon: DollarSign },
];

function PipelineBadge({ label, stage, colorClass }) {
  if (!stage) {
    return (
      <div className={`rounded-lg border px-3 py-2 ${colorClass} opacity-50`}>
        <p className="text-[10px] font-semibold uppercase text-gray-500">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">Chưa có</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border px-3 py-2 bg-white shadow-sm">
      <p className="text-[10px] font-semibold uppercase text-gray-500">{label}</p>
      <p className="text-sm font-bold mt-0.5" style={{ color: stage.color || '#374151' }}>
        {stage.icon ? `${stage.icon} ` : ''}{stage.name}
      </p>
    </div>
  );
}

function StatPill({ label, done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2 text-center min-w-[80px]">
      <p className="text-[10px] text-gray-500 uppercase font-medium">{label}</p>
      <p className="text-lg font-bold text-gray-900">{done}/{total}</p>
      <p className="text-[10px] text-gray-400">{pct}%</p>
    </div>
  );
}

export default function UnifiedDealPage() {
  const { leadId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';
  const setTab = (id) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (id === 'overview') next.delete('tab');
    else next.set('tab', id);
    return next;
  });

  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/management/deals/${leadId}`);
      setBundle(data);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Không tải được deal');
      setBundle(null);
    }
    setLoading(false);
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  const lead = bundle?.lead;
  const project = bundle?.project;
  const stats = bundle?.stats;
  const pipelines = bundle?.pipelines;

  const sxProjectTasks = useMemo(() => {
    return (bundle?.project_tasks || []).filter((t) => {
      const slug = String(t.metadata?.workshop_area || t.metadata?.stage_slug || '');
      return slug.includes('sx_') || t.metadata?.workshop_module === 'production';
    });
  }, [bundle?.project_tasks]);

  const vcProjectTasks = useMemo(() => {
    return (bundle?.project_tasks || []).filter((t) => {
      const slug = String(t.metadata?.workshop_area || t.metadata?.stage_slug || '');
      return slug.includes('vc_') || t.metadata?.workshop_module === 'logistics';
    });
  }, [bundle?.project_tasks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 mb-4">{error || 'Không tìm thấy deal'}</p>
        <Link to="/dashboard" className="text-blue-600 hover:underline">← Về dashboard tổng hợp</Link>
      </div>
    );
  }

  const value = lead.budget || lead.estimated_value || project?.estimated_value || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3 mb-3">
            <Link to="/dashboard" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {lead.code && (
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{lead.code}</span>
                )}
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{lead.title}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  lead.type === 'deal' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                }`}>
                  {lead.type === 'deal' ? 'Deal' : 'Lead'}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 flex-wrap">
                {lead.customer?.full_name && (
                  <span className="flex items-center gap-1"><User className="h-3 w-3" />{lead.customer.full_name}</span>
                )}
                {lead.assignee?.full_name && (
                  <span>NV: {lead.assignee.full_name}</span>
                )}
                {value > 0 && <span className="font-semibold text-emerald-700">{formatVND(value)}</span>}
                {project?.code && (
                  <Link to={`/projects/${project.id}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                    <FolderKanban className="h-3 w-3" />{project.code}
                  </Link>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link
                to={`/crm/leads/${lead.id}`}
                className="hidden sm:inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-medium hover:bg-emerald-100"
              >
                CRM <ExternalLink className="h-3 w-3" />
              </Link>
              {project?.id && (
                <Link
                  to={`/sx/projects/${project.id}`}
                  className="hidden sm:inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-orange-200 bg-orange-50 text-orange-800 text-xs font-medium hover:bg-orange-100"
                >
                  SX <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <PipelineBadge label="CRM" stage={pipelines?.crm} />
            <PipelineBadge label="Sản xuất" stage={pipelines?.sx} colorClass="border-orange-200" />
            <PipelineBadge label="Vận chuyển" stage={pipelines?.vc} colorClass="border-amber-200" />
          </div>

          <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-4">Tiến độ tổng hợp</h2>
              <div className="flex flex-wrap gap-3">
                <StatPill label="NV CRM" done={stats?.crm_tasks?.done} total={stats?.crm_tasks?.total} />
                <StatPill label="NV SX" done={stats?.sx_tasks?.done} total={stats?.sx_tasks?.total} />
                <StatPill label="NV VC" done={stats?.vc_tasks?.done} total={stats?.vc_tasks?.total} />
                <StatPill label="Tài liệu" done={stats?.documents} total={stats?.documents} />
              </div>
            </div>

            {project && (
              <div className="bg-white rounded-xl border p-5 grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">Dự án</p>
                  <p className="font-bold text-gray-900">{project.name}</p>
                  <p className="text-gray-500 text-xs mt-1">Trạng thái: {project.status}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">Deadline</p>
                  <p className="flex items-center gap-1 text-gray-800">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    {project.deadline ? formatDate(project.deadline) : '—'}
                  </p>
                  {project.production_deadline && (
                    <p className="text-xs text-orange-600 mt-1">SX: {formatDate(project.production_deadline)}</p>
                  )}
                </div>
                {project.company && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-medium mb-1">Công ty SX</p>
                    <p className="flex items-center gap-1"><Building2 className="h-4 w-4" />{project.company.short_name || project.company.name}</p>
                  </div>
                )}
                {project.deposit_amount > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-medium mb-1">Đặt cọc</p>
                    <p className="font-bold text-emerald-700">{formatVND(project.deposit_amount)}</p>
                  </div>
                )}
              </div>
            )}

            {(bundle?.unified_tasks || []).slice(0, 8).length > 0 && (
              <div className="bg-white rounded-xl border p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-gray-900">Nhiệm vụ gần đây</h2>
                  <button type="button" onClick={() => setTab('tasks')} className="text-xs text-blue-600 hover:underline cursor-pointer">
                    Xem tất cả →
                  </button>
                </div>
                <div className="space-y-2">
                  {(bundle.unified_tasks || []).slice(0, 8).map((t) => (
                    <UnifiedTaskRow key={t.unified_id} task={t} compact />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'crm' && (
          <div className="bg-white rounded-xl border overflow-hidden min-h-[400px]">
            <CRMTasksTab
              leadId={lead.id}
              leadType={lead.type === 'deal' ? 'deal' : 'lead'}
              linkedProjectId={project?.id || null}
              onTaskSummaryChange={load}
            />
          </div>
        )}

        {tab === 'tasks' && (
          <div className="bg-white rounded-xl border p-4 space-y-2">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Tất cả nhiệm vụ (CRM + SX + VC + dự án)</h2>
            {(bundle?.unified_tasks || []).length === 0 ? (
              <p className="text-center text-gray-400 py-8">Chưa có nhiệm vụ</p>
            ) : (
              (bundle.unified_tasks || []).map((t) => (
                <UnifiedTaskRow key={t.unified_id} task={t} />
              ))
            )}
          </div>
        )}

        {tab === 'documents' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-4">
              <h2 className="text-sm font-bold text-gray-900 mb-3">Tài liệu CRM ({stats?.documents || 0})</h2>
              {(bundle?.documents || []).length === 0 ? (
                <p className="text-gray-400 text-sm py-4 text-center">Chưa có tài liệu</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {(bundle.documents || []).map((doc) => {
                    const href = doc.file_name ? publicFileUrl(doc.file_path || doc.file_url) : null;
                    const openProps = href ? getFileOpenAnchorProps(doc.file_path || doc.file_url, { fileName: doc.file_name }) : null;
                    return (
                      <div key={doc.id} className="py-2 flex items-center gap-3">
                        <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{doc.name || doc.file_name}</p>
                          <p className="text-[10px] text-gray-400">{doc.doc_type} · {doc.created_at ? formatDate(doc.created_at) : ''}</p>
                        </div>
                        {openProps && <a {...openProps} className="text-xs text-blue-600 hover:underline shrink-0">Mở</a>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {project?.id && (
              <div className="bg-white rounded-xl border p-4">
                <Link to={`/projects/${project.id}?tab=documents`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  <ExternalLink className="h-4 w-4" /> Tài liệu dự án đầy đủ
                </Link>
              </div>
            )}
          </div>
        )}

        {tab === 'sx' && (
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">Nhiệm vụ Sản xuất</h2>
              {project?.id && (
                <Link to={`/sx/projects/${project.id}`} className="text-xs text-orange-600 hover:underline flex items-center gap-1">
                  Mở chi tiết SX <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
            {!project ? (
              <p className="text-gray-400 text-sm py-6 text-center">Deal chưa có dự án / chưa vào sản xuất</p>
            ) : sxProjectTasks.length === 0 ? (
              <p className="text-gray-400 text-sm py-6 text-center">Chưa có nhiệm vụ SX</p>
            ) : (
              sxProjectTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg border border-orange-100 bg-orange-50/50 text-sm">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${t.status === 'done' ? 'bg-emerald-500' : 'bg-orange-400'}`} />
                  <span className="flex-1">{t.title}</span>
                  <span className="text-xs text-gray-500">{t.status}</span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'vc' && (
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">Nhiệm vụ Vận chuyển</h2>
              {project?.id && (
                <Link to={`/vc/projects/${project.id}`} className="text-xs text-amber-700 hover:underline flex items-center gap-1">
                  Mở chi tiết VC <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
            {!project ? (
              <p className="text-gray-400 text-sm py-6 text-center">Deal chưa có dự án</p>
            ) : vcProjectTasks.length === 0 ? (
              <p className="text-gray-400 text-sm py-6 text-center">Chưa có nhiệm vụ VC</p>
            ) : (
              vcProjectTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg border border-amber-100 bg-amber-50/50 text-sm">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${t.status === 'done' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                  <span className="flex-1">{t.title}</span>
                  <span className="text-xs text-gray-500">{t.status}</span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'activity' && (
          <div className="bg-white rounded-xl border p-4">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Hoạt động CRM</h2>
            {(bundle?.activities || []).length === 0 ? (
              <p className="text-gray-400 text-sm py-6 text-center">Chưa có hoạt động</p>
            ) : (
              <div className="space-y-3">
                {(bundle.activities || []).map((a) => (
                  <div key={a.id} className="border-l-2 border-blue-200 pl-3 py-1">
                    <p className="text-sm font-medium text-gray-900">{a.title || a.type}</p>
                    {a.content && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{a.content}</p>}
                    <p className="text-[10px] text-gray-400 mt-1">{a.created_at ? formatDate(a.created_at) : ''}</p>
                  </div>
                ))}
              </div>
            )}
            <Link to={`/crm/leads/${lead.id}`} className="inline-flex items-center gap-1 mt-4 text-xs text-blue-600 hover:underline">
              Xem đầy đủ trên CRM <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}

        {tab === 'finance' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <h2 className="text-sm font-bold text-gray-900 mb-3">Báo giá</h2>
              {(bundle?.quotations || []).length === 0 ? (
                <p className="text-gray-400 text-sm">Chưa có báo giá</p>
              ) : (
                (bundle.quotations || []).map((q) => (
                  <div key={q.id} className="py-2 border-b border-gray-50 last:border-0">
                    <p className="text-sm font-medium">{q.code || q.id.slice(0, 8)}</p>
                    <p className="text-xs text-gray-500">{q.status} · {formatVND(q.total)}</p>
                  </div>
                ))
              )}
            </div>
            <div className="bg-white rounded-xl border p-4">
              <h2 className="text-sm font-bold text-gray-900 mb-3">Đơn hàng</h2>
              {(bundle?.orders || []).length === 0 ? (
                <p className="text-gray-400 text-sm">Chưa có đơn hàng</p>
              ) : (
                (bundle.orders || []).map((o) => (
                  <div key={o.id} className="py-2 border-b border-gray-50 last:border-0">
                    <p className="text-sm font-medium">{o.code || o.id.slice(0, 8)}</p>
                    <p className="text-xs text-gray-500">{o.status} · {formatVND(o.total)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
