const id=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const count=x=>Number.isSafeInteger(x)&&x>=0;
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
export function cohortOperationsResult(x,companyId,actorId,trialId){
 const bad=()=>{throw Error('COHORT_OPERATIONS_UNAVAILABLE');},c=x?.counts;
 if(!x||x.policy!=='MARKETING_COHORT_OPERATIONS_V1'||!id(companyId)||!id(actorId)||!id(trialId)
  ||x.companyId!==companyId||x.actorId!==actorId||x.trialId!==trialId||x.trial?.id!==trialId||!stamp(x.asOf)
  ||x.scope!=='OBSERVED_PAID_ACQUISITION_COHORT'||x.coverage!=='CONNECTED_MESSENGER_AND_CONFIRMED_SURVEYS'
  ||x.providerUniverseVerified!==false||x.allChannelsMeasured!==false||x.aiMaySend!==false||x.allowBudgetExecution!==false
  ||!c||!x.period||!['observedPaidGroups','qualifiedGroups','pendingQualificationGroups','rejectedGroups','careConnectedGroups','withoutCareGroups','waitingGroups','bookedGroups','threads','bookedAppointments','upcoming','inProgress','pastDue','pendingHandoffs','acknowledgedHandoffs','changedAppointments'].every(k=>count(c[k])))bad();
 if(c.observedPaidGroups!==c.qualifiedGroups+c.pendingQualificationGroups+c.rejectedGroups||c.observedPaidGroups>5000
  ||['waitingGroups','bookedGroups','careConnectedGroups'].some(k=>c[k]>c.observedPaidGroups)
  ||c.withoutCareGroups>c.qualifiedGroups+c.pendingQualificationGroups||c.bookedGroups>c.bookedAppointments
  ||c.upcoming+c.inProgress+c.pastDue+c.changedAppointments!==c.bookedAppointments
  ||c.pendingHandoffs+c.acknowledgedHandoffs!==c.upcoming+c.inProgress+c.pastDue)bad();
 if(!x.excluded||!['existingGroups','organicGroups','unresolvedGroups','unknownSourceGroups','unprocessedForms','unlinkedProofs','companyThreadsNotAttributed','companyBookingsNotAttributed'].every(k=>count(x.excluded[k])))bad();
 for(const [key,total]of[['attention','attentionTotal'],['appointments','appointmentTotal']]){
  if(!Array.isArray(x[key])||!count(x[total])||x[key].length!==Math.min(50,x[total]))bad();
  for(const r of x[key])if(!id(r.id)||!id(r.groupId)||!id(r.leadId)||!(r.title===null||typeof r.title==='string'))bad();
 }
 if(x.appointmentTotal!==c.bookedAppointments||x.attention.some(r=>!['CARE','SURVEY','INTAKE'].includes(r.kind)||typeof r.reason!=='string'||!(r.dueAt===null||stamp(r.dueAt)))
  ||x.appointments.some(r=>!['CHANGED','RESULT_NOT_RECORDED','IN_PROGRESS','UPCOMING'].includes(r.status)||!['PENDING','ACKNOWLEDGED'].includes(r.handoffState)||![r.startsAt,r.endsAt].every(v=>v===null||stamp(v))))bad();
 return x;
}
