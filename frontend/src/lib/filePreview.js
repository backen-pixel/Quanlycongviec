import { publicFileUrl } from './publicFileUrl';

/** PDF — nhúng iframe trực tiếp. */
export function isPdfPreviewFile(mimeType = '', fileName = '') {
  const mime = String(mimeType || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();
  return mime.includes('pdf') || name.endsWith('.pdf');
}

/** Excel/CSV — render bằng thư viện xlsx trên client. */
export function isExcelPreviewFile(mimeType = '', fileName = '') {
  const mime = String(mimeType || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();
  return (
    mime.includes('spreadsheet')
    || mime.includes('excel')
    || mime === 'text/csv'
    || mime === 'application/csv'
    || /\.(xlsx?|csv)$/i.test(name)
  );
}

/** Word/PPT — Microsoft Office Online embed (URL public HTTPS). */
export function isOfficeEmbedPreviewFile(mimeType = '', fileName = '') {
  const mime = String(mimeType || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();
  return (
    mime.includes('word')
    || mime.includes('document')
    || mime.includes('presentation')
    || mime.includes('powerpoint')
    || mime.includes('msword')
    || mime.includes('officedocument')
    || /\.(docx?|pptx?|rtf)$/i.test(name)
  );
}

/** pdf | excel | office | null */
export function resolveFilePreviewMode({ mimeType = '', fileName = '', fileUrl = '' } = {}) {
  const label = fileName || fileUrl || '';
  if (isPdfPreviewFile(mimeType, label)) return 'pdf';
  if (isExcelPreviewFile(mimeType, label)) return 'excel';
  if (isOfficeEmbedPreviewFile(mimeType, label)) return 'office';
  return null;
}

export function canUseOfficeOnlineViewer(pathOrUrl) {
  const href = publicFileUrl(pathOrUrl);
  if (!href) return false;
  try {
    const u = new URL(href);
    if (u.protocol !== 'https:') return false;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return false;
    return true;
  } catch {
    return false;
  }
}

export function getOfficeOnlineEmbedUrl(pathOrUrl) {
  const href = publicFileUrl(pathOrUrl);
  if (!href || !canUseOfficeOnlineViewer(href)) return null;
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(href)}`;
}
