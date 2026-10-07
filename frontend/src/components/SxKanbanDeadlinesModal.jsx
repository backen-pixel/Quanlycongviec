import { useEffect, useMemo, useState } from 'react';
import { Clock, X } from 'lucide-react';
import { companyDeadlineIsoFromYmd } from '../lib/companyDeadlineClock';
import {
  addCalendarDaysYmd,
  buildSxInstallBackPlan,
  endYmdForDeadlineGroup,
  sxDeadlineGroupMeta,
  sxStageDeadlineGroup,
  vnNowParts,
  ymdFromUnknownDate,
} from '../lib/sxWorkshopSchedule';

/** Số ngày lịch mốc đứng trước ngày lắp. Đổi mốc = dời ngày lắp đúng bấy nhiêu ngày. */
const DAYS_BEFORE_INSTALL = {
  packing: 1,
  finishing: 2,
  cabinet: 4,
  planning: 6,
};

const GROUP_ORDER = ['planning', 'cabinet', 'finishing', 'packing'];

function predictedCardYmd(installYmd, stage, siblingStages) {
  if (!installYmd) return '';
  const plan = buildSxInstallBackPlan(installYmd);
  if (!plan) return '';
  if (stage?.clears_deadline || stage?.is_handover_to_logistics) return '';
  const group = sxStageDeadlineGroup(stage, siblingStages);
  return endYmdForDeadlineGroup(plan, group) || plan.productionFinishYmd || '';
}

function dateInputToIso(dateStr, companyId) {
  if (!dateStr?.trim()) return null;
  return companyDeadlineIsoFromYmd(dateStr.trim(), companyId) || null;
}

function DayBumpButtons({ disabled, onBump, title }) {
  return (
    <span className="inline-flex shrink-0 overflow-hidden rounded-md border border-slate-200" title={title}>
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onBump(n)}
          className="border-l border-slate-200 px-1.5 py-1 text-[11px] font-bold text-orange-700 first:border-l-0 hover:bg-orange-50 disabled:opacity-40"
        >
          +{n}
        </button>
      ))}
    </span>
  );
}

/**
 * Sửa deadline thẻ SX kèm các mốc kế hoạch còn lại.
 * Deadline thẻ sửa tay không đổi ngày lắp.
 * Đổi ngày lắp hoặc một mốc còn lại thì dời cả lịch và deadline thẻ theo cột hiện tại.
 */
export default function SxKanbanDeadlinesModal({
  open,
  project,
  stage = null,
  siblingStages = [],
  submitting = false,
  onClose,
  onSave,
}) {
  const todayYmd = vnNowParts().ymd;
  const initialInstall = ymdFromUnknownDate(project?.delivery_date)
    || ymdFromUnknownDate(project?.install_date);
  const initialCard = ymdFromUnknownDate(project?.sx_kanban_deadline_at);
  const [install, setInstall] = useState(initialInstall);
  const [card, setCard] = useState(initialCard);
  const [cardTouched, setCardTouched] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setInstall(initialInstall);
    setCard(initialCard);
    setCardTouched(false);
    setReason('');
    setError('');
  }, [open, initialInstall, initialCard]);

  const currentGroup = sxStageDeadlineGroup(stage, siblingStages);
  const plan = useMemo(
    () => (install ? buildSxInstallBackPlan(install) : null),
    [install],
  );

  const remaining = useMemo(() => {
    if (!plan) return [];
    return GROUP_ORDER
      .map((key) => {
        const meta = sxDeadlineGroupMeta(key);
        const end = endYmdForDeadlineGroup(plan, key);
        return {
          key,
          label: meta?.label || key,
          hint: meta?.hint || '',
          end,
          current: key === currentGroup,
        };
      })
      .filter((row) => row.end && row.end >= todayYmd);
  }, [plan, currentGroup, todayYmd]);

  if (!open) return null;

  const applyInstall = (nextInstall, { followCard = !cardTouched } = {}) => {
    setInstall(nextInstall);
    if (followCard) {
      setCardTouched(false);
      setCard(predictedCardYmd(nextInstall, stage, siblingStages));
    }
  };

  const onGroupDate = (key, ymd, { followCard = !cardTouched } = {}) => {
    if (!ymd) return;
    const shift = DAYS_BEFORE_INSTALL[key];
    const nextInstall = addCalendarDaysYmd(ymd, shift);
    if (!nextInstall) return;
    applyInstall(nextInstall, { followCard });
  };

  const bumpPlan = (days) => {
    const base = install || todayYmd;
    const next = addCalendarDaysYmd(base, days);
    if (!next) return;
    setError('');
    applyInstall(next, { followCard: true });
  };

  const bumpCardOnly = (days) => {
    const base = card || todayYmd;
    const next = addCalendarDaysYmd(base, days);
    if (!next) return;
    setCardTouched(true);
    setCard(next);
    setError('');
  };

  const submit = () => {
    const installChanged = install !== initialInstall;
    const predicted = install ? predictedCardYmd(install, stage, siblingStages) : '';
    const manualCard = cardTouched && card !== (installChanged ? predicted : initialCard);
    if (!installChanged && !manualCard) {
      setError('Chưa có thay đổi.');
      return;
    }
    if (manualCard && initialCard && !reason.trim()) {
      setError('Vui lòng nhập lý do khi sửa riêng deadline thẻ.');
      return;
    }
    let cardDeadlineIso;
    if (manualCard) {
      cardDeadlineIso = card ? dateInputToIso(card, project?.company_id) : null;
      if (card && !cardDeadlineIso) {
        setError('Ngày deadline thẻ không hợp lệ.');
        return;
      }
    }
    onSave?.({
      installYmd: installChanged ? (install || null) : undefined,
      cardDeadlineIso: manualCard ? cardDeadlineIso : undefined,
      reason: reason.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-orange-700">
              <Clock className="h-5 w-5 shrink-0" />
              <h3 className="text-sm font-semibold">Deadline dự án</h3>
            </div>
            <p className="mt-0.5 truncate text-[12px] text-slate-500">
              {project?.name || project?.code || ''}
              {stage?.name ? ` · ${stage.name}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            className="text-slate-400 hover:text-slate-600"
            title="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-orange-50 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-orange-950">Dời cả lịch</p>
              <p className="text-[11px] text-orange-800/80">+1, +2, +3 ngày cho ngày lắp, deadline thẻ và mọi mốc còn lại</p>
            </div>
            <DayBumpButtons
              disabled={submitting || !install}
              title="Dời ngày lắp và toàn bộ mốc còn lại"
              onBump={bumpPlan}
            />
          </div>

          <label className="block">
            <span className="mb-1 flex items-center justify-between gap-2 text-[12px] font-semibold text-slate-800">
              Deadline thẻ
              <span className="font-normal text-slate-400">+ chỉ dời thẻ, không đổi ngày lắp</span>
            </span>
            <span className="flex items-center gap-2">
              <input
                type="date"
                value={card}
                disabled={submitting}
                onChange={(e) => {
                  setCardTouched(true);
                  setCard(e.target.value);
                  setError('');
                }}
                className="min-w-0 flex-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm"
              />
              <DayBumpButtons
                disabled={submitting}
                title="Chỉ dời deadline thẻ"
                onBump={bumpCardOnly}
              />
            </span>
          </label>

          {manualReasonNeeded(cardTouched, card, initialCard, install, initialInstall, stage, siblingStages) && (
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-slate-800">Lý do sửa deadline thẻ</span>
              <textarea
                value={reason}
                disabled={submitting}
                rows={2}
                onChange={(e) => { setReason(e.target.value); setError(''); }}
                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Vì sao đổi hạn thẻ, không đổi ngày lắp"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-800">Ngày lắp</span>
            <span className="flex items-center gap-2">
              <input
                type="date"
                value={install}
                disabled={submitting}
                onChange={(e) => {
                  applyInstall(e.target.value);
                  setError('');
                }}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <DayBumpButtons
                disabled={submitting || !install}
                title="Dời ngày lắp và các mốc còn lại"
                onBump={bumpPlan}
              />
            </span>
          </label>

          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-slate-800">Mốc còn lại</p>
            {remaining.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
                {install
                  ? 'Các mốc kế hoạch đã qua. Đổi ngày lắp để dời lịch.'
                  : 'Chưa có ngày lắp — chọn ngày lắp để hiện các mốc.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {remaining.map((row) => (
                  <li key={row.key} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`text-[12px] font-semibold ${row.current ? 'text-orange-700' : 'text-slate-800'}`}>
                        {row.label}
                        {row.current ? ' · cột này' : ''}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">{row.hint}</p>
                    </div>
                    <input
                      type="date"
                      value={row.end}
                      disabled={submitting}
                      onChange={(e) => {
                        onGroupDate(row.key, e.target.value);
                        setError('');
                      }}
                      className={`w-[8.6rem] shrink-0 rounded-lg border px-2 py-1.5 text-sm ${
                        row.current ? 'border-orange-300 bg-orange-50' : 'border-slate-200'
                      }`}
                    />
                    <DayBumpButtons
                      disabled={submitting}
                      title={`Dời ${row.label} và cả lịch`}
                      onBump={(days) => {
                        const next = addCalendarDaysYmd(row.end, days);
                        if (!next) return;
                        setError('');
                        onGroupDate(row.key, next, { followCard: true });
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error ? <p className="text-[12px] font-medium text-red-600">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => onClose?.()}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {submitting ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}

function manualReasonNeeded(cardTouched, card, initialCard, install, initialInstall, stage, siblingStages) {
  if (!cardTouched || !initialCard) return false;
  const installChanged = install !== initialInstall;
  const predicted = install ? predictedCardYmd(install, stage, siblingStages) : '';
  return card !== (installChanged ? predicted : initialCard);
}
