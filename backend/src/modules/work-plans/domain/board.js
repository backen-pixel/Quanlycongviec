'use strict';
const {schedule}=require('./schedule');
function summarizeBoard(document,context,now=new Date().toISOString()) {
  if(!document?.active)return {state:document?.draft?'draft':'none',scope:context.manager?'project':'assigned'};
  const active=document.active;
  const result=schedule(active.graph,active.deadline,now,document.execution);
  const tasks=context.manager?result.tasks:result.tasks.filter(t=>t.assignee_id===context.actorId);
  const closed=t=>!t.needs_review&&['done','waived'].includes(t.status);
  const open=tasks.filter(t=>!closed(t));
  const ready=open.filter(t=>t.ready);
  const ids=new Set(ready.map(t=>t.stage_id));
  return {state:'approved',scope:context.manager?'project':'assigned',deadline:active.deadline,
    total:tasks.length,completed:tasks.filter(t=>!t.needs_review&&t.status==='done').length,
    waived:tasks.filter(t=>!t.needs_review&&t.status==='waived').length,
    overdue:open.filter(t=>t.overdue).length,needs_review:open.filter(t=>t.needs_review).length,
    complete:tasks.length>0&&open.length===0,
    open_stages:result.graph.stages.filter(s=>ids.has(s.id)).map(s=>({id:s.id,name:s.name})),
    blocked:open.length>0&&ready.length===0};
}
module.exports={summarizeBoard};
