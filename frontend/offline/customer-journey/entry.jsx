import React from 'react';
import { createRoot } from 'react-dom/client';
import CustomerJourneyExplorer from '../../src/business-os/customer-journey/CustomerJourneyExplorer.jsx';
import readModel from '../../../backend/src/helpers/customerJourneyReadModel.js';
import synthetic from '../../../backend/tests/fixtures/customer-journey/syntheticJourney.js';
import functional from '../../../backend/tests/fixtures/customer-journey/functionalJourney.js';

// This entry has no API transport, authentication, live environment, storage or
// production app import. Both browser and Node tests use the same pure service.
// A fixed regression fixture preserves earlier test expectations; the normal
// offline entry exercises the integrated product. Neither selection is live.
const baseline = new URLSearchParams(window.location.search).get('fixture') === 'baseline-regression';
const client = readModel.createCustomerJourneyService({
  adapter: baseline ? synthetic.createFixtureAdapter() : functional.createFunctionalAdapter(),
  actor: baseline ? synthetic.fixtureActor() : functional.createFunctionalActor(),
  now: () => new Date(synthetic.FIXTURE_TIME),
});
const initialContext = {
  ecosystem_id: synthetic.ECOSYSTEM,
  company_id: 'all',
  period: 'month',
  period_anchor: synthetic.FIXTURE_TIME.slice(0, 10),
  filters: { q: '', status: '', temperature: '', time_basis: '' },
};

class OfflineBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="cj-app">
      <div className="cj-offline-banner" data-testid="journey-offline-banner">NGOẠI TUYẾN / DỮ LIỆU GIẢ · Founder Acceptance HOLD · WP3 STOP</div>
      <div className="cj-shell"><div role="alert" className="cj-state cj-state-error" data-testid="journey-fatal-error">
        Không thể hiển thị hợp đồng ngoại tuyến. Không chuyển sang nguồn thật hoặc dùng snapshot cũ.
      </div></div>
    </main>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <OfflineBoundary><CustomerJourneyExplorer client={client} initialContext={initialContext} /></OfflineBoundary>,
);
