import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Overlay portal — tránh bị sidebar/menu (z-30) đè khi modal nằm trong vùng z-10. */
export function OverlayPortal({
  open,
  onClose,
  children,
  /** full ≈ 90vw × 90vh; xl giữ max-w-6xl */
  size = 'full',
  panelClassName = '',
  closeOnBackdrop = true,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const panelSize = size === 'full'
    ? 'w-[min(96vw,1600px)] max-w-[96vw] h-[94vh] max-h-[94vh]'
    : size === 'xl'
      ? 'w-full max-w-6xl max-h-[90vh]'
      : 'w-full max-w-4xl max-h-[90vh]';

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-5"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in ${panelSize} ${panelClassName}`.trim()}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default function Modal({ open, onClose, title, size = 'md', children, bodyClassName = '' }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    // ~90% viewport — không bị cắt bởi sidebar/menu (render qua portal)
    full: 'w-[min(96vw,1600px)] max-w-[96vw] h-[94vh] max-h-[94vh]',
  };
  const isFull = size === 'full';

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizes[size] || sizes.md} ${isFull ? '' : 'max-h-[90vh]'} flex flex-col animate-fade-in`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto p-6 ${bodyClassName}`.trim()}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
