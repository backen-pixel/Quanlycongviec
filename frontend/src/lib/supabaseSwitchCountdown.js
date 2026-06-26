/** Đồng bộ đếm ngược chuyển DB từ socket / API public-pending. */

import { formatCountdownMessage, formatSwitchRoute, formatTargetLabel } from './supabaseSwitchLabels';

export function switchAtFromPayload(payload) {
  if (!payload?.switch_at) return null;
  const t = new Date(payload.switch_at).getTime();
  return Number.isFinite(t) ? t : null;
}

export function countdownStateFromPayload(payload) {
  const switchAt = switchAtFromPayload(payload);
  if (!switchAt) return null;
  const remaining = Math.max(0, Math.ceil((switchAt - Date.now()) / 1000));
  return {
    from: payload.from,
    target: payload.target,
    direction: payload.direction || formatSwitchRoute(payload.from, payload.target),
    switchAt,
    message: payload.message || formatCountdownMessage(payload.from, payload.target, remaining),
    syncVerified: payload.sync_verified_100 === true,
    syncAfter: payload.sync_after === true,
    quickSwitch: payload.quick_switch === true || payload.sync_after === true,
    remaining,
  };
}

export function countdownStateFromPending(pending) {
  if (!pending?.switch_at) return null;
  const switchAt = new Date(pending.switch_at).getTime();
  if (!Number.isFinite(switchAt)) return null;
  const remainingMs = pending.remaining_ms ?? Math.max(0, switchAt - Date.now());
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
  return {
    from: pending.from,
    target: pending.target,
    direction: pending.direction || formatSwitchRoute(pending.from, pending.target),
    switchAt,
    message: pending.message || formatCountdownMessage(pending.from, pending.target, remaining),
    syncVerified: pending.sync_verified_100 === true,
    syncAfter: pending.sync_after === true,
    quickSwitch: pending.quick_switch === true || pending.sync_after === true,
    remaining,
  };
}

export { formatTargetLabel, formatSwitchRoute };
