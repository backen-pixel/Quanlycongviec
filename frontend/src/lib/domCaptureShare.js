/**
 * Chụp DOM → PNG clipboard / PDF.
 * Dùng html2canvas-pro (hỗ trợ oklch/oklab của Tailwind v4).
 */
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

const COLOR_PROPS = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'fill',
  'stroke',
];

/** Ép màu computed (rgb) lên clone — tránh parser lỗi oklch/color-mix còn sót. */
function inlineComputedColors(sourceRoot, clonedRoot) {
  if (!sourceRoot || !clonedRoot) return;
  const srcNodes = [sourceRoot, ...sourceRoot.querySelectorAll('*')];
  const cloneNodes = [clonedRoot, ...clonedRoot.querySelectorAll('*')];
  const n = Math.min(srcNodes.length, cloneNodes.length);
  for (let i = 0; i < n; i += 1) {
    const src = srcNodes[i];
    const clone = cloneNodes[i];
    if (!src || !clone || src.nodeType !== 1 || clone.nodeType !== 1) continue;
    try {
      const cs = window.getComputedStyle(src);
      for (const prop of COLOR_PROPS) {
        const val = cs.getPropertyValue(prop);
        if (!val || val === 'rgba(0, 0, 0, 0)') continue;
        if (/oklch|oklab|color-mix/i.test(val)) continue;
        clone.style.setProperty(prop, val);
      }
    } catch {
      /* ignore node */
    }
  }
}

export async function captureElementCanvas(el, options = {}) {
  if (!el) throw new Error('Không có nội dung để xuất');
  const { onclone: userOnclone, ...rest } = options;
  return html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    scrollX: 0,
    scrollY: -window.scrollY,
    ...rest,
    onclone: (clonedDoc, clonedEl) => {
      try {
        inlineComputedColors(el, clonedEl);
        clonedDoc.querySelectorAll('[data-export-only]').forEach((node) => {
          node.style.display = 'block';
        });
        clonedDoc.querySelectorAll('[data-export-hide="1"]').forEach((node) => {
          node.style.display = 'none';
        });
      } catch {
        /* ignore */
      }
      if (typeof userOnclone === 'function') userOnclone(clonedDoc, clonedEl);
    },
  });
}

export async function captureElementPngBlob(el, options = {}) {
  const canvas = await captureElementCanvas(el, options);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh PNG'))),
      'image/png',
    );
  });
  return { canvas, blob };
}

export async function copyElementImageToClipboard(el, options = {}) {
  const { blob } = await captureElementPngBlob(el, options);
  if (!navigator.clipboard?.write || !window.ClipboardItem) {
    throw new Error('Trình duyệt không hỗ trợ copy ảnh vào clipboard');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  return blob;
}

export async function downloadElementPdf(el, filename = 'export.pdf', options = {}) {
  const { canvas } = await captureElementPngBlob(el, options);
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;
  const imgH = (canvas.height * usableW) / canvas.width;

  let heightLeft = imgH;
  let offsetY = 0;

  pdf.addImage(imgData, 'PNG', margin, margin + offsetY, usableW, imgH);
  heightLeft -= usableH;

  while (heightLeft > 0.5) {
    offsetY -= usableH;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', margin, margin + offsetY, usableW, imgH);
    heightLeft -= usableH;
  }

  const safeName = String(filename || 'export.pdf').replace(/[\\/:*?"<>|]+/g, '_');
  pdf.save(safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`);
}
