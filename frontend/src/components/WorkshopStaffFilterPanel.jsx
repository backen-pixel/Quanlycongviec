/**
 * Bộ lọc nhân viên (công ty → khu vực → NV) — đồng bộ UI với CRM dashboard.
 */
export default function WorkshopStaffFilterPanel({
  isAdmin,
  isCompanyScopedAdmin,
  userCompanyId,
  companies = [],
  filterCompany,
  onCompanyChange,
  dashboardScopeCompanyId,
  companyRegions = [],
  filterRegion,
  setFilterRegion,
  assigneeListSearch,
  setAssigneeListSearch,
  filterPersonId,
  setFilterPersonId,
  setFilterPersonName,
  employeeOptionsForSelect = [],
  companyDepts = [],
  filterPersonName,
  employeeFilterListByRegion = [],
  companyEmployees = [],
  personSelectLabel = 'Chọn NV',
  ringFocusClass = 'focus:ring-blue-500',
  hidePersonSelect = false,
  hidePersonName = false,
  hideCompanySelect = false,
  hideAssigneeSearch = false,
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 space-y-3">
      <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
        Lọc nhân viên (công ty → khu vực → NV)
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {isAdmin && !isCompanyScopedAdmin && !hideCompanySelect && companies.length > 0 && (
          <div className="flex flex-col gap-0.5 min-w-[10rem]">
            <label className="text-[10px] text-slate-600 font-semibold">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-600 text-white text-[9px] mr-1">1</span>
              Công ty
            </label>
            <select
              value={filterCompany}
              onChange={(e) => onCompanyChange(e.target.value)}
              className={`h-9 w-44 px-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 ${ringFocusClass} cursor-pointer`}
            >
              <option value="">Tất cả công ty</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.short_name || c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {!isAdmin && userCompanyId && (
          <span className="h-9 inline-flex items-center px-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 self-end">
            <span className="font-semibold text-[10px] text-blue-900 mr-1.5">1</span>
            🏢 Công ty của bạn
          </span>
        )}
        {isCompanyScopedAdmin && userCompanyId && (
          <span
            className="h-9 inline-flex items-center px-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-900 self-end max-w-[14rem] truncate"
            title="Admin phạm vi một công ty"
          >
            <span className="font-semibold text-[10px] mr-1.5">1</span>
            🏢{' '}
            {companies.find((c) => String(c.id) === String(userCompanyId))?.short_name
              || companies.find((c) => String(c.id) === String(userCompanyId))?.name
              || 'Công ty của bạn'}
          </span>
        )}

        <div className="flex flex-col gap-0.5 min-w-[10rem]">
          <label className="text-[10px] text-slate-600 font-semibold">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-600 text-white text-[9px] mr-1">2</span>
            Khu vực
          </label>
          <select
            value={filterRegion}
            onChange={(e) => {
              setFilterRegion(e.target.value);
              setFilterPersonId('');
              setFilterPersonName('');
            }}
            title={
              dashboardScopeCompanyId
                ? 'Lọc theo khu vực của công ty đã chọn'
                : 'Lọc theo khu vực các công ty trong module'
            }
            className={`h-9 w-44 px-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 ${ringFocusClass} cursor-pointer`}
          >
            <option value="">Tất cả khu vực</option>
            <option value="__none__">Chưa gán khu vực (NV & pipeline)</option>
            {companyRegions.map((reg) => {
              const coShort = !dashboardScopeCompanyId
                ? (companies.find((c) => String(c.id) === String(reg.company_id))?.short_name
                  || companies.find((c) => String(c.id) === String(reg.company_id))?.name
                  || '')
                : '';
              return (
                <option key={reg.id} value={reg.id}>
                  {reg.is_active === false ? '· ' : ''}
                  {reg.name}
                  {reg.code ? ` (${reg.code})` : ''}
                  {coShort ? ` — ${coShort}` : ''}
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-slate-200/80 pt-3 mt-1 w-full sm:border-t-0 sm:pt-0 sm:mt-0 sm:w-auto sm:border-l sm:pl-3 sm:ml-0">
          <span className="text-[10px] font-bold text-slate-500 uppercase self-center mr-1 hidden sm:inline">3</span>
          {!hideAssigneeSearch && (
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-slate-600 font-semibold">Tìm NV</label>
              <input
                type="search"
                value={assigneeListSearch}
                onChange={(e) => setAssigneeListSearch(e.target.value)}
                placeholder="Tên, email…"
                className={`h-9 w-36 px-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 ${ringFocusClass}`}
              />
            </div>
          )}
          {!hidePersonSelect && (
            <div className="flex flex-col gap-0.5 min-w-[11rem] flex-1 sm:flex-initial sm:min-w-[12rem]">
              <label className="text-[10px] text-slate-600 font-semibold">{personSelectLabel}</label>
              <select
                value={filterPersonId}
                onChange={(e) => setFilterPersonId(e.target.value)}
                title="Chỉ hiện NV thuộc công ty & khu vực đã chọn (khi có)"
                className={`h-9 w-full min-w-0 px-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 ${ringFocusClass} cursor-pointer`}
              >
                <option value="">Tất cả nhân viên</option>
                {companyDepts.length > 0 ? (
                  companyDepts.map((dept) => {
                    const deptUsers = employeeOptionsForSelect.filter((u) => u.department_id === dept.id);
                    if (!deptUsers.length) return null;
                    return (
                      <optgroup key={dept.id} label={`📁 ${dept.name}`}>
                        {deptUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name}
                            {u.position ? ` (${u.position})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })
                ) : (
                  employeeOptionsForSelect.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                      {u.position ? ` (${u.position})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}
          {!hidePersonName && (
            <div className="flex flex-col gap-0.5 min-w-[10rem]">
              <label className="text-[10px] text-slate-600 font-semibold">Tên trên pipeline</label>
              <input
                type="search"
                value={filterPersonName}
                onChange={(e) => setFilterPersonName(e.target.value)}
                placeholder="Tên người phụ trách…"
                title="Lọc nhanh theo tên hiển thị trên thẻ"
                className="h-9 w-40 px-2 bg-amber-50/90 border border-amber-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          )}
          {companyEmployees.length > 0 && (
            <span
              className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 self-end whitespace-nowrap"
              title="Số NV sau bước công ty + khu vực"
            >
              {employeeFilterListByRegion.length} NV
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
