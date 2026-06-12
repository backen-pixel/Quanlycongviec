/**
 * Tiện ích AST chia sẻ giữa BlockEditor (build), CalcRunPage (preview text)
 * và backend calcEngine.js (eval). Giữ ĐỒNG BỘ với backend/src/helpers/calcEngine.js.
 */

export const NODE_TYPES = {
  num: { label: 'Số', kind: 'number' },
  var: { label: 'Biến', kind: 'number' },
  op: { label: 'Toán tử', kind: 'number' },
  fn: { label: 'Hàm', kind: 'number' },
  cmp: { label: 'So sánh', kind: 'bool' },
  bool: { label: 'AND / OR / NOT', kind: 'bool' },
  if: { label: 'Nếu/Thì/Khác', kind: 'number' },
  true: { label: 'Đúng', kind: 'bool' },
  false: { label: 'Sai', kind: 'bool' },
  noop: { label: 'Mặc định (luôn khớp)', kind: 'bool' },
};

export const OPS = ['+', '-', '*', '/', '%', '^'];
export const CMP_OPS = ['<', '<=', '>', '>=', '==', '!='];
export const BOOL_OPS = ['and', 'or', 'not'];
export const FN_NAMES = ['min', 'max', 'abs', 'round', 'ceil', 'floor', 'sqrt'];

export function emptyOp(op = '+') {
  return { type: 'op', op, args: [{ type: 'num', value: 0 }, { type: 'num', value: 0 }] };
}
export function emptyCmp(op = '>') {
  return { type: 'cmp', op, args: [{ type: 'var', key: '' }, { type: 'num', value: 0 }] };
}
export function emptyFn(name = 'min') {
  return { type: 'fn', name, args: [{ type: 'num', value: 0 }, { type: 'num', value: 0 }] };
}
export function emptyBool(op = 'and') {
  return { type: 'bool', op, args: [{ type: 'true' }, { type: 'true' }] };
}
export function emptyIf() {
  return {
    type: 'if',
    args: [
      { type: 'true' },
      { type: 'num', value: 0 },
      { type: 'num', value: 0 },
    ],
  };
}

export function nodeFactory(type) {
  switch (type) {
    case 'num': return { type: 'num', value: 0 };
    case 'var': return { type: 'var', key: '' };
    case 'op': return emptyOp();
    case 'fn': return emptyFn();
    case 'cmp': return emptyCmp();
    case 'bool': return emptyBool();
    case 'if': return emptyIf();
    case 'true': return { type: 'true' };
    case 'false': return { type: 'false' };
    case 'noop': return { type: 'noop' };
    default: return { type: 'num', value: 0 };
  }
}

/** Render AST → text dễ đọc (giống astToText backend nhưng client-side). */
export function astToText(node) {
  if (!node || typeof node !== 'object') return '?';
  switch (node.type) {
    case 'num': return String(node.value ?? 0);
    case 'var': return String(node.key || '?');
    case 'op': {
      const [a, b] = (node.args || []).map(astToText);
      return `(${a} ${node.op} ${b})`;
    }
    case 'fn': return `${node.name}(${(node.args || []).map(astToText).join(', ')})`;
    case 'cmp': {
      const [a, b] = (node.args || []).map(astToText);
      return `(${a} ${node.op} ${b})`;
    }
    case 'bool': {
      const op = String(node.op || '').toUpperCase();
      if (op === 'NOT') return `NOT(${astToText(node.args?.[0])})`;
      return `(${(node.args || []).map(astToText).join(` ${op} `)})`;
    }
    case 'if': {
      const [c, t, e] = (node.args || []).map(astToText);
      return `IF(${c}, ${t}, ${e})`;
    }
    case 'true': return 'TRUE';
    case 'false': return 'FALSE';
    case 'noop': return '*';
    default: return `?${node.type}?`;
  }
}

/** Cập nhật node tại path (mảng index args[]). Trả về AST mới (immutable). */
export function setNodeAtPath(root, path, newNode) {
  if (!path.length) return newNode;
  const clone = JSON.parse(JSON.stringify(root));
  let cur = clone;
  for (let i = 0; i < path.length - 1; i++) {
    cur = cur.args[path[i]];
  }
  cur.args[path[path.length - 1]] = newNode;
  return clone;
}

/** Lấy node tại path (đọc-only). */
export function getNodeAtPath(root, path) {
  let cur = root;
  for (const idx of path) cur = cur?.args?.[idx];
  return cur;
}
