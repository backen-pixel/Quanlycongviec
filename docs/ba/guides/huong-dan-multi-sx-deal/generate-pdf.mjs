/**
 * Xuất PDF hướng dẫn deal nhiều công ty SX (có hình).
 * Chạy: node docs/huong-dan-multi-sx-deal/generate-pdf.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const srcHtml = path.join(__dirname, 'HUONG_DAN_MULTI_SX_DEAL.print.html');
const outPdf = path.join(__dirname, 'HUONG_DAN_MULTI_SX_DEAL.pdf');
const tmpHtml = path.join(__dirname, '_print-tmp.html');

const dirFile = `file:///${__dirname.replace(/\\/g, '/')}`;
let html = fs.readFileSync(srcHtml, 'utf8');
html = html.replace(
  /src="(imgs\/[^"]+\.png)"/g,
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
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
});
const page = await browser.newPage();
await page.goto(`file:///${tmpHtml.replace(/\\/g, '/')}`, {
  waitUntil: 'networkidle0',
  timeout: 120_000,
});
await page.evaluate(async () => {
  const imgs = [...document.images];
  await Promise.all(imgs.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  }));
});
const broken = await page.evaluate(() =>
  [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')),
);
if (broken.length) {
  console.warn('Broken images:', broken);
} else {
  console.log('All', await page.evaluate(() => document.images.length), 'images loaded');
}
await page.pdf({
  path: outPdf,
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', right: '12mm', bottom: '16mm', left: '12mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate:
    '<div style="width:100%;font-size:8px;color:#94a3b8;text-align:center;padding:0 12mm;"><span>TuBep Pro — Deal nhiều công ty SX</span> · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
});
await browser.close();
fs.unlinkSync(tmpHtml);

console.log('Wrote', outPdf);
