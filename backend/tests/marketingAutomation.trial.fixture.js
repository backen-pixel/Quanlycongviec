'use strict';
const id=n=>`${n.toString(16).padStart(8,'0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
function fixture(){
 const company=id(100),now='2026-10-02T00:00:00Z',token='a'.repeat(32),raw={companyId:company,asOf:now,complete:true,trial:{id:id(101),company_id:company,name:'Synthetic 30 days',since:'2026-10-01',until:'2026-10-30',revision:1,account_ids:['act_1','act_2']},qualities:[],sources:[],receipts:[],accounts:[],runs:[],identity:{companyId:company,policy:'CRM_EXACT_CONTACT_REVIEW_V1',complete:true,asOf:now,snapshotToken:token,graphRevision:0,members:[],edges:[],distinctions:[]}};
 for(const account of raw.trial.account_ids){raw.accounts.push({ad_account_id:account,company_id:company,bat:true,token_het_han:null});raw.runs.push({id:account,ad_account_id:account,company_id:company,state:'COMPLETE',started_at:now,since:'2026-10-01',until:'2026-10-02',snapshot:{accountId:account,currency:'VND',source:'META_ACCOUNT_INSIGHTS_V1',since:'2026-10-01',until:'2026-10-02',days:[{date:'2026-10-01',amountVnd:250000},{date:'2026-10-02',amountVnd:250000}]}});}
 for(let i=1;i<=6;i++){
  const lead=id(i),receipt=id(10+i),source=id(20+i),when=`2026-10-01T08:0${i}:00Z`,status=i<5?'QUALIFIED':i===5?'PENDING':'REJECTED';
  raw.identity.members.push({leadId:lead,companyId:company,available:true,reviewRequired:false,foreignHistory:false,generation:0,contextVersion:token,title:'Synthetic customer '+i,contacts:{leadPhone:'090123456'+i}});
  raw.qualities.push({leadId:lead,companyId:company,regionId:id(60),ownerId:id(61),historyComplete:true,firstKnownAt:when,routingReady:true,contextVersion:token,evidence:status==='PENDING'?null:{id:id(30+i),contextVersion:token,status,contactVerified:true,demandMatches:true,serviceAreaVerified:true,recordedAt:'2026-10-01T10:00:00Z',recordedBy:id(50)}});
  raw.receipts.push({id:receipt,pageId:'123',formId:'456',leadgenId:String(i),state:'DONE',leadId:lead,receivedAt:'2026-10-02T00:00:00Z'});
  raw.sources.push({id:source,receiptId:receipt,leadId:lead,companyId:company,provider:'META_LEAD_ADS_V1',source:'PAID',acquiredAt:when,proof:{pageId:'123',formId:'456',leadgenId:String(i),source:'PAID',accountId:'act_1',adId:'7',adsetId:'8',campaignId:'9',acquiredAt:when}});
 }
 return raw;
}
module.exports={fixture,id};
