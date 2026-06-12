/**
 * Module Tính toán — AST evaluator + rule selector.
 *
 * AST node format (frontend BlockEditor xuất ra):
 *   { type: 'num',  value: <number> }
 *   { type: 'var',  key: 'rong' }
 *   { type: 'op',   op: '+' | '-' | '*' | '/' | '%' | '^', args: [a, b] }
 *   { type: 'fn',   name: 'min'|'max'|'abs'|'round'|'ceil'|'floor'|'sqrt', args: [...] }
 *   { type: 'cmp',  op: '<'|'<='|'>'|'>='|'=='|'!=', args: [a, b] }     -> boolean
 *   { type: 'bool', op: 'and'|'or'|'not', args: [...] }                  -> boolean
 *   { type: 'if',   args: [cond, thenExpr, elseExpr] }
 *
 * Bất kỳ node lạ nào sẽ throw — không cho free-form code.
 */

const ALLOWED_OPS = new Set(['+', '-', '*', '/', '%', '^']);
const ALLOWED_CMPS = new Set(['<', '<=', '>', '>=', '==', '!=']);
const ALLOWED_FNS = {
  min: (...xs) => Math.min(...xs),
  max: (...xs) => Math.max(...xs),
  abs: (x) => Math.abs(num(x)),
  round: (x, d = 0) => {
    const k = Math.pow(10, num(d));
    return Math.round(num(x) * k) / k;
  },
  ceil: (x) => Math.ceil(num(x)),
  floor: (x) => Math.floor(num(x)),
  sqrt: (x) => Math.sqrt(num(x)),
};

function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function evalNode(node, ctx, breadcrumbs) {
  if (!node || typeof node !== 'object') {
    throw new Error('AST node rỗng hoặc không hợp lệ.');
  }
  const trail = breadcrumbs || [];
  const push = (label) => trail.concat([label]);

  switch (node.type) {
    case 'num':
      return num(node.value);
    case 'var': {
      const k = String(node.key || '').trim();
      if (!k) throw new Error('Biến thiếu key.');
      const raw = ctx[k];
      if (raw === undefined) {
        throw new Error(`Thiếu giá trị cho biến "${k}".`);
      }
      return num(raw);
    }
    case 'op': {
      if (!ALLOWED_OPS.has(node.op)) throw new Error(`Toán tử không được phép: ${node.op}`);
      const args = (node.args || []).map((a, i) => evalNode(a, ctx, push(`op:${node.op}[${i}]`)));
      const [a, b] = args;
      switch (node.op) {
        case '+': return num(a) + num(b);
        case '-': return num(a) - num(b);
        case '*': return num(a) * num(b);
        case '/': {
          const denom = num(b);
          return denom === 0 ? 0 : num(a) / denom;
        }
        case '%': return num(a) - Math.floor(num(a) / num(b || 1)) * num(b || 1);
        case '^': return Math.pow(num(a), num(b));
        default: throw new Error(`Op chưa cài: ${node.op}`);
      }
    }
    case 'fn': {
      const fn = ALLOWED_FNS[node.name];
      if (!fn) throw new Error(`Hàm không được phép: ${node.name}`);
      const args = (node.args || []).map((a, i) => evalNode(a, ctx, push(`fn:${node.name}[${i}]`)));
      return num(fn(...args));
    }
    case 'cmp': {
      if (!ALLOWED_CMPS.has(node.op)) throw new Error(`So sánh không được phép: ${node.op}`);
      const args = (node.args || []).map((a, i) => evalNode(a, ctx, push(`cmp:${node.op}[${i}]`)));
      const [a, b] = args;
      const an = num(a);
      const bn = num(b);
      switch (node.op) {
        case '<': return an < bn;
        case '<=': return an <= bn;
        case '>': return an > bn;
        case '>=': return an >= bn;
        case '==': return an === bn;
        case '!=': return an !== bn;
        default: return false;
      }
    }
    case 'bool': {
      const op = String(node.op || '').toLowerCase();
      if (op === 'not') {
        const v = evalNode(node.args?.[0], ctx, push('bool:not'));
        return !v;
      }
      if (op === 'and' || op === 'or') {
        const vals = (node.args || []).map((a, i) => evalNode(a, ctx, push(`bool:${op}[${i}]`)));
        return op === 'and' ? vals.every(Boolean) : vals.some(Boolean);
      }
      throw new Error(`Bool op không được phép: ${node.op}`);
    }
    case 'if': {
      const [c, t, e] = node.args || [];
      const cond = evalNode(c, ctx, push('if:cond'));
      return cond
        ? evalNode(t, ctx, push('if:then'))
        : evalNode(e || { type: 'num', value: 0 }, ctx, push('if:else'));
    }
    case 'true': return true;
    case 'false': return false;
    case 'noop':
      // Rule mặc định (is_default) — luôn match
      return true;
    default:
      throw new Error(`Loại node không hỗ trợ: ${node.type}`);
  }
}

/** Eval AST trả về number (ép num()). */
function evalFormulaAst(ast, ctx) {
  const v = evalNode(ast, ctx);
  return num(v);
}

/** Eval AST trả về boolean (cho condition). */
function evalConditionAst(ast, ctx) {
  return Boolean(evalNode(ast, ctx));
}

/**
 * Render AST sang text dễ đọc — chỉ dùng để debug / preview.
 */
function astToText(node) {
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

/**
 * Chọn rule khớp đầu tiên (priority ASC). Nếu không rule nào khớp, trả null.
 * @param {Array<{id, condition_ast, formula_id, priority, is_default, is_active}>} rules
 */
function pickMatchingRule(rules, ctx) {
  const list = (rules || [])
    .filter((r) => r && r.is_active !== false)
    .slice()
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  for (const r of list) {
    if (r.is_default) return r;
    try {
      const ok = evalConditionAst(r.condition_ast || { type: 'noop' }, ctx);
      if (ok) return r;
    } catch {
      // điều kiện lỗi → bỏ qua rule, sang rule kế
    }
  }
  return null;
}

/**
 * Tổng hợp tính 1 lượt cho 1 product_type:
 *   inputs (var_key → value) → chọn rule → áp công thức → number
 * Ném lỗi nếu không có rule nào khớp.
 */
function computeForProductType({ rules, formulasById, inputs }) {
  const ctx = { ...(inputs || {}) };
  const rule = pickMatchingRule(rules, ctx);
  if (!rule) {
    throw new Error('Không có rule nào khớp với input.');
  }
  const formula = rule.formula_id ? formulasById?.[rule.formula_id] : null;
  if (!formula) {
    throw new Error('Rule khớp nhưng chưa gắn công thức.');
  }
  const result = evalFormulaAst(formula.ast || { type: 'num', value: 0 }, ctx);
  return {
    matched_rule_id: rule.id,
    applied_formula_id: formula.id,
    result,
    breakdown: {
      condition: astToText(rule.condition_ast),
      formula: astToText(formula.ast),
      inputs: ctx,
    },
  };
}

module.exports = {
  evalFormulaAst,
  evalConditionAst,
  astToText,
  pickMatchingRule,
  computeForProductType,
  ALLOWED_OPS,
  ALLOWED_CMPS,
  ALLOWED_FNS,
};
