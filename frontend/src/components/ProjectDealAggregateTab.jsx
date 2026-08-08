import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { formatDate } from '../lib/utils';
import { getFileOpenAnchorProps } from '../lib/publicFileUrl';
import {
  Target, Factory, Truck, CheckSquare, FileText, ChevronDown, ChevronRight,
  ExternalLink, Layers,
} from 'lucide-react';

const SECTION_META = {
  crm: { icon: Target, ring: 'ring-emerald-200', header: 'from-emerald-50 to-teal-50', badge: 'bg-emerald-100 text-emerald-800' },
  sx: { icon: Factory, ring: 'ring-orange-200', header: 'from-orange-50 to-amber-50', badge: 'bg-orange-100 text-orange-800' },
  vc: { icon: Truck, ring: 'ring-amber-200', header: 'from-amber-50 to-yellow-50', badge: 'bg-amber-100 text-amber-800' },
  workflow: { icon: Layers, ring: 'ring-blue-200', header: 'from-blue-50 to-indigo-50', badge: 'bg-blue-100 text-blue-800' },
};

const STATUS_DONE = new Set(['completed', 'done']);

function TaskStatusBadge({ status }) {
  const done = STATUS_DONE.has(String(status));
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
      done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
    }`}>
      {done ? '✓ Xong' : status || '—'}
    </span>
  );
}

function DocumentRow({ doc }) {
  const href = doc.file_path || doc.file_url;
  const openProps = href ? getFileOpenAnchorProps(href, { fileName: doc.file_name || doc.name }) : null;
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/80 text-sm">
      <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
      <span className="flex-1 truncate text-gray-800">{doc.name || doc.file_name || 'Tài liệu'}</span>
      {doc.doc_type && <span className="text-[10px] text-gray-400 shrink-0">{doc.doc_type}</span>}
      {openProps && (
        <a {...openProps} className="text-[10px] text-blue-600 hover:underline shrink-0">Mở</a>
      )}
    </div>
  );
}

function SectionBlock({ sectionKey, section, defaultOpen }) {
  const meta = SECTION_META[sectionKey] || SECTION_META.workflow;
  const Icon = meta.icon;
  const [open, setOpen] = useState(defaultOpen);
  const taskTotal = section.stats?.tasks?.total ?? section.tasks?.length ?? 0;
  const taskDone = section.stats?.tasks?.done ?? 0;
  const docTotal = section.stats?.documents?.total ?? section.documents?.length ?? 0;

  if (taskTotal === 0 && docTotal === 0) return null;

  return (
    <div className={`rounded-xl border bg-gradient-to-r ${meta.header} overflow-hidden ring-1 ${meta.ring}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left cursor-pointer hover:brightness-[0.99]"
      >
        <span className="text-2xl">{section.emoji}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-900">{section.label}</h3>
          <div className="flex flex-wrap gap-2 mt-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}>
              {taskDone}/{taskTotal} nhiệm vụ
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}>
              {docTotal} tài liệu
            </span>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/60 bg-white/40">
          {section.tasks?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                <CheckSquare className="h-3 w-3" /> Nhiệm vụ ({section.tasks.length})
              </p>
              <div className="space-y-1 bg-white/70 rounded-lg p-2">
                {section.tasks.map((t) => (
                  <div key={`${t.source}-${t.id}`} className="flex items-center gap-2 py-1.5 px-2 text-sm">
                    <span className="flex-1 truncate text-gray-800">{t.title}</span>
                    {t.deadline && (
                      <span className="text-[10px] text-gray-400 shrink-0">{formatDate(t.deadline)}</span>
                    )}
                    <TaskStatusBadge status={t.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {section.documents?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                <FileText className="h-3 w-3" /> Tài liệu ({section.documents.length})
              </p>
              <div className="space-y-0.5 bg-white/70 rounded-lg p-2">
                {section.documents.map((d) => (
                  <DocumentRow key={d.id || `${d.file_name}-${d.created_at}`} doc={d} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProjectDealAggregateTab({ projectId, project, bundle: bundleProp, onReload }) {
  const parentOwned = !!onReload;
  const [bundleLocal, setBundleLocal] = useState(null);
  const [loading, setLoading] = useState(!parentOwned);

  const loadLocal = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/management/by-project/${projectId}`);
      setBundleLocal(data);
    } catch {
      setBundleLocal(null);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (!parentOwned) void loadLocal();
  }, [parentOwned, loadLocal]);

  const bundle = parentOwned ? bundleProp : (bundleLocal || bundleProp);

  if (loading || (parentOwned && !bundle)) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        Chưa có dữ liệu tổng hợp cho dự án này
      </div>
    );
  }

  const { sections, primary_lead, pipelines, totals } = bundle;
  const hasAny = totals.tasks > 0 || totals.documents > 0;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-600" />
              Tổng hợp — CRM · Sản xuất · Lắp đặt · Dữ liệu
            </h2>
            {primary_lead ? (
              <p className="text-sm text-gray-600 mt-1">
                {primary_lead.code && <span className="font-bold text-blue-600 mr-1">{primary_lead.code}</span>}
                {primary_lead.title}
                {primary_lead.customer?.full_name && (
                  <span className="text-gray-400"> · {primary_lead.customer.full_name}</span>
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

        <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-gray-100 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-900">{totals.tasks}</p>
            <p className="text-[10px] text-gray-500 uppercase">Tổng NV</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{totals.documents}</p>
            <p className="text-[10px] text-gray-500 uppercase">Tổng tài liệu</p>
          </div>
          {sections?.crm && (
            <div>
              <p className="text-lg font-bold text-emerald-700">{sections.crm.stats.tasks.total}</p>
              <p className="text-[10px] text-gray-500">NV CRM · {sections.crm.stats.documents.total} TL</p>
            </div>
          )}
          {sections?.sx && (
            <div>
              <p className="text-lg font-bold text-orange-700">{sections.sx.stats.tasks.total}</p>
              <p className="text-[10px] text-gray-500">NV SX · {sections.sx.stats.documents.total} TL</p>
            </div>
          )}
          {sections?.vc && (
            <div>
              <p className="text-lg font-bold text-amber-700">{sections.vc.stats.tasks.total}</p>
              <p className="text-[10px] text-gray-500">NV VC · {sections.vc.stats.documents.total} TL</p>
            </div>
          )}
          {sections?.workflow?.stats?.documents?.total > 0 && (
            <div>
              <p className="text-lg font-bold text-blue-700">{sections.workflow.stats.documents.total}</p>
              <p className="text-[10px] text-gray-500">TL quy trình DA</p>
            </div>
          )}
        </div>
      </div>

      {!hasAny ? (
        <p className="text-center text-sm text-gray-400 py-8">
          Chưa có nhiệm vụ hoặc tài liệu từ CRM / Sản xuất / Lắp đặt
        </p>
      ) : (
        <div className="space-y-3">
          <SectionBlock sectionKey="crm" section={sections.crm} defaultOpen />
          <SectionBlock sectionKey="sx" section={sections.sx} defaultOpen />
          <SectionBlock sectionKey="vc" section={sections.vc} defaultOpen={(sections.vc?.tasks?.length || 0) > 0} />
          <SectionBlock sectionKey="workflow" section={sections.workflow} defaultOpen={(sections.workflow?.documents?.length || 0) > 0} />
        </div>
      )}

      {project?.id && (
        <p className="text-xs text-gray-400 text-center">
          Dự án <span className="font-mono text-gray-600">{project.code}</span>
          {' · '}
          Tab Công việc / Tài liệu vẫn giữ chi tiết quy trình nội bộ
        </p>
      )}
    </div>
  );
}
