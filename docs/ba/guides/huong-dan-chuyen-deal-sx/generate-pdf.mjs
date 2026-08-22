/**
 * Xuất PDF hướng dẫn CRM → Sản xuất (mẫu Phúc Đạt).
 * Chạy: node docs/huong-dan-chuyen-deal-sx/generate-pdf.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const imgDir = path.join(root, 'frontend/public/release-notes');
const outPdf = path.join(__dirname, 'HUONG_DAN_CHUYEN_DEAL_SX.pdf');
const outHtml = path.join(__dirname, 'HUONG_DAN_CHUYEN_DEAL_SX.print.html');

function img(name) {
  const p = path.join(imgDir, name);
  if (!fs.existsSync(p)) throw new Error(`Missing image: ${p}`);
  return `file:///${p.replace(/\\/g, '/')}`;
}

const images = {
  dealTruoc: img('sx-crm-deal-truoc-chuyen-thang.png'),
  chonCongTy: img('sx-crm-chon-cong-ty-san-xuat.png'),
  dealThang: img('sx-crm-deal-cot-thang.png'),
  kanbanTiepNhan: img('sx-kanban-tiep-nhan.png'),
  tabTaiLieu: img('sx-tab-tai-lieu-upload.png'),
  binhLuanNhanh: img('sx-binh-luan-doi-crm.png'),
  binhLuanSx: img('sx-binh-luan-dinh-kem-ban-ve.png'),
  binhLuanCrm: img('sx-crm-xem-binh-luan-ban-ve.png'),
};

const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>Hướng dẫn — Chuyển Deal CRM sang Sản xuất (mẫu Phúc Đạt)</title>
  <style>
    @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.55;
      color: #1e293b;
      margin: 0;
      padding: 0;
    }
    h1 {
      font-size: 20pt;
      color: #312e81;
      margin: 0 0 6px;
      line-height: 1.25;
    }
    .subtitle {
      font-size: 11pt;
      color: #475569;
      margin-bottom: 4px;
    }
    .meta {
      font-size: 9pt;
      color: #64748b;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid #c7d2fe;
    }
    h2 {
      font-size: 13pt;
      color: #4338ca;
      margin: 22px 0 10px;
      page-break-after: avoid;
      border-left: 4px solid #6366f1;
      padding-left: 10px;
    }
    h3 {
      font-size: 11pt;
      color: #334155;
      margin: 14px 0 8px;
      page-break-after: avoid;
    }
    h4 { font-size: 10.5pt; margin: 10px 0 6px; color: #475569; }
    p { margin: 6px 0; }
    ul, ol { margin: 6px 0 10px; padding-left: 22px; }
    li { margin: 3px 0; }
    .flow {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      font-family: Consolas, "Courier New", monospace;
      font-size: 9pt;
      line-height: 1.65;
      white-space: pre-wrap;
      margin: 10px 0 16px;
    }
    .roles {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      margin: 12px 0 18px;
    }
    .role-card {
      background: #f5f3ff;
      border: 1px solid #ddd6fe;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 9.5pt;
    }
    .role-card strong { display: block; color: #5b21b6; margin-bottom: 4px; }
    figure {
      margin: 12px 0 18px;
      page-break-inside: avoid;
    }
    figure img {
      width: 100%;
      max-height: 420px;
      object-fit: contain;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #fff;
    }
    figcaption {
      font-size: 9pt;
      color: #64748b;
      margin-top: 6px;
      font-style: italic;
    }
    .callout {
      background: #fffbeb;
      border-left: 4px solid #f59e0b;
      padding: 8px 12px;
      margin: 10px 0;
      font-size: 9.5pt;
    }
    .notes {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 9.5pt;
      margin-top: 8px;
    }
    .notes strong { color: #166534; }
    table.trouble { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 10px 0; }
    table.trouble th, table.trouble td {
      border: 1px solid #e2e8f0;
      padding: 7px 9px;
      vertical-align: top;
      text-align: left;
    }
    table.trouble th { background: #f1f5f9; color: #334155; }
    .page-break { page-break-before: always; }
    .footer-note {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      font-size: 8.5pt;
      color: #94a3b8;
      text-align: center;
    }
    .badge {
      display: inline-block;
      background: #4f46e5;
      color: #fff;
      font-size: 8pt;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      vertical-align: middle;
      margin-left: 6px;
    }
  </style>
</head>
<body>
  <h1>Hướng dẫn — Chuyển Deal CRM sang Sản xuất</h1>
  <p class="subtitle">Mẫu thực tế: Công ty Nhôm Kính Phúc Đạt</p>
  <p class="meta">
    Deal <strong>DEAL-2026-440</strong> → Dự án xưởng <strong>TB-2026-337</strong> · Phân loại <strong>Cửa</strong>
    <span class="badge">v2.4.0</span><br />
    Cập nhật: 07/07/2026 · TuBep Pro
  </p>

  <h2>Tổng quan luồng</h2>
  <div class="flow">CRM Kanban (Deal)
  → Chuyển cột nhanh / kéo thả sang cột Thắng (Phúc Đạt: «Đã ký hợp đồng.»)
  → Popup «Chuyển Deal sang Sản xuất»: chọn Công ty SX + Phân loại → Tiếp tục
  → Tự tạo dự án xưởng (mã TB-YYYY-NNN)
  → Xưởng SX: Kanban cột «Tiếp nhận»
  → Up bản vẽ (tab Tài liệu) + đính kèm file trong tab Bình luận
  → CRM xác nhận → xưởng chuyển cột pipeline tiếp theo</div>

  <div class="roles">
    <div class="role-card">
      <strong>NVKD / Admin CRM</strong>
      Chuyển deal sang cột Thắng, chọn xưởng và phân loại. Theo dõi bình luận và tài liệu từ xưởng.
    </div>
    <div class="role-card">
      <strong>Nhân viên Sản xuất</strong>
      Nhận thẻ ở cột Tiếp nhận. Up bản vẽ tab Tài liệu; đính kèm file trong Bình luận khi cần.
    </div>
    <div class="role-card">
      <strong>Admin</strong>
      Cấu hình pipeline, phân loại xưởng (Tủ bếp / Cửa / Cánh kính…) tại Pipeline xưởng.
    </div>
  </div>

  <h2>Chuẩn bị</h2>
  <ol>
    <li>Đăng nhập TuBep Pro (CRM hoặc Xưởng SX).</li>
    <li>Lọc Công ty: <strong>Công ty Nhôm Kính Phúc Đạt</strong> trên CRM Dashboard.</li>
    <li>Mở tab <strong>Deals</strong> (Kanban).</li>
    <li>Deal cần chuyển phải chưa có dự án xưởng — thường ở các cột trước Thắng.</li>
  </ol>

  <h2>Bước 1 — CRM: Chuyển deal sang cột Thắng</h2>
  <h3>1.1. Xác định deal trên Kanban</h3>
  <ul>
    <li>Vào CRM → Dashboard CRM → tab <strong>Deals</strong> (không dùng tab Leads).</li>
    <li>Bộ lọc: Công ty Nhôm Kính Phúc Đạt.</li>
    <li>Tìm deal (VD: DEAL-2026-440 — CT - ANH HƯỜNG) ở cột trước Thắng.</li>
  </ul>
  <figure>
    <img src="${images.dealTruoc}" alt="Deal trước khi chuyển Thắng" />
    <figcaption>Hình 1 — Deal trên Kanban CRM trước khi chuyển sang cột Thắng</figcaption>
  </figure>
  <div class="notes">
    <strong>Ghi chú:</strong> (1) Tab Deals · (2) Chip lọc Phúc Đạt · (3) Nút chuyển cột nhanh · (4) Cột «Đã ký hợp đồng.»
  </div>

  <h3>1.2. Chuyển sang cột Thắng</h3>
  <p><strong>Cách A (khuyến nghị):</strong> Bấm nút chuyển cột trên thẻ → chọn 🎉 <em>Đã ký hợp đồng.</em></p>
  <p><strong>Cách B:</strong> Kéo thả thẻ deal sang cột <em>Đã ký hợp đồng.</em></p>

  <h3>1.3. Popup «Chuyển Deal sang Sản xuất»</h3>
  <p>Ngay khi deal vào cột Thắng, hệ thống hiện popup bắt buộc:</p>
  <figure>
    <img src="${images.chonCongTy}" alt="Chọn công ty và phân loại sản xuất" />
    <figcaption>Hình 2 — Popup chọn Công ty Sản xuất và Phân loại</figcaption>
  </figure>
  <div class="notes">
    <strong>Ghi chú:</strong> (1) Tiêu đề popup · (2) Công ty SX (bắt buộc) · (3) Phân loại (Tủ bếp / Cửa / Cánh kính…) · (4) Tiếp tục → tạo dự án TB-…
  </div>
  <figure>
    <img src="${images.dealThang}" alt="Deal đã ở cột Thắng" />
    <figcaption>Hình 3 — Deal đã nằm ở cột Thắng sau khi tạo dự án</figcaption>
  </figure>

  <div class="page-break"></div>
  <h2>Bước 2 — Sản xuất: Deal ở cột Tiếp nhận</h2>
  <h3>2.1. Mở module Xưởng SX</h3>
  <ul>
    <li>Chuyển sang <strong>Xưởng SX</strong> trên sidebar.</li>
    <li>Vào <strong>Deal vào xưởng</strong> (<code>/sx/dashboard</code>).</li>
  </ul>
  <h3>2.2. Lọc đúng xưởng và phân loại</h3>
  <ul>
    <li>Xưởng / Công ty Sản xuất: <strong>Công ty Nhôm Kính Phúc Đạt</strong></li>
    <li>Phân loại: <strong>Cửa</strong> (khớp bước 1)</li>
    <li>Tìm kiếm: <strong>TB-2026-337</strong> hoặc tên khách</li>
  </ul>
  <div class="callout">
    Nếu không thấy thẻ: kiểm tra lọc xưởng sai công ty, hoặc phân loại Kanban không khớp (Tủ bếp vs Cửa).
  </div>
  <figure>
    <img src="${images.kanbanTiepNhan}" alt="Dự án ở cột Tiếp nhận" />
    <figcaption>Hình 4 — Dự án TB-2026-337 ở cột Tiếp nhận trên Kanban SX</figcaption>
  </figure>
  <div class="notes">
    <strong>Ghi chú:</strong> (1) Chip xưởng + phân loại Cửa · (2) Cột Tiếp nhận · (3) Thẻ TB-2026-337 · (4) Nhãn MỚI
  </div>

  <h2>Bước 3 — Tài liệu và bình luận nhanh</h2>
  <h3>3.1. Tab Tài liệu — lưu bản vẽ chính thức</h3>
  <ol>
    <li>Từ Kanban, mở dự án TB-2026-337.</li>
    <li>Chọn tab <strong>📋 Tài liệu</strong>.</li>
    <li>Bấm <strong>Upload file xưởng</strong> → chọn file bản vẽ (PDF, DWG, JPG…).</li>
    <li>(Tuỳ chọn) Bấm <strong>Chia sẻ CRM</strong> để NVKD thấy trên deal.</li>
  </ol>
  <figure>
    <img src="${images.tabTaiLieu}" alt="Tab Tài liệu upload" />
    <figcaption>Hình 5 — Tab Tài liệu, upload file xưởng và Chia sẻ CRM</figcaption>
  </figure>

  <h3>3.2. Bình luận nhanh trên Kanban (chỉ text)</h3>
  <p>Bấm <strong>Bình luận nhanh</strong> trên thẻ → gõ nội dung → Đăng. Không đính kèm file.</p>
  <figure>
    <img src="${images.binhLuanNhanh}" alt="Bình luận nhanh đợi CRM" />
    <figcaption>Hình 6 — Bình luận nhanh trên Kanban (chỉ text)</figcaption>
  </figure>

  <div class="page-break"></div>
  <h2>Bước 4 — Trao đổi bản vẽ qua tab Bình luận</h2>
  <p>Cách khuyến nghị để CRM và xưởng bàn giao nhanh: gửi file bản vẽ trong luồng bình luận — hai bên cùng thấy, có thể trả lời và đính kèm bản chỉnh sửa.</p>

  <h3>4.1. Phía Sản xuất — gửi bản vẽ kèm bình luận</h3>
  <ol>
    <li>Mở chi tiết dự án TB-2026-337 (bấm tiêu đề thẻ trên Kanban).</li>
    <li>Cột phải: tab <strong>💬 Bình luận</strong> trên thanh tab.</li>
    <li>Gõ nội dung, dùng @ nhắc NVKD (VD: @Vũ Pd).</li>
    <li>Bấm icon đính kèm (kẹp giấy) hoặc dán ảnh/PDF (Ctrl+V) → <strong>Đăng</strong>.</li>
  </ol>
  <figure>
    <img src="${images.binhLuanSx}" alt="SX tab Bình luận đính kèm" />
    <figcaption>Hình 7 — Chi tiết dự án SX, tab Bình luận với file đính kèm</figcaption>
  </figure>

  <h3>4.2. Phía CRM — xem file và phản hồi</h3>
  <ol>
    <li>Mở deal DEAL-2026-440.</li>
    <li>Tab <strong>💬 Bình luận</strong> trên thanh tab (cột phải).</li>
    <li>Xem/tải file đính kèm từ xưởng → trả lời hoặc đính kèm bản chỉnh.</li>
  </ol>
  <figure>
    <img src="${images.binhLuanCrm}" alt="CRM tab Bình luận xem file" />
    <figcaption>Hình 8 — Chi tiết deal CRM, tab Bình luận xem file từ xưởng</figcaption>
  </figure>

  <h3>4.3. Phân biệt Tài liệu vs Bình luận</h3>
  <ul>
    <li><strong>Tab Tài liệu:</strong> lưu bản vẽ chính thức, có nút Chia sẻ CRM.</li>
    <li><strong>Tab Bình luận + đính kèm:</strong> trao đổi nhanh, hỏi–đáp, gửi bản phác thảo.</li>
    <li><strong>Bình luận nhanh Kanban:</strong> chỉ text, không file.</li>
  </ul>

  <h2>Xử lý sự cố thường gặp</h2>
  <table class="trouble">
    <thead><tr><th>Vấn đề</th><th>Nguyên nhân</th><th>Cách xử lý</th></tr></thead>
    <tbody>
      <tr><td>Không hiện popup chọn xưởng</td><td>Deal đã có dự án liên kết</td><td>Mở deal kiểm tra; dùng thẻ trên Kanban SX</td></tr>
      <tr><td>Popup báo thiếu phân loại</td><td>Công ty chưa khai báo phân loại</td><td>SX → Pipeline xưởng → thêm phân loại</td></tr>
      <tr><td>Kanban SX trống</td><td>Lọc sai xưởng hoặc phân loại</td><td>Bộ lọc → Công ty = Phúc Đạt, Phân loại đúng bước 1</td></tr>
      <tr><td>CRM không thấy bản vẽ</td><td>Chưa Chia sẻ CRM hoặc chỉ up nội bộ</td><td>Bật Chia sẻ CRM, hoặc gửi qua Bình luận</td></tr>
    </tbody>
  </table>

  <h2>Đường dẫn nhanh</h2>
  <ul>
    <li>CRM Deals: <code>/crm/dashboard</code> + lọc công ty</li>
    <li>Kanban xưởng: <code>/sx/dashboard</code></li>
    <li>Chi tiết dự án + Tài liệu: <code>/sx/projects/{id}?tab=documents</code></li>
    <li>Chi tiết dự án + Bình luận: <code>/sx/projects/{id}?tab=comments</code></li>
    <li>Chi tiết deal CRM: <code>/crm/leads/{deal_id}</code></li>
    <li>Cấu hình pipeline: <code>/sx/pipeline-settings</code></li>
    <li>Hướng dẫn online: <code>/updates</code> — Có gì mới?</li>
  </ul>

  <p class="footer-note">TuBep Pro · Hướng dẫn nội bộ · Công ty Nhôm Kính Phúc Đạt · 07/07/2026</p>
</body>
</html>`;

fs.writeFileSync(outHtml, html, 'utf8');
console.log('Wrote', outHtml);

const require = createRequire(import.meta.url);
let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch {
  console.error('Installing puppeteer…');
  const { execSync } = await import('child_process');
  execSync('npm install puppeteer --no-save', { cwd: path.join(root, 'backend'), stdio: 'inherit' });
  puppeteer = require(path.join(root, 'backend/node_modules/puppeteer'));
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
  margin: { top: '16mm', right: '14mm', bottom: '18mm', left: '14mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: '<div style="width:100%;font-size:8px;color:#94a3b8;text-align:center;padding:0 14mm;"><span>TuBep Pro — Hướng dẫn CRM → Sản xuất (Phúc Đạt)</span> · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
});
await browser.close();

const stat = fs.statSync(outPdf);
console.log(`PDF ready: ${outPdf} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
