/**
 * Nhiệm vụ mẫu xưởng không được tạo giao việc / không vào tab Không gian chung.
 * Phát sinh (sx_shared + customer_request) vẫn đi tiếp.
 * Chạy: node tests/workshop-template-no-assignment.js
 */
const assert = require('assert');
const path = require('path');

const CONFIG_PATH = require.resolve('../src/config/supabase.js');

function installSupabase(supabase) {
  require.cache[CONFIG_PATH] = {
    id: CONFIG_PATH,
    filename: CONFIG_PATH,
    loaded: true,
    exports: { supabase },
  };
}

function drop(rel) {
  const abs = path.join(__dirname, '..', rel);
  delete require.cache[require.resolve(abs)];
}

let fromCalls = 0;
installSupabase({
  from() {
    fromCalls += 1;
    throw new Error('db');
  },
});

const { isWorkshopPipelineTask, isWorkshopPipelineSlug } = require('../src/helpers/workshopPipelineTask');
const { syncAssignmentFromCrmTask } = require('../src/helpers/crmTaskAssignmentSync');
const { taskMatchesPrivateModule } = require('../src/helpers/sharedWorkspaceInbox');

assert.strictEqual(isWorkshopPipelineTask({ stage_slug: 'sx_pl_3e373c8b', title: 'Phôi' }), true);
assert.strictEqual(isWorkshopPipelineTask({ stage_slug: 'sx_hoan_thien', title: 'Cánh' }), true);
assert.strictEqual(isWorkshopPipelineTask({ stage_slug: 'vc_giao_hang' }), true);
assert.strictEqual(isWorkshopPipelineTask({ stage_slug: 'ld_lap_dat' }), true);
assert.strictEqual(isWorkshopPipelineTask({
  stage_slug: 'sx_shared',
  task_source_type: 'customer_request',
  title: 'Chỉnh sửa khoảng cách đợt inox',
}), false);
assert.strictEqual(isWorkshopPipelineTask({ stage_slug: 'sx_shared' }), false);
assert.strictEqual(isWorkshopPipelineTask({ stage_slug: 'shared_workspace', task_source_type: 'employee_error' }), false);
assert.strictEqual(isWorkshopPipelineTask({ stage_slug: 'deal_new', title: 'Báo giá' }), false);
assert.strictEqual(isWorkshopPipelineSlug('sx_pl_6723a412'), true);
assert.strictEqual(isWorkshopPipelineSlug('sx_shared'), false);

(async () => {
  fromCalls = 0;
  const skipped = await syncAssignmentFromCrmTask(
    { user: { userId: 'u1' } },
    { id: 'task-phoi', title: 'Phôi', stage_slug: 'sx_pl_3e373c8b', status: 'pending' },
    ['user-1'],
  );
  assert.strictEqual(skipped.reason, 'workshop_pipeline_task');
  assert.strictEqual(skipped.assignmentId, null);
  assert.strictEqual(fromCalls, 0, 'nhiệm vụ mẫu không được ghi crm_assignments');

  fromCalls = 0;
  let phatSinhReachedDb = false;
  try {
    await syncAssignmentFromCrmTask(
      { user: { userId: 'u1' } },
      {
        id: 'task-ps',
        title: 'Chỉnh sửa khoảng cách đợt inox',
        stage_slug: 'sx_shared',
        task_source_type: 'customer_request',
        status: 'pending',
        lead_id: 'lead-1',
      },
      ['user-1'],
    );
  } catch (e) {
    phatSinhReachedDb = fromCalls > 0;
    assert.ok(phatSinhReachedDb, e.message);
  }
  assert.strictEqual(phatSinhReachedDb, true, 'phát sinh vẫn đi vào luồng tạo giao việc');

  assert.strictEqual(taskMatchesPrivateModule({ stage_slug: 'sx_pl_3e373c8b', title: 'Phôi' }, 'production'), false);
  assert.strictEqual(taskMatchesPrivateModule({ stage_slug: 'sx_hoan_thien', title: 'Đóng gói' }, 'production'), false);
  assert.strictEqual(taskMatchesPrivateModule({ stage_slug: 'vc_ld_nghiem_thu' }, 'logistics'), false);
  assert.strictEqual(taskMatchesPrivateModule({
    stage_slug: 'pl_san_xuat_654738d6',
    stage: { sync_role: 'sx_production' },
  }, 'production'), true);
  assert.strictEqual(taskMatchesPrivateModule({ stage_slug: 'deal_new', title: 'Báo giá' }, 'crm'), true);

  const tasks = [
    { id: 'phoi', lead_id: 'lead-1', title: 'Phôi', stage_slug: 'sx_pl_3e373c8b', status: 'pending', pipeline_stage_id: null, order_index: 0 },
    { id: 'bao-gia', lead_id: 'lead-1', title: 'Báo giá', stage_slug: 'deal_new', status: 'pending', pipeline_stage_id: 'st1', order_index: 1 },
  ];
  installSupabase({
    from(table) {
      const state = { filters: [], inFilters: [] };
      const builder = {
        select() { return builder; },
        eq(col, val) { state.filters.push([col, val]); return builder; },
        in(col, vals) { state.inFilters.push([col, vals]); return builder; },
        order() { return builder; },
        then(onOk, onErr) {
          let rows = table === 'crm_tasks' ? tasks : [{ id: 'st1', order_index: 1 }];
          rows = rows.filter((row) => state.filters.every(([col, val]) => String(row[col] ?? '') === String(val)));
          for (const [col, vals] of state.inFilters) {
            const set = new Set(vals.map(String));
            rows = rows.filter((row) => set.has(String(row[col])));
          }
          return Promise.resolve({ data: rows, error: null }).then(onOk, onErr);
        },
      };
      return builder;
    },
  });
  drop('src/helpers/crmSequentialAssignment.js');
  const { pickNextOpenCrmTask } = require('../src/helpers/crmSequentialAssignment');
  const next = await pickNextOpenCrmTask('lead-1');
  assert.strictEqual(next && next.id, 'bao-gia');
  assert.notStrictEqual(next && next.title, 'Phôi');

  console.log('workshop-template-no-assignment: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
