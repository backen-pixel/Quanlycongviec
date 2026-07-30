import { useState } from 'react';
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, HelpCircle, Sparkles } from 'lucide-react';
import {
  FILL_FORM_FIELD_TYPES,
  FIELD_GROUP_META,
  createEmptyFormField,
  normalizeFormConfig,
  newFormFieldId,
  surveyFormPreset,
} from '../lib/taskFillForm';

function HelpTip({ text }) {
  if (!text) return null;
  return (
    <span className="relative inline-flex group/tip align-middle ml-0.5">
      <HelpCircle className="h-3 w-3 text-gray-400 hover:text-orange-600 cursor-help" />
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 z-50 w-56 rounded-md bg-gray-900 text-white text-[10px] leading-snug px-2 py-1.5 opacity-0 group-hover/tip:opacity-100 transition-opacity shadow-lg">
        {text}
      </span>
    </span>
  );
}

/**
 * Builder cấu hình form điền — dùng trong bộ mẫu nhiệm vụ CRM.
 */
export default function TaskFillFormBuilder({ value, onChange, compact = false }) {
  const config = normalizeFormConfig(value);
  const [expandedId, setExpandedId] = useState(null);

  const patch = (partial) => onChange({ ...config, ...partial });

  const updateField = (id, partial) => {
    patch({
      fields: config.fields.map((f) => (f.id === id ? { ...f, ...partial } : f)),
    });
  };

  const removeField = (id) => {
    patch({ fields: config.fields.filter((f) => f.id !== id) });
    if (expandedId === id) setExpandedId(null);
  };

  const addField = (type = 'text') => {
    const field = createEmptyFormField(type);
    patch({ fields: [...config.fields, field] });
    setExpandedId(field.id);
  };

  const applySurveyPreset = () => {
    if (config.fields.length > 0) {
      const ok = window.confirm(
        'Áp dụng mẫu «Phiếu khảo sát» sẽ thay toàn bộ trường hiện tại (Nhóm A bắt buộc + B nhập sau + C checklist/note). Tiếp tục?',
      );
      if (!ok) return;
    }
    const preset = surveyFormPreset();
    onChange(preset);
    setExpandedId(null);
  };

  const moveField = (idx, dir) => {
    const next = [...config.fields];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    patch({ fields: next });
  };

  const updateOption = (fieldId, optId, partial) => {
    const field = config.fields.find((f) => f.id === fieldId);
    if (!field) return;
    updateField(fieldId, {
      options: (field.options || []).map((o) => (o.id === optId ? { ...o, ...partial } : o)),
    });
  };

  const addOption = (fieldId, asOther = false) => {
    const field = config.fields.find((f) => f.id === fieldId);
    if (!field) return;
    updateField(fieldId, {
      options: [
        ...(field.options || []),
        {
          id: newFormFieldId(),
          label: asOther ? 'Khác' : `Lựa chọn ${(field.options?.length || 0) + 1}`,
          is_other: asOther,
        },
      ],
    });
  };

  const removeOption = (fieldId, optId) => {
    const field = config.fields.find((f) => f.id === fieldId);
    if (!field) return;
    updateField(fieldId, {
      options: (field.options || []).filter((o) => o.id !== optId),
    });
  };

  return (
    <div
      className={`rounded-lg border border-orange-200 bg-white relative z-10 ${compact ? 'p-2 space-y-2' : 'p-3 space-y-3'}`}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] font-bold uppercase tracking-wide text-orange-700">
          Cấu hình form điền
        </p>
        <button
          type="button"
          onClick={applySurveyPreset}
          className="h-7 px-2 rounded-md border border-violet-200 bg-violet-50 text-[10px] font-semibold text-violet-800 hover:bg-violet-100 cursor-pointer flex items-center gap-1"
          title="Preset Product: 7 bắt buộc + nhập sau + checklist lo lắng + survey note"
        >
          <Sparkles className="h-3 w-3" /> Mẫu khảo sát
        </button>
      </div>

      <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
        <label className="block">
          <span className="text-[10px] font-semibold text-gray-500">Nhãn nút trên nhiệm vụ</span>
          <input
            type="text"
            value={config.button_label}
            onChange={(e) => patch({ button_label: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            className="mt-0.5 w-full h-8 px-2 rounded border text-xs outline-none focus:ring-2 focus:ring-orange-400 bg-white"
            placeholder="Điền form"
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold text-gray-500">Tiêu đề popup</span>
          <input
            type="text"
            value={config.title}
            onChange={(e) => patch({ title: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            className="mt-0.5 w-full h-8 px-2 rounded border text-xs outline-none focus:ring-2 focus:ring-orange-400 bg-white"
            placeholder="Form thông tin"
            autoComplete="off"
          />
        </label>
      </div>

      <div className="space-y-1.5">
        {config.fields.length === 0 && (
          <p className="text-[11px] text-gray-500 italic py-2 text-center border border-dashed border-orange-200 rounded-md">
            Chưa có trường — bấm «Mẫu khảo sát» hoặc thêm loại nhập bên dưới
          </p>
        )}
        {config.fields.map((field, idx) => {
          const open = expandedId === field.id;
          const typeLabel = FILL_FORM_FIELD_TYPES.find((t) => t.value === field.type)?.label || field.type;
          const groupMeta = field.group ? FIELD_GROUP_META[field.group] : null;
          return (
            <div key={field.id} className="rounded-md border border-orange-100 bg-orange-50/40 overflow-hidden">
              <div className="flex items-center gap-1 px-2 py-1.5">
                <GripVertical className="h-3 w-3 text-gray-400 shrink-0" />
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : field.id)}
                  className="flex-1 min-w-0 text-left text-xs font-medium text-gray-800 truncate cursor-pointer flex items-center gap-1"
                >
                  <span className="truncate">
                    {field.type === 'button' ? (field.button_label || field.label) : field.label}
                  </span>
                  {field.required && field.type !== 'button' && (
                    <span className="text-[10px] text-red-500 shrink-0">*</span>
                  )}
                  <HelpTip text={field.help_text} />
                  <span className="ml-1 text-[10px] font-normal text-orange-600 shrink-0">({typeLabel})</span>
                  {groupMeta && (
                    <span className={`text-[9px] px-1 py-0.5 rounded border shrink-0 ${groupMeta.className}`}>
                      {field.group}
                    </span>
                  )}
                </button>
                <button type="button" onClick={() => moveField(idx, -1)} disabled={idx === 0}
                  className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer" title="Lên">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => moveField(idx, 1)} disabled={idx === config.fields.length - 1}
                  className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer" title="Xuống">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => removeField(field.id)}
                  className="p-0.5 text-gray-400 hover:text-red-600 cursor-pointer" title="Xóa trường">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {open && (
                <div className="px-2 pb-2 space-y-2 border-t border-orange-100 bg-white">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                    <label className="block">
                      <span className="text-[10px] text-gray-500">Loại</span>
                      <select
                        value={field.type}
                        onChange={(e) => {
                          const type = e.target.value;
                          const next = { type };
                          if (type === 'single_select' || type === 'multi_select' || type === 'checklist') {
                            next.options = field.options?.length
                              ? field.options
                              : createEmptyFormField(type).options;
                          }
                          if (type === 'dimensions') next.unit = field.unit || 'm';
                          if (type === 'file') {
                            next.multiple = !!field.multiple;
                            next.accept = field.accept || '';
                          }
                          if (type === 'button') {
                            next.button_label = field.button_label || 'Xóa form';
                            next.button_action = field.button_action || 'clear';
                            next.required = false;
                          }
                          updateField(field.id, next);
                        }}
                        className="mt-0.5 w-full h-8 px-2 rounded border text-xs bg-white"
                      >
                        {FILL_FORM_FIELD_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-gray-500">
                        {field.type === 'button' ? 'Nhãn nút' : 'Câu hỏi / nhãn'}
                      </span>
                      <input
                        value={field.type === 'button' ? (field.button_label || '') : field.label}
                        onChange={(e) => updateField(
                          field.id,
                          field.type === 'button'
                            ? { button_label: e.target.value, label: e.target.value }
                            : { label: e.target.value },
                        )}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="mt-0.5 w-full h-8 px-2 rounded border text-xs outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                      />
                    </label>
                  </div>

                  {field.type !== 'button' && (
                    <>
                      <label className="block">
                        <span className="text-[10px] text-gray-500 flex items-center gap-1">
                          Gợi ý (hiện khi hover ?)
                          <HelpCircle className="h-3 w-3 text-gray-400" />
                        </span>
                        <textarea
                          value={field.help_text || ''}
                          onChange={(e) => updateField(field.id, { help_text: e.target.value })}
                          onPointerDown={(e) => e.stopPropagation()}
                          rows={2}
                          className="mt-0.5 w-full px-2 py-1 rounded border text-xs outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-y"
                          placeholder="Giải thích ngắn cho NV khi điền…"
                        />
                      </label>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={!!field.required}
                            onChange={(e) => updateField(field.id, { required: e.target.checked })}
                            className="accent-orange-600"
                          />
                          Bắt buộc <span className="text-red-500">*</span>
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <span className="text-[10px] text-gray-500">Nhóm</span>
                          <select
                            value={field.group || ''}
                            onChange={(e) => updateField(field.id, { group: e.target.value || null })}
                            className="h-7 px-1.5 rounded border text-xs bg-white"
                          >
                            <option value="">—</option>
                            <option value="A">A — Bắt buộc</option>
                            <option value="B">B — Nhập sau</option>
                            <option value="C">C — Note/checklist</option>
                          </select>
                        </label>
                        {field.type === 'file' && (
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!field.multiple}
                              onChange={(e) => updateField(field.id, { multiple: e.target.checked })}
                              className="accent-orange-600"
                            />
                            Nhiều file
                          </label>
                        )}
                      </div>
                    </>
                  )}

                  {field.type !== 'button' && field.type !== 'file' && field.type !== 'single_select'
                    && field.type !== 'multi_select' && field.type !== 'checklist' && field.type !== 'appliance_list'
                    && field.type !== 'dimensions' && field.type !== 'date' && (
                    <label className="block">
                      <span className="text-[10px] text-gray-500">Placeholder</span>
                      <input
                        value={field.placeholder || ''}
                        onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="mt-0.5 w-full h-8 px-2 rounded border text-xs outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                      />
                    </label>
                  )}

                  {field.type === 'button' && (
                    <label className="block">
                      <span className="text-[10px] text-gray-500">Hành động</span>
                      <select
                        value={field.button_action || 'clear'}
                        onChange={(e) => updateField(field.id, { button_action: e.target.value })}
                        className="mt-0.5 w-full h-8 px-2 rounded border text-xs bg-white"
                      >
                        <option value="clear">Xóa dữ liệu form</option>
                        <option value="none">Chỉ hiển thị (không làm gì)</option>
                      </select>
                    </label>
                  )}

                  {(field.type === 'single_select' || field.type === 'multi_select' || field.type === 'checklist' || field.type === 'appliance_list') && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-gray-500">
                        {field.type === 'appliance_list' ? 'Loại thiết bị gợi ý' : 'Các lựa chọn'}
                      </span>
                      {(field.options || []).map((opt) => (
                        <div key={opt.id} className="flex items-center gap-1">
                          <input
                            value={opt.label}
                            onChange={(e) => updateOption(field.id, opt.id, { label: e.target.value })}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="flex-1 h-7 px-2 rounded border text-xs outline-none focus:ring-1 focus:ring-orange-400 bg-white"
                          />
                          {(field.type === 'checklist' || field.type === 'single_select' || field.type === 'appliance_list') && (
                            <label className="text-[9px] text-gray-500 flex items-center gap-0.5 shrink-0 cursor-pointer" title="Chọn Khác → hiện ô nhập text">
                              <input
                                type="checkbox"
                                checked={!!opt.is_other}
                                onChange={(e) => updateOption(field.id, opt.id, { is_other: e.target.checked })}
                                className="accent-orange-600"
                              />
                              Khác?
                            </label>
                          )}
                          <button type="button" onClick={() => removeOption(field.id, opt.id)}
                            className="p-1 text-gray-400 hover:text-red-600 cursor-pointer">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => addOption(field.id, false)}
                          className="text-[10px] text-orange-700 hover:underline cursor-pointer flex items-center gap-0.5">
                          <Plus className="h-3 w-3" /> Thêm lựa chọn
                        </button>
                        {(field.type === 'checklist' || field.type === 'single_select' || field.type === 'appliance_list') && !(field.options || []).some((o) => o.is_other) && (
                          <button type="button" onClick={() => addOption(field.id, true)}
                            className="text-[10px] text-violet-700 hover:underline cursor-pointer flex items-center gap-0.5">
                            <Plus className="h-3 w-3" /> Thêm «Khác»
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {FILL_FORM_FIELD_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => addField(t.value)}
            className="h-7 px-2 rounded-md border border-orange-200 bg-orange-50 text-[10px] font-medium text-orange-800 hover:bg-orange-100 cursor-pointer flex items-center gap-0.5"
          >
            <Plus className="h-3 w-3" /> {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
