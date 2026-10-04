const id=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const date=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const natural=x=>Number.isSafeInteger(x)&&x>=0;
const check=x=>{if(!x)throw Error('COST_VIEW_UNAVAILABLE');};
export const receiptLabels={AUTHORIZED:'Chờ biên nhận sử dụng',UNKNOWN:'Chưa rõ kết quả sử dụng',USAGE_RECORDED:'Đã ghi nhận token',NOT_SENT:'Chưa gửi từ adapter'};
function totals(s){
 check(s&&['attempts','reservedVnd','pendingReceipts','unknownReceipts','usageReceipts','notSentReceipts','inputTokens','outputTokens','totalTokens'].every(k=>natural(s[k])));
 check(s.attempts===s.pendingReceipts+s.unknownReceipts+s.usageReceipts+s.notSentReceipts&&s.totalTokens===s.inputTokens+s.outputTokens);
}
function policy(p){
 check(p&&id(p.policyId)&&id(p.principalId)&&p.provider==='OPENAI_RESPONSES'&&typeof p.model==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(p.model)
  &&typeof p.active==='boolean'&&date(p.startsAt)&&date(p.expiresAt)&&Date.parse(p.expiresAt)>Date.parse(p.startsAt)
  &&Number.isInteger(p.maxCalls)&&p.maxCalls>=1&&p.maxCalls<=100000&&natural(p.allowanceVnd)&&p.allowanceVnd>=1);
 totals(p);
}
export function inferenceCosts(data,companyId,policyId=null,unresolvedOnly=false){
 check(id(companyId)&&data?.companyId===companyId&&data.policyId===policyId&&date(data.asOf)&&data.scope==='RECORDED_CARE_POLICIES'
  &&data.costBasis==='RESERVED_ALLOWANCE_NOT_PROVIDER_INVOICE'&&data.actualCostVnd===null&&data.send===false&&data.canReconcile===false&&data.unresolvedOnly===unresolvedOnly&&(!unresolvedOnly||policyId!==null));
 totals(data.summary);check(natural(data.summary.policyCount));
 const items=policyId===null?data.policies:data.receipts;check(Array.isArray(items)&&items.length<=20);
 if(policyId===null){
  check(data.policy===null&&data.receipts===null&&data.summary.policyCount>=items.length);items.forEach(policy);
 }else{
  check(id(policyId)&&data.policies===null&&data.summary.policyCount===1&&data.policy?.policyId===policyId);policy(data.policy);
  for(const k of['attempts','reservedVnd','pendingReceipts','unknownReceipts','usageReceipts','notSentReceipts','inputTokens','outputTokens','totalTokens'])check(data.policy[k]===data.summary[k]);
  check(data.summary.attempts>=items.length);
  for(const r of items){
   check(!unresolvedOnly||['AUTHORIZED','UNKNOWN'].includes(r.state));
   check(id(r.requestId)&&r.policyId===policyId&&r.principalId===data.policy.principalId&&Object.hasOwn(receiptLabels,r.state)
    &&date(r.authorizedAt)&&date(r.dispatchBefore)&&(r.completedAt===null||date(r.completedAt))&&natural(r.reservedVnd)&&r.reservedVnd>=1);
   if(r.state==='USAGE_RECORDED')check(r.usage?.model===data.policy.model&&['inputTokens','outputTokens','totalTokens'].every(k=>natural(r.usage[k]))
    &&r.usage.totalTokens===r.usage.inputTokens+r.usage.outputTokens&&r.reason===null);
   else{check(r.usage===null);check(r.state==='AUTHORIZED'?r.reason===null&&r.completedAt===null:
    r.state==='UNKNOWN'?['TRANSPORT_UNKNOWN','USAGE_UNAVAILABLE'].includes(r.reason):['ADMISSION_EXPIRED','DISABLED','ABORTED'].includes(r.reason));}
  }
 }
 const ids=items.map(x=>policyId===null?x.policyId:x.requestId);check(new Set(ids).size===ids.length&&ids.every((x,i)=>!i||ids[i-1]<x));
 check(data.nextAfter===null||(id(data.nextAfter)&&ids.at(-1)===data.nextAfter));return data;
}
