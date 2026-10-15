'use strict';

// Pure local review gate. No files, environment, network or database access.
// validateCapacity(attestation, {plan, runId, site, action, now=Date.now()})
//
// One attestation authorizes one site/run/frozen plan, never both sites:
// {
//   version: 1|2, site: 'primary'|'backup', project_ref: '<fixed project>',
//   run_id: '<UUID>', manifest_sha256: '<plan.manifest_sha256>',
//   issued_at: '<UTC ISO timestamp>', expires_at: '<UTC ISO timestamp>',
//   ui: {measured_at: '<UTC ISO timestamp>', allocated_bytes: '...',
//        used_bytes: '...', free_bytes: '...', wal_included_in_used: true},
//   reserves: {wal_bytes: '...', temp_bytes: '...', safety_bytes: '...',
//              journal_bytes: '...'},
//   retained_capture_count: 2,
//   metadata_raw_bytes: '<serialized metadata UTF-8 byte count, >= frozen plan>',
//   measurements: [{table: '<exact site.tables name>', measured_at: '<UTC ISO>',
//     basis: 'postgres_to_jsonb_text_utf8', rows: '...', raw_bytes: '...',
//     max_row_bytes: '...', encoded_bytes: '...'}]
// }
// Version 1 MUST omit encoded_bytes and keeps its original strict raw-byte
// contract. Version 2 MUST supply encoded_bytes for every table, measured as:
//   SUM(octet_length(to_jsonb(to_jsonb(t)::text)::text))
// with zero for an empty table. This is the UTF-8 size of each JSON STRING,
// including its surrounding quotes, not just the original row's JSON text.
// Require raw_bytes+2*rows <= encoded_bytes <= 2*raw_bytes+2*rows. The coordinator
// must validate the actual same-snapshot encoded sizing before transfer too.
// All byte/row values are canonical unsigned decimal STRINGS, bounded to int64.
// Every base table, including empty, v1_external, site-only and no-PK tables,
// needs its own fresh serialized-JSON measurement. Physical relation size is
// never serialized proof. No raw rows, arbitrary extra fields or units accepted.
// The reviewed raw-row cap is 16 MiB, paired with the helper's 32 MiB chunk cap;
// larger rows hold. Version 1 retains its 2x escape budget; version 2 explicitly
// budgets measured escaping and may never substitute raw/physical bytes for it.
// Reserves are additional future WAL/temp/safety/journal allowance; used_bytes
// already includes current WAL. metadata_raw_bytes must include all serialized
// schema/state/storage metadata the coordinator will preserve, beyond table and
// journal row streams. It must not be only a physical size. journal_bytes is a
// FULL retained encrypted/storage allowance, not raw journal bytes. Before any
// plaintext journal transfer, the coordinator must scalar-size every committed
// v1/v2 journal stream in the capture transaction and call:
// validateJournalCapacity({rows:'...',raw_bytes:'...',max_row_bytes:'...',
//   stream_count:2}, validatedCapacityResult, {now:Date.now()}).
// Pass the original frozen process-local result, never a JSON clone. The helper
// verifies its private approval brand and expiry again before journal transfer.
// This requires (2*journal raw + 4*journal rows + 64KiB per journal stream) *
// storage factor 2 * retained capture count <= reserves.journal_bytes. Include
// empty journal streams. No event-ID cursor, pruning or history omission.
// The coordinator owns measurement truth, complete stream coverage, source/ACL
// checks and fence/CAS/release policy. A passing budget is not cutover readiness.
//
// Version 1 per capture: 2*raw table bytes + 4*table rows + 2*metadata_raw_bytes
// + 64KiB per table + 64KiB manifest/receipt allowance (unchanged).
// Version 2 per capture: encoded table bytes + 16*table rows + the same metadata
// and table/root allowances. Sixteen bytes per row conservatively cover array
// commas and JSON chunk envelopes, even when each row needs its own chunk.
// Multiply by storage factor 2 and all retained captures, then add all reserves.
// Release/abort and explicit read-only actions return capacity_not_required;
// this is never a capacity approval and intentionally ignores old attestations.

const crypto = require('node:crypto');
const PROJECTS = Object.freeze({primary:'kdxypztstbeovyedmvem',backup:'atcfpgxkgbszglrelfgr'});
const MAX_AGE_MS = 15 * 60 * 1000;
const MAX_VALUE = 9223372036854775807n;
const MAX_ROW_BYTES = 16n * 1024n * 1024n;
const TABLE_OVERHEAD = 64n * 1024n;
const CAPTURE_OVERHEAD = 64n * 1024n;
const STORAGE_FACTOR = 2n;
const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const BASIS = 'postgres_to_jsonb_text_utf8';
const REQUIRED_ACTIONS = new Set(['init','register','activate','capture']);
const NOT_REQUIRED_ACTIONS = new Set(['inspect','measure','validate','verify','release','abort','manual-abort','manual_abort']);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const approvedBudgets = new WeakMap();

function fail(code) { const e = new Error(code); e.cutoverCode = code; throw e; }
function check(ok, code) { if (!ok) fail(code); }
function record(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype,null].includes(Object.getPrototypeOf(v)); }
function fields(v, expected, code='CUTOVER_LIFECYCLE_CAPACITY_INVALID') {
  check(record(v) && Object.keys(v).length === expected.length && expected.every(k=>Object.hasOwn(v,k)),code);
}
function decimal(v, positive=false) {
  check(typeof v === 'string' && v.length <= 19 && /^(0|[1-9][0-9]*)$/.test(v),'CUTOVER_LIFECYCLE_CAPACITY_DECIMAL');
  const n = BigInt(v);
  check(n <= MAX_VALUE && (!positive || n > 0n),'CUTOVER_LIFECYCLE_CAPACITY_DECIMAL');
  return n;
}
function add(...values) {
  let n=0n;
  for(const v of values) { check(v>=0n && n<=MAX_VALUE-v,'CUTOVER_LIFECYCLE_CAPACITY_OVERFLOW'); n+=v; }
  return n;
}
function multiply(a,b) {
  check(a>=0n && b>=0n && (a===0n || b<=MAX_VALUE/a),'CUTOVER_LIFECYCLE_CAPACITY_OVERFLOW');
  return a*b;
}
function timestamp(value) {
  check(typeof value==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value),'CUTOVER_LIFECYCLE_CAPACITY_TIME');
  const n=Date.parse(value),canonical=value.length===20?value.slice(0,-1)+'.000Z':value;
  check(Number.isFinite(n) && new Date(n).toISOString()===canonical,'CUTOVER_LIFECYCLE_CAPACITY_TIME');
  return n;
}
function clock(value) {
  const n=value instanceof Date?value.getTime():(typeof value==='string'?timestamp(value):value);
  check(Number.isSafeInteger(n) && n>=0 && n<=8640000000000000,'CUTOVER_LIFECYCLE_CAPACITY_TIME');
  return n;
}
function fresh(value, now, issued, expires) {
  const n=timestamp(value);
  check(n<=now && n<=issued && now-n<=MAX_AGE_MS && expires-n<=MAX_AGE_MS,'CUTOVER_LIFECYCLE_CAPACITY_STALE');
}
function stableJSON(value) {
  let nodes=0; const ancestors=new Set();
  function encode(v,depth) {
    check(++nodes<=1000000 && depth<=64,'CUTOVER_LIFECYCLE_CAPACITY_PLAN');
    if(v===null || typeof v==='boolean' || typeof v==='string') return JSON.stringify(v);
    if(typeof v==='number') { check(Number.isFinite(v),'CUTOVER_LIFECYCLE_CAPACITY_PLAN'); return JSON.stringify(v); }
    check((record(v)||Array.isArray(v))&&!ancestors.has(v),'CUTOVER_LIFECYCLE_CAPACITY_PLAN'); ancestors.add(v);
    const encoded=Array.isArray(v)?'['+v.map(x=>encode(x,depth+1)).join(',')+']'
      :'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+encode(v[k],depth+1)).join(',')+'}';
    ancestors.delete(v);check(Buffer.byteLength(encoded)<=MAX_METADATA_BYTES,'CUTOVER_LIFECYCLE_CAPACITY_PLAN');return encoded;
  }
  return encode(value,0);
}
function binding(plan,runId,site) {
  check(typeof site==='string' && Object.hasOwn(PROJECTS,site) && typeof runId==='string' && UUID.test(runId),'CUTOVER_LIFECYCLE_CAPACITY_BINDING');
  check(record(plan) && record(plan.descriptor) && SHA.test(plan.manifest_sha256||''),'CUTOVER_LIFECYCLE_CAPACITY_PLAN');
  const encoded=stableJSON(plan.descriptor);
  check(crypto.createHash('sha256').update(encoded).digest('hex')===plan.manifest_sha256 && plan.descriptor.operation==='current_state_cutover_v2','CUTOVER_LIFECYCLE_CAPACITY_PLAN');
  for(const which of Object.keys(PROJECTS)) {
    const candidate=plan.descriptor.sites?.[which];
    check(record(candidate) && candidate.site===which && candidate.project_ref===PROJECTS[which] && Array.isArray(candidate.held) && candidate.held.length===0,'CUTOVER_LIFECYCLE_CAPACITY_PLAN');
  }
  const s=plan.descriptor.sites?.[site];
  check(record(s) && s.site===site && s.project_ref===PROJECTS[site] && Array.isArray(s.held) && s.held.length===0
    && Array.isArray(s.tables) && s.tables.length>0 && s.tables.length<=10000,'CUTOVER_LIFECYCLE_CAPACITY_PLAN');
  const names=s.tables.map(t=>t?.name);
  check(names.every(n=>typeof n==='string' && n.length>0 && !n.includes('\0') && Buffer.byteLength(n)<=63) && new Set(names).size===names.length,'CUTOVER_LIFECYCLE_CAPACITY_PLAN');
  return {names,metadataBytes:BigInt(Buffer.byteLength(encoded))};
}

function validateCapacity(attestation,options={}) {
  check(record(options),'CUTOVER_LIFECYCLE_CAPACITY_INVALID');
  const {plan,runId,site,action}=options;
  check(typeof action==='string' && (REQUIRED_ACTIONS.has(action)||NOT_REQUIRED_ACTIONS.has(action)),'CUTOVER_LIFECYCLE_CAPACITY_ACTION');
  if(NOT_REQUIRED_ACTIONS.has(action)) return Object.freeze({status:'capacity_not_required',capacity_required:false,capacity_approved:false,action,cutover_ready:false});
  const {names,metadataBytes}=binding(plan,runId,site),now=clock(options.now??Date.now());
  check(attestation!=null,'CUTOVER_LIFECYCLE_CAPACITY_REQUIRED');
  fields(attestation,['version','site','project_ref','run_id','manifest_sha256','issued_at','expires_at','ui','reserves','retained_capture_count','metadata_raw_bytes','measurements']);
  const a=attestation;
  check([1,2].includes(a.version) && a.site===site && a.project_ref===PROJECTS[site] && UUID.test(a.run_id||'') && a.run_id.toLowerCase()===runId.toLowerCase()
    && a.manifest_sha256===plan.manifest_sha256,'CUTOVER_LIFECYCLE_CAPACITY_BINDING');
  const issued=timestamp(a.issued_at),expires=timestamp(a.expires_at);
  check(issued<=now && now-issued<=MAX_AGE_MS,'CUTOVER_LIFECYCLE_CAPACITY_STALE');
  check(expires>now && expires>issued && expires-issued<=MAX_AGE_MS,'CUTOVER_LIFECYCLE_CAPACITY_EXPIRED');
  fields(a.ui,['measured_at','allocated_bytes','used_bytes','free_bytes','wal_included_in_used']);fresh(a.ui.measured_at,now,issued,expires);
  const allocated=decimal(a.ui.allocated_bytes,true),used=decimal(a.ui.used_bytes),free=decimal(a.ui.free_bytes);
  check(a.ui.wal_included_in_used===true && used<=allocated && free<=allocated-used,'CUTOVER_LIFECYCLE_CAPACITY_UI');
  fields(a.reserves,['wal_bytes','temp_bytes','safety_bytes','journal_bytes']);
  const reserves=add(...Object.values(a.reserves).map(v=>decimal(v,true)));
  check(Number.isSafeInteger(a.retained_capture_count) && a.retained_capture_count>=2,'CUTOVER_LIFECYCLE_CAPACITY_RETENTION');
  const captures=BigInt(a.retained_capture_count),metadata=decimal(a.metadata_raw_bytes);
  check(metadata>=metadataBytes,'CUTOVER_LIFECYCLE_CAPACITY_METADATA');
  check(Array.isArray(a.measurements) && a.measurements.length===names.length,'CUTOVER_LIFECYCLE_CAPACITY_COVERAGE');
  const expected=new Set(names),seen=new Set();let rows=0n,raw=0n,encoded=0n;
  for(const m of a.measurements) {
    fields(m,['table','measured_at','basis','rows','raw_bytes','max_row_bytes',...(a.version===2?['encoded_bytes']:[])]);
    check(expected.has(m.table) && !seen.has(m.table),'CUTOVER_LIFECYCLE_CAPACITY_COVERAGE');seen.add(m.table);
    check(m.basis===BASIS,'CUTOVER_LIFECYCLE_CAPACITY_SERIALIZED_PROOF');fresh(m.measured_at,now,issued,expires);
    const r=decimal(m.rows),b=decimal(m.raw_bytes),max=decimal(m.max_row_bytes);
    check(max<=MAX_ROW_BYTES,'CUTOVER_LIFECYCLE_CAPACITY_ROW_TOO_LARGE');
    check(r===0n?(b===0n&&max===0n):(max>=2n&&b>=add(max,multiply(r-1n,2n))&&b<=multiply(r,max)),'CUTOVER_LIFECYCLE_CAPACITY_MEASUREMENT');
    if(a.version===2) {
      const e=decimal(m.encoded_bytes),quotes=multiply(r,2n);
      check(e>=add(b,quotes) && e<=add(multiply(b,2n),quotes),'CUTOVER_LIFECYCLE_CAPACITY_ENCODING');
      encoded=add(encoded,e);
    }
    rows=add(rows,r);raw=add(raw,b);
  }
  const rowEnvelope=a.version===2?add(encoded,multiply(rows,16n)):add(multiply(raw,2n),multiply(rows,4n));
  const perCapture=add(rowEnvelope,multiply(metadata,2n),multiply(BigInt(names.length),TABLE_OVERHEAD),CAPTURE_OVERHEAD);
  const artifactBytes=multiply(multiply(perCapture,STORAGE_FACTOR),captures),required=add(artifactBytes,reserves);
  check(free>=required,'CUTOVER_LIFECYCLE_CAPACITY_INSUFFICIENT');
  const result=Object.freeze({status:'capacity_validated',capacity_required:true,capacity_approved:true,action,site,project_ref:PROJECTS[site],run_id:runId.toLowerCase(),manifest_sha256:plan.manifest_sha256,
    attestation_version:a.version,encoding_contract:a.version===2?'postgres_json_string_utf8_v2':'conservative_raw_json_v1',...(a.version===2?{encoded_bytes:encoded.toString()}:{}),
    issued_at:a.issued_at,expires_at:a.expires_at,table_count:names.length,rows:rows.toString(),raw_bytes:raw.toString(),metadata_raw_bytes:metadata.toString(),
    per_capture_envelope_bytes:perCapture.toString(),storage_factor:STORAGE_FACTOR.toString(),retained_capture_count:captures.toString(),artifact_budget_bytes:artifactBytes.toString(),
    reserve_bytes:reserves.toString(),journal_reserve_bytes:a.reserves.journal_bytes,required_free_bytes:required.toString(),observed_free_bytes:free.toString(),remaining_free_bytes:(free-required).toString(),cutover_ready:false});
  approvedBudgets.set(result,{issued,expires,captures,factor:STORAGE_FACTOR,reserve:decimal(a.reserves.journal_bytes,true),version:a.version});
  return result;
}

function validateJournalCapacity(measurement,capacity,options={}) {
  check(record(options),'CUTOVER_LIFECYCLE_CAPACITY_INVALID');
  const approved=record(capacity)?approvedBudgets.get(capacity):undefined;
  check(approved,'CUTOVER_LIFECYCLE_CAPACITY_REQUIRED');
  const now=clock(options.now??Date.now());
  check(approved.issued<=now && now-approved.issued<=MAX_AGE_MS,'CUTOVER_LIFECYCLE_CAPACITY_STALE');
  check(now<approved.expires,'CUTOVER_LIFECYCLE_CAPACITY_EXPIRED');
  fields(measurement,['rows','raw_bytes','max_row_bytes','stream_count']);
  const rows=decimal(measurement.rows),raw=decimal(measurement.raw_bytes),max=decimal(measurement.max_row_bytes);
  check(Number.isSafeInteger(measurement.stream_count) && measurement.stream_count>0 && measurement.stream_count<=1000,'CUTOVER_LIFECYCLE_CAPACITY_JOURNAL');
  check(max<=MAX_ROW_BYTES,'CUTOVER_LIFECYCLE_CAPACITY_ROW_TOO_LARGE');
  check(rows===0n?(raw===0n&&max===0n):(max>=2n&&raw>=add(max,multiply(rows-1n,2n))&&raw<=multiply(rows,max)),'CUTOVER_LIFECYCLE_CAPACITY_MEASUREMENT');
  const {captures,factor,reserve}=approved;
  const envelope=add(multiply(raw,2n),multiply(rows,4n),multiply(BigInt(measurement.stream_count),TABLE_OVERHEAD));
  const required=multiply(multiply(envelope,factor),captures);
  check(required<=reserve,'CUTOVER_LIFECYCLE_CAPACITY_JOURNAL_INSUFFICIENT');
  return {status:'journal_capacity_validated',rows:rows.toString(),raw_bytes:raw.toString(),stream_count:measurement.stream_count,
    per_capture_envelope_bytes:envelope.toString(),required_journal_bytes:required.toString(),journal_reserve_bytes:reserve.toString(),remaining_journal_bytes:(reserve-required).toString(),cutover_ready:false};
}

function safeCode(e) { return /^CUTOVER_LIFECYCLE_[A-Z_]+$/.test(e?.cutoverCode||'')?e.cutoverCode:'CUTOVER_LIFECYCLE_CAPACITY_FAILED'; }
module.exports={validateCapacity,validateJournalCapacity,safeCode,MAX_AGE_MS,MAX_ROW_BYTES:MAX_ROW_BYTES.toString()};
