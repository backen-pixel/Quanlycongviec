import { ExternalLink, FileSpreadsheet } from 'lucide-react';
import api from '../lib/api';

/** Upload file Excel báo giá lên storage — trả về metadata để lưu trên quotation. */
export async function uploadQuotationSourceExcel(file, entityId) {
  if (!file) return null;
  const formData = new FormData();
  formData.append('files', file);
  formData.append('entity_type', 'quotation_excel');
  if (entityId) formData.append('entity_id', String(entityId));
  const { data } = await api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const up = (data?.files || [])[0];
  if (!up?.file_url) return null;
  return {
    file_url: up.file_url,
    file_name: up.file_name || up.original_name || file.name,
    file_size: up.file_size,
    mime_type: up.mime_type || file.type,
  };
}

/** Nút / link mở file Excel gốc đã upload. */
export default function QuotationSourceExcelLink({
  fileUrl,
  fileName,
  compact,
  className = '',
}) {
  if (!fileUrl) return null;
  const label = fileName || 'File Excel báo giá';
  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={`Mở ${label}`}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors ${
        compact ? 'text-[11px] px-2 py-1 font-medium' : 'text-xs px-3 py-1.5 font-semibold'
      } ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <FileSpreadsheet className={compact ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'} />
      <span className="truncate max-w-[14rem]">{compact ? 'Mở file Excel' : `Mở file: ${label}`}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
    </a>
  );
}
