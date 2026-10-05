(function () {
  'use strict';
  var keys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','gbraid','wbraid','campaignid','adgroupid','keyword','matchtype','device'];
  var storageKey = 'vpt_v1_attribution_session';
  var ttl = 30 * 60 * 1000;
  var now = Date.now();
  var query = new URLSearchParams(window.location.search);
  var data = {}, prior = null, hasCampaign = false;
  keys.forEach(function (key) {
    var value = query.get(key);
    if (value) { data[key] = value.replace(/[\x00-\x1f\x7f]/g, '').slice(0,500); hasCampaign = true; }
  });
  try { prior = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch (_) {}
  if (!hasCampaign && prior && prior.expires > now && prior.fields && typeof prior.fields === 'object') {
    keys.forEach(function (key) { if (typeof prior.fields[key] === 'string') data[key] = prior.fields[key].slice(0,500); });
  }
  // A new campaign replaces the entire bundle: never join an old click ID to new UTMs.
  if (Object.keys(data).length) {
    try { sessionStorage.setItem(storageKey, JSON.stringify({expires: hasCampaign ? now + ttl : prior.expires, fields:data})); } catch (_) {}
  } else { try { sessionStorage.removeItem(storageKey); } catch (_) {} }
  function populate() {
    document.querySelectorAll('form.wpcf7-form').forEach(function (form) {
      var marker = form.querySelector('[name="vpt_form"]');
      if (!marker || marker.value !== 'VPT_V1') return;
      keys.forEach(function (key) { var field = form.querySelector('[name="'+key+'"]'); if (field) field.value = data[key] || ''; });
      form.setAttribute('data-vpt-attribution', Object.keys(data).length ? 'ready' : 'direct');
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
    var dedupe = 'vpt_v1_event_' + receipt.request_id;
    try { if (sessionStorage.getItem(dedupe)) return; sessionStorage.setItem(dedupe,'1'); } catch (_) {}
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({event:isTest ? 'vpt_v1_test_request' : 'vpt_v1_lead_request',vpt_form_id:11116,transaction_id:receipt.request_id});
    var conversion = {send_to:isTest ? 'AW-460207797/qwtDCI-6q4IdELXtuNsB' : 'AW-460207797/fC1UCJTQnYIdELXtuNsB',value:0,currency:'VND',transaction_id:receipt.request_id};
    if (typeof window.gtag === 'function') {
      window.gtag('event','conversion',conversion);
    } else {
      // Queue using the standard Google tag arguments format; reuse the site's tag.
      (function () { window.dataLayer.push(arguments); })('event','conversion',conversion);
    }
    node.setAttribute('data-vpt-measurement',isTest ? 'test_request' : 'lead_request');
    node.setAttribute('data-vpt-ads-dispatch','queued');
  });
})();
