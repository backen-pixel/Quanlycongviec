import { useRef, useState } from 'react';

function dragEventHasFiles(e) {
  return Array.from(e.dataTransfer?.types || []).includes('Files');
}

export function useChatFileDrop(onFiles) {
  const [active, setActive] = useState(false);
  const depthRef = useRef(0);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  const bind = {
    onDragEnter: (e) => {
      if (!dragEventHasFiles(e)) return;
      e.preventDefault();
      depthRef.current += 1;
      setActive(true);
    },
    onDragOver: (e) => {
      if (!dragEventHasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e) => {
      if (!dragEventHasFiles(e)) return;
      e.preventDefault();
      depthRef.current -= 1;
      if (depthRef.current <= 0) {
        depthRef.current = 0;
        setActive(false);
      }
    },
    onDrop: (e) => {
      if (!dragEventHasFiles(e)) return;
      e.preventDefault();
      depthRef.current = 0;
      setActive(false);
      const list = e.dataTransfer?.files;
      if (list?.length) onFilesRef.current?.(list);
    },
  };

  return { active, bind };
}

export function ChatFileDropOverlay({ active }) {
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-sky-400 bg-sky-50/85">
      <p className="px-4 text-center text-sm font-semibold text-sky-800">Thả file để gửi</p>
    </div>
  );
}
