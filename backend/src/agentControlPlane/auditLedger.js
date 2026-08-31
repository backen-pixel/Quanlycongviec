'use strict';

const { clone, deepFreeze, digest } = require('./immutable');
const { controlPlaneError } = require('./errors');

class AgentControlPlaneAuditLedger {
  #entries;
  #clock;

  constructor({ clock = () => new Date() } = {}) {
    this.#clock = clock;
    this.#entries = [];
  }

  append(event = {}) {
    const eventType = String(event.event_type || '').trim();
    if (!eventType) throw controlPlaneError('AUDIT_EVENT_TYPE_REQUIRED', 'Audit event_type is required.');
    const sequence = this.#entries.length + 1;
    const previousHash = this.#entries.at(-1)?.hash || null;
    const unsigned = {
      audit_id: 'cp1-audit-' + String(sequence).padStart(6, '0'),
      sequence,
      timestamp: this.#clock().toISOString(),
      event_type: eventType,
      run_id: event.run_id || null,
      request_id: event.request_id || null,
      requested_by_user_id: event.requested_by_user_id || null,
      requested_by_actor_type: event.requested_by_actor_type || null,
      agent_id: event.agent_id || null,
      agent_version: event.agent_version || null,
      tenant_id: event.tenant_id || null,
      company_id: event.company_id || null,
      data_scope: clone(event.data_scope || null),
      tool: event.tool || null,
      application_service: event.application_service || null,
      domain: event.domain || null,
      decision: event.decision || null,
      reason_code: event.reason_code || null,
      recommendation: clone(event.recommendation || null),
      metadata: clone(event.metadata || {}),
      previous_hash: previousHash,
    };
    const entry = deepFreeze({ ...unsigned, hash: digest(unsigned) });
    this.#entries.push(entry);
    return entry;
  }

  list(filter = {}) {
    return this.#entries.filter((entry) => (
      (!filter.run_id || entry.run_id === filter.run_id)
      && (!filter.request_id || entry.request_id === filter.request_id)
      && (!filter.event_type || entry.event_type === filter.event_type)
    ));
  }

  trace(runId) {
    return this.list({ run_id: runId });
  }

  verifyChain() {
    let previousHash = null;
    for (const entry of this.#entries) {
      const { hash, ...unsigned } = entry;
      if (unsigned.previous_hash !== previousHash || digest(unsigned) !== hash) return false;
      previousHash = hash;
    }
    return true;
  }
}

module.exports = {
  AgentControlPlaneAuditLedger,
};
