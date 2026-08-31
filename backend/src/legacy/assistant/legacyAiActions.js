'use strict';

/**
 * Explicit compatibility boundary for the pre-CP1 assistant.
 *
 * The legacy assistant retains its existing behavior so CP1 does not break
 * production. Governed Agents must never import this namespace or aiActions.
 */
const legacyAiActions = require('../../helpers/aiActions');

module.exports = Object.freeze({
  ...legacyAiActions,
  LEGACY_COMPATIBILITY_ONLY: true,
});
