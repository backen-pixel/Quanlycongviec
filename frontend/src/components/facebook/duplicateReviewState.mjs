const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
export function acceptDuplicateReview(data,companyId){
 const fail=()=>{throw Error('Kết quả rà khách chưa đầy đủ hoặc không đúng công ty.');};
 if(!data||data.companyId!==companyId||data.policy!=='CRM_EXACT_CONTACT_REVIEW_V1'||data.readOnly!==true||data.merged!==0
   ||data.comparisonCoverage!=='COMPLETE'||data.allowBudgetExecution!==false||data.qualifiedUniquePaidLead!==false
   ||!Number.isFinite(Date.parse(data.asOf))||!Array.isArray(data.groups)||data.groups.length>5000||!Array.isArray(data.candidates)||data.candidates.length>10000)fail();
 const groups=new Map(),members=new Set();let available=0;
 for(const g of data.groups){
  if(!uuid(g.groupId)||groups.has(g.groupId)||!Array.isArray(g.members)||!g.members.length||!Array.isArray(g.reasons)||g.reasons.some(x=>typeof x!=='string')||typeof g.deduplicationComplete!=='boolean')fail();
  groups.set(g.groupId,g);
  for(const m of g.members){if(!uuid(m.leadId)||members.has(m.leadId)||typeof m.available!=='boolean'||(m.title!==null&&typeof m.title!=='string')||(!m.available&&m.title!==null))fail();members.add(m.leadId);if(m.available)available++;}
 }
 if(members.size>5000)fail();
 const pairs=new Set();for(const c of data.candidates){const key=c.leftGroupId+'|'+c.rightGroupId;
  if(!groups.has(c.leftGroupId)||!groups.has(c.rightGroupId)||c.leftGroupId>=c.rightGroupId||pairs.has(key)||typeof c.resolved!=='boolean'||!Array.isArray(c.matchingFields)||!c.matchingFields.length||c.matchingFields.some(x=>!['PHONE','EMAIL'].includes(x)))fail();pairs.add(key);
 }
 if(data.scannedLeadCount!==members.size||data.availableLeadCount!==available||data.reviewGroupCount!==data.groups.filter(g=>!g.deduplicationComplete).length||data.unresolvedPairCount!==data.candidates.filter(c=>!c.resolved).length)fail();
 return data;
}
export function createDuplicateReviewReader({companyId,read,update}){
 let current=0,disposed=false;
 return{async load(){const sequence=++current;update({busy:true,data:null,error:''});
  try{const response=await read();if(disposed||sequence!==current)return;
   if(!response.ok)throw Error(response.data?.error||'Chưa đọc được kết quả rà khách.');
   const data=acceptDuplicateReview(response.data,companyId);update({busy:false,data,error:''});
  }catch(e){if(!disposed&&sequence===current)update({busy:false,data:null,error:e.message||'Chưa đọc được kết quả rà khách.'});}
 },dispose(){disposed=true;current++;}};
}
