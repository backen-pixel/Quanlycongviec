import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ExternalLink, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { fetchUploadArrayBuffer, getFileDownloadAnchorProps, publicFileUrl } from '../lib/publicFileUrl';
import {
  getOfficeOnlineEmbedUrl,
  resolveFilePreviewMode,
} from '../lib/filePreview';

function portal(node) {
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}

async function loadExcelPreviewHtml(pathOrUrl) {
  const buf = await fetchUploadArrayBuffer(pathOrUrl);
  const wb = XLSX.read(buf, { type: 'array' });
  if (!wb.SheetNames.length) return '<p class="text-sm text-gray-500 p-4">File Excel trống.</p>';
  return wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name];
    const table = XLSX.utils.sheet_to_html(sheet, { id: `preview-sheet-${name}` });
    const title = wb.SheetNames.length > 1
      ? `<p class="text-xs font-semibold text-gray-600 mb-2 sticky top-0 bg-white py-1">${name}</p>`
      : '';
    return `<div class="mb-6 last:mb-0">${title}${table}</div>`;
  }).join('');
}

export default function FilePreviewSidePanel({ item, onClose }) {
  const { url, fileName, title } = item || {};
  const displayTitle = title || fileName || 'Xem file';
  const mode = useMemo(
    () => resolveFilePreviewMode({ mimeType: item?.mimeType, fileName, fileUrl: url }),
    [item?.mimeType, fileName, url],
  );
  const publicUrl = url ? publicFileUrl(url) : '';
  const officeEmbedUrl = mode === 'office' ? getOfficeOnlineEmbedUrl(url) : null;
  const downloadProps = url ? getFileDownloadAnchorProps(url, { fileName: fileName || displayTitle }) : null;
  const openTabProps = publicUrl ? { href: publicUrl, target: '_blank', rel: 'noopener noreferrer' } : null;

  const [loading, setLoading] = useState(true);
  const [excelHtml, setExcelHtml] = useState('');
  const [pdfBlobUrl, setPdfBlobUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!url || !mode) return undefined;
    let cancelled = false;
    let blobUrl = '';
    setLoading(true);
    setError('');
    setExcelHtml('');
    setPdfBlobUrl('');

    const fail = (e) => {
      if (cancelled) return;
      const msg = e?.message || 'Không đọc được file';
      setError(msg);
      setLoading(false);
    };

    if (mode === 'excel') {
      loadExcelPreviewHtml(url)
        .then((html) => { if (!cancelled) setExcelHtml(html); })
        .catch(fail)
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }

    if (mode === 'pdf') {
      fetchUploadArrayBuffer(url)
        .then((buf) => {
          if (cancelled) return;
          blobUrl = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
          setPdfBlobUrl(blobUrl);
          setLoading(false);
        })
        .catch(fail);
      return () => {
        cancelled = true;
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      };
    }

    if (mode === 'office') {
      if (!officeEmbedUrl) {
        setError('Word/PPT cần URL HTTPS công khai (production). Dùng «Tab mới» hoặc «Tải».');
        setLoading(false);
      }
      return undefined;
    }

    setLoading(false);
    return undefined;
  }, [url, mode, officeEmbedUrl]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => () => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
  }, [pdfBlobUrl]);

  const onIframeLoad = useCallback(() => setLoading(false), []);

  if (!item?.url) return null;

  return portal(
    <>
      <button
        type="button"
        aria-label="Đóng xem file"
        className="fixed inset-0 z-[74] bg-black/20 cursor-default"
        onClick={onClose}
      />
      <aside
        className="fixed top-0 right-0 bottom-0 z-[75] w-[min(52vw,960px)] min-w-[360px] bg-white shadow-2xl border-l border-gray-200 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={displayTitle}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 truncate" title={displayTitle}>{displayTitle}</h2>
            <p className="text-[11px] text-gray-500">
              {mode === 'excel' && 'Xem Excel trong tab bên cạnh'}
              {mode === 'pdf' && 'Xem PDF trong tab bên cạnh'}
              {mode === 'office' && 'Xem Word/PPT trong tab bên cạnh'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {openTabProps && (
              <a
                {...openTabProps}
                className="h-8 px-2.5 rounded-lg border border-gray-200 hover:bg-white text-xs font-medium text-gray-700 flex items-center gap-1"
                title="Mở tab trình duyệt mới"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Tab mới
              </a>
            )}
            {downloadProps && (
              <a
                {...downloadProps}
                className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1"
              >
                <Download className="h-3.5 w-3.5" /> Tải
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-600"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 relative bg-slate-100 overflow-hidden">
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-gray-500 bg-slate-100">
              <Loader2 className="h-7 w-7 animate-spin" />
              <span className="text-sm">Đang mở file...</span>
            </div>
          )}

          {error && !loading && (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-gray-600">{error}</p>
              {downloadProps && (
                <a {...downloadProps} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium">
                  Tải file về
                </a>
              )}
            </div>
          )}

          {!error && mode === 'pdf' && pdfBlobUrl && (
            <iframe
              src={pdfBlobUrl}
              title={displayTitle}
              className="w-full h-full border-0 bg-white"
              onLoad={onIframeLoad}
            />
          )}

          {!error && mode === 'office' && officeEmbedUrl && (
            <iframe
              src={officeEmbedUrl}
              title={displayTitle}
              className="w-full h-full border-0 bg-white"
              onLoad={onIframeLoad}
            />
          )}

          {!error && mode === 'excel' && excelHtml && (
            <div
              className="h-full overflow-auto p-4 bg-white file-preview-excel"
              dangerouslySetInnerHTML={{ __html: excelHtml }}
            />
          )}
        </div>
      </aside>
      <style>{`
        .file-preview-excel table { border-collapse: collapse; width: max-content; min-width: 100%; font-size: 12px; }
        .file-preview-excel td, .file-preview-excel th {
          border: 1px solid #e5e7eb; padding: 4px 8px; white-space: nowrap; background: #fff;
        }
        .file-preview-excel tr:nth-child(even) td { background: #f9fafb; }
      `}</style>
    </>,
  );
}
