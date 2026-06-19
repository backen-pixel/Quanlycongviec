import {
  formatPresenceDotTitle,
  getUserPresence,
  isUserOnline as checkUserOnline,
} from '../lib/userPresenceDisplay';

/** Chấm trạng thái online (xanh) / offline (xám) — dựa POST /users/presence (ping trong 2 phút). */
export default function OnlineStatusDot({
  online,
  lastPingAt = null,
  presence = null,
  size = 'sm',
  className = '',
  title,
}) {
  const sz = size === 'md' ? 'w-2.5 h-2.5' : size === 'lg' ? 'w-3 h-3' : 'w-2 h-2';
  const resolvedOnline = presence ? !!presence.online : !!online;
  const label =
    title ??
    (presence
      ? formatPresenceDotTitle(presence)
      : resolvedOnline
        ? 'Đang online'
        : formatPresenceDotTitle({ online: false, last_ping_at: lastPingAt }));
  return (
    <span
      className={`inline-block shrink-0 rounded-full border border-white ${sz} ${
        resolvedOnline ? 'bg-emerald-500' : 'bg-slate-300'
      } ${className}`}
      title={label}
      aria-label={label}
    />
  );
}

export function isUserOnline(presenceByUser, userId) {
  return checkUserOnline(presenceByUser, userId);
}

export { getUserPresence };
