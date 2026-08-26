/**
 * Business OS SLA escalation — quét Qualification, Khảo sát và Thiết kế mỗi 5 phút.
 *
 * Worker chỉ materialize notification nội bộ và có dedupe tại database.
 * Không gọi socket, mobile push, email, Zalo hoặc webhook bên ngoài.
 * Disable bằng BUSINESS_OS_SLA_CRON_DISABLED=1.
 */
const { runIfLeader } = require('../helpers/cronLeader');
const { evaluateAllQualificationSlaEscalations } = require('../helpers/businessOsQualificationAutomation');
const { evaluateAllDealWorkflowSlaEscalations } = require('../helpers/businessOsDealWorkflow');

const INTERVAL_MS = 5 * 60 * 1000;
const INITIAL_DELAY_MS = 30 * 1000;

async function runOnce() {
  const [qualification, dealWorkflow] = await Promise.all([
    evaluateAllQualificationSlaEscalations(),
    evaluateAllDealWorkflowSlaEscalations(),
  ]);
  const result = {
    companies: qualification.companies || 0,
    automations: dealWorkflow.automations || 0,
    created: (qualification.created || 0) + (dealWorkflow.created || 0),
    skipped: (qualification.skipped || 0) + (dealWorkflow.skipped || 0),
    errors: [...(qualification.errors || []), ...(dealWorkflow.errors || [])],
  };
  if (result.created || result.errors?.length) {
    console.log(
      `[business-os-sla] companies=${result.companies || 0} created=${result.created || 0} `
      + `skipped=${result.skipped || 0} errors=${result.errors?.length || 0}`,
    );
  }
  return result;
}

let started = false;
function start() {
  if (started) return;
  if (process.env.BUSINESS_OS_SLA_CRON_DISABLED === '1') {
    console.log('[business-os-sla] Disabled by env BUSINESS_OS_SLA_CRON_DISABLED=1');
    return;
  }
  started = true;
  const tick = () => {
    void runIfLeader('business-os-sla-escalation', runOnce, { ttlSec: 240 })
      .catch((error) => console.warn('[business-os-sla]', error.message || error))
      .finally(() => setTimeout(tick, INTERVAL_MS));
  };
  setTimeout(tick, INITIAL_DELAY_MS);
  console.log('[business-os-sla] Qualification/Survey/Design escalation: mỗi 5 phút');
}

module.exports = { start, runOnce };
