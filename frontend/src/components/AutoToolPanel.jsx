import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Loader2, ChevronDown, ChevronUp, Settings2, Play } from 'lucide-react';
import api from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';

// ═══════════════════════════════════════════════════════════════
// Auto Tool v2 — Công cụ tự động Facebook → Lead
// ═══════════════════════════════════════════════════════════════

const EMPTY_STATE = {
  enabled: false,
  running: false,
  cycleCount: 0,
  currentContact: null,
  processed: 0,
  totalContacts: 0,
  totalPool: 0,
  offset: 0,
  synced: 0,
  syncErrors: 0,
  phonesFound: 0,
  leadsCreated: 0,
  leadsUpdated: 0,
  errors: 0,
  startedAt: null,
  lastUpdatedAt: null,
  logs: [],
  config: { limit: 100, graphPages: 10, pauseSec: 60, cyclePauseSec: 300, delayMs: 100 },
};

let _state = { ...EMPTY_STATE };
const _subs = new Set();
let _socketBound = false;

function notify() { _subs.forEach(fn => fn({ ..._state })); }

async function loadStatus() {
  try {
    const { data } = await api.get('/facebook/auto-tool/status');
    _state = { ...EMPTY_STATE, ...data };
    notify();
  } catch { /* keep last */ }
}

function ensureSocket() {
  connectSocket();
  const socket = getSocket();
  if (!socket || _socketBound) return;
  _socketBound = true;
  socket.on('auto_tool_state', (s) => {
    _state = { ...EMPTY_STATE, ...s };
    notify();
  });
  socket.on('connect', () => loadStatus());
}

export async function startAutoTool() {
  await api.post('/facebook/auto-tool/start');
  await loadStatus();
}

export async function stopAutoTool() {
  await api.post('/facebook/auto-tool/stop');
  await loadStatus();
}

export async function toggleAutoTool() {
  if (_state.enabled || _state.running) {
    await stopAutoTool();
  } else {
    await startAutoTool();
  }
}

export async function saveAutoToolConfig(body) {
  await api.put('/facebook/auto-tool/config', body);
  await loadStatus();
}

export function useAutoTool() {
  const [state, setState] = useState(_state);
  useEffect(() => {
    const handler = (next) => setState({ ...next });
    _subs.add(handler);
    ensureSocket();
    loadStatus();
    return () => _subs.delete(handler);
  }, []);
  return state;
}

// ═══════════════════════════════════════════════════════════════
// UI Component
// ═══════════════════════════════════════════════════════════════

function formatDuration(startedAt) {
  if (!startedAt) return '--';
  const ms = Date.now() - new Date(startedAt).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}p ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}p`;
}

export default function AutoToolPanel({ onComplete = null }) {
  const auto = useAutoTool();
  const [expanded, setExpanded] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [form, setForm] = useState({
    limit: 100,
    graphPages: 10,
    pauseSec: 60,
    cyclePauseSec: 300,
    delayMs: 100,
  });
  const [saving, setSaving] = useState(false);
  const logsEndRef = useRef(null);

  // Sync form with server config
  useEffect(() => {
    if (auto.config) {
      setForm(f => ({ ...f, ...auto.config }));
    }
  }, [auto.config]);

  // Load config on expand
  const loadConfig = useCallback(async () => {
    try {
      const { data } = await api.get('/facebook/auto-tool/config');
      if (data?.config) setForm(f => ({ ...f, ...data.config }));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (expanded && cfgOpen) loadConfig();
  }, [expanded, cfgOpen, loadConfig]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [auto.logs]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await saveAutoToolConfig({
        limit: parseInt(form.limit, 10) || 100,
        graphPages: parseInt(form.graphPages, 10) || 10,
        pauseSec: parseInt(form.pauseSec, 10) || 60,
        cyclePauseSec: parseInt(form.cyclePauseSec, 10) || 300,
        delayMs: parseInt(form.delayMs, 10) || 100,
      });
    } finally {
      setSaving(false);
    }
  };

  const running = auto.running;
  // Progress: offset (đã xong) + processed trong batch hiện tại / tổng pool
  const totalDone = (auto.offset || 0) - (auto.totalContacts || 0) + (auto.processed || 0);
  const pool = auto.totalPool || 0;
  const progress = pool > 0
    ? Math.min(100, Math.round(((auto.offset > 0 ? auto.offset - auto.totalContacts : 0) + auto.processed) / pool * 100))
    : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 hover:bg-gray-50 transition cursor-pointer rounded-lg px-1 py-0.5"
        >
          <Zap className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-gray-800">⚡ Công cụ tự động</span>
          {running && (
            <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              Vòng {auto.cycleCount} • {auto.processed}/{auto.totalContacts}
              {auto.totalPool > 0 && ` (pool ${auto.totalPool})`}
              {auto.currentContact && ` • ${auto.currentContact}`}
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={startAutoTool}
            disabled={running}
            className="px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer transition"
          >
            <Play size={12} /> Chạy
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={!!auto.enabled}
            onClick={toggleAutoTool}
            className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${
              auto.enabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
            title={auto.enabled ? 'Tự động: Bật' : 'Tự động: Tắt'}
          >
            <span
              aria-hidden
              className={`pointer-events-none absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                auto.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-xs text-gray-500">{auto.enabled ? 'Auto' : 'Off'}</span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 space-y-3">
          {/* Description */}
          <div className="pt-3 text-[11px] text-gray-700 space-y-2">
            <p className="font-semibold text-gray-800">Luồng: Kéo contacts → Sync tin nhắn Graph → Quét SĐT inbound → Tạo Lead</p>
            <p className="text-gray-500">Chạy liên tục theo batch. User mới nhất trước. Khi hết pool sẽ tự lặp lại.</p>
          </div>

          {/* KPI Cards — always show when has data */}
          {(running || auto.processed > 0) && (
            <div className="space-y-2">
              {/* Progress bar */}
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 text-center">
                <div className="bg-blue-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-blue-700">{auto.processed}</div>
                  <div className="text-[10px] text-blue-600">Đã xử lý</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-slate-700">{auto.totalPool || '—'}</div>
                  <div className="text-[10px] text-slate-500">Tổng pool</div>
                </div>
                <div className="bg-green-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-green-700">{auto.synced}</div>
                  <div className="text-[10px] text-green-600">Tin đồng bộ</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-amber-700">{auto.phonesFound}</div>
                  <div className="text-[10px] text-amber-600">SĐT tìm được</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-purple-700">{auto.leadsCreated}</div>
                  <div className="text-[10px] text-purple-600">Lead mới</div>
                </div>
                <div className="bg-teal-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-teal-700">{auto.leadsUpdated || 0}</div>
                  <div className="text-[10px] text-teal-600">Lead cập nhật</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-gray-700">{formatDuration(auto.startedAt)}</div>
                  <div className="text-[10px] text-gray-500">Thời gian</div>
                </div>
              </div>
              {(auto.errors > 0 || auto.syncErrors > 0) && (
                <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">
                  ⚠️ {auto.errors > 0 && `${auto.errors} lỗi`}
                  {auto.errors > 0 && auto.syncErrors > 0 && ' • '}
                  {auto.syncErrors > 0 && `${auto.syncErrors} sync lỗi (vẫn quét SĐT từ DB)`}
                </div>
              )}
            </div>
          )}

          {/* Config */}
          <div className="border border-amber-100 rounded-lg bg-amber-50/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setCfgOpen(o => !o)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-50/80 cursor-pointer transition"
            >
              <span className="flex items-center gap-2">
                <Settings2 className="h-3.5 w-3.5" />
                Cấu hình
              </span>
              {cfgOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {cfgOpen && (
              <div className="px-3 pb-3 pt-0 space-y-2 border-t border-amber-100/80 bg-white/60">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] pt-2">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-gray-600">Contacts/batch (1–1000)</span>
                    <input
                      type="number" min={1} max={1000}
                      className="border rounded-md px-2 py-1"
                      value={form.limit}
                      onChange={e => setForm(f => ({ ...f, limit: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-gray-600">Trang Graph/contact (1–30)</span>
                    <input
                      type="number" min={1} max={30}
                      className="border rounded-md px-2 py-1"
                      value={form.graphPages}
                      onChange={e => setForm(f => ({ ...f, graphPages: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-gray-600">Nghỉ giữa batch (giây)</span>
                    <input
                      type="number" min={0} max={3600}
                      className="border rounded-md px-2 py-1"
                      value={form.pauseSec}
                      onChange={e => setForm(f => ({ ...f, pauseSec: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-gray-600">Nghỉ cuối vòng (giây)</span>
                    <input
                      type="number" min={0} max={3600}
                      className="border rounded-md px-2 py-1"
                      value={form.cyclePauseSec}
                      onChange={e => setForm(f => ({ ...f, cyclePauseSec: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-gray-600">Delay/contact (ms)</span>
                    <input
                      type="number" min={0} max={5000}
                      className="border rounded-md px-2 py-1"
                      value={form.delayMs}
                      onChange={e => setForm(f => ({ ...f, delayMs: e.target.value }))}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={saving || running}
                  onClick={saveConfig}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
                </button>
              </div>
            )}
          </div>

          {/* Refresh button */}
          {typeof onComplete === 'function' && (
            <button
              type="button"
              onClick={() => onComplete()}
              disabled={running}
              className="text-[10px] font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40 cursor-pointer"
            >
              ↻ Làm mới danh sách liên hệ
            </button>
          )}

          {/* Logs */}
          {auto.logs && auto.logs.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-[11px] text-gray-300 space-y-0.5">
              {auto.logs.map((log, i) => (
                <div
                  key={`at-${i}`}
                  className={
                    log.level === 'error' ? 'text-red-400'
                    : log.level === 'ok' ? 'text-green-400'
                    : log.level === 'warn' ? 'text-yellow-400'
                    : 'text-gray-400'
                  }
                >
                  <span className="text-gray-600 mr-1.5">
                    {new Date(log.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  {log.text}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
