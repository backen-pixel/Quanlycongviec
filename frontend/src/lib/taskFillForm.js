/** Helpers cấu hình / dữ liệu form điền trên nhiệm vụ CRM (bộ mẫu → task). */

export const FILL_FORM_FIELD_TYPES = [
  { value: 'text', label: 'Văn bản ngắn' },
  { value: 'textarea', label: 'Ghi chú / văn bản dài' },
  { value: 'number', label: 'Nhập giá trị (số)' },
  { value: 'date', label: 'Ngày' },
  { value: 'dimensions', label: 'Kích thước (DxRxC)' },
  { value: 'file', label: 'Upload file / ảnh' },
  { value: 'single_select', label: 'Chọn 1' },
  { value: 'multi_select', label: 'Chọn nhiều' },
  { value: 'checklist', label: 'Checklist (+ Khác)' },
  { value: 'button', label: 'Nút khác' },
];

/** Nhóm trường theo Product: bắt buộc / nhập sau / ghi chú. */
export const FIELD_GROUP_META = {
  A: { label: 'Bắt buộc', hint: 'Thiếu → ảnh hưởng bán / KS', className: 'bg-red-50 text-red-700 border-red-200' },
  B: { label: 'Nhập sau', hint: 'Không chặn lần đầu', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  C: { label: 'Checklist / note', hint: 'Cấu trúc hoặc ghi chú', className: 'bg-slate-50 text-slate-700 border-slate-200' },
};

export function newFormFieldId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultFormConfig() {
  return {
    button_label: 'Điền form',
    title: 'Form thông tin',
    fields: [],
  };
}

function opt(id, label, isOther = false) {
  return { id, label, is_other: !!isOther };
}

/** Loại tủ bếp — quyết định form kích thước. */
export const CABINET_TYPE_OPTIONS = [
  opt('I', 'Chữ I (thẳng)'),
  opt('L', 'Chữ L'),
  opt('II', 'Chữ II (song song)'),
  opt('C', 'Chữ C / U'),
  opt('island', 'Có đảo bếp'),
  opt('other', 'Khác', true),
];

/**
 * Schema ô kích thước theo loại tủ.
 * key = id lưu trong form_data; label = nhãn UI.
 */
export const CABINET_DIMENSION_SCHEMAS = {
  I: [
    { key: 'a', label: 'Dài tường' },
    { key: 'depth', label: 'Sâu tủ' },
    { key: 'height', label: 'Cao' },
  ],
  L: [
    { key: 'a', label: 'Cạnh A' },
    { key: 'b', label: 'Cạnh B' },
    { key: 'depth', label: 'Sâu tủ' },
    { key: 'height', label: 'Cao' },
  ],
  II: [
    { key: 'a', label: 'Dãy 1 (dài)' },
    { key: 'b', label: 'Dãy 2 (dài)' },
    { key: 'gap', label: 'Khoảng cách lối' },
    { key: 'depth', label: 'Sâu tủ' },
    { key: 'height', label: 'Cao' },
  ],
  C: [
    { key: 'a', label: 'Cạnh trái (A)' },
    { key: 'b', label: 'Cạnh giữa (B)' },
    { key: 'c', label: 'Cạnh phải (C)' },
    { key: 'depth', label: 'Sâu tủ' },
    { key: 'height', label: 'Cao' },
  ],
  island: [
    { key: 'a', label: 'Dài tường chính' },
    { key: 'island_l', label: 'Dài đảo' },
    { key: 'island_w', label: 'Rộng đảo' },
    { key: 'depth', label: 'Sâu tủ tường' },
    { key: 'height', label: 'Cao' },
  ],
  other: [
    { key: 'length', label: 'Dài' },
    { key: 'width', label: 'Rộng' },
    { key: 'height', label: 'Cao' },
  ],
};

/** Fallback DxRxC khi chưa chọn loại tủ / field thường. */
export const DEFAULT_DIMENSION_KEYS = [
  { key: 'length', label: 'Dài' },
  { key: 'width', label: 'Rộng' },
  { key: 'height', label: 'Cao' },
];

export function resolveCabinetTypeId(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'object') return String(raw.id || '').trim();
  return String(raw).trim();
}

/** Lấy danh sách ô nhập KT theo loại tủ (U → schema C). */
export function getDimensionSchemaForCabinet(cabinetTypeId) {
  const id = resolveCabinetTypeId(cabinetTypeId);
  if (!id) return DEFAULT_DIMENSION_KEYS;
  const normalized = id === 'U' || id === 'u' ? 'C' : id;
  return CABINET_DIMENSION_SCHEMAS[normalized] || DEFAULT_DIMENSION_KEYS;
}

export function isDimensionsEmpty(v, cabinetTypeId = '') {
  if (v == null || typeof v !== 'object') return true;
  const keys = getDimensionSchemaForCabinet(cabinetTypeId || v.layout || '').map((d) => d.key);
  return !keys.some((k) => v[k] !== '' && v[k] != null);
}

/**
 * Preset gọn: ít trường, đủ quyết định.
 * A = bắt buộc (*) | B = nhập sau | C = checklist + note.
 */
export function surveyFormPreset() {
  return {
    button_label: 'Phiếu khảo sát',
    title: 'Phiếu khảo sát',
    fields: [
      // A — bắt buộc
      {
        id: 'survey_address',
        type: 'text',
        label: 'Địa chỉ công trình',
        required: true,
        group: 'A',
        help_text: 'Liên kết lead + sự kiện KS. Lưu sẽ cập nhật địa chỉ lead.',
        placeholder: 'Số nhà, đường, phường, quận…',
      },
      {
        id: 'survey_date',
        type: 'date',
        label: 'Ngày khảo sát',
        required: true,
        group: 'A',
        help_text: 'Liên kết sự kiện KS (site_visit).',
      },
      {
        id: 'surveyor',
        type: 'text',
        label: 'Người khảo sát',
        required: true,
        group: 'A',
        help_text: 'Prefill từ NV được giao sự kiện KS.',
        placeholder: 'Họ tên NV',
      },
      {
        id: 'project_type',
        type: 'single_select',
        label: 'Loại công trình',
        required: true,
        group: 'A',
        help_text: 'Chọn 1 — ảnh hưởng giải pháp.',
        options: [
          opt('apartment', 'Chung cư'),
          opt('townhouse', 'Nhà phố'),
          opt('villa', 'Biệt thự'),
          opt('other', 'Khác', true),
        ],
      },
      {
        id: 'cabinet_type',
        type: 'single_select',
        label: 'Loại tủ',
        required: true,
        group: 'A',
        help_text: 'I / L / II / C — quyết định ô kích thước bên dưới.',
        options: CABINET_TYPE_OPTIONS,
      },
      {
        id: 'site_photos',
        type: 'file',
        label: 'Ảnh hiện trạng',
        required: true,
        group: 'A',
        multiple: true,
        accept: 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.mp4,.mov,.webm,.zip',
        help_text: 'Ảnh / video / file. Đã up hiện dưới nút.',
      },
      {
        id: 'customer_need',
        type: 'textarea',
        label: 'Nhu cầu khách',
        required: true,
        group: 'A',
        help_text: 'Viết ngắn, cụ thể (nhiều tủ trên, tránh cột…).',
        placeholder: 'VD: Nhiều tủ trên, tránh cột giữa',
      },

      // B — nhập sau
      {
        id: 'budget',
        type: 'number',
        label: 'Ngân sách (triệu)',
        required: false,
        group: 'B',
        help_text: 'Nhập số triệu — format 1.250; dưới ô hiện tương đương VND. Prefill từ lead.',
        placeholder: '80',
      },
      {
        id: 'rough_size',
        type: 'dimensions',
        label: 'Kích thước (m)',
        required: false,
        group: 'B',
        help_text: 'Ô nhập đổi theo loại tủ (I/L/II/C/đảo).',
        unit: 'm',
        by_cabinet_type: true,
        layout_field_id: 'cabinet_type',
      },

      // C — cấu trúc / note
      {
        id: 'customer_concerns',
        type: 'checklist',
        label: 'Khách lo',
        required: false,
        group: 'C',
        help_text: 'Tick. Chọn «Khác» mới hiện ô nhập.',
        options: [
          opt('price', 'Giá'),
          opt('timeline', 'Tiến độ'),
          opt('durability', 'Độ bền'),
          opt('color', 'Màu'),
          opt('function', 'Công năng'),
          opt('warranty', 'Bảo hành'),
          opt('other', 'Khác', true),
        ],
      },
      {
        id: 'survey_note',
        type: 'textarea',
        label: 'Ghi chú',
        required: false,
        group: 'C',
        help_text: 'Đề xuất tự do — là note, không phải field dữ liệu.',
        placeholder: 'VD: Nên màu sáng, tránh cột giữa…',
      },
    ],
  };
}

export function normalizeFormConfig(raw) {
  const base = defaultFormConfig();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const fields = Array.isArray(raw.fields)
    ? raw.fields.map((f, idx) => normalizeFormField(f, idx)).filter(Boolean)
    : [];
  return {
    button_label: raw.button_label != null ? String(raw.button_label) : base.button_label,
    title: raw.title != null ? String(raw.title) : base.title,
    fields,
  };
}

function normalizeFormField(f, idx) {
  if (!f || typeof f !== 'object') return null;
  const type = FILL_FORM_FIELD_TYPES.some((t) => t.value === f.type) ? f.type : 'text';
  const id = String(f.id || '').trim() || newFormFieldId();
  const label = String(f.label || '').trim() || `Trường ${idx + 1}`;
  const field = {
    id,
    type,
    label,
    required: !!f.required,
    placeholder: String(f.placeholder || '').trim(),
    help_text: String(f.help_text || '').trim(),
    group: ['A', 'B', 'C'].includes(f.group) ? f.group : null,
  };
  if (type === 'single_select' || type === 'multi_select' || type === 'checklist') {
    const opts = Array.isArray(f.options) ? f.options : [];
    field.options = opts.map((o, i) => {
      if (typeof o === 'string') return { id: `opt_${i}`, label: o, is_other: false };
      return {
        id: String(o?.id || `opt_${i}`),
        label: String(o?.label || o?.value || `Lựa chọn ${i + 1}`).trim() || `Lựa chọn ${i + 1}`,
        is_other: !!o?.is_other || /^(khác|other)$/i.test(String(o?.label || '')),
      };
    });
  }
  if (type === 'file') {
    field.multiple = !!f.multiple;
    field.accept = String(f.accept || '').trim();
  }
  if (type === 'dimensions') {
    field.unit = String(f.unit || 'm').trim() || 'm';
    field.by_cabinet_type = !!f.by_cabinet_type;
    field.layout_field_id = String(f.layout_field_id || 'cabinet_type').trim() || 'cabinet_type';
  }
  if (type === 'button') {
    field.button_label = String(f.button_label || f.label || 'Nút').trim() || 'Nút';
    field.button_action = ['clear', 'none'].includes(f.button_action) ? f.button_action : 'clear';
  }
  return field;
}

export function normalizeFormData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { submitted_at: null, submitted_by: null, values: {}, linked_event_id: null, linked_assignee_id: null };
  }
  return {
    submitted_at: raw.submitted_at || null,
    submitted_by: raw.submitted_by || null,
    values: raw.values && typeof raw.values === 'object' && !Array.isArray(raw.values) ? raw.values : {},
    linked_event_id: raw.linked_event_id || null,
    linked_assignee_id: raw.linked_assignee_id || null,
  };
}

/** Có dữ liệu form đã điền (đã submit hoặc còn values). */
export function hasFilledFormData(raw) {
  const d = normalizeFormData(raw);
  if (d.submitted_at) return true;
  return Object.keys(d.values || {}).some((k) => {
    const v = d.values[k];
    if (v == null || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') {
      if (v.file_url || v.file_name) return true;
      if (Array.isArray(v.ids) && v.ids.length) return true;
      if (v.id) return true;
      if (v.length || v.width || v.height || v.a || v.b || v.c) return true;
      return Object.keys(v).length > 0;
    }
    return true;
  });
}

function optionLabel(field, id) {
  const opt = (field.options || []).find((o) => String(o.id) === String(id));
  return opt?.label || String(id || '');
}

/** Chuỗi hiển thị 1 giá trị field (không phải file). */
export function formatFormFieldDisplay(field, value) {
  if (value == null || value === '') return '';
  if (!field) return String(value);
  if (field.type === 'file') return '';
  if (field.type === 'single_select') {
    if (typeof value === 'object') {
      const base = optionLabel(field, value.id);
      return value.other ? `${base}: ${value.other}` : base;
    }
    return optionLabel(field, value);
  }
  if (field.type === 'multi_select') {
    const ids = Array.isArray(value) ? value : [];
    return ids.map((id) => optionLabel(field, id)).filter(Boolean).join(', ');
  }
  if (field.type === 'checklist') {
    const ids = Array.isArray(value?.ids) ? value.ids : (Array.isArray(value) ? value : []);
    const labels = ids.map((id) => optionLabel(field, id)).filter(Boolean);
    if (value?.other) labels.push(`Khác: ${value.other}`);
    return labels.join(', ');
  }
  if (field.type === 'dimensions' && typeof value === 'object') {
    const unit = value.unit || field.unit || 'm';
    const parts = [];
    const schema = getDimensionSchemaForCabinet(value.layout || '');
    for (const d of schema) {
      if (value[d.key] !== '' && value[d.key] != null) parts.push(`${d.label} ${value[d.key]}${unit}`);
    }
    if (!parts.length && (value.length || value.width || value.height)) {
      if (value.length) parts.push(`Dài ${value.length}${unit}`);
      if (value.width) parts.push(`Rộng ${value.width}${unit}`);
      if (value.height) parts.push(`Cao ${value.height}${unit}`);
    }
    const layout = value.layout ? ` [${value.layout}]` : '';
    return parts.length ? `${parts.join(' · ')}${layout}` : '';
  }
  if (field.id === 'budget') {
    return formatBudgetFormDisplay(value);
  }
  return String(value);
}

/** Tóm tắt câu trả lời (bỏ file) để hiện trên dòng NV. */
export function summarizeFormAnswers(config, values, { max = 6 } = {}) {
  const cfg = normalizeFormConfig(config);
  const vals = values || {};
  const rows = [];
  for (const field of cfg.fields) {
    if (field.type === 'file' || field.type === 'button') continue;
    if (field.id === 'next_action') continue;
    const text = formatFormFieldDisplay(field, vals[field.id]);
    if (!text) continue;
    rows.push({ id: field.id, label: field.label, text });
    if (rows.length >= max) break;
  }
  return rows;
}

/** Gom file từ các field type=file trong form_data. */
export function collectFormFileItems(config, values) {
  const cfg = normalizeFormConfig(config);
  const vals = values || {};
  const items = [];
  for (const field of cfg.fields) {
    if (field.type !== 'file') continue;
    const v = vals[field.id];
    const list = Array.isArray(v) ? v : (v ? [v] : []);
    list.forEach((file, idx) => {
      if (!file?.file_url && !file?.file_name) return;
      items.push({
        ...file,
        field_id: field.id,
        field_label: field.label,
        _key: `${field.id}_${idx}_${file.file_url || file.file_name}`,
      });
    });
  }
  return items;
}

export function createEmptyFormField(type = 'text') {
  const field = {
    id: newFormFieldId(),
    type,
    label: FILL_FORM_FIELD_TYPES.find((t) => t.value === type)?.label || 'Trường mới',
    required: false,
    placeholder: '',
    help_text: '',
    group: null,
  };
  if (type === 'single_select' || type === 'multi_select' || type === 'checklist') {
    field.options = [
      { id: newFormFieldId(), label: 'Lựa chọn 1', is_other: false },
      { id: newFormFieldId(), label: 'Lựa chọn 2', is_other: false },
    ];
    if (type === 'checklist') {
      field.options.push({ id: newFormFieldId(), label: 'Khác', is_other: true });
    }
  }
  if (type === 'file') {
    field.multiple = false;
    field.accept = '';
  }
  if (type === 'dimensions') {
    field.unit = 'm';
  }
  if (type === 'button') {
    field.label = 'Nút khác';
    field.button_label = 'Xóa form';
    field.button_action = 'clear';
    field.required = false;
  }
  return field;
}

/** Chuẩn hoá khi lưu (trim nhãn rỗng → mặc định). */
export function sanitizeFormConfigForSave(raw) {
  const cfg = normalizeFormConfig(raw);
  return {
    ...cfg,
    button_label: cfg.button_label.trim() || defaultFormConfig().button_label,
    title: cfg.title.trim() || defaultFormConfig().title,
  };
}

function isEmptyValue(field, v) {
  if (v == null || v === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (field.type === 'file') {
    if (Array.isArray(v)) return v.every((x) => !(x?.file_url));
    return !(v?.file_url);
  }
  if (field.type === 'dimensions') {
    return isDimensionsEmpty(v, v?.layout);
  }
  if (field.type === 'checklist') {
    if (typeof v !== 'object') return true;
    return !(Array.isArray(v.ids) && v.ids.length);
  }
  if (field.type === 'single_select' && v && typeof v === 'object') {
    return !v.id;
  }
  return false;
}

/** Validate values trước khi lưu; trả về { ok, error, values }. */
export function validateFormValues(config, values) {
  const cfg = normalizeFormConfig(config);
  const next = { ...(values || {}) };
  for (const field of cfg.fields) {
    if (field.type === 'button') continue;
    const v = next[field.id];
    if (field.required && isEmptyValue(field, v)) {
      return { ok: false, error: `Vui lòng điền: ${field.label}`, values: next };
    }
    if (field.type === 'number' && v !== '' && v != null && Number.isNaN(Number(v))) {
      return { ok: false, error: `«${field.label}» phải là số`, values: next };
    }
    if (field.type === 'checklist' && v && typeof v === 'object') {
      const otherOpt = (field.options || []).find((o) => o.is_other);
      if (otherOpt && Array.isArray(v.ids) && v.ids.includes(otherOpt.id) && !String(v.other || '').trim()) {
        return { ok: false, error: `«${field.label}»: đã chọn Khác — vui lòng ghi rõ`, values: next };
      }
    }
    if (field.type === 'single_select') {
      const otherOpt = (field.options || []).find((o) => o.is_other);
      if (otherOpt) {
        const selectedId = v && typeof v === 'object' ? v.id : v;
        if (String(selectedId) === String(otherOpt.id) && !String(v?.other || '').trim()) {
          return { ok: false, error: `«${field.label}»: đã chọn Khác — vui lòng ghi rõ`, values: next };
        }
      }
    }
  }
  return { ok: true, values: next };
}

/** Nhóm fields theo A/B/C để render section. */
export function groupFormFields(fields) {
  const groups = { A: [], B: [], C: [], other: [] };
  for (const f of fields || []) {
    if (f.group === 'A') groups.A.push(f);
    else if (f.group === 'B') groups.B.push(f);
    else if (f.group === 'C') groups.C.push(f);
    else groups.other.push(f);
  }
  return groups;
}

/** Field ids liên kết lead + sự kiện khảo sát (site_visit). */
export const SURVEY_LINKED_FIELD_IDS = {
  address: 'survey_address',
  date: 'survey_date',
  surveyor: 'surveyor',
};

export function isoToDateInputValue(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

/** YYYY-MM-DD → ISO start (giữ giờ cũ nếu có, mặc định 08:00 VN). */
export function dateInputToEventIso(dateStr, existingIso = null) {
  if (!dateStr) return null;
  const day = String(dateStr).slice(0, 10);
  let hh = '08';
  let mm = '00';
  if (existingIso) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date(existingIso));
      hh = parts.find((p) => p.type === 'hour')?.value || '08';
      mm = parts.find((p) => p.type === 'minute')?.value || '00';
    } catch { /* keep default */ }
  }
  return `${day}T${hh}:${mm}:00+07:00`;
}

export function resolveLeadSiteAddress(lead) {
  if (!lead) return '';
  const customer = lead.customer && typeof lead.customer === 'object' && !Array.isArray(lead.customer)
    ? lead.customer
    : null;
  return (
    customer?.address
    || lead.customer?.address
    || lead.install_address
    || lead.customer_address
    || customer?.install_address
    || ''
  ).trim();
}

/** estimated_value (VND) → số triệu cho ô ngân sách. */
export function leadBudgetInMillions(lead) {
  const raw = Number(lead?.estimated_value);
  if (!Number.isFinite(raw) || raw <= 0) return '';
  if (raw >= 1000) return Math.round((raw / 1e6) * 100) / 100;
  return raw;
}

/**
 * Ô «Ngân sách (triệu)» → VND.
 * ≥ 10.000 coi như đã nhập VND (tránh nhân 1e6 nhầm); < 10.000 = số triệu.
 */
export function budgetFormValueToVnd(raw) {
  if (raw === '' || raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n >= 10000) return Math.round(n);
  return Math.round(n * 1e6);
}

/** Hiển thị ngân sách form (triệu hoặc VND đã nhập). */
export function formatBudgetFormDisplay(raw) {
  if (raw === '' || raw == null) return '';
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  if (n >= 10000) {
    return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n))}đ`;
  }
  const fmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n);
  return `${fmt} triệu`;
}

/** Địa chỉ ưu tiên: sự kiện KS → lead/customer. */
export function resolveSurveyAddress({ lead, event } = {}) {
  const fromEvent = String(event?.location || '').trim();
  if (fromEvent) return fromEvent;
  return resolveLeadSiteAddress(lead);
}

/** Chọn sự kiện khảo sát ưu tiên: upcoming/planned gần nhất, không thì mới nhất. */
export function pickSurveyEvent(events) {
  const list = (events || []).filter((e) => e && (
    e.event_type === 'site_visit'
    || e.event_type_ref?.slug === 'site_visit'
    || /khảo sát|khao sat/i.test(String(e.event_type_ref?.name || e.title || ''))
  ));
  if (!list.length) return null;
  const now = Date.now();
  const upcoming = list
    .filter((e) => e.start_time && new Date(e.start_time).getTime() >= now - 12 * 3600 * 1000)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  if (upcoming.length) return upcoming[0];
  return [...list].sort((a, b) => new Date(b.start_time || 0) - new Date(a.start_time || 0))[0];
}

/**
 * Prefill values trống từ lead + sự kiện khảo sát.
 * Không ghi đè giá trị đã lưu trong form_data (trừ khi forceLinked).
 */
export function buildSurveyPrefill({ lead, event, existingValues = {}, forceLinked = false } = {}) {
  const next = { ...existingValues };
  const ids = SURVEY_LINKED_FIELD_IDS;
  const addr = resolveSurveyAddress({ lead, event });
  if (forceLinked || !String(next[ids.address] || '').trim()) {
    if (addr) next[ids.address] = addr;
  }
  const dateVal = isoToDateInputValue(event?.start_time);
  if (forceLinked || !String(next[ids.date] || '').trim()) {
    if (dateVal) next[ids.date] = dateVal;
  }
  const surveyorName = (event?.assignee?.full_name || event?.creator?.full_name || '').trim();
  if (forceLinked || !String(next[ids.surveyor] || '').trim()) {
    if (surveyorName) next[ids.surveyor] = surveyorName;
  }
  const budget = leadBudgetInMillions(lead);
  if (!String(next.budget ?? '').trim() && budget !== '') {
    next.budget = budget;
  }
  return next;
}
