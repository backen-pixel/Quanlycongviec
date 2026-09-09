import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Pin, X } from 'lucide-react';
import {
  getPinnedListHidden,
  getPinnedProjects,
  MAX_PINNED_PROJECTS,
  PIN_MODULE_LABEL,
  PINNED_CHANGED_EVENT,
  setPinnedListHidden,
  unpinProject,
} from '../lib/pinnedProjects';

export { isProjectPinned as isPinned, togglePinnedProject as togglePin } from '../lib/pinnedProjects';

function usePinnedState() {
  const [items, setItems] = useState(getPinnedProjects);
  const [hidden, setHidden] = useState(getPinnedListHidden);

  useEffect(() => {
    const sync = () => {
      setItems(getPinnedProjects());
      setHidden(getPinnedListHidden());
    };
    window.addEventListener(PINNED_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PINNED_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return { items, hidden, setHidden };
}

export default function PinnedProjectsWidget() {
  const { items, hidden, setHidden } = usePinnedState();

  if (!items.length) return null;

  const toggleHidden = () => {
    const next = !hidden;
    setPinnedListHidden(next);
    setHidden(next);
  };

  return (
    <div
      className="fixed z-[118] flex flex-col items-end gap-2"
      style={{ right: 16, bottom: 16 }}
    >
      {hidden ? (
        <button
          type="button"
          onClick={toggleHidden}
          title="Hiện danh sách dự án đã ghim"
          className="relative h-12 w-12 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-xl flex items-center justify-center cursor-pointer"
        >
          <Pin className="h-5 w-5 fill-current" />
          <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 bg-slate-900 rounded-full text-[10px] font-bold flex items-center justify-center">
            {items.length}
          </span>
        </button>
      ) : (
        <div className="w-[280px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 text-white">
            <div className="flex items-center gap-1.5 min-w-0">
              <Pin className="h-3.5 w-3.5 fill-current shrink-0" />
              <span className="text-xs font-semibold truncate">
                Dự án ghim ({items.length}/{MAX_PINNED_PROJECTS})
              </span>
            </div>
            <button
              type="button"
              onClick={toggleHidden}
              title="Ẩn danh sách"
              className="p-1 rounded-md hover:bg-white/15 cursor-pointer"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
          <ul className="max-h-[50vh] overflow-y-auto divide-y divide-slate-100">
            {items.map((p) => (
              <li key={p.id} className="flex items-stretch">
                <Link
                  to={p.href || `/management/work-unified/${p.id}`}
                  className="flex-1 min-w-0 px-3 py-2 hover:bg-amber-50"
                  title="Mở dự án đã ghim"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                      {PIN_MODULE_LABEL[p.module] || 'DA'}
                    </span>
                    {p.code ? (
                      <span className="text-[11px] font-semibold text-amber-700 truncate">{p.code}</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-800 truncate mt-0.5">
                    {p.name || p.code || 'Dự án'}
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={() => unpinProject(p.id)}
                  title="Bỏ ghim"
                  className="px-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
