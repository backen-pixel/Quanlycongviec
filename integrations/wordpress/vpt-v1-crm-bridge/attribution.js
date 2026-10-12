(function () {
  'use strict';
  var campaignKeys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','gbraid','wbraid','campaignid','adgroupid','keyword','matchtype','device'];
  var keys = campaignKeys.concat(['vpt_referrer_host','vpt_landing_page']);
  var storageKey = 'vpt_v1_attribution_session';
  var ttl = 30 * 60 * 1000;
  var now = Date.now();
  var query = new URLSearchParams(window.location.search);
  var data = {}, prior = null, hasCampaign = false;
  campaignKeys.forEach(function (key) {
    var value = query.get(key);
    if (value) { data[key] = value.replace(/[\x00-\x1f\x7f]/g, '').slice(0,500); hasCampaign = true; }
  });
  try { prior = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch (_) {}
  var referrerHost = '';
  try { referrerHost = new URL(document.referrer).hostname.toLowerCase(); } catch (_) {}
  var internal = ['vanphuthanh.net','www.vanphuthanh.net'].includes(referrerHost);
  var newExternal = Boolean(referrerHost && !internal);
  var usePrior = !hasCampaign && !newExternal && prior && prior.expires > now && prior.fields && typeof prior.fields === 'object';
  if (usePrior) {
    keys.forEach(function (key) { if (typeof prior.fields[key] === 'string') data[key] = prior.fields[key].slice(0,500); });
  } else {
    // Store host/path only: never persist referrer queries or search terms.
    data.vpt_referrer_host = newExternal ? referrerHost : '';
    data.vpt_landing_page = 'https://vanphuthanh.net' + window.location.pathname;
    var googleHosts = ['google.com','www.google.com','google.com.vn','www.google.com.vn','google.co.uk','www.google.co.uk','google.com.au','www.google.com.au','google.co.jp','www.google.co.jp','google.ca','www.google.ca','google.de','www.google.de','google.fr','www.google.fr'];
    if (!hasCampaign && googleHosts.includes(referrerHost)) {
      data.utm_source = 'google'; data.utm_medium = 'organic';
    }
  }
  var expires = usePrior ? prior.expires : now + ttl;
  // Random visit key (no personal data) so a click is counted once per visit and kind.
  function newSessionKey() {
    var bytes = new Uint8Array(16);
    try { window.crypto.getRandomValues(bytes); } catch (_) { for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256); }
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  var sessionKey = usePrior && typeof prior.sid === 'string' && /^[0-9a-f]{32}$/.test(prior.sid) ? prior.sid : newSessionKey();
  // A new campaign replaces the entire bundle: never join an old click ID to new UTMs.
  if (Object.keys(data).length) {
    try { sessionStorage.setItem(storageKey, JSON.stringify({expires:expires, fields:data, sid:sessionKey})); } catch (_) {}
  } else { try { sessionStorage.removeItem(storageKey); } catch (_) {} }
  // Website click conversions (call / Zalo / Messenger) go to the CRM with this visit's source.
  var beaconUrl = 'https://tubep-backend.onrender.com/api/external/web-events';
  var beaconKeys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','gbraid','wbraid','campaignid','adgroupid'];
  function clickKind(href) {
    if (/^tel:/i.test(href)) return 'call';
    if (/^https?:\/\/(www\.)?zalo\.me\//i.test(href)) return 'zalo';
    if (/^https?:\/\/(www\.)?(messenger\.com\/t\/|m\.me\/)/i.test(href)) return 'messenger';
    return '';
  }
  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    var kind = link ? clickKind(link.getAttribute('href') || '') : '';
    if (!kind) return;
    var fields = expires > Date.now() ? data : {};
    var once = 'vpt_v1_click_' + kind + '_' + sessionKey;
    try { if (sessionStorage.getItem(once)) return; sessionStorage.setItem(once, '1'); } catch (_) {}
    var body = {kind: kind, session_key: sessionKey, page_url: 'https://vanphuthanh.net' + window.location.pathname};
    if (fields.vpt_landing_page) body.landing_url = fields.vpt_landing_page;
    if (fields.vpt_referrer_host) body.referrer_host = fields.vpt_referrer_host;
    beaconKeys.forEach(function (key) { if (fields[key]) body[key] = fields[key]; });
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({event: 'vpt_click_' + kind});
    try {
      var nav = window.navigator;
      if (nav && typeof nav.sendBeacon === 'function') nav.sendBeacon(beaconUrl, JSON.stringify(body));
    } catch (_) {}
  }, true);
  function populate() {
    // Recheck at submit: a form can remain open beyond the source's original TTL.
    if (expires <= Date.now()) {
      data = {};
      try { sessionStorage.removeItem(storageKey); } catch (_) {}
    }
    document.querySelectorAll('form.wpcf7-form').forEach(function (form) {
      var marker = form.querySelector('[name="vpt_form"]');
      if (!marker || marker.value !== 'VPT_V1') return;
      keys.forEach(function (key) { var field = form.querySelector('[name="'+key+'"]'); if (field) field.value = data[key] || ''; });
      form.setAttribute('data-vpt-attribution', campaignKeys.some(function(key) { return Boolean(data[key]); }) ? 'ready' : 'direct');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', populate); else populate();
  document.addEventListener('submit', populate, true);
  document.addEventListener('wpcf7submit', function (event) {
    if (!event.detail || Number(event.detail.contactFormId) !== 11116) return;
    var receipt = event.detail.apiResponse && event.detail.apiResponse.vpt_v1;
    if (!receipt) return;
    var node = event.target;
    node.setAttribute('data-vpt-crm-status',receipt.status);
    node.setAttribute('data-vpt-crm-mode',receipt.mode);
    // This local event contains no names, phones, free text, or click IDs.
    // Destination copied from the verified Google Ads conversion setup, 2026-09-23.
    if (receipt.status !== 'queued' || !['live','test'].includes(receipt.mode) || !receipt.request_id) return;
    // TEST is server-authorized for administrators and routes only to the diagnostic goal.
    var isTest = receipt.mode === 'test';
    var requested = 'vpt_v1_request_' + receipt.request_id;
    try { if (sessionStorage.getItem(requested)) return; sessionStorage.setItem(requested,'1'); } catch (_) {}
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({event:isTest ? 'vpt_v1_test_request' : 'vpt_v1_lead_request',vpt_form_id:11116,transaction_id:receipt.request_id});
    node.setAttribute('data-vpt-measurement',isTest ? 'test_request' : 'lead_request');
    node.setAttribute('data-vpt-ads-dispatch','awaiting_crm');
    remember({rid: receipt.request_id, test: isTest, until: Date.now() + waitMs});
    watch(receipt.request_id, isTest, Date.now() + waitMs, node);
  });
  // 0.3.1: the Google Ads conversion fires only after the CRM confirmed the lead. The browser asks the
  // site for the delivery state of its own random request_id; a reply is only a state word.
  var pendingKey = 'vpt_v1_pending_conversions';
  var waitMs = 10 * 60 * 1000;
  function pendingList() {
    try { var list = JSON.parse(sessionStorage.getItem(pendingKey) || '[]'); return Array.isArray(list) ? list : []; } catch (_) { return []; }
  }
  function savePending(list) { try { sessionStorage.setItem(pendingKey, JSON.stringify(list)); } catch (_) {} }
  function remember(item) { savePending(pendingList().filter(function (p) { return p.rid !== item.rid; }).concat([item])); }
  function forget(rid) { savePending(pendingList().filter(function (p) { return p.rid !== rid; })); }
  function fireConversion(rid, isTest, node) {
    var dedupe = 'vpt_v1_event_' + rid;
    try { if (sessionStorage.getItem(dedupe)) return; sessionStorage.setItem(dedupe,'1'); } catch (_) {}
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({event:isTest ? 'vpt_v1_test_confirmed' : 'vpt_v1_lead_confirmed',vpt_form_id:11116,transaction_id:rid});
    // Destination copied from the verified Google Ads conversion setup, 2026-09-23.
    var conversion = {send_to:isTest ? 'AW-460207797/qwtDCI-6q4IdELXtuNsB' : 'AW-460207797/fC1UCJTQnYIdELXtuNsB',value:0,currency:'VND',transaction_id:rid};
    if (typeof window.gtag === 'function') {
      window.gtag('event','conversion',conversion);
    } else {
      // Queue using the standard Google tag arguments format; reuse the site's tag.
      (function () { window.dataLayer.push(arguments); })('event','conversion',conversion);
    }
    if (node) node.setAttribute('data-vpt-ads-dispatch','confirmed');
  }
  function watch(rid, isTest, until, node) {
    if (!/^[0-9a-f-]{36}$/.test(rid) || typeof window.fetch !== 'function') return;
    function ask() {
      if (Date.now() > until) { forget(rid); if (node) node.setAttribute('data-vpt-ads-dispatch','timeout'); return; }
      window.fetch('/wp-json/vpt-v1/v1/receipt/' + rid, {credentials: 'omit', cache: 'no-store'})
        .then(function (r) { return r.ok ? r.json() : {state: 'pending'}; })
        .then(function (body) {
          var state = body && body.state;
          if (state === 'confirmed') { forget(rid); fireConversion(rid, isTest, node); return; }
          if (state === 'failed' || state === 'unknown') { forget(rid); if (node) node.setAttribute('data-vpt-ads-dispatch', state); return; }
          setTimeout(ask, 3000);
        }, function () { setTimeout(ask, 5000); });
    }
    setTimeout(ask, 2000);
  }
  // Resume waits started on an earlier page of this visit.
  pendingList().forEach(function (p) {
    if (p && typeof p.rid === 'string' && p.until > Date.now()) watch(p.rid, p.test === true, p.until, null); else if (p) forget(p.rid);
  });
})();
