/**
 * PDF báo cáo Lead/Deal theo nhân viên — bố cục tham chiếu mẫu kế hoạch Sale/Kỹ thuật (bảng tiêu đề xanh, chữ trắng).
 */

const PDFDocument = require('pdfkit');
const path = require('path');

const fontRegular = path.join(__dirname, '../../assets/fonts/DejaVuSans.ttf');
const fontBold = path.join(__dirname, '../../assets/fonts/DejaVuSans-Bold.ttf');

const COLORS = {
  banner: '#1e40af',
  header: '#2563eb',
  headerText: '#ffffff',
  rowA: '#f1f5f9',
  rowB: '#ffffff',
  totalBg: '#c7d2fe',
  accent: '#1d4ed8',
  muted: '#64748b',
  border: '#cbd5e1',
};

function fmtVnd(n) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0));
}

function safeName(s) {
  return String(s || '')
    .replace(/[^\w\u00C0-\u024f\s\-]/gi, '_')
    .slice(0, 80) || 'bao-cao';
}

/**
 * @param {import('express').Response} res
 * @param {object} opts
 */
function pipeStaffLeadDealSummaryPdf(res, opts) {
  const {
    rows = [],
    dateFrom,
    dateTo,
    companyName,
    generatedAt,
  } = opts;

  const pdf = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 36,
    bufferPages: true,
    info: {
      Title: 'Báo cáo Lead / Deal theo nhân viên',
      Author: 'CRM',
    },
  });

  pdf.registerFont('VN', fontRegular);
  pdf.registerFont('VN-Bold', fontBold);

  const fname = `BAO_CAO_LEAD_DEAL_NV_${dateFrom}_${dateTo}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);

  pdf.pipe(res);

  const margin = 36;
  const pageW = pdf.page.width - margin * 2;
  let y = margin;

  // Banner (giống style sheet mẫu kế hoạch)
  pdf.rect(margin, y, pageW, 40).fill(COLORS.banner);
  pdf.font('VN-Bold').fontSize(15).fillColor('#ffffff');
  pdf.text('BÁO CÁO HIỆU SUẤT — LEAD / DEAL THEO NHÂN VIÊN', margin + 12, y + 11, {
    width: pageW - 24,
    align: 'center',
  });
  y += 48;

  pdf.font('VN').fontSize(9).fillColor(COLORS.muted);
  const period = `Kỳ báo cáo: ${dateFrom} → ${dateTo}  ·  Cơ sở: ngày tạo (created_at)`;
  pdf.text(period, margin, y, { width: pageW });
  y = pdf.y + 3;
  if (companyName) {
    pdf.text(`Đơn vị: ${companyName}`, margin, y, { width: pageW });
    y = pdf.y + 3;
  }
  if (generatedAt) {
    pdf.fontSize(8).text(`In lúc: ${generatedAt}`, margin, y, { width: pageW });
    y = pdf.y + 8;
  }

  // Ghi chú mục tiêu (tương tự HUONG_DAN trong file mẫu)
  pdf.rect(margin, y, pageW, 36).fill('#eff6ff').stroke(COLORS.border);
  pdf.font('VN').fontSize(7.5).fillColor('#334155');
  pdf.text(
    'Mục tiêu: đánh giá hiệu suất nhận lead và quản lý deal theo người phụ trách. Giá trị: estimated_value (ước tính pipeline). '
      + 'Lead gán theo assigned_to / lead_owner_id; Deal theo assigned_to.',
    margin + 8,
    y + 8,
    { width: pageW - 16, lineGap: 2 },
  );
  y += 44;

  const totals = rows.reduce(
    (a, r) => ({
      lead_count: a.lead_count + (r.lead_count || 0),
      lead_pipeline_value: a.lead_pipeline_value + (r.lead_pipeline_value || 0),
      deal_count: a.deal_count + (r.deal_count || 0),
      deal_pipeline_value: a.deal_pipeline_value + (r.deal_pipeline_value || 0),
      won_deal_count: a.won_deal_count + (r.won_deal_count || 0),
      won_value: a.won_value + (r.won_value || 0),
      lost_deal_count: a.lost_deal_count + (r.lost_deal_count || 0),
      lost_value: a.lost_value + (r.lost_value || 0),
    }),
    {
      lead_count: 0,
      lead_pipeline_value: 0,
      deal_count: 0,
      deal_pipeline_value: 0,
      won_deal_count: 0,
      won_value: 0,
      lost_deal_count: 0,
      lost_value: 0,
    },
  );

  // Khối KPI tổng (ý DEAL_KPI trong mẫu)
  pdf.font('VN-Bold').fontSize(9).fillColor(COLORS.accent);
  pdf.text('Tổng hợp KPI (toàn bộ nhân viên trong danh sách)', margin, y);
  y += 14;
  const kpiLine = [
    `Tổng Lead: ${totals.lead_count}`,
    `Giá trị Lead: ${fmtVnd(totals.lead_pipeline_value)}`,
    `Tổng Deal: ${totals.deal_count}`,
    `Giá trị Deal: ${fmtVnd(totals.deal_pipeline_value)}`,
    `Deal chốt: ${totals.won_deal_count} (${fmtVnd(totals.won_value)})`,
    `Deal thua: ${totals.lost_deal_count} (${fmtVnd(totals.lost_value)})`,
  ].join('   |   ');
  pdf.font('VN').fontSize(8).fillColor('#1e293b');
  pdf.text(kpiLine, margin, y, { width: pageW });
  y += 22;

  const headers = [
    'Nhân viên',
    'Phòng ban',
    'Lead',
    'Giá trị Lead',
    'Deal',
    'Giá trị Deal',
    'Chốt',
    'Giá trị chốt',
    'Thua',
    'Giá trị thua',
  ];
  const colW = [118, 92, 34, 78, 34, 78, 34, 78, 34, 78];
  const rowH = 18;
  const headerH = 22;

  function drawHeader(yy) {
    let x = margin;
    pdf.font('VN-Bold').fontSize(7.5);
    headers.forEach((h, i) => {
      pdf.rect(x, yy, colW[i], headerH).fill(COLORS.header);
      pdf.fillColor(COLORS.headerText).text(h, x + 4, yy + 6, {
        width: colW[i] - 8,
        align: i >= 2 ? 'right' : 'left',
      });
      x += colW[i];
    });
    return yy + headerH;
  }

  function drawTotalRow(yy, label, t) {
    let x = margin;
    const cells = [
      label,
      '',
      String(t.lead_count),
      fmtVnd(t.lead_pipeline_value),
      String(t.deal_count),
      fmtVnd(t.deal_pipeline_value),
      String(t.won_deal_count),
      fmtVnd(t.won_value),
      String(t.lost_deal_count),
      fmtVnd(t.lost_value),
    ];
    pdf.font('VN-Bold').fontSize(7);
    cells.forEach((cell, i) => {
      pdf.rect(x, yy, colW[i], rowH).fill(COLORS.totalBg).stroke(COLORS.border);
      pdf.fillColor('#0f172a').text(cell, x + 4, yy + 5, {
        width: colW[i] - 8,
        align: i >= 2 ? 'right' : 'left',
      });
      x += colW[i];
    });
    return yy + rowH;
  }

  function drawDataRow(yy, r, idx) {
    const bg = idx % 2 === 0 ? COLORS.rowA : COLORS.rowB;
    let x = margin;
    const cells = [
      r.full_name || '—',
      r.department_name || '—',
      String(r.lead_count ?? 0),
      fmtVnd(r.lead_pipeline_value || 0),
      String(r.deal_count ?? 0),
      fmtVnd(r.deal_pipeline_value || 0),
      String(r.won_deal_count ?? 0),
      fmtVnd(r.won_value || 0),
      String(r.lost_deal_count ?? 0),
      fmtVnd(r.lost_value || 0),
    ];
    pdf.font('VN').fontSize(7);
    cells.forEach((cell, i) => {
      pdf.rect(x, yy, colW[i], rowH).fill(bg).stroke(COLORS.border);
      pdf.fillColor('#0f172a').text(cell, x + 4, yy + 5, {
        width: colW[i] - 8,
        align: i >= 2 ? 'right' : 'left',
      });
      x += colW[i];
    });
    return yy + rowH;
  }

  const pageBottom = pdf.page.height - margin - 40;
  y = drawHeader(y);

  rows.forEach((r, idx) => {
    if (y + rowH > pageBottom) {
      pdf.addPage({ layout: 'landscape', margin: 36 });
      y = margin;
      y = drawHeader(y);
    }
    y = drawDataRow(y, r, idx);
  });

  if (rows.length) {
    if (y + rowH > pageBottom) {
      pdf.addPage({ layout: 'landscape', margin: 36 });
      y = margin;
    }
    y = drawTotalRow(y, 'TỔNG CỘNG', totals);
  }

  pdf.font('VN').fontSize(7).fillColor(COLORS.muted);
  pdf.text(
    'Biểu mẫu tham chiếu: BÁO CÁO KẾ HOẠCH SALE KỸ THUẬT / DEAL — định dạng bảng & tiêu đề thống nhất.',
    margin,
    pdf.page.height - margin - 12,
    { width: pageW, align: 'center' },
  );

  pdf.end();
}

function pipeStaffPipelineDetailPdf(res, opts) {
  const {
    pipelines = [],
    fullName,
    departmentName,
    dateFrom,
    dateTo,
    companyName,
    generatedAt,
  } = opts;

  const pdf = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 36,
    bufferPages: true,
    info: {
      Title: 'Chi tiết pipeline — báo cáo nhân viên',
      Author: 'CRM',
    },
  });

  pdf.registerFont('VN', fontRegular);
  pdf.registerFont('VN-Bold', fontBold);

  const fname = `BAO_CAO_PIPELINE_${safeName(fullName)}_${dateFrom}_${dateTo}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);

  pdf.pipe(res);

  const margin = 36;
  const pageW = pdf.page.width - margin * 2;
  let y = margin;

  pdf.rect(margin, y, pageW, 38).fill('#0f766e');
  pdf.font('VN-Bold').fontSize(13).fillColor('#ffffff');
  pdf.text('CHI TIẾT THEO PIPELINE (DEAL / LEAD)', margin + 10, y + 11, {
    width: pageW - 20,
    align: 'center',
  });
  y += 46;

  pdf.font('VN-Bold').fontSize(10).fillColor('#0f172a');
  pdf.text(fullName || 'Nhân viên', margin, y);
  y += 14;
  pdf.font('VN').fontSize(9).fillColor(COLORS.muted);
  const sub = [
    departmentName ? `Phòng ban: ${departmentName}` : null,
    `Kỳ: ${dateFrom} → ${dateTo}`,
    companyName ? `Đơn vị: ${companyName}` : null,
    generatedAt ? `In lúc: ${generatedAt}` : null,
  ].filter(Boolean).join('   ·   ');
  pdf.text(sub, margin, y, { width: pageW });
  y = pdf.y + 14;

  const headers = [
    'Pipeline',
    'Lead',
    'Giá trị Lead',
    'Deal',
    'Giá trị Deal',
    'Tổng tiền pipeline',
    'Chốt',
    'Giá trị chốt',
    'Thua',
    'Giá trị thua',
  ];
  const colW = [138, 34, 72, 34, 72, 92, 34, 72, 34, 72];
  const rowH = 18;
  const headerH = 22;

  const totals = pipelines.reduce(
    (a, p) => ({
      lead_count: a.lead_count + (p.lead_count || 0),
      lead_value: a.lead_value + (p.lead_value || 0),
      deal_count: a.deal_count + (p.deal_count || 0),
      deal_value: a.deal_value + (p.deal_value || 0),
      total_value: a.total_value + (p.total_value || 0),
      won_deal_count: a.won_deal_count + (p.won_deal_count || 0),
      won_value: a.won_value + (p.won_value || 0),
      lost_deal_count: a.lost_deal_count + (p.lost_deal_count || 0),
      lost_value: a.lost_value + (p.lost_value || 0),
    }),
    {
      lead_count: 0,
      lead_value: 0,
      deal_count: 0,
      deal_value: 0,
      total_value: 0,
      won_deal_count: 0,
      won_value: 0,
      lost_deal_count: 0,
      lost_value: 0,
    },
  );

  function drawHeader(yy) {
    let x = margin;
    pdf.font('VN-Bold').fontSize(7.5);
    headers.forEach((h, i) => {
      pdf.rect(x, yy, colW[i], headerH).fill(COLORS.header);
      pdf.fillColor(COLORS.headerText).text(h, x + 4, yy + 6, {
        width: colW[i] - 8,
        align: i >= 1 ? 'right' : 'left',
      });
      x += colW[i];
    });
    return yy + headerH;
  }

  function drawRow(yy, cells, bg, bold) {
    let x = margin;
    pdf.font(bold ? 'VN-Bold' : 'VN').fontSize(7);
    cells.forEach((cell, i) => {
      pdf.rect(x, yy, colW[i], rowH).fill(bg).stroke(COLORS.border);
      pdf.fillColor('#0f172a').text(String(cell), x + 4, yy + 5, {
        width: colW[i] - 8,
        align: i >= 1 ? 'right' : 'left',
      });
      x += colW[i];
    });
    return yy + rowH;
  }

  const pageBottom = pdf.page.height - margin - 30;
  y = drawHeader(y);

  pipelines.forEach((p, idx) => {
    if (y + rowH > pageBottom) {
      pdf.addPage({ layout: 'landscape', margin: 36 });
      y = margin;
      y = drawHeader(y);
    }
    const bg = idx % 2 === 0 ? COLORS.rowA : COLORS.rowB;
    y = drawRow(
      y,
      [
        p.pipeline_name || '—',
        String(p.lead_count ?? 0),
        fmtVnd(p.lead_value || 0),
        String(p.deal_count ?? 0),
        fmtVnd(p.deal_value || 0),
        fmtVnd(p.total_value || 0),
        String(p.won_deal_count ?? 0),
        fmtVnd(p.won_value || 0),
        String(p.lost_deal_count ?? 0),
        fmtVnd(p.lost_value || 0),
      ],
      bg,
      false,
    );
  });

  if (pipelines.length) {
    if (y + rowH > pageBottom) {
      pdf.addPage({ layout: 'landscape', margin: 36 });
      y = margin;
    }
    y = drawRow(
      y,
      [
        'TỔNG CỘNG',
        String(totals.lead_count),
        fmtVnd(totals.lead_value),
        String(totals.deal_count),
        fmtVnd(totals.deal_value),
        fmtVnd(totals.total_value),
        String(totals.won_deal_count),
        fmtVnd(totals.won_value),
        String(totals.lost_deal_count),
        fmtVnd(totals.lost_value),
      ],
      COLORS.totalBg,
      true,
    );
  }

  pdf.font('VN').fontSize(7).fillColor(COLORS.muted);
  pdf.text(
    'Tổng tiền pipeline = Giá trị Lead + Giá trị Deal trong cùng pipeline.',
    margin,
    pdf.page.height - margin - 12,
    { width: pageW, align: 'center' },
  );

  pdf.end();
}

module.exports = {
  pipeStaffLeadDealSummaryPdf,
  pipeStaffPipelineDetailPdf,
  fmtVnd,
};
