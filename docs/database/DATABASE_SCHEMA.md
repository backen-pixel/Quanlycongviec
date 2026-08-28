# Database Schema — Quanlycongviec (Tủ Bếp Pro)

Schema **public** PostgreSQL (Supabase) — **đầy đủ mọi bảng và cột**.

- Cập nhật: **2026-08-20**
- Số bảng: **284**
- Số cột (tổng): **3380**
- Views: `unified_tasks_v`, `v_crm_kpi_user_period`, `v_kpi_user_offdays`, `v_quotations_with_scope`
- Regenerate: `node docs/generate-db-schema-doc.js docs/_tmp_columns.json`

> FK constraints có thể không lộ qua `information_schema` trên một số project Supabase; quan hệ nghiệp vụ xem mục 2 và `docs/cau-truc-he-thong-co-ban/`.

---

## 1. Mục lục bảng theo nhóm

### Tổ chức / Tenant / Phân quyền (45)

- [`companies`](#companies) — 13 cột
- [`company_bank_accounts`](#company_bank_accounts) — 11 cột
- [`company_division_units`](#company_division_units) — 5 cột
- [`company_process_checklists`](#company_process_checklists) — 8 cột
- [`company_process_tasks`](#company_process_tasks) — 13 cột
- [`company_processes`](#company_processes) — 11 cột
- [`company_regions`](#company_regions) — 14 cột
- [`company_template_checklists`](#company_template_checklists) — 11 cột
- [`company_template_sets`](#company_template_sets) — 12 cột
- [`company_template_tasks`](#company_template_tasks) — 16 cột
- [`department_message_reactions`](#department_message_reactions) — 5 cột
- [`department_message_reads`](#department_message_reads) — 4 cột
- [`department_messages`](#department_messages) — 11 cột
- [`departments`](#departments) — 13 cột
- [`division_members`](#division_members) — 5 cột
- [`division_projects`](#division_projects) — 6 cột
- [`ecosystem_levels`](#ecosystem_levels) — 8 cột
- [`ecosystem_module_scopes`](#ecosystem_module_scopes) — 4 cột
- [`ecosystem_unit_members`](#ecosystem_unit_members) — 7 cột
- [`ecosystem_unit_stage_groups`](#ecosystem_unit_stage_groups) — 5 cột
- [`ecosystem_units`](#ecosystem_units) — 22 cột
- [`permission_audit_log`](#permission_audit_log) — 11 cột
- [`permissions`](#permissions) — 6 cột
- [`role_permissions`](#role_permissions) — 4 cột
- [`role_stage_access`](#role_stage_access) — 4 cột
- [`roles`](#roles) — 6 cột
- [`saas_modules`](#saas_modules) — 21 cột
- [`saas_notify_subscribers`](#saas_notify_subscribers) — 6 cột
- [`saas_plans`](#saas_plans) — 18 cột
- [`saas_purchases`](#saas_purchases) — 24 cột
- [`teams`](#teams) — 10 cột
- [`tenant_access_audit`](#tenant_access_audit) — 10 cột
- [`tenant_features`](#tenant_features) — 5 cột
- [`tenants`](#tenants) — 15 cột
- [`user_activity_log`](#user_activity_log) — 20 cột
- [`user_companies`](#user_companies) — 5 cột
- [`user_company_regions`](#user_company_regions) — 3 cột
- [`user_current_location`](#user_current_location) — 9 cột
- [`user_devices`](#user_devices) — 19 cột
- [`user_last_activity`](#user_last_activity) — 2 cột
- [`user_module_roles`](#user_module_roles) — 6 cột
- [`user_permission_overrides`](#user_permission_overrides) — 10 cột
- [`user_permissions`](#user_permissions) — 8 cột
- [`user_roles`](#user_roles) — 6 cột
- [`users`](#users) — 30 cột

### CRM / Lead / Deal / Event (62)

- [`crm_activities`](#crm_activities) — 14 cột
- [`crm_assignment_assignees`](#crm_assignment_assignees) — 4 cột
- [`crm_assignment_columns`](#crm_assignment_columns) — 10 cột
- [`crm_assignment_comments`](#crm_assignment_comments) — 7 cột
- [`crm_assignment_files`](#crm_assignment_files) — 11 cột
- [`crm_assignment_schedule_files`](#crm_assignment_schedule_files) — 10 cột
- [`crm_assignment_schedules`](#crm_assignment_schedules) — 20 cột
- [`crm_assignments`](#crm_assignments) — 28 cột
- [`crm_auto_lead_blocked_phones`](#crm_auto_lead_blocked_phones) — 6 cột
- [`crm_call_logs`](#crm_call_logs) — 18 cột
- [`crm_company_deadline_config`](#crm_company_deadline_config) — 5 cột
- [`crm_company_visible_production_companies`](#crm_company_visible_production_companies) — 4 cột
- [`crm_daily_report_lines`](#crm_daily_report_lines) — 14 cột
- [`crm_daily_report_template_items`](#crm_daily_report_template_items) — 8 cột
- [`crm_daily_report_templates`](#crm_daily_report_templates) — 9 cột
- [`crm_daily_report_user_extras`](#crm_daily_report_user_extras) — 9 cột
- [`crm_daily_report_user_templates`](#crm_daily_report_user_templates) — 6 cột
- [`crm_daily_reports`](#crm_daily_reports) — 12 cột
- [`crm_deal_payments`](#crm_deal_payments) — 14 cột
- [`crm_deal_projects`](#crm_deal_projects) — 7 cột
- [`crm_dept_plan_sheets`](#crm_dept_plan_sheets) — 9 cột
- [`crm_dept_plan_tasks`](#crm_dept_plan_tasks) — 21 cột
- [`crm_event_comments`](#crm_event_comments) — 5 cột
- [`crm_event_participants`](#crm_event_participants) — 5 cột
- [`crm_events`](#crm_events) — 22 cột
- [`crm_followup_care_dismissals`](#crm_followup_care_dismissals) — 8 cột
- [`crm_kpi_ledger`](#crm_kpi_ledger) — 20 cột
- [`crm_kpi_scoring_rules`](#crm_kpi_scoring_rules) — 15 cột
- [`crm_lead_care_marks`](#crm_lead_care_marks) — 6 cột
- [`crm_lead_comment_reactions`](#crm_lead_comment_reactions) — 4 cột
- [`crm_lead_comment_read_receipts`](#crm_lead_comment_read_receipts) — 3 cột
- [`crm_lead_comments`](#crm_lead_comments) — 11 cột
- [`crm_lead_deadline_history`](#crm_lead_deadline_history) — 9 cột
- [`crm_lead_stage_history`](#crm_lead_stage_history) — 12 cột
- [`crm_lead_type_production_links`](#crm_lead_type_production_links) — 7 cột
- [`crm_lead_types`](#crm_lead_types) — 12 cột
- [`crm_lead_user_flags`](#crm_lead_user_flags) — 7 cột
- [`crm_leads`](#crm_leads) — 58 cột
- [`crm_payment_stages`](#crm_payment_stages) — 13 cột
- [`crm_pipeline_stages`](#crm_pipeline_stages) — 31 cột
- [`crm_pipelines`](#crm_pipelines) — 13 cột
- [`crm_referrers`](#crm_referrers) — 6 cột
- [`crm_source_categories`](#crm_source_categories) — 8 cột
- [`crm_sources`](#crm_sources) — 8 cột
- [`crm_task_assignees`](#crm_task_assignees) — 3 cột
- [`crm_task_attachments`](#crm_task_attachments) — 20 cột
- [`crm_task_template_items`](#crm_task_template_items) — 28 cột
- [`crm_task_templates`](#crm_task_templates) — 10 cột
- [`crm_tasks`](#crm_tasks) — 48 cột
- [`crm_user_planner_columns`](#crm_user_planner_columns) — 8 cột
- [`crm_user_planner_items`](#crm_user_planner_items) — 5 cột
- [`crm_zalo_stage_sends`](#crm_zalo_stage_sends) — 7 cột
- [`customer_interactions`](#customer_interactions) — 10 cột
- [`customer_statuses`](#customer_statuses) — 9 cột
- [`customers`](#customers) — 26 cột
- [`deal_cross_module_scores`](#deal_cross_module_scores) — 10 cột
- [`deal_customer_ratings`](#deal_customer_ratings) — 7 cột
- [`event_types`](#event_types) — 10 cột
- [`lead_documents`](#lead_documents) — 24 cột
- [`lead_members`](#lead_members) — 7 cột
- [`lead_message_reactions`](#lead_message_reactions) — 5 cột
- [`lead_messages`](#lead_messages) — 11 cột

### Báo giá / Đơn hàng / Sản phẩm / Mua hàng (26)

- [`invoice_items`](#invoice_items) — 29 cột
- [`invoices`](#invoices) — 45 cột
- [`order_cross_acceptances`](#order_cross_acceptances) — 11 cột
- [`order_items`](#order_items) — 32 cột
- [`orders`](#orders) — 54 cột
- [`payment_records`](#payment_records) — 10 cột
- [`product_brands`](#product_brands) — 9 cột
- [`product_categories`](#product_categories) — 10 cột
- [`product_code_parts`](#product_code_parts) — 8 cột
- [`product_components`](#product_components) — 17 cột
- [`product_structures`](#product_structures) — 8 cột
- [`production_external_companies`](#production_external_companies) — 7 cột
- [`production_handover_settings`](#production_handover_settings) — 5 cột
- [`production_handover_task_assignments`](#production_handover_task_assignments) — 5 cột
- [`production_pipeline_stage_default_staff`](#production_pipeline_stage_default_staff) — 7 cột
- [`production_pipeline_stages`](#production_pipeline_stages) — 26 cột
- [`production_workshop_client_companies`](#production_workshop_client_companies) — 5 cột
- [`production_workshop_type_default_staff`](#production_workshop_type_default_staff) — 7 cột
- [`products`](#products) — 34 cột
- [`purchase_order_items`](#purchase_order_items) — 15 cột
- [`purchase_orders`](#purchase_orders) — 26 cột
- [`purchase_requests`](#purchase_requests) — 21 cột
- [`quotation_edit_history`](#quotation_edit_history) — 7 cột
- [`quotation_items`](#quotation_items) — 31 cột
- [`quotations`](#quotations) — 46 cột
- [`suppliers`](#suppliers) — 14 cột

### Dự án / SX / VC / Workflow / Task (42)

- [`flow_step_processes`](#flow_step_processes) — 6 cột
- [`flow_step_task_checklists`](#flow_step_task_checklists) — 11 cột
- [`flow_step_tasks`](#flow_step_tasks) — 17 cột
- [`logistics_handover_settings`](#logistics_handover_settings) — 5 cột
- [`logistics_pipeline_stages`](#logistics_pipeline_stages) — 16 cột
- [`project_approvals`](#project_approvals) — 15 cột
- [`project_comment_reactions`](#project_comment_reactions) — 4 cột
- [`project_comment_read_receipts`](#project_comment_read_receipts) — 3 cột
- [`project_comments`](#project_comments) — 9 cột
- [`project_company_assignments`](#project_company_assignments) — 12 cột
- [`project_expenses`](#project_expenses) — 8 cột
- [`project_incidents`](#project_incidents) — 11 cột
- [`project_phase_handoffs`](#project_phase_handoffs) — 12 cột
- [`project_production_staff`](#project_production_staff) — 6 cột
- [`project_products`](#project_products) — 8 cột
- [`project_units`](#project_units) — 5 cột
- [`project_workflow_lines`](#project_workflow_lines) — 11 cột
- [`project_workshop_placements`](#project_workshop_placements) — 9 cột
- [`projects`](#projects) — 73 cột
- [`sx_company_schedule_config`](#sx_company_schedule_config) — 5 cột
- [`sx_user_planner_columns`](#sx_user_planner_columns) — 8 cột
- [`sx_user_planner_items`](#sx_user_planner_items) — 5 cột
- [`task_checklists`](#task_checklists) — 14 cột
- [`task_comments`](#task_comments) — 7 cột
- [`task_participants`](#task_participants) — 5 cột
- [`task_templates`](#task_templates) — 14 cột
- [`task_time_logs`](#task_time_logs) — 8 cột
- [`tasks`](#tasks) — 25 cột
- [`workflow_flow_action_runs`](#workflow_flow_action_runs) — 11 cột
- [`workflow_flow_conditions`](#workflow_flow_conditions) — 10 cột
- [`workflow_flow_edges`](#workflow_flow_edges) — 8 cột
- [`workflow_flow_runtime_log`](#workflow_flow_runtime_log) — 11 cột
- [`workflow_flow_steps`](#workflow_flow_steps) — 20 cột
- [`workflow_flows`](#workflow_flows) — 10 cột
- [`workflow_stage_group_items`](#workflow_stage_group_items) — 4 cột
- [`workflow_stage_groups`](#workflow_stage_groups) — 10 cột
- [`workflow_stages`](#workflow_stages) — 10 cột
- [`workshop_project_types`](#workshop_project_types) — 9 cột
- [`workshop_task_template_items`](#workshop_task_template_items) — 19 cột
- [`workshop_task_templates`](#workshop_task_templates) — 13 cột
- [`workshop_team_members`](#workshop_team_members) — 5 cột
- [`workshop_teams`](#workshop_teams) — 8 cột

### Drive / Messenger / Knowledge / Notification (41)

- [`drive_acl`](#drive_acl) — 8 cột
- [`drive_activity_log`](#drive_activity_log) — 9 cột
- [`drive_entity_links`](#drive_entity_links) — 7 cột
- [`drive_files`](#drive_files) — 16 cột
- [`drive_folders`](#drive_folders) — 10 cột
- [`drive_roots`](#drive_roots) — 14 cột
- [`drive_stars`](#drive_stars) — 4 cột
- [`file_attachments`](#file_attachments) — 12 cột
- [`internal_social_attachments`](#internal_social_attachments) — 8 cột
- [`internal_social_comment_reactions`](#internal_social_comment_reactions) — 4 cột
- [`internal_social_comments`](#internal_social_comments) — 6 cột
- [`internal_social_last_read`](#internal_social_last_read) — 3 cột
- [`internal_social_likes`](#internal_social_likes) — 4 cột
- [`internal_social_post_audience`](#internal_social_post_audience) — 2 cột
- [`internal_social_post_blocked_companies`](#internal_social_post_blocked_companies) — 3 cột
- [`internal_social_post_companies`](#internal_social_post_companies) — 3 cột
- [`internal_social_post_user_hides`](#internal_social_post_user_hides) — 3 cột
- [`internal_social_posts`](#internal_social_posts) — 14 cột
- [`knowledge_categories`](#knowledge_categories) — 19 cột
- [`knowledge_category_deadline_history`](#knowledge_category_deadline_history) — 11 cột
- [`knowledge_certificates`](#knowledge_certificates) — 17 cột
- [`knowledge_exercise_submissions`](#knowledge_exercise_submissions) — 13 cột
- [`knowledge_exercises`](#knowledge_exercises) — 16 cột
- [`knowledge_lesson_progress`](#knowledge_lesson_progress) — 9 cột
- [`knowledge_lessons`](#knowledge_lessons) — 20 cột
- [`messenger_chat_wallpapers`](#messenger_chat_wallpapers) — 4 cột
- [`messenger_contact_nicknames`](#messenger_contact_nicknames) — 4 cột
- [`messenger_group_member_nicknames`](#messenger_group_member_nicknames) — 5 cột
- [`messenger_group_members`](#messenger_group_members) — 6 cột
- [`messenger_group_messages`](#messenger_group_messages) — 17 cột
- [`messenger_groups`](#messenger_groups) — 8 cột
- [`messenger_message_reactions`](#messenger_message_reactions) — 5 cột
- [`messenger_read_receipts`](#messenger_read_receipts) — 3 cột
- [`messenger_user_pins`](#messenger_user_pins) — 3 cột
- [`notification_mutes`](#notification_mutes) — 8 cột
- [`notification_preferences`](#notification_preferences) — 27 cột
- [`notifications`](#notifications) — 12 cột
- [`push_device_tokens`](#push_device_tokens) — 8 cột
- [`push_subscriptions`](#push_subscriptions) — 6 cột
- [`voice_recordings`](#voice_recordings) — 29 cột
- [`voice_recordings_deleted`](#voice_recordings_deleted) — 7 cột

### Tích hợp / AI / KPI / App / External (61)

- [`activity_logs`](#activity_logs) — 9 cột
- [`ai_bot_skill_proposals`](#ai_bot_skill_proposals) — 18 cột
- [`ai_bot_task_flows`](#ai_bot_task_flows) — 15 cột
- [`ai_bot_user_skills`](#ai_bot_user_skills) — 11 cột
- [`ai_chat_bot_conversations`](#ai_chat_bot_conversations) — 12 cột
- [`ai_chat_bot_playbooks`](#ai_chat_bot_playbooks) — 15 cột
- [`ai_chat_bot_runs`](#ai_chat_bot_runs) — 10 cột
- [`ai_chat_bot_schedules`](#ai_chat_bot_schedules) — 34 cột
- [`ai_chat_bot_user_facts`](#ai_chat_bot_user_facts) — 11 cột
- [`app_module_companies`](#app_module_companies) — 3 cột
- [`app_module_pipeline_stages`](#app_module_pipeline_stages) — 15 cột
- [`app_module_records`](#app_module_records) — 13 cột
- [`app_module_tabs`](#app_module_tabs) — 9 cột
- [`app_module_task_template_items`](#app_module_task_template_items) — 9 cột
- [`app_module_task_templates`](#app_module_task_templates) — 10 cột
- [`app_module_tasks`](#app_module_tasks) — 15 cột
- [`app_modules`](#app_modules) — 13 cột
- [`app_releases`](#app_releases) — 19 cột
- [`app_scan_dirs`](#app_scan_dirs) — 4 cột
- [`app_settings`](#app_settings) — 3 cột
- [`app_update_logs`](#app_update_logs) — 8 cột
- [`auth_event_log`](#auth_event_log) — 13 cột
- [`calc_3d_imports`](#calc_3d_imports) — 14 cột
- [`calc_categories`](#calc_categories) — 11 cột
- [`calc_formulas`](#calc_formulas) — 11 cột
- [`calc_product_types`](#calc_product_types) — 13 cột
- [`calc_rules`](#calc_rules) — 12 cột
- [`calc_runs`](#calc_runs) — 13 cột
- [`calc_variables`](#calc_variables) — 15 cột
- [`code_sequences`](#code_sequences) — 3 cột
- [`external_api_keys`](#external_api_keys) — 18 cột
- [`external_api_logs`](#external_api_logs) — 12 cột
- [`facebook_auto_master_schedule`](#facebook_auto_master_schedule) — 7 cột
- [`facebook_auto_master_schedule_logs`](#facebook_auto_master_schedule_logs) — 10 cột
- [`facebook_comments`](#facebook_comments) — 13 cột
- [`facebook_contacts`](#facebook_contacts) — 15 cột
- [`facebook_image_sets`](#facebook_image_sets) — 10 cột
- [`facebook_inbox_canned_replies`](#facebook_inbox_canned_replies) — 7 cột
- [`facebook_lead_ads`](#facebook_lead_ads) — 14 cột
- [`facebook_messages`](#facebook_messages) — 15 cột
- [`facebook_pages`](#facebook_pages) — 21 cột
- [`facebook_webhook_logs`](#facebook_webhook_logs) — 6 cột
- [`geocode_cache`](#geocode_cache) — 4 cột
- [`kpi_business_hours_config`](#kpi_business_hours_config) — 12 cột
- [`kpi_definitions`](#kpi_definitions) — 18 cột
- [`kpi_holidays`](#kpi_holidays) — 9 cột
- [`kpi_periods`](#kpi_periods) — 8 cột
- [`kpi_scores`](#kpi_scores) — 12 cột
- [`kpi_targets`](#kpi_targets) — 12 cột
- [`kpi_user_leaves`](#kpi_user_leaves) — 12 cột
- [`misa_config`](#misa_config) — 10 cột
- [`mobile_apps`](#mobile_apps) — 9 cột
- [`supabase_failback_log`](#supabase_failback_log) — 15 cột
- [`system_batch_jobs`](#system_batch_jobs) — 17 cột
- [`trash_items`](#trash_items) — 10 cột
- [`unified_task_history`](#unified_task_history) — 13 cột
- [`unified_task_history_meta`](#unified_task_history_meta) — 3 cột
- [`zalo_contacts`](#zalo_contacts) — 14 cột
- [`zalo_messages`](#zalo_messages) — 14 cột
- [`zalo_oa_accounts`](#zalo_oa_accounts) — 30 cột
- [`zalo_webhook_logs`](#zalo_webhook_logs) — 7 cột

### Khác (7)

- [`approval_rules`](#approval_rules) — 7 cột
- [`pipeline_stage_module_links`](#pipeline_stage_module_links) — 8 cột
- [`release_note_reads`](#release_note_reads) — 4 cột
- [`release_notes`](#release_notes) — 11 cột
- [`stage_customer_status_map`](#stage_customer_status_map) — 4 cột
- [`stage_transitions`](#stage_transitions) — 8 cột
- [`tier_features`](#tier_features) — 5 cột

---

## 2. Luồng nghiệp vụ lõi

```
tenants / ecosystem_units → companies → users
customers → crm_leads (lead|deal) → crm_tasks
         → quotations → orders → invoices
         → projects (won) ↔ crm_deal_projects
         → tasks (SX/VC) → logistics / accounting
```

| Quy ước | Chi tiết |
|---|---|
| Lead+Deal | `crm_leads.type` |
| Stage order | `order_index` |
| Deal↔Project | `crm_leads.project_id` + `crm_deal_projects` |
| Task CRM / SX | `crm_tasks` / `tasks` |

---

## 3. Chi tiết cột từng bảng

<a id="activity_logs"></a>

### `activity_logs`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | YES |  |
| 3 | `action` | varchar | NO |  |
| 4 | `entity_type` | varchar | NO |  |
| 5 | `entity_id` | uuid | NO |  |
| 6 | `old_values` | jsonb | YES |  |
| 7 | `new_values` | jsonb | YES |  |
| 8 | `description` | text | YES |  |
| 9 | `created_at` | timestamptz | YES | `now()` |

<a id="ai_bot_skill_proposals"></a>

### `ai_bot_skill_proposals`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `proposer_user_id` | uuid | NO |  |
| 3 | `channel_type` | text | YES |  |
| 4 | `channel_id` | uuid | YES |  |
| 5 | `proposal_type` | text | NO | `'scheduled_report'::text` |
| 6 | `title` | text | NO |  |
| 7 | `summary` | text | YES |  |
| 8 | `instruction` | text | YES |  |
| 9 | `config` | jsonb | NO | `'{}'::jsonb` |
| 10 | `status` | text | NO | `'pending'::text` |
| 11 | `review_note` | text | YES |  |
| 12 | `reviewed_by` | uuid | YES |  |
| 13 | `reviewed_at` | timestamptz | YES |  |
| 14 | `skill_id` | uuid | YES |  |
| 15 | `schedule_id` | uuid | YES |  |
| 16 | `expires_at` | timestamptz | NO | `(now() + '7 days'::interval)` |
| 17 | `created_at` | timestamptz | NO | `now()` |
| 18 | `updated_at` | timestamptz | NO | `now()` |

<a id="ai_bot_task_flows"></a>

### `ai_bot_task_flows`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `channel_type` | text | NO |  |
| 4 | `channel_id` | uuid | NO |  |
| 5 | `flow_type` | text | NO | `'schedule_confirm'::text` |
| 6 | `status` | text | NO | `'waiting_user'::text` |
| 7 | `current_step` | text | NO | `'confirm'::text` |
| 8 | `steps` | jsonb | NO | `'[]'::jsonb` |
| 9 | `context` | jsonb | NO | `'{}'::jsonb` |
| 10 | `resume_token` | text | YES |  |
| 11 | `proposal_id` | uuid | YES |  |
| 12 | `expires_at` | timestamptz | NO | `(now() + '00:15:00'::interval)` |
| 13 | `completed_at` | timestamptz | YES |  |
| 14 | `created_at` | timestamptz | NO | `now()` |
| 15 | `updated_at` | timestamptz | NO | `now()` |

<a id="ai_bot_user_skills"></a>

### `ai_bot_user_skills`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `skill_type` | text | NO | `'scheduled_report'::text` |
| 4 | `title` | text | NO |  |
| 5 | `summary` | text | YES |  |
| 6 | `config` | jsonb | NO | `'{}'::jsonb` |
| 7 | `schedule_id` | uuid | YES |  |
| 8 | `enabled` | boolean | NO | `true` |
| 9 | `source` | text | NO | `'user_chat'::text` |
| 10 | `created_at` | timestamptz | NO | `now()` |
| 11 | `updated_at` | timestamptz | NO | `now()` |

<a id="ai_chat_bot_conversations"></a>

### `ai_chat_bot_conversations`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `schedule_id` | uuid | NO |  |
| 3 | `channel_type` | text | NO |  |
| 4 | `channel_id` | uuid | NO |  |
| 5 | `opened_at` | timestamptz | NO | `now()` |
| 6 | `expires_at` | timestamptz | NO |  |
| 7 | `last_message_id` | uuid | YES |  |
| 8 | `last_company_id` | uuid | YES |  |
| 9 | `closed` | boolean | NO | `false` |
| 10 | `created_at` | timestamptz | YES | `now()` |
| 11 | `session_context` | jsonb | NO | `'{}'::jsonb` |
| 12 | `skill_snapshot` | jsonb | NO | `'[]'::jsonb` |

<a id="ai_chat_bot_playbooks"></a>

### `ai_chat_bot_playbooks`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `code` | text | NO |  |
| 3 | `name` | text | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `icon` | text | YES |  |
| 6 | `data_source` | text | NO | `'channel_context'::text` |
| 7 | `system_prompt` | text | NO |  |
| 8 | `user_prompt_extra` | text | YES |  |
| 9 | `max_tokens` | integer | NO | `700` |
| 10 | `temperature` | numeric | NO | `0.55` |
| 11 | `is_builtin` | boolean | NO | `false` |
| 12 | `enabled` | boolean | NO | `true` |
| 13 | `created_by` | uuid | YES |  |
| 14 | `created_at` | timestamptz | YES | `now()` |
| 15 | `updated_at` | timestamptz | YES | `now()` |

<a id="ai_chat_bot_runs"></a>

### `ai_chat_bot_runs`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `schedule_id` | uuid | NO |  |
| 3 | `vn_date` | date | NO |  |
| 4 | `slot_label` | text | YES |  |
| 5 | `status` | text | NO |  |
| 6 | `message_preview` | text | YES |  |
| 7 | `error_text` | text | YES |  |
| 8 | `message_id` | uuid | YES |  |
| 9 | `triggered_by` | uuid | YES |  |
| 10 | `created_at` | timestamptz | YES | `now()` |

<a id="ai_chat_bot_schedules"></a>

### `ai_chat_bot_schedules`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `channel_type` | text | NO |  |
| 3 | `channel_id` | uuid | NO |  |
| 4 | `prompt_kind` | text | YES |  |
| 5 | `custom_prompt` | text | YES |  |
| 6 | `title` | text | NO |  |
| 7 | `note` | text | YES |  |
| 8 | `run_slots` | jsonb | NO | `'[{"h": 8, "m": 0}]'::jsonb` |
| 9 | `max_runs_per_day` | integer | NO | `2` |
| 10 | `weekdays` | _int4 | YES |  |
| 11 | `enabled` | boolean | NO | `true` |
| 12 | `last_run_at` | timestamptz | YES |  |
| 13 | `last_run_status` | text | YES |  |
| 14 | `last_run_message` | text | YES |  |
| 15 | `created_by` | uuid | YES |  |
| 16 | `created_at` | timestamptz | YES | `now()` |
| 17 | `updated_at` | timestamptz | YES | `now()` |
| 18 | `playbook_id` | uuid | YES |  |
| 19 | `time_scope` | text | NO | `'today'::text` |
| 20 | `time_scope_days_offset` | integer | NO | `0` |
| 21 | `company_whitelist` | uuid[] | YES |  |
| 22 | `conversation_enabled` | boolean | NO | `false` |
| 23 | `conversation_ttl_minutes` | integer | NO | `60` |
| 24 | `department_whitelist` | uuid[] | YES |  |
| 25 | `user_whitelist` | uuid[] | YES |  |
| 26 | `personal_scope_only` | boolean | NO | `false` |
| 27 | `region_whitelist` | uuid[] | YES |  |
| 28 | `recipient_user_ids` | uuid[] | YES |  |
| 29 | `schedule_kind` | text | NO | `'report'::text` |
| 30 | `reminder_text` | text | YES |  |
| 31 | `reminder_recurrence` | text | YES |  |
| 32 | `run_once_date` | date | YES |  |
| 33 | `recurrence_day` | int2 | YES |  |
| 34 | `recurrence_month` | int2 | YES |  |

<a id="ai_chat_bot_user_facts"></a>

### `ai_chat_bot_user_facts`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `fact_type` | text | NO |  |
| 4 | `fact` | text | NO |  |
| 5 | `confidence` | float4 | NO | `0.7` |
| 6 | `source` | text | NO | `'derived_from_activity'::text` |
| 7 | `evidence` | jsonb | YES |  |
| 8 | `hits` | integer | NO | `0` |
| 9 | `last_used_at` | timestamptz | YES |  |
| 10 | `created_at` | timestamptz | NO | `now()` |
| 11 | `updated_at` | timestamptz | NO | `now()` |

<a id="app_module_companies"></a>

### `app_module_companies`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `module_id` | uuid | NO |  |
| 2 | `company_id` | uuid | NO |  |
| 3 | `created_at` | timestamptz | NO | `now()` |

<a id="app_module_pipeline_stages"></a>

### `app_module_pipeline_stages`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `module_id` | uuid | NO |  |
| 3 | `name` | text | NO |  |
| 4 | `color` | text | YES | `'#4f46e5'::text` |
| 5 | `icon` | text | YES |  |
| 6 | `order_index` | integer | NO | `0` |
| 7 | `is_active` | boolean | YES | `true` |
| 8 | `bucket_slug` | text | YES |  |
| 9 | `crm_target_stage_id` | uuid | YES |  |
| 10 | `created_at` | timestamptz | NO | `now()` |
| 11 | `updated_at` | timestamptz | NO | `now()` |
| 12 | `tab_id` | uuid | YES |  |
| 13 | `is_done` | boolean | NO | `false` |
| 14 | `is_lost` | boolean | NO | `false` |
| 15 | `transfer_tab_ids` | uuid[] | NO | `'{}'::uuid[]` |

<a id="app_module_records"></a>

### `app_module_records`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `module_id` | uuid | NO |  |
| 3 | `company_id` | uuid | YES |  |
| 4 | `name` | text | NO |  |
| 5 | `stage_id` | uuid | YES |  |
| 6 | `source_crm_lead_id` | uuid | YES |  |
| 7 | `assignee_id` | uuid | YES |  |
| 8 | `status` | text | NO | `'open'::text` |
| 9 | `meta` | jsonb | NO | `'{}'::jsonb` |
| 10 | `created_by` | uuid | YES |  |
| 11 | `created_at` | timestamptz | NO | `now()` |
| 12 | `updated_at` | timestamptz | NO | `now()` |
| 13 | `tab_id` | uuid | YES |  |

<a id="app_module_tabs"></a>

### `app_module_tabs`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `module_id` | uuid | NO |  |
| 3 | `tab_key` | varchar | NO |  |
| 4 | `name` | varchar | NO |  |
| 5 | `icon` | varchar | YES |  |
| 6 | `order_index` | integer | NO | `0` |
| 7 | `is_active` | boolean | NO | `true` |
| 8 | `created_at` | timestamptz | NO | `now()` |
| 9 | `updated_at` | timestamptz | NO | `now()` |

<a id="app_module_task_template_items"></a>

### `app_module_task_template_items`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `template_id` | uuid | NO |  |
| 3 | `title` | text | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `priority` | text | YES | `'medium'::text` |
| 6 | `deadline_days` | integer | YES | `0` |
| 7 | `order_index` | integer | YES | `0` |
| 8 | `checklist` | jsonb | YES | `'[]'::jsonb` |
| 9 | `created_at` | timestamptz | NO | `now()` |

<a id="app_module_task_templates"></a>

### `app_module_task_templates`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `module_id` | uuid | NO |  |
| 3 | `stage_id` | uuid | YES |  |
| 4 | `name` | text | NO |  |
| 5 | `description` | text | YES |  |
| 6 | `is_active` | boolean | YES | `true` |
| 7 | `is_default` | boolean | YES | `false` |
| 8 | `order_index` | integer | YES | `0` |
| 9 | `created_at` | timestamptz | NO | `now()` |
| 10 | `updated_at` | timestamptz | NO | `now()` |

<a id="app_module_tasks"></a>

### `app_module_tasks`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `record_id` | uuid | NO |  |
| 3 | `module_id` | uuid | NO |  |
| 4 | `title` | text | NO |  |
| 5 | `description` | text | YES |  |
| 6 | `status` | text | NO | `'todo'::text` |
| 7 | `priority` | text | YES | `'medium'::text` |
| 8 | `assignee_id` | uuid | YES |  |
| 9 | `deadline` | timestamptz | YES |  |
| 10 | `checklist` | jsonb | YES | `'[]'::jsonb` |
| 11 | `order_index` | integer | YES | `0` |
| 12 | `template_item_id` | uuid | YES |  |
| 13 | `created_by` | uuid | YES |  |
| 14 | `created_at` | timestamptz | NO | `now()` |
| 15 | `updated_at` | timestamptz | NO | `now()` |

<a id="app_modules"></a>

### `app_modules`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `module_key` | varchar | NO |  |
| 3 | `name` | varchar | NO |  |
| 4 | `icon` | varchar | YES |  |
| 5 | `color` | varchar | YES | `'#4f46e5'::character varying` |
| 6 | `company_id` | uuid | YES |  |
| 7 | `is_active` | boolean | NO | `true` |
| 8 | `description` | text | YES |  |
| 9 | `created_by` | uuid | YES |  |
| 10 | `created_at` | timestamptz | NO | `now()` |
| 11 | `updated_at` | timestamptz | NO | `now()` |
| 12 | `category` | varchar | YES | `'Tùy chỉnh'::character varying` |
| 13 | `icon_image` | text | YES |  |

<a id="app_releases"></a>

### `app_releases`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `app_id` | uuid | NO |  |
| 3 | `channel` | text | NO | `'production'::text` |
| 4 | `update_type` | text | NO | `'apk'::text` |
| 5 | `version` | text | NO |  |
| 6 | `version_code` | integer | YES |  |
| 7 | `runtime_version` | text | YES |  |
| 8 | `storage_path` | text | YES |  |
| 9 | `file_url` | text | YES |  |
| 10 | `external_url` | text | YES |  |
| 11 | `manifest` | jsonb | YES |  |
| 12 | `file_size` | bigint | YES |  |
| 13 | `sha256` | text | YES |  |
| 14 | `is_mandatory` | boolean | NO | `false` |
| 15 | `is_active` | boolean | NO | `true` |
| 16 | `release_notes` | text | YES |  |
| 17 | `created_by` | uuid | YES |  |
| 18 | `created_at` | timestamptz | NO | `now()` |
| 19 | `updated_at` | timestamptz | NO | `now()` |

<a id="app_scan_dirs"></a>

### `app_scan_dirs`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `user_id` | uuid | NO |  |
| 2 | `app_id` | uuid | NO |  |
| 3 | `scan_dir` | text | YES |  |
| 4 | `updated_at` | timestamptz | NO | `now()` |

<a id="app_settings"></a>

### `app_settings`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `key` | text | NO |  |
| 2 | `value` | jsonb | NO | `'{}'::jsonb` |
| 3 | `updated_at` | timestamptz | YES | `now()` |

<a id="app_update_logs"></a>

### `app_update_logs`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `app_id` | uuid | YES |  |
| 3 | `from_version` | text | YES |  |
| 4 | `to_version` | text | YES |  |
| 5 | `device_id` | text | YES |  |
| 6 | `platform` | text | YES |  |
| 7 | `action` | text | NO |  |
| 8 | `created_at` | timestamptz | NO | `now()` |

<a id="approval_rules"></a>

### `approval_rules`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `stage_id` | uuid | NO |  |
| 3 | `approval_mode` | varchar | NO | `'manual'::character varying` |
| 4 | `auto_condition` | varchar | YES | `'all_tasks_done'::character varying` |
| 5 | `description` | text | YES |  |
| 6 | `created_at` | timestamptz | YES | `now()` |
| 7 | `updated_at` | timestamptz | YES | `now()` |

<a id="auth_event_log"></a>

### `auth_event_log`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('auth_event_log_id_seq'::regclass)` |
| 2 | `user_id` | uuid | YES |  |
| 3 | `email` | text | YES |  |
| 4 | `event` | text | NO |  |
| 5 | `reason` | text | YES |  |
| 6 | `ip` | text | YES |  |
| 7 | `user_agent` | text | YES |  |
| 8 | `platform` | text | YES |  |
| 9 | `device_name` | text | YES |  |
| 10 | `session_id` | text | YES |  |
| 11 | `metadata` | jsonb | YES |  |
| 12 | `occurred_at` | timestamptz | NO | `now()` |
| 13 | `created_at` | timestamptz | NO | `now()` |

<a id="calc_3d_imports"></a>

### `calc_3d_imports`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `file_name` | varchar | NO |  |
| 3 | `file_path` | text | NO |  |
| 4 | `file_size` | bigint | YES |  |
| 5 | `format` | varchar | NO |  |
| 6 | `status` | varchar | NO | `'parsed'::character varying` |
| 7 | `parse_error` | text | YES |  |
| 8 | `raw_meta` | jsonb | YES |  |
| 9 | `items` | jsonb | NO | `'[]'::jsonb` |
| 10 | `total_result` | numeric | YES |  |
| 11 | `total_currency` | varchar | YES | `'VND'::character varying` |
| 12 | `created_by` | uuid | YES |  |
| 13 | `created_at` | timestamptz | NO | `now()` |
| 14 | `updated_at` | timestamptz | NO | `now()` |

<a id="calc_categories"></a>

### `calc_categories`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `code` | varchar | YES |  |
| 3 | `name` | varchar | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `icon` | varchar | YES |  |
| 6 | `sort_order` | integer | NO | `0` |
| 7 | `is_active` | boolean | NO | `true` |
| 8 | `company_id` | uuid | YES |  |
| 9 | `created_by` | uuid | YES |  |
| 10 | `created_at` | timestamptz | NO | `now()` |
| 11 | `updated_at` | timestamptz | NO | `now()` |

<a id="calc_formulas"></a>

### `calc_formulas`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `product_type_id` | uuid | NO |  |
| 3 | `name` | varchar | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `ast` | jsonb | NO | `'{}'::jsonb` |
| 6 | `expression_text` | text | YES |  |
| 7 | `is_active` | boolean | NO | `true` |
| 8 | `sort_order` | integer | NO | `0` |
| 9 | `created_by` | uuid | YES |  |
| 10 | `created_at` | timestamptz | NO | `now()` |
| 11 | `updated_at` | timestamptz | NO | `now()` |

<a id="calc_product_types"></a>

### `calc_product_types`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `category_id` | uuid | NO |  |
| 3 | `code` | varchar | YES |  |
| 4 | `name` | varchar | NO |  |
| 5 | `description` | text | YES |  |
| 6 | `default_unit` | varchar | NO | `'mm'::character varying` |
| 7 | `result_unit` | varchar | YES |  |
| 8 | `sort_order` | integer | NO | `0` |
| 9 | `is_active` | boolean | NO | `true` |
| 10 | `match_keywords` | text[] | YES |  |
| 11 | `created_by` | uuid | YES |  |
| 12 | `created_at` | timestamptz | NO | `now()` |
| 13 | `updated_at` | timestamptz | NO | `now()` |

<a id="calc_rules"></a>

### `calc_rules`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `product_type_id` | uuid | NO |  |
| 3 | `name` | varchar | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `priority` | integer | NO | `100` |
| 6 | `condition_ast` | jsonb | NO | `'{}'::jsonb` |
| 7 | `condition_text` | text | YES |  |
| 8 | `formula_id` | uuid | YES |  |
| 9 | `is_default` | boolean | NO | `false` |
| 10 | `is_active` | boolean | NO | `true` |
| 11 | `created_at` | timestamptz | NO | `now()` |
| 12 | `updated_at` | timestamptz | NO | `now()` |

<a id="calc_runs"></a>

### `calc_runs`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `product_type_id` | uuid | YES |  |
| 3 | `inputs` | jsonb | NO | `'{}'::jsonb` |
| 4 | `matched_rule_id` | uuid | YES |  |
| 5 | `applied_formula_id` | uuid | YES |  |
| 6 | `result` | numeric | YES |  |
| 7 | `result_unit` | varchar | YES |  |
| 8 | `breakdown` | jsonb | YES |  |
| 9 | `source` | varchar | NO | `'manual'::character varying` |
| 10 | `import_id` | uuid | YES |  |
| 11 | `notes` | text | YES |  |
| 12 | `created_by` | uuid | YES |  |
| 13 | `created_at` | timestamptz | NO | `now()` |

<a id="calc_variables"></a>

### `calc_variables`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `product_type_id` | uuid | NO |  |
| 3 | `var_key` | varchar | NO |  |
| 4 | `label` | varchar | NO |  |
| 5 | `data_type` | varchar | NO | `'number'::character varying` |
| 6 | `unit` | varchar | YES |  |
| 7 | `default_value` | numeric | YES |  |
| 8 | `min_value` | numeric | YES |  |
| 9 | `max_value` | numeric | YES |  |
| 10 | `is_required` | boolean | NO | `true` |
| 11 | `is_dimension` | boolean | NO | `false` |
| 12 | `dim_axis` | varchar | YES |  |
| 13 | `sort_order` | integer | NO | `0` |
| 14 | `description` | text | YES |  |
| 15 | `created_at` | timestamptz | NO | `now()` |

<a id="code_sequences"></a>

### `code_sequences`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `prefix` | text | NO |  |
| 2 | `current_number` | integer | YES | `0` |
| 3 | `year` | integer | YES | `EXTRACT(year FROM CURRENT_DATE)` |

<a id="companies"></a>

### `companies`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | varchar | NO |  |
| 3 | `short_name` | varchar | YES |  |
| 4 | `tax_code` | varchar | YES |  |
| 5 | `address` | text | YES |  |
| 6 | `phone` | varchar | YES |  |
| 7 | `email` | varchar | YES |  |
| 8 | `logo_url` | text | YES |  |
| 9 | `is_active` | boolean | YES | `true` |
| 10 | `created_at` | timestamptz | YES | `now()` |
| 11 | `updated_at` | timestamptz | YES | `now()` |
| 12 | `division_unit_id` | uuid | YES |  |
| 13 | `tenant_id` | uuid | NO |  |

<a id="company_bank_accounts"></a>

### `company_bank_accounts`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `company_id` | uuid | NO |  |
| 3 | `bank_name` | text | NO |  |
| 4 | `account_number` | text | NO |  |
| 5 | `account_holder` | text | YES |  |
| 6 | `branch` | text | YES |  |
| 7 | `is_default` | boolean | NO | `false` |
| 8 | `is_active` | boolean | NO | `true` |
| 9 | `created_at` | timestamptz | NO | `now()` |
| 10 | `updated_at` | timestamptz | NO | `now()` |
| 11 | `region_id` | uuid | YES |  |

<a id="company_division_units"></a>

### `company_division_units`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `company_id` | uuid | NO |  |
| 3 | `division_unit_id` | uuid | NO |  |
| 4 | `is_primary` | boolean | YES | `false` |
| 5 | `created_at` | timestamptz | YES | `now()` |

<a id="company_process_checklists"></a>

### `company_process_checklists`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `task_id` | uuid | NO |  |
| 3 | `title` | varchar | NO |  |
| 4 | `order_index` | integer | YES | `0` |
| 5 | `require_file` | boolean | YES | `false` |
| 6 | `require_note` | boolean | YES | `false` |
| 7 | `default_assignee_id` | uuid | YES |  |
| 8 | `created_at` | timestamptz | YES | `now()` |

<a id="company_process_tasks"></a>

### `company_process_tasks`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `process_id` | uuid | NO |  |
| 3 | `title` | varchar | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `order_index` | integer | YES | `0` |
| 6 | `default_department_id` | uuid | YES |  |
| 7 | `default_team_id` | uuid | YES |  |
| 8 | `default_assignee_id` | uuid | YES |  |
| 9 | `estimated_hours` | numeric | YES |  |
| 10 | `deadline_days` | integer | YES | `0` |
| 11 | `deadline_hours` | integer | YES | `0` |
| 12 | `priority` | varchar | YES | `'medium'::character varying` |
| 13 | `created_at` | timestamptz | YES | `now()` |

<a id="company_processes"></a>

### `company_processes`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `company_unit_id` | uuid | NO |  |
| 3 | `name` | varchar | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `color` | varchar | YES | `'#3B82F6'::character varying` |
| 6 | `icon` | varchar | YES | `'📋'::character varying` |
| 7 | `order_index` | integer | YES | `0` |
| 8 | `is_active` | boolean | YES | `true` |
| 9 | `created_by` | uuid | YES |  |
| 10 | `created_at` | timestamptz | YES | `now()` |
| 11 | `updated_at` | timestamptz | YES | `now()` |

<a id="company_regions"></a>

### `company_regions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `company_id` | uuid | NO |  |
| 3 | `name` | text | NO |  |
| 4 | `code` | text | YES |  |
| 5 | `order_index` | integer | NO | `0` |
| 6 | `is_active` | boolean | YES | `true` |
| 7 | `created_at` | timestamptz | YES | `now()` |
| 8 | `updated_at` | timestamptz | YES | `now()` |
| 9 | `division_unit_id` | uuid | YES |  |
| 10 | `address` | text | YES |  |
| 11 | `map_url` | text | YES |  |
| 12 | `lat` | numeric | YES |  |
| 13 | `lng` | numeric | YES |  |
| 14 | `geocoded_at` | timestamptz | YES |  |

<a id="company_template_checklists"></a>

### `company_template_checklists`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `template_task_id` | uuid | NO |  |
| 3 | `title` | varchar | NO |  |
| 4 | `order_index` | integer | YES | `0` |
| 5 | `require_file` | boolean | YES | `false` |
| 6 | `require_note` | boolean | YES | `false` |
| 7 | `created_at` | timestamptz | YES | `now()` |
| 8 | `default_assignee_id` | uuid | YES |  |
| 9 | `deadline_days` | integer | YES |  |
| 10 | `deadline_type` | text | YES |  |
| 11 | `deadline_hours` | integer | YES |  |

<a id="company_template_sets"></a>

### `company_template_sets`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `unit_id` | uuid | NO |  |
| 3 | `name` | varchar | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `project_type` | varchar | YES |  |
| 6 | `is_default` | boolean | YES | `false` |
| 7 | `is_active` | boolean | YES | `true` |
| 8 | `created_by` | uuid | YES |  |
| 9 | `created_at` | timestamptz | YES | `now()` |
| 10 | `updated_at` | timestamptz | YES | `now()` |
| 11 | `company_id` | uuid | YES |  |
| 12 | `source_process_id` | uuid | YES |  |

<a id="company_template_tasks"></a>

### `company_template_tasks`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `template_set_id` | uuid | NO |  |
| 3 | `stage_id` | uuid | NO |  |
| 4 | `title` | varchar | NO |  |
| 5 | `description` | text | YES |  |
| 6 | `order_index` | integer | YES | `0` |
| 7 | `default_department_id` | uuid | YES |  |
| 8 | `default_team_id` | uuid | YES |  |
| 9 | `default_assignee_id` | uuid | YES |  |
| 10 | `estimated_hours` | numeric | YES |  |
| 11 | `priority` | varchar | YES | `'medium'::character varying` |
| 12 | `created_at` | timestamptz | YES | `now()` |
| 13 | `deadline_days` | integer | YES | `0` |
| 14 | `deadline_hours` | integer | YES | `0` |
| 15 | `supervisor_id` | uuid | YES |  |
| 16 | `deadline_type` | text | YES |  |

<a id="crm_activities"></a>

### `crm_activities`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `lead_id` | uuid | YES |  |
| 3 | `customer_id` | uuid | YES |  |
| 4 | `type` | text | NO |  |
| 5 | `title` | text | NO |  |
| 6 | `description` | text | YES |  |
| 7 | `outcome` | text | YES |  |
| 8 | `activity_date` | timestamptz | YES | `now()` |
| 9 | `duration_minutes` | integer | YES |  |
| 10 | `created_by` | uuid | YES |  |
| 11 | `created_at` | timestamptz | YES | `now()` |
| 12 | `shared_to_workshop` | boolean | NO | `false` |
| 13 | `attachments` | jsonb | YES |  |
| 14 | `allowed_share_modules` | jsonb | YES |  |

<a id="crm_assignment_assignees"></a>

### `crm_assignment_assignees`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `assignment_id` | bigint | NO |  |
| 2 | `user_id` | uuid | NO |  |
| 3 | `completed_at` | timestamptz | YES |  |
| 4 | `added_at` | timestamptz | NO | `now()` |

<a id="crm_assignment_columns"></a>

### `crm_assignment_columns`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('crm_assignment_columns_id_seq'::regclass)` |
| 2 | `company_id` | uuid | YES |  |
| 3 | `name` | text | NO |  |
| 4 | `color` | text | YES |  |
| 5 | `position` | integer | NO | `0` |
| 6 | `is_done_column` | boolean | NO | `false` |
| 7 | `created_by_id` | uuid | YES |  |
| 8 | `created_at` | timestamptz | NO | `now()` |
| 9 | `updated_at` | timestamptz | NO | `now()` |
| 10 | `is_in_progress_column` | boolean | NO | `false` |

<a id="crm_assignment_comments"></a>

### `crm_assignment_comments`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('crm_assignment_comments_id_seq'::regclass)` |
| 2 | `assignment_id` | bigint | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `content` | text | NO |  |
| 5 | `created_at` | timestamptz | NO | `now()` |
| 6 | `updated_at` | timestamptz | NO | `now()` |
| 7 | `parent_id` | bigint | YES |  |

<a id="crm_assignment_files"></a>

### `crm_assignment_files`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('crm_assignment_files_id_seq'::regclass)` |
| 2 | `assignment_id` | bigint | NO |  |
| 3 | `kind` | varchar | NO |  |
| 4 | `file_name` | text | NO |  |
| 5 | `file_url` | text | NO |  |
| 6 | `file_size` | bigint | YES | `0` |
| 7 | `mime_type` | varchar | YES |  |
| 8 | `storage_path` | text | YES |  |
| 9 | `uploaded_by` | uuid | YES |  |
| 10 | `created_at` | timestamptz | NO | `now()` |
| 11 | `source_task_attachment_id` | uuid | YES |  |

<a id="crm_assignment_schedule_files"></a>

### `crm_assignment_schedule_files`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('crm_assignment_schedule_files_id_seq'::regclass)` |
| 2 | `schedule_id` | bigint | NO |  |
| 3 | `kind` | varchar | NO | `'req'::character varying` |
| 4 | `file_name` | text | NO |  |
| 5 | `file_url` | text | NO |  |
| 6 | `file_size` | bigint | YES | `0` |
| 7 | `mime_type` | varchar | YES |  |
| 8 | `storage_path` | text | YES |  |
| 9 | `uploaded_by` | uuid | YES |  |
| 10 | `created_at` | timestamptz | NO | `now()` |

<a id="crm_assignment_schedules"></a>

### `crm_assignment_schedules`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('crm_assignment_schedules_id_seq'::regclass)` |
| 2 | `company_id` | uuid | YES |  |
| 3 | `assignment_module` | text | NO | `'crm'::text` |
| 4 | `title` | text | NO |  |
| 5 | `description` | text | YES |  |
| 6 | `column_id` | bigint | YES |  |
| 7 | `priority` | crm_assignment_priority | NO | `'medium'::crm_assignment_priority` |
| 8 | `created_by_id` | uuid | YES |  |
| 9 | `assignee_ids` | jsonb | NO | `'[]'::jsonb` |
| 10 | `scheduled_start` | timestamptz | NO |  |
| 11 | `deadline_at` | timestamptz | YES |  |
| 12 | `recurrence_type` | text | YES |  |
| 13 | `recurrence_interval` | integer | NO | `1` |
| 14 | `recurrence_end_at` | timestamptz | YES |  |
| 15 | `next_run_at` | timestamptz | NO |  |
| 16 | `last_run_at` | timestamptz | YES |  |
| 17 | `last_assignment_id` | bigint | YES |  |
| 18 | `is_active` | boolean | NO | `true` |
| 19 | `created_at` | timestamptz | NO | `now()` |
| 20 | `updated_at` | timestamptz | NO | `now()` |

<a id="crm_assignments"></a>

### `crm_assignments`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('crm_assignments_id_seq'::regclass)` |
| 2 | `company_id` | uuid | YES |  |
| 3 | `column_id` | bigint | YES |  |
| 4 | `title` | text | NO |  |
| 5 | `description` | text | YES |  |
| 6 | `assignee_id` | uuid | YES |  |
| 7 | `created_by_id` | uuid | YES |  |
| 8 | `priority` | crm_assignment_priority | NO | `'medium'::crm_assignment_priority` |
| 9 | `status` | crm_assignment_status | NO | `'pending'::crm_assignment_status` |
| 10 | `deadline` | timestamptz | YES |  |
| 11 | `position` | integer | NO | `0` |
| 12 | `created_at` | timestamptz | NO | `now()` |
| 13 | `updated_at` | timestamptz | NO | `now()` |
| 14 | `completed_at` | timestamptz | YES |  |
| 15 | `lead_id` | uuid | YES |  |
| 16 | `crm_task_id` | uuid | YES |  |
| 17 | `assignment_module` | text | NO | `'crm'::text` |
| 18 | `requires_quick_verdict` | boolean | NO | `false` |
| 19 | `quick_verdict` | text | YES |  |
| 20 | `quick_verdict_reason` | text | YES |  |
| 21 | `completion_requires_file_or_note` | boolean | NO | `false` |
| 22 | `required_evidence_file_types` | jsonb | NO | `'[]'::jsonb` |
| 23 | `executor_company_id` | uuid | YES |  |
| 24 | `schedule_id` | bigint | YES |  |
| 25 | `task_source_type` | text | YES |  |
| 26 | `employee_error_module` | text | YES |  |
| 27 | `department_id` | uuid | YES |  |
| 28 | `phat_sinh_kind` | text | YES |  |

<a id="crm_auto_lead_blocked_phones"></a>

### `crm_auto_lead_blocked_phones`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `phone_last9` | text | NO |  |
| 3 | `phone_display` | text | YES |  |
| 4 | `note` | text | YES |  |
| 5 | `created_by` | uuid | YES |  |
| 6 | `created_at` | timestamptz | NO | `now()` |

<a id="crm_call_logs"></a>

### `crm_call_logs`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `third_party_call_id` | text | YES |  |
| 3 | `provider` | text | YES | `'stringee'::text` |
| 4 | `lead_id` | uuid | YES |  |
| 5 | `customer_id` | uuid | YES |  |
| 6 | `created_by` | uuid | YES |  |
| 7 | `phone_from` | text | YES |  |
| 8 | `phone_to` | text | YES |  |
| 9 | `direction` | text | YES | `'outbound'::text` |
| 10 | `status` | text | YES | `'unknown'::text` |
| 11 | `duration_seconds` | integer | YES | `0` |
| 12 | `recording_url` | text | YES |  |
| 13 | `started_at` | timestamptz | YES |  |
| 14 | `ended_at` | timestamptz | YES |  |
| 15 | `notes` | text | YES |  |
| 16 | `raw_payload` | jsonb | YES |  |
| 17 | `created_at` | timestamptz | YES | `now()` |
| 18 | `updated_at` | timestamptz | YES | `now()` |

<a id="crm_company_deadline_config"></a>

### `crm_company_deadline_config`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `company_id` | uuid | NO |  |
| 2 | `primary_field` | text | NO | `'crm_next_open_task_deadline'::text` |
| 3 | `fallback_field` | text | YES | `'expected_close_date'::text` |
| 4 | `buckets` | jsonb | NO | `'{"today": {"label": "Hôm nay", "enabled": true}, "overdu...` |
| 5 | `updated_at` | timestamptz | NO | `now()` |

<a id="crm_company_visible_production_companies"></a>

### `crm_company_visible_production_companies`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `crm_company_id` | uuid | NO |  |
| 3 | `production_company_id` | uuid | NO |  |
| 4 | `created_at` | timestamptz | NO | `now()` |

<a id="crm_daily_report_lines"></a>

### `crm_daily_report_lines`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `report_id` | uuid | NO |  |
| 3 | `template_item_id` | uuid | YES |  |
| 4 | `section` | text | NO | `'work'::text` |
| 5 | `label` | text | NO |  |
| 6 | `order_index` | integer | NO | `0` |
| 7 | `plan_value` | numeric | YES |  |
| 8 | `result_value` | numeric | YES |  |
| 9 | `plan_note` | text | YES |  |
| 10 | `result_note` | text | YES |  |
| 11 | `created_at` | timestamptz | NO | `now()` |
| 12 | `updated_at` | timestamptz | NO | `now()` |
| 13 | `metric_key` | text | YES |  |
| 14 | `auto_result` | boolean | NO | `false` |

<a id="crm_daily_report_template_items"></a>

### `crm_daily_report_template_items`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `template_id` | uuid | NO |  |
| 3 | `section` | text | NO | `'work'::text` |
| 4 | `label` | text | NO |  |
| 5 | `order_index` | integer | NO | `0` |
| 6 | `unit_label` | text | YES |  |
| 7 | `created_at` | timestamptz | NO | `now()` |
| 8 | `metric_key` | text | YES |  |

<a id="crm_daily_report_templates"></a>

### `crm_daily_report_templates`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `company_id` | uuid | YES |  |
| 3 | `role_key` | text | NO |  |
| 4 | `name` | text | NO |  |
| 5 | `description` | text | YES |  |
| 6 | `has_sharpen_section` | boolean | NO | `false` |
| 7 | `is_active` | boolean | NO | `true` |
| 8 | `created_at` | timestamptz | NO | `now()` |
| 9 | `updated_at` | timestamptz | NO | `now()` |

<a id="crm_daily_report_user_extras"></a>

### `crm_daily_report_user_extras`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `company_id` | uuid | YES |  |
| 4 | `section` | text | NO |  |
| 5 | `label` | text | NO |  |
| 6 | `order_index` | integer | NO | `100` |
| 7 | `is_active` | boolean | NO | `true` |
| 8 | `created_at` | timestamptz | NO | `now()` |
| 9 | `updated_at` | timestamptz | NO | `now()` |

<a id="crm_daily_report_user_templates"></a>

### `crm_daily_report_user_templates`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `user_id` | uuid | NO |  |
| 2 | `company_id` | uuid | YES |  |
| 3 | `template_id` | uuid | NO |  |
| 4 | `assigned_by` | uuid | YES |  |
| 5 | `created_at` | timestamptz | NO | `now()` |
| 6 | `updated_at` | timestamptz | NO | `now()` |

<a id="crm_daily_reports"></a>

### `crm_daily_reports`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `company_id` | uuid | YES |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `template_id` | uuid | NO |  |
| 5 | `report_date` | date | NO |  |
| 6 | `department_name` | text | YES |  |
| 7 | `status` | text | NO | `'draft'::text` |
| 8 | `plan_submitted_at` | timestamptz | YES |  |
| 9 | `result_submitted_at` | timestamptz | YES |  |
| 10 | `manager_note` | text | YES |  |
| 11 | `created_at` | timestamptz | NO | `now()` |
| 12 | `updated_at` | timestamptz | NO | `now()` |

<a id="crm_deal_payments"></a>

### `crm_deal_payments`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `lead_id` | uuid | NO |  |
| 3 | `stage_id` | uuid | YES |  |
| 4 | `amount` | numeric | NO |  |
| 5 | `payment_date` | date | NO | `CURRENT_DATE` |
| 6 | `payment_method` | text | YES |  |
| 7 | `bank_account_id` | uuid | YES |  |
| 8 | `reference_number` | text | YES |  |
| 9 | `notes` | text | YES |  |
| 10 | `invoice_id` | uuid | YES |  |
| 11 | `order_id` | uuid | YES |  |
| 12 | `mirrored_payment_record_id` | uuid | YES |  |
| 13 | `created_by` | uuid | YES |  |
| 14 | `created_at` | timestamptz | NO | `now()` |

<a id="crm_deal_projects"></a>

### `crm_deal_projects`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `deal_id` | uuid | NO |  |
| 3 | `project_id` | uuid | NO |  |
| 4 | `is_primary` | boolean | NO | `false` |
| 5 | `label` | text | YES |  |
| 6 | `created_by` | uuid | YES |  |
| 7 | `created_at` | timestamptz | NO | `now()` |

<a id="crm_dept_plan_sheets"></a>

### `crm_dept_plan_sheets`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('crm_dept_plan_sheets_id_seq'::regclass)` |
| 2 | `department_id` | uuid | NO |  |
| 3 | `company_id` | uuid | YES |  |
| 4 | `week_start` | date | NO |  |
| 5 | `name` | text | YES |  |
| 6 | `created_by` | uuid | YES |  |
| 7 | `created_at` | timestamptz | NO | `now()` |
| 8 | `updated_at` | timestamptz | NO | `now()` |
| 9 | `summary` | jsonb | NO | `'{}'::jsonb` |

<a id="crm_dept_plan_tasks"></a>

### `crm_dept_plan_tasks`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('crm_dept_plan_tasks_id_seq'::regclass)` |
| 2 | `sheet_id` | bigint | NO |  |
| 3 | `department_id` | uuid | NO |  |
| 4 | `user_id` | uuid | NO |  |
| 5 | `created_by` | uuid | YES |  |
| 6 | `task_group` | text | YES |  |
| 7 | `title` | text | NO |  |
| 8 | `description` | text | YES |  |
| 9 | `kpi` | text | YES |  |
| 10 | `location` | text | YES |  |
| 11 | `frequency` | text | YES |  |
| 12 | `start_date` | date | NO |  |
| 13 | `end_date` | date | NO |  |
| 14 | `status` | text | NO | `'planned'::text` |
| 15 | `progress` | integer | NO | `0` |
| 16 | `priority` | text | NO | `'normal'::text` |
| 17 | `result_note` | text | YES |  |
| 18 | `position` | integer | NO | `0` |
| 19 | `created_at` | timestamptz | NO | `now()` |
| 20 | `updated_at` | timestamptz | NO | `now()` |
| 21 | `completed_at` | timestamptz | YES |  |

<a id="crm_event_comments"></a>

### `crm_event_comments`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `event_id` | uuid | YES |  |
| 3 | `user_id` | uuid | YES |  |
| 4 | `content` | text | NO |  |
| 5 | `created_at` | timestamptz | YES | `now()` |

<a id="crm_event_participants"></a>

### `crm_event_participants`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `event_id` | uuid | YES |  |
| 3 | `user_id` | uuid | YES |  |
| 4 | `status` | text | YES | `'pending'::text` |
| 5 | `created_at` | timestamptz | YES | `now()` |

<a id="crm_events"></a>

### `crm_events`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `event_type_id` | uuid | YES |  |
| 3 | `event_type` | text | NO | `'other'::text` |
| 4 | `title` | text | NO |  |
| 5 | `description` | text | YES |  |
| 6 | `location` | text | YES |  |
| 7 | `start_time` | timestamptz | NO |  |
| 8 | `end_time` | timestamptz | YES |  |
| 9 | `all_day` | boolean | YES | `false` |
| 10 | `status` | text | YES | `'planned'::text` |
| 11 | `result` | text | YES |  |
| 12 | `lead_id` | uuid | YES |  |
| 13 | `customer_id` | uuid | YES |  |
| 14 | `project_id` | uuid | YES |  |
| 15 | `created_by` | uuid | YES |  |
| 16 | `assignee_id` | uuid | YES |  |
| 17 | `created_at` | timestamptz | YES | `now()` |
| 18 | `updated_at` | timestamptz | YES | `now()` |
| 19 | `company_id` | uuid | YES |  |
| 20 | `cancel_reason` | text | YES |  |
| 21 | `module` | text | NO | `'crm'::text` |
| 22 | `occurrence_dates` | _date | YES |  |

<a id="crm_followup_care_dismissals"></a>

### `crm_followup_care_dismissals`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `pipeline_id` | uuid | YES |  |
| 4 | `stage_id` | uuid | YES |  |
| 5 | `company_id` | uuid | YES |  |
| 6 | `time_bucket` | text | NO | `'w1'::text` |
| 7 | `dismissed_at` | timestamptz | YES | `now()` |
| 8 | `expires_at` | timestamptz | NO | `(now() + '30 days'::interval)` |

<a id="crm_kpi_ledger"></a>

### `crm_kpi_ledger`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `company_id` | uuid | YES |  |
| 4 | `lead_id` | uuid | YES |  |
| 5 | `task_id` | uuid | YES |  |
| 6 | `stage_id` | uuid | YES |  |
| 7 | `rule_id` | uuid | YES |  |
| 8 | `event_type` | text | NO |  |
| 9 | `source_kpi_code` | text | YES |  |
| 10 | `deadline_at` | timestamptz | YES |  |
| 11 | `occurred_at` | timestamptz | NO | `now()` |
| 12 | `delta_seconds` | bigint | YES |  |
| 13 | `on_time` | boolean | YES |  |
| 14 | `points` | numeric | NO |  |
| 15 | `reason` | text | YES |  |
| 16 | `metadata` | jsonb | YES |  |
| 17 | `period_type` | text | NO | `'monthly'::text` |
| 18 | `period_start` | date | NO |  |
| 19 | `created_at` | timestamptz | NO | `now()` |
| 20 | `created_by` | uuid | YES |  |

<a id="crm_kpi_scoring_rules"></a>

### `crm_kpi_scoring_rules`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `company_id` | uuid | YES |  |
| 3 | `event_type` | text | NO |  |
| 4 | `task_kind` | text | YES |  |
| 5 | `on_time_points` | numeric | NO | `1` |
| 6 | `late_points` | numeric | NO | `'-1'::integer` |
| 7 | `early_bonus_pct` | numeric | YES |  |
| 8 | `early_bonus` | numeric | YES | `0` |
| 9 | `late_step_hours` | integer | YES |  |
| 10 | `late_step_points` | numeric | YES | `0` |
| 11 | `is_active` | boolean | YES | `true` |
| 12 | `updated_at` | timestamptz | YES | `now()` |
| 13 | `task_stage_slug` | text | YES |  |
| 14 | `notes` | text | YES |  |
| 15 | `created_at` | timestamptz | NO | `now()` |

<a id="crm_lead_care_marks"></a>

### `crm_lead_care_marks`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `lead_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `marked_at` | timestamptz | NO | `now()` |
| 5 | `expires_at` | timestamptz | NO | `(now() + '30 days'::interval)` |
| 6 | `note` | text | YES |  |

<a id="crm_lead_comment_reactions"></a>

### `crm_lead_comment_reactions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `comment_id` | bigint | NO |  |
| 2 | `user_id` | uuid | NO |  |
| 3 | `emoji` | text | NO |  |
| 4 | `created_at` | timestamptz | NO | `now()` |

<a id="crm_lead_comment_read_receipts"></a>

### `crm_lead_comment_read_receipts`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `lead_id` | uuid | NO |  |
| 2 | `user_id` | uuid | NO |  |
| 3 | `last_read_at` | timestamptz | NO | `now()` |

<a id="crm_lead_comments"></a>

### `crm_lead_comments`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('crm_lead_comments_id_seq'::regclass)` |
| 2 | `lead_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `body` | text | NO |  |
| 5 | `created_at` | timestamptz | NO | `now()` |
| 6 | `updated_at` | timestamptz | NO | `now()` |
| 7 | `deleted_at` | timestamptz | YES |  |
| 8 | `parent_id` | bigint | YES |  |
| 9 | `attachments` | jsonb | NO | `'[]'::jsonb` |
| 10 | `comment_type` | text | YES |  |
| 11 | `metadata` | jsonb | NO | `'{}'::jsonb` |

<a id="crm_lead_deadline_history"></a>

### `crm_lead_deadline_history`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `lead_id` | uuid | NO |  |
| 3 | `stage_id` | uuid | YES |  |
| 4 | `old_deadline_at` | timestamptz | YES |  |
| 5 | `new_deadline_at` | timestamptz | YES |  |
| 6 | `reason` | text | YES |  |
| 7 | `source` | text | YES |  |
| 8 | `changed_by` | uuid | YES |  |
| 9 | `created_at` | timestamptz | NO | `now()` |

<a id="crm_lead_stage_history"></a>

### `crm_lead_stage_history`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `lead_id` | uuid | NO |  |
| 3 | `pipeline_type` | text | YES |  |
| 4 | `from_stage_id` | uuid | YES |  |
| 5 | `to_stage_id` | uuid | YES |  |
| 6 | `from_canonical_slug` | text | YES |  |
| 7 | `to_canonical_slug` | text | YES |  |
| 8 | `entered_at` | timestamptz | NO | `now()` |
| 9 | `exited_at` | timestamptz | YES |  |
| 10 | `duration_seconds` | bigint | YES |  |
| 11 | `changed_by` | uuid | YES |  |
| 12 | `created_at` | timestamptz | NO | `now()` |

<a id="crm_lead_type_production_links"></a>

### `crm_lead_type_production_links`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `lead_type_id` | uuid | NO |  |
| 3 | `production_company_id` | uuid | NO |  |
| 4 | `workshop_type_id` | uuid | NO |  |
| 5 | `is_primary` | boolean | NO | `false` |
| 6 | `order_index` | integer | NO | `0` |
| 7 | `created_at` | timestamptz | NO | `now()` |

<a id="crm_lead_types"></a>

### `crm_lead_types`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `company_id` | uuid | YES |  |
| 3 | `name` | text | NO |  |
| 4 | `applies_to` | text | NO | `'both'::text` |
| 5 | `order_index` | integer | NO | `0` |
| 6 | `is_active` | boolean | YES | `true` |
| 7 | `created_at` | timestamptz | YES | `now()` |
| 8 | `updated_at` | timestamptz | YES | `now()` |
| 9 | `workshop_production_templates` | boolean | NO | `false` |
| 10 | `default_production_company_id` | uuid | YES |  |
| 11 | `color` | text | YES |  |
| 12 | `default_workshop_type_id` | uuid | YES |  |

<a id="crm_lead_user_flags"></a>

### `crm_lead_user_flags`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `user_id` | uuid | NO |  |
| 2 | `lead_id` | uuid | NO |  |
| 3 | `is_pinned` | boolean | NO | `false` |
| 4 | `pinned_at` | timestamptz | YES |  |
| 5 | `is_interacted` | boolean | NO | `false` |
| 6 | `interacted_at` | timestamptz | YES |  |
| 7 | `updated_at` | timestamptz | NO | `now()` |

<a id="crm_leads"></a>

### `crm_leads`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `code` | text | YES |  |
| 3 | `title` | text | NO |  |
| 4 | `customer_id` | uuid | YES |  |
| 5 | `stage_id` | uuid | YES |  |
| 6 | `source_id` | uuid | YES |  |
| 7 | `assigned_to` | uuid | YES |  |
| 8 | `estimated_value` | numeric | YES | `0` |
| 9 | `probability` | integer | YES | `50` |
| 10 | `weighted_value` | numeric | YES |  |
| 11 | `description` | text | YES |  |
| 12 | `expected_close_date` | date | YES |  |
| 13 | `actual_close_date` | date | YES |  |
| 14 | `lost_reason` | text | YES |  |
| 15 | `last_activity_at` | timestamptz | YES |  |
| 16 | `next_follow_up` | date | YES |  |
| 17 | `project_id` | uuid | YES |  |
| 18 | `created_by` | uuid | YES |  |
| 19 | `created_at` | timestamptz | YES | `now()` |
| 20 | `updated_at` | timestamptz | YES | `now()` |
| 21 | `type` | text | YES | `'lead'::text` |
| 22 | `company_id` | uuid | YES |  |
| 23 | `lead_owner_id` | uuid | YES |  |
| 24 | `install_address` | text | YES |  |
| 25 | `phone` | text | YES |  |
| 26 | `sx_pipeline_stage_id` | uuid | YES |  |
| 27 | `lead_seen_by` | jsonb | NO | `'{}'::jsonb` |
| 28 | `pipeline_id` | uuid | YES |  |
| 29 | `vc_pipeline_stage_id` | uuid | YES |  |
| 30 | `sx_handover_at` | timestamptz | YES |  |
| 31 | `sx_handover_confirmed_by` | uuid | YES |  |
| 32 | `construction_start_date` | date | YES |  |
| 33 | `expected_production_start_date` | date | YES |  |
| 34 | `expected_production_end_date` | date | YES |  |
| 35 | `lead_type_id` | uuid | YES |  |
| 36 | `parent_lead_id` | uuid | YES |  |
| 37 | `use_order_tasks` | boolean | NO | `false` |
| 38 | `region_id` | uuid | YES |  |
| 39 | `sx_template_company_id` | uuid | YES |  |
| 40 | `stage_entered_at` | timestamptz | YES | `now()` |
| 41 | `first_touch_time` | timestamptz | YES |  |
| 42 | `lead_temperature` | text | YES |  |
| 43 | `expected_construction_time` | text | YES |  |
| 44 | `info_complete` | boolean | YES |  |
| 45 | `kanban_deadline_at` | timestamptz | YES |  |
| 46 | `kanban_deadline_reason` | text | YES |  |
| 47 | `external_company_name` | text | YES |  |
| 48 | `deposit_amount` | numeric | YES |  |
| 49 | `deposit_received` | boolean | YES |  |
| 50 | `deposit_label` | text | YES |  |
| 51 | `referrer_name` | text | YES |  |
| 52 | `external_company_id` | uuid | YES |  |
| 53 | `revert_to_lead_reason` | text | YES |  |
| 54 | `deadline_disabled_at` | timestamptz | YES |  |
| 55 | `deadline_disabled_reason` | text | YES |  |
| 56 | `deadline_disabled_by` | uuid | YES |  |
| 57 | `deposit_installments` | jsonb | YES |  |
| 58 | `source_customer_deal_id` | uuid | YES |  |

<a id="crm_payment_stages"></a>

### `crm_payment_stages`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `lead_id` | uuid | NO |  |
| 3 | `company_id` | uuid | YES |  |
| 4 | `label` | text | NO |  |
| 5 | `planned_amount` | numeric | YES |  |
| 6 | `sort_order` | integer | NO | `0` |
| 7 | `payment_method` | text | YES |  |
| 8 | `bank_account_id` | uuid | YES |  |
| 9 | `status` | text | NO | `'pending'::text` |
| 10 | `received_amount` | numeric | NO | `0` |
| 11 | `notes` | text | YES |  |
| 12 | `created_at` | timestamptz | NO | `now()` |
| 13 | `updated_at` | timestamptz | NO | `now()` |

<a id="crm_pipeline_stages"></a>

### `crm_pipeline_stages`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | text | NO |  |
| 3 | `color` | text | YES | `'#3b82f6'::text` |
| 4 | `icon` | text | YES |  |
| 5 | `order_index` | integer | NO | `0` |
| 6 | `is_won` | boolean | YES | `false` |
| 7 | `is_lost` | boolean | YES | `false` |
| 8 | `is_active` | boolean | YES | `true` |
| 9 | `created_at` | timestamptz | YES | `now()` |
| 10 | `pipeline_type` | text | YES | `'lead'::text` |
| 11 | `pipeline_id` | uuid | YES |  |
| 12 | `send_zalo_on_enter` | boolean | NO | `false` |
| 13 | `sync_role` | text | YES |  |
| 14 | `create_event_on_enter` | boolean | YES |  |
| 15 | `default_probability` | int2 | YES |  |
| 16 | `description` | text | YES |  |
| 17 | `sla_days` | integer | YES |  |
| 18 | `canonical_slug` | text | YES |  |
| 19 | `deal_report_bucket` | text | YES |  |
| 20 | `counts_as_won_revenue` | boolean | YES |  |
| 21 | `counts_as_completed_revenue` | boolean | YES |  |
| 22 | `requires_deadline` | boolean | NO | `false` |
| 23 | `show_deadline_box` | boolean | NO | `false` |
| 24 | `deadline_default_days` | integer | NO | `0` |
| 25 | `deadline_default_hours` | integer | NO | `0` |
| 26 | `counts_as_expected_revenue` | boolean | YES |  |
| 27 | `allow_revert_to_lead` | boolean | NO | `false` |
| 28 | `show_sx_transfer` | boolean | YES | `false` |
| 29 | `apply_default_assignee_on_enter` | boolean | NO | `false` |
| 30 | `default_assignee_user_id` | uuid | YES |  |
| 31 | `is_revert_to_lead_target` | boolean | NO | `false` |

<a id="crm_pipelines"></a>

### `crm_pipelines`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | text | NO |  |
| 3 | `company_id` | uuid | YES |  |
| 4 | `description` | text | YES |  |
| 5 | `is_default` | boolean | YES | `false` |
| 6 | `is_active` | boolean | YES | `true` |
| 7 | `created_at` | timestamptz | YES | `now()` |
| 8 | `updated_at` | timestamptz | YES | `now()` |
| 9 | `zalo_template_id` | text | YES |  |
| 10 | `zalo_merge_template_data` | jsonb | NO | `'{}'::jsonb` |
| 11 | `allow_employee_delete_lead` | boolean | NO | `true` |
| 12 | `allow_employee_delete_deal` | boolean | NO | `true` |
| 13 | `region_id` | uuid | YES |  |

<a id="crm_referrers"></a>

### `crm_referrers`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `company_id` | uuid | NO |  |
| 3 | `name` | text | NO |  |
| 4 | `is_active` | boolean | NO | `true` |
| 5 | `created_by` | uuid | YES |  |
| 6 | `created_at` | timestamptz | NO | `now()` |

<a id="crm_source_categories"></a>

### `crm_source_categories`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | text | NO |  |
| 3 | `icon` | text | YES |  |
| 4 | `color` | text | YES |  |
| 5 | `order_index` | integer | NO | `0` |
| 6 | `company_id` | uuid | YES |  |
| 7 | `is_active` | boolean | YES | `true` |
| 8 | `created_at` | timestamptz | YES | `now()` |

<a id="crm_sources"></a>

### `crm_sources`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | text | NO |  |
| 3 | `icon` | text | YES |  |
| 4 | `color` | text | YES |  |
| 5 | `is_active` | boolean | YES | `true` |
| 6 | `created_at` | timestamptz | YES | `now()` |
| 7 | `company_id` | uuid | YES |  |
| 8 | `category_id` | uuid | YES |  |

<a id="crm_task_assignees"></a>

### `crm_task_assignees`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `task_id` | uuid | NO |  |
| 2 | `user_id` | uuid | NO |  |
| 3 | `added_at` | timestamptz | NO | `now()` |

<a id="crm_task_attachments"></a>

### `crm_task_attachments`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `task_id` | uuid | NO |  |
| 3 | `lead_id` | uuid | NO |  |
| 4 | `name` | text | NO |  |
| 5 | `file_url` | text | YES |  |
| 6 | `file_name` | text | YES |  |
| 7 | `file_size` | integer | YES |  |
| 8 | `mime_type` | text | YES |  |
| 9 | `notes` | text | YES |  |
| 10 | `doc_type` | text | YES | `'task_note'::text` |
| 11 | `created_by` | uuid | YES |  |
| 12 | `created_at` | timestamptz | YES | `now()` |
| 13 | `allowed_companies` | jsonb | YES |  |
| 14 | `allowed_departments` | jsonb | YES |  |
| 15 | `source_document_id` | uuid | YES |  |
| 16 | `shared_to_project` | boolean | YES | `false` |
| 17 | `allowed_share_modules` | jsonb | YES |  |
| 18 | `checklist_id` | text | YES |  |
| 19 | `source_assignment_file_id` | bigint | YES |  |
| 20 | `source_drive_file_id` | uuid | YES |  |

<a id="crm_task_template_items"></a>

### `crm_task_template_items`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `template_id` | uuid | NO |  |
| 3 | `title` | text | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `priority` | text | YES | `'medium'::text` |
| 6 | `deadline_days` | integer | YES | `0` |
| 7 | `order_index` | integer | YES | `0` |
| 8 | `checklist` | jsonb | YES | `'[]'::jsonb` |
| 9 | `created_at` | timestamptz | YES | `now()` |
| 10 | `default_allowed_companies` | jsonb | YES |  |
| 11 | `default_allowed_departments` | jsonb | YES |  |
| 12 | `completion_requires_file_or_note` | boolean | NO | `false` |
| 13 | `completion_requires_customer_note` | boolean | NO | `false` |
| 14 | `completion_requires_customer_contact` | boolean | NO | `false` |
| 15 | `blocks_stage_advance` | boolean | NO | `false` |
| 16 | `show_excel_quotation_upload` | boolean | NO | `false` |
| 17 | `requires_quick_verdict` | boolean | NO | `false` |
| 18 | `required_evidence_file_types` | jsonb | NO | `'[]'::jsonb` |
| 19 | `executor_company_id` | uuid | YES |  |
| 20 | `default_assignee_id` | uuid | YES |  |
| 21 | `default_assignee_ids` | uuid[] | YES | `'{}'::uuid[]` |
| 22 | `default_shared_to_project` | boolean | YES | `false` |
| 23 | `default_allowed_share_modules` | jsonb | YES |  |
| 24 | `auto_upload_attachments_to_drive` | boolean | NO | `false` |
| 25 | `show_fill_form` | boolean | NO | `false` |
| 26 | `form_config` | jsonb | NO | `'{}'::jsonb` |
| 27 | `deadline_hours` | integer | YES | `0` |
| 28 | `deadline_minutes` | integer | YES | `0` |

<a id="crm_task_templates"></a>

### `crm_task_templates`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | text | NO |  |
| 3 | `stage_slug` | text | YES |  |
| 4 | `description` | text | YES |  |
| 5 | `is_active` | boolean | YES | `true` |
| 6 | `is_default` | boolean | YES | `false` |
| 7 | `order_index` | integer | YES | `0` |
| 8 | `created_at` | timestamptz | YES | `now()` |
| 9 | `pipeline_type` | text | YES | `'both'::text` |
| 10 | `pipeline_stage_id` | uuid | YES |  |

<a id="crm_tasks"></a>

### `crm_tasks`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `lead_id` | uuid | NO |  |
| 3 | `title` | text | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `status` | text | YES | `'pending'::text` |
| 6 | `priority` | text | YES | `'medium'::text` |
| 7 | `stage_slug` | text | YES |  |
| 8 | `order_index` | integer | YES | `0` |
| 9 | `assignee_id` | uuid | YES |  |
| 10 | `supervisor_id` | uuid | YES |  |
| 11 | `deadline` | timestamptz | YES |  |
| 12 | `completed_at` | timestamptz | YES |  |
| 13 | `checklist` | jsonb | YES | `'[]'::jsonb` |
| 14 | `created_by` | uuid | YES |  |
| 15 | `created_at` | timestamptz | YES | `now()` |
| 16 | `updated_at` | timestamptz | YES | `now()` |
| 17 | `notes` | text | YES |  |
| 18 | `shared_to_project` | boolean | YES | `false` |
| 19 | `default_allowed_companies` | jsonb | YES |  |
| 20 | `default_allowed_departments` | jsonb | YES |  |
| 21 | `completion_requires_file_or_note` | boolean | NO | `false` |
| 22 | `completion_requires_customer_note` | boolean | NO | `false` |
| 23 | `completion_requires_customer_contact` | boolean | NO | `false` |
| 24 | `allowed_share_modules` | jsonb | YES |  |
| 25 | `blocks_stage_advance` | boolean | NO | `false` |
| 26 | `pipeline_stage_id` | uuid | YES |  |
| 27 | `show_excel_quotation_upload` | boolean | NO | `false` |
| 28 | `production_pipeline_stage_id` | uuid | YES |  |
| 29 | `requires_quick_verdict` | boolean | NO | `false` |
| 30 | `quick_verdict` | text | YES |  |
| 31 | `quick_verdict_reason` | text | YES |  |
| 32 | `quick_verdict_at` | timestamptz | YES |  |
| 33 | `quick_verdict_by` | uuid | YES |  |
| 34 | `required_evidence_file_types` | jsonb | NO | `'[]'::jsonb` |
| 35 | `executor_company_id` | uuid | YES |  |
| 36 | `clears_delivery_deadline_on_complete` | boolean | NO | `false` |
| 37 | `auto_upload_attachments_to_drive` | boolean | NO | `false` |
| 38 | `show_fill_form` | boolean | NO | `false` |
| 39 | `form_config` | jsonb | NO | `'{}'::jsonb` |
| 40 | `form_data` | jsonb | NO | `'{}'::jsonb` |
| 41 | `deadline_days` | integer | YES | `0` |
| 42 | `deadline_hours` | integer | YES | `0` |
| 43 | `deadline_minutes` | integer | YES | `0` |
| 44 | `file_note_recorded` | boolean | NO | `false` |
| 45 | `task_source_type` | text | YES |  |
| 46 | `employee_error_module` | text | YES |  |
| 47 | `department_id` | uuid | YES |  |
| 48 | `phat_sinh_kind` | text | YES |  |

<a id="crm_user_planner_columns"></a>

### `crm_user_planner_columns`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('crm_user_planner_columns_id_seq'::regclass)` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `company_id` | uuid | YES |  |
| 4 | `name` | text | NO |  |
| 5 | `color` | text | YES |  |
| 6 | `position` | integer | NO | `0` |
| 7 | `created_at` | timestamptz | NO | `now()` |
| 8 | `updated_at` | timestamptz | NO | `now()` |

<a id="crm_user_planner_items"></a>

### `crm_user_planner_items`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('crm_user_planner_items_id_seq'::regclass)` |
| 2 | `column_id` | bigint | NO |  |
| 3 | `lead_id` | uuid | NO |  |
| 4 | `position` | integer | NO | `0` |
| 5 | `added_at` | timestamptz | NO | `now()` |

<a id="crm_zalo_stage_sends"></a>

### `crm_zalo_stage_sends`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `lead_id` | uuid | NO |  |
| 2 | `stage_id` | uuid | NO |  |
| 3 | `tracking_id` | text | NO |  |
| 4 | `msg_id` | text | YES |  |
| 5 | `error_message` | text | YES |  |
| 6 | `created_at` | timestamptz | NO | `now()` |
| 7 | `updated_at` | timestamptz | NO | `now()` |

<a id="customer_interactions"></a>

### `customer_interactions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `customer_id` | uuid | NO |  |
| 3 | `user_id` | uuid | YES |  |
| 4 | `type` | varchar | NO |  |
| 5 | `title` | varchar | NO |  |
| 6 | `content` | text | YES |  |
| 7 | `interaction_date` | timestamptz | YES | `now()` |
| 8 | `next_action` | text | YES |  |
| 9 | `next_action_date` | timestamptz | YES |  |
| 10 | `created_at` | timestamptz | YES | `now()` |

<a id="customer_statuses"></a>

### `customer_statuses`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | varchar | NO |  |
| 3 | `slug` | varchar | NO |  |
| 4 | `color` | varchar | YES | `'#6B7280'::character varying` |
| 5 | `icon` | varchar | YES |  |
| 6 | `description` | text | YES |  |
| 7 | `order_index` | integer | NO | `0` |
| 8 | `is_active` | boolean | YES | `true` |
| 9 | `created_at` | timestamptz | YES | `now()` |

<a id="customers"></a>

### `customers`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `full_name` | varchar | NO |  |
| 3 | `phone` | varchar | NO |  |
| 4 | `email` | varchar | YES |  |
| 5 | `address` | text | YES |  |
| 6 | `district` | varchar | YES |  |
| 7 | `city` | varchar | YES |  |
| 8 | `notes` | text | YES |  |
| 9 | `source` | varchar | YES |  |
| 10 | `created_at` | timestamptz | YES | `now()` |
| 11 | `updated_at` | timestamptz | YES | `now()` |
| 12 | `company` | varchar | YES |  |
| 13 | `tax_code` | varchar | YES |  |
| 14 | `gender` | varchar | YES |  |
| 15 | `birthday` | date | YES |  |
| 16 | `assigned_to` | uuid | YES |  |
| 17 | `status` | varchar | YES | `'new'::character varying` |
| 18 | `total_revenue` | numeric | YES | `0` |
| 19 | `tags` | jsonb | YES | `'[]'::jsonb` |
| 20 | `zalo_id` | text | YES |  |
| 21 | `facebook_id` | text | YES |  |
| 22 | `status_id` | uuid | YES |  |
| 23 | `last_quotation_amount` | numeric | YES |  |
| 24 | `last_quotation_at` | timestamptz | YES |  |
| 25 | `total_quotation_value` | numeric | YES | `0` |
| 26 | `company_id` | uuid | YES |  |

<a id="deal_cross_module_scores"></a>

### `deal_cross_module_scores`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `deal_lead_id` | uuid | NO |  |
| 3 | `source_module` | text | NO |  |
| 4 | `target_module` | text | NO |  |
| 5 | `criterion` | text | NO | `'overall'::text` |
| 6 | `score` | numeric | NO |  |
| 7 | `comment` | text | YES |  |
| 8 | `created_by` | uuid | YES |  |
| 9 | `updated_at` | timestamptz | YES | `now()` |
| 10 | `created_at` | timestamptz | YES | `now()` |

<a id="deal_customer_ratings"></a>

### `deal_customer_ratings`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `deal_lead_id` | uuid | NO |  |
| 3 | `stars` | numeric | NO |  |
| 4 | `feedback` | text | YES |  |
| 5 | `source` | text | YES | `'manual'::text` |
| 6 | `recorded_by` | uuid | YES |  |
| 7 | `created_at` | timestamptz | YES | `now()` |

<a id="department_message_reactions"></a>

### `department_message_reactions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `message_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `emoji` | text | NO |  |
| 5 | `created_at` | timestamptz | YES | `now()` |

<a id="department_message_reads"></a>

### `department_message_reads`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `department_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `last_read_at` | timestamptz | YES | `now()` |

<a id="department_messages"></a>

### `department_messages`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `department_id` | uuid | NO |  |
| 3 | `sender_id` | uuid | NO |  |
| 4 | `content` | text | NO |  |
| 5 | `reply_to_id` | uuid | YES |  |
| 6 | `attachments` | jsonb | YES | `'[]'::jsonb` |
| 7 | `is_pinned` | boolean | YES | `false` |
| 8 | `is_edited` | boolean | YES | `false` |
| 9 | `created_at` | timestamptz | YES | `now()` |
| 10 | `updated_at` | timestamptz | YES | `now()` |
| 11 | `is_system` | boolean | YES | `false` |

<a id="departments"></a>

### `departments`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | varchar | NO |  |
| 3 | `slug` | varchar | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `color` | varchar | YES | `'#6366F1'::character varying` |
| 6 | `created_at` | timestamptz | YES | `now()` |
| 7 | `manager_id` | uuid | YES |  |
| 8 | `parent_id` | uuid | YES |  |
| 9 | `is_active` | boolean | YES | `true` |
| 10 | `updated_at` | timestamptz | YES | `now()` |
| 11 | `company_id` | uuid | YES |  |
| 12 | `division_unit_id` | uuid | YES |  |
| 13 | `drive_category` | text | YES |  |

<a id="division_members"></a>

### `division_members`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `division_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `role` | varchar | YES | `'member'::character varying` |
| 5 | `joined_at` | timestamptz | YES | `now()` |

<a id="division_projects"></a>

### `division_projects`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `division_id` | uuid | NO |  |
| 3 | `project_id` | uuid | NO |  |
| 4 | `role` | varchar | YES | `'owner'::character varying` |
| 5 | `assigned_at` | timestamptz | YES | `now()` |
| 6 | `assigned_by` | uuid | YES |  |

<a id="drive_acl"></a>

### `drive_acl`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `target_type` | varchar | NO |  |
| 3 | `target_id` | uuid | NO |  |
| 4 | `principal_type` | varchar | NO |  |
| 5 | `principal_id` | uuid | YES |  |
| 6 | `role` | varchar | NO |  |
| 7 | `granted_by` | uuid | YES |  |
| 8 | `created_at` | timestamptz | NO | `now()` |

<a id="drive_activity_log"></a>

### `drive_activity_log`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('drive_activity_log_id_seq'::regclass)` |
| 2 | `actor_id` | uuid | YES |  |
| 3 | `action` | varchar | NO |  |
| 4 | `target_type` | varchar | NO |  |
| 5 | `target_id` | uuid | NO |  |
| 6 | `target_name` | text | YES |  |
| 7 | `root_id` | uuid | YES |  |
| 8 | `meta` | jsonb | YES |  |
| 9 | `created_at` | timestamptz | NO | `now()` |

<a id="drive_entity_links"></a>

### `drive_entity_links`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `file_id` | uuid | NO |  |
| 3 | `entity_type` | varchar | NO |  |
| 4 | `entity_id` | uuid | NO |  |
| 5 | `note` | text | YES |  |
| 6 | `created_by` | uuid | YES |  |
| 7 | `created_at` | timestamptz | NO | `now()` |

<a id="drive_files"></a>

### `drive_files`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `root_id` | uuid | NO |  |
| 3 | `folder_id` | uuid | YES |  |
| 4 | `name` | text | NO |  |
| 5 | `mime_type` | varchar | YES |  |
| 6 | `size_bytes` | bigint | NO | `0` |
| 7 | `google_file_id` | text | NO |  |
| 8 | `google_view_url` | text | YES |  |
| 9 | `thumbnail_url` | text | YES |  |
| 10 | `md5` | varchar | YES |  |
| 11 | `version` | integer | NO | `1` |
| 12 | `uploaded_by` | uuid | YES |  |
| 13 | `created_at` | timestamptz | NO | `now()` |
| 14 | `updated_at` | timestamptz | NO | `now()` |
| 15 | `trashed_at` | timestamptz | YES |  |
| 16 | `trashed_by` | uuid | YES |  |

<a id="drive_folders"></a>

### `drive_folders`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `root_id` | uuid | NO |  |
| 3 | `parent_id` | uuid | YES |  |
| 4 | `name` | text | NO |  |
| 5 | `google_folder_id` | text | NO |  |
| 6 | `created_by` | uuid | YES |  |
| 7 | `created_at` | timestamptz | NO | `now()` |
| 8 | `updated_at` | timestamptz | NO | `now()` |
| 9 | `trashed_at` | timestamptz | YES |  |
| 10 | `trashed_by` | uuid | YES |  |

<a id="drive_roots"></a>

### `drive_roots`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `scope` | varchar | NO |  |
| 3 | `owner_id` | uuid | YES |  |
| 4 | `name` | text | NO |  |
| 5 | `google_folder_id` | text | NO |  |
| 6 | `start_page_token` | text | YES |  |
| 7 | `last_synced_at` | timestamptz | YES |  |
| 8 | `created_by` | uuid | YES |  |
| 9 | `created_at` | timestamptz | NO | `now()` |
| 10 | `updated_at` | timestamptz | NO | `now()` |
| 11 | `module_key` | text | YES |  |
| 12 | `shared_kind` | text | YES |  |
| 13 | `company_id` | uuid | YES |  |
| 14 | `region_id` | uuid | YES |  |

<a id="drive_stars"></a>

### `drive_stars`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `user_id` | uuid | NO |  |
| 2 | `target_type` | varchar | NO |  |
| 3 | `target_id` | uuid | NO |  |
| 4 | `created_at` | timestamptz | NO | `now()` |

<a id="ecosystem_levels"></a>

### `ecosystem_levels`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | varchar | NO |  |
| 3 | `slug` | varchar | NO |  |
| 4 | `depth` | integer | NO | `0` |
| 5 | `description` | text | YES |  |
| 6 | `icon` | varchar | YES |  |
| 7 | `color` | varchar | YES | `'#3B82F6'::character varying` |
| 8 | `created_at` | timestamptz | YES | `now()` |

<a id="ecosystem_module_scopes"></a>

### `ecosystem_module_scopes`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `module_key` | varchar | NO |  |
| 3 | `division_unit_id` | uuid | NO |  |
| 4 | `created_at` | timestamptz | YES | `now()` |

<a id="ecosystem_unit_members"></a>

### `ecosystem_unit_members`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `unit_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `unit_role` | varchar | NO | `'member'::character varying` |
| 5 | `can_manage_children` | boolean | YES | `false` |
| 6 | `is_primary` | boolean | YES | `false` |
| 7 | `joined_at` | timestamptz | YES | `now()` |

<a id="ecosystem_unit_stage_groups"></a>

### `ecosystem_unit_stage_groups`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `unit_id` | uuid | NO |  |
| 3 | `group_id` | uuid | NO |  |
| 4 | `is_primary` | boolean | YES | `false` |
| 5 | `created_at` | timestamptz | YES | `now()` |

<a id="ecosystem_units"></a>

### `ecosystem_units`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | varchar | NO |  |
| 3 | `short_name` | varchar | YES |  |
| 4 | `code` | varchar | YES |  |
| 5 | `level_id` | uuid | NO |  |
| 6 | `parent_id` | uuid | YES |  |
| 7 | `company_id` | uuid | YES |  |
| 8 | `department_id` | uuid | YES |  |
| 9 | `description` | text | YES |  |
| 10 | `logo_url` | text | YES |  |
| 11 | `address` | text | YES |  |
| 12 | `phone` | varchar | YES |  |
| 13 | `email` | varchar | YES |  |
| 14 | `order_index` | integer | YES | `0` |
| 15 | `is_active` | boolean | YES | `true` |
| 16 | `created_at` | timestamptz | YES | `now()` |
| 17 | `updated_at` | timestamptz | YES | `now()` |
| 18 | `stage_group_id` | uuid | YES |  |
| 19 | `icon` | varchar | YES |  |
| 20 | `color` | varchar | YES |  |
| 21 | `team_id` | uuid | YES |  |
| 22 | `tenant_id` | uuid | YES |  |

<a id="event_types"></a>

### `event_types`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | text | NO |  |
| 3 | `slug` | text | NO |  |
| 4 | `icon` | text | YES | `'📋'::text` |
| 5 | `color` | text | YES | `'#3B82F6'::text` |
| 6 | `stage_slug` | text | YES |  |
| 7 | `description` | text | YES |  |
| 8 | `is_system` | boolean | YES | `false` |
| 9 | `sort_order` | integer | YES | `0` |
| 10 | `created_at` | timestamptz | YES | `now()` |

<a id="external_api_keys"></a>

### `external_api_keys`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | text | NO |  |
| 3 | `key` | text | NO |  |
| 4 | `active` | boolean | NO | `true` |
| 5 | `default_assigned_to` | uuid | YES |  |
| 6 | `company_id` | uuid | YES |  |
| 7 | `region_id` | uuid | YES |  |
| 8 | `default_source_category_id` | uuid | YES |  |
| 9 | `default_lead_type_id` | uuid | YES |  |
| 10 | `default_pipeline_id` | uuid | YES |  |
| 11 | `webhook_url` | text | YES |  |
| 12 | `created_by` | uuid | YES |  |
| 13 | `created_at` | timestamptz | NO | `now()` |
| 14 | `rotated_at` | timestamptz | YES |  |
| 15 | `rotated_by` | uuid | YES |  |
| 16 | `refresh_token` | text | YES |  |
| 17 | `mcp_scopes` | text[] | NO | `ARRAY['reports'::text, 'crm_read'::text]` |
| 18 | `allowed_company_ids` | uuid[] | YES |  |

<a id="external_api_logs"></a>

### `external_api_logs`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `api_key_id` | uuid | YES |  |
| 3 | `api_key_name` | text | YES |  |
| 4 | `company_id` | uuid | YES |  |
| 5 | `endpoint` | text | YES |  |
| 6 | `method` | text | YES |  |
| 7 | `status` | integer | YES |  |
| 8 | `ip` | text | YES |  |
| 9 | `user_agent` | text | YES |  |
| 10 | `error` | text | YES |  |
| 11 | `created_lead_id` | uuid | YES |  |
| 12 | `created_at` | timestamptz | YES | `now()` |

<a id="facebook_auto_master_schedule"></a>

### `facebook_auto_master_schedule`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | int2 | NO | `1` |
| 2 | `enabled` | boolean | NO | `false` |
| 3 | `run_minutes` | integer | NO | `60` |
| 4 | `rest_minutes` | integer | NO | `30` |
| 5 | `phase` | text | NO | `'rest'::text` |
| 6 | `phase_started_at` | timestamptz | YES |  |
| 7 | `updated_at` | timestamptz | NO | `now()` |

<a id="facebook_auto_master_schedule_logs"></a>

### `facebook_auto_master_schedule_logs`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('facebook_auto_master_schedule_logs_id_seq'::regc...` |
| 2 | `action` | text | NO |  |
| 3 | `phase` | text | NO |  |
| 4 | `run_minutes` | integer | NO |  |
| 5 | `rest_minutes` | integer | NO |  |
| 6 | `master_enabled` | boolean | NO |  |
| 7 | `phase_started_at` | timestamptz | YES |  |
| 8 | `phase_ends_at` | timestamptz | YES |  |
| 9 | `source` | text | NO | `'schedule'::text` |
| 10 | `created_at` | timestamptz | NO | `now()` |

<a id="facebook_comments"></a>

### `facebook_comments`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `page_id` | text | NO |  |
| 3 | `post_id` | text | YES |  |
| 4 | `comment_id` | text | NO |  |
| 5 | `parent_comment_id` | text | YES |  |
| 6 | `from_id` | text | YES |  |
| 7 | `from_name` | text | YES |  |
| 8 | `message` | text | YES |  |
| 9 | `attachment_url` | text | YES |  |
| 10 | `lead_id` | uuid | YES |  |
| 11 | `replied` | boolean | YES | `false` |
| 12 | `reply_text` | text | YES |  |
| 13 | `created_at` | timestamptz | YES | `now()` |

<a id="facebook_contacts"></a>

### `facebook_contacts`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `page_id` | text | NO |  |
| 3 | `psid` | text | NO |  |
| 4 | `fb_name` | text | YES |  |
| 5 | `fb_profile_pic` | text | YES |  |
| 6 | `phone` | text | YES |  |
| 7 | `email` | text | YES |  |
| 8 | `customer_id` | uuid | YES |  |
| 9 | `lead_id` | uuid | YES |  |
| 10 | `last_message_at` | timestamptz | YES |  |
| 11 | `unread_count` | integer | YES | `0` |
| 12 | `created_at` | timestamptz | YES | `now()` |
| 13 | `updated_at` | timestamptz | YES | `now()` |
| 14 | `last_synced_at` | timestamptz | YES |  |
| 15 | `notes` | text | YES |  |

<a id="facebook_image_sets"></a>

### `facebook_image_sets`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | text | NO |  |
| 3 | `description` | text | YES |  |
| 4 | `drive_folder_id` | uuid | NO |  |
| 5 | `company_id` | uuid | YES |  |
| 6 | `sort_index` | integer | NO | `0` |
| 7 | `is_active` | boolean | NO | `true` |
| 8 | `created_by` | uuid | YES |  |
| 9 | `created_at` | timestamptz | NO | `now()` |
| 10 | `updated_at` | timestamptz | NO | `now()` |

<a id="facebook_inbox_canned_replies"></a>

### `facebook_inbox_canned_replies`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `title` | text | NO |  |
| 4 | `body` | text | NO |  |
| 5 | `sort_index` | integer | NO | `0` |
| 6 | `created_at` | timestamptz | NO | `now()` |
| 7 | `updated_at` | timestamptz | NO | `now()` |

<a id="facebook_lead_ads"></a>

### `facebook_lead_ads`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `page_id` | text | NO |  |
| 3 | `leadgen_id` | text | NO |  |
| 4 | `form_id` | text | YES |  |
| 5 | `form_name` | text | YES |  |
| 6 | `field_data` | jsonb | YES |  |
| 7 | `full_name` | text | YES |  |
| 8 | `phone` | text | YES |  |
| 9 | `email` | text | YES |  |
| 10 | `raw_data` | jsonb | YES |  |
| 11 | `customer_id` | uuid | YES |  |
| 12 | `lead_id` | uuid | YES |  |
| 13 | `processed` | boolean | YES | `false` |
| 14 | `created_at` | timestamptz | YES | `now()` |

<a id="facebook_messages"></a>

### `facebook_messages`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `contact_id` | uuid | NO |  |
| 3 | `lead_id` | uuid | YES |  |
| 4 | `fb_message_id` | text | YES |  |
| 5 | `direction` | text | NO |  |
| 6 | `message_type` | text | YES | `'text'::text` |
| 7 | `content` | text | YES |  |
| 8 | `attachment_url` | text | YES |  |
| 9 | `attachment_type` | text | YES |  |
| 10 | `attachment_local_path` | text | YES |  |
| 11 | `metadata` | jsonb | YES |  |
| 12 | `sent_by` | uuid | YES |  |
| 13 | `is_read` | boolean | YES | `false` |
| 14 | `created_at` | timestamptz | YES | `now()` |
| 15 | `create_event_on_enter` | boolean | YES |  |

<a id="facebook_pages"></a>

### `facebook_pages`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `page_id` | text | NO |  |
| 3 | `page_name` | text | YES |  |
| 4 | `access_token` | text | NO |  |
| 5 | `is_active` | boolean | YES | `true` |
| 6 | `webhook_verify_token` | text | YES |  |
| 7 | `auto_create_lead` | boolean | YES | `true` |
| 8 | `auto_reply_message` | text | YES | `'Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm nhất.':...` |
| 9 | `default_pipeline_id` | uuid | YES |  |
| 10 | `default_stage_id` | uuid | YES |  |
| 11 | `default_source_id` | uuid | YES |  |
| 12 | `created_by` | uuid | YES |  |
| 13 | `created_at` | timestamptz | YES | `now()` |
| 14 | `updated_at` | timestamptz | YES | `now()` |
| 15 | `default_company_id` | uuid | YES |  |
| 16 | `default_lead_owner_id` | uuid | YES |  |
| 17 | `default_lead_type_id` | uuid | YES |  |
| 18 | `default_region_id` | uuid | YES |  |
| 19 | `settings_updated_at` | timestamptz | YES |  |
| 20 | `default_target_type` | text | YES | `'lead'::text` |
| 21 | `default_module_key` | text | YES | `'crm'::text` |

<a id="facebook_webhook_logs"></a>

### `facebook_webhook_logs`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `page_id` | text | YES |  |
| 3 | `payload` | jsonb | YES |  |
| 4 | `processed_at` | timestamptz | YES | `now()` |
| 5 | `status` | text | YES |  |
| 6 | `result` | jsonb | YES |  |

<a id="file_attachments"></a>

### `file_attachments`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `entity_type` | varchar | NO |  |
| 3 | `entity_id` | uuid | NO |  |
| 4 | `file_name` | varchar | NO |  |
| 5 | `file_url` | text | NO |  |
| 6 | `file_size` | bigint | YES | `0` |
| 7 | `mime_type` | varchar | YES |  |
| 8 | `uploaded_by` | uuid | YES |  |
| 9 | `created_at` | timestamptz | YES | `now()` |
| 10 | `allowed_companies` | jsonb | YES |  |
| 11 | `allowed_share_modules` | jsonb | YES |  |
| 12 | `shared_to_crm` | boolean | NO | `false` |

<a id="flow_step_processes"></a>

### `flow_step_processes`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `flow_step_id` | uuid | NO |  |
| 3 | `process_id` | uuid | NO |  |
| 4 | `order_index` | integer | YES | `0` |
| 5 | `is_required` | boolean | YES | `true` |
| 6 | `created_at` | timestamptz | YES | `now()` |

<a id="flow_step_task_checklists"></a>

### `flow_step_task_checklists`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `extensions.uuid_generate_v4()` |
| 2 | `flow_step_task_id` | uuid | NO |  |
| 3 | `template_checklist_id` | uuid | YES |  |
| 4 | `label` | text | NO |  |
| 5 | `order_index` | integer | YES | `0` |
| 6 | `is_required` | boolean | YES | `false` |
| 7 | `assigned_user_id` | uuid | YES |  |
| 8 | `created_at` | timestamptz | YES | `now()` |
| 9 | `deadline_days` | integer | YES |  |
| 10 | `deadline_hours` | integer | YES |  |
| 11 | `deadline_type` | text | YES |  |

<a id="flow_step_tasks"></a>

### `flow_step_tasks`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `extensions.uuid_generate_v4()` |
| 2 | `flow_step_id` | uuid | NO |  |
| 3 | `template_task_id` | uuid | YES |  |
| 4 | `title` | text | NO |  |
| 5 | `description` | text | YES |  |
| 6 | `stage_id` | uuid | YES |  |
| 7 | `assigned_user_id` | uuid | YES |  |
| 8 | `assigned_company_unit_id` | uuid | YES |  |
| 9 | `assignee_field` | text | YES |  |
| 10 | `estimated_days` | integer | YES | `1` |
| 11 | `order_index` | integer | YES | `0` |
| 12 | `is_active` | boolean | YES | `true` |
| 13 | `created_at` | timestamptz | YES | `now()` |
| 14 | `updated_at` | timestamptz | YES | `now()` |
| 15 | `deadline_days` | integer | YES |  |
| 16 | `deadline_hours` | integer | YES |  |
| 17 | `deadline_type` | text | YES |  |

<a id="geocode_cache"></a>

### `geocode_cache`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `key` | text | NO |  |
| 2 | `address` | text | NO |  |
| 3 | `raw` | jsonb | YES |  |
| 4 | `created_at` | timestamptz | NO | `now()` |

<a id="internal_social_attachments"></a>

### `internal_social_attachments`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `post_id` | uuid | NO |  |
| 3 | `file_url` | text | NO |  |
| 4 | `file_name` | text | YES |  |
| 5 | `mime_type` | text | YES |  |
| 6 | `file_size` | bigint | YES |  |
| 7 | `sort_index` | integer | NO | `0` |
| 8 | `created_at` | timestamptz | NO | `now()` |

<a id="internal_social_comment_reactions"></a>

### `internal_social_comment_reactions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `comment_id` | uuid | NO |  |
| 2 | `user_id` | uuid | NO |  |
| 3 | `reaction` | text | NO | `'like'::text` |
| 4 | `created_at` | timestamptz | NO | `now()` |

<a id="internal_social_comments"></a>

### `internal_social_comments`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `post_id` | uuid | NO |  |
| 3 | `author_id` | uuid | NO |  |
| 4 | `body` | text | NO |  |
| 5 | `created_at` | timestamptz | NO | `now()` |
| 6 | `parent_id` | uuid | YES |  |

<a id="internal_social_last_read"></a>

### `internal_social_last_read`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `user_id` | uuid | NO |  |
| 2 | `company_id` | uuid | NO |  |
| 3 | `last_read_at` | timestamptz | NO | `now()` |

<a id="internal_social_likes"></a>

### `internal_social_likes`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `post_id` | uuid | NO |  |
| 2 | `user_id` | uuid | NO |  |
| 3 | `created_at` | timestamptz | NO | `now()` |
| 4 | `reaction` | text | NO | `'like'::text` |

<a id="internal_social_post_audience"></a>

### `internal_social_post_audience`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `post_id` | uuid | NO |  |
| 2 | `user_id` | uuid | NO |  |

<a id="internal_social_post_blocked_companies"></a>

### `internal_social_post_blocked_companies`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `post_id` | uuid | NO |  |
| 2 | `company_id` | uuid | NO |  |
| 3 | `created_at` | timestamptz | NO | `now()` |

<a id="internal_social_post_companies"></a>

### `internal_social_post_companies`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `post_id` | uuid | NO |  |
| 2 | `company_id` | uuid | NO |  |
| 3 | `created_at` | timestamptz | NO | `now()` |

<a id="internal_social_post_user_hides"></a>

### `internal_social_post_user_hides`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `post_id` | uuid | NO |  |
| 2 | `user_id` | uuid | NO |  |
| 3 | `created_at` | timestamptz | NO | `now()` |

<a id="internal_social_posts"></a>

### `internal_social_posts`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `company_id` | uuid | NO |  |
| 3 | `author_id` | uuid | NO |  |
| 4 | `body` | text | NO | `''::text` |
| 5 | `link_url` | text | YES |  |
| 6 | `link_title` | text | YES |  |
| 7 | `image_url` | text | YES |  |
| 8 | `created_at` | timestamptz | NO | `now()` |
| 9 | `updated_at` | timestamptz | NO | `now()` |
| 10 | `deleted_at` | timestamptz | YES |  |
| 11 | `video_url` | text | YES |  |
| 12 | `published_at` | timestamptz | NO | `now()` |
| 13 | `visibility` | text | NO | `'company'::text` |
| 14 | `hidden_at` | timestamptz | YES |  |

<a id="invoice_items"></a>

### `invoice_items`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `invoice_id` | uuid | YES |  |
| 3 | `product_id` | uuid | YES |  |
| 4 | `order_item_id` | uuid | YES |  |
| 5 | `item_order` | integer | YES | `0` |
| 6 | `name` | text | NO |  |
| 7 | `description` | text | YES |  |
| 8 | `unit` | text | YES | `'bộ'::text` |
| 9 | `quantity` | numeric | YES | `1` |
| 10 | `unit_price` | numeric | YES | `0` |
| 11 | `discount_percent` | numeric | YES | `0` |
| 12 | `amount` | numeric | YES | `0` |
| 13 | `notes` | text | YES |  |
| 14 | `created_at` | timestamptz | YES | `now()` |
| 15 | `vat_rate` | numeric | YES | `0` |
| 16 | `vat_amount` | numeric | YES | `0` |
| 17 | `product_code` | text | YES |  |
| 18 | `height` | numeric | YES |  |
| 19 | `width` | numeric | YES |  |
| 20 | `length` | numeric | YES |  |
| 21 | `weight` | numeric | YES |  |
| 22 | `discount_amount` | numeric | YES | `0` |
| 23 | `tax_amount` | numeric | YES | `0` |
| 24 | `total` | numeric | YES | `0` |
| 25 | `promo_code` | text | YES |  |
| 26 | `is_promo` | boolean | YES | `false` |
| 27 | `spec_factor` | numeric | YES |  |
| 28 | `group_name` | text | YES |  |
| 29 | `standard_area` | numeric | YES |  |

<a id="invoices"></a>

### `invoices`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `code` | text | NO |  |
| 3 | `invoice_number` | text | YES |  |
| 4 | `customer_id` | uuid | YES |  |
| 5 | `customer_name` | text | YES |  |
| 6 | `customer_phone` | text | YES |  |
| 7 | `customer_address` | text | YES |  |
| 8 | `customer_tax_code` | text | YES |  |
| 9 | `order_id` | uuid | YES |  |
| 10 | `quotation_id` | uuid | YES |  |
| 11 | `project_id` | uuid | YES |  |
| 12 | `title` | text | YES |  |
| 13 | `description` | text | YES |  |
| 14 | `invoice_date` | date | YES | `CURRENT_DATE` |
| 15 | `due_date` | date | YES |  |
| 16 | `payment_method` | text | YES |  |
| 17 | `bank_account` | text | YES |  |
| 18 | `notes` | text | YES |  |
| 19 | `subtotal` | numeric | YES | `0` |
| 20 | `discount_type` | text | YES | `'percent'::text` |
| 21 | `discount_value` | numeric | YES | `0` |
| 22 | `discount_amount` | numeric | YES | `0` |
| 23 | `tax_rate` | numeric | YES | `10` |
| 24 | `tax_amount` | numeric | YES | `0` |
| 25 | `total` | numeric | YES | `0` |
| 26 | `paid_amount` | numeric | YES | `0` |
| 27 | `payment_status` | text | YES | `'unpaid'::text` |
| 28 | `status` | text | YES | `'draft'::text` |
| 29 | `issued_at` | timestamptz | YES |  |
| 30 | `sent_at` | timestamptz | YES |  |
| 31 | `paid_at` | timestamptz | YES |  |
| 32 | `cancelled_at` | timestamptz | YES |  |
| 33 | `created_by` | uuid | YES |  |
| 34 | `created_at` | timestamptz | YES | `now()` |
| 35 | `updated_at` | timestamptz | YES | `now()` |
| 36 | `lead_id` | uuid | YES |  |
| 37 | `misa_ref_id` | text | YES |  |
| 38 | `misa_inv_series` | text | YES |  |
| 39 | `misa_invoice_no` | text | YES |  |
| 40 | `misa_status` | text | YES | `'not_sent'::text` |
| 41 | `misa_published_at` | timestamptz | YES |  |
| 42 | `misa_lookup_code` | text | YES |  |
| 43 | `misa_error_message` | text | YES |  |
| 44 | `company_id` | uuid | YES |  |
| 45 | `region_id` | uuid | YES |  |
| 46 | `payment_terms` | text | YES |  |

<a id="knowledge_categories"></a>

### `knowledge_categories`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `company_id` | uuid | YES |  |
| 3 | `parent_id` | uuid | YES |  |
| 4 | `name` | text | NO |  |
| 5 | `slug` | text | NO |  |
| 6 | `description` | text | YES |  |
| 7 | `icon` | text | YES | `'📚'::text` |
| 8 | `sort_order` | integer | NO | `0` |
| 9 | `is_active` | boolean | NO | `true` |
| 10 | `created_by` | uuid | YES |  |
| 11 | `created_at` | timestamptz | NO | `now()` |
| 12 | `updated_at` | timestamptz | NO | `now()` |
| 13 | `badge_image_url` | text | YES |  |
| 14 | `require_all_exercises_passed` | boolean | NO | `true` |
| 15 | `certificate_template` | jsonb | NO | `'{}'::jsonb` |
| 16 | `deadline_mode` | text | NO | `'none'::text` |
| 17 | `deadline_at` | timestamptz | YES |  |
| 18 | `deadline_duration_days` | integer | YES |  |
| 19 | `deadline_note` | text | YES |  |

<a id="knowledge_category_deadline_history"></a>

### `knowledge_category_deadline_history`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `category_id` | uuid | NO |  |
| 3 | `changed_by` | uuid | YES |  |
| 4 | `prev_mode` | text | YES |  |
| 5 | `prev_deadline_at` | timestamptz | YES |  |
| 6 | `prev_duration_days` | integer | YES |  |
| 7 | `new_mode` | text | YES |  |
| 8 | `new_deadline_at` | timestamptz | YES |  |
| 9 | `new_duration_days` | integer | YES |  |
| 10 | `note` | text | YES |  |
| 11 | `created_at` | timestamptz | NO | `now()` |

<a id="knowledge_certificates"></a>

### `knowledge_certificates`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `category_id` | uuid | NO |  |
| 4 | `certificate_number` | text | NO |  |
| 5 | `verify_code` | text | NO |  |
| 6 | `total_lessons` | integer | NO | `0` |
| 7 | `completed_lessons` | integer | NO | `0` |
| 8 | `avg_exercise_score` | numeric | YES |  |
| 9 | `passed_exercises` | integer | NO | `0` |
| 10 | `total_exercises` | integer | NO | `0` |
| 11 | `metadata` | jsonb | NO | `'{}'::jsonb` |
| 12 | `status` | text | NO | `'issued'::text` |
| 13 | `revoked_at` | timestamptz | YES |  |
| 14 | `revoked_by` | uuid | YES |  |
| 15 | `revoked_reason` | text | YES |  |
| 16 | `issued_at` | timestamptz | NO | `now()` |
| 17 | `badge_image_url` | text | YES |  |

<a id="knowledge_exercise_submissions"></a>

### `knowledge_exercise_submissions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `exercise_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `answers` | jsonb | NO | `'{}'::jsonb` |
| 5 | `score` | numeric | YES |  |
| 6 | `status` | knowledge_submission_status | NO | `'submitted'::knowledge_submission_status` |
| 7 | `feedback` | text | YES |  |
| 8 | `attempt_number` | integer | NO | `1` |
| 9 | `submitted_at` | timestamptz | NO | `now()` |
| 10 | `graded_by` | uuid | YES |  |
| 11 | `graded_at` | timestamptz | YES |  |
| 12 | `submitted_late` | boolean | NO | `false` |
| 13 | `deadline_snapshot` | timestamptz | YES |  |

<a id="knowledge_exercises"></a>

### `knowledge_exercises`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `lesson_id` | uuid | NO |  |
| 3 | `title` | text | NO |  |
| 4 | `instructions` | text | YES |  |
| 5 | `type` | knowledge_exercise_type | NO | `'quiz'::knowledge_exercise_type` |
| 6 | `questions` | jsonb | NO | `'{"items": []}'::jsonb` |
| 7 | `passing_score` | numeric | YES | `70` |
| 8 | `max_attempts` | integer | YES |  |
| 9 | `sort_order` | integer | NO | `0` |
| 10 | `created_at` | timestamptz | NO | `now()` |
| 11 | `updated_at` | timestamptz | NO | `now()` |
| 12 | `image_url` | text | YES |  |
| 13 | `video_url` | text | YES |  |
| 14 | `video_type` | text | YES |  |
| 15 | `attachments` | jsonb | NO | `'[]'::jsonb` |
| 16 | `time_limit_minutes` | integer | YES |  |

<a id="knowledge_lesson_progress"></a>

### `knowledge_lesson_progress`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `lesson_id` | uuid | NO |  |
| 4 | `status` | knowledge_progress_status | NO | `'not_started'::knowledge_progress_status` |
| 5 | `started_at` | timestamptz | YES |  |
| 6 | `completed_at` | timestamptz | YES |  |
| 7 | `last_viewed_at` | timestamptz | YES | `now()` |
| 8 | `completed_late` | boolean | NO | `false` |
| 9 | `deadline_snapshot` | timestamptz | YES |  |

<a id="knowledge_lessons"></a>

### `knowledge_lessons`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `category_id` | uuid | NO |  |
| 3 | `title` | text | NO |  |
| 4 | `summary` | text | YES |  |
| 5 | `content_md` | text | YES |  |
| 6 | `video_url` | text | YES |  |
| 7 | `video_type` | text | YES |  |
| 8 | `duration_minutes` | integer | YES |  |
| 9 | `sort_order` | integer | NO | `0` |
| 10 | `is_published` | boolean | NO | `false` |
| 11 | `published_at` | timestamptz | YES |  |
| 12 | `target_roles` | text[] | YES | `'{}'::text[]` |
| 13 | `created_by` | uuid | YES |  |
| 14 | `created_at` | timestamptz | NO | `now()` |
| 15 | `updated_at` | timestamptz | NO | `now()` |
| 16 | `cover_image_url` | text | YES |  |
| 17 | `attachments` | jsonb | NO | `'[]'::jsonb` |
| 18 | `tags` | text[] | YES | `'{}'::text[]` |
| 19 | `is_required` | boolean | NO | `false` |
| 20 | `is_final_exam` | boolean | NO | `false` |

<a id="kpi_business_hours_config"></a>

### `kpi_business_hours_config`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `company_id` | uuid | YES |  |
| 3 | `start_minute` | integer | NO | `480` |
| 4 | `end_minute` | integer | NO | `1020` |
| 5 | `lunch_start_minute` | integer | YES |  |
| 6 | `lunch_end_minute` | integer | YES |  |
| 7 | `work_days` | _int2 | NO | `ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::s...` |
| 8 | `timezone` | text | NO | `'Asia/Ho_Chi_Minh'::text` |
| 9 | `notes` | text | YES |  |
| 10 | `is_active` | boolean | NO | `true` |
| 11 | `created_at` | timestamptz | NO | `now()` |
| 12 | `updated_at` | timestamptz | NO | `now()` |

<a id="kpi_definitions"></a>

### `kpi_definitions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `code` | text | NO |  |
| 3 | `name` | text | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `group_code` | text | NO |  |
| 6 | `formula_type` | text | NO |  |
| 7 | `unit` | text | YES |  |
| 8 | `weight` | numeric | NO | `0` |
| 9 | `target_default` | numeric | YES |  |
| 10 | `target_max` | numeric | YES |  |
| 11 | `min_threshold` | numeric | YES |  |
| 12 | `is_gating` | boolean | NO | `false` |
| 13 | `applies_to` | text | NO | `'sales'::text` |
| 14 | `data_source_note` | text | YES |  |
| 15 | `is_active` | boolean | NO | `true` |
| 16 | `created_at` | timestamptz | NO | `now()` |
| 17 | `updated_at` | timestamptz | NO | `now()` |
| 18 | `calc_params` | jsonb | NO | `'{}'::jsonb` |

<a id="kpi_holidays"></a>

### `kpi_holidays`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `company_id` | uuid | YES |  |
| 3 | `holiday_date` | date | NO |  |
| 4 | `name` | text | NO |  |
| 5 | `repeat_yearly` | boolean | NO | `false` |
| 6 | `is_half_day` | boolean | NO | `false` |
| 7 | `notes` | text | YES |  |
| 8 | `created_by` | uuid | YES |  |
| 9 | `created_at` | timestamptz | NO | `now()` |

<a id="kpi_periods"></a>

### `kpi_periods`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `period_type` | text | NO |  |
| 3 | `period_start` | date | NO |  |
| 4 | `period_end` | date | NO |  |
| 5 | `status` | text | NO | `'open'::text` |
| 6 | `closed_at` | timestamptz | YES |  |
| 7 | `closed_by` | uuid | YES |  |
| 8 | `created_at` | timestamptz | NO | `now()` |

<a id="kpi_scores"></a>

### `kpi_scores`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `kpi_definition_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `period_id` | uuid | NO |  |
| 5 | `company_id` | uuid | YES |  |
| 6 | `actual_value` | numeric | YES |  |
| 7 | `target_value` | numeric | YES |  |
| 8 | `weight_used` | numeric | YES |  |
| 9 | `raw_score` | numeric | YES |  |
| 10 | `capped_score` | numeric | YES |  |
| 11 | `breakdown` | jsonb | YES |  |
| 12 | `computed_at` | timestamptz | NO | `now()` |

<a id="kpi_targets"></a>

### `kpi_targets`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `kpi_definition_id` | uuid | NO |  |
| 3 | `user_id` | uuid | YES |  |
| 4 | `company_id` | uuid | YES |  |
| 5 | `period_type` | text | NO |  |
| 6 | `period_start` | date | NO |  |
| 7 | `target_value` | numeric | NO |  |
| 8 | `weight_override` | numeric | YES |  |
| 9 | `notes` | text | YES |  |
| 10 | `created_by` | uuid | YES |  |
| 11 | `created_at` | timestamptz | NO | `now()` |
| 12 | `updated_at` | timestamptz | NO | `now()` |

<a id="kpi_user_leaves"></a>

### `kpi_user_leaves`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `start_date` | date | NO |  |
| 4 | `end_date` | date | NO |  |
| 5 | `leave_type` | kpi_leave_type | NO | `'paid'::kpi_leave_type` |
| 6 | `half_day` | text | NO | `'full'::text` |
| 7 | `reason` | text | YES |  |
| 8 | `approved_by` | uuid | YES |  |
| 9 | `approved_at` | timestamptz | YES |  |
| 10 | `status` | text | NO | `'approved'::text` |
| 11 | `created_at` | timestamptz | NO | `now()` |
| 12 | `updated_at` | timestamptz | NO | `now()` |

<a id="lead_documents"></a>

### `lead_documents`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `lead_id` | uuid | NO |  |
| 3 | `name` | text | NO |  |
| 4 | `doc_type` | text | YES | `'other'::text` |
| 5 | `file_url` | text | YES |  |
| 6 | `file_name` | text | YES |  |
| 7 | `file_size` | integer | YES |  |
| 8 | `mime_type` | text | YES |  |
| 9 | `notes` | text | YES |  |
| 10 | `created_by` | uuid | YES |  |
| 11 | `created_at` | timestamptz | YES | `now()` |
| 12 | `project_id` | uuid | YES |  |
| 13 | `allowed_departments` | jsonb | YES |  |
| 14 | `allowed_companies` | jsonb | YES |  |
| 15 | `source_attachment_id` | uuid | YES |  |
| 16 | `shared_to_workshop` | boolean | NO | `false` |
| 17 | `allowed_share_modules` | jsonb | YES |  |
| 18 | `source_project_task_id` | uuid | YES |  |
| 19 | `source_crm_task_id` | uuid | YES |  |
| 20 | `crm_stage_slug` | text | YES |  |
| 21 | `crm_stage_group_label` | text | YES |  |
| 22 | `source_checklist_id` | text | YES |  |
| 23 | `source_file_attachment_id` | uuid | YES |  |
| 24 | `source_drive_file_id` | uuid | YES |  |

<a id="lead_members"></a>

### `lead_members`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `lead_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `role` | text | YES | `'member'::text` |
| 5 | `added_by` | uuid | YES |  |
| 6 | `created_at` | timestamptz | YES | `now()` |
| 7 | `history_cutoff_at` | timestamptz | YES |  |

<a id="lead_message_reactions"></a>

### `lead_message_reactions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `message_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `emoji` | text | NO |  |
| 5 | `created_at` | timestamptz | YES | `now()` |

<a id="lead_messages"></a>

### `lead_messages`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `lead_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `content` | text | NO |  |
| 5 | `message_type` | text | YES | `'text'::text` |
| 6 | `attachment_url` | text | YES |  |
| 7 | `attachment_name` | text | YES |  |
| 8 | `is_system` | boolean | YES | `false` |
| 9 | `created_at` | timestamptz | YES | `now()` |
| 10 | `reply_to` | text | YES |  |
| 11 | `attachments` | jsonb | YES |  |

<a id="logistics_handover_settings"></a>

### `logistics_handover_settings`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `logistics_company_id` | uuid | NO |  |
| 2 | `responsible_user_id` | uuid | YES |  |
| 3 | `installer_user_id` | uuid | YES |  |
| 4 | `updated_at` | timestamptz | YES | `now()` |
| 5 | `handover_confirm_user_id` | uuid | YES |  |

<a id="logistics_pipeline_stages"></a>

### `logistics_pipeline_stages`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | text | NO |  |
| 3 | `color` | text | YES | `'#f97316'::text` |
| 4 | `icon` | text | YES | `'📦'::text` |
| 5 | `order_index` | integer | YES | `0` |
| 6 | `is_active` | boolean | YES | `true` |
| 7 | `workflow_stage_id` | uuid | YES |  |
| 8 | `bucket_slug` | text | YES |  |
| 9 | `crm_sync_type` | text | YES |  |
| 10 | `created_at` | timestamptz | YES | `now()` |
| 11 | `updated_at` | timestamptz | YES | `now()` |
| 12 | `crm_target_stage_id` | uuid | YES |  |
| 13 | `company_id` | uuid | YES |  |
| 14 | `progress_percent` | integer | YES |  |
| 15 | `is_handover_to_install` | boolean | NO | `false` |
| 16 | `is_temp_install_staging` | boolean | YES | `false` |

<a id="messenger_chat_wallpapers"></a>

### `messenger_chat_wallpapers`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `viewer_user_id` | uuid | NO |  |
| 2 | `group_id` | uuid | NO |  |
| 3 | `wallpaper_url` | text | YES |  |
| 4 | `updated_at` | timestamptz | NO | `now()` |

<a id="messenger_contact_nicknames"></a>

### `messenger_contact_nicknames`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `viewer_user_id` | uuid | NO |  |
| 2 | `target_user_id` | uuid | NO |  |
| 3 | `nickname` | text | NO |  |
| 4 | `updated_at` | timestamptz | NO | `now()` |

<a id="messenger_group_member_nicknames"></a>

### `messenger_group_member_nicknames`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `viewer_user_id` | uuid | NO |  |
| 2 | `group_id` | uuid | NO |  |
| 3 | `target_user_id` | uuid | NO |  |
| 4 | `nickname` | text | NO |  |
| 5 | `updated_at` | timestamptz | NO | `now()` |

<a id="messenger_group_members"></a>

### `messenger_group_members`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `group_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `role` | text | NO | `'member'::text` |
| 5 | `added_by` | uuid | YES |  |
| 6 | `created_at` | timestamptz | YES | `now()` |

<a id="messenger_group_messages"></a>

### `messenger_group_messages`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `group_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `content` | text | YES |  |
| 5 | `message_type` | text | YES | `'text'::text` |
| 6 | `attachments` | jsonb | YES |  |
| 7 | `attachment_url` | text | YES |  |
| 8 | `attachment_name` | text | YES |  |
| 9 | `attachment_size` | integer | YES |  |
| 10 | `attachment_mime` | text | YES |  |
| 11 | `reply_to` | uuid | YES |  |
| 12 | `is_system` | boolean | YES | `false` |
| 13 | `created_at` | timestamptz | YES | `now()` |
| 14 | `recalled_at` | timestamptz | YES |  |
| 15 | `recalled_by` | uuid | YES |  |
| 16 | `is_recalled` | boolean | NO | `false` |
| 17 | `mention_user_ids` | uuid[] | NO | `'{}'::uuid[]` |

<a id="messenger_groups"></a>

### `messenger_groups`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | text | NO |  |
| 3 | `created_by` | uuid | NO |  |
| 4 | `created_at` | timestamptz | YES | `now()` |
| 5 | `is_direct` | boolean | NO | `false` |
| 6 | `direct_pair_key` | text | YES |  |
| 7 | `crm_lead_id` | uuid | YES |  |
| 8 | `avatar` | text | YES |  |

<a id="messenger_message_reactions"></a>

### `messenger_message_reactions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `message_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `emoji` | text | NO |  |
| 5 | `created_at` | timestamptz | NO | `now()` |

<a id="messenger_read_receipts"></a>

### `messenger_read_receipts`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `group_id` | uuid | NO |  |
| 2 | `user_id` | uuid | NO |  |
| 3 | `last_read_at` | timestamptz | NO | `now()` |

<a id="messenger_user_pins"></a>

### `messenger_user_pins`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `user_id` | uuid | NO |  |
| 2 | `group_id` | uuid | NO |  |
| 3 | `pinned_at` | timestamptz | NO | `now()` |

<a id="misa_config"></a>

### `misa_config`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `app_id` | text | NO |  |
| 3 | `taxcode` | text | NO |  |
| 4 | `username` | text | NO |  |
| 5 | `password_encrypted` | text | NO |  |
| 6 | `inv_series` | text | NO | `'1C26TYY'::text` |
| 7 | `sign_type` | integer | NO | `2` |
| 8 | `is_production` | boolean | NO | `false` |
| 9 | `created_at` | timestamptz | YES | `now()` |
| 10 | `updated_at` | timestamptz | YES | `now()` |

<a id="mobile_apps"></a>

### `mobile_apps`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `app_key` | text | NO |  |
| 3 | `display_name` | text | NO |  |
| 4 | `android_package` | text | YES |  |
| 5 | `platform` | text | NO | `'android'::text` |
| 6 | `icon_url` | text | YES |  |
| 7 | `is_active` | boolean | NO | `true` |
| 8 | `created_at` | timestamptz | NO | `now()` |
| 9 | `updated_at` | timestamptz | NO | `now()` |

<a id="notification_mutes"></a>

### `notification_mutes`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `entity_type` | text | NO | `'lead'::text` |
| 4 | `entity_id` | uuid | NO |  |
| 5 | `mute_scope` | text | NO | `'comment_added'::text` |
| 6 | `muted_until` | timestamptz | YES |  |
| 7 | `created_at` | timestamptz | NO | `now()` |
| 8 | `updated_at` | timestamptz | NO | `now()` |

<a id="notification_preferences"></a>

### `notification_preferences`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `user_id` | uuid | NO |  |
| 2 | `email_on_assign` | boolean | YES | `true` |
| 3 | `email_on_comment` | boolean | YES | `false` |
| 4 | `email_on_mention` | boolean | YES | `true` |
| 5 | `email_on_deadline` | boolean | YES | `true` |
| 6 | `push_enabled` | boolean | YES | `true` |
| 7 | `updated_at` | timestamp | YES | `now()` |
| 8 | `lead_new` | boolean | YES | `true` |
| 9 | `deal_new` | boolean | YES | `true` |
| 10 | `production_deadlines` | boolean | YES | `true` |
| 11 | `crm_lead_deadlines` | boolean | YES | `true` |
| 12 | `project_notifications` | boolean | YES | `false` |
| 13 | `browser_push` | boolean | NO | `true` |
| 14 | `sound` | boolean | NO | `true` |
| 15 | `task_assigned` | boolean | NO | `true` |
| 16 | `task_completed` | boolean | NO | `true` |
| 17 | `deadline_warning` | boolean | NO | `true` |
| 18 | `comment_added` | boolean | NO | `true` |
| 19 | `comment_show_on_screen` | boolean | NO | `true` |
| 20 | `stage_changed` | boolean | NO | `true` |
| 21 | `deal_won` | boolean | NO | `true` |
| 22 | `approval_request` | boolean | NO | `true` |
| 23 | `checklist_completed` | boolean | NO | `true` |
| 24 | `lead_assigned` | boolean | NO | `true` |
| 25 | `order_confirmed` | boolean | NO | `true` |
| 26 | `invoice_overdue` | boolean | NO | `true` |
| 27 | `logistics_deadlines` | boolean | NO | `true` |

<a id="notifications"></a>

### `notifications`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `type` | text | NO |  |
| 4 | `title` | varchar | NO |  |
| 5 | `message` | text | YES |  |
| 6 | `entity_type` | varchar | YES |  |
| 7 | `entity_id` | text | YES |  |
| 8 | `is_read` | boolean | YES | `false` |
| 9 | `read_at` | timestamptz | YES |  |
| 10 | `metadata` | jsonb | YES |  |
| 11 | `created_at` | timestamptz | YES | `now()` |
| 12 | `dismissed_at` | timestamptz | YES |  |

<a id="order_cross_acceptances"></a>

### `order_cross_acceptances`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `order_id` | uuid | NO |  |
| 3 | `check_type` | text | NO | `'crm_vs_orders'::text` |
| 4 | `status` | text | NO | `'accepted'::text` |
| 5 | `notes` | text | YES |  |
| 6 | `checked_by` | uuid | YES |  |
| 7 | `checked_at` | timestamptz | YES | `now()` |
| 8 | `snapshot_order_total` | numeric | YES |  |
| 9 | `snapshot_lead_value` | numeric | YES |  |
| 10 | `snapshot_project_value` | numeric | YES |  |
| 11 | `created_at` | timestamptz | YES | `now()` |

<a id="order_items"></a>

### `order_items`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `order_id` | uuid | YES |  |
| 3 | `product_id` | uuid | YES |  |
| 4 | `quotation_item_id` | uuid | YES |  |
| 5 | `item_order` | integer | YES | `0` |
| 6 | `name` | text | NO |  |
| 7 | `description` | text | YES |  |
| 8 | `unit` | text | YES | `'bộ'::text` |
| 9 | `quantity` | numeric | YES | `1` |
| 10 | `unit_price` | numeric | YES | `0` |
| 11 | `discount_percent` | numeric | YES | `0` |
| 12 | `amount` | numeric | YES | `0` |
| 13 | `dimensions` | text | YES |  |
| 14 | `material` | text | YES |  |
| 15 | `color` | text | YES |  |
| 16 | `notes` | text | YES |  |
| 17 | `created_at` | timestamptz | YES | `now()` |
| 18 | `vat_rate` | numeric | YES | `0` |
| 19 | `vat_amount` | numeric | YES | `0` |
| 20 | `product_code` | text | YES |  |
| 21 | `height` | numeric | YES |  |
| 22 | `width` | numeric | YES |  |
| 23 | `length` | numeric | YES |  |
| 24 | `weight` | numeric | YES |  |
| 25 | `discount_amount` | numeric | YES | `0` |
| 26 | `tax_amount` | numeric | YES | `0` |
| 27 | `total` | numeric | YES | `0` |
| 28 | `promo_code` | text | YES |  |
| 29 | `is_promo` | boolean | YES | `false` |
| 30 | `spec_factor` | numeric | YES |  |
| 31 | `group_name` | text | YES |  |
| 32 | `standard_area` | numeric | YES |  |

<a id="orders"></a>

### `orders`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `code` | text | NO |  |
| 3 | `customer_id` | uuid | YES |  |
| 4 | `customer_name` | text | YES |  |
| 5 | `customer_phone` | text | YES |  |
| 6 | `customer_address` | text | YES |  |
| 7 | `quotation_id` | uuid | YES |  |
| 8 | `lead_id` | uuid | YES |  |
| 9 | `project_id` | uuid | YES |  |
| 10 | `title` | text | YES |  |
| 11 | `description` | text | YES |  |
| 12 | `order_date` | date | YES | `CURRENT_DATE` |
| 13 | `delivery_date` | date | YES |  |
| 14 | `payment_terms` | text | YES |  |
| 15 | `delivery_address` | text | YES |  |
| 16 | `notes` | text | YES |  |
| 17 | `subtotal` | numeric | YES | `0` |
| 18 | `discount_type` | text | YES | `'percent'::text` |
| 19 | `discount_value` | numeric | YES | `0` |
| 20 | `discount_amount` | numeric | YES | `0` |
| 21 | `tax_rate` | numeric | YES | `10` |
| 22 | `tax_amount` | numeric | YES | `0` |
| 23 | `total` | numeric | YES | `0` |
| 24 | `paid_amount` | numeric | YES | `0` |
| 25 | `payment_status` | text | YES | `'unpaid'::text` |
| 26 | `status` | text | YES | `'draft'::text` |
| 27 | `confirmed_at` | timestamptz | YES |  |
| 28 | `shipped_at` | timestamptz | YES |  |
| 29 | `delivered_at` | timestamptz | YES |  |
| 30 | `cancelled_at` | timestamptz | YES |  |
| 31 | `cancel_reason` | text | YES |  |
| 32 | `created_by` | uuid | YES |  |
| 33 | `created_at` | timestamptz | YES | `now()` |
| 34 | `updated_at` | timestamptz | YES | `now()` |
| 35 | `display_label` | text | YES |  |
| 36 | `sort_index` | integer | NO | `0` |
| 37 | `order_phase` | text | NO | `'draft'::text` |
| 38 | `fulfillment_lead_id` | uuid | YES |  |
| 39 | `logistics_project_id` | uuid | YES |  |
| 40 | `order_kind` | text | NO | `'sales'::text` |
| 41 | `sx_company_id` | uuid | YES |  |
| 42 | `sx_start_date` | date | YES |  |
| 43 | `sx_expected_end_date` | date | YES |  |
| 44 | `sx_construction_assignee_id` | uuid | YES |  |
| 45 | `valid_until` | date | YES |  |
| 46 | `delivery_terms` | text | YES |  |
| 47 | `deposit_amount` | numeric | YES |  |
| 48 | `deposit_received` | boolean | YES |  |
| 49 | `deposit_label` | text | YES |  |
| 50 | `remaining_amount` | numeric | YES |  |
| 51 | `remaining_note` | text | YES |  |
| 52 | `company_id` | uuid | YES |  |
| 53 | `region_id` | uuid | YES |  |
| 54 | `deposit_installments` | jsonb | YES |  |

<a id="payment_records"></a>

### `payment_records`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `invoice_id` | uuid | YES |  |
| 3 | `order_id` | uuid | YES |  |
| 4 | `amount` | numeric | NO |  |
| 5 | `payment_date` | date | YES | `CURRENT_DATE` |
| 6 | `payment_method` | text | YES |  |
| 7 | `reference_number` | text | YES |  |
| 8 | `notes` | text | YES |  |
| 9 | `created_by` | uuid | YES |  |
| 10 | `created_at` | timestamptz | YES | `now()` |

<a id="permission_audit_log"></a>

### `permission_audit_log`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | YES |  |
| 3 | `action` | varchar | NO |  |
| 4 | `resource_type` | varchar | YES |  |
| 5 | `resource_id` | uuid | YES |  |
| 6 | `unit_id` | uuid | YES |  |
| 7 | `allowed` | boolean | NO |  |
| 8 | `reason` | text | YES |  |
| 9 | `ip_address` | inet | YES |  |
| 10 | `user_agent` | text | YES |  |
| 11 | `created_at` | timestamptz | YES | `now()` |

<a id="permissions"></a>

### `permissions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `resource` | varchar | NO |  |
| 3 | `action` | varchar | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `is_active` | boolean | YES | `true` |
| 6 | `created_at` | timestamptz | YES | `now()` |

<a id="pipeline_stage_module_links"></a>

### `pipeline_stage_module_links`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `source_kind` | text | NO |  |
| 3 | `source_stage_id` | uuid | NO |  |
| 4 | `target_module_id` | uuid | NO |  |
| 5 | `link_type` | text | NO |  |
| 6 | `enabled` | boolean | NO | `true` |
| 7 | `created_at` | timestamptz | NO | `now()` |
| 8 | `updated_at` | timestamptz | NO | `now()` |

<a id="product_brands"></a>

### `product_brands`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `company_id` | uuid | YES |  |
| 3 | `name` | text | NO |  |
| 4 | `code` | text | YES |  |
| 5 | `logo_url` | text | YES |  |
| 6 | `notes` | text | YES |  |
| 7 | `is_active` | boolean | NO | `true` |
| 8 | `created_at` | timestamptz | NO | `now()` |
| 9 | `updated_at` | timestamptz | NO | `now()` |

<a id="product_categories"></a>

### `product_categories`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | varchar | NO |  |
| 3 | `slug` | varchar | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `parent_id` | uuid | YES |  |
| 6 | `image_url` | varchar | YES |  |
| 7 | `order_index` | integer | YES | `0` |
| 8 | `is_active` | boolean | YES | `true` |
| 9 | `created_at` | timestamptz | YES | `now()` |
| 10 | `company_id` | uuid | YES |  |

<a id="product_code_parts"></a>

### `product_code_parts`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `part_type` | text | NO |  |
| 3 | `code` | text | NO |  |
| 4 | `name` | text | NO |  |
| 5 | `description` | text | YES |  |
| 6 | `order_index` | integer | YES | `0` |
| 7 | `is_active` | boolean | YES | `true` |
| 8 | `created_at` | timestamptz | YES | `now()` |

<a id="product_components"></a>

### `product_components`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `code` | varchar | NO |  |
| 3 | `name` | varchar | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `category` | varchar | YES |  |
| 6 | `unit` | varchar | YES | `'cái'::character varying` |
| 7 | `unit_price` | numeric | YES | `0` |
| 8 | `supplier` | varchar | YES |  |
| 9 | `supplier_code` | varchar | YES |  |
| 10 | `material` | varchar | YES |  |
| 11 | `specifications` | jsonb | YES |  |
| 12 | `stock_quantity` | integer | YES | `0` |
| 13 | `min_stock` | integer | YES | `5` |
| 14 | `image_url` | varchar | YES |  |
| 15 | `is_active` | boolean | YES | `true` |
| 16 | `created_at` | timestamptz | YES | `now()` |
| 17 | `updated_at` | timestamptz | YES | `now()` |

<a id="product_structures"></a>

### `product_structures`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `product_id` | uuid | NO |  |
| 3 | `component_id` | uuid | NO |  |
| 4 | `quantity` | numeric | NO | `1` |
| 5 | `unit` | varchar | YES |  |
| 6 | `notes` | text | YES |  |
| 7 | `order_index` | integer | YES | `0` |
| 8 | `created_at` | timestamptz | YES | `now()` |

<a id="production_external_companies"></a>

### `production_external_companies`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `production_company_id` | uuid | NO |  |
| 3 | `name` | text | NO |  |
| 4 | `is_active` | boolean | NO | `true` |
| 5 | `created_by` | uuid | YES |  |
| 6 | `created_at` | timestamptz | NO | `now()` |
| 7 | `linked_company_id` | uuid | YES |  |

<a id="production_handover_settings"></a>

### `production_handover_settings`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `production_company_id` | uuid | NO |  |
| 2 | `responsible_user_id` | uuid | YES |  |
| 3 | `default_production_team_id` | uuid | YES |  |
| 4 | `updated_at` | timestamptz | YES | `now()` |
| 5 | `delivery_confirm_user_id` | uuid | YES |  |

<a id="production_handover_task_assignments"></a>

### `production_handover_task_assignments`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `production_company_id` | uuid | NO |  |
| 3 | `template_item_id` | uuid | NO |  |
| 4 | `assignee_user_id` | uuid | YES |  |
| 5 | `created_at` | timestamptz | YES | `now()` |

<a id="production_pipeline_stage_default_staff"></a>

### `production_pipeline_stage_default_staff`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `production_pipeline_stage_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `order_index` | integer | NO | `0` |
| 5 | `is_primary` | boolean | NO | `false` |
| 6 | `created_at` | timestamptz | YES | `now()` |
| 7 | `staff_kind` | text | NO | `'production'::text` |

<a id="production_pipeline_stages"></a>

### `production_pipeline_stages`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | text | NO |  |
| 3 | `color` | text | YES | `'#0f766e'::text` |
| 4 | `icon` | text | YES |  |
| 5 | `order_index` | integer | NO | `0` |
| 6 | `is_active` | boolean | YES | `true` |
| 7 | `workflow_stage_id` | uuid | YES |  |
| 8 | `bucket_slug` | text | YES |  |
| 9 | `created_at` | timestamptz | YES | `now()` |
| 10 | `is_handover_to_logistics` | boolean | YES | `false` |
| 11 | `crm_sync_type` | text | YES |  |
| 12 | `crm_target_stage_id` | uuid | YES |  |
| 13 | `company_id` | uuid | YES |  |
| 14 | `progress_percent` | integer | YES |  |
| 15 | `workshop_type_id` | uuid | YES |  |
| 16 | `default_probability` | integer | YES |  |
| 17 | `sla_days` | integer | YES |  |
| 18 | `counts_as_won_revenue` | boolean | YES |  |
| 19 | `counts_as_completed_revenue` | boolean | YES |  |
| 20 | `requires_deadline` | boolean | NO | `false` |
| 21 | `counts_as_collected_revenue` | boolean | YES |  |
| 22 | `converts_workshop_type` | boolean | NO | `false` |
| 23 | `target_workshop_type_id` | uuid | YES |  |
| 24 | `auto_add_members_on_enter` | boolean | NO | `false` |
| 25 | `is_packaging_done` | boolean | NO | `false` |
| 26 | `deadline_group` | text | YES |  |

<a id="production_workshop_client_companies"></a>

### `production_workshop_client_companies`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `production_company_id` | uuid | NO |  |
| 3 | `client_company_id` | uuid | NO |  |
| 4 | `is_active` | boolean | NO | `true` |
| 5 | `created_at` | timestamptz | NO | `now()` |

<a id="production_workshop_type_default_staff"></a>

### `production_workshop_type_default_staff`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `production_company_id` | uuid | NO |  |
| 3 | `workshop_type_id` | uuid | NO |  |
| 4 | `user_id` | uuid | NO |  |
| 5 | `order_index` | integer | NO | `0` |
| 6 | `created_at` | timestamptz | YES | `now()` |
| 7 | `is_primary` | boolean | NO | `false` |

<a id="products"></a>

### `products`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `code` | varchar | NO |  |
| 3 | `name` | varchar | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `category_id` | uuid | YES |  |
| 6 | `sku` | varchar | YES |  |
| 7 | `unit` | varchar | YES | `'cái'::character varying` |
| 8 | `base_price` | numeric | YES | `0` |
| 9 | `cost_price` | numeric | YES | `0` |
| 10 | `image_url` | varchar | YES |  |
| 11 | `dimensions` | jsonb | YES |  |
| 12 | `material` | varchar | YES |  |
| 13 | `color` | varchar | YES |  |
| 14 | `finish` | varchar | YES |  |
| 15 | `specifications` | jsonb | YES |  |
| 16 | `status` | varchar | YES | `'active'::character varying` |
| 17 | `stock_quantity` | integer | YES | `0` |
| 18 | `min_stock` | integer | YES | `0` |
| 19 | `tags` | jsonb | YES | `'[]'::jsonb` |
| 20 | `created_at` | timestamptz | YES | `now()` |
| 21 | `updated_at` | timestamptz | YES | `now()` |
| 22 | `selling_price` | numeric | YES | `0` |
| 23 | `vat_rate` | numeric | YES | `10` |
| 24 | `code_group` | text | YES |  |
| 25 | `code_spec` | text | YES |  |
| 26 | `code_standard` | text | YES |  |
| 27 | `code_category` | text | YES |  |
| 28 | `code_style` | text | YES |  |
| 29 | `code_glass` | text | YES |  |
| 30 | `code_type_std` | text | YES |  |
| 31 | `code_side` | text | YES |  |
| 32 | `code_size` | text | YES |  |
| 33 | `company_id` | uuid | YES |  |
| 34 | `brand_id` | uuid | YES |  |

<a id="project_approvals"></a>

### `project_approvals`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `project_id` | uuid | NO |  |
| 3 | `stage_id` | uuid | NO |  |
| 4 | `requested_by` | uuid | NO |  |
| 5 | `decided_by` | uuid | YES |  |
| 6 | `status` | varchar | NO | `'pending'::character varying` |
| 7 | `notes` | text | YES |  |
| 8 | `attachments` | jsonb | YES | `'[]'::jsonb` |
| 9 | `reject_reason` | text | YES |  |
| 10 | `approve_notes` | text | YES |  |
| 11 | `next_stage_slug` | varchar | YES |  |
| 12 | `next_status` | varchar | YES |  |
| 13 | `decided_at` | timestamptz | YES |  |
| 14 | `created_at` | timestamptz | YES | `now()` |
| 15 | `updated_at` | timestamptz | YES | `now()` |

<a id="project_comment_reactions"></a>

### `project_comment_reactions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `comment_id` | uuid | NO |  |
| 2 | `user_id` | uuid | NO |  |
| 3 | `emoji` | text | NO |  |
| 4 | `created_at` | timestamptz | NO | `now()` |

<a id="project_comment_read_receipts"></a>

### `project_comment_read_receipts`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `project_id` | uuid | NO |  |
| 2 | `user_id` | uuid | NO |  |
| 3 | `last_read_at` | timestamptz | NO | `now()` |

<a id="project_comments"></a>

### `project_comments`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `project_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `content` | text | NO |  |
| 5 | `created_at` | timestamptz | YES | `now()` |
| 6 | `attachments` | jsonb | YES | `'[]'::jsonb` |
| 7 | `updated_at` | timestamptz | NO | `now()` |
| 8 | `deleted_at` | timestamptz | YES |  |
| 9 | `parent_id` | uuid | YES |  |

<a id="project_company_assignments"></a>

### `project_company_assignments`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `project_id` | uuid | NO |  |
| 3 | `division_unit_id` | uuid | NO |  |
| 4 | `company_unit_id` | uuid | NO |  |
| 5 | `template_set_id` | uuid | YES |  |
| 6 | `status` | varchar | YES | `'pending'::character varying` |
| 7 | `order_index` | integer | YES | `0` |
| 8 | `started_at` | timestamptz | YES |  |
| 9 | `completed_at` | timestamptz | YES |  |
| 10 | `handoff_notes` | text | YES |  |
| 11 | `created_at` | timestamptz | YES | `now()` |
| 12 | `company_id` | uuid | YES |  |

<a id="project_expenses"></a>

### `project_expenses`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `project_id` | uuid | NO |  |
| 3 | `amount` | numeric | NO |  |
| 4 | `expense_date` | date | YES | `CURRENT_DATE` |
| 5 | `category` | text | YES |  |
| 6 | `description` | text | YES |  |
| 7 | `created_by` | uuid | YES |  |
| 8 | `created_at` | timestamptz | YES | `now()` |

<a id="project_incidents"></a>

### `project_incidents`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `project_id` | uuid | NO |  |
| 3 | `reported_by` | uuid | YES |  |
| 4 | `title` | varchar | NO |  |
| 5 | `description` | text | YES |  |
| 6 | `severity` | varchar | YES | `'medium'::character varying` |
| 7 | `status` | varchar | YES | `'open'::character varying` |
| 8 | `resolved_at` | timestamptz | YES |  |
| 9 | `resolved_by` | uuid | YES |  |
| 10 | `created_at` | timestamptz | YES | `now()` |
| 11 | `updated_at` | timestamptz | YES | `now()` |

<a id="project_phase_handoffs"></a>

### `project_phase_handoffs`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `project_id` | uuid | NO |  |
| 3 | `from_division_id` | uuid | NO |  |
| 4 | `to_division_id` | uuid | NO |  |
| 5 | `summary` | text | YES |  |
| 6 | `files_json` | jsonb | YES | `'[]'::jsonb` |
| 7 | `notes` | text | YES |  |
| 8 | `status` | varchar | YES | `'pending'::character varying` |
| 9 | `created_by` | uuid | YES |  |
| 10 | `accepted_by` | uuid | YES |  |
| 11 | `created_at` | timestamptz | YES | `now()` |
| 12 | `accepted_at` | timestamptz | YES |  |

<a id="project_production_staff"></a>

### `project_production_staff`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `project_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `order_index` | integer | NO | `0` |
| 5 | `created_at` | timestamptz | YES | `now()` |
| 6 | `is_primary` | boolean | NO | `false` |

<a id="project_products"></a>

### `project_products`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `project_id` | uuid | NO |  |
| 3 | `product_id` | uuid | NO |  |
| 4 | `quantity` | integer | YES | `1` |
| 5 | `unit_price` | numeric | YES |  |
| 6 | `discount_percent` | numeric | YES | `0` |
| 7 | `notes` | text | YES |  |
| 8 | `created_at` | timestamptz | YES | `now()` |

<a id="project_units"></a>

### `project_units`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `project_id` | uuid | NO |  |
| 3 | `unit_id` | uuid | NO |  |
| 4 | `role` | varchar | YES | `'owner'::character varying` |
| 5 | `created_at` | timestamptz | YES | `now()` |

<a id="project_workflow_lines"></a>

### `project_workflow_lines`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `project_id` | uuid | NO |  |
| 3 | `stage_slug` | text | NO |  |
| 4 | `label` | text | NO |  |
| 5 | `assignee_id` | uuid | YES |  |
| 6 | `description` | text | YES |  |
| 7 | `order_index` | integer | YES | `0` |
| 8 | `status` | text | YES | `'pending'::text` |
| 9 | `color` | text | YES |  |
| 10 | `created_at` | timestamptz | YES | `now()` |
| 11 | `updated_at` | timestamptz | YES | `now()` |

<a id="project_workshop_placements"></a>

### `project_workshop_placements`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `source_project_id` | uuid | NO |  |
| 3 | `target_project_id` | uuid | NO |  |
| 4 | `target_company_id` | uuid | NO |  |
| 5 | `workshop_type_id` | uuid | YES |  |
| 6 | `delivery_date` | date | YES |  |
| 7 | `production_finish_date` | date | YES |  |
| 8 | `created_by` | uuid | YES |  |
| 9 | `created_at` | timestamptz | NO | `now()` |

<a id="projects"></a>

### `projects`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `code` | varchar | NO |  |
| 3 | `name` | varchar | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `customer_id` | uuid | NO |  |
| 6 | `status` | project_status | NO | `'new'::project_status` |
| 7 | `current_stage_id` | uuid | YES |  |
| 8 | `kitchen_type` | varchar | YES |  |
| 9 | `material` | varchar | YES |  |
| 10 | `dimensions` | jsonb | YES |  |
| 11 | `install_address` | text | YES |  |
| 12 | `estimated_value` | numeric | YES |  |
| 13 | `final_value` | numeric | YES |  |
| 14 | `consult_date` | timestamptz | YES |  |
| 15 | `design_deadline` | timestamptz | YES |  |
| 16 | `production_start_date` | timestamptz | YES |  |
| 17 | `install_date` | timestamptz | YES |  |
| 18 | `completed_date` | timestamptz | YES |  |
| 19 | `sales_person_id` | uuid | YES |  |
| 20 | `designer_id` | uuid | YES |  |
| 21 | `project_manager_id` | uuid | YES |  |
| 22 | `priority` | task_priority | YES | `'medium'::task_priority` |
| 23 | `tags` | jsonb | YES | `'[]'::jsonb` |
| 24 | `created_at` | timestamptz | YES | `now()` |
| 25 | `updated_at` | timestamptz | YES | `now()` |
| 26 | `consulting_person_id` | uuid | YES |  |
| 27 | `design_person_id` | uuid | YES |  |
| 28 | `quotation_person_id` | uuid | YES |  |
| 29 | `contract_person_id` | uuid | YES |  |
| 30 | `production_person_id` | uuid | YES |  |
| 31 | `shipping_person_id` | uuid | YES |  |
| 32 | `installation_person_id` | uuid | YES |  |
| 33 | `care_person_id` | uuid | YES |  |
| 34 | `quotation_files` | jsonb | YES | `'[]'::jsonb` |
| 35 | `company_id` | uuid | YES |  |
| 36 | `flow_id` | uuid | YES |  |
| 37 | `supervisor_id` | uuid | YES |  |
| 38 | `created_by` | text | YES |  |
| 39 | `deadline` | date | YES |  |
| 40 | `notes` | text | YES |  |
| 41 | `production_deadline` | date | YES |  |
| 42 | `production_note` | text | YES |  |
| 43 | `delivery_team_id` | uuid | YES |  |
| 44 | `installation_team_id` | uuid | YES |  |
| 45 | `installer_person_id` | uuid | YES |  |
| 46 | `logistics_person_id` | uuid | YES |  |
| 47 | `vc_kanban_column_id` | uuid | YES |  |
| 48 | `construction_start_date` | date | YES |  |
| 49 | `expected_production_start_date` | date | YES |  |
| 50 | `workshop_type_id` | uuid | YES |  |
| 51 | `production_workshop_team_id` | uuid | YES |  |
| 52 | `logistics_company_id` | uuid | YES |  |
| 53 | `vc_deleted_at` | timestamptz | YES |  |
| 54 | `vc_deleted_by` | uuid | YES |  |
| 55 | `vc_delete_reason` | text | YES |  |
| 56 | `sx_pipeline_stage_entered_at` | timestamptz | YES |  |
| 57 | `sx_kanban_deadline_at` | timestamptz | YES |  |
| 58 | `sx_kanban_deadline_reason` | text | YES |  |
| 59 | `order_date` | date | YES |  |
| 60 | `delivery_date` | date | YES |  |
| 61 | `production_value` | numeric | YES |  |
| 62 | `deposit_amount` | numeric | YES |  |
| 63 | `collected_amount` | numeric | YES |  |
| 64 | `sx_kanban_column_id` | uuid | YES |  |
| 65 | `created_from_sx` | boolean | NO | `false` |
| 66 | `pickup_at` | timestamptz | YES |  |
| 67 | `pickup_notes` | text | YES |  |
| 68 | `vc_handover_status` | text | YES |  |
| 69 | `production_finish_date` | date | YES |  |
| 70 | `sx_reception_date` | date | YES |  |
| 71 | `sx_schedule_slip_days` | integer | NO | `0` |
| 72 | `vc_notes` | text | YES |  |
| 73 | `vc_temp_staged` | boolean | YES | `false` |

<a id="purchase_order_items"></a>

### `purchase_order_items`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `purchase_order_id` | uuid | NO |  |
| 3 | `product_id` | uuid | YES |  |
| 4 | `item_order` | integer | YES | `0` |
| 5 | `name` | text | NO |  |
| 6 | `description` | text | YES |  |
| 7 | `unit` | text | YES | `'cái'::text` |
| 8 | `quantity` | numeric | YES | `1` |
| 9 | `unit_price` | numeric | YES | `0` |
| 10 | `amount` | numeric | YES | `0` |
| 11 | `brand_name` | text | YES |  |
| 12 | `sku` | text | YES |  |
| 13 | `image_url` | text | YES |  |
| 14 | `notes` | text | YES |  |
| 15 | `created_at` | timestamptz | NO | `now()` |

<a id="purchase_orders"></a>

### `purchase_orders`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `code` | text | NO |  |
| 3 | `company_id` | uuid | NO |  |
| 4 | `lead_id` | uuid | YES |  |
| 5 | `supplier_id` | uuid | YES |  |
| 6 | `customer_name` | text | YES |  |
| 7 | `customer_phone` | text | YES |  |
| 8 | `customer_address` | text | YES |  |
| 9 | `title` | text | YES |  |
| 10 | `notes` | text | YES |  |
| 11 | `order_date` | date | YES | `CURRENT_DATE` |
| 12 | `expected_date` | date | YES |  |
| 13 | `subtotal` | numeric | YES | `0` |
| 14 | `tax_rate` | numeric | YES | `10` |
| 15 | `tax_amount` | numeric | YES | `0` |
| 16 | `total` | numeric | YES | `0` |
| 17 | `status` | text | NO | `'draft'::text` |
| 18 | `submitted_at` | timestamptz | YES |  |
| 19 | `confirmed_at` | timestamptz | YES |  |
| 20 | `ordered_at` | timestamptz | YES |  |
| 21 | `received_at` | timestamptz | YES |  |
| 22 | `cancelled_at` | timestamptz | YES |  |
| 23 | `cancel_reason` | text | YES |  |
| 24 | `created_by` | uuid | YES |  |
| 25 | `created_at` | timestamptz | NO | `now()` |
| 26 | `updated_at` | timestamptz | NO | `now()` |

<a id="purchase_requests"></a>

### `purchase_requests`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `tenant_id` | uuid | YES |  |
| 3 | `company_id` | uuid | NO |  |
| 4 | `project_id` | uuid | NO |  |
| 5 | `order_id` | uuid | YES |  |
| 6 | `item_name` | text | NO |  |
| 7 | `description` | text | YES |  |
| 8 | `source_type` | text | NO | `'external'::text` |
| 9 | `supplier_id` | uuid | YES |  |
| 10 | `requested_date` | date | YES |  |
| 11 | `supplier_committed_date` | date | YES |  |
| 12 | `expected_price` | numeric | YES |  |
| 13 | `actual_price` | numeric | YES |  |
| 14 | `status` | text | NO | `'draft'::text` |
| 15 | `qc_status` | text | YES |  |
| 16 | `owner_user_id` | uuid | YES |  |
| 17 | `delay_reason` | text | YES |  |
| 18 | `next_action` | text | YES |  |
| 19 | `created_by` | uuid | YES |  |
| 20 | `created_at` | timestamptz | NO | `now()` |
| 21 | `updated_at` | timestamptz | NO | `now()` |

<a id="push_device_tokens"></a>

### `push_device_tokens`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `token` | text | NO |  |
| 4 | `platform` | text | NO |  |
| 5 | `device_id` | text | YES |  |
| 6 | `last_seen_at` | timestamptz | NO | `now()` |
| 7 | `created_at` | timestamptz | NO | `now()` |
| 8 | `app_key` | text | YES |  |

<a id="push_subscriptions"></a>

### `push_subscriptions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `endpoint` | text | NO |  |
| 4 | `keys_p256dh` | text | NO |  |
| 5 | `keys_auth` | text | NO |  |
| 6 | `created_at` | timestamptz | YES | `now()` |

<a id="quotation_edit_history"></a>

### `quotation_edit_history`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `quotation_id` | uuid | NO |  |
| 3 | `action` | text | NO |  |
| 4 | `summary` | text | YES |  |
| 5 | `detail` | jsonb | YES |  |
| 6 | `created_by` | uuid | YES |  |
| 7 | `created_at` | timestamptz | YES | `now()` |

<a id="quotation_items"></a>

### `quotation_items`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `quotation_id` | uuid | YES |  |
| 3 | `product_id` | uuid | YES |  |
| 4 | `item_order` | integer | YES | `0` |
| 5 | `name` | text | NO |  |
| 6 | `description` | text | YES |  |
| 7 | `unit` | text | YES | `'bộ'::text` |
| 8 | `quantity` | numeric | YES | `1` |
| 9 | `unit_price` | numeric | YES | `0` |
| 10 | `discount_percent` | numeric | YES | `0` |
| 11 | `amount` | numeric | YES | `0` |
| 12 | `dimensions` | text | YES |  |
| 13 | `material` | text | YES |  |
| 14 | `color` | text | YES |  |
| 15 | `notes` | text | YES |  |
| 16 | `created_at` | timestamptz | YES | `now()` |
| 17 | `vat_rate` | numeric | YES | `0` |
| 18 | `vat_amount` | numeric | YES | `0` |
| 19 | `product_code` | text | YES |  |
| 20 | `height` | numeric | YES |  |
| 21 | `width` | numeric | YES |  |
| 22 | `length` | numeric | YES |  |
| 23 | `weight` | numeric | YES |  |
| 24 | `discount_amount` | numeric | YES | `0` |
| 25 | `tax_amount` | numeric | YES | `0` |
| 26 | `total` | numeric | YES | `0` |
| 27 | `promo_code` | text | YES |  |
| 28 | `is_promo` | boolean | YES | `false` |
| 29 | `group_name` | text | YES |  |
| 30 | `spec_factor` | numeric | YES |  |
| 31 | `standard_area` | numeric | YES |  |

<a id="quotations"></a>

### `quotations`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `code` | text | NO |  |
| 3 | `customer_id` | uuid | YES |  |
| 4 | `customer_name` | text | YES |  |
| 5 | `customer_phone` | text | YES |  |
| 6 | `customer_address` | text | YES |  |
| 7 | `lead_id` | uuid | YES |  |
| 8 | `project_id` | uuid | YES |  |
| 9 | `title` | text | YES |  |
| 10 | `description` | text | YES |  |
| 11 | `valid_until` | date | YES |  |
| 12 | `payment_terms` | text | YES |  |
| 13 | `delivery_terms` | text | YES |  |
| 14 | `notes` | text | YES |  |
| 15 | `subtotal` | numeric | YES | `0` |
| 16 | `discount_type` | text | YES | `'percent'::text` |
| 17 | `discount_value` | numeric | YES | `0` |
| 18 | `discount_amount` | numeric | YES | `0` |
| 19 | `tax_rate` | numeric | YES | `10` |
| 20 | `tax_amount` | numeric | YES | `0` |
| 21 | `total` | numeric | YES | `0` |
| 22 | `status` | text | YES | `'draft'::text` |
| 23 | `sent_at` | timestamptz | YES |  |
| 24 | `accepted_at` | timestamptz | YES |  |
| 25 | `rejected_at` | timestamptz | YES |  |
| 26 | `rejection_reason` | text | YES |  |
| 27 | `created_by` | uuid | YES |  |
| 28 | `approved_by` | uuid | YES |  |
| 29 | `created_at` | timestamptz | YES | `now()` |
| 30 | `updated_at` | timestamptz | YES | `now()` |
| 31 | `fulfillment_lead_id` | uuid | YES |  |
| 32 | `fulfillment_label` | text | YES |  |
| 33 | `source_task_id` | uuid | YES |  |
| 34 | `deposit_amount` | numeric | YES |  |
| 35 | `deposit_received` | boolean | YES |  |
| 36 | `deposit_label` | text | YES |  |
| 37 | `remaining_amount` | numeric | YES |  |
| 38 | `remaining_note` | text | YES |  |
| 39 | `company_id` | uuid | YES |  |
| 40 | `region_id` | uuid | YES |  |
| 41 | `sale_discount_type` | text | YES | `'amount'::text` |
| 42 | `sale_discount_value` | numeric | YES | `0` |
| 43 | `sale_discount_amount` | numeric | YES | `0` |
| 44 | `source_excel_file_url` | text | YES |  |
| 45 | `source_excel_file_name` | text | YES |  |
| 46 | `deposit_installments` | jsonb | YES |  |

<a id="release_note_reads"></a>

### `release_note_reads`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `release_note_id` | uuid | YES |  |
| 3 | `user_id` | uuid | YES |  |
| 4 | `read_at` | timestamptz | YES | `now()` |

<a id="release_notes"></a>

### `release_notes`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `version` | text | YES |  |
| 3 | `title` | text | NO |  |
| 4 | `content` | text | NO |  |
| 5 | `category` | text | YES | `'feature'::text` |
| 6 | `is_published` | boolean | YES | `false` |
| 7 | `is_pinned` | boolean | YES | `false` |
| 8 | `created_by` | uuid | YES |  |
| 9 | `published_at` | timestamptz | YES |  |
| 10 | `created_at` | timestamptz | YES | `now()` |
| 11 | `updated_at` | timestamptz | YES | `now()` |

<a id="role_permissions"></a>

### `role_permissions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `role_id` | uuid | NO |  |
| 3 | `permission_id` | uuid | NO |  |
| 4 | `created_at` | timestamptz | YES | `now()` |

<a id="role_stage_access"></a>

### `role_stage_access`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `role` | text | NO |  |
| 3 | `stage_slug` | text | NO |  |
| 4 | `created_at` | timestamptz | YES | `now()` |

<a id="roles"></a>

### `roles`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | varchar | NO |  |
| 3 | `description` | text | YES |  |
| 4 | `is_system` | boolean | YES | `false` |
| 5 | `created_at` | timestamptz | YES | `now()` |
| 6 | `updated_at` | timestamptz | YES | `now()` |

<a id="saas_modules"></a>

### `saas_modules`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | varchar | NO |  |
| 2 | `title` | varchar | NO |  |
| 3 | `description` | text | YES |  |
| 4 | `features` | jsonb | NO | `'[]'::jsonb` |
| 5 | `price_monthly` | bigint | NO | `0` |
| 6 | `category` | varchar | NO | `'management'::character varying` |
| 7 | `color` | varchar | YES | `'#3b82f6'::character varying` |
| 8 | `icon_url` | text | YES |  |
| 9 | `icon_key` | varchar | YES |  |
| 10 | `badge` | varchar | YES | `'comingSoon'::character varying` |
| 11 | `featured` | integer | NO | `99` |
| 12 | `feature_key` | varchar | YES |  |
| 13 | `tier_on_purchase` | varchar | YES | `'starter'::character varying` |
| 14 | `trial_days` | integer | YES | `14` |
| 15 | `is_active` | boolean | NO | `true` |
| 16 | `is_purchasable` | boolean | NO | `true` |
| 17 | `sort_order` | integer | NO | `0` |
| 18 | `created_at` | timestamptz | YES | `now()` |
| 19 | `updated_at` | timestamptz | YES | `now()` |
| 20 | `is_addon` | boolean | NO | `true` |
| 21 | `min_plan_id` | varchar | YES |  |

<a id="saas_notify_subscribers"></a>

### `saas_notify_subscribers`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `email` | varchar | NO |  |
| 3 | `module_id` | varchar | YES |  |
| 4 | `source` | varchar | YES | `'landing'::character varying` |
| 5 | `is_active` | boolean | NO | `true` |
| 6 | `created_at` | timestamptz | YES | `now()` |

<a id="saas_plans"></a>

### `saas_plans`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | varchar | NO |  |
| 2 | `tenant_tier` | varchar | NO |  |
| 3 | `title` | varchar | NO |  |
| 4 | `subtitle` | text | YES |  |
| 5 | `description` | text | YES |  |
| 6 | `price_monthly` | bigint | NO | `0` |
| 7 | `max_users` | integer | NO | `5` |
| 8 | `max_companies` | integer | NO | `1` |
| 9 | `highlights` | jsonb | NO | `'[]'::jsonb` |
| 10 | `badge` | varchar | YES |  |
| 11 | `color` | varchar | YES | `'#3b82f6'::character varying` |
| 12 | `trial_days` | integer | YES | `14` |
| 13 | `is_active` | boolean | NO | `true` |
| 14 | `is_purchasable` | boolean | NO | `true` |
| 15 | `sort_order` | integer | NO | `0` |
| 16 | `created_at` | timestamptz | YES | `now()` |
| 17 | `updated_at` | timestamptz | YES | `now()` |
| 18 | `quotas` | jsonb | NO | `'{}'::jsonb` |

<a id="saas_purchases"></a>

### `saas_purchases`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `module_id` | varchar | YES |  |
| 3 | `buyer_email` | varchar | NO |  |
| 4 | `buyer_name` | varchar | YES |  |
| 5 | `company_name` | varchar | YES |  |
| 6 | `phone` | varchar | YES |  |
| 7 | `status` | varchar | NO | `'pending'::character varying` |
| 8 | `tenant_id` | uuid | YES |  |
| 9 | `user_id` | uuid | YES |  |
| 10 | `amount` | bigint | YES |  |
| 11 | `notes` | text | YES |  |
| 12 | `provision_meta` | jsonb | YES | `'{}'::jsonb` |
| 13 | `ip_address` | text | YES |  |
| 14 | `user_agent` | text | YES |  |
| 15 | `created_at` | timestamptz | YES | `now()` |
| 16 | `updated_at` | timestamptz | YES | `now()` |
| 17 | `provisioned_at` | timestamptz | YES |  |
| 18 | `email_sent_at` | timestamptz | YES |  |
| 19 | `purchase_type` | varchar | NO | `'module'::character varying` |
| 20 | `plan_id` | varchar | YES |  |
| 21 | `payment_method` | varchar | YES |  |
| 22 | `payment_status` | varchar | NO | `'awaiting'::character varying` |
| 23 | `payment_reference` | text | YES |  |
| 24 | `paid_at` | timestamptz | YES |  |

<a id="stage_customer_status_map"></a>

### `stage_customer_status_map`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `stage_id` | uuid | NO |  |
| 3 | `customer_status_id` | uuid | NO |  |
| 4 | `created_at` | timestamptz | YES | `now()` |

<a id="stage_transitions"></a>

### `stage_transitions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `project_id` | uuid | NO |  |
| 3 | `from_stage_id` | uuid | YES |  |
| 4 | `to_stage_id` | uuid | YES |  |
| 5 | `notes` | text | YES |  |
| 6 | `attachments` | jsonb | YES | `'[]'::jsonb` |
| 7 | `transitioned_by` | uuid | YES |  |
| 8 | `created_at` | timestamptz | YES | `now()` |

<a id="supabase_failback_log"></a>

### `supabase_failback_log`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `job_type` | text | NO | `'rest'::text` |
| 3 | `method` | text | YES |  |
| 4 | `path` | text | YES |  |
| 5 | `headers` | jsonb | YES |  |
| 6 | `body` | text | YES |  |
| 7 | `bucket` | text | YES |  |
| 8 | `storage_path` | text | YES |  |
| 9 | `mimetype` | text | YES |  |
| 10 | `upsert` | boolean | YES | `true` |
| 11 | `created_at` | timestamptz | NO | `now()` |
| 12 | `applied_to_primary` | boolean | NO | `false` |
| 13 | `applied_at` | timestamptz | YES |  |
| 14 | `error` | text | YES |  |
| 15 | `retry_count` | integer | NO | `0` |

<a id="suppliers"></a>

### `suppliers`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `tenant_id` | uuid | YES |  |
| 3 | `company_id` | uuid | NO |  |
| 4 | `name` | text | NO |  |
| 5 | `tax_code` | text | YES |  |
| 6 | `contact_person` | text | YES |  |
| 7 | `contact_phone` | text | YES |  |
| 8 | `notes` | text | YES |  |
| 9 | `is_internal_company` | boolean | NO | `false` |
| 10 | `internal_company_id` | uuid | YES |  |
| 11 | `is_active` | boolean | NO | `true` |
| 12 | `created_by` | uuid | YES |  |
| 13 | `created_at` | timestamptz | NO | `now()` |
| 14 | `updated_at` | timestamptz | NO | `now()` |

<a id="sx_company_schedule_config"></a>

### `sx_company_schedule_config`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `company_id` | uuid | NO |  |
| 2 | `default_deadline_time` | time | NO | `'17:30:00'::time without time zone` |
| 3 | `glass_cutoff_time` | time | NO | `'12:00:00'::time without time zone` |
| 4 | `tempered_glass_days` | integer | NO | `3` |
| 5 | `updated_at` | timestamptz | NO | `now()` |

<a id="sx_user_planner_columns"></a>

### `sx_user_planner_columns`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('sx_user_planner_columns_id_seq'::regclass)` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `company_id` | uuid | YES |  |
| 4 | `name` | text | NO |  |
| 5 | `color` | text | YES |  |
| 6 | `position` | integer | NO | `0` |
| 7 | `created_at` | timestamptz | NO | `now()` |
| 8 | `updated_at` | timestamptz | NO | `now()` |

<a id="sx_user_planner_items"></a>

### `sx_user_planner_items`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('sx_user_planner_items_id_seq'::regclass)` |
| 2 | `column_id` | bigint | NO |  |
| 3 | `project_id` | uuid | NO |  |
| 4 | `position` | integer | NO | `0` |
| 5 | `added_at` | timestamptz | NO | `now()` |

<a id="system_batch_jobs"></a>

### `system_batch_jobs`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `job_type` | text | NO |  |
| 3 | `status` | text | NO | `'pending'::text` |
| 4 | `payload` | jsonb | NO | `'{}'::jsonb` |
| 5 | `result` | jsonb | YES |  |
| 6 | `progress_current` | integer | NO | `0` |
| 7 | `progress_total` | integer | NO | `0` |
| 8 | `progress_meta` | jsonb | YES |  |
| 9 | `error_message` | text | YES |  |
| 10 | `created_by_id` | uuid | YES |  |
| 11 | `company_id` | uuid | YES |  |
| 12 | `retry_count` | integer | NO | `0` |
| 13 | `max_retries` | integer | NO | `3` |
| 14 | `started_at` | timestamptz | YES |  |
| 15 | `completed_at` | timestamptz | YES |  |
| 16 | `created_at` | timestamptz | NO | `now()` |
| 17 | `updated_at` | timestamptz | NO | `now()` |

<a id="task_checklists"></a>

### `task_checklists`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `task_id` | uuid | NO |  |
| 3 | `title` | varchar | NO |  |
| 4 | `is_completed` | boolean | YES | `false` |
| 5 | `completed_by` | uuid | YES |  |
| 6 | `completed_at` | timestamptz | YES |  |
| 7 | `order_index` | integer | YES | `0` |
| 8 | `created_at` | timestamptz | YES | `now()` |
| 9 | `attachments` | jsonb | YES | `'[]'::jsonb` |
| 10 | `notes` | text | YES |  |
| 11 | `updated_at` | timestamptz | YES |  |
| 12 | `assigned_user_id` | uuid | YES |  |
| 13 | `deadline` | timestamptz | YES |  |
| 14 | `assignee_id` | uuid | YES |  |

<a id="task_comments"></a>

### `task_comments`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `task_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `content` | text | NO |  |
| 5 | `created_at` | timestamptz | YES | `now()` |
| 6 | `updated_at` | timestamptz | YES | `now()` |
| 7 | `attachments` | jsonb | YES | `'[]'::jsonb` |

<a id="task_participants"></a>

### `task_participants`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `task_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `role` | varchar | NO | `'participant'::character varying` |
| 5 | `created_at` | timestamptz | YES | `now()` |

<a id="task_templates"></a>

### `task_templates`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `stage_id` | uuid | NO |  |
| 3 | `title` | varchar | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `priority` | varchar | YES | `'medium'::character varying` |
| 6 | `estimated_hours` | numeric | YES |  |
| 7 | `order_index` | integer | YES | `0` |
| 8 | `checklist_items` | jsonb | YES | `'[]'::jsonb` |
| 9 | `assignee_role` | varchar | YES |  |
| 10 | `is_active` | boolean | YES | `true` |
| 11 | `created_by` | uuid | YES |  |
| 12 | `created_at` | timestamptz | YES | `now()` |
| 13 | `updated_at` | timestamptz | YES | `now()` |
| 14 | `assignee_id` | uuid | YES |  |

<a id="task_time_logs"></a>

### `task_time_logs`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `task_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `started_at` | timestamptz | NO |  |
| 5 | `ended_at` | timestamptz | YES |  |
| 6 | `duration_minutes` | integer | YES |  |
| 7 | `description` | text | YES |  |
| 8 | `created_at` | timestamptz | YES | `now()` |

<a id="tasks"></a>

### `tasks`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `project_id` | uuid | YES |  |
| 3 | `stage_id` | uuid | YES |  |
| 4 | `title` | varchar | NO |  |
| 5 | `description` | text | YES |  |
| 6 | `status` | task_status | NO | `'todo'::task_status` |
| 7 | `priority` | task_priority | YES | `'medium'::task_priority` |
| 8 | `assignee_id` | uuid | YES |  |
| 9 | `created_by_id` | uuid | YES |  |
| 10 | `due_date` | timestamptz | YES |  |
| 11 | `start_date` | timestamptz | YES |  |
| 12 | `completed_at` | timestamptz | YES |  |
| 13 | `estimated_hours` | numeric | YES |  |
| 14 | `actual_hours` | numeric | YES |  |
| 15 | `order_index` | integer | YES | `0` |
| 16 | `metadata` | jsonb | YES |  |
| 17 | `created_at` | timestamptz | YES | `now()` |
| 18 | `updated_at` | timestamptz | YES | `now()` |
| 19 | `attachments` | jsonb | YES | `'[]'::jsonb` |
| 20 | `task_type` | varchar | YES | `'project'::character varying` |
| 21 | `workflow_line_id` | uuid | YES |  |
| 22 | `deadline` | timestamptz | YES |  |
| 23 | `production_stage_id` | uuid | YES |  |
| 24 | `blocks_stage_advance` | boolean | NO | `false` |
| 25 | `file_note_recorded` | boolean | NO | `false` |

<a id="teams"></a>

### `teams`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | varchar | NO |  |
| 3 | `short_name` | varchar | YES |  |
| 4 | `department_id` | uuid | NO |  |
| 5 | `leader_id` | uuid | YES |  |
| 6 | `description` | text | YES |  |
| 7 | `color` | varchar | YES | `'#3B82F6'::character varying` |
| 8 | `is_active` | boolean | YES | `true` |
| 9 | `created_at` | timestamptz | YES | `now()` |
| 10 | `updated_at` | timestamptz | YES | `now()` |

<a id="tenant_access_audit"></a>

### `tenant_access_audit`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('tenant_access_audit_id_seq'::regclass)` |
| 2 | `tenant_id` | uuid | YES |  |
| 3 | `user_id` | uuid | YES |  |
| 4 | `action` | varchar | NO |  |
| 5 | `resource_type` | varchar | YES |  |
| 6 | `resource_id` | uuid | YES |  |
| 7 | `company_id` | uuid | YES |  |
| 8 | `ip` | inet | YES |  |
| 9 | `metadata` | jsonb | YES | `'{}'::jsonb` |
| 10 | `created_at` | timestamptz | YES | `now()` |

<a id="tenant_features"></a>

### `tenant_features`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `tenant_id` | uuid | NO |  |
| 3 | `feature_key` | varchar | NO |  |
| 4 | `enabled` | boolean | YES | `true` |
| 5 | `config` | jsonb | YES | `'{}'::jsonb` |

<a id="tenants"></a>

### `tenants`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | varchar | NO |  |
| 3 | `slug` | varchar | NO |  |
| 4 | `logo_url` | text | YES |  |
| 5 | `domain` | text | YES |  |
| 6 | `tier` | varchar | NO | `'free'::character varying` |
| 7 | `max_users` | integer | YES | `50` |
| 8 | `max_companies` | integer | YES | `5` |
| 9 | `subscription_start` | timestamptz | YES |  |
| 10 | `subscription_end` | timestamptz | YES |  |
| 11 | `is_active` | boolean | YES | `true` |
| 12 | `settings` | jsonb | YES | `'{}'::jsonb` |
| 13 | `created_at` | timestamptz | YES | `now()` |
| 14 | `updated_at` | timestamptz | YES | `now()` |
| 15 | `quotas` | jsonb | NO | `'{}'::jsonb` |

<a id="tier_features"></a>

### `tier_features`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `tier` | varchar | NO |  |
| 3 | `feature_key` | varchar | NO |  |
| 4 | `enabled` | boolean | YES | `true` |
| 5 | `config` | jsonb | YES | `'{}'::jsonb` |

<a id="trash_items"></a>

### `trash_items`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `entity_type` | text | NO |  |
| 3 | `entity_id` | uuid | NO |  |
| 4 | `entity_label` | text | YES |  |
| 5 | `company_id` | uuid | YES |  |
| 6 | `snapshot` | jsonb | NO |  |
| 7 | `deleted_by` | uuid | YES |  |
| 8 | `deleted_at` | timestamptz | NO | `now()` |
| 9 | `purge_after` | timestamptz | YES | `(now() + '30 days'::interval)` |
| 10 | `delete_reason` | text | YES |  |

<a id="unified_task_history"></a>

### `unified_task_history`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('unified_task_history_id_seq'::regclass)` |
| 2 | `source` | unified_task_source | NO |  |
| 3 | `source_id` | text | NO |  |
| 4 | `project_id` | uuid | YES |  |
| 5 | `lead_id` | uuid | YES |  |
| 6 | `company_id` | uuid | YES |  |
| 7 | `actor_user_id` | uuid | YES |  |
| 8 | `event_type` | text | NO |  |
| 9 | `field_name` | text | YES |  |
| 10 | `old_value` | jsonb | YES |  |
| 11 | `new_value` | jsonb | YES |  |
| 12 | `description` | text | YES |  |
| 13 | `created_at` | timestamptz | NO | `now()` |

<a id="unified_task_history_meta"></a>

### `unified_task_history_meta`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `key` | text | NO |  |
| 2 | `value` | text | YES |  |
| 3 | `applied_at` | timestamptz | NO | `now()` |

<a id="user_activity_log"></a>

### `user_activity_log`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | YES |  |
| 3 | `session_id` | text | YES |  |
| 4 | `action_type` | text | NO |  |
| 5 | `module` | text | YES |  |
| 6 | `feature` | text | YES |  |
| 7 | `entity_type` | text | YES |  |
| 8 | `entity_id` | uuid | YES |  |
| 9 | `path` | text | YES |  |
| 10 | `query` | jsonb | YES |  |
| 11 | `referrer_path` | text | YES |  |
| 12 | `label` | text | YES |  |
| 13 | `metadata` | jsonb | YES |  |
| 14 | `importance` | int2 | NO | `1` |
| 15 | `created_at` | timestamptz | NO | `now()` |
| 16 | `device_id` | text | YES |  |
| 17 | `device_name` | text | YES |  |
| 18 | `geo_lat` | double | YES |  |
| 19 | `geo_lng` | double | YES |  |
| 20 | `geo_address` | text | YES |  |

<a id="user_companies"></a>

### `user_companies`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `company_id` | uuid | NO |  |
| 4 | `is_primary` | boolean | YES | `false` |
| 5 | `joined_at` | timestamptz | YES | `now()` |

<a id="user_company_regions"></a>

### `user_company_regions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `user_id` | uuid | NO |  |
| 2 | `region_id` | uuid | NO |  |
| 3 | `created_at` | timestamptz | YES | `now()` |

<a id="user_current_location"></a>

### `user_current_location`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `user_id` | uuid | NO |  |
| 2 | `lat` | double | NO |  |
| 3 | `lng` | double | NO |  |
| 4 | `address` | text | YES |  |
| 5 | `accuracy_m` | double | YES |  |
| 6 | `source` | text | YES |  |
| 7 | `device_id` | text | YES |  |
| 8 | `captured_at` | timestamptz | NO | `now()` |
| 9 | `updated_at` | timestamptz | NO | `now()` |

<a id="user_devices"></a>

### `user_devices`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `device_id` | text | NO |  |
| 4 | `platform` | text | NO |  |
| 5 | `device_name` | text | YES |  |
| 6 | `os_name` | text | YES |  |
| 7 | `os_version` | text | YES |  |
| 8 | `app_version` | text | YES |  |
| 9 | `user_agent` | text | YES |  |
| 10 | `ip` | text | YES |  |
| 11 | `push_token` | text | YES |  |
| 12 | `first_seen_at` | timestamptz | NO | `now()` |
| 13 | `last_ping_at` | timestamptz | NO | `now()` |
| 14 | `last_login_at` | timestamptz | NO | `now()` |
| 15 | `network_name` | text | YES |  |
| 16 | `network_type` | text | YES |  |
| 17 | `geo_lat` | double | YES |  |
| 18 | `geo_lng` | double | YES |  |
| 19 | `geo_address` | text | YES |  |

<a id="user_last_activity"></a>

### `user_last_activity`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `user_id` | uuid | NO |  |
| 2 | `last_ping_at` | timestamptz | NO | `now()` |

<a id="user_module_roles"></a>

### `user_module_roles`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `module_key` | text | NO |  |
| 4 | `role` | text | NO |  |
| 5 | `granted_by` | uuid | YES |  |
| 6 | `granted_at` | timestamptz | NO | `now()` |

<a id="user_permission_overrides"></a>

### `user_permission_overrides`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `permission` | varchar | NO |  |
| 4 | `is_allowed` | boolean | NO |  |
| 5 | `unit_id` | uuid | YES |  |
| 6 | `reason` | text | YES |  |
| 7 | `granted_by` | uuid | YES |  |
| 8 | `granted_at` | timestamptz | YES | `now()` |
| 9 | `expires_at` | timestamptz | YES |  |
| 10 | `created_at` | timestamptz | YES | `now()` |

<a id="user_permissions"></a>

### `user_permissions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `permission_id` | uuid | NO |  |
| 4 | `ecosystem_unit_id` | uuid | YES |  |
| 5 | `granted` | boolean | YES | `true` |
| 6 | `granted_by` | uuid | YES |  |
| 7 | `granted_at` | timestamptz | YES | `now()` |
| 8 | `position_role` | varchar | YES |  |

<a id="user_roles"></a>

### `user_roles`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `role_id` | uuid | NO |  |
| 4 | `ecosystem_unit_id` | uuid | YES |  |
| 5 | `granted_by` | uuid | YES |  |
| 6 | `granted_at` | timestamptz | YES | `now()` |

<a id="users"></a>

### `users`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `email` | varchar | NO |  |
| 3 | `password` | varchar | NO |  |
| 4 | `full_name` | varchar | NO |  |
| 5 | `phone` | varchar | YES |  |
| 6 | `avatar` | varchar | YES |  |
| 7 | `role` | user_role | NO | `'staff'::user_role` |
| 8 | `department_id` | uuid | YES |  |
| 9 | `is_active` | boolean | YES | `true` |
| 10 | `last_login_at` | timestamptz | YES |  |
| 11 | `created_at` | timestamptz | YES | `now()` |
| 12 | `updated_at` | timestamptz | YES | `now()` |
| 13 | `position` | varchar | YES |  |
| 14 | `date_of_birth` | date | YES |  |
| 15 | `hire_date` | date | YES |  |
| 16 | `address` | text | YES |  |
| 17 | `emergency_contact` | varchar | YES |  |
| 18 | `salary` | numeric | YES |  |
| 19 | `notes` | text | YES |  |
| 20 | `skills` | jsonb | YES | `'[]'::jsonb` |
| 21 | `team_id` | uuid | YES |  |
| 22 | `primary_division_id` | uuid | YES |  |
| 23 | `company_id` | uuid | YES |  |
| 24 | `cover_url` | text | YES |  |
| 25 | `bio` | text | YES |  |
| 26 | `is_bot` | boolean | YES | `false` |
| 27 | `drive_module` | text | YES |  |
| 28 | `tenant_id` | uuid | YES |  |
| 29 | `google_id` | text | YES |  |
| 30 | `auth_provider` | text | YES | `'password'::text` |

<a id="voice_recordings"></a>

### `voice_recordings`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `file_name` | text | NO |  |
| 4 | `storage_path` | text | NO |  |
| 5 | `mime_type` | text | YES |  |
| 6 | `file_size` | bigint | YES | `0` |
| 7 | `duration_sec` | double | YES |  |
| 8 | `source` | text | YES | `'web'::text` |
| 9 | `device_label` | text | YES |  |
| 10 | `notes` | text | YES |  |
| 11 | `created_at` | timestamptz | YES | `now()` |
| 12 | `phone_number` | text | YES |  |
| 13 | `direction` | text | YES |  |
| 14 | `call_started_at` | timestamptz | YES |  |
| 15 | `call_ended_at` | timestamptz | YES |  |
| 16 | `external_call_id` | text | YES |  |
| 17 | `customer_id` | uuid | YES |  |
| 18 | `lead_id` | uuid | YES |  |
| 19 | `company_id` | uuid | YES |  |
| 20 | `prospect_class` | text | YES |  |
| 21 | `prospect_classified_at` | timestamptz | YES |  |
| 22 | `stt_status` | text | NO | `'idle'::text` |
| 23 | `stt_error` | text | YES |  |
| 24 | `stt_attempts` | integer | NO | `0` |
| 25 | `stt_model` | text | YES |  |
| 26 | `transcript` | text | YES |  |
| 27 | `transcript_language` | text | YES | `'vi'::text` |
| 28 | `transcribed_at` | timestamptz | YES |  |
| 29 | `crm_auto_skip_create` | boolean | NO | `false` |

<a id="voice_recordings_deleted"></a>

### `voice_recordings_deleted`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | uuid | NO |  |
| 3 | `file_name` | text | NO |  |
| 4 | `file_size` | bigint | NO | `0` |
| 5 | `original_id` | uuid | YES |  |
| 6 | `device_label` | text | YES |  |
| 7 | `deleted_at` | timestamptz | NO | `now()` |

<a id="workflow_flow_action_runs"></a>

### `workflow_flow_action_runs`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `flow_id` | uuid | YES |  |
| 3 | `node_id` | text | YES |  |
| 4 | `node_kind` | text | YES |  |
| 5 | `status` | text | NO | `'ok'::text` |
| 6 | `dry_run` | boolean | NO | `false` |
| 7 | `triggered_by` | uuid | YES |  |
| 8 | `input_summary` | jsonb | NO | `'{}'::jsonb` |
| 9 | `output_summary` | jsonb | NO | `'{}'::jsonb` |
| 10 | `error` | text | YES |  |
| 11 | `created_at` | timestamptz | YES | `now()` |

<a id="workflow_flow_conditions"></a>

### `workflow_flow_conditions`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `flow_id` | uuid | NO |  |
| 3 | `scope` | text | NO | `'step'::text` |
| 4 | `step_node_id` | text | YES |  |
| 5 | `edge_id` | uuid | YES |  |
| 6 | `condition_type` | text | NO |  |
| 7 | `config` | jsonb | NO | `'{}'::jsonb` |
| 8 | `is_required` | boolean | NO | `true` |
| 9 | `order_index` | integer | NO | `0` |
| 10 | `created_at` | timestamptz | YES | `now()` |

<a id="workflow_flow_edges"></a>

### `workflow_flow_edges`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `flow_id` | uuid | NO |  |
| 3 | `source_node_id` | text | NO |  |
| 4 | `target_node_id` | text | NO |  |
| 5 | `label` | text | YES |  |
| 6 | `condition_logic` | text | NO | `'all'::text` |
| 7 | `order_index` | integer | NO | `0` |
| 8 | `created_at` | timestamptz | YES | `now()` |

<a id="workflow_flow_runtime_log"></a>

### `workflow_flow_runtime_log`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `flow_id` | uuid | YES |  |
| 3 | `gate` | text | NO |  |
| 4 | `subject_type` | text | YES |  |
| 5 | `subject_id` | uuid | YES |  |
| 6 | `enforced` | boolean | NO | `false` |
| 7 | `diverged` | boolean | NO | `false` |
| 8 | `legacy_result` | jsonb | NO | `'{}'::jsonb` |
| 9 | `graph_result` | jsonb | NO | `'{}'::jsonb` |
| 10 | `trace` | jsonb | NO | `'[]'::jsonb` |
| 11 | `created_at` | timestamptz | YES | `now()` |

<a id="workflow_flow_steps"></a>

### `workflow_flow_steps`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `flow_id` | uuid | NO |  |
| 3 | `division_unit_id` | uuid | YES |  |
| 4 | `order_index` | integer | YES | `0` |
| 5 | `setup_days` | integer | YES | `0` |
| 6 | `setup_hours` | integer | YES | `0` |
| 7 | `description` | text | YES |  |
| 8 | `created_at` | timestamptz | YES | `now()` |
| 9 | `company_unit_id` | uuid | YES |  |
| 10 | `template_set_id` | uuid | YES |  |
| 11 | `supervisor_id` | uuid | YES |  |
| 12 | `module_key` | text | YES |  |
| 13 | `handoff_trigger` | text | YES |  |
| 14 | `node_id` | text | YES |  |
| 15 | `position_x` | numeric | YES |  |
| 16 | `position_y` | numeric | YES |  |
| 17 | `branch_mode` | text | YES | `'sequential'::text` |
| 18 | `join_mode` | text | YES | `'all'::text` |
| 19 | `node_kind` | text | YES | `'module'::text` |
| 20 | `node_config` | jsonb | NO | `'{}'::jsonb` |

<a id="workflow_flows"></a>

### `workflow_flows`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | varchar | NO |  |
| 3 | `description` | text | YES |  |
| 4 | `color` | varchar | YES | `'#6366F1'::character varying` |
| 5 | `icon` | varchar | YES | `'🔄'::character varying` |
| 6 | `is_default` | boolean | YES | `false` |
| 7 | `is_active` | boolean | YES | `true` |
| 8 | `created_by` | uuid | YES |  |
| 9 | `created_at` | timestamptz | YES | `now()` |
| 10 | `updated_at` | timestamptz | YES | `now()` |

<a id="workflow_stage_group_items"></a>

### `workflow_stage_group_items`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `group_id` | uuid | NO |  |
| 3 | `stage_id` | uuid | NO |  |
| 4 | `order_index` | integer | YES | `0` |

<a id="workflow_stage_groups"></a>

### `workflow_stage_groups`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | varchar | NO |  |
| 3 | `slug` | varchar | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `color` | varchar | YES | `'#6366F1'::character varying` |
| 6 | `icon` | varchar | YES |  |
| 7 | `order_index` | integer | YES | `0` |
| 8 | `is_active` | boolean | YES | `true` |
| 9 | `created_at` | timestamptz | YES | `now()` |
| 10 | `division_unit_id` | uuid | YES |  |

<a id="workflow_stages"></a>

### `workflow_stages`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | varchar | NO |  |
| 3 | `slug` | varchar | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `order_index` | integer | NO | `0` |
| 6 | `color` | varchar | YES | `'#3B82F6'::character varying` |
| 7 | `icon` | varchar | YES |  |
| 8 | `is_active` | boolean | YES | `true` |
| 9 | `created_at` | timestamptz | YES | `now()` |
| 10 | `company_id` | uuid | YES |  |

<a id="workshop_project_types"></a>

### `workshop_project_types`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `company_id` | uuid | NO |  |
| 3 | `name` | text | NO |  |
| 4 | `applies_to` | text | NO | `'both'::text` |
| 5 | `order_index` | integer | NO | `0` |
| 6 | `is_active` | boolean | YES | `true` |
| 7 | `created_at` | timestamptz | YES | `now()` |
| 8 | `updated_at` | timestamptz | YES | `now()` |
| 9 | `description` | text | YES |  |

<a id="workshop_task_template_items"></a>

### `workshop_task_template_items`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `template_id` | uuid | NO |  |
| 3 | `title` | text | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `priority` | text | YES | `'medium'::text` |
| 6 | `deadline_days` | integer | YES | `0` |
| 7 | `order_index` | integer | YES | `0` |
| 8 | `checklist` | jsonb | YES | `'[]'::jsonb` |
| 9 | `created_at` | timestamptz | YES | `now()` |
| 10 | `default_allowed_companies` | jsonb | YES |  |
| 11 | `default_allowed_departments` | jsonb | YES |  |
| 12 | `blocks_stage_advance` | boolean | NO | `false` |
| 13 | `requires_quick_verdict` | boolean | NO | `false` |
| 14 | `completion_requires_file_or_note` | boolean | NO | `false` |
| 15 | `required_evidence_file_types` | jsonb | NO | `'[]'::jsonb` |
| 16 | `executor_company_id` | uuid | YES |  |
| 17 | `default_assignee_id` | uuid | YES |  |
| 18 | `default_assignee_ids` | uuid[] | YES | `'{}'::uuid[]` |
| 19 | `clears_delivery_deadline_on_complete` | boolean | NO | `false` |

<a id="workshop_task_templates"></a>

### `workshop_task_templates`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | text | NO |  |
| 3 | `workshop_area` | text | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `is_active` | boolean | YES | `true` |
| 6 | `order_index` | integer | YES | `0` |
| 7 | `created_at` | timestamptz | YES | `now()` |
| 8 | `is_default` | boolean | YES | `false` |
| 9 | `updated_at` | timestamptz | NO | `now()` |
| 10 | `company_id` | uuid | YES |  |
| 11 | `production_stage_id` | uuid | YES |  |
| 12 | `logistics_stage_id` | uuid | YES |  |
| 13 | `workshop_type_id` | uuid | YES |  |

<a id="workshop_team_members"></a>

### `workshop_team_members`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `team_id` | uuid | NO |  |
| 3 | `user_id` | uuid | NO |  |
| 4 | `role` | text | YES | `'member'::text` |
| 5 | `joined_at` | timestamptz | YES | `now()` |

<a id="workshop_teams"></a>

### `workshop_teams`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `name` | text | NO |  |
| 3 | `type` | text | NO |  |
| 4 | `description` | text | YES |  |
| 5 | `color` | text | YES | `'#f97316'::text` |
| 6 | `is_active` | boolean | YES | `true` |
| 7 | `created_at` | timestamptz | YES | `now()` |
| 8 | `company_id` | uuid | YES |  |

<a id="zalo_contacts"></a>

### `zalo_contacts`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `oa_id` | text | NO |  |
| 3 | `user_id` | text | NO |  |
| 4 | `display_name` | text | YES |  |
| 5 | `avatar_url` | text | YES |  |
| 6 | `phone` | text | YES |  |
| 7 | `email` | text | YES |  |
| 8 | `customer_id` | uuid | YES |  |
| 9 | `lead_id` | uuid | YES |  |
| 10 | `last_message_at` | timestamptz | YES |  |
| 11 | `last_message_preview` | text | YES |  |
| 12 | `unread_count` | integer | YES | `0` |
| 13 | `created_at` | timestamptz | YES | `now()` |
| 14 | `updated_at` | timestamptz | YES | `now()` |

<a id="zalo_messages"></a>

### `zalo_messages`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `contact_id` | uuid | NO |  |
| 3 | `lead_id` | uuid | YES |  |
| 4 | `zalo_msg_id` | text | YES |  |
| 5 | `event_name` | text | YES |  |
| 6 | `direction` | text | NO |  |
| 7 | `message_type` | text | YES | `'text'::text` |
| 8 | `content` | text | YES |  |
| 9 | `attachment_url` | text | YES |  |
| 10 | `attachment_type` | text | YES |  |
| 11 | `metadata` | jsonb | YES |  |
| 12 | `sent_by` | uuid | YES |  |
| 13 | `is_read` | boolean | YES | `false` |
| 14 | `created_at` | timestamptz | YES | `now()` |

<a id="zalo_oa_accounts"></a>

### `zalo_oa_accounts`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `oa_id` | text | NO |  |
| 3 | `oa_name` | text | YES |  |
| 4 | `app_id` | text | YES |  |
| 5 | `access_token` | text | NO |  |
| 6 | `secret_key` | text | YES |  |
| 7 | `is_active` | boolean | YES | `true` |
| 8 | `auto_create_lead` | boolean | YES | `true` |
| 9 | `auto_reply_message` | text | YES | `'Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm nhất.':...` |
| 10 | `default_pipeline_id` | uuid | YES |  |
| 11 | `default_stage_id` | uuid | YES |  |
| 12 | `default_source_id` | uuid | YES |  |
| 13 | `default_company_id` | uuid | YES |  |
| 14 | `default_region_id` | uuid | YES |  |
| 15 | `default_lead_owner_id` | uuid | YES |  |
| 16 | `default_lead_type_id` | uuid | YES |  |
| 17 | `webhook_verify_enabled` | boolean | YES | `true` |
| 18 | `created_by` | uuid | YES |  |
| 19 | `created_at` | timestamptz | YES | `now()` |
| 20 | `updated_at` | timestamptz | YES | `now()` |
| 21 | `default_target_type` | text | YES | `'lead'::text` |
| 22 | `default_module_key` | text | YES | `'crm'::text` |
| 23 | `refresh_token` | text | YES |  |
| 24 | `access_token_expires_at` | timestamptz | YES |  |
| 25 | `refresh_token_expires_at` | timestamptz | YES |  |
| 26 | `token_refreshed_at` | timestamptz | YES |  |
| 27 | `last_token_error` | text | YES |  |
| 28 | `n8n_webhook_url` | text | YES |  |
| 29 | `n8n_sync_profile_webhook_url` | text | YES |  |
| 30 | `n8n_trigger_token` | text | YES |  |

<a id="zalo_webhook_logs"></a>

### `zalo_webhook_logs`

| # | Cột | Kiểu | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `oa_id` | text | YES |  |
| 3 | `event_name` | text | YES |  |
| 4 | `payload` | jsonb | YES |  |
| 5 | `status` | text | YES | `'received'::text` |
| 6 | `error_message` | text | YES |  |
| 7 | `created_at` | timestamptz | YES | `now()` |

---

## 4. Foreign keys (pg_catalog, 721)

| Bảng | Cột | → Bảng | → Cột |
|---|---|---|---|
| `activity_logs` | `user_id` | `users` | `id` |
| `ai_bot_skill_proposals` | `proposer_user_id` | `users` | `id` |
| `ai_bot_skill_proposals` | `reviewed_by` | `users` | `id` |
| `ai_bot_skill_proposals` | `schedule_id` | `ai_chat_bot_schedules` | `id` |
| `ai_bot_skill_proposals` | `skill_id` | `ai_bot_user_skills` | `id` |
| `ai_bot_task_flows` | `proposal_id` | `ai_bot_skill_proposals` | `id` |
| `ai_bot_task_flows` | `user_id` | `users` | `id` |
| `ai_bot_user_skills` | `schedule_id` | `ai_chat_bot_schedules` | `id` |
| `ai_bot_user_skills` | `user_id` | `users` | `id` |
| `ai_chat_bot_conversations` | `last_company_id` | `companies` | `id` |
| `ai_chat_bot_conversations` | `schedule_id` | `ai_chat_bot_schedules` | `id` |
| `ai_chat_bot_playbooks` | `created_by` | `users` | `id` |
| `ai_chat_bot_runs` | `schedule_id` | `ai_chat_bot_schedules` | `id` |
| `ai_chat_bot_runs` | `triggered_by` | `users` | `id` |
| `ai_chat_bot_schedules` | `created_by` | `users` | `id` |
| `ai_chat_bot_schedules` | `playbook_id` | `ai_chat_bot_playbooks` | `id` |
| `ai_chat_bot_user_facts` | `user_id` | `users` | `id` |
| `app_module_companies` | `company_id` | `companies` | `id` |
| `app_module_companies` | `module_id` | `app_modules` | `id` |
| `app_module_pipeline_stages` | `crm_target_stage_id` | `crm_pipeline_stages` | `id` |
| `app_module_pipeline_stages` | `module_id` | `app_modules` | `id` |
| `app_module_pipeline_stages` | `tab_id` | `app_module_tabs` | `id` |
| `app_module_records` | `assignee_id` | `users` | `id` |
| `app_module_records` | `company_id` | `companies` | `id` |
| `app_module_records` | `created_by` | `users` | `id` |
| `app_module_records` | `module_id` | `app_modules` | `id` |
| `app_module_records` | `source_crm_lead_id` | `crm_leads` | `id` |
| `app_module_records` | `stage_id` | `app_module_pipeline_stages` | `id` |
| `app_module_records` | `tab_id` | `app_module_tabs` | `id` |
| `app_module_tabs` | `module_id` | `app_modules` | `id` |
| `app_module_task_template_items` | `template_id` | `app_module_task_templates` | `id` |
| `app_module_task_templates` | `module_id` | `app_modules` | `id` |
| `app_module_task_templates` | `stage_id` | `app_module_pipeline_stages` | `id` |
| `app_module_tasks` | `assignee_id` | `users` | `id` |
| `app_module_tasks` | `created_by` | `users` | `id` |
| `app_module_tasks` | `module_id` | `app_modules` | `id` |
| `app_module_tasks` | `record_id` | `app_module_records` | `id` |
| `app_module_tasks` | `template_item_id` | `app_module_task_template_items` | `id` |
| `app_modules` | `company_id` | `companies` | `id` |
| `app_modules` | `created_by` | `users` | `id` |
| `app_releases` | `app_id` | `mobile_apps` | `id` |
| `app_releases` | `created_by` | `users` | `id` |
| `app_scan_dirs` | `app_id` | `mobile_apps` | `id` |
| `app_scan_dirs` | `user_id` | `users` | `id` |
| `app_update_logs` | `app_id` | `mobile_apps` | `id` |
| `approval_rules` | `stage_id` | `workflow_stages` | `id` |
| `auth_event_log` | `user_id` | `users` | `id` |
| `calc_3d_imports` | `created_by` | `users` | `id` |
| `calc_categories` | `company_id` | `companies` | `id` |
| `calc_categories` | `created_by` | `users` | `id` |
| `calc_formulas` | `created_by` | `users` | `id` |
| `calc_formulas` | `product_type_id` | `calc_product_types` | `id` |
| `calc_product_types` | `category_id` | `calc_categories` | `id` |
| `calc_product_types` | `created_by` | `users` | `id` |
| `calc_rules` | `formula_id` | `calc_formulas` | `id` |
| `calc_rules` | `product_type_id` | `calc_product_types` | `id` |
| `calc_runs` | `applied_formula_id` | `calc_formulas` | `id` |
| `calc_runs` | `created_by` | `users` | `id` |
| `calc_runs` | `matched_rule_id` | `calc_rules` | `id` |
| `calc_runs` | `product_type_id` | `calc_product_types` | `id` |
| `calc_variables` | `product_type_id` | `calc_product_types` | `id` |
| `companies` | `division_unit_id` | `ecosystem_units` | `id` |
| `companies` | `tenant_id` | `tenants` | `id` |
| `company_bank_accounts` | `company_id` | `companies` | `id` |
| `company_bank_accounts` | `region_id` | `company_regions` | `id` |
| `company_division_units` | `company_id` | `companies` | `id` |
| `company_division_units` | `division_unit_id` | `ecosystem_units` | `id` |
| `company_process_checklists` | `default_assignee_id` | `users` | `id` |
| `company_process_checklists` | `task_id` | `company_process_tasks` | `id` |
| `company_process_tasks` | `default_assignee_id` | `users` | `id` |
| `company_process_tasks` | `default_department_id` | `ecosystem_units` | `id` |
| `company_process_tasks` | `default_team_id` | `ecosystem_units` | `id` |
| `company_process_tasks` | `process_id` | `company_processes` | `id` |
| `company_processes` | `company_unit_id` | `ecosystem_units` | `id` |
| `company_processes` | `created_by` | `users` | `id` |
| `company_regions` | `company_id` | `companies` | `id` |
| `company_regions` | `division_unit_id` | `ecosystem_units` | `id` |
| `company_template_checklists` | `default_assignee_id` | `users` | `id` |
| `company_template_checklists` | `template_task_id` | `company_template_tasks` | `id` |
| `company_template_sets` | `company_id` | `companies` | `id` |
| `company_template_sets` | `created_by` | `users` | `id` |
| `company_template_sets` | `source_process_id` | `company_processes` | `id` |
| `company_template_sets` | `unit_id` | `ecosystem_units` | `id` |
| `company_template_tasks` | `default_assignee_id` | `users` | `id` |
| `company_template_tasks` | `default_department_id` | `ecosystem_units` | `id` |
| `company_template_tasks` | `default_team_id` | `ecosystem_units` | `id` |
| `company_template_tasks` | `stage_id` | `workflow_stages` | `id` |
| `company_template_tasks` | `supervisor_id` | `users` | `id` |
| `company_template_tasks` | `template_set_id` | `company_template_sets` | `id` |
| `crm_activities` | `created_by` | `users` | `id` |
| `crm_activities` | `customer_id` | `customers` | `id` |
| `crm_activities` | `lead_id` | `crm_leads` | `id` |
| `crm_assignment_assignees` | `assignment_id` | `crm_assignments` | `id` |
| `crm_assignment_assignees` | `user_id` | `users` | `id` |
| `crm_assignment_columns` | `company_id` | `companies` | `id` |
| `crm_assignment_columns` | `created_by_id` | `users` | `id` |
| `crm_assignment_comments` | `assignment_id` | `crm_assignments` | `id` |
| `crm_assignment_comments` | `parent_id` | `crm_assignment_comments` | `id` |
| `crm_assignment_comments` | `user_id` | `users` | `id` |
| `crm_assignment_files` | `assignment_id` | `crm_assignments` | `id` |
| `crm_assignment_files` | `source_task_attachment_id` | `crm_task_attachments` | `id` |
| `crm_assignment_files` | `uploaded_by` | `users` | `id` |
| `crm_assignment_schedule_files` | `schedule_id` | `crm_assignment_schedules` | `id` |
| `crm_assignment_schedule_files` | `uploaded_by` | `users` | `id` |
| `crm_assignment_schedules` | `column_id` | `crm_assignment_columns` | `id` |
| `crm_assignment_schedules` | `company_id` | `companies` | `id` |
| `crm_assignment_schedules` | `created_by_id` | `users` | `id` |
| `crm_assignment_schedules` | `last_assignment_id` | `crm_assignments` | `id` |
| `crm_assignments` | `assignee_id` | `users` | `id` |
| `crm_assignments` | `column_id` | `crm_assignment_columns` | `id` |
| `crm_assignments` | `company_id` | `companies` | `id` |
| `crm_assignments` | `created_by_id` | `users` | `id` |
| `crm_assignments` | `crm_task_id` | `crm_tasks` | `id` |
| `crm_assignments` | `department_id` | `departments` | `id` |
| `crm_assignments` | `executor_company_id` | `companies` | `id` |
| `crm_assignments` | `lead_id` | `crm_leads` | `id` |
| `crm_assignments` | `schedule_id` | `crm_assignment_schedules` | `id` |
| `crm_auto_lead_blocked_phones` | `created_by` | `users` | `id` |
| `crm_call_logs` | `created_by` | `users` | `id` |
| `crm_call_logs` | `customer_id` | `customers` | `id` |
| `crm_call_logs` | `lead_id` | `crm_leads` | `id` |
| `crm_company_deadline_config` | `company_id` | `companies` | `id` |
| `crm_company_visible_production_companies` | `crm_company_id` | `companies` | `id` |
| `crm_company_visible_production_companies` | `production_company_id` | `companies` | `id` |
| `crm_daily_report_lines` | `report_id` | `crm_daily_reports` | `id` |
| `crm_daily_report_lines` | `template_item_id` | `crm_daily_report_template_items` | `id` |
| `crm_daily_report_template_items` | `template_id` | `crm_daily_report_templates` | `id` |
| `crm_daily_report_templates` | `company_id` | `companies` | `id` |
| `crm_daily_report_user_extras` | `company_id` | `companies` | `id` |
| `crm_daily_report_user_extras` | `user_id` | `users` | `id` |
| `crm_daily_report_user_templates` | `assigned_by` | `users` | `id` |
| `crm_daily_report_user_templates` | `company_id` | `companies` | `id` |
| `crm_daily_report_user_templates` | `template_id` | `crm_daily_report_templates` | `id` |
| `crm_daily_report_user_templates` | `user_id` | `users` | `id` |
| `crm_daily_reports` | `company_id` | `companies` | `id` |
| `crm_daily_reports` | `template_id` | `crm_daily_report_templates` | `id` |
| `crm_daily_reports` | `user_id` | `users` | `id` |
| `crm_deal_payments` | `bank_account_id` | `company_bank_accounts` | `id` |
| `crm_deal_payments` | `created_by` | `users` | `id` |
| `crm_deal_payments` | `invoice_id` | `invoices` | `id` |
| `crm_deal_payments` | `lead_id` | `crm_leads` | `id` |
| `crm_deal_payments` | `mirrored_payment_record_id` | `payment_records` | `id` |
| `crm_deal_payments` | `order_id` | `orders` | `id` |
| `crm_deal_payments` | `stage_id` | `crm_payment_stages` | `id` |
| `crm_deal_projects` | `created_by` | `users` | `id` |
| `crm_deal_projects` | `deal_id` | `crm_leads` | `id` |
| `crm_deal_projects` | `project_id` | `projects` | `id` |
| `crm_dept_plan_sheets` | `company_id` | `companies` | `id` |
| `crm_dept_plan_sheets` | `created_by` | `users` | `id` |
| `crm_dept_plan_sheets` | `department_id` | `departments` | `id` |
| `crm_dept_plan_tasks` | `created_by` | `users` | `id` |
| `crm_dept_plan_tasks` | `department_id` | `departments` | `id` |
| `crm_dept_plan_tasks` | `sheet_id` | `crm_dept_plan_sheets` | `id` |
| `crm_dept_plan_tasks` | `user_id` | `users` | `id` |
| `crm_event_comments` | `event_id` | `crm_events` | `id` |
| `crm_event_comments` | `user_id` | `users` | `id` |
| `crm_event_participants` | `event_id` | `crm_events` | `id` |
| `crm_event_participants` | `user_id` | `users` | `id` |
| `crm_events` | `assignee_id` | `users` | `id` |
| `crm_events` | `company_id` | `companies` | `id` |
| `crm_events` | `created_by` | `users` | `id` |
| `crm_events` | `customer_id` | `customers` | `id` |
| `crm_events` | `event_type_id` | `event_types` | `id` |
| `crm_events` | `lead_id` | `crm_leads` | `id` |
| `crm_events` | `project_id` | `projects` | `id` |
| `crm_followup_care_dismissals` | `company_id` | `companies` | `id` |
| `crm_followup_care_dismissals` | `pipeline_id` | `crm_pipelines` | `id` |
| `crm_followup_care_dismissals` | `stage_id` | `crm_pipeline_stages` | `id` |
| `crm_followup_care_dismissals` | `user_id` | `users` | `id` |
| `crm_kpi_ledger` | `company_id` | `companies` | `id` |
| `crm_kpi_ledger` | `created_by` | `users` | `id` |
| `crm_kpi_ledger` | `lead_id` | `crm_leads` | `id` |
| `crm_kpi_ledger` | `rule_id` | `crm_kpi_scoring_rules` | `id` |
| `crm_kpi_ledger` | `source_kpi_code` | `kpi_definitions` | `code` |
| `crm_kpi_ledger` | `stage_id` | `crm_pipeline_stages` | `id` |
| `crm_kpi_ledger` | `task_id` | `crm_tasks` | `id` |
| `crm_kpi_ledger` | `user_id` | `users` | `id` |
| `crm_kpi_scoring_rules` | `company_id` | `companies` | `id` |
| `crm_lead_care_marks` | `lead_id` | `crm_leads` | `id` |
| `crm_lead_care_marks` | `user_id` | `users` | `id` |
| `crm_lead_comment_reactions` | `comment_id` | `crm_lead_comments` | `id` |
| `crm_lead_comment_reactions` | `user_id` | `users` | `id` |
| `crm_lead_comment_read_receipts` | `lead_id` | `crm_leads` | `id` |
| `crm_lead_comment_read_receipts` | `user_id` | `users` | `id` |
| `crm_lead_comments` | `lead_id` | `crm_leads` | `id` |
| `crm_lead_comments` | `parent_id` | `crm_lead_comments` | `id` |
| `crm_lead_comments` | `user_id` | `users` | `id` |
| `crm_lead_deadline_history` | `changed_by` | `users` | `id` |
| `crm_lead_deadline_history` | `lead_id` | `crm_leads` | `id` |
| `crm_lead_deadline_history` | `stage_id` | `crm_pipeline_stages` | `id` |
| `crm_lead_stage_history` | `changed_by` | `users` | `id` |
| `crm_lead_stage_history` | `from_stage_id` | `crm_pipeline_stages` | `id` |
| `crm_lead_stage_history` | `lead_id` | `crm_leads` | `id` |
| `crm_lead_stage_history` | `to_stage_id` | `crm_pipeline_stages` | `id` |
| `crm_lead_type_production_links` | `lead_type_id` | `crm_lead_types` | `id` |
| `crm_lead_type_production_links` | `production_company_id` | `companies` | `id` |
| `crm_lead_type_production_links` | `workshop_type_id` | `workshop_project_types` | `id` |
| `crm_lead_types` | `company_id` | `companies` | `id` |
| `crm_lead_types` | `default_production_company_id` | `companies` | `id` |
| `crm_lead_types` | `default_workshop_type_id` | `workshop_project_types` | `id` |
| `crm_lead_user_flags` | `lead_id` | `crm_leads` | `id` |
| `crm_lead_user_flags` | `user_id` | `users` | `id` |
| `crm_leads` | `assigned_to` | `users` | `id` |
| `crm_leads` | `company_id` | `companies` | `id` |
| `crm_leads` | `created_by` | `users` | `id` |
| `crm_leads` | `customer_id` | `customers` | `id` |
| `crm_leads` | `deadline_disabled_by` | `users` | `id` |
| `crm_leads` | `external_company_id` | `companies` | `id` |
| `crm_leads` | `lead_owner_id` | `users` | `id` |
| `crm_leads` | `lead_type_id` | `crm_lead_types` | `id` |
| `crm_leads` | `parent_lead_id` | `crm_leads` | `id` |
| `crm_leads` | `pipeline_id` | `crm_pipelines` | `id` |
| `crm_leads` | `project_id` | `projects` | `id` |
| `crm_leads` | `region_id` | `company_regions` | `id` |
| `crm_leads` | `source_customer_deal_id` | `crm_leads` | `id` |
| `crm_leads` | `source_id` | `crm_sources` | `id` |
| `crm_leads` | `stage_id` | `crm_pipeline_stages` | `id` |
| `crm_leads` | `sx_handover_confirmed_by` | `users` | `id` |
| `crm_leads` | `sx_pipeline_stage_id` | `production_pipeline_stages` | `id` |
| `crm_leads` | `sx_template_company_id` | `companies` | `id` |
| `crm_leads` | `vc_pipeline_stage_id` | `logistics_pipeline_stages` | `id` |
| `crm_payment_stages` | `bank_account_id` | `company_bank_accounts` | `id` |
| `crm_payment_stages` | `company_id` | `companies` | `id` |
| `crm_payment_stages` | `lead_id` | `crm_leads` | `id` |
| `crm_pipeline_stages` | `default_assignee_user_id` | `users` | `id` |
| `crm_pipelines` | `company_id` | `companies` | `id` |
| `crm_pipelines` | `region_id` | `company_regions` | `id` |
| `crm_referrers` | `company_id` | `companies` | `id` |
| `crm_referrers` | `created_by` | `users` | `id` |
| `crm_source_categories` | `company_id` | `companies` | `id` |
| `crm_sources` | `category_id` | `crm_source_categories` | `id` |
| `crm_sources` | `company_id` | `companies` | `id` |
| `crm_task_assignees` | `task_id` | `crm_tasks` | `id` |
| `crm_task_assignees` | `user_id` | `users` | `id` |
| `crm_task_attachments` | `created_by` | `users` | `id` |
| `crm_task_attachments` | `lead_id` | `crm_leads` | `id` |
| `crm_task_attachments` | `source_assignment_file_id` | `crm_assignment_files` | `id` |
| `crm_task_attachments` | `source_document_id` | `lead_documents` | `id` |
| `crm_task_attachments` | `source_drive_file_id` | `drive_files` | `id` |
| `crm_task_attachments` | `task_id` | `crm_tasks` | `id` |
| `crm_task_template_items` | `default_assignee_id` | `users` | `id` |
| `crm_task_template_items` | `executor_company_id` | `companies` | `id` |
| `crm_task_template_items` | `template_id` | `crm_task_templates` | `id` |
| `crm_task_templates` | `pipeline_stage_id` | `crm_pipeline_stages` | `id` |
| `crm_tasks` | `assignee_id` | `users` | `id` |
| `crm_tasks` | `created_by` | `users` | `id` |
| `crm_tasks` | `department_id` | `departments` | `id` |
| `crm_tasks` | `executor_company_id` | `companies` | `id` |
| `crm_tasks` | `lead_id` | `crm_leads` | `id` |
| `crm_tasks` | `pipeline_stage_id` | `crm_pipeline_stages` | `id` |
| `crm_tasks` | `production_pipeline_stage_id` | `production_pipeline_stages` | `id` |
| `crm_tasks` | `quick_verdict_by` | `users` | `id` |
| `crm_tasks` | `supervisor_id` | `users` | `id` |
| `crm_user_planner_columns` | `company_id` | `companies` | `id` |
| `crm_user_planner_columns` | `user_id` | `users` | `id` |
| `crm_user_planner_items` | `column_id` | `crm_user_planner_columns` | `id` |
| `crm_user_planner_items` | `lead_id` | `crm_leads` | `id` |
| `crm_zalo_stage_sends` | `lead_id` | `crm_leads` | `id` |
| `crm_zalo_stage_sends` | `stage_id` | `crm_pipeline_stages` | `id` |
| `customer_interactions` | `customer_id` | `customers` | `id` |
| `customer_interactions` | `user_id` | `users` | `id` |
| `customers` | `assigned_to` | `users` | `id` |
| `customers` | `company_id` | `companies` | `id` |
| `customers` | `status_id` | `customer_statuses` | `id` |
| `deal_cross_module_scores` | `created_by` | `users` | `id` |
| `deal_cross_module_scores` | `deal_lead_id` | `crm_leads` | `id` |
| `deal_customer_ratings` | `deal_lead_id` | `crm_leads` | `id` |
| `deal_customer_ratings` | `recorded_by` | `users` | `id` |
| `department_message_reactions` | `message_id` | `department_messages` | `id` |
| `department_message_reactions` | `user_id` | `users` | `id` |
| `department_message_reads` | `department_id` | `departments` | `id` |
| `department_message_reads` | `user_id` | `users` | `id` |
| `department_messages` | `department_id` | `departments` | `id` |
| `department_messages` | `reply_to_id` | `department_messages` | `id` |
| `department_messages` | `sender_id` | `users` | `id` |
| `departments` | `company_id` | `companies` | `id` |
| `departments` | `division_unit_id` | `ecosystem_units` | `id` |
| `departments` | `manager_id` | `users` | `id` |
| `departments` | `parent_id` | `departments` | `id` |
| `division_members` | `division_id` | `ecosystem_units` | `id` |
| `division_members` | `user_id` | `users` | `id` |
| `division_projects` | `assigned_by` | `users` | `id` |
| `division_projects` | `division_id` | `ecosystem_units` | `id` |
| `division_projects` | `project_id` | `projects` | `id` |
| `drive_acl` | `granted_by` | `users` | `id` |
| `drive_activity_log` | `actor_id` | `users` | `id` |
| `drive_activity_log` | `root_id` | `drive_roots` | `id` |
| `drive_entity_links` | `created_by` | `users` | `id` |
| `drive_entity_links` | `file_id` | `drive_files` | `id` |
| `drive_files` | `folder_id` | `drive_folders` | `id` |
| `drive_files` | `root_id` | `drive_roots` | `id` |
| `drive_files` | `trashed_by` | `users` | `id` |
| `drive_files` | `uploaded_by` | `users` | `id` |
| `drive_folders` | `created_by` | `users` | `id` |
| `drive_folders` | `parent_id` | `drive_folders` | `id` |
| `drive_folders` | `root_id` | `drive_roots` | `id` |
| `drive_folders` | `trashed_by` | `users` | `id` |
| `drive_roots` | `company_id` | `companies` | `id` |
| `drive_roots` | `created_by` | `users` | `id` |
| `drive_stars` | `user_id` | `users` | `id` |
| `ecosystem_module_scopes` | `division_unit_id` | `ecosystem_units` | `id` |
| `ecosystem_unit_members` | `unit_id` | `ecosystem_units` | `id` |
| `ecosystem_unit_members` | `user_id` | `users` | `id` |
| `ecosystem_unit_stage_groups` | `group_id` | `workflow_stage_groups` | `id` |
| `ecosystem_unit_stage_groups` | `unit_id` | `ecosystem_units` | `id` |
| `ecosystem_units` | `company_id` | `companies` | `id` |
| `ecosystem_units` | `department_id` | `departments` | `id` |
| `ecosystem_units` | `level_id` | `ecosystem_levels` | `id` |
| `ecosystem_units` | `parent_id` | `ecosystem_units` | `id` |
| `ecosystem_units` | `stage_group_id` | `workflow_stage_groups` | `id` |
| `ecosystem_units` | `team_id` | `teams` | `id` |
| `ecosystem_units` | `tenant_id` | `tenants` | `id` |
| `external_api_keys` | `company_id` | `companies` | `id` |
| `external_api_keys` | `created_by` | `users` | `id` |
| `external_api_keys` | `default_assigned_to` | `users` | `id` |
| `external_api_keys` | `default_lead_type_id` | `crm_lead_types` | `id` |
| `external_api_keys` | `default_pipeline_id` | `crm_pipelines` | `id` |
| `external_api_keys` | `region_id` | `company_regions` | `id` |
| `external_api_keys` | `rotated_by` | `users` | `id` |
| `facebook_comments` | `lead_id` | `crm_leads` | `id` |
| `facebook_contacts` | `customer_id` | `customers` | `id` |
| `facebook_contacts` | `lead_id` | `crm_leads` | `id` |
| `facebook_image_sets` | `company_id` | `companies` | `id` |
| `facebook_image_sets` | `created_by` | `users` | `id` |
| `facebook_image_sets` | `drive_folder_id` | `drive_folders` | `id` |
| `facebook_inbox_canned_replies` | `user_id` | `users` | `id` |
| `facebook_lead_ads` | `customer_id` | `customers` | `id` |
| `facebook_lead_ads` | `lead_id` | `crm_leads` | `id` |
| `facebook_messages` | `contact_id` | `facebook_contacts` | `id` |
| `facebook_messages` | `lead_id` | `crm_leads` | `id` |
| `facebook_messages` | `sent_by` | `users` | `id` |
| `facebook_pages` | `created_by` | `users` | `id` |
| `facebook_pages` | `default_company_id` | `companies` | `id` |
| `facebook_pages` | `default_region_id` | `company_regions` | `id` |
| `file_attachments` | `uploaded_by` | `users` | `id` |
| `flow_step_processes` | `flow_step_id` | `workflow_flow_steps` | `id` |
| `flow_step_processes` | `process_id` | `company_processes` | `id` |
| `flow_step_task_checklists` | `assigned_user_id` | `users` | `id` |
| `flow_step_task_checklists` | `flow_step_task_id` | `flow_step_tasks` | `id` |
| `flow_step_task_checklists` | `flow_step_task_id` | `flow_step_tasks` | `id` |
| `flow_step_task_checklists` | `template_checklist_id` | `company_template_checklists` | `id` |
| `flow_step_tasks` | `assigned_company_unit_id` | `ecosystem_units` | `id` |
| `flow_step_tasks` | `assigned_user_id` | `users` | `id` |
| `flow_step_tasks` | `flow_step_id` | `workflow_flow_steps` | `id` |
| `flow_step_tasks` | `flow_step_id` | `workflow_flow_steps` | `id` |
| `flow_step_tasks` | `stage_id` | `workflow_stages` | `id` |
| `flow_step_tasks` | `template_task_id` | `company_template_tasks` | `id` |
| `internal_social_attachments` | `post_id` | `internal_social_posts` | `id` |
| `internal_social_comment_reactions` | `comment_id` | `internal_social_comments` | `id` |
| `internal_social_comment_reactions` | `user_id` | `users` | `id` |
| `internal_social_comments` | `author_id` | `users` | `id` |
| `internal_social_comments` | `parent_id` | `internal_social_comments` | `id` |
| `internal_social_comments` | `post_id` | `internal_social_posts` | `id` |
| `internal_social_last_read` | `company_id` | `companies` | `id` |
| `internal_social_last_read` | `user_id` | `users` | `id` |
| `internal_social_likes` | `post_id` | `internal_social_posts` | `id` |
| `internal_social_likes` | `user_id` | `users` | `id` |
| `internal_social_post_audience` | `post_id` | `internal_social_posts` | `id` |
| `internal_social_post_audience` | `user_id` | `users` | `id` |
| `internal_social_post_blocked_companies` | `company_id` | `companies` | `id` |
| `internal_social_post_blocked_companies` | `post_id` | `internal_social_posts` | `id` |
| `internal_social_post_companies` | `company_id` | `companies` | `id` |
| `internal_social_post_companies` | `post_id` | `internal_social_posts` | `id` |
| `internal_social_post_user_hides` | `post_id` | `internal_social_posts` | `id` |
| `internal_social_post_user_hides` | `user_id` | `users` | `id` |
| `internal_social_posts` | `author_id` | `users` | `id` |
| `internal_social_posts` | `company_id` | `companies` | `id` |
| `invoice_items` | `invoice_id` | `invoices` | `id` |
| `invoice_items` | `order_item_id` | `order_items` | `id` |
| `invoice_items` | `product_id` | `products` | `id` |
| `invoices` | `company_id` | `companies` | `id` |
| `invoices` | `created_by` | `users` | `id` |
| `invoices` | `customer_id` | `customers` | `id` |
| `invoices` | `lead_id` | `crm_leads` | `id` |
| `invoices` | `order_id` | `orders` | `id` |
| `invoices` | `project_id` | `projects` | `id` |
| `invoices` | `quotation_id` | `quotations` | `id` |
| `invoices` | `region_id` | `company_regions` | `id` |
| `knowledge_categories` | `company_id` | `companies` | `id` |
| `knowledge_categories` | `created_by` | `users` | `id` |
| `knowledge_categories` | `parent_id` | `knowledge_categories` | `id` |
| `knowledge_category_deadline_history` | `category_id` | `knowledge_categories` | `id` |
| `knowledge_category_deadline_history` | `changed_by` | `users` | `id` |
| `knowledge_certificates` | `category_id` | `knowledge_categories` | `id` |
| `knowledge_certificates` | `revoked_by` | `users` | `id` |
| `knowledge_certificates` | `user_id` | `users` | `id` |
| `knowledge_exercise_submissions` | `exercise_id` | `knowledge_exercises` | `id` |
| `knowledge_exercise_submissions` | `graded_by` | `users` | `id` |
| `knowledge_exercise_submissions` | `user_id` | `users` | `id` |
| `knowledge_exercises` | `lesson_id` | `knowledge_lessons` | `id` |
| `knowledge_lesson_progress` | `lesson_id` | `knowledge_lessons` | `id` |
| `knowledge_lesson_progress` | `user_id` | `users` | `id` |
| `knowledge_lessons` | `category_id` | `knowledge_categories` | `id` |
| `knowledge_lessons` | `created_by` | `users` | `id` |
| `kpi_business_hours_config` | `company_id` | `companies` | `id` |
| `kpi_holidays` | `company_id` | `companies` | `id` |
| `kpi_holidays` | `created_by` | `users` | `id` |
| `kpi_periods` | `closed_by` | `users` | `id` |
| `kpi_scores` | `company_id` | `companies` | `id` |
| `kpi_scores` | `kpi_definition_id` | `kpi_definitions` | `id` |
| `kpi_scores` | `period_id` | `kpi_periods` | `id` |
| `kpi_scores` | `user_id` | `users` | `id` |
| `kpi_targets` | `company_id` | `companies` | `id` |
| `kpi_targets` | `created_by` | `users` | `id` |
| `kpi_targets` | `kpi_definition_id` | `kpi_definitions` | `id` |
| `kpi_targets` | `user_id` | `users` | `id` |
| `kpi_user_leaves` | `approved_by` | `users` | `id` |
| `kpi_user_leaves` | `user_id` | `users` | `id` |
| `lead_documents` | `created_by` | `users` | `id` |
| `lead_documents` | `lead_id` | `crm_leads` | `id` |
| `lead_documents` | `project_id` | `projects` | `id` |
| `lead_documents` | `source_attachment_id` | `crm_task_attachments` | `id` |
| `lead_documents` | `source_crm_task_id` | `crm_tasks` | `id` |
| `lead_documents` | `source_drive_file_id` | `drive_files` | `id` |
| `lead_documents` | `source_file_attachment_id` | `file_attachments` | `id` |
| `lead_documents` | `source_project_task_id` | `tasks` | `id` |
| `lead_members` | `added_by` | `users` | `id` |
| `lead_members` | `lead_id` | `crm_leads` | `id` |
| `lead_members` | `user_id` | `users` | `id` |
| `lead_message_reactions` | `message_id` | `lead_messages` | `id` |
| `lead_message_reactions` | `user_id` | `users` | `id` |
| `lead_messages` | `lead_id` | `crm_leads` | `id` |
| `lead_messages` | `user_id` | `users` | `id` |
| `logistics_handover_settings` | `handover_confirm_user_id` | `users` | `id` |
| `logistics_handover_settings` | `installer_user_id` | `users` | `id` |
| `logistics_handover_settings` | `logistics_company_id` | `companies` | `id` |
| `logistics_handover_settings` | `responsible_user_id` | `users` | `id` |
| `logistics_pipeline_stages` | `company_id` | `companies` | `id` |
| `logistics_pipeline_stages` | `crm_target_stage_id` | `crm_pipeline_stages` | `id` |
| `logistics_pipeline_stages` | `workflow_stage_id` | `workflow_stages` | `id` |
| `messenger_chat_wallpapers` | `group_id` | `messenger_groups` | `id` |
| `messenger_chat_wallpapers` | `viewer_user_id` | `users` | `id` |
| `messenger_contact_nicknames` | `target_user_id` | `users` | `id` |
| `messenger_contact_nicknames` | `viewer_user_id` | `users` | `id` |
| `messenger_group_member_nicknames` | `group_id` | `messenger_groups` | `id` |
| `messenger_group_member_nicknames` | `target_user_id` | `users` | `id` |
| `messenger_group_member_nicknames` | `viewer_user_id` | `users` | `id` |
| `messenger_group_members` | `added_by` | `users` | `id` |
| `messenger_group_members` | `group_id` | `messenger_groups` | `id` |
| `messenger_group_members` | `user_id` | `users` | `id` |
| `messenger_group_messages` | `group_id` | `messenger_groups` | `id` |
| `messenger_group_messages` | `recalled_by` | `users` | `id` |
| `messenger_group_messages` | `reply_to` | `messenger_group_messages` | `id` |
| `messenger_group_messages` | `user_id` | `users` | `id` |
| `messenger_groups` | `created_by` | `users` | `id` |
| `messenger_groups` | `crm_lead_id` | `crm_leads` | `id` |
| `messenger_message_reactions` | `message_id` | `messenger_group_messages` | `id` |
| `messenger_message_reactions` | `user_id` | `users` | `id` |
| `messenger_read_receipts` | `group_id` | `messenger_groups` | `id` |
| `messenger_read_receipts` | `user_id` | `users` | `id` |
| `messenger_user_pins` | `group_id` | `messenger_groups` | `id` |
| `messenger_user_pins` | `user_id` | `users` | `id` |
| `notification_mutes` | `user_id` | `users` | `id` |
| `notification_preferences` | `user_id` | `users` | `id` |
| `notifications` | `user_id` | `users` | `id` |
| `order_cross_acceptances` | `checked_by` | `users` | `id` |
| `order_cross_acceptances` | `order_id` | `orders` | `id` |
| `order_items` | `order_id` | `orders` | `id` |
| `order_items` | `product_id` | `products` | `id` |
| `order_items` | `quotation_item_id` | `quotation_items` | `id` |
| `orders` | `company_id` | `companies` | `id` |
| `orders` | `created_by` | `users` | `id` |
| `orders` | `customer_id` | `customers` | `id` |
| `orders` | `fulfillment_lead_id` | `crm_leads` | `id` |
| `orders` | `lead_id` | `crm_leads` | `id` |
| `orders` | `logistics_project_id` | `projects` | `id` |
| `orders` | `project_id` | `projects` | `id` |
| `orders` | `quotation_id` | `quotations` | `id` |
| `orders` | `region_id` | `company_regions` | `id` |
| `orders` | `sx_company_id` | `companies` | `id` |
| `orders` | `sx_construction_assignee_id` | `users` | `id` |
| `payment_records` | `created_by` | `users` | `id` |
| `payment_records` | `invoice_id` | `invoices` | `id` |
| `payment_records` | `order_id` | `orders` | `id` |
| `permission_audit_log` | `unit_id` | `ecosystem_units` | `id` |
| `permission_audit_log` | `user_id` | `users` | `id` |
| `pipeline_stage_module_links` | `target_module_id` | `app_modules` | `id` |
| `product_brands` | `company_id` | `companies` | `id` |
| `product_categories` | `company_id` | `companies` | `id` |
| `product_categories` | `parent_id` | `product_categories` | `id` |
| `product_structures` | `component_id` | `product_components` | `id` |
| `product_structures` | `product_id` | `products` | `id` |
| `production_external_companies` | `created_by` | `users` | `id` |
| `production_external_companies` | `linked_company_id` | `companies` | `id` |
| `production_external_companies` | `production_company_id` | `companies` | `id` |
| `production_handover_settings` | `default_production_team_id` | `workshop_teams` | `id` |
| `production_handover_settings` | `delivery_confirm_user_id` | `users` | `id` |
| `production_handover_settings` | `production_company_id` | `companies` | `id` |
| `production_handover_settings` | `responsible_user_id` | `users` | `id` |
| `production_handover_task_assignments` | `assignee_user_id` | `users` | `id` |
| `production_handover_task_assignments` | `production_company_id` | `companies` | `id` |
| `production_handover_task_assignments` | `template_item_id` | `workshop_task_template_items` | `id` |
| `production_pipeline_stage_default_staff` | `production_pipeline_stage_id` | `production_pipeline_stages` | `id` |
| `production_pipeline_stage_default_staff` | `user_id` | `users` | `id` |
| `production_pipeline_stages` | `company_id` | `companies` | `id` |
| `production_pipeline_stages` | `crm_target_stage_id` | `crm_pipeline_stages` | `id` |
| `production_pipeline_stages` | `target_workshop_type_id` | `workshop_project_types` | `id` |
| `production_pipeline_stages` | `workflow_stage_id` | `workflow_stages` | `id` |
| `production_pipeline_stages` | `workshop_type_id` | `workshop_project_types` | `id` |
| `production_workshop_client_companies` | `client_company_id` | `companies` | `id` |
| `production_workshop_client_companies` | `production_company_id` | `companies` | `id` |
| `production_workshop_type_default_staff` | `production_company_id` | `companies` | `id` |
| `production_workshop_type_default_staff` | `user_id` | `users` | `id` |
| `production_workshop_type_default_staff` | `workshop_type_id` | `workshop_project_types` | `id` |
| `products` | `brand_id` | `product_brands` | `id` |
| `products` | `category_id` | `product_categories` | `id` |
| `products` | `company_id` | `companies` | `id` |
| `project_approvals` | `decided_by` | `users` | `id` |
| `project_approvals` | `project_id` | `projects` | `id` |
| `project_approvals` | `requested_by` | `users` | `id` |
| `project_approvals` | `stage_id` | `workflow_stages` | `id` |
| `project_comment_reactions` | `comment_id` | `project_comments` | `id` |
| `project_comment_reactions` | `user_id` | `users` | `id` |
| `project_comment_read_receipts` | `project_id` | `projects` | `id` |
| `project_comment_read_receipts` | `user_id` | `users` | `id` |
| `project_comments` | `parent_id` | `project_comments` | `id` |
| `project_comments` | `project_id` | `projects` | `id` |
| `project_comments` | `user_id` | `users` | `id` |
| `project_company_assignments` | `company_id` | `companies` | `id` |
| `project_company_assignments` | `company_unit_id` | `ecosystem_units` | `id` |
| `project_company_assignments` | `division_unit_id` | `ecosystem_units` | `id` |
| `project_company_assignments` | `project_id` | `projects` | `id` |
| `project_company_assignments` | `template_set_id` | `company_template_sets` | `id` |
| `project_expenses` | `created_by` | `users` | `id` |
| `project_expenses` | `project_id` | `projects` | `id` |
| `project_incidents` | `project_id` | `projects` | `id` |
| `project_incidents` | `reported_by` | `users` | `id` |
| `project_incidents` | `resolved_by` | `users` | `id` |
| `project_phase_handoffs` | `accepted_by` | `users` | `id` |
| `project_phase_handoffs` | `created_by` | `users` | `id` |
| `project_phase_handoffs` | `from_division_id` | `ecosystem_units` | `id` |
| `project_phase_handoffs` | `project_id` | `projects` | `id` |
| `project_phase_handoffs` | `to_division_id` | `ecosystem_units` | `id` |
| `project_production_staff` | `project_id` | `projects` | `id` |
| `project_production_staff` | `user_id` | `users` | `id` |
| `project_products` | `product_id` | `products` | `id` |
| `project_products` | `project_id` | `projects` | `id` |
| `project_units` | `project_id` | `projects` | `id` |
| `project_units` | `unit_id` | `ecosystem_units` | `id` |
| `project_workflow_lines` | `assignee_id` | `users` | `id` |
| `project_workflow_lines` | `project_id` | `projects` | `id` |
| `project_workshop_placements` | `created_by` | `users` | `id` |
| `project_workshop_placements` | `source_project_id` | `projects` | `id` |
| `project_workshop_placements` | `target_company_id` | `companies` | `id` |
| `project_workshop_placements` | `target_project_id` | `projects` | `id` |
| `project_workshop_placements` | `workshop_type_id` | `workshop_project_types` | `id` |
| `projects` | `care_person_id` | `users` | `id` |
| `projects` | `company_id` | `companies` | `id` |
| `projects` | `consulting_person_id` | `users` | `id` |
| `projects` | `contract_person_id` | `users` | `id` |
| `projects` | `current_stage_id` | `workflow_stages` | `id` |
| `projects` | `customer_id` | `customers` | `id` |
| `projects` | `delivery_team_id` | `workshop_teams` | `id` |
| `projects` | `design_person_id` | `users` | `id` |
| `projects` | `designer_id` | `users` | `id` |
| `projects` | `flow_id` | `workflow_flows` | `id` |
| `projects` | `installation_person_id` | `users` | `id` |
| `projects` | `installation_team_id` | `workshop_teams` | `id` |
| `projects` | `installer_person_id` | `users` | `id` |
| `projects` | `logistics_company_id` | `companies` | `id` |
| `projects` | `logistics_person_id` | `users` | `id` |
| `projects` | `production_person_id` | `users` | `id` |
| `projects` | `production_workshop_team_id` | `workshop_teams` | `id` |
| `projects` | `project_manager_id` | `users` | `id` |
| `projects` | `quotation_person_id` | `users` | `id` |
| `projects` | `sales_person_id` | `users` | `id` |
| `projects` | `shipping_person_id` | `users` | `id` |
| `projects` | `supervisor_id` | `users` | `id` |
| `projects` | `sx_kanban_column_id` | `production_pipeline_stages` | `id` |
| `projects` | `vc_deleted_by` | `users` | `id` |
| `projects` | `vc_kanban_column_id` | `logistics_pipeline_stages` | `id` |
| `projects` | `workshop_type_id` | `workshop_project_types` | `id` |
| `purchase_order_items` | `product_id` | `products` | `id` |
| `purchase_order_items` | `purchase_order_id` | `purchase_orders` | `id` |
| `purchase_orders` | `company_id` | `companies` | `id` |
| `purchase_orders` | `created_by` | `users` | `id` |
| `purchase_orders` | `lead_id` | `crm_leads` | `id` |
| `purchase_orders` | `supplier_id` | `suppliers` | `id` |
| `purchase_requests` | `company_id` | `companies` | `id` |
| `purchase_requests` | `created_by` | `users` | `id` |
| `purchase_requests` | `order_id` | `orders` | `id` |
| `purchase_requests` | `owner_user_id` | `users` | `id` |
| `purchase_requests` | `project_id` | `projects` | `id` |
| `purchase_requests` | `supplier_id` | `suppliers` | `id` |
| `purchase_requests` | `tenant_id` | `tenants` | `id` |
| `push_device_tokens` | `user_id` | `users` | `id` |
| `push_subscriptions` | `user_id` | `users` | `id` |
| `quotation_edit_history` | `created_by` | `users` | `id` |
| `quotation_edit_history` | `quotation_id` | `quotations` | `id` |
| `quotation_items` | `product_id` | `products` | `id` |
| `quotation_items` | `quotation_id` | `quotations` | `id` |
| `quotations` | `approved_by` | `users` | `id` |
| `quotations` | `company_id` | `companies` | `id` |
| `quotations` | `created_by` | `users` | `id` |
| `quotations` | `customer_id` | `customers` | `id` |
| `quotations` | `fulfillment_lead_id` | `crm_leads` | `id` |
| `quotations` | `lead_id` | `crm_leads` | `id` |
| `quotations` | `project_id` | `projects` | `id` |
| `quotations` | `region_id` | `company_regions` | `id` |
| `quotations` | `source_task_id` | `crm_tasks` | `id` |
| `release_note_reads` | `release_note_id` | `release_notes` | `id` |
| `release_note_reads` | `user_id` | `users` | `id` |
| `release_notes` | `created_by` | `users` | `id` |
| `role_permissions` | `permission_id` | `permissions` | `id` |
| `role_permissions` | `role_id` | `roles` | `id` |
| `saas_modules` | `min_plan_id` | `saas_plans` | `id` |
| `saas_notify_subscribers` | `module_id` | `saas_modules` | `id` |
| `saas_purchases` | `module_id` | `saas_modules` | `id` |
| `saas_purchases` | `plan_id` | `saas_plans` | `id` |
| `saas_purchases` | `tenant_id` | `tenants` | `id` |
| `saas_purchases` | `user_id` | `users` | `id` |
| `stage_customer_status_map` | `customer_status_id` | `customer_statuses` | `id` |
| `stage_customer_status_map` | `stage_id` | `workflow_stages` | `id` |
| `stage_transitions` | `from_stage_id` | `workflow_stages` | `id` |
| `stage_transitions` | `project_id` | `projects` | `id` |
| `stage_transitions` | `to_stage_id` | `workflow_stages` | `id` |
| `stage_transitions` | `transitioned_by` | `users` | `id` |
| `suppliers` | `company_id` | `companies` | `id` |
| `suppliers` | `created_by` | `users` | `id` |
| `suppliers` | `internal_company_id` | `companies` | `id` |
| `suppliers` | `tenant_id` | `tenants` | `id` |
| `sx_company_schedule_config` | `company_id` | `companies` | `id` |
| `sx_user_planner_columns` | `company_id` | `companies` | `id` |
| `sx_user_planner_columns` | `user_id` | `users` | `id` |
| `sx_user_planner_items` | `column_id` | `sx_user_planner_columns` | `id` |
| `sx_user_planner_items` | `project_id` | `projects` | `id` |
| `system_batch_jobs` | `company_id` | `companies` | `id` |
| `system_batch_jobs` | `created_by_id` | `users` | `id` |
| `task_checklists` | `assigned_user_id` | `users` | `id` |
| `task_checklists` | `assignee_id` | `users` | `id` |
| `task_checklists` | `completed_by` | `users` | `id` |
| `task_checklists` | `task_id` | `tasks` | `id` |
| `task_comments` | `task_id` | `tasks` | `id` |
| `task_comments` | `user_id` | `users` | `id` |
| `task_participants` | `task_id` | `tasks` | `id` |
| `task_participants` | `user_id` | `users` | `id` |
| `task_templates` | `assignee_id` | `users` | `id` |
| `task_templates` | `created_by` | `users` | `id` |
| `task_templates` | `stage_id` | `workflow_stages` | `id` |
| `task_time_logs` | `task_id` | `tasks` | `id` |
| `task_time_logs` | `user_id` | `users` | `id` |
| `tasks` | `assignee_id` | `users` | `id` |
| `tasks` | `created_by_id` | `users` | `id` |
| `tasks` | `production_stage_id` | `production_pipeline_stages` | `id` |
| `tasks` | `project_id` | `projects` | `id` |
| `tasks` | `stage_id` | `workflow_stages` | `id` |
| `tasks` | `workflow_line_id` | `project_workflow_lines` | `id` |
| `teams` | `department_id` | `departments` | `id` |
| `teams` | `leader_id` | `users` | `id` |
| `tenant_access_audit` | `tenant_id` | `tenants` | `id` |
| `tenant_access_audit` | `user_id` | `users` | `id` |
| `tenant_features` | `tenant_id` | `tenants` | `id` |
| `trash_items` | `deleted_by` | `users` | `id` |
| `unified_task_history` | `actor_user_id` | `users` | `id` |
| `unified_task_history` | `company_id` | `companies` | `id` |
| `unified_task_history` | `lead_id` | `crm_leads` | `id` |
| `unified_task_history` | `project_id` | `projects` | `id` |
| `user_activity_log` | `user_id` | `users` | `id` |
| `user_companies` | `company_id` | `companies` | `id` |
| `user_companies` | `user_id` | `users` | `id` |
| `user_company_regions` | `region_id` | `company_regions` | `id` |
| `user_company_regions` | `user_id` | `users` | `id` |
| `user_current_location` | `user_id` | `users` | `id` |
| `user_devices` | `user_id` | `users` | `id` |
| `user_last_activity` | `user_id` | `users` | `id` |
| `user_module_roles` | `granted_by` | `users` | `id` |
| `user_module_roles` | `user_id` | `users` | `id` |
| `user_permission_overrides` | `granted_by` | `users` | `id` |
| `user_permission_overrides` | `unit_id` | `ecosystem_units` | `id` |
| `user_permission_overrides` | `user_id` | `users` | `id` |
| `user_permissions` | `ecosystem_unit_id` | `ecosystem_units` | `id` |
| `user_permissions` | `granted_by` | `users` | `id` |
| `user_permissions` | `permission_id` | `permissions` | `id` |
| `user_permissions` | `user_id` | `users` | `id` |
| `user_roles` | `ecosystem_unit_id` | `ecosystem_units` | `id` |
| `user_roles` | `granted_by` | `users` | `id` |
| `user_roles` | `role_id` | `roles` | `id` |
| `user_roles` | `user_id` | `users` | `id` |
| `users` | `company_id` | `companies` | `id` |
| `users` | `department_id` | `departments` | `id` |
| `users` | `primary_division_id` | `ecosystem_units` | `id` |
| `users` | `team_id` | `teams` | `id` |
| `users` | `tenant_id` | `tenants` | `id` |
| `voice_recordings` | `company_id` | `companies` | `id` |
| `voice_recordings` | `customer_id` | `customers` | `id` |
| `voice_recordings` | `lead_id` | `crm_leads` | `id` |
| `voice_recordings` | `user_id` | `users` | `id` |
| `voice_recordings_deleted` | `user_id` | `users` | `id` |
| `workflow_flow_action_runs` | `flow_id` | `workflow_flows` | `id` |
| `workflow_flow_conditions` | `edge_id` | `workflow_flow_edges` | `id` |
| `workflow_flow_conditions` | `flow_id` | `workflow_flows` | `id` |
| `workflow_flow_edges` | `flow_id` | `workflow_flows` | `id` |
| `workflow_flow_runtime_log` | `flow_id` | `workflow_flows` | `id` |
| `workflow_flow_steps` | `company_unit_id` | `ecosystem_units` | `id` |
| `workflow_flow_steps` | `division_unit_id` | `ecosystem_units` | `id` |
| `workflow_flow_steps` | `flow_id` | `workflow_flows` | `id` |
| `workflow_flow_steps` | `supervisor_id` | `users` | `id` |
| `workflow_flow_steps` | `template_set_id` | `company_template_sets` | `id` |
| `workflow_flows` | `created_by` | `users` | `id` |
| `workflow_stage_group_items` | `group_id` | `workflow_stage_groups` | `id` |
| `workflow_stage_group_items` | `stage_id` | `workflow_stages` | `id` |
| `workflow_stage_groups` | `division_unit_id` | `ecosystem_units` | `id` |
| `workflow_stages` | `company_id` | `companies` | `id` |
| `workshop_project_types` | `company_id` | `companies` | `id` |
| `workshop_task_template_items` | `default_assignee_id` | `users` | `id` |
| `workshop_task_template_items` | `executor_company_id` | `companies` | `id` |
| `workshop_task_template_items` | `template_id` | `workshop_task_templates` | `id` |
| `workshop_task_templates` | `company_id` | `companies` | `id` |
| `workshop_task_templates` | `logistics_stage_id` | `logistics_pipeline_stages` | `id` |
| `workshop_task_templates` | `production_stage_id` | `production_pipeline_stages` | `id` |
| `workshop_task_templates` | `workshop_type_id` | `workshop_project_types` | `id` |
| `workshop_team_members` | `team_id` | `workshop_teams` | `id` |
| `workshop_team_members` | `user_id` | `users` | `id` |
| `workshop_teams` | `company_id` | `companies` | `id` |
| `zalo_contacts` | `customer_id` | `customers` | `id` |
| `zalo_contacts` | `lead_id` | `crm_leads` | `id` |
| `zalo_messages` | `contact_id` | `zalo_contacts` | `id` |
| `zalo_messages` | `lead_id` | `crm_leads` | `id` |
| `zalo_messages` | `sent_by` | `users` | `id` |
| `zalo_oa_accounts` | `created_by` | `users` | `id` |
| `zalo_oa_accounts` | `default_lead_owner_id` | `users` | `id` |

---

## 5. Liên quan

- `docs/API_DOCUMENT.md`
- `docs/CODING_STANDARD.md`
- `docs/cau-truc-he-thong-co-ban/`
