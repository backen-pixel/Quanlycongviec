'use strict';
const {Router}=require('express');
const {createMeasurementSnapshot}=require('../../../modules/marketingAutomation/measurementSnapshot');
const {supabase}=require('../../../config/supabase');
const state=require('../../../config/supabaseRouter');
const measurementSnapshot=createMeasurementSnapshot({db:supabase,isPrimary:()=>!state.isFailoverEnabled()&&state.getActiveTarget()==='primary'});
const {createTrialService}=require('../../../modules/marketingAutomation/trialService');
const {createOperationsReport}=require('../../../modules/marketingAutomation/operationsReport');
const operations=createOperationsReport({db:supabase,isPrimary:()=>!state.isFailoverEnabled()&&state.getActiveTarget()==='primary'});
const {createCensusAdmin}=require('../../../modules/marketingAutomation/facebookLeadCensusAdmin');
const {createSourceExport}=require('../../../modules/marketingAutomation/sourceExport');
const sourceExport=createSourceExport({db:supabase,isPrimary:()=>!state.isFailoverEnabled()&&state.getActiveTarget()==='primary'});
const {createSourceRegistry}=require('../../../modules/marketingAutomation/sourceRegistry');
const registry=createSourceRegistry({db:supabase,isPrimary:()=>!state.isFailoverEnabled()&&state.getActiveTarget()==='primary'});
const census=createCensusAdmin({db:supabase,isPrimary:()=>!state.isFailoverEnabled()&&state.getActiveTarget()==='primary'});
const service=createTrialService({db:supabase,isPrimary:()=>!state.isFailoverEnabled()&&state.getActiveTarget()==='primary'}),r=Router();
async function handle(req,res,action){
 res.set('Cache-Control','no-store');
 if(process.env.VPT_MARKETING_TRIAL_REPORT!=='1')return res.status(503).json({error:'Bảng đo khách và chi tiêu chưa được mở.'});
 const actorId=req.user?.userId,companyId=req.query.company_id;
 if(!actorId||(req.user.id&&req.user.id!==actorId))return res.status(403).json({error:'Chưa xác định được người thực hiện.'});
 try{const c={actorId,companyId};return res.json(await(action==='list'?service.list(c):action==='configure'?service.configure(c,req.body):service.report(c,req.params.trialId)));}
 catch(e){return res.status(e.status||503).json({error:e.status===403?'Không có quyền xem dữ liệu công ty này.':e.status===409?'Cấu hình đã thay đổi; cần tải lại.':e.status===400?'Cần tên kỳ đo và khoảng đúng 30 ngày theo giờ Việt Nam.':'Chưa đọc được đủ dữ liệu kỳ đo. Vui lòng thử lại.'});}
}
r.get('/marketing-trials/:trialId/source-exports',(req,res)=>sourceExport(req,res));
r.get('/marketing-trials/:trialId/measurement-snapshots',(req,res)=>measurementSnapshot(req,res));
r.post('/marketing-trials/:trialId/measurement-snapshots',(req,res)=>measurementSnapshot(req,res,true));
r.post('/marketing-trials/:trialId/source-exports',(req,res)=>sourceExport(req,res,true));
r.get('/marketing-operations',(req,res)=>operations(req,res));
r.get('/marketing-trials',(req,res)=>handle(req,res,'list'));
r.post('/marketing-trials',(req,res)=>handle(req,res,'configure'));
r.get('/marketing-trials/:trialId/report',(req,res)=>handle(req,res,'report'));
r.get('/marketing-trials/:trialId/source-registry',(req,res)=>registry(req,res));
r.post('/marketing-trials/:trialId/source-registry',(req,res)=>registry(req,res,true));
r.get('/marketing-trials/:trialId/reconciliation',(req,res)=>census(req,res,false));
r.post('/marketing-trials/:trialId/reconciliation',(req,res)=>census(req,res,true));
module.exports=r;
