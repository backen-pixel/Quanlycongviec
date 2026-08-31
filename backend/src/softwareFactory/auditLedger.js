const crypto = require('node:crypto');
const { deepFreeze } = require('./agentRegistry');
const { clone, stableSerialize } = require('./canonical');
const { redactSensitiveData } = require('./evidenceContracts');

function computeHash(entryWithoutHash) {
  return crypto.createHash('sha256').update(stableSerialize(entryWithoutHash)).digest('hex');
}

class SoftwareFactoryAuditLedger {
  #entries;

  constructor({ clock = () => new Date() } = {}) {
    this._clock = clock;
    this.#entries = [];
  }

  append(event) {
    const sequence = this.#entries.length + 1;
    const previousHash = this.#entries.at(-1)?.hash || null;
    const metadataResult = redactSensitiveData(event.metadata || {});
    const unsigned = {
      event_id: `sf-audit-${String(sequence).padStart(6, '0')}`,
      sequence,
      timestamp: this._clock().toISOString(),
      event_type: event.event_type,
      actor_id: event.actor_id || null,
      requirement_id: event.requirement_id || null,
      run_id: event.run_id || null,
      previous_hash: previousHash,
      metadata: clone(metadataResult.value),
      redactions: clone(metadataResult.findings),
    };
    const entry = deepFreeze({ ...unsigned, hash: computeHash(unsigned) });
    this.#entries.push(entry);
    return entry;
  }

  list(filter = {}) {
    return this.#entries.filter((entry) => (
      (!filter.run_id || entry.run_id === filter.run_id)
      && (!filter.requirement_id || entry.requirement_id === filter.requirement_id)
      && (!filter.event_type || entry.event_type === filter.event_type)
    ));
  }

  verifyChain() {
    let previousHash = null;
    for (const entry of this.#entries) {
      const { hash, ...unsigned } = entry;
      if (unsigned.previous_hash !== previousHash || computeHash(unsigned) !== hash) return false;
      previousHash = hash;
    }
    return true;
  }
}

module.exports = {
  SoftwareFactoryAuditLedger,
  computeHash,
  stableSerialize,
};
