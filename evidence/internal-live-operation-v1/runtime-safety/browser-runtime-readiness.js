const fs = require('node:fs');
const path = require('node:path');

const FOUNDER_COCKPIT_CONTRACT_VERSION = 'founder_cockpit_v1';
const FOUNDER_COCKPIT_EXPECTED_COUNTS = Object.freeze({
  systems: 6,
  capabilities: 19,
  configuration: 1,
  signal_hub: 1,
});
const FOUNDER_COCKPIT_SELECTORS = Object.freeze({
  systems: '[data-testid="business-os-system"]',
  capabilities: '[data-testid="business-os-capability"]',
  configuration: '[data-testid="founder-configuration"]',
  signal_hub: '[data-testid="signal-hub"]',
});
const FOUNDER_COCKPIT_CONTENT_ANCHORS = Object.freeze({
  systems: 'h3',
  capabilities: 'h3',
  configuration: 'h2',
  signal_hub: 'p',
});

function readinessError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function responseStatus(response) {
  return typeof response?.status === 'function' ? response.status() : Number(response?.status);
}

function responseHeaders(response) {
  return typeof response?.headers === 'function' ? response.headers() : (response?.headers || {});
}

function isMatchingScopedBusinessOsResponse(response, {
  baseUrl,
  ecosystemId,
  companyId,
}) {
  try {
    const responseUrl = new URL(response.url());
    const request = response.request();
    const ecosystemScopes = responseUrl.searchParams.getAll('ecosystem_id');
    const companyScopes = responseUrl.searchParams.getAll('company_id');
    return responseUrl.origin === new URL(baseUrl).origin
      && responseUrl.pathname === '/api/business-os'
      && ecosystemScopes.length === 1
      && ecosystemScopes[0] === String(ecosystemId)
      && companyScopes.length === 1
      && companyScopes[0] === String(companyId)
      && request.method().toUpperCase() === 'GET';
  } catch {
    return false;
  }
}

async function readRenderedContractState(page) {
  const entries = await Promise.all(Object.entries(FOUNDER_COCKPIT_SELECTORS).map(async ([key, selector]) => {
    const locator = page.locator(selector);
    const [count, renderedState] = await Promise.all([
      locator.count(),
      locator.evaluateAll((nodes, contentAnchor) => {
        const isRendered = (node) => {
          if (!node) return false;
          const style = window.getComputedStyle(node);
          const rectangle = node.getBoundingClientRect();
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity ?? 1) !== 0
            && rectangle.width > 0
            && rectangle.height > 0;
        };
        return nodes.reduce((state, node) => {
          if (!isRendered(node)) return state;
          state.visible_count += 1;
          const anchor = node.querySelector(contentAnchor);
          if (isRendered(anchor) && String(anchor.textContent || '').trim().length > 0) {
            state.content_count += 1;
          }
          return state;
        }, { visible_count: 0, content_count: 0 });
      }, FOUNDER_COCKPIT_CONTENT_ANCHORS[key]),
    ]);
    return [key, { count, ...renderedState }];
  }));
  return Object.fromEntries(entries);
}

function contractStateMatches(state, expectedCounts = FOUNDER_COCKPIT_EXPECTED_COUNTS) {
  return Object.entries(expectedCounts).every(([key, expected]) => (
    state?.[key]?.count === expected
    && state?.[key]?.visible_count === expected
    && state?.[key]?.content_count === expected
  ));
}

async function waitForRenderedFounderCockpit(page, {
  expectedCounts = FOUNDER_COCKPIT_EXPECTED_COUNTS,
  timeoutMs = 60_000,
  pollIntervalMs = 50,
  readState = readRenderedContractState,
  now = () => Date.now(),
  sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
} = {}) {
  const deadline = now() + timeoutMs;
  let state = null;
  do {
    state = await readState(page);
    if (contractStateMatches(state, expectedCounts)) {
      return {
        counts: Object.fromEntries(Object.entries(state).map(([key, value]) => [key, value.count])),
        visible_content_validated: true,
      };
    }
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(pollIntervalMs, remaining));
  } while (now() <= deadline);
  throw readinessError('FOUNDER_LOCAL_BROWSER_CONTRACT_RENDER_TIMEOUT');
}

async function awaitFounderCockpitReady({
  page,
  cockpitUrl,
  baseUrl,
  ecosystemId,
  companyId,
  responseTimeoutMs = 60_000,
  renderTimeoutMs = 60_000,
  navigationTimeoutMs = 60_000,
  readState,
  now,
  sleep,
}) {
  const matchingResponse = page.waitForResponse(
    (response) => isMatchingScopedBusinessOsResponse(response, {
      baseUrl,
      ecosystemId,
      companyId,
    }),
    { timeout: responseTimeoutMs },
  );
  // Attach a rejection handler immediately so a navigation failure cannot
  // leave the response waiter as an unhandled rejection.
  void matchingResponse.catch(() => {});

  try {
    await page.goto(cockpitUrl, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
    await page.locator('[data-testid="business-os-root"]').waitFor({
      state: 'visible',
      timeout: navigationTimeoutMs,
    });
  } catch {
    throw readinessError('FOUNDER_LOCAL_BUSINESS_OS_NAVIGATION_FAILED');
  }

  let response;
  try {
    response = await matchingResponse;
  } catch {
    throw readinessError('FOUNDER_LOCAL_BUSINESS_OS_RESPONSE_TIMEOUT');
  }
  const status = responseStatus(response);
  if (status !== 200 || (typeof response.ok === 'function' && !response.ok())) {
    throw readinessError('FOUNDER_LOCAL_BUSINESS_OS_RESPONSE_FAILED');
  }
  const headers = responseHeaders(response);
  const contractVersion = String(headers['x-business-os-contract'] || '').trim();
  if (contractVersion !== FOUNDER_COCKPIT_CONTRACT_VERSION) {
    throw readinessError('FOUNDER_LOCAL_BUSINESS_OS_CONTRACT_INVALID');
  }

  const renderedContract = await waitForRenderedFounderCockpit(page, {
    timeoutMs: renderTimeoutMs,
    ...(readState ? { readState } : {}),
    ...(now ? { now } : {}),
    ...(sleep ? { sleep } : {}),
  });
  return {
    http_status: status,
    contract_version: contractVersion,
    counts: renderedContract.counts,
    visible_content_validated: renderedContract.visible_content_validated,
  };
}

async function closeBrowserResources({ context, browser } = {}) {
  let closeFailed = false;
  for (const resource of [context, browser]) {
    if (!resource || typeof resource.close !== 'function') continue;
    try {
      await resource.close();
    } catch {
      closeFailed = true;
    }
  }
  if (closeFailed) {
    throw readinessError('FOUNDER_LOCAL_BROWSER_CLEANUP_FAILED');
  }
  return true;
}

function pathIsWithin(candidate, boundary, { allowBoundary = false } = {}) {
  const relative = path.relative(boundary, candidate);
  if (!relative) return allowBoundary;
  return relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function assertExistingPathChainIsContained(selected, boundary) {
  if (!pathIsWithin(selected, boundary)) {
    throw readinessError('FOUNDER_LOCAL_BROWSER_TEMP_PATH_INVALID');
  }
  let boundaryStat;
  try {
    boundaryStat = fs.lstatSync(boundary);
  } catch {
    throw readinessError('FOUNDER_LOCAL_BROWSER_TEMP_PATH_INVALID');
  }
  if (!boundaryStat.isDirectory() || boundaryStat.isSymbolicLink()) {
    throw readinessError('FOUNDER_LOCAL_BROWSER_TEMP_PATH_INVALID');
  }
  const realBoundary = fs.realpathSync(boundary);
  let cursor = boundary;
  for (const part of path.relative(boundary, selected).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) break;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      throw readinessError('FOUNDER_LOCAL_BROWSER_TEMP_PATH_INVALID');
    }
    const realCursor = fs.realpathSync(cursor);
    if (!pathIsWithin(realCursor, realBoundary, { allowBoundary: true })) {
      throw readinessError('FOUNDER_LOCAL_BROWSER_TEMP_PATH_INVALID');
    }
  }
  return realBoundary;
}

function assertDeletionTreeIsContained(target, realBoundary) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    throw readinessError('FOUNDER_LOCAL_BROWSER_PROFILE_PATH_INVALID');
  }
  const realTarget = fs.realpathSync(target);
  if (!pathIsWithin(realTarget, realBoundary)) {
    throw readinessError('FOUNDER_LOCAL_BROWSER_PROFILE_PATH_INVALID');
  }
  if (!stat.isDirectory()) return stat;
  for (const entry of fs.readdirSync(target)) {
    assertDeletionTreeIsContained(path.join(target, entry), realBoundary);
  }
  return stat;
}

function confineProcessTempDirectory(directory, {
  allowedRoot,
  environment = process.env,
} = {}) {
  const selected = path.resolve(directory);
  const boundary = path.resolve(allowedRoot || path.dirname(selected));
  assertExistingPathChainIsContained(selected, boundary);
  fs.mkdirSync(selected, { recursive: true });
  const realBoundary = assertExistingPathChainIsContained(selected, boundary);
  const selectedStat = fs.lstatSync(selected);
  if (!selectedStat.isDirectory() || selectedStat.isSymbolicLink()) {
    throw readinessError('FOUNDER_LOCAL_BROWSER_TEMP_PATH_INVALID');
  }
  const realSelected = fs.realpathSync(selected);
  if (!pathIsWithin(realSelected, realBoundary)) {
    throw readinessError('FOUNDER_LOCAL_BROWSER_TEMP_PATH_INVALID');
  }
  const previous = Object.fromEntries(['TEMP', 'TMP'].map((key) => [key, {
    present: Object.prototype.hasOwnProperty.call(environment, key),
    value: environment[key],
  }]));
  environment.TEMP = realSelected;
  environment.TMP = realSelected;
  return () => {
    for (const key of ['TEMP', 'TMP']) {
      if (previous[key].present) environment[key] = previous[key].value;
      else delete environment[key];
    }
  };
}

function removeStaleAcceptanceProfiles(browserRoot, { allowedRoot } = {}) {
  const root = path.resolve(browserRoot);
  const boundary = path.resolve(allowedRoot || path.dirname(root));
  const realBoundary = assertExistingPathChainIsContained(root, boundary);
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw readinessError('FOUNDER_LOCAL_BROWSER_PROFILE_PATH_INVALID');
  }
  const realRoot = fs.realpathSync(root);
  if (!pathIsWithin(realRoot, realBoundary)) {
    throw readinessError('FOUNDER_LOCAL_BROWSER_PROFILE_PATH_INVALID');
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!/^acceptance-[A-Za-z0-9._-]+$/.test(entry.name)) continue;
    const target = path.resolve(root, entry.name);
    if (path.dirname(target) !== root || !pathIsWithin(target, root)) {
      throw readinessError('FOUNDER_LOCAL_BROWSER_PROFILE_PATH_INVALID');
    }
    const stat = assertDeletionTreeIsContained(target, realRoot);
    fs.rmSync(target, { recursive: stat.isDirectory(), force: true });
  }
  return true;
}

module.exports = {
  FOUNDER_COCKPIT_CONTRACT_VERSION,
  FOUNDER_COCKPIT_CONTENT_ANCHORS,
  FOUNDER_COCKPIT_EXPECTED_COUNTS,
  FOUNDER_COCKPIT_SELECTORS,
  awaitFounderCockpitReady,
  closeBrowserResources,
  confineProcessTempDirectory,
  contractStateMatches,
  isMatchingScopedBusinessOsResponse,
  readRenderedContractState,
  removeStaleAcceptanceProfiles,
  waitForRenderedFounderCockpit,
};
