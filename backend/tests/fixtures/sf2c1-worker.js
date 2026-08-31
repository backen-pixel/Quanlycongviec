const {
  DurableControlPlaneFoundation,
  HttpDurableStatePortProof,
  HttpKmsKeyProviderProof,
} = require('../../src/softwareFactory');

process.once('message', async (message) => {
  const allowedDecisionDigest = message.allowed_decision_digest;
  const verifier = Object.freeze({
    async verifyDecision({ decision, binding }) {
      return decision?.decision_digest === allowedDecisionDigest
        && decision.scope_id === binding.scope_id
        && decision.request_id === binding.request_id
        && decision.requirement_id === binding.requirement_id
        && decision.operation === binding.operation
        && decision.agent_id === binding.agent_id;
    },
  });
  const control = new DurableControlPlaneFoundation({
    port: new HttpDurableStatePortProof(message.store),
    key_provider: new HttpKmsKeyProviderProof(message.kms),
    authorization_verifier: verifier,
  });
  try {
    const result = await control.commit(message.command);
    if (process.send) process.send({ ok: true, result });
  } catch (error) {
    if (process.send) {
      process.send({
        ok: false,
        error: {
          code: error?.code || 'UNEXPECTED_ERROR',
          message: error?.message || String(error),
        },
      });
    }
  } finally {
    process.disconnect();
  }
});
