function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN');
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
}

const KIND_LABELS = {
  all: 'Tất cả',
  tasks: 'Log nhiệm vụ',
  phat_sinh: 'Log phát sinh',
  project: 'Log dự án',
  crm: 'Log CRM / hoạt động',
  comments: 'Log bình luận',
};

export async function exportProjectConstructionLogsExcel({
  project,
  items,
  counts,
  kind,
  filters,
}) {
  const [{ default: ExcelJS }, { saveAs }] = await Promise.all([
    import('exceljs'),
    import('file-saver'),
  ]);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QLCV';
  workbook.created = new Date();

  const overview = workbook.addWorksheet('Tổng quan');
  overview.columns = [{ width: 32 }, { width: 48 }];
  overview.addRow(['NHẬT KÝ CÔNG TRÌNH']);
  overview.mergeCells('A1:B1');
  overview.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF134E4A' } };
  overview.getCell('A1').alignment = { horizontal: 'center' };
  overview.addRow(['Xuất lúc', new Date().toLocaleString('vi-VN')]);
  overview.addRow(['Mã công trình', project?.code || '']);
  overview.addRow(['Tên công trình', project?.name || '']);
  overview.addRow(['Khách hàng', project?.customer_name || '']);
  overview.addRow(['Tab xuất', KIND_LABELS[kind] || kind]);
  overview.addRow(['Từ ngày', filters?.date_from || 'Tất cả']);
  overview.addRow(['Đến ngày', filters?.date_to || 'Tất cả']);
  overview.addRow(['Công ty', filters?.company || 'Tất cả']);
  overview.addRow(['Khu vực', filters?.region || 'Tất cả']);
  overview.addRow(['Nhân viên', filters?.user || 'Tất cả']);
  overview.addRow(['Từ khóa', filters?.q || '']);
  overview.addRow([]);
  overview.addRow(['Nhóm log', 'Số dòng']);
  styleHeader(overview.getRow(14));
  [
    ['Tất cả', counts?.all || 0],
    ['Nhiệm vụ', counts?.tasks || 0],
    ['Phát sinh', counts?.phat_sinh || 0],
    ['Dự án', counts?.project || 0],
    ['CRM / hoạt động', counts?.crm || 0],
    ['Bình luận', counts?.comments || 0],
  ].forEach((row) => overview.addRow(row));

  const detail = workbook.addWorksheet(KIND_LABELS[kind] || 'Chi tiết', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  detail.columns = [
    { header: 'STT', key: 'index', width: 8 },
    { header: 'Thời gian', key: 'created_at', width: 22 },
    { header: 'Nhóm', key: 'kind', width: 16 },
    { header: 'Sự kiện', key: 'event', width: 20 },
    { header: 'Nguồn', key: 'source', width: 22 },
    { header: 'Tiêu đề', key: 'title', width: 36 },
    { header: 'Nội dung', key: 'description', width: 55 },
    { header: 'Người thao tác', key: 'actor', width: 24 },
  ];
  styleHeader(detail.getRow(1));
  items.forEach((item, index) => {
    detail.addRow({
      index: index + 1,
      created_at: formatDate(item.created_at),
      kind: KIND_LABELS[item.kind] || item.kind,
      event: item.event_label || item.event_type || '',
      source: item.source_label || item.source || '',
      title: item.title || '',
      description: item.description || '',
      actor: item.actor_name || item.actor?.full_name || '',
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const code = String(project?.code || 'cong-trinh').replace(/[^\w.-]+/g, '_');
  saveAs(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), `Nhat-ky-cong-trinh-${code}.xlsx`);
}
