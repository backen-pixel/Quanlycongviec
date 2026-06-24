/** Báo useActivityPing bỏ POST /users/ping — heartbeat đã ghi ping. */
let heartbeatActive = false;

export function setAppHeartbeatActive(active) {
  heartbeatActive = !!active;
}

export function isAppHeartbeatActive() {
  return heartbeatActive;
}
