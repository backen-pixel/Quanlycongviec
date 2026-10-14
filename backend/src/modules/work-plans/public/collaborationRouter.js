'use strict';
const {Router}=require('express'),multer=require('multer');
const {createCollaborationService}=require('../application/collaboration');
function createCollaborationRouter({repository,scope,isManager}){
 const r=Router({mergeParams:true}),service=createCollaborationService(repository);
 r.use(async(req,res,next)=>{if(process.env.WORK_PLANS_COLLABORATION_ENABLED!=='1')return res.status(503).json({error:'Trao đổi nhiệm vụ kế hoạch chưa được bật'});try{const access=await scope(req,res,req.params.id);if(!access)return;req.planContext={companyId:access.project.company_id,actorId:req.user.userId,manager:isManager(req.user,access.project)};await service.access(req.params.id,req.params.taskId,req.planContext);res.set('Cache-Control','no-store');next();}catch(e){res.status(e.status||503).json({error:e.status?e.message:'Không đọc được trao đổi nhiệm vụ'});}});
 const handle=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.status||503).json({error:e.status?e.message:'Không lưu/đọc được trao đổi. Vui lòng thử lại.'});}};
 r.get('/comments',handle(async(req,res)=>{const offset=Number(req.query.offset||0);if(!Number.isInteger(offset)||offset<0||offset>100000)return res.status(400).json({error:'Trang không hợp lệ'});res.json(await service.list(req.params.id,req.params.taskId,req.planContext,offset));}));
 r.post('/comments',handle(async(req,res)=>res.json(await service.post(req.params.id,req.params.taskId,req.planContext,req.body))));
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8388608,files:1,fields:0}}).single('file');
 r.post('/files',(req,res,next)=>upload(req,res,e=>e?res.status(413).json({error:'Chọn một tệp tối đa 8 MB'}):next()),handle(async(req,res)=>res.json(await service.upload(req.params.id,req.params.taskId,req.planContext,req.file))));
 r.get('/files/:fileId',handle(async(req,res)=>res.json(await service.download(req.params.id,req.params.taskId,req.planContext,req.params.fileId))));
 return r;
}
module.exports={createCollaborationRouter};
