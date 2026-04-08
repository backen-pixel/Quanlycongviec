import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Plus, RefreshCw, Search, Phone, X, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { getSocket } from '../lib/socket';

const ACTIONS = [
  { key: 'create_leads', label: 'Tạo Lead hàng loạt', icon: '🆕', color: 'green', apiPath: '/facebook/batch-create-leads' },
  { key: 'refresh_names', label: 'Refresh tên', icon: '🔄', color: 'purple', apiPath: '/facebook/refresh-names' },
  { key: 'dedup', label: 'Gộp Lead trùng', icon: '🔍', color: 'orange', apiPath: '/facebook/dedup-leads' },
  { key: 'extract_phones', label: 'Quét SĐT & thông tin', icon: '📞', color: 'blue', apiPath: '/facebook/batch-extract-phones' },
];

const COLOR_MAP = {
  green:  { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  hover: 'hover:bg-green-100',  progressBg: 'bg-green-500' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', hover: 'hover:bg-purple-100', progressBg: 'bg-purple-500' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', hover: 'hover:bg-orange-100', progressBg: 'bg-orange-500' },
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   hover: 'hover:bg-blue-100',   progressBg: 'bg-blue-500' },
};

export default function BatchActionsBar({ onComplete }) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(null); // key of running action
  const [progress, setProgress] = useState(null); // { current, total, name, status }
  const [logs, setLogs] = useState([]); // recent log entries
  const [result, setResult] = useState(null); // final result
  const [error, setError] = useState(null);
  const logsEndRef = useRef(null);
  const startTimeRef = useRef(null);

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

  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0;
  const elapsed = startTimeRef.current ? Math.round((Date.now() - startTimeRef.current) / 1000) : 0;
  const activeAction = ACTIONS.find(a => a.key === running);
  const activeColor = activeAction ? COLOR_MAP[activeAction.color] : null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-gray-800">⚡ Công cụ tự động</span>
          {running && (
            <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              Đang chạy...
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

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
