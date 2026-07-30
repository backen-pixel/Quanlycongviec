import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, size = 'md', children, bodyClassName = '' }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl', full: 'max-w-[90vw]' };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] px-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizes[size]} max-h-[90vh] flex flex-col animate-fade-in`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Body */}
        <div className={`flex-1 min-h-0 overflow-y-auto p-6 ${bodyClassName}`.trim()}>
          {children}
        </div>
      </div>
    </div>
  );
}
