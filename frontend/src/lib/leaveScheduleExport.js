import { loadXlsxStyle } from './xlsxLoader';
import {
  leaveTypeMeta,
  halfDayDisplayLabel,
  formatLeaveDateWithWeekday,
  fmtCreatedAt,
} from './leaveScheduleUtils';

const HEADERS = [
  'STT',
  'Nhân viên',
  'Email',
  'Ngày nghỉ',
  'Từ ngày',
  'Đến ngày',
  'Loại nghỉ',
  'Thời gian',
  'Ghi chú',
  'Tạo lúc',
];
const NCOLS = HEADERS.length;
const HEADER_ROW = 3;
const DATA_START = 4;

const BORDER = { style: 'thin', color: { rgb: 'E2E8F0' } };
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function blankRow() {
  return new Array(NCOLS).fill('');
}

function buildDataRow(leave, idx) {
  const row = blankRow();
  row[0] = idx + 1;
  row[1] = leave.user?.full_name || '';
  row[2] = leave.user?.email || '';
  row[3] = formatLeaveDateWithWeekday(leave.start_date, leave.end_date);
  row[4] = leave.start_date || '';
  row[5] = leave.end_date || '';
  row[6] = leaveTypeMeta(leave.leave_type).l;
  row[7] = halfDayDisplayLabel(leave.half_day);
  row[8] = leave.reason || '';
  row[9] = fmtCreatedAt(leave.created_at);
  return row;
}

function formatRangeLabel(from, to) {
  if (from && to) return `${from} → ${to}`;
  if (from) return `Từ ${from}`;
  if (to) return `Đến ${to}`;
  return 'Toàn bộ thời gian';
}

/**
 * @returns {Promise<boolean>} true nếu đã tải file
 */
export async function downloadLeavesExcel(leaves, options = {}) {
  const {
    sheetName = 'Danh sách nghỉ',
    filenamePrefix = 'lich_nghi',
    title = 'DANH SÁCH LỊCH NGHỈ',
    from = '',
    to = '',
  } = options;

  if (!leaves?.length) return false;

  const XLSX = await loadXlsxStyle();
  const halfDayCount = leaves.filter((l) => l.half_day && l.half_day !== 'full').length;
  const staffCount = new Set(leaves.map((l) => l.user_id).filter(Boolean)).size;

  const aoa = [];
  const rTitle = blankRow();
  rTitle[0] = title;
  aoa.push(rTitle);

  const rSub = blankRow();
  rSub[0] = `Khoảng thời gian: ${formatRangeLabel(from, to)}   —   Xuất lúc ${new Date().toLocaleString('vi-VN')}`;
  aoa.push(rSub);

  const rStat = blankRow();
  rStat[0] = `${leaves.length} đơn nghỉ   •   ${staffCount} nhân viên   •   ${halfDayCount} nửa ngày`;
  aoa.push(rStat);

  aoa.push([...HEADERS]);
  leaves.forEach((l, idx) => aoa.push(buildDataRow(l, idx)));

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: NCOLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: NCOLS - 1 } },
  ];

  ws['!cols'] = [
    { wch: 5 },
    { wch: 26 },
    { wch: 30 },
    { wch: 30 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
    { wch: 40 },
    { wch: 18 },
  ];

  ws['!rows'] = [
    { hpt: 32 },
    { hpt: 20 },
    { hpt: 20 },
    { hpt: 24 },
  ];

  const lastRow = DATA_START + leaves.length - 1;
  ws['!autofilter'] = { ref: `A${HEADER_ROW + 1}:J${lastRow + 1}` };
  ws['!views'] = [{
    state: 'frozen',
    ySplit: DATA_START,
    topLeftCell: XLSX.utils.encode_cell({ r: DATA_START, c: 0 }),
    activeCell: XLSX.utils.encode_cell({ r: DATA_START, c: 0 }),
  }];

  const setStyle = (r, c, style) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (!ws[addr]) ws[addr] = { t: 's', v: '' };
    ws[addr].s = style;
  };

  const titleStyle = {
    font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '6D28D9' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  };
  const subStyle = {
    font: { italic: true, sz: 10, color: { rgb: '475569' } },
    fill: { fgColor: { rgb: 'F5F3FF' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  };
  const statStyle = {
    font: { bold: true, sz: 10, color: { rgb: '5B21B6' } },
    fill: { fgColor: { rgb: 'EDE9FE' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  };
  const headerStyle = {
    font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '7C3AED' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: ALL_BORDERS,
  };

  for (let c = 0; c < NCOLS; c += 1) {
    setStyle(0, c, titleStyle);
    setStyle(1, c, subStyle);
    setStyle(2, c, statStyle);
    setStyle(HEADER_ROW, c, headerStyle);
  }

  leaves.forEach((leave, idx) => {
    const r = DATA_START + idx;
    const isHalf = leave.half_day && leave.half_day !== 'full';
    const zebra = idx % 2 === 0 ? 'FFFFFF' : 'FAFAFA';
    const rowFill = isHalf ? 'FDF2F8' : zebra;

    for (let c = 0; c < NCOLS; c += 1) {
      const isTextCol = c === 1 || c === 3 || c === 6 || c === 8;
      setStyle(r, c, {
        font: {
          bold: c === 1,
          sz: 10,
          color: { rgb: isHalf && c === 7 ? 'BE185D' : '1F2937' },
        },
        fill: { fgColor: { rgb: rowFill } },
        alignment: {
          horizontal: c === 0 ? 'center' : isTextCol ? 'left' : 'center',
          vertical: 'center',
          wrapText: c === 8,
        },
        border: ALL_BORDERS,
      });
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const fromStamp = from || 'all';
  const toStamp = to || 'all';
  XLSX.writeFile(wb, `${filenamePrefix}_${fromStamp}_${toStamp}.xlsx`);
  return true;
}
