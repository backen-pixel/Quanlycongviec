export function customFieldHasValue(field, value) {
  if (field?.field_type === 'boolean') return value === true || value === false;
  if (field?.field_type === 'number') return value !== '' && value != null && Number.isFinite(Number(value));
  return value != null && String(value).trim() !== '';
}

export default function CustomFieldInput({
  field,
  value,
  onValueChange,
  required = false,
  missing = false,
}) {
  const inputClass = `${field.field_type === 'textarea' ? 'min-h-24 py-2.5' : 'h-11'} w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 ${missing ? 'border-amber-300' : 'border-slate-200'}`;
  const label = (
    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
      {field.label} {required ? '*' : <span className="normal-case tracking-normal text-slate-400">· tuỳ chọn</span>}
    </span>
  );
  const help = field.help_text
    ? <span className="mt-1 block text-[10px] leading-4 text-slate-400">{field.help_text}</span>
    : null;

  if (field.field_type === 'textarea') {
    return (
      <label className="block sm:col-span-2">
        {label}
        <textarea
          rows={3}
          value={value ?? ''}
          onChange={(event) => onValueChange(event.target.value)}
          className={inputClass}
          placeholder={field.placeholder || `Nhập ${field.label.toLocaleLowerCase('vi-VN')}`}
          minLength={field.validation?.min_length}
          maxLength={field.validation?.max_length || 5000}
        />
        {help}
      </label>
    );
  }

  if (field.field_type === 'select') {
    return (
      <label className="block">
        {label}
        <select value={value ?? ''} onChange={(event) => onValueChange(event.target.value)} className={inputClass}>
          <option value="">Chọn {field.label.toLocaleLowerCase('vi-VN')}</option>
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {help}
      </label>
    );
  }

  if (field.field_type === 'boolean') {
    const selectValue = value === true ? 'true' : value === false ? 'false' : '';
    return (
      <label className="block">
        {label}
        <select
          value={selectValue}
          onChange={(event) => onValueChange(event.target.value === '' ? '' : event.target.value === 'true')}
          className={inputClass}
        >
          <option value="">Chưa chọn</option>
          <option value="true">Có</option>
          <option value="false">Không</option>
        </select>
        {help}
      </label>
    );
  }

  return (
    <label className="block">
      {label}
      <input
        type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
        value={value ?? ''}
        onChange={(event) => onValueChange(event.target.value)}
        className={inputClass}
        placeholder={field.placeholder || (field.field_type === 'date' ? undefined : `Nhập ${field.label.toLocaleLowerCase('vi-VN')}`)}
        min={field.validation?.min}
        max={field.validation?.max}
        minLength={field.validation?.min_length}
        maxLength={field.validation?.max_length || (field.field_type === 'text' ? 500 : undefined)}
      />
      {help}
    </label>
  );
}
