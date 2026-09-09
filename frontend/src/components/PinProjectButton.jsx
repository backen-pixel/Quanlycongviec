import { useEffect, useState } from 'react';
import { Pin } from 'lucide-react';
import {
  isProjectPinned,
  MAX_PINNED_PROJECTS,
  PINNED_CHANGED_EVENT,
  togglePinnedProject,
} from '../lib/pinnedProjects';

export default function PinProjectButton({
  projectId,
  code,
  name,
  href,
  module = 'project',
  className = '',
}) {
  const [pinned, setPinned] = useState(() => isProjectPinned(projectId));

  useEffect(() => {
    const sync = () => setPinned(isProjectPinned(projectId));
    sync();
    window.addEventListener(PINNED_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PINNED_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [projectId]);

  if (!projectId) return null;

  const onClick = () => {
    const result = togglePinnedProject({ id: projectId, code, name, href, module });
    if (!result.ok && result.reason === 'limit') {
      window.alert(`Chỉ ghim tối đa ${MAX_PINNED_PROJECTS} dự án. Bỏ ghim một dự án trước.`);
      return;
    }
    setPinned(result.pinned);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={pinned ? 'Bỏ ghim dự án khỏi góc phải' : 'Ghim dự án xuống góc phải'}
      className={
        className
        || `h-9 px-3 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer ${
          pinned
            ? 'bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200'
            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
        }`
      }
    >
      <Pin className={`h-4 w-4 ${pinned ? 'fill-current rotate-45' : ''}`} />
      {pinned ? 'Bỏ ghim' : 'Ghim'}
    </button>
  );
}
