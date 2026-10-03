'use strict';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const keys=['pageIds','contactIds','leadIds','customerIds'];
const failure=(code='LEGACY_SCOPE_UNAVAILABLE')=>Object.assign(new Error(code==='MANAGED_CARE_SCOPE'
 ?'Hồ sơ thuộc luồng chăm khách mới. Tác vụ cũ đã dừng trước khi thay đổi dữ liệu.'
 :'Chưa xác định được phạm vi ghi dữ liệu. Tác vụ đã dừng để kiểm tra.'),{code,status:code==='MANAGED_CARE_SCOPE'?409:503});
function normalizeScope(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))throw failure();
 const scope={};for(const k of keys){const values=input[k]===undefined?[]:input[k];
  if(!Array.isArray(values)||values.length>500||values.some(x=>k==='pageIds'?typeof x!=='string'||!/^\d{1,32}$/.test(x):!uuid(x)))throw failure();
  scope[k]=[...new Set(values.map(x=>k==='pageIds'?x:x.toLowerCase()))].sort();
 }
 if(!keys.some(k=>scope[k].length))throw failure();return scope;
}
function currentPrimary(){const router=require('../config/supabaseRouter');return !router.isFailoverEnabled()&&router.getActiveTarget()==='primary';}
async function assertLegacyFacebookWriteAllowed(db,input,{isPrimary=currentPrimary}={}){
 const scope=normalizeScope(input);if(isPrimary()!==true)throw failure();let response;
 try{response=await db.rpc('crm_care_legacy_write_check',{p_scope:scope});}catch{throw failure();}
 if(isPrimary()!==true||response?.error)throw failure();const x=response?.data;
 if(!x||x.policy!=='CARE_LEGACY_WRITE_CHECK_V1'||x.reservationMade!==false||typeof x.allowed!=='boolean'
  ||typeof x.observedAt!=='string'||!Number.isFinite(Date.parse(x.observedAt))
  ||!x.scope||typeof x.scope!=='object'||Object.keys(x.scope).length!==keys.length
  ||keys.some(k=>JSON.stringify(x.scope[k])!==JSON.stringify(scope[k]))
  ||x.reason!==(x.allowed?'LEGACY_SCOPE':'MANAGED_PAGE'))throw failure();
 if(!x.allowed)throw failure('MANAGED_CARE_SCOPE');return x;
}
async function legacyFacebookPageMayWrite(db,pageId,options){
 try{await assertLegacyFacebookWriteAllowed(db,{pageIds:[String(pageId)]},options);return true;}
 catch(e){if(e.code==='MANAGED_CARE_SCOPE')return false;throw e;}
}
module.exports={assertLegacyFacebookWriteAllowed,legacyFacebookPageMayWrite,normalizeScope};
