const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  FOUNDER_COCKPIT_EXPECTED_COUNTS,
  awaitFounderCockpitReady,
  closeBrowserResources,
  confineProcessTempDirectory,
  isMatchingScopedBusinessOsResponse,
  readRenderedContractState,
  removeStaleAcceptanceProfiles,
} = require('./browser-runtime-readiness');

const BASE_URL = 'http://127.0.0.1:4010';
const ECOSYSTEM_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
const COCKPIT_URL = `${BASE_URL}/business-os?ecosystem_id=${ECOSYSTEM_ID}&company_id=${COMPANY_ID}`;

function syntheticResponse({ status = 200, contract = 'founder_cockpit_v1' } = {}) {
  return {
    url: () => `${BASE_URL}/api/business-os?ecosystem_id=${ECOSYSTEM_ID}&company_id=${COMPANY_ID}&period=week`,
    request: () => ({ method: () => 'GET' }),
    status: () => status,
    ok: () => status >= 200 && status < 300,
    headers: () => ({ 'x-business-os-contract': contract }),
  };
}

function syntheticPage({ response, responseDelayMs = 0, responseError = null }) {
  return {
    waitForResponse(predicate) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (responseError) return reject(responseError);
          if (!predicate(response)) return reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
          return resolve(response);
        }, responseDelayMs);
      });
    },
    async goto() {},
    locator() {
      return { async waitFor() {} };
    },
  };
}

function contractState(counts) {
  return Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, {
    count,
    visible_count: count,
    content_count: count,
  }]));
}

function workspaceTemp(t, label) {
  const directory = fs.mkdtempSync(path.join(__dirname, `.tmp-${label}-${process.pid}-`));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('matches only the exact same-origin scoped Business OS GET response', () => {
  const expected = syntheticResponse();
  assert.equal(isMatchingScopedBusinessOsResponse(expected, {
    baseUrl: BASE_URL,
    ecosystemId: ECOSYSTEM_ID,
    companyId: COMPANY_ID,
  }), true);
  const wrongCompany = {
    ...expected,
    url: () => `${BASE_URL}/api/business-os?ecosystem_id=${ECOSYSTEM_ID}&company_id=33333333-3333-4333-8333-333333333333`,
  };
  assert.equal(isMatchingScopedBusinessOsResponse(wrongCompany, {
    baseUrl: BASE_URL,
    ecosystemId: ECOSYSTEM_ID,
    companyId: COMPANY_ID,
  }), false);
  const duplicateScope = {
    ...expected,
    url: () => `${expected.url()}&company_id=${COMPANY_ID}`,
  };
  assert.equal(isMatchingScopedBusinessOsResponse(duplicateScope, {
    baseUrl: BASE_URL,
    ecosystemId: ECOSYSTEM_ID,
    companyId: COMPANY_ID,
  }), false);
});

test('confines and restores the verifier environment without exposing another path', () => {
  const environment = { TEMP: 'before-temp' };
  const restore = confineProcessTempDirectory(__dirname, {
    allowedRoot: path.resolve(__dirname, '..', '..', '..'),
    environment,
  });
  assert.equal(environment.TEMP, fs.realpathSync(__dirname));
  assert.equal(environment.TMP, fs.realpathSync(__dirname));
  restore();
  assert.deepEqual(environment, { TEMP: 'before-temp' });
});

test('rejects an escaping temp path before creating it', (t) => {
  const boundary = workspaceTemp(t, 'temp-boundary');
  const outside = path.join(path.dirname(boundary), `${path.basename(boundary)}-outside`, 'browser');
  assert.equal(fs.existsSync(outside), false);
  assert.throws(() => confineProcessTempDirectory(outside, {
    allowedRoot: boundary,
    environment: {},
  }), { code: 'FOUNDER_LOCAL_BROWSER_TEMP_PATH_INVALID' });
  assert.equal(fs.existsSync(outside), false);
});

test('removes only contained stale acceptance profiles', (t) => {
  const boundary = workspaceTemp(t, 'profile-cleanup');
  const browserRoot = path.join(boundary, 'browser');
  const restore = confineProcessTempDirectory(browserRoot, {
    allowedRoot: boundary,
    environment: {},
  });
  restore();
  const stale = path.join(browserRoot, 'acceptance-stale');
  const retained = path.join(browserRoot, 'retained-profile');
  fs.mkdirSync(path.join(stale, 'nested'), { recursive: true });
  fs.mkdirSync(retained);
  fs.writeFileSync(path.join(stale, 'nested', 'synthetic.txt'), 'synthetic');
  assert.equal(removeStaleAcceptanceProfiles(browserRoot, { allowedRoot: boundary }), true);
  assert.equal(fs.existsSync(stale), false);
  assert.equal(fs.existsSync(retained), true);
});

test('rejects a linked browser root before cleanup or temp mutation', (t) => {
  const boundary = workspaceTemp(t, 'linked-root');
  const target = path.join(boundary, 'target');
  const linkedRoot = path.join(boundary, 'browser');
  fs.mkdirSync(target);
  try {
    fs.symlinkSync(target, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'ENOSYS', 'EACCES'].includes(error?.code)) {
      t.skip(`directory links unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  assert.throws(() => confineProcessTempDirectory(linkedRoot, {
    allowedRoot: boundary,
    environment: {},
  }), { code: 'FOUNDER_LOCAL_BROWSER_TEMP_PATH_INVALID' });
  assert.throws(() => removeStaleAcceptanceProfiles(linkedRoot, {
    allowedRoot: boundary,
  }), { code: 'FOUNDER_LOCAL_BROWSER_TEMP_PATH_INVALID' });
});

test('rejects a linked acceptance profile without touching its target', (t) => {
  const boundary = workspaceTemp(t, 'linked-profile');
  const browserRoot = path.join(boundary, 'browser');
  const target = path.join(boundary, 'target');
  fs.mkdirSync(browserRoot);
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'synthetic.txt'), 'synthetic');
  const linkedProfile = path.join(browserRoot, 'acceptance-linked');
  try {
    fs.symlinkSync(target, linkedProfile, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'ENOSYS', 'EACCES'].includes(error?.code)) {
      t.skip(`directory links unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  assert.throws(() => removeStaleAcceptanceProfiles(browserRoot, {
    allowedRoot: boundary,
  }), { code: 'FOUNDER_LOCAL_BROWSER_PROFILE_PATH_INVALID' });
  assert.equal(fs.readFileSync(path.join(target, 'synthetic.txt'), 'utf8'), 'synthetic');
});

test('reads exact rendered, visible, and non-empty contract blocks without retaining content', async () => {
  const node = (visible = true, content = 'synthetic verified content') => {
    const anchor = {
      style: { display: visible ? 'block' : 'none', visibility: 'visible', opacity: '1' },
      textContent: content,
      getBoundingClientRect: () => ({ width: visible ? 10 : 0, height: visible ? 10 : 0 }),
    };
    return {
      style: { display: visible ? 'block' : 'none', visibility: 'visible', opacity: '1' },
      getBoundingClientRect: () => ({ width: visible ? 10 : 0, height: visible ? 10 : 0 }),
      querySelector: () => anchor,
    };
  };
  const nodesBySelector = new Map([
    ['[data-testid="business-os-system"]', [node(), node()]],
    ['[data-testid="business-os-capability"]', [node(), node(false)]],
    ['[data-testid="founder-configuration"]', [node()]],
    ['[data-testid="signal-hub"]', [node()]],
  ]);
  const previousWindow = global.window;
  global.window = { getComputedStyle: (item) => item.style };
  try {
    const state = await readRenderedContractState({
      locator(selector) {
        const nodes = nodesBySelector.get(selector) || [];
        return {
          count: async () => nodes.length,
          evaluateAll: async (callback, argument) => callback(nodes, argument),
        };
      },
    });
    assert.deepEqual(state, {
      systems: { count: 2, visible_count: 2, content_count: 2 },
      capabilities: { count: 2, visible_count: 1, content_count: 1 },
      configuration: { count: 1, visible_count: 1, content_count: 1 },
      signal_hub: { count: 1, visible_count: 1, content_count: 1 },
    });
  } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
});

test('waits through a slow response and delayed validated snapshot render', async () => {
  const states = [
    contractState({ systems: 0, capabilities: 0, configuration: 0, signal_hub: 0 }),
    contractState({ systems: 6, capabilities: 19, configuration: 1, signal_hub: 1 }),
  ];
  const result = await awaitFounderCockpitReady({
    page: syntheticPage({ response: syntheticResponse(), responseDelayMs: 15 }),
    cockpitUrl: COCKPIT_URL,
    baseUrl: BASE_URL,
    ecosystemId: ECOSYSTEM_ID,
    companyId: COMPANY_ID,
    responseTimeoutMs: 100,
    renderTimeoutMs: 100,
    readState: async () => states.shift() || states.at(-1),
    sleep: async () => {},
  });
  assert.deepEqual(result, {
    http_status: 200,
    contract_version: 'founder_cockpit_v1',
    counts: FOUNDER_COCKPIT_EXPECTED_COUNTS,
    visible_content_validated: true,
  });
});

test('fails closed when the matching scoped Business OS response is an error', async () => {
  await assert.rejects(() => awaitFounderCockpitReady({
    page: syntheticPage({ response: syntheticResponse({ status: 503 }) }),
    cockpitUrl: COCKPIT_URL,
    baseUrl: BASE_URL,
    ecosystemId: ECOSYSTEM_ID,
    companyId: COMPANY_ID,
    responseTimeoutMs: 50,
    renderTimeoutMs: 50,
    readState: async () => contractState(FOUNDER_COCKPIT_EXPECTED_COUNTS),
  }), { code: 'FOUNDER_LOCAL_BUSINESS_OS_RESPONSE_FAILED' });
});

test('fails closed when the scoped response lacks the frozen source contract', async () => {
  await assert.rejects(() => awaitFounderCockpitReady({
    page: syntheticPage({ response: syntheticResponse({ contract: 'unexpected_contract' }) }),
    cockpitUrl: COCKPIT_URL,
    baseUrl: BASE_URL,
    ecosystemId: ECOSYSTEM_ID,
    companyId: COMPANY_ID,
    responseTimeoutMs: 50,
    renderTimeoutMs: 50,
    readState: async () => contractState(FOUNDER_COCKPIT_EXPECTED_COUNTS),
  }), { code: 'FOUNDER_LOCAL_BUSINESS_OS_CONTRACT_INVALID' });
});

test('fails closed when the matching scoped Business OS response times out', async () => {
  const timeout = Object.assign(new Error('synthetic timeout'), { name: 'TimeoutError' });
  await assert.rejects(() => awaitFounderCockpitReady({
    page: syntheticPage({ response: syntheticResponse(), responseError: timeout }),
    cockpitUrl: COCKPIT_URL,
    baseUrl: BASE_URL,
    ecosystemId: ECOSYSTEM_ID,
    companyId: COMPANY_ID,
    responseTimeoutMs: 5,
    renderTimeoutMs: 5,
    readState: async () => contractState(FOUNDER_COCKPIT_EXPECTED_COUNTS),
  }), { code: 'FOUNDER_LOCAL_BUSINESS_OS_RESPONSE_TIMEOUT' });
});

test('fails closed when the validated snapshot has a visible block without content', async () => {
  let syntheticNow = 0;
  await assert.rejects(() => awaitFounderCockpitReady({
    page: syntheticPage({ response: syntheticResponse() }),
    cockpitUrl: COCKPIT_URL,
    baseUrl: BASE_URL,
    ecosystemId: ECOSYSTEM_ID,
    companyId: COMPANY_ID,
    responseTimeoutMs: 50,
    renderTimeoutMs: 5,
    readState: async () => ({
      ...contractState(FOUNDER_COCKPIT_EXPECTED_COUNTS),
      capabilities: { count: 19, visible_count: 19, content_count: 18 },
    }),
    now: () => syntheticNow,
    sleep: async (delayMs) => { syntheticNow += delayMs; },
  }), { code: 'FOUNDER_LOCAL_BROWSER_CONTRACT_RENDER_TIMEOUT' });
});

test('browser cleanup tries every resource and fails closed when either close rejects', async () => {
  const closed = [];
  await assert.rejects(closeBrowserResources({
    context: {
      async close() {
        closed.push('context');
        throw new Error('synthetic context close failure');
      },
    },
    browser: {
      async close() {
        closed.push('browser');
      },
    },
  }), { code: 'FOUNDER_LOCAL_BROWSER_CLEANUP_FAILED' });
  assert.deepEqual(closed, ['context', 'browser']);
});
