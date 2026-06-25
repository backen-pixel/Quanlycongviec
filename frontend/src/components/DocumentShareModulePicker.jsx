import { SHARE_MODULE_OPTIONS } from '../lib/documentShareScope';

/**
 * Chọn khối được xem khi đã bật chia sẻ (SX / VC / Công việc dự án).
 */
export default function DocumentShareModulePicker({
  value = [],
  onChange,
  disabled = false,
  hint = 'Chọn khối cụ thể (vd. chỉ Sản xuất) — VC và Công việc dự án sẽ không thấy. Để trống = cả ba khối đều xem được.',
  className = '',
}) {
  const toggle = (id) => {
    if (disabled) return;
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  return (
    <div className={className}>
      <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Khối được xem</p>
      <div className="flex flex-wrap gap-1.5">
        {SHARE_MODULE_OPTIONS.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(m.id)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all disabled:opacity-50 ${
              value.includes(m.id)
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-[10px] text-gray-400 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}
