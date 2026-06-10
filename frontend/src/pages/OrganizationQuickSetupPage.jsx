import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import Modal from '../components/Modal';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { isCrmSystemAdmin, isCrmCompanyAdmin } from '../lib/crmAdminScope';
import {
  Building2,
  Layers,
  Plus,
  Loader2,
  Users,
  Briefcase,
  ExternalLink,
  RefreshCw,
  Shield,
  UserPlus,
} from 'lucide-react';
import { getInitials, avatarColor } from '../lib/utils';
import BulkStaffAssignPanel from '../components/BulkStaffAssignPanel';

const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Quản lý',
  region_admin: 'Admin KV',
  sales: 'KD',
  designer: 'TK',
  production: 'SX',
  driver: 'TX',
  installer: 'LĐ',
  customer_care: 'CSKH',
  staff: 'NV',
};

const ROLES = [
  ['admin', 'Admin'],
  ['manager', 'Quản lý'],
  ['region_admin', 'Admin khu vực'],
  ['sales', 'Kinh doanh'],
  ['designer', 'Thiết kế'],
  ['production', 'Sản xuất'],
  ['production_staff', 'NV Sản xuất (Admin CV+SX)'],
  ['production_admin', 'Admin Sản xuất'],
  ['crm_production_staff', 'NV CRM + Sản xuất'],
  ['crm_production_admin', 'Admin CRM + Sản xuất'],
  ['driver', 'Tài xế'],
  ['installer', 'Lắp đặt'],
  ['customer_care', 'CSKH'],
  ['staff', 'Nhân viên'],
];

function SectionCard({ icon: Icon, iconClass, title, subtitle, actions, children }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/90">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="px-4 py-4 sm:px-5 sm:py-5">{children}</div>
    </section>
  );
}

const selectCls =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100';

const inputCls =
  'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100';

function emptyDraftRow() {
  return { full_name: '', email: '' };
}

/**
 * /workspace/org-setup — một trang một luồng:
 * chọn khối → công ty → phòng ban → khu vực → nhập 1/nhiều nhân viên → gán quyền → tạo.
 */
export default function OrganizationQuickSetupPage() {
  const { user } = useAuth();
  const systemAdmin = isCrmSystemAdmin(user);
  const companyAdmin = isCrmCompanyAdmin(user);
  const canRegions = isAdminLike(user);

  const [divisions, setDivisions] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [filterDivision, setFilterDivision] = useState('');
  const [filterCompany, setFilterCompany] = useState('');

  const [regions, setRegions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);

  const [newDeptName, setNewDeptName] = useState('');
  const [addingDept, setAddingDept] = useState(false);

  const [regionModal, setRegionModal] = useState(null);
  const [regionForm, setRegionForm] = useState({ name: '', code: '', division_unit_id: '' });
  const [savingRegion, setSavingRegion] = useState(false);

  /** Phạm vi áp dụng cho đợt tạo nhân viên */
  const [batchDeptId, setBatchDeptId] = useState('');
  const [batchRegionIds, setBatchRegionIds] = useState([]);
  const [draftRows, setDraftRows] = useState([emptyDraftRow()]);
  const [assignRole, setAssignRole] = useState('staff');
  const [assignTeamId, setAssignTeamId] = useState('');
  const [assignPassword, setAssignPassword] = useState('123456');
  const [teams, setTeams] = useState([]);
  const [busyCreate, setBusyCreate] = useState(false);

  const effectiveCompanyId = useMemo(() => {
    if (companyAdmin && user?.company_id) return String(user.company_id);
    return filterCompany ? String(filterCompany) : '';
  }, [companyAdmin, user?.company_id, filterCompany]);

  const activeRegions = useMemo(() => regions.filter((r) => r.is_active !== false), [regions]);

  const loadDivisions = useCallback(() => {
    api.get('/ecosystem/units?level=1').then((r) => setDivisions(r.data?.units || [])).catch(() => setDivisions([]));
  }, []);

  const loadCompanies = useCallback(() => {
    const params = filterDivision ? { division_unit_id: filterDivision } : {};
    api
      .get('/companies', { params })
      .then((r) => setCompanies(r.data?.companies || []))
      .catch(() => setCompanies([]));
  }, [filterDivision]);

  const refreshData = useCallback(async () => {
    if (!effectiveCompanyId) {
      setRegions([]);
      setDepartments([]);
      setStaff([]);
      return;
    }
    setLoading(true);
    try {
      const divQ = filterDivision || undefined;
      const [rReg, rDept, rUsers] = await Promise.all([
        api.get('/crm/company-regions', { params: { company_id: effectiveCompanyId, division_unit_id: divQ } }),
        api.get('/departments', { params: { company_id: effectiveCompanyId, division_unit_id: divQ } }),
        api.get('/users', { params: { company_id: effectiveCompanyId } }),
      ]);
      const listReg = Array.isArray(rReg.data) ? rReg.data : [];
      setRegions(listReg);
      setDepartments(rDept.data?.departments || []);
      setStaff(rUsers.data?.users || []);
    } catch {
      setRegions([]);
      setDepartments([]);
      setStaff([]);
    }
    setLoading(false);
  }, [effectiveCompanyId, filterDivision]);

  useEffect(() => {
    loadDivisions();
  }, [loadDivisions]);

  useEffect(() => {
    if (!systemAdmin && companyAdmin && user?.company_id) {
      setFilterCompany(String(user.company_id));
    }
  }, [systemAdmin, companyAdmin, user?.company_id]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    if (!effectiveCompanyId) return;
    api
      .get(`/companies/${effectiveCompanyId}`)
      .then((r) => {
        const c = r.data?.company;
        const primary = c?.primary_division_unit_id || c?.division_unit_id || '';
        if (primary) setFilterDivision((prev) => prev || String(primary));
      })
      .catch(() => {});
  }, [effectiveCompanyId]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  /** Khi danh sách phòng ban đổi: bỏ chọn nếu không còn */
  useEffect(() => {
    if (!batchDeptId) return;
    if (!departments.some((d) => String(d.id) === String(batchDeptId))) {
      setBatchDeptId('');
      setAssignTeamId('');
    }
  }, [departments, batchDeptId]);

  /** Khu vực đã chọn: lọc bỏ id không còn trong danh sách */
  useEffect(() => {
    const ids = new Set(activeRegions.map((r) => String(r.id)));
    setBatchRegionIds((prev) => prev.filter((id) => ids.has(String(id))));
  }, [activeRegions]);

  useEffect(() => {
    if (!batchDeptId) {
      setTeams([]);
      setAssignTeamId('');
      return;
    }
    let cancelled = false;
    api
      .get(`/teams?department_id=${batchDeptId}`)
      .then((r) => {
        if (!cancelled) setTeams(r.data?.teams || []);
      })
      .catch(() => {
        if (!cancelled) setTeams([]);
      });
    return () => {
      cancelled = true;
    };
  }, [batchDeptId]);

  const toggleBatchRegion = (rid) => {
    const id = String(rid);
    setBatchRegionIds((prev) => {
      const cur = [...prev];
      const i = cur.findIndex((x) => String(x) === id);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(rid);
      return cur;
    });
  };

  const addDepartment = async () => {
    const name = newDeptName.trim();
    if (!name || !effectiveCompanyId) return;
    if (!filterDivision) {
      alert('Chọn Khối (hoặc đợi đồng bộ từ công ty) để gán phòng ban đúng khối.');
      return;
    }
    setAddingDept(true);
    try {
      await api.post('/departments', {
        name,
        company_id: effectiveCompanyId,
        division_unit_id: filterDivision,
        color: '#6366F1',
      });
      setNewDeptName('');
      await refreshData();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không tạo được phòng ban');
    }
    setAddingDept(false);
  };

  const openRegionCreate = () => {
    setRegionModal('create');
    setRegionForm({ name: '', code: '', division_unit_id: filterDivision || '' });
  };

  const submitRegion = async (e) => {
    e.preventDefault();
    if (!canRegions) return;
    if (!effectiveCompanyId || !regionForm.name?.trim()) return;
    setSavingRegion(true);
    try {
      if (regionModal === 'create') {
        await api.post('/crm/company-regions', {
          company_id: effectiveCompanyId,
          name: regionForm.name.trim(),
          code: regionForm.code?.trim() || null,
          division_unit_id: regionForm.division_unit_id || null,
        });
      } else if (regionModal?.id) {
        await api.patch(`/crm/company-regions/${regionModal.id}`, {
          name: regionForm.name.trim(),
          code: regionForm.code?.trim() || null,
          division_unit_id: regionForm.division_unit_id || null,
        });
      }
      setRegionModal(null);
      await refreshData();
    } catch (err) {
      alert(err.response?.data?.error || 'Không lưu được');
    }
    setSavingRegion(false);
  };

  const toggleRegionActive = async (row) => {
    if (!canRegions) return;
    const next = !row.is_active;
    if (!confirm(next ? `Bật khu vực «${row.name}»?` : `Ẩn khu vực «${row.name}»?`)) return;
    try {
      await api.patch(`/crm/company-regions/${row.id}`, { is_active: next });
      await refreshData();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi');
    }
  };

  const submitCreates = async () => {
    const rows = draftRows.filter((r) => r.full_name?.trim() && r.email?.trim());
    if (!rows.length) {
      alert('Thêm ít nhất một dòng có họ tên và email.');
      return;
    }
    if (!effectiveCompanyId) {
      alert('Chọn công ty trước.');
      return;
    }
    if (batchRegionIds.length && !batchDeptId) {
      alert('Chọn phòng ban trước khi gán khu vực CRM.');
      return;
    }
    setBusyCreate(true);
    let ok = 0;
    let fail = 0;
    const errs = [];
    for (const row of rows) {
      try {
        await api.post('/users', {
          full_name: row.full_name.trim(),
          email: row.email.trim().toLowerCase(),
          password: assignPassword || '123456',
          department_id: batchDeptId || null,
          team_id: assignTeamId || null,
          role: assignRole || 'staff',
          crm_region_ids: batchRegionIds,
        });
        ok++;
      } catch (e) {
        fail++;
        errs.push(`${row.email}: ${e.response?.data?.error || e.message}`);
      }
    }
    setBusyCreate(false);
    alert(`Đã tạo: ${ok} tài khoản${fail ? `, ${fail} lỗi` : ''}${errs.length ? `\n${errs.slice(0, 6).join('\n')}` : ''}`);
    setDraftRows([emptyDraftRow()]);
    await refreshData();
  };

  const scopeReady = !!effectiveCompanyId && !!batchDeptId;

  return (
    <div className="min-h-[calc(100vh-5rem)]">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/90">
              <Briefcase className="h-6 w-6 text-slate-700" strokeWidth={1.5} />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl drop-shadow-sm" style={{ color: '#ffffff' }}>Thiết lập tổ chức nhanh</h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed drop-shadow-sm" style={{ color: '#ffffff' }}>
                Chọn khối → công ty → phòng ban → khu vực; nhập một hoặc nhiều nhân viên; gán quyền; bấm tạo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => refreshData()}
            className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 sm:self-auto"
          >
            <RefreshCw className="h-4 w-4 text-slate-500" /> Tải lại dữ liệu
          </button>
        </header>

        <ol className="space-y-8">
          {/* 1 · Phạm vi */}
          <li className="relative">
            <span className="absolute -left-3 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white sm:-left-10">
              1
            </span>
            <SectionCard
              icon={Layers}
              iconClass="bg-slate-900 text-white"
              title="Chọn khối, công ty, phòng ban và khu vực"
              subtitle="Đây là phạm vi áp dụng cho các tài khoản bạn sẽ tạo bên dưới."
              actions={
                loading ? (
                  <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải…
                  </span>
                ) : null
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {systemAdmin ? (
                  <>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-slate-600">Khối</span>
                      <select
                        value={filterDivision}
                        onChange={(e) => {
                          setFilterDivision(e.target.value);
                          setFilterCompany('');
                          setBatchDeptId('');
                        }}
                        className={selectCls}
                      >
                        <option value="">— Chọn khối —</option>
                        {divisions.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.level?.icon} {d.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-slate-600">Công ty</span>
                      <select
                        value={filterCompany}
                        onChange={(e) => setFilterCompany(e.target.value)}
                        className={selectCls}
                      >
                        <option value="">— Chọn công ty —</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.short_name || c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <p className="sm:col-span-2 text-sm leading-relaxed text-slate-600">
                    <Building2 className="mr-1 inline h-4 w-4 align-text-bottom text-slate-400" />
                    Công ty cố định theo tài khoản của bạn. Chi tiết tại{' '}
                    <Link to="/companies" className="font-medium text-sky-700 underline-offset-2 hover:underline">
                      Danh sách công ty
                    </Link>
                    .
                  </p>
                )}
              </div>

              {!effectiveCompanyId && (
                <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {systemAdmin ? 'Chọn công ty để tiếp tục.' : 'Không xác định được công ty.'}
                </div>
              )}

              {effectiveCompanyId && (
                <>
                  <div className="mt-6 border-t border-slate-100 pt-6">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Phòng ban (bắt buộc để gán khu vực CRM)</p>
                    <label className="flex max-w-xl flex-col gap-1.5">
                      <span className="text-xs font-medium text-slate-600">Phòng ban</span>
                      <select
                        value={batchDeptId}
                        onChange={(e) => {
                          setBatchDeptId(e.target.value);
                          setAssignTeamId('');
                        }}
                        className={selectCls}
                      >
                        <option value="">— Chọn phòng ban —</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                      <label className="min-w-[min(100%,240px)] flex-1 flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-slate-600">Tạo phòng ban nhanh</span>
                        <input
                          value={newDeptName}
                          onChange={(e) => setNewDeptName(e.target.value)}
                          placeholder="Ví dụ: Kinh doanh"
                          className={inputCls}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={addingDept || !newDeptName.trim() || !filterDivision}
                        onClick={addDepartment}
                        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {addingDept ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Tạo phòng ban
                      </button>
                    </div>
                    {!filterDivision && (
                      <p className="mt-2 text-xs text-amber-800">Chọn khối để gán đúng khối cho phòng ban mới.</p>
                    )}
                  </div>

                  <div className="mt-6 border-t border-slate-100 pt-6">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Khu vực CRM</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">Chọn một hoặc nhiều khu vực áp dụng cho nhân viên mới.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {canRegions && (
                          <button
                            type="button"
                            onClick={openRegionCreate}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"
                          >
                            <Plus className="h-3.5 w-3.5" /> Thêm khu vực
                          </button>
                        )}
                        <Link
                          to="/tasks/regions"
                          className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-sky-700 hover:bg-sky-50"
                        >
                          Trang đầy đủ <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                        </Link>
                      </div>
                    </div>
                    {!canRegions && (
                      <p className="mb-3 text-xs text-slate-500">
                        Chỉ admin hệ thống thêm/sửa khu vực; bạn vẫn có thể chọn khu vực đã có.
                      </p>
                    )}
                    {loading ? (
                      <div className="flex gap-2 py-6 text-sm text-slate-500">
                        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải…
                      </div>
                    ) : activeRegions.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                        Chưa có khu vực. {canRegions ? 'Bấm «Thêm khu vực» hoặc đợi admin cấu hình.' : ''}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {activeRegions.map((r) => {
                          const checked = batchRegionIds.some((x) => String(x) === String(r.id));
                          return (
                            <label
                              key={r.id}
                              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                checked ? 'border-sky-400 bg-sky-50 text-sky-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleBatchRegion(r.id)}
                                className="rounded border-slate-300 text-sky-600"
                              />
                              {r.name}
                              {r.code ? <span className="text-slate-400">({r.code})</span> : null}
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {regions.some((r) => r.is_active === false) && canRegions && (
                      <details className="mt-4 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                        <summary className="cursor-pointer font-medium text-slate-700">Khu vực đã ẩn</summary>
                        <ul className="mt-2 space-y-1">
                          {regions
                            .filter((r) => r.is_active === false)
                            .map((r) => (
                              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                                <span>{r.name}</span>
                                <button
                                  type="button"
                                  onClick={() => toggleRegionActive(r)}
                                  className="text-sky-700 hover:underline"
                                >
                                  Bật lại
                                </button>
                              </li>
                            ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </>
              )}
            </SectionCard>
          </li>

          {/* 2 · Nhập nhân viên */}
          <li className="relative opacity-100">
            <span
              className={`absolute -left-3 top-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold sm:-left-10 ${
                effectiveCompanyId ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              2
            </span>
            <SectionCard
              icon={UserPlus}
              iconClass="bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"
              title="Nhập một hoặc nhiều nhân viên mới"
              subtitle="Mỗi dòng: họ tên và email. Mật khẩu dùng chung ở bước gán quyền (mặc định 123456)."
            >
              {!effectiveCompanyId ? (
                <p className="text-sm text-slate-500">Hoàn tất bước 1 (chọn công ty) để nhập.</p>
              ) : (
                <div className="space-y-4">
                  {draftRows.map((row, idx) => (
                    <div
                      key={idx}
                      className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 sm:grid-cols-2 sm:items-end"
                    >
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-600">Họ tên</span>
                        <input
                          value={row.full_name}
                          onChange={(e) =>
                            setDraftRows((rs) => rs.map((r, i) => (i === idx ? { ...r, full_name: e.target.value } : r)))
                          }
                          className={inputCls}
                          placeholder="Nguyễn Văn A"
                        />
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <label className="min-w-0 flex-1 flex flex-col gap-1">
                          <span className="text-xs font-medium text-slate-600">Email</span>
                          <input
                            type="email"
                            value={row.email}
                            onChange={(e) =>
                              setDraftRows((rs) => rs.map((r, i) => (i === idx ? { ...r, email: e.target.value } : r)))
                            }
                            className={inputCls}
                            placeholder="a@congty.vn"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setDraftRows((rs) => rs.filter((_, i) => i !== idx))}
                          disabled={draftRows.length <= 1}
                          className="h-10 shrink-0 rounded-lg px-3 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          Xóa dòng
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDraftRows((rs) => [...rs, emptyDraftRow()])}
                    className="text-sm font-medium text-sky-700 hover:underline"
                  >
                    + Thêm dòng nhân viên
                  </button>
                </div>
              )}
            </SectionCard>
          </li>

          {/* 3 · Gán quyền */}
          <li className="relative">
            <span
              className={`absolute -left-3 top-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold sm:-left-10 ${
                scopeReady ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              3
            </span>
            <SectionCard
              icon={Shield}
              iconClass="bg-amber-50 text-amber-700 ring-1 ring-amber-100"
              title="Gán quyền"
              subtitle="Vai trò, team (theo phòng ban đã chọn), mật khẩu đăng nhập lần đầu. Khu vực CRM đã chọn ở bước 1."
            >
              {!effectiveCompanyId ? (
                <p className="text-sm text-slate-500">Chọn công ty trước.</p>
              ) : !batchDeptId ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Chọn <strong>phòng ban</strong> ở bước 1 để có team và để gán khu vực CRM hợp lệ.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-slate-600">Vai trò</span>
                    <select value={assignRole} onChange={(e) => setAssignRole(e.target.value)} className={selectCls}>
                      {ROLES.map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-slate-600">Team</span>
                    <select
                      value={assignTeamId}
                      onChange={(e) => setAssignTeamId(e.target.value)}
                      className={selectCls}
                      disabled={!batchDeptId}
                    >
                      <option value="">— Không —</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="sm:col-span-2 flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-slate-600">Mật khẩu mặc định (tất cả tài khoản tạo trong lần này)</span>
                    <input
                      type="password"
                      value={assignPassword}
                      onChange={(e) => setAssignPassword(e.target.value)}
                      className={inputCls}
                      autoComplete="new-password"
                    />
                  </label>
                </div>
              )}
            </SectionCard>
          </li>

          {/* 4 · Tạo */}
          <li className="relative">
            <span className="absolute -left-3 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white sm:-left-10">
              4
            </span>
            <section className="overflow-hidden rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 shadow-sm ring-1 ring-emerald-100">
              <div className="px-4 py-4 sm:px-5 sm:py-5">
                <h2 className="text-[15px] font-semibold text-emerald-950">Tạo tài khoản</h2>
                <p className="mt-1 text-xs leading-relaxed text-emerald-900/80">
                  Gửi yêu cầu tạo user theo các dòng đã nhập, với phạm vi và quyền ở trên. Cần quyền admin hoặc quản lý trên hệ thống.
                </p>
                <button
                  type="button"
                  disabled={busyCreate || !effectiveCompanyId || !draftRows.some((r) => r.full_name?.trim() && r.email?.trim())}
                  onClick={submitCreates}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                >
                  {busyCreate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                  Tạo{' '}
                  {draftRows.filter((r) => r.full_name?.trim() && r.email?.trim()).length || 0} tài khoản
                </button>
              </div>
            </section>
          </li>
        </ol>

        {effectiveCompanyId && staff.length > 0 && (
          <div className="mt-10">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Nhân viên hiện có (xem nhanh)</p>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-100 bg-white p-2">
              {staff.slice(0, 12).map((u) => (
                <li key={u.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: avatarColor(u.full_name) }}
                  >
                    {getInitials(u.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{u.full_name}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {u.email} · {ROLE_LABELS[u.role] || u.role}
                      {u.department?.name ? ` · ${u.department.name}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {staff.length > 12 && (
              <p className="mt-2 text-center text-[11px] text-slate-400">
                Hiển thị 12/{staff.length} —{' '}
                <Link to="/users" className="font-medium text-sky-700 hover:underline">
                  xem tất cả
                </Link>
              </p>
            )}
          </div>
        )}

        {effectiveCompanyId && (
          <details className="mt-12 rounded-2xl border border-slate-200 bg-white shadow-sm open:ring-1 open:ring-slate-100">
            <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold text-slate-800 sm:px-5 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-2">
                Nâng cao: cập nhật nhân viên đã có (hàng loạt)
                <span className="text-xs font-normal text-slate-500">Mở rộng</span>
              </span>
            </summary>
            <div className="border-t border-slate-100 px-2 pb-4 pt-2 sm:px-4">
              <BulkStaffAssignPanel
                companyId={effectiveCompanyId}
                divisionUnitId={filterDivision || undefined}
                onDone={refreshData}
              />
            </div>
          </details>
        )}
      </div>

      <Modal
        open={!!regionModal}
        onClose={() => setRegionModal(null)}
        title={regionModal === 'create' ? 'Thêm khu vực CRM' : 'Sửa khu vực CRM'}
      >
        <form onSubmit={submitRegion} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tên khu vực *</label>
            <input
              value={regionForm.name}
              onChange={(e) => setRegionForm((f) => ({ ...f, name: e.target.value }))}
              className="h-10 w-full rounded-lg border px-3 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Mã (tuỳ chọn)</label>
            <input
              value={regionForm.code}
              onChange={(e) => setRegionForm((f) => ({ ...f, code: e.target.value }))}
              className="h-10 w-full rounded-lg border px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Khối (HST)</label>
            <select
              value={regionForm.division_unit_id || ''}
              onChange={(e) => setRegionForm((f) => ({ ...f, division_unit_id: e.target.value }))}
              className="h-10 w-full rounded-lg border px-3 text-sm"
            >
              <option value="">— Mặc định công ty —</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setRegionModal(null)} className="h-9 cursor-pointer rounded-lg bg-gray-100 px-4 text-sm">
              Hủy
            </button>
            <button
              type="submit"
              disabled={savingRegion || !canRegions}
              className="h-9 cursor-pointer rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {savingRegion ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
