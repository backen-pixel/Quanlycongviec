'use strict';
const {assertLegacyFacebookWriteAllowed}=require('./facebookLegacyWriteScope');
const checkedLegacyFacebookResult=async call=>{const r=await call;if(!r||r.error)throw Object.assign(new Error('Chưa hoàn tất thao tác dữ liệu liên hệ.'),{status:503});return r;};
const checked=checkedLegacyFacebookResult;
async function checkedLegacyFacebookRows(call) {
 const result=await checked(call);
 if(!Array.isArray(result.data))throw Object.assign(new Error('Chưa đọc được đầy đủ danh sách dữ liệu liên hệ.'),{status:503});
 return result;
}
function assertLegacyFacebookSyncSucceeded(result) {
 if(!result||!['synced','up_to_date','no_msg'].includes(result.status)||result.graph_error)
  throw Object.assign(new Error('Chưa đồng bộ được hội thoại; đã dừng quét và đối soát hồ sơ.'),{status:503});
}
async function assertLegacyContactIdsInPageScope(db, ids, pageIds) {
 if(!Array.isArray(ids)||ids.length>500||ids.some(id=>typeof id!=='string'||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(id)))
  throw Object.assign(new Error('Danh sách liên hệ không hợp lệ (tối đa 500 hồ sơ).'),{status:400});
 if(pageIds!==null&&!Array.isArray(pageIds))throw Object.assign(new Error('Chưa xác định được phạm vi Page.'),{status:503});
 const unique=[...new Set(ids.map(id=>id.toLowerCase()))];
 if(!unique.length)return;
 const {data:rows}=await checkedLegacyFacebookRows(db.from('facebook_contacts').select('id, page_id').in('id',unique));
 const allowed=new Set(rows.filter(row=>pageIds===null||pageIds.includes(String(row.page_id))).map(row=>String(row.id).toLowerCase()));
 if(unique.some(id=>!allowed.has(id)))throw Object.assign(new Error('Không có quyền xử lý một hoặc nhiều liên hệ đã chọn.'),{status:403});
}
async function deleteLegacyFacebookContact(db,contactId,options){
 await assertLegacyFacebookWriteAllowed(db,{contactIds:[contactId]},options);
 await checked(db.from('facebook_messages').delete().eq('contact_id',contactId));
 await checked(db.from('facebook_contacts').delete().eq('id',contactId));
 return{success:true};
}
async function linkLegacyFacebookContact(db,contactId,leadId,options){
 await assertLegacyFacebookWriteAllowed(db,{contactIds:[contactId],leadIds:leadId?[leadId]:[]},options);
 const result=await checked(db.from('facebook_contacts').update({lead_id:leadId||null,updated_at:new Date().toISOString()}).eq('id',contactId).select().single());
 await checked(db.from('facebook_messages').update({lead_id:leadId||null}).eq('contact_id',contactId));
 return result.data;
}
module.exports={deleteLegacyFacebookContact,linkLegacyFacebookContact,checkedLegacyFacebookResult,checkedLegacyFacebookRows,assertLegacyFacebookSyncSucceeded,assertLegacyContactIdsInPageScope};
