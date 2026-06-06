import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Loader2, ChevronDown, ChevronUp, Settings2, Play, Phone, UserPlus } from 'lucide-react';
import api from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';

const EMPTY_STATE = {
  enabled: false,
  running: false,
  cycleCount: 0,
  currentContact: null,
  processed: 0,
  totalContacts: 0,
  phonesFound: 0,
  leadsCreated: 0,
  leadsUpdated: 0,
  errors: 0,
  logs: [],
  config: {
    limit: 100,
    batchesPerCycle: 1,
    pauseSec: 60,
    cyclePauseSec: 300,
    delayMs: 100,
    requirePhoneForLead: true,
    forceRescanPhones: false,
  },
};

let _state = { ...EMPTY_STATE };
const _subs = new Set();
let _socketBound = false;

function notify() { _subs.forEach((fn) => fn({ ..._state })); }

async function loadStatus() {
  try {
    const { data } = await api.get('/zalo/auto-tool/status');
    _state = { ...EMPTY_STATE, ...data };
    notify();
  } catch { /* keep */ }
}

function ensureSocket() {
  connectSocket();
  const socket = getSocket();
  if (!socket || _socketBound) return;
  _socketBound = true;
  socket.on('zalo_auto_tool_state', (s) => {
    _state = { ...EMPTY_STATE, ...s };
    notify();
  });
  socket.on('connect', () => loadStatus());
}

export async function startZaloAutoTool() {
  await api.post('/zalo/auto-tool/start');
  await loadStatus();
}

export async function stopZaloAutoTool() {
  await api.post('/zalo/auto-tool/stop');
  await loadStatus();
}

export async function toggleZaloAutoTool() {
  if (_state.enabled || _state.running) await stopZaloAutoTool();
  else await startZaloAutoTool();
}

export async function saveZaloAutoToolConfig(body) {
  await api.put('/zalo/auto-tool/config', body);
  await loadStatus();
}

export function useZaloAutoTool() {
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

function formatDuration(startedAt) {
  if (!startedAt) return '--';
  const s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}p ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}p`;
}

export default function ZaloAutoToolPanel({ onComplete = null, batchProgress = null }) {
  const auto = useZaloAutoTool();
  const [expanded, setExpanded] = useState(true);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_STATE.config });
  const [saving, setSaving] = useState(false);
  const [batchLoading, setBatchLoading] = useState(null);
  const [batchResult, setBatchResult] = useState(null);
  const [forceRescan, setForceRescan] = useState(false);
  const logsEndRef = useRef(null);

  useEffect(() => {
    if (auto.config) setForm((f) => ({ ...f, ...auto.config }));
  }, [auto.config]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [auto.logs]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await saveZaloAutoToolConfig({
        limit: parseInt(form.limit, 10) || 100,
        batchesPerCycle: parseInt(form.batchesPerCycle, 10) || 1,
        pauseSec: parseInt(form.pauseSec, 10) || 60,
        cyclePauseSec: parseInt(form.cyclePauseSec, 10) || 300,
        delayMs: parseInt(form.delayMs, 10) || 100,
        requirePhoneForLead: !!form.requirePhoneForLead,
        forceRescanPhones: !!form.forceRescanPhones,
      });
    } finally {
      setSaving(false);
    }
  };

  const runBatch = async (action) => {
    setBatchLoading(action);
    setBatchResult(null);
    try {
      let data;
      if (action === 'extract') {
        ({ data } = await api.post('/zalo/batch-extract-phones', { force_rescan_phones: forceRescan }));
      } else if (action === 'leads') {
        ({ data } = await api.post('/zalo/batch-create-leads', { require_phone: true }));
      } else {
        ({ data } = await api.post('/zalo/batch-scan-and-create-leads', {
          force_rescan_phones: forceRescan,
          require_phone: true,
        }));
      }
      setBatchResult(data);
      onComplete?.();
    } catch (e) {
      setBatchResult({ error: e.message });
    } finally {
      setBatchLoading(null);
    }
  };

  const running = auto.running;
  const progress = auto.totalContacts > 0
    ? Math.min(100, Math.round((auto.processed / auto.totalContacts) * 100))
    : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden space-y-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 hover:bg-slate-50 rounded-lg px-1 py-0.5"
        >
          <Zap className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-slate-800">Công cụ quét SĐT → Lead</span>
          {running && (
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              Vòng {auto.cycleCount} · {auto.processed}/{auto.totalContacts}
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleZaloAutoTool()}
            className={`relative w-10 h-5 rounded-full transition-colors ${auto.enabled ? 'bg-green-500' : 'bg-slate-300'}`}
            title={auto.enabled ? 'Auto: Bật' : 'Auto: Tắt'}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${auto.enabled ? 'translate-x-5' : ''}`} />
          </button>
          <span className="text-xs text-slate-500">{auto.enabled ? 'Auto' : 'Off'}</span>
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Tin Zalo đã lưu qua webhook — <strong>không cần đồng bộ Graph</strong>. Auto: quét tin inbound tìm SĐT → tạo/cập nhật Lead CRM (mặc định chỉ tạo khi có SĐT).
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!batchLoading}
              onClick={() => runBatch('extract')}
              className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
            >
              <Phone size={14} />
              {batchLoading === 'extract' ? 'Đang quét...' : 'Quét SĐT'}
            </button>
            <button
              type="button"
              disabled={!!batchLoading}
              onClick={() => runBatch('leads')}
              className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
            >
              <UserPlus size={14} />
              {batchLoading === 'leads' ? 'Đang tạo...' : 'Tạo Lead'}
            </button>
            <button
              type="button"
              disabled={!!batchLoading}
              onClick={() => runBatch('both')}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              <Play size={14} />
              {batchLoading === 'both' ? 'Đang chạy...' : 'Quét + Tạo Lead'}
            </button>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 ml-1">
              <input type="checkbox" checked={forceRescan} onChange={(e) => setForceRescan(e.target.checked)} />
              Quét lại cả KH đã có SĐT
            </label>
          </div>

          {batchProgress && (
            <p className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded">{batchProgress}</p>
          )}

          {batchResult && !batchResult.error && (
            <pre className="text-[10px] bg-slate-50 border rounded p-2 overflow-auto max-h-24">
              {JSON.stringify(batchResult, null, 2)}
            </pre>
          )}
          {batchResult?.error && (
            <p className="text-xs text-red-600">{batchResult.error}</p>
          )}

          {running && (
            <div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {auto.phonesFound} SĐT · {auto.leadsCreated} lead mới · {auto.leadsUpdated} cập nhật · {formatDuration(auto.startedAt)}
              </p>
            </div>
          )}

          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setCfgOpen(!cfgOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <span className="flex items-center gap-2"><Settings2 size={14} /> Cấu hình Auto</span>
              {cfgOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {cfgOpen && (
              <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs border-t border-slate-100 pt-2">
                {[
                  ['limit', 'Contact/batch'],
                  ['batchesPerCycle', 'Batch/vòng'],
                  ['pauseSec', 'Nghỉ giữa batch (s)'],
                  ['cyclePauseSec', 'Nghỉ cuối vòng (s)'],
                  ['delayMs', 'Delay/contact (ms)'],
                ].map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="text-slate-500">{label}</span>
                    <input
                      type="number"
                      value={form[key] ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full mt-0.5 border rounded px-2 py-1"
                    />
                  </label>
                ))}
                <label className="col-span-full flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    checked={!!form.requirePhoneForLead}
                    onChange={(e) => setForm((f) => ({ ...f, requirePhoneForLead: e.target.checked }))}
                  />
                  Chỉ tạo lead khi có SĐT
                </label>
                <label className="col-span-full flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!form.forceRescanPhones}
                    onChange={(e) => setForm((f) => ({ ...f, forceRescanPhones: e.target.checked }))}
                  />
                  Auto: quét lại SĐT cả lead đã có SĐT
                </label>
                <button
                  type="button"
                  onClick={saveConfig}
                  disabled={saving}
                  className="col-span-full mt-1 py-1.5 bg-slate-800 text-white rounded-lg text-xs disabled:opacity-50"
                >
                  {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
                </button>
              </div>
            )}
          </div>

          {auto.logs?.length > 0 && (
            <div className="max-h-32 overflow-y-auto text-[10px] font-mono bg-slate-900 text-slate-200 rounded p-2 space-y-0.5">
              {auto.logs.map((l, i) => (
                <div key={i} className={l.level === 'error' ? 'text-red-300' : l.level === 'ok' ? 'text-green-300' : ''}>
                  [{new Date(l.ts).toLocaleTimeString('vi-VN')}] {l.text}
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
