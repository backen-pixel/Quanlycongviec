import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Loader2, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import api from '../lib/api';
import { getSocket } from '../lib/socket';
import { useBatchAuto, toggleBatchAuto, triggerPipelineNow, formatCountdown } from '../hooks/useBatchAutoRun';

const ACTIONS = [
  { key: 'sync_messages', label: 'Đồng bộ tin nhắn', icon: '📨', color: 'teal', apiPath: 'facebook/batch-sync-messages' },
  { key: 'create_leads', label: 'Tạo Lead hàng loạt', icon: '🆕', color: 'green', apiPath: 'facebook/batch-create-leads' },
  { key: 'refresh_names', label: 'Refresh tên', icon: '🔄', color: 'purple', apiPath: 'facebook/refresh-names' },
  { key: 'dedup', label: 'Gộp Lead trùng', icon: '🔍', color: 'orange', apiPath: 'facebook/dedup-leads' },
  { key: 'extract_phones', label: 'Quét SĐT & thông tin', icon: '📞', color: 'blue', apiPath: 'facebook/batch-extract-phones' },
];

const COLOR_MAP = {
  teal:   { bg: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-teal-200',   hover: 'hover:bg-teal-100',   progressBg: 'bg-teal-500' },
  green:  { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  hover: 'hover:bg-green-100',  progressBg: 'bg-green-500' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', hover: 'hover:bg-purple-100', progressBg: 'bg-purple-500' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', hover: 'hover:bg-orange-100', progressBg: 'bg-orange-500' },
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   hover: 'hover:bg-blue-100',   progressBg: 'bg-blue-500' },
};

export default function BatchActionsBar({ onComplete }) {
  const [expanded, setExpanded] = useState(false);
  // Manual single-action run state
  const [manualRunning, setManualRunning] = useState(null);
  const [manualProgress, setManualProgress] = useState(null);
  const [manualResult, setManualResult] = useState(null);
  const [manualError, setManualError] = useState(null);
  const logsEndRef = useRef(null);

  // Global auto-run state
  const auto = useBatchAuto();

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [auto.logs, manualProgress]);

  // Socket.IO for manual single-action progress
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !manualRunning) return;

    const handleProgress = (data) => {
      if (data.type !== manualRunning) return;
      setManualProgress({ current: data.current, total: data.total, name: data.name, status: data.status });
    };
    const handleDone = (data) => {
      if (data.type !== manualRunning) return;
      setManualResult(data);
      setManualRunning(null);
    };

    socket.on('batch_progress', handleProgress);
    socket.on('batch_done', handleDone);
    return () => { socket.off('batch_progress', handleProgress); socket.off('batch_done', handleDone); };
  }, [manualRunning]);

  // Run single action manually
  const runSingleAction = useCallback(async (action) => {
    if (manualRunning || auto.running) return;
    setManualRunning(action.key);
    setManualProgress(null);
    setManualResult(null);
    setManualError(null);
    setExpanded(true);

    try {
      // Thủ công: luôn chạy mode 'all' (đồng bộ tất cả, không smart filter)
      const body = action.key === 'sync_messages' ? { mode: 'all' } : {};
      const { data } = await api.post(`/${action.apiPath}`, body);
      if (action.key === 'dedup' || !data.total) {
        setManualResult(data);
        setManualRunning(null);
      }
      setTimeout(() => {
        setManualRunning(prev => {
          if (prev === action.key) { setManualResult(data); return null; }
          return prev;
        });
      }, 2000);
    } catch (e) {
      setManualError(e.response?.data?.error || e.message);
      setManualRunning(null);
    }
  }, [manualRunning, auto.running]);

  const isAnyRunning = !!manualRunning || auto.running;
  const pct = manualProgress ? Math.round((manualProgress.current / manualProgress.total) * 100) : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 hover:bg-gray-50 transition cursor-pointer rounded-lg px-1 py-0.5"
        >
          <Zap className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-gray-800">⚡ Công cụ tự động</span>
          {auto.running && (
            <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              Bước {auto.step + 1}/{auto.totalSteps}
            </span>
          )}
          {manualRunning && !auto.running && (
            <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              Đang chạy...
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>

        <div className="flex items-center gap-3">
          {/* Countdown (realtime, always visible) */}
          {auto.enabled && !isAnyRunning && auto.countdown > 0 && (
            <span className="text-xs text-gray-400 font-mono">⏰ {formatCountdown(auto.countdown)}</span>
          )}

          {/* Run now */}
          <button
            onClick={triggerPipelineNow}
            disabled={isAnyRunning}
            className="px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer transition"
          >
            🚀 Chạy ngay
          </button>

          {/* Auto toggle */}
          <button
            onClick={toggleBatchAuto}
            className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
              auto.enabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
            title={auto.enabled ? 'Tự động: Bật (5 phút/lần)' : 'Tự động: Tắt'}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              auto.enabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
          <span className="text-xs text-gray-500">{auto.enabled ? 'Auto' : 'Off'}</span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 space-y-3">
          {/* Action buttons (manual run) */}
          <div className="flex flex-wrap gap-2 pt-3">
            {ACTIONS.map(action => {
              const c = COLOR_MAP[action.color];
              const isRunning = manualRunning === action.key;
              const isAutoStep = auto.running && auto.step >= 0 && ACTIONS[auto.step]?.key === action.key;
              return (
                <button
                  key={action.key}
                  onClick={() => runSingleAction(action)}
                  disabled={isAnyRunning}
                  className={`px-4 py-2 text-xs font-medium rounded-lg border flex items-center gap-2 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed ${c.bg} ${c.text} ${c.border} ${c.hover} ${isRunning || isAutoStep ? 'ring-2 ring-offset-1' : ''}`}
                >
                  {isRunning || isAutoStep ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="text-sm">{action.icon}</span>
                  )}
                  {action.label}
                </button>
              );
            })}
          </div>

          {/* Manual progress bar */}
          {manualRunning && manualProgress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span className="font-medium">{manualProgress.name || 'Đang xử lý...'}</span>
                <span className="font-mono">{manualProgress.current}/{manualProgress.total} ({pct}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300 bg-blue-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {/* Auto pipeline progress */}
          {auto.running && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span className="font-medium">{auto.stepLabel || 'Đang xử lý...'}</span>
                {auto.syncTotal > 0 && (
                  <span className="font-mono text-teal-600">
                    ĐB: {auto.syncOffset}/{auto.syncTotal} ({Math.round(auto.syncOffset/auto.syncTotal*100)}%)
                  </span>
                )}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300 bg-amber-500"
                  style={{ width: auto.syncTotal > 0 ? `${Math.round(auto.syncOffset/auto.syncTotal*100)}%` : '50%' }} />
              </div>
            </div>
          )}

          {/* Logs (auto + manual) */}
          {auto.logs.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-[11px] text-gray-300 space-y-0.5">
              {auto.logs.map((log, i) => (
                <div key={i} className={log.status === 'error' ? 'text-red-400' : log.status === 'ok' || log.status === 'created' ? 'text-green-400' : 'text-gray-400'}>
                  {log.text}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}

          {/* Manual result */}
          {manualResult && !manualRunning && (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium">
                  {manualResult.message ? manualResult.message :
                   manualResult.created != null ? `Đã tạo ${manualResult.created} Lead` :
                   manualResult.updated != null ? `Đã cập nhật ${manualResult.updated}/${manualResult.total || '?'}` :
                   manualResult.merged != null ? `Đã gộp ${manualResult.merged} lead trùng` :
                   JSON.stringify(manualResult)}
                </span>
              </div>
              <button onClick={() => { setManualResult(null); if (onComplete) onComplete(); }}
                className="text-xs text-emerald-600 hover:text-emerald-800 font-medium px-2 py-1 hover:bg-emerald-100 rounded cursor-pointer transition">
                Đóng & Reload ↻
              </button>
            </div>
          )}

          {/* Manual error */}
          {manualError && !manualRunning && (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>❌ {manualError}</span>
              </div>
              <button onClick={() => setManualError(null)} className="text-xs text-red-600 hover:text-red-800 font-medium cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
