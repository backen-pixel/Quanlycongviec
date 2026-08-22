/**
 * flowRuntime — trả lời "bước kế tiếp là gì" bằng cách đi theo cạnh của đồ thị luồng
 * (workflow_flow_edges) và chấm điều kiện thật, thay cho cách cũ đọc mảng phẳng order_index.
 *
 * Khác biệt so với resolveNextModuleStep:
 *   - đi qua khối điều khiển / hành động (điều kiện, rẽ nhánh, chờ, báo cáo…) rồi mới dừng ở module kế
 *   - cạnh có điều kiện không đạt thì không đi qua, nên nhánh rẽ vẽ trên canvas mới thật sự có hiệu lực
 *
 * Chấm điều kiện là tri-state: đạt / trượt / không chấm được. "Không chấm được" luôn được
 * coi như đi qua được, để cấu hình thiếu không bao giờ làm tắc nghiệp vụ — nhưng nó được
 * ghi vào vết đi để người cài luồng biết mà sửa.
 *
 * Mặc định chạy ở CHẾ ĐỘ BÓNG: tính ra kết quả và ghi nhật ký chỗ lệch với logic cũ, nhưng
 * không chặn. Đặt FLOW_RUNTIME_ENFORCE=1 để kết quả đồ thị có hiệu lực thật.
 */

const { supabase } = require('../config/supabase');

const PASS = 'pass';
const FAIL = 'fail';
const UNKNOWN = 'unknown';

const GRAPH_TTL_MS = 30_000;

/** Khối đi xuyên qua khi tìm module kế tiếp — chúng không phải điểm dừng nghiệp vụ. */
const PASS_THROUGH_KINDS = new Set([
  'condition', 'fork', 'join', 'wait', 'approve',
  'report', 'ai_report', 'ai_deadline', 'notify',
]);

const STAGE_TABLE = {
  crm: 'crm_pipeline_stages',
  production: 'production_pipeline_stages',
  logistics: 'logistics_pipeline_stages',
};

function isEnforced() {
  return String(process.env.FLOW_RUNTIME_ENFORCE || '').trim() === '1';
}

function isMissingGraphSchema(message) {
  return /node_id|node_kind|node_config|branch_mode|join_mode|module_key|handoff_trigger|workflow_flow_edges|workflow_flow_conditions|schema cache|Could not find|does not exist/i
    .test(String(message || ''));
}

// ═══ Nạp đồ thị ═══

const graphCache = new Map();

function cachedGraph(flowId) {
  const hit = graphCache.get(flowId);
  if (hit && Date.now() - hit.at < GRAPH_TTL_MS) return hit.graph;
  return null;
}

/** Xoá cache sau khi lưu lại luồng. */
function invalidateFlowGraphCache(flowId) {
  if (flowId) graphCache.delete(String(flowId));
  else graphCache.clear();
}

const STEP_SELECT = `
  id, flow_id, order_index, module_key, handoff_trigger,
  node_id, node_kind, node_config, branch_mode, join_mode,
  division_unit_id, company_unit_id, description,
  division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name,short_name,code)
`;

/**
 * @returns {Promise<null|{ nodeById, outEdges, condsByEdge, condsByNode, nodes }>}
 *   null = DB chưa có cột/bảng đồ thị → gọi phải giữ nguyên logic cũ
 */
async function loadGraph(flowId) {
  if (!flowId) return null;
  const key = String(flowId);
  const hit = cachedGraph(key);
  if (hit !== null) return hit;

  const { data: rawSteps, error: stepErr } = await supabase
    .from('workflow_flow_steps')
    .select(STEP_SELECT)
    .eq('flow_id', flowId)
    .order('order_index');
  if (stepErr) {
    if (isMissingGraphSchema(stepErr.message)) {
      graphCache.set(key, { at: Date.now(), graph: null });
      return null;
    }
    throw stepErr;
  }

  const { data: edges, error: edgeErr } = await supabase
    .from('workflow_flow_edges')
    .select('*')
    .eq('flow_id', flowId)
    .order('order_index');
  if (edgeErr) {
    if (isMissingGraphSchema(edgeErr.message)) {
      graphCache.set(key, { at: Date.now(), graph: null });
      return null;
    }
    throw edgeErr;
  }

  let conditions = [];
  const { data: condRows, error: condErr } = await supabase
    .from('workflow_flow_conditions')
    .select('*')
    .eq('flow_id', flowId)
    .order('order_index');
  if (condErr && !isMissingGraphSchema(condErr.message)) throw condErr;
  if (!condErr) conditions = condRows || [];

  const { enrichStepsWithModuleKey } = require('./resolveModuleFlow');
  const nodes = enrichStepsWithModuleKey(rawSteps || []).map((s) => ({
    ...s,
    node_id: String(s.node_id || s.id),
    node_kind: String(s.node_kind || 'module').trim().toLowerCase() || 'module',
  }));

  const nodeById = new Map(nodes.map((n) => [n.node_id, n]));
  const outEdges = new Map();
  for (const e of edges || []) {
    const src = String(e.source_node_id);
    if (!outEdges.has(src)) outEdges.set(src, []);
    outEdges.get(src).push(e);
  }
  for (const list of outEdges.values()) {
    list.sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
  }

  const condsByEdge = new Map();
  const condsByNode = new Map();
  for (const c of conditions) {
    if (c.is_required === false) continue;
    if (c.scope === 'edge' && c.edge_id) {
      if (!condsByEdge.has(c.edge_id)) condsByEdge.set(c.edge_id, []);
      condsByEdge.get(c.edge_id).push(c);
    } else if (c.step_node_id) {
      const nid = String(c.step_node_id);
      if (!condsByNode.has(nid)) condsByNode.set(nid, []);
      condsByNode.get(nid).push(c);
    }
  }

  const graph = { nodes, nodeById, outEdges, condsByEdge, condsByNode };
  graphCache.set(key, { at: Date.now(), graph });
  return graph;
}

// ═══ Ngữ cảnh: dữ liệu thật của một dự án / deal để chấm điều kiện ═══

/**
 * Chủ thể chạy luồng là dự án xưởng; deal CRM được nạp kèm để chấm điều kiện nguồn crm.
 * Mọi truy vấn đều lười và nhớ kết quả — điều kiện thường chỉ đụng tới một hai nguồn.
 */
function createFlowContext({ project = null, projectId = null, deal = null, dealId = null } = {}) {
  const memo = new Map();
  const once = (key, fn) => {
    if (!memo.has(key)) memo.set(key, Promise.resolve().then(fn).catch(() => null));
    return memo.get(key);
  };

  const getProject = () => once('project', async () => {
    if (project) return project;
    if (!projectId) return null;
    const { data } = await supabase
      .from('projects')
      .select('id, company_id, flow_id, current_stage_id, sx_kanban_column_id, vc_kanban_column_id')
      .eq('id', projectId)
      .maybeSingle();
    return data || null;
  });

  const getDeal = () => once('deal', async () => {
    if (deal) return deal;
    const proj = await getProject();
    let query = supabase.from('crm_leads').select('id, stage_id, pipeline_id, company_id, project_id');
    if (dealId) query = query.eq('id', dealId);
    else if (proj?.id) query = query.eq('project_id', proj.id).limit(1);
    else return null;
    const { data } = await query.maybeSingle();
    return data || null;
  });

  const getStage = (source) => once(`stage:${source}`, async () => {
    const table = STAGE_TABLE[source];
    if (!table) return null;
    let stageId = null;
    if (source === 'crm') {
      stageId = (await getDeal())?.stage_id || null;
    } else {
      const proj = await getProject();
      stageId = source === 'production'
        ? (proj?.sx_kanban_column_id || null)
        : (proj?.vc_kanban_column_id || null);
    }
    if (!stageId) return null;
    const { data } = await supabase.from(table).select('*').eq('id', stageId).maybeSingle();
    return data || null;
  });

  const getStageById = (source, stageId) => once(`stageById:${source}:${stageId}`, async () => {
    const table = STAGE_TABLE[source];
    if (!table || !stageId) return null;
    const { data } = await supabase.from(table).select('*').eq('id', stageId).maybeSingle();
    return data || null;
  });

  const getTasks = (source) => once(`tasks:${source}`, async () => {
    if (source === 'crm') {
      const d = await getDeal();
      if (!d?.id) return null;
      const { data } = await supabase
        .from('crm_tasks').select('id, title, status')
        .eq('lead_id', d.id).neq('status', 'cancelled').limit(500);
      return data || [];
    }
    const proj = await getProject();
    if (!proj?.id) return null;
    const { data } = await supabase
      .from('tasks').select('id, title, status')
      .eq('project_id', proj.id).neq('status', 'cancelled').limit(500);
    return data || [];
  });

  const getTemplateItems = (source, templateId, itemIds) => {
    const table = source === 'crm' ? 'crm_task_template_items' : 'workshop_task_template_items';
    const ids = (itemIds || []).map(String).filter(Boolean);
    return once(`items:${table}:${templateId || ''}:${ids.join(',')}`, async () => {
      let query = supabase.from(table).select('id, title');
      if (ids.length) query = query.in('id', ids);
      else if (templateId) query = query.eq('template_id', templateId);
      else return null;
      const { data } = await query;
      return data || null;
    });
  };

  return { getProject, getDeal, getStage, getStageById, getTasks, getTemplateItems };
}

// ═══ Chấm điều kiện ═══

const verdict = (v, why) => ({ verdict: v, why });

function normalizeSource(cfg) {
  const s = String(cfg?.source || '').trim().toLowerCase();
  return STAGE_TABLE[s] ? s : 'crm';
}

async function evaluateStageFlag(cfg, ctx) {
  const source = normalizeSource(cfg);
  const flag = String(cfg?.flag || '').trim();
  if (!flag) return verdict(UNKNOWN, 'điều kiện chưa chọn cờ cột');
  const stage = await ctx.getStage(source);
  if (!stage) return verdict(UNKNOWN, `chưa xác định được cột hiện tại của ${source}`);
  if (!(flag in stage)) return verdict(UNKNOWN, `cột không có cờ «${flag}»`);
  return stage[flag]
    ? verdict(PASS, `cột «${stage.name || stage.id}» mang cờ «${flag}»`)
    : verdict(FAIL, `cột «${stage.name || stage.id}» không mang cờ «${flag}»`);
}

async function evaluateStageReached(cfg, ctx) {
  const source = normalizeSource(cfg);
  const targetId = cfg?.stage_id ? String(cfg.stage_id) : '';
  if (!targetId) return verdict(UNKNOWN, 'điều kiện chưa chọn cột đích');
  const current = await ctx.getStage(source);
  if (!current) return verdict(UNKNOWN, `chưa xác định được cột hiện tại của ${source}`);
  if (String(current.id) === targetId) return verdict(PASS, `đang ở cột «${current.name || targetId}»`);

  const target = await ctx.getStageById(source, targetId);
  if (!target) return verdict(UNKNOWN, 'cột đích không còn tồn tại');

  // Cột của công ty khác → luồng này đang dùng chung cho nhiều công ty, không so sánh được.
  const sameScope = source === 'crm'
    ? String(current.pipeline_id || '') === String(target.pipeline_id || '')
    : String(current.company_id || '') === String(target.company_id || '');
  if (!sameScope) return verdict(UNKNOWN, 'cột đích thuộc công ty / pipeline khác');

  const a = Number(current.order_index);
  const b = Number(target.order_index);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return verdict(UNKNOWN, 'cột thiếu thứ tự');
  return a >= b
    ? verdict(PASS, `đã qua cột «${target.name || targetId}»`)
    : verdict(FAIL, `chưa tới cột «${target.name || targetId}»`);
}

function isDone(status) {
  return String(status || '').toLowerCase() === 'completed';
}

async function evaluateTaskItemDone(cfg, ctx) {
  const source = normalizeSource(cfg);
  const items = await ctx.getTemplateItems(source, cfg?.template_id, cfg?.item_ids);
  if (!items?.length) return verdict(UNKNOWN, 'không đọc được nhiệm vụ mẫu của điều kiện');
  const tasks = await ctx.getTasks(source);
  if (!tasks) return verdict(UNKNOWN, `chưa xác định được danh sách công việc của ${source}`);

  // Công việc sinh ra từ mẫu chỉ chép tiêu đề, không giữ khoá về mục mẫu — khớp theo tiêu đề.
  const byTitle = new Map();
  for (const t of tasks) {
    const k = String(t.title || '').trim().toLowerCase();
    if (!k) continue;
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k).push(t);
  }

  const missing = [];
  const pending = [];
  for (const item of items) {
    const k = String(item.title || '').trim().toLowerCase();
    const matched = k ? byTitle.get(k) : null;
    if (!matched?.length) { missing.push(item.title); continue; }
    if (!matched.some((t) => isDone(t.status))) pending.push(item.title);
  }

  if (pending.length) return verdict(FAIL, `chưa hoàn tất: ${pending.slice(0, 3).join(', ')}`);
  if (missing.length) return verdict(UNKNOWN, `chưa sinh công việc: ${missing.slice(0, 3).join(', ')}`);
  return verdict(PASS, `đã hoàn tất ${items.length} nhiệm vụ bắt buộc`);
}

async function evaluateCondition(condition, ctx) {
  const cfg = condition?.config || {};
  try {
    if (condition?.condition_type === 'stage_flag') return await evaluateStageFlag(cfg, ctx);
    if (condition?.condition_type === 'stage_reached') return await evaluateStageReached(cfg, ctx);
    if (condition?.condition_type === 'task_item_done') return await evaluateTaskItemDone(cfg, ctx);
  } catch (err) {
    return verdict(UNKNOWN, `lỗi chấm điều kiện: ${err.message}`);
  }
  return verdict(UNKNOWN, `loại điều kiện lạ: ${condition?.condition_type}`);
}

/** Gộp nhiều điều kiện theo condition_logic của cạnh. */
function combine(results, logic) {
  if (!results.length) return verdict(PASS, 'không có điều kiện');
  const whys = results.filter((r) => r.why).map((r) => r.why);
  if (logic === 'any') {
    if (results.some((r) => r.verdict === PASS)) return verdict(PASS, whys.join(' | '));
    if (results.some((r) => r.verdict === UNKNOWN)) return verdict(UNKNOWN, whys.join(' | '));
    return verdict(FAIL, whys.join(' | '));
  }
  if (results.some((r) => r.verdict === FAIL)) {
    return verdict(FAIL, results.filter((r) => r.verdict === FAIL).map((r) => r.why).join(' | '));
  }
  if (results.some((r) => r.verdict === UNKNOWN)) {
    return verdict(UNKNOWN, results.filter((r) => r.verdict === UNKNOWN).map((r) => r.why).join(' | '));
  }
  return verdict(PASS, whys.join(' | '));
}

/** Chấm trước toàn bộ cạnh + node của luồng để việc duyệt đồ thị chạy đồng bộ. */
async function scoreGraph(graph, ctx) {
  const edgeVerdict = new Map();
  const nodeVerdict = new Map();

  for (const [edgeId, conds] of graph.condsByEdge.entries()) {
    const results = [];
    for (const c of conds) results.push(await evaluateCondition(c, ctx));
    const logic = conds[0]?.condition_logic || 'all';
    edgeVerdict.set(edgeId, combine(results, logic));
  }
  for (const [nodeId, conds] of graph.condsByNode.entries()) {
    const results = [];
    for (const c of conds) results.push(await evaluateCondition(c, ctx));
    nodeVerdict.set(nodeId, combine(results, 'all'));
  }
  return { edgeVerdict, nodeVerdict };
}

// ═══ Duyệt đồ thị ═══

function edgeVerdictOf(edge, scores) {
  const own = scores.edgeVerdict.get(edge.id);
  if (!own) return verdict(PASS, null);
  // condition_logic nằm trên cạnh, không phải trên điều kiện.
  return own;
}

function nodeLabel(node) {
  return node?.module_key || node?.node_kind || node?.node_id || '?';
}

/**
 * Từ một node, đi tiếp cho tới khi chạm module kế tiếp.
 * Khối điều khiển / hành động được đi xuyên qua; khối `end` là điểm dừng.
 *
 * @returns {{ modules: Array, terminal: boolean, trace: Array, hasUnknown: boolean }}
 */
function walkToNextModules(graph, startNodeId, scores) {
  const trace = [];
  const modules = [];
  const seenModule = new Set();
  let terminal = false;
  let hasUnknown = false;

  const visited = new Set();
  const stack = [startNodeId];

  while (stack.length) {
    const nodeId = stack.shift();
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = graph.nodeById.get(nodeId);
    const edges = graph.outEdges.get(nodeId) || [];
    if (!edges.length && nodeId !== startNodeId) continue;

    const kind = node?.node_kind || 'module';
    const mode = kind === 'fork' ? 'parallel'
      : kind === 'condition' ? 'conditional'
        : String(node?.branch_mode || 'sequential');

    let followedOne = false;
    for (const edge of edges) {
      const v = edgeVerdictOf(edge, scores);
      const target = graph.nodeById.get(String(edge.target_node_id));
      trace.push({
        from: nodeLabel(node),
        to: nodeLabel(target),
        verdict: v.verdict,
        why: v.why || null,
      });

      if (v.verdict === FAIL) continue;
      if (v.verdict === UNKNOWN) hasUnknown = true;
      // Rẽ theo điều kiện: chỉ đi nhánh đầu tiên còn sống.
      if (mode === 'conditional' && followedOne) continue;
      followedOne = true;

      if (!target) continue;
      const targetKind = target.node_kind || 'module';

      if (targetKind === 'end') { terminal = true; continue; }

      if (targetKind === 'module' && target.module_key) {
        const gate = scores.nodeVerdict.get(target.node_id);
        if (gate?.verdict === FAIL) {
          trace.push({ from: nodeLabel(target), to: null, verdict: FAIL, why: `điều kiện của node: ${gate.why}` });
          continue;
        }
        if (gate?.verdict === UNKNOWN) hasUnknown = true;
        if (!seenModule.has(target.node_id)) {
          seenModule.add(target.node_id);
          modules.push(target);
        }
        continue;
      }

      if (PASS_THROUGH_KINDS.has(targetKind) || !target.module_key) {
        stack.push(target.node_id);
      }
    }
  }

  return { modules, terminal, trace, hasUnknown };
}

function findModuleNode(graph, moduleKey) {
  const { normalizeModuleKey } = require('./resolveModuleFlow');
  const want = normalizeModuleKey(moduleKey);
  if (!want) return null;
  const matches = graph.nodes.filter((n) => (n.node_kind || 'module') === 'module'
    && normalizeModuleKey(n.module_key) === want);
  if (!matches.length) return null;
  return matches.sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0))[0];
}

/**
 * Module kế tiếp sau `fromModuleKey` theo đồ thị, có tính điều kiện.
 *
 * @returns {Promise<null|{ supported, found, next, modules, terminal, trace, hasUnknown }>}
 *   null = DB chưa hỗ trợ đồ thị hoặc luồng không có node của module đó → giữ logic cũ
 */
async function resolveNextModulesViaGraph(flowId, fromModuleKey, contextInput) {
  const graph = await loadGraph(flowId);
  if (!graph) return null;
  const start = findModuleNode(graph, fromModuleKey);
  if (!start) return null;

  const ctx = contextInput?.getStage ? contextInput : createFlowContext(contextInput || {});
  const scores = await scoreGraph(graph, ctx);
  const walked = walkToNextModules(graph, start.node_id, scores);

  return {
    supported: true,
    found: true,
    next: walked.modules[0] || null,
    modules: walked.modules,
    terminal: walked.terminal,
    trace: walked.trace,
    hasUnknown: walked.hasUnknown,
  };
}

/** Có đi tới được module đích không (bỏ qua cạnh có điều kiện trượt). */
async function canReachModuleViaGraph(flowId, fromModuleKey, targetModuleKey, contextInput) {
  const graph = await loadGraph(flowId);
  if (!graph) return null;
  const start = findModuleNode(graph, fromModuleKey);
  if (!start) return null;

  const { normalizeModuleKey } = require('./resolveModuleFlow');
  const want = normalizeModuleKey(targetModuleKey);
  const ctx = contextInput?.getStage ? contextInput : createFlowContext(contextInput || {});
  const scores = await scoreGraph(graph, ctx);

  const trace = [];
  const visited = new Set([start.node_id]);
  let frontier = [start.node_id];
  let hasUnknown = false;

  while (frontier.length) {
    const nextFrontier = [];
    for (const nodeId of frontier) {
      const hop = walkToNextModules(graph, nodeId, scores);
      trace.push(...hop.trace);
      if (hop.hasUnknown) hasUnknown = true;
      for (const mod of hop.modules) {
        if (normalizeModuleKey(mod.module_key) === want) {
          return { supported: true, reachable: true, trace, hasUnknown };
        }
        if (!visited.has(mod.node_id)) {
          visited.add(mod.node_id);
          nextFrontier.push(mod.node_id);
        }
      }
    }
    frontier = nextFrontier;
  }

  return { supported: true, reachable: false, trace, hasUnknown };
}

// ═══ Nhật ký chạy bóng ═══

let logTableAvailable = true;

/**
 * Ghi lại kết quả của cả hai cách để đối chiếu. Không bao giờ ném lỗi ra ngoài —
 * nhật ký hỏng không được phép làm hỏng nghiệp vụ.
 */
async function logRuntimeDecision({
  flowId, gate, subjectType, subjectId, legacy, graph, diverged, trace,
}) {
  const tag = diverged ? 'LỆCH' : 'khớp';
  console.info(
    `[flow-runtime] ${gate} ${tag} · flow=${String(flowId || '').slice(0, 8)}`
    + ` · cũ=${JSON.stringify(legacy)} · đồ thị=${JSON.stringify(graph)}`
    + (isEnforced() ? ' · CHẶN THẬT' : ' · chạy bóng'),
  );
  if (!logTableAvailable) return;
  try {
    const { error } = await supabase.from('workflow_flow_runtime_log').insert({
      flow_id: flowId || null,
      gate,
      subject_type: subjectType || null,
      subject_id: subjectId || null,
      enforced: isEnforced(),
      diverged: !!diverged,
      legacy_result: legacy || {},
      graph_result: graph || {},
      trace: (trace || []).slice(0, 50),
    });
    if (error && isMissingGraphSchema(error.message)) logTableAvailable = false;
  } catch {
    logTableAvailable = false;
  }
}

module.exports = {
  PASS,
  FAIL,
  UNKNOWN,
  isEnforced,
  createFlowContext,
  loadGraph,
  invalidateFlowGraphCache,
  evaluateCondition,
  resolveNextModulesViaGraph,
  canReachModuleViaGraph,
  logRuntimeDecision,
};
