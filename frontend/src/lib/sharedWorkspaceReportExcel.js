const STATUS_LABELS = {
  pending: 'Chưa làm',
  in_progress: 'Đang làm',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

const SOURCE_LABELS = {
  customer_request: 'Phát sinh từ khách hàng',
  employee_error: 'Lỗi từ nhân viên',
};

const MODULE_LABELS = {
  crm: 'CRM',
  production: 'Sản xuất',
  logistics: 'VC/LĐ',
};

const PRIORITY_LABELS = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  urgent: 'Khẩn cấp',
};

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN');
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
}

export async function exportSharedWorkspaceReportExcel({ rows, summary, filters }) {
  const [{ default: ExcelJS }, { saveAs }] = await Promise.all([
    import('exceljs'),
    import('file-saver'),
  ]);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QLCV';
  workbook.created = new Date();

  const overview = workbook.addWorksheet('Tổng quan');
  overview.columns = [{ width: 28 }, { width: 22 }];
  overview.addRow(['BÁO CÁO NHIỆM VỤ PHÁT SINH']);
  overview.mergeCells('A1:B1');
  overview.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
  overview.getCell('A1').alignment = { horizontal: 'center' };
  overview.addRow(['Xuất lúc', new Date().toLocaleString('vi-VN')]);
  overview.addRow(['Từ ngày', filters.date_from || 'Tất cả']);
  overview.addRow(['Đến ngày', filters.date_to || 'Tất cả']);
  overview.addRow([]);
  overview.addRow(['Chỉ số', 'Số lượng']);
  styleHeader(overview.getRow(6));
  [
    ['Tổng phát sinh', summary.total || 0],
    ['Chưa làm', summary.pending || 0],
    ['Đang làm', summary.in_progress || 0],
    ['Hoàn thành', summary.completed || 0],
    ['Quá hạn', summary.overdue || 0],
    ['Phát sinh từ khách hàng', summary.customer_request || 0],
    ['Lỗi từ nhân viên', summary.employee_error || 0],
  ].forEach((item) => overview.addRow(item));

  const detail = workbook.addWorksheet('Chi tiết phát sinh', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  detail.columns = [
    { header: 'STT', key: 'index', width: 8 },
    { header: 'Ngày tạo', key: 'created_at', width: 20 },
    { header: 'Mã deal', key: 'lead_code', width: 18 },
    { header: 'Deal / dự án', key: 'lead_title', width: 35 },
    { header: 'Nhiệm vụ', key: 'title', width: 38 },
    { header: 'Nguồn phát sinh', key: 'source', width: 25 },
    { header: 'Khối nhận', key: 'module', width: 15 },
    { header: 'Bên gây lỗi', key: 'error_module', width: 15 },
    { header: 'Loại phát sinh', key: 'kind', width: 22 },
    { header: 'Phòng ban', key: 'department', width: 20 },
    { header: 'Người chịu trách nhiệm', key: 'assignees', width: 32 },
    { header: 'Người tạo', key: 'creator', width: 24 },
    { header: 'Trạng thái', key: 'status', width: 16 },
    { header: 'Ưu tiên', key: 'priority', width: 14 },
    { header: 'Hạn xử lý', key: 'deadline', width: 20 },
    { header: 'Ngày hoàn thành', key: 'completed_at', width: 20 },
    { header: 'Mô tả', key: 'description', width: 45 },
  ];
  styleHeader(detail.getRow(1));

  rows.forEach((row, index) => {
    detail.addRow({
      index: index + 1,
      created_at: formatDate(row.created_at),
      lead_code: row.lead?.code || '',
      lead_title: [row.lead?.title, row.project?.code || row.project?.name].filter(Boolean).join(' · '),
      title: row.title || '',
      source: SOURCE_LABELS[row.task_source_type] || row.task_source_type || '',
      module: MODULE_LABELS[row.assignment_module] || row.assignment_module || '',
      error_module: MODULE_LABELS[row.employee_error_module] || '',
      kind: row.phat_sinh_kind_name || '',
      department: row.department?.name || '',
      assignees: (row.assignees || []).map((user) => user.full_name || user.email).filter(Boolean).join(', '),
      creator: row.created_by?.full_name || row.created_by?.email || '',
      status: STATUS_LABELS[row.status] || row.status || '',
      priority: PRIORITY_LABELS[row.priority] || row.priority || '',
      deadline: formatDate(row.deadline),
      completed_at: formatDate(row.completed_at),
      description: row.description || '',
    });
  });

  detail.autoFilter = { from: 'A1', to: 'Q1' };
  detail.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: true };
    if (rowNumber > 1 && rowNumber % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `bao-cao-nhiem-vu-phat-sinh-${stamp}.xlsx`,
  );
}
