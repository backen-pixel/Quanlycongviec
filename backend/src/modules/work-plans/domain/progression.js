'use strict';
// A project occupies the first unfinished stage in the approved plan order.
// Other ready stages remain visible: finishing a parallel branch cannot skip it.
function progression(result) {
  const closed=t=>!t.needs_review&&['done','waived'].includes(t.status);
  const stages=result.graph.stages.map(s=>{
    const tasks=result.tasks.filter(t=>t.stage_id===s.id);
    const open=tasks.filter(t=>!closed(t));
    return {...s,total:tasks.length,closed:tasks.length-open.length,
      complete:tasks.length===0||open.length===0,
      ready:open.some(t=>t.ready),review:open.some(t=>t.needs_review)};
  });
  const current=stages.find(s=>!s.complete)||null;
  return {stages,current,complete:current===null,
    parallel:stages.filter(s=>s.id!==current?.id&&!s.complete&&s.ready)};
}
module.exports={progression};
