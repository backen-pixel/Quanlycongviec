import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Loader2, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import api from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';
import { useBatchAuto, toggleBatchAuto, triggerPipelineNow, formatCountdown } from '../hooks/useBatchAutoRun';
import AutoPipelineMonitor from './AutoPipelineMonitor';

const ACTIONS = [
  { key: 'sync_messages', label: 'Đồng bộ tin nhắn', icon: '📨', color: 'teal', apiPath: 'facebook/batch-sync-messages' },
  { key: 'create_leads', label: 'Tạo Lead hàng loạt', icon: '🆕', color: 'green', apiPath: 'facebook/batch-create-leads' },
  { key: 'refresh_names', label: 'Refresh tên', icon: '🔄', color: 'purple', apiPath: 'facebook/refresh-names' },
  { key: 'dedup', label: 'Gộp Lead trùng', icon: '🔍', color: 'orange', apiPath: 'facebook/dedup-leads' },
  { key: 'sync_contact_phones', label: 'Sync SĐT danh bạ → Lead', icon: '🔗', color: 'sky', apiPath: 'facebook/sync-contact-phones' },
  { key: 'extract_phones', label: 'Quét SĐT & thông tin', icon: '📞', color: 'blue', apiPath: 'facebook/batch-extract-phones' },
];

const COLOR_MAP = {
  teal:   { bg: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-teal-200',   hover: 'hover:bg-teal-100',   progressBg: 'bg-teal-500' },
  green:  { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  hover: 'hover:bg-green-100',  progressBg: 'bg-green-500' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', hover: 'hover:bg-purple-100', progressBg: 'bg-purple-500' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', hover: 'hover:bg-orange-100', progressBg: 'bg-orange-500' },
  sky:    { bg: 'bg-sky-50',    text: 'text-sky-700',    border: 'border-sky-200',    hover: 'hover:bg-sky-100',    progressBg: 'bg-sky-500' },
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   hover: 'hover:bg-blue-100',   progressBg: 'bg-blue-500' },
};

export default function BatchActionsBar({ onComplete }) {
  const [expanded, setExpanded] = useState(false);
  // Manual single-action run state
  const [manualRunning, setManualRunning] = useState(null);
  const [manualProgress, setManualProgress] = useState(null);
  const [manualResult, setManualResult] = useState(null);
  const [manualError, setManualError] = useState(null);
  const [manualLogs, setManualLogs] = useState([]);
  const logsEndRef = useRef(null);

  // Global auto-run state
  const auto = useBatchAuto();

  useEffect(() => {
    connectSocket();
  }, []);

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
      setManualLogs(prev => [
        ...prev.slice(-79),
        `${data.current || 0}/${data.total || 0} ${data.name || ''} ${data.status || ''}`.trim(),
      ]);
    };
    const handleDone = (data) => {
      if (data.type !== manualRunning) return;
      setManualLogs(prev => [...prev.slice(-79), `Hoàn tất: ${data.updated || data.created || data.totalSynced || data.merged || 0}`]);
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
    setManualLogs([]);
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
              {auto.phase === 'manual_full_scan'
                ? `Chu kỳ ${auto.cycleCount} • Full scan cuối`
                : auto.totalBatches > 0
                  ? `Chu kỳ ${auto.cycleCount} • Batch ${auto.batchIndex}/${auto.totalBatches}`
                  : `Chu kỳ ${auto.cycleCount} • Đếm contacts...`
              }
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
          {/* Countdown removed: pipeline runs continuously */}

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
            title={auto.enabled ? 'Tự động: Bật (backend realtime)' : 'Tự động: Tắt'}
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
          <p className="text-[10px] text-gray-500 leading-relaxed bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100">
            Auto &amp; đồng bộ <strong>smart</strong>: bỏ qua hội thoại KH <strong>không có tin inbound</strong> quá <strong>48 giờ</strong> (giảm gọi Facebook API). Chạy tay «Đồng bộ tin nhắn» (full) vẫn quét đủ. Cần chạy SQL <code className="text-[9px]">50_fb_last_inbound_rpc.sql</code> trên DB.
          </p>

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

          {/* Auto pipeline progress — KPI + Per-batch table */}
          <AutoPipelineMonitor auto={auto} />

          {/* Logs (auto + manual) */}
          {(auto.logs.length > 0 || manualLogs.length > 0) && (
            <div className="bg-gray-900 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-[11px] text-gray-300 space-y-0.5">
              {auto.logs.map((log, i) => (
                <div key={`a-${i}`} className={log.status === 'error' ? 'text-red-400' : log.status === 'ok' || log.status === 'created' ? 'text-green-400' : 'text-gray-400'}>
                  {log.text}
                </div>
              ))}
              {manualLogs.map((log, i) => (
                <div key={`m-${i}`} className="text-blue-300">
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}

          {/* Manual result */}
          {manualResult && !manualRunning && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium">
                    {manualResult.message ? manualResult.message :
                     manualResult.created != null ? `Đã tạo ${manualResult.created} Lead` :
                     manualResult.merged != null ? `Đã gộp ${manualResult.merged} lead trùng` :
                     manualResult.alreadyHad != null ? `Sync SĐT: cập nhật ${manualResult.updated}/${manualResult.total} contact` :
                     manualResult.updated != null ? `Hoàn tất quét ${manualResult.total || '?'} contacts` :
                     JSON.stringify(manualResult)}
                  </span>
                </div>
                <button onClick={() => { setManualResult(null); if (onComplete) onComplete(); }}
                  className="text-xs text-emerald-600 hover:text-emerald-800 font-medium px-2 py-1 hover:bg-emerald-100 rounded cursor-pointer transition">
                  Đóng & Reload ↻
                </button>
              </div>

              {/* Chi tiết sync_contact_phones */}
              {manualResult.alreadyHad != null && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="bg-white rounded-lg p-2 border">Tổng có SĐT: <strong>{manualResult.total || 0}</strong></div>
                    <div className="bg-green-100 rounded-lg p-2 border border-green-300">Đã cập nhật: <strong className="text-green-800">{manualResult.updated || 0}</strong></div>
                    <div className="bg-gray-100 rounded-lg p-2 border">Đã có rồi: <strong>{manualResult.alreadyHad || 0}</strong></div>
                    <div className="bg-amber-100 rounded-lg p-2 border border-amber-300">Không có lead: <strong className="text-amber-800">{manualResult.noLead || 0}</strong></div>
                  </div>
                  {manualResult.details?.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-emerald-700 font-medium hover:underline">📋 {manualResult.details.length} lead được gắn SĐT từ danh bạ</summary>
                      <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg bg-white">
                        <table className="w-full">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="text-left px-2 py-1.5">Mã</th>
                              <th className="text-left px-2 py-1.5">Tên Lead / FB</th>
                              <th className="text-left px-2 py-1.5">SĐT</th>
                              <th className="text-left px-2 py-1.5">Cập nhật</th>
                            </tr>
                          </thead>
                          <tbody>
                            {manualResult.details.map((d, idx) => (
                              <tr key={idx} className="border-t hover:bg-gray-50">
                                <td className="px-2 py-1.5 text-blue-600 font-mono text-xs">{d.lead_code}</td>
                                <td className="px-2 py-1.5 truncate max-w-[120px] text-xs">{d.lead_title || d.fb_name}</td>
                                <td className="px-2 py-1.5 text-green-700 font-mono text-xs">{d.phone}</td>
                                <td className="px-2 py-1.5 text-gray-400 text-xs">
                                  {[d.updated_customer && 'KH', d.updated_desc && 'Mô tả'].filter(Boolean).join(', ')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </div>
              )}

              {/* Chi tiết quét SĐT từ tin nhắn */}
              {manualResult.updatedContactPhone != null && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="bg-white rounded-lg p-2 border">Contact cập nhật SĐT: <strong className="text-green-700">{manualResult.updatedContactPhone || 0}</strong></div>
                    <div className="bg-white rounded-lg p-2 border">Customer cập nhật SĐT: <strong className="text-blue-700">{manualResult.updatedCustomerPhone || 0}</strong></div>
                    <div className="bg-white rounded-lg p-2 border">Địa chỉ KH: <strong className="text-purple-700">{manualResult.updatedCustomerAddress || 0}</strong></div>
                    <div className="bg-white rounded-lg p-2 border">Lead mô tả: <strong className="text-amber-700">{manualResult.updatedLeadDescription || 0}</strong></div>
                  </div>
                  {manualResult.leadsUpdatedPhone != null && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                      <div className="bg-green-100 rounded-lg p-2 border border-green-300">Lead được gắn SĐT: <strong className="text-green-800">{manualResult.leadsUpdatedPhone}</strong></div>
                      <div className="bg-blue-100 rounded-lg p-2 border border-blue-300">Lead có SĐT: <strong className="text-blue-800">{manualResult.leadsWithPhone || 0}/{manualResult.totalLeads || 0}</strong></div>
                      <div className="bg-red-100 rounded-lg p-2 border border-red-300">Lead còn thiếu SĐT: <strong className="text-red-800">{manualResult.leadsStillMissingPhone || 0}</strong></div>
                    </div>
                  )}
                  {manualResult.leadsUpdatedList?.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-emerald-700 font-medium hover:underline">Danh sách {manualResult.leadsUpdatedList.length} lead đã cập nhật SĐT</summary>
                      <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg bg-white">
                        <table className="w-full">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="text-left px-2 py-1.5">Mã</th>
                              <th className="text-left px-2 py-1.5">Tên Lead</th>
                              <th className="text-left px-2 py-1.5">SĐT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {manualResult.leadsUpdatedList.map((l, idx) => (
                              <tr key={idx} className="border-t hover:bg-gray-50">
                                <td className="px-2 py-1.5 text-blue-600 font-mono">{l.code}</td>
                                <td className="px-2 py-1.5">{l.title}</td>
                                <td className="px-2 py-1.5 text-green-700 font-mono">{l.phone}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </div>
              )}
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
