import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { ExternalLink, Layers } from 'lucide-react';
import ProjectModuleTasksTab from './ProjectModuleTasksTab';

/**
 * Tab CRM/SX/VC — lọc theo module, cây Module → Giai đoạn → Nhiệm vụ (+ tài liệu).
 */
export default function ProjectDealAggregateTab({
  projectId,
  project,
  bundle: bundleProp,
  onReload,
  filterModule = 'all',
  onFilterChange,
  onOpenProjectTask,
  onCreateTask,
}) {
  const parentOwned = !!onReload;
  const [bundleLocal, setBundleLocal] = useState(null);
  const [loading, setLoading] = useState(!parentOwned);

  const loadLocal = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/management/by-project/${projectId}`);
      setBundleLocal(data);
    } catch {
      setBundleLocal(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (parentOwned) return undefined;
    loadLocal();
    return undefined;
  }, [parentOwned, loadLocal]);

  const bundle = parentOwned ? bundleProp : bundleLocal;
  const primary_lead = bundle?.primary_lead;
  const pipelines = bundle?.pipelines;
  const totals = bundle?.totals || {};

  if (loading && !bundle) {
    return <p className="text-center text-sm text-gray-400 py-10">Đang tải CRM / SX / VC…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-600" />
              CRM · Sản xuất · Lắp đặt
            </h2>
            {primary_lead ? (
              <p className="text-xs text-gray-500 mt-1 truncate">
                Deal {primary_lead.code || primary_lead.title}
                {totals.tasks != null && (
                  <span className="ml-1 text-blue-700 font-semibold">· {totals.tasks} NV</span>
                )}
                {totals.documents != null && (
                  <span className="ml-1 text-gray-500">· {totals.documents} tài liệu</span>
                )}
              </p>
            ) : (
              <p className="text-sm text-gray-500 mt-1">Dự án chưa gắn Lead/Deal CRM</p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {primary_lead?.id && (
              <Link
                to={`/management/deals/${primary_lead.id}`}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-xs font-medium hover:bg-blue-100"
              >
                Trang deal đầy đủ <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            {primary_lead?.id && (
              <Link
                to={`/crm/leads/${primary_lead.id}`}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-medium hover:bg-emerald-100"
              >
                CRM <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>

        {(pipelines?.crm || pipelines?.sx || pipelines?.vc) && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            {pipelines?.crm && (
              <div className="rounded-lg border px-3 py-2 bg-emerald-50/50">
                <p className="text-[10px] text-gray-500 uppercase font-medium">CRM</p>
                <p className="text-xs font-bold" style={{ color: pipelines.crm.color || '#059669' }}>
                  {pipelines.crm.name}
                </p>
              </div>
            )}
            {pipelines?.sx && (
              <div className="rounded-lg border px-3 py-2 bg-orange-50/50">
                <p className="text-[10px] text-gray-500 uppercase font-medium">Sản xuất</p>
                <p className="text-xs font-bold text-orange-700">{pipelines.sx.name}</p>
              </div>
            )}
            {pipelines?.vc && (
              <div className="rounded-lg border px-3 py-2 bg-amber-50/50">
                <p className="text-[10px] text-gray-500 uppercase font-medium">Lắp đặt</p>
                <p className="text-xs font-bold text-amber-700">{pipelines.vc.name}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <ProjectModuleTasksTab
        projectId={projectId}
        project={project}
        bundle={bundle}
        filterModule={filterModule}
        onFilterChange={onFilterChange}
        onOpenProjectTask={onOpenProjectTask}
        onCreateTask={onCreateTask}
        showDocuments
        showHeader={false}
      />
    </div>
  );
}
