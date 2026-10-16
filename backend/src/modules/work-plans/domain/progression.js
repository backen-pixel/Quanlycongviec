'use strict';
// Stage cards are projections of task readiness/execution, never scheduling gates.
function progression(result) {
  const closed=t=>!t.needs_review&&['done','waived'].includes(t.status);
  const stages=result.graph.stages.map(s=>{
    const tasks=result.tasks.filter(t=>t.stage_id===s.id);
    const open=tasks.filter(t=>!closed(t));
    return {...s,total:tasks.length,closed:tasks.length-open.length,
      complete:tasks.length===0||open.length===0,
      ready:open.some(t=>t.ready),review:open.some(t=>t.needs_review),
      in_progress:open.some(t=>t.ready||t.status==='doing'||t.needs_review)};
  });
  const current=stages.find(s=>!s.complete)||null;
  return {stages,current,complete:current===null,
    active_stages:stages.filter(s=>!s.complete&&s.in_progress),
    waiting_stages:stages.filter(s=>!s.complete&&!s.in_progress),
    parallel:stages.filter(s=>s.id!==current?.id&&!s.complete&&s.ready)};
}
module.exports={progression};
