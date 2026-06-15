import JSZip from 'jszip';
import { publicFileUrl } from './publicFileUrl';

function sanitizePathSegment(name, fallback = 'Khac') {
  const s = String(name || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  return s || fallback;
}

function uniqueZipPath(usedPaths, basePath) {
  if (!usedPaths.has(basePath)) {
    usedPaths.add(basePath);
    return basePath;
  }
  const dot = basePath.lastIndexOf('.');
  const hasExt = dot > basePath.lastIndexOf('/');
  const stem = hasExt ? basePath.slice(0, dot) : basePath;
  const ext = hasExt ? basePath.slice(dot) : '';
  let i = 2;
  let candidate = `${stem} (${i})${ext}`;
  while (usedPaths.has(candidate)) {
    i += 1;
    candidate = `${stem} (${i})${ext}`;
  }
  usedPaths.add(candidate);
  return candidate;
}

function resolveFileRef(item) {
  return item?.file_url || item?.file_path || item?.url || '';
}

function resolveFileName(item, fallback = 'tep-dinh-kem') {
  const fromPath = String(item?.file_path || '').split('/').pop();
  const name = item?.file_name || fromPath || item?.name || fallback;
  return sanitizePathSegment(name, fallback);
}

async function fetchFileBlob(fileRef) {
  const fullUrl = publicFileUrl(fileRef);
  if (!fullUrl) return null;

  if (fullUrl.startsWith('data:')) {
    try {
      const res = await fetch(fullUrl);
      return await res.blob();
    } catch {
      return null;
    }
  }

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(fullUrl, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  return res.blob();
}

async function addItemToZip(zip, usedPaths, missingRows, folderPath, item, missingLabel) {
  const fileRef = resolveFileRef(item);
  const notes = String(item?.notes || '').trim();
  const displayName = resolveFileName(item);

  if (!fileRef) {
    if (notes) {
      const notePath = uniqueZipPath(usedPaths, `${folderPath}/${displayName}.txt`);
      zip.file(notePath, notes);
      return 1;
    }
    missingRows.push(`${missingLabel}: ${displayName} (thiếu URL file)`);
    return 0;
  }

  const blob = await fetchFileBlob(fileRef);
  if (!blob) {
    missingRows.push(`${missingLabel}: ${displayName} (không tải được từ URL)`);
    return 0;
  }

  const filePath = uniqueZipPath(usedPaths, `${folderPath}/${displayName}`);
  zip.file(filePath, blob);

  if (notes) {
    const notePath = uniqueZipPath(usedPaths, `${folderPath}/${displayName}_ghi_chu.txt`);
    zip.file(notePath, notes);
  }

  return 1;
}

export async function downloadWorkshopDocumentsZip({
  projectLabel,
  moduleLabel = 'SX',
  projectDocs = [],
  crmDocs = [],
  taskFiles = [],
  onProgress,
}) {
  const root = sanitizePathSegment(`${moduleLabel}_${projectLabel}`, 'DuAn_Xuong');
  const zip = new JSZip();
  const usedPaths = new Set();
  const missingRows = [];

  const total = (projectDocs?.length || 0) + (crmDocs?.length || 0) + (taskFiles?.length || 0);
  let done = 0;
  let added = 0;
  const tick = () => {
    done += 1;
    onProgress?.(done, total);
  };

  for (const doc of projectDocs || []) {
    added += await addItemToZip(
      zip,
      usedPaths,
      missingRows,
      `${root}/Tai-lieu-xuong`,
      doc,
      'Tai lieu xuong',
    );
    tick();
  }

  for (const doc of crmDocs || []) {
    added += await addItemToZip(
      zip,
      usedPaths,
      missingRows,
      `${root}/Tai-lieu-CRM-chia-se`,
      doc,
      'Tai lieu CRM',
    );
    tick();
  }

  for (const file of taskFiles || []) {
    const taskTitle = sanitizePathSegment(file?.task?.title || 'Khac', 'Khac');
    added += await addItemToZip(
      zip,
      usedPaths,
      missingRows,
      `${root}/File-dinh-kem-nhiem-vu/${taskTitle}`,
      file,
      'File nhiem vu',
    );
    tick();
  }

  if (missingRows.length) {
    zip.file(`${root}/BAO_CAO_FILE_LOI.txt`, missingRows.join('\n'));
  }

  if (added === 0) {
    throw new Error('Không có file hợp lệ để tải');
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${root}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { added, missing: missingRows.length, total };
}
