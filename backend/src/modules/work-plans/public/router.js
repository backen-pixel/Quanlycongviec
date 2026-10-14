'use strict';
const { Router } = require('express');
const { createService } = require('../application/service');
const { normalize } = require('../domain/schedule');
function createRouter({ repository, auth, scope, isManager, validateAssignees }) {
  const router = Router(); const service = createService(repository);
  router.use(auth);
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
