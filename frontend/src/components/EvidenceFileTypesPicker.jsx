import { EVIDENCE_FILE_TYPE_CATALOG } from '../lib/evidenceFileTypes';

/**
 * Chọn loại file/ghi chú bắt buộc khi hoàn thành nhiệm vụ.
 */
export default function EvidenceFileTypesPicker({
  value = [],
  onChange,
  disabled = false,
  compact = false,
}) {
  const selected = new Set((value || []).map((k) => String(k)));

  const toggle = (key) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next]);
  };

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      <p className={`text-gray-600 ${compact ? 'text-[10px]' : 'text-xs'}`}>
        Chọn loại minh chứng bắt buộc (cần đủ <strong>tất cả</strong> loại đã chọn):
      </p>
      <div className="flex flex-wrap gap-1.5">
        {EVIDENCE_FILE_TYPE_CATALOG.map((t) => {
          const on = selected.has(t.key);
          return (
            <button
              key={t.key}
              type="button"
              disabled={disabled}
              onClick={() => toggle(t.key)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                on
                  ? 'bg-violet-100 border-violet-400 text-violet-900 font-medium'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-violet-300 hover:bg-violet-50'
              }`}
              title={t.label}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
      {selected.size > 0 && (
        <p className="text-[10px] text-violet-700">
          Đã chọn {selected.size} loại — NV phải nộp đủ trước khi hoàn thành / chuyển pipeline.
        </p>
      )}
    </div>
  );
}
