// ═══════════════════════════════════════════════════════════
// UPDATE for /projects/create-with-flow
// Use flow_step_tasks instead of template tasks
// ═══════════════════════════════════════════════════════════

// Replace the section in projects.js starting from line ~480 where it says:
// "If template_set_id → generate tasks from template"

// OLD CODE (lines ~490-560):
// if (assignment.template_set_id) {
//   const { data: tplTasks } = await supabase.from('company_template_tasks')...
// }

// ─── NEW CODE: Use flow_step_tasks ───
if (assignment.flow_step_id) {
  // Load tasks from flow step (not template!)
  const { data: flowTasks } = await supabase
    .from('flow_step_tasks')
    .select(`
      *,
      checklists:flow_step_task_checklists(*)
    `)
    .eq('flow_step_id', assignment.flow_step_id)
    .eq('is_active', true)
    .order('order_index');

  if (flowTasks?.length) {
    for (const t of flowTasks) {
      // Calculate due date
      let dueDate = null;
      if (t.estimated_days > 0) {
        dueDate = new Date(stepStartDate);
        dueDate.setDate(dueDate.getDate() + t.estimated_days);
      }

      // Determine assignee
      let finalAssignee = null;
      
      if (t.assigned_user_id) {
        // Use specific user from flow
        finalAssignee = t.assigned_user_id;
      } else if (t.assignee_field && project[t.assignee_field + '_id']) {
        // Fallback to field (e.g., project.sales_person_id)
        finalAssignee = project[t.assignee_field + '_id'];
      }
      
      // Override from frontend if provided
      const taskKey = t.id;
      if (b.task_assignments?.[taskKey]) {
        finalAssignee = b.task_assignments[taskKey];
      }

      // Create project task
      const { data: task, error: taskErr } = await supabase
        .from('tasks')
        .insert({
          project_id: projectId,
          stage_id: t.stage_id,
          title: t.title,
          description: t.description || null,
          assignee_id: finalAssignee,
          priority: t.priority || 'medium',
          status: 'pending',
          order_index: t.order_index,
          created_by_id: req.user.userId,
          due_date: dueDate ? dueDate.toISOString() : null,
          estimated_hours: (t.estimated_days || 0) * 8, // Convert days to hours
          task_type: 'project',
          metadata: { 
            flow_step_task_id: t.id,
            flow_step_id: assignment.flow_step_id,
            template_task_id: t.template_task_id, // Link to original template if exists
          },
        })
        .select()
        .single();

      if (taskErr) {
        console.error('Task create error:', taskErr);
        continue;
      }

      // Create checklists from flow task
      if (t.checklists?.length) {
        for (const c of t.checklists) {
          // Determine checklist assignee
          let checklistAssignee = c.assigned_user_id || finalAssignee;
          
          // Override from frontend if provided
          const checklistKey = `checklist_${c.id}`;
          if (b.task_assignments?.[checklistKey]) {
            checklistAssignee = b.task_assignments[checklistKey];
          }

          try {
            await supabase.from('task_checklists').insert({
              task_id: task.id,
              label: c.label,
              order_index: c.order_index || 0,
              is_required: c.is_required || false,
              is_completed: false,
              assigned_user_id: checklistAssignee, // ← Use new column
            });
          } catch (ce) {
            console.warn('Checklist insert error:', ce.message);
          }
        }
      }

      allCreatedTasks.push(task);

      // Notify assignee
      if (finalAssignee) {
        await createNotification(
          req,
          finalAssignee,
          'task_assigned',
          '📌 Nhiệm vụ mới',
          `${t.title} — DA ${code}`,
          'project',
          projectId
        );
      }

      // Update step start date for next tasks
      if (dueDate && dueDate > stepStartDate) {
        stepStartDate = dueDate;
      }
    }

    // Calculate max deadline for this step
    const maxDeadline = flowTasks.reduce((max, t) => {
      if (t.estimated_days > 0) {
        const d = new Date(stepStartDate);
        d.setDate(d.getDate() + t.estimated_days);
        return d > max ? d : max;
      }
      return max;
    }, stepStartDate);
    stepStartDate = maxDeadline;
  }
}

// ═══════════════════════════════════════════════════════════
// ALSO UPDATE: flow_assignments structure
// ═══════════════════════════════════════════════════════════

// Frontend should send:
// b.flow_assignments = [
//   {
//     flow_step_id: 'uuid',       ← NEW! Flow step ID
//     division_unit_id: 'uuid',
//     company_unit_id: 'uuid',
//     template_set_id: 'uuid',    ← Still keep for reference
//     order_index: 0,
//   }
// ]

// ═══════════════════════════════════════════════════════════
// BENEFITS:
// ═══════════════════════════════════════════════════════════
// 1. Uses flow_step_tasks (customized per flow)
// 2. Respects assigned_user_id (specific user)
// 3. Falls back to assignee_field (sales_person, etc.)
// 4. Supports checklist-level assignment
// 5. Maintains template link for reference

// ═══════════════════════════════════════════════════════════
// IMPLEMENTATION NOTES:
// ═══════════════════════════════════════════════════════════
// 1. Replace section in projects.js line ~490-560
// 2. Update frontend CreateProjectNew to send flow_step_id
// 3. Test with flow that has:
//    - Tasks with assigned_user_id
//    - Tasks with assignee_field
//    - Checklists with different assignees
