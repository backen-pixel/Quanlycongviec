'use strict';
function createCollaborationRepository(db){
 const unwrap=r=>{if(r.error){r.error.status=r.error.code==='42501'?403:r.error.code==='40001'?409:undefined;throw r.error;}return r.data;};
 const filter=(q,p,t)=>q.eq('project_id',p).eq('task_id',t);
 return {
  plan:async p=>unwrap(await db.from('work_plan_instances').select('company_id,document').eq('project_id',p).maybeSingle()),
  comments:async(p,t,offset)=>unwrap(await filter(db.from('work_plan_comments').select('id,body,file_ids,author_id,created_at,author:users!work_plan_comments_author_id_fkey(full_name)'),p,t).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+29)),
  comment:async id=>unwrap(await db.from('work_plan_comments').select('*').eq('id',id).maybeSingle()),
  insertComment:async row=>unwrap(await db.from('work_plan_comments').insert(row).select('id').single()),
  files:async(p,t,ids)=>ids.length?unwrap(await filter(db.from('work_plan_files').select('*'),p,t).in('id',ids)):[],
  insertFile:async row=>unwrap(await db.from('work_plan_files').insert(row).select('id,name,bytes').single()),
  hasHistory:async(p,ids)=>{for(const table of ['work_plan_comments','work_plan_files']){const rows=unwrap(await db.from(table).select('id').eq('project_id',p).in('task_id',ids).limit(1));if(rows.length)return true;}return false;},
  upload:async(path,buffer)=>unwrap(await db.storage.from('work-plan-files').upload(path,buffer,{contentType:'application/octet-stream',upsert:false})),
  signed:async(path)=>unwrap(await db.storage.from('work-plan-files').createSignedUrl(path,60,{download:true})),
  removeUploaded:async(path)=>unwrap(await db.storage.from('work-plan-files').remove([path])),
 };
}
module.exports={createCollaborationRepository};
