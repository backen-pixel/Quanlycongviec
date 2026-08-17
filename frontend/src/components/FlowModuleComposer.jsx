import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, FolderKanban, Factory, Truck, Puzzle, ArrowRight, Check, X, Zap, GitBranch,
} from 'lucide-react';
import api from '../lib/api';

const BUILTIN_MODULES = [
  { key: 'crm', label: 'CRM', desc: 'Deal / khách hàng', color: '#7C3AED', Icon: Users },
  { key: 'projects', label: 'Dự án', desc: 'Dự án & công việc', color: '#2563EB', Icon: FolderKanban },
  { key: 'production', label: 'Sản xuất', desc: 'Xưởng SX', color: '#EA580C', Icon: Factory },
  { key: 'logistics', label: 'Lắp đặt', desc: 'VC / lắp đặt', color: '#0F766E', Icon: Truck },
];

export function moduleChainOf(flow) {
  return (flow?.steps || [])
    .map((s) => String(s.module_key || s.resolved_module_key || '').toLowerCase())
    .filter(Boolean);
}

/**
 * Chọn luồng quy trình cho dự án: dùng luồng có sẵn hoặc tự ghép module.
 * onChange nhận (flowId, flowObject|null).
 */
export default function FlowModuleComposer({
  value,
  onChange,
  startModule = null,
  label = 'Luồng quy trình',
  required = false,
  accent = '#296DFF',
  // Chỉ hiện phần tự ghép module (khi màn hình đã có danh sách luồng riêng)
  composeOnly = false,
}) {
  const [flows, setFlows] = useState([]);
  const [customModules, setCustomModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(composeOnly ? 'compose' : 'existing');
  const [chain, setChain] = useState(() => (startModule ? [startModule] : []));
  const [applying, setApplying] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [fRes, mRes] = await Promise.all([
          api.get('/flows'),
          api.get('/app-modules').catch(() => ({ data: { modules: [] } })),
        ]);
        if (cancelled) return;
        const list = (fRes.data?.flows || []).filter((f) => f.is_active !== false);
        setFlows(list);
        const raw = mRes.data?.modules || mRes.data || [];
        setCustomModules(
          (Array.isArray(raw) ? raw : [])
            .filter((m) => m?.module_key && m.is_active !== false)
            .filter((m) => !BUILTIN_MODULES.some((b) => b.key === m.module_key)),
        );
        if (!composeOnly && !value && list.length === 1) onChange?.(list[0].id, list[0]);
      } catch {
        if (!cancelled) setFlows([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const palette = useMemo(() => ([
    ...BUILTIN_MODULES,
    ...customModules.map((m) => ({
      key: m.module_key,
      label: m.name || m.module_key,
      desc: 'Module tùy chỉnh',
      color: m.color || '#4F46E5',
      Icon: Puzzle,
    })),
  ]), [customModules]);

  const metaOf = useCallback(
    (key) => palette.find((p) => p.key === key) || { key, label: key, color: '#64748B', Icon: Puzzle },
    [palette],
  );

  // Luồng bắt đầu bằng module đang đứng được ưu tiên lên đầu
  const sortedFlows = useMemo(() => {
    if (!startModule) return flows;
    return [...flows].sort(
      (a, b) => Number(moduleChainOf(b)[0] === startModule) - Number(moduleChainOf(a)[0] === startModule),
    );
  }, [flows, startModule]);

  const selectedFlow = flows.find((f) => String(f.id) === String(value)) || null;

  const toggleInChain = (key) => {
    setErr('');
    setChain((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const applyChain = async () => {
    if (!chain.length) { setErr('Chọn ít nhất một module'); return; }
    setApplying(true);
    setErr('');
    try {
      const { data } = await api.post('/flows/resolve-by-modules', { modules: chain });
      const flow = data?.flow;
      if (!flow?.id) throw new Error('Không tạo được luồng');
      setFlows((prev) => (prev.some((f) => f.id === flow.id)
        ? prev
        : [...prev, { ...flow, steps: chain.map((k, i) => ({ module_key: k, order_index: i })) }]));
      onChange?.(flow.id, flow);
      if (!composeOnly) setMode('existing');
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Lỗi tạo luồng');
    }
    setApplying(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className={`items-center rounded-lg bg-gray-100 p-0.5 ${composeOnly ? 'hidden' : 'flex'}`}>
          <button
            type="button"
            onClick={() => setMode('existing')}
            className={`h-6 px-2 rounded-md text-[11px] font-semibold cursor-pointer flex items-center gap-1 ${
              mode === 'existing' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
            }`}
          >
            <GitBranch className="h-3 w-3" /> Luồng có sẵn
          </button>
          <button
            type="button"
            onClick={() => setMode('compose')}
            className={`h-6 px-2 rounded-md text-[11px] font-semibold cursor-pointer flex items-center gap-1 ${
              mode === 'compose' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
            }`}
          >
            <Zap className="h-3 w-3" /> Tự chọn module
          </button>
        </div>
      </div>

      {loading && <p className="text-xs text-gray-400 py-2">Đang tải luồng…</p>}

      {!loading && mode === 'existing' && (
        sortedFlows.length === 0 ? (
          <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
            Chưa có luồng nào đang bật — chuyển sang <b>Tự chọn module</b> để ghép luồng ngay.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
            {sortedFlows.map((f) => {
              const isSel = String(f.id) === String(value);
              const keys = moduleChainOf(f);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onChange?.(f.id, f)}
                  className={`w-full text-left px-3 py-2 rounded-xl border transition-colors cursor-pointer ${
                    isSel ? 'border-transparent ring-2 bg-blue-50/60' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  style={isSel ? { '--tw-ring-color': accent } : undefined}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800 truncate flex-1">{f.name}</span>
                    {isSel && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {keys.length === 0 && <span className="text-[10px] text-gray-400 italic">Chưa có bước nào</span>}
                    {keys.map((k, i) => {
                      const m = metaOf(k);
                      return (
                        <span key={`${k}-${i}`} className="flex items-center gap-1">
                          {i > 0 && <ArrowRight className="h-2.5 w-2.5 text-gray-300" />}
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: `${m.color}1A`, color: m.color }}
                          >
                            {m.label}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        )
      )}

      {!loading && mode === 'compose' && (
        <div className="rounded-xl border border-gray-200 p-2.5 space-y-2.5">
          <p className="text-[11px] text-gray-500">
            Bấm chọn module theo thứ tự chạy. Module đầu là nơi dự án bắt đầu.
          </p>

          <div className="flex items-center gap-1.5 flex-wrap">
            {palette.map((m) => {
              const idx = chain.indexOf(m.key);
              const picked = idx >= 0;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => toggleInChain(m.key)}
                  className={`h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                    picked ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                  style={picked ? { backgroundColor: m.color } : undefined}
                  title={m.desc}
                >
                  <m.Icon className="h-3.5 w-3.5" />
                  {m.label}
                  {picked && <span className="text-[10px] opacity-80">#{idx + 1}</span>}
                </button>
              );
            })}
          </div>

          {chain.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap bg-gray-50 rounded-lg px-2 py-1.5">
              {chain.map((k, i) => {
                const m = metaOf(k);
                return (
                  <span key={k} className="flex items-center gap-1">
                    {i > 0 && <ArrowRight className="h-3 w-3 text-gray-300" />}
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                      style={{ backgroundColor: `${m.color}1A`, color: m.color }}
                    >
                      {m.label}
                      <button
                        type="button"
                        onClick={() => toggleInChain(k)}
                        className="cursor-pointer hover:opacity-70"
                        title="Bỏ khỏi luồng"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  </span>
                );
              })}
            </div>
          )}

          {err && <p className="text-[11px] text-red-600">{err}</p>}

          <button
            type="button"
            onClick={applyChain}
            disabled={applying || !chain.length}
            className="w-full h-9 rounded-lg text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {applying ? 'Đang áp dụng…' : 'Dùng luồng này'}
          </button>
          <p className="text-[10px] text-gray-400">
            Nếu đã có luồng trùng chuỗi module, hệ thống dùng lại luồng đó thay vì tạo trùng.
          </p>
        </div>
      )}

      {!loading && selectedFlow && mode === 'existing' && (
        <p className="text-[10px] text-gray-500 mt-1.5">
          Đang dùng: <b>{selectedFlow.name}</b>
          {moduleChainOf(selectedFlow).length
            ? ` · bắt đầu ở ${metaOf(moduleChainOf(selectedFlow)[0]).label}`
            : ''}
        </p>
      )}
    </div>
  );
}
