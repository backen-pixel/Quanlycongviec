import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import api from '../lib/api';
import {
  companyPreferredForLeadType,
  orderWorkshopTypesPreferredFirst,
  preferredWorkshopTypeIdForCompany,
  workshopTypeMatchesSxKind,
  workshopTypePreferredForLeadType,
} from '../lib/sxCompanySuggestFromLeadType';
import {
  buildSxInstallBackPlan,
  normalizeHolidayIndex,
  remainingSxWorkingDaysTo,
  resolveSxReceptionYmd,
  SX_INSTALL_BACK_PLAN_RULES,
  sxScheduleLeadDaysBadge,
} from '../lib/sxWorkshopSchedule';

const emptyRow = (deliveryDate = '') => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  companyId: '',
  workshopTypeId: '',
  deliveryDate: deliveryDate || '',
  workshopTypes: [],
  loading: false,
});

function subtractCalendarDaysYmd(ymd, days = 2) {
  const m = String(ymd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  if (Number.isNaN(dt.getTime())) return '';
  dt.setUTCDate(dt.getUTCDate() - Math.abs(Number(days) || 0));
  return dt.toISOString().slice(0, 10);
}

function mapEmitRow(r) {
  return {
    companyId: r.companyId,
    workshopTypeId: r.workshopTypeId,
    deliveryDate: r.deliveryDate || '',
    production_company_id: r.companyId,
    workshop_type_id: r.workshopTypeId || null,
    delivery_date: r.deliveryDate || '',
    loading: !!r.loading,
  };
}

/**
 * Chọn nhiều cặp (công ty SX + phân loại) cho 1 deal.
 * onChange(rows) — rows: [{ companyId, workshopTypeId, deliveryDate? }]
 */
export default function SxMultiTargetPicker({
  companies = [],
  leadTypeRow = null,
  kind = null,
  accent = 'teal',
  disabled = false,
  initialRows = null,
  onChange,
  minRows = 1,
  maxRows = 5,
  /** Hiện ô ngày lắp đặt / hoàn thành (−2) trên mỗi dòng xưởng */
  showDates = false,
  /** Ngày lắp mặc định (vd. kế thừa từ dự án nguồn khi đặt xưởng khác) */
  defaultDeliveryDate = '',
}) {
  const [holidayIndex, setHolidayIndex] = useState(() => normalizeHolidayIndex([]));
  const receptionYmd = useMemo(
    () => resolveSxReceptionYmd(Date.now(), holidayIndex),
    [holidayIndex],
  );

  useEffect(() => {
    let cancelled = false;
    api.get('/kpi/holidays')
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data?.holidays)
          ? r.data.holidays
          : (Array.isArray(r.data) ? r.data : []);
        setHolidayIndex(normalizeHolidayIndex(list));
      })
      .catch(() => {
        if (!cancelled) setHolidayIndex(normalizeHolidayIndex([]));
      });
    return () => { cancelled = true; };
  }, []);

  const [rows, setRows] = useState(() => {
    const fallbackDate = defaultDeliveryDate || '';
    if (Array.isArray(initialRows) && initialRows.length) {
      return initialRows.map((r) => ({
        ...emptyRow(r.deliveryDate || r.delivery_date || fallbackDate),
        companyId: r.companyId || r.production_company_id || '',
        workshopTypeId: r.workshopTypeId || r.workshop_type_id || '',
        deliveryDate: r.deliveryDate || r.delivery_date || fallbackDate || '',
      }));
    }
    return [emptyRow(fallbackDate)];
  });

  const emit = useCallback((next) => {
    setRows(next);
    onChange?.(next.map(mapEmitRow));
  }, [onChange]);

  const loadTypes = useCallback(async (rowKey, companyId) => {
    if (!companyId) return;
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, loading: true, workshopTypes: [] } : r)));
    try {
      const { data } = await api.get('/workshop/project-types', {
        params: { company_id: companyId, module: 'production' },
      });
      const list = Array.isArray(data) ? data : (data?.types || data?.data || []);
      const ordered = orderWorkshopTypesPreferredFirst(
        list,
        kind,
        preferredWorkshopTypeIdForCompany(leadTypeRow, companyId),
      );
      setRows((prev) => {
        const next = prev.map((r) => {
          if (r.key !== rowKey) return r;
          const pref = preferredWorkshopTypeIdForCompany(leadTypeRow, companyId);
          const autoType = pref && ordered.some((t) => String(t.id) === String(pref))
            ? String(pref)
            : (r.workshopTypeId || '');
          return {
            ...r,
            loading: false,
            workshopTypes: ordered,
            workshopTypeId: autoType,
          };
        });
        onChange?.(next.map(mapEmitRow));
        return next;
      });
    } catch {
      setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, loading: false, workshopTypes: [] } : r)));
    }
  }, [kind, leadTypeRow, onChange]);

  useEffect(() => {
    rows.forEach((r) => {
      if (r.companyId && !r.workshopTypes.length && !r.loading) {
        void loadTypes(r.key, r.companyId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCompany = (key, companyId) => {
    const next = rows.map((r) => (
      r.key === key
        ? { ...r, companyId, workshopTypeId: '', workshopTypes: [], loading: !!companyId }
        : r
    ));
    emit(next);
    if (companyId) void loadTypes(key, companyId);
  };

  const setType = (key, workshopTypeId) => {
    emit(rows.map((r) => (r.key === key ? { ...r, workshopTypeId } : r)));
  };

  const setDeliveryDate = (key, deliveryDate) => {
    emit(rows.map((r) => (r.key === key ? { ...r, deliveryDate } : r)));
  };

  const addRow = () => {
    if (rows.length >= maxRows || disabled) return;
    emit([...rows, emptyRow(defaultDeliveryDate)]);
  };

  const removeRow = (key) => {
    if (rows.length <= minRows || disabled) return;
    emit(rows.filter((r) => r.key !== key));
  };

  const accentBorder = accent === 'amber' ? 'border-amber-200' : 'border-teal-200';
  const accentTitle = accent === 'amber' ? 'text-amber-800' : 'text-teal-800';
  const accentRow = accent === 'amber' ? 'hover:bg-amber-50/40' : 'hover:bg-teal-50/40';
  const accentBtn = accent === 'amber'
    ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
    : 'border-teal-300 text-teal-700 hover:bg-teal-50';

  const topGridCols = 'sm:grid-cols-[3.25rem_minmax(0,1.4fr)_minmax(0,1.1fr)_1.75rem]';
  const fieldCls = 'w-full h-9 px-2.5 border border-gray-200 rounded-lg text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400';

  return (
    <div className="space-y-2">
      {(kind || leadTypeRow) ? (
        <p className="text-[10px] text-gray-500">
          <span className="text-red-600 font-bold">★</span> = gợi ý theo loại CRM
          {showDates ? ' · Ngày lắp / hoàn thành không bắt buộc' : ''}
        </p>
      ) : (showDates ? (
        <p className="text-[10px] text-gray-500">Ngày lắp / hoàn thành không bắt buộc (hoàn thành = lắp − 2 ngày)</p>
      ) : null)}
      {showDates ? (
        <div className="text-[10px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 leading-snug space-y-1">
          <p>
            Tiếp nhận xưởng (theo giờ setup): <span className="font-semibold text-teal-800">{receptionYmd}</span>
            {' · '}
            trước 12h = hôm nay, từ 12h = ngày làm kế (bỏ CN + lễ). Badge đếm <strong>ngày làm việc</strong> tới lắp.
          </p>
          <p className="font-semibold text-indigo-800">Kế hoạch SX (ngày lịch, tính từ lắp ngược lại):</p>
          <ul className="list-disc pl-3.5 space-y-0.5 text-indigo-900/80">
            {SX_INSTALL_BACK_PLAN_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      ) : null}      <div className={`rounded-xl border ${accentBorder} overflow-hidden bg-white divide-y divide-slate-100`}>
        <div className={`hidden sm:grid ${topGridCols} gap-2 px-3 py-1.5 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500`}>
          <span>#</span>
          <span>Công ty *</span>
          <span>Phân loại *</span>
          <span className="sr-only">Xóa</span>
        </div>

        {rows.map((row, idx) => {
          const types = orderWorkshopTypesPreferredFirst(
            row.workshopTypes,
            kind,
            preferredWorkshopTypeIdForCompany(leadTypeRow, row.companyId),
          );
          const finishYmd = subtractCalendarDaysYmd(row.deliveryDate, 2);
          const leadBadge = showDates
            ? sxScheduleLeadDaysBadge(remainingSxWorkingDaysTo(row.deliveryDate, {
              receptionYmd,
              holidayIndex,
            }))
            : null;
          const backPlan = showDates && row.deliveryDate
            ? buildSxInstallBackPlan(row.deliveryDate, { startYmd: receptionYmd })
            : null;
          const fmtRange = (a, b) => {
            if (!a && !b) return '—';
            if (a && b && a === b) return a;
            if (a && b) return `${a} → ${b}`;
            return a || b;
          };
          return (
            <div key={row.key} className={`px-3 py-2.5 space-y-2 ${accentRow}`}>
              <div className={`grid grid-cols-1 gap-2 ${topGridCols} sm:items-center`}>
                <div className="flex items-center justify-between sm:block">
                  <span className={`text-xs font-bold tabular-nums ${accentTitle}`}>
                    Xưởng {idx + 1}
                  </span>
                  {rows.length > minRows ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => removeRow(row.key)}
                      title="Xóa xưởng"
                      className="sm:hidden inline-flex items-center gap-1 text-[11px] text-red-600 hover:text-red-700 disabled:opacity-40 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Xóa
                    </button>
                  ) : null}
                </div>

                <div className="min-w-0">
                  <label className="sm:hidden text-[10px] font-medium text-gray-500">Công ty *</label>
                  <select
                    value={row.companyId}
                    disabled={disabled || !companies?.length}
                    onChange={(e) => setCompany(row.key, e.target.value)}
                    className={fieldCls}
                  >
                    <option value="">— Chọn công ty SX —</option>
                    {(companies || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {companyPreferredForLeadType(c, leadTypeRow, kind) ? '★ ' : ''}
                        {c.short_name || c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="sm:hidden text-[10px] font-medium text-gray-500">Phân loại *</label>
                  <select
                    value={row.workshopTypeId}
                    onChange={(e) => setType(row.key, e.target.value)}
                    disabled={!row.companyId || row.loading || disabled}
                    className={fieldCls}
                  >
                    <option value="">
                      {!row.companyId
                        ? '— Chọn công ty trước —'
                        : row.loading
                          ? 'Đang tải…'
                          : types.length === 0
                            ? '— Chưa có phân loại —'
                            : '— Chọn phân loại —'}
                    </option>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {workshopTypePreferredForLeadType(t.id, leadTypeRow, row.companyId)
                          || workshopTypeMatchesSxKind(t.name, kind)
                          ? `★ ${t.name}`
                          : t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="hidden sm:flex justify-end">
                  {rows.length > minRows ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => removeRow(row.key)}
                      title="Xóa xưởng"
                      className="h-9 w-7 inline-flex items-center justify-center text-red-500 hover:text-red-700 disabled:opacity-40 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <span className="w-7" />
                  )}
                </div>
              </div>

              {showDates ? (
                <div className="sm:pl-[3.25rem] grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                      Ngày lắp đặt <span className="font-normal text-gray-400">(không bắt buộc)</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        value={row.deliveryDate || ''}
                        disabled={disabled}
                        onChange={(e) => setDeliveryDate(row.key, e.target.value)}
                        className={`${fieldCls} sm:max-w-[11.5rem]`}
                      />
                      {leadBadge ? (
                        <span
                          className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-tight ${leadBadge.className}`}
                          title="Số ngày từ hôm nay tới ngày lắp đặt"
                        >
                          {leadBadge.text}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                      Ngày phải hoàn thành <span className="font-normal text-gray-400">(= lắp − 2)</span>
                    </label>
                    <input
                      type="date"
                      value={finishYmd}
                      readOnly
                      disabled
                      title="= ngày lắp đặt − 2 ngày (cuối hoàn thiện)"
                      className={`${fieldCls} bg-gray-100 text-gray-700 sm:max-w-[11.5rem]`}
                    />
                  </div>
                  {backPlan ? (
                    <div className="sm:col-span-2 rounded-lg border border-indigo-100 bg-indigo-50/70 px-2 py-1.5 space-y-1">
                      <p className="text-[10px] font-bold text-indigo-800 uppercase tracking-wide">
                        Lịch theo lắp {backPlan.installYmd}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px] text-slate-700">
                        <p>
                          <span className="font-semibold">Kế hoạch:</span>{' '}
                          {fmtRange(backPlan.planning.startYmd, backPlan.planning.endYmd)}
                          {backPlan.planning.days != null ? ` (${backPlan.planning.days} ngày)` : ''}
                        </p>
                        <p>
                          <span className="font-semibold">HT thùng:</span>{' '}
                          {fmtRange(backPlan.cabinet.startYmd, backPlan.cabinet.endYmd)} (2 ngày)
                        </p>
                        <p>
                          <span className="font-semibold">Hoàn thiện:</span>{' '}
                          {fmtRange(backPlan.finishing.startYmd, backPlan.finishing.endYmd)} (2 ngày)
                        </p>
                        <p>
                          <span className="font-semibold">Đóng hàng:</span>{' '}
                          {fmtRange(backPlan.packing.startYmd, backPlan.packing.endYmd)} (1 ngày)
                        </p>
                      </div>
                      {backPlan.planning.days === 0 ? (
                        <p className="text-[10px] font-medium text-red-700">
                          Không còn ngày cho kế hoạch — cần lùi ngày lắp.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {rows.length < maxRows && (
        <button
          type="button"
          disabled={disabled}
          onClick={addRow}
          className={`w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm font-medium disabled:opacity-40 cursor-pointer ${accentBtn}`}
        >
          <Plus className="h-4 w-4" />
          Thêm xưởng
        </button>
      )}
    </div>
  );
}

/** Validate rows trước khi submit */
export function validateSxTargets(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return 'Vui lòng chọn ít nhất một công ty Sản xuất.';
  }
  const seen = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (r.loading) {
      return `Xưởng ${i + 1}: đang tải phân loại — đợi xong rồi xác nhận.`;
    }
    const cid = r.companyId || r.production_company_id;
    const tid = r.workshopTypeId || r.workshop_type_id;
    if (!cid) {
      return `Xưởng ${i + 1}: chưa chọn công ty SX.`;
    }
    if (!tid) {
      return `Xưởng ${i + 1}: chưa chọn phân loại.`;
    }
    const key = `${String(cid)}::${String(tid)}`;
    if (seen.has(key)) {
      return `Xưởng ${i + 1}: trùng công ty + phân loại với dòng trước — bỏ dòng trùng hoặc đổi phân loại.`;
    }
    seen.add(key);
  }
  return '';
}

export function sxTargetsToApiPayload(rows) {
  return (rows || [])
    .filter((r) => r.companyId || r.production_company_id)
    .map((r) => {
      const delivery = String(r.deliveryDate || r.delivery_date || '').trim();
      const out = {
        production_company_id: r.companyId || r.production_company_id,
        workshop_type_id: r.workshopTypeId || r.workshop_type_id || null,
      };
      if (/^\d{4}-\d{2}-\d{2}$/.test(delivery)) {
        out.delivery_date = delivery;
        out.production_deadline = delivery;
        out.production_finish_date = subtractCalendarDaysYmd(delivery, 2) || null;
      }
      return out;
    });
}
