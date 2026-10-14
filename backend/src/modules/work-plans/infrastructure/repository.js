'use strict';
function createRepository(db) {
  function unwrap(result) { if (result.error) { const e = new Error(result.error.message); e.status = ['40001','P0002'].includes(result.error.code) ? 409 : result.error.code === '42501' ? 403 : 500; throw e; } return result.data; }
  return {
    listPlans: async (company,offset,actor) => {
      const query=()=>db.from('work_plan_instances').select('project_id,company_id,revision,document').order('project_id').range(offset,offset+49);
      const results=await Promise.all([company?query().eq('company_id',company):Promise.resolve({data:[]}),
        query().contains('document',{active:{graph:{tasks:[{assignee_id:actor}]}}})]);
      const groups=results.map(unwrap);
      return {rows:[...new Map(groups.flat().map(r=>[r.project_id,r])).values()],more:groups.some(g=>g.length===50)};
    },
    getPlan: async id => unwrap(await db.from('work_plan_instances').select('company_id,revision,document').eq('project_id',id).maybeSingle()),
    versionAsOf: async (id,end) => unwrap(await db.from('work_plan_versions').select('revision,document').eq('project_id',id).lt('created_at',end).order('revision',{ascending:false}).limit(1).maybeSingle()),
    replay: async (id, hash, context) => {
      const row = unwrap(await db.from('work_plan_commands').select('request_hash,company_id,actor_id,result').eq('command_id',id).maybeSingle());
      if (!row) return null;
      if (row.request_hash !== hash || row.company_id !== context.companyId || row.actor_id !== context.actorId) { const e = new Error('Mã lệnh đã được sử dụng'); e.status = 409; throw e; }
      return row.result;
    },
    commit: async (kind,id,expected,command,hash,document,context) => unwrap(await db.rpc('work_plan_commit', {
      p_kind: kind, p_id: id, p_company: context.companyId, p_actor: context.actorId, p_expected: expected,
      p_command: command, p_hash: hash, p_document: document,
    })),
    getTemplate: async (id,version,company) => unwrap(await db.from('work_plan_template_versions').select('template_id,version,document').eq('template_id',id).eq('version',version).eq('company_id',company).maybeSingle()),
    listTemplates: async company => unwrap(await db.from('work_plan_template_versions').select('template_id,version,document,created_at').eq('company_id',company).order('created_at',{ascending:false}).limit(200)),
    history: async id => unwrap(await db.from('work_plan_versions').select('revision,document,created_at').eq('project_id',id).order('revision',{ascending:false}).limit(50)),
  };
}
module.exports = { createRepository };
