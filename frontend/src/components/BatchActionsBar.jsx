import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Plus, RefreshCw, Search, Phone, X, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Loader2, MessageCircle } from 'lucide-react';
import api from '../lib/api';
import { getSocket } from '../lib/socket';

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

const AUTO_INTERVAL_MS = 5 * 60 * 1000; // 5 phút
const AUTO_PIPELINE = ['sync_messages', 'create_leads', 'refresh_names', 'dedup', 'extract_phones'];

export default function BatchActionsBar({ onComplete }) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(null); // key of running action
  const [progress, setProgress] = useState(null); // { current, total, name, status }
  const [logs, setLogs] = useState([]); // recent log entries
  const [result, setResult] = useState(null); // final result
  const [error, setError] = useState(null);
  const [autoEnabled, setAutoEnabled] = useState(() => localStorage.getItem('batch_auto') !== 'off');
  const [countdown, setCountdown] = useState(0); // seconds remaining
  const [pipelineIndex, setPipelineIndex] = useState(-1); // -1 = not running pipeline
  const logsEndRef = useRef(null);
  const startTimeRef = useRef(null);
  const autoTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const lastAutoRunRef = useRef(Date.now());

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Socket.IO listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleProgress = (data) => {
      if (!running || data.type !== running) return;
      setProgress({ current: data.current, total: data.total, name: data.name, status: data.status });
      
      // Add to logs (keep last 50)
      const emoji = data.status === 'created' ? '✅' : data.status === 'updated' ? '✅' : data.status === 'found' ? '📞' : data.status === 'skipped' ? '⏭️' : data.status === 'error' ? '❌' : data.status === 'unchanged' ? '➖' : '🔍';
      const extra = data.phone ? ` — ${data.phone}` : data.code ? ` — ${data.code}` : '';
      setLogs(prev => [...prev.slice(-49), { 
        text: `${emoji} ${data.current}/${data.total} ${data.name || ''}${extra}`,
        status: data.status,
      }]);
    };

    const handleDone = (data) => {
      if (!running || data.type !== running) return;
      setResult(data);
      setRunning(null);
    };

    socket.on('batch_progress', handleProgress);
    socket.on('batch_done', handleDone);

    return () => {
      socket.off('batch_progress', handleProgress);
      socket.off('batch_done', handleDone);
    };
  }, [running]);

  const runAction = useCallback(async (action) => {
    if (running) return;

    // Dedup doesn't have socket progress — just run and show result
    setRunning(action.key);
    setProgress(null);
    setLogs([]);
    setResult(null);
    setError(null);
    setExpanded(true);
    startTimeRef.current = Date.now();

    try {
      const { data } = await api.post(`/${action.apiPath}`);
      // If no socket event came (dedup, or very fast), set result from response
      if (action.key === 'dedup' || !data.total) {
        setResult(data);
        setRunning(null);
      }
      // For others, batch_done socket event will set result
      // But set a safety timeout
      setTimeout(() => {
        setRunning(prev => {
          if (prev === action.key) {
            setResult(data);
            return null;
          }
          return prev;
        });
      }, 2000);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setRunning(null);
    }
  }, [running]);

  const handleComplete = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(null);
    setLogs([]);
    if (onComplete) onComplete();
  }, [onComplete]);

  // Run next step in pipeline
  const runPipelineStep = useCallback(async (index) => {
    if (index >= AUTO_PIPELINE.length) {
      // Pipeline xong
      setPipelineIndex(-1);
      lastAutoRunRef.current = Date.now();
      if (onComplete) onComplete();
      return;
    }
    const actionKey = AUTO_PIPELINE[index];
    const action = ACTIONS.find(a => a.key === actionKey);
    if (!action) { runPipelineStep(index + 1); return; }

    setPipelineIndex(index);
    setRunning(action.key);
    setProgress(null);
    setError(null);
    startTimeRef.current = Date.now();

    try {
      const { data } = await api.post(`/${action.apiPath}`);
      setLogs(prev => [...prev.slice(-49), {
        text: `✅ ${action.icon} ${action.label}: ${data.message || data.created || data.updated || data.merged || data.totalSynced || 'xong'}`,
        status: 'created',
      }]);
      setRunning(null);
      setResult(null);
      // Tiếp tục bước sau (delay 300ms)
      setTimeout(() => runPipelineStep(index + 1), 300);
    } catch (e) {
      setLogs(prev => [...prev.slice(-49), {
        text: `❌ ${action.icon} ${action.label}: ${e.response?.data?.error || e.message}`,
        status: 'error',
      }]);
      setRunning(null);
      // Vẫn tiếp tục pipeline dù lỗi
      setTimeout(() => runPipelineStep(index + 1), 300);
    }
  }, [onComplete]);

  // Run full pipeline
  const runFullPipeline = useCallback(() => {
    if (running || pipelineIndex >= 0) return;
    setLogs([{ text: '🚀 Bắt đầu pipeline tự động: Đồng bộ → Tạo Lead → Refresh → Gộp trùng → Quét SĐT', status: 'info' }]);
    setExpanded(true);
    setResult(null);
    setError(null);
    runPipelineStep(0);
  }, [running, pipelineIndex, runPipelineStep]);

  // Auto-run timer
  useEffect(() => {
    if (!autoEnabled) {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setCountdown(0);
      return;
    }

    // Update countdown every second
    countdownRef.current = setInterval(() => {
      const elapsed = Date.now() - lastAutoRunRef.current;
      const remaining = Math.max(0, Math.ceil((AUTO_INTERVAL_MS - elapsed) / 1000));
      setCountdown(remaining);
    }, 1000);

    // Check if should run
    autoTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastAutoRunRef.current;
      if (elapsed >= AUTO_INTERVAL_MS && !running && pipelineIndex < 0) {
        runFullPipeline();
      }
    }, 5000);

    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoEnabled, running, pipelineIndex, runFullPipeline]);

  // Toggle auto
  const toggleAuto = () => {
    const next = !autoEnabled;
    setAutoEnabled(next);
    localStorage.setItem('batch_auto', next ? 'on' : 'off');
    if (next) lastAutoRunRef.current = Date.now(); // reset timer
  };

  const formatCountdown = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0;
  const elapsed = startTimeRef.current ? Math.round((Date.now() - startTimeRef.current) / 1000) : 0;
  const activeAction = ACTIONS.find(a => a.key === running);
  const activeColor = activeAction ? COLOR_MAP[activeAction.color] : null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header — always visible */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 hover:bg-gray-50 transition cursor-pointer rounded-lg px-1 py-0.5"
        >
          <Zap className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-gray-800">⚡ Công cụ tự động</span>
          {running && (
            <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              {pipelineIndex >= 0 ? `Bước ${pipelineIndex + 1}/${AUTO_PIPELINE.length}` : 'Đang chạy...'}
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>

        <div className="flex items-center gap-3">
          {/* Countdown */}
          {autoEnabled && !running && countdown > 0 && (
            <span className="text-xs text-gray-400 font-mono">⏰ {formatCountdown(countdown)}</span>
          )}

          {/* Run now button */}
          <button
            onClick={runFullPipeline}
            disabled={!!running || pipelineIndex >= 0}
            className="px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer transition"
          >
            🚀 Chạy ngay
          </button>

          {/* Auto toggle */}
          <button
            onClick={toggleAuto}
            className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
              autoEnabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
            title={autoEnabled ? 'Tự động: Bật (5 phút/lần)' : 'Tự động: Tắt'}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              autoEnabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
          <span className="text-xs text-gray-500">{autoEnabled ? 'Auto' : 'Off'}</span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 space-y-3">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-3">
            {ACTIONS.map(action => {
              const c = COLOR_MAP[action.color];
              const isRunning = running === action.key;
              return (
                <button
                  key={action.key}
                  onClick={() => runAction(action)}
                  disabled={!!running}
                  className={`px-4 py-2 text-xs font-medium rounded-lg border flex items-center gap-2 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed ${c.bg} ${c.text} ${c.border} ${c.hover} ${isRunning ? 'ring-2 ring-offset-1' : ''}`}
                >
                  {isRunning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="text-sm">{action.icon}</span>
                  )}
                  {action.label}
                </button>
              );
            })}
          </div>

          {/* Progress bar */}
          {running && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span className="font-medium">
                  {activeAction?.icon} {progress.name || 'Đang xử lý...'}
                </span>
                <span className="font-mono">
                  {progress.current}/{progress.total} ({pct}%) — {elapsed}s
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${activeColor?.progressBg || 'bg-blue-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Realtime log */}
          {logs.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-[11px] text-gray-300 space-y-0.5">
              {logs.map((log, i) => (
                <div key={i} className={log.status === 'error' ? 'text-red-400' : log.status === 'created' || log.status === 'updated' || log.status === 'found' ? 'text-green-400' : 'text-gray-400'}>
                  {log.text}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}

          {/* Result banner */}
          {result && !running && (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium">
                  {result.message ? result.message : 
                   result.created != null ? `Đã tạo ${result.created} Lead — SĐT: ${result.phone_updated || 0} — Bỏ qua: ${result.skipped || 0}` :
                   result.updated != null ? `Đã cập nhật ${result.updated}/${result.total || '?'}` :
                   result.merged != null ? `Đã gộp ${result.merged} lead trùng (${result.groups || 0} nhóm)` :
                   JSON.stringify(result)}
                </span>
              </div>
              <button 
                onClick={handleComplete}
                className="text-xs text-emerald-600 hover:text-emerald-800 font-medium px-2 py-1 hover:bg-emerald-100 rounded cursor-pointer transition"
              >
                Đóng & Reload ↻
              </button>
            </div>
          )}

          {/* Error banner */}
          {error && !running && (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>❌ {error}</span>
              </div>
              <button 
                onClick={() => setError(null)}
                className="text-xs text-red-600 hover:text-red-800 font-medium cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
