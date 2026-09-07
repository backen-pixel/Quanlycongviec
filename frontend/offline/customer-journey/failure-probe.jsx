import React from 'react';
import { createRoot } from 'react-dom/client';
import CustomerJourneyExplorer from '../../src/business-os/customer-journey/CustomerJourneyExplorer.jsx';
import readModel from '../../../backend/src/helpers/customerJourneyReadModel.js';
import synthetic from '../../../backend/tests/fixtures/customer-journey/syntheticJourney.js';

// Test entry only. The real explorer consumes the real pure read model; these
// fixed controls change synthetic timing/coverage, never HTTP, auth or storage.
const services = new Map();
let serial = 0;
let armed = false;
let held = null;
let capped = false;
const state = { requests: 0, heldReady: false, heldSettled: false, latestReady: null };
const clone = (value) => JSON.parse(JSON.stringify(value));

function serviceFor(context) {
  const service = services.get(context.snapshot_id);
  if (!service) throw Object.assign(new Error('Synthetic snapshot unavailable'), { code: 'SNAPSHOT_CHANGED' });
  return service;
}
const client = Object.freeze({
  async overview(context) {
    const shouldHold = armed;
    armed = false;
    const snapshot = synthetic.createFixtureSnapshot();
    snapshot.snapshot_id = `fixture-failure-probe-${++serial}`;
    state.requests = serial;
    if (capped) {
      snapshot.coverage.purchase_request = { state: 'PARTIAL', gaps: ['SOURCE_PAGE_CAP'] };
      snapshot.coverage.purchase_order = { state: 'UNKNOWN', gaps: ['SOURCE_TIMEOUT'] };
    }
    const service = readModel.createCustomerJourneyService({
      adapter: synthetic.createFixtureAdapter(snapshot), actor: synthetic.fixtureActor(),
      now: () => new Date(synthetic.FIXTURE_TIME),
    });
    services.set(snapshot.snapshot_id, service);
    const packet = await service.overview(context);
    if (shouldHold) {
      return new Promise((resolve, reject) => {
        held = { packet, resolve, reject };
        state.heldReady = true;
      });
    }
    state.latestReady = { snapshot: packet.snapshot.id, company: packet.context.company_id, period: packet.context.period };
    return packet;
  },
  list(context, ...args) { return serviceFor(context).list(context, ...args); },
  detail(context, ...args) { return serviceFor(context).detail(context, ...args); },
});

function holdNextOverview() {
  if (held || armed) throw new Error('Synthetic hold already pending');
  armed = true;
  state.heldReady = false;
  state.heldSettled = false;
}
async function settleHeld(reject) {
  if (!held || !state.heldReady) throw new Error('Synthetic hold is not ready');
  const pending = held;
  held = null;
  state.heldReady = false;
  if (reject) pending.reject(Object.assign(new Error('SYNTHETIC_RAW_DETAIL_MUST_NOT_RENDER'), { code: 'SOURCE_TIMEOUT' }));
  else pending.resolve(pending.packet);
  // Acknowledged browser frames let promise continuations and React commits
  // become observable; no timing-based sleeps or guessed request durations.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  state.heldSettled = true;
}
Object.defineProperty(window, '__journeyProbe', {
  value: Object.freeze({
    state: () => clone(state), holdNextOverview,
    rejectHeld: () => settleHeld(true), resolveHeld: () => settleHeld(false),
    useCappedSources: () => { capped = true; },
  }), writable: false, configurable: false,
});

document.body.dataset.customerJourneyOffline = 'true';
createRoot(document.getElementById('root')).render(<CustomerJourneyExplorer client={client} initialContext={{
  ecosystem_id: synthetic.ECOSYSTEM, company_id: 'all', period: 'month',
  period_anchor: synthetic.FIXTURE_TIME.slice(0, 10),
  filters: { q: '', status: '', temperature: '', time_basis: '' },
}} />);
