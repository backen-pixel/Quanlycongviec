'use strict';
// Enable only after the private read-model migration has been applied.
function workTaskReadSource() {
  return process.env.WORK_PLANS_AGGREGATES_ENABLED === '1' ? 'unified_work_tasks_v' : 'unified_tasks_v';
}
module.exports = { workTaskReadSource };
