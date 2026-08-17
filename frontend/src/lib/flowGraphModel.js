/**
 * flowGraphModel — chuyển đổi hai chiều giữa đồ thị ReactFlow và payload API luồng,
 * cùng các phép kiểm tra chạy trước khi lưu.
 *
 * Backend vẫn lưu order_index theo thứ tự topo để runtime cũ đọc được chuỗi tuyến tính,
 * còn nhánh thật nằm ở bảng workflow_flow_edges.
 */

export const BRANCH_MODE_OPTIONS = [
  { value: 'sequential', label: 'Tuyến tính', desc: 'Chạy xong node này rồi sang node kế' },
  { value: 'parallel', label: 'Song song', desc: 'Mở tất cả nhánh sau cùng lúc' },
  { value: 'conditional', label: 'Rẽ theo điều kiện', desc: 'Chỉ đi nhánh nào thoả điều kiện của cạnh' },
];

export const JOIN_MODE_OPTIONS = [
  { value: 'all', label: 'Chờ đủ mọi nhánh', desc: 'Mọi nhánh vào phải xong thì node này mới chạy' },
  { value: 'any', label: 'Nhánh nào xong trước', desc: 'Chỉ cần một nhánh vào hoàn tất' },
];

export const CONDITION_LOGIC_OPTIONS = [
  { value: 'all', label: 'Thoả tất cả' },
  { value: 'any', label: 'Thoả bất kỳ' },
];

/** Kiểu dữ liệu khi kéo module từ palette — canvas và cạnh cùng nhận thả. */
export const PALETTE_MIME = 'application/qlcv-module-key';

export function branchModeLabel(value) {
  return BRANCH_MODE_OPTIONS.find((o) => o.value === value)?.label || 'Tuyến tính';
}

let conditionSeq = 0;
export function newConditionId() {
  conditionSeq += 1;
  return `cond-${Date.now().toString(36)}-${conditionSeq}`;
}

export function edgeKey(source, target) {
  return `${source}->${target}`;
}

/** Bậc vào / ra của từng node. */
export function degreeMap(nodes, edges) {
  const map = new Map(nodes.map((n) => [n.id, { in: 0, out: 0 }]));
  for (const e of edges) {
    if (map.has(e.source)) map.get(e.source).out += 1;
    if (map.has(e.target)) map.get(e.target).in += 1;
  }
  return map;
}

/** Quan hệ của một cạnh, suy ra từ bậc hai đầu: 1-1, 1-N, N-1, N-N. */
export function edgeCardinality(edge, degrees) {
  const out = degrees.get(edge.source)?.out || 0;
  const inn = degrees.get(edge.target)?.in || 0;
  const many = (n) => n > 1;
  if (many(out) && many(inn)) return 'N-N';
  if (many(out)) return '1-N';
  if (many(inn)) return 'N-1';
  return '1-1';
}

/** Thứ tự topo, tie-break theo toạ độ x — khớp với backend để xem trước chuỗi. */
export function topoOrder(nodes, edges) {
  const indegree = new Map(nodes.map((n) => [n.id, 0]));
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!indegree.has(e.target) || !outgoing.has(e.source)) continue;
    indegree.set(e.target, indegree.get(e.target) + 1);
    outgoing.get(e.source).push(e.target);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sortQueue = (q) => q.sort((a, b) => (byId.get(a)?.position?.x || 0) - (byId.get(b)?.position?.x || 0));

  const queue = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
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
  for (const n of nodes) if (!seen.has(n.id)) result.push(n.id);
  return result.map((id) => byId.get(id)).filter(Boolean);
}

/** Tập node đi tới được từ mỗi node (đồ thị nhỏ nên DFS thẳng). */
function reachabilityMap(nodes, edges) {
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (outgoing.has(e.source)) outgoing.get(e.source).push(e.target);
  }
  const memo = new Map();
  const walk = (id, guard) => {
    if (memo.has(id)) return memo.get(id);
    if (guard.has(id)) return new Set();
    guard.add(id);
    const acc = new Set();
    for (const t of outgoing.get(id) || []) {
      acc.add(t);
      for (const deep of walk(t, guard)) acc.add(deep);
    }
    guard.delete(id);
    memo.set(id, acc);
    return acc;
  };
  return new Map(nodes.map((n) => [n.id, walk(n.id, new Set())]));
}

export function findCycleNodeIds(nodes, edges) {
  const indegree = new Map(nodes.map((n) => [n.id, 0]));
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!indegree.has(e.target) || !outgoing.has(e.source)) continue;
    indegree.set(e.target, indegree.get(e.target) + 1);
    outgoing.get(e.source).push(e.target);
  }
  const queue = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
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
  return nodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
}

/**
 * Kiểm tra trước khi lưu.
 * Lỗi thì chặn lưu, cảnh báo thì chỉ nhắc.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateGraph(nodes, edges, { moduleLabel = (k) => k } = {}) {
  const errors = [];
  const warnings = [];

  if (!nodes.length) {
    errors.push('Kéo ít nhất một module lên canvas');
    return { errors, warnings };
  }
  if (nodes.some((n) => !n.data?.module_key)) {
    errors.push('Có node chưa gắn module');
  }

  const cycles = findCycleNodeIds(nodes, edges);
  if (cycles.length) {
    errors.push('Luồng đang có vòng lặp — hãy bỏ cạnh quay ngược trước khi lưu');
  }

  // Cùng một module xuất hiện hai lần trên cùng một nhánh sẽ khiến runtime
  // không biết chọn bước nào, còn ở hai nhánh khác nhau thì hợp lệ.
  if (!cycles.length) {
    const reach = reachabilityMap(nodes, edges);
    const byModule = new Map();
    for (const n of nodes) {
      const key = n.data?.module_key;
      if (!key) continue;
      if (!byModule.has(key)) byModule.set(key, []);
      byModule.get(key).push(n);
    }
    for (const [key, list] of byModule) {
      if (list.length < 2) continue;
      const clash = list.some((a) => list.some((b) => a.id !== b.id && reach.get(a.id)?.has(b.id)));
      if (clash) {
        errors.push(`Module "${moduleLabel(key)}" xuất hiện hai lần trên cùng một nhánh`);
      }
    }
  }

  const degrees = degreeMap(nodes, edges);
  const orphans = nodes.filter((n) => {
    const d = degrees.get(n.id);
    return nodes.length > 1 && d.in === 0 && d.out === 0;
  });
  if (orphans.length) {
    warnings.push(`${orphans.length} node chưa nối cạnh — sẽ xếp theo vị trí trái sang phải`);
  }

  const starts = nodes.filter((n) => (degrees.get(n.id)?.in || 0) === 0);
  if (starts.length > 1 && nodes.length > 1) {
    warnings.push(`Luồng có ${starts.length} điểm bắt đầu`);
  }

  const hasBranch = nodes.some((n) => (degrees.get(n.id)?.out || 0) > 1);
  if (hasBranch) {
    warnings.push('Luồng có nhánh: phần thực thi hiện vẫn chạy theo chuỗi đã làm phẳng, nhánh mới chỉ được lưu ở phần thiết kế');
  }

  return { errors, warnings };
}

/**
 * Node ReactFlow → payload steps (đã kèm node_id, toạ độ, kiểu nhánh).
 * Node còn dưới hai nhánh thì trả về mặc định để không giữ lại lựa chọn cũ
 * sau khi người dùng xoá bớt cạnh.
 */
export function nodesToStepsPayload(nodes, edges) {
  const degrees = degreeMap(nodes, edges);
  return topoOrder(nodes, edges).map((n, i) => ({
    node_id: n.id,
    module_key: n.data.module_key,
    handoff_trigger: n.data.handoff_trigger || null,
    description: n.data.description || null,
    company_unit_id: n.data.company_unit_id || null,
    template_set_id: n.data.template_set_id || null,
    division_unit_id: n.data.division_unit_id || null,
    branch_mode: (degrees.get(n.id)?.out || 0) > 1 ? (n.data.branch_mode || 'sequential') : 'sequential',
    join_mode: (degrees.get(n.id)?.in || 0) > 1 ? (n.data.join_mode || 'all') : 'all',
    position_x: Math.round(n.position?.x ?? 0),
    position_y: Math.round(n.position?.y ?? 0),
    order_index: i,
  }));
}

export function edgesToPayload(edges) {
  return edges.map((e, i) => ({
    source_node_id: e.source,
    target_node_id: e.target,
    label: e.data?.label || null,
    condition_logic: e.data?.condition_logic || 'all',
    order_index: i,
  }));
}

export function conditionsToPayload(conditions) {
  return (conditions || []).map((c, i) => ({
    scope: c.scope,
    step_node_id: c.scope === 'step' ? c.step_node_id : null,
    source_node_id: c.scope === 'edge' ? c.source_node_id : null,
    target_node_id: c.scope === 'edge' ? c.target_node_id : null,
    condition_type: c.condition_type,
    config: c.config || {},
    is_required: c.is_required !== false,
    order_index: i,
  }));
}

/** Điều kiện từ API → state của canvas (gắn id phía client để sửa/xoá). */
export function conditionsFromApi(rows) {
  return (rows || []).map((c) => ({
    cid: newConditionId(),
    scope: c.scope === 'edge' ? 'edge' : 'step',
    step_node_id: c.step_node_id || null,
    source_node_id: c.source_node_id || null,
    target_node_id: c.target_node_id || null,
    condition_type: c.condition_type,
    config: c.config || {},
    is_required: c.is_required !== false,
  }));
}

export function conditionsForNode(conditions, nodeId) {
  return (conditions || []).filter((c) => c.scope === 'step' && c.step_node_id === nodeId);
}

export function conditionsForEdge(conditions, source, target) {
  return (conditions || []).filter(
    (c) => c.scope === 'edge' && c.source_node_id === source && c.target_node_id === target,
  );
}
