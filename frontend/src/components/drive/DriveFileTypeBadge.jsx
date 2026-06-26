import { driveIconForMime } from '../../lib/drive';

const CONFIG = {
  word: { bg: 'bg-[#2B579A]', fold: 'bg-[#1e3d6d]', letter: 'W' },
  excel: { bg: 'bg-[#217346]', fold: 'bg-[#185c37]', letter: 'X' },
  powerpoint: { bg: 'bg-[#D24726]', fold: 'bg-[#b33d1f]', letter: 'P' },
  pdf: { bg: 'bg-[#E74C3C]', fold: 'bg-[#c0392b]', letter: 'PDF', compactLetter: 'P' },
  sketchup: { bg: 'bg-[#005F9E]', fold: 'bg-[#004a7c]', letter: 'SU', compactLetter: 'S' },
  autocad: { bg: 'bg-[#E31937]', fold: 'bg-[#b8142c]', letter: 'CAD', compactLetter: 'A' },
  archive: { bg: 'bg-amber-500', fold: 'bg-amber-600', letter: 'Z' },
  text: { bg: 'bg-slate-500', fold: 'bg-slate-600', letter: 'T' },
  file: { bg: 'bg-slate-400', fold: 'bg-slate-500', letter: 'F' },
};

function badgeDimensions(size, compact) {
  if (compact || size <= 18) {
    return { box: 'w-[18px] h-[18px] rounded', fold: 'w-2.5 h-2.5', text: 'text-[9px]', pdfText: 'text-[7px]' };
  }
  if (size <= 24) {
    return { box: 'w-6 h-6 rounded-md', fold: 'w-3 h-3', text: 'text-[11px]', pdfText: 'text-[8px]' };
  }
  if (size <= 36) {
    return { box: 'w-9 h-9 rounded-md', fold: 'w-3.5 h-3.5', text: 'text-base', pdfText: 'text-[9px]' };
  }
  if (size <= 44) {
    return { box: 'w-11 h-11 rounded-md', fold: 'w-4 h-4', text: 'text-lg', pdfText: 'text-[10px]' };
  }
  return { box: 'w-14 h-14 rounded-lg', fold: 'w-5 h-5', text: 'text-xl', pdfText: 'text-[11px]' };
}

function resolveLetter(cfg, dims, typeKey) {
  if ((typeKey === 'pdf' && cfg.letter === 'PDF') || typeKey === 'autocad') {
    return dims.box.includes('w-14') ? cfg.letter : (cfg.compactLetter || cfg.letter.charAt(0));
  }
  if (typeKey === 'sketchup') {
    return dims.box.includes('w-14') || dims.box.includes('w-11') ? cfg.letter : (cfg.compactLetter || 'S');
  }
  return cfg.letter;
}

/**
 * Icon dạng thẻ tài liệu (Word, Excel, PowerPoint, PDF, …) — dùng chung Drive & Messenger.
 */
export default function DriveFileTypeBadge({
  name,
  mime,
  typeKey,
  size = 24,
  compact = false,
  className = '',
}) {
  const key = typeKey || driveIconForMime(mime, name);
  const cfg = CONFIG[key] || CONFIG.file;
  const dims = badgeDimensions(size, compact);
  const letter = resolveLetter(cfg, dims, key);
  const isPdfLabel = (key === 'pdf' && letter === 'PDF') || (key === 'autocad' && letter === 'CAD');

  return (
    <div
      className={`relative shrink-0 ${cfg.bg} shadow-sm flex items-center justify-center overflow-hidden ${dims.box} ${className}`}
      aria-hidden
    >
      <span
        className={`absolute top-0 right-0 ${dims.fold} ${cfg.fold}`}
        style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
      />
      <span
        className={`text-white font-bold leading-none select-none ${isPdfLabel ? dims.pdfText : dims.text}`}
      >
        {letter}
      </span>
    </div>
  );
}

export { CONFIG as DRIVE_FILE_TYPE_BADGE_CONFIG };
