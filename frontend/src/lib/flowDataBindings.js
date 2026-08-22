/**
 * Biến dữ liệu giữa các khối trên luồng.
 *
 * Mỗi khối công bố sẵn danh sách «lấy được gì» (outputs trong flowNodeCatalog).
 * Khối phía sau tham chiếu tới chúng bằng token {{node_id.output_key}}; runtime
 * thay token bằng giá trị thật khi chạy. Người dùng không gõ token bằng tay —
 * inspector có nút chèn, nên id xấu cũng không sao.
 */

import { outputsForNode, nodeDisplayLabel, isSpecialKind, specialMeta } from './flowNodeCatalog';

export const VARIABLE_RE = /\{\{\s*([a-zA-Z0-9_\-.]+)\s*\}\}/g;

export function makeToken(nodeId, outputKey) {
  return `{{${nodeId}.${outputKey}}}`;
}

/** Các node đi tới được nodeId (tổ tiên trong đồ thị), theo thứ tự gần → xa. */
export function upstreamNodeIds(edges, nodeId) {
  const incoming = new Map();
  for (const e of edges || []) {
    const t = String(e.target);
    if (!incoming.has(t)) incoming.set(t, []);
    incoming.get(t).push(String(e.source));
  }
  const seen = new Set();
  const ordered = [];
  let frontier = incoming.get(String(nodeId)) || [];
  while (frontier.length) {
    const next = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
      next.push(...(incoming.get(id) || []));
    }
    frontier = next;
  }
  return ordered;
}

const isActionNode = (data) =>
  isSpecialKind(data?.node_kind) && specialMeta(data.node_kind)?.category === 'action';

/**
 * Biến một khối cấp ra khi chạy.
 *
 * Khối hành động (Lấy báo cáo, AI viết báo cáo, Nhắn tin) cấp chính kết quả của nó.
 * Bước module cấp dữ liệu của deal / dự án đang chạy — danh mục do backend công bố
 * (`GET /flows/meta/module-variables`) nên chỉ có khi đã nạp xong; chưa nạp thì bỏ qua
 * để không mời người dùng chèn token rỗng.
 */
function runtimeOutputs(data, moduleVars) {
  if (isActionNode(data)) return outputsForNode(data, data.isCustom);
  if (isSpecialKind(data?.node_kind)) return [];
  const key = String(data?.module_key || '').toLowerCase();
  return moduleVars?.[key] || [];
}

/**
 * Danh sách biến khối `nodeId` được phép dùng.
 * @param {object} [moduleVars] map module_key → [{ key, label, type, desc }]
 * @returns {Array<{ token, nodeId, nodeLabel, outputKey, outputLabel, desc, type }>}
 */
export function availableVariables(nodes, edges, nodeId, moduleLabelFn, moduleVars = null) {
  const byId = new Map((nodes || []).map((n) => [String(n.id), n]));
  const out = [];
  for (const upId of upstreamNodeIds(edges, nodeId)) {
    const node = byId.get(upId);
    if (!node) continue;
    const data = node.data || {};
    const nodeLabel = nodeDisplayLabel(data, moduleLabelFn);
    for (const o of runtimeOutputs(data, moduleVars)) {
      out.push({
        token: makeToken(upId, o.key),
        nodeId: upId,
        nodeLabel,
        nodeKind: data.node_kind || 'module',
        outputKey: o.key,
        outputLabel: o.label,
        desc: o.desc,
        type: o.type,
      });
    }
  }
  return out;
}

/** Khối hành động gần nhất phía trước — dùng làm nguồn mặc định khi nội dung để trống. */
export function nearestUpstreamAction(nodes, edges, nodeId) {
  const byId = new Map((nodes || []).map((n) => [String(n.id), n]));
  for (const upId of upstreamNodeIds(edges, nodeId)) {
    const data = byId.get(upId)?.data;
    if (!data) continue;
    const kind = data.node_kind;
    if (isSpecialKind(kind) && specialMeta(kind)?.category === 'action') {
      return { id: upId, data };
    }
  }
  return null;
}

/** Token đang dùng trong một đoạn text. */
export function tokensUsed(text) {
  const found = new Set();
  for (const m of String(text || '').matchAll(VARIABLE_RE)) found.add(m[1]);
  return [...found];
}

/**
 * Token trỏ tới khối không còn nằm phía trước → cảnh báo trên canvas.
 * @returns {string[]} danh sách token hỏng
 */
export function brokenTokens(nodes, edges, nodeId, text, moduleVars = null) {
  const valid = new Set(availableVariables(nodes, edges, nodeId, undefined, moduleVars)
    .map((v) => v.token.replace(/^\{\{|\}\}$/g, '')));
  return tokensUsed(text).filter((t) => !valid.has(t));
}

/** Thay token bằng nhãn dễ đọc để xem trước trên UI. */
export function previewWithLabels(text, variables) {
  const labelByPath = new Map(variables.map((v) => [
    v.token.replace(/^\{\{|\}\}$/g, ''),
    `«${v.nodeLabel} · ${v.outputLabel}»`,
  ]));
  return String(text || '').replace(VARIABLE_RE, (whole, path) => labelByPath.get(path) || whole);
}
