/**
 * Smoke test cho helper chống cắt 1.000 dòng / URL 25KB.
 * Run: node tests/supabase-fetch-all-smoke.js
 *
 * Cần kết nối được Supabase (đọc dữ liệu thật, không ghi gì).
 */

require('dotenv').config({ quiet: true });
const assert = require('assert');
const { supabase } = require('../src/config/supabase');
const { fetchAllByIds, fetchExistingKeySet } = require('../src/helpers/supabaseFetchAll');

async function testBeatsRowCap() {
  // project_production_staff ≈ 12,9 dòng/dự án → 200 dự án vượt xa 1.000 dòng.
  const { data: projs, error: pErr } = await supabase
    .from('projects').select('id').limit(200);
  if (pErr) throw pErr;
  const ids = (projs || []).map((p) => p.id);
  assert.ok(ids.length >= 100, `cần >=100 dự án để test, chỉ có ${ids.length}`);

  // Cách CŨ (một truy vấn, không phân trang) — bị cắt
  const { data: naive } = await supabase
    .from('project_production_staff').select('project_id').in('project_id', ids);
  const naiveRows = (naive || []).length;

  // Cách MỚI
  const all = await fetchAllByIds({
    table: 'project_production_staff', columns: 'project_id', key: 'project_id', ids,
  });

  // Số thật (đếm phía DB, không tải dòng)
  const { count } = await supabase
    .from('project_production_staff')
    .select('*', { count: 'exact', head: true })
    .in('project_id', ids);

  console.log(`  cách cũ trả về ${naiveRows} dòng · helper trả về ${all.length} · thực tế ${count}`);
  assert.strictEqual(all.length, count, 'helper phải đọc đủ mọi dòng');
  if (count > 1000) {
    assert.strictEqual(naiveRows, 1000, 'cách cũ đúng ra phải bị cắt ở 1.000');
    console.log('  ✓ vượt được giới hạn 1.000 dòng (cách cũ mất '
      + (count - naiveRows) + ' dòng)');
  } else {
    console.log('  (dữ liệu hiện tại <=1.000 dòng nên chưa chứng minh được phần cắt)');
  }

  // Tập khoá phân biệt phải nhiều hơn cách cũ
  const setNew = await fetchExistingKeySet({
    table: 'project_production_staff', key: 'project_id', ids,
  });
  const setOld = new Set((naive || []).map((r) => String(r.project_id)));
  console.log(`  dự án thấy được: cách cũ ${setOld.size} · helper ${setNew.size}`);
  assert.ok(setNew.size >= setOld.size, 'helper không được thấy ít hơn cách cũ');
}

async function testBeatsUrlCap() {
  // >600 UUID trong .in() sẽ làm URL vượt ~25KB nếu không chia khúc.
  const { data: leads, error } = await supabase.from('crm_leads').select('id').limit(1000);
  if (error) throw error;
  const ids = (leads || []).map((l) => l.id);
  assert.ok(ids.length >= 700, `cần >=700 id để test URL, chỉ có ${ids.length}`);

  // Cách cũ: một .in() với toàn bộ id → URL quá dài
  const { error: naiveErr } = await supabase.from('crm_leads').select('id').in('id', ids);
  console.log(`  cách cũ với ${ids.length} id → ${naiveErr ? 'LỖI "' + naiveErr.message + '"' : 'không lỗi'}`);

  const all = await fetchAllByIds({ table: 'crm_leads', columns: 'id', key: 'id', ids });
  assert.strictEqual(all.length, ids.length, 'helper phải trả đủ số id đã hỏi');
  console.log(`  ✓ helper đọc đủ ${all.length}/${ids.length} dòng (tự chia khúc id)`);
}

async function testEmptyAndDedupe() {
  assert.deepStrictEqual(await fetchAllByIds({ table: 'projects', columns: 'id', key: 'id', ids: [] }), []);
  assert.deepStrictEqual(await fetchAllByIds({ table: 'projects', columns: 'id', key: 'id', ids: null }), []);
  const { data: one } = await supabase.from('projects').select('id').limit(1);
  const id = one[0].id;
  const dup = await fetchAllByIds({ table: 'projects', columns: 'id', key: 'id', ids: [id, id, id, null, undefined] });
  assert.strictEqual(dup.length, 1, 'id trùng/null phải được lọc bỏ');
  console.log('  ✓ mảng rỗng / null / id trùng đều xử lý đúng');
}

(async () => {
  console.log('1) Vượt giới hạn 1.000 dòng');
  await testBeatsRowCap();
  console.log('2) Vượt giới hạn độ dài URL');
  await testBeatsUrlCap();
  console.log('3) Đầu vào biên');
  await testEmptyAndDedupe();
  console.log('\nTẤT CẢ ĐỀU ĐẠT');
  process.exit(0);
})().catch((e) => {
  console.error('✗ THẤT BẠI:', e.message);
  process.exit(1);
});
