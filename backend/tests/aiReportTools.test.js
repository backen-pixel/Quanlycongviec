/**
 * Smoke test — aiReportTools (không cần DB nếu chỉ test resolveTimeRange).
 */
const assert = require('assert');
const { resolveTimeRange, OPENAI_TOOL_DEFINITIONS } = require('../src/helpers/aiReportTools');

const today = resolveTimeRange('today');
assert.ok(today.from_iso);
assert.ok(today.to_iso);
assert.ok(today.label_vn.includes('hôm nay'));

const yesterday = resolveTimeRange('yesterday');
assert.ok(yesterday.label_vn.includes('hôm qua'));

const thisMonth = resolveTimeRange('this_month');
assert.ok(thisMonth.label_vn.startsWith('tháng '), 'this_month label phải bắt đầu "tháng "');

const lastMonth = resolveTimeRange('last_month');
assert.ok(lastMonth.label_vn.startsWith('tháng '));

const tools = OPENAI_TOOL_DEFINITIONS;
assert.strictEqual(tools.length, 22);
assert.ok(tools.some((t) => t.function.name === 'get_company_lead_summary'));
assert.ok(tools.some((t) => t.function.name === 'resolve_assignee_scope'));
assert.ok(tools.some((t) => t.function.name === 'find_users_by_name'));
assert.ok(tools.some((t) => t.function.name === 'get_user_activity_history'));
assert.ok(tools.some((t) => t.function.name === 'summarize_user_activity'));
assert.ok(tools.some((t) => t.function.name === 'get_user_learned_facts'));
assert.ok(tools.some((t) => t.function.name === 'get_online_users'));
assert.ok(tools.some((t) => t.function.name === 'get_channel_work_context'));
assert.ok(tools.some((t) => t.function.name === 'get_channel_kpi_summary'));
assert.ok(tools.some((t) => t.function.name === 'get_channel_members'));
assert.ok(tools.some((t) => t.function.name === 'list_pipelines_for_company'));
assert.ok(tools.some((t) => t.function.name === 'get_pipeline_breakdown'));
assert.ok(tools.some((t) => t.function.name === 'get_lead_deal_risk_report'));
assert.ok(tools.some((t) => t.function.name === 'get_user_profile_card'));
assert.ok(tools.some((t) => t.function.name === 'list_employees_in_scope'));
assert.ok(tools.some((t) => t.function.name === 'get_employee_leads_drill'));
assert.ok(tools.some((t) => t.function.name === 'get_employee_activity_report'));
assert.ok(tools.some((t) => t.function.name === 'format_company_report_text'));

console.log('[aiReportTools.test] PASS');
