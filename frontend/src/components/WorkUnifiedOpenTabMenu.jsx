import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink } from 'lucide-react';

export function workUnifiedPath(id) {
  return `/management/work-unified/${id}`;
}

/** Gắn lên Link dự án: chuột phải hiện «Mở tab mới». */
export const WU_OPEN_TAB_ATTR = 'data-wu-open-tab';

export function WorkUnifiedOpenTabProvider({ children }) {
  const [menu, setMenu] = useState(null);
  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    const onCtx = (e) => {
      const el = e.target instanceof Element
        ? e.target.closest(`[${WU_OPEN_TAB_ATTR}]`)
        : null;
      if (!el) return;
      const id = el.getAttribute(WU_OPEN_TAB_ATTR);
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      const w = 176;
      const h = 40;
      const pad = 8;
      const x = Math.min(Math.max(pad, e.clientX), window.innerWidth - w - pad);
      const y = Math.min(Math.max(pad, e.clientY), window.innerHeight - h - pad);
      setMenu({ x, y, href: workUnifiedPath(id) });
    };
    document.addEventListener('contextmenu', onCtx, true);
    return () => document.removeEventListener('contextmenu', onCtx, true);
  }, []);

  return (
    <>
      {children}
      <WorkUnifiedOpenTabMenu menu={menu} onClose={close} />
    </>
  );
}

function WorkUnifiedOpenTabMenu({ menu, onClose }) {
  useEffect(() => {
    if (!menu) return undefined;
    const onKey = (ev) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onClose);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('mousedown', onClose);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  return createPortal(
    <div
      role="menu"
      className="fixed z-[400] min-w-[11rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
      style={{ left: menu.x, top: menu.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <a
        role="menuitem"
        href={menu.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-800 hover:bg-violet-50"
        onClick={onClose}
      >
        <ExternalLink className="h-3.5 w-3.5 text-violet-600" />
        Mở tab mới
      </a>
    </div>,
    document.body,
  );
}
