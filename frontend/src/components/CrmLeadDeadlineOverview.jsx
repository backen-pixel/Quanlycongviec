import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, ChevronDown, Clock, Pencil, RotateCcw, X } from 'lucide-react';
import api from '../lib/api';
import { formatDate } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import CrmDeadlineModal from './CrmDeadlineModal';
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

const LS_DEADLINE_OVERVIEW_OPEN = 'crm_lead_deadline_overview_open';

function formatDeadlineIso(iso) {
  if (iso == null || iso === '') return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  return formatDate(new Date(ts).toISOString());
}

function calendarDayDiff(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endDay - startDay) / 86400000);
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

function SourceRow({ label, action, children }) {
  return (
    <div className="rounded-md border border-amber-100 bg-white/70 px-2 py-1.5 text-[11px] leading-snug">
      <div className="flex items-start justify-between gap-1.5">
        <span className="font-medium text-slate-500 min-w-0">{label}</span>
        {action}
      </div>
      <div className="mt-0.5 text-slate-700 break-words">{children}</div>
    </div>
  );
}

/** Hạn hiển thị trên view Deadline Dashboard — giải thích nguồn (thẻ / NV / SLA / ngày chốt). */
export default function CrmLeadDeadlineOverview({ lead, onChanged }) {
  const { user } = useAuth();
  const [deadlineConfig, setDeadlineConfig] = useState(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableReason, setDisableReason] = useState('');
  const [deadlineBusy, setDeadlineBusy] = useState(false);
  const [deadlineError, setDeadlineError] = useState('');
  const [taskDeadlines, setTaskDeadlines] = useState([]);
  const [taskDeadlinesLoading, setTaskDeadlinesLoading] = useState(false);
  const [deadlineEditor, setDeadlineEditor] = useState(null);
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      const v = localStorage.getItem(LS_DEADLINE_OVERVIEW_OPEN);
      if (v === '0') return false;
      if (v === '1') return true;
    } catch { /* ignore */ }
    return true;
  });
  const togglePanel = () => {
    setPanelOpen((open) => {
      const next = !open;
      try { localStorage.setItem(LS_DEADLINE_OVERVIEW_OPEN, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

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

  const loadTaskDeadlines = useCallback(async () => {
    if (!lead?.id) {
      setTaskDeadlines([]);
      return;
    }
    setTaskDeadlinesLoading(true);
    try {
      const { data } = await api.get(`/crm/leads/${lead.id}/tasks`);
      const rows = (Array.isArray(data) ? data : [])
        .filter((task) => (
          (task?.status === 'pending' || task?.status === 'in_progress')
          && task?.deadline
        ))
        .sort((a, b) => {
          const dateDiff = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
          return dateDiff || (Number(a.order_index) || 0) - (Number(b.order_index) || 0);
        });
      setTaskDeadlines(rows);
    } catch {
      setTaskDeadlines([]);
    } finally {
      setTaskDeadlinesLoading(false);
    }
  }, [lead?.id]);

  useEffect(() => {
    loadTaskDeadlines();
  }, [loadTaskDeadlines]);

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
  const canEditSla = isAdminLike(user) && !!stage?.id;

  const editButton = (onClick, label = 'Sửa') => (
    <button
      type="button"
      onClick={onClick}
      disabled={deadlineBusy}
      className="inline-flex shrink-0 items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 hover:border-amber-300 hover:text-amber-700 disabled:opacity-50"
    >
      <Pencil className="h-2.5 w-2.5" />
      {label}
    </button>
  );

  const saveDeadlineEditor = async ({ deadlineIso, reason }) => {
    if (!deadlineEditor || !lead?.id) return;
    setDeadlineBusy(true);
    setDeadlineError('');
    try {
      if (deadlineEditor.type === 'task') {
        await api.put(`/crm/leads/${lead.id}/tasks/${deadlineEditor.task.id}`, {
          deadline: deadlineIso,
        });
      } else if (deadlineEditor.type === 'kanban') {
        await api.patch(`/crm/leads/${lead.id}/deadline`, {
          kanban_deadline_at: deadlineIso,
          reason,
        });
      } else if (deadlineEditor.type === 'expected_close') {
        await api.put(`/crm/leads/${lead.id}`, {
          expected_close_date: deadlineIso ? deadlineIso.slice(0, 10) : null,
        });
      } else if (deadlineEditor.type === 'sla') {
        const slaDaysValue = deadlineIso
          ? calendarDayDiff(lead?.stage_entered_at, deadlineIso)
          : 0;
        if (deadlineIso && (!Number.isFinite(slaDaysValue) || slaDaysValue < 1 || slaDaysValue > 365)) {
          throw new Error('Ngày SLA phải sau ngày vào cột và không quá 365 ngày.');
        }
        await api.put(`/crm/pipeline-stages/${stage.id}`, {
          sla_days: deadlineIso ? slaDaysValue : 0,
        });
      }
      setDeadlineEditor(null);
      await Promise.all([loadTaskDeadlines(), onChanged?.()]);
    } catch (e) {
      setDeadlineError(e.response?.data?.error || e.message || 'Không cập nhật được deadline.');
    } finally {
      setDeadlineBusy(false);
    }
  };

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
    <>
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
            <button
              type="button"
              onClick={togglePanel}
              className="inline-flex items-center gap-1 min-w-0 text-left cursor-pointer group"
              title={panelOpen ? 'Thu gọn' : 'Mở rộng'}
              aria-expanded={panelOpen}
            >
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                  allDisabled ? 'text-slate-500' : 'text-amber-700'
                } ${panelOpen ? '' : '-rotate-90'}`}
              />
              <p className={`text-[10px] uppercase tracking-wider font-medium ${
                allDisabled ? 'text-slate-600' : 'text-amber-700'
              } group-hover:underline`}>
                Hạn trên view Deadline
              </p>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={togglePanel}
                className={`inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-semibold cursor-pointer ${
                  allDisabled
                    ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    : 'border-amber-200 bg-white text-amber-800 hover:bg-amber-50'
                }`}
                title={panelOpen ? 'Ẩn' : 'Hiện'}
              >
                {panelOpen ? 'Ẩn' : 'Hiện'}
              </button>
              {panelOpen && (allDisabled ? (
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
            ))}
            </div>
          </div>

          {!panelOpen ? (
            <button
              type="button"
              onClick={togglePanel}
              className="w-full text-left cursor-pointer rounded-md border border-amber-100/80 bg-white/60 px-2 py-1.5 hover:bg-white"
              title="Bấm để mở rộng"
            >
              {allDisabled ? (
                <p className="text-xs font-semibold text-slate-700">Đã tắt tất cả deadline</p>
              ) : hidden ? (
                <p className="text-xs text-slate-500 italic">Không hiện trên Dashboard</p>
              ) : resolved.deadlineTs == null ? (
                <p className="text-xs text-gray-400 italic">Không có hạn</p>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  <SourceBadge source={resolved.source} />
                  {remainLabel && (
                    <span className={`inline-flex items-center gap-1 rounded-md border tabular-nums leading-none px-1.5 py-0.5 text-[10px] ${getCrmDeadlineUrgencyBadgeClass(urg.level)}`}>
                      <Clock className="h-3 w-3" strokeWidth={2.6} />
                      {urg.level === 'overdue' ? <>Quá {remainLabel}</> : <>Còn {remainLabel}</>}
                    </span>
                  )}
                  <span className="text-[11px] font-semibold text-slate-700">
                    {formatDate(new Date(resolved.deadlineTs).toISOString())}
                  </span>
                </div>
              )}
            </button>
          ) : (
          <>
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
            <div className="mt-2.5 pt-2 border-t border-amber-200/70 space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Các deadline đang setup
              </p>

              <div className="rounded-md border border-amber-100 bg-white/70 px-2 py-1.5">
                <p className="text-[11px] font-medium text-slate-500">1. Deadline nhiệm vụ đang mở</p>
                {taskDeadlinesLoading ? (
                  <p className="mt-1 text-[10px] italic text-slate-400">Đang tải danh sách…</p>
                ) : taskDeadlines.length ? (
                  <div className="mt-1 max-h-40 space-y-1 overflow-y-auto pr-0.5">
                    {taskDeadlines.map((task) => (
                      <div key={task.id} className="rounded border border-slate-100 bg-white px-1.5 py-1">
                        <div className="flex items-start justify-between gap-1">
                          <span className="min-w-0 break-words text-[10px] font-medium text-slate-700">
                            {task.title || 'Nhiệm vụ'}
                          </span>
                          {editButton(() => setDeadlineEditor({ type: 'task', task }))}
                        </div>
                        <p className="mt-0.5 text-[10px] text-amber-700">{formatDeadlineIso(task.deadline)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[10px] italic text-slate-400">
                    {taskLabel
                      ? `Hạn gần nhất: ${taskLabel}`
                      : 'Không có nhiệm vụ mở đã đặt deadline'}
                  </p>
                )}
              </div>

              <SourceRow
                label="2. Deadline tự setup (thẻ)"
                action={editButton(
                  () => setDeadlineEditor({ type: 'kanban' }),
                  kanbanLabel ? 'Sửa' : 'Đặt',
                )}
              >
                {kanbanLabel ? kanbanLabel : <span className="text-slate-400 italic">Chưa đặt</span>}
              </SourceRow>
              <SourceRow
                label="3. SLA cột (áp dụng mọi thẻ)"
                action={canEditSla
                  ? editButton(() => setDeadlineEditor({ type: 'sla' }))
                  : null}
              >
                {slaLabel && slaDays != null ? (
                  <>
                    {slaLabel}
                    <span className="text-slate-400 font-normal">
                      {' '}· {slaDays} ngày · vào cột {lead?.stage_entered_at ? formatDate(lead.stage_entered_at) : '—'}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400 italic">Không áp dụng</span>
                )}
              </SourceRow>
              {lead?.type === 'deal' && (
                <SourceRow
                  label="4. Ngày dự kiến chốt (fallback)"
                  action={editButton(
                    () => setDeadlineEditor({ type: 'expected_close' }),
                    expectedCloseLabel ? 'Sửa' : 'Đặt',
                  )}
                >
                  {expectedCloseLabel ? expectedCloseLabel : <span className="text-slate-400 italic">Chưa nhập</span>}
                </SourceRow>
              )}
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
          </>
          )}
        </div>
      </div>
      </div>

      <CrmDeadlineModal
        open={!!deadlineEditor}
        title={
          deadlineEditor?.type === 'task'
            ? `Deadline nhiệm vụ: ${deadlineEditor?.task?.title || ''}`
            : deadlineEditor?.type === 'expected_close'
              ? 'Ngày dự kiến chốt'
              : deadlineEditor?.type === 'sla'
                ? 'Deadline SLA cột'
              : 'Deadline tự setup của thẻ'
        }
        subtitle={
          deadlineEditor?.type === 'task'
            ? 'Thay đổi này cập nhật trực tiếp ngày hẹn của nhiệm vụ.'
            : deadlineEditor?.type === 'expected_close'
              ? 'Ngày dự kiến chốt là nguồn fallback trên view Deadline.'
              : deadlineEditor?.type === 'sla'
                ? 'Ngày được chọn sẽ quy đổi thành số ngày SLA và áp dụng cho mọi thẻ trong cột này.'
              : 'Mọi thay đổi deadline thẻ được ghi vào lịch sử.'
        }
        initialDeadline={
          deadlineEditor?.type === 'task'
            ? deadlineEditor?.task?.deadline
            : deadlineEditor?.type === 'expected_close'
              ? lead?.expected_close_date
              : deadlineEditor?.type === 'sla'
                ? (slaTs != null ? new Date(slaTs).toISOString() : null)
              : lead?.kanban_deadline_at
        }
        currentDeadline={
          deadlineEditor?.type === 'task'
            ? deadlineEditor?.task?.deadline
            : deadlineEditor?.type === 'expected_close'
              ? lead?.expected_close_date
              : deadlineEditor?.type === 'sla'
                ? (slaTs != null ? new Date(slaTs).toISOString() : null)
              : lead?.kanban_deadline_at
        }
        requireReason={deadlineEditor?.type === 'kanban' && !!lead?.kanban_deadline_at}
        allowClear={
          deadlineEditor?.type === 'task'
          || (deadlineEditor?.type === 'kanban' && !!lead?.kanban_deadline_at)
          || (deadlineEditor?.type === 'expected_close' && !!lead?.expected_close_date)
          || (deadlineEditor?.type === 'sla' && slaTs != null)
        }
        submitting={deadlineBusy}
        companyId={lead?.company_id || null}
        onClose={() => !deadlineBusy && setDeadlineEditor(null)}
        onConfirm={saveDeadlineEditor}
      />
    </>
  );
}
