/**
 * Danh mục loại file/ghi chú minh chứng khi hoàn thành nhiệm vụ.
 * Dùng chung CRM + Sản xuất (workshop_task_template_items, crm_tasks, crm_assignments).
 */

const EVIDENCE_FILE_TYPE_CATALOG = [
  { key: 'note', label: 'Ghi chú văn bản', icon: '📝', acceptsNote: true },
  {
    key: 'image',
    label: 'Hình ảnh',
    icon: '🖼️',
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif'],
    mimePrefixes: ['image/'],
  },
  {
    key: 'sketchup',
    label: 'SketchUp',
    icon: '📐',
    extensions: ['.skp', '.skb', '.skm'],
    mimePrefixes: ['application/vnd.sketchup', 'application/octet-stream'],
    nameHints: ['sketchup', 'skp'],
  },
  {
    key: 'autocad',
    label: 'AutoCAD',
    icon: '📏',
    extensions: ['.dwg', '.dxf', '.dwt'],
    mimePrefixes: ['application/acad', 'image/vnd.dwg', 'application/dxf'],
    nameHints: ['autocad', 'cad', 'dwg', 'dxf'],
  },
  {
    key: 'render',
    label: 'File render',
    icon: '🎨',
    extensions: ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.exr', '.hdr', '.psd'],
    mimePrefixes: ['image/'],
    docTypes: ['render'],
    nameHints: ['render', 'rend', 'visual', '3d'],
  },
  {
    key: 'document',
    label: 'Văn bản / PDF',
    icon: '📄',
    extensions: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'],
    mimePrefixes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.word', 'text/'],
  },
  {
    key: 'excel',
    label: 'Excel / Bảng tính',
    icon: '📊',
    extensions: ['.xls', '.xlsx', '.xlsm', '.csv'],
    mimePrefixes: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheet', 'text/csv'],
  },
  {
    key: 'video',
    label: 'Video',
    icon: '🎬',
    extensions: ['.mp4', '.mov', '.avi', '.webm', '.mkv'],
    mimePrefixes: ['video/'],
  },
  {
    key: 'archive',
    label: 'File nén',
    icon: '📦',
    extensions: ['.zip', '.rar', '.7z'],
    mimePrefixes: ['application/zip', 'application/x-rar', 'application/x-7z'],
  },
  {
    key: 'other',
    label: 'File khác',
    icon: '📎',
    extensions: [],
    mimePrefixes: [],
    matchAnyFile: true,
  },
];

const CATALOG_BY_KEY = Object.fromEntries(EVIDENCE_FILE_TYPE_CATALOG.map((t) => [t.key, t]));
const VALID_KEYS = new Set(EVIDENCE_FILE_TYPE_CATALOG.map((t) => t.key));

function normalizeEvidenceFileTypes(raw) {
  if (!raw) return [];
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map((x) => String(x || '').trim().toLowerCase()).filter((k) => VALID_KEYS.has(k)))];
}

function fileExt(name) {
  const n = String(name || '').toLowerCase();
  const i = n.lastIndexOf('.');
  return i >= 0 ? n.slice(i) : '';
}

function nameMatchesHints(fileName, hints) {
  if (!hints?.length) return false;
  const n = String(fileName || '').toLowerCase();
  return hints.some((h) => n.includes(String(h).toLowerCase()));
}

function attachmentMatchesType(typeKey, { file_name, file_url, mime_type, doc_type, notes }) {
  const spec = CATALOG_BY_KEY[typeKey];
  if (!spec) return false;

  if (spec.acceptsNote) {
    if (notes != null && String(notes).trim() !== '') return true;
    return false;
  }

  const hasFile = !!(file_url && String(file_url).trim());
  if (!hasFile) return false;

  if (spec.matchAnyFile) return true;

  const ext = fileExt(file_name || file_url);
  if (spec.extensions?.length && spec.extensions.includes(ext)) return true;

  const mime = String(mime_type || '').toLowerCase();
  if (spec.mimePrefixes?.length && spec.mimePrefixes.some((p) => mime.startsWith(p))) {
    if (typeKey === 'render' || typeKey === 'sketchup' || typeKey === 'autocad') {
      if (spec.docTypes?.includes(doc_type)) return true;
      if (nameMatchesHints(file_name || file_url, spec.nameHints)) return true;
      if (typeKey === 'image') return true;
      if (typeKey === 'render' && mime.startsWith('image/')) return nameMatchesHints(file_name, spec.nameHints) || /\.(tif|tiff|exr|hdr|psd)$/i.test(file_name || '');
      return typeKey === 'image';
    }
    return true;
  }

  if (spec.docTypes?.length && spec.docTypes.includes(doc_type)) return true;
  if (nameMatchesHints(file_name || file_url, spec.nameHints)) return true;

  return false;
}

function taskNotesSatisfyNoteType(taskNotes) {
  return taskNotes != null && String(taskNotes).trim() !== '';
}

/**
 * @returns {{ ok: boolean, missing: string[], satisfied: string[] }}
 */
function evaluateRequiredEvidenceTypes(requiredTypes, { taskNotes, attachments }) {
  const required = normalizeEvidenceFileTypes(requiredTypes);
  if (!required.length) return { ok: true, missing: [], satisfied: [] };

  const satisfied = [];
  const missing = [];

  for (const typeKey of required) {
    if (typeKey === 'note') {
      const okNote = taskNotesSatisfyNoteType(taskNotes)
        || (attachments || []).some((a) => a.notes != null && String(a.notes).trim() !== '');
      if (okNote) satisfied.push(typeKey);
      else missing.push(typeKey);
      continue;
    }
    const okFile = (attachments || []).some((a) => attachmentMatchesType(typeKey, a));
    if (okFile) satisfied.push(typeKey);
    else missing.push(typeKey);
  }

  return { ok: missing.length === 0, missing, satisfied };
}

function formatMissingEvidenceTypesLabel(missingKeys) {
  const labels = (missingKeys || [])
    .map((k) => CATALOG_BY_KEY[k]?.label || k)
    .filter(Boolean);
  return labels.join(', ');
}

function taskRequiresTypedEvidence(prior) {
  const types = normalizeEvidenceFileTypes(prior?.required_evidence_file_types);
  if (types.length) return true;
  return !!prior?.completion_requires_file_or_note;
}

module.exports = {
  EVIDENCE_FILE_TYPE_CATALOG,
  VALID_EVIDENCE_FILE_TYPE_KEYS: [...VALID_KEYS],
  normalizeEvidenceFileTypes,
  evaluateRequiredEvidenceTypes,
  formatMissingEvidenceTypesLabel,
  taskRequiresTypedEvidence,
  attachmentMatchesType,
};
