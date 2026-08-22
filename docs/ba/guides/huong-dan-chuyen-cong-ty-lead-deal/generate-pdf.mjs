/**
 * Xuất PDF hướng dẫn chuyển Lead/Deal sang công ty CRM khác.
 * Chạy: node docs/huong-dan-chuyen-cong-ty-lead-deal/generate-pdf.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const srcHtml = path.join(__dirname, 'HUONG_DAN_CHUYEN_CONG_TY_LEAD_DEAL.print.html');
const outPdf = path.join(__dirname, 'HUONG_DAN_CHUYEN_CONG_TY_LEAD_DEAL.pdf');
const tmpHtml = path.join(__dirname, '_print-tmp.html');

const dirFile = `file:///${__dirname.replace(/\\/g, '/')}`;
let html = fs.readFileSync(srcHtml, 'utf8');
html = html.replace(
  /src="(02[^"]+\.png)"/g,
  (_m, name) => `src="${dirFile}/${name}"`,
);
fs.writeFileSync(tmpHtml, html, 'utf8');

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
await page.goto(`file:///${tmpHtml.replace(/\\/g, '/')}`, {
  waitUntil: 'networkidle0',
  timeout: 120_000,
});
await page.pdf({
  path: outPdf,
  format: 'A4',
  printBackground: true,
  margin: { top: '16mm', right: '14mm', bottom: '18mm', left: '14mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate:
    '<div style="width:100%;font-size:8px;color:#94a3b8;text-align:center;padding:0 14mm;"><span>TuBep Pro — Chuyển Lead/Deal sang công ty CRM khác</span> · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
});
await browser.close();
fs.unlinkSync(tmpHtml);

const stat = fs.statSync(outPdf);
console.log(`PDF ready: ${outPdf} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
