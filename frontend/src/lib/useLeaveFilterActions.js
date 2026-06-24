import { useCallback, useMemo } from 'react';
import { CRM_TIME_PRESETS } from './crmDateRangePresets';
import { isoDate } from './leaveScheduleUtils';

export function buildLeaveActiveFilterChips({
  scope,
  isSystemAdmin,
  filterRegionId,
  filterUserId,
  timePreset,
  rangeFrom,
  rangeTo,
  regions = [],
  users = [],
  month,
  year,
  showCalendarMonth = false,
  onRemoveCompany,
  onRemoveDepartment,
  onRemoveRegion,
  onRemoveUser,
  onRemoveTime,
  onRemoveCalendarMonth,
}) {
  const chips = [];

  if (isSystemAdmin && scope?.companyId) {
    const company = (scope.companies || []).find((c) => String(c.id) === String(scope.companyId));
    chips.push({
      key: 'company',
      label: `Công ty: ${company?.short_name || company?.name || scope.companyId}`,
      onRemove: onRemoveCompany,
    });
  }

  if (scope?.departmentId) {
    const dept = (scope.departmentsForCompany || scope.departments || []).find(
      (d) => String(d.id) === String(scope.departmentId),
    );
    chips.push({
      key: 'department',
      label: `Phòng ban: ${dept?.name || scope.departmentId}`,
      onRemove: onRemoveDepartment,
    });
  }

  if (filterRegionId) {
    const rg = regions.find((r) => String(r.id) === String(filterRegionId));
    chips.push({
      key: 'region',
      label: `Khu vực: ${rg?.name || filterRegionId}${rg?.code ? ` (${rg.code})` : ''}`,
      onRemove: onRemoveRegion,
    });
  }

  if (filterUserId) {
    const u = users.find((item) => String(item.id) === String(filterUserId));
    chips.push({
      key: 'user',
      label: `Nhân viên: ${u?.full_name || u?.email || filterUserId}`,
      onRemove: onRemoveUser,
    });
  }

  if (timePreset) {
    const preset = CRM_TIME_PRESETS.find((p) => p.key === timePreset);
    chips.push({
      key: 'time-preset',
      label: `Thời gian: ${preset?.label || timePreset}`,
      onRemove: onRemoveTime,
    });
  } else if (rangeFrom || rangeTo) {
    chips.push({
      key: 'time-range',
      label: `Khoảng ngày: ${rangeFrom || '...'} → ${rangeTo || '...'}`,
      onRemove: onRemoveTime,
    });
  } else if (showCalendarMonth && month && year) {
    chips.push({
      key: 'calendar-month',
      label: `Tháng lịch: Tháng ${month}, ${year}`,
      onRemove: onRemoveCalendarMonth,
    });
  }

  return chips;
}

export function useLeaveFilterActions({
  scope,
  isSystemAdmin,
  filterRegionId,
  filterUserId,
  timePreset,
  rangeFrom,
  rangeTo,
  regions,
  users,
  month,
  year,
  showCalendarMonth = false,
  changeFilterRegion,
  changeFilterUser,
  handleTimePresetChange,
  resetCalendarMonth,
}) {
  const onRemoveCompany = useCallback(() => {
    scope?.setCompanyId?.('');
  }, [scope]);

  const onRemoveDepartment = useCallback(() => {
    scope?.setDepartmentId?.('');
  }, [scope]);

  const onRemoveRegion = useCallback(() => {
    changeFilterRegion('');
  }, [changeFilterRegion]);

  const onRemoveUser = useCallback(() => {
    changeFilterUser('');
  }, [changeFilterUser]);

  const onRemoveTime = useCallback(() => {
    handleTimePresetChange('');
  }, [handleTimePresetChange]);

  const onRemoveCalendarMonth = useCallback(() => {
    resetCalendarMonth?.();
  }, [resetCalendarMonth]);

  const activeFilterChips = useMemo(
    () => buildLeaveActiveFilterChips({
      scope,
      isSystemAdmin,
      filterRegionId,
      filterUserId,
      timePreset,
      rangeFrom,
      rangeTo,
      regions,
      users,
      month,
      year,
      showCalendarMonth,
      onRemoveCompany,
      onRemoveDepartment,
      onRemoveRegion,
      onRemoveUser,
      onRemoveTime,
      onRemoveCalendarMonth,
    }),
    [
      scope,
      isSystemAdmin,
      filterRegionId,
      filterUserId,
      timePreset,
      rangeFrom,
      rangeTo,
      regions,
      users,
      month,
      year,
      showCalendarMonth,
      onRemoveCompany,
      onRemoveDepartment,
      onRemoveRegion,
      onRemoveUser,
      onRemoveTime,
      onRemoveCalendarMonth,
    ],
  );

  const hasActiveFilters = activeFilterChips.length > 0;

  const clearFilters = useCallback(() => {
    handleTimePresetChange('');
    changeFilterUser('');
    changeFilterRegion('');
    scope?.setDepartmentId?.('');
    if (isSystemAdmin) scope?.setCompanyId?.('');
  }, [
    handleTimePresetChange,
    changeFilterUser,
    changeFilterRegion,
    scope,
    isSystemAdmin,
  ]);

  return { activeFilterChips, hasActiveFilters, clearFilters };
}

export function getMonthBounds(month, year) {
  const last = new Date(year, month, 0).getDate();
  return { from: isoDate(year, month, 1), to: isoDate(year, month, last) };
}

export function getYearBounds(year) {
  return { from: isoDate(year, 1, 1), to: isoDate(year, 12, 31) };
}
