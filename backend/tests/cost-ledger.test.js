const assert = require('assert');
const { parseCostExpr, astToExpr } = require('../src/helpers/costExpr');
const { evalFormulaAst } = require('../src/helpers/calcEngine');
const {
  buildFormulaContext,
  evaluateFormulas,
  SOURCE_KEYS,
  defaultFormulas,
} = require('../src/helpers/costLedger');

// Parser
const ast = parseCostExpr('crm.doanh_thu - entries.total');
assert.equal(ast.type, 'op');
assert.equal(ast.op, '-');
assert.equal(evalFormulaAst(ast, { 'crm.doanh_thu': 100, 'entries.total': 40 }), 60);
assert.equal(evalFormulaAst(parseCostExpr('cat.nvl + src.sx.production_value'), {
  'cat.nvl': 10,
  'src.sx.production_value': 5,
}), 15);
assert.equal(evalFormulaAst(parseCostExpr('(a + b) * 2'), { a: 3, b: 4 }), 14);
assert.throws(() => parseCostExpr('crm.doanh_thu; drop'), /Ký tự không hợp lệ|thừa/);

const roundTrip = astToExpr(parseCostExpr('a + b * c'));
assert.ok(roundTrip.includes('+') && roundTrip.includes('*'));

// Context + formulas
const categories = [
  { id: 'c1', code: 'gia_cong' },
  { id: 'c2', code: 'phat_sinh' },
];
const sources = [
  { source_key: SOURCE_KEYS.SX_PRODUCTION },
  { source_key: SOURCE_KEYS.SX_EXPENSE },
];
const entries = [
  { project_id: 'p1', source_key: SOURCE_KEYS.SX_PRODUCTION, category_id: 'c1', amount: 80, is_void: false },
  { project_id: 'p1', source_key: SOURCE_KEYS.SX_EXPENSE, category_id: 'c2', amount: 20, is_void: false },
  { project_id: 'p1', source_key: SOURCE_KEYS.SX_EXPENSE, category_id: 'c2', amount: 999, is_void: true },
];
const ctx = buildFormulaContext({ entries, categories, sources, revenue: 200 });
assert.equal(ctx['entries.total'], 100);
assert.equal(ctx['cat.gia_cong'], 80);
assert.equal(ctx['src.sx.project_expense'], 20);
assert.equal(ctx['crm.doanh_thu'], 200);

const formulas = defaultFormulas().map((f, i) => ({ ...f, id: `f${i}`, is_active: true }));
const { results, context } = evaluateFormulas(formulas, ctx);
assert.equal(context.gia_von, 100);
assert.equal(results.find((r) => r.code === 'loi_nhuan_gop').value, 100);
assert.equal(context.loi_nhuan_gop, 100);

assert.equal(evalFormulaAst(parseCostExpr('excel.nvl - (excel.vc + excel.crm)'), {
  'excel.nvl': 100,
  'excel.vc': 20,
  'excel.crm': 10,
}), 70);

const excelCtx = buildFormulaContext({
  entries: [
    { source_key: 'excel.nvl', amount: 80, is_void: false },
    { source_key: 'excel.vc', amount: 15, is_void: false },
  ],
  categories: [],
  sources: [],
  types: [{ code: 'nvl' }, { code: 'vc' }, { code: 'crm' }],
  revenue: 0,
});
assert.equal(excelCtx['excel.nvl'], 80);
assert.equal(excelCtx['excel.vc'], 15);
assert.equal(excelCtx['excel.crm'], 0);

console.log('cost-ledger.test.js ok');
