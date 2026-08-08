import { Link } from 'react-router-dom';
import { Target, Factory, Truck, CheckSquare, FileText, ExternalLink, Layers } from 'lucide-react';

function PipelineChip({ label, stage, tone }) {
  if (!stage) {
    return (
      <div className={`rounded-lg border px-3 py-2 ${tone} opacity-60`}>
        <p className="text-[10px] font-semibold uppercase text-gray-500">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">Chưa có</p>
      </div>
    );
  }
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <p className="text-[10px] font-semibold uppercase text-gray-500">{label}</p>
      <p className="text-xs font-bold mt-0.5" style={{ color: stage.color || '#374151' }}>
        {stage.icon ? `${stage.icon} ` : ''}{stage.name}
      </p>
    </div>
  );
}

function ModuleStat({ icon: Icon, label, tasks, documents, color }) {
  const done = tasks?.done ?? 0;
  const total = tasks?.total ?? 0;
  const docs = documents?.total ?? 0;
  if (total === 0 && docs === 0) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      <span className="font-semibold text-gray-800">{label}</span>
      <span className="text-gray-500">{done}/{total} NV</span>
      <span className="text-gray-300">·</span>
      <span className="text-gray-500">{docs} TL</span>
    </div>
  );
}

export default function ProjectDealSyncPanel({ bundle, projectId, onOpenAggregate }) {
  if (!bundle) return null;

  const { primary_lead, pipelines, sections, totals } = bundle;
  const hasData = (totals?.tasks || 0) > 0 || (totals?.documents || 0) > 0;

  return (
    <div className="bg-gradient-to-r from-slate-50 via-blue-50/40 to-indigo-50/30 rounded-xl border border-blue-100 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" />
            Đồng bộ CRM · Sản xuất · Lắp đặt
          </h3>
          {primary_lead ? (
            <p className="text-xs text-gray-600 mt-1">
              {primary_lead.code && <span className="font-bold text-blue-600 mr-1">{primary_lead.code}</span>}
              {primary_lead.title}
              {primary_lead.customer?.full_name && (
                <span className="text-gray-400"> · {primary_lead.customer.full_name}</span>
              )}
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">Dự án chưa gắn Deal CRM — chỉ hiển thị quy trình nội bộ</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {primary_lead?.id && (
            <Link
              to={`/management/deals/${primary_lead.id}`}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-blue-200 bg-white text-blue-800 text-[11px] font-medium hover:bg-blue-50"
            >
              Deal đầy đủ <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          <button
            type="button"
            onClick={onOpenAggregate}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700 cursor-pointer"
          >
            Chi tiết tổng hợp
          </button>
          <Link
            to="/work/unified"
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-[11px] font-medium hover:bg-gray-50"
          >
            <CheckSquare className="h-3 w-3" /> Tổng hợp NV
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <PipelineChip label="CRM" stage={pipelines?.crm} tone="bg-emerald-50/80 border-emerald-100" />
        <PipelineChip label="Sản xuất" stage={pipelines?.sx} tone="bg-orange-50/80 border-orange-100" />
        <PipelineChip label="Lắp đặt" stage={pipelines?.vc} tone="bg-amber-50/80 border-amber-100" />
      </div>

      {hasData ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1 pt-2 border-t border-blue-100/80">
          <ModuleStat icon={Target} label="CRM" tasks={sections?.crm?.stats?.tasks} documents={sections?.crm?.stats?.documents} color="text-emerald-600" />
          <ModuleStat icon={Factory} label="SX" tasks={sections?.sx?.stats?.tasks} documents={sections?.sx?.stats?.documents} color="text-orange-600" />
          <ModuleStat icon={Truck} label="VC" tasks={sections?.vc?.stats?.tasks} documents={sections?.vc?.stats?.documents} color="text-amber-600" />
          <div className="flex items-center gap-1 text-xs text-gray-500 ml-auto">
            <FileText className="h-3.5 w-3.5" />
            <span className="font-semibold text-gray-800">{totals.documents}</span> tài liệu ·
            <CheckSquare className="h-3.5 w-3.5 ml-1" />
            <span className="font-semibold text-gray-800">{totals.tasks}</span> nhiệm vụ
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 pt-2 border-t border-blue-100/80">
          Chưa có nhiệm vụ hoặc tài liệu từ CRM / SX / VC
        </p>
      )}
    </div>
  );
}
