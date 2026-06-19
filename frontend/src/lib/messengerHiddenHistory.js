const storageKey = (groupId) => `messenger_hidden_${groupId}`;

export function loadMessengerHiddenConfig(groupId) {
  if (!groupId) return { hiddenIds: new Set(), clearedBefore: null };
  try {
    const raw = localStorage.getItem(storageKey(groupId));
    if (!raw) return { hiddenIds: new Set(), clearedBefore: null };
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { hiddenIds: new Set(parsed.map(String)), clearedBefore: null };
    }
    if (parsed && typeof parsed === 'object') {
      return {
        hiddenIds: new Set(Array.isArray(parsed.hiddenIds) ? parsed.hiddenIds.map(String) : []),
        clearedBefore: parsed.clearedBefore || null,
      };
    }
  } catch {
    /* ignore */
  }
  return { hiddenIds: new Set(), clearedBefore: null };
}

export function saveMessengerHiddenConfig(groupId, { hiddenIds, clearedBefore }) {
  if (!groupId) return;
  const ids = hiddenIds instanceof Set ? [...hiddenIds] : [...(hiddenIds || [])];
  const payload = { hiddenIds: ids };
  if (clearedBefore) payload.clearedBefore = clearedBefore;
  localStorage.setItem(storageKey(groupId), JSON.stringify(payload));
}

export function isMessengerMessageHidden(message, config) {
  if (!message?.id || !config) return false;
  if (config.hiddenIds?.has(String(message.id))) return true;
  if (config.clearedBefore && message.created_at) {
    return new Date(message.created_at).getTime() <= new Date(config.clearedBefore).getTime();
  }
  return false;
}

export function clearMessengerHistoryForMe(groupId, messageIds = []) {
  const existing = loadMessengerHiddenConfig(groupId);
  const nextIds = new Set(existing.hiddenIds);
  messageIds.forEach((id) => next.add(String(id)));
  const clearedBefore = new Date().toISOString();
  const config = { hiddenIds: nextIds, clearedBefore };
  saveMessengerHiddenConfig(groupId, config);
  return config;
}

export function addHiddenMessageIds(groupId, ids) {
  const existing = loadMessengerHiddenConfig(groupId);
  const nextIds = new Set(existing.hiddenIds);
  (ids || []).forEach((id) => nextIds.add(String(id)));
  const config = { hiddenIds: nextIds, clearedBefore: existing.clearedBefore };
  saveMessengerHiddenConfig(groupId, config);
  return config;
}

export function dispatchMessengerHiddenUpdated(groupId) {
  window.dispatchEvent(new CustomEvent('messenger:hidden-updated', { detail: { groupId } }));
}

export function dispatchMessengerClearHistory(groupId) {
  window.dispatchEvent(new CustomEvent('messenger:clear-history', { detail: { groupId } }));
}
