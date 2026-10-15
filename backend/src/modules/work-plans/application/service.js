'use strict';
const { createHash } = require('node:crypto');
const { schedule, templateGraph, fail } = require('../domain/schedule');
const {progression}=require('../domain/progression');
function denied(message) { const e = new Error(message); e.status = 403; throw e; }
function createService(repository, now = () => new Date().toISOString()) {
  async function view(projectId, context) {
    const row = await repository.getPlan(projectId);
    if (row && row.company_id !== context.companyId) denied('Kế hoạch không thuộc công ty của dự án');
    if (!row) return { revision: 0, document: null, can_manage: context.manager };
    return present(row.revision, row.document, context);
  }
  function present(revision, document, context) {
    const active = document.active;
    const result = active ? schedule(active.graph, active.deadline, now(), document.execution) : null;
    return { revision, document, schedule: result, progression:result?progression(result):null,
      preview: document.draft ? schedule(document.draft.graph,document.draft.deadline,now(),document.execution) : null,
      can_manage: context.manager, actor_id: context.actorId };
  }
  async function command(projectId, body, context) {
    if (!Number.isInteger(body.expected_revision) || body.expected_revision < 0) fail('Thiếu phiên bản kế hoạch');
    if (!/^[0-9a-f-]{36}$/i.test(body.command_id || '')) fail('Thiếu mã lệnh chống ghi trùng');
    const hash = createHash('sha256').update(JSON.stringify({ projectId, body, actor: context.actorId })).digest('hex');
    const replay = await repository.replay(body.command_id, hash, context);
    if (replay) return present(replay.revision, replay.document, context);
    const row = await repository.getPlan(projectId);
    if (row && row.company_id !== context.companyId) denied('Kế hoạch khác công ty');
    if ((row?.revision || 0) !== body.expected_revision) { const e = new Error('Kế hoạch đã được người khác cập nhật. Hãy tải lại.'); e.status = 409; throw e; }
    const doc = structuredClone(row?.document || { active: null, draft: null, execution: {}, baselines: [] });
    if (['draft','approve','discard'].includes(body.action)) {
      if (!context.manager) denied('Chỉ quản lý dự án được lập và duyệt kế hoạch');
      if (body.action === 'draft') {
        const preview = schedule(body.graph, body.deadline, now());
        const source = body.source_template ? {id:body.source_template.id,version:body.source_template.version} : null;
        if (source) {
          const version = await repository.getTemplate(source.id, source.version, context.companyId);
          if (!version) fail('Không tìm thấy phiên bản mẫu trong công ty');
        }
        doc.draft = { graph: preview.graph, deadline: preview.deadline, source_template: source,
          reason: String(body.reason || '').trim().slice(0,1000), prepared_at: now() };
      } else if (body.action === 'discard') doc.draft = null;
      else {
        if (!doc.draft) fail('Cần lưu bản nháp trước khi duyệt');
        if (doc.active && !doc.draft.reason) fail('Cần ghi lý do thay đổi kế hoạch');
        const preview = schedule(doc.draft.graph, doc.draft.deadline, now(), doc.execution);
        if (doc.draft.graph.tasks.some(t=>t.required&&!t.assignee_id)) fail('Cần giao người phụ trách cho các nhiệm vụ bắt buộc trước khi duyệt');
        if (!preview.feasible && body.accept_late !== true) fail('Kế hoạch không kịp hạn sản xuất; quản lý cần xác nhận rủi ro trễ');
        if (doc.active) {
          const retained = new Map(doc.draft.graph.tasks.map(t => [t.id,t]));
          for (const oldTask of doc.active.graph.tasks) {
            if (doc.execution[oldTask.id] && !retained.has(oldTask.id)) fail('Không được xóa nhiệm vụ đã có lịch sử thực hiện');
            const next = retained.get(oldTask.id);
            if (['done','waived'].includes(doc.execution[oldTask.id]?.status) && next &&
              (['name','stage_id','required','evidence_required'].some(k=>oldTask[k]!==next[k]) || JSON.stringify(oldTask.dependencies)!==JSON.stringify(next.dependencies))) fail('Mở lại nhiệm vụ trước khi đổi nội dung hoặc điều kiện hoàn thành');
          }
        }
        // Freeze planned dates at approval. Reports must not recalculate an old
        // baseline using today's clock or execution; actuals remain in execution.
        doc.active = { ...doc.draft, approved_at: now(), approved_by: context.actorId,
          plan_schema_version: 2,
          planned_tasks: preview.graph.tasks.map(task => {
            const dates = preview.tasks.find(item => item.id === task.id);
            return { ...task, planned_start: dates.planned_start, deadline: dates.deadline };
          }) };
        doc.baselines.push({ revision: body.expected_revision + 1, deadline: doc.active.deadline, approved_at: doc.active.approved_at, reason: doc.draft.reason });
        doc.draft = null;
      }
    } else if(body.action==='reassign'){
      if(!context.manager)denied('Chỉ quản lý được giao lại nhiệm vụ');
      const task=doc.active?.graph?.tasks.find(t=>t.id===body.task_id);
      if(!task)fail('Không tìm thấy nhiệm vụ đã duyệt');
      if(!/^[0-9a-f-]{36}$/i.test(body.assignee_id||''))fail('Chọn người phụ trách hợp lệ');
      const reason=String(body.reason||'').trim().slice(0,1000);if(!reason)fail('Cần ghi lý do đổi người phụ trách');
      if(['done','waived'].includes(doc.execution[task.id]?.status)&&!doc.execution[task.id]?.needs_review)fail('Mở lại nhiệm vụ đã hoàn thành trước khi giao lại');
      const previous=task.assignee_id;task.assignee_id=body.assignee_id;
      const planned=doc.active.planned_tasks?.find(t=>t.id===task.id);if(planned)planned.assignee_id=body.assignee_id;
      doc.assignment_latest||={};doc.assignment_latest[task.id]={previous,assignee_id:body.assignee_id,reason,actor_id:context.actorId,at:now()};
    } else if (body.action === 'task') {
      if (!doc.active) fail('Kế hoạch chưa được duyệt');
      const task = doc.active.graph.tasks.find(t => t.id === body.task_id);
      if (!task) fail('Không tìm thấy nhiệm vụ');
      if (!context.manager && task.assignee_id !== context.actorId) denied('Chỉ được cập nhật nhiệm vụ được giao cho mình');
      const status = body.status; const reason = String(body.reason || '').trim().slice(0,1000);
      if (!['doing','done','pending','waived'].includes(status)) fail('Trạng thái nhiệm vụ không hợp lệ');
      const prior=doc.execution[task.id]||{};
      if ((status === 'waived' || (['done','waived'].includes(prior.status) && status !== prior.status)) && (!context.manager || !reason)) denied('Quản lý cần ghi lý do bỏ qua hoặc mở lại nhiệm vụ');
      if (status===prior.status && ['done','waived'].includes(status) && !prior.needs_review) fail('Nhiệm vụ đã hoàn thành hoặc được miễn. Tải lại để xem kết quả.');
      if (['doing','done'].includes(status) && !task.dependencies.every(id => !doc.execution[id]?.needs_review && ['done','waived'].includes(doc.execution[id]?.status))) fail('Cần hoàn thành các nhiệm vụ trước');
      const evidence = String(body.evidence || '').trim().slice(0,2000);
      if (status === 'done' && task.evidence_required && !evidence) fail('Cần ghi minh chứng hoàn thành');
      doc.execution[task.id] = { status, evidence, reason, needs_review:false, updated_at: now(), updated_by: context.actorId,
        completed_at: ['done','waived'].includes(status) ? now() : null };
      if (['pending','doing'].includes(status)) {
        // Preserve actual completion/evidence; mark affected results for revalidation.
        const descendants = new Set([task.id]); let changed = true;
        while (changed) { changed = false; for (const t of doc.active.graph.tasks) if (!descendants.has(t.id) && t.dependencies.some(id => descendants.has(id))) { descendants.add(t.id); changed = true; } }
        const closed = [...descendants].filter(id => id !== task.id && ['done','waived'].includes(doc.execution[id]?.status));
        if (closed.length && (!context.manager || !reason || body.reopen_successors !== true)) fail('Mở lại việc trước sẽ yêu cầu kiểm tra lại các việc sau đã hoàn thành. Quản lý cần xác nhận và ghi lý do.');
        closed.forEach(id => { doc.execution[id] = { ...doc.execution[id], needs_review:true, review_reason:reason, review_requested_by:context.actorId, review_requested_at:now() }; });
      }
    } else fail('Lệnh kế hoạch không hợp lệ');
    const result = await repository.commit('plan', projectId, body.expected_revision, body.command_id, hash, doc, context);
    return present(result.revision, result.document, context);
  }
  async function publishTemplate(body, context) {
    if (!context.manager) denied('Chỉ quản lý được xuất bản mẫu');
    const name = String(body.name || '').trim(); if (!name || name.length > 200) fail('Tên mẫu cần 1–200 ký tự');
    const id = body.template_id;
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(body.command_id || '') || !Number.isInteger(body.expected_version) || body.expected_version < 0) fail('Mã hoặc phiên bản mẫu không hợp lệ');
    const document = { name, graph: templateGraph(body.graph) };
    const hash = createHash('sha256').update(JSON.stringify({ id, document, expected: body.expected_version, actor: context.actorId })).digest('hex');
    const result = await repository.commit('template', id, body.expected_version, body.command_id, hash, document, context);
    return { id, version: result.revision, ...result.document };
  }
  return { view, command, publishTemplate };
}
module.exports = { createService };
