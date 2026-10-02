'use strict';

function createCommandRepository({ client, isPrimary, loadTrustedContext }) {
  if (!client || typeof isPrimary !== 'function' || typeof loadTrustedContext !== 'function') throw new Error('INVALID_REPOSITORY');
  async function rpc(name, args) {
    if (!isPrimary()) throw new Error('PRIMARY_WRITER_REQUIRED');
    const result = await client.rpc(name, args);
    if (result.error) throw new Error('AUTOMATION_STORAGE_UNAVAILABLE');
    return result.data;
  }
  const command = r => r && ({ id: r.id, companyId: r.company_id, actorId: r.actor_id, policyVersion: r.policy_version,
    action: r.action, payload: r.payload, state: r.state, digest: r.request_digest, idempotencyKey: r.idempotency_key, result: r.result });
  return {
    loadContext: loadTrustedContext,
    async enqueue(c) { return command(await rpc('marketing_automation_enqueue', {
      p_company: c.companyId, p_actor: c.actorId, p_version: c.policyVersion, p_action: c.action,
      p_key: c.idempotencyKey, p_digest: c.digest, p_payload: c.payload,
    })); },
    async claim() { return command(await rpc('marketing_automation_claim', {})); },
    async finish(c, state, result) { return command(await rpc('marketing_automation_finish', { p_id: c.id, p_company: c.companyId, p_state: state, p_result: result })); },
    async recover(before) { return rpc('marketing_automation_recover', { p_before: before }); },
  };
}
module.exports = { createCommandRepository };
