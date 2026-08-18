/**
 * Sân tập mô phỏng cho bài kiểm tra thao tác (knowledge_exercises.type = 'simulation').
 *
 * Dựng lại 4 không gian làm việc giả (CRM · Sản xuất · VC/LĐ · Lịch) để học viên bấm
 * đúng luồng thật: lập kế hoạch → thẻ vào cột lắp đặt tạm (khoá) → xưởng bàn giao →
 * Sale xác nhận lần hai → thẻ sang cột tiếp nhận. Mọi thao tác được ghi lại và gửi
 * về backend chấm điểm theo từng bước (không sinh dữ liệu thật trong hệ thống).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, CheckCircle2, Lock, Truck, Factory, Bell, Calendar, ClipboardList,
  AlertTriangle, Sun, Moon, MessageSquare, Users, RefreshCcw,
} from 'lucide-react';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function ddmm(ymdStr) {
  if (!ymdStr) return '—';
  const [, m, d] = String(ymdStr).split('-');
  return m && d ? `${d}/${m}` : '—';
}

function addDaysYmd(ymd, n) {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + n);
  return toYmd(d);
}

function MiniVcCalendar({ days, installDates, pickupDate, finishYmd, onPickInstall, onPickPickup }) {
  const installSet = new Set(installDates || []);
  return (
    <div className="min-w-0 rounded-xl border-2 border-orange-200 overflow-hidden bg-orange-50/30 h-full">
      <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-orange-900 border-b border-orange-100 bg-orange-50">
        Lịch sự kiện VC/LĐ
      </p>
      <div className="p-2.5">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[10px] font-bold text-gray-400">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const isInstall = installSet.has(d);
            const isPickup = pickupDate === d;
            const isFinish = finishYmd === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onPickInstall?.(d)}
                onContextMenu={(e) => { e.preventDefault(); onPickPickup?.(d); }}
                className={`min-h-[3.25rem] rounded-lg border text-center px-0.5 py-1 ${
                  isInstall
                    ? 'bg-teal-100 border-teal-400'
                    : isPickup
                      ? 'bg-sky-100 border-sky-400'
                      : isFinish
                        ? 'bg-indigo-50 border-indigo-200'
                        : 'bg-white border-gray-200 hover:border-orange-300'
                }`}
                title="Bấm chọn ngày lắp · chuột phải chọn ngày lấy hàng"
              >
                <span className="block text-[11px] font-bold tabular-nums">{ddmm(d)}</span>
                {isFinish ? <span className="block text-[9px] font-bold text-indigo-700">HT SX</span> : null}
                {isPickup ? <span className="block text-[9px] font-bold text-sky-700">Lấy tạm</span> : null}
                {isInstall ? <span className="block text-[9px] font-bold text-teal-800">Lắp tạm</span> : null}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-orange-800">
          Lịch tạm theo form đang sửa — bấm ngày để chọn lắp, chuột phải để chọn lấy hàng.
        </p>
      </div>
    </div>
  );
}

function weekdayLabel(ymdStr) {
  if (!ymdStr) return '';
  const d = new Date(`${ymdStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : WEEKDAYS[d.getDay()];
}

function ShiftButtons({ value, onPick }) {
  return (
    <div className="flex items-center gap-1.5">
      {[['08:00', 'Sáng', Sun], ['14:00', 'Chiều', Moon]].map(([time, label, Icon]) => (
        <button
          key={time}
          type="button"
          onClick={() => onPick(time)}
          className={`px-2.5 h-8 rounded-lg text-xs font-semibold border-2 inline-flex items-center gap-1 transition-all ${
            value === time
              ? 'bg-teal-600 border-teal-600 text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:border-teal-400'
          }`}
        >
          <Icon className="h-3.5 w-3.5" /> {label}
        </button>
      ))}
      <span className="text-xs font-mono text-gray-500 ml-1">{value || '--:--'}</span>
    </div>
  );
}

function DayStrip({ days, selected, onToggle, multiple = false }) {
  const isOn = (d) => (multiple ? selected.includes(d) : selected === d);
  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onToggle(d)}
          className={`w-14 py-1 rounded-lg border-2 text-center transition-all ${
            isOn(d)
              ? 'bg-sky-600 border-sky-600 text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:border-sky-400'
          }`}
        >
          <span className="block text-[10px] leading-3 opacity-80">{weekdayLabel(d)}</span>
          <span className="block text-xs font-semibold leading-4">{ddmm(d)}</span>
        </button>
      ))}
    </div>
  );
}

function ModuleTabs({ tab, setTab, badges }) {
  const items = [
    { key: 'crm', label: 'CRM', icon: ClipboardList, color: 'bg-blue-600' },
    { key: 'sx', label: 'Sản xuất', icon: Factory, color: 'bg-orange-600' },
    { key: 'vc', label: 'VC / Lắp đặt', icon: Truck, color: 'bg-teal-600' },
    { key: 'lich', label: 'Lịch', icon: Calendar, color: 'bg-violet-600' },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const active = tab === it.key;
        const Icon = it.icon;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => setTab(it.key)}
            className={`relative px-3.5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 border-2 transition-all ${
              active ? `${it.color} text-white border-transparent` : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            <Icon className="h-4 w-4" /> {it.label}
            {badges?.[it.key] ? (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                {badges[it.key]}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function KanbanBoard({ columns, cardColumn, card, onMove, lockedMessage }) {
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-2">
      {columns.map((col) => (
        <div key={col} className="w-56 shrink-0 rounded-xl border border-gray-200 bg-gray-50">
          <div className="px-2.5 py-2 border-b border-gray-200 flex items-center justify-between gap-1">
            <span className="text-[11px] font-bold uppercase text-gray-600 truncate">{col}</span>
            {cardColumn === col ? (
              <span className="text-[10px] text-gray-400">1</span>
            ) : null}
          </div>
          <div className="p-2 min-h-24 space-y-2">
            {cardColumn === col && card}
            {cardColumn !== col && (
              <button
                type="button"
                onClick={() => onMove(col)}
                className="w-full py-1.5 rounded-lg border-2 border-dashed border-gray-300 text-[11px] text-gray-500 hover:border-gray-400 hover:text-gray-700"
                title={lockedMessage || `Chuyển thẻ sang «${col}»`}
              >
                Chuyển thẻ vào đây
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function KnowledgeSimulationPlayer({ exercise, onSubmit, submitting, onAnswersChange }) {
  const cfg = exercise?.questions || {};
  const sc = cfg.scenario || {};
  const steps = cfg.steps || [];
  const deal = sc.deal || {};
  const sxCompanies = sc.sx_companies || [];
  const classifications = sc.classifications || [];
  const vcCompanies = sc.vc_companies || [];
  const sxColumns = sc.sx_columns || [];
  const vcColumns = sc.vc_columns || [];
  const sxHandoverColumn = sc.sx_handover_column || sxColumns[sxColumns.length - 1] || '';

  const days = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i + 1);
      return toYmd(d);
    });
  }, []);

  const [tab, setTab] = useState('crm');
  const [planOpen, setPlanOpen] = useState(false);
  const [form, setForm] = useState({
    sxCompany: '', classification: '', installDates: [], installTime: '',
    pickupDate: '', pickupTime: '', vcCompany: '', vcNotes: '',
  });
  const [saved, setSaved] = useState(false);
  const [sxColumn, setSxColumn] = useState(sxColumns[0] || '');
  const [vcColumn, setVcColumn] = useState('');
  const [tempStaged, setTempStaged] = useState(false);
  const [tempCardSeen, setTempCardSeen] = useState(false);
  const [dragBlockedSeen, setDragBlockedSeen] = useState(false);
  const [eventsSeen, setEventsSeen] = useState(false);
  const [handoverRequested, setHandoverRequested] = useState(false);
  const [saleConfirmed, setSaleConfirmed] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [comments, setComments] = useState([]);
  const [flash, setFlash] = useState(null);

  const vcCompanyCfg = vcCompanies.find((c) => c.id === form.vcCompany) || null;
  const installDates = [...form.installDates].sort();

  const pushNotification = (text) => setNotifications((prev) => [{ id: `${Date.now()}-${prev.length}`, text }, ...prev]);
  const pushComment = (author, text) => setComments((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, author, text }]);
  const say = (text, tone = 'info') => setFlash({ text, tone });

  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 4200);
    return () => clearTimeout(t);
  }, [flash]);

  const answers = useMemo(() => ({
    sx_company: form.sxCompany || null,
    classification: form.classification || null,
    install_dates: installDates,
    install_time: form.installTime || null,
    pickup_date: form.pickupDate || null,
    pickup_time: form.pickupTime || null,
    vc_company: form.vcCompany || null,
    vc_notes: form.vcNotes || '',
    saved,
    temp_card_seen: tempCardSeen,
    drag_blocked_seen: dragBlockedSeen,
    events_seen: eventsSeen,
    sx_handover: handoverRequested,
    sale_confirm: saleConfirmed,
    final_column: vcColumn || null,
  }), [
    form, installDates, saved, tempCardSeen, dragBlockedSeen, eventsSeen,
    handoverRequested, saleConfirmed, vcColumn,
  ]);

  useEffect(() => { onAnswersChange?.(answers); }, [answers, onAnswersChange]);

  useEffect(() => {
    if (saved && tab === 'vc' && tempStaged) setTempCardSeen(true);
  }, [saved, tab, tempStaged]);

  useEffect(() => {
    if (saved && tab === 'lich') setEventsSeen(true);
  }, [saved, tab]);

  const canSave = form.sxCompany && form.classification && installDates.length > 0
    && form.installTime && form.pickupDate && form.vcCompany;

  const savePlan = () => {
    if (!canSave) {
      say('Còn ô chưa điền — chọn xưởng, ngày lắp, giờ lắp, công ty VC/LĐ rồi bấm Thêm dự án / Lưu lịch.', 'warn');
      return;
    }
    const vc = vcCompanies.find((c) => c.id === form.vcCompany);
    const staged = Boolean(vc?.temp_column);
    setSaved(true);
    setPlanOpen(false);
    setSxColumn(sxColumns[0] || '');
    setVcColumn(staged ? vc.temp_column : (vc?.intake_column || vcColumns[0] || ''));
    setTempStaged(staged);
    pushNotification(`🚚 Kế hoạch lắp đặt sắp tới — ${deal.project_code || 'TB-MP-001'} · lắp đặt ${installDates.map(ddmm).join(', ')} · lấy hàng ${ddmm(form.pickupDate)}${staged ? ' — đang ở cột lắp đặt tạm, chờ xưởng bàn giao.' : ''}`);
    pushComment('Hệ thống', `📋 Đã tạo dự án sản xuất tại ${sxCompanies.find((c) => c.id === form.sxCompany)?.name || 'xưởng'} và ${staged ? `đặt dự án vào cột «${vc.temp_column}»` : 'gắn công ty VC/LĐ'}.`);
    say(staged
      ? 'Đã lưu kế hoạch. Thẻ dự án đang ở cột lắp đặt tạm bên VC/LĐ.'
      : 'Đã lưu kế hoạch, nhưng công ty VC/LĐ này chưa bật cột lắp đặt tạm nên tổ VC/LĐ không thấy trước.', staged ? 'ok' : 'warn');
    setTab('vc');
  };

  const moveSxCard = (col) => {
    if (!saved) {
      say('Chưa có dự án nào ở xưởng — lập kế hoạch bên CRM trước.', 'warn');
      return;
    }
    setSxColumn(col);
    if (col === sxHandoverColumn && !handoverRequested) {
      setHandoverRequested(true);
      pushNotification('🏭 Xưởng đã chuẩn bị xong — Sale CRM cần xác nhận lại thông tin VC/LĐ.');
      pushComment('Xưởng SX', 'Đơn hàng đã chuẩn bị xong, đề nghị bàn giao cho VC/LĐ.');
      say('Xưởng đã bấm bàn giao. Sang tab CRM → Bình luận để xác nhận.', 'ok');
      setTab('crm');
    }
  };

  const moveVcCard = (col) => {
    if (!saved) {
      say('Chưa có dự án nào bên VC/LĐ — lập kế hoạch bên CRM trước.', 'warn');
      return;
    }
    if (tempStaged) {
      setDragBlockedSeen(true);
      say('Thẻ đang ở cột «lắp đặt tạm» → khoá chuyển cột tới khi xưởng bàn giao và Sale CRM xác nhận lại thông tin.', 'warn');
      return;
    }
    setVcColumn(col);
    say(`Đã chuyển thẻ sang «${col}».`, 'ok');
  };

  const confirmHandover = () => {
    if (!handoverRequested) return;
    const vc = vcCompanies.find((c) => c.id === form.vcCompany);
    setSaleConfirmed(true);
    setTempStaged(false);
    setVcColumn(vc?.intake_column || vcColumns[1] || vcColumns[0] || '');
    pushNotification('✅ Đã bàn giao — dự án chuyển sang cột tiếp nhận của bảng Lắp đặt.');
    pushComment('Sale CRM', `Đã xác nhận thông tin VC/LĐ: ${vc?.name || 'công ty VC'} · lắp đặt ${installDates.map(ddmm).join(', ')} · lấy hàng ${ddmm(form.pickupDate)}.`);
    say('Xác nhận xong. Không tạo dự án mới — thẻ chỉ rời cột tạm sang cột tiếp nhận.', 'ok');
    setTab('vc');
  };

  const resetAll = () => {
    setForm({ sxCompany: '', classification: '', installDates: [], installTime: '', pickupDate: '', pickupTime: '', vcCompany: '', vcNotes: '' });
    setSaved(false); setPlanOpen(false); setTempStaged(false); setTempCardSeen(false);
    setDragBlockedSeen(false); setEventsSeen(false); setHandoverRequested(false);
    setSaleConfirmed(false); setNotifications([]); setComments([]);
    setSxColumn(sxColumns[0] || ''); setVcColumn(''); setTab('crm');
    say('Đã làm mới sân tập.', 'info');
  };

  const projectCode = deal.project_code || 'TB-MP-001';

  const vcCard = (
    <div className="rounded-lg bg-white border border-gray-200 p-2.5 shadow-sm" style={{ borderLeft: '4px solid #f97316' }}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-bold text-gray-700">{projectCode}</span>
        {tempStaged && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px] font-bold">
            <Lock className="h-3 w-3" /> TẠM
          </span>
        )}
      </div>
      <p className="text-xs font-semibold text-gray-900 mt-1">{deal.title || 'Dự án mô phỏng'}</p>
      {form.vcNotes ? (
        <p className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-1.5 whitespace-pre-line">
          🚚 Ghi chú VC/LĐ: {form.vcNotes}
        </p>
      ) : null}
      <p className="text-[10px] text-gray-500 mt-1.5">
        Lắp: {installDates.map(ddmm).join(', ') || '—'} · Lấy hàng: {ddmm(form.pickupDate)}
      </p>
    </div>
  );

  const sxCard = (
    <div className="rounded-lg bg-white border border-gray-200 p-2.5 shadow-sm" style={{ borderLeft: '4px solid #ea580c' }}>
      <p className="text-[11px] font-bold text-gray-700">{projectCode}</p>
      <p className="text-xs font-semibold text-gray-900 mt-1">{deal.title || 'Dự án mô phỏng'}</p>
      <p className="text-[10px] text-gray-500 mt-1.5">
        Hoàn thiện SX: {ddmm(installDates[0] ? toYmd(new Date(new Date(`${installDates[0]}T00:00:00`).getTime() - 2 * 86400000)) : '')}
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      {cfg.brief && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-1">Đề bài</p>
          <p className="text-sm text-amber-900 whitespace-pre-line">{cfg.brief}</p>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
          <ModuleTabs tab={tab} setTab={setTab} badges={{ crm: handoverRequested && !saleConfirmed ? 1 : 0 }} />
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-xs text-gray-600">
              <Bell className="h-3.5 w-3.5" /> {notifications.length} thông báo
            </span>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-xs text-gray-600 hover:border-gray-400"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Làm mới sân tập
            </button>
          </div>
        </div>

        {flash && (
          <div className={`px-4 py-2.5 text-sm border-b flex items-start gap-2 ${
            flash.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : flash.tone === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            {flash.tone === 'warn' ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> : <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
            <span>{flash.text}</span>
          </div>
        )}

        <div className="p-4">
          {tab === 'crm' && (
            <div className="space-y-3">
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50/40 p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-[11px] font-bold text-blue-700">{deal.code || 'DEAL-MP-001'}</p>
                    <p className="text-base font-bold text-gray-900">{deal.title || 'Deal mô phỏng'}</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {deal.customer || 'Khách hàng'} · {deal.phone || '09xx'} · {deal.address || 'Địa chỉ lắp đặt'}
                    </p>
                    <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">
                      Giai đoạn: {deal.stage || 'Đã ký hợp đồng'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPlanOpen((v) => !v)}
                    className="px-3.5 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700"
                  >
                    {saved ? 'Kế hoạch SX & VC/LĐ' : 'Thiết lập kế hoạch SX & VC/LĐ'}
                  </button>
                </div>

                {saved && (
                  <div className="mt-3 rounded-lg bg-white border border-gray-200 p-2.5 text-xs text-gray-700">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900 mb-1">Dự án sản xuất</p>
                        <p>{projectCode} · {sxCompanies.find((c) => c.id === form.sxCompany)?.name} · {classifications.find((c) => c.id === form.classification)?.name}</p>
                        <p className="mt-0.5">VC/LĐ: {vcCompanyCfg?.name || '—'}</p>
                        <p className="mt-0.5">Lắp: {installDates.map(ddmm).join(', ')} {form.installTime} · Lấy hàng: {ddmm(form.pickupDate)} {form.pickupTime}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPlanOpen(true)}
                        className="h-7 px-2 rounded-md text-[11px] font-semibold border border-teal-200 text-teal-800 bg-white hover:bg-teal-50 shrink-0"
                      >
                        Sửa lịch
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {planOpen && (
                <div
                  className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-5 bg-black/40"
                  onClick={() => setPlanOpen(false)}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-w-6xl max-h-[90vh] p-5 space-y-3 overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-2 shrink-0">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">
                          {saved ? 'Sửa lịch lắp đặt' : 'Thiết lập kế hoạch sản xuất và vận chuyển lắp đặt'}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {saved
                            ? `${projectCode} — đồng bộ công ty VC/LĐ, ngày lắp / lấy hàng và sự kiện dự kiến.`
                            : 'Deal đã ký hợp đồng — chọn xưởng, ngày lắp, công ty VC/LĐ rồi thêm dự án.'}
                        </p>
                      </div>
                      <button type="button" onClick={() => setPlanOpen(false)} className="p-1 text-gray-400 hover:text-gray-700">✕</button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
                      <div className="space-y-3 min-w-0">
                        {!saved && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className="text-[10px] font-semibold text-gray-700 block">
                              Công ty SX <span className="text-red-500">*</span>
                              <select
                                value={form.sxCompany}
                                onChange={(e) => setForm((f) => ({ ...f, sxCompany: e.target.value }))}
                                className="mt-0.5 w-full h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white"
                              >
                                <option value="">— Chọn công ty SX —</option>
                                {sxCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            </label>
                            <label className="text-[10px] font-semibold text-gray-700 block">
                              Phân loại <span className="text-red-500">*</span>
                              <select
                                value={form.classification}
                                onChange={(e) => setForm((f) => ({ ...f, classification: e.target.value }))}
                                className="mt-0.5 w-full h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white"
                              >
                                <option value="">— Chọn phân loại —</option>
                                {classifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            </label>
                          </div>
                        )}

                        <label className="text-[10px] font-semibold text-gray-700 block">
                          Công ty vận chuyển / lắp đặt
                          <select
                            value={form.vcCompany}
                            onChange={(e) => setForm((f) => ({ ...f, vcCompany: e.target.value }))}
                            className="mt-0.5 w-full h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white"
                          >
                            <option value="">— Chưa chọn công ty VC/LĐ —</option>
                            {vcCompanies.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}{c.temp_column ? ` — có cột tạm «${c.temp_column}»` : ' — chưa bật cột tạm'}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="text-[10px] font-semibold text-gray-700 block">
                          Ghi chú cho bên vận chuyển / lắp đặt
                          <textarea
                            rows={2}
                            value={form.vcNotes}
                            onChange={(e) => setForm((f) => ({ ...f, vcNotes: e.target.value }))}
                            placeholder="VD: hàng dễ vỡ, gọi trước 30 phút, thang máy nhỏ…"
                            className="mt-0.5 w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white resize-y"
                          />
                        </label>

                        <div className="rounded-lg border border-teal-100 bg-teal-50/40 px-2.5 py-2 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-teal-800">
                            Deadline lắp đặt (VC/LĐ) &amp; hoàn thiện (SX)
                          </p>
                          <div>
                            <span className="text-[10px] font-semibold text-gray-700 block">
                              Ngày lắp đặt <span className="font-normal text-teal-600">(deadline VC/LĐ · bấm nhiều ngày nếu lắp nhiều ngày)</span>
                            </span>
                            <div className="mt-1">
                              <DayStrip
                                days={days}
                                multiple
                                selected={form.installDates}
                                onToggle={(d) => setForm((f) => ({
                                  ...f,
                                  installDates: f.installDates.includes(d)
                                    ? f.installDates.filter((x) => x !== d)
                                    : [...f.installDates, d],
                                }))}
                              />
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] font-semibold text-gray-700 block">Giờ lắp đặt</span>
                            <div className="mt-0.5">
                              <ShiftButtons value={form.installTime} onPick={(t) => setForm((f) => ({ ...f, installTime: t }))} />
                            </div>
                          </div>
                          <label className="text-[10px] font-semibold text-indigo-700 block">
                            Ngày hoàn thiện
                            <span className="font-normal text-indigo-500"> (deadline tổng dự án SX = lắp − 2)</span>
                            <input
                              type="text"
                              readOnly
                              disabled
                              value={installDates[0] ? ddmm(addDaysYmd(installDates[0], -2)) : ''}
                              className="mt-0.5 w-full h-9 px-2 border border-indigo-200 rounded-lg text-sm bg-indigo-50 text-indigo-900 font-semibold"
                            />
                          </label>
                        </div>

                        <div className="rounded-lg border border-sky-100 bg-sky-50/50 px-2.5 py-2 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-sky-800">Lấy hàng (VC)</p>
                          <span className="text-[10px] font-semibold text-gray-700 block">
                            Thời gian lấy hàng tại xưởng <span className="font-normal text-gray-400">(không bắt buộc)</span>
                          </span>
                          <DayStrip
                            days={days}
                            selected={form.pickupDate}
                            onToggle={(d) => setForm((f) => ({ ...f, pickupDate: f.pickupDate === d ? '' : d }))}
                          />
                          <ShiftButtons value={form.pickupTime} onPick={(t) => setForm((f) => ({ ...f, pickupTime: t }))} />
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setPlanOpen(false)}
                            className="flex-1 h-10 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
                          >
                            {saved ? 'Hủy' : 'Để sau'}
                          </button>
                          <button
                            type="button"
                            onClick={savePlan}
                            className="flex-1 h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold"
                          >
                            {saved ? 'Lưu lịch' : 'Thêm dự án'}
                          </button>
                        </div>
                      </div>

                      <MiniVcCalendar
                        days={days}
                        installDates={form.installDates}
                        pickupDate={form.pickupDate}
                        finishYmd={installDates[0] ? addDaysYmd(installDates[0], -2) : ''}
                        onPickInstall={(d) => setForm((f) => ({
                          ...f,
                          installDates: f.installDates.includes(d)
                            ? f.installDates.filter((x) => x !== d)
                            : [...f.installDates, d],
                        }))}
                        onPickPickup={(d) => setForm((f) => ({ ...f, pickupDate: f.pickupDate === d ? '' : d }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-gray-200 p-3">
                <p className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-2">
                  <MessageSquare className="h-4 w-4 text-blue-600" /> Bình luận của deal
                </p>
                {!comments.length && <p className="text-xs text-gray-500">Chưa có bình luận nào.</p>}
                <ul className="space-y-1.5">
                  {comments.map((c) => (
                    <li key={c.id} className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-2">
                      <span className="font-semibold text-gray-900">{c.author}: </span>{c.text}
                    </li>
                  ))}
                </ul>

                {handoverRequested && !saleConfirmed && (
                  <div className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
                    <p className="text-sm font-bold text-amber-900">Bàn giao Lắp đặt — xưởng đã chuẩn bị xong</p>
                    <div className="mt-2 rounded-lg bg-white border border-emerald-200 p-2.5 text-xs text-gray-700">
                      <p className="font-semibold text-emerald-800 mb-1">Thông tin VC/LĐ đã điền khi lập kế hoạch — xác nhận hoặc sửa lại</p>
                      <p>Công ty vận chuyển / lắp đặt: <strong>{vcCompanyCfg?.name || '—'}</strong></p>
                      <p>Ngày lắp dự kiến: <strong>{installDates.map(ddmm).join(', ') || '—'} {form.installTime}</strong></p>
                      <p>Ngày lấy hàng: <strong>{ddmm(form.pickupDate)} {form.pickupTime}</strong></p>
                      <p className="whitespace-pre-line">Ghi chú: {form.vcNotes || '—'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={confirmHandover}
                      className="mt-2.5 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700"
                    >
                      Chọn &amp; bàn giao
                    </button>
                  </div>
                )}
                {saleConfirmed && (
                  <p className="mt-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                    ✓ Đã xác nhận bàn giao. Dự án đã sang cột tiếp nhận bên VC/LĐ.
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === 'sx' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-600">
                Kanban xưởng sản xuất. Xong hàng thì chuyển thẻ vào cột <strong>{sxHandoverColumn}</strong> để bàn giao.
              </p>
              {!saved && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">Chưa có dự án — lập kế hoạch bên CRM trước.</p>}
              <KanbanBoard
                columns={sxColumns}
                cardColumn={saved ? sxColumn : null}
                card={sxCard}
                onMove={moveSxCard}
              />
            </div>
          )}

          {tab === 'vc' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-600">
                Bảng Lắp đặt của <strong>{vcCompanyCfg?.name || 'công ty VC/LĐ'}</strong>.
                {vcCompanyCfg?.temp_column ? ` Cột lắp đặt tạm: «${vcCompanyCfg.temp_column}».` : ''}
              </p>
              {!saved && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">Chưa có dự án — lập kế hoạch bên CRM trước.</p>}
              {saved && tempStaged && (
                <p className="text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-lg p-2 flex items-start gap-1.5">
                  <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Thẻ có badge TẠM đang bị khoá chuyển cột. Thử bấm «Chuyển thẻ vào đây» ở cột khác để xem hệ thống chặn thế nào.
                </p>
              )}
              <KanbanBoard
                columns={vcColumns}
                cardColumn={saved ? vcColumn : null}
                card={vcCard}
                onMove={moveVcCard}
                lockedMessage={tempStaged ? 'Thẻ TẠM đang khoá chuyển cột' : null}
              />
            </div>
          )}

          {tab === 'lich' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-600">Tab Lịch — các mốc dự kiến sinh ra ngay khi lưu kế hoạch.</p>
              {!saved ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">Chưa có mốc nào — lập kế hoạch bên CRM trước.</p>
              ) : (
                <ul className="space-y-2">
                  {[
                    { icon: '📦', title: 'Lấy hàng (dự kiến)', when: `${ddmm(form.pickupDate)} ${form.pickupTime || ''}`, module: 'Lắp đặt', note: true },
                    { icon: '🔧', title: 'Lắp đặt (dự kiến)', when: `${installDates.map(ddmm).join(', ')} ${form.installTime || ''}`, module: 'Lắp đặt', note: true },
                    { icon: '✅', title: 'Hoàn thiện sản xuất (dự kiến)', when: installDates[0] ? ddmm(toYmd(new Date(new Date(`${installDates[0]}T00:00:00`).getTime() - 2 * 86400000))) : '—', module: 'Sản xuất', note: false },
                  ].map((ev) => (
                    <li key={ev.title} className="rounded-xl border border-gray-200 bg-white p-2.5">
                      <p className="text-sm font-semibold text-gray-900">{ev.icon} {ev.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{ev.when} · module {ev.module}</p>
                      {ev.note && form.vcNotes && (
                        <p className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-1.5 whitespace-pre-line">
                          🚚 Ghi chú VC/LĐ: {form.vcNotes}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="rounded-xl border border-gray-200 p-3">
                <p className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-violet-600" /> Thông báo đã gửi
                </p>
                {!notifications.length && <p className="text-xs text-gray-500">Chưa có thông báo nào.</p>}
                <ul className="space-y-1.5">
                  {notifications.map((n) => (
                    <li key={n.id} className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-2">{n.text}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-bold text-gray-900 mb-2">Các bước được chấm điểm</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {steps.map((st) => (
            <li key={st.id} className="text-xs text-gray-700 flex items-start gap-1.5">
              <span className="mt-0.5 w-4 h-4 rounded bg-gray-100 border border-gray-300 shrink-0" />
              <span>
                {st.label}{st.points ? ` (${st.points} điểm)` : ''}
                {st.required && (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold align-middle">
                    bắt buộc
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={submitting}
          onClick={() => onSubmit(answers)}
          className="mt-4 w-full px-5 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          Nộp bài mô phỏng
        </button>
        <p className="text-[11px] text-gray-500 mt-2 text-center">
          Sân tập này không ghi dữ liệu vào hệ thống thật — cứ thử thoải mái.
        </p>
      </div>
    </div>
  );
}
