/** UI bình luận CRM theo phong cách Facebook (avatar, pill nhập, nút Đăng). */
import { useCallback, useLayoutEffect, useRef } from 'react';

const COMPOSER_MAX_H = 160; // tương đương max-h-40

export function formatCrmFbRelativeTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const ms = Date.now() - t;
  if (ms < 15_000) return 'Vừa xong';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'Hôm qua';
  if (day < 7) return `${day} ngày`;
  return new Date(iso).toLocaleString('vi-VN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Thời gian đầy đủ — tooltip / dòng phụ dưới bình luận. */
export function formatCrmCommentFullDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function FbCrmAvatar({ user, className = 'h-8 w-8' }) {
  const name = user?.full_name || user?.email || '?';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
  const url = user?.avatar;
  if (url) {
    return <img src={url} alt="" className={`${className} rounded-full object-cover shrink-0 bg-[#e4e6eb]`} />;
  }
  return (
    <div
      className={`${className} rounded-full shrink-0 flex items-center justify-center bg-gradient-to-br from-[#1877f2] to-[#166fe5] text-[10px] font-bold text-white shadow-sm`}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function FbCrmCommentComposer({
  user,
  value,
  onChange,
  onSubmit,
  posting,
  placeholder = 'Viết bình luận…',
  submitLabel = 'Đăng',
  minRows = 1,
  autoFocus = false,
  canSubmit,
}) {
  const textareaRef = useRef(null);

  const syncHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.min(Math.max(el.scrollHeight, 22), COMPOSER_MAX_H);
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_H ? 'auto' : 'hidden';
  }, []);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  const handleChange = (e) => {
    onChange?.(e);
    requestAnimationFrame(syncHeight);
  };

  return (
    <div className="flex items-end gap-2 px-3 py-2.5 bg-white">
      <FbCrmAvatar user={user} className="h-8 w-8 shrink-0 mb-px" />
      <div className="flex-1 min-w-0 rounded-[22px] bg-[#f0f2f5] px-3 py-2 border border-transparent focus-within:border-[#1877f2]/30 transition-colors">
        <textarea
          ref={textareaRef}
          autoFocus={autoFocus}
          value={value}
          onChange={handleChange}
          rows={minRows}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !posting) {
              e.preventDefault();
              onSubmit?.();
            }
          }}
          className="w-full bg-transparent border-0 p-0 text-[15px] leading-snug text-[#050505] placeholder:text-[#65676b] focus:ring-0 resize-none min-h-[22px] overflow-hidden"
          style={{ maxHeight: COMPOSER_MAX_H }}
        />
      </div>
      <button
        type="button"
        disabled={posting || !(canSubmit ?? String(value || '').trim())}
        onClick={onSubmit}
        className="shrink-0 rounded-full bg-[#1877f2] px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-[#166fe5] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
      >
        {posting ? '…' : submitLabel}
      </button>
    </div>
  );
}
