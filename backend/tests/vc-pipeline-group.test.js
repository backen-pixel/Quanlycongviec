const assert = require('assert');

/** Mini-port của gomCotTheoNhom / gopPipeline — khóa hành vi cột lớn VC/LĐ. */
function khoaNhom(stage) {
  const k = String(stage?.group_key || '').trim();
  return k || `__rieng__${stage?.id}`;
}

function gomCotTheoNhom(pipeline) {
  const nhom = [];
  const chiMuc = new Map();
  (pipeline || []).forEach((stage) => {
    const key = khoaNhom(stage);
    if (!chiMuc.has(key)) {
      chiMuc.set(key, nhom.length);
      nhom.push({ key, cotNho: [] });
    }
    nhom[chiMuc.get(key)].cotNho.push(stage);
  });
  return nhom.map((g) => ({
    ...g,
    riengLe: String(g.key || '').startsWith('__rieng__'),
    soDuAn: g.cotNho.reduce((a, c) => a + (c.items?.length || 0), 0),
  }));
}

function gopPipeline(pipeline, nhomDangMo) {
  const mo = nhomDangMo instanceof Set ? nhomDangMo : new Set(nhomDangMo || []);
  return gomCotTheoNhom(pipeline).flatMap((g) => {
    if (g.riengLe) return g.cotNho;
    if (g.cotNho.length === 1) return [{ ...g.cotNho[0], name: g.key }];
    if (mo.has(g.key)) {
      return g.cotNho.map((c) => ({ ...c, __nhomKey: g.key }));
    }
    const dau = g.cotNho[0] || {};
    return [{
      ...dau,
      id: `grp:${g.key}`,
      name: g.key,
      items: g.cotNho.flatMap((c) => c.items || []),
      __cotGop: true,
      __groupKey: g.key,
      __soCotNho: g.cotNho.length,
    }];
  });
}

const stages = [
  { id: 'a', name: 'Đang giao HN', group_key: 'Giao hàng', items: [{ id: 1 }] },
  { id: 'b', name: 'Đang giao SG', group_key: 'Giao hàng', items: [{ id: 2 }] },
  { id: 'c', name: 'Lắp đặt', group_key: null, items: [{ id: 3 }] },
];

const gom = gomCotTheoNhom(stages);
assert.equal(gom.length, 2);
assert.equal(gom[0].key, 'Giao hàng');
assert.equal(gom[0].cotNho.length, 2);
assert.equal(gom[0].riengLe, false);
assert.equal(gom[1].riengLe, true);

const thu = gopPipeline(stages, new Set());
assert.equal(thu.length, 2);
assert.equal(thu[0].__cotGop, true);
assert.equal(thu[0].items.length, 2);
assert.equal(thu[1].name, 'Lắp đặt');

const mo = gopPipeline(stages, new Set(['Giao hàng']));
assert.equal(mo.length, 3);
assert.equal(mo[0].__nhomKey, 'Giao hàng');
assert.equal(mo[1].__nhomKey, 'Giao hàng');
assert.equal(mo[2].name, 'Lắp đặt');

console.log('vc-pipeline-group.test.js OK');
