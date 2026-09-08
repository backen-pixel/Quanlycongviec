import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Download, Filter, Loader2, RefreshCw, Search, Settings } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { exportSharedWorkspaceReportExcel } from '../lib/sharedWorkspaceReportExcel';

const MODULE_LABELS = { crm: 'CRM', production: 'Sản xuất', logistics: 'VC/LĐ' };
const SOURCE_LABELS = {
  customer_request: 'Phát sinh từ khách hàng',
  employee_error: 'Lỗi từ nhân viên',
};
const STATUS_LABELS = {
  pending: 'Chưa làm',
  in_progress: 'Đang làm',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};
const PRIORITY_LABELS = { low: 'Thấp', medium: 'Trung bình', high: 'Cao', urgent: 'Khẩn cấp' };
const PAGE_SIZE = 50;

function validModule(value) {
  return ['crm', 'production', 'logistics'].includes(value) ? value : '';
}

function assignmentPath(row) {
  const root = row.assignment_module === 'production'
    ? '/sx/assignments'
    : row.assignment_module === 'logistics'
      ? '/vc/assignments'
      : '/crm/assignments';
  return `${root}?pageTab=private&open=${row.id}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
}

function emptyFilters(moduleKey = '') {
  return {
    date_from: '',
    date_to: '',
    company_id: '',
    assignment_module: moduleKey,
    task_source_type: '',
    employee_error_module: '',
    status: '',
    priority: '',
    phat_sinh_kind: '',
    department_id: '',
    assignee_id: '',
    q: '',
  };
}

function SelectField({ label, value, onChange, children, disabled = false }) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
      >
        {children}
      </select>
    </label>
  );
}

function StatCard({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    red: 'border-red-200 bg-red-50 text-red-800',
  };
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${tones[tone]}`}>
      <p className="text-2xl font-bold tabular-nums">{value || 0}</p>
      <p className="mt-0.5 text-xs font-medium">{label}</p>
    </div>
  );
}

export default function SharedWorkspaceAssignmentsReportPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialModule = validModule(String(searchParams.get('module') || '').toLowerCase());
  const [draft, setDraft] = useState(() => emptyFilters(initialModule));
  const [filters, setFilters] = useState(() => emptyFilters(initialModule));
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [kinds, setKinds] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(() => (
    localStorage.getItem('sharedWorkspaceReportFiltersOpen') !== '0'
  ));

  const elevated = ['admin', 'manager', 'sales_admin', 'crm_production_admin'].includes(user?.role);
  const systemAdmin = user?.role === 'admin' && !user?.company_id;

  const requestParams = useMemo(() => {
    const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value != null) params[key] = value;
    });
    return params;
  }, [filters, page]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/crm/assignments/shared-workspace-report', { params: requestParams });
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setSummary(data?.summary || {});
      setTotal(Number(data?.total) || 0);
    } catch (err) {
      setRows([]);
      setSummary({});
      setTotal(0);
      setError(err.response?.data?.error || err.message || 'Không tải được báo cáo');
    } finally {
      setLoading(false);
    }
  }, [requestParams]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    const scope = draft.company_id ? { company_id: draft.company_id } : {};
    const requests = [
      elevated ? api.get('/departments', { params: scope }) : Promise.resolve({ data: { departments: [] } }),
      elevated ? api.get('/users', { params: scope }) : Promise.resolve({ data: { users: [user].filter(Boolean) } }),
      api.get('/crm/phat-sinh-kinds', { params: { include_inactive: '1', ...scope } }),
      systemAdmin ? api.get('/companies') : Promise.resolve({ data: { companies: [] } }),
    ];
    Promise.all(requests).then(([deptRes, userRes, kindRes, companyRes]) => {
      if (cancelled) return;
      setDepartments(deptRes.data?.departments || deptRes.data || []);
      setUsers(userRes.data?.users || userRes.data || []);
      setKinds(kindRes.data?.phat_sinh_kinds || []);
      setCompanies(companyRes.data?.companies || companyRes.data || []);
    }).catch(() => {
      if (!cancelled) {
        setDepartments([]);
        setUsers(elevated ? [] : [user].filter(Boolean));
        setKinds([]);
      }
    });
    return () => { cancelled = true; };
  }, [draft.company_id, elevated, systemAdmin, user]);

  const setField = (key, value) => {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === 'company_id') {
        next.department_id = '';
        next.assignee_id = '';
      }
      if (key === 'department_id') next.assignee_id = '';
      return next;
    });
  };

  const assigneeOptions = draft.department_id
    ? users.filter((item) => String(item.department_id || '') === String(draft.department_id))
    : users;

  const applyFilters = (event) => {
    event?.preventDefault?.();
    setPage(0);
    setFilters({ ...draft });
    const next = new URLSearchParams(searchParams);
    if (draft.assignment_module) next.set('module', draft.assignment_module);
    else next.delete('module');
    setSearchParams(next, { replace: true });
  };

  const resetFilters = () => {
    const next = emptyFilters(initialModule);
    setDraft(next);
    setFilters(next);
    setPage(0);
  };

  const toggleFilters = () => {
    setFiltersOpen((current) => {
      const next = !current;
      localStorage.setItem('sharedWorkspaceReportFiltersOpen', next ? '1' : '0');
      return next;
    });
  };

  const exportExcel = async () => {
    setExporting(true);
    setError('');
    try {
      const params = { ...filters, export: '1' };
      Object.keys(params).forEach((key) => {
        if (params[key] === '' || params[key] == null) delete params[key];
      });
      const { data } = await api.get('/crm/assignments/shared-workspace-report', { params });
      await exportSharedWorkspaceReportExcel({
        rows: data?.rows || [],
        summary: data?.summary || {},
        filters,
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Không xuất được Excel');
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-5">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <Link
            to="/management/work-unified"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            title="Quay lại module Dự án"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-slate-900">Báo cáo nhiệm vụ phát sinh</h1>
            <p className="text-xs text-slate-500">Các nhiệm vụ được tạo trong Không gian chung</p>
          </div>
          {elevated && (
            <Link
              to="/management/shared-workspace-settings"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 text-sm font-semibold text-violet-700 hover:bg-violet-50"
              title="Thiết lập loại phát sinh và nhân viên chịu trách nhiệm cố định"
            >
              <Settings className="h-4 w-4" /> Thiết lập
            </Link>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
          </button>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={exporting || loading || total === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Xuất Excel
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Tổng phát sinh" value={summary.total} />
          <StatCard label="Chưa làm" value={summary.pending} tone="amber" />
          <StatCard label="Đang làm" value={summary.in_progress} tone="blue" />
          <StatCard label="Hoàn thành" value={summary.completed} tone="green" />
          <StatCard label="Quá hạn" value={summary.overdue} tone="red" />
        </div>

        <form onSubmit={applyFilters} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className={`flex items-center justify-between gap-3 ${filtersOpen ? 'mb-3' : ''}`}>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Bộ lọc báo cáo</h2>
            </div>
            <button
              type="button"
              onClick={toggleFilters}
              aria-expanded={filtersOpen}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {filtersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {filtersOpen ? 'Ẩn bộ lọc' : 'Hiện bộ lọc'}
            </button>
          </div>
          {filtersOpen && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <label>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Từ ngày</span>
              <input type="date" value={draft.date_from} onChange={(e) => setField('date_from', e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm" />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Đến ngày</span>
              <input type="date" value={draft.date_to} onChange={(e) => setField('date_to', e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm" />
            </label>
            {systemAdmin && (
              <SelectField label="Công ty" value={draft.company_id} onChange={(value) => setField('company_id', value)}>
                <option value="">Tất cả công ty</option>
                {companies.map((item) => <option key={item.id} value={item.id}>{item.short_name || item.name}</option>)}
              </SelectField>
            )}
            <SelectField label="Khối nhận" value={draft.assignment_module} onChange={(value) => setField('assignment_module', value)}>
              <option value="">Tất cả khối</option>
              {Object.entries(MODULE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectField>
            <SelectField label="Nguồn phát sinh" value={draft.task_source_type} onChange={(value) => setField('task_source_type', value)}>
              <option value="">Tất cả nguồn</option>
              {Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectField>
            <SelectField label="Khối gây lỗi" value={draft.employee_error_module} onChange={(value) => setField('employee_error_module', value)}>
              <option value="">Tất cả khối</option>
              {Object.entries(MODULE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectField>
            <SelectField label="Trạng thái" value={draft.status} onChange={(value) => setField('status', value)}>
              <option value="">Tất cả trạng thái</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectField>
            <SelectField label="Ưu tiên" value={draft.priority} onChange={(value) => setField('priority', value)}>
              <option value="">Tất cả mức</option>
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectField>
            <SelectField label="Loại phát sinh" value={draft.phat_sinh_kind} onChange={(value) => setField('phat_sinh_kind', value)}>
              <option value="">Tất cả loại</option>
              {kinds.map((item) => <option key={item.id || item.slug} value={item.id || item.slug}>{item.name}</option>)}
            </SelectField>
            {elevated && (
              <SelectField label="Phòng ban" value={draft.department_id} onChange={(value) => setField('department_id', value)}>
                <option value="">Tất cả phòng ban</option>
                {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </SelectField>
            )}
            <SelectField label="Người phụ trách" value={draft.assignee_id} onChange={(value) => setField('assignee_id', value)}>
              <option value="">Tất cả nhân viên</option>
              {assigneeOptions.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}
            </SelectField>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tìm kiếm</span>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input value={draft.q} onChange={(e) => setField('q', e.target.value)} placeholder="Deal, dự án, nhiệm vụ, nhân viên…" className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-2.5 text-sm" />
              </div>
            </label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={resetFilters} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Đặt lại</button>
                <button type="submit" className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Xem báo cáo</button>
              </div>
            </>
          )}
        </form>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {error && <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <div className="overflow-x-auto">
            <table className="min-w-[1450px] w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  {['Ngày tạo', 'Deal / dự án', 'Nhiệm vụ', 'Nguồn', 'Khối nhận', 'Bên gây lỗi', 'Loại phát sinh', 'Người phụ trách', 'Người tạo', 'Trạng thái', 'Hạn xử lý'].map((label) => (
                    <th key={label} className="whitespace-nowrap px-3 py-2.5 font-bold">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={11} className="py-16 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />Đang tải báo cáo…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={11} className="py-16 text-center text-slate-500">Không có nhiệm vụ phát sinh phù hợp bộ lọc.</td></tr>
                ) : rows.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-3 text-slate-500">{formatDate(row.created_at)}</td>
                    <td className="max-w-[260px] px-3 py-3">
                      <p className="font-semibold text-slate-800">{row.lead?.code || '—'}</p>
                      <p className="line-clamp-2 text-slate-500">{row.lead?.title || row.project?.name || '—'}</p>
                    </td>
                    <td className="max-w-[300px] px-3 py-3">
                      <Link to={assignmentPath(row)} className="font-semibold text-blue-700 hover:underline">{row.title || 'Nhiệm vụ'}</Link>
                      {row.description && <p className="mt-1 line-clamp-2 text-slate-500">{row.description}</p>}
                    </td>
                    <td className="px-3 py-3">{SOURCE_LABELS[row.task_source_type] || row.task_source_type}</td>
                    <td className="px-3 py-3">{MODULE_LABELS[row.assignment_module] || row.assignment_module}</td>
                    <td className="px-3 py-3">
                      {row.task_source_type === 'employee_error'
                        ? (MODULE_LABELS[row.employee_error_module] || row.employee_error_module || '—')
                        : '—'}
                    </td>
                    <td className="px-3 py-3">{row.phat_sinh_kind_name || '—'}</td>
                    <td className="max-w-[220px] px-3 py-3">{(row.assignees || []).map((item) => item.full_name || item.email).filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-3 py-3">{row.created_by?.full_name || row.created_by?.email || '—'}</td>
                    <td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 font-semibold">{STATUS_LABELS[row.status] || row.status}</span></td>
                    <td className="whitespace-nowrap px-3 py-3">{formatDate(row.deadline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-sm">
            <span className="text-slate-500">Hiển thị {total ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))} className="h-8 rounded-lg border border-slate-200 px-3 font-semibold disabled:opacity-40">Trước</button>
              <span className="tabular-nums text-slate-600">{page + 1}/{totalPages}</span>
              <button type="button" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)} className="h-8 rounded-lg border border-slate-200 px-3 font-semibold disabled:opacity-40">Sau</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
