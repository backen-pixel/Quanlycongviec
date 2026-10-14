'use strict';
const { Router } = require('express');
const { createService } = require('../application/service');
const { normalize } = require('../domain/schedule');
const { reportWindow, summarizePlans } = require('../domain/report');
const {summarizeBoard}=require('../domain/board');
function createRouter({ repository, auth, scope, isManager, validateAssignees }) {
  const router = Router(); const service = createService(repository);
  router.use(auth);
  router.get('/board',async(req,res)=>{
    if(process.env.WORK_PLANS_AGGREGATES_ENABLED!=='1')return res.json({enabled:false,items:[]});
    try{
      const ids=[...new Set(String(req.query.ids||'').split(',').filter(Boolean))];
      if(!ids.length||ids.length>30||ids.some(id=>!/^[0-9a-f-]{36}$/i.test(id)))return res.status(400).json({error:'Cần 1–30 mã dự án hợp lệ'});
      const items=[];
      const readAt=new Date().toISOString();
      for(const id of ids){
        const access=await scope(req,{status:()=>({json:()=>{}})},id);
        if(!access)continue;
        const row=await repository.getPlan(id);
        if(row&&row.company_id!==access.project.company_id)continue;
        const ctx={manager:isManager(req.user,access.project),actorId:req.user.userId};
        const summary=summarizeBoard(row?.document,ctx,readAt);
        let templateName=null;
        const source=row?.document?.active?.source_template;
        if(source&&ctx.manager){const t=await repository.getTemplate(source.id,source.version,access.project.company_id);templateName=t?.document?.name||null;}
        items.push({project_id:id,...summary,template_name:templateName});
      }
      res.json({enabled:true,read_at:readAt,items});
    }catch(e){res.status(e.status||503).json({error:'Không tải đủ tiến độ kế hoạch sản xuất'});}
  });
  router.get('/report', async (req,res) => {
    if (process.env.WORK_PLANS_AGGREGATES_ENABLED !== '1') return res.json({enabled:false});
    try {
      const window = reportWindow(req.query.date);
      const company = req.query.company_id || req.user.company_id;
      if (!company) return res.status(400).json({error:'Chọn công ty để xem báo cáo sản xuất'});
      const plans = [];
      const seen = new Set();
      for (let offset=0;;offset+=50) {
        if (offset > 100000) throw new Error('Report scan exceeded limit');
        const page = await repository.listPlans(company,offset,req.user.userId);
        for (const row of page.rows) {
          if (row.company_id !== company || seen.has(row.project_id)) continue;
          seen.add(row.project_id);
          const access = await scope(req,{status:()=>({json:()=>{}})},row.project_id);
          if (!access || access.project.company_id !== company) continue;
          const prior = await repository.versionAsOf(row.project_id,new Date(window.end).toISOString());
          if (prior?.document?.active) plans.push({project_id:row.project_id,document:prior.document,actor_id:req.user.userId,can_manage:isManager(req.user,access.project)});
        }
        if (!page.more) break;
      }
      const result=summarizePlans(plans,window);
      const labels=await repository.reportLabels([...new Set(result.tasks.map(t=>t.project_id))],[...new Set(result.tasks.map(t=>t.assignee_id).filter(Boolean))]);
      const projects=new Map(labels.projects.map(p=>[p.id,p])),users=new Map(labels.users.map(u=>[u.id,u]));
      result.tasks=result.tasks.map(t=>({...t,project_code:projects.get(t.project_id)?.code||null,project_name:projects.get(t.project_id)?.name||null,assignee_name:users.get(t.assignee_id)?.full_name||null}));
      res.json({enabled:true,...result});
    } catch(e) {res.status(e.status||503).json({error:e.status?e.message:'Không tải đủ dữ liệu lịch sử kế hoạch sản xuất'});}
  });
  async function context(req,res) {
    const access = await scope(req,res,req.params.id); if (!access) return null;
    if (!access.project.company_id) { res.status(400).json({ error: 'Dự án cần có công ty sản xuất trước khi lập kế hoạch' }); return null; }
    return { companyId: access.project.company_id, actorId: req.user.userId, manager: isManager(req.user,access.project) };
  }
  const handle = fn => async (req,res) => { try { const ctx = await context(req,res); if (!ctx) return; await fn(req,res,ctx); } catch(e) { if (!res.headersSent) res.status(e.status || 500).json({error: e.status ? e.message : 'Không thể xử lý kế hoạch. Kiểm tra migration và kết nối dữ liệu.'}); } };
  router.get('/', async (req,res) => {
    try {
      // Company is server-owned; also include explicitly assigned cross-company projects.
      const offset = Math.max(0,Math.min(100000,parseInt(req.query.offset,10)||0));
      const candidates = await repository.listPlans(req.user.company_id,offset,req.user.userId);
      const rows = candidates.rows || candidates; const items=[];
      for (const row of rows) {
        const access = await scope(req,{status:()=>({json:()=>{}})},row.project_id); if (!access) continue;
        const ctx = {companyId:access.project.company_id,actorId:req.user.userId,manager:isManager(req.user,access.project)};
        const plan = await service.view(row.project_id,ctx);
        if (plan.schedule) items.push({project_id:row.project_id,can_manage:ctx.manager,schedule:plan.schedule});
      }
      res.json({items,more:candidates.more??rows.length===50,next_offset:offset+50});
    } catch(e) {res.status(e.status||500).json({error:'Không tải được danh sách kế hoạch'});}
  });
  router.get('/:id', handle(async (req,res,ctx) => res.json(await service.view(req.params.id,ctx))));
  router.get('/:id/templates', handle(async (req,res,ctx) => res.json(await repository.listTemplates(ctx.companyId))));
  router.get('/:id/history', handle(async (req,res,ctx) => {
    if (!ctx.manager) return res.status(403).json({error:'Chỉ quản lý được xem lịch sử kế hoạch'});
    res.json(await repository.history(req.params.id));
  }));
  router.post('/:id/commands', handle(async (req,res,ctx) => {
    if (req.body.action === 'draft') {
      if (!ctx.manager) return res.status(403).json({error:'Chỉ quản lý dự án được lập kế hoạch'});
      await validateAssignees(normalize(req.body.graph).tasks, ctx, req.params.id);
    }
    res.json(await service.command(req.params.id,req.body,ctx));
  }));
  router.post('/:id/templates', handle(async (req,res,ctx) => res.json(await service.publishTemplate(req.body,ctx))));
  return router;
}
module.exports = { createRouter };
