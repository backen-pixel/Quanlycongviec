'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const POLICY='CRM_EXACT_CONTACT_REVIEW_V1';
const fail=code=>{throw Object.assign(new Error(code),{code,status:503});};
function phoneKey(value){
 if(typeof value!=='string'||!value.trim())return null;
 const s=value.trim();if(!/^\+?[0-9 () .-]+$/.test(s))return null;
 const d=s.replace(/[ () .-]/g,'');let normalized;
 if(/^0[35789][0-9]{8}$/.test(d)||/^02[0-9]{9}$/.test(d))normalized='+84'+d.slice(1);
 else if(/^84[35789][0-9]{8}$/.test(d)||/^842[0-9]{9}$/.test(d))normalized='+'+d;
 else if(/^0084[35789][0-9]{8}$/.test(d)||/^00842[0-9]{9}$/.test(d))normalized='+'+d.slice(2);
 else if(/^\+[1-9][0-9]{7,14}$/.test(d)&&!d.startsWith('+840'))normalized=d;
 if(!normalized||/^\+([0-9])\1+$/.test(normalized))return null;return 'phone:'+normalized;
}
function emailKey(value){
 if(typeof value!=='string')return null;const s=value.trim().toLowerCase();
 if(s.length>254||!(/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(s)))return null;
 const local=s.split('@')[0];if(local.startsWith('.')||local.endsWith('.')||local.includes('..'))return null;return 'email:'+s;
}
function contacts(c={}){
 const keys=new Set();let malformed=false;
 for(const [field,normalize]of [['leadPhone',phoneKey],['customerPhone',phoneKey],['leadEmail',emailKey],['customerEmail',emailKey]]){
  const value=c[field];if(value===null||value===undefined||value==='')continue;
  const key=normalize(value);if(key)keys.add(key);else if(typeof value!=='string'||value.trim())malformed=true;
 }
 return{keys:[...keys],malformed};
}
function projectReview(raw){
 if(!raw||raw.policy!==POLICY||!UUID.test(raw.companyId||'')||raw.complete!==true||!Array.isArray(raw.members)||raw.members.length>5000||!Array.isArray(raw.edges)||!Array.isArray(raw.distinctions)||!(/^[a-f0-9]{32}$/.test(raw.snapshotToken||''))||!Number.isFinite(Date.parse(raw.asOf)))fail('IDENTITY_INVENTORY_UNAVAILABLE');
 const nodes=new Map(),parent=new Map();
 for(const n of raw.members){if(!UUID.test(n.leadId||'')||nodes.has(n.leadId)||n.companyId!==raw.companyId||typeof n.available!=='boolean'||typeof n.reviewRequired!=='boolean'||typeof n.foreignHistory!=='boolean'||!Number.isSafeInteger(n.generation)||n.generation<0||(n.available&&!/^[a-f0-9]{32}$/.test(n.contextVersion||'')))fail('INVALID_IDENTITY_INVENTORY');nodes.set(n.leadId,{...n,...contacts(n.contacts)});parent.set(n.leadId,n.leadId);}
 const find=id=>{let root=id;while(parent.get(root)!==root)root=parent.get(root);while(id!==root){const next=parent.get(id);parent.set(id,root);id=next;}return root;};
 const union=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent.set(a<b?b:a,a<b?a:b);};
 const validate=rows=>{const seen=new Set();for(const e of rows){const key=e.leftLeadId+'|'+e.rightLeadId;if(!nodes.has(e.leftLeadId)||!nodes.has(e.rightLeadId)||e.leftLeadId>=e.rightLeadId||seen.has(key)||typeof e.active!=='boolean'||!Number.isSafeInteger(e.revision)||e.revision<1||!e.evidenceId||typeof e.leftContext!=='string'||typeof e.rightContext!=='string')fail('INVALID_IDENTITY_INVENTORY');seen.add(key);}};
 validate(raw.edges);validate(raw.distinctions);
 for(const e of raw.edges)if(e.active)union(e.leftLeadId,e.rightLeadId);
 const groups=new Map();
 for(const n of nodes.values()){const id=find(n.leadId);if(!groups.has(id))groups.set(id,{id,members:[],reasons:new Set(),keys:new Set(),candidateGroupIds:new Set(),distinctGroupIds:new Set()});const g=groups.get(id);g.members.push(n);if(!n.available)g.reasons.add('MEMBER_UNAVAILABLE');if(n.reviewRequired)g.reasons.add('REVIEW_REQUIRED');if(n.foreignHistory)g.reasons.add('CROSS_COMPANY_HISTORY');if(n.available&&(n.malformed||!n.keys.length))g.reasons.add('CONTACT_UNMATCHABLE');for(const k of n.keys)g.keys.add(k);}
 for(const e of raw.edges)if(e.active&&(nodes.get(e.leftLeadId).contextVersion!==e.leftContext||nodes.get(e.rightLeadId).contextVersion!==e.rightContext))groups.get(find(e.leftLeadId)).reasons.add('STALE_IDENTITY_EVIDENCE');
 const pair=(a,b)=>a<b?a+'|'+b:b+'|'+a;
 const distinctions=new Map(),publicDistinctions=[];
 for(const d of raw.distinctions){if(!d.active)continue;const a=find(d.leftLeadId),b=find(d.rightLeadId),current=nodes.get(d.leftLeadId).available&&nodes.get(d.rightLeadId).available&&nodes.get(d.leftLeadId).contextVersion===d.leftContext&&nodes.get(d.rightLeadId).contextVersion===d.rightContext;
  publicDistinctions.push({leftLeadId:d.leftLeadId,rightLeadId:d.rightLeadId,revision:d.revision,current,evidenceId:d.evidenceId});
  if(a===b){groups.get(a).reasons.add('CONTRADICTORY_DISTINCTION');continue;}
  if(current&&groups.get(a).reasons.size===0&&groups.get(b).reasons.size===0){distinctions.set(pair(a,b),true);groups.get(a).distinctGroupIds.add(b);groups.get(b).distinctGroupIds.add(a);}
 }
 const byKey=new Map(),candidates=new Map();
 for(const g of groups.values())for(const key of g.keys){if(!byKey.has(key))byKey.set(key,new Set());byKey.get(key).add(g.id);}
 for(const [key,ids]of byKey){const list=[...ids].sort();for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
  const a=list[i],b=list[j],id=pair(a,b);if(!candidates.has(id))candidates.set(id,{leftGroupId:a,rightGroupId:b,matchingFields:new Set(),resolved:distinctions.has(id)});
  candidates.get(id).matchingFields.add(key.startsWith('phone:')?'PHONE':'EMAIL');if(candidates.size>10000)fail('IDENTITY_CANDIDATE_LIMIT');
 }}
 for(const p of candidates.values())if(!p.resolved){groups.get(p.leftGroupId).candidateGroupIds.add(p.rightGroupId);groups.get(p.rightGroupId).candidateGroupIds.add(p.leftGroupId);}
 const out=[...groups.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(g=>{
  if(g.candidateGroupIds.size)g.reasons.add('UNRESOLVED_CONTACT_MATCH');
  return{groupId:g.id,members:g.members.map(n=>({leadId:n.leadId,title:n.available?n.title:null,available:n.available})),reasons:[...g.reasons],candidateGroupIds:[...g.candidateGroupIds],distinctGroupIds:[...g.distinctGroupIds],deduplicationComplete:g.reasons.size===0,qualifiedUniquePaidLead:false};
 });
 return{companyId:raw.companyId,policy:POLICY,asOf:raw.asOf,snapshotToken:raw.snapshotToken,comparisonCoverage:'COMPLETE',groups:out,
  candidates:[...candidates.values()].map(p=>({...p,matchingFields:[...p.matchingFields]})),distinctions:publicDistinctions,
  deduplicationComplete:out.every(g=>g.deduplicationComplete),qualifiedUniquePaidLead:false,allowBudgetExecution:false};
}
module.exports={POLICY,phoneKey,emailKey,contacts,projectReview};
