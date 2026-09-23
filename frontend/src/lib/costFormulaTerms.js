/**
 * Ghép công thức chi phí: toán hạng (module / doanh thu / số) + toán tử + − × /.
 * Chuỗi lưu vẫn là expr_text (AST backend).
 */

const IDENT = /[A-Za-z_][A-Za-z0-9_.]*/;

export const OPS = [
  { value: '+', label: '+', word: 'cộng' },
  { value: '-', label: '−', word: 'trừ' },
  { value: '*', label: '×', word: 'nhân' },
  { value: '/', label: '/', word: 'chia' },
];

export const BASE_OPERANDS = [
  { key: 'crm.doanh_thu', label: 'Doanh thu CRM' },
  { key: 'src.sx.production_value', label: 'Chi phí xưởng (SX)' },
  { key: 'src.sx.project_expense', label: 'Phát sinh SX' },
  { key: 'src.purchasing.po', label: 'Mua hàng (PO)' },
  { key: 'src.vc.shipping', label: 'Phí VC / lắp' },
  { key: 'src.crm.product_cogs', label: 'Giá vốn dòng CRM' },
  { key: 'src.crm.manual', label: 'Nhập tay CRM' },
  { key: 'src.ketoan.manual', label: 'Nhập tay Kế toán' },
  { key: 'entries.total', label: 'Tổng sổ (module đang bật)' },
  { key: 'gia_von', label: 'Giá vốn (công thức trên)' },
  { key: 'loi_nhuan_gop', label: 'Lợi nhuận gộp' },
];

const NUM_KEY = '__num__';

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
      const n = Number(src.slice(i, j));
      if (!Number.isFinite(n)) throw new Error(`Số không hợp lệ`);
      tokens.push({ type: 'num', value: n });
      i = j;
      continue;
    }
    const m = src.slice(i).match(IDENT);
    if (m && m.index === 0) {
      tokens.push({ type: 'var', key: m[0] });
      i += m[0].length;
      continue;
    }
    throw new Error(`Ký tự không hợp lệ: "${ch}"`);
  }
  return tokens;
}

export function exprToTerms(expr) {
  try {
    const tokens = tokenize(expr);
    if (!tokens.length) return [{ kind: 'var', key: 'entries.total', op: null }];
    if (tokens.some((t) => t.type === '(' || t.type === ')')) return null;
    const terms = [];
    let pendingOp = null;
    let i = 0;
    if (tokens[0]?.type === '-') {
      pendingOp = '-';
      i = 1;
    }
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.type === 'var') {
        terms.push({ kind: 'var', key: t.key, op: terms.length ? (pendingOp || '+') : pendingOp });
        pendingOp = null;
        i += 1;
      } else if (t.type === 'num') {
        terms.push({ kind: 'num', value: t.value, op: terms.length ? (pendingOp || '+') : pendingOp });
        pendingOp = null;
        i += 1;
      } else if (t.type === '+' || t.type === '-' || t.type === '*' || t.type === '/') {
        pendingOp = t.type;
        i += 1;
      } else {
        return null;
      }
    }
    return terms.length ? terms : null;
  } catch {
    return null;
  }
}

export function termsToExpr(terms) {
  const list = (terms || []).filter((t) => (t.kind === 'num' && Number.isFinite(Number(t.value)))
    || (t.kind === 'var' && t.key));
  return list.map((t, i) => {
    const tok = t.kind === 'num' ? String(Number(t.value) || 0) : t.key;
    if (i === 0) return t.op === '-' ? `- ${tok}` : tok;
    return `${t.op || '+'} ${tok}`;
  }).join(' ');
}

export function operandLabel(key, extras = []) {
  const all = [...BASE_OPERANDS, ...extras];
  return all.find((o) => o.key === key)?.label || key;
}

export function selectValue(term) {
  return term?.kind === 'num' ? NUM_KEY : (term?.key || '');
}

export function applyOperandSelect(term, value) {
  if (value === NUM_KEY) return { ...term, kind: 'num', value: term.kind === 'num' ? term.value : 1, key: undefined };
  return { ...term, kind: 'var', key: value, value: undefined };
}

export function termsToGroupedExpr(terms) {
  const list = (terms || []).filter((t) => (t.kind === 'num' && Number.isFinite(Number(t.value)))
    || (t.kind === 'var' && t.key));
  if (list.length < 3) return termsToExpr(list);
  const first = list[0];
  const rest = list.slice(1);
  const headTok = first.kind === 'num' ? String(Number(first.value) || 0) : first.key;
  const head = first.op === '-' ? `- ${headTok}` : headTok;
  const wrapOp = rest[0].op || '-';
  const inner = rest.map((t, i) => {
    const tok = t.kind === 'num' ? String(Number(t.value) || 0) : t.key;
    if (i === 0) return tok;
    return `${t.op || '+'} ${tok}`;
  }).join(' ');
  return `${head} ${wrapOp} (${inner})`;
}

export function exprIsGroupedTail(expr) {
  return /[+\-*/]\s*\(.+\)\s*$/.test(String(expr || '').trim());
}

/** A − (B + C) → { head, wrapOp, inner } để giữ builder kéo-thả. */
export function splitGroupedTail(expr) {
  const src = String(expr || '').trim();
  const m = src.match(/^(.+?)\s*([+\-*/])\s*\((.+)\)\s*$/);
  if (!m) return null;
  const headTerms = exprToTerms(m[1]);
  const innerTerms = exprToTerms(m[3]);
  if (!headTerms || headTerms.length !== 1 || !innerTerms?.length) return null;
  if (innerTerms.some((t) => t.kind !== 'var' && t.kind !== 'num')) return null;
  return { head: headTerms[0], wrapOp: m[2], inner: innerTerms };
}

export function joinGroupedTail(head, wrapOp, inner) {
  const headExpr = termsToExpr([head]);
  const innerExpr = termsToExpr(inner);
  if (!headExpr || !innerExpr) return headExpr || innerExpr || '';
  return `${headExpr} ${wrapOp || '-'} (${innerExpr})`;
}

export function readFormulaVi(expr, extras = []) {
  const grouped = splitGroupedTail(expr);
  const termText = (t) => (t.kind === 'num' ? String(t.value) : operandLabel(t.key, extras));
  const joinTerms = (list) => list.map((t, i) => {
    const name = termText(t);
    if (i === 0) return t.op === '-' ? `trừ ${name}` : name;
    const w = OPS.find((o) => o.value === t.op)?.word || t.op;
    return `${w} ${name}`;
  }).join(' ');
  if (grouped) {
    const left = joinTerms([grouped.head]);
    const w = OPS.find((o) => o.value === grouped.wrapOp)?.word || grouped.wrapOp;
    return `${left} ${w} (${joinTerms(grouped.inner)})`;
  }
  const terms = exprToTerms(expr);
  if (!terms) return String(expr || '');
  return joinTerms(terms);
}

export { NUM_KEY };
