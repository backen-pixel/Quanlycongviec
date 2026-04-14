import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Loader2, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import api from '../lib/api';
import { connectSocket } from '../lib/socket';
import { useBatchAuto, toggleBatchAuto, triggerPipelineNow, saveFbAutoPipelineConfig } from '../hooks/useBatchAutoRun';
import AutoPipelineMonitor from './AutoPipelineMonitor';

const PIPELINE_FORM_EMPTY = {
  engine: 'full_cycle',
  full_cycle_max_users_per_round: 500,
  chain_chunk_users: 500,
  chain_sort: 'newest_first',
  chain_recent_hours: 48,
  chain_skip_stale: false,
  chain_graph_pages: 15,
  chain_final_lead_sync: true,
  chain_run_graph_sync: true,
  chain_run_extract: true,
};

export default function BatchActionsBar({ onComplete = null }) {
  const [expanded, setExpanded] = useState(false);
  const [pipelineCfgOpen, setPipelineCfgOpen] = useState(false);
  const [showAdvancedEngines, setShowAdvancedEngines] = useState(false);
  const [plForm, setPlForm] = useState(PIPELINE_FORM_EMPTY);
  const [plSaving, setPlSaving] = useState(false);
  const logsEndRef = useRef(null);

  const auto = useBatchAuto();

  useEffect(() => {
    connectSocket();
  }, []);

  const loadPipelineForm = useCallback(async () => {
    try {
      const { data } = await api.get('/facebook/auto-pipeline/config');
      const merged = { ...PIPELINE_FORM_EMPTY, ...(data?.defaults || {}), ...(data?.config || {}) };
      setPlForm(merged);
      setShowAdvancedEngines(merged.engine === 'chain' || merged.engine === 'legacy');
    } catch {
      setPlForm((prev) => ({ ...PIPELINE_FORM_EMPTY, ...prev }));
    }
  }, []);

  useEffect(() => {
    if (expanded && pipelineCfgOpen) loadPipelineForm();
  }, [expanded, pipelineCfgOpen, loadPipelineForm]);

  const savePipelineForm = useCallback(async () => {
    setPlSaving(true);
    try {
      const engine =
        showAdvancedEngines && ['chain', 'legacy', 'full_cycle'].includes(plForm.engine)
          ? plForm.engine
          : 'full_cycle';
      await saveFbAutoPipelineConfig({
        engine,
        full_cycle_max_users_per_round: Math.min(500000, Math.max(0, Number(plForm.full_cycle_max_users_per_round) || 0)),
        chain_chunk_users: Math.min(500, Math.max(1, Number(plForm.chain_chunk_users) || 500)),
        chain_sort: plForm.chain_sort === 'oldest_first' ? 'oldest_first' : 'newest_first',
        chain_recent_hours: Math.min(168, Math.max(0, Number(plForm.chain_recent_hours) || 0)),
        chain_skip_stale: !!plForm.chain_skip_stale,
        chain_graph_pages: Math.min(30, Math.max(1, Number(plForm.chain_graph_pages) || 15)),
        chain_final_lead_sync: !!plForm.chain_final_lead_sync,
        chain_run_graph_sync: !!plForm.chain_run_graph_sync,
        chain_run_extract: !!plForm.chain_run_extract,
      });
      if (!showAdvancedEngines) setPlForm((f) => ({ ...f, engine: 'full_cycle' }));
    } finally {
      setPlSaving(false);
    }
  }, [plForm, showAdvancedEngines]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [auto.logs]);

  const running = auto.running;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 hover:bg-gray-50 transition cursor-pointer rounded-lg px-1 py-0.5"
        >
          <Zap className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-gray-800">⚡ Công cụ tự động Facebook → Lead</span>
          {auto.running && (
            <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              {auto.phase === 'manual_full_scan'
                ? `Chu kỳ ${auto.cycleCount} • Full scan cuối`
                : auto.totalBatches > 0
                  ? `Chu kỳ ${auto.cycleCount} • ${auto.pipelineConfig?.engine === 'chain' ? 'Chain' : auto.pipelineConfig?.engine === 'legacy' ? 'Legacy' : 'Danh bạ→CRM'} ${auto.batchIndex}/${auto.totalBatches}`
                  : `Chu kỳ ${auto.cycleCount} • Đếm contacts...`}
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={triggerPipelineNow}
            disabled={running}
            className="px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer transition"
          >
            🚀 Chạy ngay
          </button>

          <button
            type="button"
            onClick={toggleBatchAuto}
            className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
              auto.enabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
            title={auto.enabled ? 'Tự động: Bật (backend realtime)' : 'Tự động: Tắt'}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                auto.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-xs text-gray-500">{auto.enabled ? 'Auto' : 'Off'}</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 space-y-3">
          <div className="pt-3 text-[11px] text-gray-700 space-y-2">
            <p className="font-semibold text-gray-800">Thứ tự mỗi vòng Auto</p>
            <ol className="list-decimal list-inside space-y-1.5 text-gray-600 leading-relaxed">
              <li>
                <strong className="text-gray-800">Đồng bộ tin nhắn + Quét SĐT</strong> — cùng API với chạy tay:{' '}
                <code className="text-[9px] bg-gray-100 px-0.5 rounded">batch-sync-messages</code> (mode all theo offset) rồi{' '}
                <code className="text-[9px] bg-gray-100 px-0.5 rounded">batch-extract-phones</code> (lô), lặp hết pool pipeline.
              </li>
              <li>
                <strong className="text-gray-800">🆕 Tạo Lead hàng loạt</strong>
              </li>
              <li>
                <strong className="text-gray-800">🔄 Refresh tên</strong>
              </li>
              <li>
                <strong className="text-gray-800">🔍 Xóa Lead trùng</strong>
              </li>
              <li>
                <strong className="text-gray-800">🔗 Sync SĐT danh bạ → Lead</strong>
              </li>
            </ol>
            <p className="text-[10px] text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-100 leading-relaxed">
              Không còn luồng «Sync→Quét từng contact» riêng: Auto = gọi lần lượt các endpoint giống thao tác thủ công. Engine <strong>Chain</strong> trong cấu hình vẫn là đồng bộ+quét kiểu Danh bạ (từng user). Lọc stale cần SQL{' '}
              <code className="text-[9px]">50_fb_last_inbound_rpc.sql</code> nếu dùng.
            </p>
          </div>

          <div className="border border-amber-100 rounded-lg bg-amber-50/40 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setPipelineCfgOpen((o) => {
                  const next = !o;
                  if (next) setExpanded(true);
                  return next;
                });
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-50/80 cursor-pointer transition"
            >
              <span className="flex items-center gap-2">
                <Settings2 className="h-3.5 w-3.5" />
                Cấu hình Auto (Sync→Quét + giới hạn / vòng)
              </span>
              {pipelineCfgOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {pipelineCfgOpen && (
              <div className="px-3 pb-3 pt-0 space-y-2 border-t border-amber-100/80 bg-white/60">
                <p className="text-[10px] text-gray-600 pt-2 leading-relaxed">
                  <strong>Sync→Quét</strong>: số user mỗi lần chunk (tối đa 500) × số vòng lặp trong bước 1 cho tới <strong>giới hạn user/vòng</strong> (0 = xử lý hết pool một lượt), rồi <strong>Tạo Lead → Refresh → Xóa lead trùng</strong>.
                </p>
                <label className="inline-flex items-center gap-2 text-[10px] text-gray-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showAdvancedEngines}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setShowAdvancedEngines(on);
                      if (!on) setPlForm((f) => ({ ...f, engine: 'full_cycle' }));
                    }}
                  />
                  Hiện engine Chain / Legacy
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {showAdvancedEngines ? (
                    <label className="flex flex-col gap-0.5 sm:col-span-2">
                      <span className="text-gray-600">Engine</span>
                      <select
                        className="border rounded-md px-2 py-1 bg-white"
                        value={['full_cycle', 'chain', 'legacy'].includes(plForm.engine) ? plForm.engine : 'full_cycle'}
                        onChange={(e) => setPlForm((f) => ({ ...f, engine: e.target.value }))}
                      >
                        <option value="full_cycle">Danh bạ → Lead → Refresh → Xóa trùng</option>
                        <option value="chain">Chain (chỉ Sync→Quét)</option>
                        <option value="legacy">Legacy (batch cũ)</option>
                      </select>
                    </label>
                  ) : (
                    <p className="text-[10px] text-amber-800 sm:col-span-2 py-1">
                      Engine: <strong>Danh bạ → CRM</strong> (full_cycle)
                    </p>
                  )}
                  <label className="flex flex-col gap-0.5">
                    <span className="text-gray-600">User mỗi lần Sync→Quét (chunk, 1–500, mặc định 500)</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      className="border rounded-md px-2 py-1"
                      value={plForm.chain_chunk_users}
                      onChange={(e) => setPlForm((f) => ({ ...f, chain_chunk_users: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-gray-600">Tối đa user Sync→Quét / vòng (0 = hết pool)</span>
                    <input
                      type="number"
                      min={0}
                      max={500000}
                      className="border rounded-md px-2 py-1"
                      value={plForm.full_cycle_max_users_per_round ?? 500}
                      onChange={(e) => setPlForm((f) => ({ ...f, full_cycle_max_users_per_round: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-gray-600">Thứ tự pool</span>
                    <select
                      className="border rounded-md px-2 py-1 bg-white"
                      value={plForm.chain_sort === 'oldest_first' ? 'oldest_first' : 'newest_first'}
                      onChange={(e) => setPlForm((f) => ({ ...f, chain_sort: e.target.value }))}
                    >
                      <option value="newest_first">Mới nhất trước</option>
                      <option value="oldest_first">Cũ nhất trước</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-gray-600">Pool theo giờ (0 = cả pool)</span>
                    <input
                      type="number"
                      min={0}
                      max={168}
                      className="border rounded-md px-2 py-1"
                      value={plForm.chain_recent_hours}
                      onChange={(e) => setPlForm((f) => ({ ...f, chain_recent_hours: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-gray-600">Graph: tối đa trang / user</span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      className="border rounded-md px-2 py-1"
                      value={plForm.chain_graph_pages}
                      onChange={(e) => setPlForm((f) => ({ ...f, chain_graph_pages: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-3 text-[11px] text-gray-700">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!plForm.chain_skip_stale}
                      onChange={(e) => setPlForm((f) => ({ ...f, chain_skip_stale: e.target.checked }))}
                    />
                    Lọc stale
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!plForm.chain_run_graph_sync}
                      onChange={(e) => setPlForm((f) => ({ ...f, chain_run_graph_sync: e.target.checked }))}
                    />
                    Đồng bộ Graph
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!plForm.chain_run_extract}
                      onChange={(e) => setPlForm((f) => ({ ...f, chain_run_extract: e.target.checked }))}
                    />
                    Quét SĐT (DB)
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!plForm.chain_final_lead_sync}
                      onChange={(e) => setPlForm((f) => ({ ...f, chain_final_lead_sync: e.target.checked }))}
                    />
                    Vòng cuối: SĐT → mô tả lead
                  </label>
                </div>
                <button
                  type="button"
                  disabled={plSaving || running}
                  onClick={savePipelineForm}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  {plSaving ? 'Đang lưu…' : 'Lưu cấu hình'}
                </button>
              </div>
            )}
          </div>

          <AutoPipelineMonitor auto={auto} />

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

          {auto.logs.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-[11px] text-gray-300 space-y-0.5">
              {auto.logs.map((log, i) => (
                <div
                  key={`a-${i}`}
                  className={
                    log.status === 'error'
                      ? 'text-red-400'
                      : log.status === 'ok' || log.status === 'created'
                        ? 'text-green-400'
                        : 'text-gray-400'
                  }
                >
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
