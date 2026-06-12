// Trang Kế hoạch phòng ban (CRM) — trình bày theo mẫu Excel "KH tuần":
// mỗi tuần là 1 sheet, mỗi nhiệm vụ là 1 dòng có Bắt đầu → Kết thúc (mini-Gantt
// T2→CN), KPI, nơi thực hiện, tần suất, trạng thái, tiến độ; cuối sheet có mục
// "Tổng kết tuần". Kèm lịch tháng và báo cáo tiến độ. API: /api/crm/dept-plans/*
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar, CalendarRange, BarChart3, ChevronLeft, ChevronRight, Plus, Trash2,
  Loader2, X, AlertTriangle, Users, ClipboardCheck, Save, FileUp, Filter,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isCrmModuleAdmin, normalizeRole } from '../lib/adminRole';

// ─── Date helpers (local time, YYYY-MM-DD) ────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayISO = () => toISO(new Date());

function weekStartOf(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return toISO(d);
}

function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function diffDays(a, b) {
  return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);
}

const fmtDM = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fmtDMY = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const DOW_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const STATUS_META = {
  planned: { label: 'Chưa làm', badge: 'bg-gray-100 text-gray-600', gantt: 'bg-gray-300' },
  in_progress: { label: 'Đang làm', badge: 'bg-blue-100 text-blue-700', gantt: 'bg-blue-400' },
  done: { label: 'Hoàn thành', badge: 'bg-emerald-100 text-emerald-700', gantt: 'bg-emerald-400' },
  cancelled: { label: 'Đã huỷ', badge: 'bg-gray-100 text-gray-400 line-through', gantt: 'bg-gray-200' },
};

// Nhãn ưu tiên theo mẫu Excel
const PRIORITY_META = {
  urgent: { label: 'Gấp - quan trọng', cls: 'bg-red-50 text-red-700 border-red-200' },
  high: { label: 'Quan trọng - không gấp', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  normal: { label: 'Bình thường', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  low: { label: 'Thấp', cls: 'bg-gray-50 text-gray-400 border-gray-200' },
};

const isOverdueTask = (t) =>
  t.status !== 'done' && t.status !== 'cancelled' && t.end_date && t.end_date < todayISO();

function Avatar({ user, size = 'h-7 w-7' }) {
  const name = user?.full_name || '?';
  if (user?.avatar) {
    return <img src={user.avatar} alt={name} title={name} className={`${size} rounded-full object-cover shrink-0`} />;
  }
  const initials = name.split(' ').filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span
      title={name}
      className={`${size} rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold shrink-0`}
    >
      {initials || '?'}
    </span>
  );
}

// ─── Modal sửa nhiệm vụ ───────────────────────────────────────────────────────
function TaskModal({ task, members, canManage, ownUserId, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    task_group: task.task_group || '',
    title: task.title,
    description: task.description || '',
    kpi: task.kpi || '',
    location: task.location || '',
    frequency: task.frequency || '',
    user_id: task.user_id,
    start_date: task.start_date,
    end_date: task.end_date,
    status: task.status,
    progress: task.progress ?? 0,
    priority: task.priority,
    result_note: task.result_note || '',
  });
  const [saving, setSaving] = useState(false);
  const editable = canManage || String(task.user_id) === String(ownUserId);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSave(task.id, {
        task_group: form.task_group || null,
        title: form.title.trim(),
        description: form.description || null,
        kpi: form.kpi || null,
        location: form.location || null,
        frequency: form.frequency || null,
        user_id: form.user_id,
        start_date: form.start_date,
        end_date: form.end_date,
        status: form.status,
        progress: Number(form.progress) || 0,
        priority: form.priority,
        result_note: form.result_note || null,
      });
      onClose();
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi lưu nhiệm vụ');
    }
    setSaving(false);
  };

  const inputCls = 'w-full border-2 border-gray-200 rounded-lg px-3.5 py-2.5 text-base text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 disabled:bg-gray-50 disabled:text-gray-400';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <h3 className="font-bold text-lg text-gray-900">Chi tiết nhiệm vụ</h3>
          <button onClick={onClose} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nhóm đầu việc</label>
              <input className={inputCls} value={form.task_group} disabled={!editable} onChange={(e) => set('task_group', e.target.value)} placeholder="VD: Xây dựng kênh MXH" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">KPI</label>
              <input className={inputCls} value={form.kpi} disabled={!editable} onChange={(e) => set('kpi', e.target.value)} placeholder="VD: 9 bài viết/tuần" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Đầu công việc</label>
            <input className={inputCls} value={form.title} disabled={!editable} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Hành động cụ thể</label>
            <textarea className={inputCls} rows={3} value={form.description} disabled={!editable} onChange={(e) => set('description', e.target.value)} placeholder={'1. …\n2. …'} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Mức ưu tiên</label>
              <select className={inputCls} value={form.priority} disabled={!editable} onChange={(e) => set('priority', e.target.value)}>
                {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nơi thực hiện</label>
              <input className={inputCls} value={form.location} disabled={!editable} onChange={(e) => set('location', e.target.value)} placeholder="Văn phòng, Nhà máy…" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tần suất</label>
              <input className={inputCls} value={form.frequency} disabled={!editable} onChange={(e) => set('frequency', e.target.value)} placeholder="Theo ngày, Theo tuần…" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Người thực hiện</label>
              <select className={inputCls} value={form.user_id} disabled={!canManage} onChange={(e) => set('user_id', e.target.value)}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Bắt đầu</label>
              <input type="date" className={inputCls} value={form.start_date || ''} disabled={!editable}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, start_date: v, end_date: f.end_date && f.end_date < v ? v : f.end_date }));
                }} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Kết thúc</label>
              <input type="date" className={inputCls} value={form.end_date || ''} min={form.start_date || undefined} disabled={!editable} onChange={(e) => set('end_date', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Trạng thái</label>
              <select className={inputCls} value={form.status} disabled={!editable} onChange={(e) => set('status', e.target.value)}>
                {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tiến độ: {form.progress}%</label>
              <input
                type="range" min={0} max={100} step={5} value={form.progress} disabled={!editable}
                className="w-full h-2 accent-indigo-600"
                onChange={(e) => set('progress', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Ghi chú kết quả</label>
            <textarea className={inputCls} rows={2} value={form.result_note} disabled={!editable} onChange={(e) => set('result_note', e.target.value)} placeholder="Kết quả thực hiện, vướng mắc…" />
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 sticky bottom-0 bg-white">
          {editable ? (
            <button
              onClick={() => { if (confirm('Xoá nhiệm vụ này?')) { onDelete(task.id); onClose(); } }}
              className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" /> Xoá
            </button>
          ) : <span className="text-xs text-gray-400">Chỉ xem — nhiệm vụ của người khác</span>}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-5 py-2.5 text-[15px] font-medium rounded-lg border border-gray-400 hover:bg-gray-50">Đóng</button>
            {editable && (
              <button onClick={submit} disabled={saving} className="px-5 py-2.5 text-[15px] font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Đang lưu…' : 'Lưu'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tổng kết tuần ───────────────────────────────────────────────────────────
const SUMMARY_FIELDS = [
  { key: 'result', label: 'Kết quả thực hiện', placeholder: 'Số lượng sản phẩm thực hiện: …' },
  { key: 'review', label: 'Đánh giá', placeholder: 'Chất lượng công việc, điểm tốt / cần cải thiện…' },
  { key: 'issues', label: 'Vấn đề tồn đọng', placeholder: 'Khó khăn, việc chưa xong…' },
  { key: 'proposals', label: 'Đề xuất', placeholder: 'Giải pháp, đề xuất cho tuần sau…' },
];

function WeekSummary({ sheet, onSave }) {
  const [form, setForm] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s = sheet?.summary || {};
    setForm({ result: s.result || '', review: s.review || '', issues: s.issues || '', proposals: s.proposals || '' });
    setDirty(false);
  }, [sheet?.id, sheet?.summary]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ summary: form });
      setDirty(false);
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi lưu tổng kết');
    }
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-amber-50/70 border-b border-amber-100">
        <div className="flex items-center gap-2 text-base font-bold text-gray-800">
          <ClipboardCheck className="h-5 w-5 text-amber-600" /> Tổng kết tuần
        </div>
        {dirty && (
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? 'Đang lưu…' : 'Lưu tổng kết'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        {SUMMARY_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">{f.label}</label>
            <textarea
              rows={3}
              value={form[f.key] || ''}
              placeholder={f.placeholder}
              onChange={(e) => { setForm((cur) => ({ ...cur, [f.key]: e.target.value })); setDirty(true); }}
              className="w-full border-2 border-gray-200 rounded-lg px-3.5 py-2.5 text-base text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Form thêm nhanh nhiệm vụ (dòng cuối bảng) ───────────────────────────────
function QuickAddRow({ members, canManage, ownUserId, weekStart, onAdd, colSpan }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [userId, setUserId] = useState(ownUserId);
  const [startDate, setStartDate] = useState(weekStart);
  const [endDate, setEndDate] = useState(weekStart);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setStartDate(weekStart); setEndDate(weekStart); }, [weekStart]);

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await onAdd({
        title: title.trim(),
        user_id: canManage ? userId : ownUserId,
        start_date: startDate,
        end_date: endDate < startDate ? startDate : endDate,
      });
      setTitle('');
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi tạo nhiệm vụ');
    }
    setBusy(false);
  };

  if (!open) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-3 py-2.5">
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 text-sm font-medium text-indigo-500 hover:text-indigo-700">
            <Plus className="h-4 w-4" /> Thêm đầu công việc
          </button>
        </td>
      </tr>
    );
  }
  return (
    <tr className="bg-indigo-50/40">
      <td colSpan={colSpan} className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
            placeholder="Nhập đầu công việc…"
            className="flex-1 min-w-[220px] text-base border-2 border-indigo-200 rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 bg-white"
          />
          {canManage && (
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="text-sm border-2 border-gray-200 rounded-lg px-2.5 py-2.5 bg-white max-w-[170px]">
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          )}
          <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }}
            className="text-sm border-2 border-gray-200 rounded-lg px-2.5 py-2 bg-white" />
          <span className="text-gray-400 text-sm">→</span>
          <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)}
            className="text-sm border-2 border-gray-200 rounded-lg px-2.5 py-2 bg-white" />
          <button onClick={submit} disabled={busy || !title.trim()} className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
            Thêm
          </button>
          <button onClick={() => setOpen(false)} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Nhập kế hoạch từ Excel ──────────────────────────────────────────────────
// Đọc file theo mẫu "KH tuần": tự tìm dòng tiêu đề chứa "Đầu công việc" và map
// các cột KPI / Hành động cụ thể / Mức ưu tiên / Nơi thực hiện / Người thực hiện /
// Tần suất / Bắt đầu / Kết thúc / Trạng thái / Tiến độ.
const normVi = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().trim();

function excelCellToISO(v, fallbackYear) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 60000) {
    // Số serial Excel (epoch 1900) → ngày UTC
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (m) {
    let yy = m[3] ? Number(m[3]) : fallbackYear;
    if (yy < 100) yy += 2000;
    return `${yy}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`;
  }
  return null;
}

function parsePriorityVi(v) {
  const n = normVi(v);
  if (!n) return 'normal';
  if (n.includes('gap') && n.includes('quan trong')) return 'urgent';
  if (n.includes('quan trong')) return 'high';
  if (n.includes('thap')) return 'low';
  return 'normal';
}

function parseStatusVi(v) {
  const n = normVi(v);
  if (n.includes('hoan thanh') || n.includes('done')) return 'done';
  if (n.includes('dang')) return 'in_progress';
  if (n.includes('huy')) return 'cancelled';
  return 'planned';
}

function parseProgressVi(v) {
  if (v == null || v === '') return 0;
  let n = typeof v === 'number' ? v : Number(String(v).replace('%', '').replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  if (n > 0 && n <= 1) n *= 100;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function parsePlanSheet(XLSX, wb, sheetName, { weekStart, members }) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return { error: 'Không đọc được sheet' };
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const fallbackYear = Number(weekStart.slice(0, 4));

  // Tìm dòng tiêu đề chứa "Đầu công việc"
  let headerIdx = -1;
  let cells = [];
  for (let i = 0; i < Math.min(grid.length, 40); i++) {
    const row = (grid[i] || []).map(normVi);
    if (row.some((c) => c.includes('dau cong viec'))) { headerIdx = i; cells = row; break; }
  }
  if (headerIdx < 0) {
    return { error: 'Không tìm thấy cột "Đầu công việc" trong sheet này. Hãy chọn sheet kế hoạch tuần (vd: "Tuần 1").' };
  }
  const findCol = (...keys) => cells.findIndex((c) => c && keys.some((k) => c.includes(k)));
  const cols = {
    title: cells.findIndex((c) => c.includes('dau cong viec')),
    kpi: findCol('kpi'),
    description: findCol('hanh dong'),
    priority: findCol('uu tien'),
    location: findCol('noi thuc hien'),
    assignee: findCol('nguoi thuc hien'),
    frequency: findCol('tan suat'),
    start: findCol('bat dau'),
    end: findCol('ket thuc'),
    status: findCol('trang thai'),
    progress: findCol('tien do'),
  };
  // Nhóm đầu việc: ô tiêu đề không rỗng bên trái cột "Đầu công việc" (vd "XÂY DỰNG KÊNH MXH")
  let sheetGroup = '';
  for (let j = cols.title - 1; j >= 0; j--) {
    const raw = grid[headerIdx][j];
    const n = normVi(raw);
    if (n && n !== 'stt') { sheetGroup = String(raw).trim(); break; }
  }

  const matchMember = (name) => {
    const n = normVi(name);
    if (!n) return null;
    return members.find((m) => normVi(m.full_name) === n)
      || members.find((m) => normVi(m.full_name).includes(n) || n.includes(normVi(m.full_name)))
      || null;
  };

  const get = (row, idx) => (idx >= 0 ? row[idx] : '');
  const rows = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const row = grid[i] || [];
    const title = String(get(row, cols.title) || '').trim();
    if (!title) continue;
    const nTitle = normVi(title);
    if (nTitle.startsWith('tong ket') || nTitle.startsWith('danh gia')) break; // phần tổng kết cuối sheet
    const startISO = excelCellToISO(get(row, cols.start), fallbackYear) || weekStart;
    let endISO = excelCellToISO(get(row, cols.end), fallbackYear) || startISO;
    if (endISO < startISO) endISO = startISO;
    const assigneeName = String(get(row, cols.assignee) || '').trim();
    const matched = matchMember(assigneeName);
    rows.push({
      task_group: sheetGroup || null,
      title,
      kpi: String(get(row, cols.kpi) || '').trim() || null,
      description: String(get(row, cols.description) || '').trim() || null,
      priority: parsePriorityVi(get(row, cols.priority)),
      location: String(get(row, cols.location) || '').trim() || null,
      frequency: String(get(row, cols.frequency) || '').trim() || null,
      start_date: startISO,
      end_date: endISO,
      status: parseStatusVi(get(row, cols.status)),
      progress: parseProgressVi(get(row, cols.progress)),
      assignee_name: assigneeName,
      user_id: matched?.id || null,
      matched_name: matched?.full_name || null,
    });
  }
  if (!rows.length) return { error: 'Không có dòng nhiệm vụ nào sau dòng tiêu đề.' };
  return { rows };
}

function ImportExcelModal({ departmentId, weekStart, members, canManage, ownUserId, onDone, onClose }) {
  const [fileName, setFileName] = useState('');
  const [wb, setWb] = useState(null);
  const [xlsxLib, setXlsxLib] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [parsed, setParsed] = useState(null); // { rows } | { error }
  const [defaultUserId, setDefaultUserId] = useState(ownUserId);
  const [busy, setBusy] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const XLSX = (await import('xlsx')).default || (await import('xlsx'));
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: 'array' });
      setXlsxLib(XLSX);
      setWb(workbook);
      setFileName(file.name);
      // Ưu tiên sheet có chữ "tuần" trong tên, nếu không lấy sheet đầu
      const guess = workbook.SheetNames.find((n) => normVi(n).includes('tuan')) || workbook.SheetNames[0];
      setSheetName(guess);
      setParsed(parsePlanSheet(XLSX, workbook, guess, { weekStart, members }));
    } catch (err) {
      console.error(err);
      setParsed({ error: 'Không đọc được file Excel' });
    }
    setBusy(false);
  };

  const changeSheet = (name) => {
    setSheetName(name);
    if (wb && xlsxLib) setParsed(parsePlanSheet(xlsxLib, wb, name, { weekStart, members }));
  };

  const rows = parsed?.rows || [];
  const unmatched = rows.filter((r) => !r.user_id).length;

  const doImport = async () => {
    if (!rows.length || busy) return;
    setBusy(true);
    try {
      const payload = rows.map((r) => ({
        task_group: r.task_group,
        title: r.title,
        description: r.description,
        kpi: r.kpi,
        location: r.location,
        frequency: r.frequency,
        start_date: r.start_date,
        end_date: r.end_date,
        priority: r.priority,
        status: r.status,
        progress: r.progress,
        user_id: canManage ? (r.user_id || defaultUserId) : ownUserId,
      }));
      const { data } = await api.post('/crm/dept-plans/tasks/import', {
        department_id: departmentId,
        tasks: payload,
      });
      onDone(data);
      onClose();
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi nhập dữ liệu');
    }
    setBusy(false);
  };

  const selectCls = 'border-2 border-gray-200 rounded-lg px-3 py-2 text-[15px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2"><FileUp className="h-5 w-5 text-indigo-600" /> Nhập kế hoạch từ Excel</h3>
          <button onClick={onClose} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Chọn file + sheet */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-indigo-300 text-[15px] font-medium text-indigo-600 hover:bg-indigo-50 cursor-pointer">
              <FileUp className="h-5 w-5" />
              {fileName || 'Chọn file Excel (.xlsx)'}
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            </label>
            {wb && (
              <select value={sheetName} onChange={(e) => changeSheet(e.target.value)} className={selectCls}>
                {wb.SheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
            {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>

          {!wb && (
            <div className="text-sm text-gray-500 leading-relaxed">
              Hỗ trợ file kế hoạch tuần dạng bảng có dòng tiêu đề chứa các cột: <b>Đầu công việc</b>, KPI, Hành động cụ thể,
              Mức ưu tiên, Nơi thực hiện, Người thực hiện, Tần suất, <b>Bắt đầu</b>, <b>Kết thúc</b>, Trạng thái, Tiến độ.
              Nhiệm vụ được tự xếp vào sheet tuần theo ngày bắt đầu.
            </div>
          )}

          {parsed?.error && (
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {parsed.error}
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-[15px]">
                <span className="text-gray-700">Đọc được <b>{rows.length}</b> nhiệm vụ.</span>
                {canManage && unmatched > 0 && (
                  <span className="flex items-center gap-1.5 text-gray-600">
                    {unmatched} dòng không khớp tên — gán cho:
                    <select value={defaultUserId} onChange={(e) => setDefaultUserId(e.target.value)} className={selectCls}>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                    </select>
                  </span>
                )}
                {!canManage && (
                  <span className="text-sm text-gray-500">Mọi nhiệm vụ sẽ được gán cho bạn (quyền nhân viên).</span>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg overflow-x-auto max-h-[42vh] overflow-y-auto">
                <table className="w-full text-sm min-w-[680px]">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-100 text-gray-600">
                      <th className="px-2 py-2.5 text-center w-9 font-bold">#</th>
                      <th className="px-2.5 py-2.5 text-left font-bold">Đầu công việc</th>
                      <th className="px-2.5 py-2.5 text-left font-bold">Người TH</th>
                      <th className="px-2.5 py-2.5 text-center font-bold">Bắt đầu</th>
                      <th className="px-2.5 py-2.5 text-center font-bold">Kết thúc</th>
                      <th className="px-2.5 py-2.5 text-center font-bold">Trạng thái</th>
                      <th className="px-2.5 py-2.5 text-center font-bold">Tiến độ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-2 text-center text-gray-400">{i + 1}</td>
                        <td className="px-2.5 py-2">
                          <div className="text-gray-800 font-medium line-clamp-1">{r.title}</div>
                          {r.kpi && <div className="text-xs text-gray-400">KPI: {r.kpi}</div>}
                        </td>
                        <td className="px-2.5 py-2">
                          {r.matched_name
                            ? <span className="text-gray-700">{r.matched_name}</span>
                            : <span className="text-amber-600 font-medium">{r.assignee_name || '—'} ⚠</span>}
                        </td>
                        <td className="px-2.5 py-2 text-center text-gray-600">{fmtDM(r.start_date)}</td>
                        <td className="px-2.5 py-2 text-center text-gray-600">{fmtDM(r.end_date)}</td>
                        <td className="px-2.5 py-2 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs ${(STATUS_META[r.status] || STATUS_META.planned).badge}`}>
                            {(STATUS_META[r.status] || STATUS_META.planned).label}
                          </span>
                        </td>
                        <td className="px-2.5 py-2 text-center text-gray-600">{r.progress}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 100 && (
                  <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">… và {rows.length - 100} dòng nữa</div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-5 py-2.5 text-[15px] font-medium rounded-lg border border-gray-400 hover:bg-gray-50">Huỷ</button>
          <button
            onClick={doImport}
            disabled={!rows.length || busy}
            className="px-5 py-2.5 text-[15px] font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {busy ? 'Đang nhập…' : `Nhập ${rows.length || ''} nhiệm vụ`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 1: Sheet tuần (bảng Gantt giống Excel) ───────────────────────────────
const SHEET_COLS = 20; // 13 cột thông tin + 7 cột ngày

function SheetTab({ departmentId, ownUserId, filterParams }) {
  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayISO()));
  const [data, setData] = useState(null);
  const [recentSheets, setRecentSheets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    try {
      const [sheetRes, listRes] = await Promise.all([
        api.get('/crm/dept-plans/sheets', { params: { department_id: departmentId, week_start: weekStart, ...filterParams } }),
        api.get('/crm/dept-plans/sheets/list', { params: { department_id: departmentId, limit: 8 } }),
      ]);
      setData(sheetRes.data);
      setRecentSheets(listRes.data?.sheets || []);
    } catch (e) {
      console.error(e);
      setData({ error: e?.response?.data?.error || 'Lỗi tải dữ liệu' });
    }
    setLoading(false);
  }, [departmentId, weekStart, filterParams]);

  useEffect(() => { load(); }, [load]);

  const memberById = useMemo(
    () => new Map((data?.members || []).map((m) => [String(m.id), m])),
    [data?.members],
  );
  const canManage = !!data?.can_manage;

  const patchTask = async (taskId, patch) => {
    const { data: res } = await api.patch(`/crm/dept-plans/tasks/${taskId}`, patch);
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === taskId ? res.task : t)) }));
  };
  const deleteTask = async (taskId) => {
    try {
      await api.delete(`/crm/dept-plans/tasks/${taskId}`);
      setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== taskId) }));
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi xoá nhiệm vụ');
    }
  };
  const addTask = async (payload) => {
    const { data: res } = await api.post('/crm/dept-plans/tasks', {
      department_id: departmentId,
      week_start: weekStart,
      ...payload,
    });
    setData((d) => ({ ...d, tasks: [...d.tasks, res.task] }));
  };
  const saveSheet = async (patch) => {
    const { data: res } = await api.patch(`/crm/dept-plans/sheets/${data.sheet.id}`, patch);
    setData((d) => ({ ...d, sheet: res.sheet }));
  };

  if (data?.error) {
    return <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500">{data.error}</div>;
  }

  const tasks = data?.tasks || [];
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
  const canEditTask = (t) => canManage || String(t.user_id) === String(ownUserId);
  const thisWeek = weekStartOf(todayISO());
  const todayKey = todayISO();

  // Nhóm theo task_group (giữ thứ tự xuất hiện; nhóm rỗng đứng đầu)
  const groups = [];
  const groupIdx = new Map();
  for (const t of tasks) {
    const g = t.task_group || '';
    if (!groupIdx.has(g)) { groupIdx.set(g, groups.length); groups.push({ name: g, items: [] }); }
    groups[groupIdx.get(g)].items.push(t);
  }

  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
  const overdueCount = tasks.filter(isOverdueTask).length;
  const donePct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Header tuần: điều hướng + thống kê */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setWeekStart((w) => addDaysISO(w, -7))} className="h-9 w-9 flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/30 text-white" title="Tuần trước">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={() => setWeekStart((w) => addDaysISO(w, 7))} className="h-9 w-9 flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/30 text-white" title="Tuần sau">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <div>
            <div className="font-bold text-white text-lg leading-tight uppercase">
              {data?.sheet?.name || `Tuần ${fmtDM(weekStart)} – ${fmtDM(addDaysISO(weekStart, 6))}`}
            </div>
            <div className="text-indigo-100 text-xs">{fmtDMY(weekStart)} → {fmtDMY(addDaysISO(weekStart, 6))}</div>
          </div>
          {weekStart !== thisWeek && (
            <button onClick={() => setWeekStart(thisWeek)} className="text-sm font-medium px-3 py-1.5 rounded-lg bg-white/15 text-white hover:bg-white/30">
              Về tuần này
            </button>
          )}
          {loading && <Loader2 className="h-5 w-5 animate-spin text-indigo-200" />}
          <button
            onClick={() => setShowImport(true)}
            className="ml-auto flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg bg-white text-indigo-700 hover:bg-indigo-50 shadow-sm"
            title="Đọc file Excel kế hoạch tuần và tạo nhiệm vụ hàng loạt"
          >
            <FileUp className="h-4 w-4" /> Nhập Excel
          </button>
        </div>

        {/* Dải thống kê + sheet tuần gần đây */}
        <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="font-bold text-gray-900 text-base">{tasks.length}</span> nhiệm vụ
          </span>
          <span className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <b className="text-emerald-600">{doneCount}</b> hoàn thành
          </span>
          <span className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
            <b className="text-blue-600">{inProgressCount}</b> đang làm
          </span>
          {overdueCount > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-gray-600">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <b className="text-red-600">{overdueCount}</b> quá hạn
            </span>
          )}
          <span className="flex items-center gap-2 min-w-[160px]">
            <span className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden min-w-[90px]">
              <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${donePct}%` }} />
            </span>
            <b className="text-sm text-gray-700">{donePct}%</b>
          </span>
          {recentSheets.length > 0 && (
            <div className="ml-auto flex items-center gap-1.5 overflow-x-auto max-w-full">
              {recentSheets.slice(0, 6).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setWeekStart(s.week_start)}
                  className={`text-sm px-3 py-1 rounded-full whitespace-nowrap border ${
                    s.week_start === weekStart
                      ? 'border-indigo-600 bg-indigo-600 text-white font-semibold'
                      : 'border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  T{fmtDM(s.week_start)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bảng kế hoạch tuần (kiểu Excel — kẻ ô, đủ cột) */}
      <div className="bg-white rounded-2xl border border-gray-400 shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <table className="border-collapse text-[14px] min-w-[1500px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#1e3a8a] text-[11px] uppercase text-white tracking-wide">
                <th className="border border-blue-300 px-1 py-2.5 font-bold w-10 sticky left-0 bg-[#1e3a8a] z-20">STT</th>
                <th className="border border-blue-300 px-2 py-2.5 text-left font-bold min-w-[220px] sticky left-10 bg-[#1e3a8a] z-20">Đầu công việc</th>
                <th className="border border-blue-300 px-2 py-2.5 text-left font-bold min-w-[130px]">KPI</th>
                <th className="border border-blue-300 px-2 py-2.5 text-left font-bold min-w-[200px]">Hành động cụ thể</th>
                <th className="border border-blue-300 px-2 py-2.5 text-center font-bold min-w-[120px]">Ưu tiên</th>
                <th className="border border-blue-300 px-2 py-2.5 text-left font-bold min-w-[100px]">Nơi TH</th>
                <th className="border border-blue-300 px-2 py-2.5 text-left font-bold min-w-[130px]">Người TH</th>
                <th className="border border-blue-300 px-2 py-2.5 text-center font-bold min-w-[90px]">Tần suất</th>
                <th className="border border-blue-300 px-2 py-2.5 text-center font-bold w-[68px]">Bắt đầu</th>
                <th className="border border-blue-300 px-2 py-2.5 text-center font-bold w-[68px]">Kết thúc</th>
                <th className="border border-blue-300 px-1 py-2.5 text-center font-bold w-12">Số ngày</th>
                <th className="border border-blue-300 px-2 py-2.5 text-center font-bold min-w-[120px]">Trạng thái</th>
                <th className="border border-blue-300 px-2 py-2.5 text-center font-bold min-w-[110px]">Tiến độ</th>
                {days.map((d, i) => (
                  <th key={d} className={`border border-blue-300 px-1 py-1.5 text-center font-bold w-9 ${
                    d === todayKey ? 'bg-amber-300 text-amber-900' : i >= 5 ? 'bg-[#16306e] text-amber-200' : ''
                  }`}>
                    <div>{DOW_SHORT[i]}</div>
                    <div className="font-semibold text-xs text-blue-200">{d.slice(8, 10)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 && !loading && (
                <tr>
                  <td colSpan={SHEET_COLS} className="border border-gray-400 px-4 py-14 text-center">
                    <CalendarRange className="h-12 w-12 mx-auto mb-3 text-gray-200" />
                    <div className="text-base text-gray-400">Chưa có đầu công việc nào trong tuần này</div>
                    <div className="text-sm text-gray-400 mt-1">Bấm "Thêm đầu công việc" bên dưới hoặc "Nhập Excel" để bắt đầu</div>
                  </td>
                </tr>
              )}
              {groups.map((g) => (
                <GroupRows
                  key={g.name || '_none'}
                  group={g}
                  days={days}
                  todayKey={todayKey}
                  memberById={memberById}
                  canEditTask={canEditTask}
                  onOpen={setEditTask}
                  onPatch={patchTask}
                />
              ))}
              <QuickAddRow
                members={data?.members || []}
                canManage={canManage}
                ownUserId={ownUserId}
                weekStart={weekStart}
                onAdd={addTask}
                colSpan={SHEET_COLS}
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* Tổng kết tuần */}
      {data?.sheet && <WeekSummary sheet={data.sheet} onSave={saveSheet} />}

      {editTask && (
        <TaskModal
          task={editTask}
          members={data?.members || []}
          canManage={canManage}
          ownUserId={ownUserId}
          onSave={patchTask}
          onDelete={deleteTask}
          onClose={() => setEditTask(null)}
        />
      )}

      {showImport && (
        <ImportExcelModal
          departmentId={departmentId}
          weekStart={weekStart}
          members={data?.members || []}
          canManage={canManage}
          ownUserId={ownUserId}
          onDone={(res) => {
            const weeks = res?.weeks || [];
            if (weeks.length && !weeks.includes(weekStart)) setWeekStart(weeks[0]);
            else load();
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

function GroupRows({ group, days, todayKey, memberById, canEditTask, onOpen, onPatch }) {
  let stt = 0;
  const gDone = group.items.filter((t) => t.status === 'done').length;
  return (
    <>
      {group.name && (
        <tr className="bg-[#fff4d6]">
          <td colSpan={SHEET_COLS} className="border border-gray-400 px-3 py-1.5">
            <div className="flex items-center gap-2.5">
              <span className="text-[13px] font-bold text-amber-900 uppercase tracking-wide">{group.name}</span>
              <span className="text-xs font-semibold text-amber-700 bg-white border border-amber-300 rounded-full px-2 py-0.5">
                {gDone}/{group.items.length} xong
              </span>
            </div>
          </td>
        </tr>
      )}
      {group.items.map((t) => {
        stt += 1;
        const member = memberById.get(String(t.user_id));
        const meta = STATUS_META[t.status] || STATUS_META.planned;
        const overdue = isOverdueTask(t);
        const canEdit = canEditTask(t);
        const rowBg = stt % 2 === 0 ? 'bg-[#fafbfc]' : 'bg-white';
        const stickyBg = stt % 2 === 0 ? 'bg-[#fafbfc]' : 'bg-white';
        return (
          <tr
            key={t.id}
            onClick={() => onOpen(t)}
            className={`group cursor-pointer hover:bg-indigo-50 ${rowBg} ${t.status === 'cancelled' ? 'opacity-60' : ''}`}
          >
            <td className={`border border-gray-400 px-1 py-2 text-center text-sm text-gray-400 sticky left-0 z-10 ${stickyBg} group-hover:bg-indigo-50`}>{stt}</td>
            <td className={`border border-gray-400 px-2 py-2 align-top sticky left-10 z-10 ${stickyBg} group-hover:bg-indigo-50`}>
              <div className={`font-semibold text-[14px] leading-snug ${t.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                {t.title}
                {overdue && <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-red-600 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />Quá hạn</span>}
              </div>
            </td>
            <td className="border border-gray-400 px-2 py-2 align-top text-[13px] text-gray-700">{t.kpi || ''}</td>
            <td className="border border-gray-400 px-2 py-2 align-top text-[13px] text-gray-600 whitespace-pre-line">{t.description || ''}</td>
            <td className="border border-gray-400 px-2 py-2 align-top text-center">
              {t.priority !== 'normal' && (
                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded border ${(PRIORITY_META[t.priority] || PRIORITY_META.normal).cls}`}>
                  {(PRIORITY_META[t.priority] || PRIORITY_META.normal).label}
                </span>
              )}
            </td>
            <td className="border border-gray-400 px-2 py-2 align-top text-[13px] text-gray-700">{t.location || ''}</td>
            <td className="border border-gray-400 px-2 py-2 align-top">
              <div className="flex items-center gap-1.5">
                <Avatar user={member} size="h-6 w-6" />
                <span className="text-[13px] text-gray-700 truncate">{member?.full_name || ''}</span>
              </div>
            </td>
            <td className="border border-gray-400 px-2 py-2 align-top text-center text-[13px] text-gray-600">{t.frequency || ''}</td>
            <td className="border border-gray-400 px-1 py-2 align-top text-center text-[13px] text-gray-700 whitespace-nowrap">{fmtDM(t.start_date)}</td>
            <td className="border border-gray-400 px-1 py-2 align-top text-center text-[13px] text-gray-700 whitespace-nowrap">{fmtDM(t.end_date)}</td>
            <td className="border border-gray-400 px-1 py-2 align-top text-center text-[13px] text-gray-700">{diffDays(t.start_date, t.end_date) + 1}</td>
            <td className="border border-gray-400 px-1.5 py-2 align-top text-center" onClick={(e) => e.stopPropagation()}>
              {canEdit ? (
                <select
                  value={t.status}
                  onChange={(e) => onPatch(t.id, { status: e.target.value }).catch((err) => alert(err?.response?.data?.error || 'Lỗi cập nhật'))}
                  className={`text-[13px] font-medium px-1.5 py-1 rounded border-0 cursor-pointer ${meta.badge}`}
                  title="Bấm để đổi trạng thái"
                >
                  {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              ) : (
                <span className={`text-[13px] px-2 py-0.5 rounded-full ${meta.badge}`}>{meta.label}</span>
              )}
            </td>
            <td className="border border-gray-400 px-1.5 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[36px]">
                  <div
                    className={`h-full rounded-full ${t.status === 'done' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${t.progress || 0}%` }}
                  />
                </div>
                {canEdit ? (
                  <select
                    value={t.progress || 0}
                    onChange={(e) => onPatch(t.id, { progress: Number(e.target.value), ...(Number(e.target.value) === 100 ? { status: 'done' } : {}) }).catch(() => {})}
                    className="text-[13px] font-medium text-gray-600 bg-transparent border-0 focus:outline-none cursor-pointer w-12"
                    title="Bấm để đổi tiến độ"
                  >
                    {[0, 25, 50, 75, 100].map((p) => <option key={p} value={p}>{p}%</option>)}
                    {![0, 25, 50, 75, 100].includes(t.progress || 0) && <option value={t.progress}>{t.progress}%</option>}
                  </select>
                ) : <span className="text-[13px] text-gray-600 w-12">{t.progress || 0}%</span>}
              </div>
            </td>
            {days.map((d) => {
              const inRange = d >= t.start_date && d <= t.end_date;
              const isFirst = inRange && (d === t.start_date || d === days[0]);
              const isLast = inRange && (d === t.end_date || d === days[6]);
              return (
                <td key={d} className={`border border-gray-400 px-0 py-2 ${d === todayKey ? 'bg-indigo-50' : ''}`}>
                  {inRange && (
                    <div
                      className={`h-4 ${overdue ? 'bg-red-300' : meta.gantt} ${isFirst ? 'rounded-l-full ml-0.5' : ''} ${isLast ? 'rounded-r-full mr-0.5' : ''}`}
                      title={`${t.title}: ${fmtDM(t.start_date)} → ${fmtDM(t.end_date)}`}
                    />
                  )}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

// ─── Tab 2: Lịch tháng ───────────────────────────────────────────────────────
function CalendarTab({ departmentId, ownUserId, filterParams }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [editTask, setEditTask] = useState(null);

  const monthStr = `${year}-${pad2(month + 1)}`;

  const load = useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    try {
      const { data: res } = await api.get('/crm/dept-plans/calendar', {
        params: { department_id: departmentId, month: monthStr, ...filterParams },
      });
      setData(res);
    } catch (e) {
      console.error(e);
      setData({ error: e?.response?.data?.error || 'Lỗi tải dữ liệu' });
    }
    setLoading(false);
  }, [departmentId, monthStr, filterParams]);

  useEffect(() => { load(); }, [load]);

  const memberById = useMemo(
    () => new Map((data?.members || []).map((m) => [String(m.id), m])),
    [data?.members],
  );

  // Trải nhiệm vụ ra từng ngày trong khoảng [start_date, end_date]
  const dateMap = useMemo(() => {
    const map = {};
    const monthFrom = `${monthStr}-01`;
    const monthTo = toISO(new Date(year, month + 1, 0));
    (data?.tasks || []).forEach((t) => {
      let d = t.start_date < monthFrom ? monthFrom : t.start_date;
      const end = t.end_date > monthTo ? monthTo : t.end_date;
      while (d <= end) {
        if (!map[d]) map[d] = [];
        map[d].push(t);
        d = addDaysISO(d, 1);
      }
    });
    return map;
  }, [data?.tasks, monthStr, year, month]);

  const patchTask = async (taskId, patch) => {
    const { data: res } = await api.patch(`/crm/dept-plans/tasks/${taskId}`, patch);
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === taskId ? res.task : t)) }));
  };
  const deleteTask = async (taskId) => {
    try {
      await api.delete(`/crm/dept-plans/tasks/${taskId}`);
      setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== taskId) }));
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi xoá nhiệm vụ');
    }
  };

  if (data?.error) {
    return <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500">{data.error}</div>;
  }

  const prevMonth = () => { if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1); };

  // Lưới T2 → CN
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startPad = (firstDay.getDay() + 6) % 7; // 0 = thứ Hai
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = todayISO();
  const statusColor = (t) =>
    isOverdueTask(t) ? 'bg-red-100 text-red-700 border-red-200'
      : t.status === 'done' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
        : t.status === 'in_progress' ? 'bg-blue-100 text-blue-700 border-blue-200'
          : t.status === 'cancelled' ? 'bg-gray-100 text-gray-400 line-through border-gray-200'
            : 'bg-gray-100 text-gray-600 border-gray-200';

  const selectedTasks = selectedDay ? (dateMap[selectedDay] || []) : [];
  const monthTasks = data?.tasks || [];
  const monthDone = monthTasks.filter((t) => t.status === 'done').length;
  const monthOverdue = monthTasks.filter(isOverdueTask).length;
  const inThisMonth = todayKey.slice(0, 7) === monthStr;

  const LEGEND = [
    { label: 'Chưa làm', cls: 'bg-gray-300' },
    { label: 'Đang làm', cls: 'bg-blue-400' },
    { label: 'Hoàn thành', cls: 'bg-emerald-400' },
    { label: 'Quá hạn', cls: 'bg-red-400' },
    { label: 'Đã huỷ', cls: 'bg-gray-200' },
  ];

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-1.5">
            <button onClick={prevMonth} className="h-10 w-10 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-gray-700" title="Tháng trước">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={nextMonth} className="h-10 w-10 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-gray-700" title="Tháng sau">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            Tháng {month + 1} năm {year}
            {loading && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
          </h3>
          {!inThisMonth && (
            <button
              onClick={() => { const n = new Date(); setYear(n.getFullYear()); setMonth(n.getMonth()); setSelectedDay(todayKey); }}
              className="text-sm font-medium px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50"
            >
              Hôm nay
            </button>
          )}
          <span className="text-sm text-gray-500 bg-white border border-gray-200 rounded-full px-3 py-1">
            {monthTasks.length} nhiệm vụ · <span className="text-emerald-600 font-medium">{monthDone} xong</span>
            {monthOverdue > 0 && <> · <span className="text-red-600 font-medium">{monthOverdue} quá hạn</span></>}
          </span>
          {/* Chú giải màu trạng thái */}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {LEGEND.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className={`h-3 w-3 rounded ${l.cls}`} /> {l.label}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DOW_SHORT.map((d, i) => (
            <div key={d} className={`text-center text-sm font-bold py-2.5 ${i === 6 ? 'text-red-400' : 'text-gray-600'}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            if (!day) return <div key={`pad-${idx}`} className="min-h-[140px] bg-gray-50/50 border-b border-r border-gray-100" />;
            const key = `${year}-${pad2(month + 1)}-${pad2(day)}`;
            const items = dateMap[key] || [];
            const isToday = key === todayKey;
            const isWeekend = idx % 7 >= 5;
            return (
              <div
                key={key}
                onClick={() => setSelectedDay(key)}
                className={`min-h-[140px] p-1.5 border-b border-r border-gray-100 cursor-pointer hover:bg-indigo-50/30 ${
                  isToday ? 'bg-blue-50/40' : selectedDay === key ? 'bg-indigo-50/50' : isWeekend ? 'bg-gray-50/40' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${
                    isToday ? 'bg-blue-600 text-white' : idx % 7 === 6 ? 'text-red-500' : 'text-gray-700'
                  }`}>{day}</div>
                  {items.length > 0 && (
                    <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 rounded-full px-1.5 py-0.5">{items.length}</span>
                  )}
                </div>
                <div className="space-y-1">
                  {items.slice(0, 4).map((t) => {
                    const m = memberById.get(String(t.user_id));
                    const shortName = (m?.full_name || '').split(' ').filter(Boolean).pop() || '';
                    return (
                      <button
                        key={t.id}
                        onClick={(e) => { e.stopPropagation(); setEditTask(t); }}
                        className={`w-full text-left text-xs px-1.5 py-1 rounded border block ${statusColor(t)}`}
                        title={`${t.title}\n${m?.full_name || ''} · ${fmtDM(t.start_date)} → ${fmtDM(t.end_date)} · ${t.progress || 0}%`}
                      >
                        <span className="font-semibold truncate block">{t.title}</span>
                        <span className="flex items-center justify-between gap-1 opacity-80">
                          <span className="truncate">{shortName}</span>
                          <span className="shrink-0">{t.progress || 0}%</span>
                        </span>
                      </button>
                    );
                  })}
                  {items.length > 4 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedDay(key); }}
                      className="w-full text-left text-xs font-medium text-indigo-600 hover:text-indigo-800 px-1.5"
                    >
                      +{items.length - 4} nhiệm vụ khác…
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Panel chi tiết ngày: trình bày đầy đủ thông tin từng nhiệm vụ */}
      {selectedDay && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-50/60 border-b border-indigo-100">
            <div className="text-base font-bold text-gray-800">
              Nhiệm vụ ngày {fmtDMY(selectedDay)} <span className="text-indigo-600">({selectedTasks.length})</span>
            </div>
            <button onClick={() => setSelectedDay(null)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white text-gray-500">
              <X className="h-4 w-4" />
            </button>
          </div>
          {selectedTasks.length === 0 && <div className="px-4 py-8 text-center text-base text-gray-400">Không có nhiệm vụ trong ngày này</div>}
          <div className="divide-y divide-gray-100">
            {selectedTasks.map((t) => {
              const m = memberById.get(String(t.user_id));
              const meta = STATUS_META[t.status] || STATUS_META.planned;
              const overdue = isOverdueTask(t);
              return (
                <div key={t.id} onClick={() => setEditTask(t)} className="px-4 py-3.5 hover:bg-gray-50 cursor-pointer">
                  {/* Dòng 1: tiêu đề + trạng thái + người thực hiện */}
                  <div className="flex flex-wrap items-center gap-2">
                    {t.task_group && (
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-2 py-0.5 uppercase">{t.task_group}</span>
                    )}
                    <span className={`text-[15px] font-semibold ${t.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{t.title}</span>
                    {overdue && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> Quá hạn</span>
                    )}
                    {t.priority !== 'normal' && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded border ${(PRIORITY_META[t.priority] || PRIORITY_META.normal).cls}`}>
                        {(PRIORITY_META[t.priority] || PRIORITY_META.normal).label}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-2">
                      <span className={`text-sm px-2.5 py-1 rounded-full ${meta.badge}`}>{meta.label}</span>
                      <Avatar user={m} size="h-8 w-8" />
                      <span className="text-sm font-medium text-gray-700">{m?.full_name || ''}</span>
                    </span>
                  </div>
                  {/* Dòng 2: mô tả */}
                  {t.description && (
                    <div className="text-sm text-gray-600 whitespace-pre-line mt-1.5">{t.description}</div>
                  )}
                  {/* Dòng 3: thông tin chi tiết */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-2 text-sm text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      {fmtDM(t.start_date)} → {fmtDM(t.end_date)} ({diffDays(t.start_date, t.end_date) + 1} ngày)
                    </span>
                    {t.kpi && <span><b className="text-gray-500 font-semibold">KPI:</b> {t.kpi}</span>}
                    {t.location && <span><b className="text-gray-500 font-semibold">Nơi TH:</b> {t.location}</span>}
                    {t.frequency && <span><b className="text-gray-500 font-semibold">Tần suất:</b> {t.frequency}</span>}
                    <span className="flex items-center gap-2 min-w-[140px]">
                      <span className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[80px]">
                        <span
                          className={`block h-full rounded-full ${t.status === 'done' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                          style={{ width: `${t.progress || 0}%` }}
                        />
                      </span>
                      <span className="font-semibold text-gray-700">{t.progress || 0}%</span>
                    </span>
                  </div>
                  {/* Ghi chú kết quả nếu có */}
                  {t.result_note && (
                    <div className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mt-2">
                      <b className="font-semibold text-gray-600">Kết quả:</b> {t.result_note}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editTask && (
        <TaskModal
          task={editTask}
          members={data?.members || []}
          canManage={!!data?.can_manage}
          ownUserId={ownUserId}
          onSave={patchTask}
          onDelete={deleteTask}
          onClose={() => setEditTask(null)}
        />
      )}
    </div>
  );
}

// ─── Tab 3: Báo cáo tiến độ ──────────────────────────────────────────────────
function ReportTab({ departmentId, filterParams }) {
  const thisWeek = weekStartOf(todayISO());
  const [range, setRange] = useState({ from: thisWeek, to: addDaysISO(thisWeek, 6) });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    try {
      const { data: res } = await api.get('/crm/dept-plans/report', {
        params: { department_id: departmentId, date_from: range.from, date_to: range.to, ...filterParams },
      });
      setData(res);
    } catch (e) {
      console.error(e);
      setData({ error: e?.response?.data?.error || 'Lỗi tải dữ liệu' });
    }
    setLoading(false);
  }, [departmentId, range.from, range.to, filterParams]);

  useEffect(() => { load(); }, [load]);

  if (data?.error) {
    return <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500">{data.error}</div>;
  }

  const presets = [
    { label: 'Tuần này', from: thisWeek, to: addDaysISO(thisWeek, 6) },
    { label: 'Tuần trước', from: addDaysISO(thisWeek, -7), to: addDaysISO(thisWeek, -1) },
    {
      label: 'Tháng này',
      from: `${todayISO().slice(0, 7)}-01`,
      to: toISO(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)),
    },
  ];

  const s = data?.summary;
  const cards = s ? [
    { label: 'Tổng nhiệm vụ', value: s.total, cls: 'text-gray-900' },
    { label: 'Hoàn thành', value: s.done, cls: 'text-emerald-600' },
    { label: 'Đang làm', value: s.in_progress, cls: 'text-blue-600' },
    { label: 'Quá hạn', value: s.overdue, cls: 'text-red-600' },
    { label: 'Tỷ lệ hoàn thành', value: `${s.completion_pct}%`, cls: 'text-indigo-600' },
  ] : [];

  const maxDaily = Math.max(1, ...(data?.daily || []).map((d) => d.total));

  return (
    <div className="space-y-4">
      {/* Bộ lọc */}
      <div className="bg-white rounded-xl border border-gray-200 px-3 py-3 flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => setRange({ from: p.from, to: p.to })}
            className={`text-sm font-medium px-4 py-2 rounded-lg border ${
              range.from === p.from && range.to === p.to
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 ml-auto text-sm">
          <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="border-2 border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
          <span className="text-gray-400">–</span>
          <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="border-2 border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
          {loading && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
        </div>
      </div>

      {/* Thẻ tổng quan */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3.5">
            <div className="text-sm font-medium text-gray-500">{c.label}</div>
            <div className={`text-3xl font-bold mt-1 ${c.cls}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Biểu đồ theo ngày (theo hạn kết thúc) */}
      {(data?.daily || []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-base font-bold text-gray-800 mb-3">Nhiệm vụ theo ngày kết thúc (hoàn thành / tổng)</div>
          <div className="flex items-end gap-2 h-40 overflow-x-auto pb-1">
            {(data?.daily || []).map((d) => (
              <div key={d.date} className="flex flex-col items-center gap-1 min-w-[44px]" title={`${fmtDMY(d.date)}: ${d.done}/${d.total} hoàn thành`}>
                <div className="text-xs font-medium text-gray-600">{d.done}/{d.total}</div>
                <div className="relative w-8 bg-gray-100 rounded-t" style={{ height: `${Math.max(8, (d.total / maxDaily) * 104)}px` }}>
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-emerald-500 rounded-t"
                    style={{ height: `${d.total ? (d.done / d.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500">{fmtDM(d.date)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bảng theo nhân viên */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-base font-bold text-gray-800">
          Tiến độ theo nhân viên
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[15px]">
            <thead>
              <tr className="bg-gray-100 text-sm text-gray-600">
                <th className="text-left px-4 py-2.5 font-bold">Nhân viên</th>
                <th className="text-center px-3 py-2.5 font-bold">Tổng</th>
                <th className="text-center px-3 py-2.5 font-bold">Hoàn thành</th>
                <th className="text-center px-3 py-2.5 font-bold">Đang làm</th>
                <th className="text-center px-3 py-2.5 font-bold">Quá hạn</th>
                <th className="text-center px-3 py-2.5 font-bold">TĐ trung bình</th>
                <th className="text-left px-4 py-2.5 font-bold w-48">% hoàn thành</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows || []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Chưa có nhiệm vụ trong khoảng thời gian này</td></tr>
              )}
              {(data?.rows || []).map((row) => (
                <tr key={row.user_id} className="border-t border-gray-50 hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar user={row} size="h-8 w-8" />
                      <span className="font-semibold text-gray-800">{row.full_name}</span>
                    </div>
                  </td>
                  <td className="text-center px-3 py-3 text-gray-700">{row.total}</td>
                  <td className="text-center px-3 py-3 text-emerald-600 font-semibold">{row.done}</td>
                  <td className="text-center px-3 py-3 text-blue-600">{row.in_progress}</td>
                  <td className={`text-center px-3 py-3 ${row.overdue ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{row.overdue}</td>
                  <td className="text-center px-3 py-3 text-gray-600">{row.avg_progress}%</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${row.completion_pct}%` }} />
                      </div>
                      <span className="text-sm font-medium text-gray-600 w-10 text-right">{row.completion_pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Trang chính ─────────────────────────────────────────────────────────────
const FILTER_LS = 'crm_dept_plan_filters';

function readFilters() {
  try { return JSON.parse(localStorage.getItem(FILTER_LS)) || {}; } catch { return {}; }
}

export default function CrmDeptPlanPage() {
  const { user } = useAuth();
  const canPickDept = isCrmModuleAdmin(user) || normalizeRole(user?.role) === 'manager';
  const [tab, setTab] = useState('sheet');

  const saved = useMemo(readFilters, []);
  const [companies, setCompanies] = useState([]);
  const [regions, setRegions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [deptMembers, setDeptMembers] = useState([]);
  const [companyId, setCompanyId] = useState(() => (canPickDept ? (saved.company_id || user?.company_id || '') : ''));
  const [regionId, setRegionId] = useState(saved.region_id || '');
  const [departmentId, setDepartmentId] = useState(saved.department_id || user?.department_id || '');
  const [filterUserId, setFilterUserId] = useState(saved.user_id || '');

  // Công ty hiệu lực để tải khu vực (nhân viên thường dùng công ty của mình)
  const effectiveCompanyId = canPickDept ? companyId : (user?.company_id || '');

  // Danh sách công ty (chỉ admin/manager)
  useEffect(() => {
    if (!canPickDept) return;
    api.get('/companies', { params: { for_module: 'crm' } })
      .then(({ data }) => setCompanies(data?.companies || data || []))
      .catch(() => setCompanies([]));
  }, [canPickDept]);

  // Khu vực theo công ty
  useEffect(() => {
    if (!effectiveCompanyId) { setRegions([]); return; }
    api.get('/crm/company-regions', { params: { company_id: effectiveCompanyId, for_module: 'crm' } })
      .then(({ data }) => setRegions(Array.isArray(data) ? data.filter((x) => x.is_active !== false) : []))
      .catch(() => setRegions([]));
  }, [effectiveCompanyId]);

  // Phòng ban theo công ty
  useEffect(() => {
    if (!canPickDept) {
      setDepartmentId(user?.department_id || '');
      return;
    }
    const params = companyId ? { company_id: companyId } : {};
    api.get('/departments', { params }).then(({ data }) => {
      const list = data?.departments || [];
      setDepartments(list);
      setDepartmentId((cur) => {
        if (cur && list.some((d) => String(d.id) === String(cur))) return cur;
        const own = list.some((d) => String(d.id) === String(user?.department_id || '')) ? user?.department_id : '';
        return own || list[0]?.id || '';
      });
    }).catch(console.error);
  }, [canPickDept, companyId, user?.department_id]);

  // Nhân viên theo phòng ban (cho bộ lọc)
  useEffect(() => {
    if (!departmentId) { setDeptMembers([]); return; }
    api.get(`/departments/${departmentId}`)
      .then(({ data }) => setDeptMembers(data?.members || []))
      .catch(() => setDeptMembers([]));
    setFilterUserId((cur) => cur && saved.department_id === departmentId ? cur : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  // Lưu bộ lọc
  useEffect(() => {
    localStorage.setItem(FILTER_LS, JSON.stringify({
      company_id: companyId, region_id: regionId, department_id: departmentId, user_id: filterUserId,
    }));
  }, [companyId, regionId, departmentId, filterUserId]);

  const filterParams = useMemo(() => {
    const p = {};
    if (filterUserId) p.user_id = filterUserId;
    else if (regionId) p.region_id = regionId;
    return p;
  }, [filterUserId, regionId]);

  const selectCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 hover:border-gray-300';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1';
  const hasFilter = regionId || filterUserId || (canPickDept && companyId);

  const tabs = [
    { id: 'sheet', label: 'Sheet tuần', icon: CalendarRange },
    { id: 'calendar', label: 'Lịch', icon: Calendar },
    { id: 'report', label: 'Báo cáo tiến độ', icon: BarChart3 },
  ];

  return (
    <div className="p-4 lg:p-6 w-full space-y-4 bg-gray-50/60 min-h-full">
      {/* Thanh đầu: tiêu đề + tab */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-200">
            <CalendarRange className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Kế hoạch phòng ban</h1>
            <p className="text-sm text-gray-500">Lập kế hoạch tuần, theo dõi lịch và báo cáo tiến độ</p>
          </div>
        </div>

        {/* Tab dạng pill */}
        <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all ${
                tab === t.id
                  ? 'bg-white text-indigo-700 font-semibold shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 font-medium'
              }`}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bộ lọc: Công ty → Khu vực → Phòng ban → Nhân viên */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 self-center text-gray-400 pr-1">
          <Filter className="h-4 w-4" />
          <span className="text-sm font-semibold text-gray-500">Bộ lọc</span>
        </div>
        {canPickDept && (
          <div className="w-[190px]">
            <label className={labelCls}>Công ty</label>
            <select
              value={companyId}
              onChange={(e) => { setCompanyId(e.target.value); setRegionId(''); setFilterUserId(''); }}
              className={selectCls}
            >
              <option value="">Tất cả công ty</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {regions.length > 0 && (
          <div className="w-[170px]">
            <label className={labelCls}>Khu vực</label>
            <select
              value={regionId}
              onChange={(e) => { setRegionId(e.target.value); setFilterUserId(''); }}
              className={selectCls}
            >
              <option value="">Tất cả khu vực</option>
              {regions.map((rg) => <option key={rg.id} value={rg.id}>{rg.name}</option>)}
            </select>
          </div>
        )}
        {canPickDept ? (
          <div className="w-[190px]">
            <label className={labelCls}>Phòng ban</label>
            <select
              value={departmentId}
              onChange={(e) => { setDepartmentId(e.target.value); setFilterUserId(''); }}
              className={selectCls}
            >
              {departments.length === 0 && <option value="">— Chọn phòng ban —</option>}
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className={labelCls}>Phòng ban</label>
            <span className="inline-block text-sm font-medium text-indigo-700 px-3 py-2 bg-indigo-50 rounded-lg border border-indigo-100">
              Phòng ban của tôi
            </span>
          </div>
        )}
        {deptMembers.length > 0 && (
          <div className="w-[190px]">
            <label className={labelCls}>Nhân viên</label>
            <select
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              className={selectCls}
            >
              <option value="">Tất cả nhân viên</option>
              {deptMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
        )}
        {hasFilter && (
          <button
            onClick={() => { if (canPickDept) setCompanyId(''); setRegionId(''); setFilterUserId(''); }}
            className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-red-600 px-3 py-2 rounded-lg border border-gray-200 hover:border-red-200 hover:bg-red-50"
          >
            <X className="h-4 w-4" /> Xoá lọc
          </button>
        )}
      </div>

      {!departmentId ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center text-gray-500">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>{canPickDept ? 'Chọn phòng ban để xem kế hoạch' : 'Tài khoản của bạn chưa thuộc phòng ban nào'}</p>
        </div>
      ) : (
        <>
          {tab === 'sheet' && <SheetTab departmentId={departmentId} ownUserId={user?.id} filterParams={filterParams} />}
          {tab === 'calendar' && <CalendarTab departmentId={departmentId} ownUserId={user?.id} filterParams={filterParams} />}
          {tab === 'report' && <ReportTab departmentId={departmentId} filterParams={filterParams} />}
        </>
      )}
    </div>
  );
}
