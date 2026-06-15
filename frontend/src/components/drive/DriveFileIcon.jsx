import {
  File, FileText, FileImage, FileVideo, FileAudio, FileSpreadsheet,
  FileArchive, Folder, FileCode, FileType,
} from 'lucide-react';
import { driveIconForMime } from '../../lib/drive';

const COLORS = {
  folder: 'text-amber-500',
  image: 'text-violet-500',
  video: 'text-rose-500',
  audio: 'text-pink-500',
  pdf: 'text-red-500',
  word: 'text-blue-500',
  excel: 'text-emerald-600',
  powerpoint: 'text-orange-500',
  archive: 'text-yellow-600',
  text: 'text-slate-500',
  file: 'text-slate-500',
};

const ICONS = {
  folder: Folder,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  powerpoint: FileType,
  archive: FileArchive,
  text: FileCode,
  file: File,
};

export default function DriveFileIcon({ mime, isFolder, size = 24, className = '' }) {
  const key = isFolder ? 'folder' : driveIconForMime(mime);
  const Icon = ICONS[key] || File;
  return <Icon size={size} className={`${COLORS[key] || COLORS.file} ${className}`} />;
}
