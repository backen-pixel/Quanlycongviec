# Rà soát cột không tồn tại — 0 cột sai, 0 vị trí gọi

Mỗi dòng dưới đây là một truy vấn mà Postgres trả `42703` và **cả câu hỏng**.

| Bảng.cột sai | Cột đúng (gợi ý) | Số chỗ | Kiểu hỏng | Vị trí |
|---|---|---|---|---|

## Ứng viên từ bộ lọc — CẦN RÀ TAY, phần lớn là lỗi giả

| Bảng.cột | Số chỗ | Vị trí |
|---|---|---|
| `projects.division_id` | 10 | `routes/logistics.js:715`<br>`routes/logistics.js:734`<br>`routes/logistics.js:753`<br>… +7 |
| `crm_pipeline_stages.pipeline_stage_id` | 4 | `routes/crm/routes/taskTemplates.js:172`<br>`routes/crm/routes/taskTemplates.js:174`<br>`routes/crm/routes/taskTemplates.js:198`<br>… +1 |
| `companies.company_id` | 3 | `helpers/tenantScope.js:145`<br>`helpers/tenantScope.js:245`<br>`routes/projects.js:259` |
| `customers.next_follow_up` | 3 | `routes/crm/shared/helpersBundle.js:4685`<br>`routes/crm/shared/helpersBundle.js:4687`<br>`routes/crm/shared/helpersBundle.js:4688` |
| `crm_lead_types.stage_id` | 2 | `routes/crm/shared/helpersBundle.js:4314`<br>`routes/crm/shared/helpersBundle.js:4315` |
| `crm_leads.module` | 2 | `routes/events.js:606`<br>`routes/events.js:610` |
| `crm_leads.sx_kanban_column_id` | 2 | `routes/production.js:1763`<br>`routes/production.js:1764` |
| `crm_leads.workshop_type_id` | 2 | `routes/production.js:1746`<br>`routes/production.js:1747` |
| `crm_pipeline_stages.company_id` | 2 | `helpers/workshopKanban.js:1830`<br>`routes/crm/shared/helpersBundle.js:4242` |
| `crm_pipelines.pipeline_id` | 2 | `routes/crm/routes/leadsList.js:1444`<br>`routes/crm/routes/dashboard.js:107` |
| `customers.customer_id` | 2 | `routes/crm/shared/helpersBundle.js:4713`<br>`routes/crm/routes/commercialDocs.js:426` |
| `customers.region_id` | 2 | `routes/crm/shared/helpersBundle.js:4722`<br>`routes/crm/shared/helpersBundle.js:4728` |
| `departments.department_id` | 2 | `routes/users.js:775`<br>`routes/teams.js:25` |
| `departments.full_name` | 2 | `helpers/userPresence.js:305`<br>`routes/users.js:783` |
| `drive_files.parent_id` | 2 | `routes/drive.js:567`<br>`routes/drive.js:568` |
| `projects.due_date` | 2 | `routes/dashboard.js:948`<br>`routes/dashboard.js:1248` |
| `purchase_requests.stage_id` | 2 | `routes/management.js:1712`<br>`routes/management.js:1714` |
| `crm_leads.assignee_id` | 1 | `helpers/unifiedTasksQuery.js:67` |
| `crm_leads.lead_id` | 1 | `routes/crm/shared/helpersBundle.js:5809` |
| `crm_leads.priority` | 1 | `routes/production.js:1754` |
| `crm_leads.production_person_id` | 1 | `routes/production.js:1762` |
| `crm_pipelines.pipeline_stage_id` | 1 | `routes/crm/routes/taskTemplates.js:188` |
| `customers.lead_type_id` | 1 | `routes/crm/shared/helpersBundle.js:4711` |
| `customers.pipeline_id` | 1 | `routes/crm/shared/helpersBundle.js:4684` |
| `customers.referrer_name` | 1 | `routes/crm/shared/helpersBundle.js:4712` |
| `customers.source_id` | 1 | `routes/crm/shared/helpersBundle.js:4706` |
| `drive_files.is_trashed` | 1 | `helpers/tenantQuotas.js:201` |
| `ecosystem_levels.is_active` | 1 | `routes/dashboard.js:1370` |
| `facebook_pages.lead_id` | 1 | `routes/facebook.js:4327` |
| `projects.parent_lead_id` | 1 | `routes/management.js:868` |
| `projects.project_id` | 1 | `routes/crm/routes/leadsList.js:214` |
| `purchase_requests.deadline` | 1 | `routes/management.js:1737` |
| `role_permissions.role` | 1 | `test-permissions.js:59` |
| `tasks.sx_pipeline_stage_id` | 1 | `helpers/clearCompletedProjectDeadlines.js:223` |
| `tasks.type` | 1 | `helpers/clearCompletedProjectDeadlines.js:223` |
| `workflow_stages.vc_deleted_at` | 1 | `routes/logistics.js:124` |
