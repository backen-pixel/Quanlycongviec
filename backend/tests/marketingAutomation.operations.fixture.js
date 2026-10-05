'use strict';
const {fixture,id}=require('./marketingAutomation.trial.fixture');
function operationsFixture(){
 const base=fixture(),company=base.companyId,actor=id(50),now=Date.parse(base.asOf),stamp=n=>new Date(now+n*60000).toISOString();
 const raw={policy:'MARKETING_OPERATIONS_V1',companyId:company,actorId:actor,asOf:base.asOf,complete:true,identity:base.identity,threads:[],bookings:[],aiMaySend:false,allowBudgetExecution:false};
 for(let i=1;i<=4;i++)raw.threads.push({id:id(200+i),scopeReady:true,leadId:id(i),mode:['WAITING','HUMAN_REQUESTED','HUMAN_ACTIVE','OPTED_OUT'][i-1],ownerReady:true,handlerReady:i===3,ownerId:id(61),claimedBy:i===3?actor:null,regionId:id(60),humanDeadline:i===2?stamp(-5):null,lastInboundAt:stamp(-10),lastOutboundAt:i===2?stamp(-2):stamp(-20)});
 for(let i=1;i<=4;i++)raw.bookings.push({id:id(300+i),scopeReady:true,leadId:id(i),threadId:id(200+i),state:i===2?'ACKNOWLEDGED':'PENDING',assigned:true,unchanged:true,recipientId:id(70),appointment:{startsAt:stamp(i===2?-120:i===3?-10:60),endsAt:stamp(i===2?-60:i===3?50:120),status:'planned',timeZone:'Asia/Ho_Chi_Minh',location:'Synthetic location'},receipt:i===2?{companyId:company,proposalId:id(302),actorId:id(70),state:'ACKNOWLEDGED',receivedAt:stamp(-150)}:null,deliveryConflict:false});
 return raw;
}
module.exports={operationsFixture,id};
