'use strict';
const { createHash } = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MEMBERS = 100;
const error = code => Object.assign(new Error(code), { code });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function pair(a, b) {
  if (![a,b].every(x => typeof x === 'string' && UUID.test(x)) || a.toLowerCase() === b.toLowerCase()) throw error('INVALID_PAIR');
  return [a.toLowerCase(), b.toLowerCase()].sort();
}

// Repository must supply a COMPLETE, same-transaction company graph. Never
// remove stale edges/tombstones before closure: doing so manufactures customers.
function projectIdentity({ companyId, rootLeadId, graphRevision, asOf, complete, members, edges, foreignLinkLeadIds=[] }) {
  if (!UUID.test(companyId || '') || !UUID.test(rootLeadId || '') || !Number.isSafeInteger(graphRevision) || graphRevision < 0 || !Number.isFinite(Date.parse(asOf)) || complete !== true || !Array.isArray(members) || !Array.isArray(edges) || !Array.isArray(foreignLinkLeadIds)) throw error('INCOMPLETE_IDENTITY_GRAPH');
  companyId=companyId.toLowerCase(); rootLeadId=rootLeadId.toLowerCase();
  const byId=new Map(), adjacency=new Map(), pairs=new Set();
  for (const m of members) {
    if (!UUID.test(m?.leadId || '') || byId.has(m.leadId.toLowerCase()) || m.companyId?.toLowerCase() !== companyId || typeof m.available !== 'boolean' || typeof m.reviewRequired !== 'boolean' || !Number.isSafeInteger(m.generation) || m.generation < 0 || (m.available && typeof m.contextVersion !== 'string')) throw error('INVALID_IDENTITY_MEMBER');
    byId.set(m.leadId.toLowerCase(), { ...m, leadId:m.leadId.toLowerCase() });
  }
  const active=[];
  for (const e of edges) {
    const [left,right]=pair(e.leftLeadId,e.rightLeadId),key=left+'|'+right;
    if (e.companyId?.toLowerCase() !== companyId || pairs.has(key) || typeof e.active !== 'boolean' || !Number.isSafeInteger(e.revision) || e.revision < 1) throw error('INVALID_IDENTITY_EDGE');
    pairs.add(key);
    if (!e.active) continue;
    if (typeof e.leftContext !== 'string' || typeof e.rightContext !== 'string' || !e.evidenceId) throw error('UNVERIFIED_IDENTITY_EDGE');
    // Normalize context along with the pair, not just the IDs.
    const normalized={...e,leftLeadId:left,rightLeadId:right,leftContext:e.leftLeadId.toLowerCase()===left?e.leftContext:e.rightContext,rightContext:e.leftLeadId.toLowerCase()===left?e.rightContext:e.leftContext};
    active.push(normalized);
    for (const [a,b] of [[left,right],[right,left]]) { if (!adjacency.has(a)) adjacency.set(a,new Set()); adjacency.get(a).add(b); }
  }
  if (!byId.has(rootLeadId) || !byId.get(rootLeadId).available) throw error('ROOT_NOT_AVAILABLE');
  const found=new Set([rootLeadId]),queue=[rootLeadId];
  for (let i=0;i<queue.length;i++) for (const id of adjacency.get(queue[i]) || []) if (!found.has(id)) {
    found.add(id); queue.push(id); if (found.size>MAX_MEMBERS) throw error('IDENTITY_COMPONENT_TOO_LARGE');
  }
  const ids=[...found].sort(), links=active.filter(e=>found.has(e.leftLeadId));
  // A missing node is a tombstone, not permission to drop its relationship.
  const missing=ids.filter(id=>!byId.get(id)?.available);
  const foreign=new Set(foreignLinkLeadIds.map(id=>{if(!UUID.test(id || ''))throw error('INVALID_IDENTITY_MEMBER');return id.toLowerCase();}));
  const reasons=[];
  if (missing.length) reasons.push('MEMBER_UNAVAILABLE');
  if (ids.some(id=>foreign.has(id))) reasons.push('CROSS_COMPANY_HISTORY');
  if (ids.some(id=>byId.get(id)?.reviewRequired)) reasons.push('REVIEW_REQUIRED');
  if (links.some(e=>e.leftContext!==byId.get(e.leftLeadId)?.contextVersion || e.rightContext!==byId.get(e.rightLeadId)?.contextVersion)) reasons.push('STALE_IDENTITY_EVIDENCE');
  const available=ids.filter(id=>byId.get(id)?.available);
  const token=digest([companyId,rootLeadId,graphRevision,ids.map(id=>{const m=byId.get(id);return[id,m?.generation ?? null,m?.contextVersion ?? null,m?.reviewRequired ?? true,m?.available ?? false,foreign.has(id)];}),links.sort((a,b)=>(a.leftLeadId+'|'+a.rightLeadId).localeCompare(b.leftLeadId+'|'+b.rightLeadId)).map(e=>[e.leftLeadId,e.rightLeadId,e.revision,e.evidenceId,e.leftContext,e.rightContext])]);
  return {
    companyId,rootLeadId,graphRevision,asOf,snapshotToken:token,
    status:reasons.length?'NEEDS_REVIEW':ids.length>1?'LINKS_CONFIRMED':'UNLINKED',reasons,
    // This is only a snapshot key; receipts retain their original Lead IDs.
    canonicalLeadId:reasons.length?null:ids[0],memberLeadIds:available,
    memberCount:ids.length,unavailableMemberCount:missing.length,
    deduplicationComplete:false,qualifiedUniquePaidLead:false,
  };
}
module.exports={projectIdentity,pair,MAX_MEMBERS};
