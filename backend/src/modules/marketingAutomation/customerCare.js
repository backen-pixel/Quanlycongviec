'use strict';
const { instant, humanDeadline } = require('./policy');

function decideCare(c) {
  const denied = reason => ({ status: 'DENIED', reason, send: false });
  if (!c || !instant(c.now) || !c.companyId || c.companyId !== c.authorizedCompanyId || c.delegationActive !== true) return denied('UNAUTHORIZED');
  if (c.optedOut === true) return denied('OPTED_OUT');
  if (c.humanActive === true || c.requestedHuman === true) return { status: 'HANDOFF', send: false, reason: 'HUMAN_TAKEOVER', deadline: humanDeadline(c.now) };
  if (['optedOut', 'humanActive', 'requestedHuman'].some(key => typeof c[key] !== 'boolean')) return { status: 'HANDOFF', send: false, reason: 'CONSENT_OR_TAKEOVER_UNKNOWN', deadline: humanDeadline(c.now) };
  if (!['advise', 'qualify', 'remind', 'book_survey'].includes(c.action)) return denied('OUTSIDE_SALES_AUTHORITY');
  if (c.channelSendAllowed !== true || c.factsVerified !== true) return { status: 'HANDOFF', send: false, reason: 'SOURCE_OR_CHANNEL_NOT_READY', deadline: humanDeadline(c.now) };
  if (c.action === 'book_survey' && (c.customerConfirmed !== true || c.slotAvailable !== true || !c.slotVersion)) return denied('BOOKING_NOT_CONFIRMED');
  return { status: 'ALLOWED', send: true, requiresAtomicSlotReservation: c.action === 'book_survey' };
}

// Only verified template text can be published automatically. Free-form model
// drafts remain drafts until their claims/template are approved.
function renderApprovedContent({ template, facts, companyId, now, channel }) {
  const reject = reason => ({ status: 'PENDING_APPROVAL', reason, text: null });
  if (typeof companyId !== 'string' || !companyId.trim() || !template || !instant(now) || template.companyId !== companyId || template.status !== 'APPROVED' || !template.version || !template.approvedBy || !instant(template.expiresAt) || Date.parse(template.expiresAt) <= Date.parse(now) || !template.channels?.includes(channel)) return reject('TEMPLATE_NOT_APPROVED');
  if (typeof template.text !== 'string' || !Array.isArray(facts) || !Array.isArray(template.factIds)) return reject('INVALID_CONTENT');
  const values = new Map();
  for (const id of template.factIds) {
    const matches = facts.filter(f => f.id === id);
    if (matches.length !== 1) return reject('MISSING_OR_DUPLICATE_FACT');
    const f = matches[0];
    if (f.companyId !== companyId || f.status !== 'APPROVED' || !f.sourceId || !f.version || !instant(f.expiresAt) || Date.parse(f.expiresAt) <= Date.parse(now) || typeof f.value !== 'string' || /\{\{|\}\}/.test(f.value)) return reject('UNVERIFIED_FACT');
    values.set(id, f.value);
  }
  let invalid = false;
  const text = template.text.replace(/\{\{([^{}]+)\}\}/g, (_, id) => {
    if (!values.has(id)) { invalid = true; return ''; }
    return values.get(id);
  });
  if (invalid || /\{\{|\}\}/.test(text)) return reject('UNRESOLVED_FACT');
  return { status: 'READY', text, templateVersion: template.version, evidence: template.factIds.map(id => ({ id, sourceId: facts.find(f => f.id === id).sourceId, version: facts.find(f => f.id === id).version })) };
}
module.exports = { decideCare, renderApprovedContent };
