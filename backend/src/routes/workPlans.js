'use strict';
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { assertProjectAccessible } = require('../helpers/projectAccessScope');
const { canManage } = require('../modules/work-plans/application/permissions');
const { createRepository } = require('../modules/work-plans/infrastructure/repository');
const { createRouter } = require('../modules/work-plans/public/router');
const {createCollaborationRepository}=require('../modules/work-plans/infrastructure/collaborationRepository');
const {createCollaborationRouter}=require('../modules/work-plans/public/collaborationRouter');
const collaborationRepository=createCollaborationRepository(supabase);
const scope=(req,res,id)=>assertProjectAccessible(req,res,id,{mode:'company',operation:req.method==='GET'?'READ':'WRITE'});
module.exports = createRouter({
  repository: createRepository(supabase), auth,
  collaborationRouter:createCollaborationRouter({repository:collaborationRepository,scope,isManager:canManage}),
  // Commands additionally gate manager / task owner after project and tenant scope.
  scope: (req,res,id) => assertProjectAccessible(req,res,id,{mode:'company',operation:req.method === 'GET' ? 'READ' : 'WRITE'}),
  isManager: canManage,
  validateAssignees: async (tasks,ctx,projectId) => {
    const ids = [...new Set(tasks.map(t => t.assignee_id).filter(Boolean))]; if (!ids.length) return;
    const { data, error } = await supabase.from('users').select('id,company_id').in('id',ids);
    if (error) throw error;
    const { data: staff, error: staffError } = await supabase.from('project_production_staff').select('user_id').eq('project_id',projectId).in('user_id',ids);
    if (staffError) throw staffError;
    if (ids.some(id => !data.some(u => u.id === id && (u.company_id === ctx.companyId || staff.some(s => s.user_id === id))))) {
      const e = new Error('Người phụ trách phải thuộc công ty hoặc đội sản xuất của dự án'); e.status = 400; throw e;
    }
  },
});
