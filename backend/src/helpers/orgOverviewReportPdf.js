/**
 * PDF báo cáo CRM theo công ty / khu vực / nhân viên.
 */

const PDFDocument = require('pdfkit');
const path = require('path');

const fontRegular = path.join(__dirname, '../../assets/fonts/DejaVuSans.ttf');
const fontBold = path.join(__dirname, '../../assets/fonts/DejaVuSans-Bold.ttf');

const COLORS = {
  banner: '#1e3a8a',
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

function fmtDeltaPct(pct) {
  if (pct == null) return '';
  const sign = pct > 0 ? '+' : '';
  return ` (${sign}${pct}%)`;
}

/**
 * @param {import('express').Response} res
 */
function pipeOrgOverviewReportPdf(res, opts) {
  const {
    summary = {},
    compare = null,
    periodPrevious = null,
    by_company = [],
    by_region = [],
    by_employee = [],
    dateFrom,
    dateTo,
    companyName,
    regionName,
    typeView = 'all',
    generatedAt,
  } = opts;

  const pdf = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 36,
    bufferPages: true,
    info: { Title: 'Báo cáo CRM theo tổ chức', Author: 'CRM' },
  });

  pdf.registerFont('VN', fontRegular);
  pdf.registerFont('VN-Bold', fontBold);

  const fname = `BAO_CAO_TO_CHUC_${dateFrom}_${dateTo}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
  pdf.pipe(res);

  const margin = 36;
  const pageW = pdf.page.width - margin * 2;
  let y = margin;

  pdf.rect(margin, y, pageW, 40).fill(COLORS.banner);
  pdf.font('VN-Bold').fontSize(14).fillColor('#ffffff');
  pdf.text('BÁO CÁO CRM — THEO CÔNG TY / KHU VỰC / NHÂN VIÊN', margin + 12, y + 12, {
    width: pageW - 24,
    align: 'center',
  });
  y += 48;

  pdf.font('VN').fontSize(9).fillColor(COLORS.muted);
  pdf.text(`Kỳ báo cáo: ${dateFrom} → ${dateTo}  ·  Cơ sở: ngày tạo (created_at)  ·  Loại: ${typeView}`, margin, y, { width: pageW });
  y = pdf.y + 3;
  if (companyName) {
    pdf.text(`Công ty: ${companyName}${regionName ? `  ·  Khu vực: ${regionName}` : ''}`, margin, y, { width: pageW });
    y = pdf.y + 3;
  }
  if (periodPrevious?.date_from) {
    pdf.text(
      `So sánh với kỳ trước: ${periodPrevious.date_from} → ${periodPrevious.date_to}`,
      margin,
      y,
      { width: pageW },
    );
    y = pdf.y + 3;
  }
  if (generatedAt) {
    pdf.fontSize(8).text(`In lúc: ${generatedAt}`, margin, y, { width: pageW });
    y = pdf.y + 10;
  }

  const kpiParts = [
    `Lead: ${summary.lead_count ?? 0}${compare?.lead_count ? fmtDeltaPct(compare.lead_count.pct) : ''}`,
    `Deal: ${summary.deal_count ?? 0}${compare?.deal_count ? fmtDeltaPct(compare.deal_count.pct) : ''}`,
    `Pipeline: ${fmtVnd(summary.pipeline_value)}${compare?.pipeline_value ? fmtDeltaPct(compare.pipeline_value.pct) : ''}`,
    `Chốt: ${summary.won_deal_count ?? 0} (${fmtVnd(summary.won_value)})${compare?.won_value ? fmtDeltaPct(compare.won_value.pct) : ''}`,
    `Tỷ lệ chốt: ${summary.conversion_rate ?? 0}%`,
  ];
  pdf.font('VN-Bold').fontSize(9).fillColor(COLORS.accent);
  pdf.text('Tổng hợp KPI', margin, y);
  y += 12;
  pdf.font('VN').fontSize(8).fillColor('#1e293b');
  pdf.text(kpiParts.join('   |   '), margin, y, { width: pageW });
  y += 22;

  function drawSection(title, headers, colW, rows, mapRow) {
    if (y > pdf.page.height - margin - 80) {
      pdf.addPage();
      y = margin;
    }
    pdf.font('VN-Bold').fontSize(9).fillColor(COLORS.accent);
    pdf.text(title, margin, y);
    y += 14;

    const rowH = 17;
    const headerH = 20;
    let x = margin;
    pdf.font('VN-Bold').fontSize(7.5);
    headers.forEach((h, i) => {
      pdf.rect(x, y, colW[i], headerH).fill(COLORS.header);
      pdf.fillColor(COLORS.headerText).text(h, x + 4, y + 5, {
        width: colW[i] - 8,
        align: i >= 1 ? 'right' : 'left',
      });
      x += colW[i];
    });
    y += headerH;

    pdf.font('VN').fontSize(7);
    rows.slice(0, 12).forEach((row, idx) => {
      if (y > pdf.page.height - margin - rowH) {
        pdf.addPage();
        y = margin;
      }
      const bg = idx % 2 === 0 ? COLORS.rowA : COLORS.rowB;
      const cells = mapRow(row);
      x = margin;
      cells.forEach((cell, i) => {
        pdf.rect(x, y, colW[i], rowH).fill(bg).stroke(COLORS.border);
        pdf.fillColor('#0f172a').text(String(cell ?? '—'), x + 4, y + 4, {
          width: colW[i] - 8,
          align: i >= 1 ? 'right' : 'left',
        });
        x += colW[i];
      });
      y += rowH;
    });
    y += 16;
  }

  if (by_company?.length) {
    drawSection(
      'Theo công ty (top 12)',
      ['Công ty', 'Lead', 'Deal', 'Pipeline', 'Chốt', 'GT chốt'],
      [160, 40, 40, 90, 40, 90],
      by_company,
      (r) => [
        r.company_name || '—',
        r.lead_count ?? 0,
        r.deal_count ?? 0,
        fmtVnd(r.pipeline_value),
        r.won_deal_count ?? 0,
        fmtVnd(r.won_value),
      ],
    );
  }

  if (by_region?.length) {
    drawSection(
      'Theo khu vực (top 12)',
      ['Khu vực', 'Công ty', 'Lead', 'Deal', 'Pipeline', 'Chốt'],
      [120, 100, 36, 36, 88, 36],
      by_region,
      (r) => [
        r.region_name || '—',
        r.company_name || '—',
        r.lead_count ?? 0,
        r.deal_count ?? 0,
        fmtVnd(r.pipeline_value),
        r.won_deal_count ?? 0,
      ],
    );
  }

  if (by_employee?.length) {
    drawSection(
      'Theo nhân viên (top 12)',
      ['Nhân viên', 'Phòng ban', 'Lead', 'Deal', 'Pipeline', 'Chốt', 'GT chốt'],
      [118, 88, 34, 34, 78, 34, 78],
      by_employee,
      (r) => [
        r.full_name || '—',
        r.department_name || '—',
        r.lead_count ?? 0,
        r.deal_count ?? 0,
        fmtVnd(r.pipeline_value),
        r.won_deal_count ?? 0,
        fmtVnd(r.won_value),
      ],
    );
  }

  pdf.end();
}

module.exports = { pipeOrgOverviewReportPdf };
