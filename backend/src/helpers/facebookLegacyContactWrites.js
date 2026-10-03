'use strict';
const {assertLegacyFacebookWriteAllowed}=require('./facebookLegacyWriteScope');
const checked=async call=>{const r=await call;if(r?.error)throw Object.assign(new Error('Chưa hoàn tất thay đổi liên hệ.'),{status:503});return r;};
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
module.exports={deleteLegacyFacebookContact,linkLegacyFacebookContact};
