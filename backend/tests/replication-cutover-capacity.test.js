'use strict';

// Synthetic arithmetic/validation only. No application startup, env or database.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {validateCapacity,validateJournalCapacity,safeCode,MAX_ROW_BYTES}=require('../scripts/replication-cutover-capacity-20261015');
const NOW=Date.parse('2026-10-15T06:00:00.000Z');
const RUN='11111111-1111-4111-8111-111111111111';
const OTHER_RUN='22222222-2222-4222-8222-222222222222';
const PROJECTS={primary:'kdxypztstbeovyedmvem',backup:'atcfpgxkgbszglrelfgr'};
const iso=ms=>new Date(ms).toISOString();
const clone=v=>JSON.parse(JSON.stringify(v));
function canonical(v) { return JSON.stringify(v,(_key,value)=>value && !Array.isArray(value) && typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)):value); }
function rehash(plan) { plan.manifest_sha256=crypto.createHash('sha256').update(canonical(plan.descriptor)).digest('hex');return plan; }
function fixture(site='primary') {
  const table=(name,mode='pk_digest')=>({name,mode,kind:'r',persistence:'p'});
  const tables=[table('crm_leads','v1_external'),table('users','v1_external'),table('plain_rows','row_multiset'),table('empty_rows'),table('primary_only')];
  const backupTables=[...tables.slice(0,-1),table('backup_only')];
  const descriptor={operation:'current_state_cutover_v2',flags:{light:true,skip:['user_last_activity'],storage_enabled:false},sites:{
    primary:{site:'primary',project_ref:PROJECTS.primary,tables,held:[],derived:[{name:'read_only_view'}],excluded:['user_last_activity']},
    backup:{site:'backup',project_ref:PROJECTS.backup,tables:backupTables,held:[],derived:[],excluded:['user_last_activity']}}};
  const plan=rehash({descriptor});
  const counts=[['2','80','50'],['1','60','60'],['2','4','2'],['0','0','0'],['1','20','20']];
  const attestation={version:1,site,project_ref:PROJECTS[site],run_id:RUN,manifest_sha256:plan.manifest_sha256,
    issued_at:iso(NOW-30000),expires_at:iso(NOW+300000),ui:{measured_at:iso(NOW-45000),allocated_bytes:'4294967296',used_bytes:'1073741824',free_bytes:'3221225472',wal_included_in_used:true},
    reserves:{wal_bytes:'1048576',temp_bytes:'1048576',safety_bytes:'1048576',journal_bytes:'1048576'},retained_capture_count:2,
    metadata_raw_bytes:String(Buffer.byteLength(canonical(descriptor))+1600),measurements:descriptor.sites[site].tables.map((t,i)=>({table:t.name,measured_at:iso(NOW-45000),basis:'postgres_to_jsonb_text_utf8',rows:counts[i][0],raw_bytes:counts[i][1],max_row_bytes:counts[i][2]}))};
  return {attestation,options:{plan,runId:RUN,site,action:'capture',now:NOW}};
}
function reject(change,code='CUTOVER_LIFECYCLE_CAPACITY_INVALID') {
  const f=fixture();change(f);
  assert.throws(()=>validateCapacity(f.attestation,f.options),e=>e.cutoverCode===code && e.message===code);
}
function encodedFixture(site='primary') {
  const f=fixture(site);f.attestation.version=2;
  const sizes=['100','74','8','0','26'];f.attestation.measurements.forEach((m,i)=>{m.encoded_bytes=sizes[i];});return f;
}
function freeze(v) { if(v && typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v; }

test('complete per-site serialized proof produces a conservative exact-decimal budget without mutation',()=>{
  const {attestation,options}=fixture(),before=clone({attestation,options});freeze(attestation);freeze(options);
  const r=validateCapacity(attestation,options);
  assert.equal(r.capacity_approved,true);assert.equal(r.cutover_ready,false);assert.equal(r.table_count,5);assert.equal(r.rows,'6');assert.equal(r.raw_bytes,'164');
  const envelope=2n*164n+4n*6n+2n*BigInt(attestation.metadata_raw_bytes)+6n*65536n;
  assert.equal(r.per_capture_envelope_bytes,envelope.toString());assert.equal(r.artifact_budget_bytes,(envelope*2n*2n).toString());
  assert.equal(r.required_free_bytes,(envelope*4n+4n*1048576n).toString());
  assert.equal(BigInt(r.remaining_free_bytes)+BigInt(r.required_free_bytes),BigInt(r.observed_free_bytes));
  assert.deepEqual({attestation,options},before);assert.equal(Object.hasOwn(r,'measurements'),false);assert.equal(Object.hasOwn(r,'ui'),false);
});

test('one-byte budget boundary passes at equality and holds one byte below',()=>{
  const f=fixture(),required=validateCapacity(f.attestation,f.options).required_free_bytes;
  Object.assign(f.attestation.ui,{allocated_bytes:required,used_bytes:'0',free_bytes:required});assert.equal(validateCapacity(f.attestation,f.options).remaining_free_bytes,'0');
  f.attestation.ui.free_bytes=(BigInt(required)-1n).toString();assert.throws(()=>validateCapacity(f.attestation,f.options),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_INSUFFICIENT');
});

test('backup requires its own complete target-only table proof and cannot use primary evidence',()=>{
  const f=fixture('backup');assert.equal(validateCapacity(f.attestation,f.options).project_ref,PROJECTS.backup);
  f.attestation.measurements.at(-1).table='primary_only';assert.throws(()=>validateCapacity(f.attestation,f.options),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_COVERAGE');
  reject(f=>{f.options.site='backup';},'CUTOVER_LIFECYCLE_CAPACITY_BINDING');
});

test('missing, duplicate, unknown and case-changed tables cannot disguise uncovered measurements',()=>{
  for(const change of [a=>a.measurements.pop(),a=>{a.measurements[0]=clone(a.measurements[1]);},a=>{a.measurements[0].table='not_reviewed';},a=>{a.measurements[0].table='CRM_LEADS';}])
    reject(f=>change(f.attestation),'CUTOVER_LIFECYCLE_CAPACITY_COVERAGE');
});

test('fixed project/run/site/manifest and the actual plan descriptor are bound',()=>{
  for(const field of ['project_ref','run_id','site','manifest_sha256'])reject(f=>{f.attestation[field]={project_ref:PROJECTS.backup,run_id:OTHER_RUN,site:'backup',manifest_sha256:'f'.repeat(64)}[field];},'CUTOVER_LIFECYCLE_CAPACITY_BINDING');
  reject(f=>{f.options.plan.descriptor.sites.primary.tables[0].name='changed';},'CUTOVER_LIFECYCLE_CAPACITY_PLAN');
  reject(f=>{f.options.runId='not-a-uuid';},'CUTOVER_LIFECYCLE_CAPACITY_BINDING');
  reject(f=>{f.options.site='other';},'CUTOVER_LIFECYCLE_CAPACITY_BINDING');
  reject(f=>{f.options.plan.descriptor.sites.backup.project_ref='other-project';rehash(f.options.plan);f.attestation.manifest_sha256=f.options.plan.manifest_sha256;},'CUTOVER_LIFECYCLE_CAPACITY_PLAN');
});

test('held or duplicate-base plans are not accepted as complete scope',()=>{
  for(const mutate of [p=>p.descriptor.sites.primary.held.push({name:'uncovered'}),p=>p.descriptor.sites.backup.held.push({name:'uncovered'}),p=>{p.descriptor.sites.primary.tables[0].name='users';}])
    reject(f=>{mutate(f.options.plan);rehash(f.options.plan);f.attestation.manifest_sha256=f.options.plan.manifest_sha256;},'CUTOVER_LIFECYCLE_CAPACITY_PLAN');
});

test('physical relation sizes and raw payload fields cannot substitute for serialized proof',()=>{
  reject(f=>{f.attestation.measurements[0].basis='pg_total_relation_size';},'CUTOVER_LIFECYCLE_CAPACITY_SERIALIZED_PROOF');
  reject(f=>{f.attestation.measurements[0].relation_bytes='9999999';});
  reject(f=>{f.attestation.measurements[0].raw_rows=['private-contact@example.invalid'];});
  reject(f=>{f.attestation.raw_payload='private-contact@example.invalid';});
});

test('all numeric measurements use bounded canonical decimal strings, never implicit Number conversion',()=>{
  for(const value of [1,Number.MAX_SAFE_INTEGER+1,1n,' 1','1 ','+1','-1','01','1.0','1e6','0x10','Infinity','', '9'.repeat(100),'9223372036854775808'])
    reject(f=>{f.attestation.measurements[0].raw_bytes=value;},'CUTOVER_LIFECYCLE_CAPACITY_DECIMAL');
});

test('WAL-inclusive UI capacity is mandatory and cannot overstate free or allocated space',()=>{
  for(const value of [false,'true',1,null])reject(f=>{f.attestation.ui.wal_included_in_used=value;},'CUTOVER_LIFECYCLE_CAPACITY_UI');
  reject(f=>{f.attestation.ui.used_bytes='4294967297';},'CUTOVER_LIFECYCLE_CAPACITY_UI');
  reject(f=>{f.attestation.ui.free_bytes='3221225473';},'CUTOVER_LIFECYCLE_CAPACITY_UI');
  reject(f=>{f.attestation.ui.allocated_bytes='8 GB';},'CUTOVER_LIFECYCLE_CAPACITY_DECIMAL');
  const f=fixture();f.attestation.ui.free_bytes='2147483648';assert.equal(validateCapacity(f.attestation,f.options).capacity_approved,true);
});

test('every reserve must be present and strictly positive; reserve sums cannot overflow',()=>{
  for(const key of ['wal_bytes','temp_bytes','safety_bytes','journal_bytes']) {
    reject(f=>{f.attestation.reserves[key]='0';},'CUTOVER_LIFECYCLE_CAPACITY_DECIMAL');
    reject(f=>{delete f.attestation.reserves[key];});
  }
  reject(f=>{Object.keys(f.attestation.reserves).forEach(k=>{f.attestation.reserves[k]='9223372036854775807';});},'CUTOVER_LIFECYCLE_CAPACITY_OVERFLOW');
});

test('retention includes at least two complete captures and is included in the storage budget',()=>{
  for(const count of [0,1,2.5,'2',Number.MAX_SAFE_INTEGER+1])reject(f=>{f.attestation.retained_capture_count=count;},'CUTOVER_LIFECYCLE_CAPACITY_RETENTION');
  const f=fixture(),two=validateCapacity(f.attestation,f.options);f.attestation.retained_capture_count=3;const three=validateCapacity(f.attestation,f.options);
  assert.equal(BigInt(three.artifact_budget_bytes)*2n,BigInt(two.artifact_budget_bytes)*3n);
  f.attestation.ui.free_bytes=two.required_free_bytes;assert.throws(()=>validateCapacity(f.attestation,f.options),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_INSUFFICIENT');
  reject(f=>{f.attestation.retained_capture_count=Number.MAX_SAFE_INTEGER;},'CUTOVER_LIFECYCLE_CAPACITY_OVERFLOW');
});

test('empty tables still consume artifact overhead and impossible row/byte measurements are held',()=>{
  const f=fixture();for(const m of f.attestation.measurements)Object.assign(m,{rows:'0',raw_bytes:'0',max_row_bytes:'0'});
  const r=validateCapacity(f.attestation,f.options);assert.equal(r.rows,'0');assert.ok(BigInt(r.per_capture_envelope_bytes)>=6n*65536n);
  for(const values of [{rows:'0',raw_bytes:'1',max_row_bytes:'1'},{rows:'1',raw_bytes:'0',max_row_bytes:'0'},{rows:'2',raw_bytes:'4',max_row_bytes:'5'},{rows:'2',raw_bytes:'11',max_row_bytes:'5'},{rows:'2',raw_bytes:'3',max_row_bytes:'2'},{rows:'2',raw_bytes:'50',max_row_bytes:'50'}])
    reject(f=>Object.assign(f.attestation.measurements[0],values),'CUTOVER_LIFECYCLE_CAPACITY_MEASUREMENT');
});

test('16 MiB maximum serialized row passes exactly; one additional byte remains unsupported',()=>{
  assert.equal(MAX_ROW_BYTES,'16777216');
  const f=fixture();Object.assign(f.attestation.measurements[0],{rows:'1',raw_bytes:'16777216',max_row_bytes:'16777216'});assert.equal(validateCapacity(f.attestation,f.options).capacity_approved,true);
  reject(f=>Object.assign(f.attestation.measurements[0],{rows:'1',raw_bytes:'16777217',max_row_bytes:'16777217'}),'CUTOVER_LIFECYCLE_CAPACITY_ROW_TOO_LARGE');
});

test('observed 12547819-byte row size is accepted while retaining the complete 2x escape and storage budget',()=>{
  const f=fixture(),small=validateCapacity(f.attestation,f.options);
  Object.assign(f.attestation.measurements[0],{rows:'1',raw_bytes:'12547819',max_row_bytes:'12547819'});
  const large=validateCapacity(f.attestation,f.options);
  const envelopeDelta=2n*(12547819n-80n)+4n*(1n-2n);
  assert.equal(BigInt(large.per_capture_envelope_bytes)-BigInt(small.per_capture_envelope_bytes),envelopeDelta);
  assert.equal(BigInt(large.artifact_budget_bytes)-BigInt(small.artifact_budget_bytes),envelopeDelta*2n*2n);
  assert.equal(large.capacity_approved,true);assert.equal(large.cutover_ready,false);
});

test('fresh attestation wrappers cannot hide stale/future UI or table measurements',()=>{
  reject(f=>{f.attestation.issued_at=iso(NOW-900001);},'CUTOVER_LIFECYCLE_CAPACITY_STALE');
  reject(f=>{f.attestation.issued_at=iso(NOW+1);},'CUTOVER_LIFECYCLE_CAPACITY_STALE');
  for(const stamp of [iso(NOW-900001),iso(NOW+1),iso(NOW-1000)]) {
    reject(f=>{f.attestation.ui.measured_at=stamp;},'CUTOVER_LIFECYCLE_CAPACITY_STALE');
    reject(f=>{f.attestation.measurements[0].measured_at=stamp;},'CUTOVER_LIFECYCLE_CAPACITY_STALE');
  }
  reject(f=>{f.attestation.measurements[0].measured_at=iso(NOW-700000);},'CUTOVER_LIFECYCLE_CAPACITY_STALE');
});

test('explicit expiry and canonical UTC timestamps have strict temporal boundaries',()=>{
  for(const expires of [iso(NOW),iso(NOW-1),iso(NOW+900001)])reject(f=>{f.attestation.expires_at=expires;},'CUTOVER_LIFECYCLE_CAPACITY_EXPIRED');
  for(const stamp of ['2026-02-30T00:00:00Z','2026-10-15T13:00:00+07:00','2026-10-15','private fixture'])reject(f=>{f.attestation.issued_at=stamp;},'CUTOVER_LIFECYCLE_CAPACITY_TIME');
  const f=fixture();f.attestation.issued_at=iso(NOW);f.attestation.expires_at=iso(NOW+900000);f.attestation.ui.measured_at=iso(NOW);for(const m of f.attestation.measurements)m.measured_at=iso(NOW);
  assert.equal(validateCapacity(f.attestation,f.options).capacity_approved,true);
});

test('metadata bound counts UTF-8 and escaping and cannot be replaced by physical-size estimates',()=>{
  const f=fixture(),name='tên_"\\_😀';f.options.plan.descriptor.sites.primary.tables[0].name=name;rehash(f.options.plan);f.attestation.manifest_sha256=f.options.plan.manifest_sha256;f.attestation.measurements[0].table=name;
  const bytes=Buffer.byteLength(canonical(f.options.plan.descriptor));f.attestation.metadata_raw_bytes=String(bytes);assert.equal(validateCapacity(f.attestation,f.options).capacity_approved,true);
  f.attestation.metadata_raw_bytes=String(bytes-1);assert.throws(()=>validateCapacity(f.attestation,f.options),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_METADATA');
});

test('release/abort/read-only actions never require capacity or turn a bypass into approval',()=>{
  for(const action of ['inspect','measure','validate','verify','release','abort','manual-abort','manual_abort'])for(const attestation of [undefined,{issued_at:'expired',raw_payload:'do not echo'}])
    assert.deepEqual(validateCapacity(attestation,{action}),{status:'capacity_not_required',capacity_required:false,capacity_approved:false,action,cutover_ready:false});
  for(const action of ['init','register','activate','capture']) { const f=fixture();f.options.action=action;assert.equal(validateCapacity(f.attestation,f.options).capacity_approved,true);assert.throws(()=>validateCapacity(undefined,f.options),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_REQUIRED'); }
  for(const action of [undefined,'','releas','CAPTURE','drop'])assert.throws(()=>validateCapacity(undefined,{action}),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_ACTION');
});

test('malformed options and cyclic/non-JSON plans throw sanitized lifecycle errors',()=>{
  assert.throws(()=>validateCapacity({},null),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_INVALID');
  reject(f=>{f.options.now=NaN;},'CUTOVER_LIFECYCLE_CAPACITY_TIME');
  reject(f=>{f.options.plan.descriptor.cycle=f.options.plan.descriptor;},'CUTOVER_LIFECYCLE_CAPACITY_PLAN');
  reject(f=>{f.options.plan.descriptor.invalid=undefined;},'CUTOVER_LIFECYCLE_CAPACITY_PLAN');
  assert.equal(safeCode(Error('postgresql://private-password')),'CUTOVER_LIFECYCLE_CAPACITY_FAILED');
  assert.equal(safeCode({cutoverCode:'CUTOVER_LIFECYCLE_CAPACITY_REQUIRED'}),'CUTOVER_LIFECYCLE_CAPACITY_REQUIRED');
});

test('full committed journals have their own retained ciphertext/storage allowance including empty streams',()=>{
  const f=fixture(),capacity=validateCapacity(f.attestation,f.options),measurement={rows:'0',raw_bytes:'0',max_row_bytes:'0',stream_count:2};
  const empty=validateJournalCapacity(measurement,capacity,{now:NOW});assert.equal(empty.required_journal_bytes,(2n*65536n*2n*2n).toString());
  const populated={rows:'2',raw_bytes:'100',max_row_bytes:'60',stream_count:2},r=validateJournalCapacity(populated,capacity,{now:NOW});
  assert.equal(r.required_journal_bytes,((200n+8n+2n*65536n)*2n*2n).toString());assert.equal(r.cutover_ready,false);
  f.attestation.reserves.journal_bytes=r.required_journal_bytes;
  assert.equal(validateJournalCapacity(populated,validateCapacity(f.attestation,f.options),{now:NOW}).remaining_journal_bytes,'0');
  f.attestation.reserves.journal_bytes=(BigInt(r.required_journal_bytes)-1n).toString();
  assert.throws(()=>validateJournalCapacity(populated,validateCapacity(f.attestation,f.options),{now:NOW}),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_JOURNAL_INSUFFICIENT');
});

test('journal proof cannot reuse read-only bypass, malformed scalars, overflow or a widened storage factor',()=>{
  const f=fixture(),capacity=validateCapacity(f.attestation,f.options),measurement={rows:'1',raw_bytes:'60',max_row_bytes:'60',stream_count:2};
  assert.throws(()=>validateJournalCapacity(measurement,validateCapacity(undefined,{action:'release'}),{now:NOW}),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_REQUIRED');
  for(const bad of [0,1.5,1001,'2'])assert.throws(()=>validateJournalCapacity({...measurement,stream_count:bad},capacity,{now:NOW}),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_JOURNAL');
  assert.throws(()=>validateJournalCapacity({...measurement,raw_bytes:60},capacity,{now:NOW}),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_DECIMAL');
  assert.throws(()=>validateJournalCapacity({...measurement,max_row_bytes:'16777217'},capacity,{now:NOW}),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_ROW_TOO_LARGE');
  assert.throws(()=>validateJournalCapacity({...measurement,rows:'4611686018427387904',raw_bytes:'9223372036854775807',max_row_bytes:'16777216'},capacity,{now:NOW}),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_OVERFLOW');
});

test('journal row sizing shares the 16 MiB bound and preserves retained encrypted storage allowance',()=>{
  const f=fixture();f.attestation.reserves.journal_bytes='268435456';const capacity=validateCapacity(f.attestation,f.options);
  for(const size of ['12547819','16777216']) {
    const r=validateJournalCapacity({rows:'1',raw_bytes:size,max_row_bytes:size,stream_count:2},capacity,{now:NOW});
    assert.equal(r.required_journal_bytes,((2n*BigInt(size)+4n+2n*65536n)*2n*2n).toString());
  }
  assert.throws(()=>validateJournalCapacity({rows:'1',raw_bytes:'16777217',max_row_bytes:'16777217',stream_count:2},capacity,{now:NOW}),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_ROW_TOO_LARGE');
});

test('journal allowance requires the original frozen unexpired approval and cannot be inflated or cloned',()=>{
  const f=fixture(),capacity=validateCapacity(f.attestation,f.options),m={rows:'1',raw_bytes:'60',max_row_bytes:'60',stream_count:2};
  assert.equal(Object.isFrozen(capacity),true);
  assert.throws(()=>{capacity.journal_reserve_bytes='9223372036854775807';},TypeError);
  for(const fake of [clone(capacity),{...capacity,journal_reserve_bytes:'9223372036854775807'},{...capacity,storage_factor:'1'}])
    assert.throws(()=>validateJournalCapacity(m,fake,{now:NOW}),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_REQUIRED');
  assert.throws(()=>validateJournalCapacity(m,capacity,{now:NOW+300000}),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_EXPIRED');
  assert.throws(()=>validateJournalCapacity(m,capacity,{now:NOW+900001}),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_STALE');
});

test('version 1 retains strict raw fields and its original budget while version 2 identifies measured encoding',()=>{
  const legacy=fixture(),v1=validateCapacity(legacy.attestation,legacy.options);
  assert.equal(v1.attestation_version,1);assert.equal(v1.encoding_contract,'conservative_raw_json_v1');assert.equal(Object.hasOwn(v1,'encoded_bytes'),false);
  const f=encodedFixture(),v2=validateCapacity(f.attestation,f.options);
  assert.equal(v2.attestation_version,2);assert.equal(v2.encoding_contract,'postgres_json_string_utf8_v2');assert.equal(v2.encoded_bytes,'208');
  const envelope=208n+16n*6n+2n*BigInt(f.attestation.metadata_raw_bytes)+6n*65536n;
  assert.equal(v2.per_capture_envelope_bytes,envelope.toString());assert.equal(v2.artifact_budget_bytes,(envelope*2n*2n).toString());
  assert.equal(v2.required_free_bytes,(envelope*4n+4n*1048576n).toString());assert.equal(v2.cutover_ready,false);
  legacy.attestation.measurements[0].encoded_bytes='100';assert.throws(()=>validateCapacity(legacy.attestation,legacy.options),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_INVALID');
});

test('given primary raw/encoded byte totals fit the exact v2 formula with synthetic row counts and unchanged retention/storage',()=>{
  const f=encodedFixture();for(const m of f.attestation.measurements)Object.assign(m,{rows:'0',raw_bytes:'0',max_row_bytes:'0',encoded_bytes:'0'});
  // Only these byte totals are observed; the one-million row distribution is a
  // synthetic aggregate fixture, not a statement about production row counts.
  Object.assign(f.attestation.measurements[0],{rows:'1000000',raw_bytes:'1046143579',max_row_bytes:'12547819',encoded_bytes:'1110709859'});
  Object.assign(f.attestation.ui,{allocated_bytes:'8000000000',used_bytes:'2000000000',free_bytes:'6000000000'});
  const r=validateCapacity(f.attestation,f.options),envelope=1110709859n+16n*1000000n+2n*BigInt(f.attestation.metadata_raw_bytes)+6n*65536n;
  assert.equal(r.raw_bytes,'1046143579');assert.equal(r.encoded_bytes,'1110709859');assert.equal(r.per_capture_envelope_bytes,envelope.toString());
  assert.equal(r.required_free_bytes,(envelope*2n*2n+4n*1048576n).toString());assert.equal(r.capacity_approved,true);
  const v1=clone(f.attestation);v1.version=1;for(const m of v1.measurements)delete m.encoded_bytes;
  assert.throws(()=>validateCapacity(v1,f.options),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_INSUFFICIENT');
});

test('version 2 requires every encoded size and enforces quote-inclusive minimum and conservative maximum',()=>{
  for(const value of ['83','165']) {
    const f=encodedFixture();f.attestation.measurements[0].encoded_bytes=value;
    assert.throws(()=>validateCapacity(f.attestation,f.options),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_ENCODING');
  }
  for(const value of ['84','164']) {
    const f=encodedFixture();f.attestation.measurements[0].encoded_bytes=value;assert.equal(validateCapacity(f.attestation,f.options).capacity_approved,true);
  }
  const missing=encodedFixture();delete missing.attestation.measurements[0].encoded_bytes;
  assert.throws(()=>validateCapacity(missing.attestation,missing.options),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_INVALID');
  const empty=encodedFixture();empty.attestation.measurements[3].encoded_bytes='1';
  assert.throws(()=>validateCapacity(empty.attestation,empty.options),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_ENCODING');
});

test('encoded sizes are canonical bounded decimals and summed with overflow checks',()=>{
  for(const value of [100,'0100','100.0','1e2','-1',' 100','9223372036854775808']) {
    const f=encodedFixture();f.attestation.measurements[0].encoded_bytes=value;
    assert.throws(()=>validateCapacity(f.attestation,f.options),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_DECIMAL');
  }
  const f=encodedFixture();for(const m of f.attestation.measurements.slice(0,2))Object.assign(m,{rows:'3000000000000',raw_bytes:'3000000000000000000',max_row_bytes:'1000000',encoded_bytes:'5000000000000000000'});
  assert.throws(()=>validateCapacity(f.attestation,f.options),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_OVERFLOW');
});

test('version 2 keeps positive reserves, the exact free-space boundary and common row limits',()=>{
  const f=encodedFixture(),required=validateCapacity(f.attestation,f.options).required_free_bytes;
  Object.assign(f.attestation.ui,{allocated_bytes:required,used_bytes:'0',free_bytes:required});assert.equal(validateCapacity(f.attestation,f.options).remaining_free_bytes,'0');
  f.attestation.ui.free_bytes=(BigInt(required)-1n).toString();assert.throws(()=>validateCapacity(f.attestation,f.options),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_INSUFFICIENT');
  for(const key of ['wal_bytes','temp_bytes','safety_bytes','journal_bytes']) {
    const bad=encodedFixture();bad.attestation.reserves[key]='0';assert.throws(()=>validateCapacity(bad.attestation,bad.options),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_DECIMAL');
  }
  const row=encodedFixture();Object.assign(row.attestation.measurements[0],{rows:'1',raw_bytes:'16777217',max_row_bytes:'16777217',encoded_bytes:'16777219'});
  assert.throws(()=>validateCapacity(row.attestation,row.options),e=>e.cutoverCode==='CUTOVER_LIFECYCLE_CAPACITY_ROW_TOO_LARGE');
});
