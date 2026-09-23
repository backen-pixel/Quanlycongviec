/**
 * Xuất PDF hướng dẫn HCB (khoanh đỏ nút, từng bước).
 * Chạy: node docs/ba/guides/huong-dan-hcb-gop-nhiem-vu/generate-pdf.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');
const outPdf = path.join(__dirname, 'HUONG_DAN_HCB_GOP_NHIEM_VU.pdf');
const outHtml = path.join(__dirname, 'HUONG_DAN_HCB_GOP_NHIEM_VU.print.html');

function img(name) {
  const p = path.join(__dirname, name);
  if (!fs.existsSync(p)) throw new Error(`Missing image: ${p}`);
  return `file:///${p.replace(/\\/g, '/')}`;
}

const images = {
  pipeline: img('01-pipeline-marked.png'),
  popup: img('01b-popup-marked.png'),
  dashboard: img('02-dashboard-marked.png'),
  gopMenu: img('02b-gop-menu-marked.png'),
  nhiemVu: img('03-nhiem-vu-marked.png'),
  giaoViec: img('04-giao-viec-marked.png'),
};

const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>Hướng dẫn từng bước — Gộp cột xưởng HCB, Quản lý nhiệm vụ và Giao việc</title>
  <style>
    @page { size: A4; margin: 16mm 14mm 18mm 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.5;
      color: #1e293b;
      margin: 0;
    }
    h1 { font-size: 18pt; color: #312e81; margin: 0 0 6px; line-height: 1.25; }
    .subtitle { font-size: 11pt; color: #475569; margin-bottom: 4px; }
    .meta {
      font-size: 9pt; color: #64748b; margin-bottom: 16px; padding-bottom: 10px;
      border-bottom: 2px solid #fecaca;
    }
    h2 {
      font-size: 13pt; color: #b91c1c; margin: 20px 0 10px;
      page-break-after: avoid; border-left: 4px solid #ef4444; padding-left: 10px;
    }
    h3 { font-size: 11pt; color: #334155; margin: 12px 0 6px; page-break-after: avoid; }
    p { margin: 5px 0; }
    ol.steps { margin: 6px 0 10px; padding-left: 0; list-style: none; }
    ol.steps li {
      display: flex; gap: 8px; align-items: flex-start;
      margin: 5px 0; page-break-inside: avoid;
    }
    .n {
      flex: 0 0 22px; height: 22px; line-height: 22px; text-align: center;
      background: #ef4444; color: #fff; font-weight: 800; font-size: 10pt;
      border-radius: 999px;
    }
    .n-lab { font-weight: 700; color: #b91c1c; }
    figure { margin: 10px 0 16px; page-break-inside: avoid; }
    figure img {
      width: 100%; max-height: 390px; object-fit: contain;
      border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;
    }
    figcaption { font-size: 9pt; color: #64748b; margin-top: 5px; font-style: italic; }
    .callout {
      background: #fff7ed; border-left: 4px solid #f97316;
      padding: 8px 12px; margin: 8px 0; font-size: 9.5pt;
    }
    .notes {
      background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px;
      padding: 8px 12px; font-size: 9.5pt; margin-top: 6px;
    }
    .notes strong { color: #991b1b; }
    table.trouble { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 10px 0; }
    table.trouble th, table.trouble td {
      border: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; text-align: left;
    }
    table.trouble th { background: #fef2f2; color: #7f1d1d; }
    .page-break { page-break-before: always; }
    .footer-note {
      margin-top: 20px; padding-top: 8px; border-top: 1px solid #e2e8f0;
      font-size: 8.5pt; color: #94a3b8; text-align: center;
    }
    .badge {
      display: inline-block; background: #ef4444; color: #fff;
      font-size: 8pt; font-weight: 700; padding: 2px 8px; border-radius: 999px;
    }
    kbd {
      font-family: Consolas, "Courier New", monospace; font-size: 8.5pt;
      background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 0 5px;
    }
  </style>
</head>
<body>
  <h1>Hướng dẫn từng bước — Gộp cột xưởng HCB</h1>
  <p class="subtitle">Khoanh đỏ đúng nút cần bấm · Công ty <strong>HCB</strong> · Phân loại <strong>Tủ bếp</strong></p>
  <p class="meta">
    Làm theo số đỏ trên ảnh. Cùng một số = cùng một nút.
    <span class="badge">HCB · 22/09/2026</span>
  </p>

  <h2>Phần A — Gộp cột ở Pipeline xưởng</h2>
  <p>Mở module <strong>Xưởng SX</strong> (logo cam). Sidebar nhóm <strong>3. Setup xưởng</strong>.</p>
  <ol class="steps">
    <li><span class="n">1</span><span>Bấm <span class="n-lab">Pipeline xưởng</span> trên menu trái.</span></li>
    <li><span class="n">2</span><span>Ô Công ty chọn <span class="n-lab">HCB</span>.</span></li>
    <li><span class="n">3</span><span>Hàng phân loại: bấm chip <span class="n-lab">Tủ bếp</span> (xanh đậm).</span></li>
    <li><span class="n">4</span><span>Bấm tab <span class="n-lab">Cột chính</span> (không bấm Cột nhỏ).</span></li>
    <li><span class="n">5</span><span>Muốn đổi giai đoạn / tên cột: bấm <span class="n-lab">Sửa</span> trên dòng cột nhỏ.</span></li>
    <li><span class="n">6</span><span>Muốn thêm cột song song trong giai đoạn: bấm <span class="n-lab">+ Thêm cột nhỏ</span>.</span></li>
  </ol>
  <figure>
    <img src="${images.pipeline}" alt="Pipeline xưởng HCB — khoanh đỏ các nút setup" />
    <figcaption>Hình 1 — Bấm lần lượt 1 → 2 → 3 → 4. Rồi 5 (Sửa) hoặc 6 (Thêm cột nhỏ).</figcaption>
  </figure>
  <div class="notes">
    <strong>Nhớ:</strong> mỗi thẻ số 1, 2, 3 trên board (Tiếp nhận, Kế hoạch, Duyệt…) là <em>cột lớn nối tiếp</em>.
    Các dòng bên trong là <em>cột nhỏ song song</em>. Kéo cột nhỏ từ thẻ này sang thẻ kia để đổi giai đoạn.
  </div>

  <div class="page-break"></div>
  <h3>Sau khi bấm 5 Sửa — popup hiện ra</h3>
  <ol class="steps">
    <li><span class="n">7</span><span>Ô <span class="n-lab">Cột lớn</span>: chọn giai đoạn (Tiếp nhận / Kế hoạch / Duyệt / Gia công…). Ô <em>Hiện trên</em> giữ <strong>Sản xuất</strong>.</span></li>
    <li><span class="n">8</span><span>Bấm <span class="n-lab">Lưu thay đổi</span>. Đóng popup bằng Hủy hoặc × nếu không lưu.</span></li>
  </ol>
  <figure>
    <img src="${images.popup}" alt="Popup sửa cột nhỏ — khoanh Cột lớn và Lưu" />
    <figcaption>Hình 2 — Số 7 chọn cột lớn (giai đoạn gộp). Số 8 bấm Lưu.</figcaption>
  </figure>
  <div class="callout">
    Tick <strong>Hiển thị trên Kanban</strong> thì cột mới xuất hiện trên Dashboard. Tab Cột nhỏ vẫn sửa inline; tab Cột chính thì Sửa ra popup này.
  </div>

  <h2>Phần B — Dashboard: bật gộp và sang nhiệm vụ</h2>
  <p>Vào <strong>Dashboard</strong> (ghim trên sidebar) hoặc <kbd>/sx/dashboard</kbd>. Lọc <strong>Tủ bếp</strong>, tab <strong>Sản xuất</strong>.</p>
  <ol class="steps">
    <li><span class="n">9</span><span>Nút toolbar <span class="n-lab">Giao việc</span> — vào thẳng trang quản lý công việc (chưa lọc một dự án).</span></li>
    <li><span class="n">10</span><span>Trên thẻ dự án, bấm <span class="n-lab">Nhiệm vụ</span> (tím) — sang Quản lý nhiệm vụ của đúng dự án. <em>Không</em> bấm tiêu đề thẻ (tiêu đề mở chi tiết).</span></li>
    <li><span class="n">11</span><span>Nút <span class="n-lab">Kanban</span> giữ chế độ bảng. Gộp cột nằm ở nút <strong>Thêm</strong> bên cạnh (xem hình 4).</span></li>
    <li><span class="n">12</span><span>Chip <span class="n-lab">Cột lớn · Gia công</span> (và Hoàn thiện / Đóng gói): bấm để bung việc song song trong giai đoạn.</span></li>
  </ol>
  <figure>
    <img src="${images.dashboard}" alt="Dashboard HCB khoanh Giao việc, Nhiệm vụ, Kanban, cột lớn" />
    <figcaption>Hình 3 — Số 10 là nút chính sang Quản lý nhiệm vụ. Số 9 sang Giao việc. Số 12 bung cột lớn.</figcaption>
  </figure>

  <div class="page-break"></div>
  <h3>Bật / tắt Gộp cột</h3>
  <ol class="steps">
    <li><span class="n">11</span><span>Bấm <span class="n-lab">Thêm</span> (cạnh Kanban) để mở menu chế độ xem.</span></li>
    <li><span class="n">12</span><span>Bấm dòng tím <span class="n-lab">Đang gộp</span> (hoặc <strong>Gộp cột</strong> nếu chưa bật). Bấm lần nữa để tách lại từng cột nhỏ.</span></li>
  </ol>
  <figure>
    <img src="${images.gopMenu}" alt="Menu Thêm — khoanh Đang gộp / Gộp cột" />
    <figcaption>Hình 4 — Thêm → Đang gộp. Khi đang gộp, Dashboard hiện Tiếp nhận / Kế hoạch / Duyệt… thay vì dải cột nhỏ.</figcaption>
  </figure>

  <h2>Phần C — Quản lý nhiệm vụ rồi sang công việc</h2>
  <p>Có hai đường: bấm <strong>10 Nhiệm vụ</strong> trên thẻ Dashboard, hoặc menu dưới đây.</p>
  <ol class="steps">
    <li><span class="n">13</span><span>Sidebar <strong>1. Tổng quan</strong> → <span class="n-lab">Quản lý nhiệm vụ</span>.</span></li>
    <li><span class="n">14</span><span>Cùng nhóm: <span class="n-lab">Giao việc Sản xuất</span> — vào trang công việc không qua thẻ danh mục.</span></li>
    <li><span class="n">15</span><span>Trên thẻ danh mục (VD TB-2026-787 · Chuẩn bị sản xuất), bấm <span class="n-lab">Công việc</span> — đây là nút sang quản lý công việc của đúng dự án HCB.</span></li>
  </ol>
  <figure>
    <img src="${images.nhiemVu}" alt="Quản lý nhiệm vụ — khoanh menu và nút Công việc" />
    <figcaption>Hình 5 — Số 15 trên thẻ là nút sang Giao việc. Cột Quá hạn / Hôm nay / Ngày mai là hạn danh mục, không phải từng việc lẻ.</figcaption>
  </figure>
  <div class="notes">
    <strong>Phân số 0/7:</strong> 0 việc xong trên 7 việc trong danh mục. Nút <em>Nhắc</em> gửi thông báo người phụ trách — không mở trang công việc.
  </div>

  <div class="page-break"></div>
  <h2>Phần D — Trang Giao việc Sản xuất (quản lý công việc)</h2>
  <p>Sau khi bấm <strong>15 Công việc</strong>, trang đã lọc đúng mã TB.</p>
  <ol class="steps">
    <li><span class="n">16</span><span>Nút tím <span class="n-lab">+ Giao việc</span> — tạo việc mới cho dự án đang lọc.</span></li>
    <li><span class="n">17</span><span>Dòng <span class="n-lab">Giao việc của TB-2026-787</span> xác nhận đang đúng một dự án. Bấm <em>Bỏ lọc dự án</em> nếu muốn xem hết xưởng.</span></li>
    <li><span class="n">18</span><span><span class="n-lab">Chi tiết dự án</span> — mở hồ sơ TB (không phải Kanban việc).</span></li>
    <li><span class="n">19</span><span>Cuối mỗi cột Kanban: <span class="n-lab">+ Thêm việc</span> — thêm việc vào đúng cột Chưa làm / Đang làm.</span></li>
  </ol>
  <figure>
    <img src="${images.giaoViec}" alt="Giao việc Sản xuất TB-2026-787 — khoanh nút" />
    <figcaption>Hình 6 — Đây là quản lý công việc: kéo thẻ Chưa làm → Đang làm → Đã làm, giao nhân viên. Mẫu: 41 việc của TB-2026-787 / LEAD-4171 Hiệp Đặng.</figcaption>
  </figure>

  <h2>Ba nút dễ nhầm</h2>
  <table class="trouble">
    <thead><tr><th>Số đỏ</th><th>Chữ trên nút</th><th>Mở trang nào</th></tr></thead>
    <tbody>
      <tr><td>10</td><td>Nhiệm vụ (tím, thẻ Dashboard)</td><td>Quản lý nhiệm vụ — hạn danh mục</td></tr>
      <tr><td>15</td><td>Công việc (indigo, thẻ nhiệm vụ)</td><td>Giao việc Sản xuất — từng việc Kanban</td></tr>
      <tr><td>9 hoặc 14 hoặc 16</td><td>Giao việc</td><td>Cùng trang Giao việc; 9/14 chưa lọc dự án, 16 tạo việc mới</td></tr>
    </tbody>
  </table>

  <h2>Nếu không thấy nút khoanh đỏ</h2>
  <table class="trouble">
    <thead><tr><th>Hiện tượng</th><th>Làm gì</th></tr></thead>
    <tbody>
      <tr><td>Không có Pipeline xưởng</td><td>Module phải là Xưởng SX. Mở 3. Setup xưởng.</td></tr>
      <tr><td>Dashboard nhiều cột nhỏ, không thấy Tiếp nhận / Kế hoạch</td><td>Làm bước 11–12 (Thêm → Gộp cột). Tab Sản xuất, không phải Công nợ.</td></tr>
      <tr><td>Không có nút Nhiệm vụ trên thẻ</td><td>Cuộn cột có dự án; hoặc vào 13 Quản lý nhiệm vụ.</td></tr>
      <tr><td>Bấm Nhiệm vụ ra trang trống</td><td>Xóa ô tìm; kiểm tra Bộ mẫu nhiệm vụ xưởng đã gắn Tủ bếp.</td></tr>
      <tr><td>Sửa nhảy sang tab Cột nhỏ</td><td>Đang ở tab Cột nhỏ. Về tab 4 Cột chính rồi bấm 5 Sửa.</td></tr>
    </tbody>
  </table>

  <p class="footer-note">TuBep Pro · Hướng dẫn nội bộ · HCB Tủ bếp · Bấm đúng số đỏ trên ảnh · 22/09/2026</p>
</body>
</html>`;

fs.writeFileSync(outHtml, html, 'utf8');
console.log('Wrote', outHtml);

const require = createRequire(import.meta.url);
let puppeteer;
try {
  puppeteer = require(path.join(root, 'backend/node_modules/puppeteer'));
} catch {
  try {
    puppeteer = require('puppeteer');
  } catch {
    console.error('Installing puppeteer…');
    const { execSync } = await import('child_process');
    execSync('npm install puppeteer --no-save', { cwd: path.join(root, 'backend'), stdio: 'inherit' });
    puppeteer = require(path.join(root, 'backend/node_modules/puppeteer'));
  }
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.goto(`file:///${outHtml.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0', timeout: 120_000 });
await page.pdf({
  path: outPdf,
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', right: '12mm', bottom: '16mm', left: '12mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate:
    '<div style="width:100%;font-size:8px;color:#94a3b8;text-align:center;padding:0 12mm;"><span>TuBep Pro — HCB · Bấm đúng số đỏ trên ảnh</span> · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
});
await browser.close();

const stat = fs.statSync(outPdf);
console.log(`PDF ready: ${outPdf} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
