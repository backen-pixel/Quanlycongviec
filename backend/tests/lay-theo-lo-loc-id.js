const assert = require('assert');
const { layTheoLo } = require('../src/helpers/supabaseLo');

const UUID = '11111111-1111-4111-8111-111111111111';

function clientGhiNhan(daGui) {
  return {
    from() {
      return {
        select() {
          return {
            in(_cot, ids) {
              daGui.push(ids);
              return Promise.resolve({ data: [], error: null });
            },
          };
        },
      };
    },
  };
}

async function main() {
  const rac = [];
  const clientRac = clientGhiNhan(rac);
  const rong = await layTheoLo('projects', 'id', ['null', 'undefined', 'NaN', '', null, undefined], 'id', {
    client: clientRac,
  });
  assert.deepEqual(rong, []);
  assert.equal(rac.length, 0);

  const gui = [];
  const clientGui = clientGhiNhan(gui);
  await layTheoLo('projects', 'id', ['null', UUID], 'id', { client: clientGui });
  assert.equal(gui.length, 1);
  assert.deepEqual(gui[0], [UUID]);

  console.log('lay-theo-lo-loc-id: ok');
}

main().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
