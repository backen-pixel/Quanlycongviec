import { Link } from 'react-router-dom';
import { Target, Factory, Truck, CheckSquare, FileText, ExternalLink, Layers } from 'lucide-react';

const CHIP_TONE = {
  crm: {
    wrap: 'bg-emerald-100 border-emerald-300',
    label: 'text-emerald-800',
    name: 'text-emerald-950',
    pct: 'text-emerald-950',
    meta: 'text-emerald-700',
    barTrack: 'bg-emerald-200/70',
    bar: 'bg-emerald-600',
    fallbackColor: '#047857',
  },
  sx: {
    wrap: 'bg-orange-100 border-orange-300',
    label: 'text-orange-800',
    name: 'text-orange-950',
    pct: 'text-orange-950',
    meta: 'text-orange-700',
    barTrack: 'bg-orange-200/70',
    bar: 'bg-orange-600',
    fallbackColor: '#c2410c',
  },
  vc: {
    wrap: 'bg-amber-100 border-amber-300',
    label: 'text-amber-900',
    name: 'text-amber-950',
    pct: 'text-amber-950',
    meta: 'text-amber-800',
    barTrack: 'bg-amber-200/70',
    bar: 'bg-amber-600',
    fallbackColor: '#b45309',
  },
};

/** Bỏ màu quá nhạt / xám — dùng màu module đậm; làm tối màu sáng để chữ dễ đọc. */
function resolveStageColor(raw, fallback) {
  const c = String(raw || '').trim();
  if (!c) return fallback;
  const lower = c.toLowerCase();
  if (
    lower === '#94a3b8'
    || lower === '#9ca3af'
    || lower === '#cbd5e1'
    || lower === '#e2e8f0'
    || lower === 'gray'
    || lower === 'grey'
  ) {
    return fallback;
  }
  const m = lower.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    // Luminance tương đối — màu sáng thì kéo về tối hơn ~35%
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (lum > 0.55) {
      const factor = 0.55;
      const dr = Math.round(r * factor);
      const dg = Math.round(g * factor);
      const db = Math.round(b * factor);
      return `#${[dr, dg, db].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
    }
  }
  return c;
}

function PipelineChip({ label, stage, moduleKey = 'crm' }) {
  const tone = CHIP_TONE[moduleKey] || CHIP_TONE.crm;
  const name = stage?.name || 'Chưa có';
  const done = stage?.tasks_done ?? 0;
  const total = stage?.tasks_total ?? 0;
  const pct = stage?.pct ?? (total ? Math.round((done / total) * 100) : 0);
  const muted = !!stage?.empty && total === 0;
  const nameColor = resolveStageColor(stage?.color, tone.fallbackColor);
  const companyHint = stage?.company_label || null;
  const personHint = stage?.person?.full_name || null;

  return (
    <div className={`rounded-lg border-2 px-3 py-2.5 shadow-sm ${tone.wrap} ${muted ? 'opacity-75' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-bold uppercase tracking-wide ${tone.label}`}>{label}</p>
          <p
            className={`text-xs font-extrabold mt-0.5 truncate ${tone.name}`}
            style={{ color: nameColor }}
            title={name}
          >
            {stage?.icon ? `${stage.icon} ` : ''}{name}
          </p>
          {(companyHint || personHint) && (
            <p className={`text-[10px] font-medium mt-0.5 truncate ${tone.meta}`} title={[companyHint, personHint].filter(Boolean).join(' · ')}>
              {[companyHint, personHint].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-extrabold tabular-nums ${tone.pct}`}>{pct}%</p>
          <p className={`text-[10px] font-semibold tabular-nums ${tone.meta}`}>{done}/{total} NV</p>
        </div>
      </div>
      <div className={`mt-2 h-1.5 rounded-full overflow-hidden border border-black/10 ${tone.barTrack}`}>
        <div
          className={`h-full rounded-full transition-all ${tone.bar}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
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

  // Fallback tiến độ từ sections nếu API cũ chưa có tasks_* trên pipelines
  const withProgress = (pipe, sectionKey) => {
    const stats = sections?.[sectionKey]?.stats?.tasks || { done: 0, total: 0 };
    if (!pipe) {
      return {
        name: 'Chưa có',
        empty: true,
        tasks_done: stats.done,
        tasks_total: stats.total,
        pct: stats.total ? Math.round((stats.done / stats.total) * 100) : 0,
      };
    }
    if (pipe.tasks_total != null) return pipe;
    return {
      ...pipe,
      tasks_done: stats.done,
      tasks_total: stats.total,
      pct: stats.total ? Math.round((stats.done / stats.total) * 100) : 0,
    };
  };

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
              {(bundle.lead_link === 'customer' || (
                bundle.lead_link === 'deal_projects'
                && String(primary_lead.project_id || '') !== String(projectId || '')
              )) && (
                <span className="ml-1 text-amber-700">· liên kết phụ (multi dự án)</span>
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
            Xem tổng quan
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <PipelineChip
          label="CRM"
          stage={withProgress(pipelines?.crm, 'crm')}
          moduleKey="crm"
        />
        <PipelineChip
          label="Sản xuất"
          stage={withProgress(pipelines?.sx, 'sx')}
          moduleKey="sx"
        />
        <PipelineChip
          label="Lắp đặt"
          stage={withProgress(pipelines?.vc, 'vc')}
          moduleKey="vc"
        />
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
