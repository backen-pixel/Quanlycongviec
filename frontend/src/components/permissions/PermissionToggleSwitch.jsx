/** Nút bật/tắt phân quyền — dùng chung trang /permissions */
export default function PermissionToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
  size = 'md',
  indeterminate = false,
}) {
  const w = size === 'sm' ? 'h-4 w-7' : 'h-5 w-9';
  const dot = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const onX = size === 'sm' ? 'translate-x-3.5' : 'translate-x-5';
  const bg = indeterminate ? 'bg-amber-500' : checked ? 'bg-green-600' : 'bg-gray-300';

  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      title={label}
      className={`relative inline-flex ${w} shrink-0 items-center rounded-full transition-colors ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${bg}`}
    >
      <span
        className={`inline-block ${dot} transform rounded-full bg-white transition-transform ${
          indeterminate ? 'translate-x-2' : checked ? onX : 'translate-x-0.5'
        }`}
      />
      <span className="sr-only">{label}</span>
    </button>
  );
}
