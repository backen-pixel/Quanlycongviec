import {
  File, FileImage, FileVideo, FileAudio,
  Folder,
} from 'lucide-react';
import { driveIconForMime } from '../../lib/drive';
import DriveFileTypeBadge from './DriveFileTypeBadge';

const BADGE_TYPES = new Set(['word', 'excel', 'powerpoint', 'pdf', 'sketchup', 'autocad', 'archive', 'text', 'file']);

const COLORS = {
  image: 'text-violet-500',
  video: 'text-rose-500',
  audio: 'text-pink-500',
};

const ICONS = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
};

export default function DriveFileIcon({
  mime,
  name,
  isFolder,
  size = 24,
  className = '',
  variant = 'auto',
}) {
  if (isFolder) {
    return (
      <Folder
        size={size}
        className={`text-yellow-500 shrink-0 ${className}`}
        fill="currentColor"
        strokeWidth={1.5}
      />
    );
  }

  const key = driveIconForMime(mime, name);
  const useBadge = variant === 'badge' || (variant === 'auto' && BADGE_TYPES.has(key));

  if (useBadge) {
    return (
      <DriveFileTypeBadge
        typeKey={key}
        mime={mime}
        name={name}
        size={size}
        className={className}
      />
    );
  }

  const Icon = ICONS[key] || File;
  return <Icon size={size} className={`${COLORS[key] || 'text-slate-500'} shrink-0 ${className}`} />;
}
