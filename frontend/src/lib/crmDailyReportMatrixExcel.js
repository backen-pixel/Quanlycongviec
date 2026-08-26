import { saveAs } from 'file-saver';

const BORDER = { style: 'thin', color: { argb: 'FFCBD5E1' } };
const ALL = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

function fill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${argb}` } };
}
function font(opts = {}) {
  return {
    name: 'Calibri',
    size: opts.sz || 10,
    bold: !!opts.bold,
    italic: !!opts.italic,
    color: { argb: `FF${opts.color || '1F2937'}` },
  };
}
function align(h = 'left', wrap = false) {
  return { horizontal: h, vertical: 'middle', wrapText: wrap };
}

function sheetName(raw) {
  const s = String(raw || 'Sheet')
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (s || 'Sheet').slice(0, 31);
}

function fmtDmy(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '—';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function cellVal(row, empId) {
  if (!row?.values) return null;
  const id = String(empId);
  if (Object.prototype.hasOwnProperty.call(row.values, id)) return row.values[id];
  if (Object.prototype.hasOwnProperty.call(row.values, empId)) return row.values[empId];
  return null;
}

function asNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== '' ? n : null;
}

function rowMax(row, employees) {
  let max = 0;
  for (const emp of employees || []) {
    const n = asNumber(cellVal(row, emp.id));
    if (n != null && n > max) max = n;
  }
  return max;
}

function heatFill(n, max) {
  if (n == null) return 'F8FAFC';
  if (n === 0) return 'F1F5F9';
  if (!max || max <= 0) return 'DCFCE7';
  const r = n / max;
  if (r <= 0.2) return 'ECFDF5';
  if (r <= 0.4) return 'D1FAE5';
  if (r <= 0.6) return 'A7F3D0';
  if (r <= 0.8) return '6EE7B7';
  return '059669';
}

function heatFont(n, max) {
  if (n == null) return font({ color: '94A3B8' });
  if (n === 0) return font({ color: '94A3B8' });
  const r = !max || max <= 0 ? 0 : n / max;
  if (r > 0.8) return font({ bold: true, color: 'FFFFFF' });
  if (r > 0.4) return font({ bold: true, color: '064E3B' });
  return font({ bold: true, color: '065F46' });
}

function applyTitleBlock(ws, { title, subtitle, note, ncols, headerArgb, titleArgb }) {
  const n = Math.max(ncols, 4);
  ws.mergeCells(1, 1, 1, n);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = font({ sz: 16, bold: true, color: 'FFFFFF' });
  t.fill = fill(titleArgb);
  t.alignment = align('left');
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, n);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = font({ sz: 10, color: '1E293B' });
  s.fill = fill(headerArgb);
  s.alignment = align('left');
  ws.getRow(2).height = 18;

  ws.mergeCells(3, 1, 3, n);
  const noteCell = ws.getCell(3, 1);
  noteCell.value = note;
  noteCell.font = font({ sz: 9, italic: true, color: '475569' });
  noteCell.fill = fill('F8FAFC');
  noteCell.alignment = align('left', true);
  ws.getRow(3).height = 28;
}

function writeMatrixSheet(wb, {
  name, title, subtitle, note, headerArgb, titleArgb, employees, rows,
}) {
  const emps = employees || [];
  const metrics = rows || [];
  const ncols = 3 + emps.length; // STT | Hạng mục | ...NV | Tổng
  const ws = wb.addWorksheet(sheetName(name), {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 5, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  applyTitleBlock(ws, { title, subtitle, note, ncols, headerArgb, titleArgb });

  const headerRow = 5;
  ws.getRow(headerRow).height = 42;
  const headers = ['STT', 'Hạng mục', ...emps.map((e) => e.full_name || e.email || '—'), 'Tổng'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = font({ sz: 10, bold: true, color: 'FFFFFF' });
    cell.fill = fill(titleArgb);
    cell.alignment = align('center', true);
    cell.border = ALL;
  });

  // Phòng ban dưới tên (row 4, merged into header visually via row 4 labels)
  ws.getRow(4).height = 16;
  ws.getCell(4, 1).value = '';
  ws.getCell(4, 2).value = 'Phòng';
  ws.getCell(4, 2).font = font({ sz: 8, italic: true, color: '64748B' });
  ws.getCell(4, 2).fill = fill(headerArgb);
  emps.forEach((e, i) => {
    const cell = ws.getCell(4, 3 + i);
    cell.value = e.department_name || '';
    cell.font = font({ sz: 8, italic: true, color: '334155' });
    cell.fill = fill(headerArgb);
    cell.alignment = align('center', true);
    cell.border = ALL;
  });
  ws.getCell(4, ncols).value = '';
  ws.getCell(4, ncols).fill = fill(headerArgb);
  for (let c = 1; c <= 2; c++) {
    ws.getCell(4, c).fill = fill(headerArgb);
    ws.getCell(4, c).border = ALL;
  }
  ws.getCell(4, ncols).border = ALL;

  const colTotals = emps.map(() => 0);
  let grand = 0;

  metrics.forEach((row, ri) => {
    const excelRow = headerRow + 1 + ri;
    const zebra = ri % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
    const max = rowMax(row, emps);
    let lineSum = 0;
    let lineHasNum = false;

    const stt = ws.getCell(excelRow, 1);
    stt.value = ri + 1;
    stt.font = font({ color: '64748B' });
    stt.fill = fill(zebra);
    stt.alignment = align('center');
    stt.border = ALL;

    const label = ws.getCell(excelRow, 2);
    label.value = row.label || '—';
    label.font = font({ bold: true });
    label.fill = fill(zebra);
    label.alignment = align('left', true);
    label.border = ALL;

    emps.forEach((emp, ci) => {
      const raw = cellVal(row, emp.id);
      const n = asNumber(raw);
      const cell = ws.getCell(excelRow, 3 + ci);
      cell.border = ALL;
      cell.alignment = align('center');
      if (n == null) {
        cell.value = raw == null || raw === '' ? '—' : String(raw);
        cell.font = font({ color: '94A3B8' });
        cell.fill = fill(zebra);
      } else {
        cell.value = n;
        cell.numFmt = '#,##0';
        cell.font = heatFont(n, max);
        cell.fill = fill(heatFill(n, max));
        lineSum += n;
        lineHasNum = true;
        colTotals[ci] += n;
        grand += n;
      }
    });

    const tot = ws.getCell(excelRow, ncols);
    tot.border = ALL;
    tot.alignment = align('center');
    tot.font = font({ bold: true, color: '0F172A' });
    tot.fill = fill('E2E8F0');
    if (lineHasNum) {
      tot.value = lineSum;
      tot.numFmt = '#,##0';
    } else {
      tot.value = '—';
    }
  });

  const totalRow = headerRow + 1 + metrics.length;
  ws.getRow(totalRow).height = 22;
  const tLabel = ws.getCell(totalRow, 1);
  ws.mergeCells(totalRow, 1, totalRow, 2);
  tLabel.value = 'TỔNG CỘT';
  tLabel.font = font({ bold: true, color: 'FFFFFF' });
  tLabel.fill = fill(titleArgb);
  tLabel.alignment = align('right');
  tLabel.border = ALL;
  ws.getCell(totalRow, 2).border = ALL;
  ws.getCell(totalRow, 2).fill = fill(titleArgb);

  emps.forEach((_, ci) => {
    const cell = ws.getCell(totalRow, 3 + ci);
    cell.value = colTotals[ci];
    cell.numFmt = '#,##0';
    cell.font = font({ bold: true, color: 'FFFFFF' });
    cell.fill = fill(titleArgb);
    cell.alignment = align('center');
    cell.border = ALL;
  });
  const g = ws.getCell(totalRow, ncols);
  g.value = grand;
  g.numFmt = '#,##0';
  g.font = font({ bold: true, color: 'FFFFFF' });
  g.fill = fill('0F172A');
  g.alignment = align('center');
  g.border = ALL;

  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 32;
  for (let i = 0; i < emps.length; i += 1) ws.getColumn(3 + i).width = 14;
  ws.getColumn(ncols).width = 12;

  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: ncols },
  };

  return ws;
}

function writeCompareSheet(wb, { date, groups }) {
  const ws = wb.addWorksheet(sheetName('So sánh KH vs KQ'), {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 5, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });
  const ncols = 10;
  applyTitleBlock(ws, {
    title: 'SO SÁNH KẾ HOẠCH VÀ KẾT QUẢ',
    subtitle: `Ngày ${fmtDmy(date)}  ·  mỗi dòng = 1 hạng mục × 1 nhân viên`,
    note: 'Lọc theo Mẫu / Nhân viên / Hạng mục. % đạt = Kết quả ÷ Kế hoạch (khi kế hoạch > 0). Cột Chênh = Kết quả − Kế hoạch.',
    ncols,
    headerArgb: 'EDE9FE',
    titleArgb: '5B21B6',
  });

  const headers = [
    'STT', 'Mẫu', 'Nhân viên', 'Phòng ban', 'Hạng mục',
    'Kế hoạch', 'Kết quả', '% đạt', 'Chênh (KQ−KH)', 'Ghi chú',
  ];
  const headerRow = 5;
  ws.getRow(headerRow).height = 22;
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = font({ bold: true, color: 'FFFFFF' });
    cell.fill = fill('5B21B6');
    cell.alignment = align('center', true);
    cell.border = ALL;
  });

  let ri = 0;
  for (const g of groups || []) {
    const emps = g.employees || [];
    const plan = (g.sections || []).find((s) => s.key === 'plan');
    const result = (g.sections || []).find((s) => s.key === 'result');
    const planRows = plan?.rows || [];
    const resultRows = result?.rows || [];
    const keys = [];
    const seen = new Set();
    for (const row of [...planRows, ...resultRows]) {
      const k = row.metric_key || row.key || row.label;
      if (!k || seen.has(k)) continue;
      seen.add(k);
      keys.push(k);
    }
    const planByKey = new Map(planRows.map((r) => [r.metric_key || r.key || r.label, r]));
    const resultByKey = new Map(resultRows.map((r) => [r.metric_key || r.key || r.label, r]));

    for (const emp of emps) {
      for (const k of keys) {
        const pRow = planByKey.get(k);
        const rRow = resultByKey.get(k);
        const p = asNumber(pRow ? cellVal(pRow, emp.id) : null) ?? 0;
        const r = asNumber(rRow ? cellVal(rRow, emp.id) : null) ?? 0;
        if (p === 0 && r === 0) continue;
        ri += 1;
        const excelRow = headerRow + ri;
        const zebra = ri % 2 === 0 ? 'F8FAFC' : 'FFFFFF';
        const pct = p > 0 ? r / p : null;
        const delta = r - p;
        const note = pct == null
          ? (p === 0 && r > 0 ? 'Có KQ, KH = 0' : '')
          : (pct >= 1 ? 'Đạt / vượt' : 'Chưa đạt KH');

        const values = [
          ri,
          g.template_name || g.role_key || '',
          emp.full_name || '',
          emp.department_name || '',
          (pRow || rRow)?.label || k,
          p,
          r,
          pct,
          delta,
          note,
        ];
        values.forEach((v, ci) => {
          const cell = ws.getCell(excelRow, ci + 1);
          cell.value = v;
          cell.border = ALL;
          cell.fill = fill(zebra);
          cell.font = font({});
          if (ci === 0) cell.alignment = align('center');
          if (ci === 5 || ci === 6 || ci === 8) {
            cell.numFmt = '#,##0';
            cell.alignment = align('center');
            cell.font = font({ bold: true });
          }
          if (ci === 7) {
            cell.numFmt = '0%';
            cell.alignment = align('center');
            if (pct == null) {
              cell.value = '—';
              cell.font = font({ color: '94A3B8' });
            } else if (pct >= 1) {
              cell.fill = fill('D1FAE5');
              cell.font = font({ bold: true, color: '065F46' });
            } else if (pct >= 0.7) {
              cell.fill = fill('FEF3C7');
              cell.font = font({ bold: true, color: '92400E' });
            } else {
              cell.fill = fill('FEE2E2');
              cell.font = font({ bold: true, color: '991B1B' });
            }
          }
          if (ci === 8) {
            cell.alignment = align('center');
            if (delta > 0) {
              cell.font = font({ bold: true, color: '065F46' });
              cell.fill = fill('ECFDF5');
            } else if (delta < 0) {
              cell.font = font({ bold: true, color: '991B1B' });
              cell.fill = fill('FEF2F2');
            }
          }
          if (ci === 9) cell.font = font({ italic: true, color: '475569' });
        });
      }
    }
  }

  if (ri === 0) {
    ws.mergeCells(6, 1, 6, ncols);
    ws.getCell(6, 1).value = 'Không có số liệu khác 0 để so sánh.';
    ws.getCell(6, 1).font = font({ italic: true, color: '64748B' });
  }

  const widths = [6, 18, 22, 18, 28, 12, 12, 10, 14, 22];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: ncols },
  };
}

function writeOverviewSheet(wb, {
  date, companyName, departmentName, roleLabel, summary, groups,
}) {
  const ws = wb.addWorksheet(sheetName('Tổng quan'), {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 8, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9 },
  });
  const ncols = 8;
  applyTitleBlock(ws, {
    title: 'BÁO CÁO NGÀY — KẾ HOẠCH & KẾT QUẢ',
    subtitle: `${companyName || 'Công ty'}  ·  ${fmtDmy(date)}${departmentName ? `  ·  ${departmentName}` : ''}${roleLabel ? `  ·  ${roleLabel}` : ''}`,
    note: 'I. Kế hoạch = Deadline Lead/Deal cột Quá hạn + Hôm nay.  II. Kết quả = số CRM đúng ngày đang chọn.  Ô đậm = số cao trong cùng hạng mục.',
    ncols,
    headerArgb: 'DBEAFE',
    titleArgb: '1D4ED8',
  });

  const cards = [
    ['Nhân viên', summary?.total ?? 0, '1E3A8A', 'DBEAFE'],
    ['Có phiếu', summary?.with_report ?? 0, '0C4A6E', 'E0F2FE'],
    ['Đã chốt KQ', summary?.result_ok ?? 0, '065F46', 'D1FAE5'],
    ['Thiếu / nháp', summary?.missing ?? 0, '991B1B', 'FEE2E2'],
  ];
  cards.forEach(([label, value, color, bg], i) => {
    const c = 1 + i * 2;
    ws.mergeCells(5, c, 5, c + 1);
    ws.mergeCells(6, c, 6, c + 1);
    const l = ws.getCell(5, c);
    l.value = label;
    l.font = font({ sz: 8, bold: true, color });
    l.fill = fill(bg);
    l.alignment = align('center');
    const v = ws.getCell(6, c);
    v.value = value;
    v.font = font({ sz: 16, bold: true, color });
    v.fill = fill(bg);
    v.alignment = align('center');
    ws.getCell(5, c + 1).fill = fill(bg);
    ws.getCell(6, c + 1).fill = fill(bg);
  });
  ws.getRow(5).height = 16;
  ws.getRow(6).height = 28;

  const headerRow = 8;
  const headers = ['STT', 'Nhân viên', 'Phòng ban', 'Mẫu', 'Tổng KH', 'Tổng KQ', '% đạt', 'Trạng thái'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = font({ bold: true, color: 'FFFFFF' });
    cell.fill = fill('1D4ED8');
    cell.alignment = align('center');
    cell.border = ALL;
  });

  let ri = 0;
  for (const g of groups || []) {
    const emps = g.employees || [];
    const plan = (g.sections || []).find((s) => s.key === 'plan');
    const result = (g.sections || []).find((s) => s.key === 'result');
    for (const emp of emps) {
      ri += 1;
      const excelRow = headerRow + ri;
      const zebra = ri % 2 === 0 ? 'F8FAFC' : 'FFFFFF';
      let planSum = 0;
      let resultSum = 0;
      for (const row of plan?.rows || []) {
        planSum += asNumber(cellVal(row, emp.id)) || 0;
      }
      for (const row of result?.rows || []) {
        resultSum += asNumber(cellVal(row, emp.id)) || 0;
      }
      const pct = planSum > 0 ? resultSum / planSum : null;
      const state = emp.submit_state === 'result_ok'
        ? 'Đã chốt KQ'
        : emp.submit_state === 'plan_ok'
          ? 'Có kế hoạch'
          : emp.report_id
            ? 'Nháp'
            : 'Chưa có phiếu';
      const values = [
        ri,
        emp.full_name || '',
        emp.department_name || '',
        g.template_name || g.role_key || '',
        planSum,
        resultSum,
        pct,
        state,
      ];
      values.forEach((v, ci) => {
        const cell = ws.getCell(excelRow, ci + 1);
        cell.value = v == null ? '—' : v;
        cell.border = ALL;
        cell.fill = fill(zebra);
        cell.font = font({ bold: ci === 1 });
        if (ci === 4 || ci === 5) {
          cell.numFmt = '#,##0';
          cell.alignment = align('center');
        }
        if (ci === 6) {
          cell.alignment = align('center');
          if (pct == null) {
            cell.value = '—';
            cell.font = font({ color: '94A3B8' });
          } else {
            cell.numFmt = '0%';
            if (pct >= 1) {
              cell.fill = fill('D1FAE5');
              cell.font = font({ bold: true, color: '065F46' });
            } else {
              cell.fill = fill('FEE2E2');
              cell.font = font({ bold: true, color: '991B1B' });
            }
          }
        }
        if (ci === 7) {
          cell.alignment = align('center');
          if (state === 'Đã chốt KQ') cell.fill = fill('D1FAE5');
          else if (state === 'Chưa có phiếu') cell.fill = fill('FEE2E2');
        }
      });
    }
  }

  [6, 22, 18, 18, 12, 12, 10, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: ncols },
  };
}

function uniqueSheetNameFactory() {
  const used = new Set();
  return (raw) => {
    let base = sheetName(raw);
    if (!base) base = 'Sheet';
    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      const suffix = ` ${n}`;
      name = sheetName(`${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`);
      n += 1;
    }
    used.add(name.toLowerCase());
    return name;
  };
}

function shortRole(g) {
  const name = String(g.template_name || g.role_key || '').trim();
  if (/sale.?admin|sale admin/i.test(name) || g.role_key === 'sale_admin') return 'Sale Admin';
  if (/sale.?deal|deal/i.test(name) || g.role_key === 'sale_deal' || g.role_key === 'deal_admin') return 'Sale-Deal';
  return name.slice(0, 14) || 'Mẫu';
}

const SECTION_EXPORT_META = {
  plan: {
    prefix: 'I KH',
    title: 'I. KẾ HOẠCH',
    note: 'Deadline Lead/Deal cột Quá hạn + Hôm nay, gom theo cột Kanban. Ngày chưa có snapshot 08:00 thì tính live.',
    headerArgb: 'E0F2FE',
    titleArgb: '0369A1',
  },
  result: {
    prefix: 'II KQ',
    title: 'II. KẾT QUẢ',
    note: 'Điểm đến cuối trong ngày (cắt 16:45), không cộng hành trình. Ô đậm = số cao nhất trong hàng.',
    headerArgb: 'EDE9FE',
    titleArgb: '6D28D9',
  },
  sharpen: {
    prefix: 'III MD',
    title: 'III. MÀI DAO',
    note: 'NV điền tay trên phiếu.',
    headerArgb: 'FEF3C7',
    titleArgb: 'B45309',
  },
  proposal: {
    prefix: 'IV DX',
    title: 'IV. ĐỀ XUẤT',
    note: 'NV điền tay trên phiếu.',
    headerArgb: 'D1FAE5',
    titleArgb: '047857',
  },
};

export async function downloadDailyReportMatrixExcel({
  date,
  companyName,
  departmentName,
  roleLabel,
  summary,
  groups,
  sectionKeys = ['plan', 'result'],
}) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'QLCV CRM';
  wb.created = new Date();
  const want = new Set(
    (Array.isArray(sectionKeys) && sectionKeys.length ? sectionKeys : ['plan'])
      .filter((k) => SECTION_EXPORT_META[k]),
  );

  const nextName = uniqueSheetNameFactory();
  nextName('Tổng quan');
  nextName('So sánh KH vs KQ');

  writeOverviewSheet(wb, { date, companyName, departmentName, roleLabel, summary, groups });

  for (const g of groups || []) {
    const role = shortRole(g);
    const emps = g.employees || [];
    const coTag = g.company_short || '';
    for (const key of ['plan', 'result', 'sharpen', 'proposal']) {
      if (!want.has(key)) continue;
      const section = (g.sections || []).find((s) => s.key === key);
      if (!section) continue;
      const meta = SECTION_EXPORT_META[key];
      writeMatrixSheet(wb, {
        name: nextName(`${meta.prefix} ${coTag} ${role}`.replace(/\s+/g, ' ').trim()),
        title: `${meta.title} — ${g.template_name || role}${g.company_name ? ` · ${g.company_name}` : ''}`,
        subtitle: `Ngày phiếu ${fmtDmy(date)}  ·  ${emps.length} nhân viên`,
        note: meta.note,
        headerArgb: meta.headerArgb,
        titleArgb: meta.titleArgb,
        employees: emps,
        rows: section.rows || [],
      });
    }
  }

  if (want.has('plan') && want.has('result')) {
    writeCompareSheet(wb, { date, groups });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const dmy = fmtDmy(date).replace(/\//g, '-');
  const co = String(companyName || 'cong-ty')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'cong_ty';
  const TAG = { plan: 'I', result: 'II', sharpen: 'III', proposal: 'IV' };
  const tag = [...want].map((k) => TAG[k] || k).join('-') || 'I';
  saveAs(blob, `Bao_cao_ngay_${tag}_${co}_${dmy}.xlsx`);
}
