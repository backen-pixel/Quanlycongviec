'use strict';
const { createHash } = require('node:crypto');

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  const out = JSON.stringify(value);
  if (out === undefined) throw new Error('NON_JSON_COMMAND');
  return out;
}
function commandDigest(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }

// Repository owns durable transaction + audit. Trusted context is loaded from
// server-side adapters; HTTP/model arguments cannot supply authorization facts.
function createCommandService({ repository, validate, adapters = {}, enabled = false }) {
  if (!repository || typeof validate !== 'function') throw new Error('INVALID_COMMAND_DEPENDENCIES');
  return {
    async submit(actor, intent) {
      if (!enabled) return { status: 'DENIED', reason: 'AUTOMATION_NOT_RELEASED' };
      if (!actor?.id || !actor.companyId || !intent?.idempotencyKey || !intent.action) return { status: 'DENIED', reason: 'INVALID_COMMAND' };
      const trusted = await repository.loadContext(actor, intent);
      const decision = await validate(trusted, intent);
      if (decision.status !== 'ALLOWED') return decision;
      const request = { actorId: actor.id, companyId: actor.companyId, action: intent.action, policyVersion: trusted.policyVersion, payload: intent.payload };
      return repository.enqueue({ ...request, idempotencyKey: intent.idempotencyKey, digest: commandDigest(request) });
    },
    async runOne() {
      if (!enabled) return { status: 'DISABLED' };
      const command = await repository.claim();
      if (!command) return { status: 'IDLE' };
      try {
        const actor = { id: command.actorId, companyId: command.companyId };
        const trusted = await repository.loadContext(actor, command);
        if (trusted.policyVersion !== command.policyVersion) return await repository.finish(command, 'DENIED', { reason: 'POLICY_CHANGED' });
        const decision = await validate(trusted, command);
        if (decision.status !== 'ALLOWED') return await repository.finish(command, 'DENIED', { reason: decision.reason });
        const adapter = adapters[command.action];
        if (!adapter || adapter.idempotent !== true || typeof adapter.execute !== 'function') return await repository.finish(command, 'MANUAL_REQUIRED', { reason: 'SUPPORTED_ADAPTER_REQUIRED' });
        // A timed-out or crashed external call is never automatically retried.
        // Reconciliation must establish provider outcome before another attempt.
        const receipt = await adapter.execute(command.payload, { idempotencyKey: command.id, companyId: command.companyId });
        if (!receipt?.providerReceiptId) return await repository.finish(command, 'UNKNOWN', { reason: 'PROVIDER_OUTCOME_UNCONFIRMED' });
        return await repository.finish(command, 'SUCCEEDED', { providerReceiptId: receipt.providerReceiptId });
      } catch {
        return repository.finish(command, 'UNKNOWN', { reason: 'EXECUTION_OR_COMMIT_UNCERTAIN' });
      }
    },
  };
}
module.exports = { createCommandService, commandDigest };
