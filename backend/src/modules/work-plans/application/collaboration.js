'use strict';
const {randomUUID}=require('node:crypto');
const uuid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const error=(message,status=400)=>Object.assign(new Error(message),{status});
function createCollaborationService(repo){
 async function access(projectId,taskId,ctx){
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(taskId))throw error('Mã nhiệm vụ không hợp lệ');
  const plan=await repo.plan(projectId);
  if(!plan||plan.company_id!==ctx.companyId)throw error('Không có kế hoạch trong phạm vi quyền',403);
  const task=plan.document?.active?.graph?.tasks.find(t=>t.id===taskId);
  if(!task)throw error('Không tìm thấy nhiệm vụ đã duyệt',404);
  if(!ctx.manager&&task.assignee_id!==ctx.actorId)throw error('Chỉ người được giao hoặc quản lý được mở trao đổi nhiệm vụ',403);
  return task;
 }
 async function list(p,t,ctx,offset){await access(p,t,ctx);const comments=await repo.comments(p,t,offset);const ids=[...new Set(comments.flatMap(c=>c.file_ids))];const files=await repo.files(p,t,ids);return {comments:comments.map(c=>({...c,attachments:c.file_ids.map(id=>files.find(f=>f.id===id)).filter(Boolean).map(f=>({id:f.id,name:f.name,bytes:f.bytes}))})),more:comments.length===30,next_offset:offset+30};}
 async function post(p,t,ctx,body){await access(p,t,ctx);
  const content=String(body.body||'').trim(),ids=body.file_ids||[];
  if(!uuid(body.id)||content.length>5000||!Array.isArray(ids)||ids.length>10||ids.some(id=>!uuid(id))||new Set(ids).size!==ids.length||(!content&&!ids.length))throw error('Bình luận cần nội dung hoặc tệp hợp lệ (tối đa 10 tệp, 5.000 ký tự)');
  const files=await repo.files(p,t,ids);
  if(files.length!==ids.length||files.some(f=>f.company_id!==ctx.companyId||f.author_id!==ctx.actorId))throw error('Tệp phải do anh/chị tải lên đúng nhiệm vụ',403);
  const row={id:body.id,project_id:p,task_id:t,company_id:ctx.companyId,author_id:ctx.actorId,body:content,file_ids:ids};
  const prior=await repo.comment(body.id);
  const matches=r=>['project_id','task_id','company_id','author_id','body'].every(k=>r[k]===row[k])&&JSON.stringify(r.file_ids)===JSON.stringify(ids);
  if(prior){if(!matches(prior))throw error('Mã bình luận đã dùng cho nội dung khác',409);return {id:prior.id};}
  try{return await repo.insertComment(row);}catch(e){if(e.code==='23505'){const replay=await repo.comment(row.id);if(replay&&matches(replay))return {id:replay.id};throw error('Mã bình luận đã dùng',409);}throw e;}
 }
 async function upload(p,t,ctx,file){await access(p,t,ctx);if(!file?.buffer?.length||file.buffer.length>8388608)throw error('Tệp cần có nội dung và không quá 8 MB',413);
  const id=randomUUID(),name=String(file.originalname||'Tài liệu').replace(/[\u0000-\u001f\\/]/g,'_').slice(0,200);
  const storage_path=`${ctx.companyId}/${p}/${t}/${ctx.actorId}/${id}`;
  await repo.upload(storage_path,file.buffer);
  try{return await repo.insertFile({id,project_id:p,company_id:ctx.companyId,task_id:t,author_id:ctx.actorId,name,bytes:file.buffer.length,storage_path});}
  catch(e){
    // Network failure can mean metadata committed but its response was lost.
    // Compensate only a definite SQL rejection, never an unknown outcome.
    if(['42501','40001','23503','23514','22P02','42P01'].includes(e.code)){
      try{await repo.removeUploaded(storage_path);}catch{console.warn('[work-plan-files] Private upload cleanup pending');}
    }else console.warn('[work-plan-files] Metadata outcome unknown; private object retained for reconciliation');
    throw e;
  }
 }
 async function download(p,t,ctx,id){await access(p,t,ctx);if(!uuid(id))throw error('Mã tệp không hợp lệ');const [file]=await repo.files(p,t,[id]);if(!file||file.company_id!==ctx.companyId)throw error('Không tìm thấy tệp',404);return repo.signed(file.storage_path);}
 return {access,list,post,upload,download};
}
module.exports={createCollaborationService};
