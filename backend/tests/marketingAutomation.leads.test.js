'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { measureLeadTrial } = require('../src/modules/marketingAutomation/leadMeasurement');
const { APPROVED_PLAN } = require('../src/modules/marketingAutomation/policy');
function fixture() { return { companyId:'vpt', trialId:'trial', start:'2026-10-01T00:00:00Z', end:'2026-10-31T00:00:00Z', asOf:'2026-11-10T00:00:00Z', currency:'VND', sourceVerified:true, spendFresh:true, qualificationFresh:true, coverage:{spend:'COMPLETE',leads:'COMPLETE',qualification:'COMPLETE',attribution:'COMPLETE'}, accountIds:['fb','google'],
  spend:[{companyId:'vpt',trialId:'trial',accountId:'fb',eventId:'spend1',spentAt:'2026-10-02T00:00:00Z',amountVnd:250000,currency:'VND'}],
  paidLeads:[{companyId:'vpt',trialId:'trial',canonicalLeadId:'lead1',accountId:'fb',sourceEvidenceId:'receipt1',attributionPolicy:'FIRST_VERIFIED_PAID_LEAD_V1',createdAt:'2026-10-02T00:00:00Z',qualification:'QUALIFIED',qualificationEvidenceId:'check1',qualifiedBy:'approved-rule-v1',qualifiedAt:'2026-10-03T00:00:00Z',contactVerified:true,demandMatches:true,serviceAreaVerified:true}] }; }
test('Founder interim target is 250k per verified paid Lead; 300 implies 75m, not a new cap',()=>{assert.equal(APPROVED_PLAN.primaryMetric,'COST_PER_QUALIFIED_PAID_LEAD');assert.equal(APPROVED_PLAN.targetQualifiedLeadCostVnd*300,75000000);assert.equal(APPROVED_PLAN.trialCapVnd,100000000);});
test('250k exact qualifies to date with no accounting dependency or spending grant',()=>{const r=measureLeadTrial(fixture());assert.equal(r.costPerQualifiedLeadVnd,250000);assert.equal(r.targetMetToDate,true);assert.equal(r.revenueTargetEvaluated,false);assert.equal(r.allowBudgetExecution,false);});
test('one VND above target is not rounded down to pass',()=>{const s=fixture();s.spend[0].amountVnd++;assert.equal(measureLeadTrial(s).targetMetToDate,false);});
test('all spend including a different platform with zero Leads is counted',()=>{const s=fixture();s.spend.push({...s.spend[0],accountId:'google',amountVnd:100000});assert.equal(measureLeadTrial(s).costPerQualifiedLeadVnd,350000);});
test('duplicate spend receipts and canonical Leads count once',()=>{const s=fixture();s.spend.push({...s.spend[0]});s.paidLeads.push({...s.paidLeads[0]});assert.equal(measureLeadTrial(s).qualifiedLeads,1);assert.equal(measureLeadTrial(s).costPerQualifiedLeadVnd,250000);});
test('conflicting platform attribution cannot count the same customer twice',()=>{const s=fixture();s.paidLeads.push({...s.paidLeads[0],accountId:'google'});assert.equal(measureLeadTrial(s).reason,'CONFLICTING_LEAD');});
test('pending and rejected customers are separate and not in the denominator',()=>{const s=fixture();s.paidLeads.push({...s.paidLeads[0],canonicalLeadId:'pending',qualification:'PENDING'},{...s.paidLeads[0],canonicalLeadId:'rejected',qualification:'REJECTED'});const r=measureLeadTrial(s);assert.equal(r.receivedPaidLeads,3);assert.equal(r.qualifiedLeads,1);assert.equal(r.pendingLeads,1);assert.equal(r.rejectedLeads,1);assert.equal(r.costPerQualifiedLeadVnd,250000);});
test('zero qualified Leads has null cost and never achieves target',()=>{const s=fixture();s.paidLeads=[];const r=measureLeadTrial(s);assert.equal(r.status,'NO_QUALIFIED_LEADS');assert.equal(r.costPerQualifiedLeadVnd,null);assert.equal(r.targetMetToDate,false);});
for(const k of ['spend','leads','qualification','attribution'])test('incomplete '+k+' is unknown, not a cheap Lead',()=>{const s=fixture();s.coverage[k]='PARTIAL';assert.equal(measureLeadTrial(s).status,'UNKNOWN');});
for(const k of ['sourceVerified','spendFresh','qualificationFresh'])test('unverified source '+k+' cannot be used',()=>{const s=fixture();s[k]=false;assert.equal(measureLeadTrial(s).reason,'UNVERIFIED_SOURCE');});
for(const k of ['contactVerified','demandMatches','serviceAreaVerified','qualificationEvidenceId','qualifiedBy'])test('qualification requires '+k,()=>{const s=fixture();delete s.paidLeads[0][k];assert.equal(measureLeadTrial(s).reason,'UNVERIFIED_QUALIFICATION');});
test('AI warm/hot label is not a verified Lead',()=>{const s=fixture();s.paidLeads[0].qualification='nong';assert.equal(measureLeadTrial(s).reason,'INVALID_LEAD');});
test('source from an old acquisition cohort is rejected',()=>{const s=fixture();s.paidLeads[0].createdAt='2026-09-30T00:00:00Z';assert.equal(measureLeadTrial(s).reason,'INVALID_LEAD');});
test('qualification may arrive after spending ends, but not after the snapshot',()=>{const s=fixture();s.paidLeads[0].qualifiedAt='2026-11-02T00:00:00Z';assert.equal(measureLeadTrial(s).targetMetToDate,true);s.paidLeads[0].qualifiedAt='2026-12-02T00:00:00Z';assert.equal(measureLeadTrial(s).reason,'UNVERIFIED_QUALIFICATION');});
test('wrong company and account block measurement',()=>{for(const patch of [{companyId:'other'},{accountId:'other'}]){const s=fixture();Object.assign(s.paidLeads[0],patch);assert.equal(measureLeadTrial(s).status,'UNKNOWN');}});
test('conflicting spend event must be reconciled',()=>{const s=fixture();s.spend.push({...s.spend[0],amountVnd:1});assert.equal(measureLeadTrial(s).reason,'CONFLICTING_SPEND');});

test('integer target comparison holds at one and seven qualified Leads',()=>{
  for (const qualified of [1, 7]) {
    const s = fixture();
    s.paidLeads = Array.from({ length: qualified }, (_, i) => ({
      ...s.paidLeads[0], canonicalLeadId: `lead${i + 1}`, sourceEvidenceId: `receipt${i + 1}`,
    }));
    s.spend[0].amountVnd = 250000 * qualified;
    assert.equal(measureLeadTrial(s).targetMetToDate, true);
    s.spend[0].amountVnd++;
    assert.equal(measureLeadTrial(s).targetMetToDate, false);
  }
});

function isolatedMeasurement(targetVnd) {
  const { readFileSync } = require('node:fs');
  const { runInNewContext } = require('node:vm');
  const policy = require('../src/modules/marketingAutomation/policy');
  const source = readFileSync(require.resolve('../src/modules/marketingAutomation/leadMeasurement'), 'utf8');
  const module = { exports: {} };
  runInNewContext(`${source}\nmodule.exports.unknownForTest = unknown;`, { module, require: path => {
    assert.equal(path, './policy');
    return { ...policy, APPROVED_PLAN: { ...APPROVED_PLAN, targetQualifiedLeadCostVnd: targetVnd } };
  } });
  return module.exports;
}

test('unsafe target multiplication and spend sum block measurement',()=>{
  const s = fixture();
  s.paidLeads.push({ ...s.paidLeads[0], canonicalLeadId: 'lead2', sourceEvidenceId: 'receipt2' });
  const targetVnd = Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1;
  const r = isolatedMeasurement(targetVnd).measureLeadTrial(s);
  assert.equal(r.reason, 'AMOUNT_OVERFLOW');
  assert.equal(r.uiState, 'BLOCKED');
  assert.equal(r.targetMetToDate, false);
  const spendOverflow = fixture();
  spendOverflow.spend.push({ ...spendOverflow.spend[0], eventId: 'spend2', amountVnd: Number.MAX_SAFE_INTEGER });
  assert.equal(measureLeadTrial(spendOverflow).uiState, 'BLOCKED');
});

for (const [reason, uiState, mutate] of [
  ['INVALID_SNAPSHOT', 'UNKNOWN', s => { s.companyId = ''; }],
  ['MISSING_SOURCE', 'UNKNOWN', s => { s.accountIds = []; }],
  ['INVALID_SPEND', 'UNKNOWN', s => { s.spend[0].amountVnd = -1; }],
  ['INVALID_LEAD', 'UNKNOWN', s => { s.paidLeads[0].qualification = 'invalid'; }],
  ['UNVERIFIED_QUALIFICATION', 'UNKNOWN', s => { s.paidLeads[0].contactVerified = false; }],
  ['UNVERIFIED_SOURCE', 'BLOCKED', s => { s.sourceVerified = false; }],
  ['INCOMPLETE_COVERAGE', 'BLOCKED', s => { s.coverage.spend = 'PARTIAL'; }],
  ['CONFLICTING_SPEND', 'BLOCKED', s => { s.spend.push({ ...s.spend[0], amountVnd: 1 }); }],
  ['CONFLICTING_LEAD', 'BLOCKED', s => { s.paidLeads.push({ ...s.paidLeads[0], accountId: 'google' }); }],
]) test(`uiState maps ${reason} to ${uiState}`,()=>{
  const s = fixture(); mutate(s);
  const r = measureLeadTrial(s);
  assert.equal(r.status, 'UNKNOWN');
  assert.equal(r.reason, reason);
  assert.equal(r.uiState, uiState);
  assert.equal(r.allowBudgetExecution, false);
});

test('successful uiState follows status and zero qualified Leads keep null cost',()=>{
  const known = measureLeadTrial(fixture());
  assert.equal(known.status, 'KNOWN_TO_DATE');
  assert.equal(known.uiState, 'KNOWN_TO_DATE');
  const s = fixture(); s.paidLeads = [];
  const empty = measureLeadTrial(s);
  assert.equal(empty.status, 'NO_QUALIFIED_LEADS');
  assert.equal(empty.uiState, 'NO_QUALIFIED_LEADS');
  assert.equal(empty.costPerQualifiedLeadVnd, null);
  assert.equal(empty.targetMetToDate, false);
});

test('unlisted reasons default to UNKNOWN, including prototype property names',()=>{
  const { unknownForTest } = isolatedMeasurement(APPROVED_PLAN.targetQualifiedLeadCostVnd);
  for (const reason of ['UNLISTED_REASON', '__proto__']) {
    const r = unknownForTest(reason);
    assert.equal(r.reason, reason);
    assert.equal(r.uiState, 'UNKNOWN');
  }
});
