/**
 * Báo cáo hằng ngày (chấm công) — form NV + dashboard theo dõi team.
 * API: /api/crm/daily-reports/*
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Loader2,
  Save, Send, Users, X, AlertTriangle, CheckCircle2, Clock, Sparkles, History,
  Plus, Trash2, HelpCircle, Filter, Search, ExternalLink, FileDown, Copy, Sheet,
  SlidersHorizontal,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isSystemAdmin, isCompanyScopedAdmin } from '../lib/adminRole';
import {
  getStoredCrmFilterCompanyId,
  setStoredCrmFilterCompanyId,
  resolveDefaultCrmAdminCompanyId,
  normalizeCrmFilterCompanies,
  sortCrmCompaniesForAdminFilter,
  isLikelyEmptyCrmLeadCompany,
} from '../lib/crmCompanyFilter';
import { copyElementImageToClipboard, downloadElementPdf } from '../lib/domCaptureShare';
import { downloadDailyReportMatrixExcel } from '../lib/crmDailyReportMatrixExcel';

const pad2 = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayISO = () => toISO(new Date());
const fmtDMY = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const fmtTime = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
};

/** Giải thích hạng mục AUTO (hover dấu ?) */
const METRIC_HELP = {
  lead_new: 'Số lead vào cột Tiếp nhận trong ngày (hoặc lead bạn tạo mới cùng ngày). Đếm lead bạn phụ trách hoặc bạn là người chuyển cột. Lấy max hai nguồn, không cộng trùng.',
  not_contacted: 'Số lead (distinct) vào cột Không trả lời / không phản hồi trong ngày.',
  care_cold: 'Ưu tiên: số lead đang ở Cold mà bạn có activity trong ngày. Nếu không có activity thì đếm lead vào cột Cold trong ngày.',
  care_warm: 'Ưu tiên: số lead đang ở Warm mà bạn có activity trong ngày. Nếu không có activity thì đếm lead vào cột Warm trong ngày.',
  care_hot: 'Ưu tiên: số lead đang ở Hot mà bạn có activity trong ngày. Nếu không có activity thì đếm lead vào cột Hot trong ngày.',
  survey_scheduled: 'Số lead bạn convert Lead → Deal trong ngày (KPI lead_converted hoặc chuyển sang pipeline Deal) — không phải số vào cột Hẹn khảo sát.',
  deal_new: 'Số deal tiếp nhận trong ngày (deal tạo mới hoặc lead→deal). Lấy max hai nguồn.',
  deal_interact: 'Số sự kiện khảo sát / đo đạc trong ngày có liên kết lead/deal (bạn tạo hoặc được giao).',
  deal_survey: 'Số sự kiện khảo sát / đo đạc trong ngày có liên kết lead/deal.',
  deal_to_quote: 'Số deal chuyển sang báo giá hoặc đang thiết kế/BG trong ngày (cộng hai cột, có thể trùng nếu cùng deal đi cả hai).',
  deal_to_contract: 'Số deal ký hợp đồng hoặc chờ cọc trong ngày.',
  deal_producing: 'Số deal vào sản xuất trong ngày.',
  deal_installing: 'Số deal VC / lắp đặt trong ngày.',
  deal_completed: 'Số deal hoàn thành trong ngày.',
  deal_overdue: 'Số deal chưa thắng/thua có deadline thẻ hoặc ngày đóng kỳ vọng rơi vào ngày đó.',
  survey_event: 'Số sự kiện khảo sát / đo đạc trong ngày (bạn được giao hoặc tạo).',
  install_follow: 'Số deal theo dõi lắp đặt (chuyển cột hoặc task) trong ngày.',
  design_consult: 'Điền tay: số lần hỗ trợ tư vấn.',
  design_new: 'Điền tay: số thiết kế mới.',
  design_edit: 'Điền tay: số lần sửa thiết kế.',
  design_concept: 'Điền tay: số thiết kế concept.',
  design_approve: 'Điền tay: số duyệt TK / đặt hàng SX.',
};

function isSystemAutoNote(note) {
  const s = String(note || '').trim();
  return /^tự động:/i.test(s) || /^không tự động/i.test(s);
}

function metricHelpText(metricKey, label) {
  if (metricKey && METRIC_HELP[metricKey]) return METRIC_HELP[metricKey];
  if (metricKey) return `Hạng mục hệ thống (${metricKey}): số liệu lấy tự động từ CRM trong ngày báo cáo.`;
  return label ? `Hạng mục: ${label}` : 'Hạng mục báo cáo';
}

/** Hover ? — tooltip portal (tránh bị cắt bởi overflow bảng). */
function MetricHelpIcon({ text }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const place = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.top - 8, left: r.left + r.width / 2 });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, place]);

  if (!text) return null;

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex cursor-help text-violet-500 hover:text-violet-700"
      onMouseEnter={() => { place(); setOpen(true); }}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => { place(); setOpen(true); }}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      aria-label={text}
    >
      <HelpCircle className="h-3.5 w-3.5 shrink-0" />
      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] max-w-xs -translate-x-1/2 -translate-y-full px-1"
          style={{ top: pos.top, left: pos.left }}
          role="tooltip"
        >
          <div className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-left text-[11px] leading-snug text-white shadow-lg">
            {text}
          </div>
          <div className="mx-auto -mt-px h-2 w-2 rotate-45 bg-slate-900" />
        </div>,
        document.body,
      )}
    </span>
  );
}

function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

const STATUS_META = {
  draft: { label: 'Nháp', cls: 'bg-gray-100 text-gray-600' },
  plan_submitted: { label: 'Đã nộp KH', cls: 'bg-sky-100 text-sky-700' },
  result_submitted: { label: 'Đã chốt KQ', cls: 'bg-emerald-100 text-emerald-700' },
  late: { label: 'Đã chốt KQ', cls: 'bg-emerald-100 text-emerald-700' },
};

const SUBMIT_META = {
  missing: { label: 'Chưa nộp', cls: 'bg-red-50 text-red-700 border-red-200' },
  draft: { label: 'Nháp', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  plan_ok: { label: 'Có kế hoạch', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  result_ok: { label: 'Đã chốt KQ', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

/** Badge trạng thái theo từng mục I–IV (không dùng chung “Đã chốt” trên mọi bảng). */
function matrixSectionBadge(sectionKey, emp, rows) {
  const state = emp?.submit_state || 'missing';
  if (state === 'missing') {
    return { label: 'Chưa có phiếu', cls: 'bg-red-50 text-red-700 border-red-200' };
  }

  const hasContent = (rows || []).some((row) => {
    const v = matrixCellValue(row, emp.id);
    if (v == null || v === '') return false;
    if (typeof v === 'number') return true; // kể cả 0 vẫn là đã điền/chốt số
    return String(v).trim().length > 0;
  });

  if (sectionKey === 'plan') {
    if (hasContent) return { label: 'Có KH · I', cls: 'bg-sky-50 text-sky-800 border-sky-200' };
    return { label: 'Chưa KH · I', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
  }
  if (sectionKey === 'result') {
    if (state === 'result_ok') {
      return { label: 'Đã chốt KQ · II', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
    }
    if (hasContent) return { label: 'Có số · II', cls: 'bg-violet-50 text-violet-800 border-violet-200' };
    return { label: 'Chưa chốt · II', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
  }
  if (sectionKey === 'sharpen') {
    if (hasContent) return { label: 'Có · III', cls: 'bg-amber-50 text-amber-900 border-amber-200' };
    return { label: 'Trống · III', cls: 'bg-white/80 text-amber-900/70 border-amber-200/80' };
  }
  if (sectionKey === 'proposal') {
    if (hasContent) return { label: 'Có · IV', cls: 'bg-emerald-50 text-emerald-900 border-emerald-200' };
    return { label: 'Trống · IV', cls: 'bg-white/80 text-emerald-900/70 border-emerald-200/80' };
  }
  return SUBMIT_META[state] || SUBMIT_META.missing;
}

function Avatar({ user, size = 'h-8 w-8' }) {
  const name = user?.full_name || '?';
  if (user?.avatar) {
    return <img src={user.avatar} alt={name} title={name} className={`${size} rounded-full object-cover shrink-0`} />;
  }
  const initials = name.split(' ').filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span title={name} className={`${size} rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold shrink-0`}>
      {initials || '?'}
    </span>
  );
}

function achieveTone(pct) {
  if (pct == null) return '';
  if (pct >= 100) return 'text-emerald-700';
  if (pct >= 70) return 'text-amber-700';
  return 'text-red-600';
}

function lineAchieve(plan, result) {
  if (plan == null || Number(plan) === 0) return null;
  if (result == null) return 0;
  return Math.round((Number(result) / Number(plan)) * 1000) / 10;
}

function mapLines(list) {
  return (list || []).map((l) => {
    const metricKey = l.metric_key || '';
    const isUserExtra = String(metricKey).startsWith('user_extra:') || !!l.is_user_extra;
    const blank = !String(l.label || '').trim();
    const note = isSystemAutoNote(l.result_note) ? '' : (l.result_note || '');
    return {
      ...l,
      plan_value: l.plan_value ?? '',
      result_value: l.result_value ?? '',
      plan_note: l.plan_note || '',
      result_note: note,
      is_user_extra: isUserExtra,
      user_extra_id: l.user_extra_id || (String(metricKey).startsWith('user_extra:') ? metricKey.slice('user_extra:'.length) : null),
      _labelEditable: blank || isUserExtra || !!l._labelEditable,
    };
  });
}

/** Gắn số liệu CRM preview vào dòng Phần I (Deadline) và Phần II (funnel). */
function applyAutoPreview(list, resultMetrics, planMetrics) {
  const hasResult = resultMetrics && typeof resultMetrics === 'object';
  const hasPlan = planMetrics && typeof planMetrics === 'object';
  if (!hasResult && !hasPlan) return list;
  return (list || []).map((l) => {
    if (l.section !== 'work') return l;
    const key = l.metric_key;
    const m = key && hasResult ? resultMetrics[key] : null;
    const p = key && hasPlan ? planMetrics[key] : null;
    if ((!m || m.value == null) && (!p || p.value == null)) return l;
    return {
      ...l,
      result_value: (m && m.value != null) ? m.value : l.result_value,
      plan_value: (p && p.value != null) ? p.value : l.plan_value,
      auto_result: true,
      preview_live: !!(m && m.value != null),
      preview_live_plan: !!(p && p.value != null),
      auto_hint: m?.note || null,
      auto_plan_hint: p?.note || null,
    };
  });
}

// ─── Form nhập của NV ────────────────────────────────────────────────────────
function MyReportPanel({ date, onDateChange }) {
  const { user } = useAuth();
  const shareRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [exporting, setExporting] = useState(''); // 'pdf' | 'copy' | ''
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [report, setReport] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [lines, setLines] = useState([]);
  const [templateId, setTemplateId] = useState('');

  const closed = report?.status === 'result_submitted' || report?.status === 'late';

  const exportCaptureOptions = {
    ignoreElements: (node) => node?.dataset?.exportHide === '1',
    onclone: (doc) => {
      doc.querySelectorAll('[data-export-only]').forEach((el) => {
        el.style.display = 'block';
      });
      doc.querySelectorAll('[data-export-hide="1"]').forEach((el) => {
        el.style.display = 'none';
      });
    },
  };

  const exportPdf = async () => {
    if (!shareRef.current || exporting) return;
    setExporting('pdf');
    setError('');
    setOkMsg('');
    try {
      const name = report?.user?.full_name || user?.full_name || 'NV';
      const slug = String(name).replace(/\s+/g, '_');
      await downloadElementPdf(
        shareRef.current,
        `Bao_cao_hang_ngay_${slug}_${date}.pdf`,
        exportCaptureOptions,
      );
      setOkMsg('Đã tải PDF — gửi file cho quản lý / Zalo / email.');
    } catch (e) {
      setError(e?.message || 'Xuất PDF thất bại');
    } finally {
      setExporting('');
    }
  };

  const copyImage = async () => {
    if (!shareRef.current || exporting) return;
    setExporting('copy');
    setError('');
    setOkMsg('');
    try {
      await copyElementImageToClipboard(shareRef.current, exportCaptureOptions);
      setOkMsg('Đã copy ảnh vào clipboard — dán (Ctrl+V) vào Zalo / Messenger / email.');
    } catch (e) {
      setError(e?.message || 'Copy ảnh thất bại (cần HTTPS hoặc localhost)');
    } finally {
      setExporting('');
    }
  };

  const fillPreview = useCallback(async (baseLines, tplId, tplList, rep) => {
    const tpl = (tplList || []).find((t) => String(t.id) === String(tplId || rep?.template_id));
    const roleKey = tpl?.role_key || rep?.template?.role_key || null;
    setPreviewing(true);
    try {
      const { data } = await api.get('/crm/daily-reports/mine/preview-auto', {
        params: { date, role_key: roleKey || undefined },
      });
      // Phiếu đã chốt: giữ số đã lưu, chỉ bổ sung ghi chú preview nếu trống
      const isClosed = rep?.status === 'result_submitted' || rep?.status === 'late';
      if (isClosed) {
        const metrics = data.metrics || {};
        const planMetrics = data.plan_metrics || {};
        setLines((baseLines || []).map((l) => {
          if (l.section !== 'work') return l;
          const m = l.metric_key ? metrics[l.metric_key] : null;
          const p = l.metric_key ? planMetrics[l.metric_key] : null;
          if (!m && !p) return { ...l, auto_result: l.auto_result || false };
          const hasSaved = l.result_value !== '' && l.result_value != null;
          const hasSavedPlan = l.plan_value !== '' && l.plan_value != null;
          return {
            ...l,
            result_value: hasSaved ? l.result_value : (m?.value ?? l.result_value),
            plan_value: hasSavedPlan ? l.plan_value : (p?.value ?? l.plan_value),
            auto_result: true,
            preview_live: !hasSaved && !!m,
            preview_live_plan: !hasSavedPlan && !!p,
            auto_hint: m?.note || null,
            auto_plan_hint: p?.note || null,
          };
        }));
      } else {
        setLines(applyAutoPreview(baseLines, data.metrics, data.plan_metrics));
      }
    } catch (e) {
      setLines(baseLines);
      console.warn('[daily-report] preview-auto failed', e?.message || e);
    } finally {
      setPreviewing(false);
    }
  }, [date]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setOkMsg('');
    try {
      const { data } = await api.get('/crm/daily-reports/mine', { params: { date } });
      setReport(data.report);
      setTemplates(data.templates || []);
      const mapped = mapLines(data.report?.lines);
      setTemplateId(data.report?.template_id || '');
      setLines(mapped);
      await fillPreview(mapped, data.report?.template_id, data.templates, data.report);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Không tải được báo cáo');
      setReport(null);
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [date, fillPreview]);

  useEffect(() => { load(); }, [load]);

  const workLines = useMemo(() => lines.filter((l) => l.section === 'work'), [lines]);
  const sharpenLines = useMemo(() => lines.filter((l) => l.section === 'sharpen'), [lines]);
  const proposalLines = useMemo(() => lines.filter((l) => l.section === 'proposal'), [lines]);

  const updateLine = (idx, field, value) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, [field]: value };
      if (field === 'label') next._labelEditable = true;
      return next;
    }));
  };

  const buildPayloadLines = () => lines.map((l) => ({
    id: l.id || undefined,
    template_item_id: l.template_item_id || undefined,
    metric_key: l.metric_key || undefined,
    label: l.label,
    plan_value: l.plan_value === '' ? null : l.plan_value,
    plan_note: l.plan_note,
    result_value: l.result_value === '' ? null : l.result_value,
    result_note: l.result_note,
  }));

  const isBlankLabel = (label) => !String(label || '').trim();
  const canEditLabel = (l) => l.is_user_extra || l._labelEditable || isBlankLabel(l.label);

  const submitReport = async () => {
    setClosing(true);
    setSaving(true);
    setError('');
    setOkMsg('');
    try {
      await api.put('/crm/daily-reports/mine', {
        date,
        template_id: templateId || report?.template_id,
        phase: closed ? 'draft' : 'plan',
        lines: buildPayloadLines(),
      });
      const { data } = await api.post('/crm/daily-reports/mine/auto-close', {
        date,
        template_id: templateId || report?.template_id,
      });
      setReport(data.report);
      setTemplateId(data.report?.template_id || templateId);
      setLines(mapLines(data.report?.lines));
      let msg = 'Đã nộp báo cáo';
      if (data.auto_close?.auto_filled) msg += ` · chốt ${data.auto_close.auto_filled} hạng mục từ CRM`;
      if (data.auto_close?.manual_left) msg += ` · ${data.auto_close.manual_left} hạng mục điền tay`;
      setOkMsg(msg);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Nộp báo cáo thất bại');
    } finally {
      setClosing(false);
      setSaving(false);
    }
  };

  const onChangeTemplate = async (id) => {
    if (!id || id === templateId) return;
    setTemplateId(id);
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/crm/daily-reports/mine', { params: { date, template_id: id } });
      setReport(data.report);
      if (data.templates?.length) setTemplates(data.templates);
      const mapped = mapLines(data.report?.lines);
      setLines(mapped);
      setTemplateId(data.report?.template_id || id);
      await fillPreview(mapped, data.report?.template_id || id, data.templates || templates, data.report);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Đổi mẫu thất bại');
    } finally {
      setLoading(false);
    }
  };

  const addExtraLine = async (section) => {
    if (saving) return;
    const defaultLabel = section === 'proposal'
      ? 'Đề xuất mới'
      : section === 'sharpen'
        ? 'Công việc mài dao mới'
        : 'Hạng mục mới';
    setSaving(true);
    setError('');
    setOkMsg('');
    try {
      const { data } = await api.post('/crm/daily-reports/mine/extras', {
        section,
        label: defaultLabel,
        date,
      });
      if (data.report) {
        setReport(data.report);
        const mapped = mapLines(data.report.lines).map((l) => (
          l.user_extra_id === data.extra?.id
            ? { ...l, _labelEditable: true, label: l.label || defaultLabel }
            : l
        ));
        setLines(mapped);
        await fillPreview(mapped, data.report.template_id || templateId, templates, data.report);
      } else if (data.extra) {
        setLines((prev) => [
          ...prev,
          {
            id: null,
            template_item_id: null,
            section: data.extra.section,
            label: data.extra.label || defaultLabel,
            order_index: data.extra.order_index,
            metric_key: `user_extra:${data.extra.id}`,
            plan_value: '',
            result_value: '',
            plan_note: '',
            result_note: '',
            auto_result: false,
            is_user_extra: true,
            user_extra_id: data.extra.id,
            _labelEditable: true,
          },
        ]);
      }
      setOkMsg('Đã thêm dòng — sửa tên trực tiếp trên bảng. Dòng này giữ lại các ngày sau.');
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Thêm dòng thất bại');
    } finally {
      setSaving(false);
    }
  };

  const removeExtraLine = async (line) => {
    if (!line?.user_extra_id || saving) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await api.delete(`/crm/daily-reports/mine/extras/${line.user_extra_id}`, {
        params: { date },
      });
      if (data.report) {
        setReport(data.report);
        const mapped = mapLines(data.report.lines);
        setLines(mapped);
        await fillPreview(mapped, data.report.template_id || templateId, templates, data.report);
      } else {
        setLines((prev) => prev.filter((l) => l.user_extra_id !== line.user_extra_id));
      }
      setOkMsg('Đã xóa dòng tự thêm');
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Xóa dòng thất bại');
    } finally {
      setSaving(false);
    }
  };

  const findIdx = (l) => lines.findIndex((x) => x === l || (x.id && x.id === l.id)
    || (x.template_item_id && x.template_item_id === l.template_item_id && x.section === l.section && x.order_index === l.order_index));

  const th = 'px-3 py-2 text-left font-semibold';
  const inputCls = 'w-full rounded-md border border-gray-200 px-2 py-1.5 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:bg-gray-50';

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải form…
      </div>
    );
  }

  const st = STATUS_META[report?.status] || STATUS_META.draft;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950" data-export-hide="1">
        <strong>Phần I</strong> = kế hoạch ngày phiếu ({fmtDMY(date)}), tự lấy từ Deadline Lead/Deal cột <strong>Quá hạn + Hôm nay</strong>
        {' '}(hệ thống tự chốt ~<strong>08:00</strong>).{' '}
        <strong>Phần II</strong> = kết quả CRM đúng ngày phiếu ({fmtDMY(date)}), tự lấy khi <strong>Nộp báo cáo</strong>
        {' '}(hệ thống tự chốt ~<strong>16:45</strong>).
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2" data-export-hide="1">
        <button
          type="button"
          disabled={!!exporting}
          onClick={copyImage}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          title="Copy ảnh phiếu vào clipboard để dán gửi đi"
        >
          {exporting === 'copy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
          Copy ảnh
        </button>
        <button
          type="button"
          disabled={!!exporting}
          onClick={exportPdf}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
          title="Tải PDF phiếu báo cáo"
        >
          {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          Xuất PDF
        </button>
      </div>

      <div ref={shareRef} className="space-y-4 rounded-xl bg-white p-1">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="min-w-[180px] flex-1">
          <div className="text-xs font-medium text-gray-500">Tên nhân viên</div>
          <div className="mt-1 flex items-center gap-2 font-semibold text-gray-900">
            <Avatar user={report?.user || user} />
            {report?.user?.full_name || user?.full_name || '—'}
          </div>
        </div>
        <div className="min-w-[140px]">
          <div className="text-xs font-medium text-gray-500">Bộ phận / Mẫu</div>
          <select
            disabled={templates.length <= 1 || loading || saving}
            value={templateId}
            onChange={(e) => onChangeTemplate(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm disabled:bg-gray-50"
            data-export-hide="1"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <div className="mt-1 hidden text-sm font-medium text-gray-800" data-export-only="">
            {templates.find((t) => String(t.id) === String(templateId))?.name
              || report?.template?.name
              || '—'}
          </div>
          {report?.department_name && (
            <div className="mt-0.5 text-xs text-gray-500">{report.department_name}</div>
          )}
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500">Ngày báo cáo</div>
          <div className="mt-1 flex items-center gap-1" data-export-hide="1">
            <button type="button" onClick={() => onDateChange(addDaysISO(date, -1))} className="rounded-md border border-gray-200 p-1.5 hover:bg-gray-50">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
            <button type="button" onClick={() => onDateChange(addDaysISO(date, 1))} className="rounded-md border border-gray-200 p-1.5 hover:bg-gray-50">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1 hidden text-sm font-semibold text-gray-900" data-export-only="">
            {fmtDMY(date)}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500">Trạng thái</div>
          <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${st.cls}`}>{st.label}</span>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-export-hide="1">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {okMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" data-export-hide="1">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {okMsg}
        </div>
      )}

      {/* I. Kế hoạch */}
      {!!workLines.length && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white">
            <span>
              I. NỘI DUNG KẾ HOẠCH CÔNG VIỆC CỦA NGÀY MỚI
              <span className="ml-2 font-bold tracking-normal text-sky-200">
                ({fmtDMY(date)})
              </span>
            </span>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/90 px-2 py-0.5 text-[11px] font-semibold tracking-wide">
                {previewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                DEADLINE QH + HÔM NAY
              </span>
              <button
                type="button"
                disabled={saving}
                onClick={() => addExtraLine('work')}
                title="Thêm hạng mục"
                data-export-hide="1"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-amber-50 text-amber-900/80">
                  <th className={`w-10 ${th}`}>STT</th>
                  <th className={`min-w-[200px] ${th}`}>Nội dung công việc</th>
                  <th className={`w-32 text-right ${th}`}>Thông số kế hoạch</th>
                  <th className={`min-w-[220px] ${th}`}>Ghi chú</th>
                  <th className={`w-16 ${th}`} data-export-hide="1" />
                </tr>
              </thead>
              <tbody>
                {workLines.map((l, i) => {
                  const planManual = l.is_user_extra || !l.metric_key || String(l.metric_key).startsWith('user_extra:');
                  return (
                  <tr key={l.id || l.user_extra_id || `p-${i}`} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {canEditLabel(l) ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                           
                            value={l.label || ''}
                            placeholder="Nhập nội dung…"
                            onChange={(e) => updateLine(findIdx(l), 'label', e.target.value)}
                            onBlur={() => {
                              if (l.is_user_extra && l.user_extra_id && String(l.label || '').trim()) {
                                api.patch(`/crm/daily-reports/mine/extras/${l.user_extra_id}`, {
                                  label: String(l.label).trim(),
                                  date,
                                }).catch(() => {});
                              }
                            }}
                            className={inputCls}
                          />
                          {l.is_user_extra && (
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">CỦA BẠN</span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <span>{l.label}</span>
                          {(l.preview_live_plan || l.auto_result) && !l.is_user_extra && (
                            <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">AUTO</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {planManual ? (
                        <input type="number" min="0" step="1" value={l.plan_value}
                          onChange={(e) => updateLine(findIdx(l), 'plan_value', e.target.value)}
                          className={`${inputCls} text-right tabular-nums`} />
                      ) : (
                        <div
                          className="rounded-md border border-dashed border-sky-200 bg-sky-50/50 px-2 py-1.5 text-right tabular-nums font-semibold text-sky-900"
                          title={l.auto_plan_hint || ''}
                        >
                          {previewing && (l.plan_value === '' || l.plan_value == null)
                            ? '…'
                            : (l.plan_value === '' || l.plan_value == null ? 0 : l.plan_value)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" value={l.plan_note} placeholder="Ghi chú kế hoạch"
                        onChange={(e) => updateLine(findIdx(l), 'plan_note', e.target.value)}
                        className={inputCls} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {l.is_user_extra && (
                        <button type="button" onClick={() => removeExtraLine(l)} className="rounded p-1 text-red-500 hover:bg-red-50" title="Xóa dòng">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* II. Báo cáo kết quả — tự động điền từ CRM */}
      {!!workLines.length && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white">
            <span>
              II. NỘI DUNG BÁO CÁO CÔNG VIỆC TRONG NGÀY
              <span className="ml-2 font-bold tracking-normal text-amber-200">
                ({fmtDMY(date)} · chốt 16:45)
              </span>
            </span>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/90 px-2 py-0.5 text-[11px] font-semibold tracking-wide">
                {previewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                TỰ ĐỘNG ĐIỀN
              </span>
              <button
                type="button"
                disabled={saving}
                onClick={() => addExtraLine('work')}
                title="Thêm hạng mục"
                data-export-hide="1"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-violet-50 text-violet-900/80">
                  <th className={`w-10 ${th}`}>STT</th>
                  <th className={`min-w-[200px] ${th}`}>Nội dung công việc</th>
                  <th className={`w-28 text-right ${th}`}>Kết quả đạt được</th>
                  <th className={`w-16 text-right ${th}`}>% KH</th>
                  <th className={`min-w-[240px] ${th}`}>Ghi chú</th>
                  <th className={`w-16 ${th}`} />
                </tr>
              </thead>
              <tbody>
                {workLines.map((l, i) => {
                  const pct = lineAchieve(l.plan_value === '' ? null : l.plan_value, l.result_value === '' ? null : l.result_value);
                  const manual = l.is_user_extra || !l.metric_key || String(l.metric_key).startsWith('user_extra:');
                  return (
                    <tr key={l.id || l.user_extra_id || `r-${i}`} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">
                        {canEditLabel(l) ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                             
                              value={l.label || ''}
                              placeholder="Nhập nội dung…"
                              onChange={(e) => updateLine(findIdx(l), 'label', e.target.value)}
                              onBlur={() => {
                                if (l.is_user_extra && l.user_extra_id && String(l.label || '').trim()) {
                                  api.patch(`/crm/daily-reports/mine/extras/${l.user_extra_id}`, {
                                    label: String(l.label).trim(),
                                    date,
                                  }).catch(() => {});
                                }
                              }}
                              className={inputCls}
                            />
                            {l.is_user_extra && (
                              <span className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">CỦA BẠN</span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <span>{l.label}</span>
                            {(l.metric_key && !l.is_user_extra) && (
                              <MetricHelpIcon text={metricHelpText(l.metric_key, l.label)} />
                            )}
                            {(l.auto_result || l.preview_live) && !l.is_user_extra && (
                              <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">AUTO</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {manual ? (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={l.result_value}
                            onChange={(e) => updateLine(findIdx(l), 'result_value', e.target.value)}
                            className={`${inputCls} text-right tabular-nums`}
                            placeholder="0"
                          />
                        ) : (
                          <div className="rounded-md border border-dashed border-violet-200 bg-violet-50/50 px-2 py-1.5 text-right tabular-nums font-semibold text-violet-900">
                            {previewing && (l.result_value === '' || l.result_value == null)
                              ? '…'
                              : (l.result_value === '' || l.result_value == null ? 0 : l.result_value)}
                          </div>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${achieveTone(pct)}`}>
                        {pct == null ? '—' : `${pct}%`}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={l.result_note}
                          onChange={(e) => updateLine(findIdx(l), 'result_note', e.target.value)}
                          className={inputCls}
                          placeholder="Ghi chú của bạn…"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {l.is_user_extra && (
                          <button type="button" onClick={() => removeExtraLine(l)} className="rounded p-1 text-red-500 hover:bg-red-50" title="Xóa dòng">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* III. Mài dao */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white">
          <span>
            III. CÔNG VIỆC MÀI DAO
            <span className="ml-2 font-bold tracking-normal text-indigo-200">
              ({fmtDMY(date)})
            </span>
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={() => addExtraLine('sharpen')}
            title="Thêm dòng mài dao"
            data-export-hide="1"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-indigo-700 shadow hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-amber-50 text-amber-900/80">
                <th className={`w-10 ${th}`}>STT</th>
                <th className={`min-w-[220px] ${th}`}>Nội dung công việc</th>
                <th className={`w-28 text-right ${th}`}>Kết quả đạt được</th>
                <th className={`min-w-[260px] ${th}`}>Ghi chú</th>
                <th className={`w-16 ${th}`} />
              </tr>
            </thead>
            <tbody>
              {sharpenLines.map((l, i) => (
                <tr key={l.id || l.user_extra_id || `s-${i}`} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {canEditLabel(l) ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                         
                          value={l.label || ''}
                          placeholder="Nhập nội dung công việc…"
                          onChange={(e) => updateLine(findIdx(l), 'label', e.target.value)}
                          onBlur={() => {
                            if (l.is_user_extra && l.user_extra_id && String(l.label || '').trim()) {
                              api.patch(`/crm/daily-reports/mine/extras/${l.user_extra_id}`, {
                                label: String(l.label).trim(),
                                date,
                              }).catch(() => {});
                            }
                          }}
                          className={inputCls}
                        />
                        {l.is_user_extra && (
                          <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">CỦA BẠN</span>
                        )}
                      </div>
                    ) : (
                      <span>{l.label}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="0" step="1" value={l.result_value}
                      onChange={(e) => updateLine(findIdx(l), 'result_value', e.target.value)}
                      className={`${inputCls} text-right tabular-nums`} placeholder="0" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={l.result_note} placeholder="Tóm tắt đã học / đã làm"
                      onChange={(e) => updateLine(findIdx(l), 'result_note', e.target.value)}
                      className={inputCls} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {l.is_user_extra && (
                      <button type="button" onClick={() => removeExtraLine(l)} className="rounded p-1 text-red-500 hover:bg-red-50" title="Xóa dòng">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!sharpenLines.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">Chưa có hạng mục — bấm Thêm dòng</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* IV. Đề xuất */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white">
          <span>
            IV. ĐỀ XUẤT
            <span className="ml-2 font-bold tracking-normal text-emerald-200">
              ({fmtDMY(date)})
            </span>
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={() => addExtraLine('proposal')}
            title="Thêm dòng đề xuất"
            data-export-hide="1"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-emerald-800 shadow hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-amber-50 text-amber-900/80">
                <th className={`w-10 ${th}`}>STT</th>
                <th className={`min-w-[160px] ${th}`}>Danh mục đề xuất</th>
                <th className={`min-w-[240px] ${th}`}>Mong muốn</th>
                <th className={`min-w-[200px] ${th}`}>Ghi chú</th>
                <th className={`w-16 ${th}`} />
              </tr>
            </thead>
            <tbody>
              {proposalLines.map((l, i) => (
                <tr key={l.id || l.user_extra_id || `o-${i}`} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {canEditLabel(l) ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                         
                          value={l.label || ''}
                          placeholder="Danh mục đề xuất…"
                          onChange={(e) => updateLine(findIdx(l), 'label', e.target.value)}
                          onBlur={() => {
                            if (l.is_user_extra && l.user_extra_id && String(l.label || '').trim()) {
                              api.patch(`/crm/daily-reports/mine/extras/${l.user_extra_id}`, {
                                label: String(l.label).trim(),
                                date,
                              }).catch(() => {});
                            }
                          }}
                          className={inputCls}
                        />
                        {l.is_user_extra && (
                          <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">CỦA BẠN</span>
                        )}
                      </div>
                    ) : (
                      <span>{l.label}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={l.plan_note} placeholder="Mong muốn…"
                      onChange={(e) => updateLine(findIdx(l), 'plan_note', e.target.value)}
                      className={inputCls} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={l.result_note} placeholder="Ghi chú"
                      onChange={(e) => updateLine(findIdx(l), 'result_note', e.target.value)}
                      className={inputCls} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {l.is_user_extra && (
                      <button type="button" onClick={() => removeExtraLine(l)} className="rounded p-1 text-red-500 hover:bg-red-50" title="Xóa dòng">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!proposalLines.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">Chưa có đề xuất — bấm Thêm dòng</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-3" data-export-hide="1">
        <div className="text-sm text-indigo-900">
          Xem tóm tắt & chi tiết mọi hoạt động trên hệ thống trong ngày (Lead, Deal, sự kiện…).
        </div>
        <Link
          to={`/crm/daily-reports/history?date=${date}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
        >
          <History className="h-4 w-4" /> Lịch sử công việc ngày
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm" data-export-hide="1">
        <div className="text-xs text-gray-500">
          Nộp: {fmtTime(report?.result_submitted_at || report?.plan_submitted_at)}
          {report?.stats?.achieve_pct != null && (
            <span className={`ml-2 font-semibold ${achieveTone(report.stats.achieve_pct)}`}>
              Đạt {report.stats.achieve_pct}%
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!!exporting}
            onClick={copyImage}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting === 'copy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            Copy ảnh
          </button>
          <button
            type="button"
            disabled={!!exporting}
            onClick={exportPdf}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50"
          >
            {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Xuất PDF
          </button>
          <button
            type="button"
            disabled={saving || closing}
            onClick={submitReport}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {(saving || closing)
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />}
            {closed ? 'Nộp lại' : 'Nộp báo cáo'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Drawer chi tiết ─────────────────────────────────────────────────────────
function ReportDetailDrawer({ reportId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get(`/crm/daily-reports/${reportId}`);
        if (cancelled) return;
        setReport(data.report);
        setNote(data.report?.manager_note || '');
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || e.message || 'Lỗi tải');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reportId]);

  const saveNote = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/crm/daily-reports/${reportId}/manager-note`, { manager_note: note });
      setReport(data.report);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Lỗi lưu ghi chú');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <div className="font-semibold text-gray-900">Chi tiết báo cáo</div>
            <div className="text-xs text-gray-500">{fmtDMY(report?.report_date)}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải…</div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {report && (
            <>
              <div className="flex items-center gap-3">
                <Avatar user={report.user} size="h-10 w-10" />
                <div>
                  <div className="font-semibold">{report.user?.full_name}</div>
                  <div className="text-xs text-gray-500">{report.department_name || report.template?.name}</div>
                </div>
                <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ${(STATUS_META[report.status] || STATUS_META.draft).cls}`}>
                  {(STATUS_META[report.status] || STATUS_META.draft).label}
                </span>
              </div>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Công việc</th>
                      <th className="px-3 py-2 text-right">KH</th>
                      <th className="px-3 py-2 text-right">KQ</th>
                      <th className="px-3 py-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report.lines || []).map((l) => {
                      const pct = lineAchieve(l.plan_value, l.result_value);
                      return (
                        <tr key={l.id} className="border-t border-gray-100">
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-800">{l.label}</div>
                            {(l.result_note || l.plan_note) && (
                              <div className="mt-0.5 text-xs text-gray-500">{l.result_note || l.plan_note}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{l.plan_value ?? '—'}</td>
                          <td className={`px-3 py-2 text-right tabular-nums font-semibold ${Number(l.result_value) > 0 ? 'text-emerald-700' : 'text-gray-800'}`}>
                            {l.result_value ?? '—'}
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums font-medium ${achieveTone(pct)}`}>
                            {pct == null ? '—' : `${pct}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-gray-500">Ghi chú quản lý</div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  placeholder="Nhận xét / yêu cầu bổ sung…"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveNote}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Lưu ghi chú
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Team dashboard ──────────────────────────────────────────────────────────
function TeamPanel({ date, onDateChange }) {
  const { user } = useAuth();
  const showMatrix = isSystemAdmin(user);
  if (showMatrix) {
    return <TeamMatrixPanel date={date} onDateChange={onDateChange} />;
  }
  return <TeamListPanel date={date} onDateChange={onDateChange} />;
}

function TeamListPanel({ date, onDateChange }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [detailId, setDetailId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/crm/daily-reports/team', { params: { date } });
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Không tải được danh sách');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const all = data?.rows || [];
    if (filter === 'all') return all;
    if (filter === 'missing') return all.filter((r) => r.submit_state === 'missing' || r.submit_state === 'draft');
    if (filter === 'plan') return all.filter((r) => r.submit_state === 'plan_ok');
    if (filter === 'result') return all.filter((r) => r.submit_state === 'result_ok');
    return all;
  }, [data, filter]);

  const s = data?.summary || { total: 0, plan_ok: 0, result_ok: 0, missing: 0 };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onDateChange(addDaysISO(date, -1))} className="rounded-md border border-gray-200 p-1.5 hover:bg-gray-50">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
          <button type="button" onClick={() => onDateChange(addDaysISO(date, 1))} className="rounded-md border border-gray-200 p-1.5 hover:bg-gray-50">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onDateChange(todayISO())} className="ml-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs hover:bg-gray-50">
            Hôm nay
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: `Tất cả (${s.total})` },
            { id: 'missing', label: `Thiếu (${s.missing})` },
            { id: 'plan', label: `Có KH (${s.plan_ok})` },
            { id: 'result', label: `Đã chốt (${s.result_ok})` },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium border ${
                filter === f.id ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tải team…
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Nhân viên</th>
                <th className="px-3 py-2.5 text-left font-semibold">Bộ phận</th>
                <th className="px-3 py-2.5 text-center font-semibold">KH</th>
                <th className="px-3 py-2.5 text-center font-semibold">KQ</th>
                <th className="px-3 py-2.5 text-right font-semibold">% đạt</th>
                <th className="px-3 py-2.5 text-left font-semibold">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-gray-500">Không có nhân viên trong phạm vi xem</td>
                </tr>
              )}
              {rows.map((row) => {
                const meta = SUBMIT_META[row.submit_state] || SUBMIT_META.missing;
                const clickable = !!row.report_id;
                return (
                  <tr
                    key={row.user.id}
                    className={`border-t border-gray-100 ${clickable ? 'cursor-pointer hover:bg-indigo-50/40' : ''}`}
                    onClick={() => clickable && setDetailId(row.report_id)}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar user={row.user} />
                        <div>
                          <span className="font-medium text-gray-900">{row.user.full_name}</span>
                          <Link
                            to={`/crm/daily-reports/history?date=${date}&user_id=${row.user.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-0.5 block text-[11px] text-indigo-600 hover:underline"
                          >
                            Lịch sử ngày
                          </Link>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">{row.user.department_name || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-600">
                      {row.plan_submitted_at ? (
                        <span className="inline-flex items-center gap-1 text-sky-700"><Clock className="h-3.5 w-3.5" />{fmtTime(row.plan_submitted_at)}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-600">
                      {row.result_submitted_at ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700"><Clock className="h-3.5 w-3.5" />{fmtTime(row.result_submitted_at)}</span>
                      ) : '—'}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${achieveTone(row.achieve_pct)}`}>
                      {row.achieve_pct == null ? '—' : `${row.achieve_pct}%`}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailId && <ReportDetailDrawer reportId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function formatMatrixCell(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  if (Number.isFinite(n) && String(v).trim() !== '' && !Number.isNaN(n)) return n;
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 38)}…` : s;
}

function matrixCellValue(row, empId) {
  if (!row?.values) return null;
  const id = String(empId);
  if (Object.prototype.hasOwnProperty.call(row.values, id)) return row.values[id];
  if (Object.prototype.hasOwnProperty.call(row.values, empId)) return row.values[empId];
  return null;
}

/** Thang màu theo độ lớn số trong cùng hàng (0 → nhạt, max → đậm). */
function matrixHeatTone(value, rowMax) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return { kind: 'empty', cls: 'text-[11px] text-gray-400' };
  }
  const max = typeof rowMax === 'number' && rowMax > 0 ? rowMax : value;
  const ratio = Math.min(1, value / max);
  // 5 bậc: càng lớn càng đậm
  if (ratio <= 0.2) {
    return { kind: 'heat', cls: 'tabular-nums font-semibold text-emerald-700 bg-emerald-50' };
  }
  if (ratio <= 0.4) {
    return { kind: 'heat', cls: 'tabular-nums font-semibold text-emerald-800 bg-emerald-100' };
  }
  if (ratio <= 0.6) {
    return { kind: 'heat', cls: 'tabular-nums font-bold text-emerald-900 bg-emerald-200' };
  }
  if (ratio <= 0.8) {
    return { kind: 'heat', cls: 'tabular-nums text-base font-bold text-emerald-950 bg-emerald-300' };
  }
  return { kind: 'heat', cls: 'tabular-nums text-base font-bold text-white bg-emerald-600' };
}

function matrixRowMax(row, employees) {
  let max = 0;
  for (const emp of employees || []) {
    const display = formatMatrixCell(matrixCellValue(row, emp.id));
    if (typeof display === 'number' && display > max) max = display;
  }
  return max;
}

/** Công ty xưởng — không dùng cho báo cáo ngày CRM. */
function isCrmWorkshopCompany(company) {
  if (isLikelyEmptyCrmLeadCompany(company)) return true;
  const t = `${company?.name || ''} ${company?.short_name || ''}`.toLowerCase();
  return /hucabi|\bhcb\b|gia\s*công|xuong|xưởng/.test(t);
}

function companiesForDailyReportFilter(raw) {
  return sortCrmCompaniesForAdminFilter(normalizeCrmFilterCompanies(raw))
    .filter((c) => !isCrmWorkshopCompany(c));
}

/** Phòng ban thuộc khối CRM bán hàng (ẩn SX / VC / NS / KT…). */
function isCrmSalesDepartment(dept) {
  const t = String(dept?.name || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!t) return false;
  if (/san\s*xuat|van\s*chuyen|lap\s*dat|logistics|nhan\s*su|tai\s*chinh|ke\s*toan|kho\b|mua\s*hang|hanh\s*chinh/.test(t)) {
    return false;
  }
  return /cskh|cham\s*soc|kinh\s*doanh|sale|sales|marketing|thiet\s*ke|design|crm|tu\s*van/.test(t);
}

function departmentsForDailyReportFilter(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const crm = list.filter(isCrmSalesDepartment);
  // Nếu không khớp tên nào, giữ list gốc để không trống (công ty cấu hình khác)
  return (crm.length ? crm : list).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
}

const CRM_FILTER_FIELD = 'h-8 w-full min-w-0 px-2.5 bg-white border border-violet-200 rounded-md text-xs font-medium text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300/80 focus:border-violet-400 transition-shadow';
const CRM_FILTER_SELECT = `${CRM_FILTER_FIELD} cursor-pointer appearance-none pr-7`;
const CRM_FILTER_LABEL = 'text-[10px] font-semibold text-violet-800/90 uppercase tracking-wide mb-1 block';

const SECTION_TAB_META = [
  { key: 'all', label: 'Tất cả mục' },
  { key: 'plan', label: 'I. Kế hoạch', tone: 'sky' },
  { key: 'result', label: 'II. Kết quả', tone: 'violet' },
  { key: 'sharpen', label: 'III. Mài dao', tone: 'amber' },
  { key: 'proposal', label: 'IV. Đề xuất', tone: 'emerald' },
];

const SECTION_HEADER_CLS = {
  plan: 'bg-sky-700',
  result: 'bg-violet-700',
  sharpen: 'bg-amber-700',
  proposal: 'bg-emerald-700',
};

function EmployeeHeaderCells({ employees, onOpenReport, hoveredColId, sectionKey, rows }) {
  return employees.map((emp) => {
    const meta = matrixSectionBadge(sectionKey, emp, rows);
    const colHot = hoveredColId && String(hoveredColId) === String(emp.id);
    return (
      <th
        key={emp.id}
        className={`px-2 py-2 text-center font-semibold min-w-[110px] max-w-[140px] align-bottom border-l border-white/10 transition-colors ${
          colHot ? 'ring-2 ring-inset ring-amber-300 bg-black/20' : ''
        }`}
      >
        <button
          type="button"
          disabled={!emp.report_id}
          onClick={() => emp.report_id && onOpenReport(emp.report_id)}
          className={`w-full ${emp.report_id ? 'hover:text-amber-200 cursor-pointer' : 'cursor-default opacity-80'}`}
          title={`${emp.department_name || emp.email || ''} · ${meta.label}`}
        >
          <div className="mx-auto mb-1 flex justify-center">
            <Avatar user={emp} size="h-7 w-7" />
          </div>
          <div className="truncate text-[12px] leading-tight">{emp.full_name}</div>
          <div className={`mt-1 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${meta.cls}`}>
            {meta.label}
          </div>
        </button>
      </th>
    );
  });
}

/** Một bảng cho 1 mục (I/II/III/IV) × 1 mẫu. */
function MatrixSectionTable({
  section, employees, templateName, roleKey, reportDate, companyId, onOpenReport,
  templates, onAssignTemplate, assigningUserId,
}) {
  const headCls = SECTION_HEADER_CLS[section.key] || 'bg-slate-800';
  const rows = section.rows || [];
  const cols = (section.key === 'result' || section.key === 'plan')
    ? (employees || [])
    : (employees || []).filter((e) => e.report_id);
  const showCols = cols.length ? cols : (employees || []);
  const [hover, setHover] = useState({ rowKey: null, colId: null });
  const [picked, setPicked] = useState(null); // { row, emp, display }
  const [links, setLinks] = useState({ loading: false, error: '', items: [], meta: null });
  const [showAssign, setShowAssign] = useState(false);

  const clearHover = () => setHover({ rowKey: null, colId: null });

  const resolveMetricKey = (row) => {
    if (row?.metric_key) return String(row.metric_key);
    const k = String(row?.key || '');
    const idx = k.indexOf(':');
    if (idx < 0) return '';
    const rest = k.slice(idx + 1);
    if (rest.startsWith('label:')) return '';
    return rest;
  };

  const openCellLinks = async (row, emp, display) => {
    const metricKey = resolveMetricKey(row);
    setPicked({ row, emp, display, metricKey });
    if (!metricKey || !reportDate || !emp?.id) {
      setLinks({ loading: false, error: 'Ô này không có metric CRM để lần ra lead/deal', items: [], meta: null });
      return;
    }
    if (section.key !== 'result' && section.key !== 'plan') {
      setLinks({ loading: false, error: 'Chỉ mục I/II có liên kết CRM tự động', items: [], meta: null });
      return;
    }
    setLinks({ loading: true, error: '', items: [], meta: null });
    try {
      const { data } = await api.get('/crm/daily-reports/team/matrix-cell-links', {
        params: {
          date: reportDate,
          user_id: emp.id,
          metric_key: metricKey,
          role_key: roleKey || emp.role_key || 'sale_admin',
          section: section.key,
          company_id: companyId || undefined,
        },
        headers: { 'x-no-cache': '1' },
      });
      setLinks({
        loading: false,
        error: '',
        items: data?.items || [],
        meta: data,
      });
    } catch (e) {
      setLinks({
        loading: false,
        error: e?.response?.data?.error || e.message || 'Không tải được liên kết',
        items: [],
        meta: null,
      });
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className={`px-4 py-2.5 text-white ${headCls}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-bold tracking-wide">{section.title}</div>
            {templateName && (
              <div className="mt-0.5 text-[11px] font-medium text-white/85">Mẫu: {templateName}</div>
            )}
            {hover.rowKey && hover.colId && !picked && (
              <div className="mt-1 text-[11px] font-medium text-amber-100">
                {rows.find((r) => r.key === hover.rowKey)?.label || '—'}
                {' · '}
                {showCols.find((e) => String(e.id) === String(hover.colId))?.full_name || '—'}
                {': '}
                <span className="font-bold text-white">
                  {formatMatrixCell(matrixCellValue(rows.find((r) => r.key === hover.rowKey), hover.colId))}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[11px] text-white/80">
              {showCols.length} nhân viên{section.key === 'result' ? '' : ' có phiếu'}
            </div>
            {onAssignTemplate && (
              <button
                type="button"
                onClick={() => setShowAssign((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-md border border-white/25 px-2 py-1 text-[11px] font-semibold transition-colors ${
                  showAssign ? 'bg-white text-violet-900' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                title="Gán mẫu báo cáo cho từng nhân viên trong nhóm này"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" /> Gán mẫu
              </button>
            )}
          </div>
        </div>

        {showAssign && onAssignTemplate && (
          <div className="mt-2 rounded-lg border border-white/20 bg-black/20 px-3 py-2">
            <div className="text-[11px] text-white/85">
              Nhân viên bị xếp sai nhóm thì chọn đúng mẫu ở đây. Đổi mẫu sẽ chuyển họ sang bảng của
              mẫu đó và cập nhật cả những phiếu đã lưu trước đó.
            </div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {(employees || []).map((emp) => (
                <div key={emp.id} className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium" title={emp.email || ''}>
                    {emp.full_name}
                  </span>
                  <select
                    value={emp.assigned_template_id || ''}
                    disabled={String(assigningUserId || '') === String(emp.id)}
                    onChange={(e) => onAssignTemplate(emp, e.target.value)}
                    className="max-w-[160px] shrink-0 rounded-md border border-white/25 bg-white px-1.5 py-1 text-[11px] font-medium text-gray-900 disabled:opacity-60"
                  >
                    <option value="">
                      Tự động{emp.template_name ? ` (đang là ${emp.template_name})` : ''}
                    </option>
                    {(templates || []).filter((t) => t.id).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {picked && (
          <div className="mt-2 rounded-lg border border-white/20 bg-black/20 px-3 py-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 text-[12px]">
                <span className="font-semibold text-amber-100">{picked.row?.label}</span>
                <span className="text-white/70"> · </span>
                <span className="font-semibold">{picked.emp?.full_name}</span>
                <span className="text-white/70"> = </span>
                <span className="font-bold text-white">{picked.display}</span>
                {links.meta?.crm_date && (
                  <span className="ml-2 text-[11px] text-white/70">
                    (CRM {fmtDMY(links.meta.crm_date)})
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setPicked(null); setLinks({ loading: false, error: '', items: [], meta: null }); }}
                className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-medium hover:bg-white/20"
              >
                <X className="h-3 w-3" /> Đóng
              </button>
            </div>
            {links.loading && (
              <div className="mt-2 flex items-center gap-2 text-[11px] text-white/80">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải lead/deal liên quan…
              </div>
            )}
            {!links.loading && links.error && (
              <div className="mt-2 text-[11px] text-amber-100">{links.error}</div>
            )}
            {!links.loading && !links.error && links.items.length === 0 && (
              <div className="mt-2 text-[11px] text-white/75">
                Không tìm thấy lead/deal liên quan (số liệu có thể nhập tay hoặc nguồn CRM đã đổi).
              </div>
            )}
            {!links.loading && links.items.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {links.items.map((it) => (
                  <Link
                    key={it.id}
                    to={it.path || `/crm/leads/${it.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-white/25 bg-white/10 px-2 py-1 text-[11px] font-medium text-white hover:bg-white/20"
                    title={it.stage_name || ''}
                  >
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-80" />
                    <span className="truncate">
                      <span className="opacity-80">{it.type === 'deal' ? 'Deal' : 'Lead'}</span>
                      {' '}
                      {it.code || it.id.slice(0, 8)}
                      {it.name ? ` · ${it.name}` : ''}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="overflow-auto" onMouseLeave={clearHover}>
        <table className="min-w-max border-collapse text-sm">
          <thead className="sticky top-0 z-20">
            <tr className={`${headCls} text-white`}>
              <th className={`sticky left-0 z-30 px-3 py-2.5 text-left font-semibold min-w-[220px] border-r border-white/10 ${headCls}`}>
                Nội dung
              </th>
              <EmployeeHeaderCells
                employees={showCols}
                onOpenReport={onOpenReport}
                hoveredColId={hover.colId}
                sectionKey={section.key}
                rows={rows}
              />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-gray-100">
                <td className="sticky left-0 z-10 bg-white px-3 py-6 text-center text-gray-400 border-r border-gray-100" colSpan={showCols.length + 1}>
                  {section.key === 'plan'
                    ? 'Chưa có kế hoạch (Phần I) — số liệu chốt nằm ở mục II. Kết quả'
                    : section.key === 'result'
                      ? 'Chưa có số liệu CRM cho ngày đang chọn'
                      : 'Chưa có dữ liệu mục này'}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const rowHot = hover.rowKey === row.key;
                const rowMax = matrixRowMax(row, showCols);
                const pickedRow = picked?.row?.key === row.key;
                return (
                  <tr key={row.key} className="border-t border-gray-100">
                    <td
                      className={`sticky left-0 z-10 px-3 py-2 font-medium border-r border-gray-100 transition-colors ${
                        rowHot || pickedRow
                          ? 'bg-violet-100 text-violet-950'
                          : 'bg-white text-gray-800'
                      }`}
                    >
                      <span className="mr-2 text-xs text-gray-400">{idx + 1}</span>
                      {row.label}
                    </td>
                    {showCols.map((emp) => {
                      const raw = matrixCellValue(row, emp.id);
                      const display = formatMatrixCell(raw);
                      const isNum = typeof display === 'number';
                      const tone = isNum
                        ? (display > 0
                          ? matrixHeatTone(display, rowMax)
                          : { kind: 'zero', cls: 'tabular-nums font-semibold text-gray-400' })
                        : { kind: 'empty', cls: 'text-[11px] text-gray-400' };
                      const colHot = hover.colId && String(hover.colId) === String(emp.id);
                      const cellHot = rowHot && colHot;
                      const cross = rowHot || colHot;
                      const isPicked = pickedRow && picked?.emp && String(picked.emp.id) === String(emp.id);
                      const canDrill = isNum && display > 0 && !!resolveMetricKey(row);
                      return (
                        <td
                          key={emp.id}
                          onMouseEnter={() => setHover({ rowKey: row.key, colId: emp.id })}
                          onClick={() => {
                            if (!canDrill) return;
                            openCellLinks(row, emp, display);
                          }}
                          className={`px-2 py-2 text-center border-l border-gray-50 transition-colors ${tone.cls} ${
                            canDrill ? 'cursor-pointer' : 'cursor-crosshair'
                          } ${
                            isPicked
                              ? 'ring-2 ring-inset ring-amber-400'
                              : cellHot
                                ? 'ring-2 ring-inset ring-violet-500 brightness-95'
                                : cross
                                  ? 'ring-1 ring-inset ring-violet-300/80'
                                  : ''
                          }`}
                          title={
                            canDrill
                              ? `${row.label} · ${emp.full_name}: ${raw} — bấm để xem lead/deal`
                              : `${row.label} · ${emp.full_name}: ${raw != null && raw !== '' ? raw : '—'}`
                          }
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamMatrixPanel({ date, onDateChange }) {
  const { user } = useAuth();
  const lockedCompany = isCompanyScopedAdmin(user) ? String(user.company_id) : null;
  const [filter, setFilter] = useState(() => ({
    companyId: lockedCompany || getStoredCrmFilterCompanyId() || '',
    departmentId: '',
    roleKey: '',
    q: '',
  }));
  const [sectionTab, setSectionTab] = useState('result');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [assigningUserId, setAssigningUserId] = useState('');

  useEffect(() => {
    if (lockedCompany) return undefined;
    let cancelled = false;
    api.get('/companies', { params: { for_module: 'crm' }, headers: { 'x-no-cache': '1' } })
      .then((r) => {
        if (cancelled) return;
        const list = companiesForDailyReportFilter(r.data?.companies || r.data || []);
        setCompanies(list);
        setFilter((prev) => {
          const stillValid = prev.companyId && list.some((c) => String(c.id) === String(prev.companyId));
          if (stillValid) return prev;
          const def = resolveDefaultCrmAdminCompanyId(list) || (list[0]?.id ? String(list[0].id) : '');
          if (def) setStoredCrmFilterCompanyId(def);
          return { ...prev, companyId: def, departmentId: '' };
        });
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      });
    return () => { cancelled = true; };
  }, [lockedCompany]);

  const companyId = lockedCompany || filter.companyId;

  useEffect(() => {
    if (!companyId) {
      setDepartments([]);
      return undefined;
    }
    let cancelled = false;
    api.get('/departments', { params: { company_id: companyId } })
      .then((r) => {
        if (cancelled) return;
        const list = departmentsForDailyReportFilter(r.data?.departments || r.data || []);
        setDepartments(list);
        setFilter((prev) => {
          if (!prev.departmentId) return prev;
          const ok = list.some((d) => String(d.id) === String(prev.departmentId));
          return ok ? prev : { ...prev, departmentId: '' };
        });
      })
      .catch(() => { if (!cancelled) setDepartments([]); });
    return () => { cancelled = true; };
  }, [companyId]);

  const patchFilter = (patch) => {
    setFilter((prev) => {
      const next = { ...prev, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'companyId') && patch.companyId !== prev.companyId) {
        next.departmentId = '';
        next.roleKey = '';
      }
      if (!lockedCompany && Object.prototype.hasOwnProperty.call(patch, 'companyId')) {
        setStoredCrmFilterCompanyId(patch.companyId || '');
      }
      return next;
    });
  };

  const load = useCallback(async () => {
    if (!companyId) {
      setData(null);
      setError('');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/crm/daily-reports/team/matrix', {
        params: {
          date,
          company_id: companyId,
          department_id: filter.departmentId || undefined,
          role_key: filter.roleKey || undefined,
          q: filter.q || undefined,
        },
        headers: { 'x-no-cache': '1' },
      });
      setData(res.data);
      if (res.data?.templates) setTemplates(res.data.templates);
      if (res.data?.departments?.length) {
        const list = departmentsForDailyReportFilter(res.data.departments);
        setDepartments(list);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Không tải được bảng tổng hợp');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date, companyId, filter.departmentId, filter.roleKey, filter.q]);

  useEffect(() => { load(); }, [load]);

  const assignTemplate = async (emp, templateId) => {
    if (!emp?.id || assigningUserId) return;
    setAssigningUserId(String(emp.id));
    setError('');
    try {
      await api.put('/crm/daily-reports/team/assign-template', {
        user_id: emp.id,
        template_id: templateId || null,
        company_id: companyId || undefined,
      });
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Gán mẫu báo cáo thất bại');
    } finally {
      setAssigningUserId('');
    }
  };

  const groups = data?.groups || [];
  const s = data?.summary || { total: 0, with_report: 0, plan_ok: 0, result_ok: 0, missing: 0 };
  const tplOptions = templates.length ? templates : (data?.templates || []);

  /** Flatten: từng mục → danh sách { section, group } để render theo phần. */
  const companyName = companies.find((c) => String(c.id) === String(companyId))?.short_name
    || companies.find((c) => String(c.id) === String(companyId))?.name
    || '';
  const departmentName = departments.find((d) => String(d.id) === String(filter.departmentId))?.name || '';
  const roleLabel = tplOptions.find((t) => String(t.role_key || t.id) === String(filter.roleKey))?.name || '';

  const exportExcel = async () => {
    if (!groups.length || exportingExcel) return;
    setExportingExcel(true);
    setError('');
    try {
      await downloadDailyReportMatrixExcel({
        date,
        companyName,
        departmentName,
        roleLabel,
        summary: s,
        groups,
      });
    } catch (e) {
      setError(e?.message || 'Xuất Excel thất bại');
    } finally {
      setExportingExcel(false);
    }
  };

  const sectionBlocks = useMemo(() => {
    const keys = sectionTab === 'all'
      ? ['plan', 'result', 'sharpen', 'proposal']
      : [sectionTab];
    const blocks = [];
    for (const key of keys) {
      for (const g of groups) {
        const section = (g.sections || []).find((sec) => sec.key === key);
        if (!section) continue;
        blocks.push({
          id: `${key}:${g.template_id || g.role_key}`,
          section,
          employees: g.employees || [],
          templateName: g.template_name,
          roleKey: g.role_key,
        });
      }
    }
    return blocks;
  }, [groups, sectionTab]);

  return (
    <div className="space-y-4">
      {/* Bộ lọc — style CRM */}
      <div className="overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-violet-100 bg-violet-50/70 px-3 py-2">
          <Filter className="h-4 w-4 shrink-0 text-violet-600" />
          <p className="text-sm font-bold text-violet-950 tracking-tight">Bộ lọc</p>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => onDateChange(addDaysISO(date, -1))} className="rounded-md border border-violet-200 bg-white p-1.5 text-violet-700 hover:bg-violet-50">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className={`${CRM_FILTER_FIELD} w-auto`}
            />
            <button type="button" onClick={() => onDateChange(addDaysISO(date, 1))} className="rounded-md border border-violet-200 bg-white p-1.5 text-violet-700 hover:bg-violet-50">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => onDateChange(todayISO())} className="rounded-md border border-violet-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-violet-800 hover:bg-violet-50">
              Hôm nay
            </button>
          </div>
        </div>
        <div className="px-3 py-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="min-w-0">
              <label className={CRM_FILTER_LABEL}>Công ty</label>
              {lockedCompany ? (
                <div className={`${CRM_FILTER_FIELD} flex items-center bg-indigo-50/80 border-indigo-200 text-indigo-900 cursor-default truncate`}>
                  {companies.find((c) => String(c.id) === String(lockedCompany))?.short_name
                    || companies.find((c) => String(c.id) === String(lockedCompany))?.name
                    || 'Công ty của bạn'}
                </div>
              ) : (
                <select
                  value={filter.companyId}
                  onChange={(e) => patchFilter({ companyId: e.target.value })}
                  className={CRM_FILTER_SELECT}
                >
                  <option value="">— Chọn công ty —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="min-w-0">
              <label className={CRM_FILTER_LABEL}>Phòng ban</label>
              <select
                value={filter.departmentId}
                onChange={(e) => patchFilter({ departmentId: e.target.value })}
                disabled={!companyId}
                className={`${CRM_FILTER_SELECT} ${!companyId ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <option value="">{companyId ? 'Tất cả phòng ban' : 'Chọn công ty trước'}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className={CRM_FILTER_LABEL}>Mẫu báo cáo</label>
              <select
                value={filter.roleKey}
                onChange={(e) => patchFilter({ roleKey: e.target.value })}
                disabled={!companyId}
                className={`${CRM_FILTER_SELECT} ${!companyId ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <option value="">Tất cả mẫu</option>
                {tplOptions.map((t) => (
                  <option key={t.id || t.role_key} value={t.role_key || t.id}>
                    {t.name}{t.company_id ? ' · công ty' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className={CRM_FILTER_LABEL}>Tìm nhân viên</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-violet-400" />
                <input
                  type="search"
                  value={filter.q}
                  onChange={(e) => patchFilter({ q: e.target.value })}
                  placeholder="Tên / email…"
                  className={`${CRM_FILTER_FIELD} pl-7`}
                />
              </div>
            </div>
          </div>
          <div className="text-[11px] text-violet-700/80">
            Ngày đang chọn {fmtDMY(date)} · Tab Kết quả đếm đúng CRM ngày này
            {data?.result_live ? ' (lấy trực tiếp từ CRM)' : ''}
          </div>
        </div>
      </div>

      {/* Tab theo từng mục I–IV */}
      {companyId && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5 rounded-xl border border-violet-200 bg-white p-1.5 shadow-sm">
            {SECTION_TAB_META.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSectionTab(tab.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  sectionTab === tab.key
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-violet-800/80 hover:bg-violet-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!groups.length || loading || exportingExcel}
            onClick={exportExcel}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            title="Xuất Excel tab Kế hoạch và Kết quả (kèm tổng quan + so sánh KH/KQ)"
          >
            {exportingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sheet className="h-4 w-4" />}
            Xuất Excel KH + KQ
          </button>
        </div>
      )}

      {!companyId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Chọn công ty để xem bảng tổng hợp theo từng mục I–IV.
          {companies.length === 0 && isSystemAdmin(user) ? ' Đang tải danh sách công ty…' : null}
        </div>
      )}

      {companyId && (sectionTab === 'result' || sectionTab === 'all') && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-950">
          <strong>II. Kết quả</strong> là số CRM của <strong>đúng ngày đang chọn</strong>
          ({fmtDMY(data?.result_date || date)}).
          Muốn xem ngày 13/08 thì chọn <strong>13/08/2026</strong> trên bộ lọc — không cần chờ 08:00 / 16:45.
        </div>
      )}

      {companyId && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-violet-100 bg-white p-3 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700/80">Nhân viên</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">{s.total}</div>
          </div>
          <div className="rounded-xl border border-violet-100 bg-white p-3 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700/80">Có phiếu</div>
            <div className="mt-1 text-2xl font-semibold text-sky-700">{s.with_report}</div>
          </div>
          <div className="rounded-xl border border-violet-100 bg-white p-3 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700/80">Đã chốt KQ</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-700">{s.result_ok}</div>
          </div>
          <div className="rounded-xl border border-violet-100 bg-white p-3 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700/80">Thiếu / nháp</div>
            <div className="mt-1 text-2xl font-semibold text-red-600">{s.missing}</div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tải bảng tổng hợp…
        </div>
      ) : companyId && sectionBlocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-violet-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
          Không có nhân viên / báo cáo khớp bộ lọc
        </div>
      ) : companyId ? (
        <div className="space-y-4">
          {sectionBlocks.map((block) => (
            <MatrixSectionTable
              key={block.id}
              section={block.section}
              employees={block.employees}
              templateName={block.templateName}
              roleKey={block.roleKey}
              reportDate={date}
              companyId={companyId}
              onOpenReport={setDetailId}
              templates={tplOptions}
              onAssignTemplate={assignTemplate}
              assigningUserId={assigningUserId}
            />
          ))}
        </div>
      ) : null}

      {detailId && <ReportDetailDrawer reportId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

export default function CrmDailyReportPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('mine');
  const [date, setDate] = useState(todayISO());
  const canSeeTongHop = isSystemAdmin(user);
  const wideTeam = canSeeTongHop && tab === 'team';

  useEffect(() => {
    if (canSeeTongHop) setTab('team');
  }, [canSeeTongHop]);

  useEffect(() => {
    if (!canSeeTongHop && tab === 'team') setTab('mine');
  }, [canSeeTongHop, tab]);

  return (
    <div className={`mx-auto space-y-4 p-4 sm:p-6 ${wideTeam ? 'max-w-[1400px]' : 'max-w-6xl'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl">
            <CalendarDays className="h-6 w-6 text-indigo-600" />
            Báo cáo hằng ngày
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {wideTeam
              ? 'Tổng hợp theo từng mục I–IV (và theo mẫu) — cột là nhân viên.'
              : 'Điền kế hoạch (Phần I) · Nộp báo cáo để chốt kết quả CRM ngày phiếu (Phần II, tự chốt 16:45).'}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => setTab('mine')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === 'mine' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <ClipboardCheck className="h-4 w-4" /> Báo cáo của tôi
          </button>
          {canSeeTongHop && (
            <button
              type="button"
              onClick={() => setTab('team')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === 'team' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Users className="h-4 w-4" /> Tổng hợp
            </button>
          )}
        </div>
      </div>

      {tab === 'mine' ? (
        <MyReportPanel date={date} onDateChange={setDate} />
      ) : canSeeTongHop ? (
        <TeamPanel date={date} onDateChange={setDate} />
      ) : (
        <MyReportPanel date={date} onDateChange={setDate} />
      )}
    </div>
  );
}
