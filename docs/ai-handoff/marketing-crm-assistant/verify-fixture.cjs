// Document/fixture consistency only; no application, network, DB or API calls.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const packet = __dirname;
const sample=JSON.parse(fs.readFileSync(path.join(packet,'fixtures/report.synthetic.json'),'utf8'));
assert.equal(sample.synthetic,true);
const unique=new Map();
for(const d of sample.deliveries) {
  if(unique.has(d.event_key)) assert.equal(unique.get(d.event_key).lead_ref,d.lead_ref,'Duplicate mapping conflict');
  unique.set(d.event_key,d);
}
const rows=[...unique.values()];
const linked=rows.filter(x=>x.lead_ref);
const leadRefs=new Set(linked.map(x=>x.lead_ref));
assert.equal(new Set(sample.leads.map(l=>l.lead_ref)).size,sample.leads.length);
assert.deepEqual(new Set(sample.leads.map(l=>l.lead_ref)),leadRefs);
for(const l of sample.leads) {
  for(const ref of l.care_evidence_refs) {
    const e=sample.care_evidence.find(x=>x.id===ref);
    assert(e&&e.lead_ref===l.lead_ref&&e.actor_type==='HUMAN'&&e.kind==='CUSTOMER_CONTACT_CONFIRMED');
    assert(Date.parse(e.occurred_at)>=Date.parse(sample.scope.window_start)&&Date.parse(e.occurred_at)<Date.parse(sample.scope.window_end));
  }
  assert.equal(l.care_state==='EVIDENCED', l.care_evidence_refs.length>0);
}
const count=(k,v)=>sample.leads.filter(x=>x[k]===v).length;
const metrics={raw_deliveries:sample.deliveries.length,unique_intakes:unique.size,duplicate_deliveries:sample.deliveries.length-unique.size,linked_intakes:linked.length,unresolved_intakes:rows.length-linked.length,unique_linked_leads:leadRefs.size,unassigned_leads:count('owner_state','UNASSIGNED'),invalid_owner_leads:count('owner_state','INVALID'),care_evidenced_leads:count('care_state','EVIDENCED'),no_care_evidence_leads:count('care_state','NO_EVIDENCE'),care_unknown_leads:count('care_state','UNKNOWN'),acknowledgement_unknown_leads:count('acknowledgement_state','UNKNOWN'),unique_leads_to_verify:sample.leads.filter(x=>x.owner_state!=='VALID'||x.care_state!=='EVIDENCED').length};
for(const [key,value] of Object.entries(metrics)) assert.equal(sample.expected[key],value,key);
for(const key of ['overdue_care','spend_vnd','cpl_vnd']) {assert.equal(sample.expected[key].value,null);assert.equal(sample.expected[key].status,'UNKNOWN');}
assert.equal(sample.expected.quality,'PARTIAL');
assert.equal(sample.policy.care_approval,'FIXTURE_ONLY');
assert(sample.proposed_actions.every(x=>x.mode==='PROPOSAL_ONLY'));
const cases=JSON.parse(fs.readFileSync(path.join(packet,'acceptance-cases.json'),'utf8'));
assert.equal(cases.cases.length,26);
assert.equal(new Set(cases.cases.map(c=>c.id)).size,26);
assert(cases.cases.every(c=>c.status==='NOT_RUN'));
const target=JSON.parse(fs.readFileSync(path.join(packet,'target-manifest.json'),'utf8'));
assert.equal(target.live_acceptance,'HOLD');
assert.equal(target.api.access_verified,false);
assert.equal(target.advertising_context.budget_vnd_per_day,500000);
assert.equal(target.api.cost_limit,null);
console.log(JSON.stringify({status: 'PASS', scope: 'SYNTHETIC_FIXTURE_CONSISTENCY_ONLY', metrics, runtime_scenarios_not_run: cases.cases.length, live_acceptance: target.live_acceptance}, null, 2));
