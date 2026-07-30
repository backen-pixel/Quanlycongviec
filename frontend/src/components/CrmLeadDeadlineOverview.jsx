import { useEffect, useMemo, useState } from 'react';
import { Ban, Clock, RotateCcw, X } from 'lucide-react';
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
export default function CrmLeadDeadlineOverview({ lead, onChanged }) {
  const [deadlineConfig, setDeadlineConfig] = useState(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableReason, setDisableReason] = useState('');
  const [deadlineBusy, setDeadlineBusy] = useState(false);
  const [deadlineError, setDeadlineError] = useState('');

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
  const allDisabled = !!lead?.deadline_disabled_at;

  const disableAllDeadlines = async () => {
    const reason = disableReason.trim();
    if (reason.length < 3) {
      setDeadlineError('Nhập lý do ít nhất 3 ký tự.');
      return;
    }
    setDeadlineBusy(true);
    setDeadlineError('');
    try {
      await api.patch(`/crm/leads/${lead.id}/deadline/disable-all`, {
        disabled: true,
        reason,
      });
      setDisableOpen(false);
      setDisableReason('');
      await onChanged?.();
    } catch (e) {
      setDeadlineError(e.response?.data?.error || 'Không tắt được deadline.');
    } finally {
      setDeadlineBusy(false);
    }
  };

  const enableDeadlines = async () => {
    setDeadlineBusy(true);
    setDeadlineError('');
    try {
      await api.patch(`/crm/leads/${lead.id}/deadline/disable-all`, {
        disabled: false,
      });
      await onChanged?.();
    } catch (e) {
      setDeadlineError(e.response?.data?.error || 'Không bật lại được deadline.');
    } finally {
      setDeadlineBusy(false);
    }
  };

  return (
    <div className={`rounded-lg border p-2.5 my-1.5 ${
      allDisabled ? 'border-slate-300 bg-slate-50' : 'border-amber-200 bg-amber-50/40'
    }`}>
      <div className="flex items-start gap-2">
        {allDisabled ? (
          <Ban className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" strokeWidth={2.2} />
        ) : (
          <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" strokeWidth={2.2} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className={`text-[10px] uppercase tracking-wider font-medium ${
              allDisabled ? 'text-slate-600' : 'text-amber-700'
            }`}>
              Hạn trên view Deadline
            </p>
            {allDisabled ? (
              <button
                type="button"
                onClick={enableDeadlines}
                disabled={deadlineBusy}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" />
                Bật lại
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDisableOpen(true);
                  setDeadlineError('');
                }}
                disabled={deadlineBusy}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Ban className="h-3 w-3" />
                Tắt deadline
              </button>
            )}
          </div>

          {allDisabled ? (
            <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
              <p className="text-xs font-semibold text-slate-700">Đã tắt tất cả deadline</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Deadline nhiệm vụ, deadline thẻ, ngày dự kiến chốt và SLA cột không còn đưa thẻ vào view Deadline.
              </p>
              {lead?.deadline_disabled_reason && (
                <p className="mt-1 text-[11px] text-slate-700">
                  <span className="font-semibold">Lý do:</span> {lead.deadline_disabled_reason}
                </p>
              )}
              {lead?.deadline_disabled_at && (
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Tắt lúc {new Date(lead.deadline_disabled_at).toLocaleString('vi-VN')}
                </p>
              )}
            </div>
          ) : hidden ? (
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

          {!hidden && !allDisabled && (
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

          {disableOpen && !allDisabled && (
            <div className="mt-2.5 rounded-lg border border-red-200 bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-red-700">Tắt tất cả deadline</p>
                <button
                  type="button"
                  onClick={() => {
                    if (deadlineBusy) return;
                    setDisableOpen(false);
                    setDeadlineError('');
                  }}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Đóng"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                Thao tác sẽ xóa deadline thẻ và deadline nhiệm vụ hiện có, đồng thời tắt SLA/ngày dự kiến chốt trên view Deadline.
              </p>
              <textarea
                value={disableReason}
                onChange={(e) => {
                  setDisableReason(e.target.value);
                  setDeadlineError('');
                }}
                rows={2}
                maxLength={500}
                placeholder="Nhập lý do tắt deadline..."
                disabled={deadlineBusy}
                className="mt-2 w-full resize-none rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 disabled:opacity-50"
              />
              {deadlineError && <p className="mt-1 text-[10px] text-red-600">{deadlineError}</p>}
              <div className="mt-2 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setDisableOpen(false)}
                  disabled={deadlineBusy}
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={disableAllDeadlines}
                  disabled={deadlineBusy || disableReason.trim().length < 3}
                  className="rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deadlineBusy ? 'Đang tắt…' : 'Xác nhận tắt'}
                </button>
              </div>
            </div>
          )}
          {deadlineError && !disableOpen && (
            <p className="mt-1.5 text-[10px] text-red-600">{deadlineError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
