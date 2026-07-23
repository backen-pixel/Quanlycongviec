/**
 * Xuất hướng dẫn CRM ra PDF (Chrome headless).
 * Chạy: node frontend/scripts/export-guide-pdfs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const releaseNotes = path.join(root, 'public', 'release-notes');
const guidesDir = path.join(root, 'public', 'guides');
const outDir = path.join(guidesDir, 'pdf');
const tmpDir = path.join(outDir, '_html');

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function findChrome() {
  for (const p of chromeCandidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Không tìm thấy Chrome/Edge. Đặt CHROME_PATH.');
}

/** Resolve ảnh từ release-notes/ hoặc đường dẫn tương đối trong public/guides/ */
function resolveImagePath(filename) {
  const fromRn = path.join(releaseNotes, filename);
  if (fs.existsSync(fromRn)) return fromRn;
  const fromGuides = path.join(guidesDir, filename);
  if (fs.existsSync(fromGuides)) return fromGuides;
  return null;
}

function imgDataUri(filename) {
  const full = resolveImagePath(filename);
  if (!full) {
    console.warn('Thiếu ảnh:', filename);
    return '';
  }
  const b64 = fs.readFileSync(full).toString('base64');
  return `data:image/png;base64,${b64}`;
}

function imgTag(filename, alt) {
  const src = imgDataUri(filename);
  if (!src) return `<p class="muted">[Ảnh: ${filename}]</p>`;
  return `<figure><img src="${src}" alt="${alt}" /><figcaption>${alt}</figcaption></figure>`;
}

const CSS = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", "Be Vietnam Pro", system-ui, sans-serif;
    color: #1a1a1a;
    line-height: 1.55;
    font-size: 11.5pt;
    margin: 0;
  }
  .cover {
    border-bottom: 3px solid #0f766e;
    padding-bottom: 12px;
    margin-bottom: 18px;
  }
  .badge {
    display: inline-block;
    background: #ecfdf5;
    color: #0f766e;
    font-size: 9pt;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
    margin-bottom: 8px;
  }
  h1 { font-size: 18pt; margin: 0 0 6px; color: #134e4a; }
  .meta { color: #64748b; font-size: 9.5pt; }
  h2 {
    font-size: 13pt;
    color: #0f766e;
    margin: 22px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #ccfbf1;
  }
  p { margin: 0 0 10px; }
  ol, ul { margin: 0 0 12px; padding-left: 1.3em; }
  li { margin-bottom: 4px; }
  strong { color: #134e4a; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 14px;
    font-size: 10.5pt;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 7px 9px;
    text-align: left;
    vertical-align: top;
  }
  th { background: #f0fdfa; color: #134e4a; }
  figure {
    margin: 12px 0 16px;
    page-break-inside: avoid;
  }
  img {
    max-width: 100%;
    height: auto;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    display: block;
  }
  figcaption {
    font-size: 9pt;
    color: #64748b;
    margin-top: 4px;
    text-align: center;
  }
  .note {
    background: #fff7ed;
    border-left: 4px solid #f59e0b;
    padding: 10px 12px;
    margin: 12px 0;
    font-size: 10.5pt;
  }
  .footer {
    margin-top: 28px;
    padding-top: 10px;
    border-top: 1px solid #e2e8f0;
    font-size: 9pt;
    color: #94a3b8;
  }
  .check li { list-style: none; margin-left: -0.5em; }
  .check li::before { content: "☐ "; color: #0f766e; }
  .muted { color: #94a3b8; font-size: 10pt; }
`;

function wrap(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>${CSS}</style>
</head>
<body>
  <header class="cover">
    <div class="badge">Hướng dẫn nội bộ · CRM</div>
    <h1>${title}</h1>
    <div class="meta">Dành cho nhân viên · Tháng 7/2026</div>
  </header>
  ${bodyHtml}
  <div class="footer">Hệ thống Quản lý công việc · In từ bộ hướng dẫn Cập nhật (builtin guides)</div>
</body>
</html>`;
}

const guides = [
  {
    file: '01-chuyen-deal-ve-lead.pdf',
    title: 'Chuyển Deal về Lead',
    html: wrap('Chuyển Deal về Lead', `
      <h2>Khi nào dùng?</h2>
      <p>Khi Deal <strong>chưa đủ điều kiện bán</strong> (sai loại, cần nuôi lại, hoặc muốn trả về pipeline Lead), dùng nút <strong>Trả về Lead</strong>.</p>
      <div class="note">
        <strong>Lưu ý:</strong><br/>
        • Deal <strong>đã có dự án SX</strong> cần tích xác nhận <strong>gỡ liên kết dự án</strong> (chỉ admin công ty/khu vực).<br/>
        • Phải chọn <strong>người phụ trách Lead mới</strong>.
      </div>

      <h2>Bước 1 — Mở chi tiết Deal</h2>
      <ol>
        <li>Vào <strong>CRM → Pipeline</strong> (tab Deal).</li>
        <li>Bấm thẻ Deal cần trả về.</li>
        <li>Trên header chi tiết, tìm nút vàng <strong>Trả về Lead</strong>.</li>
      </ol>
      ${imgTag('hd-deal-header.png', 'Header Deal — nút Trả về Lead')}

      <h2>Bước 2 — Điền form và xác nhận</h2>
      <ol>
        <li>Bấm <strong>Trả về Lead</strong>.</li>
        <li>Chọn <strong>Người phụ trách Lead mới</strong> (bắt buộc).</li>
        <li>Nếu Deal có dự án SX: tích <strong>gỡ liên kết dự án</strong>.</li>
        <li>(Tuỳ chọn) nhập lý do.</li>
        <li>Bấm <strong>Trả về Lead</strong> để xác nhận.</li>
      </ol>
      ${imgTag('hd-revert-lead-modal.png', 'Popup Trả về Lead')}

      <h2>Kiểm tra sau khi chuyển</h2>
      <ul>
        <li>Badge đổi thành <strong>LEAD</strong>.</li>
        <li>Bản ghi xuất hiện lại trên Kanban <strong>Lead</strong>.</li>
        <li>Lịch sử / tài liệu vẫn giữ nguyên.</li>
      </ul>

      <h2>Lỗi hay gặp</h2>
      <table>
        <thead><tr><th>Hiện tượng</th><th>Cách xử lý</th></tr></thead>
        <tbody>
          <tr><td>Không thấy nút Trả về Lead</td><td>Đang mở Lead (không phải Deal)</td></tr>
          <tr><td>Báo có dự án SX</td><td>Tích gỡ liên kết hoặc nhờ admin</td></tr>
          <tr><td>Không chọn được NV</td><td>Chọn công ty/khu vực trước</td></tr>
        </tbody>
      </table>
    `),
  },
  {
    file: '02-up-file-hinh-bang-drive-chi-tiet-deal.pdf',
    title: 'Up file / hình bằng Drive trong chi tiết Deal',
    html: wrap('Up file / hình bằng Drive trong chi tiết Deal', `
      <h2>Mục tiêu</h2>
      <p>Up <strong>file PDF, Excel, DWG…</strong> và <strong>hình ảnh</strong> lên <strong>Google Drive gắn với Deal</strong> ngay trên chi tiết Deal (tab <strong>Drive</strong>). File lưu trong thư mục Deal trên Drive — đồng nghiệp mở Deal là thấy.</p>

      <h2>Bước 1 — Mở Deal và vào tab Drive</h2>
      <ol>
        <li>CRM → Pipeline (tab Deal) → mở thẻ Deal.</li>
        <li>Ở vùng giữa, bấm tab <strong>Drive</strong>.</li>
        <li>Thấy thanh nút: <strong>Thư mục</strong> · <strong>Tải lên từ máy</strong> · <strong>Doc</strong> · <strong>Sheet</strong> · <strong>Liên kết file Drive</strong>.</li>
      </ol>

      <h2>Bước 2 — Tải file / hình từ máy lên Drive</h2>
      <ol>
        <li>Bấm <strong>Tải lên từ máy</strong> (nút xanh).</li>
        <li>Chọn một hoặc nhiều file từ máy (PDF, JPG, PNG, Excel, DWG…).</li>
        <li>Chờ tải lên xong.</li>
        <li>File hiện trong danh sách <strong>File từ Drive</strong> của Deal.</li>
      </ol>
      ${imgTag('hd-deal-drive-upload.png', 'Tab Drive — Tải lên từ máy trên Deal')}

      <h2>Cách khác (tuỳ chọn)</h2>
      <ul>
        <li><strong>Liên kết file Drive</strong> — gắn file đã có trên Google Drive vào Deal.</li>
        <li><strong>Doc / Sheet</strong> — tạo Google Doc hoặc Sheet mới trong thư mục Deal.</li>
        <li><strong>Thư mục</strong> — tạo thư mục con để sắp xếp bản vẽ / hợp đồng.</li>
      </ul>

      <h2>Kiểm tra sau khi up</h2>
      <ul>
        <li>Tab <strong>Drive</strong> tăng số file (badge trên tab).</li>
        <li>Breadcrumb thư mục dạng: <em>Drive của tôi → … → Deal → DEAL-…</em></li>
        <li>Mở lại Deal / refresh vẫn thấy file.</li>
      </ul>

      <h2>Lỗi hay gặp</h2>
      <table>
        <thead><tr><th>Hiện tượng</th><th>Cách xử lý</th></tr></thead>
        <tbody>
          <tr><td>Không thấy tab Drive</td><td>Đang ở tab Tài liệu / Công việc — bấm <strong>Drive</strong></td></tr>
          <tr><td>Không bấm được Tải lên từ máy</td><td>Chưa kết nối Drive / hết quyền — nhờ admin</td></tr>
          <tr><td>Upload mãi không xong</td><td>File quá lớn / mất mạng — thử lại hoặc nén ảnh</td></tr>
          <tr><td>Đồng nghiệp không thấy file</td><td>Họ mở đúng Deal → tab Drive; kiểm tra quyền Drive</td></tr>
        </tbody>
      </table>
    `),
  },
  {
    file: '03-chuyen-nhan-vien-khu-vuc.pdf',
    title: 'Chuyển nhân viên khác khu vực',
    html: wrap('Chuyển nhân viên khác khu vực', `
      <h2>Vì sao phải chọn khu vực trước?</h2>
      <p>Lead/Deal có <strong>khu vực</strong>. NV chỉ thuộc khu vực được phân. Nếu giao NV khu vực khác mà <strong>không đổi khu vực Lead</strong>, Kanban / quyền sẽ lệch (vd. VPT HCM ↔ Q2 ↔ Cần Thơ).</p>

      <h2>Bước 1 — Mở popup chuyển</h2>
      <p>Trên chi tiết Lead/Deal:</p>
      <ul>
        <li>Header: nút <strong>Chuyển người phụ trách</strong>, hoặc</li>
        <li>Panel <strong>Thông tin</strong> → nút <strong>Chuyển người phụ trách</strong>.</li>
      </ul>
      ${imgTag('hd-deal-header.png', 'Nút Chuyển người phụ trách trên header')}

      <h2>Bước 2 — Chọn khu vực rồi chọn NV</h2>
      <ol>
        <li>Chọn <strong>Khu vực</strong> (cùng công ty).</li>
        <li>Chọn <strong>Chuyển cho nhân viên</strong> — chỉ hiện NV thuộc khu vực đó.</li>
        <li>Bấm <strong>Xác nhận</strong>.</li>
      </ol>
      ${imgTag('hd-transfer-assignee-modal.png', 'Popup: khu vực + nhân viên')}

      <h2>Hệ thống làm gì?</h2>
      <ul>
        <li><strong>Cùng khu vực:</strong> chỉ đổi người phụ trách.</li>
        <li><strong>Khác khu vực:</strong> cập nhật khu vực + remap <strong>pipeline/stage</strong> (công ty tách pipeline theo khu vực).</li>
      </ul>

      <h2>Checklist</h2>
      <ul class="check">
        <li>Đã chọn đúng khu vực đích</li>
        <li>NV thuộc khu vực đó (picker không trống)</li>
        <li>Sau khi lưu: panel Thông tin hiện đúng khu vực + phụ trách mới</li>
      </ul>
    `),
  },
  {
    file: '04-gop-lead-thu-cong.pdf',
    title: 'Gộp Lead thủ công trên Kanban',
    html: wrap('Gộp Lead thủ công trên Kanban', `
      <h2>Khi nào cần gộp Lead?</h2>
      <p>Khi cùng một khách bị tạo <strong>nhiều lead</strong> (Facebook, Zalo, nhập tay trùng…), dữ liệu bị tách: nhiệm vụ, tài liệu, báo giá nằm rải. <strong>Gộp thủ công</strong> giúp bạn tự chọn các thẻ trên Kanban, giữ lại một bản ghi chính và gom dữ liệu từ các bản thừa.</p>

      <h2>Bước 1 — Vào Kanban Lead</h2>
      <ol>
        <li>Mở <strong>CRM → Pipeline</strong> (hoặc Dashboard CRM).</li>
        <li>Chọn tab <strong>Leads</strong>.</li>
        <li>Đảm bảo đang ở chế độ xem <strong>Kanban</strong>.</li>
      </ol>
      ${imgTag('gop-lead/01-kanban-tab-leads.png', 'Kanban tab Leads')}

      <h2>Bước 2 — Tìm ô chọn trên thẻ</h2>
      <p>Rê chuột lên thẻ Lead → góc <strong>phải trên</strong> hiện ô chọn. Bấm ô này để chọn thẻ cần gộp.</p>
      ${imgTag('gop-lead/02-o-chon-tren-the.png', 'Ô chọn trên thẻ Lead')}

      <h2>Bước 3 — Chọn ít nhất 2 thẻ</h2>
      <ol>
        <li>Tích chọn thẻ thứ nhất.</li>
        <li>Tích chọn thẻ thứ hai (hoặc nhiều hơn).</li>
        <li>Thẻ được chọn có <strong>viền vàng</strong>.</li>
        <li>Thanh vàng hiện phía trên: <strong>Đã chọn N lead</strong>.</li>
      </ol>
      ${imgTag('gop-lead/03-chon-2-the-thanh-vang.png', 'Đã chọn 2 lead — thanh vàng')}

      <h2>Bước 4 — Bấm Gộp đã chọn</h2>
      <p>Trên thanh vàng, bấm nút cam <strong>Gộp đã chọn</strong> để mở popup.</p>
      ${imgTag('gop-lead/04-nut-gop-da-chon.png', 'Nút Gộp đã chọn')}

      <h2>Bước 5 — Chọn bản ghi giữ lại</h2>
      <p>Trong popup: mỗi thẻ hiện mã lead, tiêu đề, khách hàng, số tài liệu. Bấm <strong>ô tròn (radio)</strong> bên trái thẻ muốn <strong>giữ lại</strong>.</p>
      ${imgTag('gop-lead/05-modal-chon-ban-giu.png', 'Chọn bản ghi giữ lại')}

      <h2>Bước 6 — Chọn cách gộp dữ liệu</h2>
      <ul>
        <li><strong>Gộp từ cả hai bản ghi</strong> (khuyến nghị): gom KH, tài liệu, nhiệm vụ, hoạt động, báo giá, đơn hàng, hóa đơn, Facebook… sang bản giữ.</li>
        <li><strong>Chỉ giữ bản được chọn:</strong> không chuyển dữ liệu từ bản kia — có thể mất dữ liệu bản bị loại.</li>
      </ul>
      ${imgTag('gop-lead/06-modal-du-lieu.png', 'Chọn cách gộp dữ liệu')}

      <h2>Bước 7 — Tiêu đề và xác nhận</h2>
      <p>Chọn cách lấy tiêu đề (giữ bản chọn / lấy từ bản kia / tùy chỉnh), rồi bấm <strong>Xác nhận gộp</strong>.</p>
      ${imgTag('gop-lead/07-modal-tieu-de-xac-nhan.png', 'Tiêu đề và nút Xác nhận gộp')}
      <p>Cùng thao tác cũng dùng được trên tab <strong>Deals</strong>.</p>

      <h2>Sau khi gộp — kiểm tra gì?</h2>
      <ul>
        <li>Trên Kanban chỉ còn <strong>một</strong> thẻ (bản giữ lại).</li>
        <li>Mở chi tiết lead → kiểm tra <strong>tài liệu</strong>, <strong>nhiệm vụ</strong>, <strong>báo giá</strong> đã gom đủ.</li>
        <li>Lead thừa không còn trong danh sách.</li>
      </ul>

      <div class="note">
        <strong>Cảnh báo:</strong><br/>
        • Gộp <strong>không hoàn tác</strong> dễ dàng — chọn đúng bản giữ lại trước khi xác nhận.<br/>
        • Không gộp hai lead của <strong>hai khách khác nhau</strong> trừ khi chắc chắn là cùng người.<br/>
        • Tùy chọn <strong>Chỉ giữ bản được chọn</strong> có thể xóa dữ liệu của thẻ bị loại.
      </div>

      <h2>Checklist</h2>
      <ul class="check">
        <li>Đã vào tab Leads · chế độ Kanban</li>
        <li>Đã chọn đúng ≥ 2 thẻ (viền vàng)</li>
        <li>Đã chọn đúng bản ghi giữ lại</li>
        <li>Đã chọn cách gộp dữ liệu phù hợp</li>
        <li>Sau gộp: còn 1 thẻ; tài liệu / nhiệm vụ / báo giá đã gom</li>
      </ul>
    `),
  },
];

fs.mkdirSync(tmpDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const chrome = findChrome();
console.log('Browser:', chrome);

const results = [];
for (const g of guides) {
  const htmlPath = path.join(tmpDir, g.file.replace(/\.pdf$/, '.html'));
  const pdfPath = path.join(outDir, g.file);
  fs.writeFileSync(htmlPath, g.html, 'utf8');

  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    '--print-to-pdf-no-header',
    fileUrl,
  ];

  const r = spawnSync(chrome, args, { encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0 || !fs.existsSync(pdfPath)) {
    console.error('FAIL', g.file, r.stderr || r.stdout || r.error);
    process.exitCode = 1;
    continue;
  }
  const kb = Math.round(fs.statSync(pdfPath).size / 1024);
  console.log('OK', g.file, `(${kb} KB)`);
  results.push({ file: g.file, path: pdfPath, kb });
}

// Gọn: xóa HTML tạm (giữ PDF)
for (const f of fs.readdirSync(tmpDir)) {
  fs.unlinkSync(path.join(tmpDir, f));
}
fs.rmdirSync(tmpDir);

console.log('\nPDF sẵn sàng tại:');
results.forEach((x) => console.log(' -', x.path));
