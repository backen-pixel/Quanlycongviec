'use strict';
const {isDeepStrictEqual}=require('node:util');
const {projectReview}=require('../crmLeadIdentity/review');
const {reportTrial}=require('./trialReport');
const {projectOperations}=require('./operationsReport');
const POLICY='MARKETING_COHORT_OPERATIONS_V1';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const instant=x=>typeof x==='string'?Date.parse(x):NaN;
const fail=()=>{throw Object.assign(Error('COHORT_OPERATIONS_UNAVAILABLE'),{status:503});};

function reportCohortOperations(raw){
 const f=raw?.facts,o=raw?.operations;
 if(raw?.policy!==POLICY||!uuid(raw.companyId)||!uuid(raw.actorId)||!uuid(raw.trialId)||!Number.isFinite(instant(raw.asOf))
  ||f?.companyId!==raw.companyId||f?.trial?.id!==raw.trialId||o?.companyId!==raw.companyId||o?.actorId!==raw.actorId
  ||instant(f?.asOf)!==instant(raw.asOf)||instant(o?.asOf)!==instant(raw.asOf)||!isDeepStrictEqual(f.identity,o.identity))fail();
 const trial=reportTrial(f),identity=projectReview(f.identity);
 // Validate the whole bounded source before filtering; unavailable mappings are
 // kept as company-level attribution gaps, never assigned to a paid cohort.
 projectOperations(o);
 const paid=new Map(trial.items.filter(x=>['QUALIFIED','PENDING','REJECTED'].includes(x.status)).map(x=>[x.groupId,x]));
 const members=new Map(),groups=new Map(identity.groups.map(g=>[g.groupId,g]));
 for(const g of identity.groups)for(const m of g.members)members.set(m.leadId,{group:g,member:m});
 const paidGroup=lead=>{const x=members.get(lead);return x?.member.available&&x.group.deduplicationComplete&&paid.has(x.group.groupId)?x.group.groupId:null;};
 const threads=o.threads.filter(x=>x.scopeReady&&paidGroup(x.leadId));
 const bookings=o.bookings.filter(x=>x.scopeReady&&paidGroup(x.leadId));
 const projected=projectOperations({...o,threads,bookings}),ops=projected.report;
 const connected=new Set(threads.map(t=>paidGroup(t.leadId))),waiting=new Set(projected.waitingGroups);
 const attention=projected.attention.map(x=>({...x,groupId:paidGroup(x.leadId)}));
 let withoutCare=0;
 for(const row of paid.values()){
  const member=groups.get(row.groupId)?.members.find(m=>m.leadId===row.acquisitionLeadId&&m.available);
  if(!member)fail();
  const add=reason=>{waiting.add(row.groupId);attention.push({kind:'INTAKE',id:row.groupId,groupId:row.groupId,leadId:row.acquisitionLeadId,title:member.title||null,reason,dueAt:null});};
  if(row.status==='PENDING')add('QUALIFICATION_PENDING');
  if(row.status!=='REJECTED'&&!connected.has(row.groupId)){withoutCare++;add('CARE_CONNECTION_NOT_ESTABLISHED');}
 }
 attention.sort((a,b)=>(a.dueAt?instant(a.dueAt):Infinity)-(b.dueAt?instant(b.dueAt):Infinity)||a.id.localeCompare(b.id)||a.reason.localeCompare(b.reason));
 const appointments=bookings.map(b=>({id:b.id,groupId:paidGroup(b.leadId),leadId:b.leadId,
  title:members.get(b.leadId)?.member.title||null,handoffState:b.state,
  status:!b.assigned||!b.unchanged||b.appointment.status!=='planned'?'CHANGED':
   instant(b.appointment.endsAt)<=instant(raw.asOf)?'RESULT_NOT_RECORDED':instant(b.appointment.startsAt)<=instant(raw.asOf)?'IN_PROGRESS':'UPCOMING',
  startsAt:Number.isFinite(instant(b.appointment.startsAt))?b.appointment.startsAt:null,
  endsAt:Number.isFinite(instant(b.appointment.endsAt))?b.appointment.endsAt:null}));
 appointments.sort((a,b)=>(instant(a.startsAt)||Infinity)-(instant(b.startsAt)||Infinity)||a.id.localeCompare(b.id));
 const excluded={existingGroups:trial.observed.existing,organicGroups:trial.observed.organic,
  unresolvedGroups:trial.observed.unresolved,unknownSourceGroups:trial.observed.unknownSource,
  unprocessedForms:trial.observed.unprocessedForms,unlinkedProofs:trial.observed.unlinkedProofs,
  companyThreadsNotAttributed:o.threads.length-threads.length,companyBookingsNotAttributed:o.bookings.length-bookings.length};
 return{policy:POLICY,companyId:raw.companyId,actorId:raw.actorId,trialId:raw.trialId,asOf:raw.asOf,
  trial:trial.trial,period:trial.period,scope:'OBSERVED_PAID_ACQUISITION_COHORT',coverage:'CONNECTED_MESSENGER_AND_CONFIRMED_SURVEYS',
  counts:{observedPaidGroups:paid.size,qualifiedGroups:trial.observed.qualified,pendingQualificationGroups:trial.observed.pending,
   rejectedGroups:trial.observed.rejected,careConnectedGroups:connected.size,withoutCareGroups:withoutCare,
   waitingGroups:waiting.size,bookedGroups:projected.bookedGroups.length,...ops.counts},
  excluded,attention:attention.slice(0,50),attentionTotal:attention.length,
  appointments:appointments.slice(0,50),appointmentTotal:appointments.length,
  providerUniverseVerified:false,allChannelsMeasured:false,aiMaySend:false,allowBudgetExecution:false};
}

function createCohortOperations({db,isPrimary,env=process.env}){
 const enabled=()=>env.VPT_MARKETING_COHORT_OPERATIONS==='1'&&env.VPT_MARKETING_TRIAL_REPORT==='1'&&isPrimary()===true;
 return async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(!enabled())return res.status(503).json({error:'Theo dõi khảo sát theo kỳ quảng cáo chưa được mở.'});
  const actor=req.user?.userId,company=req.query?.company_id,trial=req.params?.trialId;
  if(!uuid(actor)||!uuid(company)||(req.user.id&&req.user.id!==actor))return res.status(403).json({error:'Không xác định được phạm vi truy cập.'});
  if(!uuid(trial)||Object.keys(req.query).some(k=>k!=='company_id'))return res.status(400).json({error:'Cần chọn đúng kỳ đo; lịch khảo sát không lọc theo ngày quảng cáo.'});
  try{
   const r=await db.rpc('marketing_cohort_operations_snapshot',{p_actor:actor,p_company:company,p_trial:trial});
   if(r.error)throw Object.assign(Error('read failed'),{code:r.error.code});
   if(!enabled()||r.data?.companyId!==company||r.data?.actorId!==actor||r.data?.trialId!==trial)fail();
   return res.json(reportCohortOperations(r.data));
  }catch(e){return res.status(e.code==='42501'?403:e.code==='P0002'?404:503).json({error:'Chưa đọc được khách và lịch trong phạm vi kỳ này. Số liệu cũ đã được ẩn.'});}
 };
}
module.exports={POLICY,reportCohortOperations,createCohortOperations};
