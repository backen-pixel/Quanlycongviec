import { saveAs } from 'file-saver';

// ── Style constants ──────────────────────────────────────────────────────────
const BORDER_THIN = { style: 'thin', color: { argb: 'FFCBD5E1' } };
const ALL_BORDERS = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

const VND_NUMFMT = '#,##0 "đ"';
const KPI_NUMFMT = '+#,##0.##;-#,##0.##;0';
const PCT_NUMFMT = '0.0"%"';

const VND_KEYS = new Set([
  'quote_value', 'won_or_later_value', 'expected_value', 'weighted_value', 'pipeline_value',
]);
const INT_KEYS = new Set([
  'lead_count', 'deal_count', 'customer_order_count', 'quote_deal_count',
  'won_or_later_deal_count', 'lost_deal_count', 'overdue_count', 'reception_overdue_count',
]);

// ── Sheet name constants ─────────────────────────────────────────────────────
const SN1 = '1. Đánh giá & Xếp hạng KPI';
const SN2 = '2. Chi tiết KPI Tubep';
const SN3 = '3. Chi tiết KPI Tuần';
const SN4 = '4. Chi tiết KPI Chuyển đổi';
const SN5 = '5. Chi tiết KPI Kỷ luật 5S';
const SN6 = '6. Chi tiết KPI Công nợ';

// ── Helpers ──────────────────────────────────────────────────────────────────
function closedWonCount(r) { return r?.won_or_later_deal_count ?? r?.won_deal_count ?? 0; }
function closedWonValue(r) { return r?.won_or_later_value ?? r?.won_value ?? r?.completed_value ?? 0; }
function cancelLostTotal(r) { return (r?.lost_lead_count ?? 0) + (r?.lost_deal_count ?? 0); }
function cancelTotalCount(r) { return (r?.lead_count ?? 0) + (r?.deal_count ?? 0) + (r?.customer_order_count ?? 0); }

export function ensureExportMetricColumns(metricCols) {
  if (!metricCols?.length) return [{ key: 'kpi_ledger_net', label: 'Điểm KPI', align: 'right' }];
  if (metricCols.some((c) => c.key === 'kpi_ledger_net')) return metricCols;
  const cols = [...metricCols];
  const pipeIdx = cols.findIndex((c) => c.key === 'pipeline_value');
  cols.splice(pipeIdx >= 0 ? pipeIdx : cols.length, 0, { key: 'kpi_ledger_net', label: 'Điểm KPI', align: 'right' });
  return cols;
}

function cellKind(key) {
  if (key === 'kpi_ledger_net') return 'kpi';
  if (VND_KEYS.has(key)) return 'vnd';
  if (key === 'won_or_later_value') return 'vnd';
  if (key.endsWith('_pct') || key === 'conversion_rate' || key === 'deal_close_value_rate_pct') return 'pct';
  if (INT_KEYS.has(key) || key === 'won_or_later_deal_count') return 'int';
  if (key === 'monthly_growth_pct') return 'growth';
  return 'text';
}

function rawEmployeeValue(col, row) {
  const k = col.key;
  if (k === 'won_or_later_deal_count') return closedWonCount(row);
  if (k === 'won_or_later_value') return closedWonValue(row);
  if (k === 'pipeline_value') return row.pipeline_value ?? (row.lead_pipeline_value || 0) + (row.deal_pipeline_value || 0);
  if (k === 'kpi_ledger_net') { const n = Number(row.kpi_ledger_net); return Number.isFinite(n) ? n : 0; }
  if (k === 'cancel_rate_pct') {
    const lost = cancelLostTotal(row); const total = cancelTotalCount(row);
    return total ? `${row.cancel_rate_pct ?? 0}% (${lost}/${total})` : '';
  }
  if (k === 'overdue_count') {
    const n = row.overdue_count ?? 0; const pct = row.overdue_rate_pct;
    return pct != null ? `${n} (${pct}%)` : n;
  }
  if (k === 'reception_overdue_count') {
    const eligible = row.reception_eligible_count ?? 0; if (!eligible) return '';
    const n = row.reception_overdue_count ?? 0; const pct = row.reception_overdue_rate_pct;
    return pct != null ? `${n}/${eligible} (${pct}%)` : `${n}/${eligible}`;
  }
  if (k === 'first_stage_on_time_rate_pct') {
    const open = row.first_stage_open_count ?? 0; if (!open) return '';
    return `${row.first_stage_on_time_rate_pct ?? 0}% / ${row.first_stage_overdue_rate_pct ?? 0}%`;
  }
  if (k === 'monthly_growth_pct') {
    if (row.monthly_growth_pct == null) return '';
    const n = Number(row.monthly_growth_pct) || 0;
    return `${n > 0 ? '+' : ''}${n}%`;
  }
  if (k === 'conversion_rate' || k === 'deal_close_value_rate_pct' || k === 'quote_win_rate_pct') {
    return row[k] == null ? '' : row[k];
  }
  return row[k] ?? '';
}

// ── KPI score helpers (dùng cho cached result values) ────────────────────────
function kpiProgressScore(r) {
  const total = r.delivered_deal_count || 0;
  const onTime = r.on_time_deal_count || 0;
  const late = r.late_deal_count || 0;
  const noEv = r.no_evidence_deal_count || 0;
  if (!total) return 0;
  return Math.max(0, (onTime / total) * 20 - late - noEv);
}
function kpiWeeklyScore(r) {
  const kw = r.kpi_weekly; if (!kw) return 0;
  const weeks = [kw.w1, kw.w2, kw.w3, kw.w4, kw.w5].filter((w) => w != null);
  if (!weeks.length) return 0;
  const full = weeks.filter((w) => w === 'Đủ').length;
  const late = weeks.filter((w) => w === 'Trễ').length;
  return ((full + 0.5 * late) / weeks.length) * 20;
}
function kpiConversionScore(r) { return (r.conversion_rate ?? 0) * 0.2; }
function kpiDisciplineScore(r) {
  const kd = r.kpi_discipline; if (!kd) return 10;
  return Math.max(0, 10 - (kd.violations || 0) * (kd.deduction || 2));
}
function kpiDebtScore(r) {
  const kr = r.kpi_receivable; if (!kr || !kr.receivable) return 0;
  return Math.min(30, (kr.collected / kr.receivable) * 30);
}

// ── exceljs styling helpers ──────────────────────────────────────────────────
function fillSolid(argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${argb}` } }; }
function fontObj(opts = {}) {
  return { name: 'Calibri', size: opts.sz || 10, bold: !!opts.bold, italic: !!opts.italic, color: { argb: `FF${opts.color || '1F2937'}` } };
}
function alignObj(h = 'left', wrap = false) { return { horizontal: h, vertical: 'middle', wrapText: wrap }; }

function styleKpiSheetTitle(ws, title, ncols) {
  ws.mergeCells(1, 1, 1, ncols);
  ws.mergeCells(2, 1, 2, ncols);
  ws.mergeCells(3, 1, 3, ncols);
  ws.mergeCells(4, 1, 4, ncols);
  ws.getRow(1).height = 28;
  ws.getRow(5).height = 36;
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = fontObj({ sz: 14, bold: true, color: '1E3A8A' });
  titleCell.fill = fillSolid('DBEAFE');
  titleCell.alignment = alignObj('center');
  for (let r = 2; r <= 4; r++) {
    ws.getCell(r, 1).fill = fillSolid('FFFFFF');
  }
}

function styleKpiHeaders(ws, headers, ncols) {
  const headerRow = ws.getRow(5);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = fontObj({ sz: 10, bold: true, color: 'FFFFFF' });
    cell.fill = fillSolid('2563EB');
    cell.alignment = alignObj('center', true);
    cell.border = ALL_BORDERS;
  });
}

function styleKpiDataRows(ws, dataStartRow, count, ncols) {
  for (let i = 0; i < count; i++) {
    const r = dataStartRow + i;
    const zebra = i % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
    for (let c = 1; c <= ncols; c++) {
      const cell = ws.getCell(r, c);
      cell.font = fontObj({ bold: c <= 2 });
      cell.fill = fillSolid(zebra);
      cell.alignment = alignObj(c > 2 ? 'right' : 'left');
      cell.border = ALL_BORDERS;
    }
  }
}

const SURVEY_HEADERS = [
  'Ngày khảo sát', 'Giờ', 'Nhân viên', 'Phòng ban', 'Mã Deal', 'Mã Lead',
  'Khách hàng', 'SĐT', 'Địa chỉ', 'Khu vực', 'Tiêu đề', 'Trạng thái',
  'Kết quả', 'Lý do hủy', 'Ghi chú',
];

function surveyStatusFill(status) {
  return { completed: 'D1FAE5', planned: 'DBEAFE', in_progress: 'FEF3C7', cancelled: 'FEE2E2' }[status] || 'FFFFFF';
}

// ══════════════════════════════════════════════════════════════════════════════
// Main export
// ══════════════════════════════════════════════════════════════════════════════
export async function downloadOrgEmployeeExcel({
  employees, metricCols, surveyRows, dateFrom, dateTo, typeLabel, periodLabel,
}) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const kpiEmployees = employees.filter((r) => r.user_id);
  const empCount = kpiEmployees.length;
  const DATA_ROW = 6; // data bắt đầu ở Excel row 6 (header row 5)

  // ── Sheet 1: Đánh giá & Xếp hạng KPI ──────────────────────────────────
  const s1 = wb.addWorksheet(SN1);
  s1.mergeCells(1, 1, 1, 11);
  s1.getCell(1, 1).value = 'BÁO CÁO ĐÁNH GIÁ VÀ XẾP HẠNG KPI CHI TIẾT';
  s1.getCell(1, 1).font = fontObj({ sz: 14, bold: true, color: '1E3A8A' });
  s1.getCell(1, 1).fill = fillSolid('DBEAFE');
  s1.getCell(1, 1).alignment = alignObj('center');
  s1.getRow(1).height = 28;

  s1.mergeCells(3, 1, 3, 11);
  s1.getCell(3, 1).value = 'BẢNG ĐÁNH GIÁ TOÀN DIỆN DIỄN BIẾN NĂNG LỰC NHÂN VIÊN';
  s1.getCell(3, 1).font = fontObj({ sz: 11, bold: true, color: '1E3A8A' });
  s1.getCell(3, 1).fill = fillSolid('EFF6FF');
  s1.getCell(3, 1).alignment = alignObj('center');

  // Bảng tra cứu thưởng
  s1.mergeCells(3, 13, 3, 14);
  s1.getCell(3, 13).value = 'BẢNG TRA CỨU THƯỞNG';
  s1.getCell(3, 13).font = fontObj({ sz: 10, bold: true, color: '1E3A8A' });
  s1.getCell(3, 13).fill = fillSolid('FEF3C7');
  s1.getCell(3, 13).alignment = alignObj('center');

  // Bonus ref headers
  const refHdrStyle = { font: fontObj({ sz: 10, bold: true }), fill: fillSolid('FEF3C7'), alignment: alignObj('center'), border: ALL_BORDERS };
  const c4m = s1.getCell(4, 13); c4m.value = 'Tỷ lệ đạt'; Object.assign(c4m, refHdrStyle);
  const c4n = s1.getCell(4, 14); c4n.value = 'Hệ số'; Object.assign(c4n, refHdrStyle);

  const bonusRefRows = [
    ['95-100%', 1.1], ['90-95%', 1.0], ['85-90%', 0.9],
    ['80-85%', 0.8], ['70-80%', 0.7], ['50-70%', 0.5], ['<50%', 'Out'],
  ];
  bonusRefRows.forEach(([label, factor], i) => {
    const r = 5 + i;
    const cL = s1.getCell(r, 13); cL.value = label;
    cL.font = fontObj({}); cL.fill = fillSolid('FFFBEB'); cL.alignment = alignObj('center'); cL.border = ALL_BORDERS;
    const cF = s1.getCell(r, 14); cF.value = factor;
    cF.font = fontObj({}); cF.fill = fillSolid('FFFBEB'); cF.alignment = alignObj('center'); cF.border = ALL_BORDERS;
  });

  // S1 headers (row 5)
  const s1Headers = ['STT', 'Tên Nhân Viên', 'KPI Tiến Độ\nTubep (Max 20)', 'KPI Báo Cáo\nTuần (Max 20)',
    'KPI Chuyển Đổi\nTiếp Nhận -> HĐ\n(Max 20)', 'KPI Kỷ Luật\n5S (Max 10)', 'KPI Quản Lý\nCông Nợ (Max 30)',
    'Tổng Điểm\nKPI (Max 100)', 'Tỷ Lệ\nĐạt (%)', 'Hệ Số\nThưởng', 'Đánh giá / Ghi chú\ncủa Quản lý'];
  s1.getRow(5).height = 36;
  s1Headers.forEach((h, i) => {
    const cell = s1.getCell(5, i + 1);
    cell.value = h;
    cell.font = fontObj({ sz: 10, bold: true, color: 'FFFFFF' });
    cell.fill = fillSolid('2563EB');
    cell.alignment = alignObj('center', true);
    cell.border = ALL_BORDERS;
  });

  // S1 column widths
  [5, 24, 16, 16, 20, 14, 16, 14, 10, 10, 28, 2, 12, 8].forEach((w, i) => { s1.getColumn(i + 1).width = w; });

  // S1 data rows — FORMULAS liên kết với các sheet khác
  const qSN2 = `'${SN2}'`; const qSN3 = `'${SN3}'`; const qSN4 = `'${SN4}'`; const qSN5 = `'${SN5}'`; const qSN6 = `'${SN6}'`;
  kpiEmployees.forEach((r, i) => {
    const er = DATA_ROW + i; // Excel row
    const zebra = i % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
    const ds = { font: fontObj({}), fill: fillSolid(zebra), alignment: alignObj('right'), border: ALL_BORDERS };
    const dsL = { ...ds, font: fontObj({ bold: true }), alignment: alignObj('left') };

    s1.getCell(er, 1).value = i + 1; Object.assign(s1.getCell(er, 1), ds);
    s1.getCell(er, 2).value = r.full_name || ''; Object.assign(s1.getCell(er, 2), dsL);
    // C = KPI Tiến Độ ← Sheet 2 col H
    s1.getCell(er, 3).value = { formula: `${qSN2}!H${er}`, result: kpiProgressScore(r) }; Object.assign(s1.getCell(er, 3), ds);
    // D = KPI Tuần ← Sheet 3 col H
    s1.getCell(er, 4).value = { formula: `${qSN3}!H${er}`, result: kpiWeeklyScore(r) }; Object.assign(s1.getCell(er, 4), ds);
    // E = KPI Chuyển đổi ← Sheet 4 col F
    s1.getCell(er, 5).value = { formula: `${qSN4}!F${er}`, result: kpiConversionScore(r) }; Object.assign(s1.getCell(er, 5), ds);
    // F = KPI 5S ← Sheet 5 col E
    s1.getCell(er, 6).value = { formula: `${qSN5}!E${er}`, result: kpiDisciplineScore(r) }; Object.assign(s1.getCell(er, 6), ds);
    // G = KPI Công nợ ← Sheet 6 col F
    s1.getCell(er, 7).value = { formula: `${qSN6}!F${er}`, result: kpiDebtScore(r) }; Object.assign(s1.getCell(er, 7), ds);
    // H = Tổng = SUM(C:G)
    s1.getCell(er, 8).value = { formula: `SUM(C${er}:G${er})`, result: kpiProgressScore(r) + kpiWeeklyScore(r) + kpiConversionScore(r) + kpiDisciplineScore(r) + kpiDebtScore(r) }; Object.assign(s1.getCell(er, 8), ds);
    // I = Tỷ lệ = H/100
    s1.getCell(er, 9).value = { formula: `H${er}/100`, result: (kpiProgressScore(r) + kpiWeeklyScore(r) + kpiConversionScore(r) + kpiDisciplineScore(r) + kpiDebtScore(r)) / 100 };
    s1.getCell(er, 9).numFmt = '0.0%'; Object.assign(s1.getCell(er, 9), ds);
    // J = Hệ số = nested IF
    s1.getCell(er, 10).value = { formula: `IF(H${er}>=95,1.1,IF(H${er}>=90,1,IF(H${er}>=85,0.9,IF(H${er}>=80,0.8,IF(H${er}>=70,0.7,IF(H${er}>=50,0.5,"Out"))))))`, result: '' }; Object.assign(s1.getCell(er, 10), ds);
    // K = Ghi chú
    s1.getCell(er, 11).value = ''; Object.assign(s1.getCell(er, 11), { ...ds, alignment: alignObj('left', true) });
  });

  // ── Sheet 2: KPI Tiến Độ Tubep ─────────────────────────────────────────
  const s2 = wb.addWorksheet(SN2);
  const s2Headers = ['STT', 'Nhân viên', 'Tổng số Deal\nGiao tháng', 'Số Deal đúng\nDeadline (A)',
    'Số Deal trễ\nDeadline', 'Số Deal thiếu\nbằng chứng (B)', 'Tỷ lệ\nĐúng hạn', 'ĐIỂM KPI\n(Thang 20)'];
  styleKpiSheetTitle(s2, 'SỔ KIỂM TRA ĐÁNH GIÁ TIẾN ĐỘ TRÊN PHẦN MỀM TUBEP', 8);
  styleKpiHeaders(s2, s2Headers, 8);
  [5, 24, 14, 14, 14, 14, 12, 14].forEach((w, i) => { s2.getColumn(i + 1).width = w; });

  kpiEmployees.forEach((r, i) => {
    const er = DATA_ROW + i;
    const row = s2.getRow(er);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = r.full_name || '';
    row.getCell(3).value = r.delivered_deal_count || 0;
    row.getCell(4).value = r.on_time_deal_count || 0;
    row.getCell(5).value = r.late_deal_count || 0;
    row.getCell(6).value = r.no_evidence_deal_count || 0;
    // G = Tỷ lệ = IF(C>0, D/C, 0)
    row.getCell(7).value = { formula: `IF(C${er}>0,D${er}/C${er},0)`, result: (r.delivered_deal_count || 0) > 0 ? (r.on_time_deal_count || 0) / (r.delivered_deal_count || 0) : 0 };
    row.getCell(7).numFmt = '0.0%';
    // H = Điểm = MAX(0, G*20 - E - F)
    row.getCell(8).value = { formula: `MAX(0,G${er}*20-E${er}-F${er})`, result: kpiProgressScore(r) };
  });
  styleKpiDataRows(s2, DATA_ROW, empCount, 8);

  // ── Sheet 3: KPI Báo cáo Tuần ──────────────────────────────────────────
  const s3 = wb.addWorksheet(SN3);
  const s3Headers = ['STT', 'Nhân viên', 'Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4', 'Tỷ lệ\nNộp (%)', 'ĐIỂM KPI\n(Thang 20)'];
  styleKpiSheetTitle(s3, 'SỔ THEO DÕI NỘP BÁO CÁO HÀNG TUẦN', 8);
  styleKpiHeaders(s3, s3Headers, 8);
  [5, 24, 10, 10, 10, 10, 12, 14].forEach((w, i) => { s3.getColumn(i + 1).width = w; });

  kpiEmployees.forEach((r, i) => {
    const er = DATA_ROW + i;
    const row = s3.getRow(er);
    const kw = r.kpi_weekly;
    row.getCell(1).value = i + 1;
    row.getCell(2).value = r.full_name || '';
    row.getCell(3).value = kw?.w1 || '';
    row.getCell(4).value = kw?.w2 || '';
    row.getCell(5).value = kw?.w3 || '';
    row.getCell(6).value = kw?.w4 || '';
    // G = (COUNTIF(C:F,"Đủ") + 0.5*COUNTIF(C:F,"Trễ")) / 4
    row.getCell(7).value = { formula: `(COUNTIF(C${er}:F${er},"Đủ")+0.5*COUNTIF(C${er}:F${er},"Trễ"))/4`, result: kpiWeeklyScore(r) / 20 };
    row.getCell(7).numFmt = '0.0%';
    // H = Điểm = G * 20
    row.getCell(8).value = { formula: `G${er}*20`, result: kpiWeeklyScore(r) };

    // 🔽 Dropdown validation cho Tuần 1-4 (Đủ / Thiếu / Trễ)
    for (let c = 3; c <= 6; c++) {
      row.getCell(c).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Đủ,Thiếu,Trễ"'],
        showErrorMessage: true,
        errorTitle: 'Giá trị không hợp lệ',
        error: 'Chỉ chọn: Đủ, Thiếu, hoặc Trễ',
      };
      row.getCell(c).alignment = alignObj('center');
    }
  });
  styleKpiDataRows(s3, DATA_ROW, empCount, 8);
  // Re-apply center alignment cho tuần columns sau khi styleKpiDataRows
  kpiEmployees.forEach((_, i) => {
    const er = DATA_ROW + i;
    for (let c = 3; c <= 6; c++) {
      s3.getCell(er, c).alignment = alignObj('center');
    }
  });

  // ── Sheet 4: KPI Chuyển đổi ────────────────────────────────────────────
  const s4 = wb.addWorksheet(SN4);
  const s4Headers = ['STT', 'Nhân viên', 'Số Deal\ntiếp nhận', 'Số Deal ký HĐ\nthành công',
    'Tỷ lệ chuyển đổi\nthực tế (%)', 'ĐIỂM KPI\n(Thang 20)'];
  styleKpiSheetTitle(s4, 'SỔ THEO DÕI TỶ LỆ CHUYỂN ĐỔI TỪ BÁO GIÁ SANG HỢP ĐỒNG CHÍNH THỨC', 6);
  styleKpiHeaders(s4, s4Headers, 6);
  [5, 24, 18, 20, 18, 14].forEach((w, i) => { s4.getColumn(i + 1).width = w; });

  kpiEmployees.forEach((r, i) => {
    const er = DATA_ROW + i;
    const row = s4.getRow(er);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = r.full_name || '';
    row.getCell(3).value = r.deal_count || 0;
    row.getCell(4).value = closedWonCount(r);
    // E = IF(C>0, D/C, 0)
    row.getCell(5).value = { formula: `IF(C${er}>0,D${er}/C${er},0)`, result: (r.deal_count || 0) > 0 ? closedWonCount(r) / (r.deal_count || 0) : 0 };
    row.getCell(5).numFmt = '0.0%';
    // F = E * 20
    row.getCell(6).value = { formula: `E${er}*20`, result: kpiConversionScore(r) };
  });
  styleKpiDataRows(s4, DATA_ROW, empCount, 6);

  // ── Sheet 5: KPI Kỷ luật 5S ────────────────────────────────────────────
  const s5 = wb.addWorksheet(SN5);
  const s5Headers = ['STT', 'Nhân viên', 'Số lần vi phạm\n(Check-out/Camera)', 'Định mức trừ\n(Điểm/lần)',
    'ĐIỂM KPI CÒN LẠI\n(Thang 10)'];
  styleKpiSheetTitle(s5, 'SỔ THEO DÕI VI PHẠM KỶ LUẬT & ĐỂ ĐỒ SAI QUY ĐỊNH', 5);
  styleKpiHeaders(s5, s5Headers, 5);
  [5, 24, 20, 16, 18].forEach((w, i) => { s5.getColumn(i + 1).width = w; });

  kpiEmployees.forEach((r, i) => {
    const er = DATA_ROW + i;
    const row = s5.getRow(er);
    const kd = r.kpi_discipline;
    row.getCell(1).value = i + 1;
    row.getCell(2).value = r.full_name || '';
    row.getCell(3).value = kd?.violations ?? 0;
    row.getCell(4).value = kd?.deduction ?? 2;
    // E = MAX(0, 10 - C*D)
    row.getCell(5).value = { formula: `MAX(0,10-C${er}*D${er})`, result: kpiDisciplineScore(r) };
  });
  styleKpiDataRows(s5, DATA_ROW, empCount, 5);

  // ── Sheet 6: KPI Công nợ ────────────────────────────────────────────────
  const s6 = wb.addWorksheet(SN6);
  const s6Headers = ['STT', 'Nhân viên', 'Công nợ phải thu\ntrong tháng', 'Số tiền đã thu\nđúng hạn thực tế',
    'Tỷ lệ thu\nHồi (%)', 'ĐIỂM KPI\n(Thang 30)'];
  styleKpiSheetTitle(s6, 'SỔ ĐÁNH GIÁ CHẤT LƯỢNG THU HỒI CÔNG NỢ', 6);
  styleKpiHeaders(s6, s6Headers, 6);
  [5, 24, 18, 18, 14, 14].forEach((w, i) => { s6.getColumn(i + 1).width = w; });

  kpiEmployees.forEach((r, i) => {
    const er = DATA_ROW + i;
    const row = s6.getRow(er);
    const kr = r.kpi_receivable;
    row.getCell(1).value = i + 1;
    row.getCell(2).value = r.full_name || '';
    row.getCell(3).value = kr?.receivable ?? 0; row.getCell(3).numFmt = '#,##0';
    row.getCell(4).value = kr?.collected ?? 0; row.getCell(4).numFmt = '#,##0';
    // E = IF(C>0, D/C, 0)
    row.getCell(5).value = { formula: `IF(C${er}>0,D${er}/C${er},0)`, result: (kr?.receivable ?? 0) > 0 ? (kr?.collected ?? 0) / (kr?.receivable ?? 0) : 0 };
    row.getCell(5).numFmt = '0.0%';
    // F = MIN(30, E*30)
    row.getCell(6).value = { formula: `MIN(30,E${er}*30)`, result: kpiDebtScore(r) };
  });
  styleKpiDataRows(s6, DATA_ROW, empCount, 6);

  // ── Sheet 7: Tổng hợp nhân viên ────────────────────────────────────────
  const cols = ensureExportMetricColumns(metricCols);
  const empHeaders = ['Nhân viên', 'Phòng ban', ...cols.map((c) => c.label)];
  const empNcols = empHeaders.length;
  const empWs = wb.addWorksheet('Tổng hợp nhân viên');

  const totalKpi = employees.reduce((s, r) => s + (Number(r.kpi_ledger_net) || 0), 0);
  empWs.mergeCells(1, 1, 1, empNcols);
  empWs.getCell(1, 1).value = 'BẢNG TỔNG HỢP NHÂN VIÊN — BÁO CÁO CRM';
  empWs.getCell(1, 1).font = fontObj({ sz: 16, bold: true, color: 'FFFFFF' });
  empWs.getCell(1, 1).fill = fillSolid('1E3A8A');
  empWs.getCell(1, 1).alignment = alignObj('center');
  empWs.getRow(1).height = 32;

  empWs.mergeCells(2, 1, 2, empNcols);
  empWs.getCell(2, 1).value = `Kỳ ${periodLabel} · ${typeLabel} · Xuất lúc ${new Date().toLocaleString('vi-VN')}`;
  empWs.getCell(2, 1).font = fontObj({ sz: 10, italic: true, color: '475569' });
  empWs.getCell(2, 1).fill = fillSolid('EFF6FF');
  empWs.getCell(2, 1).alignment = alignObj('center', true);

  empWs.mergeCells(3, 1, 3, empNcols);
  empWs.getCell(3, 1).value = `${employees.length} nhân viên · Tổng điểm KPI: ${totalKpi > 0 ? '+' : ''}${Math.round(totalKpi * 100) / 100}`;
  empWs.getCell(3, 1).font = fontObj({ sz: 10, bold: true, color: '1E3A8A' });
  empWs.getCell(3, 1).fill = fillSolid('DBEAFE');
  empWs.getCell(3, 1).alignment = alignObj('center', true);

  empWs.getRow(4).height = 26;
  empHeaders.forEach((h, i) => {
    const cell = empWs.getCell(4, i + 1);
    cell.value = h;
    cell.font = fontObj({ sz: 10, bold: true, color: 'FFFFFF' });
    cell.fill = fillSolid('2563EB');
    cell.alignment = alignObj('center', true);
    cell.border = ALL_BORDERS;
  });

  empWs.getColumn(1).width = 24;
  empWs.getColumn(2).width = 20;
  cols.forEach((col, ci) => {
    let w = 11;
    if (VND_KEYS.has(col.key) || col.key === 'won_or_later_value') w = 16;
    else if (col.key === 'kpi_ledger_net') w = 12;
    else if (col.label?.length > 14) w = 16;
    empWs.getColumn(ci + 3).width = w;
  });

  employees.forEach((row, idx) => {
    const r = 5 + idx;
    const zebra = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
    empWs.getCell(r, 1).value = row.full_name || '';
    empWs.getCell(r, 2).value = row.department_name || '';
    cols.forEach((col, ci) => {
      const c = ci + 3;
      const val = rawEmployeeValue(col, row);
      const kind = cellKind(col.key);
      const cell = empWs.getCell(r, c);
      if ((kind === 'vnd' || kind === 'kpi' || kind === 'pct' || kind === 'int') && Number.isFinite(Number(val))) {
        cell.value = Number(val);
      } else {
        cell.value = val;
      }
      if (kind === 'vnd') cell.numFmt = VND_NUMFMT;
      else if (kind === 'kpi') cell.numFmt = KPI_NUMFMT;
      else if (kind === 'pct') cell.numFmt = PCT_NUMFMT;
    });
    // Styling
    let fontColor = '1F2937'; let fill = zebra;
    if (cols.some((c) => c.key === 'kpi_ledger_net')) {
      const n = Number(row.kpi_ledger_net) || 0;
      if (n > 0) fontColor = '047857'; else if (n < 0) fontColor = 'B91C1C';
    }
    for (let c = 1; c <= empNcols; c++) {
      const cell = empWs.getCell(r, c);
      cell.font = fontObj({ bold: c <= 2, color: c <= 2 ? '1F2937' : fontColor });
      cell.fill = fillSolid(fill);
      cell.alignment = alignObj(c <= 2 ? 'left' : 'right', c <= 2);
      cell.border = ALL_BORDERS;
    }
  });

  empWs.views = [{ state: 'frozen', ySplit: 4, xSplit: 0 }];

  // ── Sheet 8: Lịch khảo sát ─────────────────────────────────────────────
  const surveyWs = wb.addWorksheet('Lịch khảo sát');
  const surveyData = surveyRows?.length ? surveyRows : [];
  const deptByAssignee = new Map(employees.map((e) => [String(e.user_id), e.department_name || '']));
  const staffInSurvey = new Set(surveyData.map((s) => s.nhan_vien).filter(Boolean)).size;

  surveyWs.mergeCells(1, 1, 1, 15);
  surveyWs.getCell(1, 1).value = 'LỊCH KHẢO SÁT NHÂN VIÊN';
  surveyWs.getCell(1, 1).font = fontObj({ sz: 16, bold: true, color: 'FFFFFF' });
  surveyWs.getCell(1, 1).fill = fillSolid('047857');
  surveyWs.getCell(1, 1).alignment = alignObj('center');
  surveyWs.getRow(1).height = 32;

  surveyWs.mergeCells(2, 1, 2, 15);
  surveyWs.getCell(2, 1).value = `Kỳ ${periodLabel} · Chỉ nhân viên trong bảng tổng hợp · Xuất ${new Date().toLocaleString('vi-VN')}`;
  surveyWs.getCell(2, 1).font = fontObj({ sz: 10, italic: true, color: '475569' });
  surveyWs.getCell(2, 1).fill = fillSolid('EFF6FF');
  surveyWs.getCell(2, 1).alignment = alignObj('center', true);

  surveyWs.mergeCells(3, 1, 3, 15);
  surveyWs.getCell(3, 1).value = surveyData.length
    ? `${surveyData.length} lịch khảo sát · ${staffInSurvey} nhân viên`
    : 'Không có lịch khảo sát trong kỳ đã chọn';
  surveyWs.getCell(3, 1).font = fontObj({ sz: 10, bold: true, color: '1E3A8A' });
  surveyWs.getCell(3, 1).fill = fillSolid('DBEAFE');
  surveyWs.getCell(3, 1).alignment = alignObj('center', true);

  surveyWs.getRow(4).height = 26;
  SURVEY_HEADERS.forEach((h, i) => {
    const cell = surveyWs.getCell(4, i + 1);
    cell.value = h;
    cell.font = fontObj({ sz: 10, bold: true, color: 'FFFFFF' });
    cell.fill = fillSolid('047857');
    cell.alignment = alignObj('center', true);
    cell.border = ALL_BORDERS;
  });
  [14, 10, 22, 18, 14, 14, 26, 14, 30, 16, 28, 14, 22, 16, 28].forEach((w, i) => { surveyWs.getColumn(i + 1).width = w; });

  surveyData.forEach((sr, idx) => {
    const r = 5 + idx;
    const dept = sr.phong_ban || deptByAssignee.get(String(sr.assignee_id || '')) || '';
    const vals = [
      sr.ngay_khao_sat || '', sr.gio || '', sr.nhan_vien || '', dept, sr.ma_deal || '',
      sr.ma_lead || '', sr.khach_hang || '', sr.sdt || '', sr.dia_chi || '', sr.khu_vuc || '',
      sr.tieu_de || '', sr.trang_thai || '', sr.ket_qua || '', sr.ly_do_huy || '', sr.ghi_chu || '',
    ];
    const statusFill = surveyStatusFill(sr.status);
    const zebra = idx % 2 === 0 ? statusFill : (statusFill === 'FFFFFF' ? 'F8FAFC' : statusFill);
    vals.forEach((v, c) => {
      const cell = surveyWs.getCell(r, c + 1);
      cell.value = v;
      cell.font = fontObj({ bold: c === 2, color: sr.status === 'cancelled' ? '991B1B' : '1F2937' });
      cell.fill = fillSolid(zebra);
      cell.alignment = alignObj(c <= 3 ? (c <= 1 ? 'center' : 'left') : 'left', c >= 8);
      cell.border = ALL_BORDERS;
    });
  });

  surveyWs.views = [{ state: 'frozen', ySplit: 4, xSplit: 0 }];

  // ── Write & download ───────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `BAO_CAO_KPI_NHAN_VIEN_${dateFrom}_${dateTo}.xlsx`);
}
