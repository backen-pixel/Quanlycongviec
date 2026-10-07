'use strict';

// Pure registry adapter: caller must authenticate actor and authorize company/role.
// No route, flag, provider API or runtime registration is installed here.
function failure(code) { const error = new Error(code); error.code = code; return error; }
function required(value, code) { if (typeof value !== 'string' || !value.trim()) throw failure(code); }
function unwrap({ data, error }) {
  if (error) {
    const code = ['REQUEST_CONFLICT','COMPANY_MISMATCH','REVISION_CONFLICT','TRIAL_CLOSED',
      'TRIAL_NOT_READY','TRIAL_NOT_FOUND','INVALID_STATE','INVALID_COMMAND','REASON_REQUIRED']
      .find(item => error.message?.includes(item));
    throw failure(code || error.code || 'REGISTRY_ERROR');
  }
  return data;
}

async function getTrial(db, { companyId, trialId }) {
  required(companyId, 'INVALID_COMPANY'); required(trialId, 'INVALID_TRIAL');
  const row = unwrap(await db.from('p1_trials').select('*').eq('id', trialId).maybeSingle());
  if (!row) throw failure('TRIAL_NOT_FOUND');
  if (row.company_id !== companyId) throw failure('COMPANY_MISMATCH');
  return row;
}

async function command(db, kind, { companyId, actorId, requestId, trialId = null,
  expectedRevision = null, payload = {} }) {
  required(companyId, 'INVALID_COMPANY'); required(actorId, 'INVALID_ACTOR');
  required(requestId, 'INVALID_REQUEST');
  if (kind !== 'create' && (!trialId || !Number.isInteger(expectedRevision) || expectedRevision < 1))
    throw failure('INVALID_COMMAND');
  const args = { _command: kind, _company_id: companyId, _actor_id: actorId,
    _request_id: requestId, _trial_id: trialId, _expected_revision: expectedRevision, _payload: payload };
  try { return unwrap(await db.rpc('p1_trial_command_v1', args)); }
  catch (error) {
    // A concurrent replay may lose the event unique-key race. Retry only that case;
    // the committed event then returns the original result or REQUEST_CONFLICT.
    if (error.code !== '23505') throw error;
    return unwrap(await db.rpc('p1_trial_command_v1', args));
  }
}

const createDraftTrial = (db, input) => command(db, 'create', input);
const updateDraftTrial = (db, input) => command(db, 'update', input);
const addScope = (db, input) => command(db, 'scope', input);
const approveTrial = (db, input) => command(db, 'approve', input);
const closeTrial = (db, input) => command(db, 'close', input);
module.exports = { createDraftTrial, getTrial, updateDraftTrial, addScope, approveTrial, closeTrial };
