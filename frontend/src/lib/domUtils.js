/** Target hợp lệ cho Node.contains — tránh TypeError khi target null / không phải Node. */
export function getClickTargetNode(event) {
  const direct = event?.target;
  if (direct instanceof Node) return direct;
  const path = typeof event?.composedPath === 'function' ? event.composedPath() : null;
  if (Array.isArray(path)) {
    for (const n of path) {
      if (n instanceof Node) return n;
    }
  }
  return null;
}

/** true khi click ngoài container (hoặc không xác định được target). */
export function isClickOutside(container, event) {
  if (!container) return true;
  const target = getClickTargetNode(event);
  if (!target) return true;
  return !container.contains(target);
}
