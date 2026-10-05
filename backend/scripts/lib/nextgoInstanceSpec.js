/**
 * NextGo instance extract — hằng số và thứ tự bảng.
 * Nguồn vận hành: companies.id SOURCE (HST mặc định).
 * Không dùng company clone cùng DB (842cff41…).
 */
const SOURCE_COMPANY_ID = '87479a83-1145-43b7-b090-3e40812cb5a9';
const SOURCE_TENANT_DEFAULT = '7d42e731-895b-4ba8-99d6-0005c4e23544';
const CLONE_COMPANY_ID = '842cff41-0f8b-4cee-b7ec-d78ce27e7308';
const CLONE_TENANT_ID = 'e37fac98-acd2-4675-84f4-285b65e423b1';

const TENANT_FEATURES = [
  'crm', 'tasks', 'projects', 'production', 'logistics', 'customers',
  'ai_assistant', 'drive', 'accounting', 'api_access', 'tinhtoan', 'purchasing',
];

/** Cột secret — chỉ ghi dump local (gitignore). Không commit. */
const SECRET_COLUMNS = [
  'access_token', 'secret_key', 'refresh_token', 'password',
  'n8n_trigger_token', 'webhook_verify_token', 'page_access_token',
];

/** Bảng lọc trực tiếp company_id — thứ tự gần đúng FK. */
const COMPANY_SCOPED_TABLES = [
  'companies',
  'company_division_units',
  'company_regions',
  'departments',
  'users',
  'user_companies',
  'company_bank_accounts',
  'crm_source_categories',
  'crm_sources',
  'crm_referrers',
  'crm_lead_types',
  'crm_pipelines',
  'crm_company_deadline_config',
  'crm_payment_stages',
  'crm_assignment_columns',
  'crm_assignments',
  'crm_assignment_schedules',
  'crm_daily_report_templates',
  'crm_daily_reports',
  'crm_events',
  'crm_kpi_scoring_rules',
  'workshop_project_types',
  'workshop_teams',
  'workshop_task_templates',
  'production_pipeline_stages',
  'logistics_pipeline_stages',
  'sx_company_schedule_config',
  'customers',
  'crm_leads',
  'projects',
  'drive_roots',
  'calc_categories',
  'knowledge_categories',
  'facebook_pages',
  'zalo_oa_accounts',
  'app_modules',
  'external_api_keys',
];

/**
 * Bảng con: lọc theo tập id đã export.
 * parentKey = tên file ndjson parent (không đuôi).
 */
const CHILD_TABLES = [
  { table: 'ecosystem_module_scopes', parent: '_division_ids', col: 'division_unit_id' },
  { table: 'crm_pipeline_stages', parent: 'crm_pipelines', col: 'pipeline_id' },
  { table: 'crm_task_templates', parent: 'crm_pipeline_stages', col: 'pipeline_stage_id' },
  { table: 'crm_task_template_items', parent: 'crm_task_templates', col: 'template_id' },
  { table: 'workshop_task_template_items', parent: 'workshop_task_templates', col: 'template_id' },
  { table: 'crm_lead_type_production_links', parent: 'crm_lead_types', col: 'lead_type_id' },
  { table: 'lead_members', parent: 'crm_leads', col: 'lead_id' },
  { table: 'crm_tasks', parent: 'crm_leads', col: 'lead_id' },
  { table: 'crm_lead_comments', parent: 'crm_leads', col: 'lead_id' },
  { table: 'crm_lead_comment_reactions', parent: 'crm_lead_comments', col: 'comment_id' },
  { table: 'crm_lead_comment_read_receipts', parent: 'crm_leads', col: 'lead_id' },
  { table: 'crm_task_attachments', parent: 'crm_tasks', col: 'task_id' },
  { table: 'crm_assignment_comments', parent: 'crm_assignments', col: 'assignment_id' },
  { table: 'crm_event_comments', parent: 'crm_events', col: 'event_id' },
  { table: 'tasks', parent: 'projects', col: 'project_id' },
  { table: 'task_comments', parent: 'tasks', col: 'task_id' },
  { table: 'project_comments', parent: 'projects', col: 'project_id' },
  { table: 'facebook_contacts', parent: 'facebook_pages', col: 'page_id', parentIdField: 'page_id' },
  { table: 'facebook_messages', parent: 'facebook_contacts', col: 'contact_id' },
  { table: 'facebook_comments', parent: 'facebook_pages', col: 'page_id', parentIdField: 'page_id' },
  { table: 'zalo_contacts', parent: 'zalo_oa_accounts', col: 'oa_id', parentIdField: 'oa_id' },
  { table: 'zalo_messages', parent: 'zalo_contacts', col: 'contact_id' },
  { table: 'drive_folders', parent: 'drive_roots', col: 'root_id' },
  { table: 'drive_files', parent: 'drive_roots', col: 'root_id' },
  { table: 'user_roles', parent: 'users', col: 'user_id' },
];

const SKIP_TABLES = new Set([
  'unified_tasks_v',
  'v_quotations_with_scope',
  'v_crm_kpi_user_period',
  'backup_giao_viec_mo_coi_20260908',
  'trash_items',
  'tenant_access_audit',
  'system_batch_jobs',
  'external_api_logs',
  'internal_social_posts',
  'internal_social_post_companies',
  'internal_social_post_blocked_companies',
  'internal_social_last_read',
]);

module.exports = {
  SOURCE_COMPANY_ID,
  SOURCE_TENANT_DEFAULT,
  CLONE_COMPANY_ID,
  CLONE_TENANT_ID,
  TENANT_FEATURES,
  SECRET_COLUMNS,
  COMPANY_SCOPED_TABLES,
  CHILD_TABLES,
  SKIP_TABLES,
};
