/**
 * Unit tests cho công thức điểm KPI (kpiCalculator.computeScore).
 * Chạy bằng built-in test runner: `node --test backend/tests/kpiCalculator.test.js`
 *
 * Các hàm calc* phụ thuộc Supabase được kiểm thử bằng smoke test khi seed 10 lead mẫu (todo cuối).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { computeScore } = require('../src/services/kpiScoreFormula');
const { filterDefinitionsForUserRole } = require('../src/services/kpiRoleApplies');

test('increasing: actual đạt target → điểm bằng weight', () => {
  const r = computeScore({ formula_type: 'increasing', actual: 90, target: 90, weight: 15 });
  assert.equal(r.capped_score, 15);
  assert.equal(r.raw_score, 15);
});

test('increasing: actual < target → điểm = (actual/target) * weight', () => {
  // Ví dụ Excel: target 90%, actual 81%, weight 15 → 13.5
  const r = computeScore({ formula_type: 'increasing', actual: 81, target: 90, weight: 15 });
  assert.equal(r.capped_score, 13.5);
});

test('increasing: cap tại 1.2x weight khi vượt target', () => {
  const r = computeScore({ formula_type: 'increasing', actual: 200, target: 90, weight: 15 });
  // raw = 200/90 * 15 ≈ 33.33 ; capped = 1.2 * 15 = 18
  assert.equal(r.capped_score, 18);
  assert.ok(r.raw_score > r.capped_score);
});

test('decreasing: actual <= target (tốt hơn target) → cap', () => {
  // Ví dụ Excel: target 5%, actual 4%, weight 15 → 1.2 * 15 = 18 (vượt mục tiêu)
  const r = computeScore({ formula_type: 'decreasing', actual: 4, target: 5, weight: 15 });
  assert.equal(r.capped_score, 18);
});

test('decreasing: actual > target (tệ hơn) → điểm = (target/actual) * weight', () => {
  const r = computeScore({ formula_type: 'decreasing', actual: 10, target: 5, weight: 15 });
  // ratio = 5/10 = 0.5 → 0.5 * 15 = 7.5
  assert.equal(r.capped_score, 7.5);
});

test('decreasing: actual = 0 → cap 1.2 (KPI đạt tuyệt đối)', () => {
  const r = computeScore({ formula_type: 'decreasing', actual: 0, target: 5, weight: 5 });
  assert.equal(r.capped_score, 6); // 1.2 * 5
});

test('quantity: hành vi giống increasing', () => {
  // Excel: target 40, actual 44, weight 5 → min(44/40, 1.2)*5 = 1.1 * 5 = 5.5
  const r = computeScore({ formula_type: 'quantity', actual: 44, target: 40, weight: 5 });
  assert.equal(r.capped_score, 5.5);
});

test('revenue: hành vi giống increasing', () => {
  // Excel: target 1 tỷ, actual 900tr, weight 15 → 0.9 * 15 = 13.5
  const r = computeScore({ formula_type: 'revenue', actual: 900_000_000, target: 1_000_000_000, weight: 15 });
  assert.equal(r.capped_score, 13.5);
});

test('duration: hành vi giống decreasing (thời gian thấp = tốt)', () => {
  // SLA 3 ngày, thực tế 2 ngày → vượt mục tiêu, cap
  const r = computeScore({ formula_type: 'duration', actual: 2, target: 3, weight: 5 });
  assert.equal(r.capped_score, 6); // 1.2 * 5
});

test('actual = null → trả về null score (không tính)', () => {
  const r = computeScore({ formula_type: 'increasing', actual: null, target: 90, weight: 15 });
  assert.equal(r.capped_score, null);
  assert.equal(r.raw_score, null);
});

test('target = 0 → trả null (chia 0)', () => {
  const r = computeScore({ formula_type: 'increasing', actual: 10, target: 0, weight: 15 });
  assert.equal(r.capped_score, null);
});

test('weight = 0 → score = 0', () => {
  const r = computeScore({ formula_type: 'increasing', actual: 90, target: 90, weight: 0 });
  assert.equal(r.capped_score, 0);
});

test('formula_type lạ → score = 0', () => {
  const r = computeScore({ formula_type: 'foo', actual: 90, target: 90, weight: 15 });
  assert.equal(r.capped_score, 0);
});

// Tổng hợp 15 KPI chuẩn — kiểm tra tổng weight = 100 (đồng bộ với migration 148)
test('tổng weight 15 KPI definitions = 100 (sanity)', () => {
  const weights = {
    A1: 12, A2: 4, A3: 7, A4: 7, A5: 3, A6: 2, // A = 35
    B1: 7, B2: 8, B3: 7, B4: 18, B5: 5,        // B = 45
    C1: 15, C2: 2, C3: 2, C4: 1,                // C = 20
  };
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  assert.equal(total, 100);
});

const MOCK_DEFS = [
  { code: 'A1', applies_to: 'sales_all' },
  { code: 'B2', applies_to: 'sales' },
  { code: 'B1', applies_to: 'sales_admin' },
  { code: 'B4', applies_to: 'deal' },
  { code: 'C4', applies_to: 'all' },
];

test('filterDefinitionsForUserRole: sales_admin không gồm deal-only', () => {
  const out = filterDefinitionsForUserRole(MOCK_DEFS, 'sales_admin');
  const codes = new Set(out.map((d) => d.code));
  assert.ok(codes.has('A1') && codes.has('B1') && codes.has('C4'));
  assert.ok(!codes.has('B4') && !codes.has('B2'));
});

test('filterDefinitionsForUserRole: sales gồm sales + deal + sales_all + all', () => {
  const out = filterDefinitionsForUserRole(MOCK_DEFS, 'sales');
  const codes = new Set(out.map((d) => d.code));
  assert.deepEqual([...codes].sort(), ['A1', 'B2', 'B4', 'C4']);
});

test('filterDefinitionsForUserRole: customer_care cùng bộ pipeline với sales', () => {
  const out = filterDefinitionsForUserRole(MOCK_DEFS, 'customer_care');
  const codes = new Set(out.map((d) => d.code));
  assert.deepEqual([...codes].sort(), ['A1', 'B2', 'B4', 'C4']);
});

test('filterDefinitionsForUserRole: region_admin không lọc (đủ bộ)', () => {
  const out = filterDefinitionsForUserRole(MOCK_DEFS, 'region_admin');
  assert.equal(out.length, MOCK_DEFS.length);
});

test('filterDefinitionsForUserRole: admin không lọc', () => {
  const out = filterDefinitionsForUserRole(MOCK_DEFS, 'admin');
  assert.equal(out.length, MOCK_DEFS.length);
});
