'use strict';

// Google Ads offline click conversions for VPT, computed at request time (no table of its own):
//  - CALL: a call recording (any length, not explicitly outbound) matched to a website "call" click with
//    a gclid. Call time = call_started_at, else the time in the recorder file name (Samsung
//    "<number>_YYMMDD_HHMMSS", Vietnam time); a recording with neither is skipped (the app can upload
//    days after the call, so the upload time is never used). Duplicate uploads (same company +
//    file_name + file_size) count once.
//  - VALID_LEAD: a lead that reached the stage milestone (cold/warm/hot or open deal stage), with the
//    gclid of its website form, else the gclid of the call click matched to one of its recordings.
//    Website form leads from before lead_attribution existed (WordPress "VPT_V1" plugin) keep their
//    tracking only in crm_leads.description; their "gclid:" line is used when the lead has no
//    lead_attribution gclid, with the "VPT_V1 | <ISO>" submit time as click time.
// Only gclid is exported; gbraid/wbraid are counted in diagnostics. QA traffic is never exported.
const { loadMilestoneReached } = require('./stageMilestone');
const { parseRecordingFileTime } = require('../../helpers/callRecordingMeta');

const CONVERSION_NAMES = Object.freeze({
  CALL: 'VPT CRM - Cuoc goi that',
  VALID_LEAD: 'VPT CRM - Khach hop le',
});
const CLICK_BEFORE_MS = 10 * 60000;
const CLICK_AFTER_MS = 60000;
const LOOKBACK_MS = 30 * 86400000; // earlier clicks/calls may still produce a conversion inside the window
const DEFAULT_DAYS = 60;
const PAGE = 1000;
const MAX_PAGES = 50;
const GCLID = /^[A-Za-z0-9_-]{8,512}$/;
const DESCRIPTION_GCLID = /^[A-Za-z0-9_-]{20,200}$/; // stricter: read back from free text
const VPT_V1_MARKER = /(?:^|\n)(?:Ghi chú: )?VPT_V1 \| ([^\n]*)/g;
const VN_OFFSET_MS = 7 * 3600000;

async function readAll(build) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await build().range(page * PAGE, (page + 1) * PAGE - 1);
    if (error || !Array.isArray(data)) throw error || Error('SOURCE_UNAVAILABLE');
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
  throw Error('PAGE_LIMIT');
}

const text = value => (value == null ? '' : String(value).trim());
const isQaSource = row => text(row.utm_source).toLowerCase() === 'vpt_test';
const isTestGclid = gclid => gclid.toUpperCase().startsWith('VPT_TEST_');
const hasBraid = row => Boolean(text(row.gbraid) || text(row.wbraid));

// Null / empty / "unknown" mean the phone did not say; only explicit outbound values are skipped.
function inboundLike(direction) {
  const d = text(direction).toLowerCase();
  return !d || d === 'unknown' || d === 'in' || d === 'inbound' || d === 'incoming';
}

/**
 * Call start: call_started_at, else the time in the recorder file name. Null when neither is known:
 * the upload time is not used (the app may upload days after the call).
 */
function callTimeMs(rec, nowMs = Date.now()) {
  const started = Date.parse(rec.call_started_at);
  if (rec.call_started_at && Number.isFinite(started)) return { ms: started, source: 'call_started_at' };
  const fromName = parseRecordingFileTime(rec.file_name, { nowMs });
  if (fromName) return { ms: fromName.getTime(), source: 'file_name' };
  return null;
}

/**
 * Same company + file_name + file_size uploaded more than once: keep the earliest row (input is in
 * created_at order), filling its empty fields from the copies. Rows without a name or size are kept.
 */
function dedupeRecordings(rows) {
  const out = [];
  const byKey = new Map();
  let merged = 0;
  for (const row of rows) {
    const name = text(row.file_name);
    const size = Number(row.file_size);
    if (!name || !(size > 0)) { out.push(row); continue; }
    const key = `${row.company_id || ''}|${name}|${size}`;
    const kept = byKey.get(key);
    if (!kept) { const copy = { ...row }; byKey.set(key, copy); out.push(copy); continue; }
    merged++;
    for (const f of ['lead_id', 'call_started_at', 'direction', 'duration_sec']) {
      if (kept[f] == null || kept[f] === '') kept[f] = row[f];
    }
  }
  return { rows: out, merged };
}

/** "yyyy-MM-dd HH:mm:ss" in Vietnam time (UTC+7, no DST). */
function formatVietnamTime(ms) {
  return new Date(Math.floor(ms / 1000) * 1000 + VN_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Tracking written by the VPT_V1 WordPress bridge into the lead description ("VPT_V1 | <ISO>" then
 * "key: value" lines). Only lines after the last marker are read, so text the visitor typed into
 * the message (which comes before the notes) cannot supply a gclid. Null without the marker.
 */
function parseVptV1Description(description) {
  const value = description == null ? '' : String(description).replace(/\r\n?/g, '\n');
  let last = null;
  for (const m of value.matchAll(VPT_V1_MARKER)) last = m;
  if (!last) return null;
  const submitMs = Date.parse(text(last[1]));
  const fields = {};
  let test = false;
  for (const line of value.slice(last.index + last[0].length).split('\n')) {
    if (line.startsWith('TEST:')) test = true;
    const m = /^([a-z_]+): ?(.*)$/.exec(line);
    if (m && !(m[1] in fields)) fields[m[1]] = text(m[2]);
  }
  return { submit_ms: Number.isFinite(submitMs) ? submitMs : null, gclid: fields.gclid || '',
    utm_source: fields.utm_source || '', gbraid: fields.gbraid || '', wbraid: fields.wbraid || '',
    campaign_id: /^\d{1,32}$/.test(fields.campaignid || '') ? fields.campaignid : null, test };
}

const maskGclid = gclid => `…${String(gclid).slice(-6)}`;

/**
 * Greedy matching: recordings in call-time order; each takes the closest click at or before its
 * time (else the closest just after), within [t-10 min, t+1 min]. A click serves one recording.
 * `clicks` must already be filtered to usable gclid clicks.
 */
function matchCallsToClicks(recordings, clicks) {
  const sortedRecs = [...recordings].sort((a, b) => a.t - b.t || String(a.id).localeCompare(String(b.id)));
  const sortedClicks = [...clicks].sort((a, b) => a.ms - b.ms || String(a.id).localeCompare(String(b.id)));
  const used = new Set();
  const matches = new Map();
  for (const rec of sortedRecs) {
    let best = null;
    for (const click of sortedClicks) {
      if (click.ms < rec.t - CLICK_BEFORE_MS) continue;
      if (click.ms > rec.t + CLICK_AFTER_MS) break;
      if (used.has(click.id)) continue;
      if (click.ms <= rec.t) best = click; // ascending: the last one before t is the closest
      else if (!best) { best = click; break; }
      else break;
    }
    if (best) { used.add(best.id); matches.set(rec.id, best); }
  }
  return matches;
}

async function buildGoogleOfflineConversions({ db, companyId, fromMs, toMs }) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs)
    throw Object.assign(Error('INVALID_RANGE'), { code: 'INVALID_RANGE' });
  const loadFrom = new Date(fromMs - LOOKBACK_MS).toISOString();
  const inWindow = ms => ms >= fromMs && ms <= toMs;
  const d = {
    recordings_considered: 0, recordings_time_from_file_name: 0, recordings_no_call_time: 0,
    recordings_duplicates_merged: 0, recordings_skipped_outbound: 0,
    recordings_matched: 0, recordings_without_click: 0,
    call_clicks: 0, call_clicks_with_gclid: 0, call_clicks_braid_only: 0, call_clicks_no_click_id: 0,
    call_clicks_unmatched: 0, test_excluded: 0, invalid_gclid: 0,
    website_form_leads: 0, valid_leads: 0, valid_leads_with_gclid: 0, valid_leads_via_form_gclid: 0,
    valid_leads_via_call_gclid: 0, valid_leads_via_description_gclid: 0, valid_leads_without_gclid: 0,
    valid_leads_braid_only: 0, valid_leads_milestone_before_click: 0,
  };

  // 1. Website call clicks (lookback + window).
  const clickRows = await readAll(() => db.from('web_conversion_events')
    .select('id,kind,utm_source,gclid,gbraid,wbraid,campaign_id,occurred_at')
    .eq('company_id', companyId).eq('kind', 'call')
    .gte('occurred_at', new Date(fromMs - LOOKBACK_MS - CLICK_BEFORE_MS).toISOString())
    .lte('occurred_at', new Date(toMs + CLICK_AFTER_MS).toISOString())
    .order('occurred_at', { ascending: true }).order('id', { ascending: true }));
  const clicks = [];
  for (const row of clickRows) {
    const ms = Date.parse(row.occurred_at);
    if (!Number.isFinite(ms)) continue;
    const gclid = text(row.gclid);
    const counted = inWindow(ms);
    if (isQaSource(row) || (gclid && isTestGclid(gclid))) { if (counted) d.test_excluded++; continue; }
    if (counted) d.call_clicks++;
    if (!gclid) {
      if (counted) { if (hasBraid(row)) d.call_clicks_braid_only++; else d.call_clicks_no_click_id++; }
      continue;
    }
    if (!GCLID.test(gclid)) { if (counted) d.invalid_gclid++; continue; }
    if (counted) d.call_clicks_with_gclid++;
    clicks.push({ id: row.id, ms, gclid, campaign_id: row.campaign_id || null, counted });
  }

  // 2. Call recordings of the company uploaded since the lookback start (an upload is never before
  //    its call), deduplicated, with a known call time and not outbound. Duration is not a filter.
  const recRaw = await readAll(() => db.from('voice_recordings')
    .select('id,company_id,lead_id,file_name,file_size,duration_sec,direction,call_started_at,created_at')
    .eq('company_id', companyId).gte('created_at', loadFrom)
    .order('created_at', { ascending: true }).order('id', { ascending: true }));
  const { rows: recRows, merged } = dedupeRecordings(recRaw);
  d.recordings_duplicates_merged = merged;
  const nowMs = Date.now();
  const recordings = [];
  for (const row of recRows) {
    const time = callTimeMs(row, nowMs);
    if (!time) {
      if (inWindow(Date.parse(row.created_at))) d.recordings_no_call_time++; // counted by upload time
      continue;
    }
    if (time.ms < fromMs - LOOKBACK_MS || time.ms > toMs) continue;
    const counted = inWindow(time.ms);
    if (!inboundLike(row.direction)) { if (counted) d.recordings_skipped_outbound++; continue; }
    if (counted) { d.recordings_considered++; if (time.source === 'file_name') d.recordings_time_from_file_name++; }
    recordings.push({ id: row.id, lead_id: row.lead_id || null, t: time.ms, counted });
  }
  const matches = matchCallsToClicks(recordings, clicks);
  const usedClicks = new Set([...matches.values()].map(c => c.id));
  d.call_clicks_unmatched = clicks.filter(c => c.counted && !usedClicks.has(c.id)).length;

  const rows = [];
  const callClickByLead = new Map();
  for (const rec of [...recordings].sort((a, b) => a.t - b.t)) {
    const click = matches.get(rec.id);
    if (rec.counted) { if (click) d.recordings_matched++; else d.recordings_without_click++; }
    if (!click) continue;
    if (rec.lead_id && !callClickByLead.has(rec.lead_id)) callClickByLead.set(rec.lead_id, click);
    if (!rec.counted) continue;
    rows.push({ type: 'CALL', conversion_name: CONVERSION_NAMES.CALL, gclid: click.gclid,
      conversion_ms: Math.max(rec.t, click.ms + 1000), click_ms: click.ms, lead_id: rec.lead_id,
      recording_id: rec.id, campaign_id: click.campaign_id });
  }

  // 3. Website form leads (first touch since lookback).
  const touches = await readAll(() => db.from('lead_attribution')
    .select('id,lead_id,utm_source,gclid,gbraid,wbraid,campaign_id,cham_dau_luc')
    .eq('company_id', companyId).eq('kenh', 'website').not('lead_id', 'is', null)
    .gte('cham_dau_luc', loadFrom).lte('cham_dau_luc', new Date(toMs).toISOString())
    .order('cham_dau_luc', { ascending: true }).order('id', { ascending: true }));
  const formByLead = new Map();
  for (const row of touches) {
    if (formByLead.has(row.lead_id) || !Number.isFinite(Date.parse(row.cham_dau_luc))) continue;
    formByLead.set(row.lead_id, row);
  }

  // 3b. Website form leads whose tracking lives only in the description (VPT_V1 notes block).
  const descRows = await readAll(() => db.from('crm_leads')
    .select('id,is_test,description,created_at')
    .eq('company_id', companyId).ilike('description', '%VPT_V1 |%')
    .gte('created_at', loadFrom).lte('created_at', new Date(toMs).toISOString())
    .order('created_at', { ascending: true }).order('id', { ascending: true }));
  const descByLead = new Map();
  for (const row of descRows) {
    if (row.is_test === true) continue;
    const parsed = parseVptV1Description(row.description);
    if (!parsed) continue;
    const ms = parsed.submit_ms ?? Date.parse(row.created_at);
    if (!Number.isFinite(ms)) continue;
    descByLead.set(row.id, { ...parsed, click_ms: ms });
  }

  // 4. Keep only real leads of this company.
  const leadIds = [...new Set([...formByLead.keys(), ...descByLead.keys(), ...callClickByLead.keys()])];
  const real = new Set();
  for (let i = 0; i < leadIds.length; i += 100) {
    const { data, error } = await db.from('crm_leads').select('id,is_test')
      .eq('company_id', companyId).in('id', leadIds.slice(i, i + 100));
    if (error || !Array.isArray(data)) throw error || Error('SOURCE_UNAVAILABLE');
    for (const row of data) if (row.is_test !== true) real.add(row.id);
  }

  // 5. One source per lead: lead_attribution gclid first, then the description gclid (only when
  //    lead_attribution has none), then call gclid; form leads without gclid for diagnostics.
  const candidates = [];
  const sourceByLead = new Map();
  const descFormLeads = new Set(); // description-only website form leads, for website_form_leads
  for (const leadId of leadIds) {
    if (!real.has(leadId)) continue;
    const form = formByLead.get(leadId);
    const formGclid = form && !isQaSource(form) ? text(form.gclid) : '';
    let source = null; // a QA form (utm_source=vpt_test) never lends its gclid
    if (formGclid && isTestGclid(formGclid)) source = { kind: 'test' };
    else if (formGclid && GCLID.test(formGclid)) source = { kind: 'form', gclid: formGclid,
      click_ms: Date.parse(form.cham_dau_luc), campaign_id: form.campaign_id || null };
    else if (formGclid) source = { kind: 'invalid' };
    const desc = !formGclid && !(form && isQaSource(form)) ? descByLead.get(leadId) : null;
    if (desc) {
      const qa = desc.test || desc.utm_source.toLowerCase() === 'vpt_test';
      if (!form && !qa && !isTestGclid(desc.gclid)) descFormLeads.add(leadId);
      if (qa || (desc.gclid && isTestGclid(desc.gclid))) source = { kind: 'test' };
      else if (desc.gclid && DESCRIPTION_GCLID.test(desc.gclid)) source = { kind: 'description',
        gclid: desc.gclid, click_ms: desc.click_ms, campaign_id: desc.campaign_id };
      else if (desc.gclid) source = { kind: 'invalid' };
    }
    if (!source || (source.kind !== 'form' && source.kind !== 'description')) {
      const click = callClickByLead.get(leadId);
      if (click) source = { kind: 'call', gclid: click.gclid, click_ms: click.ms, campaign_id: click.campaign_id };
    }
    if (!source && form && !isQaSource(form)) source = { kind: 'none', braid: hasBraid(form) ||
      Boolean(desc && (desc.gbraid || desc.wbraid)), click_ms: Date.parse(form.cham_dau_luc) };
    if (!source && desc) source = { kind: 'none', braid: Boolean(desc.gbraid || desc.wbraid),
      click_ms: desc.click_ms };
    if (!source && form && isQaSource(form)) source = { kind: 'test' };
    if (!source) continue;
    if (source.kind === 'test') { d.test_excluded++; continue; }
    if (source.kind === 'invalid') { d.invalid_gclid++; continue; }
    sourceByLead.set(leadId, source);
    candidates.push({ lead_id: leadId, cham_dau_luc: new Date(source.click_ms).toISOString() });
  }
  for (const [leadId, form] of formByLead) {
    if (real.has(leadId) && !isQaSource(form) && !isTestGclid(text(form.gclid)) &&
      inWindow(Date.parse(form.cham_dau_luc))) d.website_form_leads++;
  }
  for (const leadId of descFormLeads) if (inWindow(descByLead.get(leadId).click_ms)) d.website_form_leads++;

  const { reachedByLead } = await loadMilestoneReached(db, candidates);
  for (const [leadId, source] of sourceByLead) {
    const reached = reachedByLead.get(leadId);
    if (!reached) continue;
    const ms = Date.parse(reached);
    if (!inWindow(ms)) continue;
    d.valid_leads++;
    if (source.kind === 'none') {
      d.valid_leads_without_gclid++;
      if (source.braid) d.valid_leads_braid_only++;
      continue;
    }
    if (!(ms > source.click_ms)) { d.valid_leads_milestone_before_click++; continue; }
    d.valid_leads_with_gclid++;
    if (source.kind === 'form') d.valid_leads_via_form_gclid++;
    else if (source.kind === 'description') d.valid_leads_via_description_gclid++;
    else d.valid_leads_via_call_gclid++;
    rows.push({ type: 'VALID_LEAD', conversion_name: CONVERSION_NAMES.VALID_LEAD, gclid: source.gclid,
      conversion_ms: ms, click_ms: source.click_ms, lead_id: leadId, recording_id: null,
      campaign_id: source.campaign_id, gclid_source: source.kind });
  }

  rows.sort((a, b) => a.conversion_ms - b.conversion_ms || a.type.localeCompare(b.type));
  return { rows, diagnostics: d };
}

const CSV_HEADER = 'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency';

/**
 * Google Ads click-conversion import file. The header is the first line: Google Data Manager reads the
 * first line as column names, so the time zone travels inside each time value instead of the legacy
 * "Parameters:TimeZone=" line. Value left blank: the conversion action's default value applies.
 */
function toGoogleCsv(rows) {
  const lines = [CSV_HEADER];
  for (const row of rows) {
    if (!GCLID.test(row.gclid)) continue; // defensive: never write anything but a plain click id
    lines.push([row.gclid, row.conversion_name, `${formatVietnamTime(row.conversion_ms)}+07:00`, '', 'VND'].join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

function previewRow(row) {
  return { type: row.type, conversion_name: row.conversion_name, gclid_tail: maskGclid(row.gclid),
    conversion_time: formatVietnamTime(row.conversion_ms), click_time: formatVietnamTime(row.click_ms),
    lead_id: row.lead_id || null, recording_id: row.recording_id || null,
    campaign_id: row.campaign_id || null, gclid_source: row.gclid_source || 'call' };
}

module.exports = { CONVERSION_NAMES, DEFAULT_DAYS, CSV_HEADER, buildGoogleOfflineConversions,
  matchCallsToClicks, toGoogleCsv, previewRow, formatVietnamTime, maskGclid, callTimeMs, inboundLike,
  parseVptV1Description, dedupeRecordings };
