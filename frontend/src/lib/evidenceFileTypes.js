/** Danh mục loại file minh chứng — đồng bộ với backend/helpers/evidenceFileTypes.js */

export const EVIDENCE_FILE_TYPE_CATALOG = [
  { key: 'note', label: 'Ghi chú văn bản', icon: '📝' },
  { key: 'image', label: 'Hình ảnh', icon: '🖼️' },
  { key: 'sketchup', label: 'SketchUp (.skp)', icon: '📐' },
  { key: 'autocad', label: 'AutoCAD (.dwg/.dxf)', icon: '📏' },
  { key: 'render', label: 'File render', icon: '🎨' },
  { key: 'document', label: 'Văn bản / PDF', icon: '📄' },
  { key: 'excel', label: 'Excel / Bảng tính', icon: '📊' },
  { key: 'video', label: 'Video', icon: '🎬' },
  { key: 'archive', label: 'File nén (.zip)', icon: '📦' },
  { key: 'other', label: 'File khác', icon: '📎' },
];

const BY_KEY = Object.fromEntries(EVIDENCE_FILE_TYPE_CATALOG.map((t) => [t.key, t]));

export function normalizeEvidenceFileTypes(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : []);
  const valid = new Set(EVIDENCE_FILE_TYPE_CATALOG.map((t) => t.key));
  return [...new Set(arr.map((x) => String(x || '').trim().toLowerCase()).filter((k) => valid.has(k)))];
}

export function formatEvidenceTypesShort(types) {
  const keys = normalizeEvidenceFileTypes(types);
  if (!keys.length) return '';
  return keys.map((k) => `${BY_KEY[k]?.icon || ''} ${BY_KEY[k]?.label || k}`.trim()).join(' · ');
}

export function formatEvidenceTypesList(types) {
  const keys = normalizeEvidenceFileTypes(types);
  if (!keys.length) return 'Bất kỳ file hoặc ghi chú';
  return keys.map((k) => BY_KEY[k]?.label || k).join(', ');
}

/** Mục checklist có yêu cầu minh chứng theo loại file/ghi chú. */
export function checklistItemRequiresEvidence(item) {
  if (!item) return false;
  const types = normalizeEvidenceFileTypes(item.required_evidence_file_types);
  return types.length > 0 || !!item.completion_requires_file_or_note;
}
