const MODULE_LABELS = { crm: 'CRM', production: 'Sản xuất', logistics: 'VC/LĐ' };
const SOURCE_LABELS = {
  customer_request: 'Phát sinh từ khách hàng',
  employee_error: 'Lỗi từ nhân viên',
};

function emptyCounts() {
  return {
    total: 0,
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    overdue: 0,
    customer_request: 0,
    employee_error: 0,
  };
}

function vnYmd(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function parseYmd(ymd) {
  const [year, month, day] = String(ymd).split('-').map(Number);
  return { year, month, day };
}

function ymdToUtcDate(ymd) {
  const { year, month, day } = parseYmd(ymd);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatYmd(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysYmd(ymd, days) {
  const date = ymdToUtcDate(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmd(date);
}

function formatViDate(ymd) {
  if (!ymd) return '';
  const { day, month, year } = parseYmd(ymd);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function isoWeekMeta(ymd) {
  const date = ymdToUtcDate(ymd);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - 3);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const from = formatYmd(monday);
  const to = formatYmd(sunday);
  return {
    key: `${year}-W${String(week).padStart(2, '0')}`,
    year,
    week,
    from,
    to,
    label: `Tuần ${week}/${year} (${formatViDate(from)}–${formatViDate(to)})`,
  };
}

function monthMeta(ymd) {
  const { year, month } = parseYmd(ymd);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return {
    key: `${year}-${String(month).padStart(2, '0')}`,
    year,
    month,
    from,
    to,
    label: `Tháng ${month}/${year}`,
  };
}

function bump(bucket, row, now) {
  bucket.total += 1;
  if (Object.prototype.hasOwnProperty.call(bucket, row.status)) bucket[row.status] += 1;
  if (Object.prototype.hasOwnProperty.call(bucket, row.task_source_type)) bucket[row.task_source_type] += 1;
  if (
    row.status !== 'completed'
    && row.status !== 'cancelled'
    && row.deadline
    && new Date(row.deadline).getTime() < now
  ) {
    bucket.overdue += 1;
  }
}

function withRates(bucket) {
  const total = bucket.total || 0;
  const pct = (n) => (total ? Math.round((n * 1000) / total) / 10 : 0);
  return {
    ...bucket,
    completed_rate: pct(bucket.completed),
    overdue_rate: pct(bucket.overdue),
    employee_error_rate: pct(bucket.employee_error),
    customer_request_rate: pct(bucket.customer_request),
  };
}

function groupRows(rows, keyFn, now) {
  const map = new Map();
  for (const row of rows) {
    const meta = keyFn(row);
    if (!meta || !meta.key) continue;
    if (!map.has(meta.key)) {
      map.set(meta.key, { ...meta, ...emptyCounts() });
    }
    bump(map.get(meta.key), row, now);
  }
  return [...map.values()].map(withRates);
}

function nextMonthKey(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  let year = Number(match[1]);
  let month = Number(match[2]) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function fillWeeks(items) {
  if (items.length < 2) return items;
  const sorted = [...items].sort((a, b) => String(a.from).localeCompare(String(b.from)));
  const byKey = new Map(items.map((item) => [item.key, item]));
  const filled = [];
  for (let ymd = sorted[0].from; ymd <= sorted[sorted.length - 1].from; ymd = addDaysYmd(ymd, 7)) {
    const meta = isoWeekMeta(ymd);
    filled.push(byKey.get(meta.key) || withRates({ ...meta, ...emptyCounts() }));
    if (filled.length > 80) break;
  }
  return filled;
}

function fillMonths(items) {
  if (items.length < 2) return items;
  const byKey = new Map(items.map((item) => [item.key, item]));
  const keys = items.map((item) => item.key).sort();
  const filled = [];
  for (let key = keys[0]; key <= keys[keys.length - 1]; key = nextMonthKey(key)) {
    filled.push(byKey.get(key) || withRates({ ...monthMeta(`${key}-01`), ...emptyCounts() }));
    if (filled.length > 36) break;
  }
  return filled;
}

function sortByTotal(items) {
  return [...items].sort((a, b) => b.total - a.total || String(a.label).localeCompare(String(b.label), 'vi'));
}

function projectGroup(row) {
  const project = row.project;
  if (project?.id) {
    return {
      key: `project:${project.id}`,
      label: [project.code, project.name].filter(Boolean).join(' · ') || 'Dự án',
      project_id: project.id,
      project_code: project.code || null,
    };
  }
  if (row.lead?.id) {
    return {
      key: `deal:${row.lead.id}`,
      label: [row.lead.code, row.lead.title].filter(Boolean).join(' · ') || 'Deal chưa có dự án',
      lead_id: row.lead.id,
      project_id: null,
    };
  }
  return { key: 'unknown-project', label: 'Chưa gắn dự án / deal' };
}

function departmentGroup(row) {
  if (row.department?.id) {
    return {
      key: String(row.department.id),
      label: row.department.name || 'Phòng ban',
      department_id: row.department.id,
    };
  }
  if (row.department_id) {
    return {
      key: String(row.department_id),
      label: 'Phòng ban',
      department_id: row.department_id,
    };
  }
  return { key: 'unassigned-dept', label: 'Chưa gán bộ phận' };
}

function employeeGroups(row) {
  const assignees = Array.isArray(row.assignees) ? row.assignees : [];
  const unique = new Map();
  for (const user of assignees) {
    if (!user?.id) continue;
    unique.set(String(user.id), {
      key: String(user.id),
      label: user.full_name || user.email || 'Nhân viên',
      user_id: user.id,
    });
  }
  if (!unique.size) return [{ key: 'unassigned-user', label: 'Chưa phân công' }];
  return [...unique.values()];
}

function kindGroup(row) {
  return {
    key: String(row.phat_sinh_kind || 'unknown-kind'),
    label: row.phat_sinh_kind_name || row.phat_sinh_kind || 'Chưa chọn loại',
  };
}

function moduleGroup(row) {
  const key = String(row.assignment_module || 'unknown');
  return { key, label: MODULE_LABELS[key] || key };
}

function pct(n, total) {
  return total ? Math.round((n * 1000) / total) / 10 : 0;
}

function periodDelta(items) {
  if (!items || items.length < 2) return null;
  const prev = items[items.length - 2];
  const curr = items[items.length - 1];
  return {
    previous: prev,
    current: curr,
    diff: curr.total - prev.total,
    diff_rate: pct(curr.total - prev.total, prev.total || curr.total),
  };
}

function buildLessons({ summary, byWeek, byMonth, byDepartment, byProject, byEmployee, byKind, byModule }) {
  const lessons = [];
  const total = summary.total || 0;
  if (!total) {
    return [{
      id: 'empty',
      severity: 'info',
      group: 'tổng quan',
      title: 'Chưa có phát sinh trong bộ lọc',
      detail: 'Không đủ dữ liệu để rút kinh nghiệm.',
      lesson: 'Bài học chỉ có ý nghĩa khi ghi nhận đủ việc phát sinh theo đúng nguồn, loại và người phụ trách.',
      action: 'Mở rộng khoảng ngày hoặc kiểm tra nhân sự có đang tạo việc trên Không gian chung.',
    }];
  }

  if (summary.employee_error >= 3 && summary.employee_error / total >= 0.4) {
    lessons.push({
      id: 'error-rate',
      severity: 'high',
      group: 'nguồn',
      title: `Lỗi nhân viên chiếm ${pct(summary.employee_error, total)}% phát sinh`,
      detail: `${summary.employee_error}/${total} việc là ${SOURCE_LABELS.employee_error}.`,
      lesson: 'Cùng một dạng sai sót đang lặp lại giữa các khối; checklist bàn giao và kiểm soát chất lượng chưa đủ chặt.',
      action: 'Họp rút kinh nghiệm với khối gây lỗi nhiều nhất; bổ sung checklist trước khi chuyển CRM → SX → VC/LĐ.',
    });
  } else if (summary.customer_request >= 3 && summary.customer_request / total >= 0.6) {
    lessons.push({
      id: 'customer-rate',
      severity: 'medium',
      group: 'nguồn',
      title: `Yêu cầu khách hàng chiếm ${pct(summary.customer_request, total)}% phát sinh`,
      detail: `${summary.customer_request}/${total} việc là ${SOURCE_LABELS.customer_request}.`,
      lesson: 'Khách hay đổi ý sau khi chốt — khảo sát / chốt vật liệu / kích thước tại hiện trường chưa đủ chắc.',
      action: 'Rà soát kịch bản chốt deal: ảnh hiện trạng, kích thước, vật liệu và phạm vi bảo hành trước khi đưa vào sản xuất.',
    });
  }

  const topKind = byKind.find((item) => item.key !== 'unknown-kind');
  if (topKind && topKind.total >= 3 && topKind.total / total >= 0.25) {
    lessons.push({
      id: 'top-kind',
      severity: topKind.total / total >= 0.4 ? 'high' : 'medium',
      group: 'loại',
      title: `Loại «${topKind.label}» lặp ${topKind.total} lần`,
      detail: `Chiếm ${pct(topKind.total, total)}% toàn bộ phát sinh trong kỳ.`,
      lesson: `Đây là điểm nóng cần chuẩn hóa: cùng một loại phát sinh xuất hiện nhiều lần nghĩa là quy trình chưa chặn được từ gốc.`,
      action: `Viết SOP / checklist riêng cho «${topKind.label}» và gán người chịu trách nhiệm cố định.`,
    });
  }

  const topDept = byDepartment.find((item) => item.key !== 'unassigned-dept' && item.total > 0);
  if (topDept && topDept.total >= 3) {
    lessons.push({
      id: 'top-dept',
      severity: 'medium',
      group: 'bộ phận',
      title: `Bộ phận ${topDept.label} phát sinh nhiều nhất (${topDept.total})`,
      detail: `Hoàn thành ${topDept.completed_rate}%, quá hạn ${topDept.overdue_rate}%, lỗi NV ${topDept.employee_error_rate}%.`,
      lesson: 'Bộ phận đứng đầu về số lượng cần xem lại tải việc, khâu bắt lỗi và thời hạn xử lý — không chỉ tăng nhân sự.',
      action: `Trưởng bộ phận ${topDept.label} rà từng việc quá hạn / lỗi NV trong kỳ và chốt 1–2 thay đổi quy trình.`,
    });
  }

  const topProject = byProject[0];
  if (topProject && topProject.total >= 3) {
    lessons.push({
      id: 'top-project',
      severity: topProject.total >= 5 ? 'high' : 'medium',
      group: 'dự án',
      title: `Công trình «${topProject.label}» có ${topProject.total} phát sinh`,
      detail: `Lỗi NV ${topProject.employee_error}, yêu cầu khách ${topProject.customer_request}, quá hạn ${topProject.overdue}.`,
      lesson: 'Công trình nhiều phát sinh thường thiếu chốt hiện trạng hoặc bàn giao giữa các khối không đủ rõ ràng ngay từ đầu.',
      action: 'Mở Không gian chung của công trình này, gom các việc cùng loại và họp rút kinh nghiệm trước khi làm công trình tương tự.',
    });
  }

  const staff = byEmployee.filter((item) => item.key !== 'unassigned-user');
  const topStaffError = [...staff].sort((a, b) => b.employee_error - a.employee_error || b.total - a.total)[0];
  if (topStaffError && topStaffError.employee_error >= 2) {
    lessons.push({
      id: 'top-staff-error',
      severity: 'high',
      group: 'nhân viên',
      title: `${topStaffError.label} gắn với ${topStaffError.employee_error} việc lỗi NV`,
      detail: `Tổng việc phụ trách: ${topStaffError.total}. Tỷ lệ lỗi: ${topStaffError.employee_error_rate}%.`,
      lesson: 'Cần coaching cá nhân, không chỉ nhắc chung cả phòng — lỗi đang tập trung vào một người phụ trách.',
      action: `Kèm cặp / checklist cá nhân cho ${topStaffError.label}; xem lại vai trò người tạo vs người xử lý để đúng người chịu trách nhiệm.`,
    });
  }

  const overdueStaff = [...staff].sort((a, b) => b.overdue - a.overdue)[0];
  if (overdueStaff && overdueStaff.overdue >= 3) {
    lessons.push({
      id: 'staff-overdue',
      severity: 'medium',
      group: 'nhân viên',
      title: `${overdueStaff.label} đang có ${overdueStaff.overdue} việc quá hạn`,
      detail: `Tỷ lệ quá hạn ${overdueStaff.overdue_rate}% trên ${overdueStaff.total} việc phụ trách.`,
      lesson: 'Deadline phát sinh đang bị xem nhẹ hoặc người phụ trách nhận quá nhiều việc cùng lúc.',
      action: 'Rà tải việc, tách việc quan sát / thực hiện, và chỉ giao thêm khi việc quá hạn đã được xử lý.',
    });
  }

  const weekTrend = periodDelta(byWeek);
  if (weekTrend && weekTrend.previous.total >= 1 && weekTrend.diff > 0 && weekTrend.diff_rate >= 30) {
    lessons.push({
      id: 'week-up',
      severity: 'high',
      group: 'tuần',
      title: `${weekTrend.current.label} tăng ${weekTrend.diff} việc so với tuần trước`,
      detail: `${weekTrend.previous.total} → ${weekTrend.current.total} phát sinh (${weekTrend.diff_rate}%).`,
      lesson: 'Sóng phát sinh đang tăng — nếu không chặn nguyên nhân gốc, tuần sau sẽ tiếp tục đội chi phí và tiến độ.',
      action: 'Soát các việc mới trong tuần hiện tại theo loại và bộ phận; họp nhanh 15 phút chốt biện pháp tuần này.',
    });
  } else if (weekTrend && weekTrend.diff < 0 && weekTrend.previous.total >= 3) {
    lessons.push({
      id: 'week-down',
      severity: 'info',
      group: 'tuần',
      title: `${weekTrend.current.label} giảm ${Math.abs(weekTrend.diff)} việc so với tuần trước`,
      detail: `${weekTrend.previous.total} → ${weekTrend.current.total} phát sinh.`,
      lesson: 'Hướng đi đúng nếu việc giảm vì đã chặn gốc, không phải vì quên ghi nhận.',
      action: 'Giữ checklist đã áp dụng; đối chiếu số việc tạo ra với thực tế công trình để không bỏ sót ghi nhận.',
    });
  }

  const monthTrend = periodDelta(byMonth);
  if (monthTrend && monthTrend.previous.total >= 2 && monthTrend.diff > 0 && monthTrend.diff_rate >= 20) {
    lessons.push({
      id: 'month-up',
      severity: 'medium',
      group: 'tháng',
      title: `${monthTrend.current.label} tăng so với tháng trước`,
      detail: `${monthTrend.previous.total} → ${monthTrend.current.total} phát sinh (${monthTrend.diff_rate}%).`,
      lesson: 'Xu hướng tháng cho thấy vấn đề mang tính hệ thống, không phải ca lẻ.',
      action: 'Đưa top loại phát sinh và bộ phận nóng vào họp tháng; gắn KPI giảm số lỗi NV / số quá hạn.',
    });
  }

  if (summary.overdue >= 3 && summary.overdue / total >= 0.25) {
    lessons.push({
      id: 'overdue',
      severity: 'high',
      group: 'tiến độ',
      title: `${summary.overdue} việc phát sinh đang quá hạn (${pct(summary.overdue, total)}%)`,
      detail: 'Việc phát sinh mở quá hạn làm trễ lắp đặt và tăng khiếu nại khách.',
      lesson: 'Hạn xử lý trên Không gian chung chưa được điều phối như việc chính của dự án.',
      action: 'Ưu tiên dọn việc quá hạn trước; gắn hạn phát sinh vào cùng lịch công trình (ngày giao / ngày lắp).',
    });
  }

  const topModule = byModule[0];
  if (topModule && topModule.total / total >= 0.5 && total >= 4) {
    lessons.push({
      id: 'top-module',
      severity: 'info',
      group: 'khối',
      title: `Khối ${topModule.label} nhận ${topModule.total} việc phát sinh`,
      detail: `Chiếm ${pct(topModule.total, total)}% khối nhận việc.`,
      lesson: 'Khối nhận nhiều nhất cần cổng tiếp nhận rõ (ai nhận, hạn bao lâu, khi nào escalate).',
      action: `Thiết lập nhân viên chịu trách nhiệm cố định cho phát sinh khối ${topModule.label} trong Setup phát sinh.`,
    });
  }

  const unassigned = byEmployee.find((item) => item.key === 'unassigned-user');
  if (unassigned && unassigned.total >= 2) {
    lessons.push({
      id: 'unassigned',
      severity: 'medium',
      group: 'nhân viên',
      title: `${unassigned.total} việc chưa phân công người phụ trách`,
      detail: 'Việc không có người nhận thường nằm im và biến thành quá hạn.',
      lesson: 'Mỗi phát sinh phải có đúng 1 người thực hiện chính ngay lúc tạo.',
      action: 'Bổ sung người phụ trách cho các việc trống; bật nhân viên mặc định theo loại lỗi trong Setup phát sinh.',
    });
  }

  const order = { high: 0, medium: 1, info: 2 };
  return lessons.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9)).slice(0, 8);
}

function buildSharedWorkspaceAnalysis(rows, summaryInput) {
  const now = Date.now();
  const summary = summaryInput || {
    total: rows.length,
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    overdue: 0,
    customer_request: 0,
    employee_error: 0,
  };

  const dated = rows.map((row) => ({ row, ymd: vnYmd(row.created_at) })).filter((item) => item.ymd);

  const byWeekRaw = groupRows(dated.map((item) => item.row), (row) => isoWeekMeta(vnYmd(row.created_at)), now)
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
  const byMonthRaw = groupRows(dated.map((item) => item.row), (row) => monthMeta(vnYmd(row.created_at)), now)
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));

  const byWeek = fillWeeks(byWeekRaw);
  const byMonth = fillMonths(byMonthRaw);

  const byDepartment = sortByTotal(groupRows(rows, departmentGroup, now));
  const byProject = sortByTotal(groupRows(rows, projectGroup, now));

  const employeeMap = new Map();
  for (const row of rows) {
    for (const meta of employeeGroups(row)) {
      if (!employeeMap.has(meta.key)) employeeMap.set(meta.key, { ...meta, ...emptyCounts() });
      bump(employeeMap.get(meta.key), row, now);
    }
  }
  const byEmployee = sortByTotal([...employeeMap.values()].map(withRates));
  const byKind = sortByTotal(groupRows(rows, kindGroup, now));
  const byModule = sortByTotal(groupRows(rows, moduleGroup, now));

  const lessons = buildLessons({
    summary,
    byWeek,
    byMonth,
    byDepartment,
    byProject,
    byEmployee,
    byKind,
    byModule,
  });

  return {
    by_week: byWeek,
    by_month: byMonth,
    by_department: byDepartment,
    by_project: byProject,
    by_employee: byEmployee,
    by_kind: byKind,
    by_module: byModule,
    lessons,
  };
}

module.exports = {
  buildSharedWorkspaceAnalysis,
  buildLessons,
  isoWeekMeta,
  monthMeta,
  vnYmd,
};
