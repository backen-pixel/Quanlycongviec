/**
 * Parser biểu thức chi phí → AST dùng chung với calcEngine.
 * Chỉ nhận số, biến dotted (cat.nvl, src.sx.production_value, crm.doanh_thu),
 * và + - * / ( ) %. Không eval string.
 *
 * DẤU %: đọc theo cách nói thường ngày — «cộng/trừ thêm bao nhiêu phần trăm».
 *   gia_von + 10%  →  gia_von × 1,1
 *   gia_von - 5%   →  gia_von × 0,95
 * Phần trăm luôn tính trên TOÀN BỘ vế trái đã gom tới đó, nên
 * «a + b + 10%» = (a + b) × 1,1 — đúng như người ta đọc câu đó.
 * AST sinh ra chỉ là phép nhân bình thường, calcEngine không phải biết gì về %.
 */

const IDENT = /[A-Za-z_][A-Za-z0-9_.]*/;

function tokenize(text) {
  const src = String(text || '').trim();
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if ('+-*/()'.includes(ch)) {
      tokens.push({ type: ch });
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      const raw = src.slice(i, j);
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`Số không hợp lệ: ${raw}`);
      if (src[j] === '%') {
        tokens.push({ type: 'pct', value: n });
        i = j + 1;
        continue;
      }
      tokens.push({ type: 'num', value: n });
      i = j;
      continue;
    }
    if (ch === '%') {
      throw new Error('Dấu % phải đi ngay sau một con số, ví dụ «+ 10%».');
    }
    const m = src.slice(i).match(IDENT);
    if (m && m.index === 0) {
      tokens.push({ type: 'var', key: m[0] });
      i += m[0].length;
      continue;
    }
    throw new Error(`Ký tự không hợp lệ trong công thức: "${ch}"`);
  }
  return tokens;
}

function parseCostExpr(text) {
  const tokens = tokenize(text);
  if (!tokens.length) return { type: 'num', value: 0 };
  let pos = 0;
  const peek = () => tokens[pos] || null;
  const eat = (type) => {
    const t = peek();
    if (!t || (type && t.type !== type)) {
      throw new Error(`Công thức thiếu "${type || 'token'}"`);
    }
    pos += 1;
    return t;
  };

  function parseAtom() {
    const t = peek();
    if (!t) throw new Error('Công thức chưa hoàn chỉnh.');
    if (t.type === 'num') { eat(); return { type: 'num', value: t.value }; }
    if (t.type === 'pct') {
      throw new Error('Dấu % chỉ dùng ngay sau dấu + hoặc −, ví dụ «giá vốn + 10%».');
    }
    if (t.type === 'var') { eat(); return { type: 'var', key: t.key }; }
    if (t.type === '(') {
      eat('(');
      const inner = parseAdd();
      eat(')');
      return inner;
    }
    if (t.type === '-') {
      eat('-');
      return { type: 'op', op: '-', args: [{ type: 'num', value: 0 }, parseAtom()] };
    }
    throw new Error('Công thức không hợp lệ.');
  }

  function parseMul() {
    let left = parseAtom();
    while (peek() && (peek().type === '*' || peek().type === '/')) {
      const op = eat().type;
      left = { type: 'op', op, args: [left, parseAtom()] };
    }
    return left;
  }

  function parseAdd() {
    let left = parseMul();
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = eat().type;
      // «+ 10%» / «- 5%»: nhân vế trái với 1±n/100, KHÔNG phải cộng thêm con số 10.
      if (peek() && peek().type === 'pct') {
        const { value } = eat('pct');
        const heSo = op === '-' ? 1 - (value / 100) : 1 + (value / 100);
        left = { type: 'op', op: '*', args: [left, { type: 'num', value: heSo }] };
        continue;
      }
      left = { type: 'op', op, args: [left, parseMul()] };
    }
    return left;
  }

  const ast = parseAdd();
  if (pos < tokens.length) throw new Error('Công thức còn ký tự thừa.');
  return ast;
}

function astToExpr(node) {
  if (!node || typeof node !== 'object') return '0';
  switch (node.type) {
    case 'num': return String(Number(node.value) || 0);
    case 'var': return String(node.key || '');
    case 'op': {
      const [a, b] = node.args || [];
      return `(${astToExpr(a)} ${node.op} ${astToExpr(b)})`;
    }
    default: return '0';
  }
}

module.exports = { parseCostExpr, astToExpr, tokenize };
