/**
 * flowGraph — chuẩn hoá và kiểm tra đồ thị luồng module.
 *
 * Canvas gửi lên: nodes (steps) + edges + conditions. Helper này làm sạch dữ liệu
 * trước khi ghi DB và tính order_index theo thứ tự topo, để runtime cũ
 * (resolveNextModuleStep đọc steps[idx + 1]) vẫn thấy một chuỗi hợp lệ.
 */

const BRANCH_MODES = new Set(['sequential', 'parallel', 'conditional']);
const JOIN_MODES = new Set(['all', 'any']);
const CONDITION_LOGIC = new Set(['all', 'any']);
const CONDITION_TYPES = new Set(['task_item_done', 'stage_reached', 'stage_flag']);
const CONDITION_SOURCES = new Set(['crm', 'production', 'logistics']);
const NODE_KINDS = new Set([
  'module', 'condition', 'fork', 'join', 'wait', 'approve', 'end',
  'report', 'ai_report', 'ai_deadline', 'notify',
]);

function normalizeNodeKind(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return NODE_KINDS.has(s) ? s : 'module';
}

function sanitizeNodeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw;
}

function normalizeNodeId(raw) {
  const s = String(raw == null ? '' : raw).trim();
  return s || null;
}

function normalizeBranchMode(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return BRANCH_MODES.has(s) ? s : 'sequential';
}

function normalizeJoinMode(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return JOIN_MODES.has(s) ? s : 'all';
}

function normalizeConditionLogic(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return CONDITION_LOGIC.has(s) ? s : 'all';
}

function toNumberOrNull(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Bỏ cạnh trỏ vào node không tồn tại, cạnh tự nối và cạnh trùng.
 * @param {Array} edges  [{ source_node_id, target_node_id, label, condition_logic }]
 * @param {Set<string>} nodeIds
 */
function sanitizeEdges(edges, nodeIds) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(edges) ? edges : []) {
    const source = normalizeNodeId(raw?.source_node_id ?? raw?.source);
    const target = normalizeNodeId(raw?.target_node_id ?? raw?.target);
    if (!source || !target) continue;
    if (source === target) continue;
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    const key = `${source}\u0000${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      source_node_id: source,
      target_node_id: target,
      label: raw?.label ? String(raw.label).slice(0, 200) : null,
      condition_logic: normalizeConditionLogic(raw?.condition_logic),
      order_index: out.length,
    });
  }
  return out;
}

/**
 * Thứ tự topo (Kahn), tie-break theo position_x rồi thứ tự gửi lên.
 * Node nằm trong chu trình được nối vào cuối để không mất dữ liệu.
 * @returns {string[]} node_id đã sắp xếp
 */
function topoOrder(nodes, edges) {
  const order = new Map();
  nodes.forEach((n, i) => order.set(n.node_id, i));

  const indegree = new Map(nodes.map((n) => [n.node_id, 0]));
  const outgoing = new Map(nodes.map((n) => [n.node_id, []]));
  for (const e of edges) {
    if (!indegree.has(e.target_node_id) || !outgoing.has(e.source_node_id)) continue;
    indegree.set(e.target_node_id, indegree.get(e.target_node_id) + 1);
    outgoing.get(e.source_node_id).push(e.target_node_id);
  }

  const byNodeId = new Map(nodes.map((n) => [n.node_id, n]));
  const rank = (id) => {
    const n = byNodeId.get(id);
    const x = toNumberOrNull(n?.position_x);
    return x == null ? Number.MAX_SAFE_INTEGER : x;
  };
  const sortQueue = (q) => q.sort((a, b) => {
    const dx = rank(a) - rank(b);
    if (dx !== 0) return dx;
    return (order.get(a) ?? 0) - (order.get(b) ?? 0);
  });

  const queue = nodes.filter((n) => indegree.get(n.node_id) === 0).map((n) => n.node_id);
  sortQueue(queue);

  const result = [];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    const unlocked = [];
    for (const t of outgoing.get(id) || []) {
      indegree.set(t, indegree.get(t) - 1);
      if (indegree.get(t) === 0) unlocked.push(t);
    }
    if (unlocked.length) {
      queue.push(...unlocked);
      sortQueue(queue);
    }
  }

  for (const n of nodes) {
    if (!seen.has(n.node_id)) result.push(n.node_id);
  }
  return result;
}

/** Node không gỡ được bằng Kahn = nằm trong chu trình. */
function findCycleNodes(nodes, edges) {
  const indegree = new Map(nodes.map((n) => [n.node_id, 0]));
  const outgoing = new Map(nodes.map((n) => [n.node_id, []]));
  for (const e of edges) {
    if (!indegree.has(e.target_node_id) || !outgoing.has(e.source_node_id)) continue;
    indegree.set(e.target_node_id, indegree.get(e.target_node_id) + 1);
    outgoing.get(e.source_node_id).push(e.target_node_id);
  }
  const queue = nodes.filter((n) => indegree.get(n.node_id) === 0).map((n) => n.node_id);
  const visited = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    for (const t of outgoing.get(id) || []) {
      indegree.set(t, indegree.get(t) - 1);
      if (indegree.get(t) === 0) queue.push(t);
    }
  }
  return nodes.filter((n) => !visited.has(n.node_id)).map((n) => n.node_id);
}

function sanitizeConditionConfig(conditionType, raw) {
  const cfg = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const source = String(cfg.source || '').trim().toLowerCase();
  const out = { source: CONDITION_SOURCES.has(source) ? source : 'crm' };

  const passUuid = (key) => {
    const v = cfg[key];
    if (v == null || String(v).trim() === '') return;
    out[key] = String(v).trim();
  };
  passUuid('company_id');
  passUuid('pipeline_id');
  passUuid('stage_id');

  if (conditionType === 'task_item_done') {
    passUuid('template_id');
    const ids = Array.isArray(cfg.item_ids) ? cfg.item_ids : [];
    out.item_ids = [...new Set(ids.map((v) => String(v || '').trim()).filter(Boolean))];
  }
  if (conditionType === 'stage_flag') {
    const flag = String(cfg.flag || '').trim();
    if (flag) out.flag = flag;
  }
  if (cfg.label) out.label = String(cfg.label).slice(0, 300);
  return out;
}

/**
 * Làm sạch điều kiện. Điều kiện của cạnh tham chiếu cặp (source, target)
 * chứ không phải edge_id, vì edge_id chỉ có sau khi insert.
 */
function sanitizeConditions(conditions, nodeIds, edgeKeys) {
  const out = [];
  for (const raw of Array.isArray(conditions) ? conditions : []) {
    const conditionType = String(raw?.condition_type || '').trim();
    if (!CONDITION_TYPES.has(conditionType)) continue;

    const scope = raw?.scope === 'edge' ? 'edge' : 'step';
    if (scope === 'step') {
      const stepNodeId = normalizeNodeId(raw?.step_node_id);
      if (!stepNodeId || !nodeIds.has(stepNodeId)) continue;
      out.push({
        scope,
        step_node_id: stepNodeId,
        source_node_id: null,
        target_node_id: null,
        condition_type: conditionType,
        config: sanitizeConditionConfig(conditionType, raw?.config),
        is_required: raw?.is_required !== false,
        order_index: out.length,
      });
      continue;
    }

    const source = normalizeNodeId(raw?.source_node_id);
    const target = normalizeNodeId(raw?.target_node_id);
    if (!source || !target) continue;
    if (!edgeKeys.has(`${source}\u0000${target}`)) continue;
    out.push({
      scope,
      step_node_id: null,
      source_node_id: source,
      target_node_id: target,
      condition_type: conditionType,
      config: sanitizeConditionConfig(conditionType, raw?.config),
      is_required: raw?.is_required !== false,
      order_index: out.length,
    });
  }
  return out;
}

/**
 * Chuẩn hoá toàn bộ payload đồ thị.
 * @param {Array} steps       node từ canvas, mỗi node cần node_id (sinh nếu thiếu)
 * @param {Array} edges
 * @param {Array} conditions
 * @returns {{ steps, edges, conditions, warnings }} steps đã gắn order_index theo topo
 */
function normalizeGraphPayload({ steps, edges, conditions }) {
  const warnings = [];
  const rawSteps = Array.isArray(steps) ? steps : [];

  const usedIds = new Set();
  const nodes = rawSteps.map((s, i) => {
    let nodeId = normalizeNodeId(s?.node_id);
    if (!nodeId || usedIds.has(nodeId)) {
      const base = normalizeNodeId(s?.module_key) || normalizeNodeId(s?.node_kind) || 'step';
      nodeId = `n-${base}-${i}`;
      let suffix = i;
      while (usedIds.has(nodeId)) {
        suffix += 1;
        nodeId = `n-${base}-${suffix}`;
      }
    }
    usedIds.add(nodeId);
    return {
      ...s,
      node_id: nodeId,
      node_kind: normalizeNodeKind(s?.node_kind),
      node_config: sanitizeNodeConfig(s?.node_config),
      position_x: toNumberOrNull(s?.position_x),
      position_y: toNumberOrNull(s?.position_y),
      branch_mode: normalizeBranchMode(s?.branch_mode),
      join_mode: normalizeJoinMode(s?.join_mode),
    };
  });

  const nodeIds = new Set(nodes.map((n) => n.node_id));
  const cleanEdges = sanitizeEdges(edges, nodeIds);
  if ((Array.isArray(edges) ? edges.length : 0) > cleanEdges.length) {
    warnings.push('Một số cạnh không hợp lệ đã bị bỏ qua');
  }

  const cycleNodes = findCycleNodes(nodes, cleanEdges);
  if (cycleNodes.length) {
    warnings.push(`Luồng có vòng lặp tại ${cycleNodes.length} node — thứ tự chạy có thể không như mong đợi`);
  }

  const ordered = topoOrder(nodes, cleanEdges);
  const orderByNode = new Map(ordered.map((id, i) => [id, i]));
  const orderedSteps = [...nodes]
    .sort((a, b) => (orderByNode.get(a.node_id) ?? 0) - (orderByNode.get(b.node_id) ?? 0))
    .map((n, i) => ({ ...n, order_index: i }));

  const edgeKeys = new Set(cleanEdges.map((e) => `${e.source_node_id}\u0000${e.target_node_id}`));
  const cleanConditions = sanitizeConditions(conditions, nodeIds, edgeKeys);

  return { steps: orderedSteps, edges: cleanEdges, conditions: cleanConditions, warnings };
}

module.exports = {
  BRANCH_MODES,
  JOIN_MODES,
  CONDITION_TYPES,
  CONDITION_SOURCES,
  NODE_KINDS,
  normalizeNodeKind,
  normalizeNodeId,
  normalizeBranchMode,
  normalizeJoinMode,
  normalizeConditionLogic,
  sanitizeEdges,
  sanitizeConditions,
  topoOrder,
  findCycleNodes,
  normalizeGraphPayload,
};
