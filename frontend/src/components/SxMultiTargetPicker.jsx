import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import api from '../lib/api';
import VcHandoverEventsPopup from './VcHandoverEventsPopup';
import {
  companyPreferredForLeadType,
  orderWorkshopTypesPreferredFirst,
  preferredWorkshopTypeIdForCompany,
  workshopTypeMatchesSxKind,
  workshopTypePreferredForLeadType,
} from '../lib/sxCompanySuggestFromLeadType';
import {
  addCalendarDaysYmd,
  buildSxInstallBackPlan,
  normalizeHolidayIndex,
  remainingSxWorkingDaysTo,
  resolveSxReceptionYmd,
  SX_INSTALL_BACK_PLAN_RULES,
  sxScheduleLeadDaysBadge,
  vnNowParts,
} from '../lib/sxWorkshopSchedule';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD từ date / datetime-local / ISO */
function ymdOf(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

/**
 * Quy định: lấy hàng VC được cùng ngày với lắp đặt, không được trước ngày lắp.
 * (Lắp đặt có thể trước hoặc cùng ngày lấy hàng.)
 * @returns {{ ok: boolean, message?: string }}
 */
function assertPickupOnOrAfterInstall(pickupAt, installYmd) {
  const pickupYmd = ymdOf(pickupAt);
  const install = ymdOf(installYmd);
  if (!pickupYmd || !install) return { ok: true };
  if (pickupYmd >= install) return { ok: true };
  return {
    ok: false,
    message:
      `Ngày lấy hàng VC (${pickupYmd}) phải bằng hoặc sau ngày lắp đặt (${install}). `
      + 'Có thể cùng ngày, không được trước ngày lắp.',
  };
}

const MINI_DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Hộp lịch tháng nhỏ — chọn 1 ngày (lắp hoặc lấy hàng). */
function MiniDayPickerPopup({
  open,
  title,
  accent = 'teal',
  selectedYmd = '',
  onPick,
  onClose,
}) {
  const initial = String(selectedYmd || '').slice(0, 10);
  const init = initial.match(/^(\d{4})-(\d{2})/) || [];
  const [cursor, setCursor] = useState(() => ({
    year: Number(init[1]) || vnNowParts().y,
    month: Number(init[2]) || vnNowParts().mo,
  }));

  useEffect(() => {
    if (!open) return;
    const m = String(selectedYmd || '').slice(0, 10).match(/^(\d{4})-(\d{2})/);
    if (m) setCursor({ year: Number(m[1]), month: Number(m[2]) });
  }, [open, selectedYmd]);

  if (!open || typeof document === 'undefined') return null;

  const { year, month } = cursor;
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const accentBtn = accent === 'sky'
    ? 'bg-sky-600 hover:bg-sky-700 text-white'
    : 'bg-teal-600 hover:bg-teal-700 text-white';
  const accentRing = accent === 'sky' ? 'ring-sky-500 border-sky-400' : 'ring-teal-500 border-teal-400';
  const accentHead = accent === 'sky' ? 'bg-sky-50 border-sky-100 text-sky-900' : 'bg-teal-50 border-teal-100 text-teal-900';

  const shiftMonth = (delta) => {
    setCursor((c) => {
      let m = c.month + delta;
      let y = c.year;
      if (m < 1) { m = 12; y -= 1; }
      if (m > 12) { m = 1; y += 1; }
      return { year: y, month: m };
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[270] flex items-center justify-center p-3">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Đóng" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-xs rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center gap-2 px-3 py-2.5 border-b ${accentHead}`}>
          <Calendar className="h-4 w-4 shrink-0" />
          <p className="text-sm font-bold flex-1 min-w-0 truncate">{title}</p>
          <button type="button" onClick={onClose} className="h-7 w-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-3 pt-2 pb-1 flex items-center justify-between">
          <button type="button" onClick={() => shiftMonth(-1)} className="h-8 w-8 rounded-lg border border-gray-200 hover:bg-gray-50 inline-flex items-center justify-center">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-bold text-gray-800 tabular-nums">
            Tháng {month}/{year}
          </p>
          <button type="button" onClick={() => shiftMonth(1)} className="h-8 w-8 rounded-lg border border-gray-200 hover:bg-gray-50 inline-flex items-center justify-center">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="px-3 pb-3">
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {MINI_DOW.map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-gray-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} className="h-9" />;
              const ymd = `${year}-${pad2(month)}-${pad2(day)}`;
              const selected = ymd === String(selectedYmd || '').slice(0, 10);
              const isWeekend = i % 7 === 0 || i % 7 === 6;
              return (
                <button
                  key={ymd}
                  type="button"
                  onClick={() => onPick(ymd)}
                  className={`h-9 rounded-lg text-sm font-semibold tabular-nums transition ${
                    selected
                      ? `ring-2 ring-offset-1 ${accentRing} ${accentBtn}`
                      : `hover:bg-gray-100 ${isWeekend ? 'text-rose-600' : 'text-gray-800'}`
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-500 mt-2 text-center">
            Chọn ngày → ghi vào form · hoặc chọn trên lịch lớn bên phải
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Mặc định ngày lắp = hôm nay (VN) + 9 ngày lịch. */
const DEFAULT_INSTALL_LEAD_DAYS = 9;

function defaultInstallYmd() {
  return addCalendarDaysYmd(vnNowParts().ymd, DEFAULT_INSTALL_LEAD_DAYS) || '';
}

const emptyRow = (deliveryDate = '') => {
  const delivery = deliveryDate || '';
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    companyId: '',
    workshopTypeId: '',
    deliveryDate: delivery,
    installTime: '14:00',
    logisticsCompanyId: '',
    pickupAt: delivery ? `${delivery}T08:00` : '',
    workshopTypes: [],
    loading: false,
  };
};

function subtractCalendarDaysYmd(ymd, days = 2) {
  const m = String(ymd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  if (Number.isNaN(dt.getTime())) return '';
  dt.setUTCDate(dt.getUTCDate() - Math.abs(Number(days) || 0));
  return dt.toISOString().slice(0, 10);
}

/** YYYY-MM-DD → dd/mm/yyyy */
function formatYmdVi(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** datetime-local → «dd/mm/yyyy HH:mm» */
function formatLocalVi(local) {
  const m = String(local || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

function mapEmitRow(r) {
  return {
    companyId: r.companyId,
    workshopTypeId: r.workshopTypeId,
    deliveryDate: r.deliveryDate || '',
    installTime: r.installTime || '14:00',
    logisticsCompanyId: r.logisticsCompanyId || '',
    pickupAt: r.pickupAt || '',
    production_company_id: r.companyId,
    workshop_type_id: r.workshopTypeId || null,
    delivery_date: r.deliveryDate || '',
    install_time: r.installTime || '14:00',
    logistics_company_id: r.logisticsCompanyId || '',
    pickup_at: r.pickupAt || '',
    loading: !!r.loading,
  };
}

/**
 * Chọn nhiều cặp (công ty SX + phân loại) cho 1 deal.
 * onChange(rows) — rows: [{ companyId, workshopTypeId, deliveryDate?, logisticsCompanyId?, ... }]
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
  /** Hiện setup VC/LĐ: công ty lắp đặt + giờ lắp + lấy hàng */
  showVcSetup = false,
  /** Ngày lắp mặc định (vd. kế thừa từ dự án nguồn khi đặt xưởng khác) */
  defaultDeliveryDate = '',
  /** lead/deal id — mở lịch VC/LĐ khi chọn ngày */
  leadId = null,
}) {
  const [holidayIndex, setHolidayIndex] = useState(() => normalizeHolidayIndex([]));
  const [logisticsCompanies, setLogisticsCompanies] = useState([]);
  const [calPick, setCalPick] = useState(null); // { rowKey, target: 'install'|'pickup'|'both' }
  /** Hộp lịch nhỏ khi bấm nút Lịch (lắp / lấy hàng). */
  const [miniCalOpen, setMiniCalOpen] = useState(false);
  /** Tăng mỗi lần bấm Lịch → lịch lớn nhảy lại đúng ngày dù focusDate không đổi. */
  const [calFocusNonce, setCalFocusNonce] = useState(0);
  /** Hàng đang hiện hộp lịch sự kiện nhúng (mặc định xưởng 1). */
  const [calEmbedRowKey, setCalEmbedRowKey] = useState(null);
  const calPanelRef = useRef(null);
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

  useEffect(() => {
    if (!showVcSetup) {
      setLogisticsCompanies([]);
      return undefined;
    }
    let cancelled = false;
    api.get('/companies', { params: { for_module: 'logistics' } })
      .then((r) => {
        if (cancelled) return;
        const list = r.data?.companies || r.data || [];
        setLogisticsCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setLogisticsCompanies([]);
      });
    return () => { cancelled = true; };
  }, [showVcSetup]);

  const [rows, setRows] = useState(() => {
    const fallbackDate = defaultDeliveryDate
      || ((showDates || showVcSetup) ? defaultInstallYmd() : '');
    if (Array.isArray(initialRows) && initialRows.length) {
      return initialRows.map((r) => {
        const delivery = r.deliveryDate || r.delivery_date || fallbackDate || '';
        return {
          ...emptyRow(delivery),
          companyId: r.companyId || r.production_company_id || '',
          workshopTypeId: r.workshopTypeId || r.workshop_type_id || '',
          deliveryDate: delivery,
          installTime: r.installTime || r.install_time || '14:00',
          logisticsCompanyId: r.logisticsCompanyId || r.logistics_company_id || '',
          pickupAt: r.pickupAt || r.pickup_at || (delivery ? `${delivery}T08:00` : ''),
        };
      });
    }
    return [emptyRow(fallbackDate)];
  });

  const emit = useCallback((next) => {
    setRows(next);
    onChange?.(next.map(mapEmitRow));
  }, [onChange]);

  // Đồng bộ mặc định ngày lắp (+9) lên parent ngay khi mở form
  useEffect(() => {
    onChange?.(rows.map(mapEmitRow));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    if (deliveryDate && showVcSetup) {
      const chk = assertPickupOnOrAfterInstall(row.pickupAt, deliveryDate);
      if (!chk.ok) {
        alert(chk.message);
        return;
      }
    }
    emit(rows.map((r) => {
      if (r.key !== key) return r;
      const next = { ...r, deliveryDate };
      // Ngày lắp → gợi ý lấy hàng cùng ngày 08:00 nếu chưa nhập
      if (showVcSetup && deliveryDate && !String(r.pickupAt || '').trim()) {
        next.pickupAt = `${deliveryDate}T08:00`;
      }
      return next;
    }));
  };

  const setPickupAt = (key, pickupAt) => {
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    if (pickupAt && row.deliveryDate) {
      const chk = assertPickupOnOrAfterInstall(pickupAt, row.deliveryDate);
      if (!chk.ok) {
        alert(chk.message);
        return;
      }
    }
    patchRow(key, { pickupAt });
  };

  const patchRow = (key, patch) => {
    emit(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    if (rows.length >= maxRows || disabled) return;
    const fallbackDate = defaultDeliveryDate
      || ((showDates || showVcSetup) ? defaultInstallYmd() : '');
    emit([...rows, emptyRow(fallbackDate)]);
  };

  const removeRow = (key) => {
    if (rows.length <= minRows || disabled) return;
    emit(rows.filter((r) => r.key !== key));
  };

  /** Hiện lịch nhúng bên phải + hộp lịch nhỏ (riêng lắp / lấy hàng). */
  const openCalPick = (rowKey, target, { openMini = true } = {}) => {
    setCalEmbedRowKey(rowKey);
    setCalPick({ rowKey, target });
    setCalFocusNonce((n) => n + 1);
    if (openMini && (target === 'install' || target === 'pickup')) {
      setMiniCalOpen(true);
    } else {
      setMiniCalOpen(false);
    }
    requestAnimationFrame(() => {
      calPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    });
  };

  const applyMiniCalDay = (ymd) => {
    if (!calPick?.rowKey || !ymd) return;
    const row = rows.find((r) => r.key === calPick.rowKey);
    if (!row) return;
    if (calPick.target === 'pickup') {
      const hm = String(row.pickupAt || '').match(/T(\d{2}:\d{2})/)?.[1] || '08:00';
      const nextPickup = `${ymd}T${hm}`;
      const chk = assertPickupOnOrAfterInstall(nextPickup, row.deliveryDate);
      if (!chk.ok) {
        alert(chk.message);
        return;
      }
      applyCalPickToRow(calPick.rowKey, { pickupAt: nextPickup });
    } else if (calPick.target === 'install') {
      const chk = assertPickupOnOrAfterInstall(row.pickupAt, ymd);
      if (!chk.ok) {
        alert(chk.message);
        return;
      }
      applyCalPickToRow(calPick.rowKey, {
        installAt: `${ymd}T${row.installTime || '14:00'}`,
      });
    }
    setMiniCalOpen(false);
  };

  // Mặc định mở lịch nhúng cho xưởng đầu khi bật setup VC
  const rowKeysSig = rows.map((r) => r.key).join('|');
  useEffect(() => {
    if (!showVcSetup) {
      setCalEmbedRowKey(null);
      setCalPick(null);
      setMiniCalOpen(false);
      return;
    }
    if (!rows.length) return;
    const firstKey = rows[0].key;
    setCalEmbedRowKey((prev) => {
      if (prev && rows.some((r) => r.key === prev)) return prev;
      return firstKey;
    });
    setCalPick((prev) => {
      if (prev && rows.some((r) => r.key === prev.rowKey)) return prev;
      return { rowKey: firstKey, target: 'both' };
    });
    // Chỉ theo dõi danh sách key xưởng — tránh chạy lại mỗi lần sửa ngày/giờ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVcSetup, rowKeysSig]);

  const applyCalPickToRow = (rowKey, { pickupAt, installAt, localSingle, target, installOccurrenceDates }) => {
    const row = rows.find((r) => r.key === rowKey);
    if (!row) return;
    if (localSingle) {
      const day = String(localSingle || '').slice(0, 10);
      const tm = String(localSingle || '').match(/T(\d{2}:\d{2})/);
      if (!day) return;
      if (target === 'pickup') {
        const nextPickup = String(localSingle).slice(0, 16);
        const chk = assertPickupOnOrAfterInstall(nextPickup, row.deliveryDate);
        if (!chk.ok) {
          alert(chk.message);
          return;
        }
        patchRow(rowKey, { pickupAt: nextPickup });
      } else {
        const nextPickup = String(row.pickupAt || '').trim() || `${day}T08:00`;
        const chk = assertPickupOnOrAfterInstall(nextPickup, day);
        if (!chk.ok) {
          alert(chk.message);
          return;
        }
        patchRow(rowKey, {
          deliveryDate: day,
          installTime: tm ? tm[1] : (row.installTime || '14:00'),
          installOccurrenceDates: [day],
          ...(!String(row.pickupAt || '').trim() ? { pickupAt: `${day}T08:00` } : {}),
        });
      }
      return;
    }
    const patch = {};
    const nextPickup = pickupAt != null
      ? String(pickupAt).slice(0, 16)
      : String(row.pickupAt || '').trim();
    const occ = [...new Set(
      (Array.isArray(installOccurrenceDates) ? installOccurrenceDates : [])
        .map((d) => String(d || '').slice(0, 10))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    )].sort();
    const nextInstallDay = occ[0]
      || (installAt ? String(installAt).slice(0, 10) : '')
      || String(row.deliveryDate || '').trim();

    if (installAt || occ.length) {
      const day = nextInstallDay;
      const tm = installAt
        ? String(installAt).match(/T(\d{2}:\d{2})/)
        : null;
      if (day) {
        patch.deliveryDate = day;
        patch.installTime = tm ? tm[1] : (row.installTime || '14:00');
        patch.installOccurrenceDates = occ.length ? occ : (day ? [day] : []);
        if (!String(row.pickupAt || '').trim() && !pickupAt) {
          patch.pickupAt = `${day}T08:00`;
        }
      }
    }
    if (pickupAt) patch.pickupAt = String(pickupAt).slice(0, 16);

    const effectivePickup = patch.pickupAt || nextPickup;
    const effectiveInstall = patch.deliveryDate || nextInstallDay;
    const chk = assertPickupOnOrAfterInstall(effectivePickup, effectiveInstall);
    if (!chk.ok) {
      alert(chk.message);
      return;
    }
    if (Object.keys(patch).length) patchRow(rowKey, patch);
  };

  const calRow = (calEmbedRowKey && rows.find((r) => String(r.key) === String(calEmbedRowKey)))
    || rows[0]
    || null;
  const calRowIdx = calRow ? rows.findIndex((r) => r.key === calRow.key) : -1;

  const accentBorder = accent === 'amber' ? 'border-amber-200' : accent === 'orange' ? 'border-orange-200' : 'border-teal-200';
  const accentTitle = accent === 'amber' ? 'text-amber-800' : accent === 'orange' ? 'text-orange-800' : 'text-teal-800';
  const accentRow = accent === 'amber' ? 'hover:bg-amber-50/40' : accent === 'orange' ? 'hover:bg-orange-50/40' : 'hover:bg-teal-50/40';
  const accentBtn = accent === 'amber'
    ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
    : accent === 'orange'
      ? 'border-orange-300 text-orange-700 hover:bg-orange-50'
      : 'border-teal-300 text-teal-700 hover:bg-teal-50';

  const topGridCols = 'sm:grid-cols-[3.25rem_minmax(0,1.4fr)_minmax(0,1.1fr)_1.75rem]';
  const fieldCls = 'w-full h-9 px-2.5 border border-gray-200 rounded-lg text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400';
  const showSchedule = showDates || showVcSetup;

  return (
    <div className={showVcSetup
      ? 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)] gap-3 items-start lg:min-h-[min(640px,calc(94vh-11rem))]'
      : 'space-y-2'}
    >
      <div className="min-w-0 space-y-2">
      {(kind || leadTypeRow) ? (
        <p className="text-[10px] text-gray-500">
          <span className="text-red-600 font-bold">★</span> = gợi ý theo loại CRM
          {showSchedule ? ' · Lắp đặt = deadline VC/LĐ · Hoàn thiện SX = deadline tổng SX' : ''}
        </p>
      ) : (showSchedule ? (
        <p className="text-[10px] text-gray-500">
          Ngày lắp = deadline VC/LĐ · hoàn thiện SX = deadline tổng dự án (= lắp − 2) · công ty VC không bắt buộc
        </p>
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
      ) : null}
      {showVcSetup ? (
        <div className="text-[10px] text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-2.5 py-1.5 leading-snug space-y-0.5">
          <p>
            <strong>Lắp đặt</strong> = deadline VC/LĐ (ngày giờ lắp tại công trình).
            {' · '}
            <strong>Hoàn thiện</strong> = deadline tổng dự án SX (= lắp − 2 ngày).
          </p>
          <p>
            <strong>Lấy hàng</strong> = giờ VC đi lấy tại xưởng. Khi lưu, tạo sự kiện dự kiến trên <strong>Sự kiện → Lắp đặt</strong>.
            Chọn ngày trên lịch bên phải (CRM / Sản xuất / VC/LĐ).
          </p>
        </div>
      ) : null}
      <div className={`rounded-xl border ${accentBorder} overflow-hidden bg-white divide-y divide-slate-100`}>
        <div className={`hidden sm:grid ${topGridCols} gap-2 px-3 py-1.5 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500`}>
          <span>#</span>
          <span>Công ty SX *</span>
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
                  <label className="sm:hidden text-[10px] font-medium text-gray-500">Công ty SX *</label>
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

              {showSchedule ? (
                <div className="sm:pl-[3.25rem] space-y-2">
                  {/* Khối deadline: lắp (VC/LĐ) + hoàn thiện (SX) */}
                  <div className="rounded-xl border-2 border-teal-300 bg-teal-50 px-3 py-2.5 space-y-2 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-teal-900">
                        Deadline lắp đặt (VC/LĐ) &amp; hoàn thiện (SX)
                      </p>
                      {row.deliveryDate ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-teal-600 text-white px-2 py-1 text-[11px] font-bold tabular-nums shadow-sm">
                          Lắp đặt {formatYmdVi(row.deliveryDate)}
                          {row.installTime ? ` · ${row.installTime}` : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold">
                          Chưa chọn deadline lắp đặt
                        </span>
                      )}
                    </div>
                    <div className={`grid grid-cols-1 gap-2 ${showVcSetup ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                      <div className="min-w-0">
                        <label className="block text-[10px] font-bold text-teal-800 mb-0.5">
                          Ngày lắp đặt <span className="font-normal text-teal-600/80">(deadline VC/LĐ · lấy hàng ≥ ngày lắp)</span>
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="date"
                            value={row.deliveryDate || ''}
                            disabled={disabled}
                            onChange={(e) => setDeliveryDate(row.key, e.target.value)}
                            className={`${fieldCls} sm:max-w-[11.5rem] border-teal-400 bg-white text-red-600 disabled:text-red-600 font-bold tabular-nums ring-1 ring-teal-200 focus:ring-2 focus:ring-teal-500 scheme-light`}
                          />
                          {showVcSetup ? (
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => openCalPick(row.key, 'install')}
                              className="h-9 px-2.5 rounded-lg border border-teal-400 bg-teal-600 text-white text-[11px] font-bold hover:bg-teal-700 inline-flex items-center gap-1 disabled:opacity-40"
                              title="Chọn deadline lắp (VC/LĐ) từ lịch"
                            >
                              <Calendar className="h-3.5 w-3.5" />
                              Lịch
                            </button>
                          ) : null}
                          {leadBadge ? (
                            <span
                              className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-tight ${leadBadge.className}`}
                              title="Số ngày làm việc từ hôm nay tới deadline lắp (VC/LĐ)"
                            >
                              {leadBadge.text}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {showVcSetup ? (
                        <div className="min-w-0">
                          <label className="block text-[10px] font-bold text-teal-800 mb-0.5">
                            Giờ lắp <span className="font-normal text-teal-600/80">(mặc định 14:00)</span>
                          </label>
                          <input
                            type="time"
                            value={row.installTime || '14:00'}
                            disabled={disabled || !row.deliveryDate}
                            onChange={(e) => patchRow(row.key, { installTime: e.target.value })}
                            className={`${fieldCls} sm:max-w-[11.5rem] border-teal-400 bg-white text-red-600 disabled:text-red-600/70 font-bold tabular-nums ring-1 ring-teal-200 focus:ring-2 focus:ring-teal-500 scheme-light`}
                          />
                        </div>
                      ) : null}
                      <div className="min-w-0">
                        <label className="block text-[10px] font-bold text-indigo-800 mb-0.5">
                          Ngày hoàn thiện
                          <span className="font-normal text-indigo-600"> (sự kiện SX · áp dụng khi xưởng tiếp nhận)</span>
                        </label>
                        <input
                          type="date"
                          value={finishYmd}
                          readOnly
                          disabled
                          title="Deadline tổng dự án sản xuất = ngày lắp (VC/LĐ) − 2 · sẽ tạo sự kiện «Hoàn thiện sản xuất»"
                          className={`${fieldCls} bg-indigo-100 border-indigo-400 text-red-600 disabled:text-red-600 font-bold tabular-nums ring-1 ring-indigo-200 sm:max-w-[11.5rem] scheme-light`}
                        />
                      </div>
                    </div>
                    {row.deliveryDate && finishYmd ? (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="rounded-md bg-indigo-600 text-white px-2 py-1 font-bold tabular-nums">
                          Hoàn thiện SX {formatYmdVi(finishYmd)}
                        </span>
                        <span className="text-indigo-800/80 font-medium">deadline tổng SX</span>
                        <span className="text-teal-700 font-bold">·</span>
                        <span className="rounded-md bg-teal-600 text-white px-2 py-1 font-bold tabular-nums">
                          Lắp đặt {formatYmdVi(row.deliveryDate)}
                        </span>
                        <span className="text-teal-800/80 font-medium">deadline VC/LĐ</span>
                      </div>
                    ) : (
                      <p className="text-[10px] text-teal-800/70 font-medium">
                        Chọn ngày lắp đặt (deadline VC/LĐ) → tự điền hoàn thiện SX (= deadline tổng SX, lắp − 2).
                      </p>
                    )}
                  </div>

                  {showVcSetup ? (
                    <>
                      {/* Khối lấy hàng */}
                      <div className="rounded-xl border-2 border-sky-300 bg-sky-50 px-3 py-2.5 space-y-2 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-sky-900">
                            Lấy hàng (VC)
                          </p>
                          {row.pickupAt ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-sky-600 text-white px-2 py-1 text-[11px] font-bold tabular-nums shadow-sm">
                              Lấy hàng {formatLocalVi(row.pickupAt)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold">
                              Chưa chọn lấy hàng
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <label className="block text-[10px] font-bold text-sky-800 mb-0.5">
                            Thời gian lấy hàng tại xưởng <span className="font-normal text-sky-600/80">(không bắt buộc)</span>
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="datetime-local"
                              value={row.pickupAt || ''}
                              min={row.deliveryDate ? `${row.deliveryDate}T00:00` : undefined}
                              disabled={disabled}
                              onChange={(e) => setPickupAt(row.key, e.target.value)}
                              className={`${fieldCls} sm:max-w-xs border-sky-400 bg-white text-red-600 disabled:text-red-600 font-bold tabular-nums ring-1 ring-sky-200 focus:ring-2 focus:ring-sky-500 scheme-light`}
                            />
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => openCalPick(row.key, 'pickup')}
                              className="h-9 px-2.5 rounded-lg border border-sky-400 bg-sky-600 text-white text-[11px] font-bold hover:bg-sky-700 inline-flex items-center gap-1 disabled:opacity-40"
                              title="Chọn giờ lấy hàng từ lịch VC/LĐ"
                            >
                              <Calendar className="h-3.5 w-3.5" />
                              Lịch
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                          Công ty VC / lắp đặt <span className="font-normal text-gray-400">(không bắt buộc)</span>
                        </label>
                        <select
                          value={row.logisticsCompanyId || ''}
                          disabled={disabled}
                          onChange={(e) => patchRow(row.key, { logisticsCompanyId: e.target.value })}
                          className={fieldCls}
                        >
                          <option value="">— Chưa chọn công ty VC/LĐ —</option>
                          {logisticsCompanies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.short_name || c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {String(calEmbedRowKey) === String(row.key) ? (
                        <p className="text-[10px] font-semibold text-orange-800 bg-orange-50 border border-orange-100 rounded-lg px-2 py-1">
                          Đang chọn ngày trên lịch bên phải → áp dụng cho xưởng này
                        </p>
                      ) : (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => openCalPick(row.key, 'both')}
                          className="text-[10px] font-semibold text-orange-700 hover:text-orange-900 underline-offset-2 hover:underline"
                        >
                          Dùng lịch bên phải cho xưởng này
                        </button>
                      )}
                    </>
                  ) : null}

                  {backPlan ? (
                    <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-2 py-1.5 space-y-1">
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

      {showVcSetup && calRow ? (
        <div
          ref={calPanelRef}
          className="min-w-0 rounded-xl border-2 border-orange-200 bg-orange-50/30 overflow-hidden lg:sticky lg:top-0 lg:self-start flex flex-col h-[min(640px,calc(94vh-11rem))] min-h-[420px]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 border-b border-orange-100 bg-orange-50 shrink-0">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-orange-900">
                Lịch sự kiện
              </p>
              <p className="text-[10px] text-orange-800/80 truncate">
                {calPick?.target === 'install'
                  ? `Bấm ngày trên lịch → chọn lắp · Xưởng ${calRowIdx >= 0 ? calRowIdx + 1 : 1}`
                  : calPick?.target === 'pickup'
                    ? `Bấm ngày trên lịch → chọn lấy hàng · Xưởng ${calRowIdx >= 0 ? calRowIdx + 1 : 1}`
                    : `Áp dụng → Xưởng ${calRowIdx >= 0 ? calRowIdx + 1 : 1} · lắp + lấy hàng`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={disabled}
                onClick={() => openCalPick(calRow.key, 'install', { openMini: false })}
                className={`h-7 px-2 rounded-md text-[10px] font-bold border ${
                  calPick?.target === 'install'
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-teal-800 border-teal-200 hover:bg-teal-50'
                }`}
              >
                Lắp
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => openCalPick(calRow.key, 'pickup', { openMini: false })}
                className={`h-7 px-2 rounded-md text-[10px] font-bold border ${
                  calPick?.target === 'pickup'
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-sky-800 border-sky-200 hover:bg-sky-50'
                }`}
              >
                Lấy hàng
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => openCalPick(calRow.key, 'both', { openMini: false })}
                className={`h-7 px-2 rounded-md text-[10px] font-bold border ${
                  !calPick?.target || calPick?.target === 'both'
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'bg-white text-orange-800 border-orange-200 hover:bg-orange-50'
                }`}
              >
                Cả hai
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <VcHandoverEventsPopup
              key={`side-cal-${calRow.key}`}
              embedded
              opsScheduleOnly
              leadId={leadId || null}
              companyId={calRow.logisticsCompanyId || null}
              focusNonce={calFocusNonce}
              focusDate={
                (() => {
                  const target = calPick?.rowKey === calRow.key ? calPick.target : 'both';
                  if (target === 'pickup') {
                    return calRow.pickupAt
                      || (calRow.deliveryDate ? `${calRow.deliveryDate}T08:00` : null);
                  }
                  if (target === 'install') {
                    return calRow.deliveryDate
                      ? `${calRow.deliveryDate}T${calRow.installTime || '14:00'}`
                      : (calRow.pickupAt || null);
                  }
                  return calRow.deliveryDate
                    ? `${calRow.deliveryDate}T${calRow.installTime || '14:00'}`
                    : (calRow.pickupAt || null);
                })()
              }
              pickMode
              pickTarget={
                calPick?.rowKey === calRow.key
                  ? (calPick.target === 'pickup' ? 'pickup' : calPick.target === 'install' ? 'install' : 'both')
                  : 'both'
              }
              anchorPickupAt={calRow.pickupAt || null}
              anchorInstallAt={
                calRow.deliveryDate
                  ? `${calRow.deliveryDate}T${calRow.installTime || '14:00'}`
                  : null
              }
              anchorInstallOccurrenceDates={
                Array.isArray(calRow.installOccurrenceDates) && calRow.installOccurrenceDates.length
                  ? calRow.installOccurrenceDates
                  : (calRow.deliveryDate ? [calRow.deliveryDate] : [])
              }
              anchorFinishAt={
                (() => {
                  const finish = subtractCalendarDaysYmd(calRow.deliveryDate, 2);
                  return finish ? `${finish}T17:00` : null;
                })()
              }
              onPickDate={(local) => {
                const target = calPick?.rowKey === calRow.key ? calPick.target : 'both';
                applyCalPickToRow(calRow.key, {
                  localSingle: local,
                  target: target === 'pickup' ? 'pickup' : 'install',
                });
              }}
              onPickDates={({ pickupAt, installAt, installOccurrenceDates: occ }) => {
                const rowKey = (calPick?.rowKey && rows.some((r) => r.key === calPick.rowKey))
                  ? calPick.rowKey
                  : calRow.key;
                const target = calPick?.rowKey === rowKey ? calPick.target : 'both';
                if (target === 'pickup') {
                  applyCalPickToRow(rowKey, { pickupAt });
                  return;
                }
                if (target === 'install') {
                  applyCalPickToRow(rowKey, { installAt, installOccurrenceDates: occ });
                  return;
                }
                applyCalPickToRow(rowKey, { pickupAt, installAt, installOccurrenceDates: occ });
              }}
              onClose={() => {}}
            />
          </div>
        </div>
      ) : null}

      <MiniDayPickerPopup
        open={miniCalOpen && (calPick?.target === 'install' || calPick?.target === 'pickup')}
        title={
          calPick?.target === 'pickup'
            ? 'Chọn ngày lấy hàng (VC)'
            : 'Chọn ngày lắp đặt (deadline VC/LĐ)'
        }
        accent={calPick?.target === 'pickup' ? 'sky' : 'teal'}
        selectedYmd={
          (() => {
            const row = calPick?.rowKey
              ? rows.find((r) => r.key === calPick.rowKey)
              : null;
            if (!row) return '';
            if (calPick.target === 'pickup') return String(row.pickupAt || '').slice(0, 10);
            return row.deliveryDate || '';
          })()
        }
        onPick={applyMiniCalDay}
        onClose={() => setMiniCalOpen(false)}
      />
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

    const lid = r.logisticsCompanyId || r.logistics_company_id;
    const delivery = String(r.deliveryDate || r.delivery_date || '').trim();
    const pickup = String(r.pickupAt || r.pickup_at || '').trim();
    if (lid && !delivery) {
      return `Xưởng ${i + 1}: đã chọn công ty VC/LĐ — vui lòng nhập ngày lắp đặt.`;
    }
    if (pickup && !delivery) {
      return `Xưởng ${i + 1}: đã nhập lấy hàng — vui lòng nhập ngày lắp đặt.`;
    }
    if (pickup && delivery) {
      const chk = assertPickupOnOrAfterInstall(pickup, delivery);
      if (!chk.ok) {
        return `Xưởng ${i + 1}: ngày lấy hàng VC phải bằng hoặc sau ngày lắp đặt (có thể cùng ngày).`;
      }
    }
  }
  return '';
}

export function sxTargetsToApiPayload(rows) {
  return (rows || [])
    .filter((r) => r.companyId || r.production_company_id)
    .map((r) => {
      const delivery = String(r.deliveryDate || r.delivery_date || '').trim();
      const timeRaw = String(r.installTime || r.install_time || '14:00').trim() || '14:00';
      const time = /^\d{2}:\d{2}$/.test(timeRaw) ? timeRaw : '14:00';
      const logisticsCompanyId = String(r.logisticsCompanyId || r.logistics_company_id || '').trim();
      const pickupLocal = String(r.pickupAt || r.pickup_at || '').trim();
      const out = {
        production_company_id: r.companyId || r.production_company_id,
        workshop_type_id: r.workshopTypeId || r.workshop_type_id || null,
      };
      if (/^\d{4}-\d{2}-\d{2}$/.test(delivery)) {
        const finishYmd = subtractCalendarDaysYmd(delivery, 2) || null;
        out.delivery_date = delivery;
        // install_date = deadline VC/LĐ; production_* = deadline tổng SX (hoàn thiện)
        out.install_date = `${delivery}T${time}:00+07:00`;
        out.production_finish_date = finishYmd;
        out.production_deadline = finishYmd;
      }
      if (logisticsCompanyId) {
        out.logistics_company_id = logisticsCompanyId;
      }
      if (pickupLocal) {
        const d = new Date(pickupLocal);
        if (!Number.isNaN(d.getTime())) out.pickup_at = d.toISOString();
      }
      const occ = [...new Set(
        (Array.isArray(r.installOccurrenceDates) ? r.installOccurrenceDates : [])
          .map((d) => String(d || '').slice(0, 10))
          .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
      )].sort();
      if (occ.length) out.install_occurrence_dates = occ;
      else if (/^\d{4}-\d{2}-\d{2}$/.test(delivery)) out.install_occurrence_dates = [delivery];
      return out;
    });
}
