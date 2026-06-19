import {
  FileText,
  FileSpreadsheet,
  FileImage,
  Film,
  MessageSquare,
  Paperclip,
  Presentation,
  FileType,
} from 'lucide-react';

function fileExt(name) {
  const base = String(name || '').split('?')[0].split('/').pop() || '';
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i + 1).toLowerCase() : '';
}

/** Suy ra doc_type khi upload — hỗ trợ icon & lọc file. */
export function inferAttachmentDocType({ mime_type: mime = '', file_name: name = '', original_name: orig = '' } = {}) {
  const fileName = name || orig || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (/\.(dwg|dxf)$/i.test(fileName)) return 'drawing';
  if (/\.pdf$/i.test(fileName) || mime === 'application/pdf') return 'pdf';
  if (/\.(doc|docx|rtf|odt)$/i.test(fileName) || mime.includes('word') || mime.includes('msword')) return 'document';
  if (/\.(xls|xlsx|csv|ods)$/i.test(fileName) || mime.includes('spreadsheet') || mime.includes('excel')) return 'spreadsheet';
  if (/\.(ppt|pptx|odp)$/i.test(fileName) || mime.includes('presentation') || mime.includes('powerpoint')) return 'presentation';
  return 'other';
}

const DOC_TYPE_ICON = {
  image: { Icon: FileImage, iconClassName: 'text-violet-500' },
  video: { Icon: Film, iconClassName: 'text-purple-600' },
  drawing: { Icon: FileText, iconClassName: 'text-slate-600' },
  pdf: { Icon: FileType, iconClassName: 'text-red-600' },
  document: { Icon: FileText, iconClassName: 'text-blue-600' },
  spreadsheet: { Icon: FileSpreadsheet, iconClassName: 'text-emerald-600' },
  presentation: { Icon: Presentation, iconClassName: 'text-orange-600' },
  task_note: { Icon: MessageSquare, iconClassName: 'text-amber-600' },
  checklist_inline_note: { Icon: MessageSquare, iconClassName: 'text-amber-600' },
  other: { Icon: Paperclip, iconClassName: 'text-gray-400' },
};

/** Icon + màu theo loại file (pdf, word, excel, ảnh, …). */
export function resolveAttachmentFileIcon(att) {
  if (!att) return DOC_TYPE_ICON.other;

  const docType = att.doc_type;
  if (docType && DOC_TYPE_ICON[docType]) return DOC_TYPE_ICON[docType];

  const mime = att.mime_type || '';
  const ext = fileExt(att.file_name || att.name || att.file_url);

  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic'].includes(ext)) {
    return DOC_TYPE_ICON.image;
  }
  if (mime.startsWith('video/') || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) {
    return DOC_TYPE_ICON.video;
  }
  if (ext === 'pdf' || mime === 'application/pdf') return DOC_TYPE_ICON.pdf;
  if (['doc', 'docx', 'rtf', 'odt'].includes(ext) || mime.includes('word') || mime.includes('msword')) {
    return DOC_TYPE_ICON.document;
  }
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel')) {
    return DOC_TYPE_ICON.spreadsheet;
  }
  if (['ppt', 'pptx', 'odp'].includes(ext) || mime.includes('presentation') || mime.includes('powerpoint')) {
    return DOC_TYPE_ICON.presentation;
  }
  if (['dwg', 'dxf'].includes(ext)) return DOC_TYPE_ICON.drawing;

  return DOC_TYPE_ICON.other;
}

export function AttachmentFileIcon({ att, className = 'h-3.5 w-3.5 shrink-0' }) {
  const { Icon, iconClassName } = resolveAttachmentFileIcon(att);
  return <Icon className={`${className} ${iconClassName}`} aria-hidden />;
}
