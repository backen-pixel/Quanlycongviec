/**
 * PDF báo cáo hành vi & khó khăn người dùng — dùng để AI Chat Bot đính kèm vào tin nhắn hằng ngày.
 * Bố cục bảng tái dùng đúng pattern của staffLeadDealReportPdf.js (banner xanh, bảng kẻ ô, phân
 * trang khi tràn) — chỉ khác ở chỗ trả về Buffer thay vì pipe thẳng ra response, vì nội dung này
 * đi vào 1 tin nhắn chat, không phải tải file qua trình duyệt.
 */

const PDFDocument = require('pdfkit');
const path = require('path');

const fontRegular = path.join(__dirname, '../../assets/fonts/DejaVuSans.ttf');
const fontBold = path.join(__dirname, '../../assets/fonts/DejaVuSans-Bold.ttf');

const COLORS = {
  banner: '#0f766e',
  header: '#0d9488',
  headerText: '#ffffff',
  rowA: '#f0fdfa',
  rowB: '#ffffff',
  border: '#cbd5e1',
  muted: '#64748b',
};

function fmtMinutes(min) {
  const m = Math.round(Number(min) || 0);
  if (m < 60) return `${m}p`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${r}p` : `${h}h`;
}

const SIGNAL_LABEL = { failed_step: 'Trợ lý lỗi', repeated_question: 'Hỏi lại nhiều lần' };

/** Rút gọn danh sách idle/khó khăn thành 1 dòng ngắn — bảng dùng chiều cao dòng cố định. */
function topIdleSummary(row) {
  const top = row.top_idle_paths?.[0];
  if (!top) return '—';
  const extra = row.top_idle_paths.length > 1 ? ` (+${row.top_idle_paths.length - 1})` : '';
  return `${top.path} · ${fmtMinutes(top.minutes)}${extra}`;
}

function difficultySummary(row) {
  const signals = row.difficulty_signals || [];
  if (!signals.length) return '—';
  const total = signals.reduce((s, d) => s + (d.count || 0), 0);
  const top = signals[0];
  return `${total} lần · ${SIGNAL_LABEL[top.kind] || top.kind}`;
}

/**
 * @param {{items: object[], dateFrom: string, dateTo: string, companyName?: string}} opts
 * @returns {Promise<Buffer>}
 */
function buildUserBehaviorInsightPdfBuffer(opts) {
  const { items = [], dateFrom, dateTo, companyName } = opts;

  return new Promise((resolve, reject) => {
    try {
      const pdf = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 36,
        bufferPages: true,
        info: { Title: 'Báo cáo hành vi người dùng', Author: 'AI Assistant' },
      });
      const chunks = [];
      pdf.on('data', (c) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);

      pdf.registerFont('VN', fontRegular);
      pdf.registerFont('VN-Bold', fontBold);

      const margin = 36;
      const pageW = pdf.page.width - margin * 2;
      let y = margin;

      pdf.rect(margin, y, pageW, 40).fill(COLORS.banner);
      pdf.font('VN-Bold').fontSize(14).fillColor('#ffffff');
      pdf.text('BÁO CÁO HÀNH VI & KHÓ KHĂN NGƯỜI DÙNG', margin + 12, y + 12, {
        width: pageW - 24,
        align: 'center',
      });
      y += 48;

      pdf.font('VN').fontSize(9).fillColor(COLORS.muted);
      const period = `${companyName ? companyName + ' · ' : ''}Kỳ: ${dateFrom || '—'} → ${dateTo || '—'}`;
      pdf.text(period, margin, y, { width: pageW });
      y = pdf.y + 3;
      pdf.fontSize(8).text(`Sinh lúc: ${new Date().toLocaleString('vi-VN')}`, margin, y, { width: pageW });
      y = pdf.y + 10;

      const headers = ['Nhân viên', 'Số thao tác', 'Thời gian chờ', 'Màn hình chờ nhiều nhất', 'Khó khăn', 'Quá hạn'];
      const colW = [130, 70, 70, 220, 190, 60];
      const rowH = 20;
      const headerH = 22;

      function drawHeader(yy) {
        let x = margin;
        pdf.font('VN-Bold').fontSize(8);
        headers.forEach((h, i) => {
          pdf.rect(x, yy, colW[i], headerH).fill(COLORS.header);
          pdf.fillColor(COLORS.headerText).text(h, x + 5, yy + 6, { width: colW[i] - 10 });
          x += colW[i];
        });
        return yy + headerH;
      }

      function drawDataRow(yy, r, idx) {
        const bg = idx % 2 === 0 ? COLORS.rowA : COLORS.rowB;
        let x = margin;
        const cells = [
          r.name || '—',
          String(r.active_events ?? 0),
          fmtMinutes(r.idle_minutes),
          topIdleSummary(r),
          difficultySummary(r),
          String(r.overdue_tasks ?? 0),
        ];
        pdf.font('VN').fontSize(7.5);
        cells.forEach((cell, i) => {
          pdf.rect(x, yy, colW[i], rowH).fill(bg).stroke(COLORS.border);
          pdf.fillColor('#0f172a').text(cell, x + 5, yy + 6, { width: colW[i] - 10, ellipsis: true });
          x += colW[i];
        });
        return yy + rowH;
      }

      const pageBottom = pdf.page.height - margin - 30;
      y = drawHeader(y);

      if (!items.length) {
        pdf.font('VN').fontSize(9).fillColor(COLORS.muted);
        pdf.text('Không có dữ liệu trong kỳ này.', margin, y + 10);
      }

      items.forEach((r, idx) => {
        if (y + rowH > pageBottom) {
          pdf.addPage({ layout: 'landscape', margin: 36 });
          y = margin;
          y = drawHeader(y);
        }
        y = drawDataRow(y, r, idx);
      });

      pdf.font('VN').fontSize(7).fillColor(COLORS.muted);
      pdf.text(
        'Nguồn: user_activity_log + guide_chat_log + unified_tasks_v — xem docs/architecture/ke-hoach-thu-thap-hanh-vi-nguoi-dung.md',
        margin,
        pdf.page.height - margin - 10,
        { width: pageW, align: 'center' },
      );

      pdf.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { buildUserBehaviorInsightPdfBuffer };
