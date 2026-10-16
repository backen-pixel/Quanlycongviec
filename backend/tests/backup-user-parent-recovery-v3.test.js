'use strict';
// Pure local cryptographic and command boundaries. No env, DB or network.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const repair=require('../scripts/recover-backup-user-parent-v3-20261016');
const old=require('../scripts/recover-backup-user-parent-20261015');
const KEY=Buffer.alloc(32,29).toString('base64'),KEY_ID='99999999-9999-4999-8999-999999999999';
const ID='11111111-1111-4111-8111-111111111111';
const context=()=>({run_id:repair.V3_RUN,base_manifest_sha256:repair.BASE_MANIFEST_SHA,
  manifest_sha256:'a'.repeat(64),epochs:{primary:'22222222-2222-4222-8222-222222222222',backup:'33333333-3333-4333-8333-333333333333'}});
const payload=()=>({operation:repair.OPERATION,scope:repair.SCOPE,cutover_v3:{input:context()},source:{synthetic:'private@example.invalid'}});
function row(p=payload()) {return {id:ID,operation:repair.OPERATION,source_project:repair.PRIMARY,backup_project:repair.BACKUP,
  algorithm:repair.ALGORITHM,key_id:KEY_ID,...repair.encrypt(p,KEY,ID,KEY_ID)};}
test('v3 context requires exact fixed run, base, distinct revision and both epochs; old/extra scopes fail',()=>{
  assert.deepEqual(repair.cutoverContext(context()),context());
  const oldContext=context();delete oldContext.base_manifest_sha256;
  for(const bad of [undefined,null,[],oldContext,{...context(),run_id:ID},{...context(),base_manifest_sha256:'0'.repeat(64)},
    {...context(),manifest_sha256:repair.BASE_MANIFEST_SHA},{...context(),extra:true},{...context(),epochs:{primary:ID}},
    {...context(),epochs:{...context().epochs,other:ID}},{...context(),epochs:{primary:'bad',backup:ID}}])
    assert.throws(()=>repair.cutoverContext(bad),e=>e.recoveryCode==='RECOVERY_CUTOVER_V3_CONTEXT_INVALID');
});
test('v3 ciphertext authenticates complete scope revision and both epochs with fresh salt/nonce',()=>{
  const p=payload(),r=row(p),other=row(p);assert.deepEqual(repair.decrypt(r,KEY,KEY_ID,context()),p);
  assert(!r.ciphertext.equals(other.ciphertext));assert(!r.salt.equals(other.salt));assert(!r.nonce.equals(other.nonce));
  assert(!r.ciphertext.toString().includes('example.invalid'));
  for(const changed of [{...context(),manifest_sha256:'b'.repeat(64)},
    {...context(),epochs:{...context().epochs,primary:ID}},{...context(),epochs:{...context().epochs,backup:ID}}])
    assert.throws(()=>repair.decrypt(r,KEY,KEY_ID,changed),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_DECRYPT');
});
test('old v2 snapshot, legacy algorithm and missing AAD context cannot be adopted by v3',()=>{
  const p=payload(),oldRow={id:ID,operation:repair.OPERATION,source_project:repair.PRIMARY,backup_project:repair.BACKUP,
    algorithm:repair.ALGORITHM,key_id:KEY_ID,...old.encrypt(p,KEY,ID,KEY_ID)};
  assert.throws(()=>repair.decrypt(oldRow,KEY,KEY_ID,context()),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_DECRYPT');
  assert.throws(()=>repair.decrypt({...row(),algorithm:'aes-256-gcm/hkdf-sha256/jwt_secret_v1'},KEY,KEY_ID,context()),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_SCOPE');
  assert.throws(()=>repair.decrypt(row(),KEY,KEY_ID),e=>e.recoveryCode==='RECOVERY_CUTOVER_V3_CONTEXT_INVALID');
  assert.throws(()=>repair.encrypt({operation:repair.OPERATION,scope:repair.SCOPE,cutover_v2:{input:context()}},KEY,ID,KEY_ID),e=>e.recoveryCode==='RECOVERY_CUTOVER_V3_CONTEXT_INVALID');
});
test('tampered ciphertext/tag, wrong key ID and another snapshot ID are held',()=>{
  const r=row(),ciphertext=Buffer.from(r.ciphertext);ciphertext[0]^=1;
  assert.throws(()=>repair.decrypt({...r,ciphertext},KEY,KEY_ID,context()),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_DIGEST');
  const auth_tag=Buffer.from(r.auth_tag);auth_tag[0]^=1;
  assert.throws(()=>repair.decrypt({...r,auth_tag},KEY,KEY_ID,context()),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_DECRYPT');
  assert.throws(()=>repair.decrypt(r,KEY,ID,context()),e=>e.recoveryCode==='RECOVERY_KEY_ID_MISMATCH');
  assert.throws(()=>repair.decrypt({...r,id:crypto.randomUUID()},KEY,KEY_ID,context()),e=>e.recoveryCode==='RECOVERY_SNAPSHOT_DECRYPT');
});
test('v3 API refuses legacy context/secret or old review before any connection access',async()=>{
  const primary={query(){throw Error('must not query');}},backup=primary;
  for(const extra of [{cutoverV2:context()},{legacySecret:'synthetic old JWT'},{}])
    await assert.rejects(()=>repair.recover({primary,backup,...extra}),e=>e.recoveryCode==='RECOVERY_CUTOVER_V3_CONTEXT_INVALID');
  for(const approval of [undefined,{version:'cutover_source_review_v1'},{version:'cutover_source_review_v3',run_id:repair.V3_RUN,
    base_manifest_sha256:repair.BASE_MANIFEST_SHA,manifest_sha256:'b'.repeat(64)}])
    await assert.rejects(()=>repair.recover({primary,backup,mode:'snapshot',secret:KEY,keyId:KEY_ID,cutoverV3:context(),approval}),e=>e.recoveryCode==='RECOVERY_CUTOVER_V3_APPROVAL_REQUIRED');
});
test('CLI is explicit v3-context only and requires reviewed approval for private/business writes',()=>{
  assert.deepEqual(repair.parseArgs(['--dry-run','--cutover-v3-context','scope.json']),{mode:'dry-run',snapshotId:undefined,cutoverV3ContextFile:'scope.json'});
  for(const args of [[],['--cutover-v2-context','old.json'],['--snapshot','--cutover-v3-context','scope.json'],
    ['--apply','--cutover-v3-context','scope.json','--snapshot-id',ID],['--cutover-v3-context','scope.json','--secret','value']])
    assert.throws(()=>repair.parseArgs(args));
  assert.equal(repair.parseArgs(['--snapshot','--cutover-v3-context','scope.json','--approval','review.json']).approvalFile,'review.json');
  assert(Object.isFrozen(repair.CUTOVER_V3_REPAIR_CONTRACT));assert.equal(repair.CUTOVER_V3_REPAIR_CONTRACT.fingerprint_includes_v3,true);
});
test('uncertain COMMIT response retains only bounded recovery identifiers and never raw errors',()=>{
  const error=Object.assign(Error('private contact/password detail'),{recoveryCode:'RECOVERY_COMMIT_OUTCOME_UNKNOWN',
    snapshotId:ID,mode:'apply',scopeRevision:context()});
  assert.deepEqual(repair.failureResult(error),{ok:false,reason:'RECOVERY_COMMIT_OUTCOME_UNKNOWN',cutover_ready:false,
    automatic_retry:false,inspect_required:true,snapshot_id:ID,mode:'apply',scope_revision:context()});
  assert(!JSON.stringify(repair.failureResult(error)).includes('private'));
});
