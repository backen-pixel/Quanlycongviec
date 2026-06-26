/** Trạng thái đồng bộ Supabase — giữ khi đổi trang (bong bóng toàn app). */

const STORAGE_KEY = 'supabase_sync_active_v1';

const PHASE_HINTS = [
  { re: /Bắt đầu|Kiểm tra drift|Kiểm tra kết nối/i, pct: 8 },
  { re: /Clone DB|clone-primary/i, pct: 30 },
  { re: /Fix grants/i, pct: 55 },
  { re: /Đồng bộ Storage|sync-storage|Replay failback|sync log|Storage\/bucket/i, pct: 75 },
  { re: /Hoàn tất|kiểm tra lại|100%/i, pct: 95 },
];

let state = { active: null };
const listeners = new Set();

function loadFromStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const a = parsed?.active;
    if (!a) return null;
    if (a.status === 'running') return parsed;
    if (a.finishedAt && Date.now() - new Date(a.finishedAt).getTime() < 15 * 60 * 1000) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveToStorage() {
  try {
    if (state.active) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

const stored = loadFromStorage();
if (stored?.active) state = stored;

function emit() {
  saveToStorage();
  listeners.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
}

export function subscribeSupabaseSync(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSupabaseSyncState() {
  return state;
}

function estimateProgress(logs, status, steps) {
  if (status === 'done') return 100;
  if (status === 'error') return 100;
  if (steps?.length) {
    const done = steps.filter((s) => s.ok === true).length;
    const running = steps.some((s) => s.running);
    const base = Math.round((done / steps.length) * 85);
    return Math.min(99, running ? base + 8 : base);
  }
  if (!logs?.length) return 5;
  let max = 5;
  for (const entry of logs) {
    const line = entry?.line || entry;
    for (const hint of PHASE_HINTS) {
      if (hint.re.test(String(line))) max = Math.max(max, hint.pct);
    }
  }
  return Math.min(99, max);
}

function mergeLogs(local, remote) {
  const merged = [...(local || [])];
  for (const r of remote || []) {
    if (!merged.some((m) => m.at === r.at && m.line === r.line)) merged.push(r);
  }
  return merged.slice(-120);
}

function patchActive(patch) {
  if (!state.active) return;
  const next = { ...state.active, ...patch };
  next.progress = estimateProgress(next.logs, next.status, next.steps);
  state = { active: next };
  emit();
}

function mapRemoteActive(active) {
  const type = active.type === 'switch_prepare' ? 'switch' : 'backup';
  const status = active.running ? 'running' : (active.status === 'error' ? 'error' : 'done');
  const logs = (active.log || []).map((entry) => (
    typeof entry === 'string'
      ? { at: active.updated_at || active.started_at, line: entry }
      : { at: entry.at || active.updated_at, line: entry.line || String(entry) }
  ));
  return {
    id: state.active?.id || `sync_${active.started_at || Date.now()}`,
    serverKind: active.type,
    type,
    title: active.title || (type === 'switch' ? 'Chuẩn bị chuyển database' : 'Đồng bộ Supabase Backup'),
    message: active.message || 'Đang đồng bộ…',
    direction: active.direction || null,
    from: active.from || null,
    target: active.target || null,
    phase: active.phase || null,
    steps: active.steps || [],
    syncParts: active.sync_parts || [],
    status,
    logs,
    progress: estimateProgress(logs, status, active.steps),
    startedAt: active.started_at || null,
    finishedAt: active.finished_at || null,
    error: active.error || null,
  };
}

export function startSupabaseSync({
  type = 'backup',
  title,
  message,
  direction,
  from,
  target,
  phase,
  steps,
  syncParts,
  at,
  logs = [],
} = {}) {
  const startedAt = at || new Date().toISOString();
  if (state.active?.status === 'running' && state.active.type === type) {
    patchActive({
      title: title || state.active.title,
      message: message || state.active.message,
      direction: direction ?? state.active.direction,
      from: from ?? state.active.from,
      target: target ?? state.active.target,
      phase: phase ?? state.active.phase,
      steps: steps?.length ? steps : state.active.steps,
      syncParts: syncParts?.length ? syncParts : state.active.syncParts,
    });
    return;
  }
  state = {
    active: {
      id: `sync_${Date.now()}`,
      serverKind: type === 'switch' ? 'switch_prepare' : 'backup',
      type,
      title: title || (type === 'switch' ? 'Chuẩn bị chuyển database' : 'Đồng bộ Supabase Backup'),
      message: message || 'Đang đồng bộ…',
      direction: direction || null,
      from: from || null,
      target: target || null,
      phase: phase || null,
      steps: steps || [],
      syncParts: syncParts || [],
      status: 'running',
      logs: logs.map((entry) => (
        typeof entry === 'string'
          ? { at: startedAt, line: entry }
          : { at: entry.at || startedAt, line: entry.line || String(entry) }
      )),
      progress: 5,
      startedAt,
      finishedAt: null,
      error: null,
    },
  };
  patchActive({});
}

export function appendSupabaseSyncLog(line, at) {
  if (!line || !state.active) return;
  const entry = { at: at || new Date().toISOString(), line: String(line) };
  const logs = [...state.active.logs, entry].slice(-120);
  patchActive({ logs, message: String(line).slice(0, 200) });
}

export function finishSupabaseSync({ ok = true, error, at } = {}) {
  if (!state.active) return;
  patchActive({
    status: ok ? 'done' : 'error',
    finishedAt: at || new Date().toISOString(),
    error: error || null,
    message: ok ? 'Đồng bộ hoàn tất' : (error || 'Đồng bộ thất bại'),
  });
}

export function clearSupabaseSync() {
  state = { active: null };
  emit();
}

export function hydrateSupabaseSyncFromStatus(job) {
  if (!job?.running) return;
  if (state.active?.status === 'running') {
    const remoteLogs = (job.log || []).map((entry) => ({
      at: entry.at || new Date().toISOString(),
      line: entry.line || '',
    }));
    patchActive({ logs: mergeLogs(state.active.logs, remoteLogs) });
    return;
  }
  startSupabaseSync({
    type: 'backup',
    message: 'Đang đồng bộ backup…',
    logs: job.log || [],
  });
}

export function hydrateFromPublicStatus(data) {
  const active = data?.active;
  if (!active) {
    if (state.active?.status === 'running' && data?.pending_countdown) {
      return;
    }
    if (state.active?.status === 'running' && !data?.pending_countdown) {
      finishSupabaseSync({ ok: state.active.status !== 'error' });
    }
    return;
  }

  const mapped = mapRemoteActive(active);
  const sameJob = state.active && (
    state.active.startedAt === mapped.startedAt
    || (state.active.serverKind === mapped.serverKind && mapped.status === 'running')
  );
  if (!sameJob) {
    state = { active: mapped };
    emit();
    return;
  }

  patchActive({
    ...mapped,
    logs: mergeLogs(state.active.logs, mapped.logs),
    id: state.active.id,
  });
}
