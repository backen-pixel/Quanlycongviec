import { loadXlsxStyle } from './xlsxLoader';

const BORDER = { style: 'thin', color: { rgb: 'CBD5E1' } };
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const VND_NUMFMT = '#,##0 "đ"';
const KPI_NUMFMT = '+#,##0.##;-#,##0.##;0';
const PCT_NUMFMT = '0.0"%"';

const VND_KEYS = new Set([
  'quote_value',
  'won_or_later_value',
  'expected_value',
  'weighted_value',
  'pipeline_value',
]);

const INT_KEYS = new Set([
  'lead_count',
  'deal_count',
  'customer_order_count',
  'quote_deal_count',
  'won_or_later_deal_count',
  'lost_deal_count',
  'overdue_count',
  'reception_overdue_count',
]);

function closedWonCount(r) {
  return r?.won_or_later_deal_count ?? r?.won_deal_count ?? 0;
}

function closedWonValue(r) {
  return r?.won_or_later_value ?? r?.won_value ?? r?.completed_value ?? 0;
}

function cancelLostTotal(r) {
  return (r?.lost_lead_count ?? 0) + (r?.lost_deal_count ?? 0);
}

function cancelTotalCount(r) {
  return (r?.lead_count ?? 0) + (r?.deal_count ?? 0) + (r?.customer_order_count ?? 0);
}

/** Đảm bảo luôn có cột Điểm KPI khi xuất Excel. */
export function ensureExportMetricColumns(metricCols) {
  if (!metricCols?.length) {
    return [{ key: 'kpi_ledger_net', label: 'Điểm KPI', align: 'right' }];
  }
  if (metricCols.some((c) => c.key === 'kpi_ledger_net')) return metricCols;
  const cols = [...metricCols];
  const pipeIdx = cols.findIndex((c) => c.key === 'pipeline_value');
  const insertAt = pipeIdx >= 0 ? pipeIdx : cols.length;
  cols.splice(insertAt, 0, { key: 'kpi_ledger_net', label: 'Điểm KPI', align: 'right' });
  return cols;
}

function cellKind(key) {
  if (key === 'kpi_ledger_net') return 'kpi';
  if (VND_KEYS.has(key)) return 'vnd';
  if (key === 'won_or_later_value') return 'vnd';
  if (key.endsWith('_pct') || key === 'conversion_rate' || key === 'deal_close_value_rate_pct') return 'pct';
  if (INT_KEYS.has(key) || key === 'won_or_later_deal_count') return 'int';
  if (key === 'monthly_growth_pct') return 'growth';
  if (key === 'cancel_rate_pct' || key === 'reception_overdue_count' || key === 'overdue_count') return 'text';
  if (key === 'first_stage_on_time_rate_pct') return 'text';
  return 'text';
}

function rawEmployeeValue(col, row) {
  const k = col.key;
  if (k === 'won_or_later_deal_count') return closedWonCount(row);
  if (k === 'won_or_later_value') return closedWonValue(row);
  if (k === 'pipeline_value') {
    return row.pipeline_value ?? (row.lead_pipeline_value || 0) + (row.deal_pipeline_value || 0);
  }
  if (k === 'kpi_ledger_net') {
    const n = Number(row.kpi_ledger_net);
    return Number.isFinite(n) ? n : 0;
  }
  if (k === 'cancel_rate_pct') {
    const lost = cancelLostTotal(row);
    const total = cancelTotalCount(row);
    return total ? `${row.cancel_rate_pct ?? 0}% (${lost}/${total})` : '';
  }
  if (k === 'overdue_count') {
    const n = row.overdue_count ?? 0;
    const pct = row.overdue_rate_pct;
    return pct != null ? `${n} (${pct}%)` : n;
  }
  if (k === 'reception_overdue_count') {
    const eligible = row.reception_eligible_count ?? 0;
    if (!eligible) return '';
    const n = row.reception_overdue_count ?? 0;
    const pct = row.reception_overdue_rate_pct;
    return pct != null ? `${n}/${eligible} (${pct}%)` : `${n}/${eligible}`;
  }
  if (k === 'first_stage_on_time_rate_pct') {
    const open = row.first_stage_open_count ?? 0;
    if (!open) return '';
    return `${row.first_stage_on_time_rate_pct ?? 0}% / ${row.first_stage_overdue_rate_pct ?? 0}%`;
  }
  if (k === 'monthly_growth_pct') {
    if (row.monthly_growth_pct == null) return '';
    const n = Number(row.monthly_growth_pct) || 0;
    return `${n > 0 ? '+' : ''}${n}%`;
  }
  if (k === 'conversion_rate' || k === 'deal_close_value_rate_pct' || k === 'quote_win_rate_pct') {
    if (row[k] == null) return '';
    return row[k];
  }
  return row[k] ?? '';
}

const SURVEY_HEADERS = [
  'Ngày khảo sát',
  'Giờ',
  'Nhân viên',
  'Phòng ban',
  'Mã Deal',
  'Mã Lead',
  'Khách hàng',
  'SĐT',
  'Địa chỉ',
  'Khu vực',
  'Tiêu đề',
  'Trạng thái',
  'Kết quả',
  'Lý do hủy',
  'Ghi chú',
];

function surveyStatusFill(status) {
  const map = {
    completed: 'D1FAE5',
    planned: 'DBEAFE',
    in_progress: 'FEF3C7',
    cancelled: 'FEE2E2',
  };
  return map[status] || 'FFFFFF';
}

function buildSurveyRow(r, deptByAssignee) {
  const dept = r.phong_ban || deptByAssignee.get(String(r.assignee_id || '')) || '';
  return [
    r.ngay_khao_sat || '',
    r.gio || '',
    r.nhan_vien || '',
    dept,
    r.ma_deal || '',
    r.ma_lead || '',
    r.khach_hang || '',
    r.sdt || '',
    r.dia_chi || '',
    r.khu_vuc || '',
    r.tieu_de || '',
    r.trang_thai || '',
    r.ket_qua || '',
    r.ly_do_huy || '',
    r.ghi_chu || '',
  ];
}

function applySheetChrome(ws, XLSX, {
  ncols, headerRow, dataStart, lastRow, title, subtitle, statLine, sheetTitleFill = '1E40AF',
}) {
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: ncols - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: ncols - 1 } },
  ];
  ws['!rows'] = [{ hpt: 32 }, { hpt: 20 }, { hpt: 20 }, { hpt: 26 }];
  ws['!views'] = [{
    state: 'frozen',
    ySplit: dataStart,
    topLeftCell: XLSX.utils.encode_cell({ r: dataStart, c: 0 }),
    activeCell: XLSX.utils.encode_cell({ r: dataStart, c: 0 }),
  }];
  if (lastRow >= headerRow) {
    const endCol = XLSX.utils.encode_col(ncols - 1);
    ws['!autofilter'] = { ref: `A${headerRow + 1}:${endCol}${lastRow + 1}` };
  }

  const setStyle = (r, c, style) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (!ws[addr]) ws[addr] = { t: 's', v: '' };
    ws[addr].s = style;
  };

  const titleStyle = {
    font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: sheetTitleFill } },
    alignment: { horizontal: 'center', vertical: 'center' },
  };
  const subStyle = {
    font: { italic: true, sz: 10, color: { rgb: '475569' } },
    fill: { fgColor: { rgb: 'EFF6FF' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  };
  const statStyle = {
    font: { bold: true, sz: 10, color: { rgb: '1E3A8A' } },
    fill: { fgColor: { rgb: 'DBEAFE' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  };
  const headerStyle = {
    font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '2563EB' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: ALL_BORDERS,
  };

  ws[XLSX.utils.encode_cell({ r: 0, c: 0 })].v = title;
  ws[XLSX.utils.encode_cell({ r: 1, c: 0 })].v = subtitle;
  ws[XLSX.utils.encode_cell({ r: 2, c: 0 })].v = statLine;

  for (let c = 0; c < ncols; c += 1) {
    setStyle(0, c, titleStyle);
    setStyle(1, c, subStyle);
    setStyle(2, c, statStyle);
    setStyle(headerRow, c, headerStyle);
  }

  return setStyle;
}

function setCellNumFmt(ws, XLSX, r, c, fmt) {
  const addr = XLSX.utils.encode_cell({ r, c });
  if (ws[addr]) ws[addr].z = fmt;
}

/**
 * @param {object} opts
 * @param {Array} opts.employees — dòng by_employee đã lọc
 * @param {Array} opts.metricCols — cột metric từ báo cáo
 * @param {Array} opts.surveyRows — từ API survey-visits
 * @param {string} opts.dateFrom
 * @param {string} opts.dateTo
 * @param {string} opts.typeLabel
 * @param {string} opts.periodLabel
 */
export async function downloadOrgEmployeeExcel({
  employees,
  metricCols,
  surveyRows,
  dateFrom,
  dateTo,
  typeLabel,
  periodLabel,
}) {
  const XLSX = await loadXlsxStyle();
  const cols = ensureExportMetricColumns(metricCols);
  const headers = ['Nhân viên', 'Phòng ban', ...cols.map((c) => c.label)];
  const ncols = headers.length;
  const headerRow = 3;
  const dataStart = 4;

  const totalKpi = employees.reduce((s, r) => s + (Number(r.kpi_ledger_net) || 0), 0);
  const empAoa = [];
  empAoa.push(new Array(ncols).fill(''));
  empAoa.push(new Array(ncols).fill(''));
  empAoa.push(new Array(ncols).fill(''));
  empAoa.push([...headers]);

  employees.forEach((row) => {
    const line = [row.full_name || '', row.department_name || ''];
    cols.forEach((col) => line.push(rawEmployeeValue(col, row)));
    empAoa.push(line);
  });

  const empWs = XLSX.utils.aoa_to_sheet(empAoa);
  const empLastRow = dataStart + employees.length - 1;
  const setEmpStyle = applySheetChrome(empWs, XLSX, {
    ncols,
    headerRow,
    dataStart,
    lastRow: empLastRow,
    title: 'BẢNG TỔNG HỢP NHÂN VIÊN — BÁO CÁO CRM',
    subtitle: `Kỳ ${periodLabel} · ${typeLabel} · Xuất lúc ${new Date().toLocaleString('vi-VN')}`,
    statLine: `${employees.length} nhân viên · Tổng điểm KPI: ${totalKpi > 0 ? '+' : ''}${Math.round(totalKpi * 100) / 100}`,
    sheetTitleFill: '1E3A8A',
  });

  empWs['!cols'] = [
    { wch: 24 },
    { wch: 20 },
    ...cols.map((col) => {
      if (VND_KEYS.has(col.key) || col.key === 'won_or_later_value') return { wch: 16 };
      if (col.key === 'kpi_ledger_net') return { wch: 12 };
      if (col.label?.length > 14) return { wch: 16 };
      return { wch: 11 };
    }),
  ];

  employees.forEach((row, idx) => {
    const r = dataStart + idx;
    const zebra = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
    for (let c = 0; c < ncols; c += 1) {
      const isText = c <= 1;
      const colDef = c >= 2 ? cols[c - 2] : null;
      const kind = colDef ? cellKind(colDef.key) : 'text';
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!empWs[addr]) empWs[addr] = { t: 's', v: '' };

      if (kind === 'vnd' || kind === 'kpi' || kind === 'pct' || kind === 'int') {
        const num = Number(empWs[addr].v);
        if (Number.isFinite(num)) {
          empWs[addr].t = 'n';
          empWs[addr].v = num;
        }
      }

      let fontColor = '1F2937';
      let fill = zebra;
      if (colDef?.key === 'kpi_ledger_net') {
        const n = Number(row.kpi_ledger_net) || 0;
        if (n > 0) fontColor = '047857';
        else if (n < 0) fontColor = 'B91C1C';
        fill = n !== 0 ? 'EEF2FF' : zebra;
      }

      setEmpStyle(r, c, {
        font: { bold: c <= 1, sz: 10, color: { rgb: fontColor } },
        fill: { fgColor: { rgb: fill } },
        alignment: {
          horizontal: isText ? 'left' : 'right',
          vertical: 'center',
          wrapText: isText,
        },
        border: ALL_BORDERS,
      });

      if (kind === 'vnd') setCellNumFmt(empWs, XLSX, r, c, VND_NUMFMT);
      else if (kind === 'kpi') setCellNumFmt(empWs, XLSX, r, c, KPI_NUMFMT);
      else if (kind === 'pct') setCellNumFmt(empWs, XLSX, r, c, PCT_NUMFMT);
    }
  });

  const deptByAssignee = new Map(
    employees.map((e) => [String(e.user_id), e.department_name || '']),
  );

  const surveyNcols = SURVEY_HEADERS.length;
  const surveyHeaderRow = 3;
  const surveyDataStart = 4;
  const surveyAoa = [];
  surveyAoa.push(new Array(surveyNcols).fill(''));
  surveyAoa.push(new Array(surveyNcols).fill(''));
  surveyAoa.push(new Array(surveyNcols).fill(''));
  surveyAoa.push([...SURVEY_HEADERS]);

  const surveyData = surveyRows?.length ? surveyRows : [];
  surveyData.forEach((sr) => {
    surveyAoa.push(buildSurveyRow(sr, deptByAssignee));
  });

  const surveyWs = XLSX.utils.aoa_to_sheet(surveyAoa);
  const surveyLastRow = surveyData.length
    ? surveyDataStart + surveyData.length - 1
    : surveyHeaderRow;

  const staffInSurvey = new Set(surveyData.map((s) => s.nhan_vien).filter(Boolean)).size;
  const setSurveyStyle = applySheetChrome(surveyWs, XLSX, {
    ncols: surveyNcols,
    headerRow: surveyHeaderRow,
    dataStart: surveyDataStart,
    lastRow: surveyLastRow,
    title: 'LỊCH KHẢO SÁT NHÂN VIÊN',
    subtitle: `Kỳ ${periodLabel} · Chỉ nhân viên trong bảng tổng hợp · Xuất ${new Date().toLocaleString('vi-VN')}`,
    statLine: surveyData.length
      ? `${surveyData.length} lịch khảo sát · ${staffInSurvey} nhân viên`
      : 'Không có lịch khảo sát trong kỳ đã chọn',
    sheetTitleFill: '047857',
  });

  surveyWs['!cols'] = [
    { wch: 14 }, { wch: 10 }, { wch: 22 }, { wch: 18 },
    { wch: 14 }, { wch: 14 }, { wch: 26 }, { wch: 14 },
    { wch: 30 }, { wch: 16 }, { wch: 28 }, { wch: 14 },
    { wch: 22 }, { wch: 16 }, { wch: 28 },
  ];

  surveyData.forEach((sr, idx) => {
    const r = surveyDataStart + idx;
    const statusFill = surveyStatusFill(sr.status);
    const zebra = idx % 2 === 0 ? statusFill : (statusFill === 'FFFFFF' ? 'F8FAFC' : statusFill);
    for (let c = 0; c < surveyNcols; c += 1) {
      const isText = c !== 0 && c !== 1;
      setSurveyStyle(r, c, {
        font: {
          bold: c === 2,
          sz: 10,
          color: { rgb: sr.status === 'cancelled' ? '991B1B' : '1F2937' },
        },
        fill: { fgColor: { rgb: zebra } },
        alignment: {
          horizontal: c <= 3 ? (c === 0 || c === 1 ? 'center' : 'left') : 'left',
          vertical: 'center',
          wrapText: c >= 8,
        },
        border: ALL_BORDERS,
      });
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, empWs, 'Tổng hợp nhân viên');
  XLSX.utils.book_append_sheet(wb, surveyWs, 'Lịch khảo sát');
  XLSX.writeFile(wb, `crm-nhan-vien_${dateFrom}_${dateTo}.xlsx`);
}
