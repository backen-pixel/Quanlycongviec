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

function wrap(title, bodyHtml, opts = {}) {
  const badge = opts.badge || 'Hướng dẫn nội bộ · CRM';
  const meta = opts.meta || 'Dành cho nhân viên · Tháng 7/2026';
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>${CSS}</style>
</head>
<body>
  <header class="cover">
    <div class="badge">${badge}</div>
    <h1>${title}</h1>
    <div class="meta">${meta}</div>
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
  {
    file: '05-metalla-tao-nhan-vien-phan-quyen.pdf',
    title: 'Tạo nhân viên & phân quyền — Công Ty Metalla',
    html: wrap('Tạo nhân viên & phân quyền — Công Ty Metalla', `
      <h2>Khi nào dùng?</h2>
      <p>Khi cần <strong>thêm nhân viên mới</strong> cho <strong>Công Ty Metalla</strong> (xưởng / kinh doanh), gán đúng <strong>phòng ban · khu vực CRM · vai trò</strong>, rồi <strong>phân quyền chi tiết</strong> theo cây tổ chức (Khối → Công ty → Phòng ban).</p>
      <div class="note">
        <strong>Ai được làm:</strong> Admin hệ thống hoặc quản lý có quyền quản lý nhân viên.<br/>
        <strong>Đường dẫn:</strong> menu <strong>Nhân viên</strong> (<code>/users</code>).
      </div>

      <h2>Bước 1 — Vào danh sách & lọc Metalla</h2>
      <ol>
        <li>Mở <strong>Nhân viên</strong> trên sidebar (nhóm Quản lý / Hệ thống).</li>
        <li>Ở bộ lọc công ty, chọn <strong>Công Ty Metalla</strong>.</li>
        <li>Danh sách chỉ còn NV thuộc Metalla — kiểm tra trước khi thêm để tránh trùng email.</li>
      </ol>
      ${imgTag('metalla-tao-nv/01-trang-quan-ly-nv-metalla.png', 'Quản lý nhân viên — lọc Công Ty Metalla')}

      <h2>Bước 2 — Bấm Thêm NV và điền thông tin</h2>
      <ol>
        <li>Bấm nút tím <strong>Thêm NV</strong> (góc phải trên).</li>
        <li>Điền bắt buộc: <strong>Họ tên</strong>, <strong>Email</strong>, <strong>Mật khẩu</strong> (mặc định gợi ý 123456 — nên đổi sau).</li>
        <li>Chọn <strong>Vai trò</strong> phù hợp Metalla, ví dụ:
          <ul>
            <li><strong>Kinh doanh (SAE)</strong> — làm CRM / lead / deal</li>
            <li><strong>NV Sản xuất (Admin CV+SX)</strong> — làm xưởng / công việc SX</li>
            <li><strong>Nhân viên</strong> — quyền cơ bản</li>
          </ul>
        </li>
        <li>(Tuỳ chọn) Chức vụ, SĐT, ảnh đại diện.</li>
      </ol>
      ${imgTag('metalla-tao-nv/02-form-them-nv-metalla.png', 'Form Thêm nhân viên mới — thông tin cơ bản')}

      <h2>Bước 3 — Phân công tổ chức Metalla</h2>
      <p>Trong khối xanh <strong>PHÂN CÔNG TỔ CHỨC</strong>:</p>
      <ol>
        <li>Chọn <strong>Công ty</strong> = <strong>Công Ty Metalla</strong> (có thể chọn Khối Sản Xuất trước nếu danh sách dài).</li>
        <li>Chọn <strong>Phòng ban</strong>: <em>Phòng kinh doanh</em> hoặc <em>Phòng sản xuất</em>.</li>
        <li>Tích <strong>Khu vực CRM</strong> (vd. <em>Xưởng sản xuất TP.HCM</em>) nếu NV làm lead/deal theo vùng.</li>
        <li>Bấm <strong>Tạo NV</strong>.</li>
      </ol>
      ${imgTag('metalla-tao-nv/03-phan-cong-to-chuc.png', 'Phân công tổ chức — Metalla + phòng ban + khu vực CRM')}
      <div class="note">
        <strong>Lưu ý:</strong> Vai trò trên form là <em>role hệ thống</em> của tài khoản. Phân quyền chi tiết (RBAC theo đơn vị) làm ở bước sau.
      </div>

      <h2>Bước 4 — Mở menu Phân quyền</h2>
      <ol>
        <li>Trên thẻ nhân viên vừa tạo (hoặc NV Metalla cần chỉnh), bấm nút <strong>⋯</strong> (ba chấm).</li>
        <li>Chọn <strong>Phân quyền</strong> (màu tím).</li>
      </ol>
      ${imgTag('metalla-tao-nv/04-menu-phan-quyen.png', 'Menu thẻ NV — Phân quyền / Chỉnh sửa')}

      <h2>Bước 5 — Gán vai trò theo phạm vi Công ty Metalla</h2>
      <ol>
        <li>Trong popup <strong>Phân quyền: …</strong>, xem <strong>Vai trò hiện tại</strong>.</li>
        <li>Ở <strong>Thêm vai trò mới</strong>, mở rộng vai trò cần gán (vd. <code>production_staff</code>, <code>sales_admin</code>, <code>employee</code>…).</li>
        <li>Chọn cấp độ: <strong>Công ty</strong> (khuyến nghị cho Metalla — không gán «Toàn hệ thống» trừ khi thật sự cần).</li>
        <li>Chọn nối tiếp: <strong>Khối Sản Xuất</strong> → <strong>Công Ty Metalla</strong>.</li>
        <li>Bấm <strong>Gán vai trò</strong>.</li>
        <li>Bấm <strong>Đóng</strong> khi xong.</li>
      </ol>
      ${imgTag('metalla-tao-nv/05-modal-phan-quyen.png', 'Popup Phân quyền — danh sách vai trò')}
      ${imgTag('metalla-tao-nv/06-gan-vai-tro-cong-ty-metalla.png', 'Gán vai trò phạm vi Công ty — chọn Khối Sản Xuất → Công Ty Metalla')}

      <h2>Gợi ý vai trò thường dùng Metalla</h2>
      <table>
        <thead><tr><th>Nhu cầu</th><th>Role form (tạo NV)</th><th>Vai trò phân quyền (RBAC)</th></tr></thead>
        <tbody>
          <tr><td>NV xưởng / công việc SX</td><td>NV Sản xuất (Admin CV+SX)</td><td><code>production_staff</code> @ Công Ty Metalla</td></tr>
          <tr><td>Quản trị SX Metalla</td><td>Admin Sản xuất</td><td><code>production_admin</code> @ Công Ty Metalla</td></tr>
          <tr><td>Kinh doanh / CRM</td><td>Kinh doanh (SAE) / Sales Admin</td><td><code>employee</code> hoặc <code>sales_admin</code> @ Metalla</td></tr>
          <tr><td>Làm cả CRM + SX</td><td>NV CRM + Admin SX / Admin CRM + SX</td><td><code>crm_production_staff</code> hoặc <code>crm_production_admin</code> @ Metalla</td></tr>
        </tbody>
      </table>

      <h2>Checklist sau khi tạo</h2>
      <ul class="check">
        <li>Lọc công ty Metalla → thấy NV mới trong danh sách</li>
        <li>Đúng phòng ban + khu vực CRM (nếu cần)</li>
        <li>Đã gán ít nhất 1 vai trò RBAC phạm vi <strong>Công Ty Metalla</strong></li>
        <li>NV đăng nhập được bằng email + mật khẩu đã cấp</li>
        <li>NV chỉ thấy dữ liệu Metalla (không lộ công ty khác)</li>
      </ul>

      <h2>Lỗi hay gặp</h2>
      <table>
        <thead><tr><th>Hiện tượng</th><th>Cách xử lý</th></tr></thead>
        <tbody>
          <tr><td>Email đã tồn tại</td><td>Dùng email khác hoặc tìm NV cũ → Chỉnh sửa / kích hoạt lại</td></tr>
          <tr><td>Không chọn được Phòng ban</td><td>Chọn <strong>Công Ty Metalla</strong> trước</td></tr>
          <tr><td>Nút Gán vai trò xám</td><td>Chọn đủ Khối → Công ty (Metalla)</td></tr>
          <tr><td>NV không thấy module SX/CRM</td><td>Thiếu role RBAC hoặc sai phạm vi — mở lại Phân quyền</td></tr>
        </tbody>
      </table>
    `),
  },
  {
    file: '06-ke-hoach-sx-va-vc-ld.pdf',
    title: 'Thiết lập kế hoạch Sản xuất & VC/LĐ',
    html: wrap('Thiết lập kế hoạch Sản xuất & VC/LĐ', `
      <h2>Luồng đi của một đơn hàng</h2>
      <p>Sale CRM lập kế hoạch <strong>một lần</strong> (xưởng SX + công ty VC/LĐ + ngày lắp + ngày lấy hàng + ghi chú).
      Dự án hiện ngay ở <strong>cột lắp đặt tạm</strong> trên bảng Lắp đặt để bên VC/LĐ biết trước.
      Khi xưởng làm xong và bấm bàn giao, Sale nhận thông báo và chỉ cần <strong>xác nhận lại thông tin đã điền</strong> —
      hệ thống <strong>không tạo dự án VC/LĐ mới</strong>, chỉ chuyển dự án từ cột tạm sang cột tiếp nhận.</p>
      <table>
        <thead><tr><th>Bước</th><th>Ai làm</th><th>Làm ở đâu</th><th>Kết quả</th></tr></thead>
        <tbody>
          <tr><td>0. Cấu hình (1 lần)</td><td>Admin</td><td>Lắp đặt → Cài đặt Pipeline</td><td>Chọn cột chứa dự án lắp đặt tạm</td></tr>
          <tr><td>1. Lập kế hoạch</td><td>Sale CRM</td><td>Chi tiết Deal → <strong>Kế hoạch SX &amp; VC/LĐ</strong></td><td>Tạo dự án xưởng, đặt vào cột tạm, tạo sự kiện dự kiến + thông báo cho VC/LĐ</td></tr>
          <tr><td>2. Xem trước</td><td>VC/LĐ</td><td>Chuông thông báo · Lắp đặt → Kanban cột tạm · tab Lịch</td><td>Thẻ có badge <strong>TẠM</strong> + ghi chú VC/LĐ, lịch có mốc dự kiến</td></tr>
          <tr><td>3. Xưởng xong</td><td>Xưởng SX</td><td>Kanban SX / trang dự án SX → cột bàn giao</td><td>Gửi thông báo cho Sale CRM phụ trách deal</td></tr>
          <tr><td>4. Xác nhận</td><td>Sale CRM</td><td>Deal → tab <strong>Bình luận</strong> → thẻ Bàn giao Lắp đặt</td><td>Bàn giao thật: thẻ rời cột tạm sang cột tiếp nhận</td></tr>
          <tr><td>5. Nhận việc</td><td>VC/LĐ</td><td>Lắp đặt → cột tiếp nhận (vd. Chờ giao hàng)</td><td>Xác nhận → tạo sự kiện lịch lấy hàng &amp; lắp đặt</td></tr>
        </tbody>
      </table>

      <h2>Bước 0 — Admin: chọn cột «lắp đặt tạm» (làm một lần cho mỗi công ty VC)</h2>
      <ol>
        <li>Vào module <strong>Lắp đặt</strong> → <strong>Cài đặt Pipeline Lắp đặt</strong> (<code>/vc/pipeline-settings</code>).</li>
        <li>Chọn <strong>Công ty</strong> VC/LĐ ở ô phía trên.</li>
        <li>Ở giai đoạn muốn dùng làm nơi chứa dự án chưa bàn giao (vd. <em>Dự án sắp tới</em>), bấm pill <strong>LĐ tạm</strong>.
        Pill sáng tím + badge <strong>🔧 Lắp đặt tạm</strong> = đã bật.</li>
      </ol>
      ${imgTag('sx-vc-ld-ke-hoach/01-vc-setup-cot-lap-dat-tam.png', 'Cột «Dự án sắp tới» đã bật LĐ tạm')}
      <p>Cách khác: bấm <strong>Sửa</strong> ở giai đoạn đó rồi tích <strong>Nơi để dự án lắp đặt tạm</strong> → <strong>Lưu</strong>.</p>
      ${imgTag('sx-vc-ld-ke-hoach/02-vc-setup-tich-o-lap-dat-tam.png', 'Ô tích «Nơi để dự án lắp đặt tạm» trong form sửa giai đoạn')}
      <div class="note">
        <strong>Lưu ý:</strong> mỗi công ty VC/LĐ chỉ có <strong>một</strong> cột lắp đặt tạm — bật cột mới thì cột cũ tự tắt.
        Chưa bật cột nào thì luồng vẫn chạy, chỉ là bên VC/LĐ không thấy dự án trước khi xưởng bàn giao.
      </div>

      <h2>Bước 1 — Sale CRM: lập kế hoạch SX &amp; VC/LĐ trên Deal</h2>
      <ol>
        <li>Mở <strong>chi tiết Deal</strong> (CRM → Pipeline → bấm thẻ deal).</li>
        <li>Trên header bấm <strong>Thiết lập kế hoạch SX &amp; VC/LĐ</strong> (deal đã có dự án thì nút hiện là <strong>Kế hoạch SX &amp; VC/LĐ</strong>).
        Muốn thêm xưởng thứ hai thì dùng <strong>+ Thêm dự án SX</strong> ở khối <em>Dự án sản xuất</em>.</li>
      </ol>
      ${imgTag('sx-vc-ld-ke-hoach/03-crm-nut-thiet-lap-ke-hoach.png', 'Header Deal: nút Kế hoạch SX & VC/LĐ và khối Dự án sản xuất')}
      <p>Form đi theo <strong>số thứ tự từng bước</strong> — điền lần lượt:</p>
      <ol>
        <li><strong>CÔNG TY SX</strong> + <strong>PHÂN LOẠI</strong> (vd. HCB · Tủ bếp). Mỗi xưởng là một thẻ Kanban SX riêng.</li>
        <li><strong>DEADLINE LẮP ĐẶT (VC/LĐ) &amp; HOÀN THIỆN (SX)</strong> — chọn ngày lắp; ngày hoàn thiện SX tự tính = ngày lắp − 2 ngày.</li>
        <li><strong>LẤY HÀNG (VC)</strong> — giờ VC đến xưởng lấy hàng.</li>
      </ol>
      ${imgTag('sx-vc-ld-ke-hoach/04-form-ke-hoach-cac-buoc.png', 'Bước 1–2: chọn xưởng, phân loại và deadline lắp đặt')}
      <ol start="4">
        <li><strong>CÔNG TY VC / LẮP ĐẶT</strong> — chọn công ty vận chuyển/lắp đặt của xưởng này.
        Chọn xong thì dự án được đặt sẵn vào cột lắp đặt tạm của công ty đó.</li>
        <li><strong>GHI CHÚ CHO BÊN VC / LẮP ĐẶT</strong> — dặn dò riêng cho tổ VC/LĐ
        (vd. <em>hàng dễ vỡ, gọi khách trước 30 phút, thang máy nhỏ cần 2 thợ, chỗ đậu xe</em>).
        Ghi chú theo <strong>từng xưởng</strong>: mỗi xưởng gắn một công ty VC/LĐ nên nhập riêng cho từng thẻ.</li>
        <li>Bấm <strong>Thêm dự án</strong> (hoặc <strong>Lưu lịch</strong> nếu đang sửa) để chốt kế hoạch.</li>
      </ol>
      ${imgTag('sx-vc-ld-ke-hoach/05-form-chon-vc-va-ghi-chu.png', 'Bước 4–5: công ty VC/LĐ và ghi chú cho bên VC/LĐ')}
      <p>Sau này cần đổi ngày hoặc bổ sung ghi chú: khối <em>Dự án sản xuất</em> → <strong>Sửa lịch</strong>.
      Cùng một ô ghi chú, sửa xong bấm <strong>Lưu lịch</strong>.</p>
      ${imgTag('sx-vc-ld-ke-hoach/06-sua-lich-ghi-chu-vc.png', 'Modal Sửa lịch lắp đặt — công ty VC/LĐ, ghi chú, ngày lắp, ngày lấy hàng')}

      <h2>Bước 2 — VC/LĐ thấy dự án ở đâu (trước khi xưởng bàn giao)</h2>
      <p>Vào module <strong>Lắp đặt</strong> → <strong>Kanban</strong>, chọn đúng <strong>công ty VC/LĐ</strong>.
      Dự án nằm ở <strong>cột lắp đặt tạm</strong> đã cấu hình ở bước 0 (ảnh dưới: cột <em>Dự án sắp tới</em>).</p>
      <p>Thẻ có:</p>
      <ul>
        <li>Badge tím <strong>🔒 TẠM</strong> — nghĩa là <em>xưởng chưa bàn giao thật</em>, chỉ để xem trước và chuẩn bị nhân sự/xe.
        Thẻ đang <em>khoá</em>: chưa kéo sang cột khác được.</li>
        <li>Dòng <strong>Ghi chú VC/LĐ</strong> — đúng nội dung Sale đã nhập ở bước 1.</li>
        <li>Mã dự án, khách hàng, phân loại, người phụ trách CRM/SX/VC/LĐ.</li>
      </ul>
      ${imgTag('sx-vc-ld-ke-hoach/07-vc-board-cot-tam.png', 'Bảng Lắp đặt — cột lắp đặt tạm «Dự án sắp tới»')}
      ${imgTag('sx-vc-ld-ke-hoach/07b-vc-the-tam-ghi-chu.png', 'Thẻ ở cột tạm: badge TẠM + Ghi chú VC/LĐ')}
      <div class="note">
        <strong>Thẻ TẠM bị khoá chuyển cột.</strong> Không kéo được sang cột khác, nút «Chuyển cột nhanh» / «Chuyển LĐ» cũng mờ đi.
        Chờ xưởng bàn giao và Sale CRM xác nhận lại thông tin — hệ thống tự chuyển thẻ sang cột tiếp nhận, lúc đó mới kéo thẻ theo lịch được.
      </div>

      <h3>Thông báo + lịch dự kiến tự gửi ngay khi Sale lưu kế hoạch</h3>
      <p>Không cần chờ xưởng bàn giao, ngay lúc Sale lưu kế hoạch hệ thống đã:</p>
      <ul>
        <li><strong>Gửi thông báo (chuông)</strong> cho <em>NV phụ trách VC, NV lắp đặt và người xác nhận bàn giao</em> của công ty VC/LĐ:
        <em>«🚚 Kế hoạch lắp đặt sắp tới — TB-xxxx · lắp đặt 27/08 · lấy hàng 27/08 · ghi chú: … — đang ở cột lắp đặt tạm, chờ xưởng bàn giao»</em>.
        Bấm vào thông báo là mở thẳng bảng Lắp đặt và sáng đúng thẻ.</li>
        <li><strong>Tạo sự kiện dự kiến</strong> trên tab <strong>Lịch</strong> (thẻ sự kiện Lấy hàng / Lắp đặt hiện luôn khối vàng <em>🚚 Ghi chú VC/LĐ</em> nếu Sale đã nhập):
        <em>Lấy hàng (dự kiến)</em>, <em>Lắp đặt (dự kiến)</em> (module Lắp đặt)
        và <em>Hoàn thiện sản xuất (dự kiến)</em> (module Sản xuất) — đã gắn sẵn người phụ trách VC/LĐ, NV lắp đặt và người xác nhận vào thành viên sự kiện.</li>
        <li><strong>Thêm NV phụ trách VC/LĐ vào tab Thành viên</strong> của deal để họ đọc được trao đổi liên quan.</li>
      </ul>
      <p>Sale sửa lịch hoặc sửa ghi chú → gửi lại thông báo <em>«🚚 Kế hoạch lắp đặt vừa cập nhật»</em>.
      Lưu lại mà công ty VC/LĐ, ngày và ghi chú không đổi thì <strong>không gửi trùng</strong>.</p>
      <div class="note">
        <strong>Không nhận được thông báo?</strong> Công ty VC/LĐ chưa cấu hình NV chịu trách nhiệm bàn giao —
        chỉ NV phụ trách (không phải cả công ty) mới nhận, để tránh làm ồn cả tổ.
      </div>

      <h2>Bước 3 — Xưởng SX hoàn thiện: bấm bàn giao</h2>
      <ol>
        <li>Trên <strong>Kanban SX</strong>: kéo thẻ dự án vào <strong>cột bàn giao VC</strong> (cột được cấu hình bàn giao sang Lắp đặt,
        vd. <em>ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG</em>).</li>
        <li>Hoặc mở <strong>trang dự án SX</strong> rồi bấm chính bước đó trên thanh giai đoạn phía trên.</li>
      </ol>
      ${imgTag('sx-vc-ld-ke-hoach/08-sx-hoan-thien-cot-ban-giao.png', 'Trang dự án SX — bấm bước bàn giao trên thanh giai đoạn')}
      <p>Hệ thống báo: <em>«Đã gửi thông báo cho Sale CRM phụ trách deal — họ cần chọn công ty VC/LĐ và ngày lấy/lắp
      (trong bình luận deal)»</em>. Xưởng không phải chọn công ty VC/LĐ.</p>

      <h2>Bước 4 — Sale CRM: xác nhận lại thông tin đã điền</h2>
      <ol>
        <li>Sale nhận <strong>thông báo</strong> (chuông) và một thẻ <strong>Bàn giao Lắp đặt</strong> trong Deal → tab <strong>Bình luận</strong>.</li>
        <li>Trong thẻ có khối xanh <strong>«Thông tin VC/LĐ đã điền khi lập kế hoạch — xác nhận hoặc sửa lại»</strong>:
        công ty VC/LĐ, ngày lắp dự kiến, ghi chú cho VC/LĐ đã được <strong>điền sẵn</strong> từ bước 1.</li>
        <li>Kiểm tra, sửa nếu cần, rồi bấm <strong>Chọn &amp; bàn giao</strong>.</li>
      </ol>
      ${imgTag('sx-vc-ld-ke-hoach/09-crm-the-ban-giao-xac-nhan.png', 'Thẻ Bàn giao Lắp đặt trong tab Bình luận của Deal')}
      ${imgTag('sx-vc-ld-ke-hoach/09b-crm-chon-ban-giao.png', 'Cuối thẻ bàn giao: ngày lắp, giờ lắp, 3 sự kiện và nút Chọn & bàn giao')}
      <div class="note">
        <strong>Không tạo dự án VC/LĐ mới.</strong> Xác nhận chỉ chuyển dự án đang ở cột tạm sang <strong>cột tiếp nhận</strong> và bỏ badge TẠM.
        Chỉ <strong>Sale CRM phụ trách deal</strong> mới bấm được — người khác chỉ xem.
      </div>

      <h2>Bước 5 — VC/LĐ nhận việc thật</h2>
      <ul>
        <li>Thẻ rời cột lắp đặt tạm → sang <strong>cột tiếp nhận</strong> của bảng Lắp đặt (vd. <em>Chờ giao hàng</em>), badge TẠM mất.</li>
        <li>Ghi chú VC/LĐ vẫn giữ trên thẻ và trong chi tiết dự án.</li>
        <li><strong>Phụ trách VC/LĐ xác nhận</strong> trên thẻ bàn giao → đủ hai bên (Xưởng + VC/LĐ) thì hệ thống tạo
        các <strong>sự kiện lịch bàn giao chính thức</strong> (khác với sự kiện <em>dự kiến</em> đã có từ lúc lập kế hoạch).</li>
        <li>Từ đây kéo thẻ theo tiến độ thật: Đang giao → Đã giao → Lắp đặt → Nghiệm thu → Hoàn thiện.</li>
      </ul>

      <h2>Tra nhanh: xem ở đâu</h2>
      <table>
        <thead><tr><th>Cần xem</th><th>Vị trí</th></tr></thead>
        <tbody>
          <tr><td>Kế hoạch lắp / lấy hàng của deal</td><td>Chi tiết Deal → khối <strong>Dự án sản xuất</strong></td></tr>
          <tr><td>Ghi chú cho bên VC/LĐ</td><td>Thẻ Kanban Lắp đặt · chi tiết dự án · modal Sửa lịch · thẻ sự kiện <em>Lấy hàng / Lắp đặt</em> trên tab Lịch</td></tr>
          <tr><td>Dự án chưa bàn giao</td><td>Bảng Lắp đặt → cột lắp đặt tạm (badge TẠM)</td></tr>
          <tr><td>Thông báo kế hoạch lắp đặt</td><td>Chuông → <em>🚚 Kế hoạch lắp đặt sắp tới / vừa cập nhật</em></td></tr>
          <tr><td>Yêu cầu bàn giao của xưởng</td><td>Deal → tab Bình luận → thẻ <strong>Bàn giao Lắp đặt</strong></td></tr>
          <tr><td>Lịch lấy hàng / lắp đặt</td><td>Tab <strong>Lịch</strong> (CRM · SX · VC/LĐ) — mốc <em>(dự kiến)</em> có ngay sau khi lưu kế hoạch</td></tr>
        </tbody>
      </table>

      <h2>Checklist</h2>
      <ul class="check">
        <li>Admin đã bật cột lắp đặt tạm cho công ty VC/LĐ</li>
        <li>Sale đã chọn xưởng SX + phân loại + ngày lắp + ngày lấy hàng</li>
        <li>Đã chọn công ty VC/LĐ và nhập ghi chú cho từng xưởng</li>
        <li>Bên VC/LĐ thấy thẻ badge TẠM kèm ghi chú</li>
        <li>NV phụ trách VC/LĐ đã nhận thông báo «Kế hoạch lắp đặt sắp tới» + thấy mốc dự kiến trên tab Lịch</li>
        <li>Xưởng xong → kéo vào cột bàn giao → Sale nhận thông báo</li>
        <li>Sale bấm <strong>Chọn &amp; bàn giao</strong> → thẻ sang cột tiếp nhận, không có dự án trùng</li>
        <li>VC/LĐ xác nhận → sự kiện lịch lấy hàng &amp; lắp đặt đã tạo</li>
      </ul>

      <h2>Lỗi hay gặp</h2>
      <table>
        <thead><tr><th>Hiện tượng</th><th>Cách xử lý</th></tr></thead>
        <tbody>
          <tr><td>VC/LĐ không thấy dự án dù đã lập kế hoạch</td><td>Chưa bật cột lắp đặt tạm, hoặc đang xem sai công ty VC/LĐ trên bảng Lắp đặt</td></tr>
          <tr><td>Không thấy ô ghi chú VC/LĐ</td><td>Ô chỉ hiện sau khi đã chọn <strong>Công ty VC / lắp đặt</strong></td></tr>
          <tr><td>NV VC/LĐ không nhận thông báo kế hoạch</td><td>Công ty VC/LĐ chưa cấu hình NV phụ trách / NV lắp đặt bàn giao, hoặc người đó đã tắt thông báo</td></tr>
          <tr><td>Thợ lắp không thấy mốc trên tab Lịch</td><td>NV thường chỉ thấy sự kiện mình là thành viên — gán họ làm NV lắp đặt của dự án</td></tr>
          <tr><td>Sale không bấm được «Chọn &amp; bàn giao»</td><td>Chỉ Sale phụ trách deal có quyền — chuyển người phụ trách hoặc nhờ đúng người bấm</td></tr>
          <tr><td>Thẻ vẫn còn badge TẠM sau khi xưởng bàn giao</td><td>Sale chưa xác nhận thẻ Bàn giao Lắp đặt trong tab Bình luận</td></tr>
          <tr><td>Kéo thẻ TẠM không được / báo «chờ xưởng bàn giao và Sale xác nhận»</td><td>Đúng thiết kế — chỉ chuyển cột được sau khi bàn giao thật. Cần gấp thì nhờ xưởng bấm bàn giao và Sale xác nhận (admin có thể ép chuyển)</td></tr>
          <tr><td>Lo bị tạo hai dự án VC/LĐ</td><td>Không xảy ra: bàn giao chỉ chuyển cột dự án đang có, không tạo mới</td></tr>
          <tr><td>Chưa thấy sự kiện lịch</td><td>Sự kiện chỉ tạo khi cả Xưởng và VC/LĐ đã xác nhận</td></tr>
        </tbody>
      </table>
    `, { badge: 'Hướng dẫn nội bộ · CRM · Sản xuất · Lắp đặt', meta: 'Dành cho Sale CRM · Xưởng SX · VC/LĐ · Tháng 8/2026' }),
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
