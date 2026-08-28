import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { Link } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  GitBranch, Plus, Save, Trash2, Copy, ArrowRight, X,
  Layers, Factory, Truck, UserCircle, Puzzle, MousePointer2, ExternalLink, FolderKanban,
  PanelLeft, PanelRight, ChevronDown, ChevronRight, Power, Link2, ListTree, Building2, Network,
  GitFork, Waypoints, Split, Merge, Hourglass, Stamp, CircleStop, FileBarChart2, BellRing, Megaphone,
  PlayCircle, Sparkles, Send, CheckCircle2, AlertCircle, Undo2, Redo2,
  Tags, ScanText, MessageCircleQuestion, MinusCircle,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import FlowRelationEdge from '../components/flow/FlowRelationEdge';
import EdgeInspector from '../components/flow/EdgeInspector';
import FlowConditionList from '../components/flow/FlowConditionList';
import FlowConditionPicker from '../components/flow/FlowConditionPicker';
import SpecialFlowNode from '../components/flow/SpecialFlowNode';
import NodeOutputsPanel from '../components/flow/NodeOutputsPanel';
import SpecialNodeInspector from '../components/flow/SpecialNodeInspector';
import {
  NODE_KIND,
  SPECIAL_KINDS,
  specialMeta,
  isSpecialKind,
  rfNodeType,
  defaultNodeConfig,
  encodePalettePayload,
  decodePalettePayload,
  nodeDisplayLabel,
  MODULE_CONDITIONS,
} from '../lib/flowNodeCatalog';
import { buildStandardCabinetBlueprint, isBareLinearCabinetFlow } from '../lib/flowStandardBlueprint';
import {
  BRANCH_MODE_OPTIONS,
  JOIN_MODE_OPTIONS,
  degreeMap,
  edgeCardinality,
  branchModeLabel,
  validateGraph,
  nodesToStepsPayload,
  edgesToPayload,
  conditionsToPayload,
  conditionsFromApi,
  conditionsForNode,
  conditionsForEdge,
  newConditionId,
  PALETTE_MIME,
} from '../lib/flowGraphModel';

const BUILTIN_KEYS = new Set(['crm', 'projects', 'production', 'logistics']);

const BUILTIN_MODULES = [
  { key: 'crm', label: 'CRM', desc: 'Deal / khách hàng', color: '#7c3aed', Icon: UserCircle },
  { key: 'projects', label: 'Dự án', desc: 'Dự án & công việc', color: '#2563eb', Icon: FolderKanban },
  { key: 'production', label: 'Sản xuất', desc: 'Xưởng SX', color: '#ea580c', Icon: Factory },
  { key: 'logistics', label: 'Lắp đặt', desc: 'VC / lắp đặt', color: '#0f766e', Icon: Truck },
];

const HANDOFF_OPTIONS = [
  { value: 'on_won', label: 'Khi deal thắng' },
  { value: 'on_stage_flag', label: 'Khi cột bàn giao' },
  { value: 'manual', label: 'Thủ công' },
];

const DEFAULT_TRIGGER = {
  crm: 'on_won',
  projects: 'manual',
  production: 'on_stage_flag',
  logistics: 'manual',
};

const NODE_W = 244;
const NODE_GAP = 100;
const EDGE_COLOR = '#296DFF';

const edgeDefaults = {
  type: 'relation',
  animated: false,
  markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 16, height: 16 },
};

const newEdge = (source, target) => ({
  id: `e-${source}-${target}`,
  source,
  target,
  ...edgeDefaults,
  data: { label: '', condition_logic: 'all' },
});

function moduleMeta(key, customModules) {
  const builtin = BUILTIN_MODULES.find((m) => m.key === key);
  if (builtin) return { ...builtin, isCustom: false };
  const custom = (customModules || []).find((m) => m.module_key === key);
  if (custom) {
    return {
      key: custom.module_key,
      label: custom.name || custom.module_key,
      desc: custom.description || 'Module tùy chỉnh',
      color: custom.color || '#4f46e5',
      Icon: Puzzle,
      emoji: custom.icon || null,
      isCustom: true,
    };
  }
  return {
    key,
    label: key || '?',
    desc: BUILTIN_KEYS.has(key) ? '' : 'Module tùy chỉnh',
    color: '#64748b',
    Icon: Layers,
    isCustom: key ? !BUILTIN_KEYS.has(key) : false,
  };
}

/** Sắp xếp bước theo cạnh (topo từ nguồn → đích). */
function orderFromGraph(rfNodes, rfEdges) {
  const ids = rfNodes.map((n) => n.id);
  const incoming = new Map(ids.map((id) => [id, 0]));
  const outs = new Map(ids.map((id) => [id, []]));
  for (const e of rfEdges) {
    if (!incoming.has(e.target) || !outs.has(e.source)) continue;
    incoming.set(e.target, (incoming.get(e.target) || 0) + 1);
    outs.get(e.source).push(e.target);
  }
  const queue = ids.filter((id) => (incoming.get(id) || 0) === 0);
  // Ưu tiên trái → phải theo vị trí x
  queue.sort((a, b) => {
    const na = rfNodes.find((n) => n.id === a);
    const nb = rfNodes.find((n) => n.id === b);
    return (na?.position?.x || 0) - (nb?.position?.x || 0);
  });
  const ordered = [];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
    for (const t of outs.get(id) || []) {
      incoming.set(t, (incoming.get(t) || 1) - 1);
      if (incoming.get(t) === 0) queue.push(t);
    }
  }
  for (const id of ids) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered
    .map((id) => rfNodes.find((n) => n.id === id))
    .filter(Boolean);
}

function stepToRfNode(s, i, customModules) {
  const kind = s.node_kind && s.node_kind !== 'module' ? s.node_kind : NODE_KIND.MODULE;
  const x = Number.isFinite(Number(s.position_x)) && s.position_x != null
    ? Number(s.position_x)
    : 80 + i * (NODE_W + 80);
  const y = Number.isFinite(Number(s.position_y)) && s.position_y != null
    ? Number(s.position_y)
    : 160;

  if (isSpecialKind(kind)) {
    const meta = specialMeta(kind);
    return {
      id: s.node_id || `n-${kind}-${i}`,
      type: 'specialNode',
      position: { x, y },
      data: {
        node_kind: kind,
        node_config: s.node_config && typeof s.node_config === 'object' ? s.node_config : defaultNodeConfig(kind),
        description: s.description || '',
        branch_mode: s.branch_mode || (kind === 'condition' ? 'conditional' : 'sequential'),
        join_mode: s.join_mode || 'all',
        label: s.node_config?.label || meta?.label || kind,
        color: meta?.color || '#64748b',
      },
    };
  }

  const key = s.module_key || s.resolved_module_key || 'crm';
  const meta = moduleMeta(key, customModules);
  return {
    id: s.node_id || `n-${key}-${i}`,
    type: 'moduleNode',
    position: { x, y },
    data: {
      node_kind: NODE_KIND.MODULE,
      module_key: key,
      handoff_trigger: s.handoff_trigger || DEFAULT_TRIGGER[key] || 'manual',
      description: s.description || '',
      division_unit_id: s.division_unit_id || '',
      company_unit_id: s.company_unit_id || '',
      template_set_id: s.template_set_id || '',
      branch_mode: s.branch_mode || 'sequential',
      join_mode: s.join_mode || 'all',
      node_config: s.node_config || {},
      label: meta.label,
      color: meta.color,
      desc: meta.desc,
      isCustom: Boolean(meta.isCustom),
      emoji: meta.emoji || null,
    },
  };
}

function applyBlueprintMarker(graph) {
  return { ...graph, fromBlueprint: true };
}

function buildInitialGraph(flow, customModules) {
  if (!flow?.steps?.length) {
    return applyBlueprintMarker(buildStandardCabinetBlueprint());
  }

  const nodes = flow.steps.map((s, i) => stepToRfNode(s, i, customModules));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const savedEdges = (flow?.edges || [])
    .filter((e) => nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id))
    .map((e) => ({
      ...newEdge(e.source_node_id, e.target_node_id),
      data: { label: e.label || '', condition_logic: e.condition_logic || 'all' },
    }));
  const edges = savedEdges.length
    ? savedEdges
    : nodes.slice(0, -1).map((n, i) => newEdge(n.id, nodes[i + 1].id));

  const conditions = conditionsFromApi(flow?.conditions);
  if (isBareLinearCabinetFlow(nodes, edges, conditions)) {
    return applyBlueprintMarker(buildStandardCabinetBlueprint());
  }

  return { nodes, edges, conditions, fromBlueprint: false };
}

const ModuleFlowNode = memo(function ModuleFlowNode({ id, data, selected }) {
  const Icon = BUILTIN_MODULES.find((m) => m.key === data.module_key)?.Icon || Puzzle;
  const triggerLabel = HANDOFF_OPTIONS.find((o) => o.value === data.handoff_trigger)?.label;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMode, setMenuMode] = useState('sequential');
  const available = (data.availableModules || []).filter((m) => m.key !== data.module_key);
  const specials = data.availableSpecials || [];
  const connectTargets = data.connectTargets || [];
  const showPlus = available.length > 0 || specials.length > 0 || connectTargets.length > 0;

  const pickModule = (moduleKey) => {
    data.onAddNext?.(id, { kind: NODE_KIND.MODULE, moduleKey }, menuMode);
    setMenuOpen(false);
  };
  const pickSpecial = (kind) => {
    data.onAddNext?.(id, { kind }, kind === NODE_KIND.CONDITION ? 'conditional' : menuMode);
    setMenuOpen(false);
  };

  const pickExisting = (targetId) => {
    data.onConnectExisting?.(id, targetId, menuMode);
    setMenuOpen(false);
  };

  return (
    <div
      data-ecosystem-open={data.ecosystemExpanded || undefined}
      data-menu-open={menuOpen || undefined}
      className={`group relative w-[244px] rounded-2xl bg-white transition-all duration-150 ${
        selected
          ? 'shadow-[0_0_0_2px_#296DFF,0_8px_24px_rgba(41,109,255,0.18)]'
          : 'shadow-[0_2px_8px_rgba(15,23,42,0.06),0_0_0_1px_rgba(15,23,42,0.06)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.1)]'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!-left-1.5 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-[#296DFF] !shadow-sm"
      />

      <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-2">
        <div
          className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white shrink-0 text-[13px] shadow-sm"
          style={{ background: `linear-gradient(145deg, ${data.color}, ${data.color}cc)` }}
        >
          {data.emoji ? <span className="leading-none">{data.emoji}</span> : <Icon className="h-4 w-4" strokeWidth={2.2} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-800 truncate tracking-tight">
            {data.label}
          </p>
          <p className="text-[10px] text-slate-400 truncate">
            {data.isCustom ? 'Module tùy chỉnh' : (data.desc || data.module_key)}
          </p>
        </div>
        {data.isCustom && (
          <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-600">
            Custom
          </span>
        )}
        {['crm', 'production', 'logistics'].includes(data.module_key) && (
          <button
            type="button"
            data-ecosystem-toggle
            className={`nodrag nopan flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border cursor-pointer transition-colors ${
              data.ecosystemExpanded
                ? 'border-[#296DFF]/30 bg-blue-50 text-[#296DFF]'
                : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-[#296DFF]'
            }`}
            title={data.ecosystemExpanded ? 'Thu sơ đồ hệ sinh thái' : 'Bung công ty, pipeline và nhiệm vụ'}
            onClick={(e) => {
              e.stopPropagation();
              data.onToggleEcosystem?.(id);
            }}
          >
            <Network className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="px-3.5 pb-3.5 space-y-1.5">
        <div className="rounded-lg bg-[#f5f7fa] px-2.5 py-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Trigger</p>
          <p className="text-[12px] text-slate-700 font-medium truncate">
            {triggerLabel || '— Thủ công —'}
          </p>
        </div>
        {(MODULE_CONDITIONS[data.module_key] || []).filter((c) => c.flag).slice(0, 4).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(MODULE_CONDITIONS[data.module_key] || []).filter((c) => c.flag).slice(0, 4).map((c) => (
              <span
                key={c.flag}
                className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800"
                title={c.when}
              >
                {c.label}
              </span>
            ))}
          </div>
        )}
        {data.description ? (
          <div className="rounded-lg bg-[#f5f7fa] px-2.5 py-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Ghi chú</p>
            <p className="text-[12px] text-slate-600 line-clamp-2">{data.description}</p>
          </div>
        ) : null}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!-right-1.5 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-[#296DFF] !shadow-sm"
      />

      {/* Dấu + bên phải — hover/click mở danh sách module */}
      {showPlus && (
        <div
          data-node-plus
          className={`absolute top-1/2 -right-11 -translate-y-1/2 z-20 ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
          onMouseLeave={() => { if (!menuOpen) setMenuOpen(false); }}
        >
          <button
            type="button"
            className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer shadow-md border-2 border-white transition-colors ${
              menuOpen ? 'bg-[#296DFF] text-white' : 'bg-white text-[#296DFF] hover:bg-[#296DFF] hover:text-white'
            }`}
            title="Thêm bước tiếp theo"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
          </button>
          {menuOpen && (
            <div
              className="absolute left-10 top-1/2 -translate-y-1/2 w-52 rounded-xl bg-white shadow-[0_8px_28px_rgba(15,23,42,0.14)] ring-1 ring-slate-200/90 p-1.5 max-h-64 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-2 py-1 mb-0.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nối tiếp từ node này</p>
                <button
                  type="button"
                  className="text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer"
                  onClick={() => setMenuOpen(false)}
                >
                  Ẩn
                </button>
              </div>
              <div className="mb-1 flex gap-1 rounded-lg bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setMenuMode('sequential')}
                  className={`flex-1 rounded-md px-1 py-1 text-[10px] font-semibold cursor-pointer transition-colors ${
                    menuMode === 'sequential' ? 'bg-white text-[#296DFF] shadow-sm' : 'text-slate-500'
                  }`}
                  title="Chạy xong node này rồi mới sang node kế"
                >
                  Tuyến tính
                </button>
                <button
                  type="button"
                  onClick={() => setMenuMode('parallel')}
                  className={`flex-1 flex items-center justify-center gap-0.5 rounded-md px-1 py-1 text-[10px] font-semibold cursor-pointer transition-colors ${
                    menuMode === 'parallel' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500'
                  }`}
                  title="Mở tất cả nhánh sau cùng lúc"
                >
                  <GitFork className="h-2.5 w-2.5" /> Song song
                </button>
                <button
                  type="button"
                  onClick={() => setMenuMode('conditional')}
                  className={`flex-1 rounded-md px-1 py-1 text-[10px] font-semibold cursor-pointer transition-colors ${
                    menuMode === 'conditional' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500'
                  }`}
                  title="Rẽ theo điều kiện của từng cạnh"
                >
                  Rẽ ĐK
                </button>
              </div>
              {available.map((m) => {
                const MIcon = m.Icon || Puzzle;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => pickModule(m.key)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left cursor-pointer"
                  >
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0 text-[10px]"
                      style={{ background: m.color }}
                    >
                      {m.emoji ? <span>{m.emoji}</span> : <MIcon className="h-3 w-3" />}
                    </div>
                    <span className="text-[12px] font-medium text-slate-700 truncate">{m.label}</span>
                  </button>
                );
              })}

              {specials.length > 0 && (
                <>
                  <p className="mt-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                    Điều khiển / hành động
                  </p>
                  {specials.map((s) => (
                    <button
                      key={s.kind}
                      type="button"
                      onClick={() => pickSpecial(s.kind)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left cursor-pointer"
                    >
                      <span className="w-6 h-6 rounded-md shrink-0" style={{ background: `${s.color}22` }} />
                      <span className="text-[12px] font-medium text-slate-700 truncate">{s.label}</span>
                    </button>
                  ))}
                </>
              )}

              {connectTargets.length > 0 && (
                <>
                  <div className="mt-1 border-t border-slate-100 pt-1">
                    <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Nối tới node có sẵn
                    </p>
                  </div>
                  {connectTargets.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pickExisting(t.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left cursor-pointer"
                    >
                      <span
                        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                        style={{ background: `${t.color}1a` }}
                      >
                        <Link2 className="h-3 w-3" style={{ color: t.color }} />
                      </span>
                      <span className="text-[12px] font-medium text-slate-700 truncate">{t.label}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {data.ecosystemExpanded && (
        <div
          className="nodrag nopan nowheel absolute left-0 top-full z-50 mt-8 max-h-[430px] w-[820px] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_18px_55px_rgba(15,23,42,0.2)] backdrop-blur"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="absolute -top-8 left-[122px] h-8 w-px bg-[#296DFF]/50" aria-hidden />
          <span className="absolute -top-1.5 left-[116px] h-3 w-3 rotate-45 border-l border-t border-slate-200 bg-white" aria-hidden />
          <NodeEcosystemDiagram moduleKey={data.module_key} accent={data.color} />
        </div>
      )}

    </div>
  );
});

const nodeTypes = { moduleNode: ModuleFlowNode, specialNode: SpecialFlowNode };
const edgeTypes = { relation: FlowRelationEdge };

const SPECIAL_ICONS = {
  condition: GitFork,
  fork: Split,
  join: Merge,
  wait: Hourglass,
  approve: Stamp,
  end: CircleStop,
  report: FileBarChart2,
  ai_report: Sparkles,
  ai_deadline: BellRing,
  notify: Megaphone,
  ai_classify: Tags,
  ai_extract: ScanText,
  ai_ask: MessageCircleQuestion,
};

function normalizeAddSpec(spec) {
  if (!spec) return null;
  if (typeof spec === 'string') return { kind: NODE_KIND.MODULE, moduleKey: spec };
  return {
    kind: spec.kind || NODE_KIND.MODULE,
    moduleKey: spec.moduleKey || spec.module_key || null,
  };
}

function PaletteItem({ m, used, onDragStart, onDragEnd, payload }) {
  const Icon = m.Icon;
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, payload || { kind: NODE_KIND.MODULE, moduleKey: m.key })}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white select-none transition-all cursor-grab active:cursor-grabbing ring-1 hover:ring-[#296DFF]/40 hover:shadow-md ${
        used ? 'opacity-60 ring-slate-100' : 'ring-slate-200/80'
      }`}
      title={used ? 'Đã có trên canvas — thêm lần nữa nếu đặt ở nhánh khác' : 'Kéo vào canvas'}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 text-xs shadow-sm"
        style={{ background: m.color }}
      >
        {m.emoji ? <span>{m.emoji}</span> : <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />}
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-slate-800 truncate">{m.label}</p>
        <p className="text-[10px] text-slate-400 truncate">{m.isCustom ? `Custom · ${m.key}` : m.desc}</p>
      </div>
    </div>
  );
}

export default function ModuleFlowSetupPage() {
  const { user } = useAuth();
  const admin = isAdminLike(user);
  const [flows, setFlows] = useState([]);
  const [customModules, setCustomModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editFlow, setEditFlow] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, mRes] = await Promise.all([
        // include_inactive=1 → màn Setup thấy cả luồng đang tắt để bật lại
        api.get('/flows', { params: { include_inactive: 1 } }),
        api.get('/app-modules', { params: { include_inactive: 1 } }).catch(() => ({ data: { modules: [] } })),
      ]);
      setFlows(fRes.data.flows || []);
      const raw = mRes.data.modules || mRes.data || [];
      setCustomModules(
        (Array.isArray(raw) ? raw : [])
          .filter((m) => m?.module_key && m.is_active !== false)
          .filter((m) => !BUILTIN_KEYS.has(String(m.module_key).toLowerCase())),
      );
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const cloneFlow = async (id) => {
    try {
      await api.post(`/flows/${id}/clone`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const deleteFlow = async (id) => {
    if (!confirm('Xóa hẳn luồng này? (Luồng đang có dự án sử dụng sẽ không xóa được — hãy tắt.)')) return;
    try {
      await api.delete(`/flows/${id}`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const toggleFlowActive = async (flow) => {
    const next = flow.is_active === false;
    setFlows((prev) => prev.map((f) => (f.id === flow.id ? { ...f, is_active: next } : f)));
    try {
      await api.put(`/flows/${flow.id}`, { is_active: next });
    } catch (e) {
      setFlows((prev) => prev.map((f) => (f.id === flow.id ? { ...f, is_active: !next } : f)));
      alert(e.response?.data?.error || 'Không đổi được trạng thái');
    }
  };

  if (!admin) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        Chỉ admin mới được thiết lập luồng module.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-cyan-200 border-t-cyan-600 rounded-full" />
      </div>
    );
  }

  const editing = creating || editFlow;
  // Luồng đang bật lên trước để dễ thao tác
  const sortedFlows = [...flows].sort(
    (a, b) => Number(b.is_active !== false) - Number(a.is_active !== false),
  );

  return (
    <div className={`${editing ? 'h-full min-h-0 flex flex-col max-w-none' : 'space-y-4 max-w-5xl p-6'}`}>
      {!editing && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-[#296DFF]" />
                Setup luồng module
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Canvas kéo thả · nhánh rẽ · khối điều kiện / báo cáo / AI giữa các bước module
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setCreating(true); setEditFlow(null); }}
              className="h-9 px-4 bg-[#296DFF] text-white rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-[#1f5ae0] cursor-pointer shadow-[0_4px_12px_rgba(41,109,255,0.3)]"
            >
              <Plus className="h-4 w-4" /> Tạo luồng
            </button>
          </div>

          <div className="space-y-3">
            {sortedFlows.map((f) => (
              <FlowCard
                key={f.id}
                flow={f}
                customModules={customModules}
                onEdit={() => { setEditFlow(f); setCreating(false); }}
                onDelete={() => deleteFlow(f.id)}
                onClone={() => cloneFlow(f.id)}
                onToggleActive={() => toggleFlowActive(f)}
              />
            ))}
          </div>

          {flows.length === 0 && (
            <div className="text-center py-16 bg-white rounded-2xl border">
              <GitBranch className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-500 mb-3">Chưa có luồng nào</p>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="text-sm text-cyan-700 font-medium hover:underline cursor-pointer"
              >
                Tạo luồng CRM → Sản xuất → Lắp đặt
              </button>
            </div>
          )}
        </>
      )}

      {editing && (
        <div className="flex-1 min-h-0 flex flex-col">
          <ReactFlowProvider>
            <FlowCanvasEditor
              key={editFlow?.id || 'new-flow'}
              flow={editFlow}
              flows={flows}
              customModules={customModules}
              onCancel={() => { setCreating(false); setEditFlow(null); }}
              onSwitchFlow={(f) => { setEditFlow(f); setCreating(false); }}
              onCreateNew={() => { setCreating(true); setEditFlow(null); }}
              onSaved={async (savedFlow) => {
                try {
                  const fRes = await api.get('/flows', { params: { include_inactive: 1 } });
                  const list = fRes.data.flows || [];
                  setFlows(list);
                  if (savedFlow?.id) {
                    const full = list.find((f) => f.id === savedFlow.id);
                    setEditFlow(full || savedFlow);
                    setCreating(false);
                  } else {
                    setCreating(false);
                    setEditFlow(null);
                  }
                } catch {
                  if (savedFlow?.id) {
                    setEditFlow(savedFlow);
                    setCreating(false);
                  } else {
                    setCreating(false);
                    setEditFlow(null);
                    load();
                  }
                }
              }}
            />
          </ReactFlowProvider>
        </div>
      )}
    </div>
  );
}

function FlowCard({ flow, customModules, onEdit, onDelete, onClone, onToggleActive }) {
  const steps = flow.steps || [];
  const active = flow.is_active !== false;
  const firstStep = steps[0];
  const firstMeta = firstStep
    ? (isSpecialKind(firstStep.node_kind)
      ? { label: specialMeta(firstStep.node_kind)?.label || firstStep.node_kind, color: specialMeta(firstStep.node_kind)?.color }
      : moduleMeta(firstStep.module_key || firstStep.resolved_module_key, customModules))
    : null;
  return (
    <div className={`bg-white rounded-xl border overflow-hidden hover:shadow-sm transition-shadow ${active ? '' : 'opacity-70'}`}>
      <div className="flex items-center gap-3 p-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: `${flow.color || '#0ea5e9'}18` }}
        >
          {flow.icon || '🔄'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-gray-900">{flow.name}</h3>
            {firstMeta && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-600">
                Bắt đầu: {firstMeta.label}
              </span>
            )}
          </div>
          {flow.description && (
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{flow.description}</p>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-1 shrink-0 max-w-[420px] overflow-x-auto">
          {steps.map((step, i) => {
            const special = isSpecialKind(step.node_kind) ? specialMeta(step.node_kind) : null;
            const meta = special
              ? { label: step.node_config?.label || special.label, color: special.color }
              : moduleMeta(step.module_key || step.resolved_module_key, customModules);
            return (
              <span key={step.id || i} className="flex items-center gap-1 shrink-0">
                {i > 0 && <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />}
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                  style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                >
                  {meta.label}
                </span>
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleActive}
            className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer border transition-colors ${
              active
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
            }`}
            title={active ? 'Đang bật — bấm để tắt' : 'Đã tắt — bấm để bật'}
          >
            <Power className="h-3.5 w-3.5" />
            {active ? 'Đang bật' : 'Đã tắt'}
          </button>
          <button type="button" onClick={onClone} className="w-7 h-7 rounded-lg hover:bg-blue-50 flex items-center justify-center text-gray-400 hover:text-blue-600 cursor-pointer" title="Nhân bản">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onEdit} className="h-8 px-3 rounded-xl bg-[#296DFF] text-white text-xs font-semibold hover:bg-[#1f5ae0] cursor-pointer shadow-sm" title="Mở canvas">
            Mở canvas
          </button>
          <button type="button" onClick={onDelete} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer" title="Xóa">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

const MODULE_SETUP_HREF = {
  crm: '/crm/pipeline-settings',
  production: '/sx/pipeline-settings',
  logistics: '/vc/pipeline-settings',
};

/** Tên hiển thị của một mẫu nhiệm vụ (CRM / xưởng dùng field khác nhau). */
function templateLabel(t) {
  return t?.name || t?.title || t?.template_name || 'Mẫu nhiệm vụ';
}

function templateItems(t) {
  const items = t?.items || t?.template_items || [];
  return Array.isArray(items) ? items : [];
}

const STAGE_GROUP_META = {
  lead: { label: 'Lead', color: '#0EA5E9' },
  deal: { label: 'Deal', color: '#7C3AED' },
  other: { label: 'Chung', color: '#64748B' },
};

/** Gom cột theo pipeline_type (Lead / Deal); pipeline xưởng không có type thì trả về một nhóm. */
function groupStagesByType(stages) {
  const list = stages || [];
  if (!list.length) return [];
  const buckets = new Map();
  for (const st of list) {
    const raw = String(st.pipeline_type || '').toLowerCase();
    const key = STAGE_GROUP_META[raw] ? raw : 'other';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(st);
  }
  const order = ['lead', 'deal', 'other'];
  const keys = order.filter((k) => buckets.has(k));
  const showHeader = keys.length > 1 || (keys.length === 1 && keys[0] !== 'other');
  return keys.map((key) => ({
    key,
    ...STAGE_GROUP_META[key],
    showHeader,
    stages: buckets.get(key),
  }));
}

/** Công ty thuộc các khối được gán cho module trong cấu hình Hệ sinh thái. */
async function loadModuleScopedCompanies(moduleKey) {
  try {
    const { data } = await api.get('/ecosystem/module-companies', {
      params: { module_key: moduleKey },
    });
    return Array.isArray(data?.companies) ? data.companies : [];
  } catch {
    // DB cũ/chưa có endpoint: caller dùng dữ liệu nghiệp vụ hiện có làm fallback.
    return null;
  }
}

/**
 * Cây nhánh của một node module: Pipeline → Cột → Mẫu nhiệm vụ → Đầu việc.
 * Tải lười: chỉ gọi API khi bấm mở từng cấp.
 */
function NodeModuleBranches({ moduleKey, branchMode = false }) {
  const [pipelines, setPipelines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [openPipes, setOpenPipes] = useState(() => new Set());
  const [openStages, setOpenStages] = useState(() => new Set());
  const [openTpls, setOpenTpls] = useState(() => new Set());
  const [closedGroups, setClosedGroups] = useState(() => new Set());
  const [activeBranch, setActiveBranch] = useState('');
  const [detail, setDetail] = useState({}); // pipelineId → { loading, stages, byStage, globalTpls, error }

  const setupHref = MODULE_SETUP_HREF[moduleKey] || null;
  const isWorkshop = moduleKey === 'production' || moduleKey === 'logistics';
  const supported = moduleKey === 'crm' || isWorkshop;

  useEffect(() => {
    setPipelines([]);
    setDetail({});
    setErr('');
    setOpenPipes(new Set());
    setOpenStages(new Set());
    setOpenTpls(new Set());
    setClosedGroups(new Set());
    setActiveBranch('');
    if (!supported) return undefined;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (moduleKey === 'crm') {
          const { data } = await api.get('/crm/pipelines');
          const list = Array.isArray(data) ? data : (data?.pipelines || []);
          if (!cancelled) {
            setPipelines(list.map((p) => ({
              id: p.id,
              name: p.name || 'Pipeline',
              subtitle: p.company?.name || p.company_name || '',
              color: '#7c3aed',
            })));
          }
        } else {
          // SX / Lắp đặt chỉ có một bảng Kanban theo công ty đang chọn
          if (!cancelled) {
            setPipelines([{
              id: `${moduleKey}-kanban`,
              name: moduleKey === 'logistics' ? 'Kanban Lắp đặt' : 'Kanban Sản xuất',
              subtitle: 'Cột xưởng',
              color: moduleKey === 'logistics' ? '#0f766e' : '#ea580c',
            }]);
          }
        }
      } catch (e) {
        if (!cancelled) setErr(e.response?.data?.error || e.message || 'Không tải được pipeline');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [moduleKey, supported]);

  const loadPipelineDetail = useCallback(async (pipelineId) => {
    setDetail((prev) => ({ ...prev, [pipelineId]: { ...(prev[pipelineId] || {}), loading: true } }));
    try {
      let stages = [];
      let templates = [];
      let stageKey = 'pipeline_stage_id';

      if (moduleKey === 'crm') {
        const [plRes, tplRes] = await Promise.all([
          api.get(`/crm/pipelines/${pipelineId}`),
          api.get('/crm/task-templates', { params: { pipeline_id: pipelineId } }).catch(() => ({ data: [] })),
        ]);
        stages = (plRes.data?.stages || []).filter((s) => s.is_active !== false);
        templates = Array.isArray(tplRes.data) ? tplRes.data : [];
      } else {
        const area = moduleKey === 'logistics' ? 'logistics' : 'production';
        stageKey = area === 'logistics' ? 'logistics_stage_id' : 'production_stage_id';
        const stagesPath = area === 'logistics' ? '/logistics/pipeline-stages' : '/production/pipeline-stages';
        const [stRes, tplRes] = await Promise.all([
          api.get(stagesPath).catch(() => ({ data: [] })),
          api.get('/production/task-templates', { params: { workshop_area: area, active_only: 'true' } })
            .catch(() => ({ data: [] })),
        ]);
        stages = (Array.isArray(stRes.data) ? stRes.data : []).filter((s) => s.is_active !== false);
        templates = Array.isArray(tplRes.data) ? tplRes.data : [];
      }

      stages = [...stages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      const byStage = {};
      const globalTpls = [];
      for (const t of templates) {
        const sid = t[stageKey];
        if (!sid) globalTpls.push(t);
        else (byStage[sid] = byStage[sid] || []).push(t);
      }
      setDetail((prev) => ({
        ...prev,
        [pipelineId]: { loading: false, stages, byStage, globalTpls, error: '' },
      }));
    } catch (e) {
      setDetail((prev) => ({
        ...prev,
        [pipelineId]: { loading: false, stages: [], byStage: {}, globalTpls: [], error: e.response?.data?.error || 'Lỗi tải' },
      }));
    }
  }, [moduleKey]);

  // Mở sẵn pipeline đầu tiên để thấy cột & mẫu nhiệm vụ ngay khi chọn node
  useEffect(() => {
    const first = pipelines[0];
    if (!first) return;
    setOpenPipes(new Set([first.id]));
    loadPipelineDetail(first.id);
  }, [pipelines, loadPipelineDetail]);

  const togglePipeline = (pipelineId) => {
    setOpenPipes((prev) => {
      const next = new Set(prev);
      if (next.has(pipelineId)) next.delete(pipelineId);
      else {
        next.add(pipelineId);
        if (!detail[pipelineId]) loadPipelineDetail(pipelineId);
      }
      return next;
    });
  };

  const toggleIn = (setter, id) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  if (moduleKey === 'projects') {
    return (
      <div className="rounded-xl bg-blue-50/60 border border-blue-100 px-3 py-2.5 text-[11px] text-blue-800 leading-relaxed">
        Node <b>Dự án</b> — luồng chứa node này sẽ xuất hiện trong dropdown «Luồng quy trình» khi tạo dự án từ Lead/Deal.
        <Link to="/management/work-unified" state={{ moduleContext: 'congviec' }} className="mt-1.5 flex items-center gap-1 font-semibold text-blue-700 hover:underline">
          <ExternalLink className="h-3 w-3" /> Mở Dashboard dự án
        </Link>
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="rounded-xl bg-violet-50/60 border border-violet-100 px-3 py-2.5 text-[11px] text-violet-800 leading-relaxed">
        Module tùy chỉnh chưa có pipeline riêng. Bàn giao sang bước này sẽ theo trigger đã chọn.
      </div>
    );
  }

  return (
    <div
      className="space-y-2"
      onClick={(e) => {
        if (!branchMode) return;
        const target = e.target.closest('[data-branch-key]');
        if (target) setActiveBranch(target.dataset.branchKey || '');
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Pipeline & công việc</p>
        {setupHref && (
          <Link to={setupHref} className="text-[10px] font-semibold text-[#296DFF] hover:underline flex items-center gap-0.5">
            <Link2 className="h-3 w-3" /> Setup
          </Link>
        )}
      </div>

      {loading && <p className="text-[11px] text-slate-400 py-1">Đang tải…</p>}
      {err && <p className="text-[11px] text-red-500">{err}</p>}
      {!loading && !err && pipelines.length === 0 && (
        <p className="text-[11px] text-slate-400 leading-relaxed">Chưa có pipeline. Vào Setup để tạo cột và mẫu nhiệm vụ.</p>
      )}

      {pipelines.map((pl) => {
        const open = openPipes.has(pl.id);
        const d = detail[pl.id];
        return (
          <div key={pl.id} className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => togglePipeline(pl.id)}
              data-branch-key={`pipeline:${pl.id}`}
              className={`w-full flex items-center gap-2 px-2.5 py-2 text-left cursor-pointer transition-all ${
                activeBranch === `pipeline:${pl.id}`
                  ? 'bg-blue-50 ring-2 ring-inset ring-[#296DFF]/45'
                  : 'hover:bg-slate-50'
              }`}
            >
              {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: pl.color }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-slate-800 truncate">{pl.name}</span>
                {pl.subtitle && <span className="block text-[9px] text-slate-400 truncate">{pl.subtitle}</span>}
              </span>
              {d?.stages && (
                <span className="text-[9px] text-slate-400 shrink-0">
                  {groupStagesByType(d.stages)
                    .map((g) => (g.key === 'other' ? `${g.stages.length} cột` : `${g.stages.length} ${g.label.toLowerCase()}`))
                    .join(' · ')}
                </span>
              )}
            </button>

            {open && (
              <div className="border-t border-slate-100 bg-slate-50/60 px-2 py-2">
                {d?.loading && <p className="text-[10px] text-slate-400 px-1 py-1">Đang tải cột…</p>}
                {d?.error && <p className="text-[10px] text-red-500 px-1">{d.error}</p>}
                {d && !d.loading && d.stages?.length === 0 && (
                  <p className="text-[10px] text-slate-400 italic px-1">Pipeline chưa có cột nào</p>
                )}

                {/* Nhánh: nhóm Lead / Deal → cột → mẫu nhiệm vụ */}
                {groupStagesByType(d?.stages).map((group) => {
                  const groupId = `${pl.id}:${group.key}`;
                  const groupOpen = !closedGroups.has(groupId);
                  const groupTplCount = group.stages
                    .reduce((sum, st) => sum + ((d.byStage?.[st.id] || []).length), 0);
                  return (
                    <div key={groupId} className="mb-1.5 last:mb-0">
                      {group.showHeader && (
                        <button
                          type="button"
                          onClick={() => toggleIn(setClosedGroups, groupId)}
                          data-branch-key={`group:${groupId}`}
                          className={`w-full flex items-center gap-1.5 rounded-md px-1 py-1 text-left cursor-pointer transition-all ${
                            activeBranch === `group:${groupId}` ? 'bg-blue-50 ring-2 ring-inset ring-[#296DFF]/40' : ''
                          }`}
                        >
                          {groupOpen
                            ? <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
                            : <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />}
                          <span
                            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: `${group.color}1A`, color: group.color }}
                          >
                            {group.label}
                          </span>
                          <span className="text-[9px] text-slate-400 flex-1">
                            {group.stages.length} cột · {groupTplCount} mẫu
                          </span>
                        </button>
                      )}

                      {groupOpen && (
                        <div className="relative pl-3">
                          <span className="absolute left-0 top-1 bottom-1 w-px bg-slate-200" aria-hidden />
                          <div className="space-y-1">
                            {group.stages.map((st) => {
                              const stOpen = openStages.has(st.id);
                              const tpls = d.byStage?.[st.id] || [];
                              return (
                                <div key={st.id} className="relative">
                                  <span className="absolute -left-3 top-3.5 w-3 h-px bg-slate-200" aria-hidden />
                                  <div className="rounded-lg bg-white border border-slate-200/80 overflow-hidden">
                                    <button
                                      type="button"
                                      onClick={() => toggleIn(setOpenStages, st.id)}
                                      data-branch-key={`stage:${st.id}`}
                                      className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left cursor-pointer transition-all ${
                                        activeBranch === `stage:${st.id}`
                                          ? 'bg-blue-50 ring-2 ring-inset ring-[#296DFF]/45'
                                          : 'hover:bg-slate-50'
                                      }`}
                                    >
                                      {stOpen ? <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" /> : <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />}
                                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: st.color || '#94a3b8' }} />
                                      <span className="text-[11px] font-medium text-slate-700 truncate flex-1">
                                        {st.icon ? `${st.icon} ` : ''}{st.name}
                                      </span>
                                      {st.is_won && <span className="text-[8px] font-bold text-emerald-600 shrink-0">WON</span>}
                                      {st.is_lost && <span className="text-[8px] font-bold text-rose-500 shrink-0">LOST</span>}
                                      <span className="text-[9px] text-slate-400 shrink-0">{tpls.length} mẫu</span>
                                    </button>

                                    {stOpen && (
                                      <div className="px-2 pb-2 pt-1 space-y-1">
                                        {tpls.length === 0 ? (
                                          <p className="text-[10px] text-slate-400 italic px-1">Chưa có mẫu nhiệm vụ cho cột này</p>
                                        ) : tpls.map((t) => {
                                          const tplOpen = openTpls.has(t.id);
                                          const items = templateItems(t);
                                          return (
                                            <div key={t.id} className="rounded-md bg-slate-50 border border-slate-100 overflow-hidden">
                                              <button
                                                type="button"
                                                onClick={() => toggleIn(setOpenTpls, t.id)}
                                                data-branch-key={`template:${t.id}`}
                                                className={`w-full flex items-center gap-1.5 px-2 py-1 text-left cursor-pointer transition-all ${
                                                  activeBranch === `template:${t.id}`
                                                    ? 'bg-blue-100 ring-2 ring-inset ring-[#296DFF]/45'
                                                    : 'hover:bg-slate-100'
                                                }`}
                                              >
                                                {tplOpen ? <ChevronDown className="h-2.5 w-2.5 text-slate-400 shrink-0" /> : <ChevronRight className="h-2.5 w-2.5 text-slate-400 shrink-0" />}
                                                <span className="text-[10px] text-slate-700 truncate flex-1">{templateLabel(t)}</span>
                                                <span className="text-[9px] text-slate-400 shrink-0">{items.length} NV</span>
                                              </button>
                                              {tplOpen && (
                                                <div className="px-2 pb-1.5 space-y-0.5">
                                                  {items.length === 0 ? (
                                                    <p className="text-[9px] text-slate-400 italic">Mẫu chưa có đầu việc</p>
                                                  ) : items.map((it) => (
                                                    <div
                                                      key={it.id}
                                                      data-branch-key={`item:${it.id}`}
                                                      className={`text-[10px] rounded px-2 py-0.5 border truncate cursor-pointer transition-all ${
                                                        activeBranch === `item:${it.id}`
                                                          ? 'bg-blue-50 text-blue-700 border-[#296DFF]/50 ring-1 ring-[#296DFF]/30'
                                                          : 'text-slate-600 bg-white border-slate-100'
                                                      }`}
                                                    >
                                                      {it.title || it.name || 'Nhiệm vụ'}
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {(d?.globalTpls || []).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200/70">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Mẫu chung (không gắn cột)</p>
                    <div className="space-y-0.5">
                      {d.globalTpls.map((t) => (
                        <div
                          key={t.id}
                          data-branch-key={`global:${t.id}`}
                          className={`text-[10px] rounded px-2 py-1 border flex items-center gap-1.5 cursor-pointer transition-all ${
                            activeBranch === `global:${t.id}`
                              ? 'bg-blue-50 text-blue-700 border-[#296DFF]/50 ring-1 ring-[#296DFF]/30'
                              : 'text-slate-600 bg-white border-slate-100'
                          }`}
                        >
                          <span className="truncate flex-1">{templateLabel(t)}</span>
                          <span className="text-[9px] text-slate-400 shrink-0">{templateItems(t).length} NV</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Sơ đồ mở rộng ngay dưới node: Công ty → Pipeline → Cột → Mẫu nhiệm vụ.
 * Mỗi cấp tải theo lựa chọn để canvas không gọi hàng loạt API.
 */
function NodeEcosystemDiagram({ moduleKey, accent = '#296DFF' }) {
  const [pipelines, setPipelines] = useState([]);
  const [moduleCompanies, setModuleCompanies] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companyKey, setCompanyKey] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const [detail, setDetail] = useState(null);
  const [layoutMode, setLayoutMode] = useState('vertical');
  const [closedHorizontalGroups, setClosedHorizontalGroups] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPipelines([]);
    setModuleCompanies(null);
    setCompanyKey('');
    setPipelineId('');
    setStageId('');
    setDetail(null);

    (async () => {
      try {
        const scopedCompanies = await loadModuleScopedCompanies(moduleKey);
        if (!cancelled) setModuleCompanies(scopedCompanies);
        const scopedIds = scopedCompanies
          ? new Set(scopedCompanies.map((company) => String(company.id)))
          : null;

        if (moduleKey === 'crm') {
          const { data } = await api.get('/crm/pipelines');
          const list = Array.isArray(data) ? data : (data?.pipelines || []);
          if (!cancelled) {
            setPipelines(
              list
                .filter((p) => p.company?.id || p.company_id)
                .filter((p) => !scopedIds || scopedIds.has(String(p.company?.id || p.company_id)))
                .map((p) => ({
                  id: p.id,
                  name: p.name || 'Pipeline',
                  companyKey: String(p.company?.id || p.company_id),
                  companyId: String(p.company?.id || p.company_id),
                  companyName: p.company?.name || p.company_name || 'Công ty',
                  color: '#7c3aed',
                })),
            );
          }
        } else {
          const isLogistics = moduleKey === 'logistics';
          if (!cancelled) {
            const companiesForModule = scopedCompanies || [];
            setPipelines(companiesForModule.map((company) => ({
              id: `${moduleKey}-kanban-${company.id}`,
              name: isLogistics ? 'Kanban Lắp đặt' : 'Kanban Sản xuất',
              companyKey: String(company.id),
              companyId: String(company.id),
              companyName: company.name,
              color: isLogistics ? '#0f766e' : '#ea580c',
            })));
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || e.message || 'Không tải được dữ liệu');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [moduleKey]);

  const companies = useMemo(() => {
    const map = new Map();
    (moduleCompanies || []).forEach((company) => {
      map.set(String(company.id), {
        key: String(company.id),
        name: company.name,
        pipelines: [],
      });
    });
    pipelines.forEach((pipeline) => {
      if (!map.has(pipeline.companyKey)) {
        map.set(pipeline.companyKey, {
          key: pipeline.companyKey,
          name: pipeline.companyName,
          pipelines: [],
        });
      }
      map.get(pipeline.companyKey).pipelines.push(pipeline);
    });
    return [...map.values()];
  }, [moduleCompanies, pipelines]);

  useEffect(() => {
    if (!companies.length) return;
    setCompanyKey((prev) => (companies.some((c) => c.key === prev) ? prev : companies[0].key));
  }, [companies]);

  const selectedCompany = companies.find((c) => c.key === companyKey) || null;

  useEffect(() => {
    const list = selectedCompany?.pipelines || [];
    setPipelineId((prev) => (list.some((p) => String(p.id) === String(prev)) ? prev : (list[0]?.id || '')));
  }, [selectedCompany]);

  const selectedPipeline = pipelines.find((p) => String(p.id) === String(pipelineId)) || null;
  const selectedPipelineCompanyId = selectedPipeline?.companyId || null;

  useEffect(() => {
    if (!pipelineId) {
      setDetail(null);
      setStageId('');
      return undefined;
    }
    let cancelled = false;
    setDetail({ loading: true, stages: [], byStage: {}, globalTpls: [] });
    setStageId('');
    setClosedHorizontalGroups(new Set());
    (async () => {
      try {
        let stages = [];
        let templates = [];
        let stageKey = 'pipeline_stage_id';
        if (moduleKey === 'crm') {
          const [plRes, tplRes] = await Promise.all([
            api.get(`/crm/pipelines/${pipelineId}`),
            api.get('/crm/task-templates', { params: { pipeline_id: pipelineId } }).catch(() => ({ data: [] })),
          ]);
          stages = (plRes.data?.stages || []).filter((s) => s.is_active !== false);
          templates = Array.isArray(tplRes.data) ? tplRes.data : [];
        } else {
          const area = moduleKey === 'logistics' ? 'logistics' : 'production';
          stageKey = area === 'logistics' ? 'logistics_stage_id' : 'production_stage_id';
          const stagesPath = area === 'logistics' ? '/logistics/pipeline-stages' : '/production/pipeline-stages';
          const companyParams = selectedPipelineCompanyId
            ? { company_id: selectedPipelineCompanyId, strict_company: 'true' }
            : {};
          const [stRes, tplRes] = await Promise.all([
            api.get(stagesPath, { params: companyParams }).catch(() => ({ data: [] })),
            api.get('/production/task-templates', {
              params: {
                workshop_area: area,
                active_only: 'true',
                ...(selectedPipelineCompanyId ? { company_id: selectedPipelineCompanyId } : {}),
              },
            })
              .catch(() => ({ data: [] })),
          ]);
          stages = (Array.isArray(stRes.data) ? stRes.data : []).filter((s) => s.is_active !== false);
          templates = Array.isArray(tplRes.data) ? tplRes.data : [];
        }
        stages = [...stages].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        const byStage = {};
        const globalTpls = [];
        templates.forEach((t) => {
          const sid = t[stageKey];
          if (sid) (byStage[sid] = byStage[sid] || []).push(t);
          else globalTpls.push(t);
        });
        if (!cancelled) {
          setDetail({ loading: false, stages, byStage, globalTpls, error: '' });
          setStageId(stages[0]?.id || '');
        }
      } catch (e) {
        if (!cancelled) {
          setDetail({
            loading: false,
            stages: [],
            byStage: {},
            globalTpls: [],
            error: e.response?.data?.error || 'Không tải được pipeline',
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [moduleKey, pipelineId, selectedPipelineCompanyId]);

  const selectedStage = detail?.stages?.find((s) => String(s.id) === String(stageId)) || null;
  const selectedTemplates = selectedStage ? (detail?.byStage?.[selectedStage.id] || []) : [];

  const BranchLevel = ({ title, icon, children, empty, cardWidth = 160 }) => {
    const list = (Array.isArray(children) ? children : [children]).filter(Boolean);
    return (
      <div className="min-w-0">
        <p className="mb-1.5 flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
          {icon}{title}
        </p>
        <div className="overflow-x-auto pb-1">
          {list.length > 0 ? (
            <div className="relative mx-auto flex min-w-max justify-center gap-2 px-4 pt-4">
              {list.length > 1 && (
                <span
                  className="absolute top-0 h-px bg-slate-300"
                  style={{ left: cardWidth / 2 + 16, right: cardWidth / 2 + 16 }}
                  aria-hidden
                />
              )}
              {list.map((child, index) => (
                <div
                  key={child.key || index}
                  className="relative shrink-0"
                  style={{ width: cardWidth }}
                >
                  <span className="absolute -top-4 left-1/2 h-4 w-px -translate-x-1/2 bg-slate-300" aria-hidden />
                  {child}
                </div>
              ))}
            </div>
          ) : (
            <p className="mx-auto w-48 rounded-lg bg-slate-50 px-2 py-3 text-center text-[10px] italic text-slate-400">{empty}</p>
          )}
        </div>
      </div>
    );
  };

  const DownConnector = () => (
    <div className="flex h-8 flex-col items-center justify-center" aria-hidden>
      <span className="h-5 w-px bg-[#296DFF]/40" />
      <ChevronDown className="-mt-0.5 h-3.5 w-3.5 text-[#296DFF]/55" />
    </div>
  );

  const HorizontalColumn = ({ title, icon, children, empty }) => {
    const list = (Array.isArray(children) ? children : [children]).filter(Boolean);
    return (
      <div className="min-w-0 flex-1">
        <p className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
          {icon}{title}
        </p>
        <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
          {list.length
            ? list
            : <p className="rounded-lg bg-slate-50 px-2 py-3 text-center text-[10px] italic text-slate-400">{empty}</p>}
        </div>
      </div>
    );
  };

  if (loading) return <p className="py-8 text-center text-[11px] text-slate-400">Đang tải hệ sinh thái…</p>;
  if (error) return <p className="py-5 text-center text-[11px] text-red-500">{error}</p>;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4" style={{ color: accent }} />
          <div>
            <p className="text-[12px] font-bold text-slate-800">Sơ đồ hệ sinh thái module</p>
            <p className="text-[9px] text-slate-400">
              {layoutMode === 'vertical' ? 'Cây phân cấp dọc' : 'Luồng phân cấp ngang'}: công ty → pipeline → cột → nhiệm vụ
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setLayoutMode('vertical')}
              className={`h-6 rounded-md px-2 text-[9px] font-semibold cursor-pointer ${
                layoutMode === 'vertical' ? 'bg-white text-[#296DFF] shadow-sm' : 'text-slate-500'
              }`}
            >
              Dọc
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('horizontal')}
              className={`h-6 rounded-md px-2 text-[9px] font-semibold cursor-pointer ${
                layoutMode === 'horizontal' ? 'bg-white text-[#296DFF] shadow-sm' : 'text-slate-500'
              }`}
            >
              Ngang
            </button>
          </div>
          <div className="flex items-center gap-1 text-[9px] text-slate-400">
            <span>{companies.length} công ty</span>
            <span>·</span>
            <span>{pipelines.length} pipeline</span>
          </div>
        </div>
      </div>

      {layoutMode === 'vertical' ? (
      <div>
        <BranchLevel title="Cấp 1 · Công ty" icon={<Building2 className="h-3 w-3" />} empty="Chưa có công ty" cardWidth={172}>
          {companies.map((company) => {
            const active = company.key === companyKey;
            return (
              <button
                key={company.key}
                type="button"
                onClick={() => { setCompanyKey(company.key); setStageId(''); }}
                className={`w-full rounded-xl border px-2.5 py-2 text-left transition-all cursor-pointer ${
                  active
                    ? 'border-[#296DFF]/50 bg-blue-50 shadow-[0_0_0_2px_rgba(41,109,255,0.14)]'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <p className={`truncate text-[11px] font-semibold ${active ? 'text-blue-700' : 'text-slate-700'}`}>{company.name}</p>
                <p className="mt-0.5 text-[9px] text-slate-400">{company.pipelines.length} pipeline</p>
              </button>
            );
          })}
        </BranchLevel>

        <DownConnector />

        <BranchLevel title="Cấp 2 · Pipeline" icon={<GitBranch className="h-3 w-3" />} empty="Chọn công ty" cardWidth={180}>
          {(selectedCompany?.pipelines || []).map((pipeline) => {
            const active = String(pipeline.id) === String(pipelineId);
            return (
              <button
                key={pipeline.id}
                type="button"
                onClick={() => setPipelineId(pipeline.id)}
                className={`w-full rounded-xl border px-2.5 py-2 text-left transition-all cursor-pointer ${
                  active
                    ? 'border-[#296DFF]/50 bg-blue-50 shadow-[0_0_0_2px_rgba(41,109,255,0.14)]'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: pipeline.color }} />
                  <span className={`truncate text-[11px] font-semibold ${active ? 'text-blue-700' : 'text-slate-700'}`}>{pipeline.name}</span>
                </span>
              </button>
            );
          })}
        </BranchLevel>

        <DownConnector />

        <BranchLevel
          title="Cấp 3 · Cột xử lý"
          icon={<Layers className="h-3 w-3" />}
          empty={detail?.loading ? 'Đang tải cột…' : 'Pipeline chưa có cột'}
          cardWidth={166}
        >
          {!detail?.loading && (detail?.stages || []).map((stage) => {
            const active = String(stage.id) === String(stageId);
            const count = detail?.byStage?.[stage.id]?.length || 0;
            const type = String(stage.pipeline_type || '').toLowerCase();
            const groupMeta = STAGE_GROUP_META[type];
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setStageId(stage.id)}
                className={`w-full rounded-xl border px-2 py-2 text-left transition-all cursor-pointer ${
                  active
                    ? 'border-[#296DFF]/50 bg-blue-50 shadow-[0_0_0_2px_rgba(41,109,255,0.14)]'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color || '#94a3b8' }} />
                  <span className={`min-w-0 flex-1 truncate text-[10px] font-medium ${active ? 'text-blue-700' : 'text-slate-700'}`}>
                    {stage.icon ? `${stage.icon} ` : ''}{stage.name}
                  </span>
                </span>
                <span className="mt-1 flex items-center justify-between gap-1">
                  {groupMeta
                    ? <span className="text-[8px] font-bold uppercase" style={{ color: groupMeta.color }}>{groupMeta.label}</span>
                    : <span />}
                  <span className="text-[8px] text-slate-400">{count} mẫu</span>
                </span>
              </button>
            );
          })}
        </BranchLevel>

        <DownConnector />

        <BranchLevel
          title="Cấp 4 · Mẫu và nhiệm vụ"
          icon={<ListTree className="h-3 w-3" />}
          empty={selectedStage ? 'Cột chưa có mẫu nhiệm vụ' : 'Chọn một cột'}
          cardWidth={190}
        >
          {selectedTemplates.map((template) => (
            <div key={template.id} className="rounded-xl border border-slate-200 bg-white p-2">
              <p className="truncate text-[10px] font-semibold text-slate-700">{templateLabel(template)}</p>
              <div className="mt-1 space-y-0.5">
                {templateItems(template).length === 0 ? (
                  <p className="text-[8px] italic text-slate-400">Chưa có đầu việc</p>
                ) : templateItems(template).map((item) => (
                  <p key={item.id} className="truncate rounded bg-slate-50 px-1.5 py-1 text-[9px] text-slate-600">
                    {item.title || item.name || 'Nhiệm vụ'}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </BranchLevel>
      </div>
      ) : (
        <div className="flex min-h-[220px] items-start gap-2">
          <HorizontalColumn title="Công ty" icon={<Building2 className="h-3 w-3" />} empty="Chưa có công ty thuộc module">
            {companies.map((company) => {
              const active = company.key === companyKey;
              return (
                <button
                  key={company.key}
                  type="button"
                  onClick={() => { setCompanyKey(company.key); setStageId(''); }}
                  className={`w-full rounded-xl border px-2.5 py-2 text-left transition-all cursor-pointer ${
                    active
                      ? 'border-[#296DFF]/50 bg-blue-50 ring-2 ring-[#296DFF]/15'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <p className={`truncate text-[10px] font-semibold ${active ? 'text-blue-700' : 'text-slate-700'}`}>{company.name}</p>
                  <p className="mt-0.5 text-[8px] text-slate-400">{company.pipelines.length} pipeline</p>
                </button>
              );
            })}
          </HorizontalColumn>

          <ArrowRight className="mt-8 h-4 w-4 shrink-0 text-[#296DFF]/45" />

          <HorizontalColumn title="Pipeline" icon={<GitBranch className="h-3 w-3" />} empty="Công ty chưa có pipeline">
            {(selectedCompany?.pipelines || []).map((pipeline) => {
              const active = String(pipeline.id) === String(pipelineId);
              return (
                <button
                  key={pipeline.id}
                  type="button"
                  onClick={() => setPipelineId(pipeline.id)}
                  className={`w-full rounded-xl border px-2.5 py-2 text-left transition-all cursor-pointer ${
                    active
                      ? 'border-[#296DFF]/50 bg-blue-50 ring-2 ring-[#296DFF]/15'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: pipeline.color }} />
                    <span className={`truncate text-[10px] font-semibold ${active ? 'text-blue-700' : 'text-slate-700'}`}>{pipeline.name}</span>
                  </span>
                </button>
              );
            })}
          </HorizontalColumn>

          <ArrowRight className="mt-8 h-4 w-4 shrink-0 text-[#296DFF]/45" />

          <HorizontalColumn title="Cột xử lý" icon={<Layers className="h-3 w-3" />} empty={detail?.loading ? 'Đang tải cột…' : 'Pipeline chưa có cột'}>
            {!detail?.loading && groupStagesByType(detail?.stages).map((group) => {
              const groupId = `${pipelineId}:${group.key}`;
              const groupOpen = !closedHorizontalGroups.has(groupId);
              const templateCount = group.stages.reduce(
                (sum, stage) => sum + (detail?.byStage?.[stage.id]?.length || 0),
                0,
              );
              return (
                <div key={group.key} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-1.5">
                  <button
                    type="button"
                    onClick={() => setClosedHorizontalGroups((previous) => {
                      const next = new Set(previous);
                      if (next.has(groupId)) next.delete(groupId);
                      else next.add(groupId);
                      return next;
                    })}
                    className={`flex w-full items-center justify-between gap-1 rounded-lg px-0.5 py-0.5 text-left cursor-pointer transition-colors ${
                      groupOpen ? 'mb-1.5' : ''
                    } hover:bg-white/80`}
                    aria-expanded={groupOpen}
                  >
                    <span className="flex items-center gap-1">
                      {groupOpen
                        ? <ChevronDown className="h-2.5 w-2.5 text-slate-400" />
                        : <ChevronRight className="h-2.5 w-2.5 text-slate-400" />}
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                        style={{ color: group.color, backgroundColor: `${group.color}16` }}
                      >
                        {group.label}
                      </span>
                    </span>
                    <span className="text-[7px] text-slate-400">
                      {group.stages.length} cột · {templateCount} mẫu
                    </span>
                  </button>
                  {groupOpen && <div className="space-y-1">
                    {group.stages.map((stage) => {
                      const active = String(stage.id) === String(stageId);
                      const stageTemplates = detail?.byStage?.[stage.id] || [];
                      const templateCountForStage = stageTemplates.length;
                      const taskCount = stageTemplates.reduce(
                        (sum, template) => sum + templateItems(template).length,
                        0,
                      );
                      return (
                        <button
                          key={stage.id}
                          type="button"
                          onClick={() => setStageId(stage.id)}
                          className={`w-full rounded-lg border px-2 py-1.5 text-left transition-all cursor-pointer ${
                            active
                              ? 'border-[#296DFF]/50 bg-blue-50 ring-1 ring-[#296DFF]/20'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color || '#94a3b8' }} />
                            <span className={`min-w-0 flex-1 truncate text-[9px] font-medium ${active ? 'text-blue-700' : 'text-slate-700'}`}>
                              {stage.icon ? `${stage.icon} ` : ''}{stage.name}
                            </span>
                            <span className="shrink-0 text-[8px] text-slate-400">
                              {templateCountForStage} mẫu · {taskCount} NV
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>}
                </div>
              );
            })}
          </HorizontalColumn>

          <ArrowRight className="mt-8 h-4 w-4 shrink-0 text-[#296DFF]/45" />

          <HorizontalColumn title="Nhiệm vụ" icon={<ListTree className="h-3 w-3" />} empty={selectedStage ? 'Cột chưa có mẫu nhiệm vụ' : 'Chọn một cột'}>
            {selectedTemplates.map((template) => (
              <div key={template.id} className="rounded-xl border border-slate-200 bg-white p-2">
                <p className="truncate text-[9px] font-semibold text-slate-700">{templateLabel(template)}</p>
                <div className="mt-1 space-y-0.5">
                  {templateItems(template).length === 0 ? (
                    <p className="text-[8px] italic text-slate-400">Chưa có đầu việc</p>
                  ) : templateItems(template).map((item) => (
                    <p key={item.id} className="truncate rounded bg-slate-50 px-1.5 py-1 text-[8px] text-slate-600">
                      {item.title || item.name || 'Nhiệm vụ'}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </HorizontalColumn>
        </div>
      )}
    </div>
  );
}

const HISTORY_LIMIT = 60;
/** Kéo node bắn ra rất nhiều thay đổi vị trí — gộp lại thành một mốc hoàn tác. */
const HISTORY_DEBOUNCE_MS = 350;

/** Đúng các trường của node được ghi xuống DB — xem nodesToStepsPayload. */
const HISTORY_DATA_FIELDS = [
  'node_kind', 'node_config', 'label', 'module_key', 'handoff_trigger', 'description',
  'company_unit_id', 'template_set_id', 'division_unit_id', 'branch_mode', 'join_mode',
];

/**
 * Chữ ký đồ thị dùng để so hai trạng thái. Chỉ lấy phần được lưu: canvas còn nhét
 * callback, danh sách module và cờ bung hệ sinh thái vào `node.data`, tính vào đây
 * thì mỗi lần chọn node lại đẻ ra một mốc hoàn tác rỗng.
 */
function graphKey(nodes, edges, conditions) {
  return JSON.stringify({
    n: nodes.map((n) => [
      n.id,
      Math.round(n.position?.x ?? 0),
      Math.round(n.position?.y ?? 0),
      HISTORY_DATA_FIELDS.map((f) => n.data?.[f] ?? null),
    ]),
    e: edges.map((e) => [e.id, e.source, e.target, e.data?.label ?? '', e.data?.condition_logic ?? 'all']),
    c: conditions,
  });
}

/** Ngăn xếp hoàn tác / làm lại cho canvas: node, cạnh và điều kiện đi cùng nhau. */
function useGraphHistory({ nodes, edges, conditions, setNodes, setEdges, setConditions, onRestore }) {
  const ref = useRef(null);
  const [, bump] = useState(0);

  if (ref.current === null) {
    ref.current = {
      past: [],
      future: [],
      current: { nodes, edges, conditions, key: graphKey(nodes, edges, conditions) },
    };
  }

  useEffect(() => {
    const h = ref.current;
    if (graphKey(nodes, edges, conditions) === h.current.key) return undefined;
    const timer = setTimeout(() => {
      const key = graphKey(nodes, edges, conditions);
      if (key === h.current.key) return;
      h.past.push(h.current);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
      h.future = [];
      h.current = { nodes, edges, conditions, key };
      bump((v) => v + 1);
    }, HISTORY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [nodes, edges, conditions]);

  const restore = useCallback((entry) => {
    setNodes(entry.nodes);
    setEdges(entry.edges);
    setConditions(entry.conditions);
    onRestore?.();
    bump((v) => v + 1);
  }, [setNodes, setEdges, setConditions, onRestore]);

  const undo = useCallback(() => {
    const h = ref.current;
    if (!h.past.length) return;
    h.future.push(h.current);
    h.current = h.past.pop();
    restore(h.current);
  }, [restore]);

  const redo = useCallback(() => {
    const h = ref.current;
    if (!h.future.length) return;
    h.past.push(h.current);
    h.current = h.future.pop();
    restore(h.current);
  }, [restore]);

  return {
    undo,
    redo,
    canUndo: ref.current.past.length > 0,
    canRedo: ref.current.future.length > 0,
  };
}

function FlowCanvasEditor({ flow, flows = [], customModules, onCancel, onSaved, onSwitchFlow, onCreateNew }) {
  const wrapperRef = useRef(null);
  const rfRef = useRef(null);
  const initial = useMemo(() => buildInitialGraph(flow, customModules), [flow, customModules]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [name, setName] = useState(flow?.name || 'Luồng CRM → SX → Lắp đặt');
  const [description, setDescription] = useState(flow?.description || '');
  const [isActive, setIsActive] = useState(flow?.is_active !== false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [conditions, setConditions] = useState(() => (
    initial.conditions || conditionsFromApi(flow?.conditions)
  ));
  const [dirty, setDirty] = useState(() => Boolean(initial.fromBlueprint));
  const [conditionPicker, setConditionPicker] = useState(null);
  const [saving, setSaving] = useState(false);
  const isMobileCanvas = useIsMobile();
  // Palette 220px + inspector 300px chen ngang canvas: ở 375px canvas chỉ còn ~190px.
  // Mặc định thu gọn palette trên mobile — vẫn bật lại được bằng nút trên thanh công cụ.
  const [showLeft, setShowLeft] = useState(() => !isMobileCanvas);
  const [showRight, setShowRight] = useState(false);
  const [showBranches, setShowBranches] = useState(false);
  const [ecosystemNodeId, setEcosystemNodeId] = useState(null);
  const [flowMenuOpen, setFlowMenuOpen] = useState(false);
  const [draggingModule, setDraggingModule] = useState(false);
  const [actionRun, setActionRun] = useState(null);
  const [moduleVars, setModuleVars] = useState(null);

  // Biến của bước module do backend công bố — nạp một lần để dựng menu «Chèn dữ liệu».
  useEffect(() => {
    let alive = true;
    api.get('/flows/meta/module-variables')
      .then(({ data }) => { if (alive) setModuleVars(data?.variables || {}); })
      .catch(() => { if (alive) setModuleVars({}); });
    return () => { alive = false; };
  }, []);

  const hasActionNodes = useMemo(
    () => nodes.some((n) => ['report', 'ai_report', 'notify'].includes(n.data?.node_kind)),
    [nodes],
  );

  const markDirty = useCallback(() => setDirty(true), []);
  const handleNodesChange = useCallback((changes) => {
    if (changes.some((c) => !['select', 'dimensions'].includes(c.type))) setDirty(true);
    const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
    if (removed.length) {
      setConditions((prev) => prev.filter((cond) => (
        !removed.includes(cond.step_node_id)
        && !removed.includes(cond.source_node_id)
        && !removed.includes(cond.target_node_id)
      )));
    }
    onNodesChange(changes);
  }, [onNodesChange]);
  const handleEdgesChange = useCallback((changes) => {
    if (changes.some((c) => c.type !== 'select')) setDirty(true);
    const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
    if (removed.length) {
      const gone = edgesRef.current.filter((e) => removed.includes(e.id));
      setConditions((prev) => prev.filter((cond) => !gone.some((e) => (
        cond.scope === 'edge' && cond.source_node_id === e.source && cond.target_node_id === e.target
      ))));
      setSelectedEdgeId((prev) => (removed.includes(prev) ? null : prev));
    }
    onEdgesChange(changes);
  }, [onEdgesChange]);
  const confirmDiscard = useCallback(
    () => !dirty || confirm('Luồng có thay đổi chưa lưu. Rời khỏi và bỏ thay đổi?'),
    [dirty],
  );

  const { undo, redo, canUndo, canRedo } = useGraphHistory({
    nodes,
    edges,
    conditions,
    setNodes,
    setEdges,
    setConditions,
    onRestore: markDirty,
  });

  // Ctrl/Cmd+Z hoàn tác, thêm Shift (hoặc Ctrl+Y) để làm lại — bỏ qua khi đang gõ chữ.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  const selectedNode = nodes.find((n) => n.id === selectedId) || null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) || null;

  const paletteBuiltin = BUILTIN_MODULES;
  const paletteCustom = useMemo(() => (
    (customModules || []).map((m) => ({
      key: m.module_key,
      label: m.name || m.module_key,
      desc: m.description || 'Module tùy chỉnh',
      color: m.color || '#4f46e5',
      Icon: Puzzle,
      emoji: m.icon || null,
      isCustom: true,
    }))
  ), [customModules]);

  const allPaletteModules = useMemo(
    () => [...paletteBuiltin, ...paletteCustom],
    [paletteBuiltin, paletteCustom],
  );

  const usedKeys = useMemo(
    () => new Set(nodes.map((n) => n.data?.module_key).filter(Boolean)),
    [nodes],
  );

  // Cho phép lặp lại module ở nhánh khác; trùng trên cùng một nhánh sẽ bị chặn lúc lưu.
  const availableModules = allPaletteModules;
  const availableKeySig = useMemo(
    () => availableModules.map((m) => m.key).join('|'),
    [availableModules],
  );

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  /** Node nguồn chạy song song khi có từ hai cạnh ra trở lên. */
  const applyBranchMode = useCallback((sourceId, mode) => {
    setNodes((nds) => nds.map((n) => (
      n.id === sourceId ? { ...n, data: { ...n.data, branch_mode: mode } } : n
    )));
  }, [setNodes]);

  const createFlowNode = useCallback((spec, position) => {
    const parsed = normalizeAddSpec(spec);
    if (!parsed) return null;
    if (isSpecialKind(parsed.kind)) {
      const meta = specialMeta(parsed.kind);
      return {
        id: `n-${parsed.kind}-${Date.now()}`,
        type: rfNodeType(parsed.kind),
        position: position || { x: 80 + nodesRef.current.length * (NODE_W + 80), y: 160 },
        data: {
          node_kind: parsed.kind,
          node_config: defaultNodeConfig(parsed.kind),
          description: '',
          branch_mode: parsed.kind === NODE_KIND.CONDITION ? 'conditional' : 'sequential',
          join_mode: parsed.kind === NODE_KIND.JOIN ? 'all' : 'all',
          label: meta?.label || parsed.kind,
          color: meta?.color || '#64748b',
        },
      };
    }
    const moduleKey = parsed.moduleKey;
    if (!moduleKey) return null;
    const meta = moduleMeta(moduleKey, customModules);
    return {
      id: `n-${moduleKey}-${Date.now()}`,
      type: 'moduleNode',
      position: position || { x: 80 + nodesRef.current.length * (NODE_W + 80), y: 160 },
      data: {
        node_kind: NODE_KIND.MODULE,
        module_key: moduleKey,
        handoff_trigger: DEFAULT_TRIGGER[moduleKey] || 'manual',
        description: '',
        branch_mode: 'sequential',
        join_mode: 'all',
        node_config: {},
        label: meta.label,
        color: meta.color,
        desc: meta.desc,
        isCustom: Boolean(meta.isCustom),
        emoji: meta.emoji || null,
      },
    };
  }, [customModules]);

  const addFlowNode = useCallback((spec, position, connectFromId, mode = 'sequential') => {
    const node = createFlowNode(spec, position);
    if (!node) return;
    const id = node.id;

    setNodes((nds) => nds.concat(node));
    if (connectFromId) {
      setEdges((eds) => eds.concat(newEdge(connectFromId, id)));
      if (mode === 'parallel' || mode === 'conditional') applyBranchMode(connectFromId, mode);
    }
    setSelectedId(id);
    setSelectedEdgeId(null);
    setShowRight(true);
    setShowBranches(false);
    setEcosystemNodeId(null);
    setDirty(true);
  }, [createFlowNode, setNodes, setEdges, applyBranchMode]);

  /**
   * Chèn một module vào giữa cạnh: cắt cạnh cũ thành hai chặng và đẩy phần
   * phía sau sang phải nếu chỗ trống không đủ cho node mới.
   */
  const insertNodeOnEdge = useCallback((edgeId, spec) => {
    const edge = edgesRef.current.find((e) => e.id === edgeId);
    const parsed = normalizeAddSpec(spec);
    if (!edge || !parsed) return;
    const source = nodesRef.current.find((n) => n.id === edge.source);
    const target = nodesRef.current.find((n) => n.id === edge.target);

    const srcX = source?.position?.x ?? 0;
    const srcY = source?.position?.y ?? 160;
    const tgtX = target?.position?.x ?? srcX + (NODE_W + NODE_GAP) * 2;
    const tgtY = target?.position?.y ?? srcY;
    const midX = srcX + NODE_W + NODE_GAP;
    const needed = (NODE_W + NODE_GAP) * 2;
    const shift = Math.max(0, needed - (tgtX - srcX));

    const node = createFlowNode(parsed, {
      x: midX,
      y: Math.round((srcY + tgtY) / 2),
    });
    if (!node) return;

    setNodes((nds) => nds
      .map((n) => (shift > 0 && n.id !== source?.id && (n.position?.x ?? 0) >= tgtX
        ? { ...n, position: { ...n.position, x: (n.position?.x ?? 0) + shift } }
        : n))
      .concat(node));

    setEdges((eds) => eds
      .filter((e) => e.id !== edgeId)
      .concat(
        { ...newEdge(edge.source, node.id), data: { ...(edge.data || {}) } },
        newEdge(node.id, edge.target),
      ));

    // Điều kiện của cạnh cũ tham chiếu dữ liệu node nguồn nên theo chặng đầu.
    setConditions((prev) => prev.map((c) => (
      c.scope === 'edge' && c.source_node_id === edge.source && c.target_node_id === edge.target
        ? { ...c, target_node_id: node.id }
        : c
    )));

    setSelectedEdgeId(null);
    setSelectedId(node.id);
    setShowRight(true);
    setShowBranches(false);
    setEcosystemNodeId(null);
    setDirty(true);
  }, [createFlowNode, setNodes, setEdges]);

  const onAddNext = useCallback((sourceId, spec, mode = 'sequential') => {
    const source = nodesRef.current.find((n) => n.id === sourceId);
    if (!source) return addFlowNode(spec, undefined, sourceId, mode);
    const baseX = (source.position?.x || 0) + NODE_W + NODE_GAP;
    const baseY = source.position?.y || 160;
    const siblings = edgesRef.current.filter((e) => e.source === sourceId).length;
    const offset = (mode === 'parallel' || mode === 'conditional') ? siblings * 190 : 0;
    return addFlowNode(spec, { x: baseX, y: baseY + offset }, sourceId, mode);
  }, [addFlowNode]);

  const onConnectExisting = useCallback((sourceId, targetId, mode = 'sequential') => {
    setEdges((eds) => {
      if (eds.some((e) => e.source === sourceId && e.target === targetId)) return eds;
      return eds.concat(newEdge(sourceId, targetId));
    });
    if (mode === 'parallel' || mode === 'conditional') applyBranchMode(sourceId, mode);
    setDirty(true);
  }, [setEdges, applyBranchMode]);

  const onAddNextRef = useRef(onAddNext);
  onAddNextRef.current = onAddNext;
  const onConnectExistingRef = useRef(onConnectExisting);
  onConnectExistingRef.current = onConnectExisting;
  const availableRef = useRef(availableModules);
  availableRef.current = availableModules;
  const insertOnEdgeRef = useRef(insertNodeOnEdge);
  insertOnEdgeRef.current = insertNodeOnEdge;
  const stableAddNext = useCallback((...args) => onAddNextRef.current(...args), []);
  const stableConnectExisting = useCallback((...args) => onConnectExistingRef.current(...args), []);
  const stableInsertOnEdge = useCallback((...args) => insertOnEdgeRef.current(...args), []);
  const toggleNodeEcosystem = useCallback((nodeId) => {
    if (ecosystemNodeId === nodeId) {
      setEcosystemNodeId(null);
      setShowRight(true);
      return;
    }
    // Sơ đồ bốn cấp cần toàn bộ chiều rộng canvas; toolbar vẫn cho phép bật lại hai panel.
    setEcosystemNodeId(nodeId);
    setShowLeft(false);
    setShowRight(false);
  }, [ecosystemNodeId]);

  // Node nào có thể nối tới từ mỗi node (bỏ chính nó và các cạnh đã có).
  const connectTargetsByNode = useMemo(() => {
    const map = new Map();
    for (const n of nodes) {
      const linked = new Set(edges.filter((e) => e.source === n.id).map((e) => e.target));
      map.set(n.id, nodes
        .filter((t) => t.id !== n.id && !linked.has(t.id))
        .map((t) => ({ id: t.id, label: t.data?.label || t.data?.module_key, color: t.data?.color || '#64748b' })));
    }
    return map;
  }, [nodes, edges]);

  // Gắn callback + danh sách module vào mọi node (tránh vòng lặp render).
  useEffect(() => {
    setNodes((nds) => {
      let changed = false;
      const next = nds.map((n) => {
        const prevSig = (n.data?.availableModules || []).map((m) => m.key).join('|');
        const ecosystemExpanded = n.id === ecosystemNodeId;
        const targets = connectTargetsByNode.get(n.id) || [];
        const targetSig = targets.map((t) => t.id).join('|');
        const prevTargetSig = (n.data?.connectTargets || []).map((t) => t.id).join('|');
        if (
          prevSig === availableKeySig
          && prevTargetSig === targetSig
          && n.data?.onAddNext === stableAddNext
          && n.data?.onConnectExisting === stableConnectExisting
          && n.data?.onToggleEcosystem === toggleNodeEcosystem
          && Boolean(n.data?.ecosystemExpanded) === ecosystemExpanded
        ) return n;
        changed = true;
        return {
          ...n,
          data: {
            ...n.data,
            availableModules: availableRef.current,
            availableSpecials: SPECIAL_KINDS,
            connectTargets: targets,
            onAddNext: stableAddNext,
            onConnectExisting: stableConnectExisting,
            onToggleEcosystem: toggleNodeEcosystem,
            ecosystemExpanded,
          },
        };
      });
      return changed ? next : nds;
    });
  }, [
    availableKeySig, connectTargetsByNode, ecosystemNodeId, setNodes,
    stableAddNext, stableConnectExisting, toggleNodeEcosystem,
  ]);

  const onConnect = useCallback((params) => {
    setDirty(true);
    setEdges((eds) => addEdge({ ...params, ...edgeDefaults, data: { label: '', condition_logic: 'all' } }, eds));
  }, [setEdges]);

  /** Cạnh kèm thông tin hiển thị: quan hệ, kiểu chạy của node nguồn, số điều kiện. */
  const decoratedEdges = useMemo(() => {
    const degrees = degreeMap(nodes, edges);
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    return edges.map((e) => {
      // Chèn lại chính module hai đầu sẽ thành trùng module trên cùng nhánh.
      const neighbourKeys = new Set([
        nodeById.get(e.source)?.data?.module_key,
        nodeById.get(e.target)?.data?.module_key,
      ]);
      return {
        ...e,
        selected: e.id === selectedEdgeId,
        data: {
          ...(e.data || {}),
          cardinality: edgeCardinality(e, degrees),
          branch_mode: nodeById.get(e.source)?.data?.branch_mode || 'sequential',
          condition_count: conditionsForEdge(conditions, e.source, e.target).length,
          availableModules: availableModules.filter((m) => !neighbourKeys.has(m.key)),
          availableSpecials: SPECIAL_KINDS,
          onInsert: stableInsertOnEdge,
        },
      };
    });
  }, [nodes, edges, conditions, selectedEdgeId, availableModules, stableInsertOnEdge]);

  const onDragStartPalette = (e, payload) => {
    e.dataTransfer.setData(PALETTE_MIME, encodePalettePayload(payload));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingModule(true);
  };

  const onDragEndPalette = () => setDraggingModule(false);

  const onDragOverCanvas = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDropCanvas = (e) => {
    e.preventDefault();
    setDraggingModule(false);
    const spec = decodePalettePayload(e.dataTransfer.getData(PALETTE_MIME));
    if (!spec) return;
    const position = rfRef.current?.screenToFlowPosition
      ? rfRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      : { x: e.clientX - 200, y: e.clientY - 120 };
    addFlowNode(spec, { x: position.x - NODE_W / 2, y: position.y - 48 }, null);
  };

  const updateSelectedData = (patch) => {
    if (!selectedId) return;
    setDirty(true);
    setNodes((nds) => nds.map((n) => (
      n.id === selectedId
        ? { ...n, data: { ...n.data, ...patch } }
        : n
    )));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setDirty(true);
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setConditions((prev) => prev.filter((c) => (
      c.step_node_id !== selectedId && c.source_node_id !== selectedId && c.target_node_id !== selectedId
    )));
    setSelectedId(null);
    setShowBranches(false);
    setEcosystemNodeId(null);
  };

  const deleteSelectedEdge = () => {
    if (!selectedEdge) return;
    setDirty(true);
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
    setConditions((prev) => prev.filter((c) => !(
      c.scope === 'edge' && c.source_node_id === selectedEdge.source && c.target_node_id === selectedEdge.target
    )));
    setSelectedEdgeId(null);
  };

  const updateSelectedEdgeData = (patch) => {
    if (!selectedEdgeId) return;
    setDirty(true);
    setEdges((eds) => eds.map((e) => (
      e.id === selectedEdgeId ? { ...e, data: { ...(e.data || {}), ...patch } } : e
    )));
  };

  const addCondition = (payload) => {
    setDirty(true);
    setConditions((prev) => prev.concat({
      cid: newConditionId(),
      is_required: true,
      ...conditionPicker.target,
      ...payload,
    }));
  };

  const removeCondition = (cid) => {
    setDirty(true);
    setConditions((prev) => prev.filter((c) => c.cid !== cid));
  };

  const toggleConditionRequired = (cid) => {
    setDirty(true);
    setConditions((prev) => prev.map((c) => (
      c.cid === cid ? { ...c, is_required: !c.is_required } : c
    )));
  };

  const openNodeConditionPicker = () => {
    if (!selectedNode) return;
    const prevModule = [...orderFromGraph(nodes, edges)]
      .reverse()
      .find((n) => n.id !== selectedNode.id && n.data?.module_key);
    setConditionPicker({
      moduleKey: selectedNode.data.module_key || prevModule?.data?.module_key || 'crm',
      targetLabel: `node ${selectedNode.data.label}`,
      target: { scope: 'step', step_node_id: selectedNode.id, source_node_id: null, target_node_id: null },
    });
  };

  const openEdgeConditionPicker = () => {
    if (!selectedEdge) return;
    const sourceNode = nodes.find((n) => n.id === selectedEdge.source);
    const targetNode = nodes.find((n) => n.id === selectedEdge.target);
    setConditionPicker({
      moduleKey: sourceNode?.data?.module_key || 'crm',
      targetLabel: `cạnh ${sourceNode?.data?.label || ''} → ${targetNode?.data?.label || ''}`,
      target: {
        scope: 'edge',
        step_node_id: null,
        source_node_id: selectedEdge.source,
        target_node_id: selectedEdge.target,
      },
    });
  };

  const save = async ({ stayOpen = true } = {}) => {
    if (!name.trim()) return alert('Nhập tên luồng');

    const { errors, warnings } = validateGraph(nodes, edges, {
      moduleLabel: (key) => moduleMeta(key, customModules).label,
    });
    if (errors.length) return alert(errors.join('\n'));
    if (warnings.length && !confirm(`${warnings.join('\n')}\n\nVẫn lưu?`)) return;

    setSaving(true);
    try {
      const stepsPayload = nodesToStepsPayload(nodes, edges);
      const edgesPayload = edgesToPayload(edges);
      const conditionsPayload = conditionsToPayload(conditions);

      let flowId = flow?.id;
      let saved = null;
      if (!flowId) {
        const { data } = await api.post('/flows', {
          name: name.trim(),
          description: description || null,
          is_default: false,
          color: '#0ea5e9',
          icon: '🔄',
          steps: stepsPayload,
          edges: edgesPayload,
          conditions: conditionsPayload,
        });
        flowId = data.flow?.id;
        saved = data.flow;
        if (flowId && isActive === false) {
          const { data: upd } = await api.put(`/flows/${flowId}`, { is_active: false });
          saved = upd.flow || saved;
        }
      } else {
        const { data: upd } = await api.put(`/flows/${flowId}`, {
          name: name.trim(),
          description: description || null,
          is_active: isActive,
        });
        await api.put(`/flows/${flowId}/steps`, {
          steps: stepsPayload,
          edges: edgesPayload,
          conditions: conditionsPayload,
        });
        saved = upd.flow || { ...flow, id: flowId, name: name.trim(), is_active: isActive };
      }
      setDirty(false);
      if (stayOpen) onSaved?.(saved || { id: flowId });
      else onSaved?.(null);
      setSaving(false);
      return flowId;
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu luồng');
    }
    setSaving(false);
    return null;
  };

  // Khối hành động chạy trên bản đã lưu, nên lưu trước rồi mới chạy.
  // `subject` = deal / dự án lấy số liệu cho các bước module; bỏ trống thì backend tự chọn bản mới nhất.
  const runActions = async (dryRun, subject = null) => {
    const flowId = await save({ stayOpen: true });
    if (!flowId) return;
    if (!dryRun && !confirm('Gửi thật tin nhắn tới người/nhóm đã cấu hình?')) return;

    setActionRun((prev) => ({ ...(prev || {}), loading: true, dryRun, steps: [], error: null }));
    try {
      const { data } = await api.post(`/flows/${flowId}/run-actions`, {
        dry_run: dryRun,
        deal_id: subject?.dealId || undefined,
        project_id: subject?.projectId || undefined,
      });
      setActionRun({
        loading: false,
        dryRun,
        steps: data.steps || [],
        subject: data.subject || null,
        subjectLabel: subject?.label || data.subject?.label || '',
        missingSubjects: data.missingSubjects || [],
        error: null,
      });
    } catch (e) {
      setActionRun({
        loading: false,
        dryRun,
        steps: [],
        error: e.response?.data?.error || e.message || 'Không chạy được',
      });
    }
  };

  const applyStandardFlow = () => {
    if (!confirm('Dựng lại canvas theo luồng CRM → SX → Lắp đặt đang chạy (Thắng / Mất / chuyển SX / đóng gói / bàn giao LĐ)? Vị trí node hiện tại sẽ được thay.')) return;
    const graph = buildStandardCabinetBlueprint();
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setConditions(graph.conditions);
    setSelectedId(null);
    setSelectedEdgeId(null);
    setShowRight(false);
    setDirty(true);
    setTimeout(() => rfRef.current?.fitView?.({ padding: 0.25 }), 50);
  };

  const toggleActive = async () => {
    const next = !isActive;
    setIsActive(next);
    if (!flow?.id) return;
    try {
      await api.put(`/flows/${flow.id}`, { is_active: next });
    } catch (e) {
      setIsActive(!next);
      alert(e.response?.data?.error || 'Không đổi được trạng thái');
    }
  };

  const chainPreview = orderFromGraph(nodes, edges)
    .map((n) => nodeDisplayLabel(n.data, (key) => moduleMeta(key, customModules).label));

  return (
    <div className="overflow-hidden flex flex-col flex-1 min-h-0 h-full bg-[#f2f4f7]">
      <div className="flex items-center gap-2 px-3 h-14 bg-white/90 backdrop-blur border-b border-slate-200/80 shrink-0">
        <button
          type="button"
          onClick={() => { if (confirmDiscard()) onCancel?.(); }}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
          title="Đóng"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title="Hoàn tác (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title="Làm lại (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>

        {/* Chuyển luồng */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setFlowMenuOpen((v) => !v)}
            className="h-8 max-w-[200px] px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white text-[12px] font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
            title="Chuyển luồng"
          >
            <GitBranch className="h-3.5 w-3.5 text-[#296DFF] shrink-0" />
            <span className="truncate">{name || 'Luồng'}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          </button>
          {flowMenuOpen && (
            <>
              <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Đóng" onClick={() => setFlowMenuOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-40 w-64 rounded-xl bg-white shadow-lg ring-1 ring-slate-200 p-1.5 max-h-72 overflow-y-auto">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Các luồng</p>
                {(flows || []).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFlowMenuOpen(false);
                      if (f.id === flow?.id) return;
                      if (!confirmDiscard()) return;
                      onSwitchFlow?.(f);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-[12px] cursor-pointer flex items-center gap-2 ${
                      f.id === flow?.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="truncate flex-1">{f.name}</span>
                    <span className={`text-[9px] shrink-0 ${f.is_active === false ? 'text-slate-400' : 'text-emerald-600'}`}>
                      {f.is_active === false ? 'Tắt' : 'Bật'}
                    </span>
                  </button>
                ))}
                <div className="border-t border-slate-100 mt-1 pt-1">
                  <button
                    type="button"
                    onClick={() => { setFlowMenuOpen(false); if (confirmDiscard()) onCreateNew?.(); }}
                    className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[12px] font-semibold text-[#296DFF] hover:bg-blue-50 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" /> Tạo luồng mới
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 min-w-0 flex-1">
          <input value={name} onChange={(e) => { setName(e.target.value); markDirty(); }} className="h-8 px-2 text-[14px] font-semibold text-slate-800 bg-transparent border-0 outline-none min-w-[120px] max-w-xs truncate" placeholder="Tên luồng" />
          <input value={description} onChange={(e) => { setDescription(e.target.value); markDirty(); }} className="hidden lg:block h-8 px-1 text-[12px] text-slate-500 bg-transparent border-0 outline-none flex-1 min-w-[80px] max-w-sm truncate" placeholder="Mô tả ngắn…" />
          {dirty && <span className="shrink-0 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Chưa lưu</span>}
        </div>

        <button
          type="button"
          onClick={() => setShowLeft((v) => !v)}
          className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer ${showLeft ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}
          title={showLeft ? 'Ẩn palette' : 'Hiện palette'}
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setShowRight((v) => !v)}
          className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer ${showRight ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}
          title={showRight ? 'Ẩn thuộc tính' : 'Hiện thuộc tính'}
        >
          <PanelRight className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={toggleActive}
          className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer border transition-colors ${
            isActive
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
          }`}
          title={isActive ? 'Luồng đang bật — bấm để tắt' : 'Luồng đang tắt — bấm để bật'}
        >
          <Power className="h-3.5 w-3.5" />
          {isActive ? 'Đang bật' : 'Đã tắt'}
        </button>

        <button
          type="button"
          onClick={applyStandardFlow}
          className="h-8 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
          title="Dựng canvas đúng điều kiện CRM → SX → Lắp đặt đang chạy"
        >
          <GitFork className="h-3.5 w-3.5" />
          Luồng chuẩn
        </button>

        {hasActionNodes && (
          <button
            type="button"
            onClick={() => runActions(true)}
            disabled={saving || actionRun?.loading}
            className="h-8 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            title="Lưu luồng rồi chạy thử chuỗi báo cáo → AI → nhắn tin (chưa gửi đi)"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            {actionRun?.loading ? 'Đang chạy…' : 'Chạy thử'}
          </button>
        )}

        <button
          type="button"
          onClick={() => save({ stayOpen: true })}
          disabled={saving}
          className="h-9 px-3.5 bg-[#296DFF] text-white rounded-xl text-[13px] font-semibold flex items-center gap-1.5 hover:bg-[#1f5ae0] cursor-pointer disabled:opacity-50 shadow-[0_4px_12px_rgba(41,109,255,0.35)]"
        >
          <Save className="h-3.5 w-3.5" /> {saving ? 'Đang lưu…' : 'Lưu'}
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {showLeft && (
          <aside className="w-[220px] shrink-0 bg-white/70 backdrop-blur border-r border-slate-200/80 p-3 overflow-y-auto">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Hệ thống</p>
              <button type="button" onClick={() => setShowLeft(false)} className="text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer">Ẩn</button>
            </div>
            <div className="space-y-1.5 mb-5">
              {paletteBuiltin.map((m) => (
                <PaletteItem key={m.key} m={m} used={usedKeys.has(m.key)} onDragStart={onDragStartPalette} onDragEnd={onDragEndPalette} />
              ))}
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-amber-600 mb-2 px-0.5">Điều khiển</p>
            <div className="space-y-1.5 mb-5">
              {SPECIAL_KINDS.filter((k) => k.category === 'control').map((k) => {
                const Icon = SPECIAL_ICONS[k.kind] || GitFork;
                return (
                  <PaletteItem
                    key={k.kind}
                    m={{ key: k.kind, label: k.label, desc: k.desc, color: k.color, Icon }}
                    used={false}
                    payload={{ kind: k.kind }}
                    onDragStart={onDragStartPalette}
                    onDragEnd={onDragEndPalette}
                  />
                );
              })}
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-orange-600 mb-2 px-0.5">Hành động</p>
            <div className="space-y-1.5 mb-5">
              {SPECIAL_KINDS.filter((k) => k.category === 'action').map((k) => {
                const Icon = SPECIAL_ICONS[k.kind] || BellRing;
                return (
                  <PaletteItem
                    key={k.kind}
                    m={{ key: k.kind, label: k.label, desc: k.desc, color: k.color, Icon }}
                    used={false}
                    payload={{ kind: k.kind }}
                    onDragStart={onDragStartPalette}
                    onDragEnd={onDragEndPalette}
                  />
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-1 mb-2 px-0.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-violet-500">Tùy chỉnh</p>
              <Link to="/ecosystem/app-modules" className="text-[10px] text-violet-600 hover:text-violet-800 flex items-center gap-0.5 font-medium">
                <ExternalLink className="h-3 w-3" /> Tạo
              </Link>
            </div>
            <div className="space-y-1.5">
              {paletteCustom.length === 0 ? (
                <div className="px-2.5 py-3 rounded-xl border border-dashed border-violet-200 bg-violet-50/40 text-[11px] text-violet-700 leading-relaxed">
                  Chưa có module. <Link to="/ecosystem/app-modules" className="font-semibold underline underline-offset-2">Tạo mới</Link> rồi kéo vào canvas.
                </div>
              ) : (
                paletteCustom.map((m) => (
                  <PaletteItem key={m.key} m={{ ...m, isCustom: true }} used={usedKeys.has(m.key)} onDragStart={onDragStartPalette} onDragEnd={onDragEndPalette} />
                ))
              )}
            </div>
            <div className="mt-5 px-2.5 py-2.5 rounded-xl bg-slate-50 text-[10px] text-slate-500 leading-relaxed">
              <p className="font-semibold text-slate-600 flex items-center gap-1 mb-1"><MousePointer2 className="h-3 w-3" /> Hướng dẫn</p>
              <p>Kéo module hoặc khối điều kiện / hành động · bấm + trên node hoặc cạnh · Lưu</p>
            </div>
          </aside>
        )}

        <div
          className={`flex-1 relative min-w-0 module-flow-canvas ${draggingModule ? 'is-dragging-module' : ''}`}
          ref={wrapperRef}
          onDrop={onDropCanvas}
          onDragOver={onDragOverCanvas}
        >
          {!showLeft && (
            <button
              type="button"
              onClick={() => setShowLeft(true)}
              className="absolute left-3 top-3 z-10 h-8 px-2.5 rounded-lg bg-white shadow-sm border border-slate-200 text-[11px] font-semibold text-slate-600 flex items-center gap-1 cursor-pointer hover:bg-slate-50"
            >
              <PanelLeft className="h-3.5 w-3.5" /> Palette
            </button>
          )}
          {!showRight && (
            <button
              type="button"
              onClick={() => setShowRight(true)}
              className="absolute right-3 top-3 z-10 h-8 px-2.5 rounded-lg bg-white shadow-sm border border-slate-200 text-[11px] font-semibold text-slate-600 flex items-center gap-1 cursor-pointer hover:bg-slate-50"
            >
              Thuộc tính <PanelRight className="h-3.5 w-3.5" />
            </button>
          )}

          <ReactFlow
            nodes={nodes}
            edges={decoratedEdges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onInit={(inst) => { rfRef.current = inst; }}
            onNodeClick={(event, node) => {
              if (event.target.closest('[data-ecosystem-toggle]')) return;
              setSelectedId(node.id);
              setSelectedEdgeId(null);
              setShowRight(true);
              setShowBranches(false);
              if (ecosystemNodeId !== node.id) setEcosystemNodeId(null);
            }}
            onEdgeClick={(event, edge) => {
              event.stopPropagation();
              setSelectedEdgeId(edge.id);
              setSelectedId(null);
              setShowRight(true);
              setShowBranches(false);
              setEcosystemNodeId(null);
            }}
            onPaneClick={() => {
              setSelectedId(null);
              setSelectedEdgeId(null);
              setShowRight(false);
              setShowBranches(false);
              setEcosystemNodeId(null);
            }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.35 }}
            deleteKeyCode={['Backspace', 'Delete']}
            connectionLineStyle={{ stroke: EDGE_COLOR, strokeWidth: 2 }}
            defaultEdgeOptions={edgeDefaults}
            proOptions={{ hideAttribution: true }}
            className="!bg-[#f2f4f7]"
          >
            <Background variant="dots" gap={20} size={1.2} color="#cdd3de" />
            <Controls showInteractive={false} className="!shadow-[0_4px_16px_rgba(15,23,42,0.1)] !border-0 !rounded-xl !overflow-hidden !bg-white" />
            <MiniMap nodeStrokeWidth={2} nodeColor={(n) => n.data?.color || '#94a3b8'} maskColor="rgba(15,23,42,0.06)" zoomable pannable className="!bg-white/90 !border-0 !rounded-xl !shadow-[0_4px_16px_rgba(15,23,42,0.1)]" />
          </ReactFlow>

          {chainPreview.length > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/95 backdrop-blur shadow-[0_4px_20px_rgba(15,23,42,0.12)] text-[12px] text-slate-600 max-w-[88%] overflow-x-auto">
              {chainPreview.map((label, idx) => (
                <span key={`${label}-${idx}`} className="flex items-center gap-1.5 shrink-0">
                  {idx > 0 && <ArrowRight className="h-3 w-3 text-[#296DFF]/60" />}
                  <span className="font-semibold text-slate-700">{label}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {showRight && (
          <aside className="w-[300px] shrink-0 bg-white/80 backdrop-blur border-l border-slate-200/80 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Thuộc tính</p>
              <button type="button" onClick={() => setShowRight(false)} className="text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer">Ẩn</button>
            </div>
            {selectedEdge ? (
              <EdgeInspector
                edge={selectedEdge}
                sourceLabel={nodes.find((n) => n.id === selectedEdge.source)?.data?.label || '—'}
                targetLabel={nodes.find((n) => n.id === selectedEdge.target)?.data?.label || '—'}
                cardinality={edgeCardinality(selectedEdge, degreeMap(nodes, edges))}
                branchMode={branchModeLabel(
                  nodes.find((n) => n.id === selectedEdge.source)?.data?.branch_mode,
                ).toLowerCase()}
                conditions={conditionsForEdge(conditions, selectedEdge.source, selectedEdge.target)}
                onChange={updateSelectedEdgeData}
                onDelete={deleteSelectedEdge}
                onAddCondition={openEdgeConditionPicker}
                onRemoveCondition={removeCondition}
                onToggleConditionRequired={toggleConditionRequired}
              />
            ) : !selectedNode ? (
              <div className="rounded-2xl bg-slate-50 px-3.5 py-6 text-center">
                <Layers className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-[12px] text-slate-400 leading-relaxed">Chọn một node để xem thông tin lấy được, trigger và điều kiện; chọn cạnh để chỉnh quan hệ.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-50">
                  <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white shrink-0" style={{ background: selectedNode.data.color }}>
                    {selectedNode.data.emoji || <Puzzle className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-slate-800 truncate">{selectedNode.data.label}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {isSpecialKind(selectedNode.data.node_kind)
                        ? (specialMeta(selectedNode.data.node_kind)?.desc || selectedNode.data.node_kind)
                        : (selectedNode.data.isCustom ? `Custom · ${selectedNode.data.module_key}` : selectedNode.data.module_key)}
                    </p>
                  </div>
                </div>
                <NodeOutputsPanel key={selectedNode.id} nodeData={selectedNode.data} />
                {isSpecialKind(selectedNode.data.node_kind) && (
                  <SpecialNodeInspector
                    nodeData={selectedNode.data}
                    nodeId={selectedNode.id}
                    nodes={nodes}
                    edges={edges}
                    moduleLabelFn={(key) => moduleMeta(key, customModules).label}
                    moduleVars={moduleVars}
                    onChange={updateSelectedData}
                  />
                )}
                {!isSpecialKind(selectedNode.data.node_kind) && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1.5">Trigger bàn giao</label>
                  <select value={selectedNode.data.handoff_trigger || ''} onChange={(e) => updateSelectedData({ handoff_trigger: e.target.value })} className="w-full h-10 px-3 rounded-xl text-[13px] bg-slate-50 border-0 ring-1 ring-slate-200 focus:ring-2 focus:ring-[#296DFF]/40 outline-none">
                    <option value="">— Chọn —</option>
                    {HANDOFF_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                  </select>
                </div>
                )}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1.5">Ghi chú</label>
                  <textarea value={selectedNode.data.description || ''} onChange={(e) => updateSelectedData({ description: e.target.value })} rows={3} className="w-full px-3 py-2.5 rounded-xl text-[13px] bg-slate-50 border-0 ring-1 ring-slate-200 focus:ring-2 focus:ring-[#296DFF]/40 outline-none resize-none" placeholder="Mô tả bước này…" />
                </div>

                {(() => {
                  const degrees = degreeMap(nodes, edges);
                  const outCount = degrees.get(selectedNode.id)?.out || 0;
                  const inCount = degrees.get(selectedNode.id)?.in || 0;
                  return (
                    <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
                      <div className="flex items-center gap-1.5">
                        <Waypoints className="h-3.5 w-3.5 text-[#296DFF]" />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Quan hệ với node khác</p>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {inCount} cạnh vào · {outCount} cạnh ra
                      </p>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">Khi có nhiều nhánh ra</label>
                        <select
                          value={selectedNode.data.branch_mode || 'sequential'}
                          onChange={(e) => updateSelectedData({ branch_mode: e.target.value })}
                          disabled={outCount < 2}
                          className="w-full h-9 px-2.5 rounded-lg text-[12px] bg-slate-50 border-0 ring-1 ring-slate-200 outline-none disabled:opacity-50"
                        >
                          {BRANCH_MODE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                        </select>
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                          {outCount < 2
                            ? 'Nối thêm cạnh ra để chọn chạy song song hoặc rẽ theo điều kiện.'
                            : BRANCH_MODE_OPTIONS.find((o) => o.value === (selectedNode.data.branch_mode || 'sequential'))?.desc}
                        </p>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 block mb-1">Khi có nhiều nhánh vào</label>
                        <select
                          value={selectedNode.data.join_mode || 'all'}
                          onChange={(e) => updateSelectedData({ join_mode: e.target.value })}
                          disabled={inCount < 2}
                          className="w-full h-9 px-2.5 rounded-lg text-[12px] bg-slate-50 border-0 ring-1 ring-slate-200 outline-none disabled:opacity-50"
                        >
                          {JOIN_MODE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                        </select>
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                          {inCount < 2
                            ? 'Node chỉ có một nhánh vào nên không cần quy tắc gộp.'
                            : JOIN_MODE_OPTIONS.find((o) => o.value === (selectedNode.data.join_mode || 'all'))?.desc}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Điều kiện hoàn tất bước
                  </p>
                  <FlowConditionList
                    conditions={conditionsForNode(conditions, selectedNode.id)}
                    onAdd={openNodeConditionPicker}
                    onRemove={removeCondition}
                    onToggleRequired={toggleConditionRequired}
                    emptyHint={selectedNode.data.node_kind === 'condition'
                      ? 'Thêm điều kiện rẽ nhánh. Mỗi cạnh ra nên có điều kiện hoặc dùng nhánh else.'
                      : 'Chưa có điều kiện. Thêm nhiệm vụ bắt buộc hoặc cờ cột để bước này chỉ được coi là xong khi đạt đủ.'}
                  />
                </div>

                {!isSpecialKind(selectedNode.data.node_kind) && (
                <button
                  type="button"
                  onClick={() => setShowBranches((v) => !v)}
                  className={`w-full h-10 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer border transition-colors ${
                    showBranches
                      ? 'bg-[#296DFF]/10 text-[#296DFF] border-[#296DFF]/30'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <ListTree className="h-3.5 w-3.5" />
                  {showBranches ? 'Ẩn pipeline & nhiệm vụ' : 'Hiện pipeline & nhiệm vụ'}
                  {showBranches ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                )}

                {!isSpecialKind(selectedNode.data.node_kind) && showBranches && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-2.5">
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <ListTree className="h-3.5 w-3.5 text-[#296DFF]" />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Sơ đồ pipeline & nhiệm vụ
                      </p>
                    </div>
                    <NodeModuleBranches moduleKey={selectedNode.data.module_key} branchMode />
                  </div>
                )}

                <button type="button" onClick={deleteSelected} className="w-full h-10 rounded-xl text-[13px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 cursor-pointer flex items-center justify-center gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" /> Xóa node
                </button>
              </div>
            )}
          </aside>
        )}
      </div>

      <style>{`
        .module-flow-canvas .react-flow__controls-button {
          border: none !important;
          border-bottom: 1px solid #f1f5f9 !important;
          width: 32px !important;
          height: 32px !important;
        }
        .module-flow-canvas .react-flow__connection-path { stroke: ${EDGE_COLOR} !important; }
        .module-flow-canvas .react-flow__edge { cursor: pointer; }
        .module-flow-canvas .react-flow__handle:hover { transform: scale(1.25); }
        .module-flow-canvas .react-flow__node { overflow: visible !important; }
        .module-flow-canvas .react-flow__node:has([data-ecosystem-open="true"]) { z-index: 1000 !important; }
        .module-flow-canvas .react-flow__node:has([data-menu-open="true"]) { z-index: 1000 !important; }
        /* Dấu + của node nằm đè lên giữa cạnh kế bên, nhường chỗ khi đang kéo module để cạnh nhận được thả. */
        .module-flow-canvas.is-dragging-module [data-node-plus] { pointer-events: none; }
      `}</style>

      {conditionPicker && (
        <FlowConditionPicker
          moduleKey={conditionPicker.moduleKey}
          targetLabel={conditionPicker.targetLabel}
          onClose={() => setConditionPicker(null)}
          onAdd={addCondition}
        />
      )}

      {actionRun && (
        <ActionRunPanel
          run={actionRun}
          onClose={() => setActionRun(null)}
          onSendReal={() => runActions(false, actionRun.subject)}
          onRerun={(subject) => runActions(true, subject)}
        />
      )}
    </div>
  );
}

const ACTION_ICON = {
  report: FileBarChart2,
  ai_report: Sparkles,
  notify: Send,
  ai_classify: Tags,
  ai_extract: ScanText,
  ai_ask: MessageCircleQuestion,
};

/**
 * Chọn deal / dự án lấy số liệu cho các bước module khi chạy thử.
 * Không chọn thì backend mượn bản ghi mới nhất của luồng.
 */
function SubjectPicker({ value, onPick }) {
  const [options, setOptions] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || options) return;
    api.get('/flows/meta/subjects')
      .then(({ data }) => setOptions(data))
      .catch(() => setOptions({ projects: [], deals: [] }));
  }, [open, options]);

  const groups = [
    { key: 'projects', label: 'Dự án', items: options?.projects || [] },
    { key: 'deals', label: 'Deal CRM', items: options?.deals || [] },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-2 rounded-lg text-[11px] font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer max-w-[240px] truncate"
      >
        {value || 'Chọn deal / dự án'}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 max-h-64 overflow-auto rounded-xl bg-white shadow-lg ring-1 ring-slate-200 p-1">
          {!options && <p className="px-2 py-1.5 text-[11px] text-slate-400">Đang tải…</p>}
          {groups.map((g) => (g.items.length > 0 && (
            <div key={g.key} className="mb-1">
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{g.label}</p>
              {g.items.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onPick(g.key === 'projects'
                      ? { projectId: o.id, label: o.label }
                      : { dealId: o.id, label: o.label });
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] text-slate-700 hover:bg-slate-50 truncate"
                >
                  {o.label}
                </button>
              ))}
            </div>
          )))}
        </div>
      )}
    </div>
  );
}

/** Kết quả chạy chuỗi hành động — xem AI viết gì trước khi gửi thật. */
function ActionRunPanel({ run, onClose, onSendReal, onRerun }) {
  const failed = run.steps.filter((s) => s.status === 'error').length;
  const skipped = run.steps.filter((s) => s.status === 'skipped').length;
  const okSteps = run.steps.length - failed - skipped;
  const canSend = run.dryRun && !run.loading && !run.error && failed === 0 && run.steps.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <PlayCircle className="h-4 w-4 text-violet-600" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-slate-800">
              {run.dryRun ? 'Chạy thử — chưa gửi đi' : 'Đã gửi thật'}
            </p>
            <p className="text-[10px] text-slate-400">
              {run.loading
                ? 'Đang chạy…'
                : `${okSteps} khối chạy được${failed ? ` · ${failed} khối lỗi` : ''}${skipped ? ` · ${skipped} khối không thuộc nhánh đã chọn` : ''}`}
            </p>
          </div>
          <SubjectPicker value={run.subjectLabel} onPick={(s) => onRerun(s)} />
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {run.loading && <p className="text-[12px] text-slate-500">Đang lấy số liệu và gọi AI…</p>}

          {!run.loading && run.subjectLabel && (
            <p className="text-[11px] text-slate-500">
              Dữ liệu bước module lấy từ <span className="font-semibold text-slate-700">{run.subjectLabel}</span>
              {run.subject?.auto && ' (tự chọn — bấm nút trên đầu để đổi)'}
            </p>
          )}

          {!run.loading && run.missingSubjects?.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              Chưa lấy được dữ liệu cho bước: {run.missingSubjects.join(', ')}. Deal / dự án đang chọn chưa đi tới bước này.
            </div>
          )}

          {run.error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
              <p className="text-[12px] text-rose-700">{run.error}</p>
            </div>
          )}

          {!run.loading && !run.error && !run.steps.length && (
            <p className="text-[12px] text-slate-500">
              Luồng chưa có khối hành động nào. Kéo «Lấy báo cáo», «AI viết báo cáo» hoặc «Nhắn tin» vào canvas.
            </p>
          )}

          {run.steps.map((step) => {
            const Icon = ACTION_ICON[step.node_kind] || FileBarChart2;
            const out = step.output || {};
            const body = out.report_text || out.answer || out.message || out.text || '';
            const extracted = Object.entries(out.extracted || {});
            const isSkipped = step.status === 'skipped';
            return (
              <div
                key={step.node_id}
                className={`rounded-xl border px-3 py-2.5 ${
                  step.status === 'error' ? 'border-rose-200 bg-rose-50'
                    : isSkipped ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <span className="text-[12px] font-semibold text-slate-700 truncate flex-1">{step.label}</span>
                  {step.status === 'error'
                    ? <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                    : isSkipped
                      ? <MinusCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                  <span className="text-[10px] text-slate-400 shrink-0">{step.ms}ms</span>
                </div>
                {step.status === 'ok' && (out.model_used || out.label) && (
                  <p className="mb-1.5 flex flex-wrap gap-1">
                    {out.label && (
                      <span className="rounded-md bg-fuchsia-50 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-700">
                        Nhãn: {out.label}
                        {Number.isFinite(out.confidence) ? ` · ${Math.round(out.confidence * 100)}%` : ''}
                      </span>
                    )}
                    {out.model_used && (
                      <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                        {out.model_used}
                      </span>
                    )}
                    {out.playbook_used && (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        Mẫu: {out.playbook_used}
                      </span>
                    )}
                  </p>
                )}
                {step.status === 'error' ? (
                  <p className="text-[11px] leading-relaxed text-rose-700">{step.error}</p>
                ) : isSkipped ? (
                  <p className="text-[11px] leading-relaxed text-slate-500">{step.note}</p>
                ) : extracted.length ? (
                  <div className="space-y-0.5">
                    {extracted.map(([key, value]) => (
                      <p key={key} className="text-[11px] leading-relaxed text-slate-600">
                        <span className="font-mono text-slate-400">{key}</span>: {value || '—'}
                      </p>
                    ))}
                  </div>
                ) : (
                  <pre className="text-[11px] leading-relaxed text-slate-600 whitespace-pre-wrap font-sans max-h-52 overflow-y-auto">
                    {body || out.reason || 'Không có nội dung chữ — khối này chỉ tạo dữ liệu cho khối sau.'}
                  </pre>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3.5 rounded-xl text-[12px] font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
          >
            Đóng
          </button>
          {canSend && (
            <button
              type="button"
              onClick={onSendReal}
              className="h-9 px-3.5 rounded-xl text-[12px] font-semibold bg-[#296DFF] text-white hover:bg-[#1f5ae0] cursor-pointer flex items-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5" /> Gửi thật
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
