import { useState, useEffect, useCallback } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isSystemAdmin } from '../lib/adminRole';
import { loadStatusAll } from '../hooks/useBatchAutoRun';

const EMPTY = {
  enabled: false,
  run_minutes: 60,
  rest_minutes: 30,
  phase: null,
  timer_active: false,
  master_current: false,
  next_transition_at: null,
  next_phase: null,
  last_action: null,
  last_action_at: null,
};

const RUN_PRESETS = [
  { value: 15, label: '15 phút' },
  { value: 30, label: '30 phút' },
  { value: 60, label: '1 giờ' },
  { value: 120, label: '2 giờ' },
  { value: 180, label: '3 giờ' },
  { value: 360, label: '6 giờ' },
  { value: 720, label: '12 giờ' },
  { value: 1440, label: '24 giờ' },
];

const REST_PRESETS = [
  { value: 5, label: '5 phút' },
  { value: 15, label: '15 phút' },
  { value: 30, label: '30 phút' },
  { value: 60, label: '1 giờ' },
  { value: 120, label: '2 giờ' },
  { value: 360, label: '6 giờ' },
  { value: 720, label: '12 giờ' },
];

function formatMinutesLabel(mins) {
  const m = Math.max(1, parseInt(mins, 10) || 0);
  if (m < 60) return `${m} phút`;
  if (m % 60 === 0) return `${m / 60} giờ`;
  return `${Math.floor(m / 60)}h ${m % 60}p`;
}

function buildIntervalOptions(presets, current) {
  const v = Math.max(1, parseInt(current, 10) || 60);
  if (presets.some((p) => p.value === v)) return presets;
  return [...presets, { value: v, label: formatMinutesLabel(v) }].sort((a, b) => a.value - b.value);
}

function fmtTs(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function FbMasterSchedulePanel() {
  const { user } = useAuth();
  const canManage = isSystemAdmin(user);
  const [cfg, setCfg] = useState(EMPTY);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const loadLogs = useCallback(async () => {
    if (!canManage) return;
    try {
      const { data } = await api.get('/facebook/auto-pipeline/master-schedule/logs', { params: { limit: 25 } });
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch {
      setLogs([]);
    }
  }, [canManage]);

  const loadCfg = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get('/facebook/auto-pipeline/master-schedule/config');
      setCfg({ ...EMPTY, ...(data && typeof data === 'object' ? data : {}) });
      setForbidden(false);
      await loadLogs();
    } catch (e) {
      if (e?.response?.status === 403) setForbidden(true);
    } finally {
      setLoading(false);
    }
  }, [canManage, loadLogs]);

  useEffect(() => {
    void loadCfg();
    if (!canManage) return undefined;
    const id = setInterval(() => void loadCfg(), 30_000);
    return () => clearInterval(id);
  }, [loadCfg, canManage]);

  const saveCfg = async (patch) => {
    if (!canManage || saving) return;
    setSaving(true);
    try {
      const merged = { ...cfg, ...patch };
      const body = {
        enabled: !!merged.enabled,
        run_minutes: Math.max(1, parseInt(merged.run_minutes, 10) || 60),
        rest_minutes: Math.max(1, parseInt(merged.rest_minutes, 10) || 30),
      };
      const { data } = await api.put('/facebook/auto-pipeline/master-schedule/config', body);
      setCfg({ ...EMPTY, ...(data && typeof data === 'object' ? data : body) });
      await loadStatusAll();
      await loadLogs();
    } catch (e) {
      alert(e?.response?.data?.error || e.message || 'Lỗi lưu lịch');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage || forbidden) return null;

  if (loading && !cfg.enabled && cfg.run_minutes === 60) {
    return (
      <div className="bg-white border border-indigo-100 rounded-xl p-4 text-xs text-gray-400 flex items-center gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải chu kỳ công tắc tổng…
      </div>
    );
  }

  const runOptions = buildIntervalOptions(RUN_PRESETS, cfg.run_minutes);
  const restOptions = buildIntervalOptions(REST_PRESETS, cfg.rest_minutes);
  const nextLabel = cfg.next_transition_at
    ? new Date(cfg.next_transition_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';
  const phaseLabel = cfg.phase === 'run' ? 'Đang chạy' : cfg.phase === 'rest' ? 'Đang nghỉ' : '—';
  const nextPhaseLabel = cfg.next_phase === 'run' ? 'bật công tắc' : cfg.next_phase === 'rest' ? 'tắt công tắc' : '—';

  return (
    <div className="bg-white border border-indigo-100 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-indigo-50 bg-indigo-50/40">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="h-4 w-4 text-indigo-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-indigo-900">Chu kỳ công tắc Tổng</p>
            <p className="text-[11px] text-indigo-700/80 leading-snug mt-0.5">
              Bật công tắc tổng trong <strong>{formatMinutesLabel(cfg.run_minutes)}</strong>, tắt nghỉ{' '}
              <strong>{formatMinutesLabel(cfg.rest_minutes)}</strong>, rồi tự chạy lại — lặp liên tục.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={!!cfg.enabled}
            disabled={saving}
            onClick={() => void saveCfg({ enabled: !cfg.enabled })}
            className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
              cfg.enabled ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                cfg.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={`text-xs font-medium whitespace-nowrap ${cfg.enabled ? 'text-indigo-700' : 'text-gray-500'}`}>
            {cfg.enabled ? 'Lịch bật' : 'Lịch tắt'}
          </span>
        </label>
      </div>

      <div className="px-4 py-3 space-y-3">
        {cfg.enabled && (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className={`px-2 py-0.5 rounded-full font-medium ${
              cfg.phase === 'run' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
            }`}>
              {phaseLabel}
            </span>
            <span className={`px-2 py-0.5 rounded-full font-medium ${
              cfg.master_current ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-600'
            }`}>
              Công tắc: {cfg.master_current ? 'BẬT' : 'TẮT'}
            </span>
            <span className={`px-2 py-0.5 rounded-full font-medium ${
              cfg.timer_active ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {cfg.timer_active ? 'Đã hẹn lượt tiếp' : 'Chưa hẹn'}
            </span>
            <span className="text-gray-500">
              Tiếp theo ({nextPhaseLabel}): <strong className="text-gray-800">{nextLabel}</strong>
            </span>
            <button
              type="button"
              onClick={() => void loadCfg()}
              disabled={saving}
              className="ml-auto text-indigo-600 hover:underline cursor-pointer disabled:opacity-50"
            >
              Làm mới
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[11px]">
            <span className="text-gray-600 font-medium">Thời gian chạy (bật công tắc tổng)</span>
            <select
              value={Math.max(1, parseInt(cfg.run_minutes, 10) || 60)}
              disabled={saving}
              onChange={(e) => void saveCfg({ run_minutes: parseInt(e.target.value, 10) })}
              className="border rounded-lg px-2 py-1.5 text-xs bg-white cursor-pointer disabled:opacity-50"
            >
              {runOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px]">
            <span className="text-gray-600 font-medium">Thời gian nghỉ (tắt công tắc tổng)</span>
            <select
              value={Math.max(1, parseInt(cfg.rest_minutes, 10) || 30)}
              disabled={saving}
              onChange={(e) => void saveCfg({ rest_minutes: parseInt(e.target.value, 10) })}
              className="border rounded-lg px-2 py-1.5 text-xs bg-white cursor-pointer disabled:opacity-50"
            >
              {restOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        {!cfg.enabled && (
          <p className="text-[10px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
            Bật lịch để tự động: chạy đủ thời gian chạy → tắt nghỉ đủ thời gian nghỉ → bật lại. Các công ty đã bật auto sẽ chạy khi công tắc tổng đang BẬT.
          </p>
        )}

        <div className="border border-gray-100 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[11px] font-semibold text-gray-700">Nhật ký thời gian (25 lượt gần nhất)</p>
            <button
              type="button"
              onClick={() => { void loadCfg(); }}
              disabled={saving}
              className="text-[10px] text-indigo-600 hover:underline cursor-pointer disabled:opacity-50"
            >
              Làm mới
            </button>
          </div>
          {logs.length === 0 ? (
            <p className="px-3 py-4 text-[11px] text-gray-400 text-center">
              Chưa có bản ghi. Cần chạy migration <code className="text-[10px]">361_facebook_auto_master_schedule.sql</code> trên Supabase.
            </p>
          ) : (
            <div className="max-h-52 overflow-y-auto">
              <table className="w-full text-[10px]">
                <thead className="bg-white sticky top-0">
                  <tr className="text-left text-gray-500 border-b">
                    <th className="px-2 py-1.5 font-medium">Thời điểm</th>
                    <th className="px-2 py-1.5 font-medium">Hành động</th>
                    <th className="px-2 py-1.5 font-medium">Phiên</th>
                    <th className="px-2 py-1.5 font-medium">Chạy/Nghỉ</th>
                    <th className="px-2 py-1.5 font-medium hidden sm:table-cell">Bắt đầu phiên</th>
                    <th className="px-2 py-1.5 font-medium hidden md:table-cell">Kết thúc phiên</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/80">
                      <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{fmtTs(row.created_at)}</td>
                      <td className={`px-2 py-1.5 font-semibold ${row.action === 'on' ? 'text-green-700' : 'text-gray-600'}`}>
                        {row.action === 'on' ? 'BẬT' : 'TẮT'}
                      </td>
                      <td className="px-2 py-1.5 text-gray-700">{row.phase === 'run' ? 'Chạy' : 'Nghỉ'}</td>
                      <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">
                        {formatMinutesLabel(row.run_minutes)} / {formatMinutesLabel(row.rest_minutes)}
                      </td>
                      <td className="px-2 py-1.5 text-gray-500 hidden sm:table-cell whitespace-nowrap">{fmtTs(row.phase_started_at)}</td>
                      <td className="px-2 py-1.5 text-gray-500 hidden md:table-cell whitespace-nowrap">{fmtTs(row.phase_ends_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
