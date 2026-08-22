/**
 * Xuất docs/kien-truc-tong-the.html → docs/kien-truc-tong-the.pdf
 * Chạy: node scripts/export-architecture-pdf.js
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '../..');
const inputArg = process.argv[2];
const HTML = inputArg
  ? path.resolve(inputArg)
  : path.join(ROOT, 'docs', 'kien-truc-tong-the.html');
const PDF = HTML.replace(/\.html?$/i, '.pdf');

async function main() {
  if (!fs.existsSync(HTML)) {
    console.error('Không tìm thấy:', HTML);
    process.exit(1);
  }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(pathToFileURL(HTML).href, { waitUntil: 'networkidle', timeout: 120_000 });
  // Chờ Mermaid render xong
  await page.waitForFunction(() => {
    const nodes = document.querySelectorAll('.mermaid');
    if (!nodes.length) return false;
    return [...nodes].every((n) => n.querySelector('svg'));
  }, { timeout: 60_000 });
  await page.waitForTimeout(1500);

  await page.pdf({
    path: PDF,
    format: 'A4',
    printBackground: true,
    margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
  });

  await browser.close();
  console.log('Đã xuất PDF:', PDF);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
