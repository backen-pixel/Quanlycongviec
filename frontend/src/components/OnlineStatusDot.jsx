/** Chấm trạng thái online (xanh) / offline (xám) — dựa POST /users/presence (ping trong 2 phút). */
export default function OnlineStatusDot({ online, size = 'sm', className = '', title }) {
  const sz = size === 'md' ? 'w-2.5 h-2.5' : size === 'lg' ? 'w-3 h-3' : 'w-2 h-2';
  const label = title ?? (online ? 'Đang online' : 'Offline');
  return (
    <span
      className={`inline-block shrink-0 rounded-full border border-white ${sz} ${
        online ? 'bg-emerald-500' : 'bg-slate-300'
      } ${className}`}
      title={label}
      aria-label={label}
    />
  );
}

export function isUserOnline(presenceByUser, userId) {
  if (!userId || !presenceByUser) return false;
  const key = String(userId);
  const pres = presenceByUser[key] ?? presenceByUser[userId];
  return !!pres?.online;
}
