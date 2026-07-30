import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import {
  Users, Loader2, ChevronDown, ChevronRight, CheckSquare, Square,
} from 'lucide-react';

const ROLES = [
  ['admin', 'Admin'],
  ['manager', 'Quản lý'],
  ['region_admin', 'Admin khu vực'],
  ['sales', 'Kinh doanh'],
  ['designer', 'Thiết kế'],
  ['production', 'Sản xuất'],
  ['driver', 'Tài xế'],
  ['installer', 'Lắp đặt'],
  ['customer_care', 'CSKH'],
  ['accounting', 'Kế toán'],
  ['staff', 'Nhân viên'],
];

function emptyDraft() {
  return {
    full_name: '',
    email: '',
    department_id: '',
    team_id: '',
    role: '',
    crm_region_ids: null,
  };
}

function draftDept(d, shared) {
  return d.department_id || shared.department_id || '';
}

/** '' | null = dùng giá trị chung */
function pick(shared, row, field) {
  const v = row[field];
  if (v !== undefined && v !== null && v !== '') return v;
  return shared[field];
}

function pickRegions(shared, row) {
  if (row.crm_region_ids !== undefined && row.crm_region_ids !== null && Array.isArray(row.crm_region_ids)) {
    return row.crm_region_ids;
  }
  return shared.crm_region_ids || [];
}

const fld =
  'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100 disabled:bg-slate-50 disabled:text-slate-400';

/**
 * Gán hàng loạt: thiết lập chung + tuỳ chỉnh từng nhân viên (PB, team, vai trò, khu vực CRM).
 * - Cập nhật người đã có: PUT /users/:id
 * - Tạo mới: POST /users
 */
export default function BulkStaffAssignPanel({ companyId, divisionUnitId, onDone }) {
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [staff, setStaff] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [teamsByDept, setTeamsByDept] = useState({});
  const [crmRegions, setCrmRegions] = useState([]);

  const [shared, setShared] = useState({
    department_id: '',
    team_id: '',
    role: 'staff',
    crm_region_ids: [],
    password: '123456',
  });

  const [selectedIds, setSelectedIds] = useState({});
  const [overrides, setOverrides] = useState({});
  const [draftCreates, setDraftCreates] = useState([emptyDraft()]);
  const [advExisting, setAdvExisting] = useState(false);
  const [advCreate, setAdvCreate] = useState(false);

  const [busyUpdate, setBusyUpdate] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);

  const loadTeams = useCallback(async (deptId) => {
    if (!deptId || teamsByDept[deptId]) return;
    try {
      const { data } = await api.get(`/teams?department_id=${deptId}`);
      setTeamsByDept((prev) => ({ ...prev, [deptId]: data?.teams || [] }));
    } catch {
      setTeamsByDept((prev) => ({ ...prev, [deptId]: [] }));
    }
  }, [teamsByDept]);

  useEffect(() => {
    if (!companyId) {
      setStaff([]);
      setDepartments([]);
      setCrmRegions([]);
      setLoadingMeta(false);
      return;
    }
    let cancelled = false;
    setLoadingMeta(true);
    Promise.all([
      api.get('/users', { params: { company_id: companyId } }),
      api.get('/departments', {
        params: { company_id: companyId, division_unit_id: divisionUnitId || undefined },
      }),
      api.get('/crm/company-regions', {
        params: { company_id: companyId, division_unit_id: divisionUnitId || undefined },
      }),
    ])
      .then(([u, d, r]) => {
        if (cancelled) return;
        setStaff(u.data?.users || []);
        setDepartments(d.data?.departments || []);
        const list = Array.isArray(r.data) ? r.data : [];
        setCrmRegions(list.filter((x) => x.is_active !== false));
      })
      .catch(() => {
        if (!cancelled) {
          setStaff([]);
          setDepartments([]);
          setCrmRegions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, divisionUnitId]);

  useEffect(() => {
    if (shared.department_id) loadTeams(shared.department_id);
  }, [shared.department_id, loadTeams]);

  const sharedTeams = useMemo(() => {
    if (!shared.department_id) return [];
    return teamsByDept[shared.department_id] || [];
  }, [shared.department_id, teamsByDept]);

  const selectedCount = useMemo(
    () => Object.keys(selectedIds).filter((id) => selectedIds[id]).length,
    [selectedIds],
  );

  const toggleSelect = (id) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAll = () => {
    const next = {};
    staff.forEach((u) => {
      next[u.id] = true;
    });
    setSelectedIds(next);
  };

  const selectNone = () => setSelectedIds({});

  const setOverride = (userId, patch) => {
    setOverrides((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] || {}), ...patch },
    }));
  };

  const toggleSharedRegion = (rid) => {
    const id = String(rid);
    setShared((s) => {
      const cur = Array.isArray(s.crm_region_ids) ? [...s.crm_region_ids] : [];
      const i = cur.findIndex((x) => String(x) === id);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(rid);
      return { ...s, crm_region_ids: cur };
    });
  };

  const toggleRowRegion = (userId, rid, isDraftIdx) => {
    const ridStr = String(rid);
    if (isDraftIdx !== undefined && isDraftIdx !== null) {
      setDraftCreates((rows) =>
        rows.map((row, idx) => {
          if (idx !== isDraftIdx) return row;
          let cur;
          if (Array.isArray(row.crm_region_ids)) cur = [...row.crm_region_ids];
          else cur = [...(shared.crm_region_ids || [])];
          const j = cur.findIndex((x) => String(x) === ridStr);
          if (j >= 0) cur.splice(j, 1);
          else cur.push(rid);
          return { ...row, crm_region_ids: cur };
        }),
      );
      return;
    }
    if (!userId) return;
    setOverrides((prev) => {
      const o = prev[userId] || {};
      let base;
      if (Array.isArray(o.crm_region_ids)) base = [...o.crm_region_ids];
      else base = [...(shared.crm_region_ids || [])];
      const j = base.findIndex((x) => String(x) === ridStr);
      if (j >= 0) base.splice(j, 1);
      else base.push(rid);
      return { ...prev, [userId]: { ...o, crm_region_ids: base } };
    });
  };

  const applyBulkUpdate = async () => {
    const ids = Object.keys(selectedIds).filter((id) => selectedIds[id]);
    if (!ids.length) return alert('Chọn ít nhất một nhân viên');
    setBusyUpdate(true);
    let ok = 0;
    let fail = 0;
    const errs = [];
    for (const id of ids) {
      const o = overrides[id] || {};
      const department_id = pick(shared, o, 'department_id') || null;
      const team_id = pick(shared, o, 'team_id') || null;
      const role = pick(shared, o, 'role') || 'staff';
      const crm_region_ids = pickRegions(shared, o);
      if (crm_region_ids.length && !department_id) {
        fail++;
        errs.push(`${id}: cần phòng ban để gán khu vực CRM`);
        continue;
      }
      try {
        await api.put(`/users/${id}`, {
          department_id,
          team_id,
          role,
          crm_region_ids,
        });
        ok++;
      } catch (e) {
        fail++;
        errs.push(e.response?.data?.error || e.message || id);
      }
    }
    setBusyUpdate(false);
    if (errs.length) console.warn(errs);
    alert(`Cập nhật xong: ${ok} thành công${fail ? `, ${fail} lỗi` : ''}${errs.length ? `\n${errs.slice(0, 5).join('\n')}` : ''}`);
    onDone?.();
    setSelectedIds({});
    setOverrides({});
  };

  const applyBulkCreate = async () => {
    const rows = draftCreates.filter((r) => r.full_name?.trim() && r.email?.trim());
    if (!rows.length) return alert('Thêm ít nhất một dòng có họ tên và email');
    setBusyCreate(true);
    let ok = 0;
    let fail = 0;
    const errs = [];
    for (const row of rows) {
      const department_id = (row.department_id || shared.department_id) || null;
      const team_id = (row.team_id !== undefined && row.team_id !== '' ? row.team_id : shared.team_id) || null;
      const role = (row.role || shared.role) || 'staff';
      const crm_region_ids =
        row.crm_region_ids !== undefined && row.crm_region_ids !== null && Array.isArray(row.crm_region_ids)
          ? row.crm_region_ids
          : shared.crm_region_ids || [];
      if (crm_region_ids.length && !department_id) {
        fail++;
        errs.push(`${row.email}: cần phòng ban để gán khu vực`);
        continue;
      }
      try {
        await api.post('/users', {
          full_name: row.full_name.trim(),
          email: row.email.trim().toLowerCase(),
          password: shared.password || '123456',
          department_id,
          team_id,
          role,
          crm_region_ids,
        });
        ok++;
      } catch (e) {
        fail++;
        errs.push(`${row.email}: ${e.response?.data?.error || e.message}`);
      }
    }
    setBusyCreate(false);
    alert(`Tạo xong: ${ok} tài khoản${fail ? `, ${fail} lỗi` : ''}${errs.length ? `\n${errs.slice(0, 8).join('\n')}` : ''}`);
    setDraftCreates([emptyDraft()]);
    onDone?.();
  };

  if (!companyId) return null;

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/90">
      <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <Users className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">Nhân viên hàng loạt</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Thiết lập chung rồi cập nhật nhiều người hoặc tạo nhiều tài khoản; mở tuỳ chỉnh để gán khác nhau từng người.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-8 px-4 py-5 sm:px-5 sm:py-6">
        {loadingMeta ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> Đang tải…
          </div>
        ) : (
          <>
            {/* Thiết lập chung */}
            <div className="rounded-2xl bg-slate-50/90 p-4 ring-1 ring-slate-100 sm:p-5">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">1 · Áp dụng chung</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-600">Phòng ban</span>
                  <select
                    value={shared.department_id}
                    onChange={(e) => {
                      const v = e.target.value;
                      setShared((s) => ({ ...s, department_id: v, team_id: '' }));
                      if (v) loadTeams(v);
                    }}
                    className={fld}
                  >
                    <option value="">— Chọn —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-600">Team</span>
                  <select
                    value={shared.team_id}
                    onChange={(e) => setShared((s) => ({ ...s, team_id: e.target.value }))}
                    className={fld}
                    disabled={!shared.department_id}
                  >
                    <option value="">— Không —</option>
                    {sharedTeams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-600">Vai trò</span>
                  <select
                    value={shared.role}
                    onChange={(e) => setShared((s) => ({ ...s, role: e.target.value }))}
                    className={fld}
                  >
                    {ROLES.map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-600">Mật khẩu (tạo mới)</span>
                  <input
                    value={shared.password}
                    onChange={(e) => setShared((s) => ({ ...s, password: e.target.value }))}
                    className={fld}
                    placeholder="123456"
                  />
                </label>
              </div>
              <div className="mt-4 border-t border-slate-200/80 pt-4">
                <span className="mb-2 block text-xs font-medium text-slate-600">Khu vực CRM</span>
                {crmRegions.length === 0 ? (
                  <p className="text-xs text-amber-800">Chưa có khu vực — thêm ở mục «Khu vực CRM» phía trên.</p>
                ) : (
                  <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
                    {crmRegions.map((reg) => {
                      const checked = (shared.crm_region_ids || []).some((x) => String(x) === String(reg.id));
                      return (
                        <label
                          key={reg.id}
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                            checked
                              ? 'border-sky-300 bg-sky-50 text-sky-900'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSharedRegion(reg.id)}
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          />
                          {reg.name}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Cập nhật người hiện có */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">2 · Cập nhật đã có</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{staff.length} nhân viên</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="rounded-lg px-2.5 py-1.5 font-medium text-sky-700 hover:bg-sky-50"
                  >
                    Chọn tất cả
                  </button>
                  <button
                    type="button"
                    onClick={selectNone}
                    className="rounded-lg px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Bỏ chọn
                  </button>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                    Đã chọn {selectedCount}
                  </span>
                </div>
              </div>
              {staff.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                  Chưa có nhân viên trong phạm vi công ty này.
                </p>
              ) : (
                <>
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="max-h-56 overflow-auto">
                      <table className="min-w-full text-xs">
                        <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="w-11 px-3 py-2" />
                            <th className="px-3 py-2">Họ tên</th>
                            <th className="hidden px-3 py-2 sm:table-cell">Email</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {staff.map((u) => (
                            <tr key={u.id} className="hover:bg-slate-50/80">
                              <td className="px-3 py-2 align-middle">
                                <button
                                  type="button"
                                  onClick={() => toggleSelect(u.id)}
                                  className="flex text-slate-500 hover:text-slate-800"
                                  aria-label="Chọn"
                                >
                                  {selectedIds[u.id] ? (
                                    <CheckSquare className="h-4 w-4 text-sky-600" />
                                  ) : (
                                    <Square className="h-4 w-4" />
                                  )}
                                </button>
                              </td>
                              <td className="px-3 py-2 font-medium text-slate-900">{u.full_name}</td>
                              <td className="hidden max-w-[200px] truncate px-3 py-2 text-slate-500 sm:table-cell">{u.email}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAdvExisting((v) => !v)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 sm:w-auto sm:justify-start"
                  >
                    <span className="flex items-center gap-2">
                      {advExisting ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                      Tuỳ chỉnh từng người đã chọn
                    </span>
                    <span className="text-[10px] font-normal text-slate-400">PB · Team · Vai trò · KV</span>
                  </button>

                  {advExisting && selectedCount > 0 && (
                    <div className="space-y-3 rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
                      <p className="text-[11px] leading-relaxed text-slate-600">
                        Áp dụng cho <strong className="text-slate-900">{selectedCount}</strong> người. «— Chung —» = dùng mục «Áp dụng chung».
                      </p>
                      <div className="max-h-[min(360px,50vh)] space-y-3 overflow-y-auto pr-1">
                        {staff
                          .filter((u) => selectedIds[u.id])
                          .map((u) => (
                            <UserOverrideRow
                              key={u.id}
                              user={u}
                              shared={shared}
                              departments={departments}
                              teamsByDept={teamsByDept}
                              crmRegions={crmRegions}
                              override={overrides[u.id] || {}}
                              onChange={(patch) => setOverride(u.id, patch)}
                              onToggleRegion={(rid) => toggleRowRegion(u.id, rid, undefined)}
                              loadTeams={loadTeams}
                            />
                          ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={busyUpdate || !selectedCount}
                    onClick={applyBulkUpdate}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busyUpdate ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Cập nhật đã chọn ({selectedCount})
                  </button>
                </>
              )}
            </div>

            {/* Tạo mới nhiều người */}
            <div className="space-y-4 border-t border-slate-200 pt-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">3 · Tạo mới hàng loạt</p>
                <p className="mt-1 text-sm text-slate-600">
                  Mỗi dòng: họ tên + email. Cột trống dùng giá trị chung; mật khẩu theo mục trên.
                </p>
              </div>
              <div className="space-y-3">
                {draftCreates.map((row, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Dòng {idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => setDraftCreates((rs) => rs.filter((_, i) => i !== idx))}
                        disabled={draftCreates.length <= 1}
                        className="text-[11px] font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        Xóa dòng
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-600">Họ tên *</span>
                        <input
                          value={row.full_name}
                          onChange={(e) =>
                            setDraftCreates((rs) => rs.map((r, i) => (i === idx ? { ...r, full_name: e.target.value } : r)))
                          }
                          className={fld}
                          placeholder="Nguyễn Văn A"
                        />
                      </label>
                      <label className="flex flex-col gap-1 sm:col-span-1">
                        <span className="text-xs font-medium text-slate-600">Email *</span>
                        <input
                          value={row.email}
                          onChange={(e) =>
                            setDraftCreates((rs) => rs.map((r, i) => (i === idx ? { ...r, email: e.target.value } : r)))
                          }
                          className={fld}
                          placeholder="a@company.vn"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-600">Phòng ban</span>
                        <select
                          value={row.department_id}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftCreates((rs) =>
                              rs.map((r, i) => (i === idx ? { ...r, department_id: v, team_id: '' } : r)),
                            );
                            if (v) loadTeams(v);
                          }}
                          className={fld}
                        >
                          <option value="">— Chung —</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-600">Vai trò</span>
                        <select
                          value={row.role}
                          onChange={(e) =>
                            setDraftCreates((rs) => rs.map((r, i) => (i === idx ? { ...r, role: e.target.value } : r)))
                          }
                          className={fld}
                        >
                          <option value="">— Chung —</option>
                          {ROLES.map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-600">Team</span>
                        <select
                          value={row.team_id}
                          onChange={(e) =>
                            setDraftCreates((rs) => rs.map((r, i) => (i === idx ? { ...r, team_id: e.target.value } : r)))
                          }
                          className={fld}
                          disabled={!draftDept(row, shared)}
                        >
                          <option value="">— Chung —</option>
                          {(teamsByDept[draftDept(row, shared)] || []).map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setDraftCreates((rs) => [...rs, emptyDraft()])}
                className="text-sm font-medium text-sky-700 hover:underline"
              >
                + Thêm dòng
              </button>

              <button
                type="button"
                onClick={() => setAdvCreate((v) => !v)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 sm:w-auto"
              >
                <span className="flex items-center gap-2">
                  {advCreate ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                  Khu vực CRM theo từng dòng
                </span>
                <span className="text-[10px] font-normal text-slate-400">Tùy chọn</span>
              </button>
              {advCreate && (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                  {draftCreates.map((row, idx) => (
                    <div
                      key={`kv-${idx}`}
                      className="flex flex-col gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start"
                    >
                      <span className="w-full shrink-0 text-xs font-medium text-slate-700 sm:w-36">
                        {row.email?.trim() || `Dòng ${idx + 1}`}
                      </span>
                      <div className="flex flex-1 flex-wrap gap-1.5">
                        {crmRegions.map((reg) => {
                          const base =
                            row.crm_region_ids !== undefined && row.crm_region_ids !== null
                              ? row.crm_region_ids
                              : shared.crm_region_ids || [];
                          const checked = base.some((x) => String(x) === String(reg.id));
                          return (
                            <label
                              key={reg.id}
                              className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[11px] ${
                                checked ? 'border-sky-300 bg-sky-50 text-sky-900' : 'border-slate-200 text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleRowRegion(null, reg.id, idx)}
                                className="rounded border-slate-300 text-sky-600"
                              />
                              {reg.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={busyCreate}
                onClick={applyBulkCreate}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busyCreate ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Tạo các tài khoản
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function UserOverrideRow({
  user,
  shared,
  departments,
  teamsByDept,
  crmRegions,
  override,
  onChange,
  onToggleRegion,
  loadTeams,
}) {
  const deptId = override.department_id !== undefined && override.department_id !== ''
    ? override.department_id
    : shared.department_id;
  const teams = deptId ? teamsByDept[deptId] || [] : [];

  useEffect(() => {
    if (deptId) loadTeams(deptId);
  }, [deptId, loadTeams]);

  return (
    <div className="rounded-xl border border-white bg-white p-3 shadow-sm ring-1 ring-slate-100">
      <p className="mb-3 border-b border-slate-100 pb-2 text-xs font-semibold text-slate-900">{user.full_name}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-600">Phòng ban</span>
          <select
            value={override.department_id !== undefined ? override.department_id : ''}
            onChange={(e) => {
              const v = e.target.value;
              onChange({
                department_id: v,
                team_id: '',
              });
              if (v) loadTeams(v);
            }}
            className={`${fld} !h-8 text-xs`}
          >
            <option value="">— Chung —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-600">Team</span>
          <select
            value={override.team_id !== undefined ? override.team_id : ''}
            onChange={(e) => onChange({ team_id: e.target.value })}
            className={`${fld} !h-8 text-xs`}
            disabled={!deptId}
          >
            <option value="">— Chung —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-600">Vai trò</span>
          <select
            value={override.role !== undefined ? override.role : ''}
            onChange={(e) => onChange({ role: e.target.value })}
            className={`${fld} !h-8 text-xs`}
          >
            <option value="">— Chung —</option>
            {ROLES.map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3">
        <span className="mb-2 block text-[11px] font-medium text-slate-600">Khu vực CRM</span>
        <div className="flex flex-wrap gap-1.5">
          {crmRegions.map((reg) => {
            const merged = pickRegions(shared, override);
            const checked = merged.some((x) => String(x) === String(reg.id));
            return (
              <label
                key={reg.id}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[11px] ${
                  checked ? 'border-sky-300 bg-sky-50 text-sky-900' : 'border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleRegion(reg.id)}
                  className="rounded border-slate-300 text-sky-600"
                />
                {reg.name}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
