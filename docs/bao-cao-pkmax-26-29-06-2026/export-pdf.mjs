import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = __dirname;

function img(name) {
  const b64 = fs.readFileSync(path.join(dir, 'images', name)).toString('base64');
  return `data:image/png;base64,${b64}`;
}

const sections = [
  { title: '3.1 Giám sát Supabase', cap: 'Chuyển đổi DB, failover & replication', file: '01-backup-sync-monitor.png' },
  { title: '3.2 Lịch đồng bộ tự động', cap: '05:00 · 12:30 · 18:00 VN — drift → clone → Storage → verify', file: '05-backup-schedule.png' },
  { title: '3.3 Phân tích usage', cap: 'Chọn khung giờ ít user cho sync backup', file: '06-usage-analytics.png' },
  { title: '3.4 Lịch sử đồng bộ', cap: 'Theo dõi từng lần chạy Primary → Backup', file: '07-sync-history.png' },
  { title: '3.5 Báo cáo org — filter & export', cap: 'Toggle Tách đơn hàng, Xuất PDF/Excel', file: '02-org-overview-report.png' },
  { title: '3.6 Báo cáo org — biểu đồ KPI', cap: 'Drill-down công ty / khu vực / NV', file: '09-org-overview-charts.png' },
  { title: '3.7 CRM Dashboard — tab Đơn hàng', cap: 'Leads / Deals / Đơn hàng', file: '03-crm-dashboard.png' },
  { title: '3.8 Dashboard Sản xuất', cap: 'KPI công nợ / đã thu VND, Kanban xưởng', file: '08-sx-dashboard.png' },
  { title: '3.9 Drive CRM', cap: 'Lưu trữ file Deal/Dự án', file: '04-drive.png' },
];

const imgBlocks = sections.map((s) => `
<h3>${s.title}</h3>
<p class="caption">${s.cap}</p>
<img src="${img(s.file)}" alt="${s.title}"/>
`).join('\n');

const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8"/>
<title>Báo cáo Phan Nguyễn Đăng Khoa 22-29/06/2026</title>
<style>
  @page { margin: 16mm 14mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1e293b; }
  h1 { font-size: 19pt; color: #0f766e; border-bottom: 2px solid #0f766e; padding-bottom: 6px; }
  h2 { font-size: 13pt; color: #0f766e; margin-top: 20px; page-break-after: avoid; }
  h3 { font-size: 11pt; color: #334155; margin-top: 14px; page-break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 9.5pt; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; }
  th { background: #f1f5f9; }
  ul { margin: 6px 0; padding-left: 18px; }
  li { margin: 3px 0; }
  .meta td:first-child { font-weight: 600; width: 130px; background: #f8fafc; }
  img { max-width: 100%; border: 1px solid #e2e8f0; border-radius: 4px; margin: 6px 0 14px; page-break-inside: avoid; }
  .caption { font-size: 8.5pt; color: #64748b; margin: 0 0 6px; }
  .note { font-size: 8.5pt; color: #64748b; font-style: italic; }
  .day { font-weight: 600; color: #475569; margin-top: 10px; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }
</style>
</head>
<body>
<h1>Báo cáo công việc tuần 22–29/06/2026</h1>
<table class="meta">
<tr><td>Người thực hiện</td><td><strong>Phan Nguyễn Đăng Khoa</strong></td></tr>
<tr><td>Giai đoạn</td><td>22/06/2026 – 29/06/2026</td></tr>
<tr><td>Ngày lập báo cáo</td><td>29/06/2026</td></tr>
<tr><td>Số commit</td><td>~50</td></tr>
</table>

<h2>1. Tóm tắt</h2>
<ol>
<li><strong>Supabase backup / failover</strong> — giám sát, lịch sync 3 lần/ngày, replication Primary ↔ Backup.</li>
<li><strong>Báo cáo CRM org</strong> — analytics, biểu đồ, toggle Deal/Order, export Excel có style.</li>
<li><strong>Drive &amp; Messenger</strong> — upload song song, thư viện ảnh FB, Supabase Storage.</li>
<li><strong>Sản xuất</strong> — KPI Kanban, công nợ/đã thu VND, bộ lọc công ty đặt hàng.</li>
<li><strong>Hạ tầng</strong> — Redis, Socket.IO, tối ưu heartbeat backend.</li>
</ol>

<h2>2. Chi tiết theo ngày</h2>

<p class="day">22/06 — Drive, Messenger, SX</p>
<ul>
<li>Upload ảnh Drive song song + Facebook Attachment API; Drive image picker cho inbox FB.</li>
<li>KPI Kanban: tổng tiền cột, công nợ/đã thu VND; bộ lọc SX; mobile báo cáo SLA.</li>
</ul>

<p class="day">23/06 — Báo cáo org, Messenger Storage</p>
<ul>
<li>Mở rộng báo cáo org: quote/close analytics, pie chart NV, filter ngày, cancel rate.</li>
<li>File Messenger → Supabase Storage; auto tạo lead từ ghi âm; pipeline settings xóa lead/deal.</li>
</ul>

<p class="day">24/06 — Tối ưu backend</p>
<ul>
<li>Giảm tải heartbeat + SQL aggregates; sửa cleanup session logout.</li>
</ul>

<p class="day">25/06 — CRM Pipeline</p>
<ul>
<li>Tách tab Deal/KH; SX mobile messenger + bubble chat + OTA.</li>
</ul>

<p class="day">26/06 — Supabase Failover (triển khai)</p>
<ul>
<li>Failover, replication, failback, UI monitor; chuyển DB thủ công countdown 15s.</li>
<li>Lịch sync 05:00/12:30/18:00; phân tích usage; Redis/Socket.IO fix; Drive batch upload.</li>
</ul>

<p class="day">27/06 — Backup sync fixes</p>
<ul>
<li>PG Render, pooler auth, pg_restore, replication crm_leads/facebook_contacts.</li>
<li>Lịch sử sync + parallel waves; tab KH → Đơn hàng; Messenger upload fix.</li>
</ul>

<p class="day">29/06 — Báo cáo org</p>
<ul>
<li>Toggle Tách Deal/Order; filter kỳ báo cáo; export Excel NV có style.</li>
</ul>

<h2>3. Hình ảnh thực tế</h2>
<p class="note">Chụp 29/06/2026 — localhost:5173</p>
${imgBlocks}

<h2>4. Dữ liệu Supabase MCP</h2>
<table>
<tr><th>Bảng</th><th>Primary</th><th>Backup</th><th>Lệch</th></tr>
<tr><td>crm_leads</td><td>4.342</td><td>4.339</td><td>3</td></tr>
<tr><td>facebook_contacts</td><td>11.747</td><td>11.745</td><td>2</td></tr>
<tr><td>facebook_messages</td><td>73.003</td><td>72.924</td><td>79</td></tr>
<tr><td>users</td><td>112</td><td>112</td><td>0</td></tr>
<tr><td>drive_files</td><td>69</td><td>69</td><td>0</td></tr>
</table>

<p class="note">Báo cáo — Phan Nguyễn Đăng Khoa · git log + Browser MCP + Supabase MCP</p>
</body>
</html>`;

const htmlPath = path.join(dir, 'BAOCAO.html');
const pdfPath = path.join(dir, 'BAOCAO.pdf');
fs.writeFileSync(htmlPath, html, 'utf8');

const edgePaths = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const exe = edgePaths.find((p) => fs.existsSync(p));
if (!exe) throw new Error('Không tìm thấy Edge/Chrome');

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' } });
await browser.close();
console.log('PDF:', pdfPath);
