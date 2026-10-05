const id=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const count=x=>Number.isSafeInteger(x)&&x>=0;
const countKeys=['threads','awaitingReply','humanRequested','humanActive','optedOut','overdueHumanRequests','unavailableThreads','unavailableOwners','unavailableHandlers','ambiguousMessageOrder','bookedAppointments','upcoming','inProgress','pastDue','pendingHandoffs','acknowledgedHandoffs','changedAppointments','unavailableBookings','deliveryConflicts'];
export function operationsResult(x,companyId,actorId){
 const bad=()=>{throw Error('OPERATIONS_UNAVAILABLE');},c=x?.counts,u=x?.customers;
 if(!x||x.policy!=='MARKETING_OPERATIONS_V1'||x.companyId!==companyId||x.actorId!==actorId||!id(companyId)||!id(actorId)||!Number.isFinite(Date.parse(x.asOf))||x.scope!=='COMPANY_MESSENGER_AND_CONFIRMED_SURVEYS'||x.aiMaySend!==false||x.allowBudgetExecution!==false||x.adCohortAttribution!==false||!c||countKeys.some(k=>!count(c[k]))||c.threads>5000||c.bookedAppointments>5000)bad();
 if(c.upcoming+c.inProgress+c.pastDue+c.changedAppointments+c.unavailableBookings!==c.bookedAppointments||c.pendingHandoffs+c.acknowledgedHandoffs!==c.upcoming+c.inProgress+c.pastDue||c.humanRequested+c.humanActive+c.optedOut+c.unavailableThreads>c.threads||c.awaitingReply>c.threads-c.optedOut-c.unavailableThreads||c.overdueHumanRequests>c.humanRequested)bad();
 if(!u||!['AVAILABLE','UNRESOLVED'].includes(u.status)||!count(u.unresolvedGroups)||(u.status==='AVAILABLE'?(!count(u.waiting)||!count(u.booked)||u.waiting>c.threads||u.booked>c.bookedAppointments||u.unresolvedGroups!==0||c.unavailableThreads!==0||c.unavailableBookings!==0):(u.waiting!==null||u.booked!==null)))bad();
 if(!Array.isArray(x.attention)||x.attention.length>50||!count(x.attentionTotal)||x.attentionTotal<x.attention.length||x.attention.some(r=>!['CARE','SURVEY'].includes(r.kind)||!id(r.id)||!(r.leadId===null||id(r.leadId))||!(r.title===null||typeof r.title==='string')||!(r.dueAt===null||Number.isFinite(Date.parse(r.dueAt)))||typeof r.reason!=='string'||(r.leadId===null&&r.title!==null)))bad();
 return x;
}
