import { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import api from '../lib/api';
import { formatDate } from '../lib/utils';
import {
  CRM_DEADLINE_SOURCE_META,
  resolveCrmLeadDeadlineViewSource,
  getPipelineStageSlaDeadlineTs,
  crmLeadMissingPhone,
  shouldHideCrmKanbanDeadlineOnCard,
  isCrmPipelineStageNoDeadline,
  formatCrmRemainingMs,
  getCrmDeadlineUrgencyFromTs,
  getCrmDeadlineUrgencyBadgeClass,
} from '../lib/crmLeadDeadlineDisplay';
import { effectivePipelineStageSlaDays } from '../lib/crmPipelineSla';

function formatDeadlineIso(iso) {
  if (iso == null || iso === '') return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  return formatDate(new Date(ts).toISOString());
}

function SourceBadge({ source }) {
  if (!source) return null;
  const meta = CRM_DEADLINE_SOURCE_META[source];
  if (!meta) return null;
  return (
    <span
      className={`inline-flex items-center shrink-0 rounded border px-1.5 py-px text-[9px] font-semibold leading-tight ${meta.className}`}
      title={`Hạn từ: ${meta.label}`}
    >
      {meta.label}
    </span>
  );
}

function SourceRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[11px] leading-snug">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-right text-slate-700 min-w-0">{children}</span>
    </div>
  );
}

/** Hạn hiển thị trên view Deadline Dashboard — giải thích nguồn (thẻ / NV / SLA / ngày chốt). */
export default function CrmLeadDeadlineOverview({ lead }) {
  const [deadlineConfig, setDeadlineConfig] = useState(null);

  useEffect(() => {
    const cid = lead?.company_id;
    if (!cid) {
      setDeadlineConfig(null);
      return undefined;
    }
    let cancelled = false;
    api.get('/crm/settings/deadline-config', { params: { company_id: cid } })
      .then((r) => { if (!cancelled) setDeadlineConfig(r.data); })
      .catch(() => { if (!cancelled) setDeadlineConfig(null); });
    return () => { cancelled = true; };
  }, [lead?.company_id]);

  const stage = lead?.stage;
  const cfg = deadlineConfig || {
    primary_field: 'crm_next_open_task_deadline',
    fallback_field: 'expected_close_date',
  };

  const resolved = useMemo(
    () => resolveCrmLeadDeadlineViewSource(lead, stage, cfg),
    [lead, stage, cfg],
  );

  const hidden = shouldHideCrmKanbanDeadlineOnCard(lead, stage);
  const slaDays = crmLeadMissingPhone(lead) ? null : effectivePipelineStageSlaDays(stage?.sla_days);
  const slaTs = getPipelineStageSlaDeadlineTs(lead?.stage_entered_at, stage, lead);

  if (isCrmPipelineStageNoDeadline(stage)) return null;

  const kanbanLabel = formatDeadlineIso(lead?.kanban_deadline_at);
  const taskLabel = formatDeadlineIso(lead?.crm_next_open_task_deadline);
  const expectedCloseLabel = formatDeadlineIso(lead?.expected_close_date);
  const slaLabel = slaTs != null ? formatDate(new Date(slaTs).toISOString()) : null;

  const urg = getCrmDeadlineUrgencyFromTs(resolved.deadlineTs);
  const remainLabel = urg.remainingMs != null
    ? formatCrmRemainingMs(Math.abs(urg.remainingMs))
    : '';
  const isUrgent = urg.level === 'overdue' || urg.level === 'soon';

  const showDashboardNote = !kanbanLabel && resolved.deadlineTs != null && !hidden;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2.5 my-1.5">
      <div className="flex items-start gap-2">
        <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" strokeWidth={2.2} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-amber-700 uppercase tracking-wider font-medium mb-1">
            Hạn trên view Deadline
          </p>

          {hidden ? (
            <p className="text-sm text-slate-500 italic">
              Không hiển thị trên Dashboard (chưa có SĐT, đã tương tác, hoặc cột không theo dõi hạn).
            </p>
          ) : resolved.deadlineTs == null ? (
            <p className="text-sm text-gray-400 italic">Không có hạn — sẽ nằm cột «Không hạn» trên Dashboard.</p>
          ) : (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <SourceBadge source={resolved.source} />
                {remainLabel && (
                  <span className={`inline-flex items-center gap-1 rounded-md border tabular-nums leading-none ${
                    isUrgent ? 'px-2 py-1 text-[11px]' : 'px-1.5 py-0.5 text-[10px]'
                  } ${getCrmDeadlineUrgencyBadgeClass(urg.level)}`}>
                    <Clock className={isUrgent ? 'h-3.5 w-3.5' : 'h-3 w-3'} strokeWidth={2.6} />
                    {urg.level === 'overdue' ? <>Quá {remainLabel}</> : <>Còn {remainLabel}</>}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-800">
                Hạn: {formatDate(new Date(resolved.deadlineTs).toISOString())}
              </p>
              {showDashboardNote && (
                <p className="text-[11px] text-amber-800/90 bg-amber-100/80 border border-amber-200/80 rounded-md px-2 py-1">
                  Ưu tiên hạn: <strong>Deadline nhiệm vụ</strong> → <strong>Deadline tự setup</strong> → <strong>SLA cột</strong>.
                  Hiện đang dùng{' '}
                  <strong>{CRM_DEADLINE_SOURCE_META[resolved.source]?.label || 'nguồn khác'}</strong>.
                </p>
              )}
            </div>
          )}

          {!hidden && (
            <div className="mt-2.5 pt-2 border-t border-amber-200/70 space-y-1">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Chi tiết nguồn</p>
              <SourceRow label="Deadline nhiệm vụ (NV mở)">
                {taskLabel ? taskLabel : (
                  <span className="text-slate-400 italic">Không có NV đang mở hoặc chưa tới lượt đếm hạn</span>
                )}
              </SourceRow>
              <SourceRow label="Deadline tự setup (thẻ)">
                {kanbanLabel ? kanbanLabel : <span className="text-slate-400 italic">Chưa đặt</span>}
              </SourceRow>
              {lead?.type === 'deal' && (
                <SourceRow label="Ngày dự kiến chốt">
                  {expectedCloseLabel ? expectedCloseLabel : <span className="text-slate-400 italic">Chưa nhập</span>}
                </SourceRow>
              )}
              <SourceRow label="SLA cột">
                {slaLabel && slaDays != null ? (
                  <span>
                    {slaLabel}
                    <span className="text-slate-400 font-normal">
                      {' '}· {slaDays} ng · vào cột {lead?.stage_entered_at ? formatDate(lead.stage_entered_at) : '—'}
                    </span>
                  </span>
                ) : (
                  <span className="text-slate-400 italic">Không áp dụng</span>
                )}
              </SourceRow>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
