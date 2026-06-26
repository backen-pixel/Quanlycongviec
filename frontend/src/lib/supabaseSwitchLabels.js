/** Nhãn tiếng Việt cho chuyển Primary / Backup. */

export function formatTargetLabel(t) {
  if (t === 'primary') return 'Chính (Primary)';
  if (t === 'backup') return 'Dự phòng (Backup)';
  return t || '—';
}

export function formatSwitchRoute(from, target) {
  if (from && target) return `${formatTargetLabel(from)} → ${formatTargetLabel(target)}`;
  if (target === 'backup') return 'Chính → Dự phòng';
  if (target === 'primary') return 'Dự phòng → Chính';
  return '';
}

export function formatCountdownMessage(from, target, seconds) {
  const route = formatSwitchRoute(from, target);
  return `Chuyển ${route} sau ${seconds}s — vui lòng hoàn tất thao tác đang làm.`;
}
